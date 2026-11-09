/* Scene pack « souvenirs » — his memories, his photo album and your mood journal (pixel/souvenirs.py, pixel/album.py;
   web/souvenirs.js and web/album.js start them). See the top of web/persona.js: scenes are S('id', 'Label', 'group', { ... })
   on one line each (pixel/scenes.py reads them), groups tap / fache / calin / retour / vie / evt, plus "on" (events).
   The events (persona.js EVENTS):
     'souvenir-fete'    { fete: 'anniversaire' | 'rencontre', ans }   your birthday party (a cake, candles, confetti, bunting:
                        « Joyeux anniversaire Léa ! »), or a year since you met; once a day on each screen, when you are there
     'souvenir-mois'    { mois } or { jours }                        « Ça fait 3 mois qu’on se connaît ! », 100 days...
     'souvenir-rappel'  { texte, icone }                             he remembers something (« Tu te souviens de ta série… ? »)
     'souvenir-demande'                                               « C’est quand ton anniversaire ? » (web/souvenirs.js shows
                        the « Plus tard » and « Je te dis ! » buttons while it plays), asked once
     'souvenir-anniv'   { texte }                                     your birthday noted (« Le 12 mars ! C’est noté ! »)
     'album-photo'                                                    he poses (« Cheese ! »), the flash, « Clic ! »: Pixel’s own
                        screen takes the photo just before the flash (web/album.js)
     'humeur-question'                                                « Comment tu vas aujourd’hui ? »
     'humeur-note'      { m: super | bien | bof | triste | colere, chips }   his answer: joy, a hug for a sad day, a breath
                        together for an angry one; kind words, never a lesson
     'humeur-rappel'    { texte }                                     the next day: « Hier, tu étais triste… ça va mieux ? »
   Every scene works without data (the lab, tests): it then says something of its own. Lines never assume you are a girl or
   a boy. Labels are his own (« La fête d’anniversaire », not « Joyeux anniversaire »: web/scenes/notifs.js has that word). */
