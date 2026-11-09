/* Scene pack « look » — his look (pixel/look.py, web/look.js), seen on his face: what he wears is drawn by the face itself
   (themes.js), these scenes are how he takes it.
   See the top of web/persona.js: scenes are defined with S('id', 'Label', 'group', { ... }) on one line each
   (pixel/scenes.py reads them), groups tap / fache / calin / retour / vie / evt, plus "on" (events) and "pool" (touch pools).
   - A change (event 'look', data.quoi: yeux, couleur, porte, enleve, tenue, normal, avant, reglage; data.item, yeux, couleur, ou,
     tenue, what, value): he admires himself in a little mirror (« Ça me va ? »), shows off (a farceur, an energetic one), blushes
     (a shy one), grumbles (a grumpy one) or wants a cuddle (a cuddly one): those two only with that character (data.car, his
     traits: web/look.js hands them over), so the Pixel of every day never grumbles at his new hat. Eyes wide open. At night,
     in his pyjama, what goes on his head, ears, eyes or neck waits for the morning (« Je le mettrai demain ! », look-demain).
   - His pyjama goes on at night (event 'look-nuit'), comes off in the morning ('look-jour'); a season's outfit arrives by itself
     ('look-saison', data.item, data.saison): the snow for the bonnet, bats at Halloween, confetti for a party, the sun.
   - No moment of life of its own (group « vie »): the Pixel of every day lives exactly as before, whatever he wears.
   Labels start with « Son look » (pixel/scenes.py keeps the first scene for a word, and this pack comes before most others). */
