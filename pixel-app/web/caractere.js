/* Pixel's character (« caractère »): how every screen takes it, the phone's « Caractère » panel, and the server's rules for Pixel Lab.
   The server keeps it (pixel/caractere.py), snapshot "caractere": { preset, traits: { calin, grognon, bavard, farceur, energique,
   curieux, gourmand, studieux: 0..100, 50 = the Pixel of every day }, nom, surnom, humeur_jour, calme: { de, a }, boude, parle,
   change: { t0, quoi, kind, adj, what?, value? } | null, essai }.
   - screen(PER, before, snap)  every screen (screens.js setState): the traits go to persona.js (setTraits); a new "change" plays his
                                reaction (event 'caractere', web/scenes/caractere.js); a new "essai" a scene typical of his character.
   - app({ send, kiosk })       the phone: a « Caractère » button under the keys opens the panel (build), in the theme's colours
                                (caractere.css): presets, sliders, his name and yours, his habits, « Essayer », « Réinitialiser ».
   - build(root, { send })      the panel itself (the phone's sheet, and Pixel Lab's « Caractère » panel, lab/caractere-lab.js).
   - PRESETS, clean, apply, command...  the same rules as pixel/caractere.py, for the lab's fake server (lab/demo-hub.js).
   Loaded after screens.js and poche.js, before app.js; in the lab, before lab/demo-hub.js. */
