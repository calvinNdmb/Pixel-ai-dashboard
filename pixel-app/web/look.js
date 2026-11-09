/* « Son look »: the shape and colour of his eyes, his cheeks, what he wears (a top hat, a cap, a bow tie, a moustache,
   headphones…), the outfits of the seasons that come by themselves, and his pyjama at night, on every screen.
   pixel/look.py keeps it: snapshot "look" { yeux, couleur_yeux, couleur_joues, mono, accessoires: {slot: item}, sans,
   saisons, nuit, porte: {slot: item, nuit, saison} (what he wears now), change: {t0, quoi, ...} | null, avant }. This file:
   - the same catalogue and rules as look.py (clean, resolve, apply, command, describe): Pixel Lab's fake server
     (lab/demo-hub.js) and Pixel sans Pi run them; tests/test_look.py compares the two;
   - cur(): what the face being drawn looks like now, compiled: { id, shape, eye, cheek, mono, wear: {slot: item}, plain }
     (plain: his eyes, colours and clothes of every day). themes.js draws it in each theme: its eye outlines (shapePts), its
     colours (eyeHex, cheekHex), what he wears with its own pen (paint) or in pixels (bitmaps); the pack's own engine draws
     it through two optional hooks it is handed (hookPix for pack52/pixel52.js frame(), hookVec for pixel52-themes.js draw());
   - with(look, fn): fn draws with another look (a visiting friend's Pixel, the panel's preview); clean(look): a valid copy;
     get(): the look of this screen (its "porte" included);
   - tracker(): what each face wore a moment ago, so that a new hat drops onto his head and an old one flies off;
   - screen(PER, before, snap, ctx): every snapshot (screens.js setState): his reaction to a change (persona event 'look'),
     his pyjama going on or off ('look-nuit', 'look-jour'), a season's outfit arriving ('look-saison'): web/scenes/look.js;
   - the phone's « Son look » panel: app({send, kiosk}) puts its button under the keys (PixelPanel('look') opens it), and
     build(root, {send}) makes it, here and in Pixel Lab (lab/look-lab.js).
   Loaded after screens.js and caractere.js (the lab: before lab/demo-hub.js). themes.js reads window.PixelLook lazily: without
   this file every face is drawn as before. */
window.PixelLook = (() => {
const PI = Math.PI, TAU = PI * 2, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, k) => a + (b - a) * k;
const out3 = x => 1 - (1 - clamp(x, 0, 1)) ** 3;
const has = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const copy = o => JSON.parse(JSON.stringify(o));
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isInt = v => typeof v === 'number' && Number.isInteger(v);
const num = v => typeof v === 'number' && isFinite(v);
const norm = s => String(s ?? '').toLowerCase().trim().normalize('NFD').replace(/\p{Mn}/gu, '').replace(/’/g, "'").replace(/œ/g, 'oe');   // look.py norm()

/* ---------- the catalogue: the same ids, names and order as pixel/look.py ---------- */
const SHAPES = [['rond', 'Ronds'], ['carre', 'Carrés'], ['amande', 'En amande'], ['etoile', 'Étoiles'], ['coeur', 'Cœurs'], ['chat', 'Yeux de chat'], ['lunettes', 'Lunettes']];
const SHAPE = Object.fromEntries(SHAPES);
const COLORS = [['theme', 'Comme le thème', null], ['bleu', 'Bleu', '#4f8cff'], ['turquoise', 'Turquoise', '#2ee6d6'], ['vert', 'Vert', '#49e06a'],
  ['jaune', 'Jaune', '#ffd84a'], ['orange', 'Orange', '#ff9a3c'], ['rouge', 'Rouge', '#ff5252'], ['rose', 'Rose', '#ff7fc8'], ['violet', 'Violet', '#b07cff'],
  ['marron', 'Marron', '#b97a45']];
const HEX = Object.fromEntries(COLORS.map(c => [c[0], c[2]]));
const EYE_COLORS = [...COLORS.map(c => c[0]), 'arc'], CHEEK_COLORS = COLORS.map(c => c[0]);
const SLOTS = [['tete', 'Sur la tête'], ['yeux', 'Sur les yeux'], ['visage', 'Sur le visage'], ['cou', 'Au cou'], ['oreilles', 'Sur les oreilles']];
const SLOT_IDS = SLOTS.map(s => s[0]);
const ITEMS = [['chapeau', 'Chapeau haut-de-forme', 'tete'], ['casquette', 'Casquette', 'tete'], ['couronne', 'Couronne', 'tete'], ['antenne', 'Antennes', 'tete'],
  ['bonnet', 'Bonnet', 'tete'], ['fete', 'Chapeau de fête', 'tete'], ['sorciere', 'Chapeau de sorcière', 'tete'], ['citrouille', 'Citrouille', 'tete'],
  ['pere-noel', 'Bonnet de Père Noël', 'tete'], ['bonnet-nuit', 'Bonnet de nuit', 'tete'], ['lunettes-soleil', 'Lunettes de soleil', 'yeux'],
  ['moustache', 'Moustache', 'visage'], ['noeud', 'Nœud papillon', 'cou'], ['echarpe', 'Écharpe', 'cou'], ['pyjama', 'Pyjama', 'cou'], ['casque', 'Casque audio', 'oreilles']];
const ITEM = Object.fromEntries(ITEMS.map(([id, name, slot]) => [id, { id, name, slot }]));
const TENUES = [['hiver', 'Pour l’hiver', { tete: 'bonnet', cou: 'echarpe' }], ['ete', 'Pour l’été', { tete: 'casquette', yeux: 'lunettes-soleil' }],
  ['halloween', 'Pour Halloween', { tete: 'sorciere' }], ['noel', 'Pour Noël', { tete: 'pere-noel', cou: 'echarpe' }], ['fete', 'Pour la fête', { tete: 'fete', cou: 'noeud' }],
  ['chic', 'Très chic', { tete: 'chapeau', cou: 'noeud', visage: 'moustache' }], ['roi', 'Le roi', { tete: 'couronne' }], ['musique', 'Musique !', { oreilles: 'casque' }],
  ['nuit', 'Pour dormir', { tete: 'bonnet-nuit', cou: 'pyjama', yeux: null, oreilles: null }]];
const TENUE = Object.fromEntries(TENUES.map(([id, name, set]) => [id, { id, name, set }]));
const SAISONS = { anniversaire: 'ton anniversaire', rencontre: 'le jour de votre rencontre', 'nouvel-an': 'le Nouvel An', noel: 'Noël', halloween: 'Halloween',
  hiver: 'l’hiver', ete: 'l’été' };
const DEFAULT = { yeux: 'rond', couleur_yeux: 'theme', couleur_joues: 'theme', mono: false, accessoires: Object.fromEntries(SLOT_IDS.map(s => [s, null])), sans: {}, saisons: true, nuit: true };
const SAVED = Object.keys(DEFAULT), HISTORY = 8, NIGHT = [23, 6], HOT = 25, DAY_SUN = [9, 20];

/* ---------- the rules (pixel/look.py) ---------- */
function clean(d) {
  d = d && typeof d === 'object' && !Array.isArray(d) ? d : {};
  const o = copy(DEFAULT);
  if (has(SHAPE, d.yeux)) o.yeux = d.yeux;
  if (EYE_COLORS.includes(d.couleur_yeux)) o.couleur_yeux = d.couleur_yeux;
  if (CHEEK_COLORS.includes(d.couleur_joues)) o.couleur_joues = d.couleur_joues;
  for (const k of ['mono', 'saisons', 'nuit']) if (typeof d[k] === 'boolean') o[k] = d[k];
  const ac = d.accessoires && typeof d.accessoires === 'object' ? d.accessoires : {}, sans = d.sans && typeof d.sans === 'object' ? d.sans : {};
  for (const s of SLOT_IDS) {
    if (has(ITEM, ac[s]) && ITEM[ac[s]].slot === s) o.accessoires[s] = ac[s];
    if (typeof sans[s] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sans[s])) o.sans[s] = sans[s];
  }
  return o;
}
const isDefault = l => ['yeux', 'couleur_yeux', 'couleur_joues'].every(k => l[k] === DEFAULT[k]) && SLOT_IDS.every(s => !l.accessoires[s]);
function isNight(d, dort, calme) {            // asleep: his habits say so (habitudes.dort), else his quiet hours (caractère calme)
  if (typeof dort === 'boolean') return dort;
  let [de, a] = NIGHT;
  if (calme && typeof calme === 'object') { if (isInt(calme.de)) de = calme.de; if (isInt(calme.a)) a = calme.a; }
  if (de === a) return false;
  const h = d.getHours();
  return de > a ? h >= de || h < a : h >= de && h < a;
}
function hotSun(m) {                          // a sunny day, warm enough for sunglasses
  if (!m || typeof m !== 'object') return false;
  const now = m.now && typeof m.now === 'object' ? m.now : {}, d0 = Array.isArray(m.days) && m.days[0] && typeof m.days[0] === 'object' ? m.days[0] : {};
  return now.kind === 'soleil' && ((num(now.t) && now.t >= HOT) || (num(d0.tmax) && d0.tmax >= HOT));
}
function season(d, meteo, fete) {             // [{slot: item}, its name or null]
  const m = d.getMonth() + 1, j = d.getDate(), h = d.getHours(), o = {}; let name = null;
  if (fete === 'anniversaire' || fete === 'rencontre') { o.tete = 'fete'; name = fete; }
  else if ((m === 12 && j === 31) || (m === 1 && j === 1)) { o.tete = 'fete'; name = 'nouvel-an'; }
  else if (m === 12 && j >= 20 && j <= 26) { o.tete = 'pere-noel'; name = 'noel'; }
  else if (m === 10 && j >= 24) { o.tete = j % 2 ? 'citrouille' : 'sorciere'; name = 'halloween'; }
  if (m === 12 || m === 1 || m === 2) { o.tete = o.tete || 'bonnet'; o.cou = 'echarpe'; name = name || 'hiver'; }
  if (h >= DAY_SUN[0] && h < DAY_SUN[1] && (m === 7 || m === 8 || hotSun(meteo))) { o.yeux = 'lunettes-soleil'; name = name || 'ete'; }
  return [o, name];
}
function resolve(look, ctx = {}) {            // what he wears now: your choices, then the season, then the night
  const d = ctx.date instanceof Date && !isNaN(ctx.date) ? ctx.date : new Date(), today = ymd(d), ac = look.accessoires || {}, wear = {};
  for (const s of SLOT_IDS) wear[s] = ac[s] || null;
  const bare = new Set(Object.entries(look.sans || {}).filter(([, v]) => v === today).map(([s]) => s));
  let saison = null;
  if (look.saisons !== false) {
    const [items, name] = season(d, ctx.meteo, ctx.fete);
    if (look.yeux === 'lunettes') delete items.yeux;               // not over his own glasses
    for (const s of ['tete', 'cou', 'yeux']) if (items[s] && !wear[s] && !bare.has(s)) { wear[s] = items[s]; saison = name; }
  }
  const nuit = look.nuit !== false && isNight(d, ctx.dort, ctx.calme);
  if (nuit) Object.assign(wear, { tete: 'bonnet-nuit', cou: 'pyjama', yeux: null, oreilles: null });
  return { ...wear, nuit, saison: nuit ? null : saison };
}
function context(S, d) {                      // resolve()'s ctx from a snapshot (the other features read defensively)
  const hab = S && S.habitudes, sou = S && S.souvenirs, car = S && S.caractere;
  return { date: d || new Date(), meteo: S && S.weather, fete: sou && typeof sou === 'object' ? sou.fete : null,
    dort: hab && typeof hab === 'object' && typeof hab.dort === 'boolean' ? hab.dort : null, calme: car && typeof car === 'object' ? car.calme : null };
}
const itemsOf = v => (Array.isArray(v) ? v : [v]).slice(0, 8).filter(x => has(ITEM, x));
function apply(look, a = {}, today = ymd(new Date())) {   // look.set: [new, change], change null when nothing moved
  const n = copy(look), quoi = [], ex = {};
  n.sans = Object.fromEntries(Object.entries(n.sans || {}).filter(([, v]) => v === today));   // yesterday's bare slots: the season may come back
  if (a.normal === true) { const b = copy(DEFAULT); for (const k of ['yeux', 'couleur_yeux', 'couleur_joues', 'accessoires', 'sans']) n[k] = b[k]; quoi.push('normal'); }
  const ac = n.accessoires, sans = n.sans;
  if (has(TENUE, a.tenue)) {
    for (const [s, it] of Object.entries(TENUE[a.tenue].set)) { ac[s] = it; if (it === null) sans[s] = today; else delete sans[s]; }
    quoi.push('tenue'); ex.tenue = a.tenue;
  }
  if (a.enleve !== undefined && a.enleve !== null) {
    const offs = (Array.isArray(a.enleve) ? a.enleve : [a.enleve]).slice(0, 8);
    if (offs.includes('tout')) {
      for (const s of SLOT_IDS) { ac[s] = null; sans[s] = today; }
      if (n.yeux === 'lunettes') n.yeux = 'rond';
      quoi.push('enleve'); ex.item = 'tout';
    } else for (const x of offs) {
      if (typeof x !== 'string') continue;
      if (x === 'lunettes' && n.yeux === 'lunettes') { n.yeux = 'rond'; quoi.push('enleve'); ex.item = 'lunettes'; continue; }   // his own glasses
      const s = has(ITEM, x) ? ITEM[x].slot : SLOT_IDS.includes(x) ? x : null;
      if (s) { ac[s] = null; sans[s] = today; quoi.push('enleve'); ex.item = has(ITEM, x) ? x : null; ex.slot = s; }
    }
  }
  for (const it of itemsOf(a.porte)) {
    const s = ITEM[it].slot; ac[s] = it; delete sans[s];
    if (it === 'lunettes-soleil' && n.yeux === 'lunettes') n.yeux = 'rond';    // sunglasses instead of his own glasses
    quoi.push('porte'); ex.item = it; ex.slot = s;
  }
  if (has(SHAPE, a.yeux)) {
    if (a.yeux === 'lunettes' && ac.yeux === 'lunettes-soleil') ac.yeux = null; // his own glasses instead of the sunglasses
    n.yeux = a.yeux; quoi.push('yeux'); ex.yeux = a.yeux;
  }
  for (const [k, allowed] of [['couleur_yeux', EYE_COLORS], ['couleur_joues', CHEEK_COLORS]]) {
    if (typeof a[k] === 'string' && allowed.includes(a[k])) { n[k] = a[k]; quoi.push('couleur'); ex.couleur = a[k]; ex.ou = k === 'couleur_yeux' ? 'yeux' : 'joues'; }
  }
  for (const k of ['mono', 'saisons', 'nuit']) if (typeof a[k] === 'boolean' && a[k] !== n[k]) { n[k] = a[k]; quoi.push('reglage'); ex.what = k; ex.value = a[k]; }
  const nn = clean(n), same = SAVED.every(k => JSON.stringify(nn[k]) === JSON.stringify(look[k]));
  if (!quoi.length || same) return [nn, null];
  const first = ['normal', 'tenue', 'porte', 'enleve', 'yeux', 'couleur', 'reglage'].find(q => quoi.includes(q));
  const keep = { normal: [], tenue: ['tenue'], porte: ['item', 'slot'], enleve: ['item', 'slot'], yeux: ['yeux'], couleur: ['couleur', 'ou'], reglage: ['what', 'value'] }[first];
  const ch = { quoi: first }; for (const k of keep) if (k in ex) ch[k] = ex[k];
  return [nn, ch];
}
/* words: for the lab's toast (« look ? ») and the panel */
const EYES_ADJ = { bleu: 'bleus', turquoise: 'turquoise', vert: 'verts', jaune: 'jaunes', orange: 'orange', rouge: 'rouges', rose: 'roses', violet: 'violets', marron: 'marron', arc: 'arc-en-ciel' };
const CHEEKS_ADJ = { bleu: 'bleues', turquoise: 'turquoise', vert: 'vertes', jaune: 'jaunes', orange: 'orange', rouge: 'rouges', rose: 'roses', violet: 'violettes', marron: 'marron' };
const SHAPE_OUT = { rond: 'ronds', carre: 'carrés', amande: 'en amande', etoile: 'en étoile', coeur: 'en cœur', chat: 'de chat', lunettes: 'ronds, avec des lunettes' };
function article(it) {
  const n = ITEM[it].name.toLowerCase();
  return (['antenne', 'lunettes-soleil'].includes(it) ? 'des ' : ['casquette', 'couronne', 'citrouille', 'moustache', 'echarpe'].includes(it) ? 'une ' : 'un ') + n;
}
function describe(look, porte, il = false) {   // look.py describe()
  look = clean(look);
  const [a, p, n] = il ? ['Il a', 'Il porte', 'Il ne porte'] : ['Tu as', 'Tu portes', 'Tu ne portes'];
  const sh = look.yeux, ce = look.couleur_yeux;
  const eyes = 'des yeux ' + SHAPE_OUT[sh] + (ce === 'theme' ? '' : (sh === 'lunettes' ? ', ' : ' ') + EYES_ADJ[ce]);
  const parts = [eyes, ...(look.couleur_joues !== 'theme' ? [`les joues ${CHEEKS_ADJ[look.couleur_joues]}`] : [])];
  porte = porte && typeof porte === 'object' ? porte : resolve(look, { date: new Date() });
  const worn = SLOT_IDS.map(s => porte[s]).filter(it => has(ITEM, it)), mine = worn.filter(it => look.accessoires[ITEM[it].slot] === it);
  let o = `${a} ${parts.join(' et ')}.`;
  if (worn.length) {
    const why = porte.nuit ? ' pour dormir' : porte.saison && mine.length < worn.length ? ` (${SAISONS[porte.saison] || 'la saison'})` : '';
    o += ` ${p} ${worn.map(article).join(', ')}${why}.`;
  } else o += ` ${n} rien de spécial.`;
  return o;
}
/* typed commands (look.py command()): { action, args } | { toast, ms } | null (anything else, or nothing to change: Claude) */
const ITEM_WORDS = { chapeau: 'chapeau', 'chapeau haut de forme': 'chapeau', 'haut de forme': 'chapeau', 'haut-de-forme': 'chapeau', 'chapeau haut-de-forme': 'chapeau',
  casquette: 'casquette', couronne: 'couronne', 'couronne de roi': 'couronne', antenne: 'antenne', antennes: 'antenne', bonnet: 'bonnet', "bonnet d'hiver": 'bonnet',
  'bonnet de laine': 'bonnet', 'chapeau de fete': 'fete', 'chapeau pointu': 'fete', "chapeau d'anniversaire": 'fete', 'chapeau de sorciere': 'sorciere',
  'chapeau de sorcier': 'sorciere', citrouille: 'citrouille', 'bonnet de pere noel': 'pere-noel', 'bonnet de noel': 'pere-noel', 'chapeau de pere noel': 'pere-noel',
  'chapeau de noel': 'pere-noel', 'bonnet du pere noel': 'pere-noel', 'bonnet de nuit': 'bonnet-nuit', 'lunettes de soleil': 'lunettes-soleil',
  'lunettes noires': 'lunettes-soleil', moustache: 'moustache', moustaches: 'moustache', 'fausse moustache': 'moustache', 'noeud papillon': 'noeud', 'noeud pap': 'noeud',
  noeud: 'noeud', papillon: 'noeud', echarpe: 'echarpe', pyjama: 'pyjama', casque: 'casque', 'casque audio': 'casque', 'casque de musique': 'casque' };
