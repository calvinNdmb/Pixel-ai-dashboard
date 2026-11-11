/* Pixel's NFC tag page (web/nfc.html, pixel/nfc.py): the phone pairs with the code Pixel shows on his screen, then gets his
   settings for 15 minutes: open Pixel (the access code, kept like the QR code's), his Wi-Fi, and Claude's API key (a new
   one can be given; the one kept is never shown). A page of its own, without the app's scripts.
   The session lives in this tab (sessionStorage); the server forgets it when Pixel starts again (a new key: it does). */
(() => {
const $ = id => document.getElementById(id);
const CFG = window.PIXEL_NFC || {};
const tab = {
  get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* private mode: the session lasts the page */ } },
  del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* nothing kept */ } },
};
let session = tab.get('pixel_nfc_s'), until = Number(tab.get('pixel_nfc_u')) || 0;
let poll = 0, picked = null, baseJob = -1, restarting = false;

function say(id, text, kind) { const e = $(id); e.textContent = text || ''; e.className = 'msg' + (kind ? ' ' + kind : ''); }
const paired = () => !!session && Date.now() < until;

async function call(path, body) {
  const opt = { method: body === undefined ? 'GET' : 'POST', headers: {}, cache: 'no-store' };
  if (session) opt.headers['X-Pixel-Session'] = session;
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  let r, j = {};
  try { r = await fetch(path, opt); } catch (e) { return { ok: false, error: 'Pixel ne répond pas. Ton téléphone est-il sur le Wi-Fi de la maison ?' }; }
  try { j = await r.json(); } catch (e) { /* not JSON: its status says it */ }
  if (r.status === 401 && session) lose("L'accès aux réglages est fini : demande un nouveau code à Pixel.");
  return { ...j, ok: r.ok && j.ok !== false, error: j.error || (r.ok ? '' : `Pixel a répondu ${r.status}.`) };
}

function show() {
  const p = paired();
  $('pair').hidden = p;
  for (const id of ['wifi', 'cle', 'sessionNote']) $(id).hidden = !p;
  const go = p ? $('open').dataset.go : CFG.go;              // after the code: Pixel with the access code; an old tag's own link
  $('open').hidden = !go;
  if (go) { $('open').href = go; $('open').textContent = p ? 'Ouvrir Pixel' : 'Continuer dans le navigateur'; }
  $('apk').hidden = $('apkHint').hidden = !CFG.apk;
  $('app').hidden = $('open').hidden && $('apk').hidden;   // nothing to open nor to install: no empty card
}
function lose(why) {
  session = null; until = 0; tab.del('pixel_nfc_s'); tab.del('pixel_nfc_u');
  clearInterval(poll); poll = 0; show();
  say('pairMsg', why || '');
}

/* ---------- the code on Pixel's screen ---------- */
async function askCode() {
  say('pairMsg', 'Pixel affiche un code…');
  const r = await call('/api/nfc/code', {});
  say('pairMsg', r.ok ? "Regarde l'écran de Pixel et tape ses 6 chiffres." : r.error, r.ok ? '' : 'err');
  if (r.ok) $('code').focus();
}
$('again').addEventListener('click', askCode);
$('pairForm').addEventListener('submit', async e => {
  e.preventDefault();
  const code = $('code').value.replace(/\D/g, '');
  if (code.length !== 6) return say('pairMsg', 'Le code a 6 chiffres.', 'err');
  const r = await call('/api/nfc/pair', { code });
  $('code').value = '';
  if (!r.ok) return say('pairMsg', r.error, 'err');
  session = r.session; until = Date.now() + (r.ttl || 900) * 1000;
  tab.set('pixel_nfc_s', session); tab.set('pixel_nfc_u', String(until));
  if (r.token) keepToken(r.token);
  say('pairMsg', '');
  show(); refresh(); startPoll();
});
function keepToken(t) {                 // what the QR code gives: Pixel's page opens with it, from now on (app.js reads the same)
  try { localStorage.setItem('pixel_t', t); } catch (e) { /* the link below still carries it */ }
  document.cookie = `pixel_t=${encodeURIComponent(t)}; path=/; max-age=31536000; samesite=strict`;
  $('open').dataset.go = '/?t=' + encodeURIComponent(t);
  tab.set('pixel_nfc_go', $('open').dataset.go);
}

