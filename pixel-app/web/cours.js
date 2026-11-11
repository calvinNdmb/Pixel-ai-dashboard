/* « Mes cours » on a phone (pixel/cours.py): in the « Exos » panel (exos.js gives it its place, #exCours, and the
   snapshots), under its buttons, while no exercise is open and only with a Pi (the snapshot has "cours").
   - Photograph a lesson: the camera (one page a time, « Une autre page » for the next) or photos already taken; each is
     shrunk here first (1568 px at most, JPEG), shown small, and can be taken out; an optional title; « Envoyer à Pixel ».
     Pixel reads it (Claude, on the Pi's API key) and says when it is done; without a key: why, and nothing is sent.
   - Its lessons, kept a week: « Quiz » (a quiz on it, on his screen and here), « Voir le texte » (what he read),
     « Oublier ».
   Loaded after exos.js and before app.js. */
window.PixelCours = (() => {
const PAGES_MAX = 6, SIDE = 1568, DAY = 86400000;
let C = null, busyCur = false, el = null, shown = '', pages = [], titre = '', msg = '', sending = false;
const $el = (tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; };
const send = (a, args) => { if (window.PixelExos && PixelExos.send) PixelExos.send(a, args); };
const token = () => { try { return localStorage.getItem('pixel_t'); } catch (e) { return null; } };

async function shrink(file) {                  // a photo as Pixel needs it: 1568 px at most, JPEG, upright
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch (e) {
    src = await new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = ko; im.src = URL.createObjectURL(file); });
  }
  const w = src.width || src.naturalWidth, h = src.height || src.naturalHeight, k = Math.min(1, SIDE / Math.max(w, h));
  const cv = $el('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
  cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
  if (src.close) src.close();
  return new Promise((ok, ko) => cv.toBlob(b => (b ? ok(b) : ko(new Error('toBlob'))), 'image/jpeg', 0.85));
}
async function add(files) {
  for (const f of [...files]) {
    if (pages.length >= PAGES_MAX) { msg = `${PAGES_MAX} pages au plus pour un cours.`; break; }
    if (!/^image\//.test(f.type || 'image/')) continue;
    try { const blob = await shrink(f); pages.push({ blob, url: URL.createObjectURL(blob) }); msg = ''; }
    catch (e) { msg = "Cette photo ne s'ouvre pas : prends-la à nouveau."; }
  }
  render(true);
}
function drop(i) { const p = pages.splice(i, 1)[0]; if (p) URL.revokeObjectURL(p.url); render(true); }
function clear() { pages.forEach(p => URL.revokeObjectURL(p.url)); pages = []; titre = ''; }
async function upload() {
  if (!pages.length || sending) return;
  sending = true; msg = 'Envoi à Pixel…'; render(true);
  const fd = new FormData();
  if (titre.trim()) fd.append('titre', titre.trim());
  pages.forEach((p, i) => fd.append('page', p.blob, `page${i + 1}.jpg`));
  let out;
  try {
    const t = token(), r = await fetch('/api/cours', { method: 'POST', body: fd, cache: 'no-store', credentials: 'same-origin', headers: t ? { 'X-Pixel-Token': t } : {} });
    out = await r.json().catch(() => ({ ok: false, error: `Pixel n'a pas pu recevoir les photos (${r.status}).` }));
  } catch (e) { out = { ok: false, error: 'Pixel ne répond pas. Ton téléphone est-il sur le Wi-Fi de la maison ?' }; }
  sending = false;
  if (out.ok) { clear(); msg = `Envoyé ! Pixel lit ton cours (${out.pages} page${out.pages > 1 ? 's' : ''}).`; }
  else msg = out.error || "Pixel n'a pas pu recevoir les photos.";
  render(true);
}
async function texte(id, pre, b) {              // what Pixel read: to check it
  if (!pre.hidden) { pre.hidden = true; b.textContent = 'Voir le texte'; return; }
  b.textContent = '…';
  try {
    const t = token(), r = await fetch('/api/cours/' + encodeURIComponent(id), { cache: 'no-store', credentials: 'same-origin', headers: t ? { 'X-Pixel-Token': t } : {} });
    const j = await r.json(); pre.textContent = j.ok ? j.cours.texte : j.error || 'Ce cours ne se lit plus.';
  } catch (e) { pre.textContent = 'Pixel ne répond pas.'; }
  pre.hidden = false; b.textContent = 'Cacher le texte';
}
const left = c => Math.max(1, Math.round((c.fin - Date.now()) / DAY));

function render(force) {
  if (!el) return;
  const on = !!C && !busyCur;
  if (el.hidden !== !on) el.hidden = !on;
  if (!on) return;
  const key = JSON.stringify([C.liste.map(c => [c.id, c.titre, c.fin]), !!C.lecture, C.possible, C.pourquoi]);
  if (!force && key === shown) return;
  shown = key;
  const out = [$el('h3', null, 'Mes cours'), $el('p', 'ex-note', `Prends ton cours en photo : Pixel le lit et te pose des questions dessus pendant ${C.jours || 7} jours.`)];
  if (!C.possible) out.push($el('p', 'ex-why', C.pourquoi));
  if (C.lecture) out.push($el('p', 'ex-lit', `Pixel lit ton cours (${C.lecture.pages} page${C.lecture.pages > 1 ? 's' : ''})…`));
  if (pages.length) {
    const shots = $el('div', 'ex-shots');
    pages.forEach((p, i) => {
      const f = $el('figure'), im = $el('img'), x = $el('button', 'ex-shot-x', '×');
      im.src = p.url; im.alt = `Page ${i + 1}`; x.type = 'button'; x.setAttribute('aria-label', `Enlever la page ${i + 1}`); x.addEventListener('click', () => drop(i));
      f.append(im, x); shots.append(f);
    });
    out.push(shots);
  }
  const cam = $el('input'), gal = $el('input');
  cam.type = gal.type = 'file'; cam.accept = gal.accept = 'image/*'; cam.setAttribute('capture', 'environment'); gal.multiple = true;
  cam.hidden = gal.hidden = true;
  cam.addEventListener('change', () => add(cam.files)); gal.addEventListener('change', () => add(gal.files));
  const big = $el('div', 'ex-big'), can = C.possible && !C.lecture && !sending && pages.length < PAGES_MAX;
  const bCam = $el('button', pages.length ? null : 'main', pages.length ? '📷 Une autre page' : '📷 Prendre en photo'), bGal = $el('button', null, 'Choisir des photos');
  bCam.type = bGal.type = 'button'; bCam.disabled = bGal.disabled = !can;
  bCam.addEventListener('click', () => cam.click()); bGal.addEventListener('click', () => gal.click());
  big.append(bCam, bGal);
  out.push(cam, gal, big);
  if (pages.length) {
    const name = $el('input', 'ex-titre'); name.type = 'text'; name.maxLength = 60; name.placeholder = 'Titre (si tu veux)'; name.value = titre;
    name.setAttribute('aria-label', 'Titre du cours'); name.addEventListener('input', () => { titre = name.value; });
    const act = $el('div', 'ex-big'), go = $el('button', 'main', `Envoyer à Pixel (${pages.length} page${pages.length > 1 ? 's' : ''})`), no = $el('button', null, 'Annuler');
    go.type = no.type = 'button'; go.disabled = !C.possible || !!C.lecture || sending;
    go.addEventListener('click', upload); no.addEventListener('click', () => { clear(); msg = ''; render(true); });
    act.append(go, no); out.push(name, act);
  }
  const m = $el('p', 'ex-msg', msg); m.setAttribute('aria-live', 'polite'); out.push(m);
  if (C.liste.length) {
    const ul = $el('ul', 'ex-cours-liste');
    for (const c of C.liste) {
      const li = $el('li'), meta = [c.matiere, c.niveau, `encore ${left(c)} j`, `${c.pages} page${c.pages > 1 ? 's' : ''}`].filter(Boolean).join(' · ');
      const pre = $el('pre', 'ex-texte'); pre.hidden = true;
      const chips = $el('div', 'ex-chips'), q = $el('button', 'main', 'Quiz'), v = $el('button', null, 'Voir le texte'), del = $el('button', null, 'Oublier');
      q.type = v.type = del.type = 'button';
      q.addEventListener('click', () => { send('cours.quiz', { id: c.id }); msg = `Pixel prépare un quiz sur « ${c.titre} »…`; render(true); });
      v.addEventListener('click', () => texte(c.id, pre, v));
      del.addEventListener('click', () => { if (confirm(`Oublier le cours « ${c.titre} » ?`)) send('cours.supprime', { id: c.id }); });
      chips.append(q, v, del);
      li.append($el('b', 'ex-cours-titre', c.titre), $el('span', 'ex-meta', meta));
      if (c.resume) li.append($el('p', 'ex-resume', c.resume));
      li.append(chips, pre); ul.append(li);
    }
    out.push(ul);
  }
  el.replaceChildren(...out);
}

function mount(tries = 0) {                      // exos.js puts #exCours in its panel when the page is ready
  el = document.getElementById('exCours');
  if (!el) { if (tries < 50) setTimeout(() => mount(tries + 1), 200); return; }
  render(true);
}
if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount()); else setTimeout(mount); }

return {
  state(p) {                                     // exos.js, at each snapshot
    C = p && p.cours && Array.isArray(p.cours.liste) ? p.cours : null;
    const busy = !!(p && p.exos && p.exos.cur);
    if (busy && !busyCur) msg = '';                  // the quiz asked for came: its word is done
    busyCur = busy;
    render(false);
  },
  get pages() { return pages.length; },
};
})();
