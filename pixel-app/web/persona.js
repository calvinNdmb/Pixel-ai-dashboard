/* Pixel's personality: what he does when you touch him, when you come back, and when nobody looks.
   Loaded after themes.js, before screens.js. screens.js asks it, every frame on the Visage screen, what to play:
     const v = persona.update(dt, ctx)  ->  null, or { id, group, anim, mood, m, fast }
       anim  one of the pack's 52 animations (the face of the "Pack 52" mode); mood: the same for the living face
       m     the whole face moves: { x, y } offset in px, s scale, r rotation (rad), f mirrored, sx / sy stretch
     persona.drawOver(box, m)   after the face: the props (hearts, tears, bubbles, a fly...) and the speech bubble
     persona.tap(p, box) / pet() / input(info) / play(id)   what happens to him
   Nothing here talks to the server: each screen has its own Pixel. Wall-clock time (Date.now) measures how long you
   were away (kept in localStorage, so a night or a restart counts); the frame clock (H.now) runs the scenes.
   A scene: { id, label, group, dur, anim: [[ms, pack id], ...], mood, say: [[ms, ms, lines]], move(e, p, o), props(D, e, p, o) }.
   Groups: 'tap' (a touch), 'fache' (pestered), 'calin' (petting), 'retour' (you come back), 'vie' (alone), 'evt' (lights, hours).
   A 'vie' scene may have when(c) (c: wet, sunny, day, night, xmas, meal, h, mn, wd, mo, dd, kind, date) and quiet: true (it may play at night).
   Scene packs (web/scenes/*.js, loaded before screens.js) add more: (window.PixelScenePacks ||= []).push(kit => { kit.S(...) }).
   Two optional fields plug a scene in:
     on: ['notif', ...]   it can answer these events (persona.event(name, data); EVENTS below lists them), weight w,
                          when(data) to filter (data.msg, data.name, data.kind...)
     pool: ['calm', ...]  it joins a touch pool: calm, love, annoyed, angry, pet, or zone:oeil / zone:tete / zone:bouche /
                          zone:cote / zone:ailleurs (where the finger lands) */
window.PixelPersona = H => {
const TAU = Math.PI * 2, W = 800, HT = 480;
const rnd = H.rnd || Math.random, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = a => a[Math.floor(rnd() * a.length)];
const sm = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };                 // smoothstep
const out = x => 1 - (1 - clamp(x, 0, 1)) ** 3, inn = x => clamp(x, 0, 1) ** 3;        // ease out / in
const seg = (e, a, b) => clamp((e - a) / (b - a), 0, 1);                               // 0..1 between two times
const bump = x => Math.sin(Math.PI * clamp(x, 0, 1));                                   // 0 -> 1 -> 0
const tri = x => { const f = ((x % 2) + 2) % 2; return f < 1 ? f : 2 - f; };            // 0..1..0, period 2
const jumps = (e, every, h) => -h * Math.abs(Math.sin(Math.PI * e / every));            // repeated hops (px, up)
const M0 = { x: 0, y: 0, s: 1, r: 0, f: false, sx: 1, sy: 1 };

/* where things are on the pack's face, in its 96 x 54 grid (eyes, mouth, top of the "head", centre) */
const A = { el: [34, 23], er: [66, 23], mouth: [48, 37], top: [48, 13], c: [48, 27], left: [20, 27], right: [76, 27], chin: [48, 44] };

/* ---------- the scenes ---------- */
const SC = [], BY = {};
function S(id, label, group, o) { const s = { id, label, group, w: 1, ...o }; SC.push(s); BY[id] = s; return s; }
const L = (...lines) => lines;                                                          // lines to pick from
// a line can also be a function of the scene's data (o): « Dans 10 min… », « Plus que 17 dodos avant Noël ! »
function xmasLine() {
  const d = new Date(), t = new Date(d.getFullYear(), d.getMonth(), d.getDate()), n = Math.round((new Date(d.getFullYear(), 11, 25) - t) / 864e5);
  return n > 1 ? `Plus que ${n} dodos avant Noël !` : n === 1 ? 'Noël, c’est demain !' : n === 0 ? 'Joyeux Noël !' : 'Bonnes fêtes !';
}

// --- a touch (calm) ---
S('coucou', 'Coucou', 'tap', { dur: 2200, anim: [[0, 'salut']], mood: 'content', say: [[150, 1900, L('Coucou !', 'Salut toi !', 'Oh, bonjour !', 'Hé, salut !')]],
  move: e => ({ y: -22 * bump(e / 700) }) });
S('content', 'Content', 'tap', { dur: 2000, anim: [[0, 'content']], mood: 'content', say: [[150, 1800, L('Hé hé !', 'Ça va ?', 'Je suis là !', 'Oui ?')]],
  move: e => ({ y: -14 * bump(e / 500), sy: 1 + 0.06 * bump(e / 500) }) });
S('chatouilles', 'Chatouilles', 'tap', { dur: 2600, anim: [[0, 'rire']], mood: 'content', zone: 'bouche', say: [[100, 2400, L('Hihihi !', 'Ça chatouille !', 'Arrête, hihi !', 'Pas là, hihi !')]],
  move: e => ({ r: 0.09 * Math.sin(e / 45) * (1 - seg(e, 1600, 2600)), y: -6 * Math.abs(Math.sin(e / 90)) }) });
S('oeil', 'Le doigt dans l’œil', 'tap', { dur: 2500, anim: [[0, 'surpris'], [700, 'clin-oeil']], mood: 'surpris', zone: 'oeil',
  say: [[120, 2300, L('Aïe, mon œil !', 'Pas dans l’œil !', 'Hé, ça pique !', 'Ouille, mon œil !')]],
  move: e => ({ x: 7 * Math.sin(e / 30) * (1 - seg(e, 0, 500)) }),
  props: (D, e, p, o) => D.tear(o.side < 0 ? 'el' : 'er', seg(e, 500, 2500)) });
S('bonk', 'Bonk sur la tête', 'tap', { dur: 2600, anim: [[0, 'surpris'], [600, 'confus']], mood: 'confus', zone: 'tete', say: [[100, 2400, L('Bonk !', 'Aïe, ma tête !', 'Ouille !', 'Ça sonne creux…')]],
  move: e => { const k = Math.exp(-e / 260) * Math.cos(e / 60); return { sy: 1 - 0.28 * k, sx: 1 + 0.18 * k, y: 30 * k }; },
  props: (D, e) => D.dizzy(e, 1 - seg(e, 1800, 2600)) });
S('pousse', 'Poussé', 'tap', { dur: 2400, anim: [[0, 'surpris'], [900, 'curieux']], mood: 'surpris', zone: 'cote', say: [[100, 2200, L('Hé, pousse pas !', 'Wooo !', 'Doucement !', 'Ça glisse !')]],
  move: (e, p, o) => { const k = out(seg(e, 0, 450)) * (1 - sm(seg(e, 1300, 2300))); return { x: -o.side * 160 * k, r: -o.side * 0.12 * Math.sin(Math.min(1, e / 450) * Math.PI) }; } });
S('ou', 'Où ça ?', 'tap', { dur: 2300, anim: [[0, 'curieux']], mood: 'ecoute', zone: 'ailleurs', say: [[200, 2100, L('Hein ? Quoi ?', 'Y a quoi, là ?', 'Oh ? C’est quoi ?', 'Tu as vu un truc ?')]],
  move: (e, p, o) => { const k = sm(seg(e, 0, 500)) * (1 - sm(seg(e, 1600, 2300))); return { x: o.tx * 0.28 * k, y: o.ty * 0.22 * k, r: o.tx * 0.0004 * k }; } });
S('saut', 'Youpi', 'tap', { dur: 2200, anim: [[0, 'etoiles']], mood: 'excite', say: [[100, 2000, L('Youpi !', 'Wiii !', 'Ouais !')]],
  move: e => ({ y: e < 1500 ? jumps(e, 500, 46) : 0 }) });
S('pirouette', 'Pirouette', 'tap', { dur: 1900, anim: [[0, 'rire']], mood: 'excite', say: [[700, 1800, L('Hop là !', 'Tadaa !', 'Pirouette !')]],
  move: e => ({ r: TAU * sm(seg(e, 0, 650)), y: -40 * bump(e / 650) }) });
S('timide', 'Timide', 'tap', { dur: 2500, anim: [[0, 'timide']], mood: 'amoureux', say: [[150, 2300, L('Hé hé…', 'Tu m’intimides…', 'Oh, arrête…')]],
  move: e => ({ x: -10 * sm(seg(e, 0, 400)), r: -0.05 * sm(seg(e, 0, 400)) }), props: (D, e) => D.blush(sm(seg(e, 0, 500))) });
S('bisou', 'Bisou', 'tap', { dur: 2300, anim: [[0, 'bisou']], mood: 'amoureux', say: [[200, 2100, L('Smack !', 'Mwah !', 'Un bisou !')]],
  move: e => ({ s: 1 + 0.06 * bump(e / 600) }), props: (D, e) => D.hearts(e, 0.6) });
S('idee', 'Une idée… non', 'tap', { dur: 3300, anim: [[0, 'idee'], [1700, 'confus']], mood: 'excite', say: [[100, 1600, L('Oh ! J’ai une idée !', 'Attends, je sais !')], [1700, 3200, L('…non, rien.', '…j’ai oublié.', '…bof, en fait.')]],
  move: e => ({ y: -18 * bump(e / 500) }) });
S('amour', 'Je t’aime bien', 'tap', { dur: 2700, anim: [[0, 'amoureux']], mood: 'amoureux', say: [[150, 2500, L('Je t’aime bien, toi.', 'T’es gentil.', 'Tu es mon humain préféré.')]],
  move: e => ({ s: 1 + 0.05 * Math.sin(e / 160) }), props: (D, e) => D.hearts(e, 1) });
S('nuit-tap', 'Il est tard', 'tap', { dur: 2900, anim: [[0, 'baille']], mood: 'baille', say: [[300, 2700, L('Il est tard… on dort ?', 'Mmh… quelle heure il est ?', 'Chut, c’est la nuit…')]],
  move: e => ({ y: 8 * sm(seg(e, 0, 1200)) }), props: (D, e) => D.zzz(e, 0.6) });

// --- pestered ---
S('he', 'Hé !', 'fache', { dur: 2000, anim: [[0, 'boudeur']], mood: 'confus', say: [[80, 1900, L('Hé !', 'Hé ho !', 'Quoi encore ?', 'Oui, oui, je suis là…', 'Tu veux quoi ?')]],
  move: e => ({ x: 6 * Math.sin(e / 35) * (1 - seg(e, 0, 350)) }) });
S('impatient', 'Pfff', 'fache', { dur: 2400, anim: [[0, 'idle-impatient']], mood: 'confus', say: [[100, 2300, L('Pfff…', 'J’ai pas que ça à faire.', 'Encore toi ?')]],
  move: e => ({ y: 4 * Math.sin(e / 140) }) });
