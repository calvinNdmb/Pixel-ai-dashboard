/* Pixel Lab: his character (../caractere.js). A « Caractère » panel, after « Personnalité »: the presets, the sliders, his name
   and yours, his habits, « Essayer » and « Réinitialiser », through the fake server (demo-hub.js mirrors pixel/caractere.py).
   He changes for real: touch him, pester him, pet him, leave him alone, and watch « Personnalité » (annoyance, cuddles). */
(() => {
const CAR = window.PixelCaractere, hub = window.PixelHub, $ = id => document.getElementById(id);
const after = document.querySelector('section[aria-labelledby="hPerso"]');
if (!CAR || !hub || !after || !hub.S.caractere) return;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const sec = el('section', 'grp car-lab'), h = el('h2', null, 'Caractère'), note = el('p', 'note'), body = el('div');
h.id = 'hCaractere'; sec.setAttribute('aria-labelledby', 'hCaractere'); sec.id = 'caractere';
note.textContent = 'Son caractère change vraiment son comportement : touche-le, embête-le, caresse-le, laisse-le vivre. À 50 partout, c’est le Pixel de tous les jours.';
sec.append(h, note, body); after.after(sec);
const toVisage = () => { const P = hub.S; if (P.screen !== 'visage') hub.dispatch('screen.show', { screen: 'visage' }); };
const ui = CAR.build(body, { send: (action, args) => { if (window.Screens) Screens.local.sleepy = false; toVisage(); hub.dispatch(action, args); } });
hub.listen(s => ui.render(s.caractere));
const per = window.Screens && Screens.persona, state = el('p', 'note car-lab-k');
body.append(state);
setInterval(() => {                                    // what the traits do right now (persona.js knobs)
  if (!per || !per.caractere) return;
  const k = per.caractere.k, f = v => '×' + (Math.round(v * 100) / 100).toString().replace('.', ',');
  const t = `Agacement ${f(k.annoy)} · bouderie ${k.sulk ? (k.sulk > 0 ? '+' : '−') + Math.round(Math.abs(k.sulk) / 1000) + ' s' : '='} · câlins ${f(k.love)} · moments de vie ${f(1 / k.life)} · vitesse ${f(k.speed)}${k.deaf ? ` · ignore ${Math.round(k.deaf * 100)} % des événements` : ''}`;
  if (state.textContent !== t) state.textContent = t;
}, 500);
if ($('hHelp')) {                                      // the commands to type
  const ul = document.querySelector('section[aria-labelledby="hHelp"] .cmds');
  if (ul) for (const [c, d] of [['sois grognon', 'un autre caractère'], ['plus câlin', 'un trait de plus'], ['appelle-toi Bip', 'son nom']]) { const li = el('li'); li.append(el('code', null, c), el('span', null, d)); ul.append(li); }
}
})();