window.PixelCaractere = (() => {
const TRAITS = ['calin', 'grognon', 'bavard', 'farceur', 'energique', 'curieux', 'gourmand', 'studieux'];
const ENDS = { calin: ['Indépendant', 'Câlin'], grognon: ['Patient', 'Grognon'], bavard: ['Taiseux', 'Bavard'], farceur: ['Sérieux', 'Farceur'],
  energique: ['Calme', 'Énergique'], curieux: ['Blasé', 'Curieux'], gourmand: ['Petit appétit', 'Gourmand'], studieux: ['Pas scolaire', 'Studieux'] };
const T = (...v) => Object.fromEntries(TRAITS.map((k, i) => [k, v[i] ?? 50]));
/* the same presets as pixel/caractere.py (tests/test_caractere.py compares them): id, name, one line, traits */
const PRESETS = [
  ['pixel', 'Pixel', 'Équilibré\u00a0: le Pixel de tous les jours.', T()],
  ['calin', 'Câlin', 'Il adore les câlins et te couvre de cœurs.', T(92, 25, 55, 45, 50, 50, 50, 50)],
  ['grognon', 'Grognon', 'Râleur et susceptible, mais gentil au fond.', T(30, 92, 55, 30, 50, 40, 50, 50)],
  ['farceur', 'Farceur', 'Blagues, grimaces et petites farces.', T(55, 35, 65, 92, 65, 55, 50, 35)],
  ['timide', 'Timide', 'Discret, il rougit vite et parle peu.', T(60, 35, 12, 25, 35, 40, 50, 55)],
  ['bavard', 'Bavard', 'Une vraie pipelette\u00a0: il commente tout.', T(55, 45, 95, 60, 60, 70, 50, 50)],
  ['paresseux', 'Paresseux', 'Toujours fatigué, il adore la sieste.', T(55, 45, 35, 40, 8, 30, 65, 25)],
  ['pile', 'Pile électrique', 'Il ne tient pas en place\u00a0!', T(50, 30, 70, 65, 95, 70, 50, 40)],
  ['gourmand', 'Gourmand', 'Il pense tout le temps à manger.', T(60, 40, 55, 50, 45, 50, 95, 40)],
  ['prof', 'Petit prof', 'Il adore apprendre et te poser des colles.', T(50, 45, 65, 35, 55, 80, 45, 95)],
  ['reveur', 'Rêveur', 'La tête dans les étoiles.', T(60, 25, 35, 45, 30, 75, 50, 40)],
  ['curieux', 'Curieux', 'Il veut tout voir et tout savoir.', T(50, 40, 65, 50, 65, 95, 50, 65)],
  ['zen', 'Zen', 'Rien ne l’énerve, jamais.', T(60, 5, 40, 40, 30, 45, 50, 50)],
  ['independant', 'Indépendant', 'Il vit sa vie et n’aime pas trop les câlins.', T(10, 55, 35, 45, 55, 55, 50, 50)],
  ['surprise', 'Surprise', 'Un caractère tiré au hasard.', null],
].map(([id, name, desc, traits]) => ({ id, name, desc, traits }));
const PRESET = Object.fromEntries(PRESETS.map(p => [p.id, p]));
const KINDS = { 'calin+': 'calin', 'calin-': 'independant', 'grognon+': 'grognon', 'grognon-': 'zen', 'bavard+': 'bavard', 'bavard-': 'timide',
  'farceur+': 'farceur', 'farceur-': 'serieux', 'energique+': 'pile', 'energique-': 'paresseux', 'curieux+': 'curieux', 'curieux-': 'blase',
  'gourmand+': 'gourmand', 'gourmand-': 'petit-appetit', 'studieux+': 'prof', 'studieux-': 'cancre' };
const ADJ = { pixel: 'comme d’habitude', calin: 'câlin', independant: 'indépendant', grognon: 'grognon', zen: 'zen', bavard: 'bavard', timide: 'timide',
  farceur: 'farceur', serieux: 'sérieux', pile: 'plein d’énergie', paresseux: 'paresseux', curieux: 'curieux', blase: 'blasé', gourmand: 'gourmand',
  'petit-appetit': 'petit mangeur', prof: 'studieux', cancre: 'pas très scolaire', reveur: 'rêveur' };
const NOM = 'Pixel', NOM_MAX = 16, SURNOM_MAX = 20;
const DEFAULT = { preset: 'pixel', traits: T(), nom: NOM, surnom: '', humeur_jour: false, calme: { de: 23, a: 6 }, boude: true, parle: true };
const SAVED = Object.keys(DEFAULT);
const copy = o => JSON.parse(JSON.stringify(o));
const int = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : null);
const norm = s => String(s ?? '').toLowerCase().trim().normalize('NFD').replace(/\p{Mn}/gu, '');   // commands.py norm()

/* ---------- the rules (pixel/caractere.py) ---------- */
function cleanName(v, most) {
  if (typeof v !== 'string') return null;
  const s = v.normalize('NFC').replace(/[^\p{L}\p{M}\p{N}\s'’.-]/gu, '').replace(/\s+/g, ' ').replace(/^[ .'’-]+|[ .'’-]+$/g, '');
  return [...s].slice(0, most).join('').trim();          // characters, as Python counts them (never half of one)
}
function clean(d) {
  d = d && typeof d === 'object' ? d : {};
  const out = copy(DEFAULT), tr = d.traits && typeof d.traits === 'object' ? d.traits : {}, q = d.calme && typeof d.calme === 'object' ? d.calme : {};
  if (typeof d.preset === 'string' && (PRESET[d.preset] || d.preset === 'perso')) out.preset = d.preset;
  for (const k of TRAITS) { const v = int(tr[k], 0, 100); if (v !== null) out.traits[k] = v; }
  out.nom = cleanName(d.nom, NOM_MAX) || NOM; out.surnom = cleanName(d.surnom, SURNOM_MAX) || '';
  for (const k of ['humeur_jour', 'boude', 'parle']) if (typeof d[k] === 'boolean') out[k] = d[k];
  for (const k of ['de', 'a']) { const v = int(q[k], 0, 23); if (v !== null) out.calme[k] = v; }
  return out;
}
const same = (a, b) => TRAITS.every(k => a[k] === b[k]);
const matching = t => (PRESETS.find(p => p.traits && same(p.traits, t)) || { id: 'perso' }).id;
function roll(rnd = Math.random) {                    // « Surprise »: two or three strong traits, the others close to 50
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1)), t = Object.fromEntries(TRAITS.map(k => [k, ri(35, 65)]));
  const ks = [...TRAITS].sort(() => rnd() - 0.5).slice(0, rnd() < 0.5 ? 2 : 3);
  for (const k of ks) t[k] = rnd() < 0.5 ? ri(4, 20) : ri(80, 96);
  return t;
}
function kind(t, old) {                                // the side he leans to (or, with old, the trait that moved most)
  const far = (f) => TRAITS.reduce((a, k) => (f(k) > f(a) ? k : a), TRAITS[0]);
  if (old) { const m = far(k => Math.abs(t[k] - (old[k] ?? 50))); if (t[m] !== (old[m] ?? 50)) return KINDS[m + (t[m] > (old[m] ?? 50) ? '+' : '-')]; }
  const k = far(k => Math.abs(t[k] - 50));
  return Math.abs(t[k] - 50) < 10 ? 'pixel' : KINDS[k + (t[k] > 50 ? '+' : '-')];
}
const fnv = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0; return h; };
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const drift = (day, k) => fnv(`${day}:${k}`) % 21 - 10;   // « Humeur du jour »: -10..10, as in persona.js and caractere.py
function today(car, d = new Date()) {
  const t = { ...T(), ...((car && car.traits) || {}) };
  return car && car.humeur_jour ? Object.fromEntries(TRAITS.map(k => [k, Math.max(0, Math.min(100, t[k] + drift(ymd(d), k)))])) : t;
}
function apply(car, a = {}, rnd = Math.random) {       // caractere.set: [new, change] (change null: nothing moved)
  const n = copy(car), quoi = []; let extra = {};
  if (typeof a.preset === 'string' && PRESET[a.preset]) { n.preset = a.preset; n.traits = a.preset === 'surprise' ? roll(rnd) : { ...PRESET[a.preset].traits }; quoi.push(a.preset === 'surprise' ? 'surprise' : 'preset'); }
  else if (a.traits && typeof a.traits === 'object') {   // only the valid values move a trait: a bad one leaves it as it was
    const t = { ...n.traits }; for (const k in a.traits) { const v = TRAITS.includes(k) ? int(a.traits[k], 0, 100) : null; if (v !== null) t[k] = v; }
    if (!same(t, n.traits)) { n.traits = t; n.preset = matching(t); quoi.push('traits'); }
  }
  for (const [k, most] of [['nom', NOM_MAX], ['surnom', SURNOM_MAX]]) {
    let v = cleanName(a[k], most); if (v === null) continue; v = v || (k === 'nom' ? NOM : '');
    if (v !== n[k]) { n[k] = v; quoi.push(k); }
  }
  for (const k of ['humeur_jour', 'boude', 'parle']) if (typeof a[k] === 'boolean' && a[k] !== n[k]) { n[k] = a[k]; quoi.push('reglage'); extra = { what: k === 'humeur_jour' ? 'humeur' : k, value: a[k] }; }
  if (a.calme && typeof a.calme === 'object') {
    const q = { ...n.calme }; for (const h of ['de', 'a']) { const v = int(a.calme[h], 0, 23); if (v !== null) q[h] = v; }
    if (q.de !== n.calme.de || q.a !== n.calme.a) { n.calme = q; quoi.push('reglage'); extra = { what: 'calme', value: q }; }
  }
  if (!quoi.length) return [n, null];
  const first = ['surprise', 'preset', 'traits', 'nom', 'surnom', 'reglage'].find(q => quoi.includes(q));
  const k = first === 'preset' ? (ADJ[n.preset] ? n.preset : kind(n.traits)) : first === 'surprise' ? 'surprise' : first === 'traits' ? kind(n.traits, car.traits) : first;
  return [n, { quoi: first, kind: k, adj: ADJ[kind(n.traits)] || '', ...(first === 'reglage' ? extra : {}) }];
}
function ajuste(car, trait, d) {                       // caractere.ajuste: « plus câlin », « moins bavard »
  const step = int(d, -100, 100); if (!TRAITS.includes(trait) || !step) return [car, null];
  const [n, ch] = apply(car, { traits: { [trait]: car.traits[trait] + step } });
  return [n, { ...(ch || { quoi: 'traits', adj: ADJ[kind(n.traits)] || '' }), kind: KINDS[trait + (step > 0 ? '+' : '-')] }];
}
const saved = c => Object.fromEntries(SAVED.map(k => [k, copy(c[k])]));
/* a toast for a change the screens alone would not explain (caractere.py notice) */
const notice = (car, ch) => (ch && ch.what === 'parle' && ch.value === false && !(car && car.parle === true) ? `${(car && car.nom) || NOM} ne bavarde plus. Tape « tu peux parler » pour le réentendre.` : '');
const NOTICE_AFTER = 3600;                             // ms: after his reaction's line (the banner would hide his bubble)
/* typed commands (caractere.py command): { action, args } | { toast, mood } | null */
const PRESET_WORDS = { pixel: 'pixel', normal: 'pixel', equilibre: 'pixel', 'toi-meme': 'pixel', 'toi meme': 'pixel', "comme d'habitude": 'pixel', 'par defaut': 'pixel',
  calin: 'calin', affectueux: 'calin', tendre: 'calin', grognon: 'grognon', ronchon: 'grognon', raleur: 'grognon', bougon: 'grognon', susceptible: 'grognon',
  farceur: 'farceur', blagueur: 'farceur', rigolo: 'farceur', drole: 'farceur', timide: 'timide', discret: 'timide', bavard: 'bavard', pipelette: 'bavard',
  paresseux: 'paresseux', flemmard: 'paresseux', faineant: 'paresseux', 'pile electrique': 'pile', 'une pile electrique': 'pile', energique: 'pile', survolte: 'pile',
  gourmand: 'gourmand', glouton: 'gourmand', 'petit prof': 'prof', 'un petit prof': 'prof', prof: 'prof', professeur: 'prof', studieux: 'prof', intello: 'prof',
  reveur: 'reveur', curieux: 'curieux', zen: 'zen', patient: 'zen', independant: 'independant', surprise: 'surprise', 'au hasard': 'surprise', hasard: 'surprise', aleatoire: 'surprise' };
