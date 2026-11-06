/* Pixel Lab: page wiring. The real renderer (../screens.js) draws Pixel's screen from the fake server
   (demo-hub.js). This file adds the pickers, the events, slow motion, the guided tour, the kiosk menu,
   the screen test and the screenshot. Themes and moods come from themes.js at runtime. */
(() => {
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const setT = (e, t) => { if (e.textContent !== t) e.textContent = t; };
const press = (e, on) => { const v = String(!!on); if (e.getAttribute('aria-pressed') !== v) e.setAttribute('aria-pressed', v); };
const L = Screens.local, C = window.PixelClock, hub = window.PixelHub, TC = window.PixelTestCard;
const BUILD = window.PIXEL_LAB_BUILD || {}, ART = !!BUILD.artifact;
const qs = new URLSearchParams(location.search);
const lab = $('lab'), cv = $('crt'), input = $('cmd'), kmenu = $('kmenu'), shotBox = $('shotBox');
const frNum = (v, d = 1) => Number(v).toFixed(d).replace('.', ',').replace(/,0+$/, '');
const speedLabel = () => '×' + frNum(C.speed, 2);

/* ---------- remembered choices (localStorage is optional: private windows, artifacts) ---------- */
const saved = (() => { try { return JSON.parse(localStorage.getItem('pixel_lab')) || {}; } catch { return {}; } })();
function remember(k, v) { if (saved[k] === v) return; saved[k] = v; try { localStorage.setItem('pixel_lab', JSON.stringify(saved)); } catch {} }

/* ---------- fonts: the real app's files, listed in ../fonts.json ---------- */
const FONTS = [{ family: 'VT323', file: 'VT323-Regular.ttf', google: 'VT323' }, { family: 'Fredoka', file: 'Fredoka.ttf', google: 'Fredoka:wght@400;500;600;700' },
  { family: 'Bangers', file: 'Bangers-Regular.ttf', google: 'Bangers' }, { family: 'Comic Neue', file: 'ComicNeue-Bold.ttf', google: 'Comic+Neue:wght@700' }];   // if fonts.json can't be read (file://)
const weights = g => { const m = /wght@([\d;.]+)/.exec(g || ''); return m ? m[1].split(';').map(Number).filter(n => n > 0) : []; };
async function loadFonts() {
  let list = Array.isArray(BUILD.fonts) ? BUILD.fonts : null;
  if (!list && location.protocol !== 'file:') { try { const r = await fetch('../fonts.json', { cache: 'no-cache' }); if (r.ok) list = await r.json(); } catch {} }
  if (!Array.isArray(list) || !list.length) list = FONTS;
  for (const f of list) {
    if (!f || !f.family) continue;
    const w = weights(f.google);
    if (!ART && f.file && 'FontFace' in window) {
      try { const ff = new FontFace(f.family, `url("../${encodeURI(f.file)}")`, { weight: w.length > 1 ? `${Math.min(...w)} ${Math.max(...w)}` : w.length ? String(w[0]) : '100 900', display: 'swap' }); document.fonts.add(ff); ff.load().catch(() => {}); } catch {}
    }
    for (const x of w.length ? w : [400]) document.fonts?.load(`${x} 20px "${f.family}"`).catch(() => {});
  }
}
loadFonts();

/* ---------- the page takes the colours and fonts of Pixel's current theme ---------- */
const THEME = id => hub.THEMES.find(t => t.id === id) || hub.THEMES[0];
const fontParts = s => { const m = /^\s*(?:(\d{3}|bold|normal)\s+)?(\d+(?:\.\d+)?)px\s+(.+)$/.exec(String(s || '')); return m ? { w: m[1] || '400', px: +m[2], family: m[3] } : null; };
const crtTheme = t => typeof t.crt === 'boolean' ? t.crt : t.id === 'retro';      // scanlines, as in the real app
let skinned = null;
function skin(id) {
  const t = THEME(id); if (skinned === t.id) return; skinned = t.id;
  const c = t.c || {}, set = (k, v) => v ? lab.style.setProperty(k, v) : lab.style.removeProperty(k);
  let k = null, b = null; try { k = fontParts(t.font && t.font(20, 'title')); b = fontParts(t.font && t.font(22)); } catch {}
  lab.dataset.skin = t.id;
  set('--k-bg', c.bg); set('--k-fg', c.fg); set('--k-act', c.accent); set('--k-font', k && k.family); set('--k-w', k && k.w); set('--k-size', k && String(Math.max(0.6, Math.min(1.2, k.px / 20))));
  set('--c-bg', c.bg); set('--c-fg', c.fg); set('--c-dim', c.dim); set('--c-line', c.dim); set('--c-font', b && b.family);
}

/* ---------- state from the fake server ---------- */
let P = null, kiosk = qs.has('kiosk') || location.hash === '#kiosk';
document.body.classList.toggle('kiosk', kiosk);
L.kiosk = kiosk;                              // kiosk: the boot splash plays on the first state, like on the Pi
hub.configure({ theme: saved.theme, screen: saved.screen, sleep_min: saved.sleepAfter, face: saved.face });
if (Number(saved.speed) > 0) C.setSpeed(Number(saved.speed));
Screens.setSend((action, args) => hub.dispatch(action, args));
const curMood = () => {                          // same rule as screens.js mood()
  if (L.local && performance.now() < L.local.until) return L.local.name;
  const m = P && P.mood; if (m && (!m.until || Date.now() < m.until)) return m.name;
  return L.sleepy ? 'endormi' : 'neutre';
};
const touch = () => { L.lastInput = performance.now(); };   // panel use counts as activity, but does not wake Pixel

/* ---------- pickers ---------- */
function chip(label, on, cls = 'chip') { const b = el('button', cls, label); b.type = 'button'; b.addEventListener('click', on); return b; }
const themeChips = [], moodChips = [], screenChips = [], weatherChips = [], testChips = [];
function pickTheme(id) { touch(); stopTour(); hub.dispatch('theme.set', { name: id }); }
function pickScreen(id) { touch(); stopTour(); hub.dispatch('screen.show', { screen: id }); }
function pickMood(id) {
  touch(); stopTour();
  const ms = Number(saved.moodDur) || 0;
  if (P && P.screen !== 'visage') hub.dispatch('screen.show', { screen: 'visage' });
  L.local = null; if (id !== 'endormi') L.sleepy = false;
  hub.dispatch('mood.set', ms ? { name: id, ms } : { name: id });
}
for (const t of hub.THEMES) {
  const b = chip(t.name, () => pickTheme(t.id)); b.dataset.id = t.id;
  if (t.c && t.c.bg && t.c.fg) { const s = el('i', 'sw'); s.style.background = `linear-gradient(135deg,${t.c.bg} 52%,${t.c.fg} 52%)`; b.prepend(s); }
  $('themeChips').append(b); themeChips.push(b);
}
setT($('themeNote'), `${hub.THEMES.length} thèmes trouvés dans themes.js.`);
for (const m of hub.MOODS) { const b = chip(m.name, () => pickMood(m.id)); b.dataset.id = m.id; if (m.desc) b.title = m.desc; $('moodChips').append(b); moodChips.push(b); }
for (const id of hub.NAV) { const b = chip(hub.NAMES[id], () => pickScreen(id)); b.dataset.id = id; $('screenChips').append(b); screenChips.push(b); }

/* ---------- the 52 animations of the user's pack, by category ---------- */
const animChips = [];
let showAll = null;                                   // "Tout voir": every animation, one loop each
function pickAnim(id, keep = false) {
  touch(); stopTour(); if (!keep) stopAll();
  if (P && P.screen !== 'visage') hub.dispatch('screen.show', { screen: 'visage' });
  L.local = null; L.sleepy = false;
  hub.dispatch('anim.play', L.packIdle === false || keep ? { id, loops: keep ? 1 : 0 } : { id });
}
for (const g of hub.AGROUPS) {
  const list = hub.ANIMS.filter(a => a.group === g); if (!list.length) continue;
  const box = el('div', 'ev'), row = el('div', 'chips'); box.append(el('h3', null, g), row); row.setAttribute('role', 'group'); row.setAttribute('aria-label', g);
  for (const a of list) { const b = chip(a.label, () => pickAnim(a.id)); b.dataset.id = a.id; row.append(b); animChips.push(b); }
  $('animGroups').append(box);
}
if (!hub.ANIMS.length) setT($('animNote'), "Le pack d'animations n'est pas chargé.");
document.querySelectorAll('#faceSeg button').forEach(b => b.addEventListener('click', () => { touch(); hub.dispatch('face.set', { name: b.dataset.face }); }));
$('idleBtn').addEventListener('click', () => { L.packIdle = L.packIdle === false; if (L.packIdle) hub.dispatch('anim.stop'); syncStatic(); });
function stopAll() { if (!showAll) return; showAll = null; syncStatic(); }
$('allBtn').addEventListener('click', () => {
  touch(); stopTour();
  if (showAll) return stopAll();
  showAll = { i: 0, at: C.now() }; pickAnim(hub.ANIMS[0].id, true); syncStatic();
});
setInterval(() => {                                   // on the virtual clock: slows down and pauses with the face
  if (!showAll) return;
  const a = hub.ANIMS[showAll.i];
  if (C.now() - showAll.at >= a.duration * 1000) { showAll.i = (showAll.i + 1) % hub.ANIMS.length; showAll.at = C.now(); pickAnim(hub.ANIMS[showAll.i].id, true); }
}, 100);
document.querySelectorAll('#moodDur button').forEach(b => b.addEventListener('click', () => { remember('moodDur', Number(b.dataset.dur)); syncStatic(); }));
let wx = 'exemple';
for (const k of [...hub.KINDS, { id: 'melange', name: 'Mélange' }, { id: 'exemple', name: 'Exemple' }]) {
  const b = chip(k.name, () => { touch(); wx = k.id; act('lab.weather', { kind: k.id }, 'meteo'); }); b.dataset.id = k.id; $('weatherChips').append(b); weatherChips.push(b);
}
for (const s of hub.S.lights.scenes) $('sceneChips').append(chip(s, () => act('lights.scene', { name: s }, 'lumieres')));
const roomChips = hub.S.lights.rooms.map(r => { const b = chip(r.name, () => { const x = P && P.lights.rooms.find(y => y.id === r.id); act('lights.set', { room: r.id, on: !(x && x.on) }, 'lumieres'); }); $('roomChips').append(b); return b; });
for (const p of TC.pages) { const b = chip(p.name, () => openTest(p.id)); b.dataset.id = p.id; $('testChips').append(b); testChips.push(b); }

/* ---------- events: plain server actions, lab actions ---------- */
function act(action, args = {}, go = null) { touch(); if (go && P && P.screen !== go) hub.dispatch('screen.show', { screen: go }); hub.dispatch(action, args); }
document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
  let args = {}; try { args = b.dataset.args ? JSON.parse(b.dataset.args) : {}; } catch {}
  act(b.dataset.act, args, b.dataset.go || null);
}));
$('toastText').value = typeof saved.toastText === 'string' ? saved.toastText : $('toastText').value;
$('toastForm').addEventListener('submit', e => {
  e.preventDefault(); const msg = $('toastText').value.trim() || 'Coucou !';
  remember('toastText', msg); act('lab.toast', { msg, ms: 4500, mood: 'surpris' });
});
function sleepNow() {
  stopTour(); touch();
  if (!P || P.screen !== 'visage') hub.dispatch('screen.show', { screen: 'visage' });
  hub.dispatch('mood.set', { name: 'neutre', ms: 1 });    // an expired mood: a lasting "neutre" would hide the idle sleep in screens.js
  L.local = null; L.lastInput = -1e12;                      // as if nobody had touched him for ages: screens.js puts him to sleep
}
function wake() {
  if (P && P.screen === 'veille') return hub.dispatch('screen.show', { screen: 'visage' });
  const m = P && P.mood, moodAsleep = !!m && m.name === 'endormi' && (!m.until || Date.now() < m.until);
  Screens.input();                                          // idle sleep: he wakes up with a start
  if (moodAsleep) { hub.dispatch('mood.set', { name: 'neutre', ms: 1 }); L.local = { name: 'surpris', until: performance.now() + 900 }; }
}
document.querySelector('[data-lab="sleep"]').addEventListener('click', sleepNow);
document.querySelector('[data-lab="wake"]').addEventListener('click', wake);
const sleepSel = $('sleepAfter');
if ([...sleepSel.options].some(o => Number(o.value) === Number(saved.sleepAfter))) sleepSel.value = String(saved.sleepAfter); else sleepSel.value = '10';
sleepSel.addEventListener('change', () => { remember('sleepAfter', Number(sleepSel.value)); act('lab.settings', { sleep_min: Number(sleepSel.value) }); });
hub.dispatch('lab.settings', { sleep_min: Number(sleepSel.value) });
$('bright').addEventListener('input', () => { const v = Number($('bright').value) / 100; setT($('brightOut'), Math.round(v * 100) + ' %'); act('sys.bright', { d: v - (P ? P.sys.bright : 1) }); });