/* ---------- the settings ---------- */
const BARS = s => (s >= 70 ? '▂▄▆█' : s >= 50 ? '▂▄▆' : s >= 30 ? '▂▄' : '▂');
function wifiRender(w) {
  if (!w || !w.ok) {
    $('wifiNow').textContent = "Pixel ne peut pas changer de Wi-Fi d'ici (pas de NetworkManager sur le Pi).";
    $('nets').replaceChildren(); $('scan').hidden = true; return;
  }
  $('scan').hidden = false;
  $('wifiNow').textContent = w.ssid ? `Connecté à « ${w.ssid} » (signal ${w.signal} %).` : w.eth ? 'Pas de Wi-Fi : un câble réseau est branché.' : 'Pas de Wi-Fi.';
  $('nets').replaceChildren(...(w.nets || []).map(n => {
    const b = document.createElement('button'), off = n.lock === 'entreprise' || n.lock === 'wep';
    b.type = 'button'; b.className = 'net' + (n.on ? ' on' : '') + (off ? ' off' : '');
    const name = document.createElement('span'); name.className = 'n'; name.textContent = (n.lock ? '🔒 ' : '') + n.ssid;
    const tag = document.createElement('small');
    tag.textContent = n.on ? 'connecté' : n.known ? 'enregistré' : n.lock === 'entreprise' ? 'entreprise' : n.lock === 'wep' ? 'WEP' : !n.lock ? 'ouvert' : '';
    const q = document.createElement('span'); q.className = 'q'; q.textContent = BARS(n.signal); q.setAttribute('aria-label', `signal ${n.signal} %`);
    b.append(name, tag, q); b.addEventListener('click', () => pick(n));
    return b;
  }));
  const j = w.job;                      // a join asked since this page opened: how it goes
  if (baseJob < 0) baseJob = j ? j.id : 0;
  if (j && j.id > baseJob) {
    if (j.state === 'connecting') say('wifiMsg', `Connexion à « ${j.ssid} »…`);
    else say('wifiMsg', j.msg || (j.state === 'ok' ? `Pixel est sur « ${j.ssid} ».` : 'Pas connecté.'), j.state === 'ok' ? 'ok' : 'err');
  } else if (w.perm === false) say('wifiMsg', "Pixel n'a pas le droit de changer le Wi-Fi : sur le Pi, relance sh deploy/install.sh.", 'err');
}
function pick(n) {
  if (n.on) return say('wifiMsg', `Pixel est déjà sur « ${n.ssid} ».`);
  if (n.lock === 'entreprise') return say('wifiMsg', `« ${n.ssid} » demande un identifiant : Pixel ne sait pas s'y connecter.`, 'err');
  if (n.lock === 'wep') return say('wifiMsg', `« ${n.ssid} » utilise WEP, trop ancien pour Pixel.`, 'err');
  if (n.known || !n.lock) return join(n.ssid);
  picked = n; $('joinFor').textContent = `Mot de passe de « ${n.ssid} » :`; $('pw').value = '';
  $('joinForm').hidden = false; $('pw').focus();
}
async function join(ssid, password) {
  const r = await call('/api/nfc/wifi/join', password == null ? { ssid } : { ssid, password });
  say('wifiMsg', r.ok ? `Connexion à « ${ssid} »…` : r.error, r.ok ? '' : 'err');
  setTimeout(refresh, 1500);
}
$('joinForm').addEventListener('submit', e => {
  e.preventDefault();
  const pw = $('pw').value; if (!pw || !picked) return;
  $('joinForm').hidden = true; $('pw').value = '';
  join(picked.ssid, pw);
});
$('joinCancel').addEventListener('click', () => { $('joinForm').hidden = true; $('pw').value = ''; picked = null; });
$('scan').addEventListener('click', async () => {
  const r = await call('/api/nfc/wifi/scan', {});
  say('wifiMsg', r.ok ? 'Pixel regarde les réseaux autour de lui…' : r.error, r.ok ? '' : 'err');
  setTimeout(refresh, 4500);
});

function keyRender(k) {
  if (!k) return;
  $('cleNow').textContent = k.mode === 'demo' ? 'Mode démo : Claude ne répond pas pour de vrai, même avec une clé.'
    : k.set && k.mode === 'api' ? 'Une clé API est enregistrée : Pixel l’utilise.'
      : k.set ? 'Une clé API est enregistrée, mais Pixel utilise ton abonnement Claude (backend = "abonnement" dans config.toml).'
        : k.mode === 'abonnement' ? 'Pas de clé API : Pixel utilise ton abonnement Claude.' : 'Pas de clé API : Claude reste en mode démo.';
}
$('keyForm').addEventListener('submit', async e => {
  e.preventDefault();
  const key = $('key').value.trim(); if (!key) return;
  say('keyMsg', 'Pixel vérifie la clé…');
  const r = await call('/api/nfc/key', { key });
  if (r.ok) $('key').value = '';
  say('keyMsg', r.ok ? r.message : r.error, r.ok ? 'ok' : 'err');
  if (r.ok && r.restart) waitRestart();
  else if (r.ok) refresh();
});
function waitRestart() {                 // the server forgets the sessions when it starts again: say so, then back to the code
  restarting = true; clearInterval(poll); poll = 0;
  setTimeout(() => {
    session = null; until = 0; tab.del('pixel_nfc_s'); tab.del('pixel_nfc_u'); restarting = false; show();
    say('pairMsg', 'Pixel a redémarré avec la nouvelle clé. Pour un autre réglage, demande un nouveau code.', 'ok');
  }, 9000);
}

async function refresh() {
  if (!paired() || restarting) return;
  const r = await call('/api/nfc/state');
  if (!r.ok) return;
  wifiRender(r.wifi); keyRender(r.key);
}
function startPoll() {
  clearInterval(poll);
  poll = setInterval(() => { if (!paired()) lose("L'accès aux réglages est fini : demande un nouveau code à Pixel."); else if (!document.hidden) refresh(); }, 3000);
}

/* ---------- the page opens ---------- */
const kept = tab.get('pixel_nfc_go');
if (kept) $('open').dataset.go = kept;
show();
if (paired()) { refresh(); startPoll(); }
else if (!CFG.go) askCode();            // the phone touched the tag: the code comes at once (an old tag with the access code: Pixel first)
})();