const SHAPE_WORDS = { ronds: 'rond', rond: 'rond', normaux: 'rond', carres: 'carre', carre: 'carre', 'en amande': 'amande', 'en amandes': 'amande', "d'amande": 'amande',
  'en etoile': 'etoile', 'en etoiles': 'etoile', etoiles: 'etoile', etoile: 'etoile', 'en coeur': 'coeur', 'en coeurs': 'coeur', coeur: 'coeur', 'de chat': 'chat', 'de chats': 'chat' };
const COLOR_WORDS = { bleu: 'bleu', bleus: 'bleu', bleue: 'bleu', bleues: 'bleu', turquoise: 'turquoise', turquoises: 'turquoise', vert: 'vert', verts: 'vert', verte: 'vert',
  vertes: 'vert', jaune: 'jaune', jaunes: 'jaune', orange: 'orange', oranges: 'orange', rouge: 'rouge', rouges: 'rouge', rose: 'rose', roses: 'rose', violet: 'violet',
  violets: 'violet', violette: 'violet', violettes: 'violet', marron: 'marron', marrons: 'marron', 'arc-en-ciel': 'arc', 'arc en ciel': 'arc', normaux: 'theme',
  normales: 'theme', "comme d'habitude": 'theme', 'comme avant': 'theme' };
const TENUE_WORDS = { "l'hiver": 'hiver', hiver: 'hiver', 'le froid': 'hiver', "l'ete": 'ete', ete: 'ete', 'la plage': 'ete', halloween: 'halloween', noel: 'noel',
  'la fete': 'fete', 'une fete': 'fete', 'ton anniversaire': 'fete', 'un anniversaire': 'fete', 'la nuit': 'nuit', dormir: 'nuit', 'aller dormir': 'nuit', 'aller au lit': 'nuit' };
