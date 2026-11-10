"""The relay between two houses (pixel/amis.py): an ntfy-compatible server (https://ntfy.sh by default, or your own), so that
two Pixels talk without a server of ours and without opening a port at home. The relay only ever sees opaque text.

ntfy's HTTP API, the part used here (https://docs.ntfy.sh): publish with POST {relay}/{topic} (the body is the message,
text); subscribe with GET {relay}/{t1},{t2},.../json?since={unix s}: one JSON object per line, "open" once, then the cached
messages after `since`, then each new one as it comes ({"id", "time", "event": "message", "topic", "message"}), with a
"keepalive" every 45 s or so. A topic is any name of 1 to 64 letters, digits, - and _: whoever knows it can read and write,
so ours are 26 random-looking characters derived from a secret (topic()), and everything inside is sealed:

- seal(key, topic, obj): JSON padded with spaces to one of a few sizes (PAD: the relay cannot tell the kinds of messages
  apart by their length), AES-256-GCM with a random 96-bit nonce, the topic as associated data (a message copied to
  another topic does not open), "PXA1." + base64url(nonce + ciphertext + tag). open_() returns the object, or None for
  anything that is not exactly that: wrong key, tampered with, another topic, too long, not JSON.
  What the relay still sees: who publishes and who listens (addresses), on which topics (stable for a friendship), when,
  and the padded size. See docs/AMIS.md.
- stretch(code): scrypt (n = 2^15, r = 8: 32 MiB, about half a second on a Pi 4) of a friendship code, then HKDF-SHA256
  for its pairing topic and key: the code itself never travels, and someone who copies the relay's traffic cannot try its
  1.2 * 10^12 values offline in any useful time.
- Ephemeral: an X25519 key pair for one pairing; the friendship's key comes from that exchange (forward secrecy: guessing
  the code later opens nothing) and from the code (only someone who knew it could take part). See docs/AMIS.md.

Relais keeps ONE streaming subscription to every topic wanted (want()), opened only when there is one: no friend, no code,
no connection at all. It reconnects with exponential backoff and jitter (1 s .. 5 min), resumes with since= (its last
message's time, so a short cut loses nothing the relay still keeps), and treats 120 s without a line as a dead link.
publish() posts with a timeout and says how it went; the relay's own rate limit (429) is reported, never retried in a loop.
Nothing here knows what the messages mean: on_message(topic, text, relay_time) gets every one.
"""
import asyncio
import base64
import json
import logging
import os
import random
import re
import time
from urllib.parse import urlsplit

import aiohttp

log = logging.getLogger("pixel.relais")

try:                                            # the "cryptography" package (requirements.txt): without it, no friends at all
    from cryptography.exceptions import InvalidTag
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
    CRYPTO = True
except ImportError:                             # pragma: no cover - checked by pixel/amis.py, which then stays off
    CRYPTO = False

DEFAULT = "https://ntfy.sh"
PREFIX = "PXA1."                    # version 1 of the format: anything else on a topic is not ours
MAX_BODY = 3600                     # characters of a published message (ntfy.sh turns more than 4096 bytes into an attachment)
MAX_PLAIN = 2400                    # bytes of JSON inside one
PAD = (512, 1024, MAX_PLAIN)        # bytes: the JSON is padded with spaces to the first of these that holds it, so that the
                                    # relay cannot tell a coucou from a visit or a card by its length (2400: 3243 characters)
TOPIC = re.compile(r"^[a-z2-7]{26}$")
SCRYPT = {"n": 2 ** 15, "r": 8, "p": 1}
SILENCE = 120.0                     # s without a line (ntfy sends a keepalive every 45 s): the link is dead
BACKOFF = (1.0, 300.0)              # s: the first wait after a cut, the longest one
LINE_MAX = 16384                    # bytes of one line of the stream: a longer one is not a message of ours


# ---------- the box ----------
def b64u(b):
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def unb64u(s):
    if not isinstance(s, str) or not re.fullmatch(r"[A-Za-z0-9_-]*", s):
        raise ValueError("not base64url")
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def hkdf(ikm, info, salt=None, n=32):
    return HKDF(algorithm=hashes.SHA256(), length=n, salt=salt, info=info).derive(ikm)


def stretch(code):
    """A friendship code (canonical: « lapin-soleil-tarte-4271 ») -> 32 bytes. Slow on purpose: run it in a thread."""
    return Scrypt(salt=b"pixel-amis/v1/code", length=32, **SCRYPT).derive(code.encode())


