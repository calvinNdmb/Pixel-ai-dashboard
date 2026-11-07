#!/usr/bin/env python3
"""Transfère tes playlists Spotify vers YouTube Music.

Sources possibles :
  --source api     : lit tes playlists via l'API Spotify (compte Premium requis
                     pour les apps en "Development Mode" depuis février 2026).
  --source export  : lit le dossier de l'export de données Spotify
                     (Compte > Confidentialité > Télécharger tes données).

Voir README.md pour la configuration.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import time
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path

HERE = Path(__file__).resolve().parent
STATE_FILE = HERE / "state.json"
REPORT_FILE = HERE / "rapport.csv"
LIKED_NAME = "Titres likés (Spotify)"


@dataclass
class Track:
    title: str
    artists: list[str]
    album: str = ""
    duration_s: int | None = None
    key: str = ""  # identifiant stable (URI Spotify ou "titre|artiste")


@dataclass
class Playlist:
    key: str
    name: str
    description: str
    tracks: list[Track]


# --------------------------------------------------------------------------
# Lecture Spotify
# --------------------------------------------------------------------------

def _track_from_api(t: dict) -> Track | None:
    if not t or t.get("type", "track") != "track" or t.get("is_local"):
        return None
    artists = [a["name"] for a in t.get("artists", []) if a.get("name")]
    return Track(
        title=t.get("name", ""),
        artists=artists,
        album=(t.get("album") or {}).get("name", ""),
        duration_s=round(t["duration_ms"] / 1000) if t.get("duration_ms") else None,
        key=t.get("uri") or f"{t.get('name')}|{','.join(artists)}",
    )


def _paginate(sp, page: dict):
    while page:
        yield from page.get("items", [])
        page = sp.next(page) if page.get("next") else None


def load_from_api(include_liked: bool) -> list[Playlist]:
    try:
        import spotipy
        from spotipy.oauth2 import SpotifyOAuth
    except ImportError:
        sys.exit("Installe les dépendances : pip install -r requirements.txt")

    for var in ("SPOTIPY_CLIENT_ID", "SPOTIPY_CLIENT_SECRET"):
        if not os.environ.get(var):
            sys.exit(f"Variable d'environnement manquante : {var} (voir README.md)")

    sp = spotipy.Spotify(
        auth_manager=SpotifyOAuth(
            redirect_uri=os.environ.get("SPOTIPY_REDIRECT_URI", "http://127.0.0.1:8888/callback"),
            scope="playlist-read-private playlist-read-collaborative user-library-read",
            cache_path=str(HERE / ".spotify_token"),
            open_browser=True,
        )
    )
    me = sp.current_user()["id"]
    playlists: list[Playlist] = []

    for pl in _paginate(sp, sp.current_user_playlists(limit=50)):
        owner = (pl.get("owner") or {}).get("id")
        tracks: list[Track] = []
        try:
            for it in _paginate(sp, sp.playlist_items(pl["id"], limit=100, additional_types=("track",))):
                # Depuis février 2026 le champ s'appelle "item" (avant : "track").
                t = _track_from_api(it.get("item") or it.get("track"))
                if t:
                    tracks.append(t)
        except Exception as e:  # noqa: BLE001
            print(f"  ! Impossible de lire « {pl['name']} » : {e}")
        if not tracks and owner != me and not pl.get("collaborative"):
            print(f"  - « {pl['name']} » ignorée : l'API ne donne le contenu que des "
                  "playlists que tu possèdes ou sur lesquelles tu collabores.")
            continue
        playlists.append(Playlist(
            key=pl["uri"], name=pl["name"],
            description=pl.get("description") or "", tracks=tracks,
        ))

    if include_liked:
        tracks = []
        try:
            for it in _paginate(sp, sp.current_user_saved_tracks(limit=50)):
                t = _track_from_api(it.get("item") or it.get("track"))
                if t:
                    tracks.append(t)
            playlists.append(Playlist("liked", LIKED_NAME, "Importé depuis Spotify", tracks))
        except Exception as e:  # noqa: BLE001
            print(f"  ! Impossible de lire les titres likés : {e}")
    return playlists


def load_from_export(folder: Path, include_liked: bool) -> list[Playlist]:
    """Lit Playlist*.json (et YourLibrary.json) de l'export « Données du compte »."""
    if not folder.is_dir():
        sys.exit(f"Dossier introuvable : {folder}")
    playlists: list[Playlist] = []
    files = sorted(folder.rglob("Playlist*.json"))
    if not files:
        sys.exit(f"Aucun fichier Playlist*.json dans {folder}. Décompresse d'abord l'archive Spotify.")
    for f in files:
        data = json.loads(f.read_text(encoding="utf-8"))
        for pl in data.get("playlists", []):
            tracks = []
            for it in pl.get("items", []):
                t = it.get("track")
                if not t:
                    continue  # podcast ou fichier local
                tracks.append(Track(
                    title=t.get("trackName", ""), artists=[t.get("artistName", "")],
                    album=t.get("albumName", ""),
                    key=t.get("trackUri") or f"{t.get('trackName')}|{t.get('artistName')}",
                ))
            name = pl.get("name") or "Sans titre"
            playlists.append(Playlist(
                key=f"export:{name}", name=name,
                description=pl.get("description") or "", tracks=tracks,
            ))
    lib = next(iter(folder.rglob("YourLibrary.json")), None)
    if include_liked and lib:
        data = json.loads(lib.read_text(encoding="utf-8"))
        tracks = [Track(title=t.get("track", ""), artists=[t.get("artist", "")],
                        album=t.get("album", ""),
                        key=t.get("uri") or f"{t.get('track')}|{t.get('artist')}")
                  for t in data.get("tracks", [])]
        playlists.append(Playlist("liked", LIKED_NAME, "Importé depuis Spotify", tracks))
    return playlists