/* ---------- Stream Deck: 15 keys, rows 1-2 open a screen, row 3 acts on the open screen ---------- */
const KB = [];
for (let i = 0; i < 15; i++) { const b = el('button', 'key' + (i >= 10 ? ' act' : '')); b.type = 'button'; b.addEventListener('click', () => key(i)); $('keys').append(b); KB.push(b); }
function key(i) {
  if (!P) return;
  if (Screens.input()) return;                              // the first press wakes Pixel up, like app.js
  if (i < 10) return hub.dispatch('screen.show', { screen: hub.NAV[i] });
  const k = (P.keys.row3[P.screen] || [])[i - 10]; if (!k) return;
  if (k.action === 'view.toggle' && k.args.key === 'osk') { if (!kiosk) input.focus(); return; }
  hub.dispatch(k.action, k.args);
}

/* ---------- command bar: the same parser as the real server (demo-hub.js) ---------- */
const hist = []; let hi = 0;
$('cmdForm').addEventListener('submit', e => {
  e.preventDefault();
  const text = input.value.trim(); if (!text) return;
  Screens.input(); hub.dispatch('cmd', { text }); hist.push(text); hi = hist.length; input.value = '';
});
input.addEventListener('keydown', e => {
  if (e.key === 'ArrowUp' && hi > 0) { input.value = hist[--hi]; e.preventDefault(); }
  else if (e.key === 'ArrowDown') { hi = Math.min(hist.length, hi + 1); input.value = hist[hi] || ''; e.preventDefault(); }
  else if (e.key === 'Escape') { input.value = ''; input.blur(); }
});
input.addEventListener('focus', () => Screens.input());
function swipe(d) { const n = hub.NAV.length, i = hub.NAV.indexOf(P ? P.screen : 'visage'); hub.dispatch('screen.show', { screen: hub.NAV[((i + d) % n + n) % n] }); }
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (!shotBox.hidden) shotBox.hidden = true; else if (!kmenu.hidden) closeMenu(); else if (TC.page) TC.close(); return; }
  const t = e.target;
  if (t === input || e.ctrlKey || e.metaKey || e.altKey || !kmenu.hidden || !shotBox.hidden) return;
  if (t.closest && t.closest('input, select, textarea, [contenteditable="true"]')) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { Screens.input(); swipe(e.key === 'ArrowRight' ? 1 : -1); e.preventDefault(); return; }
  if (!kiosk && e.key.length === 1 && !(e.key === ' ' && t.closest && t.closest('button, a'))) { Screens.input(); input.focus(); }   // typing goes to the command bar
});

