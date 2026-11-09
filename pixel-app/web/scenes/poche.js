/* Scene pack « poche » — Pixel de poche: the phone held sideways is a second, living Pixel (web/poche.js), and the two know each other.
   See the top of web/persona.js: scenes are defined with S('id', 'Label', 'group', { ... }) on one line each
   (pixel/scenes.py reads them), groups tap / fache / calin / retour / vie / evt, plus "on" (events) and "pool" (touch pools).
   On the phone: shaken, tilted hard, its battery, the Pi out of reach and back, out of the pocket, his twin at home touched.
   On the Pi: his twin in your pocket switched on, touched, petted (jealous!), shaken.
   The voyage: poche-part (the Pi) and poche-arrive (the phone), then poche-rentre (the phone) and poche-revient (the Pi), played by
   web/poche.js when the server's "poche.voyage" changes. poche-part lasts as long as the voyage (pixel/poche.py VOYAGE_MS = 60 s). */
(window.PixelScenePacks ||= []).push(({ S, L, sm, out, inn, seg, bump, jumps, prop }) => {
const walk = e => -8 * Math.abs(Math.sin(e / 160)), sway = e => 0.04 * Math.sin(e / 160);   // his step, while he walks
const rr = (g, x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };
// the props: where he went (a phone with a tiny Pixel inside), his twin's phone at the edge of the screen, a suitcase for the voyage
prop('pocheAbsent', (D, e, q, left) => {            // in the middle of the empty screen, while he is in your pocket
  const { g, col, lw, glyph } = D, x = 400, y = 190 + Math.round(Math.sin(e / 600) * 4), w = 156, h = 88, blink = (e % 3200) < 160;
  g.globalAlpha = q; g.strokeStyle = col.fg; g.lineWidth = lw(4); rr(g, x - w / 2, y - h / 2, w, h, 14); g.stroke();
  g.fillStyle = col.fg; g.fillRect(x - w / 2 + 9, y - 6, 4, 12);
  g.fillStyle = col.hi; for (const sx of [-20, 14]) g.fillRect(x + sx, y - 16 + (blink ? 7 : 0), 6, blink ? 3 : 16); g.fillRect(x - 11, y + 14, 22, 4);
  glyph('PARTI DANS TA POCHE', 400, 292, 34, col.hi);
  if (left > 0) glyph(`Il revient dans ${Math.ceil(left / 1000)} s`, 400, 330, 26, col.fg);
  glyph('Touche l’écran pour le rappeler', 400, 364, 24, col.dim);
  g.globalAlpha = 1;
});
prop('pocheMini', (D, e, q) => {                    // his twin's phone, top right, with signal waves toward him
  const { g, col, lw } = D, x = 708, y = 128 + Math.round(Math.sin(e / 400) * 3), w = 92, h = 52, blink = (e % 2600) < 140;
  g.globalAlpha = q; g.fillStyle = col.bg; g.strokeStyle = col.fg; g.lineWidth = lw(3); rr(g, x - w / 2, y - h / 2, w, h, 9); g.fill(); g.stroke();
  g.fillStyle = col.hi; for (const sx of [-13, 9]) g.fillRect(x + sx, y - 10 + (blink ? 4 : 0), 4, blink ? 2 : 9); g.fillRect(x - 7, y + 8, 14, 3);
  g.strokeStyle = col.acc; g.lineWidth = lw(3);
  for (let i = 0; i < 3; i++) { const k = ((e / 600) + i / 3) % 1; g.globalAlpha = q * (1 - k); g.beginPath(); g.arc(x - w / 2 - 4, y, 10 + k * 28, Math.PI * 0.72, Math.PI * 1.28); g.stroke(); }
  g.globalAlpha = 1;
});
prop('valise', (D, e, q) => {                       // a little suitcase by his side
  const { g, U, col, lw } = D, o = D.P(92, 40), w = 10 * U, h = 7 * U;
  g.globalAlpha = q; g.fillStyle = col.acc; g.fillRect(o.x - w / 2, o.y, w, h);
  g.strokeStyle = col.fg; g.lineWidth = lw(0.8 * U); g.strokeRect(o.x - w / 2, o.y, w, h); g.strokeRect(o.x - 2 * U, o.y - 2 * U, 4 * U, 2 * U);
  g.fillStyle = col.fg; g.fillRect(o.x - 0.5 * U, o.y, U, h);
  g.globalAlpha = 1;
});

// ---- on the phone: what the phone feels ----
S('poche-coucou', 'Coucou, je suis dans ton téléphone', 'evt', { dur: 5600, on: ['poche-allume'], anim: [[0, 'salut'], [2600, 'etoiles']], mood: 'content', say: [[200, 2500, L('Coucou ! Me voilà dans ton téléphone !', 'Tadaa ! Pixel de poche !', 'Hé ! Je vis dans ta poche, maintenant !')], [2700, 5400, L('Caresse-moi, secoue-moi, penche-moi !', 'Garde-moi bien au chaud !', 'On va se promener ?')]], move: e => ({ y: e < 2400 ? jumps(e, 600, 26) : -10 * bump(seg(e, 2600, 3400)) }) });
S('poche-tournis', 'Le tournis', 'evt', { dur: 3600, w: 2, on: ['poche-secousse'], urgent: true, anim: [[0, 'surpris'], [500, 'confus']], mood: 'confus', say: [[200, 3400, L('Wooo… tout tourne !', 'Arrête de me secouer !', 'J’ai le tournis…', 'Hé, doucement !')]], move: e => { const k = 1 - seg(e, 2400, 3600); return { x: 22 * Math.sin(e / 55) * k, r: 0.14 * Math.sin(e / 140) * k, y: 6 * Math.sin(e / 90) * k }; }, props: (D, e) => D.dizzy(e, 1 - seg(e, 2800, 3600)) });
S('poche-cocktail', 'Pas un cocktail', 'evt', { dur: 3200, on: ['poche-secousse'], urgent: true, anim: [[0, 'panique'], [1800, 'boudeur']], mood: 'surpris', say: [[150, 1700, L('Au secouuurs !', 'Aaaah !', 'Tremblement de terre !')], [1800, 3100, L('Je suis pas un cocktail !', 'Pas de secousses, merci.')]], move: e => { const k = 1 - seg(e, 1500, 1900); return { x: 14 * Math.sin(e / 25) * k, y: 9 * Math.cos(e / 31) * k }; }, props: (D, e) => { if (e < 1900) D.sweat(e); } });
S('poche-glisse', 'Ça glisse', 'evt', { dur: 2600, on: ['poche-glisse'], urgent: true, anim: [[0, 'surpris'], [1200, 'panique']], mood: 'surpris', say: [[100, 2500, L('Wooo, ça glisse !', 'Tiens-moi droit !', 'Je vais tomber !', 'Hé, ça penche !')]], move: (e, p, o) => ({ x: (o.side || 1) * 26 * bump(seg(e, 0, 1300)), r: (o.side || 1) * 0.08 * Math.sin(e / 90) * (1 - seg(e, 1600, 2600)) }) });
S('poche-batterie', 'Batterie faible', 'evt', { dur: 5200, on: ['poche-batterie'], urgent: true, anim: [[0, 'batterie-faible'], [3200, 'fatigue']], mood: 'baille', say: [[300, 2900, o => o.level ? `Plus que ${o.level} % de batterie…` : 'Ma batterie est presque vide…'], [3000, 5000, L('Branche-moi, s’il te plaît !', 'J’ai faim d’électricité…', 'Vite, un chargeur !')]], move: e => { const k = sm(seg(e, 0, 1200)) * (1 - sm(seg(e, 4400, 5200))); return { y: 16 * k, sy: 1 - 0.08 * k, sx: 1 + 0.04 * k }; } });
S('poche-recharge', 'Ça recharge', 'evt', { dur: 4000, on: ['poche-recharge'], urgent: true, anim: [[0, 'recharge'], [2600, 'etoiles']], mood: 'content', say: [[200, 2500, L('Miam, de l’électricité !', 'Ça recharge… que c’est bon !', 'Merci, je reprends des forces !')], [2600, 3900, L('Je déborde d’énergie !', 'À fond !')]], move: e => ({ y: e > 2600 ? jumps(e - 2600, 450, 30) * (1 - seg(e, 3500, 4000)) : 0 }), props: (D, e) => { if (e > 2600) D.stars(e - 2600); } });
S('poche-loin', 'Loin de la maison', 'evt', { dur: 6200, on: ['poche-loin'], anim: [[0, 'deconnexion'], [2200, 'triste'], [4200, 'content']], mood: 'triste', say: [[300, 2100, L('Je ne capte plus la maison…', 'Allô, le Pi ? Tu m’entends ?', 'Oh ! Plus de réseau…')], [2300, 4100, L('Je suis loin de chez moi…', 'Le Pi est trop loin…')], [4200, 6000, L('Pas grave, je reste avec toi !', 'On s’amuse quand même ?', 'Tant que tu es là…')]], move: e => ({ y: 10 * sm(seg(e, 2200, 2800)) * (1 - sm(seg(e, 4200, 4800))) }), props: (D, e) => D.antenna(e, false, seg(e, 0, 400) * (1 - seg(e, 3800, 4300))) });
S('poche-maison', 'Je capte la maison', 'evt', { dur: 3400, on: ['poche-maison'], anim: [[0, 'connexion'], [1400, 'etoiles']], mood: 'excite', say: [[200, 3200, L('Ah, je capte la maison !', 'Coucou le Pi, me revoilà !', 'Ouf, de nouveau connecté !')]], move: e => ({ y: -22 * bump(seg(e, 1400, 2000)) }), props: (D, e) => D.antenna(e, true, seg(e, 0, 300) * (1 - seg(e, 2900, 3400))) });
S('poche-revoila', 'Sorti de la poche', 'evt', { dur: 3400, on: ['poche-revoila'], anim: [[0, 'surpris'], [700, 'salut']], mood: 'content', say: [[300, 3200, L('Ah, de la lumière !', 'Il faisait tout noir dans ta poche !', 'Te revoilà !', 'Coucou ! On est où ?')]], move: e => ({ y: e > 700 ? jumps(Math.min(e - 700, 1200), 600, 28) : 0, sy: 1 + 0.1 * bump(seg(e, 0, 500)) }) });
S('poche-jumeau', 'On touche mon jumeau', 'evt', { dur: 3400, on: ['jumeau-tape'], when: d => d.ici === 'poche', anim: [[0, 'curieux']], mood: 'ecoute', say: [[200, 3200, L('Hé, on touche mon jumeau à la maison !', 'Quelqu’un embête le Pixel du Pi ?', 'Ça chatouille, chez moi !')]], move: e => { const k = sm(seg(e, 0, 600)) * (1 - sm(seg(e, 2600, 3400))); return { x: -40 * k, r: -0.06 * k }; } });
S('poche-et-moi', 'Et moi, alors ?', 'evt', { dur: 3800, on: ['jumeau-caresse'], when: d => d.ici === 'poche', anim: [[0, 'surpris'], [800, 'boudeur']], mood: 'fache', say: [[200, 2000, L('Tu caresses celui de la maison ?!', 'Hé ! Il a eu un câlin, lui ?')], [2100, 3600, L('Et moi, alors ?', 'Moi aussi, je veux un câlin !')]], move: e => ({ x: 6 * Math.sin(e / 40) * (1 - seg(e, 0, 600)), y: 4 * sm(seg(e, 800, 1400)) * (1 - sm(seg(e, 3000, 3800))) }) });

// ---- on the Pi: his twin in your pocket ----
S('poche-salue', 'Coucou mon jumeau', 'evt', { dur: 3600, on: ['jumeau-bonjour'], anim: [[0, 'surpris'], [600, 'salut']], mood: 'content', say: [[300, 3400, L('Coucou mon jumeau !', 'Oh, mon jumeau s’est réveillé !', 'Salut, le Pixel de poche !')]], move: e => { const k = sm(seg(e, 0, 700)) * (1 - sm(seg(e, 2800, 3600))); return { x: 50 * k, r: 0.07 * k, y: -10 * bump(seg(e, 600, 1100)) }; }, props: (D, e) => D.pocheMini(e, seg(e, 0, 300) * (1 - seg(e, 3200, 3600))) });
S('poche-curieux', 'Ça bouge dans ta poche', 'evt', { dur: 3400, on: ['jumeau-tape'], when: d => d.ici !== 'poche', anim: [[0, 'curieux']], mood: 'ecoute', say: [[200, 3200, L('Quelqu’un chatouille mon jumeau ?', 'Ça bouge, dans ta poche !', 'Tu joues avec l’autre ?')]], move: e => { const k = sm(seg(e, 0, 600)) * (1 - sm(seg(e, 2600, 3400))); return { x: 46 * k, r: 0.06 * k }; }, props: (D, e) => D.pocheMini(e, seg(e, 0, 300) * (1 - seg(e, 3000, 3400))) });
S('poche-jaloux', 'Jaloux', 'evt', { dur: 4200, w: 2, on: ['jumeau-caresse'], when: d => d.ici !== 'poche', anim: [[0, 'surpris'], [600, 'colere'], [2400, 'boudeur']], mood: 'fache', say: [[100, 2300, L('Hé ! Tu caresses l’autre ?!', 'Quoi ?! Tu caresses mon jumeau ?', 'C’est moi, le vrai Pixel !')], [2400, 4000, L('Et moi, alors ?', 'Moi aussi, je veux un câlin !', 'Pfff… jaloux, moi ? Non.')]], move: e => ({ x: 8 * Math.sin(e / 30) * seg(e, 600, 800) * (1 - seg(e, 2000, 2400)) }), props: (D, e) => { if (e > 600 && e < 2600) D.steam(e); } });
S('poche-envie', 'Il a de la chance, lui', 'evt', { dur: 3800, on: ['jumeau-caresse'], when: d => d.ici !== 'poche', anim: [[0, 'triste'], [2600, 'timide']], mood: 'triste', say: [[200, 2500, L('Il a de la chance, lui…', 'Et moi, personne ne me caresse…')], [2600, 3700, L('Un câlin pour moi aussi ?', 'Bon… à mon tour ?')]], move: e => ({ y: 10 * sm(seg(e, 0, 700)) * (1 - sm(seg(e, 3000, 3800))) }), props: (D, e) => { if (e < 2600) D.tear('el', seg(e, 300, 2600)); } });
S('poche-secoue', 'On secoue mon jumeau', 'evt', { dur: 3400, on: ['jumeau-secoue'], anim: [[0, 'surpris'], [900, 'confus']], mood: 'surpris', say: [[200, 3200, L('Doucement avec mon jumeau !', 'Ça secoue, dans ta poche !', 'Il va avoir le tournis, le pauvre !')]], move: e => ({ x: 8 * Math.sin(e / 35) * (1 - seg(e, 0, 900)) }), props: (D, e) => D.pocheMini(e, seg(e, 0, 300) * (1 - seg(e, 3000, 3400))) });

// ---- the voyage: he walks off one screen and comes in on the other, with his suitcase ----
S('poche-part', 'Il part dans ta poche', 'evt', { dur: 64000, anim: [[0, 'salut'], [1300, 'content'], [60000, 'curieux'], [62400, 'salut']], mood: 'content', say: [[200, 1500, L('Je pars dans ta poche !', 'Direction le téléphone !', 'À tout de suite !')], [62300, 63900, L('Me revoilà à la maison !', 'Ah, rien de tel que chez soi !')]],
  move: e => (e < 1300 ? { y: -16 * bump(e / 650) } : e < 3600 ? { x: 760 * inn(seg(e, 1300, 3600)), y: walk(e), r: sway(e) } : e < 60000 ? { x: 2000 } : { x: 760 * (1 - out(seg(e, 60000, 62400))), y: e < 62400 ? walk(e) : 0, r: e < 62400 ? sway(e) : 0, f: e < 62400 }),
  props: (D, e) => { if (e > 3000 && e < 60600) D.pocheAbsent(e, seg(e, 3000, 3600) * (1 - seg(e, 60000, 60600)), 60000 - e); if (e < 3600 || e > 60000) D.valise(e, 1 - seg(e, 63400, 64000)); } });
S('poche-revient', 'Il rentre de ta poche', 'evt', { dur: 5600, anim: [[0, 'curieux'], [4400, 'salut']], mood: 'content', say: [[4300, 5500, L('Me revoilà à la maison !', 'Ah, rien de tel que chez soi !', 'Coucou, je suis rentré !')]],
  move: e => (e < 2400 ? { x: 2000 } : { x: 760 * (1 - out(seg(e, 2400, 4400))), y: e < 4400 ? walk(e) : 0, r: e < 4400 ? sway(e) : 0, f: e < 4400 }),
  props: (D, e) => { if (e < 2600) D.pocheAbsent(e, 1 - seg(e, 2000, 2600), 0); D.valise(e, 1 - seg(e, 5000, 5600)); } });
S('poche-arrive', 'Il arrive dans ta poche', 'evt', { dur: 8400, anim: [[0, 'surpris'], [900, 'curieux'], [3800, 'content'], [6000, 'salut']], mood: 'content', say: [[200, 1700, L('Oh ? De la visite !', 'Quelqu’un arrive !')], [1800, 3200, L('Je te laisse la place !', 'Je me pousse !')], [6100, 8200, L('Coucou ! Me voilà dans ta poche !', 'Tadaa ! J’ai voyagé !', 'Salut ! C’est moi, celui de la maison !')]],
  move: e => (e < 1800 ? { y: -14 * bump(seg(e, 200, 700)) } : e < 3200 ? { x: -760 * inn(seg(e, 1800, 3200)), y: walk(e), r: sway(e), f: true } : e < 3800 ? { x: -2000 } : { x: 760 * (1 - out(seg(e, 3800, 6000))), y: e < 6000 ? walk(e) : 0, r: e < 6000 ? sway(e) : 0, f: e < 6000 }),
  props: (D, e) => { if (e > 3800) D.valise(e, 1 - seg(e, 7800, 8400)); } });
S('poche-rentre', 'Il rentre à la maison', 'evt', { dur: 7800, anim: [[0, 'salut'], [1800, 'content'], [4400, 'curieux'], [6000, 'salut']], mood: 'content', say: [[200, 1700, L('Bon, je rentre à la maison !', 'Allez, je retourne sur le Pi !', 'Salut, à plus tard !')], [6000, 7600, L('Re ! C’est encore moi.', 'Coucou, je suis de retour !', 'Ouf, j’ai retrouvé ma poche !')]],
  move: e => (e < 1800 ? { y: -12 * bump(seg(e, 200, 700)) } : e < 3400 ? { x: 760 * inn(seg(e, 1800, 3400)), y: walk(e), r: sway(e) } : e < 4400 ? { x: 2000 } : { x: -760 * (1 - out(seg(e, 4400, 6000))), y: e < 6000 ? walk(e) : 0, r: e < 6000 ? sway(e) : 0 }),
  props: (D, e) => { if (e < 3400) D.valise(e, seg(e, 0, 400)); } });
});