S('esquive', 'Esquive', 'fache', { dur: 2200, anim: [[0, 'surpris'], [400, 'rire']], mood: 'surpris', say: [[250, 2000, L('Raté !', 'Trop lent !', 'Hop, esquivé !', 'Même pas mal !')]],
  move: (e, p, o) => { const k = out(seg(e, 0, 160)) * (1 - sm(seg(e, 1400, 2200))); return { x: o.dx * k, y: o.dy * k, r: o.dx * 0.0006 * k }; },
  init: o => { o.dx = (rnd() < 0.5 ? -1 : 1) * (150 + rnd() * 70); o.dy = -30 - rnd() * 40; } });
S('colere', 'En colère', 'fache', { dur: 2700, anim: [[0, 'colere']], mood: 'fache', say: [[80, 2500, L('Mais arrête !', 'GRRR !', 'Ça suffit !', 'Tu le fais exprès ?!', 'Je vais me fâcher !')]],
  move: e => ({ x: 9 * Math.sin(e / 28) * (1 - seg(e, 1500, 2700)), y: 3 * Math.sin(e / 40) }),
  props: (D, e) => { D.vein(e); D.steam(e); } });
S('panique', 'Au secours', 'fache', { dur: 2500, anim: [[0, 'panique']], mood: 'surpris', say: [[100, 2400, L('Au secours !', 'On m’attaque !', 'Aaah !')]],
  move: e => ({ x: 5 * Math.sin(e / 20), y: 3 * Math.cos(e / 23) }), props: (D, e) => D.sweat(e) });
S('boude', 'Il boude', 'fache', { dur: 26000, side: true, anim: [[0, 'colere'], [1400, 'boudeur']], mood: 'fache', sulk: true,
  say: [[200, 2600, L('Bon, ça suffit ! Je boude.', 'Puisque c’est comme ça, je boude !', 'Je ne te parle plus !')]],
  move: e => { const k = sm(seg(e, 1400, 2600)) * (1 - sm(seg(e, 24800, 26000))); return { x: 230 * k, y: 120 * k, s: 1 - 0.5 * k, f: k > 0.5 }; },
  props: (D, e) => { if (e > 2400 && e < 25000) D.sign('NE PAS', 'DÉRANGER', seg(e, 2400, 2900)); } });
S('pardon', 'Il pardonne', 'fache', { dur: 4200, anim: [[0, 'timide'], [2200, 'amoureux']], mood: 'amoureux',
  say: [[300, 2200, L('Bon… je te pardonne.', 'D’accord… copains ?', 'Bon, ça va pour cette fois.')], [2300, 4000, L('Mais doucement, hein !', 'Fais-moi un câlin.', 'On fait la paix ?')]],
  move: e => ({ y: -12 * bump(seg(e, 2200, 2800)) }), props: (D, e) => { if (e > 2200) D.hearts(e - 2200, 0.7); } });

// --- petting ---
S('caresse', 'Câlin', 'calin', { dur: 3300, anim: [[0, 'amoureux']], mood: 'amoureux', say: [[200, 3100, L('Mmmh…', 'Ronron…', 'Encore !', 'J’adore ça !', 'Ohhh, oui…')]],
  move: e => ({ r: 0.05 * Math.sin(e / 300), s: 1 + 0.03 * Math.sin(e / 200) }), props: (D, e) => D.hearts(e, 1.2) });
S('ronron', 'Il s’endort sous les câlins', 'calin', { dur: 5200, anim: [[0, 'idle-somnole'], [2200, 'sommeil']], mood: 'endormi', say: [[600, 3000, L('Zzz… c’est trop bien…', 'Mmmh… je m’endors…')]],
  move: e => ({ y: 10 * sm(seg(e, 0, 2500)), r: 0.04 * Math.sin(e / 700) }), props: (D, e) => { if (e > 2000) D.zzz(e - 2000, 1); } });
S('calme', 'Ça va mieux', 'calin', { dur: 2800, anim: [[0, 'content']], mood: 'content', say: [[200, 2600, L('Bon… ça va mieux.', 'D’accord, je me calme.', 'Ouf…')]] });

// --- you come back ---
S('retour', 'Te revoilà', 'retour', { dur: 2900, anim: [[0, 'salut']], mood: 'content', say: [[150, 2700, L('Ah, te revoilà !', 'Re !', 'Coucou, t’étais où ?', 'Tiens, revoilà mon humain !')]],
  move: e => ({ y: jumps(Math.min(e, 1000), 500, 30) }) });
S('manque', 'Tu m’as manqué', 'retour', { dur: 5600, anim: [[0, 'triste'], [2300, 'etoiles']], mood: 'triste',
  say: [[200, 2200, L('Tu étais où ?…', 'Tu m’as manqué…', 'Je me sentais seul…')], [2400, 5400, L('Ouiii, t’es là !', 'Je suis trop content !', 'Ne repars plus !')]],
  move: e => (e < 2300 ? { y: 14 * sm(seg(e, 0, 600)) } : { y: jumps(e - 2300, 450, 40) * (1 - seg(e, 4600, 5400)) }),
  props: (D, e) => { if (e < 2300) D.tear('el', seg(e, 300, 2300)); else D.hearts(e - 2300, 1.2); } });
S('bonjour', 'Bonjour', 'retour', { dur: 5000, anim: [[0, 'reveil'], [2600, 'salut']], mood: 'content',
  say: [[300, 2500, L('Bonjour !', 'Coucou, bien dormi ?', 'Déjà le matin ?')], [2700, 4800, L('Prêt pour la journée ?', 'On fait quoi aujourd’hui ?', 'Allez, au boulot !')]],
  move: e => ({ sy: 1 + 0.12 * bump(seg(e, 600, 2200)), sx: 1 - 0.05 * bump(seg(e, 600, 2200)) }) });
S('bonsoir', 'Bonsoir', 'retour', { dur: 4200, anim: [[0, 'salut'], [2000, 'content']], mood: 'content',
  say: [[200, 2000, L('Bonsoir !', 'Te voilà enfin !')], [2100, 4000, L('Ta journée s’est bien passée ?', 'Raconte-moi ta journée !')]],
  move: e => ({ y: jumps(Math.min(e, 900), 450, 26) }) });
S('reveille', 'Je dormais pas', 'retour', { dur: 3100, anim: [[0, 'reveil'], [900, 'surpris']], mood: 'surpris', say: [[700, 2900, L('Hein ? Je dormais pas !', 'Quoi ? J’étais réveillé !', 'Je… je réfléchissais.')]],
  move: e => ({ y: -30 * bump(seg(e, 800, 1300)) }) });
// the first time you come back on Christmas Eve, Christmas Day or New Year's Day
S('joyeux-noel', 'Joyeux Noël', 'retour', { dur: 5400, side: true, anim: [[0, 'salut'], [2500, 'etoiles']], mood: 'excite',
  say: [[200, 2400, L('Joyeux Noël !', 'Ho ho ho ! Joyeux Noël !')], [2600, 5200, L('Le Père Noël est passé ?', 'Tu as eu des cadeaux ?', 'Vive le vent d’hiver !')]],
  move: e => ({ y: e < 4400 ? jumps(e, 600, 30) : 0 }), props: (D, e) => { D.snow(e, 1 - seg(e, 4800, 5400)); if (e > 2500) D.stars(e - 2500); } });
S('bonne-annee', 'Bonne année', 'retour', { dur: 5000, side: true, anim: [[0, 'etoiles'], [2600, 'rire']], mood: 'excite',
  say: [[200, 2400, () => `Bonne année ${new Date().getFullYear()} !`], [2600, 4800, L('Plein de bonnes choses !', 'Que des pixels heureux !', 'Et une bonne santé !')]],
  move: e => ({ y: e < 3800 ? jumps(e, 500, 34) : 0 }), props: (D, e) => D.stars(e) });

// --- alone: moments of life ---
S('poisson', 'Le poisson', 'vie', { dur: 10500, w: 3, anim: [[0, 'bisou']], mood: 'content', say: [[1500, 3200, L('Blou… blou…', 'Glou glou…')]],
  move: e => {
    const k = sm(seg(e, 0, 900)) * (1 - sm(seg(e, 9500, 10500))), a = TAU * 2 * seg(e, 900, 9500), x = 230 * Math.sin(a), y = 105 * (1 - Math.cos(a)) * 0.5 - 30;
    const vx = Math.cos(a), vy = Math.sin(a);
    return { x: x * k, y: y * k, s: 1 - 0.42 * k, f: vx < 0 && k > 0.5, r: 0.25 * vy * k * (vx < 0 ? -1 : 1) };
  },
  props: (D, e) => { if (e > 900 && e < 9800) D.bubbles(e, 'mouth'); } });
S('balade', 'La balade', 'vie', { dur: 8500, w: 2, anim: [[0, 'curieux'], [5500, 'salut']], mood: 'ecoute', say: [[5600, 8200, L('Me revoilà !', 'Coucou, c’est encore moi !', 'J’ai fait le tour !')]],
  move: e => {
    if (e < 3000) { const k = inn(seg(e, 0, 3000)); return { x: -760 * k, y: -8 * Math.abs(Math.sin(e / 160)), r: 0.04 * Math.sin(e / 160), f: true }; }
    if (e < 4200) return { x: -2000 };
    const k = 1 - out(seg(e, 4200, 6200)); return { x: 760 * k, y: -8 * Math.abs(Math.sin(e / 160)) * (k > 0 ? 1 : 0), r: 0.04 * Math.sin(e / 160) * k };
  } });
S('cache', 'Coucou caché', 'vie', { dur: 7600, w: 2, anim: [[0, 'curieux'], [4800, 'rire']], mood: 'content', say: [[5000, 7300, L('Coucou !', 'Bouh !', 'Tu m’avais pas vu, hein ?')]],
  move: e => {
    if (e < 1300) return { y: 360 * inn(seg(e, 0, 1300)) };
    if (e < 2600) return { y: 360 };
    if (e < 4700) return { y: 360 - 150 * out(seg(e, 2600, 3200)) + 6 * Math.sin(e / 200) * seg(e, 3200, 3400) };
    return { y: (360 - 150) * (1 - out(seg(e, 4700, 5100))) - 50 * bump(seg(e, 4700, 5400)) };
  } });
S('dvd', 'L’économiseur d’écran', 'vie', { dur: 12500, w: 2, anim: [[0, 'idle-respire'], [9800, 'etoiles']], mood: 'neutre', say: [[9900, 11800, L('LE COIN !!!', 'Pile dans le coin !', 'Enfin, le coin !')]],
  move: e => {
    const k = sm(seg(e, 0, 800)) * (1 - sm(seg(e, 11700, 12500))), b = Math.min(e, 9800);
    const x = (tri(b / (9800 / 3.5) + 0.5) - 0.5) * 2 * 300, y = (tri(b / (9800 / 2.5) + 0.5) - 0.5) * 2 * 140;
    return { x: x * k, y: y * k, s: 1 - 0.62 * k };
  },
  props: (D, e) => { if (e > 9800 && e < 11800) D.stars(e - 9800); } });