/* ---------- touch and mouse on Pixel's screen (like app.js), plus the kiosk menu gestures ---------- */
let down = null, lpTimer = 0;
const corner = p => (p.x < 64 || p.x > 736) && (p.y < 64 || p.y > 416);
cv.addEventListener('pointermove', e => {
  L.ptr = Screens.toCanvas(e); if (e.pointerType === 'mouse') touch();
  if (down && down.id === e.pointerId && Math.hypot(L.ptr.x - down.x, L.ptr.y - down.y) > 15) clearTimeout(lpTimer);
});
cv.addEventListener('pointerleave', () => { L.ptr = null; });
cv.addEventListener('pointerdown', e => {
  down = { ...Screens.toCanvas(e), id: e.pointerId, long: false }; clearTimeout(lpTimer);
  if (kiosk) lpTimer = setTimeout(() => { if (down) { down.long = true; openMenu(); } }, 1000);   // long press: lab menu
});
cv.addEventListener('pointermove', e => {      // a finger that moves (petting Pixel, a swipe) is not a long press
  if (down && down.id === e.pointerId) { const p = Screens.toCanvas(e); if (Math.hypot(p.x - down.x, p.y - down.y) > 20) clearTimeout(lpTimer); }
});
cv.addEventListener('pointerup', e => {
  clearTimeout(lpTimer);
  if (!down || down.id !== e.pointerId) return;
  const p = Screens.toCanvas(e), d = down; down = null;
  if (d.long) return;
  if (kiosk && corner(d) && corner(p) && Math.hypot(p.x - d.x, p.y - d.y) < 30) return openMenu();   // tap in a corner: lab menu
  if (Screens.input()) return;
  const dx = p.x - d.x, dy = p.y - d.y;
  if (!L.petted && Math.abs(dx) > 90 && Math.abs(dx) > 2 * Math.abs(dy)) return swipe(dx < 0 ? 1 : -1);   // not while petting Pixel
  Screens.hit(p.x, p.y);
});
cv.addEventListener('pointercancel', () => { clearTimeout(lpTimer); down = null; });
cv.addEventListener('contextmenu', e => { if (kiosk) e.preventDefault(); });

