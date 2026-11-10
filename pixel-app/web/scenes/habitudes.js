/* Scene pack « habitudes » — his day, his games, what makes him laugh, his fears, his own phrases (pixel/habitudes.py,
   web/habitudes.js). See the top of web/persona.js: S('id', 'Label', 'group', { ... }) on one line each (pixel/scenes.py
   reads them), plus "on" (events) and "pool" (touch pools). Labels say what is his own (« Il se brosse les dents »): a plain
   word would take another pack's « fais … » (pixel/scenes.py keeps the first scene for a word).
   - His routine (events habitude-*): he wakes up and stretches; 15 min before bedtime he yawns, brushes his teeth, asks for
     his night-light if he is afraid of the dark, says goodnight and falls asleep; his nap; asleep, a touch makes him mumble
     and a cuddle makes him smile in his sleep; he says the phrases you taught him (data.texte).
   - His games (jeu-*): he offers a game when he is bored (jeu-envie, a moment of life: web/habitudes.js canPropose decides,
     never at night, more often if énergique), his favourite makes him jump for joy, he reacts to each move and to the end.
   - What makes him laugh (rire-*): a joke (data.n: BLAGUES, read by pixel/habitudes.py, one B('question', 'réponse') per
     line), a grimace, a funny noise, the tickles; data.aime: he likes it (he laughs), data.fou: a farceur's giggle fit.
   - His fears (peur-*): the storm (a soft flash, he hides), the dark (only his eyes in the dark), a little spider (a moment
     of life: tap it and it climbs away; web/habitudes.js finds it with PixelHabitudesPack.araignee()), the void (the Pixel de
     poche tilted steeply: he answers 'poche-glisse'); comforted (peur-rassure), he grows braver (data.courage 0..100).
   Never really scary: soft flashes (two, short), the dark lasts a few seconds, the spider has big eyes and a smile.
   Without web/habitudes.js (tests, an old page) the moments of life of this pack never play, and every event still has a
   scene that answers it. */