S('toupie', 'La toupie', 'vie', { dur: 7200, w: 2, anim: [[0, 'rire'], [3000, 'confus']], mood: 'confus', say: [[3300, 6900, L('Tout tourne…', 'Wouah, la tête…', 'Encore un tour ? Non…')]],
  move: e => {
    const sp = e < 3000 ? 7 * TAU * (seg(e, 0, 3000) ** 2) : 7 * TAU, wob = e > 3000 ? 0.18 * Math.sin((e - 3000) / 110) * Math.exp(-(e - 3000) / 1500) : 0;
    return { r: sp + wob, x: e > 3000 ? 14 * Math.sin((e - 3000) / 230) * Math.exp(-(e - 3000) / 1800) : 0, y: -20 * bump(seg(e, 0, 3000)) };
  },
  props: (D, e) => { if (e > 3000) D.dizzy(e, 1 - seg(e, 6200, 7200)); } });
S('mouche', 'La mouche', 'vie', { dur: 12000, w: 2, anim: [[0, 'idle-regard'], [3500, 'curieux'], [7600, 'surpris'], [8300, 'rire'], [9500, 'content']], mood: 'ecoute',
  say: [[7700, 9300, L('ATCHOUM !', 'Atchaaa !')], [9500, 11700, L('Elle reviendra…', 'Sale mouche !', 'Raté…')]],
  move: (e, p, o) => {
    const f = o.fly(e), k = 1 - sm(seg(e, 10500, 12000));
    if (e > 7600 && e < 8300) { const q = seg(e, 7600, 8300); return { sy: 1 - 0.25 * bump(q), sx: 1 + 0.15 * bump(q), y: 10 * bump(q) }; }
    return { x: (f.x - 400) * 0.22 * k, y: (f.y - 240) * 0.18 * k + jumps(Math.max(0, e - 5400), 600, 30) * seg(e, 5400, 5500) * (1 - seg(e, 6600, 6700)) };
  },
  init: o => {
    const ph = [rnd() * 9, rnd() * 9, rnd() * 9, rnd() * 9];
    o.fly = e => {
      if (e > 6800 && e < 7700) { const q = sm(seg(e, 6800, 7300)); return { x: (o.hx ?? 400) * 1, y: (o.hy ?? 160) * 1, land: q }; }   // on his head
      if (e >= 7700) { const q = seg(e, 7700, 9000); return { x: (o.hx ?? 400) + 700 * inn(q), y: (o.hy ?? 160) - 260 * q }; }
      return { x: 400 + 250 * Math.sin(e / 900 + ph[0]) + 70 * Math.sin(e / 230 + ph[1]), y: 220 + 110 * Math.sin(e / 1100 + ph[2]) + 40 * Math.sin(e / 170 + ph[3]) };
    };
  },
  props: (D, e, p, o) => { if (e < 6800) { const f = o.fly(e); o.hx = undefined; D.fly(f.x, f.y, e); } else { if (o.hx === undefined) { const t = D.at('top'); o.hx = t.x; o.hy = t.y - 6; } const f = o.fly(e); if (e < 9000) D.fly(f.x, f.y, e); } } });
S('hoquet', 'Le hoquet', 'vie', { dur: 7000, w: 1, anim: [[0, 'surpris'], [5600, 'content']], mood: 'surpris', say: [[5700, 6900, L('…c’est passé.', 'Ouf, fini.')]],
  move: e => ({ y: e < 5500 ? -26 * Math.max(0, Math.sin(TAU * e / 1100)) ** 6 : 0 }),
  props: (D, e) => { if (e < 5500) D.hic(e); } });
S('atchoum', 'L’éternuement', 'vie', { dur: 5400, w: 1, anim: [[0, 'baille'], [2300, 'surpris'], [3200, 'timide']], mood: 'baille',
  say: [[300, 2200, L('Ah… ah…', 'Aaah… aah…')], [2300, 3200, L('ATCHOUM !')], [3300, 5200, L('Pardon.', 'À mes souhaits !', 'Excuse-moi.')]],
  move: e => (e < 2300 ? { sy: 1 + 0.12 * sm(seg(e, 0, 2300)), y: -10 * sm(seg(e, 0, 2300)) } : { sy: 1 - 0.25 * bump(seg(e, 2300, 2600)), sx: 1 + 0.15 * bump(seg(e, 2300, 2600)), x: -40 * Math.exp(-(e - 2300) / 300) }),
  props: (D, e) => { if (e > 2300 && e < 3000) D.spray(seg(e, 2300, 3000)); } });
S('sifflote', 'Il sifflote', 'vie', { dur: 8200, w: 2, anim: [[0, 'chante']], mood: 'content', say: [[400, 3200, L('♪ Lalala…', '♪ Tralala…', '♪ Hmm hmm…')]],
  move: e => ({ r: 0.07 * Math.sin(e / 420), x: 18 * Math.sin(e / 840) }), props: (D, e) => D.notes(e) });
S('danse', 'La danse en cachette', 'vie', { dur: 10500, w: 2, anim: [[0, 'idle-regard'], [2200, 'danse']], mood: 'excite', secret: L('Euh… t’as rien vu !', 'Oups ! C’était pour de rire.', 'Je… je m’entraînais.'),
  move: e => (e < 2200 ? { x: 30 * Math.sin(e / 350) } : { y: -18 * Math.abs(Math.sin((e - 2200) / 260)), r: 0.12 * Math.sin((e - 2200) / 520), x: 40 * Math.sin((e - 2200) / 1040) }),
  props: (D, e) => { if (e > 2200) D.notes(e); } });
S('vitre', 'Toc toc', 'vie', { dur: 7600, w: 2, anim: [[0, 'curieux'], [4200, 'surpris'], [5600, 'content']], mood: 'ecoute', say: [[1400, 4000, L('Toc toc…', 'Y a quelqu’un ?', 'Il y a quelqu’un derrière la vitre ?')], [5600, 7400, L('Ah, c’est toi !', 'Coucou !')]],
  move: e => {
    const k = sm(seg(e, 0, 1200)) * (1 - sm(seg(e, 6400, 7600))), knock = e > 1400 && e < 4000 ? 0.05 * Math.max(0, Math.sin(TAU * (e - 1400) / 650)) ** 8 : 0;
    return { s: 1 + 0.55 * k + knock, y: 20 * k };
  },
  props: (D, e) => { if (e > 1400 && e < 4000) D.knock(e - 1400); } });
S('ennui', 'L’ennui', 'vie', { dur: 8200, w: 2, anim: [[0, 'idle-impatient'], [5000, 'baille']], mood: 'baille', say: [[600, 3600, L('Je m’ennuiiie…', 'Il se passe rien…', 'Quelqu’un veut jouer ?')], [5200, 7800, L('Bon…', 'Pfff…')]],
  move: e => ({ y: 40 * sm(seg(e, 0, 5000)) * (1 - sm(seg(e, 7000, 8200))), r: -0.05 * sm(seg(e, 0, 5000)) * (1 - sm(seg(e, 7000, 8200))) }) });
S('sieste', 'La sieste', 'vie', { quiet: true, dur: 12500, w: 2, anim: [[0, 'idle-somnole'], [2500, 'sommeil'], [10000, 'surpris'], [10700, 'timide']], mood: 'endormi',
  say: [[10100, 12200, L('Je dormais pas !', 'Hein ? Quoi ? J’étais là !', 'Je reposais mes yeux.')]], secret: L('Hein ?! Je dormais pas !', 'Quoi ? J’étais réveillé !'),
  move: e => (e < 10000 ? { y: 22 * sm(seg(e, 0, 3000)), r: 0.05 * Math.sin(e / 900) * seg(e, 2500, 3500) } : { y: 22 * (1 - out(seg(e, 10000, 10300))) - 40 * bump(seg(e, 10000, 10600)) }),
  props: (D, e) => { if (e > 2500 && e < 10000) D.zzz(e - 2500, 1); } });
S('etirement', 'Le grand étirement', 'vie', { quiet: true, dur: 6200, w: 1, anim: [[0, 'idle-etire']], mood: 'neutre', say: [[700, 3600, L('Mmmmmh…', 'Aaah, ça fait du bien.')]],
  move: e => { const st = bump(seg(e, 300, 3400)), pk = -0.12 * bump(seg(e, 3400, 4200)); return { sy: 1 + 0.25 * st + pk, sx: 1 - 0.1 * st - pk * 0.6, y: -26 * st }; } });
S('reverie', 'La rêverie', 'vie', { quiet: true, dur: 9200, w: 2, side: true, anim: [[0, 'idle-haut'], [6600, 'reflechit']], mood: 'reflechit', say: [[6800, 9000, L('…où j’en étais ?', 'Je rêvassais.', 'Mmh, des pizzas…')]],
  move: e => ({ y: -10 * Math.sin(e / 900), x: -20 * sm(seg(e, 0, 1000)) * (1 - sm(seg(e, 8000, 9200))) }),
  init: o => { o.icons = [pick(['pizza', 'poisson', 'etoile']), pick(['coeur', 'ampoule', 'pizza'])]; },
  props: (D, e, p, o) => { if (e > 600 && e < 6600) D.thought(o.icons[e < 3600 ? 0 : 1], seg(e, 600, 1200) * (1 - seg(e, 6000, 6600))); } });
S('zen', 'La méditation', 'vie', { quiet: true, dur: 9200, w: 1, anim: [[0, 'zen']], mood: 'content', say: [[1500, 4500, L('Ommmm…', 'Je suis zen…', 'Respire…')]],
  move: e => ({ y: -40 * sm(seg(e, 0, 2500)) * (1 - sm(seg(e, 7700, 9200))) + 6 * Math.sin(e / 600) }) });
S('joie', 'La joie', 'vie', { dur: 5200, w: 1, anim: [[0, 'rire'], [2600, 'etoiles']], mood: 'excite', say: [[300, 2500, L('Youpi !', 'Quelle belle journée !', 'Je suis content !')]],
  move: e => ({ y: e < 4200 ? jumps(e, 520, 44) : 0, r: e < 4200 ? 0.06 * Math.sin(e / 260) : 0 }), props: (D, e) => { if (e > 2600) D.stars(e - 2600); } });
S('gym', 'La gym', 'vie', { dur: 8200, w: 1, anim: [[0, 'fier'], [6400, 'etoiles']], mood: 'fier', say: [[300, 1600, L('Un…')], [1700, 3000, L('…deux…')], [3100, 4400, L('…trois…')], [4500, 6200, L('…et quatre !')], [6300, 8000, L('Musclé !', 'Quelle forme !')]],
  move: e => { const q = e < 6200 ? Math.max(0, Math.sin(TAU * e / 1400)) : 0; return { sy: 1 - 0.22 * q, sx: 1 + 0.1 * q, y: 36 * q }; } });
S('psst', 'Psst', 'vie', { dur: 7400, w: 1, anim: [[0, 'curieux'], [3200, 'clin-oeil'], [5000, 'content']], mood: 'ecoute', say: [[3200, 5000, L('Psst !', 'Hé… par ici !')]],
  move: e => {
    if (e < 1300) return { x: 760 * inn(seg(e, 0, 1300)) };
    if (e < 2400) return { x: 2000 };
    if (e < 5000) return { x: -560 + 140 * out(seg(e, 2400, 3000)), r: 0.18 };
    return { x: -420 * (1 - out(seg(e, 5000, 6400))), r: 0.18 * (1 - out(seg(e, 5000, 6000))) };
  } });
