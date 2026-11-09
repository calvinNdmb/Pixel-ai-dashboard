/* Pixel Lab: the math exercises (../exos.js draws them on the screen, demo-hub.js mirrors pixel/exos.py). Start each mode or
   kind at a chosen level, answer right or wrong without searching, ask for the hint, skip, stop; switch on « Il te propose des
   questions » and make him offer one now (his moment of life exo-envie). On the screen, touch an answer, or type the number on
   the keyboard and press Entrée; the command bar knows « exo », « table de 7 », « défi chrono », « une énigme », « mes scores ». */
(() => {
const $ = id => document.getElementById(id), hub = window.PixelHub, L = typeof Screens !== 'undefined' ? Screens.local : null;
if (!hub || !L || !$('exosModes')) return;
const touch = () => { L.lastInput = performance.now(); if (window.PixelClock) L.inputAt = window.PixelClock.real(); };
let level = null;                                         // the level of the next one: null = his own (it adapts)
const start = args => () => { touch(); hub.dispatch('exos.nouveau', { ...args, ...(level ? { niveau: level } : {}) }); };
const act = (action, args) => () => { touch(); hub.dispatch(action, args || {}); };
function button(label, fn, cls) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (cls) b.className = cls; b.addEventListener('click', fn); return b; }
$('exosModes').append(button('Un exo', start({ mode: 'exo' })), button('Série de 5', start({ mode: 'serie', n: 5 })), button('Table de 7', start({ mode: 'table', table: 7 })),
  button('Défi chrono', start({ mode: 'chrono' })), button('Une énigme', start({ kind: 'enigme' })));
const st0 = hub.S.exos || {};
for (const k of st0.kinds || []) $('exosKinds').append(button(k.label, start({ kind: k.id }), 'chip'));
const lv = $('exosLevel');
for (const [v, t] of [[null, 'Le sien'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']]) {
  const b = button(t, () => { level = v; sync(); }); b.dataset.level = v == null ? '' : String(v); if (v) b.setAttribute('aria-label', 'Niveau ' + v); lv.append(b);
}
$('exosAnswer').append(button('Bonne réponse', act('lab.exos', { juste: true })), button('Mauvaise réponse', act('lab.exos', { juste: false })),
  button('Indice', act('exos.indice')), button('Passer', act('exos.passer')), button('Arrêter', act('exos.stop')));
const propose = button('Il te propose des questions', () => { touch(); const g = (hub.S.exos || {}).reglages || {}; hub.dispatch('exos.reglages', { propose: !g.propose }); });
const now = button('Il en propose une maintenant', () => {
  touch(); const PER = Screens.persona; if (!PER) return;
  if (hub.S.screen !== 'visage') hub.dispatch('screen.show', { screen: 'visage' });
  hub.dispatch('exos.stop'); L.sleepy = false; L.local = null; PER.play('exo-envie');
});
$('exosOffer').append(propose, now);
function sync() { for (const b of lv.children) b.setAttribute('aria-pressed', String(b.dataset.level === (level == null ? '' : String(level)))); }
function render(s) {
  const E = s.exos; if (!E) return;
  const g = E.reglages, st = E.stats, c = E.cur;
  propose.setAttribute('aria-pressed', String(!!g.propose));
  const on = c ? (c.etat === 'bilan' ? `bilan ${c.bons}/${c.total}` : `${c.type}, niveau ${c.niveau}${c.n > 1 ? `, ${c.i}/${c.n}` : ''}${c.mode === 'chrono' ? ', défi chrono' : ''}`) : 'aucun';
  const t = `En cours : ${on}. Aujourd’hui : ${st.aujourdhui}/${st.objectif}${st.fait ? ' (objectif atteint)' : ''} · série ${st.serie} · record chrono ${st.record_chrono} · son niveau ${E.niveau} · trophées ${st.trophees.length}/${(E.trophees || []).length}.`;
  if ($('exosState').textContent !== t) $('exosState').textContent = t;
}
sync();
hub.listen(render);
{                                          // the commands to type (« Commandes à taper »), as caractere-lab.js does
  const ul = document.querySelector('section[aria-labelledby="hHelp"] .cmds');
  if (ul) for (const [c, d] of [['exo', 'un exo de maths'], ['table de 7', 'une table'], ['42', 'la réponse, un exo ouvert']]) { const li = document.createElement('li'), k = document.createElement('code'), s = document.createElement('span'); k.textContent = c; s.textContent = d; li.append(k, s); ul.append(li); }
}
})();