const DET = "(?:ton |ta |tes |un |une |le |la |les |des |son |sa |ses |l')?";
const RX = {
  put: new RegExp("^(?:pixel[, ]+)?(?:mets|met|mettre|enfile|porte|remets)(?:[- ]toi)?\\s+" + DET + '(.+?)$'),
  off: new RegExp('^(?:pixel[, ]+)?(?:enleve|enlever|retire|retirer|ote|oter)\\s+' + DET + '(.+?)$'),
  all: /^(?:pixel[, ]+)?(?:enleve|retire|ote) (?:tout|tous tes accessoires|tes accessoires|tes habits|ton deguisement)$|^deshabille[- ]toi$/,
  eyes: /^(?:(?:mets|prends|fais)(?:[- ]toi)? )?(?:des |tes )?yeux (.+?)$/,
  cheeks: /^(?:(?:mets|prends|fais)(?:[- ]toi)? )?(?:des |tes )?joues (.+?)$/,
  dress: /^(?:habille[- ]toi|mets ta tenue|deguise[- ]toi) (?:pour |d'|de |en )?(.+?)$/,
};
const NORMAL = ['look normal', 'ton look normal', 'look de tous les jours', 'look par defaut', 'remets ton look normal', 'reprends ton look normal', 'look normal stp', 'redeviens normal'];
const AVANT = ['remets comme avant', 'remets-toi comme avant', 'remets ton look comme avant', 'comme avant', 'annule ton look', 'reviens comme avant'];
const ASK = ['look', 'ton look', 'look ?', 'ton look ?', "c'est quoi ton look", "c'est quoi ton look ?"];
function command(raw, L) {
  const t = norm(raw).replace(/[\s!.…]+$/, '').replace(/\s+(?:s'il te plait|s il te plait|stp|svp)$/, '').trim();
  const snap = L && typeof L === 'object' ? L : {}, look = clean(snap), porte = snap.porte && typeof snap.porte === 'object' ? snap.porte : {};
  let a = null, m;
  if (ASK.includes(t)) return { toast: describe(look, snap.porte, true) + ' Tape « mets ton chapeau », « yeux de chat », « joues roses », « look normal »…', ms: 12000 };
  if (NORMAL.includes(t)) a = { normal: true };
  else if (AVANT.includes(t)) return snap.avant ? { action: 'look.avant', args: {} } : null;
  else if (['arc-en-ciel', 'arc en ciel', 'yeux arc-en-ciel', 'des yeux arc-en-ciel'].includes(t)) a = { couleur_yeux: 'arc' };
  else if (RX.all.test(t)) a = { enleve: 'tout' };
  else if ((m = RX.dress.exec(t)) && has(TENUE_WORDS, m[1])) a = { tenue: TENUE_WORDS[m[1]] };
  else if ((m = RX.eyes.exec(t)) && (has(SHAPE_WORDS, m[1]) || has(COLOR_WORDS, m[1]))) {
    const w = m[1];
    a = w === 'normaux' ? { yeux: 'rond', couleur_yeux: 'theme' } : has(SHAPE_WORDS, w) ? { yeux: SHAPE_WORDS[w] } : { couleur_yeux: COLOR_WORDS[w] };
  }
  else if ((m = RX.cheeks.exec(t)) && has(COLOR_WORDS, m[1]) && COLOR_WORDS[m[1]] !== 'arc') a = { couleur_joues: COLOR_WORDS[m[1]] };
  else if ((m = RX.put.exec(t)) && (has(ITEM_WORDS, m[1]) || m[1] === 'lunettes')) a = m[1] === 'lunettes' ? { yeux: 'lunettes' } : { porte: ITEM_WORDS[m[1]] };
  else if ((m = RX.off.exec(t)) && (has(ITEM_WORDS, m[1]) || m[1] === 'lunettes')) {
    const w = m[1];
    if (w === 'lunettes') a = look.yeux === 'lunettes' ? { enleve: 'lunettes' } : { enleve: 'lunettes-soleil' };   // his own glasses, or his sunglasses
    else {
      const it = ITEM_WORDS[w], s = ITEM[it].slot;
      if (porte[s] === it || look.accessoires[s] === it) a = { enleve: it };
      else if ((w === 'chapeau' || w === 'bonnet') && porte.tete) a = { enleve: 'tete' };   // « enlève ton chapeau » while he wears another hat
    }
  }
  if (!a) return null;
  return apply(look, a)[1] ? { action: 'look.set', args: a } : null;
}

/* ---------- the look of this screen, compiled for the faces ---------- */
let SNAP = null, MAIN = null;
const STACK = [];
function compile(look, porte, id) {
  const l = clean(look), w = porte && typeof porte === 'object' ? porte : resolve(l, { date: new Date() }), wear = {};
  for (const s of SLOT_IDS) wear[s] = has(ITEM, w[s]) && ITEM[w[s]].slot === s ? w[s] : null;
  const plain = l.yeux === 'rond' && l.couleur_yeux === 'theme' && l.couleur_joues === 'theme' && SLOT_IDS.every(s => !wear[s]);
  return { id, shape: l.yeux, eye: l.couleur_yeux, cheek: l.couleur_joues, mono: l.mono, wear, nuit: !!w.nuit, plain,
    key: [l.yeux, l.couleur_yeux, l.couleur_joues, l.mono ? 1 : 0, ...SLOT_IDS.map(s => wear[s] || '')].join('|') };
}
/* his Christmas scenes (persona.js: the snow, « Joyeux Noël ») bring out the Santa hat, unless you chose what is on his head */
let PERref = null;
const XMAS = new Set(['neige', 'joyeux-noel']);
function cur() {
  if (STACK.length) return STACK[STACK.length - 1];
  if (MAIN && PERref && SNAP && SNAP.saisons !== false && !MAIN.nuit && !(SNAP.accessoires && SNAP.accessoires.tete) && XMAS.has(PERref.state.cur)) {
    if (!MAIN.xmas) { MAIN.xmas = { ...MAIN, wear: { ...MAIN.wear, tete: 'pere-noel' }, plain: false }; MAIN.xmas.key = MAIN.key + '|xmas'; }
    return MAIN.xmas;
  }
  return MAIN;
}
function withLook(look, fn) {                 // fn draws with that look (a visiting friend's Pixel): their own drop-ins
  const c = compile(look, look && look.porte, 'with');
  c.id = 'with:' + c.key;
  STACK.push(c);
  try { return fn(); } finally { STACK.pop(); }
}
function get() { return SNAP ? { ...clean(SNAP), porte: { ...(SNAP.porte || {}) } } : { ...clean({}), porte: resolve(clean({}), { date: new Date() }) }; }

/* what a face wore a moment ago (one tracker per drawing context, one memory per look): a new item drops in (k: 0 -> 1 in
   0.45 s, dy: how far above, in f), the one it replaces flies off (prev, its own k: 1 -> 0 in 0.32 s) */
function tracker() {
  const mem = {};
  return {
    phases(C, now) {
      let m = mem[C.id];
      if (!m) { m = mem[C.id] = {}; for (const s of SLOT_IDS) m[s] = { item: C.wear[s], t: -1e9, prev: null, pt: -1e9 }; }
      const ph = {}; let busy = false;
      for (const s of SLOT_IDS) {
        const x = m[s];
        if (x.item !== C.wear[s]) { x.prev = x.item; x.pt = now; x.item = C.wear[s]; x.t = now; }
        const k = clamp((now - x.t) / 450, 0, 1), kp = clamp((now - x.pt) / 320, 0, 1);
        const drop = s === 'tete' ? -(1 - out3(k)) * 12 + 1.6 * Math.sin(PI * clamp((k - 0.55) / 0.45, 0, 1)) * (k < 1 ? 1 : 0) : 0;
        ph[s] = { item: x.item, k: s === 'tete' ? 1 : out3(k), dy: drop, prev: kp < 1 ? x.prev : null, pk: 1 - kp, pdy: -kp * 7 };
        if (k < 1 || (kp < 1 && x.prev)) busy = true;
      }
      ph.busy = busy;
      return ph;
    },
  };
}

/* ---------- colours: the swatches, and how each theme shows them ---------- */
const h2r = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const r2h = rgb => '#' + rgb.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
function toHsl(hex) {
  const [r, g, b] = h2r(hex).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn), h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function fromHsl(h, s, l) {
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return r2h([f(0) * 255, f(8) * 255, f(4) * 255]);
}
const mix = (a, b, k) => r2h(h2r(a).map((v, i) => lerp(v, h2r(b)[i], clamp(k, 0, 1))));
const Y = hex => { const [r, g, b] = h2r(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
const R_PAL = { fg: '#46ff82', dim: '#1e7840', hi: '#d6ffe2', dark: '#0e3a22' }, L_PAL = ['#c5d08b', '#94a45c', '#526637', '#202c18'];
const memo = {};
const once = (k, f) => (k in memo ? memo[k] : (memo[k] = f()));
function phosphor(hex) {                      // Rétro: a colour phosphor, bright enough to glow on the dark glass
  return once('p' + hex, () => { const [h, s, l] = toHsl(hex); return s < 0.12 ? fromHsl(140, 0.28, clamp(0.5 + 0.38 * l, 0.46, 0.92)) : fromHsl(h, Math.min(1, s * 1.05 + 0.12), clamp(0.52 + 0.34 * l, 0.5, 0.86)); });
}
function pocket(hex) {                        // LCD: a colour pocket console's palette, dark enough to read on the green glass
  return once('l' + hex, () => { const [h, s, l] = toHsl(hex); return l > 0.9 ? L_PAL[0] : fromHsl(h, s * 0.8, clamp(0.14 + 0.4 * l, 0.12, 0.48)); });
}
const monoRetro = hex => { const y = Y(hex); return y > 0.8 ? R_PAL.hi : y > 0.5 ? R_PAL.fg : y > 0.22 ? R_PAL.dim : R_PAL.dark; };
const monoLcd = hex => { const y = Y(hex); return y > 0.86 ? L_PAL[0] : y > 0.6 ? L_PAL[1] : y > 0.32 ? L_PAL[2] : L_PAL[3]; };
const RAINBOW = Array.from({ length: 12 }, (_, i) => fromHsl(i * 30, 0.92, 0.6));
function forTheme(hex, kind, mono) {          // a swatch as this theme shows it (kind: retro, lcd, or a vector theme)
  if (!hex) return null;
  if (kind === 'retro') return mono ? monoRetro(hex) : phosphor(hex);
  if (kind === 'lcd') return mono ? monoLcd(hex) : pocket(hex);
  return hex;
}
/* his eyes' colour: null (the theme's own), a colour, or the rainbow: rainbow(x, t) for a point x (f) at time t (ms) */
function eyeHex(C, kind) { if (!C || C.eye === 'theme' || ((kind === 'retro' || kind === 'lcd') && C.mono)) return null; return C.eye === 'arc' ? 'arc' : forTheme(HEX[C.eye], kind, false); }
function cheekHex(C, kind) { if (!C || C.cheek === 'theme' || ((kind === 'retro' || kind === 'lcd') && C.mono)) return null; return forTheme(HEX[C.cheek], kind, false); }
const rainbowIndex = (x, t) => (((Math.floor(x / 1.6 + t / 420)) % 12) + 12) % 12;
function rainbow(x, t, kind) { return forTheme(RAINBOW[rainbowIndex(x, t)], kind, false); }
/* the colours of what he wears: named roles (K dark, W white, R red, Y gold, B blue, G green, O orange, V violet, P pink,
   S grey, N brown, C sky, M night blue; r, y, b, o, v: darker; F a frame, L a lens), as each theme shows them */
const ROLE = { K: '#2b2d42', W: '#f8f8ff', R: '#e63946', r: '#a61e2b', Y: '#ffc93c', y: '#c98a12', B: '#3a7bd5', b: '#22509a', G: '#43b649', O: '#ff8c1a',
  o: '#c85f0a', V: '#8e5bd8', v: '#5e3699', P: '#ff8fc6', S: '#a7b0c2', N: '#8b5a2b', C: '#8fd3ff', M: '#3b4cb8', F: '#2b2d42', L: '#1d2033' };
const ROLE_KIND = {
  moderne: { K: '#4a5478', F: '#e8eeff', L: '#0a0e1e', M: '#5468e0' },
  neon: { K: '#8a7dff', F: '#3ff6ff', L: '#12062e', W: '#fff0fb', M: '#7b8cff', N: '#d9925a', b: '#3d7bff', r: '#ff3b6e', v: '#a05cff' },
  manga: { F: '#1b1b1f' }, croquis: { F: '#2c2c30' },
};
function roleHex(role, kind, mono) {
  return once(`r${role}${kind}${mono ? 1 : 0}`, () => {
    if (kind === 'retro') return role === 'F' ? R_PAL.fg : role === 'W' ? R_PAL.hi : role === 'L' ? '#17532f' : role === 'K' ? (mono ? R_PAL.dark : '#3f8a5c') : mono ? monoRetro(ROLE[role]) : phosphor(ROLE[role]);
    if (kind === 'lcd') return role === 'F' || role === 'K' ? L_PAL[3] : role === 'W' ? L_PAL[0] : role === 'L' ? L_PAL[2] : mono ? monoLcd(ROLE[role]) : pocket(ROLE[role]);
    return (ROLE_KIND[kind] && ROLE_KIND[kind][role]) || ROLE[role] || '#888888';
  });
}

/* ---------- eye shapes: an outline for the vector faces, a mask for the pack's pixels, bitmaps for the living pixel faces ---------- */
const bz = (x0, y0, cx, cy, x1, y1, n = 8, from = 0) => { const p = []; for (let i = from; i <= n; i++) { const t = i / n, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t; p.push(a * x0 + b * cx + c * x1, a * y0 + b * cy + c * y1); } return p; };
const arcPts = (cx, cy, rx, ry, a0, a1, n = 16) => { const p = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; p.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry); } return p; };
const rot = (pts, cx, cy, a) => { const c = Math.cos(a), s = Math.sin(a), o = []; for (let i = 0; i < pts.length; i += 2) { const x = pts[i] - cx, y = pts[i + 1] - cy; o.push(cx + x * c - y * s, cy + x * s + y * c); } return o; };
const starPts = (cx, cy, r, inner = 0.5, n = 5, a0 = -PI / 2) => { const p = []; for (let i = 0; i < n * 2; i++) { const a = a0 + i * PI / n, d = i % 2 ? r * inner : r; p.push(cx + Math.cos(a) * d, cy + Math.sin(a) * d); } return p; };
const HEART = (() => {                       // the classic heart curve, normalised to a 1 x 1 box centred on 0, 0
  const p = []; for (let i = 0; i < 40; i++) { const t = i / 40 * TAU; p.push(16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))); }
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
  return p.map((v, i) => (i % 2 ? (v - (y0 + y1) / 2) / (y1 - y0) : (v - (x0 + x1) / 2) / (x1 - x0)));
})();
function lemon(x, y, w, h, side, tilt) {     // an almond: two arcs meeting in points, the outer corner a little up
  const pts = [...bz(x - w / 2, y, x, y - h, x + w / 2, y, 10), ...bz(x + w / 2, y, x, y + h, x - w / 2, y, 10, 1)];
  return tilt ? rot(pts, x, y, -side * tilt) : pts;
}
/* the open eye of a vector face, w x h centred on x, y (side -1 left, +1 right): a closed outline, or null for the round
   eyes of every day (the face draws its own) */
function shapePts(shape, x, y, w, h, side = 1) {
  if (shape === 'carre') {
    const r = Math.min(w, h) * 0.17, x0 = x - w / 2 + r, x1 = x + w / 2 - r, y0 = y - h / 2 + r, y1 = y + h / 2 - r, p = [];
    for (const [ax, ay, a] of [[x1, y0, -PI / 2], [x1, y1, 0], [x0, y1, PI / 2], [x0, y0, PI]]) for (let i = 0; i <= 4; i++) { const t = a + i / 4 * PI / 2; p.push(ax + Math.cos(t) * r, ay + Math.sin(t) * r); }
    return p;
  }
  if (shape === 'amande') return lemon(x, y, w * 1.22, h * 0.76, side, 0.16);
  if (shape === 'chat') return lemon(x, y, w * 1.1, h * 0.92, side, 0.2);
  if (shape === 'etoile') { const r = Math.max(w * 0.62, h * 0.56); return starPts(x, y + h * 0.05, r, 0.5); }
  if (shape === 'coeur') { const W = w * 1.25, H = h * 0.98; return HEART.map((v, i) => (i % 2 ? y + v * H : x + v * W)); }
  return null;
}
/* the pack's pixels: is (nx, ny) inside the shape (nx, ny in -1..1 across the eye's width and height)? */
function inPoly(pts, x, y) { let c = false; for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) { const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
const MASK_STAR = starPts(0, 0.06, 1.12, 0.5), MASK_HEART = HEART.map((v, i) => v * (i % 2 ? 2.05 : 2.35));
function inside(shape, nx, ny, side) {
  if (shape === 'carre') return Math.abs(nx) <= 1 && Math.abs(ny) <= 1.02 && !(Math.abs(nx) > 0.82 && Math.abs(ny) > 0.82);
  if (shape === 'amande' || shape === 'chat') {
    const a = -side * (shape === 'chat' ? 0.2 : 0.16), c = Math.cos(a), s = Math.sin(a), x = (nx * c + ny * s) / (shape === 'chat' ? 1.06 : 1.16), y = -nx * s + ny * c;
    if (shape === 'chat' && Math.abs(nx) < 0.17 && Math.abs(ny) < 0.8) return false;           // the slit
    return Math.abs(y) <= (shape === 'chat' ? 0.94 : 0.8) * (1 - x * x);
  }
  if (shape === 'etoile') return inPoly(MASK_STAR, nx, ny);
  if (shape === 'coeur') return inPoly(MASK_HEART, nx, ny);
  return nx * nx + ny * ny <= 1.05;
}
/* the living pixel faces (Rétro, LCD): his open eye per shape, and the lids of the moods cut into it */
const PSH = {
  carre: ['#####', '#w###', '#####', '#####', '#####', '#####'],
  amande: ['.......', '..###..', '.w####.', '#######', '.#####.', '..###..'],
  etoile: ['...#...', '..###..', '#######', '.##w##.', '..###..', '.##.##.', '#.....#'],
  coeur: ['.##.##.', '#w#####', '#######', '.#####.', '..###..', '...#...'],
  chat: ['.#.#.', '##.##', '##.##', '##.##', '##.##', '.#.#.'],          // split by its slit: a cat's eye, not a zero
};
const LIDS = { half: [2, 2, 2, 2, 2], sadL: [3, 2, 2, 1, 1], sadR: [1, 1, 2, 2, 3] };
LIDS.angL = LIDS.sadR; LIDS.angR = LIDS.sadL;
function pixEye(shape, variant) {             // rows, or null: the face's own bitmap (shapes do not change a closed eye)
  const base = PSH[shape]; if (!base) return null;
  return once(`pe${shape}${variant}`, () => {
    if (variant === 'o') return base;
    if (variant === 'big') return base.length >= 7 ? base : [...base.slice(0, 3), base[3], ...base.slice(3)];
    const lid = LIDS[variant]; if (!lid) return null;
    const w = base[0].length, off = base.length - 6;
    return base.map((row, j) => [...row].map((ch, i) => (j - off >= lid[clamp(Math.round(i * 4 / Math.max(1, w - 1)), 0, 4)] ? ch : '.')).join(''));
  });
}

/* ---------- what he wears: the drawings, in f (32 f between his eyes), around an anchor of his face ----------
   at: top (his forehead: the bottom of a hat), mouth (the top of his mouth), chin (under his mouth), eyes (each eye, head-fixed),
   face (his eye line: x0, the side of his head). A drawing is a list of [type, role, ...]: p polygon, e ellipse, r rounded
   rect, l line (width), c ring (width), g a glint. The same drawing makes the vector pens' shapes and the pixel art. */
const Pp = (role, pts, o) => ['p', role, pts, o], E = (role, cx, cy, rx, ry, o) => ['e', role, cx, cy, rx, ry, o], RR = (role, x, y, w, h, r, o) => ['r', role, x, y, w, h, r, o];
const LN = (role, w, pts, o) => ['l', role, w, pts, o], RG = (role, w, cx, cy, rx, ry, o) => ['c', role, w, cx, cy, rx, ry, o], GL = pts => ['g', 'W', 0.5, pts];
const mirror = pts => { const o = []; for (let i = pts.length - 2; i >= 0; i -= 2) o.push(-pts[i], pts[i + 1]); return o; };
const mx = pts => pts.map((v, i) => (i % 2 ? v : -v));
function geo(item, A) {                       // [{ at, under?, prims }]
  switch (item) {
    case 'chapeau': return [{ at: 'top', prims: [Pp('K', [-8.3, -2.2, 8.3, -2.2, 9.3, -12.6, -9.3, -12.6]), Pp('R', [-8.5, -3.6, 8.5, -3.6, 8.75, -6.4, -8.75, -6.4]),
      E('K', 0, -1.5, 13.6, 2.1), GL([-6.9, -11.3, -6.6, -7.4])] }];
    case 'casquette': return [{ at: 'top', prims: [Pp('B', arcPts(0, 0, 11.8, 9.4, PI, TAU, 18)), RR('b', -11.8, -2.4, 23.6, 2.6, 0.8), E('b', 9.6, -0.8, 9.6, 1.9),
      E('W', 0, -9.3, 1.5, 1), Pp('Y', starPts(-3.6, -5.2, 2.2, 0.48)), GL(arcPts(0, 0, 9.2, 7.4, PI * 1.16, PI * 1.42, 5))] }];
    case 'couronne': return [{ at: 'top', prims: [Pp('Y', [-10.6, 0, 10.6, 0, 10.6, -3.4, 12, -10.4, 6, -5.4, 0, -11.8, -6, -5.4, -12, -10.4, -10.6, -3.4]),
      RR('y', -10.6, -3.4, 21.2, 3.4, 0.4), E('R', 0, -1.7, 1.8, 1.35), E('B', -6.2, -1.7, 1.35, 1.15), E('B', 6.2, -1.7, 1.35, 1.15),
      E('W', -12, -10.6, 1.25, 1.25), E('W', 0, -12, 1.35, 1.35), E('W', 12, -10.6, 1.25, 1.25), GL([-8.6, -4.6, -9.6, -7.8])] }];
    case 'antenne': { const st = [-3.6, 0.2, -4.8, -3.6, -6.4, -7.2, -8.9, -9.9]; return [{ at: 'top', prims: [LN('S', 1.1, st), LN('S', 1.1, mx(st)), E('S', -3.6, 0.3, 2.3, 1.3), E('S', 3.6, 0.3, 2.3, 1.3),
      E('R', -9.6, -11, 2.5, 2.5), E('Y', 9.6, -11, 2.5, 2.5), E('W', -10.4, -11.9, 0.8, 0.8), E('W', 8.8, -11.9, 0.8, 0.8)] }]; }
    case 'bonnet': return [{ at: 'top', prims: [Pp('B', arcPts(0, -0.4, 12.7, 10.6, PI, TAU, 18)), RR('W', -13.3, -3.4, 26.6, 4, 1.5), E('W', 0, -11.6, 3.1, 3.1),
      GL(arcPts(0, -0.4, 9.6, 8, PI * 1.18, PI * 1.42, 5))] }];
    case 'fete': {
      const L = t => [lerp(-4.8, 3.6, t), lerp(0, -14.2, t)], Rr = t => [lerp(9.8, 3.6, t), lerp(0, -14.2, t)], band = (a, b, r) => Pp(r, [...L(a), ...Rr(a), ...Rr(b), ...L(b)]);
      return [{ at: 'top', prims: [Pp('P', [-4.8, 0, 9.8, 0, 3.6, -14.2]), band(0.1, 0.25, 'Y'), band(0.42, 0.55, 'B'), band(0.7, 0.8, 'Y'), E('O', 3.6, -14.8, 2.3, 2.3)] }];
    }
    case 'sorciere': return [{ at: 'top', prims: [Pp('V', [-8, -1.4, 8, -1.4, 4.8, -7.8, 5.4, -10.8, 11.4, -13.4, 3.6, -12.6, 0.4, -9.8]),
      Pp('v', [-7.6, -2.8, 7.6, -2.8, 6.8, -5.4, -6.8, -5.4]), RR('Y', -1.9, -5.6, 3.8, 3, 0.4), RR('v', -0.9, -4.8, 1.8, 1.4, 0.2), E('V', 0, -1.1, 15.2, 2.4),
      Pp('Y', starPts(-2.4, -8, 1.6, 0.48))] }];
    case 'citrouille': return [{ at: 'top', prims: [E('o', -5.2, -5.9, 6.6, 6.1), E('o', 5.2, -5.9, 6.6, 6.1), E('O', 0, -6, 6.4, 6.3), Pp('N', [-1.1, -11.7, 1.1, -11.7, 1.9, -14.7, 0.1, -14.9]),
      Pp('G', [1.4, -12.7, 6.2, -15.2, 4.6, -12.1]), GL(arcPts(-5.2, -5.9, 4.6, 4.2, PI * 1.08, PI * 1.38, 4))] }];
    case 'pere-noel': return [{ at: 'top', prims: [Pp('R', [-11.4, -2.6, ...bz(-11.4, -2.6, -9.8, -12.4, -0.6, -12.8, 6, 1), ...bz(-0.6, -12.8, 9, -13.4, 14.4, -6.4, 6, 1),
      12.6, -5.6, ...bz(12.6, -5.6, 9.4, -9.2, 6.4, -8, 4, 1), 11.4, -2.6]), RR('W', -12.8, -4.1, 25.6, 4.3, 2), E('W', 14.7, -5.6, 2.7, 2.7),
      GL(bz(-7.4, -6.4, -6.4, -9.8, -2.8, -11, 4))] }];
    case 'bonnet-nuit': return [{ at: 'top', prims: [Pp('M', [-11, -2.4, ...bz(-11, -2.4, -10.6, -11, -2, -11.6, 6, 1), ...bz(-2, -11.6, 8, -12.2, 11, -2.4, 6, 1)]),
      Pp('M', [-6, -10.8, ...bz(-6, -10.8, -14.8, -11.6, -17.4, -0.6, 6, 1), -15.3, 0, ...bz(-15.3, 0, -12.6, -8.2, -3, -8.4, 5, 1)]),
      Pp('Y', starPts(3.4, -7.2, 1.7, 0.45)), Pp('Y', starPts(-4.4, -5.6, 1.2, 0.45)), Pp('Y', starPts(-12.8, -6.4, 1.1, 0.45)),
      RR('W', -12, -3.7, 24, 3.9, 1.6), E('W', -16.5, 0.9, 2.5, 2.5)] }];
    case 'lunettes-soleil': {
      const w = A.ew + 1.9, top = -A.eh - 0.7, bot = A.eh * 0.82, lens = [-w, top, w, top, w * 0.95, bot * 0.3, w * 0.55, bot, -w * 0.55, bot, -w * 0.95, bot * 0.3];
      return [{ at: 'eyes', prims: [Pp('L', lens, { a: 0.6, under: true }), LN('F', 1.2, [-w - 0.3, top, w + 0.3, top]), GL([-w * 0.45, top + 1.5, -w * 0.12, bot * 0.55])] },
        { at: 'face', prims: [LN('F', 1.1, [-16 + w, top + 1, 0, top + 0.2, 16 - w, top + 1]), LN('F', 1.1, [-16 - w - 0.3, top + 0.2, -16 - w - 3, top - 1]),
          LN('F', 1.1, [16 + w + 0.3, top + 0.2, 16 + w + 3, top - 1])] }];
    }
    case 'moustache': { const h = [0, -1.2, 2.4, -3.1, 5.4, -3.2, 7.6, -2, 8.8, -3.1, 9.1, -1, 7, 0, 3.6, -0.3, 0.8, -0.2]; return [{ at: 'mouth', prims: [Pp('N', [...h, ...mirror(h)])] }]; }
    case 'noeud': { const wing = [-1.4, 3.4, -7.8, 0.2, -8.7, 4.3, -7.8, 8.4, -1.4, 5.2]; return [{ at: 'chin', prims: [Pp('R', wing), Pp('R', mirror(wing)), RR('r', -1.9, 2.4, 3.8, 3.8, 0.9),
      E('W', -5.2, 2.7, 0.8, 0.8), E('W', -5.8, 6, 0.7, 0.7), E('W', 5.2, 2.7, 0.8, 0.8), E('W', 5.8, 6, 0.7, 0.7)] }]; }
    case 'echarpe': return [{ at: 'chin', prims: [RR('R', -15.6, 0, 31.2, 4.4, 2), ...[-11, -5.5, 0, 5.5, 11].map(x => RR('W', x - 0.8, 0, 1.6, 4.4, 0)),
      RR('R', 6.4, 3.4, 4.8, 8.4, 1), RR('W', 6.4, 6, 4.8, 1.4, 0), RR('W', 6.4, 8.8, 4.8, 1.4, 0), LN('r', 0.6, [7.4, 11.8, 7.4, 13.2]), LN('r', 0.6, [8.8, 11.8, 8.8, 13.2]), LN('r', 0.6, [10.2, 11.8, 10.2, 13.2])] }];
    case 'pyjama': { const flap = [-10.4, 0, -0.3, 2.5, -2.4, 6.4]; return [{ at: 'chin', prims: [Pp('C', [-19, 1.8, 19, 1.8, 21.5, 9.2, -21.5, 9.2]),
      ...[-16.2, -11, 9.6, 14.8].map(x => RR('B', x, 1.8, 1.5, 7.4, 0)), LN('B', 0.6, [0, 3, 0, 9.2]), Pp('W', flap), Pp('W', mirror(flap)), E('W', 0, 5.2, 0.85, 0.85), E('W', 0, 7.8, 0.85, 0.85)] }]; }
    case 'casque': {
      const s = A.side, ry = Math.max(6, -A.topF + 2.4), band = arcPts(0, -1.5, s, ry, PI * 1.02, PI * 1.98, 22);
      return [{ at: 'face', prims: [LN('K', 2.1, band), LN('S', 0.6, arcPts(0, -1.5, s - 0.7, ry - 0.7, PI * 1.18, PI * 1.4, 6)), RR('R', -s - 2.7, -4.7, 5.4, 9.4, 2.3), RR('R', s - 2.7, -4.7, 5.4, 9.4, 2.3),
        RR('S', -s + 0.9, -3.8, 2, 7.6, 0.9), RR('S', s - 2.9, -3.8, 2, 7.6, 0.9), GL([-s - 1.6, -3.2, -s - 1.6, 0.4]), GL([s + 0.2, -3.2, s + 0.2, 0.4])] }];
    }
    case 'lunettes': {                        // his own glasses (the eye shape « Lunettes »), round, around his eyes (room for them to look around)
      const r = Math.max(A.ew, A.eh) + 2.1;
      return [{ at: 'eyes', prims: [RG('F', 1.2, 0, 0, r * 0.96, r), GL(arcPts(0, 0, r * 0.66, r * 0.7, PI * 1.1, PI * 1.38, 4))] },
        { at: 'face', prims: [LN('F', 1.1, bz(-16 + r * 0.95, -1.4, 0, -3.8, 16 - r * 0.95, -1.4, 8)), LN('F', 1.1, [-16 - r * 0.96, -1.6, -16 - r - 3, -3.2]), LN('F', 1.1, [16 + r * 0.96, -1.6, 16 + r + 3, -3.2])] }];
    }
  }
  return [];
}
const ORDER = { under: ['oreilles', 'cou', 'visage', 'tete'], over: ['yeux'] };   // the headphones' band under the hat; glasses over his eyes
/* the layer's items: under (before his eyes and mouth: hats, the moustache, the bow tie, the sunglasses' lenses in pixels)
   and over (after: glasses and sunglasses' frames) */
function layerItems(C, layer, ph) {
  const out = [];
  for (const s of ORDER[layer]) {
    const p = ph && ph[s];
    if (p && p.prev && has(ITEM, p.prev)) out.push({ item: p.prev, slot: s, k: p.pk, dy: p.pdy, leaving: true });
    const it = p ? p.item : C.wear[s];
    if (it) out.push({ item: it, slot: s, k: p ? p.k : 1, dy: p ? p.dy : 0 });
  }
  if (layer === 'over' && C.shape === 'lunettes' && C.wear.yeux !== 'lunettes-soleil') out.push({ item: 'lunettes', slot: 'yeux', k: 1, dy: 0 });
  return out;
}
const akey = A => [A.ew, A.eh, A.side, A.topF].map(v => Math.round(v * 4)).join(',');
const geoC = (item, A) => once(`g${item}|${akey(A)}`, () => geo(item, A));
/* the drawing as points on the canvas: o origin, k pixels per f, s the hat's scale */
function shapeOf(pr, ox, oy, k) {
  const [type] = pr, P = (x, y) => [ox + x * k, oy + y * k];
  if (type === 'p') { const o = []; for (let i = 0; i < pr[2].length; i += 2) o.push(...P(pr[2][i], pr[2][i + 1])); return o; }
  if (type === 'e') { const o = []; for (let i = 0; i < 26; i++) { const a = i / 26 * TAU; o.push(...P(pr[2] + Math.cos(a) * pr[4], pr[3] + Math.sin(a) * pr[5])); } return o; }
  if (type === 'r') {
    const [, , x, y, w, h, r0] = pr, r = Math.min(r0, w / 2, h / 2), o = [];
    if (r < 0.05) return [...P(x, y), ...P(x + w, y), ...P(x + w, y + h), ...P(x, y + h)];
    for (const [ax, ay, a] of [[x + w - r, y + r, -PI / 2], [x + w - r, y + h - r, 0], [x + r, y + h - r, PI / 2], [x + r, y + r, PI]]) for (let i = 0; i <= 3; i++) { const t = a + i / 3 * PI / 2; o.push(...P(ax + Math.cos(t) * r, ay + Math.sin(t) * r)); }
    return o;
  }
  if (type === 'c') { const o = []; for (let i = 0; i <= 26; i++) { const a = i / 26 * TAU; o.push(...P(pr[3] + Math.cos(a) * pr[5], pr[4] + Math.sin(a) * pr[6])); } return o; }
  const o = []; for (let i = 0; i < pr[3].length; i += 2) o.push(...P(pr[3][i], pr[3][i + 1])); return o;
}
/* anchors A: { k (px per f), x0, eye (y), eyeL, eyeR (x), top, mouth, chin (y), ew, eh, side, topF (f), hs (a hat's scale) } */
function origins(at, A) {
  if (at === 'eyes') return [[A.eyeL, A.eye, -1], [A.eyeR, A.eye, 1]];
  if (at === 'face') return [[A.x0, A.eye, 1]];
  return [[A.x0, A[at], 1]];
}
/* the vector faces: pen = { shape(pts, hex, pr, alpha), line(pts, hex, width px, pr, alpha), glint(pts, alpha) } */
function paint(C, layer, A, pen, kind, ph, t = 0) {
  for (const w of layerItems(C, layer, ph)) {
    if (w.k <= 0.01) continue;
    for (const g of geoC(w.item, A)) for (const [ox, oy] of origins(g.at, A)) {
      const k = A.k * (g.at === 'top' ? A.hs || 1 : 1), y0 = oy + w.dy * k;
      for (const pr of g.prims) {
        const role = pr[1], o = pr[pr.length - 1] || {}, alpha = w.k * (o && o.a ? o.a : 1);
        if (o && o.under && layer === 'under') continue;
        const pts = shapeOf(pr, ox, y0, k);
        if (pr[0] === 'g') pen.glint(pts, alpha);
        else if (pr[0] === 'l' || pr[0] === 'c') pen.line(pts, roleHex(role, kind, C.mono), pr[2] * k, pr, alpha);
        else pen.shape(pts, roleHex(role, kind, C.mono), pr, alpha);
      }
    }
  }
}
/* the pixel art: each drawing rasterised once at 1 pixel per f (its silhouette's edge marked, for an outline) */
function raster(prims) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const sh = prims.filter(p => p[0] !== 'g').map(p => ({ p, pts: shapeOf(p, 0, 0, 1), w: p[0] === 'l' || p[0] === 'c' ? Math.max(0.55, p[2] / 2) : 0 }));
  for (const s of sh) for (let i = 0; i < s.pts.length; i += 2) { x0 = Math.min(x0, s.pts[i] - s.w); x1 = Math.max(x1, s.pts[i] + s.w); y0 = Math.min(y0, s.pts[i + 1] - s.w); y1 = Math.max(y1, s.pts[i + 1] + s.w); }
  if (!sh.length) return { x: 0, y: 0, w: 0, h: 0, px: [] };
  const X0 = Math.floor(x0), Y0 = Math.floor(y0), w = Math.ceil(x1) - X0, h = Math.ceil(y1) - Y0, role = new Array(w * h).fill(null), line = new Array(w * h).fill(false), under = new Array(w * h).fill(false);
  const segD = (pts, x, y) => { let d = 1e9; for (let i = 0; i + 3 < pts.length; i += 2) { const ax = pts[i], ay = pts[i + 1], bx = pts[i + 2], by = pts[i + 3], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? clamp(((x - ax) * dx + (y - ay) * dy) / L, 0, 1) : 0; d = Math.min(d, Math.hypot(x - ax - t * dx, y - ay - t * dy)); } return d; };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = X0 + i + 0.5, y = Y0 + j + 0.5;
    for (const s of sh) {
      const p = s.p, hit = s.w ? segD(s.pts, x, y) <= s.w : p[0] === 'e' ? ((x - p[2]) / p[4]) ** 2 + ((y - p[3]) / p[5]) ** 2 <= 1 : inPoly(s.pts, x, y);
      if (hit) { role[j * w + i] = p[1]; line[j * w + i] = !!s.w; under[j * w + i] = !!(p[p.length - 1] && p[p.length - 1].under); }
    }
  }
  const px = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const r = role[j * w + i]; if (!r) continue;
    const empty = (a, b) => a < 0 || b < 0 || a >= w || b >= h || !role[b * w + a];
    px.push([i + X0, j + Y0, r, !line[j * w + i] && r !== 'L' && (empty(i - 1, j) || empty(i + 1, j) || empty(i, j - 1) || empty(i, j + 1)), under[j * w + i]]);
  }
  return { x: X0, y: Y0, w, h, px };
}
/* the layer's pixel art for a face: [{ item, bm, ox, oy (px), dy (f), k }]: bm.px = [x, y, role, edge, under] in f */
function bitmaps(C, layer, A, ph) {
  const out = [];
  for (const w of layerItems(C, layer, ph)) {
    if (w.k <= 0.01 || (w.leaving && w.k < 0.5)) continue;
    geoC(w.item, A).forEach((g, gi) => {
      const bm = once(`b${w.item}|${gi}|${akey(A)}`, () => raster(g.prims));
      for (const [ox, oy] of origins(g.at, A)) out.push({ item: w.item, key: `${w.item}${gi}${akey(A)}`, bm, ox, oy, dy: Math.round(w.dy), k: w.k, at: g.at });
    });
  }
  if (layer === 'under') for (const w of layerItems(C, 'over', ph)) {   // the lenses go under his eyes, in pixels
    geoC(w.item, A).forEach((g, gi) => {
      const bm = once(`b${w.item}|${gi}|${akey(A)}`, () => raster(g.prims));
      if (bm.px.some(p => p[4])) for (const [ox, oy] of origins(g.at, A)) out.push({ item: w.item, key: `${w.item}${gi}${akey(A)}u`, bm, ox, oy, dy: 0, k: w.k, at: g.at, lens: true });
    });
  }
  return out;
}
const pixRole = (p, kind, mono, edge = true) => (edge && p[3] && kind === 'lcd' ? L_PAL[3] : roleHex(p[2], kind, mono));