S('pluie', 'Sous la pluie', 'vie', { dur: 8200, w: 4, side: true, when: c => c.wet, anim: [[0, 'triste'], [5600, 'confus']], mood: 'triste', say: [[600, 4000, L('Il pleut…', 'Encore la pluie…', 'Je suis tout mouillé…')], [5700, 8000, L('Prends ton parapluie !', 'Reste au sec, toi.')]],
  move: e => { const k = sm(seg(e, 0, 1000)) * (1 - sm(seg(e, 7200, 8200))); return { y: 60 * k, s: 1 - 0.12 * k, x: 3 * Math.sin(e / 50) * seg(e, 2000, 2400) * (1 - seg(e, 3400, 3800)) }; },
  props: (D, e) => D.cloud(e, seg(e, 0, 700) * (1 - seg(e, 7400, 8200)), true) });
S('soleil', 'Bronzette', 'vie', { dur: 7600, w: 3, side: true, when: c => c.sunny && c.day, anim: [[0, 'fier'], [4600, 'zen']], mood: 'fier', say: [[500, 3500, L('Il fait beau !', 'Quel soleil !', 'Bronzette !')]],
  move: e => ({ r: -0.06 * sm(seg(e, 0, 1000)) * (1 - sm(seg(e, 6600, 7600))), y: -8 * sm(seg(e, 0, 1000)) * (1 - sm(seg(e, 6600, 7600))) }),
  props: (D, e) => D.sun(e, seg(e, 0, 800) * (1 - seg(e, 6800, 7600))) });
S('faim', 'La faim', 'vie', { dur: 7400, w: 4, side: true, when: c => c.meal, anim: [[0, 'triste'], [4200, 'idee']], mood: 'triste', say: [[500, 3800, L('J’ai faim…', 'C’est l’heure de manger ?', 'Mon ventre gargouille…')], [4300, 7200, L('Une pizza ?', 'On mange quoi ?')]],
  props: (D, e) => { if (e < 7000) D.thought('pizza', seg(e, 0, 600) * (1 - seg(e, 6500, 7000))); } });
S('nuit', 'Bâillements de nuit', 'vie', { quiet: true, dur: 7200, w: 6, when: c => c.night, anim: [[0, 'baille'], [3600, 'fatigue']], mood: 'baille', say: [[500, 3200, L('Il est tard…', 'Au lit, tout le monde…', 'Mmmh, dodo…')]],
  move: e => ({ y: 16 * sm(seg(e, 0, 4000)) * (1 - sm(seg(e, 6400, 7200))) }), props: (D, e) => { if (e > 3000) D.zzz(e - 3000, 0.7); } });
S('neige', 'La neige', 'vie', { dur: 9000, w: 4, side: true, when: c => c.xmas && !c.night, anim: [[0, 'curieux'], [2000, 'etoiles'], [6600, 'content']], mood: 'excite',
  say: [[400, 2000, L('Oh ! Il neige !', 'De la neige !', 'Regarde, il neige !')], [2300, 6400, () => xmasLine()], [6700, 8700, L('J’adore Noël !', 'Vivement les cadeaux !', 'Ho ho ho !')]],
  move: e => ({ y: e > 2000 && e < 6400 ? jumps(e - 2000, 700, 18) : 0, r: 0.05 * Math.sin(e / 700) * (1 - seg(e, 8000, 9000)) }),
  props: (D, e) => D.snow(e, seg(e, 0, 900) * (1 - seg(e, 8200, 9000))) });

// --- events ---
S('noir', 'Dans le noir', 'evt', { dur: 4800, anim: [[0, 'panique'], [2600, 'timide']], mood: 'surpris',
  say: [[100, 2400, L('Il fait tout noir !', 'Qui a éteint ?!', 'Au secours, le noir !')], [2600, 4600, L('J’ai pas peur, hein.', 'Même pas peur.', 'Ça va… je suis courageux.')]],
  move: e => ({ x: e < 2600 ? 6 * Math.sin(e / 25) : 0, s: e < 2600 ? 0.92 : 1 }), props: (D, e) => { if (e < 2600) D.sweat(e); } });
S('lumiere', 'La lumière revient', 'evt', { dur: 2600, anim: [[0, 'etoiles']], mood: 'excite', say: [[100, 2400, L('Ah, la lumière !', 'Ouf, j’y vois clair !')]],
  move: e => ({ y: -24 * bump(e / 600) }) });
S('heure', 'Le coucou de l’heure', 'evt', { dur: 3400, anim: [[0, 'salut'], [1800, 'content']], mood: 'content', say: [[300, 3200, null]],
  move: e => ({ s: 1 + 0.1 * bump(seg(e, 200, 700)) + 0.1 * bump(seg(e, 900, 1400)), y: -10 * bump(seg(e, 200, 1400)) }) });
// the agenda: 10 min before an event (o: { min, title }), then a few minutes after it
S('rdv', 'Le rendez-vous', 'evt', { dur: 5400, anim: [[0, 'surpris'], [1600, 'idee']], mood: 'surpris',
  say: [[200, 2600, o => `Hé ! Dans ${o.min || 10} min…`], [2700, 5200, o => `…${o.title || 'ton rendez-vous'} !`]],
  move: e => ({ y: -16 * bump(seg(e, 0, 500)), x: 5 * Math.sin(e / 40) * (1 - seg(e, 0, 700)) }),
  props: (D, e) => D.watch(e, seg(e, 0, 400) * (1 - seg(e, 5000, 5400))) });
S('rdv-fin', 'Ça s’est bien passé ?', 'evt', { dur: 4400, anim: [[0, 'curieux'], [2400, 'content']], mood: 'ecoute',
  say: [[300, 2300, o => `${o.title || 'Ton rendez-vous'} : terminé !`], [2400, 4200, L('Ça s’est bien passé ?', 'Alors, c’était bien ?', 'Raconte-moi !')]],
  move: e => ({ r: 0.06 * sm(seg(e, 0, 600)) * (1 - sm(seg(e, 3600, 4400))) }) });
// the Pi itself: too hot (o: { temp }), the Wi-Fi gone, the Wi-Fi back
S('chaud', 'Il a chaud', 'evt', { dur: 6400, anim: [[0, 'fatigue'], [3600, 'idee']], mood: 'baille',
  say: [[300, 3400, o => `Pfiou, ${o.temp || 70} °C… j’ai chaud !`], [3600, 6200, L('Un peu d’air, s’il te plaît !', 'On ouvre une fenêtre ?', 'Je fonds…')]],
  move: e => ({ y: 8 * sm(seg(e, 0, 800)) * (1 - sm(seg(e, 5600, 6400))), sy: 1 - 0.05 * Math.sin(e / 300) * (1 - seg(e, 5600, 6400)) }),
  props: (D, e) => { D.sweat(e); D.heat(e, seg(e, 0, 500) * (1 - seg(e, 5800, 6400))); } });
S('wifi', 'Plus de Wi-Fi', 'evt', { dur: 5600, anim: [[0, 'surpris'], [1800, 'confus']], mood: 'confus',
  say: [[200, 2600, L('Hé, le Wi-Fi est parti !', 'Allô ? Internet ?', 'Plus de réseau !')], [2800, 5400, L('Je ne capte plus rien…', 'Je suis tout seul…')]],
  move: e => ({ r: 0.08 * Math.sin(e / 420) * seg(e, 1200, 1800) * (1 - seg(e, 4800, 5600)), y: 6 * Math.sin(e / 300) * (1 - seg(e, 4800, 5600)) }),
  props: (D, e) => D.antenna(e, false, seg(e, 0, 400) * (1 - seg(e, 5200, 5600))) });
S('wifi-ok', 'Le Wi-Fi revient', 'evt', { dur: 3000, anim: [[0, 'etoiles']], mood: 'excite', say: [[150, 2800, L('Ah, le Wi-Fi est revenu !', 'Ouf, je capte à nouveau !')]],
  move: e => ({ y: -20 * bump(seg(e, 0, 600)) }), props: (D, e) => D.antenna(e, true, seg(e, 0, 300) * (1 - seg(e, 2600, 3000))) });

/* ---------- scene packs and events ---------- */
/* what happens around him, for the scenes' "on": screens.js (and app.js) call persona.event(name, data) */
const EVENTS = {
  notif: 'Une notification',            // data.msg: the banner's text
  'codex-start': 'Codex se met au travail', 'codex-ok': 'Codex a réussi', 'codex-fail': 'Codex a échoué',
  'timer-start': 'Le minuteur démarre', 'timer-done': 'Le minuteur sonne',
  'lights-change': 'Les lumières changent',
  weather: 'La météo change',           // data.kind: soleil, nuage, pluie, neige, orage
  typing: 'Tu écris au clavier',
  action: 'Une touche du Stream Deck ou une action du téléphone',   // data.name: the action (lights.set, timer.start...)
  'jumeau-bonjour': 'Son jumeau de poche s’allume sur le téléphone',   // the two Pixels (web/poche.js, pixel/poche.py)
  'jumeau-tape': 'On touche son jumeau, l’autre Pixel',              // data.ici: 'poche' on the phone, else the Pi
  'jumeau-caresse': 'On caresse son jumeau, l’autre Pixel',          // data.ici: 'poche' on the phone, else the Pi
  'jumeau-secoue': 'On secoue son jumeau de poche',
  'poche-allume': 'Pixel de poche : il apparaît sur le téléphone',
  'poche-secousse': 'Pixel de poche : on secoue le téléphone',
  'poche-glisse': 'Pixel de poche : on penche fort le téléphone',      // data.side: -1 left, 1 right
  'poche-batterie': 'Pixel de poche : la batterie est faible',          // data.level: %
  'poche-recharge': 'Pixel de poche : le téléphone se recharge',
  'poche-loin': 'Pixel de poche : le Pi ne répond plus',
  'poche-maison': 'Pixel de poche : le Pi répond à nouveau',
  'poche-revoila': 'Pixel de poche : le téléphone ressort de la poche',
};
/* a pack can draw its own props: kit.prop('enveloppe', (D, e, q) => { ... }), then D.enveloppe(e, q) in its scenes' props.
   D gives the canvas and its helpers: g, U (one pixel of the face's 96 x 54 grid, in screen px), P(u, v) (a point of that grid on the
   screen, following his moves), at(name) (a point of A), col (fg, hi, dim, acc, pink, bg: the theme's colours), lw(w) (a line width that
   stays visible in the pixel themes), heart / star / drop / ring (x, y, size, colour), glyph(text, x, y, size, colour) (always sharp),
   pix (true in Rétro and LCD: g is then a small canvas, blown up without smoothing). A prop draws only; it never moves him. */