(window.PixelScenePacks ||= []).push(({ S, L, pick, sm, out, seg, bump, jumps, clamp, rnd, TAU, W, HT, prop }) => {
const SV = () => (typeof window !== 'undefined' && window.PixelSouvenirs) || null;   // web/souvenirs.js, when it is loaded
const AL = () => (typeof window !== 'undefined' && window.PixelAlbum) || null;       // web/album.js
const io = (e, a, b, c, d) => sm(seg(e, a, b)) * (1 - sm(seg(e, c, d)));
const named = (s, o) => (o && o.surnom ? s.replace(/ !$/, `, ${o.surnom} !`).replace(/ \?$/, `, ${o.surnom} ?`) : s);
const memo = o => (o && o.texte) || (SV() && SV().memoire ? SV().memoire() : '') || 'Tu te souviens de notre rencontre ?';
const today = o => { const s = SV(), a = s && s.info ? s.info() : null; if (a) for (const k of ['ans', 'mois', 'jours']) if (!o[k]) o[k] = a[k] || 0; };   // played without data

// ---- the props ----
prop('souvGateau', (D, e, q, lit = true, bougies = 3) => {      // a birthday cake by his side: two layers, cream, candles
  if (q <= 0) return;
  const { g, U, col, lw } = D, o = D.P(84, 42), s = U * (0.55 + 0.45 * out(q)), x = o.x, y = o.y + (1 - out(q)) * 6 * U;
  g.globalAlpha = Math.min(1, q * 2);
  g.fillStyle = col.dim; g.fillRect(x - 11 * s, y + 7 * s, 22 * s, 1.6 * s);                                // the plate
  g.fillStyle = col.pink; g.fillRect(x - 9 * s, y + 1 * s, 18 * s, 6 * s);                                  // the bottom layer
  g.fillStyle = col.acc; g.fillRect(x - 7 * s, y - 4 * s, 14 * s, 5 * s);                                   // the top layer
  g.fillStyle = col.hi;                                                                                      // the cream, dripping
  g.fillRect(x - 7 * s, y - 4.6 * s, 14 * s, 1.4 * s);
  for (const [dx, h] of [[-6, 2.2], [-3, 1.4], [1, 2.6], [4.6, 1.6]]) g.fillRect(x + dx * s, y - 3.4 * s, 1.3 * s, h * s);
  g.fillRect(x - 9 * s, y + 0.6 * s, 18 * s, 1.2 * s);
  g.strokeStyle = col.fg; g.lineWidth = lw(0.4 * U); g.strokeRect(x - 9 * s, y - 4.6 * s, 18 * s, 11.6 * s);
  const n = clamp(bougies | 0, 1, 5);
  for (let i = 0; i < n; i++) {
    const bx = x + (i - (n - 1) / 2) * 3.6 * s;
    g.fillStyle = i % 2 ? col.hi : col.fg; g.fillRect(bx - 0.6 * s, y - 9 * s, 1.2 * s, 4.4 * s);           // a candle
    if (lit) {                                                                                               // its flame, flickering
      const f = 1 + 0.25 * Math.sin(e / 70 + i * 2);
      g.fillStyle = col.acc; g.beginPath(); g.ellipse(bx, y - 10.6 * s, 0.9 * s, 1.5 * s * f, 0, 0, TAU); g.fill();
      g.fillStyle = col.hi; g.beginPath(); g.ellipse(bx, y - 10.3 * s, 0.4 * s, 0.7 * s * f, 0, 0, TAU); g.fill();
    } else {                                                                                                 // blown out: a wisp of smoke
      const k = (e / 900 + i * 0.3) % 1; g.globalAlpha = Math.min(1, q * 2) * (1 - k) * 0.8;
      D.ring(bx + Math.sin(k * 6 + i) * 1.2 * s, y - 11 * s - k * 6 * s, (0.6 + k) * s, col.dim, 0.4 * U); g.globalAlpha = Math.min(1, q * 2);
    }
  }
  g.globalAlpha = 1;
});
prop('souvConfettis', (D, e, q) => {                  // confetti falling over the whole screen
  if (q <= 0) return;
  const { g, col } = D, cs = [col.acc, col.pink, col.hi, col.fg, col.dim];
  g.globalAlpha = q;
  for (let i = 0; i < 34; i++) {
    const sp = 70 + (i * 37 % 11) * 9, y = 40 + ((e / 1000) * sp + i * 61) % 420, x = (i * 113 + 17) % 780 + 10 + Math.sin(e / 300 + i) * 10;
    const w = i % 3 ? 9 : 6, h = (i % 3 ? 4 : 7) * (0.4 + 0.6 * Math.abs(Math.sin(e / 180 + i)));
    g.fillStyle = cs[i % cs.length]; g.fillRect(x - w / 2, y - h / 2, w, h);
  }
  g.globalAlpha = 1;
});
prop('souvGuirlande', (D, e, q) => {                  // bunting across the top of the screen
  if (q <= 0) return;
  const { g, col, lw } = D, y0 = 60 - (1 - out(q)) * 40, cs = [col.acc, col.pink, col.hi, col.dim];
  g.globalAlpha = Math.min(1, q * 1.5); g.strokeStyle = col.fg; g.lineWidth = lw(2);
  g.beginPath(); for (let x = 20; x <= 780; x += 20) { const y = y0 + 14 * Math.sin((x - 20) / 760 * Math.PI); if (x === 20) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke();
  for (let i = 0; i < 15; i++) {
    const x = 46 + i * 51, y = y0 + 14 * Math.sin((x - 20) / 760 * Math.PI), sw = Math.sin(e / 400 + i) * 2;
    g.fillStyle = cs[i % cs.length]; g.beginPath(); g.moveTo(x - 14, y); g.lineTo(x + 14, y); g.lineTo(x + sw, y + 26); g.closePath(); g.fill();
  }
  g.globalAlpha = 1;
});
prop('souvCalendrier', (D, e, q, big = '?', small = '') => {   // a calendar page by his side: a number, a word
  if (q <= 0) return;
  const { g, U, col, lw } = D, o = D.P(84, 20), s = U * (0.6 + 0.4 * out(q)), w = 17 * s, h = 19 * s, x = o.x - w / 2, y = o.y - h / 2 + Math.sin(e / 500) * 0.5 * U;
  g.globalAlpha = Math.min(1, q * 2);
  g.fillStyle = col.bg; g.fillRect(x, y, w, h); g.strokeStyle = col.fg; g.lineWidth = lw(0.5 * U); g.strokeRect(x, y, w, h);
  g.fillStyle = col.acc; g.fillRect(x, y, w, 4.5 * s);                                                       // its red top
  g.fillStyle = col.fg; for (const dx of [0.28, 0.72]) g.fillRect(x + w * dx - 0.6 * s, y - 1.6 * s, 1.2 * s, 3 * s);   // the rings
  D.glyph(String(big), x + w / 2, y + 11.5 * s, (String(big).length > 2 ? 6 : 8) * s, col.fg);
  if (small) D.glyph(String(small), x + w / 2, y + 2.4 * s, 3 * s, col.bg);
  g.globalAlpha = 1;
});
prop('souvSouffle', (D, e, q) => {                    // a circle that grows and shrinks: breathe in, breathe out
  if (q <= 0) return;
  const { g, U, col, lw } = D, o = D.P(84, 24), k = 0.5 - 0.5 * Math.cos(e / 2000 * Math.PI), r = (3 + 5 * k) * U;
  g.globalAlpha = q * 0.3; g.fillStyle = col.pink; g.beginPath(); g.arc(o.x, o.y, r, 0, TAU); g.fill();
  g.globalAlpha = q; g.strokeStyle = col.pink; g.lineWidth = lw(0.7 * U); g.beginPath(); g.arc(o.x, o.y, r, 0, TAU); g.stroke();
  g.globalAlpha = q * 0.6; g.strokeStyle = col.dim; g.lineWidth = lw(0.4 * U); g.beginPath(); g.arc(o.x, o.y, 8 * U, 0, TAU); g.stroke();   // how far a breath goes
  g.globalAlpha = 1;
});
prop('souvFlash', (D, e, q) => {                      // the shutter: web/album.js flashes his screen (once per pose)
  const a = AL(); if (q > 0 && a && a.flash) a.flash(q);
});

// ---- your birthday, the day you met ----
S('souvenir-anniversaire', 'La fête d’anniversaire', 'evt', { dur: 9600, side: true, on: ['souvenir-fete'], urgent: true, when: d => d.fete !== 'rencontre', anim: [[0, 'surpris'], [700, 'etoiles'], [3400, 'danse'], [6800, 'bisou'], [8200, 'content']], mood: 'excite', say: [[200, 3200, o => named('Joyeux anniversaire !', o)], [3400, 6400, L('Souffle les bougies !', 'Fais un vœu !', 'Un vœu, et on souffle !')], [6600, 9400, L('Hip hip hip… hourra !', 'Que des bonnes choses !', 'Une journée géniale !')]], move: e => ({ y: e < 3200 ? jumps(e, 600, 30) : -12 * Math.abs(Math.sin((e - 3400) / 260)) * io(e, 3400, 3700, 6400, 6800), r: 0.08 * Math.sin((e - 3400) / 520) * io(e, 3400, 3800, 6200, 6800), s: 1 - 0.1 * io(e, 0, 600, 8800, 9500) }), props: (D, e) => { D.souvGuirlande(e, io(e, 0, 500, 9000, 9600)); D.souvGateau(e, io(e, 300, 900, 8900, 9500), e < 5600, 3); D.souvConfettis(e, io(e, 500, 900, 8800, 9600)); if (e > 6800) D.hearts(e - 6800, 0.8); } });
S('souvenir-rencontre', 'L’anniversaire de notre rencontre', 'evt', { dur: 8400, side: true, on: ['souvenir-fete'], urgent: true, when: d => d.fete === 'rencontre', init: today, anim: [[0, 'surpris'], [800, 'etoiles'], [4200, 'amoureux']], mood: 'excite', say: [[200, 4000, o => `Ça fait ${o.ans > 1 ? o.ans + ' ans' : 'un an'} qu’on se connaît !`], [4200, 8200, L('Merci pour tout ce temps ensemble !', 'Toi et moi, quelle équipe !', 'Vivement l’année prochaine !')]], move: e => ({ y: e < 3600 ? jumps(e, 600, 26) : 0, s: 1 + 0.05 * Math.sin(e / 200) * io(e, 4200, 4600, 7600, 8200) }), props: (D, e, p, o) => { D.souvGuirlande(e, io(e, 0, 500, 7800, 8400)); D.souvGateau(e, io(e, 300, 900, 7800, 8300), e < 4800, Math.max(1, o.ans | 0)); if (e > 4200) D.hearts(e - 4200, 1.1); } });
S('souvenir-mois', 'On se connaît depuis…', 'evt', { dur: 5600, on: ['souvenir-mois'], init: o => { if (!o.mois && !o.jours) today(o); }, anim: [[0, 'curieux'], [900, 'content'], [3200, 'amoureux']], mood: 'content', say: [[300, 3200, o => (o.jours ? `Ça fait ${o.jours} jours qu’on se connaît !` : `Ça fait ${o.mois || 1} mois qu’on se connaît !`)], [3300, 5400, L('On fait la paire, toi et moi !', 'Et ce n’est que le début !', 'Je suis bien avec toi.')]], move: e => ({ y: -14 * bump(seg(e, 900, 1500)) }), props: (D, e, p, o) => { D.souvCalendrier(e, io(e, 200, 600, 5000, 5600), o.jours || o.mois || 1, o.jours ? 'jours' : 'mois'); if (e > 3200) D.hearts(e - 3200, 0.8); } });

// ---- he remembers; he asks your birthday, once; he notes it ----
S('souvenir-rappel', 'Tu te souviens ?', 'evt', { dur: 6600, side: true, on: ['souvenir-rappel'], anim: [[0, 'reflechit'], [4200, 'content']], mood: 'reflechit', say: [[300, 4200, o => memo(o)], [4400, 6400, L('Quel souvenir !', 'Je m’en souviens encore !', 'C’était trop bien !')]], move: e => ({ y: -8 * Math.sin(e / 700) * io(e, 0, 600, 5800, 6600) }), props: (D, e, p, o) => D.thought(o.icone || 'coeur', io(e, 0, 500, 4000, 4500)) });
S('souvenir-question', 'C’est quand ton anniversaire ?', 'evt', { dur: 9400, on: ['souvenir-demande'], anim: [[0, 'curieux'], [1400, 'idee'], [3200, 'ecoute']], mood: 'ecoute', say: [[300, 4400, o => named('C’est quand ton anniversaire ?', o)], [4600, 9000, L('Je voudrais le noter !', 'Comme ça, je te le souhaiterai !', 'Touche « Je te dis ! »')]], move: e => { const k = io(e, 0, 900, 8600, 9400); return { y: -34 * k, s: 1 - 0.12 * k }; }, props: (D, e) => D.souvCalendrier(e, io(e, 1300, 1700, 8600, 9200), '?') });
S('souvenir-note', 'Ton anniversaire, noté !', 'evt', { dur: 4600, on: ['souvenir-anniv'], urgent: true, anim: [[0, 'etoiles'], [2400, 'clin-oeil']], mood: 'excite', say: [[200, 2600, o => (o.texte ? `${o.texte.charAt(0).toUpperCase() + o.texte.slice(1)} ! C’est noté !` : 'C’est noté !')], [2700, 4400, L('Je ne l’oublierai pas !', 'Vivement la fête !', 'Je m’en souviendrai !')]], move: e => ({ y: -16 * bump(seg(e, 0, 600)) }), props: (D, e, p, o) => D.souvCalendrier(e, io(e, 0, 400, 4100, 4600), o.jour || '!', o.mois ? ['jan', 'fév', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'][o.mois - 1] : '') });

// ---- the album: he poses, the flash, « Clic ! » ----
S('album-pose', 'Il prend la pose', 'evt', { dur: 4600, on: ['album-photo'], urgent: true, anim: [[0, 'surpris'], [600, 'content'], [1300, 'fier'], [2800, 'clin-oeil']], mood: 'fier', say: [[150, 1300, L('Une photo ? D’accord !', 'Je prends la pose !', 'Attends, je me coiffe…')], [1400, 2700, L('Cheese !', 'Ouistiti !', 'Souriez !')], [2900, 4400, L('Clic ! Elle est dans mon album.', 'Clic ! Trop bien, celle-là.', 'Clic ! Je suis photogénique.')]], move: e => ({ r: -0.06 * io(e, 1300, 1600, 2700, 3000), s: 1 + 0.04 * io(e, 1300, 1600, 2700, 3000), y: -6 * bump(seg(e, 2700, 3100)) }), props: (D, e) => { if (e > 2700) D.souvFlash(e - 2700, 1 - seg(e, 2700, 3200)); } });

// ---- your mood journal ----
S('humeur-question', 'Comment tu vas ?', 'evt', { dur: 4200, on: ['humeur-question'], urgent: true, anim: [[0, 'curieux'], [1500, 'ecoute']], mood: 'ecoute', say: [[200, 4000, o => named('Comment tu vas aujourd’hui ?', o)]], move: e => ({ y: -10 * bump(seg(e, 0, 700)) }) });
S('humeur-super', 'Une super journée', 'evt', { dur: 3800, on: ['humeur-note'], urgent: true, when: d => d.m === 'super', anim: [[0, 'etoiles'], [2200, 'rire']], mood: 'excite', say: [[150, 2200, L('Youpi ! Trop bien !', 'Génial !', 'Super, ça !')], [2300, 3600, L('Raconte-moi tout !', 'J’adore les super journées !', 'Ça me rend tout content !')]], move: e => ({ y: e < 2600 ? jumps(e, 520, 34) : 0 }), props: (D, e) => D.stars(e) });
S('humeur-bien', 'Une bonne journée', 'evt', { dur: 3400, on: ['humeur-note'], urgent: true, when: d => !['super', 'bof', 'triste', 'colere'].includes(d.m), anim: [[0, 'content']], mood: 'content', say: [[150, 1700, L('Cool !', 'Chouette !', 'Tant mieux !')], [1800, 3200, L('Je suis content pour toi.', 'Une bonne journée, ça !', 'Moi aussi, ça va !')]], move: e => ({ y: -14 * bump(seg(e, 0, 700)) }), props: (D, e) => { if (e > 1600) D.hearts(e - 1600, 0.6); } });
S('humeur-bof', 'Une journée bof', 'evt', { dur: 4200, on: ['humeur-note'], urgent: true, when: d => d.m === 'bof', anim: [[0, 'reflechit'], [2000, 'content']], mood: 'reflechit', say: [[150, 2000, o => ((o.chips || []).includes('fatigue') ? 'Grosse fatigue, hein ?' : pick(['Bof, hein ?', 'Une journée bof…', 'Pas terrible ?']))], [2100, 4000, o => ((o.chips || []).includes('fatigue') ? pick(['Un bon dodo ce soir ?', 'Repose-toi bien.']) : pick(['Demain sera mieux !', 'Je suis là, si tu veux.', 'On fait un truc rigolo ?']))]], move: e => ({ r: 0.05 * Math.sin(e / 400) * io(e, 0, 400, 1600, 2000), y: -10 * bump(seg(e, 2000, 2600)) }), props: (D, e) => { if (e > 2100) D.hearts(e - 2100, 0.5); } });
S('humeur-triste', 'Un câlin pour toi', 'evt', { dur: 6400, on: ['humeur-note'], urgent: true, when: d => d.m === 'triste', anim: [[0, 'triste'], [2400, 'amoureux']], mood: 'triste', say: [[200, 2300, L('Oh… je suis là.', 'Oh… viens là.', 'Oh… ça arrive.')], [2400, 4400, L('Un gros câlin ?', 'Je te fais un câlin.', 'Câlin !')], [4500, 6200, L('Tu peux me parler, si tu veux.', 'Demain, ça ira mieux.', 'Je reste avec toi.')]], move: e => ({ s: 1 + 0.12 * io(e, 2300, 2900, 5600, 6300), y: 10 * io(e, 0, 500, 2000, 2400) }), props: (D, e) => { if (e > 2400) { D.hearts(e - 2400, 1.2); D.blush(io(e, 2400, 2900, 5800, 6400)); } } });
S('humeur-colere', 'On respire ensemble', 'evt', { dur: 8000, on: ['humeur-note'], urgent: true, when: d => d.m === 'colere', anim: [[0, 'confus'], [2000, 'zen'], [6600, 'content']], mood: 'confus', say: [[150, 1900, L('Grrr… ça arrive à tout le monde.', 'Oh, en colère ?', 'Je comprends.')], [2000, 3900, L('On respire ensemble ?', 'Respire avec moi ?')], [4000, 6500, L('Inspire… souffle…', 'On inspire… et on souffle…')], [6600, 7800, L('Je suis là, d’accord ?', 'Ça va un peu mieux ?')]], move: e => ({ x: 4 * Math.sin(e / 30) * (1 - seg(e, 0, 600)), s: 1 + 0.04 * Math.sin((e - 2000) / 2000 * Math.PI) * io(e, 2000, 2400, 6200, 6600) }), props: (D, e) => { D.souvSouffle(e - 2000, io(e, 2000, 2600, 6200, 6800)); if (e > 6600) D.hearts(e - 6600, 0.6); } });
S('humeur-rappel', 'Et aujourd’hui ?', 'evt', { dur: 5200, on: ['humeur-rappel'], anim: [[0, 'curieux'], [2400, 'ecoute']], mood: 'ecoute', say: [[300, 5000, o => o.texte || 'Et aujourd’hui, ça va ?']], move: e => ({ r: 0.05 * io(e, 0, 500, 4600, 5200) }), props: (D, e) => D.thought('coeur', io(e, 200, 700, 4400, 5000)) });
});