/* ---------- the pack's engine (pack52): the hooks it is handed ----------
   pixel52.js frame(id, t, look): look.eye(x, y, kind, rx, ry, lid, color, p, kit) draws an eye (true) or lets the pack do it,
   look.cheek(c) the colour of his cheeks, look.under(kit) / look.over(kit) what he wears, in the frame's own pixels (kit.dot
   follows his tilt and his bob). The frame's colours are palette indices: themes.js adds ours (IDX) to its palette (palette()). */
const ROLES = 'KWRrYyBbGOoVvPSNCMFL';
const IDX = { arc: 8, eye: 20, eyeHi: 21, cheek: 22, edge: 23, role: Object.fromEntries([...ROLES].map((r, i) => [r, 24 + i])) };
function palette(base, kind, C, t) {          // the theme's 8 colours, then ours, as [r, g, b] (themes.js pkPixels)
  const key = `${kind}|${C.key}|${base.map(c => (c ? c.join() : '')).join()}`;
  return once('pal' + key, () => {
    const p = base.slice(0, 8), e = eyeHex(C, kind), ch = cheekHex(C, kind);
    for (let i = 0; i < 12; i++) p[IDX.arc + i] = h2r(forTheme(RAINBOW[i], kind, false));
    p[IDX.eye] = e && e !== 'arc' ? h2r(e) : base[1]; p[IDX.eyeHi] = e && e !== 'arc' ? h2r(kind === 'lcd' ? e : mix(e, '#ffffff', 0.55)) : base[2];
    p[IDX.cheek] = ch ? h2r(ch) : base[3]; p[IDX.edge] = h2r(kind === 'lcd' ? L_PAL[3] : R_PAL.dark);
    for (const r of ROLES) p[IDX.role[r]] = h2r(roleHex(r, kind, C.mono));
    return p;
  });
}
function hookPix(C, ph, t, kind) {
  const e = eyeHex(C, kind), shape = C.shape === 'lunettes' ? 'rond' : C.shape;
  const ci = (x, color) => (color !== 1 || !e ? color : e === 'arc' ? IDX.arc + rainbowIndex(x, t) : IDX.eye);
  const stamp = (layer, k) => {
    const A = PACK_A.pix;
    for (const b of bitmaps(C, layer, A, ph)) {
      for (const p of b.bm.px) {
        if (b.lens ? !p[4] : p[4]) continue;                                 // a lens only under his eyes, from its own entry
        k.dot(b.ox + p[0], b.oy + p[1] + b.dy, p[3] && kind === 'lcd' && !b.lens ? IDX.edge : IDX.role[p[2]], true);
      }
    }
  };
  return {
    eye(x, y, kind2, rx, ry, lid, color, p, k) {
      if (kind2 === 'heart' || kind2 === 'star') return false;
      const colored = !!e && color === 1;
      if (kind2 === 'happy' || kind2 === 'closed') {
        if (!colored) return false;
        const c = ci(x, color);
        if (kind2 === 'happy') { k.line(x - 4, y + 1, x - 2, y - 2, c, 2); k.line(x - 2, y - 2, x + 2, y - 2, c, 2); k.line(x + 2, y - 2, x + 4, y + 1, c, 2); }
        else { k.line(x - 4, y, x - 2, y + 1, c); k.line(x - 2, y + 1, x + 2, y + 1, c); k.line(x + 2, y + 1, x + 4, y, c); }
        return true;
      }
      if (shape === 'rond' && !colored) return false;
      const h = Math.max(0.65, ry * lid), side = x < 48 ? -1 : 1, W = shape === 'amande' ? rx * 1.18 : shape === 'etoile' || shape === 'coeur' ? rx * 1.12 : rx;
      for (let yy = -Math.ceil(h); yy <= Math.ceil(h); yy++) for (let xx = -Math.ceil(W); xx <= Math.ceil(W); xx++) {
        const cut = kind2 === 'angry' ? (side < 0 ? xx * 0.5 : -xx * 0.5) : kind2 === 'sad' ? (side < 0 ? -xx * 0.35 : xx * 0.35) : kind2 === 'half' ? -1.5 : -1e9;
        if (yy >= cut && inside(shape, xx / W, yy / h, side)) k.dot(x + xx, y + yy, ci(x + xx, color));
      }
      if (kind2 === 'sad') k.line(x - 4, y - 5 + (side < 0 ? 1 : -1), x + 4, y - 5 + (side < 0 ? -1 : 1), ci(x, color));
      if (kind2 === 'open' && lid > 0.65) {                                    // his shine, where the shape has room
        const sx = Math.round(-W * 0.45), sy = Math.round(-h * 0.55);
        if (inside(shape, sx / W, sy / h, side) && inside(shape, (sx + 1) / W, sy / h, side)) k.rect(x + sx, y + sy, 2, 1, colored && e !== 'arc' ? IDX.eyeHi : 2);
      }
      return true;
    },
    cheek: c => (c === 3 && cheekHex(C, kind) ? IDX.cheek : c),
    under: k => stamp('under', k),
    over: k => stamp('over', k),
  };
}
/* where his face is in the pack's grid (96 x 54): the pixel styles, the Moderne and the Manga drawings (600 x 337.5) */
const PACK_A = {   // chin: the top of what he wears at his neck, under his widest mouth; side: his headphones, clear of his eyes
  pix: { k: 1, x0: 48, eye: 23, eyeL: 32, eyeR: 64, top: 15.4, mouth: 35.4, chin: 44.6, ew: 4.4, eh: 5.7, side: 26, topF: -7.6, hs: 1 },
  modern: { k: 5.125, x0: 300, eye: 147, eyeL: 218, eyeR: 382, top: 89, mouth: 219, chin: 258, ew: 8.6, eh: 10.1, side: 30, topF: -11.3, hs: 0.96 },
  manga: { k: 5.94, x0: 300, eye: 143, eyeL: 205, eyeR: 395, top: 86, mouth: 218, chin: 266, ew: 7.2, eh: 8.2, side: 29, topF: -9.6, hs: 0.92 },
};
/* pixel52-themes.js draw(canvas, id, t, { look }): look.eye(ctx, kind, lid, side, manga, o) draws an eye in its own place
   (true), look.cheek(ctx, x, s, manga) a cheek, look.under / look.over(ctx, s, manga) what he wears, in the face's frame.
   tint: a second canvas for Croquis (the pack's Manga drawing turned to graphite): the colours, laid over the pencil. */