(window.PixelScenePacks ||= []).push(({ S, L, pick, sm, out, inn, seg, bump, jumps, clamp, rnd, TAU, W, HT, A, prop }) => {
const PH = () => (typeof window !== 'undefined' && window.PixelHabitudes) || null;
const PK = typeof window !== 'undefined' ? (window.PixelHabitudesPack ||= {}) : {};
const NOM_JEU = { cache: 'cache-cache', pfc: 'pierre-feuille-ciseaux', etoiles: 'attrape-étoiles', simon: 'Simon' };
const fearOn = k => { const h = PH(); return !!(h && h.fearOn && h.fearOn(k)); };

/* ---------- his jokes: kid-friendly, short enough for a speech bubble (pixel/habitudes.py reads these lines) ---------- */
const BLAGUES = [];
const B = (q, r) => BLAGUES.push([q, r]);
B('Que dit une imprimante dans l’eau ?', 'J’ai papier !');
B('Pourquoi les poissons aiment l’eau salée ?', 'Le poivre les fait éternuer !');
B('Quel est le comble pour un électricien ?', 'De ne pas être au courant !');
B('Pourquoi un plongeur plonge en arrière ?', 'Sinon, il tombe dans le bateau !');
B('Quel est l’animal le plus heureux ?', 'Le hibou : sa femme est chouette !');
B('Que dit un oignon qui se cogne ?', 'Ail !');
B('Pourquoi l’éléphant n’a pas d’ordinateur ?', 'Il a peur de la souris !');
B('Que fait une fraise sur un cheval ?', 'Tagada, tagada !');
B('Quel est le comble pour un jardinier ?', 'De raconter des salades !');
B('Quelle fée les enfants n’aiment pas ?', 'La fée Néant !');
B('Pourquoi le livre de maths est triste ?', 'Il a trop de problèmes !');
B('Pourquoi les robots ne paniquent jamais ?', 'Ils ont des nerfs d’acier !');
B('Pourquoi les vaches ferment les yeux ?', 'Pour faire du lait concentré !');
B('Que dit le zéro au huit ?', 'Jolie ceinture !');
B('Quel fruit les poissons n’aiment pas ?', 'La pêche !');
B('Qu’est-ce qui a des dents sans manger ?', 'Un peigne !');
B('Quel fruit préfèrent les profs d’histoire ?', 'Les dattes !');
B('Que dit l’escargot sur une tortue ?', 'Youhou, ça va vite !');
B('Quel est le comble pour un pixel ?', 'De ne pas être net !');
B('Pourquoi l’ordinateur a froid ?', 'Il a laissé ses fenêtres ouvertes !');
B('Comment appelle-t-on un chou à la mer ?', 'Un chou marin !');
B('Quel est le comble pour un astronaute ?', 'D’être dans la lune !');
B('Pourquoi les canards sont à l’heure ?', 'Parce qu’ils sont dans l’étang !');
B('Que dit une puce qui gagne au loto ?', 'Je m’achète un chien !');
B('Un boomerang qui ne revient pas ?', 'C’est un bâton !');
B('Pourquoi les poules pondent des œufs ?', 'Lancés, ils se casseraient !');
B('Que dit un citron à son ami ?', 'Ne me presse pas !');
B('Quel est le comble pour une souris ?', 'D’avoir un chat dans la gorge !');
B('Que dit un crayon à un autre crayon ?', 'Tu as bonne mine !');
B('Pourquoi le soleil ne va pas à l’école ?', 'Il a déjà des millions de degrés !');
B('Quel est le dessert préféré des chats ?', 'La mousse au chat-colat !');
B('Qu’est-ce qui est jaune et qui attend ?', 'Jonathan !');
const joke = n => BLAGUES[((Number(n) || 0) % BLAGUES.length + BLAGUES.length) % BLAGUES.length];
/* his funny noises (pixel/habitudes.py BRUITS: as many), and the grimaces he can make (6) */
const BRUITS = ['Pouet pouet !', 'Boing boing !', 'Blblblbl !', 'Coin coin !', 'Plop !', 'Tut tuuut !', 'Pfrrrt !', 'Bzzz bzz !'];
PK.blagues = BLAGUES; PK.bruits = BRUITS;
/* a long phrase (60 characters at most) in two bubbles: half(t, 0), then half(t, 1); a short one stays the same */
function half(t, i) {
  const s = `« ${String(t || '…')} »`;
  if (s.length <= 40) return s;
  const mid = s.length / 2; let cut = -1;
  for (let d = 0; d < mid && cut < 0; d++) for (const j of [Math.round(mid + d), Math.round(mid - d)]) if (s[j] === ' ') { cut = j; break; }
  if (cut < 0) cut = Math.round(mid);
  return i ? '…' + s.slice(cut).trim() : s.slice(0, cut).trim() + '…';
}
PK.half = half;

/* ---------- the props ---------- */
prop('habBrosse', (D, e, q) => {                    // a toothbrush going left and right at his mouth, some foam
  if (q <= 0) return;
  const { g, U, col, lw } = D, m = D.at('mouth'), dx = Math.sin(e / 70) * 4 * U, x = m.x + 7 * U + dx, y = m.y + 1 * U;
  g.globalAlpha = Math.min(1, q * 2);
  g.fillStyle = col.acc; g.fillRect(x, y - 0.8 * U, 16 * U, 1.8 * U);                              // the handle
  g.fillStyle = col.hi; g.fillRect(x - 3.2 * U, y - 2.6 * U, 3.6 * U, 2 * U);                         // the bristles
  g.fillStyle = col.fg; g.fillRect(x - 3.4 * U, y - 0.9 * U, 4 * U, 1 * U);
  for (let i = 0; i < 5; i++) {                                                                        // foam bubbles
    const k = ((e / 900) + i / 5) % 1, bx = m.x + (i - 2) * 2.6 * U + Math.sin(e / 200 + i) * U, by = m.y + 2 * U - k * 6 * U;
    g.globalAlpha = Math.min(1, q * 2) * (1 - k);
    D.ring(bx, by, (0.7 + 0.8 * k) * U, col.hi, Math.max(1, 0.4 * U));
  }
  g.globalAlpha = 1; g.lineWidth = lw(1);
});
prop('habLampe', (D, e, q, x, y) => {                // his night-light: a little moon lamp that glows softly
  if (q <= 0) return;
  const { g, U, col } = D, s = U * 0.9, glow = 0.55 + 0.25 * Math.sin(e / 700);
  g.globalAlpha = q * glow * 0.5; g.fillStyle = col.acc;
  g.beginPath(); g.arc(x, y - 6 * s, 9 * s, 0, TAU); g.fill();                                        // the glow
  g.globalAlpha = q; g.fillStyle = col.acc;
  g.beginPath(); g.arc(x, y - 6 * s, 4.5 * s, 0, TAU); g.fill();                                      // the moon
  g.fillStyle = col.bg; g.beginPath(); g.arc(x + 2.2 * s, y - 7.4 * s, 3.8 * s, 0, TAU); g.fill();
  g.fillStyle = col.dim; g.fillRect(x - 3.5 * s, y, 7 * s, 2 * s); g.fillRect(x - 0.8 * s, y - 2 * s, 1.6 * s, 2 * s);   // its foot
  g.globalAlpha = 1;
});
prop('habEclair', (D, e, q, flash) => {             // the storm: rain, a lightning bolt in the sky, a soft flash
  if (q <= 0) return;
  const { g, U, col, lw, pix, k } = D;
  g.globalAlpha = q * 0.7; g.strokeStyle = col.dim; g.lineWidth = lw(Math.max(1.5, 0.4 * U)); g.lineCap = 'round';
  for (let i = 0; i < 16; i++) {                                                                       // the rain, slanted
    const p = ((e / 600) + i * 0.137) % 1, x = (i * 53) % 780 + 10 - p * 30, y = 50 + p * 400;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x - 2 * U, y + 5 * U); g.stroke();
  }
  if (flash > 0.08) {                                                                                   // (bump() never quite reaches 0)
    g.globalAlpha = Math.min(1, flash) * q;
    g.fillStyle = col.acc;                                                                             // the bolt, top right
    const bx = W - 150, by = 52, s = 3.2;
    g.beginPath(); for (const [px, py] of [[10, 0], [22, 0], [15, 12], [24, 12], [6, 34], [11, 17], [3, 17]]) g.lineTo(bx + px * s, by + py * s); g.closePath(); g.fill();
    g.fillStyle = col.hi;
    if (pix) { if (flash > 0.35) { g.globalAlpha = 1; for (let y = 0; y < HT; y += 4 * k) for (let x = ((y / (4 * k)) % 2) * 2 * k; x < W; x += 4 * k) g.fillRect(x, y, k, k); } }   // a dither: one cell in eight
    else { g.globalAlpha = 0.32 * Math.min(1, flash) * q; g.fillRect(0, 0, W, HT); }
  }
  g.globalAlpha = 1;
});
prop('habNoir', (D, e, q, peur) => {                // the dark: everything goes dark but his two eyes
  if (q <= 0) return;
  const { g, U, col } = D;
  g.globalAlpha = 0.86 * q; g.fillStyle = '#05060a'; g.fillRect(0, 0, W, HT);
  g.globalAlpha = q;
  for (const id of ['el', 'er']) {
    const a = D.at(id), bl = Math.floor(e / 1900) % 3 === 0 && (e % 1900) < 140;                     // he blinks now and then
    g.fillStyle = col.hi;
    if (bl) g.fillRect(a.x - 3 * U, a.y - 0.4 * U, 6 * U, 0.9 * U);
    else { g.beginPath(); g.ellipse(a.x + (peur ? Math.sin(e / 60) * 0.5 * U : 0), a.y, 2.6 * U, 3.2 * U, 0, 0, TAU); g.fill(); }
  }
  g.globalAlpha = 1;
});
/* the little spider: where it hangs at time e of its scene (screen px), shared with web/habitudes.js (tap it to chase it) */
function spiderAt(e, o) {
  const x0 = o.sx || 600, low = 230;
  let y;
  if (e < 1800) y = -30 + (low + 30) * out(seg(e, 0, 1800));
  else if (e < 8000) y = low + 8 * Math.sin((e - 1800) / 500);
  else y = low - (low + 60) * inn(seg(e, 8000, 9200));
  return { x: x0 + (e > 1800 && e < 8000 ? 14 * Math.sin((e - 1800) / 900) : 0), y, gone: e > 9200 };
}
PK.araignee = e => (PK.spider ? spiderAt(e, PK.spider) : null);
function spider(D, x, y, e, q, scared) {             // round body, eight little legs, big eyes, a smile: cute, never creepy
  const { g, U, col, lw } = D, s = U * 0.85;
  g.globalAlpha = q;
  g.strokeStyle = col.dim; g.lineWidth = lw(Math.max(1, 0.25 * U));
  g.beginPath(); g.moveTo(x, 0); g.lineTo(x, y - 3 * s); g.stroke();                                // its thread
  g.strokeStyle = col.fg; g.lineWidth = lw(Math.max(1.2, 0.5 * s)); g.lineCap = 'round';
  for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) {
    const a = (i - 1.5) * 0.45 + Math.sin(e / 120 + i) * (scared ? 0.25 : 0.12);
    g.beginPath(); g.moveTo(x + sd * 2 * s, y + (i - 1.5) * 1.1 * s);
    g.lineTo(x + sd * 5.5 * s, y + (i - 1.5) * 1.6 * s - 2 * s + a * 3 * s); g.lineTo(x + sd * 7 * s, y + (i - 1.5) * 2.2 * s + 1 * s); g.stroke();
  }
  g.fillStyle = col.fg; g.beginPath(); g.ellipse(x, y, 3.6 * s, 3.2 * s, 0, 0, TAU); g.fill();          // its body
  g.fillStyle = col.bg; for (const sd of [-1, 1]) { g.beginPath(); g.arc(x + sd * 1.4 * s, y - 0.6 * s, 1.15 * s, 0, TAU); g.fill(); }
  g.fillStyle = col.fg; for (const sd of [-1, 1]) g.fillRect(x + sd * 1.4 * s - 0.35 * s, y - 0.7 * s, 0.7 * s, 0.7 * s);
  g.fillStyle = col.pink; g.fillRect(x - 0.9 * s, y + 1.5 * s, 1.8 * s, 0.6 * s);                    // a little smile
  g.globalAlpha = 1;
}
prop('habAraignee', (D, e, q, o) => { if (q <= 0 || !o) return; const p = spiderAt(e, o); if (!p.gone) spider(D, p.x, p.y, e, q, false); });
prop('habAraigneeFile', (D, e, q) => {                // chased away: it climbs up its thread, fast
  const p0 = PK.spiderLast || { x: 600, y: 230 }; if (q <= 0) return;
  const y = p0.y - (p0.y + 60) * inn(seg(e, 0, 900)); if (y > -40) spider(D, p0.x, y, e, q, true);
});
prop('habGrimace', (D, e, q, n) => {                 // a funny face: tongue out, cheeks puffed, spiral eyes, a big nose...
  if (q <= 0) return;
  const { g, U, col, lw } = D, m = D.at('mouth'), v = ((Number(n) || 0) % 6 + 6) % 6;
  g.globalAlpha = q;
  if (v === 0 || v === 3) {                                                                           // the tongue
    g.fillStyle = col.pink; g.beginPath(); g.ellipse(m.x, m.y + 4 * U, 3 * U, 3.6 * U + Math.sin(e / 90) * 0.5 * U, 0, 0, TAU); g.fill();
    g.strokeStyle = col.fg; g.lineWidth = lw(0.4 * U); g.beginPath(); g.moveTo(m.x, m.y + 2.2 * U); g.lineTo(m.x, m.y + 5.5 * U); g.stroke();
  }
  if (v === 1 || v === 3) {                                                                           // puffed cheeks
    g.fillStyle = col.pink; g.globalAlpha = q * 0.85;
    for (const id of ['el', 'er']) { const a = D.at(id), sd = id === 'el' ? -1 : 1; g.beginPath(); g.arc(a.x + sd * 6 * U, a.y + 9 * U, (3.2 + 0.4 * Math.sin(e / 120)) * U, 0, TAU); g.fill(); }
    g.globalAlpha = q;
  }
  if (v === 2 || v === 5) {                                                                           // spiral eyes
    g.strokeStyle = col.acc; g.lineWidth = lw(0.5 * U);
    for (const id of ['el', 'er']) {
      const a = D.at(id); g.beginPath();
      for (let i = 0; i <= 26; i++) { const t = i / 26 * 3 * TAU + e / 160, r = (0.4 + 3.4 * i / 26) * U; const x = a.x + Math.cos(t) * r, y = a.y + Math.sin(t) * r; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
    }
  }
  if (v === 4 || v === 5) {                                                                           // a big round clown nose
    const c = D.at('c'); g.fillStyle = col.acc; g.beginPath(); g.arc(c.x, c.y + 4 * U, (3 + 0.3 * Math.sin(e / 100)) * U, 0, TAU); g.fill();
    g.fillStyle = col.hi; g.beginPath(); g.arc(c.x - U, c.y + 3 * U, 0.8 * U, 0, TAU); g.fill();
  }
  g.globalAlpha = 1;
});
prop('habMot', (D, e, q, text) => {                  // a word popping out of his mouth (« POUET ! »)
  if (q <= 0) return;
  const m = D.at('mouth'), k = out(q);
  D.g.globalAlpha = Math.min(1, q * 2);
  D.glyph(text, Math.min(W - 90, m.x + 20 * D.U * k), m.y - 6 * D.U * k, (6 + 2 * Math.sin(e / 90)) * D.U, D.col.acc);
  D.g.globalAlpha = 1;
});
prop('habLarmes', (D, e, q) => {                     // tears of joy, both eyes
  if (q <= 0) return;
  for (const id of ['el', 'er']) D.tear(id, ((e / 700) + (id === 'el' ? 0 : 0.5)) % 1);
});
prop('habConfettis', (D, e, q) => {                  // confetti falling all over
  if (q <= 0) return;
  const { g, U, col } = D, cs = [col.acc, col.pink, col.hi, col.fg];
  g.globalAlpha = q;
  for (let i = 0; i < 22; i++) {
    const k = ((e / 1700) + i * 0.113) % 1, x = (i * 89 + 30) % 760 + 20 + Math.sin(e / 260 + i) * 12, y = 50 + k * 380;
    g.fillStyle = cs[i % cs.length]; g.fillRect(x, y, (i % 2 ? 1.6 : 1) * U, (i % 2 ? 0.9 : 1.5) * U);
  }
  g.globalAlpha = 1;
});

const nap = (e, a, b) => sm(seg(e, a, b));          // 0 -> 1 as he nods off
const shake = (e, k = 1) => ({ x: 4 * Math.sin(e / 23) * k, y: 2 * Math.cos(e / 29) * k });
const sleepyLine = o => (o.etat === 'sieste' ? pick(['Mmh… je fais la sieste…', 'Zzz… après la sieste…', 'Chut… sieste…'])
  : pick(['Mmh… c’est la nuit…', 'Zzz… dors bien…', 'Chut… on fait dodo…', 'Mmh… demain…', 'Zzz… encore cinq minutes…']));
const PEUR_FIN = { orage: 'Je n’ai plus peur de l’orage !', noir: 'Je n’ai plus peur du noir !', araignees: 'Je n’ai plus peur des araignées !', vide: 'Je n’ai plus le vertige !' };

// ---- his day ----
S('habitude-reveil', 'Il se réveille et s’étire', 'evt', { dur: 6200, on: ['habitude-reveil'], urgent: true, anim: [[0, 'reveil'], [2200, 'idle-etire'], [4200, 'salut']], mood: 'content', say: [[2400, 4100, L('Aaaah… bien dormi !', 'Mmmh… quelle bonne nuit !', 'Déjà le matin ?')], [4300, 6000, L('Bonjour !', 'Bonjour tout le monde !', 'Coucou, bonjour !')]], move: e => ({ sy: 1 + 0.16 * bump(seg(e, 2300, 4000)), sx: 1 - 0.07 * bump(seg(e, 2300, 4000)), y: -16 * bump(seg(e, 4300, 4900)) }), props: (D, e) => D.sun(e, seg(e, 0, 700) * (1 - seg(e, 5500, 6200))) });
S('habitude-annonce', 'Bientôt l’heure du dodo', 'evt', { dur: 5400, on: ['habitude-coucher'], urgent: true, when: d => !['dents', 'veilleuse', 'dodo'].includes(d.kind), anim: [[0, 'baille'], [2700, 'fatigue']], mood: 'baille', say: [[300, 2500, L('Ouaaah… je bâille.', 'Il commence à être tard…', 'Mes yeux piquent…')], [2700, 5200, L('Bientôt l’heure du dodo !', 'Bientôt au lit !', 'Je vais me préparer pour la nuit.')]], move: e => ({ y: 10 * sm(seg(e, 0, 1800)) * (1 - sm(seg(e, 4400, 5400))) }), props: (D, e) => { if (e > 1200) D.zzz(e - 1200, 0.4 * (1 - seg(e, 4600, 5400))); } });
S('habitude-dents', 'Il se brosse les dents', 'evt', { dur: 7800, on: ['habitude-coucher'], urgent: true, when: d => d.kind === 'dents', anim: [[0, 'content'], [6000, 'fier']], mood: 'content', say: [[300, 2300, L('Brossage de dents !', 'Les dents, c’est important !')], [2500, 5700, L('Frotte, frotte, frotte…', 'En haut, en bas…', 'Ça mousse !')], [6000, 7600, L('Des dents toutes propres !', 'Ting ! Ça brille !')]], move: e => ({ x: 3 * Math.sin(e / 70) * seg(e, 600, 900) * (1 - seg(e, 5600, 5900)) }), props: (D, e) => { D.habBrosse(e, seg(e, 300, 600) * (1 - seg(e, 5600, 6000))); if (e > 6000) D.stars(e - 6000); } });
S('habitude-veilleuse', 'Il demande sa veilleuse', 'evt', { dur: 5800, on: ['habitude-coucher'], urgent: true, when: d => d.kind === 'veilleuse', anim: [[0, 'timide'], [2900, 'content']], mood: 'amoureux', say: [[200, 2700, L('Tu me laisses la veilleuse ?', 'Une petite lumière, s’il te plaît…')], [2900, 5600, L('Merci… comme ça, j’ai pas peur.', 'Avec la veilleuse, ça va.')]], move: e => ({ r: -0.05 * sm(seg(e, 0, 500)) * (1 - sm(seg(e, 5000, 5800))) }), props: (D, e) => { const p = D.P(8, 46); D.habLampe(e, seg(e, 2400, 3000), p.x, p.y); } });
S('habitude-dodo', 'Il dit bonne nuit et s’endort', 'evt', { dur: 7200, on: ['habitude-coucher'], urgent: true, when: d => d.kind === 'dodo', anim: [[0, 'salut'], [1900, 'baille'], [3700, 'idle-somnole'], [5300, 'sommeil']], mood: 'endormi', say: [[200, 1900, L('Bonne nuit !', 'Bonne nuit, à demain !', 'Au dodo !')], [2100, 3600, L('Fais de beaux rêves…', 'Dors bien…', 'À demain matin…')]], move: e => ({ y: 10 * nap(e, 3600, 5600) - 12 * bump(seg(e, 200, 800)) }), props: (D, e) => { if (e > 4300) D.zzz(e - 4300, seg(e, 4300, 5000)); } });
S('habitude-sieste', 'Il commence sa sieste', 'evt', { dur: 6200, on: ['habitude-sieste'], urgent: true, when: d => d.kind !== 'fin', anim: [[0, 'baille'], [2100, 'idle-somnole'], [4100, 'sommeil']], mood: 'endormi', say: [[200, 2400, L('C’est l’heure de la sieste…', 'Une petite sieste…', 'Ouaaah… je fais la sieste.')], [2600, 4200, L('Réveille-moi après !', 'Chut…')]], move: e => ({ y: 10 * nap(e, 2000, 4400) }), props: (D, e) => { if (e > 3400) D.zzz(e - 3400, seg(e, 3400, 4000)); } });
S('habitude-fin-sieste', 'Il se réveille de sa sieste', 'evt', { dur: 5200, on: ['habitude-sieste'], urgent: true, when: d => d.kind === 'fin', anim: [[0, 'reveil'], [1800, 'idle-etire'], [3600, 'content']], mood: 'content', say: [[1900, 3500, L('Aaah, ça fait du bien !', 'Quelle bonne sieste !')], [3700, 5000, L('En pleine forme !', 'On fait quoi ?')]], move: e => ({ sy: 1 + 0.14 * bump(seg(e, 1900, 3500)), sx: 1 - 0.06 * bump(seg(e, 1900, 3500)), y: -12 * bump(seg(e, 3700, 4300)) }) });
S('habitude-marmonne', 'Il marmonne en dormant', 'tap', { dur: 3600, on: ['habitude-dodo'], urgent: true, when: d => !['calin', 'noir', 'lumiere'].includes(d.kind), anim: [[0, 'reve'], [2600, 'sommeil']], mood: 'endormi', say: [[200, 3300, sleepyLine]], move: e => ({ y: 4 * Math.sin(e / 400) * (1 - seg(e, 3000, 3600)), r: 0.03 * Math.sin(e / 500) * (1 - seg(e, 3000, 3600)) }), props: (D, e) => D.zzz(e, 0.8) });
S('habitude-dodo-calin', 'Un câlin pendant son sommeil', 'calin', { dur: 3800, on: ['habitude-dodo'], urgent: true, when: d => d.kind === 'calin', anim: [[0, 'reve'], [1900, 'sommeil']], mood: 'endormi', say: [[300, 3400, L('Mmmh… un câlin… zzz', 'Zzz… c’est doux…', 'Ronron… zzz')]], move: e => ({ s: 1 + 0.02 * Math.sin(e / 300) * (1 - seg(e, 3200, 3800)) }), props: (D, e) => { D.hearts(e, 0.5); D.zzz(e, 0.6); } });
S('habitude-dodo-noir', 'Il dort dans le noir', 'evt', { dur: 3400, on: ['habitude-dodo'], urgent: true, when: d => d.kind === 'noir' || d.kind === 'lumiere', anim: [[0, 'sommeil']], mood: 'endormi', say: [[200, 3000, o => (o.kind === 'lumiere' ? pick(['Mmh… trop de lumière…', 'Zzz… éteins…']) : pick(['Mmh… bonne nuit…', 'Zzz… merci…']))]], props: (D, e) => D.zzz(e, 0.7) });
S('habitude-pas-maintenant', 'Pas maintenant, il dort', 'evt', { dur: 3800, on: ['habitude-pas-maintenant'], urgent: true, anim: [[0, 'baille'], [2000, 'sommeil']], mood: 'baille', say: [[200, 3500, o => (o.quoi === 'reveil' ? pick(['Mmh… encore un peu… zzz', 'Zzz… c’est pas le matin…']) : o.etat === 'sieste' ? 'Chut… je fais la sieste…' : o.etat === 'coucher' ? 'C’est bientôt l’heure du dodo…' : o.quoi === 'blague' ? 'Chut… je dors… zzz' : 'Chut… on jouera demain…')]], move: e => ({ y: 6 * nap(e, 1500, 2800) }), props: (D, e) => { if (e > 1600) D.zzz(e - 1600, 0.7); } });
S('habitude-appris', 'Il retient ta phrase', 'evt', { dur: 6600, on: ['habitude-phrase'], urgent: true, when: d => d.kind !== 'dit', anim: [[0, 'ecoute'], [1600, 'idee'], [3200, 'content']], mood: 'content', say: [[100, 1500, L('D’accord !', 'Compris !', 'Je note !')], [1600, 3200, o => half(o.texte, 0)], [3200, 4800, o => half(o.texte, 1)], [5000, 6400, L('Je m’en souviendrai !', 'Retenu !')]], move: e => ({ y: -12 * bump(seg(e, 1600, 2100)) }), props: (D, e) => { if (e > 5000) D.stars(e - 5000); } });
S('habitude-dit', 'Il dit ta phrase', 'evt', { dur: 4400, on: ['habitude-phrase'], urgent: true, when: d => d.kind === 'dit', anim: [[0, 'parle'], [2800, 'content']], mood: 'content', say: [[200, 2200, o => half(o.texte, 0)], [2200, 4200, o => half(o.texte, 1)]], move: e => ({ y: -8 * bump(seg(e, 0, 500)) }) });

// ---- his games ----
S('jeu-envie', 'Il veut jouer avec toi', 'vie', { dur: 9000, w: 1, traits: { energique: 1 }, when: c => { const h = PH(); return !!(h && h.canPropose && h.canPropose(c)); }, init: o => { const h = PH(); o.jeu = (h && h.offre && h.offre()) || 'cache'; }, anim: [[0, 'curieux'], [1400, 'etoiles'], [3000, 'ecoute']], mood: 'excite', say: [[1500, 4200, o => `On joue à ${NOM_JEU[o.jeu] || 'cache-cache'} ?`], [4400, 8600, L('Touche « Oui » !', 'Allez, une partie !', 'Ça va être drôle !')]], move: e => { const k = sm(seg(e, 0, 900)) * (1 - sm(seg(e, 8200, 9000))); return { y: -34 * k - 14 * bump(seg(e, 1400, 1900)), s: 1 - 0.12 * k }; }, props: (D, e) => { if (e > 1400 && e < 3200) D.stars(e - 1400); } });
S('jeu-plustard', 'Il jouera plus tard', 'evt', { dur: 2400, anim: [[0, 'clin-oeil']], mood: 'clin', say: [[150, 2200, L('D’accord, plus tard !', 'Une autre fois !', 'Pas de souci !')]], move: e => ({ y: -10 * bump(seg(e, 0, 600)) }) });
S('jeu-go', 'C’est parti pour un jeu', 'evt', { dur: 2800, on: ['jeu-debut'], urgent: true, when: d => !d.favori, anim: [[0, 'etoiles'], [1600, 'content']], mood: 'excite', say: [[150, 2600, o => (NOM_JEU[o.jeu] ? `C’est parti : ${NOM_JEU[o.jeu]} !` : 'C’est parti !')]], move: e => ({ y: jumps(Math.min(e, 1000), 500, 22) }) });
S('jeu-prefere', 'Son jeu préféré', 'evt', { dur: 4400, on: ['jeu-debut'], urgent: true, when: d => !!d.favori, anim: [[0, 'etoiles'], [1900, 'danse']], mood: 'excite', say: [[150, 2000, L('Mon jeu préféré !!', 'Ouiii ! Mon jeu préféré !')], [2100, 4200, L('Je l’adore !', 'Trop bien !', 'Youpi !')]], move: e => ({ y: e < 3800 ? jumps(e, 520, 30) : 0, r: e > 1900 && e < 3800 ? 0.08 * Math.sin(e / 260) : 0 }), props: (D, e) => D.hearts(e, 1 - seg(e, 3800, 4400)) });
S('jeu-trouve', 'Tu l’as trouvé', 'evt', { dur: 2600, on: ['jeu-coup'], urgent: true, when: d => d.kind === 'trouve', anim: [[0, 'surpris'], [500, 'rire']], mood: 'content', say: [[200, 2400, L('Trouvé ! Hihi !', 'Tu m’as eu !', 'Zut, trouvé !')]], move: e => ({ y: -18 * bump(seg(e, 0, 600)) }), props: (D, e) => D.stars(e) });
S('jeu-rate', 'Pas là, hihi', 'evt', { dur: 2200, on: ['jeu-coup'], urgent: true, when: d => !['trouve', 'sorti', 'toi', 'lui', 'egal', 'suite', 'faux'].includes(d.kind), anim: [[0, 'clin-oeil']], mood: 'clin', say: [[100, 2000, L('Pas là ! Hihi !', 'Raté !', 'Hé hé, cherche encore !')]], move: e => ({ x: 4 * Math.sin(e / 40) * (1 - seg(e, 0, 600)) }) });
S('jeu-sorti', 'Il sort de sa cachette', 'evt', { dur: 2600, on: ['jeu-coup'], urgent: true, when: d => d.kind === 'sorti', anim: [[0, 'salut'], [1400, 'clin-oeil']], mood: 'content', say: [[200, 2400, L('Je suis là !', 'Coucou, j’étais là !', 'Hé hé, ici !')]], move: e => ({ y: -14 * bump(seg(e, 0, 600)) }) });
S('jeu-manche-toi', 'Tu gagnes la manche', 'evt', { dur: 2400, on: ['jeu-coup'], urgent: true, when: d => d.kind === 'toi', anim: [[0, 'surpris'], [700, 'content']], mood: 'content', say: [[300, 2200, L('Bien joué !', 'Tu gagnes celle-là !', 'Zut alors !')]], move: e => ({ y: -10 * bump(seg(e, 0, 500)) }) });
S('jeu-manche-lui', 'Il gagne la manche', 'evt', { dur: 2400, on: ['jeu-coup'], urgent: true, when: d => d.kind === 'lui', anim: [[0, 'fier']], mood: 'fier', say: [[300, 2200, L('Hé hé, à moi !', 'J’ai gagné celle-là !', 'Un point pour moi !')]], move: e => ({ r: -0.06 * bump(seg(e, 0, 1200)) }) });
S('jeu-egalite', 'Égalité au jeu', 'evt', { dur: 2200, on: ['jeu-coup'], urgent: true, when: d => d.kind === 'egal', anim: [[0, 'confus']], mood: 'confus', say: [[300, 2000, L('Pareil ! On rejoue !', 'Égalité !', 'Pareil que moi !')]] });
S('jeu-suite', 'Bravo, une couleur de plus', 'evt', { dur: 2000, on: ['jeu-coup'], urgent: true, when: d => d.kind === 'suite', anim: [[0, 'content']], mood: 'content', say: [[100, 1900, L('Bravo ! Une de plus !', 'Super mémoire !', 'Encore une !')]], move: e => ({ y: -12 * bump(seg(e, 0, 500)) }) });
S('jeu-oups', 'Oups, pas la bonne', 'evt', { dur: 2600, on: ['jeu-coup'], urgent: true, when: d => d.kind === 'faux', anim: [[0, 'surpris'], [900, 'content']], mood: 'surpris', say: [[200, 2400, L('Oups ! Pas la bonne.', 'Raté… pas grave !', 'Oh non, presque !')]] });
S('jeu-gagne', 'Tu as gagné la partie', 'evt', { dur: 5400, on: ['jeu-fin'], urgent: true, when: d => d.resultat === 'gagne', anim: [[0, 'etoiles'], [2300, 'danse']], mood: 'excite', say: [[150, 2200, L('Bravo, tu as gagné !', 'Tu as gagné !', 'Champion !')], [2400, 5200, o => (o.record ? 'Nouveau record !' : pick(['Tu es trop fort !', 'Quelle partie !', 'On rejoue ?']))]], move: e => ({ y: e < 4600 ? jumps(e, 560, 26) : 0 }), props: (D, e) => D.habConfettis(e, 1 - seg(e, 4800, 5400)) });
S('jeu-il-gagne', 'Il a gagné la partie', 'evt', { dur: 5200, on: ['jeu-fin'], urgent: true, when: d => d.resultat === 'perdu', anim: [[0, 'fier'], [1900, 'rire'], [4200, 'clin-oeil']], mood: 'fier', say: [[150, 1800, L('J’ai gagné !', 'Hé hé, j’ai gagné !')], [1900, 5000, o => (o.rit ? pick(['Ha ha ha ! Trop drôle !', 'Hihihi ! Je suis trop content !']) : pick(['Bien joué quand même !', 'Tu me battras la prochaine fois !', 'On rejoue ?']))]], move: (e, p, o) => ({ ...(o.rit && e > 1900 && e < 4200 ? shake(e, 1) : {}), r: o.rit ? 0.06 * Math.sin(e / 90) * seg(e, 1900, 2100) * (1 - seg(e, 3900, 4200)) : 0 }), props: (D, e, p, o) => { if (o.rit && e > 2100 && e < 4300) D.habLarmes(e, 1); } });
S('jeu-fini', 'Fin de la partie', 'evt', { dur: 4400, on: ['jeu-fin'], urgent: true, when: d => !['gagne', 'perdu'].includes(d.resultat), anim: [[0, 'content'], [2200, 'clin-oeil']], mood: 'content', say: [[150, 2100, o => (o.jeu === 'etoiles' && o.score != null ? `${o.score} étoile${o.score > 1 ? 's' : ''} !` : o.jeu === 'simon' && o.score ? `${o.score} couleurs de suite !` : o.resultat === 'egal' ? 'Égalité !' : 'Fin de la partie !')], [2200, 4200, L('Bien joué !', 'On rejoue ?', 'C’était chouette !')]], move: e => ({ y: -10 * bump(seg(e, 0, 600)) }) });

// ---- what makes him laugh ----
const laughMove = (e, a, b, k = 1) => (e > a && e < b ? { ...shake(e, k), r: 0.07 * k * Math.sin(e / 80) * seg(e, a, a + 200) * (1 - seg(e, b - 300, b)), y: -6 * k * Math.abs(Math.sin(e / 110)) } : {});
S('rire-blague', 'Il raconte une blague', 'evt', { dur: 9200, on: ['rire-blague'], urgent: true, traits: { farceur: 1 }, when: d => d.aime !== false && !d.fou, anim: [[0, 'parle'], [3600, 'idee'], [6200, 'rire']], mood: 'content', say: [[200, 3400, o => joke(o.n)[0]], [3600, 6000, o => joke(o.n)[1]], [6200, 9000, L('Ha ha ha !', 'Hi hi hi !', 'Ha ha ! Elle est bonne !')]], move: e => laughMove(e, 6200, 9000), props: (D, e) => { if (e > 6400 && e < 8900) D.habLarmes(e, 1); } });
S('rire-blague-fou', 'Il rit de sa blague', 'evt', { dur: 11200, on: ['rire-blague'], urgent: true, traits: { farceur: 1 }, when: d => d.aime !== false && !!d.fou, anim: [[0, 'parle'], [3600, 'idee'], [6200, 'rire'], [10200, 'content']], mood: 'content', say: [[200, 3400, o => joke(o.n)[0]], [3600, 6000, o => joke(o.n)[1]], [6200, 8400, L('HA HA HA HA !', 'Hahahahaha !')], [8500, 10900, L('J’en peux plus !', 'Je l’adore, celle-là !', 'Hihi… je ris trop !')]], move: e => laughMove(e, 6200, 10200, 1.5), props: (D, e) => { if (e > 6400 && e < 10200) D.habLarmes(e, 1); } });
S('rire-blague-bof', 'Une blague sans rire', 'evt', { dur: 7800, on: ['rire-blague'], urgent: true, when: d => d.aime === false, anim: [[0, 'parle'], [3600, 'idee'], [6200, 'clin-oeil']], mood: 'content', say: [[200, 3400, o => joke(o.n)[0]], [3600, 6000, o => joke(o.n)[1]], [6200, 7600, L('Hé hé.', 'Pas mal, non ?')]] });
S('rire-grimace', 'Il fait une grimace', 'evt', { dur: 5800, on: ['rire-grimace'], urgent: true, traits: { farceur: 1 }, when: d => d.aime !== false, anim: [[0, 'idle-regard'], [1200, 'rire'], [3700, 'clin-oeil']], mood: 'content', say: [[1300, 3500, L('Bleuh !', 'Grimace !', 'Nya nya nya !')], [3700, 5600, o => (o.fou ? pick(['HA HA ! Je suis trop drôle !', 'Hahaha ! T’as vu ma tête ?']) : pick(['Ha ha ha !', 'Hi hi, je suis drôle !']))]], move: e => ({ sx: 1 + 0.12 * bump(seg(e, 1200, 2100)) - 0.08 * bump(seg(e, 2100, 3100)), sy: 1 - 0.1 * bump(seg(e, 1200, 2100)) + 0.1 * bump(seg(e, 2100, 3100)), ...laughMove(e, 3700, 5600, 0.8) }), props: (D, e, p, o) => D.habGrimace(e, sm(seg(e, 1200, 1500)) * (1 - seg(e, 3300, 3700)), o.n) });
S('rire-grimace-bof', 'Une grimace sans rire', 'evt', { dur: 4600, on: ['rire-grimace'], urgent: true, when: d => d.aime === false, anim: [[0, 'idle-regard'], [1200, 'rire'], [3400, 'confus']], mood: 'content', say: [[1300, 3200, L('Bleuh !', 'Grimace !')], [3400, 4400, L('Bon… pas si drôle.', 'Hum.')]], props: (D, e, p, o) => D.habGrimace(e, sm(seg(e, 1200, 1500)) * (1 - seg(e, 3000, 3400)), o.n) });
S('rire-bruit', 'Il fait un bruit rigolo', 'evt', { dur: 4600, on: ['rire-bruit'], urgent: true, traits: { farceur: 1 }, when: d => d.aime !== false, anim: [[0, 'idee'], [900, 'rire']], mood: 'content', say: [[200, 2000, o => BRUITS[((Number(o.n) || 0) % BRUITS.length + BRUITS.length) % BRUITS.length]], [2200, 4400, o => (o.fou ? pick(['HIHIHI ! Encore !', 'Hahaha ! Pardon !']) : pick(['Ha ha ha !', 'Hihihi !', 'Pardon ! Hihi.']))]], move: e => ({ sy: 1 - 0.14 * bump(seg(e, 200, 600)), ...laughMove(e, 2200, 4400) }), props: (D, e, p, o) => D.habMot(e, seg(e, 200, 500) * (1 - seg(e, 1700, 2100)), BRUITS[((Number(o.n) || 0) % BRUITS.length + BRUITS.length) % BRUITS.length].replace(/ !$/, '').toUpperCase()) });
S('rire-bruit-bof', 'Un bruit sans rire', 'evt', { dur: 3600, on: ['rire-bruit'], urgent: true, when: d => d.aime === false, anim: [[0, 'idee'], [1800, 'timide']], mood: 'content', say: [[200, 1700, o => BRUITS[((Number(o.n) || 0) % BRUITS.length + BRUITS.length) % BRUITS.length]], [1900, 3400, L('…pardon.', 'Hum.')]] });
S('rire-chatouilles', 'Il rit aux chatouilles', 'tap', { dur: 3400, on: ['rire-chatouilles'], urgent: true, traits: { farceur: 1 }, when: d => !d.fou, anim: [[0, 'rire']], mood: 'content', say: [[100, 3200, L('Hihihi ! Ça chatouille !', 'Arrête, hihi !', 'Hahaha, pas là !', 'Hihi, encore !')]], move: e => laughMove(e, 0, 3400, 1.2) });
S('rire-fou', 'Il a le fou rire', 'tap', { dur: 6400, on: ['rire-chatouilles'], urgent: true, traits: { farceur: 1 }, when: d => !!d.fou, anim: [[0, 'rire'], [4400, 'content']], mood: 'content', say: [[100, 2400, L('Hahahaha !', 'HIHIHI !')], [2500, 4800, L('J’en peux plus !', 'Arrête, je vais exploser de rire !')], [4900, 6200, L('Ouf… hihi.', 'Pfiou !')]], move: e => laughMove(e, 0, 4600, 1.7), props: (D, e) => { if (e > 600 && e < 4600) D.habLarmes(e, 1); } });

// ---- his fears: never really scary ----
S('peur-orage', 'Il a peur de l’orage', 'evt', { dur: 9200, on: ['peur-orage'], urgent: true, when: d => !(d.courage >= 70), anim: [[0, 'surpris'], [600, 'panique'], [3800, 'triste'], [6400, 'timide']], mood: 'surpris', say: [[700, 2600, L('BOUM !', 'Aaah, l’orage !', 'Le tonnerre !')], [2800, 6000, o => (o.courage >= 40 ? pick(['J’ai… un peu peur.', 'Même pas… enfin, un peu peur.']) : pick(['J’ai peur de l’orage…', 'Je me cache !', 'Brrr…']))], [6400, 9000, L('Tu me fais un câlin ?', 'Caresse-moi, ça me rassure.')]], move: e => { const hide = sm(seg(e, 900, 1700)) * (1 - sm(seg(e, 7600, 9000))); return { ...shake(e, 0.6 * hide + 0.6 * bump(seg(e, 0, 500))), x: -150 * hide + shake(e).x * hide, y: 90 * hide - 30 * bump(seg(e, 0, 500)), s: 1 - 0.3 * hide }; }, props: (D, e) => { const f = Math.max(bump(seg(e, 0, 240)), bump(seg(e, 1150, 1330)) * 0.8); D.habEclair(e, seg(e, 0, 300) * (1 - seg(e, 8400, 9200)), f); if (e > 700 && e < 6400) D.sweat(e); } });
S('peur-orage-brave', 'Il brave l’orage', 'evt', { dur: 5400, on: ['peur-orage'], urgent: true, when: d => d.courage >= 70, anim: [[0, 'surpris'], [1300, 'fier']], mood: 'fier', say: [[300, 2300, L('Oh, l’orage…', 'Tiens, du tonnerre.')], [2500, 5200, o => (o.courage >= 100 ? pick(['Même pas peur !', 'L’orage ? Trop facile !']) : pick(['Même pas peur ! Enfin… presque.', 'Je suis courageux, moi !']))]], move: e => ({ y: -12 * bump(seg(e, 0, 400)) }), props: (D, e) => D.habEclair(e, 1 - seg(e, 4600, 5400), bump(seg(e, 0, 220)) * 0.7) });
S('peur-noir', 'Il a peur du noir', 'evt', { dur: 8600, on: ['peur-noir'], urgent: true, when: d => !d.off && !(d.courage >= 70), anim: [[0, 'panique'], [2700, 'triste'], [5800, 'timide']], mood: 'surpris', say: [[200, 2500, L('Il fait tout noir !', 'Qui a éteint ?!')], [2700, 5600, o => (o.courage >= 40 ? 'J’ai… un tout petit peu peur.' : pick(['J’ai peur du noir…', 'Je n’aime pas le noir…']))], [5800, 8400, L('Tu me fais un câlin ?', 'Reste avec moi…')]], move: e => shake(e, 0.5 * (1 - seg(e, 5600, 6400))), props: (D, e) => D.habNoir(e, seg(e, 0, 250) * (1 - seg(e, 7800, 8600)), e < 5600) });
S('peur-noir-brave', 'Il n’a pas peur du noir', 'evt', { dur: 4600, on: ['peur-noir'], urgent: true, when: d => !!d.off || d.courage >= 70, anim: [[0, 'surpris'], [1500, 'fier']], mood: 'fier', say: [[200, 2100, L('Oh, il fait noir.', 'Tiens, plus de lumière.')], [2300, 4400, L('Même pas peur !', 'Je suis grand, maintenant !')]], props: (D, e) => D.habNoir(e, 0.75 * seg(e, 0, 300) * (1 - seg(e, 3600, 4600)), false) });
S('peur-araignee', 'Une petite araignée passe', 'vie', { dur: 9600, w: 1, when: c => { const h = PH(); return !!(h && h.spiderOk && h.spiderOk(c)); }, init: o => { o.sx = rnd() < 0.5 ? 150 + rnd() * 90 : 560 + rnd() * 90; PK.spider = o; }, anim: [[0, 'idle-regard'], [1800, 'surpris'], [2400, 'panique'], [8400, 'timide']], mood: 'surpris', say: [[2400, 4600, L('Une araignée !', 'Aaah, une araignée !')], [4800, 7800, L('Chasse-la ! Touche-la !', 'Fais-la partir !')], [8400, 9400, L('Ouf… elle est partie.', 'Pfiou…')]], move: (e, p, o) => { const k = sm(seg(e, 1900, 2500)) * (1 - sm(seg(e, 8200, 9400))), away = o.sx > 400 ? -1 : 1; return { x: away * 110 * k + 3 * Math.sin(e / 30) * k, y: 20 * k, s: 1 - 0.12 * k }; }, props: (D, e, p, o) => D.habAraignee(e, 1, o) });
S('peur-araignee-partie', 'L’araignée s’en va', 'evt', { dur: 3800, on: ['peur-araignee'], urgent: true, anim: [[0, 'surpris'], [900, 'content']], mood: 'content', say: [[300, 1900, L('Au revoir, petite araignée !', 'Elle est partie !')], [2000, 3600, L('Merci !', 'Ouf, merci !')]], move: e => ({ y: -14 * bump(seg(e, 900, 1500)) }), props: (D, e) => D.habAraigneeFile(e, 1 - seg(e, 900, 1000)) });
S('peur-vide', 'Il a le vertige', 'evt', { dur: 5400, w: 40, on: ['poche-glisse'], urgent: true, when: () => fearOn('vide'), anim: [[0, 'panique'], [3000, 'timide']], mood: 'surpris', say: [[100, 2600, L('Aaah ! J’ai le vertige !', 'Au secours, je glisse !')], [2800, 5200, L('Remets-moi droit !', 'Tiens-moi bien !')]], move: (e, p, o) => ({ ...shake(e, 0.8 * (1 - seg(e, 4600, 5400))), r: (o.side || 1) * 0.1 * sm(seg(e, 0, 400)) * (1 - sm(seg(e, 4400, 5400))) }), props: (D, e) => D.sweat(e) });
S('peur-rassure', 'Il est rassuré', 'evt', { dur: 4600, on: ['peur-rassure'], urgent: true, when: d => !d.vaincue, anim: [[0, 'timide'], [1700, 'amoureux']], mood: 'amoureux', say: [[200, 2100, L('Merci… ça va mieux.', 'Ouf… merci.')], [2300, 4400, o => (o.courage >= 60 ? 'Je deviens courageux !' : pick(['Avec toi, j’ai moins peur.', 'Tu es gentil.']))]], move: e => ({ s: 1 + 0.03 * Math.sin(e / 250) * (1 - seg(e, 4000, 4600)) }), props: (D, e) => D.hearts(e, 0.9) });
S('peur-vaincue', 'Il n’a plus peur', 'evt', { dur: 5600, on: ['peur-rassure'], urgent: true, when: d => !!d.vaincue, anim: [[0, 'fier'], [2700, 'etoiles']], mood: 'fier', say: [[200, 2600, o => PEUR_FIN[o.peur] || 'Je n’ai plus peur !'], [2800, 5400, L('Je suis courageux !', 'Grâce à toi !')]], move: e => ({ y: e > 2700 ? jumps(Math.min(e - 2700, 2000), 500, 24) : 0 }), props: (D, e) => { if (e > 2700) D.stars(e - 2700); } });
});
