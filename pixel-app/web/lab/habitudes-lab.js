/* Pixel Lab: his habits (../habitudes.js; the fake server demo-hub.js mirrors pixel/habitudes.py). A « Ses habitudes » panel
   after « Exos de maths »: his clock is paused in the lab (he stays awake, as the --demo server), its buttons simulate a time
   of day a few seconds before each moment of his routine (wake-up, nap, bedtime, his teeth, goodnight) or the middle of the
   night; then his games, what makes him laugh, each fear and comforting him, a phrase to teach, and all his settings (the
   phone's panel, ../habitudes.js build()). Its styles are here, so that the one-file lab (tools/build_lab_artifact.py) has them. */
(() => {
const hub = window.PixelHub, PH = window.PixelHabitudes, Sc = typeof Screens !== 'undefined' ? Screens : null, $ = id => document.getElementById(id);
const after = $('hExos') && $('hExos').closest('section');
if (!hub || !PH || !Sc || !after || !hub.S.habitudes) return;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const css = el('style');
css.textContent = `
.hab-lab .hab-body{display:flex;flex-direction:column;gap:8px}
.hab-lab .hab-now{margin:0;color:var(--accent);font-weight:600}
.hab-lab .hab-h{margin:6px 0 0;font:600 12px/1.2 var(--f-ui);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.hab-lab .hab-note{margin:0;font-size:12px;line-height:1.3;color:var(--muted)}
.hab-lab .hab-sched,.hab-lab .hab-peurs,.hab-lab .hab-exprs{display:flex;flex-direction:column;gap:6px}
.hab-lab .hab-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px}
.hab-lab .hab-time{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--muted)}
.hab-lab select,.hab-lab .hab-teach input{min-height:44px;border:1px solid var(--line);border-radius:9px;background:var(--card-hi);color:var(--ink);padding:0 8px}
.hab-lab .hab-sw{display:grid;grid-template-columns:1fr auto;align-items:center;column-gap:10px;min-height:48px;padding:6px 10px;text-align:left;border:1px solid var(--line);border-radius:10px;background:var(--card-hi);cursor:pointer}
.hab-lab .hab-sw small{grid-column:1;font-size:12px;color:var(--muted);line-height:1.2}
.hab-lab .hab-knob{grid-column:2;grid-row:1/span 2;position:relative;width:40px;height:24px;border-radius:12px;border:1px solid var(--line);background:var(--card)}
.hab-lab .hab-knob::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:var(--muted);transition:transform .15s}
.hab-lab .hab-sw[aria-checked="true"] .hab-knob{background:var(--accent);border-color:var(--accent)}
.hab-lab .hab-sw[aria-checked="true"] .hab-knob::after{transform:translateX(16px);background:var(--accent-ink)}
.hab-lab .hab-btn,.hab-lab .hab-chip,.hab-lab .hab-say,.hab-lab .hab-del,.hab-lab .hab-fav{min-height:44px;min-width:44px;padding:0 10px;border:1px solid var(--line);border-radius:9px;background:var(--card-hi);cursor:pointer}
.hab-lab .hab-chips{display:flex;flex-wrap:wrap;gap:6px}
.hab-lab .hab-chip[aria-pressed="true"],.hab-lab .hab-fav[aria-pressed="true"],.hab-lab .hab-play,.hab-lab .hab-learn,.hab-lab .hab-wake{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.hab-lab .hab-jeux{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:6px}
.hab-lab .hab-jeu{display:flex;flex-direction:column;gap:4px;padding:8px;border:1px solid var(--line);border-radius:10px;background:var(--card-hi)}
.hab-lab .hab-jeu-top{display:flex;align-items:center;justify-content:space-between;gap:6px}.hab-lab .hab-jeu-name{font-size:14px}
.hab-lab .hab-ic{width:22px;height:22px;image-rendering:pixelated}.hab-lab .hab-rec{font-size:12px;color:var(--muted)}
.hab-lab .hab-courage{height:8px;border-radius:4px;border:1px solid var(--line);overflow:hidden}.hab-lab .hab-courage i{display:block;height:100%;background:var(--accent)}
.hab-lab .hab-courage-t,.hab-lab .hab-msg{font-size:12px;color:var(--accent)}
.hab-lab .hab-teach{display:grid;grid-template-columns:1fr 1fr auto;gap:6px}.hab-lab .hab-msg{grid-column:1/-1;margin:0}
.hab-lab .hab-expr{padding:6px 8px;border:1px solid var(--line);border-radius:10px;background:var(--card-hi)}.hab-lab .hab-expr-t{font-size:12px;color:var(--muted)}
.hab-lab .hab-said{display:flex;flex-direction:column;gap:4px;margin:4px 0 0;padding:0;list-style:none}.hab-lab .hab-said li{display:flex;gap:4px}
.hab-lab .hab-say{flex:1;text-align:left}.hab-lab .hab-none{font-size:12px;color:var(--muted)}
.hab-lab details{border:1px solid var(--line);border-radius:10px;padding:6px 10px;background:var(--card)}.hab-lab summary{cursor:pointer;font-weight:600}
.car-lab .car-hab{min-height:44px;padding:0 10px;border:1px solid var(--accent);border-radius:9px;background:var(--card-hi);color:var(--ink);cursor:pointer}`;
document.head.append(css);
const act = (action, args) => hub.dispatch(action, args || {});
const L = Sc.local, PER = Sc.persona;
const face = () => { if (hub.S.screen !== 'visage') act('screen.show', { screen: 'visage' }); };
const wakeLab = () => { L.lastInput = performance.now(); if (window.PixelClock) L.inputAt = window.PixelClock.real(); };
const H = () => hub.S.habitudes;
const hhmm = m => `${Math.floor(((m % 1440) + 1440) % 1440 / 60)}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`;
const sim = (min, avant = 0) => () => { face(); wakeLab(); act('habitudes.demo', { heure: hhmm(min()), avant }); };
const sec = el('section', 'grp hab-lab'), h2 = el('h2', null, 'Ses habitudes'), state = el('p', 'note');
h2.id = 'hHabitudes'; sec.setAttribute('aria-labelledby', 'hHabitudes'); state.id = 'habLabState';
const group = (title, list) => {
  const box = el('div', 'ev'), btns = el('div', 'btns');
  for (const [label, fn, id] of list) { const b = el('button', null, label); b.type = 'button'; if (id) b.id = id; b.addEventListener('click', () => { fn(b); setTimeout(render, 80); }); btns.append(b); }
  box.append(el('h3', null, title), btns); return box;
};
const nap = () => { const h = H().horaires; if (!h.sieste) act('habitudes.horaires', { sieste: { de: 13 * 60 + 30, duree: 60 } }); return (H().horaires.sieste || { de: 810 }).de; };
sec.append(h2, state, el('p', 'note', 'Dans le labo, son horloge est en pause : il reste réveillé. Ces boutons font comme s’il était quelques secondes avant un moment de sa journée.'),
  group('Son heure', [['Horloge en pause', () => act('habitudes.demo', { heure: null })], ['Réveil dans 5 s', sim(() => H().horaires.reveil, 5)], ['10 h', sim(() => 600)],
    ['Sieste dans 5 s', sim(nap, 5)], ['Coucher dans 5 s', sim(() => H().horaires.coucher - 15, 5)], ['Les dents dans 5 s', sim(() => H().horaires.coucher - 8, 5)],
    ['Bonne nuit dans 5 s', sim(() => H().horaires.coucher, 5)], ['Minuit', sim(() => 0)]]),
  group('Ses jeux', [...Object.entries(PH.JEUX).map(([id, name]) => [name, () => { face(); wakeLab(); act('habitudes.demo', { heure: H().horloge.pause ? null : '10:00' }); act('habitudes.stop'); act('habitudes.jouer', { jeu: id, par: 'labo' }); }]),
    ['Il propose un jeu', () => { face(); act('habitudes.stop'); L.sleepy = false; L.local = null; PER.play('jeu-envie'); }], ['Arrêter', () => act('habitudes.stop')]]),
  group('Ce qui le fait rire', [['Une blague', () => { face(); act('habitudes.rire', { kind: 'blague' }); }], ['Une grimace', () => { face(); act('habitudes.rire', { kind: 'grimace' }); }],
    ['Un bruit rigolo', () => { face(); act('habitudes.rire', { kind: 'bruit' }); }], ['Les chatouilles', () => { face(); Sc.event('rire-chatouilles', { fou: false }, true); }],
    ['Le fou rire', () => { face(); Sc.event('rire-chatouilles', { fou: true }, true); }]]),
  group('Ses peurs', [['L’orage', () => { face(); act('habitudes.peur', { kind: 'orage' }); }], ['Météo : orage', () => act('lab.weather', { kind: 'orage' })],
    ['Le noir', () => { face(); act('lights.set', { room: '*', on: false }); }], ['Rallumer', () => act('lights.set', { room: '*', on: true })],
    ['Une araignée', () => { face(); L.sleepy = false; PER.play('peur-araignee'); }], ['Le vide', () => { face(); Sc.event('poche-glisse', { side: 1 }, true); }],
    ['Le rassurer', () => PER.pet()]]),
  group('Ses phrases', [['Apprends « Salut les loulous ! »', () => { face(); act('habitudes.apprendre', { moment: 'bonjour', phrase: 'Salut les loulous !' }); }],
    ['Il la dit', () => { face(); const p = (H().expressions.bonjour || [])[0]; if (p) act('habitudes.dire', { moment: 'bonjour', phrase: p }); }],
    ['Bonjour, à sa façon', () => { face(); const s = PH.screen; if (s) s.sayOwn(true); PER.play('bonjour'); if (s) s.sayOwn(false); }]]));
const det = el('details'), body = el('div');
det.append(el('summary', null, 'Ses réglages (le panneau du téléphone)'), body); sec.append(det);
const ui = PH.build(body, { send: (a, x) => { face(); act(a, x); } });
after.after(sec);
const NOM = { eveille: 'réveillé', reveil: 'il se réveille', sieste: 'fait la sieste', coucher: 'se prépare pour la nuit', nuit: 'dort' };
function render() {
  const h = H(); if (!h) return;
  const t = new Date(Date.now() + (h.horloge.decalage || 0)), g = h.partie;
  const txt = `Il ${h.etat === 'eveille' ? 'est réveillé' : NOM[h.etat]}${h.horloge.pause ? ' · horloge en pause' : ` · heure simulée ${t.getHours()} h ${String(t.getMinutes()).padStart(2, '0')}`}`
    + ` · jeux préférés : ${h.jeux.favoris.map(j => PH.JEUX[j]).join(' et ')}${g ? ` · partie de ${PH.JEUX[g.jeu]} (${g.etat === 'fin' ? 'finie' : g.phase})` : ''}`
    + ` · courage : ${Object.entries(h.peurs).map(([k, v]) => `${k} ${v.courage}`).join(', ')}.`;
  if (state.textContent !== txt) state.textContent = txt;
  ui.render(h);
}
hub.listen(render);
setInterval(render, 1000);
{                                          // the commands to type (« Commandes à taper »), as caractere-lab.js does
  const ul = document.querySelector('section[aria-labelledby="hHelp"] .cmds');
  if (ul) for (const [c, d] of [['on joue ?', 'un de ses jeux'], ['raconte une blague', 'une blague'], ['dis bonjour comme ça : Salut !', 'sa phrase à lui']]) { const li = el('li'); li.append(el('code', null, c), el('span', null, d)); ul.append(li); }
}
})();