function hookVec(C, ph, t, tint) {
  const both = (ctx, f) => { f(ctx); if (tint) { tint.setTransform(ctx.getTransform()); tint.globalAlpha = ctx.globalAlpha; f(tint); } };
  const fill = (g, pts) => { g.beginPath(); for (let i = 0; i < pts.length; i += 2) i ? g.lineTo(pts[i], pts[i + 1]) : g.moveTo(pts[i], pts[i + 1]); g.closePath(); };
  const eyeFill = (g, w, h, manga) => {       // a gradient of his eye colour (rainbow: across the eye, gently moving)
    const e = eyeHex(C, manga ? 'manga' : 'moderne');
    if (e === 'arc') { const gr = g.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2), o = (t / 4000) % 1; for (let i = 0; i <= 6; i++) gr.addColorStop(i / 6, fromHsl((i / 6 + o) * 360, 0.95, manga ? 0.62 : 0.66)); return gr; }
    const gr = g.createLinearGradient(0, -h / 2, 0, h / 2);
    if (manga) { gr.addColorStop(0, mix(e, '#000000', 0.62)); gr.addColorStop(0.4, mix(e, '#000000', 0.22)); gr.addColorStop(0.78, e); gr.addColorStop(1, mix(e, '#ffffff', 0.6)); }
    else { gr.addColorStop(0, mix(e, '#ffffff', 0.35)); gr.addColorStop(1, e); }
    return gr;
  };
  return {
    eye(ctx, kind, lid, side, manga, o) {
      if (kind === 'heart' || kind === 'star') return false;
      const e = eyeHex(C, manga ? 'manga' : 'moderne'), shape = C.shape === 'lunettes' ? null : C.shape === 'rond' ? null : C.shape;
      if (!shape && !e) return false;
      if (kind === 'closed' || kind === 'happy' || lid < 0.11) {
        if (manga || !e) return false;                                       // Manga: his closed eyes are ink
        const happy = kind === 'happy', y = happy ? 3 : 11;
        ctx.beginPath(); ctx.moveTo(-36, y); ctx.quadraticCurveTo(0, happy ? -39 : 26, 36, y); ctx.strokeStyle = e === 'arc' ? eyeFill(ctx, 72, 40, false) : e; ctx.lineWidth = 10; ctx.stroke();
        return true;
      }
      ctx.scale(1, Math.max(0.1, lid));
      const half = ['half', 'sad', 'angry'].includes(kind), slope = kind === 'angry' ? side * (manga ? 16 : 18) : kind === 'sad' ? -side * (manga ? 12 : 15) : 0;
      if (!manga) {
        const pts = shapePts(shape, 0, 0, 88, 104, side) || shapePts('carre', 0, 0, 88, 104).map(v => v);   // (rond: drawn by the shape below)
        const path = shape ? pts : null;
        (e ? both : (g, f) => f(g))(ctx, g => { if (path) fill(g, path); else { g.beginPath(); g.roundRect(-44, -52, 88, 104, [29, 29, 34, 34]); } g.fillStyle = e ? eyeFill(g, 88, 104, false) : (() => { const gr = g.createLinearGradient(0, -52, 0, 52); gr.addColorStop(0, '#87fff4'); gr.addColorStop(1, '#51eddf'); return gr; })(); g.fill(); });
        if (shape === 'chat') { ctx.fillStyle = '#04141a'; ctx.beginPath(); ctx.ellipse((o.gx || 0) * 0.3, 0, 9, 40, 0, 0, TAU); ctx.fill(); }
        if (half) {
          ctx.save(); if (path) fill(ctx, path); else { ctx.beginPath(); ctx.roundRect(-44, -52, 88, 104, [29, 29, 34, 34]); } ctx.clip();
          ctx.beginPath(); ctx.moveTo(-60, -70); ctx.lineTo(60, -70); ctx.lineTo(60, -11 + slope); ctx.quadraticCurveTo(0, -5, -60, -11 - slope); ctx.closePath(); ctx.fillStyle = '#000'; ctx.fill(); ctx.restore();
        }
        return true;
      }
      // Manga: the white of his eye in the shape, his iris (his colour) and its shines, the ink outline and lashes
      const ink = o.ink || '#34213e', pts = shape ? shapePts(shape, 0, -4, 90, 118, side) : null;
      const path = g => { if (pts) fill(g, pts); else { g.beginPath(); g.moveTo(-43, 0); g.bezierCurveTo(-39, -67, 32, -68, 43, -5); g.bezierCurveTo(48, 51, -36, 60, -43, 0); g.closePath(); } };
      path(ctx); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.save(); path(ctx); ctx.clip();
      const gx = (o.s ? o.s.gx : 0) * 0.55, gy = (o.s ? o.s.gy : 0) * 0.55;
      (e ? both : (g, f) => f(g))(ctx, g => { g.beginPath(); g.ellipse(gx, gy - 1, 34, 49, 0, 0, TAU); g.fillStyle = e ? eyeFill(g, 68, 98, true) : (() => { const gr = g.createLinearGradient(0, -49, 0, 47); gr.addColorStop(0, '#3f275e'); gr.addColorStop(0.38, '#8b5ac0'); gr.addColorStop(0.76, '#c38fe6'); gr.addColorStop(1, '#f0c8f1'); return gr; })(); g.fill(); });
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#4b2c66'; ctx.stroke();
      ctx.fillStyle = '#1e1426'; ctx.beginPath(); if (shape === 'chat') ctx.ellipse(gx, gy - 6, 6, 34, 0, 0, TAU); else ctx.ellipse(gx, gy - 8, 17, 32, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; for (const [x, y, rx, ry] of [[gx - 11, gy - 25, 10, 14], [gx + 13, gy + 19, 6, 8]]) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill(); }
      ctx.restore();
      path(ctx); ctx.strokeStyle = ink; ctx.lineWidth = 2.6; ctx.stroke();
      ctx.lineCap = 'round'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(side * 38, -18); ctx.lineTo(side * 50, -30); ctx.moveTo(side * 31, -35); ctx.lineTo(side * 40, -48); ctx.stroke();
      if (half) {
        ctx.save(); path(ctx); ctx.clip(); ctx.beginPath(); ctx.moveTo(-60, -80); ctx.lineTo(60, -80); ctx.lineTo(60, -3 + slope); ctx.lineTo(-60, -3 - slope); ctx.closePath(); ctx.fillStyle = '#fcf4fc'; ctx.fill(); ctx.restore();
        ctx.beginPath(); ctx.moveTo(-42, -3 - slope * 0.8); ctx.lineTo(42, -3 + slope * 0.8); ctx.lineWidth = 4.1; ctx.stroke();
      }
      return true;
    },
    cheek(ctx, x, s, manga) {
      const c = cheekHex(C, manga ? 'manga' : 'moderne'); if (!c) return false;
      both(ctx, g => {
        if (manga) { g.beginPath(); g.ellipse(x, 221, 23 + 3 * s.blush, 10 + 2 * s.blush, 0, 0, TAU); g.fillStyle = c + '80'; g.fill(); g.strokeStyle = c; g.lineWidth = 1.8; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(x - 10 + i * 9, 216); g.lineTo(x - 14 + i * 9, 227); g.stroke(); } }
        else { const bx = x < 300 ? 160 : 440; g.save(); g.globalAlpha = 0.62 * clamp(s.blush, 0, 1.3); g.beginPath(); g.roundRect(bx - 9, 218, 18 + 4 * Math.max(0, s.blush - 1), 5, 2.5); g.fillStyle = c; g.fill(); g.restore(); }
      });
      return true;
    },
    under(ctx, s, manga) { both(ctx, g => paint(C, 'under', PACK_A[manga ? 'manga' : 'modern'], vecPen(g, manga), manga ? 'manga' : 'moderne', ph, t)); },
    over(ctx, s, manga) { both(ctx, g => paint(C, 'over', PACK_A[manga ? 'manga' : 'modern'], vecPen(g, manga), manga ? 'manga' : 'moderne', ph, t)); },
  };
}
/* the pens of the pack's drawings: Moderne flat, with a soft shine; Manga with an ink outline */
function vecPen(g, manga) {
  const path = pts => { g.beginPath(); for (let i = 0; i < pts.length; i += 2) i ? g.lineTo(pts[i], pts[i + 1]) : g.moveTo(pts[i], pts[i + 1]); };
  return {
    shape(pts, hex, pr, a) { const ga = g.globalAlpha; g.globalAlpha = ga * a; path(pts); g.closePath(); g.fillStyle = hex; g.fill(); if (manga) { g.strokeStyle = '#34213e'; g.lineWidth = 2.4; g.lineJoin = 'round'; g.stroke(); } g.globalAlpha = ga; },
    line(pts, hex, w, pr, a) { const ga = g.globalAlpha; g.globalAlpha = ga * a; path(pts); if (pr[0] === 'c') g.closePath(); g.strokeStyle = hex; g.lineWidth = w; g.lineCap = g.lineJoin = 'round'; g.stroke(); g.globalAlpha = ga; },
    glint(pts, a) { const ga = g.globalAlpha; g.globalAlpha = ga * a * 0.7; path(pts); g.strokeStyle = '#ffffff'; g.lineWidth = 2.6; g.lineCap = 'round'; g.stroke(); g.globalAlpha = ga; },
  };
}