/* ---------- slow motion: the virtual clock of clock.js ---------- */
const PLAY = '<path d="M5 3l12 7-12 7z"/>', PAUSE = '<rect x="4" y="3" width="4" height="14" rx="1"/><rect x="12" y="3" width="4" height="14" rx="1"/>';
function setSpeed(s) { C.setSpeed(s); if (C.paused) C.play(); remember('speed', Number(s)); syncStatic(); }
document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => setSpeed(Number(b.dataset.speed))));
$('tPlay').addEventListener('click', () => { C.toggle(); syncStatic(); });
$('kmPause').addEventListener('click', () => { C.toggle(); syncStatic(); });
$('tStep').addEventListener('click', () => { C.step(); syncStatic(); });

/* ---------- guided tour: every mood, then every screen, then the next theme, in a loop ---------- */
let tour = null;
const tourSel = $('tourEvery');
if ([...tourSel.options].some(o => Number(o.value) === Number(saved.tourEvery))) tourSel.value = String(saved.tourEvery);
tourSel.addEventListener('change', () => { remember('tourEvery', Number(tourSel.value)); if (tour) tour.every = Number(tourSel.value); });
function tourSteps() {
  const th = hub.THEMES, i0 = Math.max(0, th.findIndex(t => t.id === (P ? P.view.theme : ''))), out = [];
  for (let k = 0; k < th.length; k++) {
    const t = th[(i0 + k) % th.length];
    for (const m of hub.MOODS) out.push({ theme: t.id, screen: 'visage', mood: m.id, label: `${t.name} · humeur ${m.name}` });
    hub.ANIMS.forEach((a, j) => { if (j % th.length === k) out.push({ theme: t.id, screen: 'visage', anim: a.id, label: `${t.name} · animation ${a.label}` }); });
    for (const s of hub.NAV) if (s !== 'visage') out.push({ theme: t.id, screen: s, label: `${t.name} · écran ${hub.NAMES[s]}` });
  }
  return out;
}
function applyStep(st) {
  const S = hub.S, b = hub.busy();
  if (S.view.theme !== st.theme) hub.dispatch('theme.set', { name: st.theme });
  if (S.screen !== st.screen) hub.dispatch('screen.show', { screen: st.screen });
  if (st.anim) { L.local = null; L.sleepy = false; hub.dispatch('mood.set', { name: 'neutre', ms: 1 }); hub.dispatch('anim.play', { id: st.anim, loops: 0 }); return; }
  if (S.anim) hub.dispatch('anim.stop');
  if (st.mood) { L.local = null; L.sleepy = false; hub.dispatch('mood.set', { name: st.mood }); }
  else if (S.mood.name !== 'neutre' || !S.mood.until || Date.now() < S.mood.until) hub.dispatch('mood.set', { name: 'neutre', ms: 1 });   // no mood
  if (st.screen === 'claude' && !S.chat.messages.length && !b.chat) hub.dispatch('chat.send', { text: 'Raconte-moi une blague courte.' });   // give each screen something to show
  if (st.screen === 'codex' && !S.codex.task && !b.codex) hub.dispatch('lab.codex');
  if (st.screen === 'minuteur' && !S.timer.running) hub.dispatch('timer.start', { minutes: 25 });
}
function startTour() { stopAll(); const steps = tourSteps(); tour = { steps, i: 0, at: C.now(), every: Number(tourSel.value) }; applyStep(steps[0]); syncStatic(); }
function stopTour() { if (!tour) return; tour = null; syncStatic(); }
const toggleTour = () => { touch(); tour ? stopTour() : startTour(); };
$('tourBtn').addEventListener('click', toggleTour);
setInterval(() => {                                   // runs on the virtual clock: it slows down and pauses with the face
  if (!tour) return;
  if (C.now() - tour.at >= tour.every) { tour.i = (tour.i + 1) % tour.steps.length; tour.at = C.now(); applyStep(tour.steps[tour.i]); syncStatic(); }
}, 100);