const PROPS = {};
const prop = (name, fn) => { PROPS[name] = fn; };
const KIT = { S, L, pick, sm, out, inn, seg, bump, tri, jumps, clamp, rnd, TAU, W, HT, A, EVENTS, H, xmasLine, prop };
for (const pack of (typeof window !== 'undefined' && window.PixelScenePacks) || []) {
  const n = SC.length;
  try { pack(KIT); } catch (e) { SC.splice(n).forEach(x => { if (BY[x.id] === x) delete BY[x.id]; }); if (typeof console !== 'undefined') console.warn('Pixel: a scene pack failed', e); }
}
const LIFE = SC.filter(s => s.group === 'vie');
const TAP = { calm: ['coucou', 'content', 'saut', 'pirouette', 'timide', 'bisou', 'idee'], zones: { bouche: ['chatouilles'], oeil: ['oeil'], tete: ['bonk'], cote: ['pousse'], ailleurs: ['ou'] },
  love: ['amour', 'bisou', 'timide'], annoyed: ['he', 'he', 'impatient', 'esquive'], angry: ['colere', 'colere', 'panique', 'esquive'], pet: ['caresse', 'caresse'] };
for (const sc of SC) for (const pl of [].concat(sc.pool || [])) {
  if (pl.startsWith('zone:')) (TAP.zones[pl.slice(5)] ||= []).push(sc.id); else if (TAP[pl]) TAP[pl].push(sc.id);
}
const ON = {};                                          // event -> the scenes that can answer it
for (const sc of SC) for (const ev of [].concat(sc.on || [])) (ON[ev] ||= []).push(sc);
const MOOD = id => (BY[id] && BY[id].mood) || 'neutre';

/* ---------- state ---------- */
const st = { annoy: 0, love: 0, last: null, tapAt: -1e9, cur: null, nextLife: 0, hist: [], life: true, every: [45000, 150000], lights: null, darkAt: 0, hour: -1, seen: 0,
  told: new Set(), hot: false, hotAt: -1e9, wifi: null, wifiGone: 0, feteDay: '', evAt: {}, evLast: '', pending: null };   // told: the agenda events he already spoke about
try { const s = JSON.parse(localStorage.getItem('pixel.persona') || '{}'); st.seen = Number(s.seen) || 0; } catch { st.seen = 0; }
let savedAt = 0;
function seen(now) { st.seen = Date.now(); if (now - savedAt > 20000) { savedAt = now; try { localStorage.setItem('pixel.persona', JSON.stringify({ seen: st.seen })); } catch {} } }

function start(id, opts = {}) {
  const sc = BY[id]; if (!sc) return false;
  const o = { side: opts.side || 1, tx: opts.tx || 0, ty: opts.ty || 0, ...(opts.data || {}) };
  if (sc.init) sc.init(o);
  const lines = (sc.say || []).map(([a, b, ls]) => [a, b, typeof ls === 'function' ? ls(o) : ls ? pick(ls) : (id === 'heure' ? `Coucou ! Il est ${new Date().getHours()} h.` : '')]);
  st.cur = { sc, t0: H.now(), o, lines, extra: null, forced: !!opts.forced };   // forced: asked for (lab, command), not cut short by the world
  if (sc.group === 'vie') { st.hist.push(id); if (st.hist.length > 5) st.hist.shift(); }
  if (H.onScene) try { H.onScene(id, sc.group); } catch (e) { /* his voice (son.js) must never stop him */ }
  return true;
}
function stop() { st.cur = null; }
function busy() { return !!st.cur; }
const el = () => (st.cur ? H.now() - st.cur.t0 : 0);

/* where a point of the pack's face is on the screen, after the scene's motion (box: the face's 16:9 box) */
function project(box, m, u, v) {
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2, px = box.x + u / 96 * box.w - cx, py = box.y + v / 54 * box.h - cy;
  const sx = m.s * (m.sx || 1) * (m.f ? -1 : 1), sy = m.s * (m.sy || 1), c = Math.cos(m.r), s = Math.sin(m.r);
  const qx = px * sx, qy = py * sy;
  return { x: cx + m.x + qx * c - qy * s, y: cy + m.y + qx * s + qy * c };
}
function unproject(box, m, p) {                      // the reverse: a point on the screen -> pack grid (u, v)
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2, c = Math.cos(-m.r), s = Math.sin(-m.r);
  const dx = p.x - cx - m.x, dy = p.y - cy - m.y, qx = dx * c - dy * s, qy = dx * s + dy * c;
  const sx = m.s * (m.sx || 1) * (m.f ? -1 : 1), sy = m.s * (m.sy || 1);
  return { u: ((qx / sx) + cx - box.x) / box.w * 96, v: ((qy / sy) + cy - box.y) / box.h * 54 };
}
function zoneOf(q) {
  const d = (a) => Math.hypot(q.u - a[0], (q.v - a[1]) * 1.2);
  if (q.u < 6 || q.u > 90 || q.v < 2 || q.v > 52) return 'ailleurs';
  if (d(A.el) < 8 || d(A.er) < 8) return 'oeil';
  if (q.v < 15 && q.u > 22 && q.u < 74) return 'tete';
  if (q.v > 32 && q.v < 47 && q.u > 36 && q.u < 60) return 'bouche';
  if (q.u < 22 || q.u > 74) return 'cote';
  return 'visage';
}

/* ---------- what happens to him ---------- */
function tap(p, box, ctx = {}) {
  const now = H.now(), m = current().m, q = unproject(box, m, p), zone = zoneOf(q), gapT = now - st.tapAt, quick = gapT < 380;
  st.tapAt = now; seen(now);
  const cur = st.cur;
  if (cur && cur.sc.group === 'retour' && el() < 1500) return true;   // the tap that brought you back: let him say hello
  if (cur && cur.sc.sulk) {                          // sulking: he answers without looking
    st.annoy = Math.min(st.annoy + 0.4, 12);
    cur.extra = { t: el(), line: pick(['Pfff.', 'Je boude.', '…', 'Laisse-moi !', 'Non.', 'Je ne te parle plus.', 'Hmpf !']) };
    if (cur.sc.dur - el() < 6000) cur.t0 += 3000;   // pestering a sulker makes it last
    return true;
  }
  if (cur && cur.sc.group === 'vie' && cur.sc.secret && el() > 1500) { start('timide'); st.cur.lines = [[100, 2400, pick(cur.sc.secret)]]; return true; }
  st.annoy += gapT < 700 ? 1.35 : 1;                // taps in a row annoy him more
  if (ctx.night && st.annoy < 2.5 && rnd() < 0.6) return start('nuit-tap');
  if (st.annoy >= 8) { st.annoy = 8; return start('boude'); }
  if (st.annoy >= 5.5) return start(pick(TAP.angry));
  if (st.annoy >= 3) return start(pick(TAP.annoyed));
  if (quick) return start('pirouette');
  if (zone !== 'visage' && TAP.zones[zone] && TAP.zones[zone].length && rnd() < 0.85) {
    const side = zone === 'oeil' ? (q.u < 50 ? -1 : 1) : (q.u < 48 ? -1 : 1), zs = TAP.zones[zone];
    let id = pick(zs); for (let i = 0; i < 4 && zs.length > 1 && id === st.last; i++) id = pick(zs);
    st.last = id; return start(id, { side, tx: p.x - (box.x + box.w / 2), ty: p.y - (box.y + box.h / 2) });
  }
  const pool = st.love > 2 ? TAP.love : TAP.calm, last = cur ? cur.sc.id : st.last;
  let id = pick(pool); for (let i = 0; i < 4 && id === last; i++) id = pick(pool);
  st.last = id; return start(id);
}
function pet() {
  st.love = Math.min(st.love + 1, 8); const wasAnnoyed = st.annoy >= 3; st.annoy = Math.max(0, st.annoy - 3);
  seen(H.now());
  if (st.cur && st.cur.sc.sulk) { if (st.annoy < 4) return start('pardon'); st.cur.extra = { t: el(), line: pick(['…bon, encore un peu.', 'Hmpf… continue.']) }; return true; }
  if (wasAnnoyed) return start('calme');
  if (st.love > 5 && rnd() < 0.6) return start('ronron');
  let id = pick(TAP.pet); for (let i = 0; i < 4 && TAP.pet.length > 1 && id === st.last; i++) id = pick(TAP.pet);
  st.last = id; return start(id);
}
/* something happened around him (EVENTS): a scene that answers it plays, if he is free and on his face screen.
   ctx.visage false: kept for 30 s, played when you come back to his face. Same event: not again within 4 s. */
function event(name, data = {}, ctx = {}) {
  const now = H.now(), list = (ON[name] || []).filter(sc => !sc.when || sc.when(data));
  if (!list.length) return '';
  if (!ctx.force && st.evAt[name] && now - st.evAt[name] < 4000) return '';     // force: the lab's buttons
  if (ctx.visage === false) { st.pending = { name, data, until: now + 30000 }; return ''; }
  const cur = st.cur;
  if (!ctx.force && cur && (cur.forced || cur.sc.sulk || ['tap', 'fache', 'calin', 'retour'].includes(cur.sc.group)) && !list.some(sc => sc.urgent)) return '';
  const pool = list.filter(sc => sc.id !== st.evLast) .length ? list.filter(sc => sc.id !== st.evLast) : list;
  const tot = pool.reduce((a, sc) => a + (sc.w || 1), 0); let r = rnd() * tot, pickd = pool[pool.length - 1];
  for (const sc of pool) { r -= sc.w || 1; if (r < 0) { pickd = sc; break; } }
  st.evAt[name] = now; st.evLast = pickd.id; st.pending = null;
  start(pickd.id, { data: { ...data, event: name } });
  return pickd.id;
}
/* any input. info: { wake: true if it woke him up from his nap }. Returns the scene played, or '' */
function input(info = {}) {
  const now = H.now(), gap = st.seen ? Date.now() - st.seen : 0, h = new Date().getHours();
  seen(now);
  let id = '';
  if (gap >= 6 * 3600e3 || (gap >= 3 * 3600e3 && h >= 5 && h < 11)) id = h >= 5 && h < 12 ? 'bonjour' : h >= 17 ? 'bonsoir' : 'manque';
  else if (gap >= 2 * 3600e3) id = 'manque';
  else if (gap >= 20 * 60e3) id = 'retour';
  else if (info.wake) id = 'reveille';
  // the first hello of Christmas Eve, Christmas Day and New Year's Day is a special one
  const d = new Date(), day = d.toDateString(), fete = d.getMonth() === 11 && (d.getDate() === 24 || d.getDate() === 25) ? 'joyeux-noel' : d.getMonth() === 0 && d.getDate() === 1 ? 'bonne-annee' : '';
  if (id && id !== 'reveille' && fete && st.feteDay !== day) { st.feteDay = day; id = fete; }
  if (id && !(st.cur && st.cur.sc.group === 'retour')) { start(id); st.annoy = 0; }
  return id;
}

/* ---------- every frame ----------
   ctx: { idle: ms without input, canLive: nobody needs the face for something else, weather: 'pluie'..., lightsOn,
          night, rm: reduced motion } */