/* ---------- every snapshot: his look, and his reactions (web/scenes/look.js) ---------- */
const seen = { change: undefined, nuit: false, wear: {}, at: 0 };
let panelUI = null, panelSnap = null;
function screen(PER, before, p, ctx = {}) {
  const L = p && p.look;
  if (!L || typeof L !== 'object') { SNAP = null; MAIN = null; return; }
  SNAP = L; MAIN = compile(L, L.porte, 'main'); panelSnap = L; if (PER) PERref = PER;
  if (panelUI && panelUI.shown()) panelUI.render(L);
  if (!PER || !PER.event) return;
  const ch = L.change, nuit = !!(L.porte && L.porte.nuit), fresh = t => !!t && (p.server_now || Date.now()) - t < 10000, wear = { ...MAIN.wear };
  if (!before || seen.change === undefined) { Object.assign(seen, { change: ch ? ch.t0 : 0, nuit, wear }); return; }   // old news stays old
  const ev = (name, data) => {
    const busy = /^look-/.test(PER.state.cur || '') && Date.now() - seen.at < 2600;    // a quick row of taps: let him finish
    if (busy && name === 'look') return;
    seen.at = Date.now();
    PER.event(name, data, { visage: ctx.visage !== false, force: true });
  };
  let changed = false;
  if (ch && ch.t0 !== seen.change) { seen.change = ch.t0; changed = true; if (fresh(ch.t0)) ev('look', { ...ch, nuit }); }
  if (nuit !== seen.nuit) { seen.nuit = nuit; if (!changed) ev(nuit ? 'look-nuit' : 'look-jour', {}); }
  else if (!changed && !nuit && L.porte && L.porte.saison) {
    const fresh2 = SLOT_IDS.find(s => wear[s] && wear[s] !== seen.wear[s] && (L.accessoires || {})[s] !== wear[s]);
    if (fresh2) ev('look-saison', { item: wear[fresh2], saison: L.porte.saison });
  }
  seen.wear = wear;
}

