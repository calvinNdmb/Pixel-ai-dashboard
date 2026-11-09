/* Pixel Lab: la boutique (../boutique.js, ../scenes/boutique.js; the fake server demo-hub.js mirrors pixel/boutique.py). A panel
   after « Nourrir » (his customisations together): the 24 accessories (the same drawings, in the theme's colours: a touch tries
   one on, a second one buys it, as on the Pi's tray), his purse, the gift of the day, his reactions, and the Pi's tray. */
(() => {
const $ = id => document.getElementById(id), hub = window.PixelHub, WR = window.PixelWardrobe, BT = window.PixelBoutique;
if (!hub || !WR || !$('panel')) return;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const act = (action, args) => hub.dispatch(action, args || {});
const sec = el('section', 'grp bout-lab'); sec.setAttribute('aria-labelledby', 'hBoutique');
const h2 = el('h2', null, 'Boutique'); h2.id = 'hBoutique';
const state = el('p', 'note'); state.id = 'boutLabState';
const menu = el('div', 'bout-lab-menu'); menu.setAttribute('role', 'group'); menu.setAttribute('aria-label', 'Ses accessoires');
const icons = [];
for (const it of WR.ITEMS) {
  const b = el('button'); b.type = 'button'; b.title = `${it.label} (${it.prix})`; b.setAttribute('aria-label', it.label); b.dataset.item = it.id;
  const c = el('canvas'); c.width = c.height = 72; c.style.width = c.style.height = '36px'; b.append(c); icons.push(c);
  b.addEventListener('click', () => { act('screen.show', { screen: 'visage' }); if (BT) BT.pick(it.id); setTimeout(render, 80); });
  menu.append(b);
}
const group = (title, list) => {
  const box = el('div', 'ev'), btns = el('div', 'btns');
  for (const [label, fn] of list) { const b = el('button', null, label); b.type = 'button'; b.addEventListener('click', () => { fn(b); setTimeout(render, 80); }); btns.append(b); }
  box.append(el('h3', null, title), btns); return box;
};
const play = (ev, data) => () => { act('screen.show', { screen: 'visage' }); Screens.event(ev, data, true); };
const SAMPLE = { objet: 'bonnet', label: 'Bonnet', nom: 'son bonnet' };
sec.append(h2, state, menu,
  group('Ses pièces', [['+10', () => act('lab.boutique', { pieces: (hub.S.boutique.pieces || 0) + 10 })], ['+100', () => act('lab.boutique', { pieces: (hub.S.boutique.pieces || 0) + 100 })],
    ['Zéro', () => act('lab.boutique', { pieces: 0 })], ['Cadeau du jour', () => act('boutique.cadeau')], ['Cadeau à rouvrir', () => act('lab.boutique', { cadeau: true })]]),
  group('Sa garde-robe', [['Tout enlever', () => act('boutique.retirer')], ['Garde-robe vide', () => act('lab.boutique', { vide: true })],
    ['Le plateau du Pi', () => { act('screen.show', { screen: 'visage' }); setTimeout(() => BT && BT.open(), 120); }]]),
  group('Ses réactions', [['Nouvel accessoire', play('boutique-achat', SAMPLE)], ['Devant le miroir', play('boutique-porte', SAMPLE)], ['Il range', play('boutique-retire', SAMPLE)], ['Le cadeau', play('boutique-cadeau', { n: 5 })]]),
  el('p', 'note', 'Touche un accessoire : Pixel l’essaie quelques secondes ; touche encore pour l’acheter avec ses pièces. Un accessoire à lui : une touche le met ou l’enlève. Sur l’écran, le petit chapeau sur le bord gauche, en bas, ouvre le plateau, comme sur le Pi. Les pièces se gagnent avec les exos, les repas, le minuteur et le cadeau du jour.'));
const before = $('hExos') && $('hExos').closest('section');                      // after « Nourrir », before « Exos de maths »
if (before) before.before(sec); else $('panel').append(sec);
let painted = '';
function render() {
  const b = hub.S.boutique, th = hub.S.view.theme, t = hub.ALLT.find(x => x.id === th) || hub.ALLT[0];
  if (t && t.c && painted !== th) { painted = th; menu.style.setProperty('--bl-bg', t.c.bg); icons.forEach(c => WR.icon(c, c.parentElement.dataset.item, t.c)); }
  if (!b) { state.textContent = 'Pas de boutique sur ce Pixel.'; return; }
  const name = id => (WR.BY[id] ? WR.BY[id].label : '—'), worn = Object.values(b.porte || {});
  state.textContent = `${b.pieces} pièce${b.pieces > 1 ? 's' : ''}. Il porte : ${worn.map(name).join(', ') || 'rien'}. À lui : ${(b.possede || []).map(name).join(', ') || 'rien encore'}. Cadeau du jour : ${b.cadeau ? 'à ouvrir' : 'ouvert'}.`;
  menu.querySelectorAll('button').forEach(x => x.classList.toggle('fav', worn.includes(x.dataset.item)));
}
let seen = '';
setInterval(() => { const k = JSON.stringify([hub.S.boutique, hub.S.view.theme]); if (k !== seen) { seen = k; render(); } }, 400);
render();
{                                          // the commands to type (« Commandes à taper »), as nourrir-lab.js does
  const ul = document.querySelector('section[aria-labelledby="hHelp"] .cmds');
  if (ul) for (const [c, d] of [['boutique', 'ses pièces, sa tenue'], ['achète le bonnet', 'il l’achète et le met'], ['mets les lunettes', 'il les porte'], ['enlève tout', 'il range tout'], ['cadeau', 'le cadeau du jour']]) { const li = document.createElement('li'), k = document.createElement('code'), s = document.createElement('span'); k.textContent = c; s.textContent = d; li.append(k, s); ul.append(li); }
}
})();
