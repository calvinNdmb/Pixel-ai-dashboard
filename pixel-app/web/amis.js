/* Les amis de Pixel on the screens. pixel/amis.py keeps the friends and the visits (snapshot "amis"); web/scenes/amis.js has
   the scenes, the visitor's part of each (PixelAmisDuo) and the stickers (PixelAmisArt). This file:
   - his face screen (a screens.js add-on): a friend's Pixel on a visit, beside him, with the face of the theme (pack or living
     face), his own look (PixelLook.with, when there), his name under him, his lines in a bubble, his props; this Pixel moves
     to the left and shrinks (persona.update), and every scene of the host's programme plays at its time; touch the visitor:
     he giggles. His own Pixel away: the empty screen shows where he is (a little house, « Chez Bip », the time left,
     « Rappelle-le »), then his return and his story. A friend knocking (« Me demander avant »): Oui / Non. His code, big.
     A coucou, a sticker, a new friend: the friend's face peeps in from the corner.
   - Une chose à la fois: a cast (screens.js draws it instead), the quick menu (drawn over everything) and an open exercise
     (web/exos.js) come first: the visit waits under them, its time runs on. It comes before his offer « Une petite
     question ? » (no moments of life during a visit) and the food tray and plate (web/nourrir.js), which wait for its end.
   - the phone: « Amis » under the keys opens « Ses amis » (window.PixelPanel('amis')): the visit of the moment, the friends
     (their face, « Va le voir », « Coucou », a sticker, « Retirer »), my code (and its QR code), a friend's code to type, the
     settings (the parents' switch « Amis »), the journal.
   - the rules the lab's fake server shares (lab/amis-lab.js): the codes, the commands, a visit's programme.
   Loaded after screens.js, poche.js, nourrir.js and exos.js, before app.js; in the lab before demo-hub.js. */