def topic(key, label):
    """A topic name only the holders of `key` can know: 26 lowercase base32 characters (130 bits)."""
    return base64.b32encode(hkdf(key, b"pxa1 topic " + label.encode(), n=16)).decode().lower().rstrip("=")


def subkey(key, label):
    return hkdf(key, b"pxa1 key " + label.encode())


def _aad(topic_):
    return b"pxa1|" + topic_.encode()


def seal(key, topic_, obj):
    data = json.dumps(obj, separators=(",", ":"), ensure_ascii=False).encode()
    size = next((n for n in PAD if len(data) <= n), None)
    if size is None:
        raise ValueError("message too long")
    data += b" " * (size - len(data))             # trailing spaces: still JSON for a Pixel that does not strip them
    nonce = os.urandom(12)
    body = PREFIX + b64u(nonce + AESGCM(key).encrypt(nonce, data, _aad(topic_)))
    if len(body) > MAX_BODY:
        raise ValueError("message too long")
    return body


def open_(key, topic_, body):
    """The object inside `body`, or None: not ours, tampered with, sealed with another key or for another topic."""
    if not isinstance(body, str) or len(body) > MAX_BODY or not body.startswith(PREFIX):
        return None
    try:
        raw = unb64u(body[len(PREFIX):])
        if len(raw) < 12 + 16 + 2:
            return None
        data = AESGCM(key).decrypt(raw[:12], raw[12:], _aad(topic_))
        if len(data) > MAX_PLAIN:
            return None
        obj = json.loads(data.rstrip(b" ").decode())          # the padding goes (seal)
    except (ValueError, InvalidTag, UnicodeDecodeError):
        return None
    return obj if isinstance(obj, dict) else None


class Ephemeral:
    """An X25519 key pair for one pairing."""

    def __init__(self):
        self.key = X25519PrivateKey.generate()
        self.pub = b64u(self.key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw))

    def shared(self, peer):
        """The shared secret with the other side's public key (base64url), or None if it is not one."""
        try:
            raw = unb64u(peer)
            if len(raw) != 32:
                return None
            s = self.key.exchange(X25519PublicKey.from_public_bytes(raw))
        except ValueError:
            return None
        return None if s == bytes(32) else s           # a low-order point: refused


def clean_url(url):
    """The relay's address: http(s), a host, no user or password, no query. None if it is not one."""
    if not isinstance(url, str):
        return None
    url = url.strip().rstrip("/")
    try:
        p = urlsplit(url)
    except ValueError:
        return None
    if p.scheme not in ("http", "https") or not p.hostname or p.username or p.password or p.query or p.fragment:
        return None
    return url