/* ---------- screen test (testcard.js) and theme benchmark ---------- */
TC.init({ info: () => ({ theme: hub.themeName(L.theme), screen: hub.NAMES[L.scr] || L.scr, speed: speedLabel() }), onChange: () => syncStatic() });
function openTest(id) { closeMenu(); TC.open(id, { toolbar: kiosk }); }
$('testClose').addEventListener('click', () => TC.close());
let benching = false;
const wait = ms => new Promise(r => setTimeout(r, ms));
async function bench() {
  if (benching) return; benching = true; stopTour();
  const btn = $('benchBtn'), out = $('benchOut'), keep = hub.S.view.theme, rows = [];
  btn.disabled = true; out.hidden = false;
  const draw = () => {
    const top = Math.max(1, ...rows.map(r => r.ms));
    out.replaceChildren(...rows.flatMap(r => { const cell = el('span'), bar = el('i', 'bar'); bar.style.width = Math.max(2, r.ms / top * 100) + '%'; cell.append(bar); return [el('span', null, r.name), cell, el('span', 'ms', `${frNum(r.ms, 1)} ms · ${Math.round(r.fps)} im/s`)]; }));
  };
  for (const t of hub.THEMES) {
    setT(btn, `Mesure : ${t.name}…`);
    hub.dispatch('lab.theme', { name: t.id }); await wait(700);
    await wait(1100); const st = C.stats(); rows.push({ name: t.name, ms: st.drawMs, fps: st.fps }); draw();
  }
  hub.dispatch('lab.theme', { name: keep });
  setT(btn, 'Comparer les thèmes'); btn.disabled = false; benching = false;
  flash(`Mesuré sur l'écran ${hub.NAMES[hub.S.screen]}, sur cet appareil. Sur le Pi, regarde surtout les images/s.`);
}
$('benchBtn').addEventListener('click', bench);

