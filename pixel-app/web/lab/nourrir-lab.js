/* Pixel Lab: Nourrir (../nourrir.js, ../scenes/nourrir.js; the fake server demo-hub.js mirrors pixel/nourrir.py). A panel
   after « Pixel de poche »: the 24 foods to give him (the same drawings, in the theme's colours), each reaction on demand,
   his belly (full, fine, a little or very hungry, and the hints), his settings and tastes, and the Pi's food tray. */
(() => {
const $ = id => document.getElementById(id), hub = window.PixelHub, PF = window.PixelFoods, NR = window.PixelNourrir;
if (!hub || !PF || !$('panel')) return;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const act = (action, args) => hub.dispatch(action, args || {});
const sec = el('section', 'grp nour-lab'); sec.setAttribute('aria-labelledby', 'hNourrir');
const h2 = el('h2', null, 'Nourrir'); h2.id = 'hNourrir';
const state = el('p', 'note'); state.id = 'nourLabState';
const menu = el('div', 'nour-lab-menu'); menu.setAttribute('role', 'group'); menu.setAttribute('aria-label', 'Lui donner à manger');
const icons = [];
for (const f of PF.FOODS) {
  const b = el('button'); b.type = 'button'; b.title = f.label; b.setAttribute('aria-label', 'Donner : ' + f.label); b.dataset.food = f.id;
  const c = el('canvas'); c.width = c.height = 12; b.append(c); icons.push(c);
  b.addEventListener('click', () => { act('screen.show', { screen: 'visage' }); act('nourrir.donner', { plat: f.id }); });
  menu.append(b);
}
const group = (title, list) => {
  const box = el('div', 'ev'), btns = el('div', 'btns');
  for (const [label, fn, id] of list) { const b = el('button', null, label); b.type = 'button'; if (id) b.id = id; b.addEventListener('click', () => { fn(b); setTimeout(render, 60); }); btns.append(b); }
  box.append(el('h3', null, title), btns); return box;
};
const react = (r, plat) => () => { act('screen.show', { screen: 'visage' }); act('lab.nourrir', { reaction: r, plat }); };
const g = () => (hub.S.nourrir && hub.S.nourrir.gouts) || { aime: [], deteste: [], prefere: '' };
const hintNow = () => {                 // the hint his belly asks for now (or a little hungry), even within 20 min of the last one
  PF.resetHint(); act('screen.show', { screen: 'visage' });
  const n = hub.S.nourrir || {}; Screens.persona.play(n.faim >= 2 ? 'nourrir-affame' : 'nourrir-creux');
};
const SPEEDS = ['lente', 'normale', 'rapide'], SNAME = { lente: 'lente', normale: 'normale', rapide: 'rapide' };
sec.append(h2, state, menu,
  group('Ses réactions', [['Plat préféré', react('prefere', null)], ['Il adore', react('aime', null)], ['Miam', react('miam', null)], ['Beurk', react('beurk', null)],
    ['Il refuse', react('refuse', null)], ['Plus faim', react('plein', null)], ['Je vais éclater', react('eclate', 'burger')], ['Trop de sucre', react('sucre', 'bonbon')],
    ['Fort comme un robot', react('legume', 'carotte')], ['Une pile', react('robot', 'pile')], ['Les cookies', react('robot', 'cookie-web')]]),
  group('Son ventre', [['Repu', () => act('lab.nourrir', { ventre: 100 })], ['Ça va', () => act('lab.nourrir', { ventre: 70 })], ['Un petit creux', () => act('lab.nourrir', { ventre: 45 })],
    ['Très faim', () => act('lab.nourrir', { ventre: 12 })], ['Il réclame', hintNow], ['« Tu as faim ? »', () => act('cmd', { text: 'tu as faim ?' })],
    ['« À table ! »', () => act('cmd', { text: 'à table !' })]]),
  group('Réglages', [['Repas', () => act('nourrir.reglages', { on: !(hub.S.nourrir && hub.S.nourrir.on) }), 'nourLabOn'],
    ['Vitesse', () => { const v = (hub.S.nourrir && hub.S.nourrir.reglages.vitesse) || 'normale'; act('nourrir.reglages', { vitesse: SPEEDS[(SPEEDS.indexOf(v) + 1) % 3] }); }, 'nourLabSpeed'],
    ['Changer ses goûts', () => act('nourrir.gouts')], ['Le plateau du Pi', () => { act('screen.show', { screen: 'visage' }); setTimeout(() => NR && NR.open(), 120); }]]),
  el('p', 'note', 'Touche un plat : Pixel le mange, selon ses goûts et son ventre. Sur l’écran, la petite assiette sur le bord droit, en bas, ouvre son plateau, comme sur le Pi (ou glisse vers le haut depuis le bas de l’écran du Pi). Il réclame à manger quand son ventre se vide, pas plus d’une fois toutes les 20 minutes, jamais la nuit.'));
const after = $('hPoche') && $('hPoche').closest('section');
if (after) after.after(sec); else $('panel').append(sec);
let painted = '';
function render() {
  const n = hub.S.nourrir, th = hub.S.view.theme, t = hub.ALLT.find(x => x.id === th) || hub.ALLT[0];
  if (t && t.c && painted !== th) {
    painted = th; const col = PF.theme(t.c);
    menu.style.setProperty('--nl-bg', t.c.bg);
    icons.forEach(c => { const x = c.getContext('2d'); x.clearRect(0, 0, 12, 12); const s = PF.sprite(c.parentElement.dataset.food, col, 0); if (s) x.drawImage(s, 0, 0); });
  }
  if (!n) { state.textContent = 'Pas de repas sur ce Pixel.'; return; }
  const name = id => (PF.BY[id] ? PF.BY[id].label : '—'), v = n.ventre, word = v >= 92 ? 'repu' : v >= 55 ? 'ça va' : v >= 25 ? 'un petit creux' : 'très faim';
  const last = n.dernier && PF.BY[n.dernier.plat] ? ` Dernier repas : ${name(n.dernier.plat)} (${PF.REACTIONS[n.dernier.reaction] || ''}).` : '';
  state.textContent = (n.on ? `Ventre : ${v} %, ${word}.` : 'Repas en pause.') + ` Préféré : ${name(g().prefere)}. Il aime : ${g().aime.map(name).join(', ')}. Il n’aime pas : ${g().deteste.map(name).join(', ')}.` + last;
  const on = $('nourLabOn'); on.textContent = n.on ? 'Repas : activés' : 'Repas : en pause'; on.setAttribute('aria-pressed', String(!!n.on));
  $('nourLabSpeed').textContent = 'Vitesse : ' + SNAME[(n.reglages && n.reglages.vitesse) || 'normale'];
  menu.querySelectorAll('button').forEach(b => { b.classList.toggle('fav', b.dataset.food === g().prefere); b.disabled = !n.on; });
}
let seen = '';
setInterval(() => { const k = JSON.stringify([hub.S.nourrir, hub.S.view.theme]); if (k !== seen) { seen = k; render(); } }, 400);
render();
{                                          // the commands to type (« Commandes à taper »), as caractere-lab.js does
  const ul = document.querySelector('section[aria-labelledby="hHelp"] .cmds');
  if (ul) for (const [c, d] of [['mange une pomme', 'il la mange'], ['tu as faim ?', 'son ventre'], ['à table !', 'il choisit']]) { const li = document.createElement('li'), k = document.createElement('code'), s = document.createElement('span'); k.textContent = c; s.textContent = d; li.append(k, s); ul.append(li); }
}
})();
