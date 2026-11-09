/* Pixel Lab: his memories, his album and your mood journal (../souvenirs.js, ../album.js; demo-hub.js runs their rules). A
   « Souvenirs » panel after « Exos de maths »: today a party (your birthday, a year or months since you met), a photo (he
   poses, the flash; an automatic one), the album on his screen, the mood question now and each answer, yesterday's mood
   (he asks about it the next day), a memory told, his question « C'est quand ton anniversaire ? », a memory from another
   feature. The photos stay in this page (in memory). */
(() => {
const $ = id => document.getElementById(id), hub = window.PixelHub, SV = window.PixelSouvenirs, AL = window.PixelAlbum;
if (!hub || !SV || !$('panel') || !hub.S.souvenirs) return;
const L = typeof Screens !== 'undefined' ? Screens.local : null;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const touch = () => { if (!L) return; L.sleepy = false; L.lastInput = performance.now(); if (window.PixelClock) L.inputAt = window.PixelClock.real(); };
const act = (action, args) => () => { touch(); if (hub.S.screen !== 'visage') hub.dispatch('screen.show', { screen: 'visage' }); hub.dispatch(action, args || {}); };
const group = (title, list) => {
  const box = el('div', 'ev'), btns = el('div', 'btns');
  for (const [label, fn] of list) { const b = el('button', null, label); b.type = 'button'; b.addEventListener('click', () => { fn(); setTimeout(render, 80); }); btns.append(b); }
  box.append(el('h3', null, title), btns); return box;
};
const party = quoi => () => {                          // today a celebration: the screen plays it now, as it would when you come
  touch(); hub.dispatch('lab.souvenirs', { quoi }); if (hub.S.screen !== 'visage') hub.dispatch('screen.show', { screen: 'visage' });
  setTimeout(() => { try { localStorage.removeItem('pixel.souvenirs.fete-' + (quoi === 'anniversaire' ? 'anniversaire' : 'rencontre')); localStorage.removeItem('pixel.souvenirs.mois'); } catch { /* none */ } touch(); if (typeof Screens !== 'undefined') Screens.persona.stop(); SV.step(true); }, 150);
};
const sec = el('section', 'grp souv-lab'); sec.setAttribute('aria-labelledby', 'hSouvenirs'); sec.id = 'souvenirs';
const h2 = el('h2', null, 'Souvenirs'); h2.id = 'hSouvenirs';
const state = el('p', 'note'); state.id = 'souvLabState';
const thumbs = el('div', 'btns'); thumbs.id = 'souvLabPhotos'; thumbs.setAttribute('aria-label', 'Les photos de son album');
sec.append(h2, el('p', 'note', 'Ses souvenirs, son album photo et ton carnet d’humeur. Sur le vrai Pixel, c’est l’écran du Pi qui prend les photos ; ici, elles restent dans la page.'),
  group('Les fêtes', [['Ton anniversaire aujourd’hui', party('anniversaire')], ['Un an depuis votre rencontre', party('rencontre-an')], ['Des mois ensemble', party('mois')],
    ['Rejouer la fête', act('souvenirs.fete')]]),
  group('L’album', [['Prends une photo', act('album.photo')], ['Montre l’album', act('album.montre')], ['Une photo automatique', () => { touch(); if (AL) AL.snap('record'); }]]),
  thumbs,
  group('Le carnet d’humeur', [['Il demande maintenant', act('lab.souvenirs', { quoi: 'question' })],
    ...SV.rules.MOODS.map(([m, label, emo]) => [`${emo} ${label}`, act('humeur.note', { m })]),
    ['Hier : triste et fatigué', () => { touch(); hub.dispatch('lab.souvenirs', { quoi: 'hier' }); try { localStorage.removeItem('pixel.souvenirs.hier'); } catch { /* none */ } setTimeout(() => { touch(); if (typeof Screens !== 'undefined') Screens.persona.stop(); SV.step(true); }, 150); }],
    ['Effacer le carnet', act('humeur.efface')]]),
  group('Ses souvenirs', [['Il raconte un souvenir', act('souvenirs.raconte')], ['Il demande ton anniversaire', () => { act('lab.souvenirs', { quoi: 'demande' })(); setTimeout(() => SV.ask(), 120); }],
    ['Une visite (un autre module)', act('souvenirs.ajoute', { type: 'ami', texte: 'Bip, le Pixel de Léa, est venu me voir !' })], ['Tout oublier', act('lab.souvenirs', { quoi: 'oublie' })]]),
  state);
const exo = $('hExos') && $('hExos').closest('section');
if (exo) exo.after(sec); else $('panel').append(sec);
let shown = '';
function render() {
  const s = hub.S.souvenirs, h = hub.S.humeur, a = hub.S.album; if (!s) return;
  const t = `Anniversaire : ${s.anniv ? s.anniv_texte + (s.anniv_dans ? ` (dans ${s.anniv_dans} j)` : ' (aujourd’hui !)') : 'pas encore noté'} · rencontre : ${s.rencontre} (${s.depuis} j)`
    + `${s.fete ? ' · fête : ' + s.fete : ''} · souvenirs : ${s.timeline.length} · photos : ${a ? a.photos.length : 0}`
    + ` · humeur du jour : ${h && h.aujourdhui ? h.aujourdhui.m : '—'}${h && h.question ? ' (il demande)' : ''}.`;
  if (state.textContent !== t) state.textContent = t;
  const key = a ? a.photos.map(p => p.id + p.fav).join() : '';
  if (key !== shown) {
    shown = key;
    thumbs.replaceChildren(...(a ? a.photos.slice(0, 12) : []).map(p => { const im = el('img'); im.src = p.src; im.alt = 'Une photo de Pixel'; im.width = 80; im.height = 48; im.style.cssText = 'border-radius:4px;object-fit:cover;border:2px solid currentColor'; return im; }));
  }
}
hub.listen(render);
{                                          // the commands to type (« Commandes à taper »)
  const ul = document.querySelector('section[aria-labelledby="hHelp"] .cmds');
  if (ul) for (const [c, d] of [['prends une photo', 'il prend la pose'], ['je suis content', 'ton carnet'], ['mon anniversaire c’est le 12 mars', 'il le retient']]) { const li = el('li'); li.append(el('code', null, c), el('span', null, d)); ul.append(li); }
}
})();