# --------------------------------------------------------------------------
# Correspondance YouTube Music
# --------------------------------------------------------------------------

_NOISE = re.compile(
    r"\s*[\(\[][^\)\]]*(remaster|official|video|audio|lyrics?|clip|visuali[sz]er|hd|4k)[^\)\]]*[\)\]]"
    r"|\s+-\s+\d{4}\s+remaster.*$|\s+-\s+remaster.*$",
    re.I,
)


def norm(s: str) -> str:
    s = _NOISE.sub("", s or "")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9 ]+", " ", s.lower())
    return re.sub(r"\s+", " ", s).strip()


def sim(a: str, b: str) -> float:
    a, b = norm(a), norm(b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    return SequenceMatcher(None, a, b).ratio()


def score(track: Track, r: dict) -> float:
    title_s = sim(track.title, r.get("title", ""))
    r_artists = " ".join(a.get("name", "") for a in (r.get("artists") or []))
    artist_s = max((sim(a, r_artists) for a in track.artists), default=0.0)
    if any(norm(a) and norm(a) in norm(r_artists) for a in track.artists):
        artist_s = 1.0
    s = 0.6 * title_s + 0.4 * artist_s
    dur = r.get("duration_seconds")
    if track.duration_s and dur:
        diff = abs(track.duration_s - dur)
        s += 0.1 if diff <= 3 else (0 if diff <= 15 else -0.25)
    return s


def find_on_ytm(yt, track: Track) -> tuple[dict | None, float]:
    query = f"{track.title} {' '.join(track.artists[:2])}"
    best, best_s = None, 0.0
    for flt in ("songs", "videos"):
        try:
            results = yt.search(query, filter=flt, limit=5)
        except Exception as e:  # noqa: BLE001
            print(f"    ! recherche échouée ({e}), nouvel essai dans 5 s")
            time.sleep(5)
            results = yt.search(query, filter=flt, limit=5)
        for r in results:
            if not r.get("videoId"):
                continue
            s = score(track, r)
            if flt == "videos":
                s -= 0.05  # on préfère la version « titre » officielle
            if s > best_s:
                best, best_s = r, s
        if best_s >= 0.85:
            break
    return best, best_s


def connect_ytm():
    try:
        from ytmusicapi import OAuthCredentials, YTMusic
    except ImportError:
        sys.exit("Installe les dépendances : pip install -r requirements.txt")
    oauth, browser = HERE / "oauth.json", HERE / "browser.json"
    if oauth.exists():
        cid, secret = os.environ.get("YTM_CLIENT_ID"), os.environ.get("YTM_CLIENT_SECRET")
        if not (cid and secret):
            sys.exit("oauth.json trouvé : définis aussi YTM_CLIENT_ID et YTM_CLIENT_SECRET.")
        return YTMusic(str(oauth), oauth_credentials=OAuthCredentials(cid, secret))
    if browser.exists():
        return YTMusic(str(browser))
    sys.exit("Aucune authentification YouTube Music : crée oauth.json ou browser.json (voir README.md).")


# --------------------------------------------------------------------------
# Programme principal
# --------------------------------------------------------------------------

def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    return {"playlists": {}, "matches": {}}


def save_state(state: dict) -> None:
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser(description="Spotify → YouTube Music")
    ap.add_argument("--source", choices=("api", "export"), default="api")
    ap.add_argument("--export-dir", type=Path, help="dossier de l'export Spotify décompressé")
    ap.add_argument("--liked", action="store_true", help="inclure les titres likés")
    ap.add_argument("--only", action="append", default=[],
                    help="ne transférer que les playlists dont le nom contient ce texte (répétable)")
    ap.add_argument("--list", action="store_true", help="lister les playlists Spotify et quitter")
    ap.add_argument("--dry-run", action="store_true",
                    help="chercher les correspondances sans rien créer sur YouTube Music")
    ap.add_argument("--privacy", choices=("PRIVATE", "UNLISTED", "PUBLIC"), default="PRIVATE")
    ap.add_argument("--min-score", type=float, default=0.70,
                    help="score minimal pour ajouter un titre (0-1, défaut 0.70)")
    args = ap.parse_args()

    print("Lecture de Spotify…")
    if args.source == "api":
        playlists = load_from_api(args.liked)
    else:
        if not args.export_dir:
            ap.error("--export-dir est obligatoire avec --source export")
        playlists = load_from_export(args.export_dir, args.liked)

    if args.only:
        wanted = [w.lower() for w in args.only]
        playlists = [p for p in playlists if any(w in p.name.lower() for w in wanted)]

    total = sum(len(p.tracks) for p in playlists)
    print(f"{len(playlists)} playlist(s), {total} titre(s).")
    if args.list:
        for p in playlists:
            print(f"  • {p.name} ({len(p.tracks)} titres)")
        return

    yt = connect_ytm()
    state = load_state()
    rows = []

    for i, pl in enumerate(playlists, 1):
        print(f"\n[{i}/{len(playlists)}] {pl.name} — {len(pl.tracks)} titres")
        video_ids: list[str] = []
        for n, t in enumerate(pl.tracks, 1):
            cached = state["matches"].get(t.key)
            if cached:
                vid, s, yt_title = cached["videoId"], cached["score"], cached["title"]
            else:
                r, s = find_on_ytm(yt, t)
                vid = r["videoId"] if r else None
                yt_title = ""
                if r:
                    yt_title = f"{r.get('title', '')} — " + ", ".join(
                        a.get("name", "") for a in (r.get("artists") or []))
                state["matches"][t.key] = {"videoId": vid, "score": round(s, 3), "title": yt_title}
                time.sleep(0.3)
            status = ("trouvé" if s >= 0.85 else "douteux") if vid and s >= args.min_score else "introuvable"
            if status != "introuvable":
                video_ids.append(vid)
            rows.append({
                "playlist": pl.name, "titre": t.title, "artiste": ", ".join(t.artists),
                "statut": status, "score": f"{s:.2f}", "youtube_music": yt_title,
                "lien": f"https://music.youtube.com/watch?v={vid}" if vid else "",
            })
            if n % 25 == 0:
                print(f"    {n}/{len(pl.tracks)}…")
                save_state(state)
        save_state(state)

        # Dédoublonnage en gardant l'ordre
        video_ids = list(dict.fromkeys(video_ids))
        print(f"    {len(video_ids)}/{len(pl.tracks)} titres retenus")
        if args.dry_run or not video_ids:
            continue

        yt_pl = state["playlists"].get(pl.key)
        if yt_pl:
            # Playlist déjà créée lors d'un précédent passage : on ajoute seulement les manquants
            try:
                existing = {x.get("videoId") for x in yt.get_playlist(yt_pl, limit=None).get("tracks", [])}
            except Exception:  # noqa: BLE001  (playlist supprimée entre-temps)
                yt_pl, existing = None, set()
            video_ids = [v for v in video_ids if v not in existing]
        if not yt_pl:
            desc = (pl.description + "\n" if pl.description else "") + "Importé depuis Spotify"
            yt_pl = yt.create_playlist(pl.name[:150], desc[:5000], privacy_status=args.privacy)
            if not isinstance(yt_pl, str):
                print(f"    ! Création échouée : {yt_pl}")
                continue
            state["playlists"][pl.key] = yt_pl
            save_state(state)
        for k in range(0, len(video_ids), 50):
            res = yt.add_playlist_items(yt_pl, video_ids[k:k + 50], duplicates=False)
            if isinstance(res, dict) and res.get("status") not in (None, "STATUS_SUCCEEDED"):
                print(f"    ! Ajout partiel : {res.get('status')}")
            time.sleep(1)
        print(f"    → https://music.youtube.com/playlist?list={yt_pl}")

    with REPORT_FILE.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else ["playlist"], delimiter=";")
        w.writeheader()
        w.writerows(rows)
    counts = {k: sum(r["statut"] == k for r in rows) for k in ("trouvé", "douteux", "introuvable")}
    print(f"\nTerminé. Trouvés : {counts['trouvé']}, douteux : {counts['douteux']}, "
          f"introuvables : {counts['introuvable']}.")
    print(f"Rapport : {REPORT_FILE}")


if __name__ == "__main__":
    main()