function update(dt, ctx = {}) {
  const now = H.now();
  if (st.pending && ctx.visage && now < st.pending.until && (!st.cur || st.cur.sc.group === 'vie')) { const pd = st.pending; st.pending = null; event(pd.name, pd.data, { visage: true }); }
  if (st.pending && now >= st.pending.until) st.pending = null;
  st.annoy *= Math.exp(-dt / 16000); st.love *= Math.exp(-dt / 120000);
  // the lights go off, or come back
  if (ctx.lightsOn !== undefined && ctx.lightsOn !== null) {
    if (st.lights === true && ctx.lightsOn === false && ctx.visage) { st.darkAt = now; if (!st.cur || st.cur.sc.group === 'vie') start('noir'); }
    else if (st.lights === false && ctx.lightsOn === true && ctx.visage && st.darkAt && now - st.darkAt < 600000 && (!st.cur || st.cur.sc.group === 'vie')) { st.darkAt = 0; start('lumiere'); }
    st.lights = ctx.lightsOn;
  }
  // the cuckoo: once an hour, on the hour, in the day
  const d = new Date(), hr = d.getHours();
  if (st.hour === -1) st.hour = hr;
  if (hr !== st.hour) { st.hour = hr; if (d.getMinutes() === 0 && hr >= 8 && hr <= 22 && ctx.canLive && !st.cur) start('heure'); }
  // the agenda (ctx.events: today's, with start and end in hours): 10 min before, he taps his watch; a few minutes after, he asks how it went
  const free = !st.cur || st.cur.sc.group === 'vie';
  if (ctx.visage && ctx.events && free) {
    const hNow = hr + d.getMinutes() / 60 + d.getSeconds() / 3600, day = d.toDateString();
    for (const ev of ctx.events) {
      const key = `${day} ${ev.start} ${ev.title}`, before = (ev.start - hNow) * 60, after = (hNow - ev.end) * 60;
      if (before > 0 && before <= 10 && !st.told.has('r' + key)) { st.told.add('r' + key); start('rdv', { data: { min: Math.max(1, Math.round(before)), title: ev.title } }); break; }
      if (after >= 2 && after < 20 && ev.end - ev.start <= 4 && hr >= 8 && hr < 22 && ctx.canLive && !st.cur && !st.told.has('f' + key)) { st.told.add('f' + key); start('rdv-fin', { data: { title: ev.title } }); break; }
    }
  }
  // the Pi: too hot (again every 15 min while it stays hot), the Wi-Fi gone and back (not just an Ethernet cable)
  if (ctx.temp != null) {
    if (ctx.temp < 65) st.hot = false;
    else if (ctx.temp >= 70 && (!st.hot || now - st.hotAt > 900000) && ctx.visage && (!st.cur || st.cur.sc.group === 'vie')) { st.hot = true; st.hotAt = now; start('chaud', { data: { temp: Math.round(ctx.temp) } }); }
  }
  if (ctx.wifi !== undefined) {
    const on = ctx.wifi !== null && ctx.wifi < 0 && ctx.wifi > -100;
    const ok = ctx.visage && (!st.cur || st.cur.sc.group === 'vie');
    if (st.wifi === true && !on) { st.wifiGone = now; if (ok) start('wifi'); }
    else if (st.wifi === false && on && st.wifiGone && now - st.wifiGone < 3600e3) { st.wifiGone = 0; if (ok) start('wifi-ok'); }
    st.wifi = on;
  }
  if (st.cur && now - st.cur.t0 >= st.cur.sc.dur) {
    const was = st.cur.sc; st.cur = null;
    if (was.sulk) { st.annoy = 0; start('pardon'); }
    st.nextLife = now + st.every[0] + rnd() * (st.every[1] - st.every[0]);
  }
  if (st.cur && st.cur.sc.group === 'vie' && ctx.canLive === false && !st.cur.forced) st.cur = null;   // something else needs his face
  if (!st.cur && st.life && !ctx.rm && ctx.canLive && ctx.idle > Math.min(75000, st.every[0]) && now >= st.nextLife) {
    const c = { wet: /pluie|orage|neige/.test(ctx.weather || ''), sunny: ctx.weather === 'soleil', day: hr >= 9 && hr < 19, night: hr >= 23 || hr < 6, xmas: d.getMonth() === 11,
      meal: (hr === 12 || (hr === 19 && d.getMinutes() >= 30) || (hr === 13 && d.getMinutes() < 30)),
      h: hr, mn: d.getMinutes(), wd: d.getDay(), mo: d.getMonth(), dd: d.getDate(), kind: ctx.weather || '', date: d };   // wd 0 = Sunday, mo 0 = January
    const ok = LIFE.filter(s => (!s.when || s.when(c)) && !st.hist.includes(s.id) && (!c.night || s.quiet));      // at night only the quiet ones (quiet: true)
    const tot = ok.reduce((a, s) => a + s.w, 0); let r = rnd() * tot;
    for (const s of ok) { r -= s.w; if (r < 0) { start(s.id); break; } }
    if (!st.cur) st.nextLife = now + 5000;
  }
  return current();
}
function current() {
  const cur = st.cur; if (!cur) return { id: '', group: '', anim: null, mood: null, m: M0, fast: false };
  const e = H.now() - cur.t0, sc = cur.sc, p = clamp(e / sc.dur, 0, 1);
  let anim = sc.anim[0][1]; for (const [t, id] of sc.anim) if (e >= t) anim = id;
  const mv = sc.move && !H.rm ? sc.move(e, p, cur.o) : null, m = { ...M0, ...(mv || {}) };
  const moodMap = { 'idle-impatient': 'confus', boudeur: 'fache', colere: 'fache', panique: 'surpris', triste: 'triste', amoureux: 'amoureux', bisou: 'amoureux', rire: 'content',
    etoiles: 'excite', salut: 'content', content: 'content', surpris: 'surpris', confus: 'confus', timide: 'amoureux', sommeil: 'endormi', 'idle-somnole': 'endormi', baille: 'baille',
    reveil: 'surpris', fier: 'fier', chante: 'content', danse: 'excite', idee: 'excite', zen: 'content', curieux: 'ecoute', reflechit: 'reflechit', fatigue: 'baille', 'clin-oeil': 'clin' };
  return { id: sc.id, group: sc.group, anim, mood: moodMap[anim] || MOOD(sc.id), m, fast: true, e };
}

/* ---------- drawing: props and speech bubbles, in the theme's colours ----------
   Props are drawn in screen pixels. In the pixel themes (Rétro, LCD) they are drawn on a small canvas whose pixel is
   the size of the pack's pixel, then blown up without smoothing: they look like the rest of the face. */
