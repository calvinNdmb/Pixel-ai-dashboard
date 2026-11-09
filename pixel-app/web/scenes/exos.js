/* Scene pack « exos » — Pixel gives little math exercises (pixel/exos.py, web/exos.js) and reacts to your answers.
   See the top of web/persona.js: scenes are defined with S('id', 'Label', 'group', { ... }) on one line each
   (pixel/scenes.py reads them), groups tap / fache / calin / retour / vie / evt, plus "on" (events) and "pool" (touch pools).
   The events come from the server's "exos.ev" (web/exos.js): exo-propose (a question starts), exo-juste (data.essai 1 or 2),
   exo-faux (essai 1: a hint and a second try; 2: the correction), exo-serie (data.n right in a row, or data.fin: the end of a
   series or of the challenge, with bons / total / chrono / record), exo-objectif (the daily goal), exo-attente (you think a long
   while: a gentle nudge, never a scolding). They play on his small face beside the question, or on his big face.
   exo-envie is a moment of life: in the day, now and then, he offers « Une petite question ? » (only when the setting is on:
   web/exos.js canPropose); web/exos.js shows the « Oui » and « Plus tard » buttons while it plays. His character's studieux
   trait (0..100, 50 by default) makes him offer more often and cheer bigger (exo-feu). */
