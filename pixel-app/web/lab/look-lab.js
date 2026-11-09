/* Pixel Lab: his look (../look.js; the fake server demo-hub.js mirrors pixel/look.py). A « Son look » panel after « Exos de
   maths »: the phone's panel (his eyes, colours, accessories, ready-made outfits, the seasons, « Remettre comme avant »), on
   the lab's own screen, and the lab's buttons: pretend another day (Halloween, Christmas, New Year, winter, summer, his
   birthday) or the night (as if his habits said he sleeps), and a tour of every eye shape and every accessory. */
(() => {
const LOOK = window.PixelLook, hub = window.PixelHub, $ = id => document.getElementById(id);
if (!LOOK || !hub || !$('panel') || !hub.S.look) return;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const sec = el('section', 'grp look-lab'), h2 = el('h2', null, 'Son look'), body = el('div');
h2.id = 'hLook'; sec.setAttribute('aria-labelledby', 'hLook'); sec.id = 'look';
sec.append(h2, el('p', 'note', 'La forme de ses yeux, ses couleurs, ce qu’il porte : touche, et il le montre tout de suite sur l’écran. Ce que tu choisis passe avant les tenues de saison. La nuit, il met son pyjama.'), body);
const after = $('hExos') && $('hExos').closest('section');
if (after) after.after(sec); else $('panel').append(sec);
const toVisage = () => { if (window.Screens) Screens.local.sleepy = false; if (hub.S.screen !== 'visage') hub.dispatch('screen.show', { screen: 'visage' }); };
const ui = LOOK.build(body, { send: (action, args) => { toVisage(); hub.dispatch(action, args); }, preview: false });
hub.listen(s => ui.render(s.look, s.view && s.view.theme, s.view && s.view.face));
/* the lab's own: another day, the night, a tour */
const box = (title, list) => {
  const d = el('div', 'ev'), b = el('div', 'btns');
  for (const [label, fn, id] of list) { const x = el('button', null, label); x.type = 'button'; if (id) x.id = id; x.addEventListener('click', () => { fn(x); paint(); }); b.append(x); }
  d.append(el('h3', null, title), b); return d;
};
const y = new Date().getFullYear(), day = (date, fete = null) => () => { toVisage(); hub.dispatch('lab.look', { date, fete }); };
let tour = null;
function step(list, i, every) { if (!tour) return; toVisage(); hub.dispatch('look.set', list[i % list.length]); tour.i = i + 1; tour.t = setTimeout(() => step(list, i + 1, every), every); }
const stopTour = () => { if (tour) clearTimeout(tour.t); tour = null; };
const tourOf = (name, list) => b => { if (tour && tour.name === name) { stopTour(); return; } stopTour(); tour = { name, i: 0 }; step(list, 0, 2600); };
sec.append(
  box('Un autre jour', [['Aujourd’hui', day(null)], ['Halloween', day(`${y}-10-31T15:00`)], ['Noël', day(`${y}-12-24T11:00`)], ['Nouvel An', day(`${y + 1}-01-01T11:00`)],
    ['L’hiver', day(`${y + 1}-01-20T11:00`)], ['L’été', day(`${y + 1}-07-14T14:00`)], ['Son anniversaire', day(null, 'anniversaire')]]),
  box('La nuit', [['Il dort', b => { toVisage(); hub.dispatch('lab.look', { dort: b.getAttribute('aria-pressed') !== 'true' ? true : null }); }, 'lookLabNuit']]),
  box('Tout voir', [['Tous les yeux', tourOf('yeux', LOOK.SHAPES.map(([id]) => ({ yeux: id }))), 'lookLabYeux'],
    ['Tous les accessoires', tourOf('acc', LOOK.ITEMS.map(([id]) => ({ normal: true, porte: id }))), 'lookLabAcc'], ['Arrêter', () => stopTour()]]),
  el('p', 'note', 'Tape aussi « mets ton chapeau », « yeux de chat », « joues roses », « arc-en-ciel », « enlève tout », « look normal », « habille-toi pour l’hiver ».'));
function paint() {
  const n = $('lookLabNuit'); if (n) n.setAttribute('aria-pressed', String(!!(hub.S.look.porte && hub.S.look.porte.nuit)));
  for (const [id, name] of [['lookLabYeux', 'yeux'], ['lookLabAcc', 'acc']]) { const b = $(id); if (b) b.setAttribute('aria-pressed', String(!!tour && tour.name === name)); }
}
setInterval(paint, 600); paint();
{                                          // the commands to type (« Commandes à taper »), as caractere-lab.js does
  const ul = document.querySelector('section[aria-labelledby="hHelp"] .cmds');
  if (ul) for (const [c, d] of [['mets ton chapeau', 'son look'], ['yeux de chat', 'ses yeux'], ['look normal', 'comme d’habitude']]) { const li = el('li'); li.append(el('code', null, c), el('span', null, d)); ul.append(li); }
}
})();