const TRAIT_WORDS = { calin: ['calin', 1], affectueux: ['calin', 1], independant: ['calin', -1], grognon: ['grognon', 1], raleur: ['grognon', 1], ronchon: ['grognon', 1],
  patient: ['grognon', -1], zen: ['grognon', -1], bavard: ['bavard', 1], taiseux: ['bavard', -1], timide: ['bavard', -1], farceur: ['farceur', 1], blagueur: ['farceur', 1],
  serieux: ['farceur', -1], energique: ['energique', 1], calme: ['energique', -1], paresseux: ['energique', -1], curieux: ['curieux', 1], blase: ['curieux', -1],
  gourmand: ['gourmand', 1], studieux: ['studieux', 1], scolaire: ['studieux', 1] };
const NOT_NAMES = new Set(['comment', 'demain', 'plus', 'tard', 'quand', 'vite', 'maintenant', 'ce', 'soir', 'ici', 'la', 'tout', 'rien', 'si', 'que', 'qui', 'comme', 'pour',
  'dans', 'avec', 'un', 'une', 'des', 'de', 'du', 'le', 'les', 'tu', 'je', 'il', 'elle', 'me', 'te', 'moi', 'toi', 'encore', 'pas', 'ne', 'jamais', 'souvent', 'stp', 'svp',
  'taxi', 'bientot', 'apres', 'vraiment', 'aussi', 'bien', 'toujours', 'deja', 'juste', 'seulement', 'enfin', 'donc', 'alors', 'pareil', 'mieux',
  'ainsi', 'presque', 'quoi', 'ou', 'oui', 'non', 'merci', 'bon', 'bonjour', 'salut', 'coucou', 'au', 'aux', 'en', 'et', 'mais', 'ca', 'pourquoi', 'combien',
  'sur', 'par', 'chez', 'sans', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'lui', 'nous', 'vous', 'on', 'y', 'a', 'tres', 'trop', 'peu',
  'beaucoup', 'autrement', 'parfois', 'plutot']);