/* ---------- the panel « Son look » (the phone's sheet, Pixel Lab's panel) ---------- */
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const btn = (cls, text) => { const b = el('button', cls, text); b.type = 'button'; return b; };
const THEMES = (() => {                        // every theme's drawing, for the preview and the icons (a canvas of its own)
  try { return window.PixelThemes ? Object.values(window.PixelThemes({ X: document.createElement('canvas').getContext('2d'), RM: true, get now() { return 0; }, blinkP: () => 9, txt() {}, wrap: () => [], fit: s => s })).filter(t => t && t.id) : []; } catch { return []; }
})();
const themeC = id => ((THEMES.find(t => t.id === id) || THEMES[0] || {}).c) || { bg: '#061009', fg: '#46ff82', dim: '#1e7840', hi: '#d6ffe2', pink: '#ff7aa8', accent: '#ffb347' };
function preview(cv) {                         // his face in the current theme, alive, in a canvas of the panel
  const g = cv.getContext('2d'); let T = null, theme = '', face = 'pack', raf = 0, t0 = performance.now(), want = null, life = null, wantUntil = 0;
  const H = { X: g, RM: false, get now() { return performance.now(); }, get S() { return S; }, blinkP: () => ((performance.now() - t0) % 3400) / 180, txt() {}, wrap: () => [], fit: s => s };
  let S = 2, THM = null;
  const st = { id: 'idle-respire', time: 0, from: null, k: 1 };
  let last = performance.now();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(100, now - last); last = now;
    if (!THM) { try { THM = window.PixelThemes(H); } catch { return; } }
    T = THM[theme] || THM.retro; if (!T) return;
    const w = cv.clientWidth || 320, h = cv.clientHeight || 180, s = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * s)) { cv.width = Math.round(w * s); cv.height = Math.round(h * s); }
    S = s; g.setTransform(s * w / 800, 0, 0, s * h / 480, 0, 0); g.globalAlpha = 1; g.shadowBlur = 0;
    try { T.bg(dt); } catch { g.fillStyle = T.c.bg; g.fillRect(0, 0, 800, 480); }
    const go = performance.now() < wantUntil ? want : null;
    if (st.id !== (go || 'content')) { st.from = { id: st.id, time: st.time }; st.id = go || 'content'; st.time = 0; st.k = 0; }
    st.time += dt / 1000; st.k = Math.min(1, st.k + dt / 260);
    if (face === 'pack' && T.packFace && window.Pixel52) T.packFace(64, 50, 672, 378, st);
    else { if (!life) life = window.PixelLife ? window.PixelLife() : null; const a = life ? life.update(now, go === 'surpris' ? 'surpris' : 'neutre', { calm: true }) : null; T.face(400, 236, 16, a ? a.mood : 'neutre', a ? a.lx : 0, a ? a.ly : 0, a); }
    if (T.fg) { try { T.fg(dt); } catch { /* the CRT's grain: never stop the preview */ } }
  }
  return {
    set(th, fc) { theme = th || 'retro'; face = fc === 'vivant' ? 'vivant' : 'pack'; },
    react(id) { want = id; wantUntil = performance.now() + 2600; },
    start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } },
    stop() { cancelAnimationFrame(raf); raf = 0; },
  };
}
function swatchStyle(b, hex) { if (hex === 'arc') b.style.background = 'conic-gradient(#ff5252,#ffd84a,#49e06a,#2ee6d6,#4f8cff,#b07cff,#ff7fc8,#ff5252)'; else if (hex) b.style.background = hex; }
function icon(item, c) {                       // an accessory in pixels, in the theme's colours (its icon in the panel)
  const cv = el('canvas', 'look-ic'); cv.setAttribute('aria-hidden', 'true');
  const A = PACK_A.pix, bms = item.startsWith('eye:') ? null : geo(item, A).map(g => raster(g.prims));
  const draw = (kind, mono) => {
    const g = cv.getContext('2d');
    if (item.startsWith('eye:')) {
      const sh = item.slice(4), rows = pixEye(sh, 'o') || ['.###.', '#w###', '#####', '#####', '#####', '.###.'];
      cv.width = 9; cv.height = 9; g.clearRect(0, 0, 9, 9);
      rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '.') return; g.fillStyle = ch === 'w' ? c.hi || '#fff' : c.fg; g.fillRect(i + Math.floor((9 - r.length) / 2), j + Math.floor((9 - rows.length) / 2), 1, 1); }));
      if (sh === 'lunettes') { g.fillStyle = c.dim || c.fg; for (const [x, y] of [[0, 2], [0, 6], [8, 2], [8, 6], [1, 1], [7, 1], [1, 7], [7, 7]]) g.fillRect(x, y, 1, 1); }
      return;
    }
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const origin = (b, gi) => { const at = geo(item, A)[gi].at; return at === 'eyes' ? [[-16, 0], [16, 0]] : [[0, 0]]; };
    bms.forEach((b, gi) => origin(b, gi).forEach(([ox, oy]) => b.px.forEach(p => { x0 = Math.min(x0, p[0] + ox); x1 = Math.max(x1, p[0] + ox); y0 = Math.min(y0, p[1] + oy); y1 = Math.max(y1, p[1] + oy); })));
    const w = x1 - x0 + 1, h = y1 - y0 + 1; cv.width = Math.max(1, w); cv.height = Math.max(1, h); g.clearRect(0, 0, w, h);
    bms.forEach((b, gi) => origin(b, gi).forEach(([ox, oy]) => b.px.forEach(p => { g.fillStyle = p[3] && kind === 'lcd' ? L_PAL[3] : roleHex(p[2], kind, mono); g.fillRect(p[0] + ox - x0, p[1] + oy - y0, 1, 1); })));
  };
  cv.repaint = draw;
  return cv;
}
const KIND_OF = id => (id === 'retro' || id === 'lcd' ? id : ['moderne', 'manga', 'neon', 'croquis'].includes(id) ? id : 'moderne');
function build(root, o = {}) {
  const send = o.send || (() => {});
  let L = clean({}), snap = {}, theme = 'retro', resetAt = 0, resetT = 0;
  root.classList.add('look-body');
  const pv = el('div', 'look-pv'), cvs = el('canvas', 'look-cv'), say = el('p', 'look-say'); say.setAttribute('aria-live', 'polite');
  cvs.setAttribute('role', 'img'); cvs.setAttribute('aria-label', 'Pixel avec son look');
  pv.append(cvs); const P = o.preview === false ? null : preview(cvs);
  const h3 = t => el('h3', 'look-h', t);
  const grid = (cls, label) => { const d = el('div', 'look-grid ' + (cls || '')); d.setAttribute('role', 'group'); d.setAttribute('aria-label', label); return d; };
  // Yeux
  const eyes = grid('look-eyes', 'La forme de ses yeux'), eyeB = {};
  for (const [id, name] of SHAPES) { const b = btn('look-opt'); b.dataset.yeux = id; b.setAttribute('aria-pressed', 'false'); b.append(icon('eye:' + id, themeC(theme)), el('span', null, name)); b.addEventListener('click', () => { send('look.set', { yeux: id }); if (P) P.react('surpris'); }); eyes.append(b); eyeB[id] = b; }
  // Couleurs
  const sw = (ou, list) => {
    const d = grid('look-sw', ou === 'yeux' ? 'La couleur de ses yeux' : 'La couleur de ses joues'), bs = {};
    for (const id of list) {
      const name = id === 'arc' ? 'Arc-en-ciel' : COLORS.find(c => c[0] === id)[1], b = btn('look-dot'); b.dataset.c = id; b.title = name; b.setAttribute('aria-label', name); b.setAttribute('aria-pressed', 'false');
      if (id !== 'theme') swatchStyle(b, id === 'arc' ? 'arc' : HEX[id]); else b.classList.add('look-dot-theme');
      const lab = el('span', 'look-dot-n', id === 'theme' ? 'Thème' : name); b.append(lab);
      b.addEventListener('click', () => { send('look.set', { [ou === 'yeux' ? 'couleur_yeux' : 'couleur_joues']: id }); if (P) P.react('surpris'); }); d.append(b); bs[id] = b;
    }
    return [d, bs];
  };
  const [eyeC, eyeCB] = sw('yeux', EYE_COLORS), [cheekC, cheekCB] = sw('joues', CHEEK_COLORS);
  const sw2 = (label, help, key) => { const b = btn('look-sw2'); b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', 'false'); b.dataset.k = key; b.append(el('span', 'look-sw2-t', label), el('small', null, help), el('i', 'look-knob')); b.addEventListener('click', () => send('look.set', { [key]: b.getAttribute('aria-checked') !== 'true' })); return b; };
  const monoB = sw2('Écran tout vert', 'En Rétro et en LCD : ses couleurs et ses habits deviennent les verts de l’écran.', 'mono');
  // Accessoires
  const acc = el('div', 'look-acc'), itemB = {}, noneB = {};
  for (const [slot, sname] of SLOTS) {
    const box = el('div', 'look-slot'), d = grid('look-items', sname);
    box.append(el('h4', null, sname));
    const none = btn('look-opt look-none'); none.dataset.slot = slot; none.setAttribute('aria-pressed', 'false'); none.append(el('span', 'look-none-x', '∅'), el('span', null, 'Rien'));
    none.addEventListener('click', () => send('look.set', { enleve: slot })); d.append(none); noneB[slot] = none;
    for (const [id, name, s] of ITEMS) {
      if (s !== slot) continue;
      const b = btn('look-opt'); b.dataset.item = id; b.setAttribute('aria-pressed', 'false'); b.append(icon(id, themeC(theme)), el('span', null, name));
      b.addEventListener('click', () => { const on = b.getAttribute('aria-pressed') === 'true'; send('look.set', on ? { enleve: id } : { porte: id }); if (P && !on) P.react('surpris'); }); d.append(b); itemB[id] = b;
    }
    box.append(d); acc.append(box);
  }
  const tenues = grid('look-tenues', 'Des tenues toutes prêtes'), tenueB = {};
  for (const [id, name] of TENUES) { const b = btn('look-chip', name); b.dataset.tenue = id; b.addEventListener('click', () => { send('look.set', { tenue: id }); if (P) P.react('surpris'); }); tenues.append(b); tenueB[id] = b; }
  // Saisons
  const seasons = el('div', 'look-seasons'), saisonsB = sw2('Tenues de saison', 'Un bonnet en hiver, des lunettes de soleil en été, Halloween, Noël, le Nouvel An, son anniversaire. Ce que tu choisis passe avant.', 'saisons');
  const nuitB = sw2('Pyjama la nuit', 'Quand il dort, il met son bonnet de nuit et son pyjama.', 'nuit'), now = el('p', 'look-now');
  seasons.append(saisonsB, nuitB, now);
  // actions
  const acts = el('div', 'look-actions'), undoB = btn('look-undo', 'Remettre comme avant'), resetB = btn('look-reset', 'Look de tous les jours');
  undoB.addEventListener('click', () => send('look.avant'));
  resetB.addEventListener('click', () => {
    if (Date.now() - resetAt < 4000) { resetAt = 0; clearTimeout(resetT); resetB.textContent = 'Look de tous les jours'; send('look.set', { normal: true }); return; }
    resetAt = Date.now(); resetB.textContent = 'Sûr ? Touche encore'; clearTimeout(resetT); resetT = setTimeout(() => { resetAt = 0; resetB.textContent = 'Look de tous les jours'; }, 4000);
  });
  acts.append(undoB, resetB);
  root.append(pv, say, h3('Yeux'), eyes, h3('Couleurs'), el('p', 'look-sub', 'Ses yeux'), eyeC, el('p', 'look-sub', 'Ses joues'), cheekC, monoB, h3('Accessoires'), acc, el('p', 'look-sub', 'Des tenues toutes prêtes'), tenues, h3('Saisons'), seasons, acts);
  let painted = '';
  function render(snapLook, th, face) {
    if (snapLook) { snap = snapLook; L = clean(snapLook); }
    if (th) theme = th;
    if (P) P.set(theme, face);
    const porte = snap.porte || resolve(L, {});
    for (const id in eyeB) eyeB[id].setAttribute('aria-pressed', String(L.yeux === id));
    for (const id in eyeCB) eyeCB[id].setAttribute('aria-pressed', String(L.couleur_yeux === id));
    for (const id in cheekCB) cheekCB[id].setAttribute('aria-pressed', String(L.couleur_joues === id));
    for (const id in itemB) { const s = ITEM[id].slot, on = porte[s] === id; itemB[id].setAttribute('aria-pressed', String(on)); itemB[id].classList.toggle('auto', on && L.accessoires[s] !== id); }
    for (const s in noneB) noneB[s].setAttribute('aria-pressed', String(!porte[s]));
    monoB.setAttribute('aria-checked', String(!!L.mono)); saisonsB.setAttribute('aria-checked', String(L.saisons)); nuitB.setAttribute('aria-checked', String(L.nuit));
    monoB.hidden = !(theme === 'retro' || theme === 'lcd');
    const worn = SLOT_IDS.map(s => porte[s]).filter(Boolean);
    now.textContent = porte.nuit ? 'En ce moment : il dort, en pyjama.' : porte.saison ? `En ce moment : ${SAISONS[porte.saison] || 'la saison'}. ${worn.filter(it => L.accessoires[ITEM[it].slot] !== it).map(it => ITEM[it].name).join(', ') || ''}`.trim() : 'En ce moment : pas de tenue de saison.';
    undoB.disabled = !snap.avant;
    say.textContent = describe(L, porte, true);
    const key = theme + (L.mono ? 1 : 0);
    if (key !== painted) { painted = key; const c = themeC(theme), kind = KIND_OF(theme); root.querySelectorAll('canvas.look-ic').forEach(cv => cv.repaint && cv.repaint(kind, !!L.mono && (kind === 'retro' || kind === 'lcd'))); root.style.setProperty('--look-ic-bg', c.bg); }
  }
  render(null);
  return { render, start: () => P && P.start(), stop: () => P && P.stop(), get look() { return L; } };
}
/* the phone: the « Son look » button under the keys, and its sheet */
let sheet = null, opener = null, lastP = null;
function open() {
  if (!sheet || document.body.classList.contains('poche')) return;
  sheet.hidden = false; document.body.classList.add('look-open'); sheet.firstChild.scrollTop = 0;
  panelUI.render(panelSnap, lastP && lastP.view && lastP.view.theme, lastP && lastP.view && lastP.view.face); panelUI.start();
  const x = sheet.querySelector('.look-x'); if (x) x.focus();
}
function close(refocus = true) { if (!sheet || sheet.hidden) return; sheet.hidden = true; document.body.classList.remove('look-open'); if (panelUI) panelUI.stop(); if (opener && refocus) opener.focus(); }
function app(o = {}) {
  if (o.kiosk || typeof document === 'undefined') return api;
  const send = o.send || (() => {});
  sheet = el('div', 'look-sheet'); sheet.hidden = true; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-labelledby', 'lookTitle');
  const box = el('div', 'look-box'), top = el('header', 'look-top'), title = el('h2', 'look-title', 'Son look'), x = btn('look-x', '×'), body = el('div');
  title.id = 'lookTitle'; x.setAttribute('aria-label', 'Fermer'); x.title = 'Fermer';
  top.append(title, x); box.append(top, body); sheet.append(box); document.body.append(sheet);
  const ui = build(body, { send });
  panelUI = { render: (l, th, fc) => ui.render(l, th, fc), shown: () => !sheet.hidden, start: ui.start, stop: ui.stop };
  x.addEventListener('click', () => close());
  sheet.addEventListener('click', e => { if (e.target === sheet) close(); });
  sheet.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') close(); });
  if (typeof MutationObserver === 'function') new MutationObserver(() => { if (document.body.classList.contains('poche')) close(false); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  opener = btn('follow look-go', 'Son look'); opener.title = 'Ses yeux, ses couleurs, ses accessoires';
  opener.addEventListener('click', open);
  const where = document.querySelector('.kfoot .car-go') || document.querySelector('.kfoot a[href$="reglages.html"]') || document.querySelector('.kfoot .follow');
  if (where) where.after(opener); else document.body.append(opener);
  if (typeof Screens !== 'undefined' && Screens.setState) {            // the theme and face of the moment, for the preview
    const s0 = Screens.setState; Screens.setState = p => { s0(p); lastP = p; if (panelUI.shown()) ui.render(null, p.view && p.view.theme, p.view && p.view.face); };
  }
  return api;
}

const api = {
  SHAPES, COLORS, HEX, EYE_COLORS, CHEEK_COLORS, SLOTS, ITEMS, ITEM, TENUES, SAISONS, DEFAULT, SAVED, HISTORY,
  clean, resolve, season, isNight, hotSun, context, apply, describe, command, isDefault, norm,
  get: get, with: withLook, cur, compile, tracker, screen,
  shapePts, inside, pixEye, eyeHex, cheekHex, rainbow, rainbowIndex, roleHex, forTheme, mix, paint, bitmaps, raster, geo, pixRole, layerItems,
  hookPix, hookVec, palette, IDX, PACK_A,
  build, app, open, close, get isOpen() { return !!sheet && !sheet.hidden; },
};
return api;
})();