window.PixelAmis = (() => {
/* the 512 words of the friendship codes, as written (pixel/amis.py reads them from here, between the backquotes): simple
   French words a child reads and types, no two of them sounding alike; a code is three of them and a number, 1000 to 9999 */
const MOTS = `
abeille agneau aigle âne autruche baleine biche bison blaireau bourdon canard castor chameau chamois chat chaton cheval chèvre
chien chiot chouette cigale cigogne cochon colibri colombe corbeau crabe crapaud criquet crocodile dauphin dindon dragon
écureuil éléphant escargot faucon fourmi furet gazelle girafe gorille grillon guépard hamster hérisson hibou homard iguane
jaguar kangourou koala lama lapin léopard lézard licorne lion loup loutre lynx mammouth manchot marmotte merle moineau morse
mouton otarie ours panda panthère papillon perroquet pélican pieuvre pigeon pingouin pivert poney poule poulain poulet poussin
puma renard requin sanglier sardine saumon scarabée serpent singe souris suricate taupe tatou tigre tortue toucan truite vache
zèbre chenille poisson dinosaure ourson méduse crevette canari abricot ananas avocat banane beignet biscuit bonbon brioche
brocoli cacao carotte cerise chocolat citron compote concombre cookie courgette crêpe croissant fraise framboise fromage gaufre
glace haricot kiwi mangue melon miel myrtille navet noisette olive orange pastèque patate pêche poire poivron pomme popcorn
potiron prune pizza radis raisin salade sucre tarte tartine tomate vanille yaourt cornichon galette muffin nougat praline sirop
figue litchi mandarine papaye pistache quiche ravioli jambon saucisse frite flan caramel guimauve sandwich omelette spaghetti
bretzel clafoutis chips macaron chantilly fondue asperge arbre automne bambou branche buisson cactus caillou canyon cascade
colline comète corail désert éclair étoile falaise feuille fleur forêt fougère galaxie givre glacier gland grotte herbe hiver
jardin jungle lagune lune montagne mousse neige nuage océan orage palmier planète plage pluie prairie printemps rivière rocher
ruisseau saison soleil source tempête tulipe vague vallée volcan lilas muguet lavande tournesol bourgeon nénuphar mimosa pétale
racine graine étang oasis banquise iceberg ciel trèfle flocon glaçon aimant ampoule armoire assiette balai ballon bateau bougie
boussole bureau cadeau cahier camion canapé carton chaise chaussure cheminée cloche coffre collier crayon cuillère drapeau
écharpe échelle éponge fauteuil fenêtre feutre flûte fusée gant gilet guitare hamac horloge jouet journal kayak lampe lanterne
livre loupe manteau masque matelas micro miroir montre moto mouchoir oreiller panier peigne pelle piano pinceau placard plume
porte poupée puzzle radio raquette robot robinet ruban sac savon sifflet stylo table tableau tambour tapis tasse tente toboggan
toupie train trousse valise vélo violon voiture yoyo cartable règle compas luge ski patin domino bille peluche doudou tipi igloo
cabane chalet château pont tunnel fontaine statue palais cirque école musée garage grenier cuisine chambre plafond couloir volet
bouée parapluie lunette brouette arrosoir parachute boomerang kimono pyramide sabot tirelire vaisseau fanion sablier chaudron
baguette avion bus canoë métro navire paquebot radeau roller scooter taxi tracteur tram voilier wagon traîneau carrosse hélice
moteur bleu rouge jaune violet gris marron blanc doré argent cercle triangle losange cube spirale zigzag ovale musique chanson
trompette harpe grelot harmonica fanfare martien ovni soucoupe télescope satellite géant lutin pirate chevalier princesse roi
trésor couronne potion sirène elfe génie magicien tennis judo karaté danse surf voile yoga rugby basket golf marelle cerceau
corde diabolo bowling main pied oreille genou coude épaule jambe bras ventre pompier docteur facteur fermier pilote marin
peintre clown boulanger bisou câlin sourire blague surprise confetti bulle pirouette galipette acrobate carnaval parade lumière
ombre écho aventure voyage secret énigme mystère message
`.trim().split(/\s+/);
const norm = s => String(s ?? '').toLowerCase().trim().normalize('NFD').replace(/\p{Mn}/gu, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/’/g, "'");
const MOT = Object.fromEntries(MOTS.map(w => [norm(w), w]));
const ART = window.PixelAmisArt || null, DUO = window.PixelAmisDuo || {};
const STOP = new Set(['pixel', 'ami', 'amis', 'code', 'codes', 'd', 'l', 'de', 'du', 'le', 'la', 'mon', 'ton', 'son', 'est', 'c', 'voici', 'voila',
  'nouvel', 'nouveau', 'un', 'une', 's', 'il', 'qu', 'y', 'a']);

/* ---------- the rules (pixel/amis.py: lire_code, proche, pourquoi_code, programme, command) ---------- */
function distance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0)));
    prev = cur;
  }
  return prev[b.length];
}
function proche(w) {                                   // the word of the list closest to a mistyped one (2 letters at most), when clear
  if (w.length > 16) return null;
  const best = Object.keys(MOT).filter(k => Math.abs(k.length - w.length) <= 2).map(k => [distance(w, k), k]).sort((x, y) => x[0] - y[0] || (x[1] < y[1] ? -1 : 1));
  return best.length && best[0][0] <= 2 && (best.length === 1 || best[1][0] > best[0][0]) ? MOT[best[0][1]] : null;
}
function parse(text) {                                 // { code } or { why: { inconnus, idees } | { mots } | { nombre } }
  const t = norm(String(text ?? '').slice(0, 300)), tokens = t.match(/[a-z]+|\d+/g) || [];
  const words = tokens.filter(w => !/^\d+$/.test(w) && !STOP.has(w)), digits = tokens.filter(w => /^\d+$/.test(w)).join('');
  const unknown = words.filter(w => !Object.hasOwn(MOT, w)).slice(0, 3);
  if (unknown.length) { const idees = {}; for (const w of unknown) { const p = proche(w); if (p) idees[w] = p; } return { why: { inconnus: unknown, idees } }; }
  if (words.length !== 3) return { why: { mots: words.length } };
  if (digits.length !== 4 || +digits < 1000) return { why: { nombre: digits.slice(0, 8) } };
  return { code: [...words, digits].join('-') };
}
function pourquoi(why) {
  if (!why) return '';
  if (why.inconnus && why.inconnus.length) { const w = why.inconnus[0], i = (why.idees || {})[w]; return `« ${w} » n’est pas un mot des codes d’ami.` + (i ? ` Tu voulais dire « ${i} » ?` : ' Vérifie le code.'); }
  if ('mots' in why) return 'Un code d’ami, c’est trois mots et un nombre, comme « lapin soleil tarte 4271 ».';
  return 'Il manque le nombre du code : quatre chiffres, comme 4271.';
}
const ecrit = code => { const p = String(code || '').split('-'); return { mots: p.slice(0, 3).map(w => MOT[w] || w), nombre: p[3] || '' }; };
const texte = code => { const e = ecrit(code); return [...e.mots, e.nombre].join(' · '); };
function nouveau(rnd = Math.random) { const k = Object.keys(MOT), r = () => k[Math.floor(rnd() * k.length)]; return [r(), r(), r(), 1000 + Math.floor(rnd() * 9000)].join('-'); }   // the lab's
const ACTIVITES = ['ami-danse', 'ami-tape', 'ami-course', 'ami-gouter', 'ami-cache', 'ami-blague', 'ami-bavarde'], PAUSE = 2500;
function programme(total, tard, durs, rnd = Math.random) {   // pixel/amis.py programme(): durs, the scenes' durations (persona.scenes)
  const d = id => durs[id] || 10000, acts = [...ACTIVITES];
  for (let i = acts.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [acts[i], acts[j]] = [acts[j], acts[i]]; }
  const fin = ['ami-photo', ...(tard ? ['ami-dodo'] : []), 'ami-aurevoir'];
  let budget = total - (d('ami-arrive') + PAUSE + fin.reduce((s, x) => s + d(x) + PAUSE, 0) - PAUSE);
  const chosen = [];
  for (const a of acts) if (!chosen.length || d(a) + PAUSE <= budget) { chosen.push(a); budget -= d(a) + PAUSE; }
  if (budget < 0 && fin.length > 1) fin.shift();
  const items = []; let t = 0;
  for (const x of ['ami-arrive', ...chosen, ...fin]) { items.push({ id: x, at: t }); t += d(x) + PAUSE; }
  t -= PAUSE;
  if (t > total) { const k = total / t; for (const it of items) it.at = Math.floor(it.at * k); t = total; }
  return { items, total: Math.round(t) };
}
/* typed commands (pixel/amis.py command): { action, args } | { toast } | null. friends: [{ id, nom }] as the snapshot shows them */
const STICKER_WORDS = {};
if (ART) {
  for (const s of ART.STICKERS) for (const w of [s.id, norm(s.nom), norm(s.nom).replace(/^(?:un|une|des) /, '')]) STICKER_WORDS[w] ??= s.id;
  for (const [w, i] of Object.entries({ coeurs: 'coeur', etoiles: 'etoile', fleurs: 'fleur', gateaux: 'gateau', note: 'musique', 'arc en ciel': 'arc', 'arc-en-ciel': 'arc', bisous: 'bisou', cadeaux: 'cadeau', fusees: 'fusee' })) if (ART.BY[i]) STICKER_WORDS[w] ??= i;
}
const LISTE = new Set(['mes amis', 'tes amis', 'ses amis', 'les amis', 'liste des amis', 'liste de mes amis', 'amis', 'tes amis pixel', 'mes amis pixel']);
function command(raw, A) {
  const t = norm(raw).replace(/\s+/g, ' ').replace(/^[ !?.]+|[ !?.]+$/g, ''), friends = (A && A.amis) || [];
  const who = name => { const k = norm(name); return friends.find(f => norm(f.nom) === k) || null; };
  let m;
  if (LISTE.has(t)) {
    if (!A || !A.dispo) return { toast: (A && A.pourquoi) || 'Les amis de Pixel ne sont pas disponibles ici.', ms: 6000 };
    if (!friends.length) return { toast: 'Pas encore d’ami Pixel. Sur ton téléphone, « Ses amis » : donne ton code d’ami à un copain, ou tape le sien.', ms: 9000 };
    const first = friends[0].nom; return { toast: `Ses amis : ${friends.map(f => f.nom).join(', ')}. Tape « va voir ${first} », « dis coucou à ${first} ».`, ms: 9000 };
  }
  if (/^(?:mon |ton |son |le )?code(?: d'| d | de l')?ami$/.test(t)) return { action: 'amis.montre', args: { on: true } };
  if ((m = t.match(/^(?:ajoute|ajouter|nouvel|nouveau)(?:\s+(?:l'|un |le |mon ))?\s*ami\s*:?\s*(.*)$/))) {
    if (!m[1].trim()) return { toast: 'Tape le code de ton copain après « ajoute l’ami », par exemple « ajoute l’ami lapin soleil tarte 4271 ».', ms: 7000 };
    const p = parse(m[1]); return p.code ? { action: 'amis.ajoute', args: { code: m[1] } } : { toast: pourquoi(p.why), ms: 7000 };
  }
  if (['reviens', 'rentre', 'rentre a la maison', 'reviens a la maison', 'reviens vite', 'rentre vite'].includes(t) && A && A.visite && A.visite.sens === 'sortie') return { action: 'amis.rappel', args: {} };
  if ((m = t.match(/^(?:va|vas|aller|pars|file|cours)\s+(?:voir|chez|jouer avec|jouer chez|rendre visite a)\s+(.+)$|^(?:rends|rend)\s+visite\s+a\s+(.+)$/))) { const f = who(m[1] || m[2]); return f ? { action: 'amis.visite', args: { ami: f.id } } : null; }
  if ((m = t.match(/^(?:dis|fais|fait|envoie|envoies)(?: un)?\s+(?:petit\s+)?coucou\s+a\s+(.+)$/))) { const f = who(m[1]); return f ? { action: 'amis.coucou', args: { ami: f.id } } : null; }
  if ((m = t.match(/^(?:envoie|envoies)\s+(?:un |une |des )?(.+?)\s+a\s+(.+)$/)) && STICKER_WORDS[m[1]]) { const f = who(m[2]); return f ? { action: 'amis.sticker', args: { ami: f.id, s: STICKER_WORDS[m[1]] } } : null; }
  return null;
}
/* the words for the journal, the panel and the lab (pixel/amis.py REFUS, the visitor's own words in web/scenes/amis.js) */
const REFUS = { 'pas-de-reponse': 'il n’a pas répondu', dort: 'il dormait', occupe: 'il était occupé', exo: 'il faisait des maths', absent: 'il n’était pas là',
  visite: 'il avait déjà de la visite', ferme: 'il ne reçoit pas de visite', non: 'pas maintenant', 'pas-repondu': 'personne n’a ouvert', croise: 'vous vous êtes croisés',
  reseau: 'pas d’Internet' };
const stickerName = s => (ART && ART.BY[s] ? ART.BY[s].nom : 'un autocollant');
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
function said(j) {                                     // one line of the journal, for a child
  const n = j.nom || 'un ami', story = ART && j.fait && j.fait.length ? ART.story(j.fait).replace(/ !$/, '') : '';
  switch (j.quoi) {
    case 'nouvel-ami': return `Nouvel ami : ${n} !`;
    case 'plus-ami': return `${n} n’est plus dans ses amis.`;
    case 'retire': return `Tu as retiré ${n} de ses amis.`;
    case 'visite': return `Chez ${n}` + (story ? ` : ${story[0].toLowerCase() + story.slice(1)}.` : '.');
    case 'refus': return `Pas de visite chez ${n} : ${REFUS[j.refus] || 'pas maintenant'}.`;
    case 'accueil': return `${n} est venu jouer` + (story ? ` : ${story[0].toLowerCase() + story.slice(1)}.` : '.');
    case 'refuse': return `${n} voulait venir : ${REFUS[j.refus] || 'pas maintenant'}.`;
    case 'coucou-recu': return `Coucou de ${n} !`;
    case 'coucou-envoye': return `Coucou à ${n}.`;
    case 'sticker-recu': return `${n} t’envoie ${stickerName(j.s)}.`;
    case 'sticker-envoye': return `${cap(stickerName(j.s))} pour ${n}.`;
    default: return '';
  }
}
const api = { MOTS, MOT, norm, parse, pourquoi, ecrit, texte, nouveau, proche, programme, ACTIVITES, PAUSE, command, said, REFUS, duo: {} };

const Sc = typeof Screens !== 'undefined' ? Screens : null;
if (!Sc || !Sc.addon || typeof document === 'undefined') return api;
const L = Sc.local, PER = Sc.persona, W = 800, H = 480;
const qs = new URLSearchParams(location.search), KIOSK = qs.has('kiosk'), LAB = !!window.PixelHub;
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), out = x => 1 - (1 - clamp(x, 0, 1)) ** 3, bump = x => Math.sin(Math.PI * clamp(x, 0, 1));
const realNow = () => (window.PixelClock ? window.PixelClock.real() : performance.now());
const pick = a => a[Math.floor(Math.random() * a.length)];
let P = null, A = null, K = null, send = () => {};

/* ---------- where the two Pixels stand: screens.js PBOX, this Pixel on the left, his friend on the right ---------- */
const PB = { x: 64, y: 50, w: 672, h: 378 };
const HOST = { x: -190, y: 22, s: 0.56 }, GUEST = { x: 190, y: 22, s: 0.56 }, M0 = { x: 0, y: 0, s: 1, r: 0, f: false, sx: 1, sy: 1 };
const compose = (m, b) => ({ x: b.x + (m.x || 0) * b.s, y: b.y + (m.y || 0) * b.s, s: (m.s ?? 1) * b.s, r: m.r || 0, f: !!m.f, sx: m.sx ?? 1, sy: m.sy ?? 1 });
const AWAY = ['ami-part', 'ami-absent'], BACK = ['ami-revient', 'ami-bredouille'], AWAY_END = 54000;   // web/scenes/amis.js: he walks back in at 56 s
const USER = ['tap', 'fache', 'calin', 'retour'];
const groupOf = id => { const s = PER && PER.scenes.find(x => x.id === id); return s ? s.group : ''; };
const durOf = id => { const s = PER && PER.scenes.find(x => x.id === id); return s ? s.dur : 0; };
const V = { evs: new Set(), vid: '', item: '', playedAt: 0, lines: null, poke: null, arrived: '', snapped: '', qSeen: '',
  awayVid: '', leftAt: -1e9, back: null, wasAway: false, lastAway: null, peek: null, leanOn: null, leanIn: null };

const vis = () => (A && A.visite) || null;
const hosting = () => { const v = vis(); return !!v && v.sens === 'accueil' && v.etat === 'chez'; };
const asking = () => { const v = vis(); return !!v && v.sens === 'accueil' && v.etat === 'question'; };
const away = () => { const v = vis(); return !!v && v.sens === 'sortie'; };
const casting = () => !!Sc.casting;
const exoOpen = () => !!(window.PixelExos && window.PixelExos.open);
const onFace = () => L.scr === 'visage' && L.boot < 0 && !casting();
const showing = () => hosting() && onFace() && !exoOpen();      // the visit is drawn (else it waits under what comes first)
const awayShown = () => (away() || (!!V.back && !V.back.done)) && onFace() && !exoOpen();
const montre = () => !!(A && A.montre && A.code && (P.server_now || Date.now()) < A.montre);
const srvNow = () => (K ? K.srv() : Date.now());
const myName = () => (P && P.caractere && P.caractere.nom) || 'Pixel';
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h; };
function setDuo(v, it) { api.duo = { ami: v ? v.nom : '', hote: myName(), seed: v ? hash(v.vid + '|' + (it ? it.at : 0)) : 0 }; }

/* ---------- his look (web/look.js, another feature): PixelLook.with(look, draw), defensively ---------- */
function withLook(look, fn) {
  const PL = window.PixelLook;
  if (!look || !PL || typeof PL.with !== 'function') return fn();
  let ran = false;
  try { const l = typeof PL.clean === 'function' ? PL.clean(look) : look; return PL.with(l, () => { ran = true; return fn(); }); }
  catch (e) { if (!ran) return fn(); return undefined; }
}

/* ---------- his personality: this Pixel on the left during a visit; away, his empty screen does not react ---------- */
if (PER) {
  const update0 = PER.update, tap0 = PER.tap, pet0 = PER.pet, input0 = PER.input;
  PER.update = (dt, ctx) => layout(update0(dt, ctx));
  PER.tap = (p, box, ctx) => {
    if (awayShown()) return true;                                     // nobody there: the card's button calls him back
    if (showing() && p) p = { x: 400 + (p.x - 400 - HOST.x) / HOST.s, y: 239 + (p.y - 239 - HOST.y) / HOST.s };   // where it lands on him
    return tap0(p, box, ctx);
  };
  PER.pet = () => {
    if (awayShown()) return true;
    if (showing() && L.ptr && L.ptr.x > 400) { poke('calin'); return true; }   // stroking his friend: the friend purrs
    return pet0();
  };
  PER.input = info => (awayShown() ? '' : input0(info));
}
function layout(v) {
  const b = showing() ? HOST : null;
  const restore = () => { if (V.leanOn && L.lean === V.leanOn) L.lean = V.leanIn; V.leanOn = null; };
  if (!b) { restore(); return v; }
  if (v && v.id) { restore(); return { ...v, m: compose(v.m || M0, b) }; }
  const inner = V.leanOn && L.lean === V.leanOn ? V.leanIn : L.lean;    // poche.js's tilt (it sets L.lean each frame, or not at all)
  V.leanIn = inner; V.leanOn = L.lean = compose(inner || M0, b);
  return v;
}

/* ---------- the snapshot ---------- */
function heard(p) {
  const first = !P; P = p; A = (p && p.amis) || null;
  guard();
  if (!A) { V.back = null; return; }
  const fresh = t => (p.server_now || Date.now()) - t < 10000;
  for (const e of A.evs || []) {
    const key = `${e.id}|${e.t0}`;                                      // its id and its time: a restarted server counts from 1 again
    if (V.evs.has(key)) continue;
    V.evs.add(key); if (V.evs.size > 60) V.evs.delete(V.evs.values().next().value);
    if (!first && fresh(e.t0)) news(e);                                  // old news stays old
  }
  const v = vis();
  if (v && v.sens === 'sortie' && v.vid !== V.awayVid) {                 // he sets off
    V.awayVid = v.vid; V.back = null; setDuo(v, null);
    if (PER) { L.local = null; L.pack = null; PER.play(!first && fresh(v.t0) ? 'ami-part' : 'ami-absent'); V.leftAt = realNow(); }
  }
  if (v && v.sens === 'accueil' && v.etat === 'question' && v.vid !== V.qSeen) { V.qSeen = v.vid; }
  if (v && v.sens === 'accueil' && v.etat === 'chez' && v.vid !== V.vid) {   // a friend comes in: awake, on his face screen
    V.vid = v.vid; V.item = ''; V.arrived = ''; V.lines = null; V.run = '';
    if (L.kiosk) { L.sleepy = false; L.lastInput = performance.now(); }
  }
  if (V.wasAway && !away() && !V.back) V.back = { data: { ami: (V.lastAway && V.lastAway.nom) || '' }, at: Math.max(realNow() + 1500, V.leftAt + 3700) };   // home with no word: still his return
  V.wasAway = away(); if (v && v.sens === 'sortie') V.lastAway = v;
  panelDraw();
}
function news(e) {
  const data = { ami: e.nom || '' };
  if (e.kind === 'retour') {                                             // once he is out of sight (ami-part walks off in 3.6 s)
    V.back = { data: { ...data, fait: e.fait || [], refus: e.refus || '', par: e.par || '' }, at: Math.max(realNow(), V.leftAt + 3700) };
    return;
  }
  if (away() || hosting() || asking()) return;                          // busy with a visit: the journal keeps it
  if (e.kind === 'coucou') { Sc.event('ami-coucou', data, true); peek(e, 'coucou'); }
  else if (e.kind === 'sticker' && ART && ART.BY[e.s]) { Sc.event('ami-sticker', { ...data, s: e.s, sn: e.sn || stickerName(e.s) }, true); peek(e, 'sticker'); }
  else if (e.kind === 'nouvel-ami') { Sc.event('ami-nouveau', data, true); peek(e, 'nouvel-ami'); }
  else if (e.kind === 'envoi') Sc.event('ami-envoi', e.s ? { ...data, s: e.s, sn: e.sn || stickerName(e.s) } : data, true);
  else if (e.kind === 'question') Sc.event('ami-question', data, true);
}
function peek(e, kind) { V.peek = { kind, nom: e.nom || '', look: e.look || null, s: e.s || '', t: realNow(), until: realNow() + (kind === 'nouvel-ami' ? 7600 : 6000) }; L.dirty = true; }

/* ---------- every frame: the visit's programme, his departure and his return ---------- */
function sequence() {
  const v = vis(); if (!PER || !hosting()) return;
  const e = srvNow() - v.t0; let it = null;
  for (const x of v.programme || []) if (e >= x.at) it = x;
  if (!it) return;
  const key = `${v.vid}|${it.id}|${it.at}`, cur = PER.state.cur;
  if (cur && USER.includes(groupOf(cur)) && cur !== it.id) return;       // a touch, a cuddle, a sulk: they come first, the visit goes on after
  if (key !== V.item) { V.item = key; setDuo(v, it); L.local = null; L.pack = null; PER.play(it.id); V.playedAt = realNow(); return; }
  if (cur !== it.id && realNow() - V.playedAt < durOf(it.id) - 400 && !(cur && DUO[cur])) { setDuo(v, it); PER.play(it.id); V.playedAt = realNow() - Math.max(0, e - it.at); }   // cut short: again
}
function awayStep() {
  if (!PER) return;
  const cur = PER.state.cur, e = PER.current().e || 0;
  if (away()) {
    if (AWAY.includes(cur)) { if (e > AWAY_END) PER.play('ami-absent'); }
    else PER.play('ami-absent');                                        // something played over his empty screen: he is still away
    return;
  }
  const b = V.back;
  if (b && !b.done && realNow() >= b.at) {
    b.done = true;
    if (Sc.event('ami-retour', b.data, true)) {
      if (!b.data.refus) setTimeout(() => album(), 6800);              // as he tells what they did
    } else if (AWAY.includes(cur)) PER.stop();
  }
}
function album() {                                                       // web/album.js (another feature): a photo for his album
  const PA = window.PixelAlbum;
  if (!PA || typeof PA.snap !== 'function' || !(L.kiosk || LAB)) return;
  try { PA.snap('ami-visite'); } catch (e) { /* another feature's business */ }
}

/* ---------- drawing ---------- */
function animAt(list, e) { let a = list && list[0] ? list[0][1] : 'idle-respire'; for (const [t, id] of list || []) if (e >= t) a = id; return a; }
const MOOD = { content: 'content', curieux: 'ecoute', salut: 'content', rire: 'content', surpris: 'surpris', etoiles: 'excite', danse: 'excite', bisou: 'amoureux',
  amoureux: 'amoureux', parle: 'content', ecoute: 'ecoute', fatigue: 'baille', baille: 'baille', sommeil: 'endormi', 'idle-somnole': 'endormi', reveil: 'surpris',
  'clin-oeil': 'clin', idee: 'excite', recherche: 'ecoute', confus: 'confus', timide: 'amoureux' };
function linesFor(id, tr, run) {                                         // his lines of this run of the scene, picked once
  if (V.lines && V.lines.run === run) return V.lines.list;
  const o = {};
  const list = (tr.say || []).map(([a, b, ls]) => [a, b, typeof ls === 'function' ? ls(o) : Array.isArray(ls) ? pick(ls) : '']);
  V.lines = { run, list }; return list;
}
function guestState(k) {                                                 // his motion, animation, mood and line, now
  const v = vis(), id = PER ? PER.state.cur : '', inScene = !!(id && DUO[id]), tr = inScene ? DUO[id] : DUO[''] || { anim: [[0, 'curieux']] };
  const e = inScene ? (PER.current().e || 0) : 0, run = inScene ? `${v.vid}|${id}|${Math.round(realNow() - e)}` : '';
  const t = srvNow() - v.t0, arrive = (v.programme || []).find(x => x.id === 'ami-arrive'), leave = (v.programme || []).find(x => x.id === 'ami-aurevoir');
  if ((id === 'ami-arrive' && e > 3800) || (inScene && id !== 'ami-arrive') || t > (arrive ? arrive.at : 0) + 9000) V.arrived = v.vid;   // in, or here already (a reload)
  if (V.arrived !== v.vid && id !== 'ami-arrive') return null;            // still outside
  if (leave && t > leave.at + 8800 && id !== 'ami-aurevoir') return null;  // gone home
  let raw = tr.move ? tr.move(e) : {}; raw = { ...M0, ...raw };
  let line = '';
  if (inScene) for (const [a, b, s] of linesFor(id, tr, run)) if (e >= a && e < b && s) line = s;
  if (V.poke && realNow() - V.poke.t < 1500) { const q = (realNow() - V.poke.t) / 1500; raw.y -= 22 * bump(q * 2); line = V.poke.line; }
  return { m: compose(raw, GUEST), anim: V.poke && realNow() - V.poke.t < 1500 ? V.poke.anim : animAt(tr.anim, e), mood: tr.mood, line, e, tr, inScene, id };
}
function poke(kind) { V.poke = { t: realNow(), anim: kind === 'calin' ? 'amoureux' : 'rire', line: kind === 'calin' ? pick(['Ronron…', 'Hé hé, merci !', 'Trop doux !']) : pick(['Hihi !', 'Ça chatouille !', 'Hé !', 'Coucou toi !']) }; L.dirty = true; }
function face(k, key, look, anim, mood, m) {
  withLook(look, () => k.face(key, anim, MOOD[anim] || mood || 'content', PB.x, PB.y, PB.w, PB.h, m));
}
function sprite(k, id, cx, cy, px, alpha = 1) {
  if (!ART || alpha <= 0) return;
  const X = k.X; X.save(); X.globalAlpha *= alpha; X.shadowBlur = 0;
  ART.draw(X, id, Math.round(cx - 6 * px), Math.round(cy - 6 * px), px, ART.theme(k.T.c)); X.restore();
}
function glyphs(k, text, x, y, size, color, alpha = 1) { const X = k.X; X.save(); X.globalAlpha *= alpha; k.txt(text, x, y, size, color, 'center', 'title'); X.restore(); }
function bubble(k, text, ax, ay) {                                       // his line, above his head
  const X = k.X, T = k.T, c = T.c, size = T.faceFps ? 28 : 24;
  X.save(); X.shadowBlur = 0; X.font = T.font(size);
  const w = Math.min(390, X.measureText(text).width + 30), h = size + 20;
  const x = clamp(ax - w / 2, 410, W - 8 - w), y = clamp(ay - h - 22, 52, H - h - 50), tx = clamp(ax, x + 18, x + w - 18);
  X.fillStyle = c.bg; X.strokeStyle = c.fg; X.lineWidth = 2; X.beginPath(); X.moveTo(tx - 10, y + h - 1); X.lineTo(clamp(ax, tx - 24, tx + 24), Math.min(ay - 4, y + h + 18)); X.lineTo(tx + 10, y + h - 1); X.fill(); X.stroke();
  T.box(x, y, w, h, c.fg, c.bg); X.fillStyle = c.bg; X.fillRect(tx - 8, y + h - 3, 16, 4);
  k.txt(k.fit(text, w - 22, size), x + w / 2, y + 10, size, c.fg, 'center');
  X.restore();
}
function tag(k, name, x, y, alpha = 1) {                                 // a name under a Pixel
  const T = k.T, c = T.c; if (alpha <= 0.02) return;
  const X = k.X; X.save(); X.globalAlpha *= alpha; X.shadowBlur = 0;
  const s = k.fit(T.upper ? name.toUpperCase() : name, 200, 22); X.font = T.font(22); const w = X.measureText(s).width + 20;
  T.box(Math.round(x - w / 2), Math.round(y), Math.round(w), 30, c.dim, c.bg); k.txt(s, x, y + 4, 22, c.fg, 'center'); X.restore();
}
/* the visitor's props and the shared ones (web/scenes/amis.js DUO: valise, notes, zzz, shared(k, e)) */
function propKit(k, g) {
  const T = k.T, c = T.c, U = Math.max(2, Math.round(PB.w / 96 * GUEST.s)), mid = { x: 400, y: 239 + GUEST.y };
  return {
    boum(q) { const n = 6, r = 10 + 80 * out(q); for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; sprite(k, 'etoile', mid.x + Math.cos(a) * r, mid.y - 40 + Math.sin(a) * r * 0.7, Math.max(2, U - 1), 1 - q); } sprite(k, 'etoile', mid.x, mid.y - 40, U + 1, q < 0.7 ? 1 : (1 - q) / 0.3); },
    gouter(e, q, bites) {                                               // between them, on a plate: his favourite food (web/scenes/nourrir.js), a cookie else
      const py = Math.round(384 + 12 * (1 - out(q))), PF = window.PixelFoods, fav = PF && PF.state && PF.state.gouts && PF.state.gouts.prefere, f = U + 2;
      sprite(k, 'assiette', mid.x, py - 4 * (U + 2), U + 2, q);         // the plate's rim is on its 10th row: its foot at py
      const X = k.X; X.save(); X.globalAlpha *= q;
      if (PF && PF.BY && PF.BY[fav]) PF.draw(X, fav, Math.round(mid.x - 6 * f), Math.round(py - 3 * (U + 2) - 12 * f), f, PF.theme(c), bites);
      else sprite(k, 'biscuit', mid.x, py - 3 * (U + 2) - 6 * f, f, 1);
      X.restore();
    },
    photo(e, q) { sprite(k, 'photo', mid.x, 104, U + 1, q); const n = 3 - Math.floor(Math.max(0, e - 2600) / 800); if (e > 2600 && e < 5000 && n > 0) glyphs(k, String(n), mid.x, 140, 44, c.accent || c.fg, q * (1 - ((e - 2600) % 800) / 1600)); },
    flash(q) { const X = k.X; X.save(); X.globalAlpha = 0.85 * q; X.fillStyle = c.hi || '#fff'; X.fillRect(0, 0, W, H); X.restore(); glyphs(k, 'CLIC !', mid.x, 92, 52, c.accent || c.fg, q); },
    nuit(e, q) { sprite(k, 'lune', mid.x, 92, U + 1, q); for (let i = 0; i < 5; i++) { const tw = 0.5 + 0.5 * Math.sin(e / 400 + i * 1.7); sprite(k, 'etoile', 120 + i * 140 + (i % 2) * 40, 74 + (i % 3) * 18, 2, q * tw); } },
    g,
  };
}
function drawGuest(k) {
  const v = vis(), g = guestState(k); if (!g) return;
  const X = k.X, c = k.T.c, m = g.m;
  const at = (u, w) => PER.project(PB, m, u, w);
  const pos = at(48, 27), U = PB.w / 96 * m.s;
  if (g.tr.valise) {                                                     // his suitcase: behind him as he walks, at his side once he stands
    const a = g.tr.valise(g.e), walking = Math.abs(m.x - GUEST.x) > 30;
    if (a > 0) { const p = walking ? at(m.f ? 2 : 94, 44) : at(m.f ? 12 : 84, 46); sprite(k, 'valise', p.x + (walking ? (m.f ? -1 : 1) * 2 * U : 0), p.y, Math.max(2, Math.round(U * 0.9)), a); }   // (mirrored: u counts from his other side)
  }
  face(k, 'ami-visiteur', v.look, g.anim, g.mood, m);
  const kit = propKit(k, g);
  if (g.inScene) {
    const n = g.tr.notes, z = g.tr.zzz;
    if (n && g.e > n[0] && g.e < n[1]) for (let i = 0; i < 3; i++) { const q = ((g.e / 1600) + i / 3) % 1; glyphs(k, i % 2 ? '♫' : '♪', pos.x + 60 + q * 50 + Math.sin(q * 8) * 10, pos.y - 70 - q * 70, 30, i === 1 ? c.accent || c.fg : c.fg, Math.min(1, (1 - q) * 2)); }
    if (z && g.e > z[0] && g.e < z[1]) for (let i = 0; i < 3; i++) { const q = ((g.e / 2200) + i / 3) % 1; glyphs(k, 'Z', pos.x + 70 + q * 40, pos.y - 60 - q * 60, 18 + q * 16, c.fg, Math.min(1, (1 - q) * 2)); }
    if (g.tr.shared) { X.save(); try { g.tr.shared(kit, g.e); } catch (e) { /* a prop must never stop him */ } X.restore(); }
  }
  if (g.id === 'ami-photo' && g.e > 4800 && V.snapped !== v.vid) { V.snapped = v.vid; album(); }    // the souvenir photo, both of them in it
  const near = mm => 1 - clamp((Math.abs(mm.x - (mm === m ? GUEST : HOST).x) + Math.abs(mm.y - (mm === m ? GUEST : HOST).y)) / 60, 0, 1);
  const foot = at(48, 50), hm = k.PV && k.PV.id ? k.PV.m : L.lean || compose(M0, HOST), hfoot = PER.project(PB, hm, 48, 50);
  tag(k, v.nom || 'Ami', foot.x, Math.min(foot.y + 6, 404), near(m));      // their names under them, while they stand in their places
  tag(k, myName(), hfoot.x, Math.min(hfoot.y + 6, 404), near(hm));
  if (g.line) { const top = at(48, 6); bubble(k, g.line, top.x, top.y); }
  k.hit(pos.x - 336 * m.s * 0.8, pos.y - 189 * m.s * 0.8, 672 * m.s * 0.8, 378 * m.s * 0.8, () => { if (L.petted) { L.petted = false; return; } poke('tap'); });
}
/* where he is: his friend's little house (o its lines, r its roof, w a window, d the door, k the knob), the two of them at the
   windows when he is in */
const HOUSE = ['..........oo..........', '.........orro...ooo...', '........orrrro..odo...', '.......orrrrrro.odo...', '......orrrrrrrrooo....', '.....orrrrrrrrrro.....',
  '....orrrrrrrrrrrro....', '...orrrrrrrrrrrrrro...', '..oooooooooooooooooo..', '...o..............o...', '...o.wwww....wwww.o...', '...o.wwww....wwww.o...', '...o.wwww....wwww.o...',
  '...o.......dd.....o...', '...o......dddd....o...', '...o......ddkd....o...', '...o......dddd....o...', '...oooooooooooooooo...'];
function house(k, cx, cy, u, e, inside, alpha) {
  const X = k.X, c = k.T.c, col = { o: c.fg, r: c.accent || c.fg, w: inside ? c.hi || c.fg : c.faint || c.dim || c.fg, d: c.dim || c.fg, k: c.hi || c.fg };
  const x0 = Math.round(cx - 11 * u), y0 = Math.round(cy - 9 * u);
  X.save(); X.globalAlpha *= alpha; X.shadowBlur = 0;
  HOUSE.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const ch = row[i]; if (col[ch]) { X.fillStyle = col[ch]; X.fillRect(x0 + i * u, y0 + j * u, u, u); } } });
  if (inside) {                                                          // two Pixels at the windows: a blink now and then
    const blink = (e % 3100) < 160;
    X.fillStyle = c.bg;
    for (const wx of [5, 13]) for (const ex of [1, 2.6]) X.fillRect(x0 + (wx + ex) * u - u / 2, y0 + 11 * u + (blink ? u / 2 : 0), u * 0.7, blink ? u / 3 : u);
  }
  X.restore();
}
function drawAway(k) {
  const v = vis(), X = k.X, T = k.T, c = T.c, now = realNow(), up = s => (T.upper ? s.toUpperCase() : s);
  const e = PER ? (PER.current().e || 0) : 0, cur = PER ? PER.state.cur : '';
  const q = AWAY.includes(cur) ? clamp((cur === 'ami-part' ? e - 3000 : e) / 600, 0, 1) * (1 - clamp((e - AWAY_END) / 600, 0, 1)) : 0;
  if (q <= 0) return;
  const nom = (v && v.nom) || (V.lastAway && V.lastAway.nom) || 'son ami', chez = v && v.etat === 'chez';
  house(k, 400, 160 + Math.round(Math.sin(now / 600) * 3), 8, now, chez, q);
  if (chez) for (let i = 0; i < 3; i++) { const p = ((now / 1500) + i / 3) % 1; glyphs(k, i % 2 ? '♫' : '♪', 452 + p * 30, 64 - p * 26, 24, c.accent || c.fg, q * Math.min(1, (1 - p) * 2)); }
  else if (v && v.etat === 'demande' && (now % 1300) < 650) glyphs(k, up('toc toc'), 400, 238, 26, c.dim || c.fg, q);
  X.save(); X.globalAlpha *= q;
  k.txt(k.fit(up(`Chez ${nom}`), 700, 40), 400, 268, 40, c.hi || c.fg, 'center', 'title');
  let line = 'Il frappe à la porte…';
  if (v && v.etat === 'attente') line = `On demande chez ${nom}…`;
  else if (chez) { const left = Math.max(0, Math.ceil(((v.fin || v.jusqua) - srvNow()) / 1000)); line = left > 0 ? `Il rentre dans ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Il rentre !'; }
  else if (!v) line = 'Il rentre !';
  k.txt(k.fit(line, 700, 28), 400, 318, 28, c.fg, 'center');
  X.restore();
  k.hit(0, 0, W, H, () => {});                                           // his empty screen: only the button calls him back
  if (v) {
    const bx = 290, by = 372, bw = 220, bh = 56;
    X.save(); X.globalAlpha *= q; k.box(bx, by, bw, bh, c.fg, null); k.txt(k.fit(up('Rappelle-le'), bw - 16, 28), 400, by + 13, 28, c.fg, 'center'); X.restore();
    k.hit(bx - 10, by - 8, bw + 20, bh + 16, () => send('amis.rappel'));
  }
}
function drawQuestion(k) {
  const v = vis(), X = k.X, T = k.T, c = T.c, up = s => (T.upper ? s.toUpperCase() : s), now = realNow();
  const left = Math.max(0, (v.jusqua - srvNow()) / 1000);
  X.save(); X.shadowBlur = 0; X.globalAlpha = 0.92; X.fillStyle = c.bg; X.fillRect(0, 300, W, 180); X.restore();
  k.box(16, 306, W - 32, 160, c.fg, null);
  X.save(); X.beginPath(); X.rect(24, 312, 220, 148); X.clip(); face(k, 'ami-toc', v.look, 'salut', 'content', { ...M0, x: -300, y: 145, s: 0.36 }); X.restore();
  k.txt(k.fit(up(`${v.nom} veut venir jouer !`), 500, 34), 260, 322, 34, c.hi || c.fg, 'left', 'title');
  k.bar(260, 368, 15, left / 45 * 15, 22, 8, 4, c.accent || c.fg, c.faint || c.dim);
  const btn = (x, label, fill, oui) => { k.box(x, 392, 220, 60, c.fg, fill ? c.fg : null); k.txt(k.fit(up(label), 200, 30), x + 110, 406, 30, fill ? (T.onFg || c.bg) : c.fg, 'center'); k.hit(x - 6, 386, 232, 72, () => send('amis.reponse', { vid: v.vid, oui })); };
  btn(296, 'Non merci', false, false); btn(536, 'Oui !', true, true);
  if (now % 2000 < 40) L.dirty = true;
}
function drawCode(k) {
  const X = k.X, T = k.T, c = T.c, up = s => (T.upper ? s.toUpperCase() : s), e = ecrit(A.code.code);
  X.save(); X.shadowBlur = 0; X.globalAlpha = 0.94; X.fillStyle = c.bg; X.fillRect(0, 0, W, H); X.restore();
  k.box(40, 56, 720, 380, c.fg, null);
  k.txt(up('Mon code d’ami'), 400, 76, 30, c.dim || c.fg, 'center', 'title');
  let size = 62; X.font = T.font(size, 'title'); const words = e.mots.join(' · ');
  while (size > 30 && X.measureText(words).width > 660) { size -= 4; X.font = T.font(size, 'title'); }
  k.txt(words, 400, 130, size, c.hi || c.fg, 'center', 'title');
  k.txt(e.nombre, 400, 140 + size, 84, c.accent || c.fg, 'center', 'title');
  const exp = new Date(A.code.expire), when = `${exp.getHours()} h ${String(exp.getMinutes()).padStart(2, '0')}`;
  k.txt(k.fit('Ton copain le tape sur son Pixel : vous devenez amis.', 680, 26), 400, 300, 26, c.fg, 'center');
  k.txt(k.fit(`Une seule fois, jusqu’à demain ${when}.`, 680, 24), 400, 334, 24, c.dim || c.fg, 'center');
  k.box(300, 368, 200, 52, c.fg, null); k.txt(up('Fermer'), 400, 380, 28, c.fg, 'center');
  k.hit(0, 0, W, H, () => {});
  k.hit(290, 360, 220, 68, () => send('amis.montre', { on: false }));
}
function drawPeek(k) {
  const p = V.peek, now = realNow(); if (!p) return;
  if (now > p.until) { V.peek = null; return; }
  const X = k.X, c = k.T.c, kq = RM ? 1 : out((now - p.t) / 450) * (1 - out((now - (p.until - 450)) / 450)), w = 192, h = 108;
  const x = W - w - 26, y = Math.round(H - h - 10 + (1 - kq) * (h + 60));
  X.save(); X.globalAlpha = 0.95; k.box(x - 8, y - 8, w + 16, h + 70, c.dim || c.fg, c.bg); X.restore();
  withLook(p.look, () => k.face('ami-coucou', p.kind === 'sticker' ? 'bisou' : 'salut', 'content', x, y, w, h));
  k.txt(k.fit(p.nom, w, 22), x + w / 2, y - 30, 22, c.fg, 'center');
  if (p.kind === 'sticker' && ART && ART.BY[p.s]) {                     // above his box (his line, below his face, stays clear)
    const s = 0.6 + 0.4 * out((now - p.t - 300) / 500), px = Math.round(8 * s);
    sprite(k, p.s, x + w / 2, y - 92 - 14 * bump((now - p.t) / 900), px, kq);
  }
  L.dirty = true;
}
/* the add-on: drawn over his face screen when there is something of his friends' (screens.js addon kit) */
const ad = {
  on: scr => scr === 'visage' && L.boot < 0 && !!A && A.on !== false && !casting() && !exoOpen() && (hosting() || awayShown() || asking() || montre() || !!V.peek),
  instead: () => false,
  busy: () => hosting() || away() || asking() || montre(),               // no moments of life meanwhile (nor his offer « Une petite question ? »)
  fps: calm => (hosting() || V.peek || awayShown() ? 30 : asking() || montre() ? Math.max(calm, 15) : 0),
  state: p => heard(p),
  draw(k) {
    if (hosting()) { if (L.kiosk) { L.lastInput = performance.now(); } drawGuest(k); }
    else if (awayShown()) drawAway(k);
    if (asking()) drawQuestion(k);
    if (montre()) drawCode(k);
    if (!hosting() && !away()) drawPeek(k);
  },
};
K = Sc.addon(ad);
send = (a, x) => K.send(a, x);                                           // the screens' own (app.js's socket, the lab's fake server)
setInterval(() => { try { sequence(); awayStep(); } catch (e) { console.warn('Pixel: amis', e); } }, 100);   // also when his face screen is not drawn
/* Nourrir's tray and plate (web/nourrir.js) wait while a friend is here or he is away: like web/exos.js's guard */
function guard() {
  const N = window.PixelNourrir;
  if (!N || N.amisGuard || typeof N.over !== 'function') return;
  const over = N.over, swipe = N.swipe, busy = () => hosting() || away() || asking() || montre() || !!(V.peek && realNow() < V.peek.until);
  N.over = kk => { if (!busy()) return over(kk); if (N.trayOpen && N.close) N.close(); return undefined; };
  if (typeof swipe === 'function') N.swipe = (dy, y0) => (busy() ? false : swipe(dy, y0));
  N.amisGuard = true;
}
addEventListener('load', guard);

/* ---------- the phone: « Ses amis » ---------- */
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const btn = (cls, text, fn) => { const b = el('button', cls, text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; };
const THEMES = (() => {
  try {
    const t = window.PixelThemes({ X: document.createElement('canvas').getContext('2d'), RM: true, get now() { return 0; }, blinkP: () => 9, txt() {}, wrap: () => [], fit: s => s });
    return Object.fromEntries(Object.values(t).filter(x => x && x.id && x.c).map(x => [x.id, x.c]));
  } catch { return {}; }
})();
const LIFE = window.PixelLife ? window.PixelLife() : null;
function miniFace(cv, card) {                                            // his face in his own theme (and his look), on a small canvas
  const dpr = Math.min(3, window.devicePixelRatio || 1), w = 72, h = 48;
  cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const g = cv.getContext('2d'), col = THEMES[card.theme] || THEMES.retro || { bg: '#061009', fg: '#46ff82', hi: '#d6ffe2', dim: '#1e7840' };
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = col.bg; g.fillRect(0, 0, w, h);
  try {
    const T = window.PixelThemes({ X: g, RM: true, get now() { return 1000; }, get S() { return dpr; }, get crt() { return false; }, get scr() { return 'visage'; }, blinkP: () => 9,
      txt() {}, wrap: () => [], fit: s => s })[card.theme] || null;
    const a = LIFE ? LIFE.update(1000, 'content', { calm: true }) : null;
    if (!T || !T.face) throw new Error('no face');
    withLook(card.look, () => T.face(w / 2, h / 2 + 2, 1.55, 'content', 0, 0, a));
  } catch {
    g.fillStyle = col.fg; g.fillRect(14, 8, 44, 32); g.fillStyle = col.bg; g.fillRect(17, 11, 38, 26);
    g.fillStyle = col.hi || col.fg; g.fillRect(26, 18, 5, 6); g.fillRect(41, 18, 5, 6); g.fillRect(29, 29, 14, 3);
  }
}
let pv = null, opener = null;
const hhmm = t => { const d = new Date(t); return `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`; };
function when(t) {
  if (!t) return '';
  const d = new Date(t), now = new Date(), days = Math.round((new Date(now.toDateString()) - new Date(d.toDateString())) / 864e5);
  return days === 0 ? `aujourd’hui à ${hhmm(t)}` : days === 1 ? `hier à ${hhmm(t)}` : `le ${d.getDate()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function sw(label, help, fn) {
  const b = btn('amis-sw'); b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', 'false');
  b.append(el('span', 'amis-sw-t', label), el('small', null, help), el('i', 'amis-knob')); b.addEventListener('click', () => fn(b.getAttribute('aria-checked') !== 'true'));
  return b;
}
function build(root, o = {}) {                                           // the panel's body (the phone's sheet, the lab's panel)
  const go = o.send || ((a, x) => send(a, x));
  root.classList.add('amis-body');
  const etat = el('p', 'amis-etat'); etat.setAttribute('role', 'status');
  const visite = el('section', 'amis-visite'); visite.setAttribute('aria-live', 'polite');
  const liste = el('section', 'amis-liste'), lh = el('h3', null, 'Ses amis'), cards = el('div', 'amis-cards'), arrivent = el('p', 'amis-arrivent');
  liste.append(lh, cards, arrivent);
  const code = el('section', 'amis-code'), codeIn = el('div');
  code.append(el('h3', null, 'Mon code d’ami'), codeIn);
  const ajout = el('section', 'amis-ajout'), form = el('form', 'amis-form'), input = el('input'), add = btn('amis-btn main', 'Ajouter'), hint = el('p', 'amis-hint'), res = el('p', 'amis-res');
  Object.assign(input, { type: 'text', autocomplete: 'off', spellcheck: false, placeholder: 'lapin soleil tarte 4271', enterKeyHint: 'done', maxLength: 120 });
  input.setAttribute('autocapitalize', 'off'); input.setAttribute('aria-label', 'Le code d’ami de ton copain');
  add.type = 'submit'; form.append(input, add); res.setAttribute('role', 'status');
  ajout.append(el('h3', null, 'Ajouter un ami'), el('p', 'amis-note', 'Tape le code que ton copain te donne : trois mots et un nombre.'), form, hint, res);
  input.addEventListener('input', () => { const v = input.value.trim(), p = v ? parse(v) : null; hint.textContent = !v || p.code ? '' : (p.why && (p.why.inconnus || []).length ? pourquoi(p.why) : ''); });
  form.addEventListener('submit', e => { e.preventDefault(); const v = input.value.trim(); if (!v) return; const p = parse(v); if (!p.code) { hint.textContent = pourquoi(p.why); return; } go('amis.ajoute', { code: v }); input.value = ''; hint.textContent = ''; });
  const reg = el('section', 'amis-reglages'), sVis = sw('Accepter les visites', 'Les Pixels de ses amis peuvent venir jouer ici.', v => go('amis.reglages', { visites: v })),
    sAsk = sw('Me demander avant', 'Quand un ami frappe, Pixel te demande sur son écran (ou ici).', v => go('amis.reglages', { demander: v })),
    sOn = sw('Amis', 'L’interrupteur des parents : éteint, plus rien ne sort ni n’arrive.', v => go('amis.reglages', { on: v })), relay = el('p', 'amis-note');
  reg.append(el('h3', null, 'Réglages'), sVis, sAsk, sOn, relay);
  const journal = el('section', 'amis-journal'), ol = el('ol'); journal.append(el('h3', null, 'Ce qui s’est passé'), ol);
  const off = el('p', 'amis-off');
  root.append(etat, off, visite, liste, code, ajout, reg, journal);
  let shown = '', confirmT = 0;
  const confirm = (b, label, fn) => b.addEventListener('click', () => {
    if (b.dataset.sure === '1') { b.dataset.sure = ''; b.textContent = label; fn(); return; }
    b.dataset.sure = '1'; b.textContent = 'Sûr ? Touche encore'; clearTimeout(confirmT); confirmT = setTimeout(() => { b.dataset.sure = ''; b.textContent = label; }, 4000);
  });
  function card(f, a) {
    const c = el('article', 'amis-card'), face = el('canvas', 'amis-face'), info = el('div', 'amis-info'), acts = el('div', 'amis-acts'), stick = el('div', 'amis-stickers');
    face.setAttribute('aria-hidden', 'true'); miniFace(face, f);
    const since = when(f.depuis).replace(/^(aujourd’hui|hier) à .*/, '$1');
    const bits = [f.depuis ? `ami depuis ${since}` : '', f.n ? `${f.n} visite${f.n > 1 ? 's' : ''}` : '', f.visite ? `dernière : ${when(f.visite)}` : ''].filter(Boolean);
    info.append(el('b', 'amis-nom', f.nom), el('small', null, bits.join(' · ')));
    const busy = !!a.visite, goB = btn('amis-btn main', 'Va le voir', () => go('amis.visite', { ami: f.id }));
    goB.disabled = busy || !a.on; goB.setAttribute('aria-label', `Va voir ${f.nom}`);
    const cou = btn('amis-btn', 'Coucou', () => go('amis.coucou', { ami: f.id })); cou.disabled = !a.on; cou.setAttribute('aria-label', `Coucou à ${f.nom}`);
    const st = btn('amis-btn', 'Autocollant', () => { stick.hidden = !stick.hidden; st.setAttribute('aria-expanded', String(!stick.hidden)); }); st.disabled = !a.on; st.setAttribute('aria-expanded', 'false');
    const rm = btn('amis-btn warn', 'Retirer'); confirm(rm, 'Retirer', () => go('amis.retire', { ami: f.id })); rm.setAttribute('aria-label', `Retirer ${f.nom} de ses amis`);
    acts.append(goB, cou, st, rm);
    stick.hidden = true;
    const col = ART ? ART.theme(THEMES[(P && P.view && P.view.theme) || 'retro'] || THEMES.retro || { fg: '#46ff82', bg: '#061009' }) : null;
    for (const s of ART ? ART.STICKERS : []) {
      const b = btn('amis-sticker'), cv = el('canvas'); cv.width = cv.height = 12; cv.setAttribute('aria-hidden', 'true');
      const sp = col && ART.sprite(s.id, col); if (sp) cv.getContext('2d').drawImage(sp, 0, 0);
      b.append(cv); b.title = cap(s.nom); b.setAttribute('aria-label', `Envoyer ${s.nom} à ${f.nom}`);
      b.addEventListener('click', () => { go('amis.sticker', { ami: f.id, s: s.id }); stick.hidden = true; st.setAttribute('aria-expanded', 'false'); });
      stick.append(b);
    }
    c.append(face, info, acts, stick); return c;
  }
  function qrCanvas(rows) {
    const n = rows.length, m = 4, cv = el('canvas', 'amis-qr'); cv.width = cv.height = (n + 8) * m;
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = '#000';
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '1') g.fillRect((i + 4) * m, (j + 4) * m, m, m); });
    cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', 'QR code du code d’ami'); return cv;
  }
  function render(a) {
    if (!a) { etat.textContent = o.solo || 'Les amis de Pixel passent par ton Pi.'; for (const s of [visite, liste, code, ajout, reg, journal]) s.hidden = true; off.hidden = true; return; }
    const key = JSON.stringify([a, (P && P.view && P.view.theme) || '', (P && P.caractere && P.caractere.nom) || '']);
    if (key === shown) return; shown = key;
    if (!a.dispo) { etat.textContent = a.pourquoi || 'Les amis de Pixel ne sont pas disponibles.'; for (const s of [visite, liste, code, ajout, reg, journal]) s.hidden = true; off.hidden = true; return; }
    for (const s of [liste, code, ajout, reg, journal]) s.hidden = false;
    etat.textContent = !a.on ? 'Les amis sont éteints.' : !a.amis.length && !a.code && !a.ajout ? 'Pas encore d’ami : rien ne sort de la maison.'
      : `Relais ${a.relais} · ${({ ok: 'connecté', connexion: 'connexion…', coupe: 'coupé, il réessaie tout seul', off: 'en pause' })[a.lien] || a.lien}`;
    off.hidden = !!a.on; off.textContent = 'Éteints par l’interrupteur « Amis » (plus bas) : personne ne vient, il ne sort pas, rien ne part.';
    // the visit of the moment
    const v = a.visite; visite.replaceChildren(); visite.hidden = !v;
    if (v) {
      const moi = myName();
      if (v.sens === 'accueil' && v.etat === 'question') {
        visite.append(el('p', 'amis-big', `${v.nom} veut venir jouer !`), el('p', 'amis-note', 'Pixel attend ta réponse, ici ou sur son écran.'));
        const row = el('div', 'amis-acts'); row.append(btn('amis-btn', 'Non merci', () => go('amis.reponse', { vid: v.vid, oui: false })), btn('amis-btn main', 'Oui !', () => go('amis.reponse', { vid: v.vid, oui: true })));
        visite.append(row);
      } else if (v.sens === 'accueil') {
        visite.append(el('p', 'amis-big', `${v.nom} est chez toi !`), el('p', 'amis-note', 'Ils jouent sur l’écran de Pixel.'));
        const row = el('div', 'amis-acts'); row.append(btn('amis-btn', 'Raccompagner', () => go('amis.raccompagne'))); visite.append(row);
      } else {
        visite.append(el('p', 'amis-big', `${moi} est parti chez ${v.nom}`), el('p', 'amis-note', v.etat === 'chez' ? 'Ils jouent ensemble. Il rentre tout seul.' : v.etat === 'attente' ? `On demande chez ${v.nom}…` : 'Il frappe à la porte…'));
        const row = el('div', 'amis-acts'); row.append(btn('amis-btn', 'Rappelle-le', () => go('amis.rappel'))); visite.append(row);
      }
    }
    lh.textContent = `Ses amis (${a.amis.length}/${a.max})`;
    cards.replaceChildren(...(a.amis.length ? a.amis.map(f => card(f, a)) : [el('p', 'amis-note', 'Pas encore d’ami. Donne ton code d’ami à un copain, ou tape le sien plus bas.')]));
    arrivent.textContent = (a.arrivent || []).length ? `En route : ${a.arrivent.join(', ')}…` : ''; arrivent.hidden = !(a.arrivent || []).length;
    // my code
    codeIn.replaceChildren();
    if (a.code) {
      const words = el('p', 'amis-mots'); words.append(...a.code.mots.map(w => el('span', null, w)), el('b', null, a.code.nombre));
      const box = el('div', 'amis-codebox'); box.append(words); if ((a.code.qr || []).length) box.append(qrCanvas(a.code.qr));
      const exp = new Date(a.code.expire);
      const row = el('div', 'amis-acts'); row.append(btn('amis-btn', 'Montrer sur l’écran de Pixel', () => go('amis.montre', { on: true })), btn('amis-btn', 'Annuler ce code', () => go('amis.code_annule')));
      codeIn.append(box, el('p', 'amis-note', `Ton copain le tape sur son Pixel : vous devenez amis. Une seule fois, jusqu’à demain ${hhmm(exp)}.`), row);
    } else {
      const b = btn('amis-btn main', 'Créer mon code', () => go('amis.code')); b.disabled = !a.on || a.amis.length >= a.max;
      codeIn.append(el('p', 'amis-note', a.amis.length >= a.max ? `${a.max} amis : c’est le maximum.` : 'Un code à donner à un copain : trois mots et un nombre. Il marche une fois, pendant 24 h.'), b);
      if (a.moi && a.moi.nom === 'Pixel') codeIn.append(el('p', 'amis-tip', 'Astuce : donne-lui un nom bien à lui (dans « Caractère ») pour que tes amis le reconnaissent.'));
    }
    // a friend's code
    const r = a.ajout; res.className = 'amis-res' + (r ? ' ' + r.etat : '');
    res.textContent = !r ? '' : r.etat === 'ok' ? `${r.nom} est ton ami ! Regarde l’écran de Pixel.` : r.etat === 'erreur' ? r.pourquoi : 'On cherche le Pixel de ton copain…';
    input.disabled = add.disabled = !a.on || (r && (r.etat === 'calcul' || r.etat === 'attente'));
    // settings
    sVis.setAttribute('aria-checked', String(!!a.visites)); sAsk.setAttribute('aria-checked', String(!!a.demander)); sOn.setAttribute('aria-checked', String(!!a.on));
    relay.textContent = `Relais : ${a.relais}. Tout ce qui y passe est chiffré : il ne voit ni les noms, ni les codes, ni ce qu’ils font.`;
    // the journal
    const items = (a.journal || []).map(j => { const li = el('li'); li.append(el('time', null, when(j.t)), el('span', null, said(j))); return li; }).filter(li => li.lastChild.textContent);
    ol.replaceChildren(...(items.length ? items : [el('li', 'amis-none', 'Rien encore.')]));
  }
  return { render };
}
let ui = null, sheet = null;
function mount() {
  const foot = document.querySelector('.kb .kfoot > span');
  if (KIOSK || LAB || !foot || sheet) return;
  opener = btn('follow amis-go', 'Amis', () => panel(true)); opener.title = 'Ses amis : les Pixels des copains';
  foot.append(opener);                                                   // with Caractère, Nourrir and Exos (after the Android app's link, often hidden)
  sheet = el('div', 'amis'); sheet.id = 'amis'; sheet.hidden = true; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-labelledby', 'amisTitle');
  const box = el('div', 'amis-sheet'), head = el('header', 'amis-head'), h2 = el('h2', null, 'Ses amis'), x = btn('amis-x', '×', () => panel(false)), body = el('div');
  h2.id = 'amisTitle'; x.setAttribute('aria-label', 'Fermer'); head.append(h2, x); box.append(head, body); sheet.append(box); document.body.append(sheet);
  ui = build(body, { solo: 'Les amis de Pixel passent par ton Pi : relie Pixel à ton Pi pour avoir des amis.' });
  sheet.addEventListener('click', e => { if (e.target === sheet) panel(false); });
  sheet.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') panel(false); });   // typing a code is not a command (app.js)
  if (typeof MutationObserver === 'function') new MutationObserver(() => { if (document.body.classList.contains('poche')) panel(false, false); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  panelDraw();
}
function panel(open, refocus = true) {
  if (!sheet) return;
  if (open && document.body.classList.contains('poche')) return;
  sheet.hidden = !open; document.body.classList.toggle('amis-on', !!open);
  if (open) { panelDraw(true); const x = sheet.querySelector('.amis-x'); if (x) x.focus({ preventScroll: true }); }
  else if (opener && refocus) opener.focus({ preventScroll: true });
}
function panelDraw() {
  if (!ui) return;
  if (opener) {
    const live = !!(A && A.visite); opener.classList.toggle('live', live); const t = live ? 'Amis •' : 'Amis'; if (opener.textContent !== t) opener.textContent = t;
    opener.hidden = !!(P && P.solo);                                     // Pixel sans Pi: his friends come with his Pi
  }
  if (sheet && sheet.hidden) return;
  ui.render(A);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else setTimeout(mount);

Object.assign(api, { panel, build, open: () => panel(true), close: () => panel(false), layout: { PB, HOST, GUEST } });
Object.defineProperties(api, {                                           // getters (Object.assign would copy their value once)
  isOpen: { get: () => !!sheet && !sheet.hidden },
  state: { get: () => ({ hosting: hosting(), away: away(), asking: asking(), showing: showing(), item: V.item, guest: showing() ? !!guestState() : false,
    peek: V.peek ? V.peek.kind : '', back: V.back ? { ...V.back.data, done: !!V.back.done } : null, montre: montre() }) },
});
return api;
})();