const TOI = /^(?:appelle[- ]?toi|tu t['’]appelleras|tu vas t['’]appeler|ton nom (?:est|sera|c['’]est))\s+(.+?)\s*[!.…]*$/i;
const TOI1 = /^(?:tu t['’]appelles?|je vais t['’]appeler)\s+(.+?)\s*[!.…]*$/i;      // sounds like chat: one word only
const MOI = /^(?:appelle[- ]?moi|je m['’]appelle|mon (?:pr[ée]nom|nom|surnom) (?:est|c['’]est))\s+(.+?)\s*[!.…]*$/i;
const OUBLIE = /^(?:ne m['’]appelle plus (?:comme [çc]a|par mon (?:nom|pr[ée]nom|surnom))|oublie mon (?:surnom|pr[ée]nom|nom)|pas de surnom)\s*[!.…]*$/i;
function aName(s, most, words = 2) {
  s = s.trim();
  if (!s || s.includes('?') || s.length > most || !(words > 1 ? /^\p{L}+(?:[ '’-]\p{L}+)?$/u : /^\p{L}+(?:-\p{L}+)?$/u).test(s)) return null;
  if (norm(s).split(/[ '’-]/).some(w => NOT_NAMES.has(w))) return null;
  return s[0].toUpperCase() + s.slice(1);
}
const presetsText = () => PRESETS.map(p => p.name).join(', ');
function command(raw, car = DEFAULT) {                // a command that changes nothing (« tu peux parler » when he does) is left to Claude
  raw = String(raw).trim(); const t = norm(raw).replace(/\s*[.!…]+$/, ''); let m;
  const step = (un, more, sign) => (un ? 10 : 20) * sign * (more === 'plus' ? 1 : -1);
  if ((m = t.match(/^(?:sois|deviens)\s+(un peu\s+|tres\s+)?(?:une?\s+)?(plus\s+|moins\s+)?(.+?)\s*!*$/))) {
    const [, how, more, word] = m;
    if (more && TRAIT_WORDS[word]) { const [trait, sign] = TRAIT_WORDS[word]; return { action: 'caractere.ajuste', args: { trait, d: step(how === 'un peu ', more.trim(), sign) } }; }
    if (!more && PRESET_WORDS[word]) return { action: 'caractere.set', args: { preset: PRESET_WORDS[word] } };
    return null;
  }
  if ((m = t.match(/^(?:caractere|personnalite)(?:\s+([^?]+?))?\s*\??$/))) {   // « caractère ? »: the list
    const word = (m[1] || '').trim();
    if (PRESET_WORDS[word]) return { action: 'caractere.set', args: { preset: PRESET_WORDS[word] } };
    if (['reset', 'reinitialise', 'reinitialiser', 'par defaut', 'normal'].includes(word)) return { action: 'caractere.reset', args: {} };
    if (!word) return { toast: `Son caractère : ${(PRESET[car.preset] || { name: 'Sur mesure' }).name}. Les caractères : ${presetsText()}. Tape « caractère câlin », « sois grognon »…`, ms: 12000 };
    if (word.includes(' ')) return null;
    return { toast: `Je ne connais pas ce caractère. Les caractères : ${presetsText()}.`, ms: 8000, mood: 'confus' };
  }
  if ((m = t.match(/^(un peu\s+)?(plus|moins)\s+(.+?)\s*!*$/)) && TRAIT_WORDS[m[3]]) { const [trait, sign] = TRAIT_WORDS[m[3]]; return { action: 'caractere.ajuste', args: { trait, d: step(m[1], m[2], sign) } }; }
  let args = null;
  if (OUBLIE.test(raw)) args = { surnom: '' };
  for (const [rx, key, most, words] of [[TOI, 'nom', NOM_MAX, 2], [TOI1, 'nom', NOM_MAX, 1], [MOI, 'surnom', SURNOM_MAX, 2]]) {
    if (!args && (m = raw.match(rx))) { const name = aName(m[1], most, words); if (!name) return null; args = { [key]: name }; }
  }
  if (['tais-toi', 'tais toi'].includes(t)) args = { parle: false };
  if (['tu peux parler', 'tu peux reparler', 'reparle', 'tu peux parler maintenant'].includes(t)) args = { parle: true };
  if (!args || !apply(clean(car), args, () => 0.5)[1]) return null;   // nothing to change: Claude answers
  return { action: 'caractere.set', args };
}

/* ---------- every screen: the snapshot -> persona.js ---------- */
let lastKey = '', seenChange = null, seenEssai = null, lastKind = '';
function screen(PER, before, p) {
  const c = p && p.caractere; if (!c) return;
  state(p);                                            // the phone's panel, if open
  if (!PER || !PER.setTraits) return;
  const key = JSON.stringify([c.traits, c.nom, c.surnom, c.humeur_jour, c.calme, c.boude, c.parle]);
  if (key !== lastKey) { lastKey = key; PER.setTraits(c); }
  const ch = c.change, fresh = t => !!t && (p.server_now || Date.now()) - t < 10000;
  if (!before || seenChange === null) { seenChange = ch ? ch.t0 : 0; seenEssai = c.essai || 0; lastKind = ch ? ch.kind : ''; return; }   // old news stays old
  if (ch && ch.t0 !== seenChange) {
    seenChange = ch.t0;
    const again = ch.quoi === 'traits' && ch.kind === lastKind && /^caractere-/.test(PER.state.cur || '');   // a slider again: let him finish
    lastKind = ch.kind;
    if (fresh(ch.t0) && !again) PER.event('caractere', { ...ch, nom: c.nom, surnom: c.surnom }, { visage: true, force: true });
  }
  if (c.essai && c.essai !== seenEssai) { seenEssai = c.essai; if (fresh(c.essai)) PER.play(PER.typical()); }
}

/* ---------- the panel (the phone's sheet, the lab's panel) ---------- */
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const btn = (cls, text) => { const b = el('button', cls, text); b.type = 'button'; return b; };
function todayNote(car) {                              // « Aujourd'hui, il est un peu plus câlin et un peu moins bavard. »
  if (!car || !car.humeur_jour) return '';
  const t = today(car), moved = TRAITS.map(k => [k, t[k] - car.traits[k]]).filter(([, v]) => Math.abs(v) >= 4).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 2);
  if (!moved.length) return 'Aujourd’hui, il est comme d’habitude.';
  const words = moved.map(([k, v]) => `un peu ${v > 0 ? 'plus' : 'moins'} ${ENDS[k][1].toLowerCase()}`);
  return `Aujourd’hui, il est ${words.join(' et ')}.`;
}
function surMesure(car) {                              // « Sur mesure »: what his own mix leans to
  const k = kind(car.traits);
  if (k === 'pixel') return `Un caractère à toi, presque le ${car.nom || NOM} de tous les jours.`;
  return `Un caractère à toi, plutôt ${({ cancre: 'peu scolaire' })[k] || ADJ[k] || 'équilibré'}.`;
}
function build(root, o = {}) {
  const send = o.send || (() => {});
  let car = clean({}), drag = null, resetAt = 0, resetT = 0;
  const now = el('p', 'car-now'); now.setAttribute('aria-live', 'polite');
  const nowName = el('b', 'car-now-name'), nowDesc = el('span', 'car-now-desc'); now.append(nowName, ' ', nowDesc);
  const presets = el('div', 'car-presets'); presets.setAttribute('role', 'group'); presets.setAttribute('aria-label', 'Caractères tout prêts');
  const pb = PRESETS.map(p => {
    const b = btn('car-preset'); b.dataset.id = p.id; b.setAttribute('aria-pressed', 'false');
    b.append(el('b', null, p.name), el('span', null, p.desc));
    b.addEventListener('click', () => send('caractere.set', { preset: p.id }));
    presets.append(b); return b;
  });
  const traits = el('div', 'car-traits'), sliders = {};
  for (const k of TRAITS) {
    const row = el('div', 'car-trait'), ends = el('div', 'car-ends'), out = el('output', 'car-val', '50'), r = el('input');
    Object.assign(r, { type: 'range', min: 0, max: 100, step: 5, value: 50 }); r.dataset.k = k;
    r.setAttribute('aria-label', `${ENDS[k][1]} : de ${ENDS[k][0]} (0) à ${ENDS[k][1]} (100)`);
    ends.append(el('span', 'car-l', ENDS[k][0]), out, el('span', 'car-r', ENDS[k][1]));
    row.append(ends, r); traits.append(row); sliders[k] = { r, out };
    r.addEventListener('pointerdown', () => { drag = k; });
    r.addEventListener('input', () => { drag = k; out.textContent = r.value; row.classList.toggle('off', Number(r.value) !== 50); });
    r.addEventListener('change', () => { drag = null; send('caractere.set', { traits: { [k]: Number(r.value) } }); });
    r.addEventListener('blur', () => { drag = null; });
  }
  const jour = el('p', 'car-jour');
  const names = el('div', 'car-names'), fields = {};
  for (const [k, label, most, ph] of [['nom', 'Son nom', NOM_MAX, 'Pixel'], ['surnom', 'Il t’appelle', SURNOM_MAX, 'rien de spécial']]) {
    const f = el('label', 'car-field'), i = el('input');
    Object.assign(i, { type: 'text', maxLength: most, placeholder: ph, autocomplete: 'off', spellcheck: false, enterKeyHint: 'done' }); i.dataset.k = k;
    f.append(el('span', null, label), i); names.append(f); fields[k] = i;
    const commit = () => { const v = cleanName(i.value, most) || ''; if ((k === 'nom' ? v || NOM : v) !== car[k]) send('caractere.set', { [k]: v }); };   // empty name: Pixel again
    i.addEventListener('change', commit);
    i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); i.blur(); } });
  }
  const opts = el('div', 'car-opts'), sw = {};
  for (const [k, label, help] of [['humeur_jour', 'Humeur du jour', 'Ses traits bougent un peu chaque jour.'], ['boude', 'Il peut bouder', 'Trop embêté, il part bouder dans un coin.'],
    ['parle', 'Il parle', 'Ses petites bulles. Sinon, juste les rappels et les nouvelles.']]) {
    const b = btn('car-sw'); b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', 'false'); b.dataset.k = k;
    b.append(el('span', 'car-sw-t', label), el('small', null, help), el('i', 'car-knob'));
    b.addEventListener('click', () => send('caractere.set', { [k]: b.getAttribute('aria-checked') !== 'true' }));
    opts.append(b); sw[k] = b;
  }
  const calme = el('div', 'car-calme'), sel = {};
  calme.append(el('span', 'car-calme-t', 'Heures calmes'));
  for (const [k, label] of [['de', 'de'], ['a', 'à']]) {
    const l = el('label', 'car-hour'), s = el('select');
    for (let h = 0; h < 24; h++) { const op = el('option', null, `${h} h`); op.value = String(h); s.append(op); }
    s.setAttribute('aria-label', `Heures calmes : ${k === 'de' ? 'début' : 'fin'}`);
    s.addEventListener('change', () => send('caractere.set', { calme: { [k]: Number(s.value) } }));
    l.append(el('span', null, label), s); calme.append(l); sel[k] = s;
  }
  const calmeNote = el('small', 'car-calme-n'); calme.append(calmeNote);
  opts.append(calme);
  /* his habits (habitudes.js): his quiet hours are his night now, from his bedtime to his wake-up; set them there */
  const hab = typeof window !== 'undefined' && window.PixelHabitudes;
  if (hab) {
    const go = btn('car-hab', 'Son emploi du temps');
    go.addEventListener('click', () => {
      if (typeof window.PixelPanel === 'function') { close(false); window.PixelPanel('habitudes'); return; }
      const h = document.getElementById('hHabitudes'); if (h) (h.closest('section') || h).scrollIntoView({ block: 'start', behavior: 'smooth' });   // Pixel Lab
    });
    calme.replaceChildren(el('span', 'car-calme-t', 'Heures calmes'), calmeNote, go);
  }
  const habNote = () => {
    const H = hab && hab.screen && hab.screen.state, h = H && H.horaires;
    if (!h) return 'Ses heures calmes suivent son emploi du temps.';
    if (!h.actif) return 'Pas d’heures calmes : son emploi du temps est éteint (23 h à 6 h pour son ventre).';
    return `C’est sa nuit : de son coucher (${hab.hm(h.coucher)}) à son réveil (${hab.hm(h.reveil)}). Rien que des moments calmes.`;
  };
  const acts = el('div', 'car-actions'), tryB = btn('car-try', 'Essayer'), resetB = btn('car-reset', 'Réinitialiser');
  tryB.title = 'Pixel joue une scène typique de son caractère'; resetB.title = 'Retour au Pixel de tous les jours : traits, noms et habitudes';
  tryB.addEventListener('click', () => send('caractere.essai'));
  resetB.addEventListener('click', () => {
    if (Date.now() - resetAt < 4000) { resetAt = 0; clearTimeout(resetT); resetB.textContent = 'Réinitialiser'; send('caractere.reset'); return; }
    resetAt = Date.now(); resetB.textContent = 'Sûr ? Touche encore'; clearTimeout(resetT); resetT = setTimeout(() => { resetAt = 0; resetB.textContent = 'Réinitialiser'; }, 4000);
  });
  acts.append(tryB, resetB);
  const h3 = t => el('h3', 'car-h', t);
  root.classList.add('car-body');
  root.append(now, h3('Caractères tout prêts'), presets, h3('Réglages fins'), traits, jour, h3('Les noms'), names, h3('Ses habitudes'), opts, acts);
  function render(c) {
    if (!c) return;
    car = clean(c);
    const p = PRESET[car.preset];
    nowName.textContent = p ? p.name : 'Sur mesure';
    nowDesc.textContent = p ? p.desc : surMesure(car);
    pb.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === car.preset)));
    for (const k of TRAITS) {
      const { r, out } = sliders[k], v = car.traits[k];
      if (drag !== k) { r.value = String(v); out.textContent = String(v); r.parentElement.classList.toggle('off', v !== 50); }
    }
    const jn = todayNote(car); jour.textContent = jn; jour.hidden = !jn;
    for (const k of ['nom', 'surnom']) if (document.activeElement !== fields[k]) fields[k].value = k === 'nom' && car.nom === NOM ? '' : car[k];
    for (const k in sw) sw[k].setAttribute('aria-checked', String(!!car[k]));
    for (const k in sel) if (document.activeElement !== sel[k]) sel[k].value = String(car.calme[k]);
    calmeNote.textContent = hab ? habNote() : car.calme.de === car.calme.a ? 'Pas d’heures calmes.' : `La nuit, de ${car.calme.de} h à ${car.calme.a} h : rien que des moments calmes.`;
    if (o.onRender) o.onRender(car);
  }
  render(car);
  return { render, get car() { return car; } };
}

/* ---------- the phone: the « Caractère » button and its sheet ---------- */
let sheet = null, ui = null, opener = null, lastSnap = null;
function open() {
  if (!sheet || document.body.classList.contains('poche')) return;
  sheet.hidden = false; document.body.classList.add('car-open'); sheet.firstChild.scrollTop = 0;
  if (lastSnap) ui.render(lastSnap);
  const x = sheet.querySelector('.car-x'); if (x) x.focus();
}
function close(refocus = true) { if (!sheet || sheet.hidden) return; sheet.hidden = true; document.body.classList.remove('car-open'); if (opener && refocus) opener.focus(); }
function app(o = {}) {
  if (o.kiosk || typeof document === 'undefined') return api;
  const send = o.send || (() => {});
  sheet = el('div', 'car-sheet'); sheet.hidden = true; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-labelledby', 'carTitle');
  const box = el('div', 'car-box'), top = el('header', 'car-top'), title = el('h2', 'car-title', 'Caractère de Pixel'), x = btn('car-x', '×'), body = el('div');
  title.id = 'carTitle'; x.setAttribute('aria-label', 'Fermer'); x.title = 'Fermer';
  top.append(title, x); box.append(top, body); sheet.append(box); document.body.append(sheet);
  ui = build(body, { send, onRender: c => { title.textContent = `Caractère de ${c.nom}`; } });
  x.addEventListener('click', close);
  sheet.addEventListener('click', e => { if (e.target === sheet) close(); });
  sheet.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') close(); });   // typing a name is not a command (app.js)
  if (typeof MutationObserver === 'function')           // Pixel de poche (poche.js) takes the whole phone: the sheet goes away
    new MutationObserver(() => { if (document.body.classList.contains('poche')) close(false); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  opener = btn('follow car-go', 'Caractère'); opener.title = 'Son caractère, son nom, ses habitudes';
  opener.addEventListener('click', open);
  const where = document.querySelector('.kfoot a[href$="reglages.html"]') || document.querySelector('.kfoot .follow');
  if (where) where.after(opener); else document.body.append(opener);
  return api;
}
function state(p) { if (p && p.caractere) { lastSnap = p.caractere; if (ui && sheet && !sheet.hidden) ui.render(p.caractere); } }

const api = {
  TRAITS, ENDS, PRESETS, PRESET, KINDS, ADJ, DEFAULT, NOM, clean, cleanName, apply, ajuste, kind, roll, drift, today, saved, command, matching, todayNote, notice, NOTICE_AFTER, surMesure,
  screen, build, app, state, open, close, get isOpen() { return !!sheet && !sheet.hidden; },
};
return api;
})();