/* ---------- kiosk menu (long press or a corner, on the 800x480 screen) ---------- */
const kmT = [], kmM = [], kmS = [];
for (const t of hub.THEMES) { const b = chip(t.name, () => pickTheme(t.id), ''); b.dataset.id = t.id; $('kmThemes').append(b); kmT.push(b); }
for (const m of hub.MOODS) { const b = chip(m.name, () => pickMood(m.id), ''); b.dataset.id = m.id; $('kmMoods').append(b); kmM.push(b); }
for (const id of hub.NAV) { const b = chip(hub.NAMES[id], () => pickScreen(id), ''); b.dataset.id = id; $('kmScreens').append(b); kmS.push(b); }
let ghost = false, ghostT = 0;                       // the click of the tap that opened the menu lands on the menu: ignore it
function openMenu() { if (TC.page) return; down = null; ghost = true; clearTimeout(ghostT); ghostT = setTimeout(() => { ghost = false; }, 700); kmenu.hidden = false; syncStatic(); refresh(); }
function closeMenu() { kmenu.hidden = true; }
kmenu.addEventListener('pointerdown', () => { ghost = false; }, true);
kmenu.addEventListener('click', e => { if (ghost) { ghost = false; e.stopPropagation(); e.preventDefault(); } }, true);
$('kmClose').addEventListener('click', closeMenu);
kmenu.addEventListener('click', e => { if (e.target === kmenu) closeMenu(); });
$('kmTest').addEventListener('click', () => openTest('couleurs'));
$('kmTour').addEventListener('click', toggleTour);
$('kmShot').addEventListener('click', () => { closeMenu(); setTimeout(shot, 60); });
$('kmFull').hidden = !document.fullscreenEnabled;
$('kmFull').addEventListener('click', () => { try { (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}); } catch {} });
$('kmQuit').addEventListener('click', () => {
  if (/\/app\/lab\/?/.test(location.pathname) && location.protocol.startsWith('http')) { location.href = '/?kiosk=1'; return; }   // served by Pixel: back to the real screen
  setKiosk(false);
  try { history.replaceState(null, '', location.pathname); } catch {}
});
function setKiosk(on) { kiosk = !!on; document.body.classList.toggle('kiosk', kiosk); if (!kiosk) closeMenu(); if (TC.page) TC.open(TC.page, { toolbar: kiosk }); }
window.addEventListener('hashchange', () => setKiosk(qs.has('kiosk') || location.hash === '#kiosk'));
$('kioskLink').href = ART ? '#kiosk' : '?kiosk=1';