# ---------- the client ----------
class Relais:
    """One relay, every topic in one stream. on_message(topic, text, relay_time) for each message; on_status(state):
    "off" (nothing to listen to), "connexion", "ok", "coupe" (cut: waiting before the next try)."""

    def __init__(self, url, on_message, token=None, on_status=None, silence=SILENCE, now=time.time):
        self.url = clean_url(url) or DEFAULT
        self.on_message, self.on_status, self.now = on_message, on_status or (lambda s: None), now
        self.token = token if isinstance(token, str) and token.strip() else None
        self.silence = float(silence)
        self.topics = frozenset()
        self.since = 0                  # unix s: on (re)connection, the relay replays what it kept from then on
        self.status = "off"
        self.changed = asyncio.Event()
        self.session = None
        self.stats = {"connexions": 0, "lignes": 0, "messages": 0, "coupures": 0, "envois": 0, "refus_envoi": 0}
        self.backoff = BACKOFF[0]
        self.closed = False

    @property
    def host(self):
        return urlsplit(self.url).netloc

    def want(self, topics, since=None):
        """The topics to listen to (the stream restarts when they change); since: replay from then at least (unix s)."""
        topics = frozenset(t for t in topics if isinstance(t, str) and TOPIC.match(t))
        if since is not None and (not self.since or since < self.since):
            self.since = max(0, int(since))
        if topics != self.topics:
            self.topics = topics
            self.changed.set()

    def _headers(self):
        h = {"User-Agent": "Pixel"}
        if self.token:
            h["Authorization"] = "Bearer " + self.token
        return h

    def _session(self):
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession(trust_env=False)
        return self.session

    def _status(self, s):
        if s != self.status:
            self.status = s
            try:
                self.on_status(s)
            except Exception:                              # noqa: BLE001 - a listener must never stop the relay
                log.exception("relais: status listener failed")

    async def publish(self, topic_, body, timeout=12.0):
        """Post one message. ("ok", relay_time) or (why, None): "relais" (refused, rate-limited: 429), "reseau"."""
        if not TOPIC.match(topic_ or "") or not isinstance(body, str) or len(body) > MAX_BODY:
            return "invalide", None
        try:
            async with self._session().post(f"{self.url}/{topic_}", data=body.encode(), timeout=aiohttp.ClientTimeout(total=timeout),
                                            headers={**self._headers(), "Content-Type": "text/plain; charset=utf-8", "X-Firebase": "no"}) as r:
                if r.status == 429:
                    self.stats["refus_envoi"] += 1
                    return "relais", None
                if r.status >= 400:
                    self.stats["refus_envoi"] += 1
                    log.warning("relais: publish refused (%s)", r.status)
                    return "relais", None
                try:
                    d = await r.json(content_type=None)
                except (ValueError, aiohttp.ContentTypeError):
                    d = {}
                self.stats["envois"] += 1
                t = d.get("time") if isinstance(d, dict) else None
                return "ok", t if isinstance(t, int) else int(self.now())
        except (aiohttp.ClientError, asyncio.TimeoutError, OSError) as e:
            log.info("relais: publish failed: %s", e)
            return "reseau", None

    async def run(self):
        """Forever: listen to the wanted topics, reconnecting after a cut; nothing at all while there are none."""
        while not self.closed:
            if not self.topics:
                self._status("off")
                self.changed.clear()
                await self.changed.wait()
                continue
            self.changed.clear()
            self._status("connexion")
            ok = False
            try:
                ok = await self._stream(sorted(self.topics))
            except asyncio.CancelledError:
                raise
            except Exception as e:                         # noqa: BLE001 - a cut, a refusal, a garbled line: try again later
                log.info("relais: stream ended: %s", e)
            if self.closed:
                break
            if self.changed.is_set():                     # other topics: reconnect at once
                continue
            if ok:
                self.backoff = BACKOFF[0]
            self.stats["coupures"] += 1
            self._status("coupe")
            wait = self.backoff * (0.5 + random.random() / 2)
            self.backoff = min(BACKOFF[1], self.backoff * 2)
            try:
                await asyncio.wait_for(self.changed.wait(), wait)
            except asyncio.TimeoutError:
                pass
        self._status("off")

    async def _stream(self, topics):
        """One subscription, until it ends or the topics change. True if it was connected for a while (the backoff resets)."""
        since = max(0, int(self.since) - 2) if self.since else max(0, int(self.now()) - 60)
        url = f"{self.url}/{','.join(topics)}/json?since={since}"
        timeout = aiohttp.ClientTimeout(total=None, connect=15, sock_connect=15, sock_read=self.silence)
        t0 = self.now()
        async with self._session().get(url, headers=self._headers(), timeout=timeout) as r:
            if r.status != 200:
                raise RuntimeError(f"HTTP {r.status}")
            self.stats["connexions"] += 1
            self._status("ok")
            reader = asyncio.ensure_future(self._read(r))
            change = asyncio.ensure_future(self.changed.wait())
            try:
                done, _ = await asyncio.wait({reader, change}, return_when=asyncio.FIRST_COMPLETED)
            finally:
                for f in (reader, change):
                    if not f.done():
                        f.cancel()
                for f in (reader, change):
                    try:
                        await f
                    except (asyncio.CancelledError, Exception):     # noqa: BLE001 - its error ends this stream, nothing more
                        pass
            if reader in done and reader.exception():
                raise reader.exception()
        return self.now() - t0 > 30

    async def _read(self, r):
        while True:
            line = await r.content.readline()
            if not line:
                return                                     # the relay closed the stream
            self.stats["lignes"] += 1
            if len(line) > LINE_MAX:
                continue
            try:
                m = json.loads(line)
            except ValueError:
                continue
            if not isinstance(m, dict) or m.get("event") != "message":
                continue
            t, tp, text = m.get("time"), m.get("topic"), m.get("message")
            if isinstance(t, int) and t > self.since:
                self.since = t
            if not isinstance(tp, str) or tp not in self.topics or not isinstance(text, str) or m.get("attachment"):
                continue
            self.stats["messages"] += 1
            try:
                self.on_message(tp, text, t if isinstance(t, int) else None)
            except Exception:                              # noqa: BLE001 - a bad message must never stop the others
                log.exception("relais: message handler failed")

    async def close(self):
        self.closed = True
        self.changed.set()
        if self.session and not self.session.closed:
            await self.session.close()