(window.PixelScenePacks ||= []).push(({ S, L, pick, sm, out, seg, bump, jumps, rnd, prop }) => {
const EX = () => (typeof window !== 'undefined' && window.PixelExos) || null;     // web/exos.js, when it is loaded
const studieux = () => { const x = EX(); return x && x.trait ? x.trait('studieux') : 50; };

// ---- the props: a slate, a tick, a cup, a light bulb, a question mark, confetti, a badge ----
prop('exoArdoise', (D, e, q, text = '?') => {       // a little school slate he holds by his side, a sum in chalk
  if (q <= 0) return;
  const { g, U, col, lw, glyph } = D, o = D.P(84, 36), s = 0.55 + 0.45 * out(q), w = 22 * U * s, h = 15 * U * s;
  const x = o.x - w / 2, y = o.y - h / 2 + Math.sin(e / 500) * 0.6 * U;
  g.globalAlpha = Math.min(1, q * 1.6);
  g.fillStyle = col.dim; g.fillRect(x - 1.3 * U * s, y - 1.3 * U * s, w + 2.6 * U * s, h + 2.6 * U * s);   // the wooden frame
  g.fillStyle = col.bg; g.fillRect(x, y, w, h);                                                             // the board
  g.strokeStyle = col.fg; g.lineWidth = lw(0.5 * U); g.strokeRect(x, y, w, h);
  glyph(text, x + w / 2, y + h / 2 + 0.4 * U, 8 * U * s, col.hi);
  g.globalAlpha = 1;
});
prop('exoCoche', (D, e, q) => {                     // a big tick pops up by his head
  if (q <= 0) return;
  const { g, U, col, lw } = D, o = D.P(86, 10), s = U * (0.5 + 0.5 * out(q)) * (1 + 0.08 * Math.sin(e / 120));
  g.globalAlpha = Math.min(1, q * 2); g.strokeStyle = col.hi; g.lineWidth = lw(2.2 * s); g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(o.x - 4.5 * s, o.y); g.lineTo(o.x - 1.3 * s, o.y + 3.4 * s); g.lineTo(o.x + 5 * s, o.y - 4.6 * s); g.stroke();
  g.globalAlpha = 1;
});
prop('exoCoupe', (D, e, q) => {                     // a golden cup by his side, sparkling
  if (q <= 0) return;
  const { g, U, col, lw } = D, o = D.P(11, 24), s = U * (0.5 + 0.5 * out(q)), x = o.x, y = o.y - 2 * U * out(q) + Math.sin(e / 400) * 0.5 * U;
  g.globalAlpha = Math.min(1, q * 2); g.fillStyle = col.acc;
  g.beginPath(); g.moveTo(x - 5 * s, y - 5 * s); g.lineTo(x + 5 * s, y - 5 * s); g.quadraticCurveTo(x + 5 * s, y + 2 * s, x, y + 3 * s); g.quadraticCurveTo(x - 5 * s, y + 2 * s, x - 5 * s, y - 5 * s); g.fill();
  g.fillRect(x - 0.9 * s, y + 2.5 * s, 1.8 * s, 2.6 * s); g.fillRect(x - 3.2 * s, y + 5 * s, 6.4 * s, 1.5 * s);   // the stem, the base
  g.strokeStyle = col.acc; g.lineWidth = lw(1.1 * s);
  for (const sd of [-1, 1]) { g.beginPath(); g.arc(x + sd * 5 * s, y - 2.6 * s, 1.9 * s, -Math.PI / 2, Math.PI / 2, sd < 0); g.stroke(); }   // the handles
  g.fillStyle = col.hi; g.fillRect(x - 3.3 * s, y - 4 * s, 1.1 * s, 3.4 * s);                                         // a shine
  for (let i = 0; i < 3; i++) { const a = e / 500 + i * 2.1; D.star(x + Math.cos(a) * 8 * s, y - s + Math.sin(a) * 5 * s, 1.3 * s * (0.6 + 0.4 * Math.sin(e / 150 + i)), col.hi, a); }
  g.globalAlpha = 1;
});
prop('exoAmpoule', (D, e, q) => {                   // a light bulb above his head that lights up: an idea, a hint
  if (q <= 0) return;
  const { g, U, col, lw } = D, o = D.P(82, 5), lit = e > 350, s = U * (0.6 + 0.4 * out(q));
  g.globalAlpha = Math.min(1, q * 2);
  g.fillStyle = lit ? col.acc : col.dim; g.beginPath(); g.arc(o.x, o.y, 3.2 * s, 0, Math.PI * 2); g.fill();
  g.fillStyle = col.dim; g.fillRect(o.x - 1.6 * s, o.y + 2.6 * s, 3.2 * s, 2.2 * s);
  if (lit) { g.strokeStyle = col.acc; g.lineWidth = lw(0.6 * s); g.lineCap = 'round'; for (let i = 0; i < 7; i++) { const a = Math.PI * (1.05 + i * 0.15), r0 = 4.4 * s, r1 = (5.8 + 0.6 * Math.sin(e / 90 + i)) * s; g.beginPath(); g.moveTo(o.x + Math.cos(a) * r0, o.y + Math.sin(a) * r0); g.lineTo(o.x + Math.cos(a) * r1, o.y + Math.sin(a) * r1); g.stroke(); } }
  g.globalAlpha = 1;
});
prop('exoPoint', (D, e, q) => {                     // a big question mark bobbing by his head
  if (q <= 0) return;
  const o = D.P(86, 9); D.g.globalAlpha = Math.min(1, q * 2);
  D.glyph('?', o.x, o.y + Math.sin(e / 260) * 1.2 * D.U, 11 * D.U * (0.6 + 0.4 * out(q)), D.col.acc);
  D.g.globalAlpha = 1;
});
prop('exoConfettis', (D, e, q) => {                 // confetti falling all around him
  if (q <= 0) return;
  const { g, U, col } = D, c = D.at('c'), cs = [col.acc, col.pink, col.hi, col.fg];
  g.globalAlpha = q;
  for (let i = 0; i < 18; i++) {
    const k = ((e / 1500) + i * 0.137) % 1, x = c.x + (((i * 53) % 100) - 50) * 0.9 * U + Math.sin(e / 240 + i) * 2 * U, y = c.y - 34 * U + k * 64 * U;
    g.fillStyle = cs[i % cs.length]; const w = (i % 2 ? 1.6 : 1) * U, h = (i % 2 ? 0.9 : 1.6) * U * (0.5 + 0.5 * Math.abs(Math.sin(e / 160 + i)));
    g.fillRect(x - w / 2, y - h / 2, w, h);
  }
  g.globalAlpha = 1;
});
prop('exoBadge', (D, e, q, n) => {                  // a round badge with his streak
  if (q <= 0) return;
  const { g, U, col, lw } = D, o = D.P(84, 9), r = 5.5 * U * (0.5 + 0.5 * out(q)) * (1 + 0.05 * Math.sin(e / 140));
  g.globalAlpha = Math.min(1, q * 2); g.fillStyle = col.acc; g.beginPath(); g.arc(o.x, o.y, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = col.fg; g.lineWidth = lw(0.6 * U); g.beginPath(); g.arc(o.x, o.y, r * 0.82, 0, Math.PI * 2); g.stroke();
  D.glyph(String(n), o.x, o.y + 0.3 * U, r * 1.05, col.bg);
  g.globalAlpha = 1;
});

// ---- a question starts, the answers ----
S('exo-question', 'Une question !', 'evt', { dur: 2600, on: ['exo-propose'], urgent: true, anim: [[0, 'idee'], [1300, 'ecoute']], mood: 'excite', say: [[150, 2400, L('À toi de jouer !', 'Une question !', 'Prêt ?', 'Réfléchis bien !', 'C’est parti !')]], move: e => ({ y: -16 * bump(seg(e, 0, 600)) }), props: (D, e) => D.exoArdoise(e, seg(e, 0, 300) * (1 - seg(e, 2200, 2600)), '?') });
S('exo-bravo', 'Bravo', 'evt', { dur: 2400, w: 3, on: ['exo-juste'], urgent: true, when: d => d.essai !== 2, anim: [[0, 'succes']], mood: 'excite', say: [[100, 2200, L('Bravo !', 'Exact !', 'Bien joué !', 'Oui !', 'Parfait !', 'Juste !')]], move: e => ({ y: jumps(Math.min(e, 1000), 500, 28) }), props: (D, e) => D.exoCoche(e, seg(e, 0, 250) * (1 - seg(e, 2000, 2400))) });
S('exo-fier', 'Trop fort', 'evt', { dur: 2600, w: 2, on: ['exo-juste'], urgent: true, when: d => d.essai !== 2, anim: [[0, 'fier']], mood: 'fier', say: [[150, 2400, L('Trop fort !', 'Génial !', 'Tu assures !', 'Champion !')]], move: e => ({ r: -0.06 * sm(seg(e, 0, 400)) * (1 - sm(seg(e, 1900, 2600))), y: -8 * bump(seg(e, 0, 700)) }), props: (D, e) => D.stars(e) });
S('exo-feu', 'Feu d’artifice', 'evt', { dur: 3000, w: 2, on: ['exo-juste'], urgent: true, when: d => d.essai !== 2 && rnd() * 100 < studieux(), anim: [[0, 'etoiles']], mood: 'excite', say: [[150, 2800, L('Waouh !', 'Incroyable !', 'Tu es un as !', 'Quel génie !')]], move: e => ({ y: e < 2200 ? jumps(e, 550, 36) : 0 }), props: (D, e) => { D.exoConfettis(e, 1 - seg(e, 2500, 3000)); D.stars(e); } });
S('exo-ouf', 'Bien rattrapé', 'evt', { dur: 2600, w: 6, on: ['exo-juste'], urgent: true, when: d => d.essai === 2, anim: [[0, 'content']], mood: 'content', say: [[150, 2400, L('Bien rattrapé !', 'Voilà, c’est ça !', 'Tu as trouvé !', 'Ouf, bravo !')]], move: e => ({ y: -14 * bump(seg(e, 0, 700)) }), props: (D, e) => D.exoCoche(e, seg(e, 0, 250) * (1 - seg(e, 2200, 2600))) });
S('exo-presque', 'Presque', 'evt', { dur: 3000, w: 2, on: ['exo-faux'], urgent: true, when: d => d.essai !== 2, anim: [[0, 'confus'], [1100, 'idee']], mood: 'confus', say: [[100, 1300, L('Presque !', 'Pas tout à fait…', 'Hmm, non…')], [1400, 2900, L('Regarde l’indice !', 'Un petit indice !', 'Essaie encore !')]], move: e => ({ x: 5 * Math.sin(e / 45) * (1 - seg(e, 0, 500)), y: -10 * bump(seg(e, 1100, 1600)) }), props: (D, e) => { if (e > 1100) D.exoAmpoule(e - 1100, seg(e, 1100, 1400) * (1 - seg(e, 2600, 3000))); } });
S('exo-reessaie', 'Encore un essai', 'evt', { dur: 2800, on: ['exo-faux'], urgent: true, when: d => d.essai !== 2, anim: [[0, 'reflechit']], mood: 'reflechit', say: [[150, 2600, L('Encore un essai !', 'Pas grave, réessaie !', 'Prends ton temps.')]], move: e => ({ r: 0.05 * Math.sin(e / 300) * (1 - seg(e, 2200, 2800)) }), props: (D, e) => D.exoPoint(e, seg(e, 0, 300) * (1 - seg(e, 2400, 2800))) });
S('exo-pasgrave', 'Pas grave', 'evt', { dur: 3600, w: 2, on: ['exo-faux'], urgent: true, when: d => d.essai === 2 || !d.essai, anim: [[0, 'triste'], [1300, 'content']], mood: 'triste', say: [[100, 1300, L('Oups…', 'Raté…', 'Aïe…')], [1400, 3400, L('Pas grave !', 'On apprend !', 'La prochaine !', 'Ça arrive à tout le monde !')]], move: e => ({ y: 10 * sm(seg(e, 0, 500)) * (1 - sm(seg(e, 1200, 1700))) - 12 * bump(seg(e, 1700, 2300)) }), props: (D, e) => { if (e > 1400) D.hearts(e - 1400, 0.5); } });

// ---- streaks, the end of a series, the daily goal, a gentle nudge ----
S('exo-serie', 'Belle série', 'evt', { dur: 4200, on: ['exo-serie'], urgent: true, when: d => !d.fin, anim: [[0, 'etoiles'], [1800, 'danse']], mood: 'excite', say: [[150, 1800, o => `${o.n || 5} d’affilée !`], [1900, 4000, L('Tu es en feu !', 'Quelle série !', 'Rien ne t’arrête !')]], move: e => ({ y: e < 1800 ? jumps(e, 600, 30) : -10 * Math.abs(Math.sin((e - 1800) / 260)) * (1 - seg(e, 3700, 4200)), r: e > 1800 ? 0.1 * Math.sin((e - 1800) / 520) * (1 - seg(e, 3600, 4200)) : 0 }), props: (D, e, p, o) => { D.exoBadge(e, seg(e, 0, 300) * (1 - seg(e, 3800, 4200)), o.n || 5); if (e > 1800) D.stars(e - 1800); } });
S('exo-bilan', 'Série réussie', 'evt', { dur: 4400, on: ['exo-serie'], urgent: true, when: d => !!d.fin && (d.chrono || !d.total || d.bons / d.total >= 0.6), anim: [[0, 'fier'], [2200, 'etoiles']], mood: 'fier', say: [[150, 2100, o => (o.chrono ? `${o.bons || 0} en une minute !` : `${o.bons ?? 5} sur ${o.total || 5} !`)], [2200, 4200, o => (o.record ? 'Nouveau record !' : pick(['Bravo !', 'Super série !', 'Bien joué !']))]], move: e => ({ y: e > 2200 ? jumps(Math.min(e - 2200, 1600), 520, 30) : -10 * bump(seg(e, 0, 700)) }), props: (D, e, p, o) => { D.exoConfettis(e, 1 - seg(e, 3900, 4400)); if (o.record) D.exoCoupe(e, seg(e, 0, 400) * (1 - seg(e, 4000, 4400))); } });
S('exo-courage', 'On recommence ?', 'evt', { dur: 4200, on: ['exo-serie'], urgent: true, when: d => !!d.fin && !d.chrono && d.total > 0 && d.bons / d.total < 0.6, anim: [[0, 'reflechit'], [2000, 'content']], mood: 'content', say: [[150, 1900, o => `${o.bons} sur ${o.total}.`], [2000, 4000, L('C’était dur ! On recommence ?', 'Tu progresses, continue !', 'La prochaine fois, ça ira mieux !')]], move: e => ({ y: -12 * bump(seg(e, 2000, 2600)) }), props: (D, e) => { if (e > 2000) D.hearts(e - 2000, 0.6); } });
S('exo-objectif', 'Objectif du jour', 'evt', { dur: 4800, on: ['exo-objectif'], urgent: true, anim: [[0, 'fier'], [2200, 'danse']], mood: 'fier', say: [[150, 2200, L('Objectif du jour !', 'Objectif atteint !')], [2300, 4600, L('Tu mérites une coupe !', 'Champion du jour !', 'Quelle journée !')]], move: e => ({ y: e < 2200 ? -20 * bump(seg(e, 0, 800)) : -12 * Math.abs(Math.sin((e - 2200) / 260)) * (1 - seg(e, 4200, 4800)), r: e > 2200 ? 0.08 * Math.sin((e - 2200) / 520) * (1 - seg(e, 4200, 4800)) : 0 }), props: (D, e) => { D.exoCoupe(e, seg(e, 0, 400) * (1 - seg(e, 4400, 4800))); D.exoConfettis(e, 1 - seg(e, 4200, 4800)); } });
S('exo-attente', 'Tu réfléchis ?', 'evt', { dur: 3400, on: ['exo-attente'], anim: [[0, 'curieux'], [1600, 'idle-regard']], mood: 'ecoute', say: [[200, 3200, L('Tu réfléchis ?', 'Prends ton temps.', 'Besoin d’un indice ?', 'Touche-moi : un indice !')]], move: e => ({ r: 0.07 * sm(seg(e, 0, 500)) * (1 - sm(seg(e, 2800, 3400))) }), props: (D, e) => D.exoPoint(e, seg(e, 0, 300) * (1 - seg(e, 3000, 3400))) });

// ---- on his own: he offers a question (the setting « Il te propose des questions ») ----
S('exo-envie', 'Une petite question ?', 'vie', { dur: 9000, w: 1, when: c => !!(EX() && EX().canPropose && EX().canPropose(c)), anim: [[0, 'curieux'], [1400, 'idee'], [3000, 'ecoute']], mood: 'ecoute', say: [[1500, 4200, L('Une petite question ?', 'On fait un exo ?', 'Un petit calcul ?', 'J’ai une énigme !')], [4400, 8600, L('Touche « Oui » !', 'Juste une !', 'Allez, une seule !')]], move: e => { const k = sm(seg(e, 0, 900)) * (1 - sm(seg(e, 8200, 9000))); return { y: -34 * k - 14 * bump(seg(e, 1400, 1900)), s: 1 - 0.12 * k }; }, props: (D, e) => D.exoArdoise(e, seg(e, 1400, 1800) * (1 - seg(e, 8200, 8800)), '1+1') });
S('exo-plustard', 'Plus tard', 'evt', { dur: 2400, anim: [[0, 'clin-oeil']], mood: 'clin', say: [[150, 2200, L('D’accord, plus tard !', 'Une autre fois !', 'Pas de souci !')]], move: e => ({ y: -10 * bump(seg(e, 0, 600)) }) });
});