let off = null;
function paint(box, m, fn) {                         // fn(D): props drawn with the drawing kit, in the theme's colours
  const X = H.X, T = H.theme(), c = T.c, pix = !!T.faceFps, U = box.w / 96 * m.s;
  let g = X, k = 1;
  if (pix) {
    k = Math.max(2, Math.round(U));
    const w = Math.ceil(W / k), h = Math.ceil(HT / k);
    if (!off) off = document.createElement('canvas');
    if (off.width !== w || off.height !== h) { off.width = w; off.height = h; }
    g = off.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); g.setTransform(1 / k, 0, 0, 1 / k, 0, 0);
  }
  g.save();
  if (!pix && T.glow) { g.shadowColor = c.fg; g.shadowBlur = Math.min(12, T.glow * 0.8); }
  const crisp = [], D = drawKit(g, box, m, c, U, T, pix, k, crisp);
  try { fn(D); } finally { g.restore(); }
  if (pix) {
    const im = g.getImageData(0, 0, off.width, off.height), d = im.data;
    for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 70 ? 255 : 0;
    g.putImageData(im, 0, 0);
    X.save(); X.imageSmoothingEnabled = false;
    if (T.glow) { X.shadowColor = c.fg; X.shadowBlur = Math.min(14, T.glow); }
    X.drawImage(off, 0, 0, off.width * k, off.height * k); X.restore();
  }
  for (const f of crisp) { X.save(); try { f(X); } finally { X.restore(); } }       // text and signs: always sharp
}
/* what he wears, drawn after his face, scene or not: his Santa hat all December, and in the Christmas scenes */
const hatOn = () => new Date().getMonth() === 11 || (!!st.cur && ['neige', 'joyeux-noel'].includes(st.cur.sc.id));
function decor(box, m) { if (hatOn()) paint(box, m, D => D.santa()); }
function drawOver(box, m) {
  const cur = st.cur; if (!cur) return;
  const T = H.theme(), e = H.now() - cur.t0, sc = cur.sc, p = clamp(e / sc.dur, 0, 1);
  if (sc.props) paint(box, m, D => sc.props(D, e, p, cur.o));
  // speech bubble: the line of the moment, or a retort while sulking
  let line = null;
  for (const [a, b, s] of cur.lines) if (e >= a && e < b && s) line = s;
  if (cur.extra && e - cur.extra.t < 1800) line = cur.extra.line;
  if (line && line !== cur.spoke) { cur.spoke = line; if (H.onSay) try { H.onSay(line, sc.id); } catch (err) { /* his voice must never stop him */ } }
  if (line) bubble(line, box, m, T, sc.side);
}
function bubble(text, box, m, T, side) {
  const X = H.X, c = T.c, size = T.faceFps ? 30 : 26;
  X.save(); X.shadowBlur = 0; X.globalAlpha = 1;
  X.font = T.font(size); const tw = X.measureText(text).width, w = Math.min(720, tw + 34), h = size + 22;
  const top = project(box, m, 48, 12), chin = project(box, m, 48, 46), sa = project(box, m, 80, 20), sb = project(box, m, 16, 20);
  const right = sa.x >= sb.x ? sa : sb, left = sa.x >= sb.x ? sb : sa;        // on the screen, whatever way he faces
  const spot = {                                     // where a bubble can go without covering his face
    above: { x: top.x - w / 2, y: top.y - h - 30, tail: { x: top.x, y: top.y - 8, side: 0 } },
    right: { x: right.x + 24, y: right.y - h / 2, tail: { x: right.x + 6, y: right.y, side: 1 } },
    left: { x: left.x - 24 - w, y: left.y - h / 2, tail: { x: left.x - 6, y: left.y, side: -1 } },
    below: { x: chin.x - w / 2, y: chin.y + 26, tail: { x: chin.x, y: chin.y + 6, side: 2 } },
  };
  const fits = b => b.x >= 8 && b.x + w <= W - 8 && b.y >= 44 && b.y + h <= HT - 46;
  let b = (side ? ['right', 'left', 'above', 'below'] : ['above', 'right', 'left', 'below']).map(k => spot[k]).find(fits);
  if (!b) b = { ...spot.above, y: Math.max(8, spot.above.y) };                 // no room anywhere: above him, over the header
  let { x, y, tail } = b; x = clamp(x, 8, W - 8 - w); y = clamp(y, 8, HT - h - 46);
  if (top.y < -40 || top.y > HT + 120 || top.x < -200 || top.x > W + 200) { x = clamp(W / 2 - w / 2, 8, W - 8 - w); y = 70; tail = null; }   // he is off screen: the bubble stays in view
  if (tail) {
    X.fillStyle = c.bg; X.strokeStyle = c.fg; X.lineWidth = 2; X.beginPath();
    const bx = clamp(tail.x, x + 18, x + w - 18), by = tail.side === 0 ? y + h : tail.side === 2 ? y : clamp(tail.y, y + 12, y + h - 12);
    if (tail.side === 0) { X.moveTo(bx - 10, by - 1); X.lineTo(clamp(tail.x, bx - 26, bx + 26), Math.min(tail.y, by + 24)); X.lineTo(bx + 10, by - 1); }
    else if (tail.side === 2) { X.moveTo(bx - 10, by + 1); X.lineTo(clamp(tail.x, bx - 26, bx + 26), Math.max(tail.y, by - 24)); X.lineTo(bx + 10, by + 1); }
    else { const ex = tail.side > 0 ? x : x + w; X.moveTo(ex, by - 8); X.lineTo(tail.x, tail.y); X.lineTo(ex, by + 8); }
    X.fill(); X.stroke();
  }
  T.box(x, y, w, h, c.fg, c.bg);
  if (tail) { X.fillStyle = c.bg; const bx = clamp(tail.x, x + 18, x + w - 18); if (tail.side === 0) X.fillRect(bx - 8, y + h - 3, 16, 4); else if (tail.side === 2) X.fillRect(bx - 8, y - 1, 16, 4); }
  H.txt(H.fit(text, w - 24, size), x + w / 2, y + 11, size, c.fg, 'center');
  X.restore();
}
/* the drawing kit a scene gets: shapes placed on the face (in the pack's grid) or on the screen */
function drawKit(g, box, m, c, U, T, pix, k = 1, crisp = []) {
  const at = name => { const a = A[name] || A.c; return project(box, m, a[0], a[1]); };
  const lw = v => Math.max(v, pix ? k * 1.05 : 1);        // in the pixel themes a line is at least one of their pixels
  const col = { fg: c.fg, pink: c.pink || c.accent, acc: c.accent || c.fg, hi: c.hi || c.fg, dim: c.dim || c.fg, bg: c.bg };
  const t = H.now();
  const heart = (x, y, s, fill) => { g.fillStyle = fill; g.beginPath(); g.moveTo(x, y + s * 0.35); g.bezierCurveTo(x, y - s * 0.1, x - s * 0.6, y - s * 0.15, x - s * 0.6, y + s * 0.25); g.bezierCurveTo(x - s * 0.6, y + s * 0.6, x, y + s * 0.8, x, y + s); g.bezierCurveTo(x, y + s * 0.8, x + s * 0.6, y + s * 0.6, x + s * 0.6, y + s * 0.25); g.bezierCurveTo(x + s * 0.6, y - s * 0.15, x, y - s * 0.1, x, y + s * 0.35); g.fill(); };
  const star = (x, y, r, fill, rot = 0) => { g.fillStyle = fill; g.beginPath(); for (let i = 0; i < 10; i++) { const a = rot + i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); };
  const drop = (x, y, s, fill) => { g.fillStyle = fill; g.beginPath(); g.moveTo(x, y - s); g.quadraticCurveTo(x + s * 0.75, y + s * 0.1, x, y + s * 0.6); g.quadraticCurveTo(x - s * 0.75, y + s * 0.1, x, y - s); g.fill(); };
  const ring = (x, y, r, stroke, w) => { g.strokeStyle = stroke; g.lineWidth = lw(w); g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); };
  const glyph = (s, x, y, size, fill) => {
    const al = g.globalAlpha, draw = q => { q.globalAlpha = al; q.fillStyle = fill; q.font = T.font(Math.round(size), 'title'); q.textAlign = 'center'; q.textBaseline = 'middle'; q.fillText(s, x, y); };
    if (pix) crisp.push(draw); else draw(g);
  };
  const D = {
    at,
    hearts(e, n = 1) {                              // hearts rising from his head
      const o = at('top');
      for (let i = 0; i < Math.round(3 * n); i++) { const q = ((e / 1400) + i / 3) % 1, x = o.x + (i - 1) * 6 * U + Math.sin(q * 6 + i) * 2.5 * U, y = o.y - q * 13 * U; g.globalAlpha = Math.min(1, (1 - q) * 2); heart(x, y, (2.2 + 0.8 * Math.sin(q * 9)) * U, col.pink); }
      g.globalAlpha = 1;
    },
    tear(eye, q) { const a = at(eye), y = a.y + (3 + q * 9) * U; g.globalAlpha = 1 - Math.max(0, q - 0.8) * 5; drop(a.x + 0.5 * U, y, 1.8 * U, col.hi); g.globalAlpha = 1; },
    blush(q) { g.globalAlpha = 0.55 * q; g.fillStyle = col.pink; for (const e of ['el', 'er']) { const a = at(e); g.beginPath(); g.ellipse(a.x, a.y + 7.5 * U, 3.6 * U, 1.6 * U, 0, 0, TAU); g.fill(); } g.globalAlpha = 1; },
    dizzy(e, q = 1) { const o = at('top'); g.globalAlpha = q; for (let i = 0; i < 3; i++) { const a = e / 280 + i * TAU / 3; star(o.x + Math.cos(a) * 12 * U, o.y - 3 * U + Math.sin(a) * 3 * U, 2.3 * U, i === 1 ? col.hi : col.acc, a); } g.globalAlpha = 1; },
    stars(e) { const o = at('c'); for (let i = 0; i < 6; i++) { const q = ((e / 900) + i / 6) % 1, a = i * TAU / 6 + e / 1500; g.globalAlpha = 1 - q; star(o.x + Math.cos(a) * (14 + 24 * q) * U, o.y + Math.sin(a) * (8 + 14 * q) * U, (1.5 + 1.5 * (1 - q)) * U, i % 2 ? col.acc : col.hi, a); } g.globalAlpha = 1; },
    vein(e) { const o = project(box, m, 80, 12), s = (1.8 + 0.4 * Math.sin(e / 90)) * U; g.strokeStyle = col.acc; g.lineWidth = lw(0.9 * U); g.lineCap = 'round';
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, cx = o.x + Math.cos(a) * s * 0.9, cy = o.y + Math.sin(a) * s * 0.9; g.beginPath(); g.arc(cx, cy, s * 0.7, a + Math.PI * 0.75, a + Math.PI * 1.25); g.stroke(); } },
    steam(e) { for (const side of [-1, 1]) for (let i = 0; i < 2; i++) { const q = ((e / 700) + i / 2) % 1, a = project(box, m, 48 + side * 26, 8); g.globalAlpha = (1 - q) * 0.8; ring(a.x + side * q * 6 * U, a.y - q * 9 * U, (1.2 + q * 2.4) * U, col.dim, 0.6 * U); } g.globalAlpha = 1; },
    sweat(e) { const a = project(box, m, 80, 16), q = (e / 900) % 1; drop(a.x + q * 2 * U, a.y + q * 6 * U, 1.8 * U, col.hi); },
    zzz(e, n = 1) { const o = project(box, m, 74, 12); for (let i = 0; i < 3; i++) { const q = ((e / 2200) + i / 3) % 1; g.globalAlpha = Math.min(1, (1 - q) * 2) * n; glyph('Z', o.x + q * 10 * U + i * U, o.y - q * 12 * U, (3 + q * 3) * U, col.fg); } g.globalAlpha = 1; },
    notes(e) { const o = project(box, m, 70, 30); for (let i = 0; i < 3; i++) { const q = ((e / 1600) + i / 3) % 1; g.globalAlpha = Math.min(1, (1 - q) * 2); glyph(i % 2 ? '♫' : '♪', o.x + q * 14 * U + Math.sin(q * 8) * 2 * U, o.y - q * 16 * U, 5 * U, i === 1 ? col.acc : col.fg); } g.globalAlpha = 1; },
    bubbles(e, from = 'mouth') { const o = at(from); for (let i = 0; i < 5; i++) { const q = ((e / 1500) + i / 5) % 1, x = o.x + Math.sin(q * 7 + i * 2) * 2.5 * U * (1 + q), y = o.y - q * 26 * U; g.globalAlpha = Math.min(1, (1 - q) * 2.5); ring(x, y, (0.8 + q * 1.4) * U, col.hi, Math.max(1, 0.45 * U)); } g.globalAlpha = 1; },
    hic(e) { const ph = (e % 1100) / 1100; if (ph < 0.45) { g.globalAlpha = 1 - ph / 0.45; const o = project(box, m, 78, 10); glyph('hic !', o.x + ph * 8 * U, o.y - ph * 8 * U, 4.2 * U, col.fg); g.globalAlpha = 1; } },
    spray(q) { const o = at('mouth'); g.fillStyle = col.hi; for (let i = 0; i < 9; i++) { const a = -0.6 + i * 0.15, r = (6 + q * 22) * U * (0.7 + (i % 3) * 0.15); g.globalAlpha = 1 - q; g.beginPath(); g.arc(o.x + Math.cos(a) * r, o.y + Math.sin(a) * r * 0.6, 0.7 * U, 0, TAU); g.fill(); } g.globalAlpha = 1; },
    knock(e) { const ph = (e % 650) / 650; if (ph < 0.4) { g.globalAlpha = 1 - ph / 0.4; const o = project(box, m, 86, 32); glyph('toc', o.x + 8 * U, o.y - ph * 6 * U, 4 * U, col.fg); g.globalAlpha = 1; } },
    fly(x, y, e) {
      const b = pix ? Math.max(k * 1.3, 0.9 * U) : Math.max(3, 0.9 * U), wg = pix ? 1.5 : 1, fl = Math.sin(e / 18) * 0.5 + 0.5;
      g.fillStyle = col.fg; g.beginPath(); g.arc(x, y, b, 0, TAU); g.fill();
      g.globalAlpha = pix ? 1 : 0.7; g.fillStyle = pix ? col.dim : col.hi;
      for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(x + sd * 1.2 * U * wg, y - 1.1 * U * wg * (0.6 + fl * 0.6), 1.2 * U * wg, 0.7 * U * wg, sd * 0.5, 0, TAU); g.fill(); }
      g.globalAlpha = 1; },
    cloud(e, q, rain) { const o = project(box, m, 48, 2), y = Math.max(o.y - 7 * U, 56 + 6 * U); g.globalAlpha = q; g.fillStyle = col.dim;
      for (const [dx, dy, r] of [[-9, 1, 4.5], [-3, -2, 6], [4, -1, 5.5], [10, 1.5, 4]]) { g.beginPath(); g.arc(o.x + dx * U, y + dy * U, r * U, 0, TAU); g.fill(); }
      g.fillRect(o.x - 13 * U, y + 1 * U, 27 * U, 4 * U);
      if (rain) { g.strokeStyle = col.hi; g.lineWidth = lw(0.5 * U); for (let i = 0; i < 7; i++) { const qq = ((e / 500) + i / 7) % 1, x = o.x + (-11 + i * 3.6) * U; g.beginPath(); g.moveTo(x - qq * U, y + (6 + qq * 16) * U); g.lineTo(x - qq * U - 0.8 * U, y + (8.5 + qq * 16) * U); g.stroke(); } }
      g.globalAlpha = 1; },
    sun(e, q) { const p0 = project(box, m, 90, 4), o = { x: Math.min(p0.x, W - 12 - 9 * U), y: Math.max(p0.y, 56 + 9 * U) }; g.globalAlpha = q; g.fillStyle = col.acc; g.beginPath(); g.arc(o.x, o.y, 4.5 * U, 0, TAU); g.fill(); g.strokeStyle = col.acc; g.lineWidth = lw(0.8 * U);
      for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + e / 2000; g.beginPath(); g.moveTo(o.x + Math.cos(a) * 6.5 * U, o.y + Math.sin(a) * 6.5 * U); g.lineTo(o.x + Math.cos(a) * 9 * U, o.y + Math.sin(a) * 9 * U); g.stroke(); } g.globalAlpha = 1; },
    thought(icon, q) {
      const p0 = project(box, m, 78, 8), o = { x: Math.min(p0.x, W - 12 - 20 * U), y: Math.max(p0.y, 54 + 19 * U) };     // kept on the screen
      g.globalAlpha = q; g.fillStyle = col.bg; g.strokeStyle = col.fg; g.lineWidth = lw(Math.max(1.5, 0.45 * U));
      for (const [dx, dy, r] of [[0, 0, 1], [3, -3.5, 1.6]]) { g.beginPath(); g.arc(o.x + dx * U, o.y + dy * U, r * U, 0, TAU); g.fill(); g.stroke(); }
      const bx = o.x + 11 * U, by = o.y - 12 * U; g.beginPath(); g.ellipse(bx, by, 9 * U, 6.5 * U, 0, 0, TAU); g.fill(); g.stroke();
      const s = U;
      if (icon === 'pizza') { g.fillStyle = col.acc; g.beginPath(); g.moveTo(bx - 4 * s, by - 3 * s); g.lineTo(bx + 4 * s, by - 3 * s); g.lineTo(bx, by + 4 * s); g.closePath(); g.fill(); g.fillStyle = col.pink; for (const [x, y] of [[-1.5, -1.5], [1.4, -1.2], [0, 1.2]]) { g.beginPath(); g.arc(bx + x * s, by + y * s, 0.8 * s, 0, TAU); g.fill(); } }
      else if (icon === 'poisson') { g.fillStyle = col.hi; g.beginPath(); g.ellipse(bx - 0.5 * s, by, 3.6 * s, 2.2 * s, 0, 0, TAU); g.fill(); g.beginPath(); g.moveTo(bx + 2.6 * s, by); g.lineTo(bx + 5 * s, by - 2.2 * s); g.lineTo(bx + 5 * s, by + 2.2 * s); g.closePath(); g.fill(); }
      else if (icon === 'coeur') heart(bx, by - 3.2 * s, 5.5 * s, col.pink);
      else if (icon === 'ampoule') { g.fillStyle = col.acc; g.beginPath(); g.arc(bx, by - 0.8 * s, 3 * s, 0, TAU); g.fill(); g.fillStyle = col.dim; g.fillRect(bx - 1.5 * s, by + 2 * s, 3 * s, 2 * s); }
      else star(bx, by, 4 * s, col.acc);
      g.globalAlpha = 1;
    },
    watch(e, q) {                                   // a little clock by his side, its hands racing: hurry!
      const p0 = project(box, m, 86, 30), o = { x: Math.min(p0.x + 4 * U, W - 12 - 6 * U), y: Math.max(p0.y, 56 + 6 * U) };
      g.globalAlpha = q; g.fillStyle = col.bg; g.strokeStyle = col.fg; g.lineWidth = lw(0.8 * U); g.lineCap = 'round';
      g.beginPath(); g.arc(o.x, o.y, 5 * U, 0, TAU); g.fill(); g.stroke();
      for (const [len, every, w] of [[3.6, 350, 0.6], [2.4, 4200, 0.9]]) {
        const a = e / every * TAU - Math.PI / 2; g.lineWidth = lw(w * U); g.beginPath(); g.moveTo(o.x, o.y); g.lineTo(o.x + Math.cos(a) * len * U, o.y + Math.sin(a) * len * U); g.stroke();
      }
      g.fillStyle = col.acc; g.fillRect(o.x - 1.2 * U, o.y - 7.2 * U, 2.4 * U, 1.6 * U);       // the button on top
      if ((e % 700) < 350) { g.strokeStyle = col.acc; g.lineWidth = lw(0.5 * U); for (const sd of [-1, 1]) { g.beginPath(); g.arc(o.x, o.y, 7 * U, -Math.PI / 2 + sd * 0.5, -Math.PI / 2 + sd * 0.9, sd < 0); g.stroke(); } }
      g.globalAlpha = 1;
    },
    heat(e, q) {                                    // hot air rising on both sides of his head (his speech bubble takes the top)
      g.globalAlpha = q * 0.9; g.strokeStyle = col.acc; g.lineWidth = lw(0.6 * U); g.lineCap = 'round';
      for (const u of [10, 17, 79, 86]) {
        const o = project(box, m, u, 12); g.beginPath();
        for (let j = 0; j <= 7; j++) { const y = o.y - (2 + j * 1.5) * U, x = o.x + Math.sin(j * 0.9 + e / 180 + u) * 1.2 * U; if (j) g.lineTo(x, y); else g.moveTo(x, y); }
        g.stroke();
      }
      g.globalAlpha = 1;
    },
    antenna(e, ok, q) {                             // a Wi-Fi sign by his head (his speech bubble takes the top): arcs lighting up one by one, or a cross
      const p0 = project(box, m, 86, 12), o = { x: Math.min(p0.x, W - 12 - 9 * U), y: Math.max(p0.y, 56 + 8 * U) };
      const lit = ok ? Math.floor(e / 250) % 4 : (Math.floor(e / 450) % 2 ? 0 : 1);
      g.globalAlpha = q; g.lineCap = 'round'; g.fillStyle = col.fg; g.beginPath(); g.arc(o.x, o.y, 1 * U, 0, TAU); g.fill();
      for (let i = 1; i <= 3; i++) { g.strokeStyle = i <= lit ? col.hi : col.dim; g.lineWidth = lw(0.8 * U); g.beginPath(); g.arc(o.x, o.y, 2.2 * i * U, -Math.PI * 0.75, -Math.PI * 0.25); g.stroke(); }
      if (!ok) {
        const x = o.x + 6 * U, y = o.y - 7 * U, s = 1.6 * U; g.strokeStyle = col.acc; g.lineWidth = lw(0.8 * U);
        g.beginPath(); g.moveTo(x - s, y - s); g.lineTo(x + s, y + s); g.moveTo(x + s, y - s); g.lineTo(x - s, y + s); g.stroke();
      }
      g.globalAlpha = 1;
    },
    snow(e, q = 1) {                                // snowflakes falling all over the screen
      g.globalAlpha = q; g.fillStyle = col.hi;
      for (let i = 0; i < 18; i++) {
        const speed = 34 + (i * 37 % 10) * 4, y = 44 + ((e / 1000) * speed + i * 53) % 440, x = (i * 97 + 31) % 780 + 10 + Math.sin(e / 700 + i) * 12;
        g.beginPath(); g.arc(x, y, Math.max(1.5, (0.5 + (i % 3) * 0.25) * U), 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
    },
    santa() {                                       // a Santa hat on his head, its tip flopping to the side
      const P = (u, v) => project(box, m, u, v), a = P(34, 13.5), b = P(62, 13.5), tip = P(71, 1), c1 = P(41, -1), c2 = P(60, 3);
      g.fillStyle = col.acc; g.beginPath(); g.moveTo(a.x, a.y); g.quadraticCurveTo(c1.x, c1.y, tip.x, tip.y); g.quadraticCurveTo(c2.x, c2.y, b.x, b.y); g.closePath(); g.fill();
      const l = P(32, 12), r = P(64, 12), r2 = P(64, 16), l2 = P(32, 16);       // the white band, just above his eyes, then the pompom
      g.fillStyle = col.hi; g.beginPath(); g.moveTo(l.x, l.y); g.lineTo(r.x, r.y); g.lineTo(r2.x, r2.y); g.lineTo(l2.x, l2.y); g.closePath(); g.fill();
      g.beginPath(); g.arc(tip.x, tip.y, 2.8 * U, 0, TAU); g.fill();
    },
    sign(l1, l2, q) {                               // a little sign on a stick, always drawn sharp
      const o = project(box, m, 84, 6), w = 128, h = 56, x = clamp(o.x - 10, 8, W - 8 - w), y = clamp(o.y - h - 28, 50, HT - h - 80) + (1 - out(q)) * 20;
      crisp.push(q2 => {
        q2.globalAlpha = q; q2.fillStyle = col.dim; q2.fillRect(x + w / 2 - 2, y + h, 4, 26);
        q2.fillStyle = col.bg; q2.strokeStyle = col.fg; q2.lineWidth = 3; q2.fillRect(x, y, w, h); q2.strokeRect(x, y, w, h);
        q2.fillStyle = col.fg; q2.font = T.font(19, 'title'); q2.textAlign = 'center'; q2.textBaseline = 'middle'; q2.fillText(l1, x + w / 2, y + 18); q2.fillText(l2, x + w / 2, y + 39);
      });
    },
  };
  Object.assign(D, { g, U, P: (u, v) => project(box, m, u, v), col, lw, heart, star, drop, ring, glyph, pix, k });
  for (const n in PROPS) if (!(n in D)) D[n] = (...a) => { try { PROPS[n](D, ...a); } catch (err) { /* a pack's prop must never stop him */ } };
  return D;
}

