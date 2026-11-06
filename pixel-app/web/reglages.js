/* Pixel's calendar settings page (phone or computer): list, add and remove calendars. */
(() => {
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
const qs = new URLSearchParams(location.search);
let token = qs.get('t') || store.get('pixel_t');
if (qs.get('t')) { store.set('pixel_t', qs.get('t')); history.replaceState(null, '', location.pathname); }
let ws = null, P = null, lastToast = 0, opened = false, retry = 500, lastList = '';

function say(text) { $('msg').textContent = text; }
function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws${token ? '?t=' + encodeURIComponent(token) : ''}`);
  ws.onopen = () => { opened = true; retry = 500; $('conn').textContent = 'connecté'; $('conn').classList.add('ok'); };
  ws.onmessage = e => {
    const m = JSON.parse(e.data); if (m.type !== 'state') return;
    const first = !P; P = m.data;
    if (first) lastToast = P.toast?.id || 0;
    else if (P.toast && P.toast.id !== lastToast) { lastToast = P.toast.id; say(P.toast.msg); }
    render();
  };
  ws.onclose = () => {
    $('conn').textContent = 'déconnecté'; $('conn').classList.remove('ok');
    if (!opened) say("Pas d'accès : ouvre d'abord l'appli avec le QR code de l'écran Réglages de Pixel, puis reviens ici.");
    setTimeout(connect, retry = Math.min(retry * 2, 8000));
  };
}
function send(action, args) {
  if (ws && ws.readyState === 1) { ws.send(JSON.stringify({ action, args })); return true; }
  say("Pas connecté à Pixel. Vérifie que Pixel est allumé et sur le même Wi-Fi."); return false;
}

function render() {
  const cals = (P.agenda && P.agenda.calendars) || [];
  const sig = JSON.stringify(cals);
  if (sig === lastList) return;                     // the state arrives every second: redraw only on change
  lastList = sig;
  const box = $('cals');
  if (!cals.length) { box.replaceChildren(el('p', null, "Aucun agenda pour l'instant. Ajoute ton agenda Google ci-dessous.")); return; }
  box.replaceChildren(...cals.map(c => {
    const row = el('div', 'cal'), dot = el('span', 'dot'), txt = el('div');
    dot.style.background = c.color;
    const n = c.count === 1 ? "1 rendez-vous aujourd'hui et demain" : `${c.count} rendez-vous aujourd'hui et demain`;
    txt.append(el('b', null, c.name), el('small', c.ok ? null : 'err', c.ok ? `${c.source} · ${n}` : `Erreur : ${c.error}`));
    row.append(dot, txt);
    if (c.removable) {
      const b = el('button', 'ghost', 'Retirer'); b.type = 'button';
      b.setAttribute('aria-label', 'Retirer ' + c.name);
      b.addEventListener('click', () => { if (send('agenda.remove', { id: c.id })) say('Retrait…'); });
      row.append(b);
    } else row.append(el('small', null, c.kind === 'url' && c.id.startsWith('config') ? 'config.toml' : 'démo'));
    return row;
  }));
}

$('addForm').addEventListener('submit', e => {
  e.preventDefault();
  const url = $('url').value.trim(), name = $('name').value.trim();
  if (!url) return;
  if (send('agenda.add', { url, name: name || null })) { say("Vérification de l'adresse…"); $('url').value = ''; $('name').value = ''; }
});
$('file').addEventListener('change', () => {
  const f = $('file').files[0]; $('file').value = '';
  if (!f) return;
  if (f.size > 2 * 1024 * 1024) return say('Ce fichier est trop gros (2 Mo maximum).');
  const r = new FileReader();
  r.onload = () => { if (send('agenda.import', { text: r.result, fallback: f.name.replace(/\.(ics|vcs)$/i, '') })) say('Import en cours…'); };
  r.onerror = () => say("Impossible de lire ce fichier.");
  r.readAsText(f);
});
$('refresh').addEventListener('click', () => { if (send('agenda.refresh')) say('Actualisation…'); });
connect();
})();