(window.PixelScenePacks ||= []).push(({ S, L, pick, sm, out, seg, bump, jumps, clamp, TAU, W, HT, prop }) => {
const SHAPE_SAY = { rond: 'Mes yeux ronds de toujours !', carre: 'Des yeux carrés !', amande: 'Des yeux en amande…', etoile: 'Des étoiles plein les yeux !',
  coeur: 'Des yeux en cœur !', chat: 'Miaou ! Des yeux de chat !', lunettes: 'Mes lunettes ! Je vois tout !' };
const ITEM_SAY = { chapeau: 'Un chapeau ! Très chic.', casquette: 'Ma casquette !', couronne: 'Une couronne ! Je suis le roi !', antenne: 'Bip bip ! Je capte tout !',
  bonnet: 'Bien au chaud !', fete: 'C’est la fête !', sorciere: 'Abracadabra !', citrouille: 'Une citrouille ! Bouh !', 'pere-noel': 'Ho ho ho !',
  'bonnet-nuit': 'Mon bonnet de nuit…', 'lunettes-soleil': 'Trop cool, les lunettes !', moustache: 'Une moustache ! Hon hon.', noeud: 'Un nœud papillon !',
  echarpe: 'Mon écharpe !', pyjama: 'Mon pyjama !', casque: 'Musique !' };
const TENUE_SAY = { hiver: 'Bien au chaud pour l’hiver !', ete: 'Prêt pour l’été !', halloween: 'Joyeux Halloween !', noel: 'Joyeux Noël !', fete: 'C’est la fête !',
  chic: 'Très chic !', roi: 'Je suis le roi !', musique: 'En musique !', nuit: 'Prêt pour dormir…' };
const EYES = { bleu: 'bleus', turquoise: 'turquoise', vert: 'verts', jaune: 'jaunes', orange: 'orange', rouge: 'rouges', rose: 'roses', violet: 'violets', marron: 'marron' };
const CHEEKS = { bleu: 'bleues', turquoise: 'turquoise', vert: 'vertes', jaune: 'jaunes', orange: 'orange', rouge: 'rouges', rose: 'roses', violet: 'violettes', marron: 'marron' };
const said = o => {                                    // his first words, by what changed
  if (o.quoi === 'yeux') return SHAPE_SAY[o.yeux] || 'Mes nouveaux yeux !';
  if (o.quoi === 'couleur') {
    if (o.couleur === 'theme') return o.ou === 'joues' ? 'Mes joues de toujours !' : 'Mes yeux de toujours !';
    if (o.couleur === 'arc') return 'Des yeux arc-en-ciel !';
    return o.ou === 'joues' ? `Les joues ${CHEEKS[o.couleur] || ''} !` : `Des yeux ${EYES[o.couleur] || ''} !`;
  }
  if (o.quoi === 'porte') return ITEM_SAY[o.item] || 'Tadaa !';
  if (o.quoi === 'tenue') return TENUE_SAY[o.tenue] || 'Tadaa !';
  if (o.quoi === 'avant') return 'Comme avant !';
  return 'Tadaa !';
};
const SETTING = o => (o.what === 'saisons' ? (o.value ? 'Les tenues de saison, c’est parti !' : 'Plus de tenues de saison.') : o.what === 'nuit'
  ? (o.value ? 'Mon pyjama la nuit, promis !' : 'Pas de pyjama ? D’accord !') : o.value ? 'Tout en vert, comme avant !' : 'Des couleurs partout !');
const later = d => !!d.nuit && ((d.quoi === 'porte' && d.slot !== 'visage') || d.quoi === 'tenue');   // in his pyjama: a hat, a bow tie… wait for the morning
const dressed = d => ['porte', 'tenue', 'yeux', 'couleur', 'avant'].includes(d.quoi) && !later(d);
const anyNews = d => !['enleve', 'normal', 'reglage'].includes(d.quoi) && !later(d);     // the mirror: any other change, even one this pack does not know
const leans = (d, trait) => !!d.car && typeof d.car[trait] === 'number' && d.car[trait] >= 70;   // his character leans that way (data.car: his traits)
const on = ['look'];
const poly = (g, pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); };

// ---- the props ----
prop('lookMiroir', (D, e, q) => {                     // a little hand mirror by his side, a shine sweeping across it
  if (q <= 0) return;
  const { g, col, lw, U, P } = D, o = P(88, 26), x = Math.min(o.x, W - 14 - 7 * U), y = clamp(o.y, 70 + 9 * U, HT - 80 - 16 * U) + (1 - out(q)) * 30;
  g.globalAlpha = Math.min(1, q * 1.5); g.lineCap = 'round';
  g.strokeStyle = col.acc; g.lineWidth = lw(2.2 * U); g.beginPath(); g.moveTo(x + 1.5 * U, y + 7.5 * U); g.lineTo(x + 3.5 * U, y + 15.5 * U); g.stroke();   // the handle
  g.fillStyle = col.bg; g.beginPath(); g.ellipse(x, y, 5.6 * U, 7.4 * U, -0.18, 0, TAU); g.fill();
  g.strokeStyle = col.acc; g.lineWidth = lw(1.3 * U); g.stroke();
  const k = ((e / 1300) % 1) * 2 - 1;                                          // the shine
  g.save(); g.beginPath(); g.ellipse(x, y, 4.6 * U, 6.4 * U, -0.18, 0, TAU); g.clip();
  g.strokeStyle = col.hi; g.lineWidth = lw(1.2 * U); g.beginPath(); g.moveTo(x + k * 7 * U - 2 * U, y + 6 * U); g.lineTo(x + k * 7 * U + 2 * U, y - 6 * U); g.stroke(); g.restore();
  g.fillStyle = col.hi; g.beginPath(); g.arc(x - 2 * U, y - 3.4 * U, 0.9 * U, 0, TAU); g.fill();
  g.globalAlpha = 1;
});
prop('lookLune', (D, e, q) => {                       // a crescent moon and a few stars over his shoulder: bedtime
  if (q <= 0) return;
  const { g, col, U, P, star } = D, o = P(84, 6), x = Math.min(o.x, W - 20 - 6 * U), y = Math.max(o.y, 66 + 6 * U);
  g.globalAlpha = q; g.fillStyle = col.acc; g.beginPath(); g.arc(x, y, 4.4 * U, 0, TAU); g.fill();
  g.fillStyle = col.bg; g.beginPath(); g.arc(x + 1.9 * U, y - 1.3 * U, 3.8 * U, 0, TAU); g.fill();
  for (let i = 0; i < 3; i++) { const tw = 0.6 + 0.4 * Math.sin(e / 300 + i * 2); star(x - (7 + i * 4.5) * U, y + (i % 2 ? 4 : -2) * U, (1 + 0.5 * tw) * U, col.hi, e / 900 + i); }
  g.globalAlpha = 1;
});
prop('lookChauvesSouris', (D, e, q) => {              // little bats flapping around him: Halloween
  if (q <= 0) return;
  const { g, col, U } = D, c = D.at('c');
  g.globalAlpha = q; g.fillStyle = col.dim;
  for (let i = 0; i < 3; i++) {
    const a = e / 1500 + i * TAU / 3, x = clamp(c.x + Math.cos(a) * 46 * U, 24, W - 24), y = clamp(c.y - 14 * U + Math.sin(a * 2) * 8 * U, 60, HT - 70), f = Math.sin(e / 70 + i) * 0.5 + 0.5, s = 1.6 * U;
    g.beginPath(); g.ellipse(x, y, s * 0.8, s * 0.6, 0, 0, TAU); g.fill();
    for (const d of [-1, 1]) { g.beginPath(); g.moveTo(x + d * s * 0.6, y); g.lineTo(x + d * s * 3.2, y - s * (0.4 + 1.4 * f)); g.lineTo(x + d * s * 2.4, y + s * 0.3); g.lineTo(x + d * s * 1.6, y - s * 0.1); g.closePath(); g.fill(); }
  }
  g.globalAlpha = 1;
});
prop('lookConfettis', (D, e, q) => {                  // confetti raining down: a party
  if (q <= 0) return;
  const { g, col, U } = D, cs = [col.acc, col.pink, col.hi, col.fg];
  g.globalAlpha = q;
  for (let i = 0; i < 22; i++) {
    const sp = 60 + (i * 37 % 9) * 9, y = 50 + ((e / 1000) * sp + i * 61) % 380, x = (i * 113 + 40) % 760 + 20 + Math.sin(e / 400 + i) * 10, a = e / 300 + i;
    g.fillStyle = cs[i % 4]; g.save(); g.translate(x, y); g.rotate(a); g.fillRect(-0.9 * U, -0.45 * U, 1.8 * U, 0.9 * U); g.restore();
  }
  g.globalAlpha = 1;
});

// ---- a change: he takes his new look ----
S('look-miroir', 'Son look : il s’admire', 'evt', { dur: 4800, w: 3, side: true, on, when: anyNews, anim: [[0, 'surpris'], [700, 'curieux'], [2600, 'idle-regard']], mood: 'ecoute',
  say: [[250, 2400, o => said(o)], [2500, 4600, L('Ça me va ?', 'Je suis beau, non ?', 'Pas mal, hein ?', 'Trop classe !')]],
  move: e => { const k = sm(seg(e, 400, 1000)) * (1 - sm(seg(e, 4000, 4800))); return { x: -44 * k, r: -0.05 * k, y: -10 * bump(seg(e, 0, 500)) }; },
  props: (D, e) => { D.lookMiroir(e, seg(e, 500, 900) * (1 - seg(e, 4200, 4800))); if (e < 1600) D.stars(e); } });
S('look-frime', 'Son look : il frime', 'evt', { dur: 4600, w: 1, side: true, on, when: dressed, traits: { farceur: 0.6, energique: 0.6 }, anim: [[0, 'etoiles'], [900, 'danse'], [3400, 'clin-oeil']], mood: 'excite',
  say: [[200, 2000, o => said(o)], [2100, 4400, L('Regardez-moi !', 'La classe !', 'Je suis le plus beau !')]],
  move: e => ({ y: e > 900 && e < 3300 ? jumps(e - 900, 420, 22) : -12 * bump(seg(e, 0, 500)), x: e > 900 && e < 3300 ? 30 * Math.sin((e - 900) / 360) : 0 }),
  props: (D, e) => { if (e > 900 && e < 3500) D.stars(e - 900); } });
S('look-timide', 'Son look : il rougit', 'evt', { dur: 4400, w: 1, side: true, on, when: dressed, traits: { bavard: -0.7, calin: 0.3 }, anim: [[0, 'surpris'], [800, 'timide']], mood: 'amoureux',
  say: [[200, 2000, o => said(o)], [2200, 4200, L('Tu trouves que ça me va ?', 'Oh… tu me regardes ?', 'Hi hi…')]],
  move: e => { const k = sm(seg(e, 800, 1400)) * (1 - sm(seg(e, 3600, 4400))); return { x: -18 * k, r: -0.05 * k }; }, props: (D, e) => D.blush(sm(seg(e, 900, 1500)) * (1 - seg(e, 3800, 4400))) });
S('look-ronchon', 'Son look : il ronchonne', 'evt', { dur: 4600, w: 1, side: true, on, when: d => dressed(d) && leans(d, 'grognon'), traits: { grognon: 1 }, anim: [[0, 'boudeur'], [2400, 'fier']], mood: 'fache',
  say: [[200, 2200, L('Pff… bon, d’accord.', 'Hmpf. Si tu veux.', 'Mouais…')], [2400, 4400, L('…c’est pas mal, en fait.', '…bon, ça me va.', '…je suis pas mal, hein.')]],
  move: e => ({ x: 5 * Math.sin(e / 40) * seg(e, 200, 400) * (1 - seg(e, 1400, 1800)), y: -10 * bump(seg(e, 2400, 2900)) }) });
S('look-calin', 'Son look : il veut un câlin', 'evt', { dur: 4400, w: 1, side: true, on, when: d => dressed(d) && leans(d, 'calin'), traits: { calin: 1 }, anim: [[0, 'surpris'], [900, 'amoureux']], mood: 'amoureux',
  say: [[200, 2000, o => said(o)], [2100, 4200, L('Tu me trouves beau ? Câlin !', 'Je l’ai mis pour toi !', 'Merci ! Un bisou ?')]],
  move: e => ({ s: 1 + 0.06 * bump(seg(e, 900, 2200)) }), props: (D, e) => { if (e > 900) D.hearts(e - 900, 1); } });
S('look-leger', 'Son look : il enlève tout', 'evt', { side: true, dur: 3800, on, when: d => d.quoi === 'enleve' || d.quoi === 'normal', anim: [[0, 'surpris'], [600, 'idle-etire'], [2400, 'content']], mood: 'ecoute',
  say: [[200, 2200, o => (o.quoi === 'normal' ? 'Me revoilà comme d’habitude !' : o.item === 'tout' ? 'Plus rien ! Léger comme l’air !' : o.item === 'lunettes' ? 'Sans mes lunettes, je vois flou !' : 'Ah, ça fait du bien !')],
    [2300, 3700, L('Hop !', 'Et voilà.', 'Tout simple.')]],
  move: e => ({ y: -16 * bump(seg(e, 0, 500)), sy: 1 + 0.08 * bump(seg(e, 600, 1800)) }) });
S('look-reglage', 'Son look : réglage noté', 'evt', { side: true, dur: 3200, on, when: d => d.quoi === 'reglage', anim: [[0, 'ecoute'], [1200, 'content']], mood: 'ecoute', say: [[200, 3000, o => SETTING(o)]],
  move: e => ({ y: 8 * bump(seg(e, 300, 700)) + 8 * bump(seg(e, 800, 1200)) }) });
S('look-demain', 'Son look : pour demain', 'evt', { side: true, dur: 4600, on, when: later, anim: [[0, 'baille'], [2200, 'content']], mood: 'baille',
  say: [[300, 2200, L('Oh, c’est joli…', 'Pour moi ?')], [2400, 4400, L('Je le mettrai demain !', 'Demain, promis !', 'Après dodo !')]],
  move: e => ({ y: 6 * bump(seg(e, 0, 700)) }) });

// ---- the night: his pyjama goes on, then off in the morning ----
S('look-dodo', 'Son look : le pyjama', 'evt', { side: true, dur: 6400, on: ['look-nuit'], anim: [[0, 'baille'], [2600, 'fatigue'], [4600, 'sommeil']], mood: 'baille',
  say: [[300, 2500, L('C’est l’heure du pyjama !', 'Hop, mon bonnet de nuit !', 'Pyjama !')], [2700, 4600, L('Bonne nuit…', 'Fais de beaux rêves…', 'À demain…')]],
  move: e => ({ y: 16 * sm(seg(e, 2400, 4600)) - 12 * bump(seg(e, 0, 600)) }), props: (D, e) => { D.lookLune(e, seg(e, 600, 1200) * (1 - seg(e, 5800, 6400))); if (e > 4400) D.zzz(e - 4400, 1); } });
S('look-debout', 'Son look : debout', 'evt', { side: true, dur: 5200, on: ['look-jour'], anim: [[0, 'reveil'], [2000, 'idle-etire'], [3800, 'salut']], mood: 'content',
  say: [[400, 2400, L('Debout !', 'Bien dormi !', 'Le soleil est levé !')], [2600, 5000, L('J’enlève mon pyjama !', 'Je m’habille !', 'Au revoir, bonnet de nuit !')]],
  move: e => ({ sy: 1 + 0.1 * bump(seg(e, 2000, 3600)), y: -14 * bump(seg(e, 3800, 4400)) }) });

// ---- a season's outfit arrives by itself ----
S('look-hiver', 'Son look : le froid', 'evt', { side: true, dur: 5600, on: ['look-saison'], when: d => d.item === 'bonnet' || d.item === 'echarpe', anim: [[0, 'surpris'], [900, 'content']], mood: 'content',
  say: [[300, 2600, L('Brrr ! Il fait froid !', 'L’hiver est là !')], [2800, 5400, L('Mon bonnet et mon écharpe !', 'Bien au chaud !')]],
  move: e => ({ x: 4 * Math.sin(e / 35) * (1 - seg(e, 0, 900)) }), props: (D, e) => D.snow(e, seg(e, 0, 600) * (1 - seg(e, 5000, 5600))) });
S('look-halloween', 'Son look : Halloween', 'evt', { side: true, dur: 5600, on: ['look-saison'], when: d => d.saison === 'halloween', anim: [[0, 'surpris'], [900, 'rire']], mood: 'content',
  say: [[300, 2600, L('Bouh ! Joyeux Halloween !', 'Des bonbons ou un sort !')], [2800, 5400, o => (o.item === 'citrouille' ? 'Ma citrouille te fait peur ?' : 'Mon chapeau de sorcière !')]],
  move: e => ({ y: -14 * bump(seg(e, 0, 600)) }), props: (D, e) => D.lookChauvesSouris(e, seg(e, 300, 900) * (1 - seg(e, 5000, 5600))) });
S('look-noel', 'Son look : le bonnet de Noël', 'evt', { side: true, dur: 5400, on: ['look-saison'], when: d => d.saison === 'noel', anim: [[0, 'salut'], [2400, 'etoiles']], mood: 'excite',
  say: [[300, 2400, L('Ho ho ho !', 'Mon bonnet de Père Noël !')], [2600, 5200, L('Vive le vent d’hiver !', 'Bientôt les cadeaux !')]],
  move: e => ({ y: e < 4400 ? jumps(e, 600, 22) : 0 }), props: (D, e) => D.snow(e, seg(e, 0, 600) * (1 - seg(e, 4800, 5400))) });
S('look-fete', 'Son look : la fête', 'evt', { side: true, dur: 5400, on: ['look-saison'], when: d => d.item === 'fete', anim: [[0, 'surpris'], [800, 'danse'], [4200, 'etoiles']], mood: 'excite',
  say: [[200, 2400, o => (o.saison === 'anniversaire' ? 'Joyeux anniversaire !' : o.saison === 'rencontre' ? 'C’est notre jour !' : o.saison === 'nouvel-an' ? 'Bonne année !' : 'C’est la fête !')], [2600, 5200, L('Mon chapeau de fête !', 'Youpi !')]],
  move: e => ({ y: e > 800 && e < 4200 ? jumps(e - 800, 420, 24) : 0 }), props: (D, e) => D.lookConfettis(e, seg(e, 300, 800) * (1 - seg(e, 4800, 5400))) });
S('look-ete', 'Son look : le soleil', 'evt', { side: true, dur: 5000, on: ['look-saison'], when: d => d.item === 'lunettes-soleil', anim: [[0, 'surpris'], [900, 'fier'], [3400, 'clin-oeil']], mood: 'content',
  say: [[300, 2400, L('Quel soleil !', 'Il fait chaud !')], [2600, 4800, L('Lunettes de soleil : ON.', 'Trop cool.')]],
  move: e => ({ r: -0.05 * sm(seg(e, 900, 1500)) * (1 - sm(seg(e, 4200, 5000))) }), props: (D, e) => D.sun(e, seg(e, 0, 700) * (1 - seg(e, 4400, 5000))) });
const KNOWN = d => ['bonnet', 'echarpe', 'fete', 'lunettes-soleil'].includes(d.item) || ['halloween', 'noel'].includes(d.saison);
S('look-tenue', 'Son look : une tenue de saison', 'evt', { side: true, dur: 4200, on: ['look-saison'], when: d => !KNOWN(d), anim: [[0, 'surpris'], [900, 'content']], mood: 'content',
  say: [[300, 2300, L('Une tenue de saison !', 'Tadaa !')], [2500, 4000, L('Ça me va ?', 'Pas mal, hein ?')]],
  move: e => ({ y: -12 * bump(seg(e, 0, 500)) }), props: (D, e) => { if (e < 1600) D.stars(e); } });
});