/* ---------- screenshot: a PNG download, or the picture in an overlay where downloads don't work ---------- */
const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
function shot() {
  const name = `pixel-${hub.S.view.theme}-${hub.S.screen}-${stamp()}.png`; let url;
  try { url = cv.toDataURL('image/png'); } catch { flash("La capture n'a pas marché."); return; }
  const phone = matchMedia('(pointer: coarse)').matches && !kiosk;
  if (!ART && !phone) {
    try { const a = el('a'); a.href = url; a.download = name; a.hidden = true; document.body.append(a); a.click(); a.remove(); flash(`Capture enregistrée : ${name}`); return; } catch {}
  }
  $('shotImg').src = url; $('shotDl').href = url; $('shotDl').download = name; $('shotDl').hidden = ART; shotBox.hidden = false; $('shotClose').focus();
}
$('tShot').addEventListener('click', shot);
$('shotClose').addEventListener('click', () => { shotBox.hidden = true; });
shotBox.addEventListener('click', e => { if (e.target === shotBox) shotBox.hidden = true; });
let flashT = 0;
function flash(msg) { const t = $('ltoast'); setT(t, msg); t.hidden = false; clearTimeout(flashT); flashT = setTimeout(() => { t.hidden = true; }, 3200); }

/* ---------- render: state -> page ---------- */
function syncStatic() {
  const sp = C.speed, paused = C.paused;
  document.querySelectorAll('[data-speed]').forEach(b => press(b, Math.abs(Number(b.dataset.speed) - sp) < 1e-6 && !paused));
  press($('tPlay'), paused); $('tPlay').querySelector('svg').innerHTML = paused ? PLAY : PAUSE; setT($('tPlay').querySelector('span'), paused ? 'Lecture' : 'Pause');
  $('tPlay').setAttribute('aria-label', paused ? 'Reprendre les animations' : 'Mettre les animations en pause');
  press($('kmPause'), paused);
  document.querySelectorAll('#moodDur button').forEach(b => press(b, Number(b.dataset.dur) === (Number(saved.moodDur) || 0)));
  press($('tourBtn'), !!tour); setT($('tourBtn'), tour ? 'Arrêter la démo' : 'Lancer la démo'); press($('kmTour'), !!tour);
  setT($('tourNote'), tour ? `Étape ${tour.i + 1} sur ${tour.steps.length} : ${tour.steps[tour.i].label}` : 'Toutes les humeurs, des animations, puis tous les écrans, puis le thème suivant. En boucle.');
  press($('idleBtn'), L.packIdle !== false); press($('allBtn'), !!showAll);
  setT($('allBtn'), showAll ? 'Arrêter' : 'Tout voir');
  testChips.forEach(b => press(b, b.dataset.id === TC.page));
}
function refresh() {                                  // things that change without a new state: mood expiry, fps
  if (!P) return;
  const md = curMood();
  moodChips.forEach(b => press(b, b.dataset.id === md)); kmM.forEach(b => press(b, b.dataset.id === md));
  const m = hub.MOODS.find(x => x.id === md);
  setT($('moodNote'), !m ? '' : md === 'neutre' && P.view.face !== 'vivant' ? "Neutre. Avec le pack 52 : les animations d'attente, tirées au sort." : m.desc ? `${m.name}. ${m.desc}` : m.name);
  const pa = P.view.face !== 'vivant' || (P.anim && (!P.anim.until || Date.now() < P.anim.until)) ? L.packNow : null;
  animChips.forEach(b => press(b, b.dataset.id === pa));
  if (showAll) { const a = hub.ANIMS[showAll.i]; setT($('animNote'), `Tout voir : ${showAll.i + 1} sur ${hub.ANIMS.length}, ${a.label}.`); }
  else { const a = hub.ANIMS.find(x => x.id === pa); setT($('animNote'), a ? `${a.label} (${a.group}). Touche une animation pour la jouer.` : 'Les 52 animations de ton pack. Touche-en une pour la jouer.'); }
  const st = C.stats(), fps = Math.round(st.fps);
  const info = `${hub.themeName(P.view.theme)} · ${hub.NAMES[P.screen]} · ${hub.moodName(md)} · ${speedLabel()}${C.paused ? ' · en pause' : ''} · ${fps} im/s`;
  setT($('readout'), info); setT($('kmInfo'), info);
}
setInterval(refresh, 250);
function render(s) {
  const v = s.view, t = THEME(v.theme);
  skin(t.id);
  $('screen').classList.toggle('flat', !!v.crt_off || !crtTheme(t));
  cv.style.filter = s.sys.bright < 1 ? `brightness(${s.sys.bright})` : '';
  lab.classList.toggle('asleep', s.screen === 'veille');
  s.keys.nav.forEach((k, i) => { setT(KB[i], k.label); KB[i].classList.toggle('cur', k.id === s.screen); KB[i].setAttribute('aria-label', 'Écran ' + k.label); });
  (s.keys.row3[s.screen] || []).forEach((k, j) => { const b = KB[10 + j]; setT(b, k ? k.label : ''); b.disabled = !k; if (k) b.setAttribute('aria-label', k.label.replace('\n', ' ')); else b.removeAttribute('aria-label'); });
  themeChips.forEach(b => press(b, b.dataset.id === v.theme)); kmT.forEach(b => press(b, b.dataset.id === v.theme));
  document.querySelectorAll('#faceSeg button').forEach(b => press(b, b.dataset.face === (v.face || 'pack')));
  screenChips.forEach(b => press(b, b.dataset.id === s.screen)); kmS.forEach(b => press(b, b.dataset.id === s.screen));
  weatherChips.forEach(b => press(b, b.dataset.id === wx));
  s.lights.rooms.forEach((r, i) => { const b = roomChips[i]; if (!b) return; setT(b, r.on ? `${r.name} ${r.bri} %` : `${r.name} éteint`); press(b, r.on); });
  press($('unitsBtn'), v.units_f); setT($('unitsBtn'), v.units_f ? '°F → °C' : '°C → °F');
  press($('crtBtn'), !v.crt_off); press($('agToday'), v.agenda_day === 0); press($('agTomorrow'), v.agenda_day === 1);
  const b = Math.round(s.sys.bright * 100); if (document.activeElement !== $('bright')) { $('bright').value = String(b); setT($('brightOut'), b + ' %'); }
  $('ledWork').classList.toggle('on', s.chat.phase !== 'idle' || s.codex.running || s.timer.running);
  $('ledLights').classList.toggle('on', s.lights.rooms.some(r => r.on));
  remember('theme', v.theme); remember('screen', s.screen); remember('face', v.face);
}
hub.listen(snap => {
  const first = !P; P = snap;
  Screens.setState(snap);
  L.scr = snap.screen;                                // the lab always mirrors the (fake) server's screen
  if (first) L.kiosk = true;                         // from now on he falls asleep when left alone, like on the device
  render(snap); refresh();
});
syncStatic();
Screens.start();

/* For tests and the curious: the lab's parts. */
window.PixelLab = { hub, clock: C, testcard: TC, screens: Screens, get tour() { return tour; }, get kiosk() { return kiosk; }, get showAll() { return showAll; }, setKiosk, openMenu, closeMenu, shot, bench, sleepNow, wake, curMood, pickAnim };
})();