return {
  scenes: SC.map(s => ({ id: s.id, label: s.label, group: s.group, dur: s.dur })),
  get state() { return { annoy: st.annoy, love: st.love, seen: st.seen, life: st.life, cur: st.cur ? st.cur.sc.id : '', next: st.nextLife, say: st.cur && st.cur.spoke || '', hat: hatOn() }; },
  setLife(on) { st.life = !!on; if (!on && st.cur && st.cur.sc.group === 'vie') st.cur = null; },
  setEvery(min, max) { st.every = [min, max]; st.nextLife = Math.min(st.nextLife, H.now() + min); },
  away(ms) { st.seen = Date.now() - ms; },        // the lab: pretend you were away
  reset() { Object.assign(st, { annoy: 0, love: 0, last: null, tapAt: -1e9, cur: null, nextLife: 0, hist: [], lights: null, darkAt: 0,
    told: new Set(), hot: false, hotAt: -1e9, wifi: null, wifiGone: 0, feteDay: '', evAt: {}, evLast: '', pending: null }); },   // tests
  tap, pet, input, update, current, drawOver, decor, play: id => start(id, { forced: true }), stop, busy, project, unproject, zoneOf,
  pools: TAP, quiet: SC.filter(s => s.quiet).map(s => s.id),
  event, events: Object.entries(EVENTS).map(([id, label]) => ({ id, label, scenes: (ON[id] || []).map(x => x.id) })),
};
};
