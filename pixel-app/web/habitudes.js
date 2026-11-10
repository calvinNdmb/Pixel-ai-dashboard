/* « Ses habitudes » on the screens: his day, his games, what makes him laugh, his fears, his own phrases. The server keeps
   them (pixel/habitudes.py, snapshot "habitudes"); web/scenes/habitudes.js has his scenes and his jokes. This file:
   - the rules, the same as pixel/habitudes.py (tests/test_habitudes.py compares them), for the in-page server of Pixel Lab
     and of Pixel sans Pi (hub(), wired by lab/demo-hub.js): his schedule and its states, the games, the commands;
   - on every screen (a screens.js add-on, and a few hooks): his night. Asleep by his schedule (habitudes.dort: the night or
     his nap) he sleeps on his face screen, dimmed, a night-light when he fears the dark; a touch on his face makes him
     mumble and sleep on, a cuddle makes him smile in his sleep; keys, the command bar and swipes still work. His routine
     plays when the server says (wake-up, bedtime, teeth, nap). persona.js hooks: his quiet hours follow his schedule
     (night), the world's news do not wake him nor interrupt a game (gate), and he says the phrases you taught him now and
     then (lines). The games are drawn instead of his face screen and played by touch; his offer « On joue à … ? » (a
     moment of life, more often if énergique) has « Oui ! » and « Plus tard ». The tickles (fast taps, quick rubbing) make
     him laugh if he likes them (a farceur laughs longer), else he gets annoyed as before; petting him while he is scared
     comforts him (habitudes.rassure); the little spider goes when you touch it; all lights off while he is awake: his fear
     of the dark (or, switched off, « Même pas peur »).
   - on the phone (app.js's page, not the Pi's screen): the « Ses habitudes » panel (PixelPanel('habitudes'), habitudes.css):
     his schedule, his favourite games and their « Jouer », what makes him laugh, his fears and their courage, his phrases.
   Over his face screen, in screens.js's ORDER: the quick menu, a cast (a game waits under it: the server pauses it), an open
   exercise (web/exos.js: no game starts then), a game, a friend's visit (web/amis.js: no game during a visit, and no visit
   during a game: the servers refuse them), souvenirs' views, his offer of a game and his night veil, an exercise's offer,
   then Nourrir's tray and plate. His night for the other features: sommeil(), endormi() (his schedule, else the old quiet
   hours), as pixel/habitudes.py says it.
   Loaded after screens.js and web/exos.js, before app.js; in the lab before lab/demo-hub.js. */
window.PixelHabitudes = (() => {
/* ---------- the rules (pixel/habitudes.py) ---------- */
const JEUX = { cache: 'Cache-cache', pfc: 'Pierre-feuille-ciseaux', etoiles: 'Attrape-étoiles', simon: 'Simon' };
const RIRES = { chatouilles: 'Les chatouilles', blagues: 'Les blagues', grimaces: 'Les grimaces', bruits: 'Les bruits rigolos', gagner: 'Gagner à un jeu' };
const PEURS = { orage: 'L’orage', noir: 'Le noir', araignees: 'Les araignées', vide: 'Le vide' };
const MOMENTS = { bonjour: 'Pour dire bonjour', 'bonne-nuit': 'Pour dire bonne nuit', content: 'Quand il est content', merci: 'Pour dire merci',
  'au-revoir': 'Pour dire au revoir', bravo: 'Pour dire bravo', faim: 'Quand il a faim' };
const BRUITS = 8, REVEIL_MIN = 15, COUCHER_MIN = 15, DENTS_MIN = 8, VEILLEUSE_MIN = 2;
const DEFAULT_H = { actif: true, reveil: 450, coucher: 1260, sieste: null, weekend: null };
const AWAKE_MIN = 360, NIGHT_MIN = 240, NIGHT_MAX = 960, NAP_MIN = 10, NAP_MAX = 180, PHRASE_MAX = 60, PHRASES_MAX = 5;
const COURAGE_STEP = 10, COURAGE_DAY = 30, STORM_GAP = [12 * 60, 25 * 60], EV_FRESH = 120, END_MS = 8000, AGAIN_MS = 120000;
const copy = o => JSON.parse(JSON.stringify(o));
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const pad2 = n => String(n).padStart(2, '0');
const mod = (a, n) => ((a % n) + n) % n;
const norm = s => String(s ?? '').toLowerCase().trim().normalize('NFD').replace(/\p{Mn}/gu, '').replace(/’/g, "'").replace(/\s+/g, ' ');
function int(v, lo, hi) { if (typeof v !== 'number' || !Number.isFinite(v)) return null; const r = Math.round(v); return r >= lo && r <= hi ? r : null; }
function toMin(v) {                                   // 450, "7:30", "7h30", "7 h", "19 h 05" -> minutes after midnight, or null
  if (typeof v === 'string') {
    const m = /^\s*(\d{1,2})\s*(?:(?::|h|H|heures?)\s*(\d{2})?)?\s*$/.exec(v); if (!m) return null;
    const h = +m[1], mn = +(m[2] || 0); return h < 24 && mn < 60 ? h * 60 + mn : null;
  }
  return int(v, 0, 1439);
}
const hm = m => { m = mod(Math.trunc(m), 1440); return m % 60 ? `${Math.floor(m / 60)} h ${pad2(m % 60)}` : `${Math.floor(m / 60)} h`; };
const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
function pairs(h) {                                   // the kinds of days (wake, bed) and of nights (bed, next wake)
  const w = h.reveil, b = h.coucher, we = h.weekend, ww = we ? we.reveil : w, wb = we ? we.coucher : b;
  return [[[w, b], [w, wb], [ww, wb], [ww, b]], [[b, w], [wb, ww]]];
}
function problem(h) {                                 // why a schedule cannot be (French), or null
  const [days, nights] = pairs(h);
  for (const [w, b] of days) if (mod(b - w, 1440) < AWAKE_MIN) return 'Il doit rester réveillé au moins 6 heures dans la journée.';
  for (const [b, w] of nights) { const s = mod(w - b, 1440); if (s < NIGHT_MIN) return 'Il doit dormir au moins 4 heures la nuit.'; if (s > NIGHT_MAX) return 'Il ne peut pas dormir plus de 16 heures.'; }
  const s = h.sieste;
  if (s) for (const [w, b] of days) { const off = mod(s.de - w, 1440), span = mod(b - w, 1440); if (off < REVEIL_MIN + 15 || off + s.duree > span - COUCHER_MIN - 15) return 'La sieste doit être dans sa journée, loin de son réveil et de son coucher.'; }
  return null;
}
const cleanSieste = s => { if (!isObj(s)) return null; const de = toMin(s.de), d = int(s.duree, NAP_MIN, NAP_MAX); return de !== null && d !== null ? { de, duree: d } : null; };
const cleanWeekend = w => { if (!isObj(w)) return null; const r = toMin(w.reveil), c = toMin(w.coucher); return r !== null && c !== null ? { reveil: r, coucher: c } : null; };
function cleanHoraires(x) {
  const out = { ...DEFAULT_H }; if (!isObj(x)) return out;
  if (typeof x.actif === 'boolean') out.actif = x.actif;
  for (const k of ['reveil', 'coucher']) { const v = toMin(x[k]); if (v !== null) out[k] = v; }
  out.sieste = cleanSieste(x.sieste); out.weekend = cleanWeekend(x.weekend);
  for (const k of ['sieste', 'weekend']) if (problem(out)) out[k] = null;
  if (problem(out)) { out.reveil = DEFAULT_H.reveil; out.coucher = DEFAULT_H.coucher; }
  return out;
}
/* his day `day` (any Date of it) as [start, end, etat] in local wall-clock time, from his wake-up to the next one */
function segments(h, day, skip) {
  const at = (d, m) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, m);
  const we = h.weekend, wd = day.getDay(), nxt = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1), nwd = nxt.getDay();
  const w = we && (wd === 6 || wd === 0) ? we.reveil : h.reveil, b = we && (wd === 5 || wd === 6) ? we.coucher : h.coucher;
  const w2 = we && (nwd === 6 || nwd === 0) ? we.reveil : h.reveil, span = mod(b - w, 1440) || 1440;
  const cuts = [[at(day, w + REVEIL_MIN), 'reveil']], s = h.sieste;
  if (s && skip !== ymd(day)) { const off = mod(s.de - w, 1440); cuts.push([at(day, w + off), 'eveille'], [at(day, w + off + s.duree), 'sieste']); }
  cuts.push([at(day, w + span - COUCHER_MIN), 'eveille'], [at(day, w + span), 'coucher'], [at(nxt, w2), 'nuit']);
  const out = []; let t = at(day, w);
  for (const [end, e] of cuts) if (end > t) { out.push([t, end, e]); t = end; }
  return out;
}
function etatAt(h, now, skip) {                       // [etat, since, until, next etat] at `now` (a Date)
  if (!h || !h.actif) return ['eveille', null, null, null];
  for (const k of [-1, 0, -2]) {
    const seg = segments(h, new Date(now.getFullYear(), now.getMonth(), now.getDate() + k), skip);
    for (let i = 0; i < seg.length; i++) { const [a, b, e] = seg[i]; if (a <= now && now < b) return [e, a, b, i + 1 < seg.length ? seg[i + 1][2] : 'reveil']; }
  }
  return ['eveille', null, null, null];
}
function awakeHours(h, t0, t1, cap) {                 // hours (ms in) outside his nights, at most cap: his belly (lab/demo-hub.js)
  let total = 0;
  for (let t = t0; t < t1;) {
    const end = Math.min(t1, t + 7 * 864e5); let night = 0;
    for (let d = new Date(t - 2 * 864e5); d.getTime() <= end + 864e5; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12)) {
      for (const [a, b, e] of segments(h, d)) if (e === 'nuit' && b.getTime() > t && a.getTime() < end) night += Math.min(b.getTime(), end) - Math.max(a.getTime(), t);
    }
    total += Math.max(0, end - t - night) / 3.6e6;
    if (cap != null && total >= cap) return cap;
    t = end;
  }
  return total;
}
/* ---- the games: the server judges, every screen draws (the same rules as pixel/habitudes.py) ---- */
const SPOTS = ['gauche', 'droite', 'haut', 'bas'], HANDS = ['pierre', 'feuille', 'ciseaux'], BEATS = { pierre: 'ciseaux', feuille: 'pierre', ciseaux: 'feuille' };
const CACHE = { manches: 3, hide: 1600, look: 15000, show: 2400, rates: 2 }, PFC = { points: 2, manches: 5, wait: 25000, show: 2600 };
const ETOILES = { ms: 30000, n: 34, but: 12 }, SIMON = { start: 3, max: 8, step: 650, lit: 420, gap: 900, wait: 20000 };
const RNG = { int: (a, b) => a + Math.floor(Math.random() * (b - a + 1)), choice: a => a[Math.floor(Math.random() * a.length)] };
function newGame(jeu, t, gid, favori, par, r = RNG) {
  const p = { id: gid, jeu, t0: t, etat: 'joue', favori: !!favori, par: par || '', phase: '', phase_t: t, fin: null, pause: 0, manche: 1 };
  if (jeu === 'cache') Object.assign(p, { manches: CACHE.manches, trouves: 0, cachette: r.choice(SPOTS), rates: [], phase: 'cache' });
  else if (jeu === 'pfc') Object.assign(p, { score: [0, 0], toi: '', lui: '', gagnant: '', phase: 'choix' });
  else if (jeu === 'etoiles') {
    const stars = [];
    for (let i = 0; i < ETOILES.n; i++) { const d = i % 9 === 7; stars.push({ x: r.int(70, 730), t: Math.trunc(i * (ETOILES.ms - 3500) / ETOILES.n + r.int(0, 500)), v: d ? 205 : r.int(120, 185), r: d ? 40 : 34, d }); }
    Object.assign(p, { etoiles: stars, prises: [], score: 0, but: ETOILES.but, phase: 'joue' });
  } else if (jeu === 'simon') {
    const seq = []; while (seq.length < SIMON.max) { const x = r.int(0, 3); if (seq.length >= 2 && seq[seq.length - 1] === x && seq[seq.length - 2] === x) continue; seq.push(x); }
    Object.assign(p, { seq, long: SIMON.start, fait: 0, phase: 'montre', meilleur: 0 });
  }
  return p;
}
const endGame = (p, t, resultat, score) => Object.assign(p, { etat: 'fin', phase: 'fin', phase_t: t, fin: { resultat, t, score: score ?? null } });
function gameMove(p, a, t, r = RNG) {                 // a move (habitudes.coup's arguments): what it did, '' if it is not one
  if (!p || p.etat !== 'joue' || p.pause || !isObj(a) || a.id !== p.id) return '';
  const manche = a.manche === undefined || a.manche === null || a.manche === p.manche;
  if (p.jeu === 'cache') {
    if (p.phase !== 'cherche' || !manche || !SPOTS.includes(a.cote)) return '';
    if (a.cote === p.cachette) { Object.assign(p, { trouves: p.trouves + 1, phase: 'trouve', phase_t: t }); return 'trouve'; }
    if (p.rates.includes(a.cote)) return '';
    p.rates.push(a.cote);
    if (p.rates.length >= CACHE.rates) { Object.assign(p, { phase: 'sorti', phase_t: t }); return 'sorti'; }
    return 'rate';
  }
  if (p.jeu === 'pfc') {
    if (p.phase !== 'choix' || !manche || !HANDS.includes(a.choix)) return '';
    const lui = r.choice(HANDS), toi = a.choix, g = toi === lui ? 'egal' : BEATS[toi] === lui ? 'toi' : 'lui';
    if (g === 'toi') p.score[0]++; else if (g === 'lui') p.score[1]++;
    Object.assign(p, { toi, lui, gagnant: g, phase: 'montre', phase_t: t }); return g;
  }
  if (p.jeu === 'etoiles') {
    const i = int(a.etoile, 0, p.etoiles.length - 1); if (i === null || p.prises.includes(i)) return '';
    const s = p.etoiles[i], e = t - p.t0;
    if (!(s.t - 300 <= e && e <= s.t + 560 / s.v * 1000 + 900)) return '';
    p.prises.push(i); p.score += s.d ? 3 : 1; return 'etoile';
  }
  if (p.jeu === 'simon') {
    const i = int(a.i, 0, SIMON.max), pad = int(a.pad, 0, 3);
    if (p.phase !== 'joue' || pad === null || i !== p.fait || !manche) return '';
    if (p.seq[i] !== pad) { endGame(p, t, p.meilleur < SIMON.start ? 'perdu' : 'fini', p.meilleur); return 'faux'; }
    p.fait++; p.phase_t = t;
    if (p.fait < p.long) return 'ok';
    p.meilleur = p.long;
    if (p.long >= SIMON.max) { endGame(p, t, 'gagne', p.meilleur); return 'gagne'; }
    Object.assign(p, { phase: 'bravo', phase_t: t }); return 'suite';
  }
  return '';
}
function gameTick(p, t, r = RNG) {                    // the phases that end by themselves
  if (!p || p.pause) return '';
  const e = t - p.phase_t, ph = p.phase;
  if (p.etat === 'fin') return e >= END_MS ? 'ferme' : '';
  if (p.jeu === 'cache') {
    if (ph === 'cache' && e >= CACHE.hide) { Object.assign(p, { phase: 'cherche', phase_t: t }); return 'cherche'; }
    if (ph === 'cherche' && e >= CACHE.look) { Object.assign(p, { phase: 'sorti', phase_t: t }); return 'sorti'; }
    if ((ph === 'trouve' || ph === 'sorti') && e >= CACHE.show) {
      if (p.manche >= p.manches) { endGame(p, t, p.trouves >= 2 ? 'gagne' : 'perdu', p.trouves); return 'fin'; }
      Object.assign(p, { manche: p.manche + 1, cachette: r.choice(SPOTS.filter(s => s !== p.cachette)), rates: [], phase: 'cache', phase_t: t }); return 'manche';
    }
  } else if (p.jeu === 'pfc') {
    if (ph === 'choix' && e >= PFC.wait) { endGame(p, t, 'fini', p.score[0]); return 'fin'; }
    if (ph === 'montre' && e >= PFC.show) {
      const [a, b] = p.score;
      if (a >= PFC.points || b >= PFC.points || p.manche >= PFC.manches) { endGame(p, t, a > b ? 'gagne' : b > a ? 'perdu' : 'egal', a); return 'fin'; }
      Object.assign(p, { manche: p.manche + 1, toi: '', lui: '', gagnant: '', phase: 'choix', phase_t: t }); return 'manche';
    }
  } else if (p.jeu === 'etoiles') {
    if (t - p.t0 >= ETOILES.ms) { endGame(p, t, p.score >= p.but ? 'gagne' : 'fini', p.score); return 'fin'; }
  } else if (p.jeu === 'simon') {
    if (ph === 'montre' && e >= p.long * SIMON.step + 300) { Object.assign(p, { phase: 'joue', phase_t: t }); return 'joue'; }
    if (ph === 'joue' && e >= SIMON.wait) { endGame(p, t, p.meilleur ? 'fini' : 'perdu', p.meilleur); return 'fin'; }
    if (ph === 'bravo' && e >= SIMON.gap) { Object.assign(p, { manche: p.manche + 1, long: p.long + 1, fait: 0, phase: 'montre', phase_t: t }); return 'manche'; }
  }
  return '';
}
/* ---- his phrases and the saved state ---- */
function cleanPhrase(s) {                             // pixel/habitudes.py clean_phrase()
  if (typeof s !== 'string') return null;
  s = s.normalize('NFC').replace(/[\u2028\u2029\t\n\r]/g, ' ').replace(/\p{C}/gu, '').replace(/\s+/g, ' ').trim().replace(/^["'«»“”‘’ ]+|["'«»“”‘’ ]+$/g, '').trim();
  if (/:\/\/|www\./i.test(s)) return null;
  s = [...s].slice(0, PHRASE_MAX).join('').trim();
  return /[\p{L}\p{N}]/u.test(s) ? s : null;
}
function sample(list, n) { const a = [...list], out = []; while (a.length && out.length < n) out.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]); return out; }
function defaultState() {
  const aime = sample(Object.keys(RIRES), 4);
  return { horaires: { ...DEFAULT_H }, sautee: '', jeux: { favoris: sample(Object.keys(JEUX), 2), propose: true, records: {}, parties: 0 },
    rires: { aime: Object.keys(RIRES).filter(k => aime.includes(k)) },
    peurs: Object.fromEntries(Object.keys(PEURS).map(k => [k, { on: true, courage: 0, jour: '', gain: 0, vaincue: false }])),
    expressions: Object.fromEntries(Object.keys(MOMENTS).map(k => [k, []])) };
}
const DAY = /^\d{4}-\d{2}-\d{2}$/;
function clean(d) {                                   // pixel/habitudes.py clean(): every bad part takes its default
  const out = defaultState(); if (!isObj(d)) return out;
  out.horaires = cleanHoraires(d.horaires);
  if (typeof d.sautee === 'string' && DAY.test(d.sautee)) out.sautee = d.sautee;
  const j = isObj(d.jeux) ? d.jeux : {};
  let favs = [...new Set((Array.isArray(j.favoris) ? j.favoris : []).filter(x => typeof x === 'string' && JEUX[x]))].slice(0, 2);
  for (const x of [...out.jeux.favoris, ...Object.keys(JEUX)]) if (favs.length < 2 && !favs.includes(x)) favs.push(x);
  out.jeux.favoris = favs;
  if (typeof j.propose === 'boolean') out.jeux.propose = j.propose;
  const rec = isObj(j.records) ? j.records : {};
  out.jeux.records = Object.fromEntries(Object.keys(JEUX).map(k => [k, int(rec[k], 0, 1e6)]).filter(([, v]) => v));
  out.jeux.parties = int(j.parties, 0, 1e9) || 0;
  const r = isObj(d.rires) ? d.rires : {};
  if (Array.isArray(r.aime)) out.rires.aime = Object.keys(RIRES).filter(k => r.aime.includes(k));
  const p = isObj(d.peurs) ? d.peurs : {};
  for (const k of Object.keys(PEURS)) {
    const x = isObj(p[k]) ? p[k] : {}, o = out.peurs[k];
    if (typeof x.on === 'boolean') o.on = x.on;
    o.courage = int(x.courage, 0, 100) || 0;
    if (typeof x.jour === 'string' && DAY.test(x.jour)) { o.jour = x.jour; o.gain = int(x.gain, 0, COURAGE_DAY) || 0; }
    o.vaincue = x.vaincue === true && o.courage >= 100;
  }
  const e = isObj(d.expressions) ? d.expressions : {};
  for (const m of Object.keys(MOMENTS)) {
    const seen = new Set(), keep = [];
    for (const s of Array.isArray(e[m]) ? e[m] : []) { const c = cleanPhrase(s); if (c && !seen.has(c.toLowerCase())) { seen.add(c.toLowerCase()); keep.push(c); } }
    out.expressions[m] = keep.slice(0, PHRASES_MAX);
  }
  return out;
}
function migrate(car) {                               // pixel/habitudes.py migrate(): caractère's old quiet hours
  const q = isObj(car) && isObj(car.calme) ? car.calme : null; if (!q) return null;
  const de = int(q.de, 0, 23), a = int(q.a, 0, 23);
  if (de === null || a === null || (de === 23 && a === 6)) return null;
  if (de === a) return { ...DEFAULT_H, actif: false };
  const h = { ...DEFAULT_H, coucher: de * 60, reveil: a * 60 };
  return problem(h) ? null : h;
}
/* his night for the other features, one rule (pixel/habitudes.py sommeil(), calme(), endormi()): by his schedule, from his
   bedtime routine to his wake-up and during his nap (sieste false: not his nap, his pyjama); with it off or paused (the lab,
   the demo) or no habits, the old quiet hours (caractère calme, 23 h - 6 h by default). A stand-in without its schedule
   ({dort}, {nuit}, {etat}) says it as it is. sommeil: true / false, or null (his schedule says nothing) */
function sommeil(h, sieste = true) {
  if (!isObj(h)) return null;
  const on = e => e === 'coucher' || e === 'nuit' || (sieste && e === 'sieste');
  if (isObj(h.horaires) || isObj(h.horloge)) return !isObj(h.horaires) || h.horaires.actif === false || (isObj(h.horloge) && h.horloge.pause === true) ? null : on(h.etat);
  if (!sieste && typeof h.nuit === 'boolean') return h.nuit || h.etat === 'coucher';
  if (typeof h.dort === 'boolean') return h.dort || h.etat === 'coucher';
  return typeof h.etat === 'string' ? on(h.etat) : null;
}
function calme(heure, q) {
  q = isObj(q) ? q : {}; const de = int(q.de, 0, 23) ?? 23, a = int(q.a, 0, 23) ?? 6;
  return de === a ? false : de > a ? heure >= de || heure < a : heure >= de && heure < a;
}
function endormi(S, heure, sieste = true) {
  const v = sommeil(isObj(S) ? S.habitudes : null, sieste); if (v !== null) return v;
  return calme(heure, isObj(S) && isObj(S.caractere) ? S.caractere.calme : null);
}
/* ---- typed commands: pixel/habitudes.py command(), word for word ---- */
const SEP = '\\s*(?:[:,–—-]\\s*)?', MW = "(bonjour|bonne\\s+nuit|merci|au\\s+revoir|bravo|salut|j['’]ai\\s+faim)";
const TEACH = [
  [new RegExp('^dis\\s+' + MW + '\\s+comme\\s+(?:ça|ca)' + SEP + '(.+)$', 'iu'), null],
  [new RegExp('^(?:pour\\s+dire|quand\\s+tu\\s+(?:dis|veux\\s+dire))\\s+' + MW + '\\s*,?\\s*dis' + SEP + '(.+)$', 'iu'), null],
  [new RegExp('^quand\\s+tu\\s+es\\s+(?:content|contente|heureux|heureuse)\\s*,?\\s*dis' + SEP + '(.+)$', 'iu'), 'content'],
  [new RegExp('^quand\\s+tu\\s+as\\s+faim\\s*,?\\s*dis' + SEP + '(.+)$', 'iu'), 'faim'],
  [new RegExp('^(?:quand\\s+tu\\s+salues|pour\\s+saluer|quand\\s+tu\\s+te\\s+r[ée]veilles)\\s*,?\\s*dis' + SEP + '(.+)$', 'iu'), 'bonjour'],
  [new RegExp('^(?:quand\\s+tu\\s+(?:vas\\s+te\\s+coucher|te\\s+couches|vas\\s+dormir))\\s*,?\\s*dis' + SEP + '(.+)$', 'iu'), 'bonne-nuit'],
  [new RegExp("^(?:quand\\s+tu\\s+(?:pars|t['’]en\\s+vas))\\s*,?\\s*dis" + SEP + '(.+)$', 'iu'), 'au-revoir'],
  [new RegExp('^(?:quand\\s+(?:je|on)\\s+gagne)\\s*,?\\s*dis' + SEP + '(.+)$', 'iu'), 'bravo'],
];
const WORD_MOMENT = { bonjour: 'bonjour', salut: 'bonjour', 'bonne nuit': 'bonne-nuit', merci: 'merci', 'au revoir': 'au-revoir', bravo: 'bravo', "j'ai faim": 'faim' };
function teachParse(raw) {                            // [moment, phrase] when raw teaches him a phrase (as typed), else null
  raw = String(raw ?? '').trim();
  for (const [rx, moment] of TEACH) {
    const m = rx.exec(raw); if (!m) continue;
    const mo = moment || WORD_MOMENT[norm(m[1])], phrase = moment ? m[1] : m[2];
    return mo && cleanPhrase(phrase) ? [mo, phrase] : null;
  }
  return null;
}
const GAME_WORDS = { 'cache-cache': 'cache', 'cache cache': 'cache', 'pierre feuille ciseaux': 'pfc', 'pierre-feuille-ciseaux': 'pfc', 'pierre, feuille, ciseaux': 'pfc',
  chifoumi: 'pfc', shifumi: 'pfc', 'attrape les etoiles': 'etoiles', 'attrape-etoiles': 'etoiles', 'attrape etoiles': 'etoiles', 'attrape-etoile': 'etoiles',
  simon: 'simon', 'jeu de simon': 'simon', 'le jeu de simon': 'simon' };
const RX = {
  play: /^(?:on joue|tu veux jouer|joue avec moi|jouons|on fait un jeu|un jeu|on fait une partie|on va jouer|viens jouer)(?: avec moi)?$/,
  playX: /^(?:on joue|jouons|joue|on fait un|on fait une partie de|une partie de|on va jouer|tu veux jouer) (?:a |au |aux )?(.+)$/,
  joke: /^(?:(?:raconte|dis|fais) une (?:autre |petite )?blague|une blague|encore une blague|une autre blague)$/,   // « raconte-moi une blague »: Claude's
  grimace: /^(?:fais|fait)(?:-moi| moi)? (?:une|la|des) grimaces?$|^une grimace$/,
  bruit: /^(?:fais|fait)(?:-moi| moi)? (?:un|des) bruits? (?:rigolos?|droles?|marrants?)$|^un bruit (?:rigolo|drole|marrant)$/,
  stop: /^(?:stop|arrete|arreter|fini|stop le jeu|arrete le jeu|arrete de jouer|on arrete de jouer|j'arrete de jouer|fin du jeu)$/,
  again: /^(?:on rejoue|rejoue|rejouons|encore une partie|une autre partie|on refait une partie)$/,
  horaires: /^(?:ton emploi du temps|tes horaires|a quelle heure tu te couches|a quelle heure tu te reveilles|tu te couches a quelle heure|tu te reveilles a quelle heure)$/,
  list: /^(?:tes expressions|tes phrases|quelles sont tes phrases|quelles sont tes expressions)$/,
  forgetAll: /^oublie (?:tes phrases|tes expressions|toutes tes phrases)$/,
  forget: /^oublie (?:ta|tes) phrases? (?:de |pour (?:dire )?)(bonjour|bonne nuit|merci|au revoir|bravo|quand tu es content|quand tu as faim)$/,
  set: /^(?:couche-toi|tu te coucheras|tu te couches|coucher|au lit) a (\d{1,2})\s*(?:h|heures?|:)\s*(\d{2})?$|^(reveille-toi|tu te reveilleras|tu te reveilles|reveil|debout) a (\d{1,2})\s*(?:h|heures?|:)\s*(\d{2})?$/,
  nap: /^(?:fais (?:la|ta) sieste|sieste) a (\d{1,2})\s*(?:h|heures?|:)\s*(\d{2})?$/,
  noNap: /^(?:pas de sieste|plus de sieste|arrete la sieste)$/,
  wake: /^(?:reveille-toi|reveille toi|debout|reveille-toi pixel|debout pixel)$/,
};

/* ---------- the in-page server: Pixel Lab and Pixel sans Pi (lab/demo-hub.js calls hub()) ----------
   The same state, actions and commands as pixel/habitudes.py. In the lab his clock is paused (he is awake whatever the
   hour, as the --demo server) until habitudes.demo simulates a time of day; Pixel sans Pi lives by the phone's real clock.
   Kept in this browser (pixel_lab_habitudes) like the server's habitudes.json, and by local.js (restorable). */
function hub(o) {
  const { S, A, toast } = o, LOCAL = !!o.local, KEY = 'pixel_lab_habitudes';
  let kept = null; try { kept = JSON.parse(localStorage.getItem(KEY)); } catch { kept = null; }
  const H = { S: clean(kept || {}), decalage: LOCAL ? 0 : null, partie: null, last: null, ev: null, rire: null, peur: null, phrase: null,
    id: (Date.now() % 1e6) * 10, nev: 0, lastTick: null, lastEtat: null, pubEtat: null, bedKey: null, bedDone: new Set(), storm: false, stormNext: 0, touched: !!kept };
  if (!kept) { const m = migrate(S.caractere); if (m) H.S.horaires = m; }
  const keep = () => { H.touched = true; try { localStorage.setItem(KEY, JSON.stringify(H.S)); } catch { /* private mode */ } };
  const clockNow = () => Date.now() + (H.decalage || 0);
  const etat = () => (H.decalage === null ? ['eveille', null, null, null] : etatAt(H.S.horaires, new Date(clockNow()), H.S.sautee));
  const ev = (kind, x = {}) => { H.ev = { id: ++H.nev, kind, t0: Date.now(), ...x }; };   // numbered for good (the lab's clock jumps reset H.ev)
  function publish() {
    const [e, since, until, nxt] = etat(), d = H.decalage || 0, St = H.S;
    S.habitudes = { horaires: copy(St.horaires), etat: e, dort: e === 'nuit' || e === 'sieste', nuit: e === 'nuit', depuis: since ? since.getTime() - d : 0,
      prochain: until ? { etat: nxt, t: until.getTime() - d } : null, sautee: St.sautee, horloge: { decalage: Math.round(d), pause: H.decalage === null },
      ev: H.ev, jeux: copy(St.jeux), partie: H.partie ? copy(H.partie) : null, rires: { aime: [...St.rires.aime] }, rire: H.rire,
      peurs: Object.fromEntries(Object.entries(St.peurs).map(([k, v]) => [k, { on: v.on, courage: v.courage }])), peur: H.peur,
      expressions: copy(St.expressions), phrase: H.phrase };
    H.pubEtat = e;
  }
  const castOn = () => { const c = S.cast; return !!(c && c.id && (!c.until || c.until > Date.now())); };
  const gameEv = what => { const p = H.partie; if (p && what) p.ev = { n: ((p.ev && p.ev.n) || 0) + 1, kind: what }; };
  function gameOver() {
    const p = H.partie, St = H.S, res = p.fin.resultat, score = p.fin.score, rec = St.jeux.records;
    if (['etoiles', 'simon', 'cache'].includes(p.jeu) && Number.isInteger(score) && score > (rec[p.jeu] || 0)) { rec[p.jeu] = score; p.fin.record = true; }
    if (p.jeu === 'pfc' && res === 'gagne') rec.pfc = (rec.pfc || 0) + 1;
    St.jeux.parties++; p.fin.rit = res === 'perdu' && St.rires.aime.includes('gagner'); keep();
  }
  function gameTick0(t) {
    const p = H.partie;
    if (castOn() || (S.exos && S.exos.cur)) { if (!p.pause) { p.pause = t; return true; } return false; }   // a cast or an exercise: it waits
    if (p.pause) { const d = t - p.pause; p.pause = 0; p.t0 += d; p.phase_t += d; if (p.fin) p.fin.t += d; return true; }
    const what = gameTick(p, t); gameEv(what);
    if (what === 'ferme') { H.last = { jeu: p.jeu, t }; H.partie = null; return true; }
    if (what === 'fin') gameOver();
    return !!what;
  }
  const awake = () => ['eveille', 'reveil'].includes(etat()[0]);
  function fear(kind) {
    if (!PEURS[kind] || !H.S.peurs[kind].on) return false;
    H.peur = { id: ((H.peur && H.peur.id) || 0) + 1, kind, t0: Date.now(), courage: H.S.peurs[kind].courage }; return true;
  }
  function storm() {                                  // pixel/habitudes.py _storm(): the weather this page knows
    const w = S.weather, kind = isObj(w) && isObj(w.now) ? w.now.kind : null;
    if (kind !== 'orage') { H.storm = false; return false; }
    const t = Date.now() / 1000; if (!H.storm) { H.storm = true; H.stormNext = t; }
    if (t < H.stormNext || !awake() || !H.S.peurs.orage.on || H.partie) return false;
    H.stormNext = t + STORM_GAP[0] + Math.random() * (STORM_GAP[1] - STORM_GAP[0]);
    return fear('orage');
  }
  function tick() {
    const [e, since, until] = etat(), now = Date.now() / 1000;
    const live = H.lastTick !== null && now - H.lastTick >= 0 && now - H.lastTick < EV_FRESH, before = H.lastEtat;
    H.lastTick = now; H.lastEtat = e;
    const n0 = H.nev;
    if (before !== null && e !== before && live) {
      if (e === 'reveil') ev('reveil'); else if (e === 'sieste') ev('sieste'); else if (before === 'sieste' && e === 'eveille') ev('fin-sieste');
      else if (e === 'coucher') ev('annonce'); else if (e === 'nuit') ev('dodo');
    }
    if (e === 'coucher' && live && until) {               // each step once a bedtime, even after a « pas maintenant »
      if (H.bedKey !== since.getTime()) { H.bedKey = since.getTime(); H.bedDone = new Set(); }
      const left = (until.getTime() - clockNow()) / 60000, n = H.S.peurs.noir;
      if (!H.bedDone.has('dents') && left > VEILLEUSE_MIN && left <= DENTS_MIN) { H.bedDone.add('dents'); ev('dents'); }
      else if (!H.bedDone.has('veilleuse') && left <= VEILLEUSE_MIN && n.on && n.courage < 100) { H.bedDone.add('veilleuse'); ev('veilleuse'); }
    }
    let moved = H.partie ? gameTick0(Date.now()) : false;
    moved = storm() || moved;
    if (e !== H.pubEtat || H.nev !== n0 || moved) { publish(); o.mark(); }
  }
  setInterval(tick, 1000);
  function setHoraires(args) {                        // pixel/habitudes.py set_horaires()
    const h = copy(H.S.horaires);
    if (typeof args.actif === 'boolean') h.actif = args.actif;
    for (const k of ['reveil', 'coucher']) if (args[k] !== undefined && args[k] !== null) { const v = toMin(args[k]); if (v === null) return 'Je n’ai pas compris cette heure.'; h[k] = v; }
    if ('sieste' in args) {
      let s = args.sieste;
      if (s === null || s === false || s === '' || s === 'non') h.sieste = null;
      else {
        const base = h.sieste || { de: 13 * 60 + 30, duree: 60 }; s = isObj(s) ? s : { de: s };
        const de = 'de' in s ? toMin(s.de) : base.de, d = 'duree' in s ? int(s.duree, NAP_MIN, NAP_MAX) : base.duree;
        if (de === null || d === null) return 'Je n’ai pas compris cette sieste.';
        h.sieste = { de, duree: d };
      }
    }
    if ('weekend' in args) {
      let w = args.weekend;
      if (w === null || w === false || w === '' || w === 'non') h.weekend = null;
      else {
        const base = h.weekend || { reveil: mod(h.reveil + 90, 1440), coucher: mod(h.coucher + 30, 1440) }; w = isObj(w) ? w : {};
        const r = 'reveil' in w ? toMin(w.reveil) : base.reveil, c = 'coucher' in w ? toMin(w.coucher) : base.coucher;
        if (r === null || c === null) return 'Je n’ai pas compris ces horaires du week-end.';
        h.weekend = { reveil: r, coucher: c };
      }
    }
    const why = problem(h); if (why) return why;
    if (JSON.stringify(h) !== JSON.stringify(H.S.horaires)) { H.S.horaires = h; keep(); }
    return '';
  }
  const pasMaintenant = (e, quoi = 'jeu') => ev('pas-maintenant', { etat: e, quoi });   // quoi: jeu, blague, reveil (he mumbles)
  function start(jeu, par) {
    if (jeu === 'au-choix' || !JEUX[jeu]) jeu = RNG.choice(H.S.jeux.favoris);
    const e = etat()[0];
    if (['nuit', 'sieste', 'coucher'].includes(e)) { pasMaintenant(e); return { nuit: 'Chut… il dort. On jouera demain !', sieste: 'Chut… il fait la sieste. On jouera après !', coucher: 'C’est bientôt l’heure du dodo : on jouera demain !' }[e]; }
    if (S.exos && S.exos.cur) return 'Termine ton exo d’abord !';
    if (castOn()) return 'Attends la fin de ce qui s’affiche sur son écran.';
    const v = isObj(S.amis) && isObj(S.amis.visite) ? S.amis.visite : null;   // a friend's visit (lab/amis-lab.js): no game over it, nor while he is away
    if (v) { const nom = typeof v.nom === 'string' && v.nom ? v.nom : 'mon ami'; return v.sens !== 'sortie' ? `Pas maintenant : ${nom} est là !` : `Je suis chez ${nom} : on jouera à mon retour !`; }
    if (H.partie && H.partie.etat === 'joue') return 'Une partie est déjà en cours : touche × pour l’arrêter.';   // one at a time
    H.partie = newGame(jeu, Date.now(), ++H.id, H.S.jeux.favoris.includes(jeu), par);
    S.anim = null; S.screen = 'visage'; return '';
  }
  function laugh(kind) {
    const e = etat()[0];
    if (e === 'nuit' || e === 'sieste') { pasMaintenant(e, 'blague'); return 'Chut… il dort.'; }
    const n0 = kind === 'blague' ? ((window.PixelHabitudesPack || {}).blagues || []).length || 1 : kind === 'bruit' ? BRUITS : 6;
    let n = Math.floor(Math.random() * n0);
    if (kind === 'blague' && H.rire && H.rire.kind === 'blague' && n0 > 1) while (n === H.rire.n) n = Math.floor(Math.random() * n0);
    const aime = H.S.rires.aime.includes({ blague: 'blagues', grimace: 'grimaces', bruit: 'bruits' }[kind]);
    H.rire = { id: ((H.rire && H.rire.id) || 0) + 1, kind, n, aime, t0: Date.now() }; S.anim = null; S.screen = 'visage'; return '';
  }
  function comfort(kind) {
    if (!PEURS[kind]) return false;
    const p = H.S.peurs[kind], day = ymd(new Date(clockNow()));
    if (p.jour !== day) { p.jour = day; p.gain = 0; }
    const step = Math.min(COURAGE_STEP, COURAGE_DAY - p.gain, 100 - p.courage); if (step <= 0) return false;
    p.courage += step; p.gain += step; if (p.courage >= 100) p.vaincue = true; keep(); return true;
  }
  function teach(moment, phrase) {
    if (!MOMENTS[moment]) return [false, 'Je ne connais pas ce moment.'];
    const c = cleanPhrase(phrase); if (!c) return [false, 'Je n’ai pas compris la phrase.'];
    H.S.expressions[moment] = [c, ...H.S.expressions[moment].filter(x => x.toLowerCase() !== c.toLowerCase())].slice(0, PHRASES_MAX); keep();
    H.phrase = { id: ((H.phrase && H.phrase.id) || 0) + 1, kind: 'appris', moment, texte: c, t0: Date.now() }; S.anim = null; S.screen = 'visage'; return [true, c];
  }
  const done = why => { if (why) toast(why, 5000); publish(); };
  Object.assign(A, {
    'habitudes.horaires': (a = {}) => done(setHoraires(Object.fromEntries(Object.entries(a).filter(([k]) => ['actif', 'reveil', 'coucher', 'sieste', 'weekend'].includes(k))))),
    'habitudes.reveiller': () => { const e = etat()[0]; if (e === 'sieste') { H.S.sautee = ymd(new Date(clockNow())); keep(); } else if (e === 'nuit') pasMaintenant('nuit', 'reveil'); done(); },
    'habitudes.jouer': ({ jeu = 'au-choix', par = '' } = {}) => done(start(String(jeu), String(par).slice(0, 20))),
    'habitudes.coup': (a = {}) => {
      if (!H.partie) return; const what = gameMove(H.partie, a, Date.now());
      if (H.partie.etat === 'fin' && (what === 'faux' || what === 'gagne')) gameOver();
      gameEv(what); if (what) done();
    },
    'habitudes.stop': () => { if (H.partie) { if (H.partie.etat === 'joue') endGame(H.partie, Date.now(), 'stop', null); H.last = { jeu: H.partie.jeu, t: Date.now() }; H.partie = null; } done(); },
    'habitudes.favori': ({ jeu = '' } = {}) => { const f = H.S.jeux.favoris; if (JEUX[jeu] && !f.includes(jeu)) { H.S.jeux.favoris = [f[1], jeu]; keep(); } done(); },
    'habitudes.propose': ({ on = true } = {}) => { H.S.jeux.propose = !!on; keep(); done(); },
    'habitudes.rire': ({ kind = 'blague' } = {}) => done(['blague', 'grimace', 'bruit'].includes(kind) ? laugh(kind) : ''),
    'habitudes.rires': ({ aime = null, kind = null, on = null } = {}) => {
      let cur = H.S.rires.aime;
      if (Array.isArray(aime)) cur = Object.keys(RIRES).filter(k => aime.includes(k));
      else if (RIRES[kind] && typeof on === 'boolean') cur = Object.keys(RIRES).filter(k => (cur.includes(k) && k !== kind) || (k === kind && on));
      H.S.rires.aime = cur; keep(); done();
    },
    'habitudes.peurs': ({ peur = '', on = null } = {}) => { if (PEURS[peur] && typeof on === 'boolean') { H.S.peurs[peur].on = on; keep(); } done(); },
    'habitudes.rassure': ({ peur = '' } = {}) => { if (comfort(String(peur))) done(); },
    'habitudes.peur': ({ kind = '' } = {}) => { if (!LOCAL && fear(String(kind))) done(); },
    'habitudes.apprendre': ({ moment = '', phrase = '' } = {}) => { const [ok, what] = teach(String(moment), typeof phrase === 'string' ? phrase : ''); done(ok ? '' : what); },
    'habitudes.oublier': ({ moment = '', phrase = null } = {}) => {
      const lst = H.S.expressions[moment]; if (!lst) return;
      const keepL = typeof phrase === 'string' ? lst.filter(x => x !== phrase) : [];
      if (keepL.length !== lst.length) { H.S.expressions[moment] = keepL; keep(); done(); }
    },
    'habitudes.dire': ({ moment = '', phrase = '' } = {}) => {
      if (!(H.S.expressions[moment] || []).includes(phrase)) return;
      H.phrase = { id: ((H.phrase && H.phrase.id) || 0) + 1, kind: 'dit', moment, texte: phrase, t0: Date.now() }; S.anim = null; S.screen = 'visage'; done();
    },
    'habitudes.demo': ({ heure = null, avant = 0 } = {}) => {   // the lab only: a simulated time of day (avant: s before it), or null: paused
      if (LOCAL) return;
      const m = heure === null ? null : toMin(heure);
      if (m === null) H.decalage = null;
      else { const n = new Date(); H.decalage = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 0, m).getTime() - (int(avant, 0, 3600) || 0) * 1000 - Date.now(); }
      H.lastTick = H.lastEtat = null; H.ev = null; done();
    },
  });
  function command(raw) {                              // pixel/habitudes.py command(): true when it was one
    raw = String(raw ?? '').slice(0, 2000);
    const t = norm(raw).replace(/\s*[!.?…]+$/, '').trim().replace(/\s+(?:pixel|s'il te plait|stp|svp)$/, '');
    const go = (a, x) => { A[a](x || {}); publish(); return true; };
    const taught = teachParse(raw);
    if (taught) return go('habitudes.apprendre', { moment: taught[0], phrase: taught[1] });
    if (H.partie && RX.stop.test(t)) return go('habitudes.stop');
    if (RX.play.test(t)) return go('habitudes.jouer', { jeu: 'au-choix', par: 'commande' });
    const m = RX.playX.exec(t), jeu = GAME_WORDS[t] || (m ? GAME_WORDS[m[1].trim()] : null);
    if (jeu) return go('habitudes.jouer', { jeu, par: 'commande' });
    if (RX.again.test(t) && H.last && Date.now() - H.last.t < AGAIN_MS) return go('habitudes.jouer', { jeu: H.last.jeu, par: 'commande' });
    if (RX.joke.test(t)) return go('habitudes.rire', { kind: 'blague' });
    if (RX.grimace.test(t)) return go('habitudes.rire', { kind: 'grimace' });
    if (RX.bruit.test(t)) return go('habitudes.rire', { kind: 'bruit' });
    if (RX.horaires.test(t)) { toast(horairesText(H.S.horaires), 8000); return true; }
    if (RX.list.test(t)) {
      const ex = H.S.expressions, n = Object.values(ex).reduce((s, v) => s + v.length, 0);
      toast(!n ? 'Il ne connaît pas encore de phrase à toi. Tape « dis bonjour comme ça : Salut ! ».'
        : `Il connaît ${n} phrase${n > 1 ? 's' : ''} à toi : ${Object.entries(ex).filter(([, v]) => v.length).map(([k, v]) => `${MOMENTS[k].toLowerCase()} (${v.length})`).join(' · ')}. Elles sont dans « Ses habitudes », sur ton téléphone.`, 9000);
      return true;
    }
    if (RX.forgetAll.test(t)) {
      if (!Object.values(H.S.expressions).some(v => v.length)) return false;
      for (const k of Object.keys(MOMENTS)) H.S.expressions[k] = [];
      keep(); publish(); toast('C’est oublié : il reprend ses phrases à lui.', 5000); return true;
    }
    let f = RX.forget.exec(t);
    if (f) {
      const moment = { 'quand tu es content': 'content', 'quand tu as faim': 'faim' }[f[1]] || WORD_MOMENT[f[1]];
      if (!H.S.expressions[moment].length) return false;
      H.S.expressions[moment] = []; keep(); publish(); toast(`C’est oublié : ${MOMENTS[moment].toLowerCase()}, il reprend ses phrases à lui.`, 5000); return true;
    }
    if ((f = RX.set.exec(t))) { const bed = f[1] !== undefined; return go('habitudes.horaires', { [bed ? 'coucher' : 'reveil']: `${+(bed ? f[1] : f[4])}:${(bed ? f[2] : f[5]) || '00'}` }); }
    if ((f = RX.nap.exec(t))) return go('habitudes.horaires', { sieste: { de: `${+f[1]}:${f[2] || '00'}` } });
    if (RX.noNap.test(t)) { if (!H.S.horaires.sieste) return false; return go('habitudes.horaires', { sieste: null }); }
    if (RX.wake.test(t) && ['sieste', 'nuit'].includes(etat()[0])) return go('habitudes.reveiller');
    return false;
  }
  /* Pixel sans Pi (../local.js): what comes back (the phone's copy, his Pi's snapshot) is cleaned, its live parts (a game, an
     event) are not taken back; and caractère's quiet hours, restored after this hub started, are migrated if he had no
     schedule of his own yet */
  if (o.restorable) {
    o.restorable('habitudes', v => { if (!isObj(v)) return; H.S = clean({ ...H.S, ...v, peurs: v.peurs, jeux: v.jeux }); keep(); publish(); });
    const fns = o.restorers ? o.restorers() : {}, car0 = fns.caractere;
    if (car0) o.restorable('caractere', (v, at) => { car0(v, at); if (!H.touched) { const m = migrate(S.caractere); if (m) { H.S.horaires = m; publish(); } } });
  }
  publish();
  return {
    command, publish, state: H,
    isNight: t => (H.decalage === null || !H.S.horaires.actif ? null : etatAt(H.S.horaires, new Date(t + H.decalage))[0] === 'nuit'),   // lab/demo-hub.js: his belly
    awakeHours: (t0, t1, cap) => (H.decalage === null || !H.S.horaires.actif ? null : awakeHours(H.S.horaires, t0 + H.decalage, t1 + H.decalage, cap)),
  };
}
function horairesText(h) {                            // pixel/habitudes.py horaires_text()
  if (!h.actif) return 'Il n’a pas d’emploi du temps : il ne se couche pas tout seul. Règle-le dans « Ses habitudes ».';
  let s = `Il se réveille à ${hm(h.reveil)} et se couche à ${hm(h.coucher)}`;
  if (h.sieste) s += `, avec une sieste à ${hm(h.sieste.de)}`;
  if (h.weekend) s += `. Le week-end : debout à ${hm(h.weekend.reveil)}, au lit à ${hm(h.weekend.coucher)}`;
  return s + '. Change-les dans « Ses habitudes ».';
}
const RULES = { JEUX, RIRES, PEURS, MOMENTS, DEFAULT_H, toMin, hm, problem, cleanHoraires, segments, etatAt, awakeHours, newGame, gameMove, gameTick, cleanPhrase, clean,
  migrate, teachParse, norm, GAME_WORDS, RX, horairesText, SPOTS, HANDS, CACHE, PFC, ETOILES, SIMON, END_MS, sommeil, calme, endormi };

/* ---------- every screen: his night, his routine, the games, his laughs, his fears, his phrases ---------- */
const Sc = typeof Screens !== 'undefined' && Screens && Screens.addon ? Screens : null;
const SCREEN = Sc ? screenSide(Sc) : null;
function screenSide(Sc) {
  const L = Sc.local, PER = Sc.persona, W = 800, HT = 480;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), out = x => 1 - (1 - clamp(x, 0, 1)) ** 3;
  const realNow = () => (window.PixelClock ? window.PixelClock.real() : performance.now());
  let P = null, Hs = null, off = 0, K = null;
  const V = { ev: null, rire: null, peur: null, phrase: null, partie: null, pev: 0, fin: null, sleepNow: false, mine: false, sleptAt: 0, lit: null, hooked: false,
    offre: 'cache', offerAt: -1e12, gameAt: -1e12, spiderAt: -1e12, spiderSeen: false, taps: [], pets: [], lastCalin: -1e9, lastMumble: -1e9, caught: new Map(), flash: null,
    pressed: null, said: null, courage: {}, miss: null };
  const srv = () => Date.now() + off;
  const send = (a, x) => { if (K) K.send(a, x || {}); };
  const event = (name, data) => (Sc.event ? Sc.event(name, data || {}, true) : '');
  const son = name => { const s = window.PixelSon; if (s && s.on) try { s.play(name); } catch (e) { /* his voice must never stop him */ } };
  const group = id => ((PER && PER.scenes.find(s => s.id === id)) || {}).group || '';
  const trait = k => { const v = PER && PER.traits && PER.traits[k]; return typeof v === 'number' && Number.isFinite(v) ? clamp(v, 0, 100) : 50; };
  const game = () => (Hs && Hs.partie) || null;
  const exosOpen = () => !!(window.PixelExos && window.PixelExos.open);
  const visitOn = () => !!(P && P.amis && P.amis.visite);           // a friend here, knocking, or he is away (web/amis.js)
  const asleep = () => !!(Hs && Hs.dort && L.sleepy && L.scr === 'visage' && L.boot < 0);   // asleep by his schedule, on his face screen
  const fearOn = k => !!(Hs && Hs.peurs && Hs.peurs[k] && Hs.peurs[k].on && Hs.peurs[k].courage < 100);

  /* ---- the snapshot (the add-on's state(): every snapshot, before it is drawn) ---- */
  function state(p) {
    const first = !P; P = p; Hs = p.habitudes || null; off = (p.server_now || Date.now()) - Date.now();
    hooks();
    if (!Hs) { panelState(); return; }
    const fresh = t => !first && !!t && srv() - t < 15000;
    const e = Hs.ev;
    if (e && e.id !== V.ev) { V.ev = e.id; if (fresh(e.t0)) routine(e); }
    if (Hs.dort && !V.wasDort) V.sleepNow = true;                  // the page opens at night, or his sleep begins: he sleeps as soon as he is free
    V.wasDort = !!Hs.dort;
    if (!Hs.dort && V.mine) { V.mine = false; if (L.sleepy) { L.sleepy = false; L.lastInput = performance.now(); } }
    games(first);
    const r = Hs.rire;
    if (r && r.id !== V.rire) { V.rire = r.id; if (fresh(r.t0)) { event('rire-' + r.kind, { n: r.n, aime: r.aime, fou: r.aime && Math.random() * 100 < 15 + 0.7 * trait('farceur') }); son(r.aime ? 'rire' : 'bip'); } }
    const f = Hs.peur;
    if (f && f.id !== V.peur) { V.peur = f.id; if (fresh(f.t0) && f.kind === 'orage') { event('peur-orage', { courage: f.courage }); son('peur'); } }
    const ph = Hs.phrase;
    if (ph && ph.id !== V.phrase) { V.phrase = ph.id; if (fresh(ph.t0)) { event('habitude-phrase', { kind: ph.kind, texte: ph.texte, moment: ph.moment }); son('bip'); } }
    for (const [k, v] of Object.entries(Hs.peurs || {})) {          // his courage reached 100: he says it, once
      if (!first && V.courage[k] !== undefined && V.courage[k] < 100 && v.courage >= 100) event('peur-rassure', { peur: k, courage: 100, vaincue: true });
      V.courage[k] = v.courage;
    }
    lights(p);
    panelState();
  }
  function routine(e) {                                             // the server's word: his day goes on
    const k = e.kind;
    if (k === 'reveil' || k === 'fin-sieste') { if (V.mine) { L.sleepy = false; V.mine = false; } L.lastInput = performance.now(); }
    if (k === 'reveil') { event('habitude-reveil', {}); son('salut'); }
    else if (k === 'fin-sieste') { event('habitude-sieste', { kind: 'fin' }); son('salut'); }
    else if (k === 'annonce' || k === 'dents' || k === 'veilleuse') { event('habitude-coucher', { kind: k }); son(k === 'annonce' ? 'baille' : 'bip'); }
    else if (k === 'dodo') { event('habitude-coucher', { kind: 'dodo' }); son('baille'); V.sleepNow = true; }
    else if (k === 'sieste') { event('habitude-sieste', { kind: 'debut' }); son('baille'); V.sleepNow = true; }
    else if (k === 'pas-maintenant') { event('habitude-pas-maintenant', { etat: e.etat, quoi: e.quoi }); son('baille'); }
  }
  function games(first) {
    const g = game();
    if (!g) { if (V.partie !== null) V.gameAt = Date.now(); V.partie = null; return; }
    if (g.id !== V.partie) {
      V.partie = g.id; V.pev = (g.ev && g.ev.n) || 0; V.fin = null; V.caught = new Map(); V.miss = null;
      if (!first && srv() - g.t0 < 15000) { event('jeu-debut', { jeu: g.jeu, favori: g.favori }); son(g.favori ? 'youpi' : 'salut'); }
    }
    if (g.ev && g.ev.n !== V.pev) {
      V.pev = g.ev.n;
      const k = g.ev.kind, sc = { trouve: 'trouve', rate: 'rate', sorti: 'sorti', toi: 'toi', lui: 'lui', egal: 'egal', suite: 'suite', faux: 'faux' }[k];
      if (!first && sc) event('jeu-coup', { kind: sc });
      if (!first) son({ trouve: 'youpi', rate: 'rire', sorti: 'coucou', toi: 'youpi', lui: 'rire', egal: 'hmm', suite: 'youpi', faux: 'perdu', etoile: 'bip' }[k]);
    }
    if (g.fin && V.fin !== g.id) {
      V.fin = g.id;
      if (!first && g.fin.resultat !== 'stop') {
        event('jeu-fin', { jeu: g.jeu, resultat: g.fin.resultat, score: g.fin.score, record: !!g.fin.record, rit: !!g.fin.rit });
        son(g.fin.resultat === 'gagne' ? 'danse' : g.fin.rit ? 'rire' : 'salut');
        if (g.fin.resultat === 'gagne' && window.PixelAlbum && window.PixelAlbum.home && typeof window.PixelAlbum.snap === 'function') {   // Pixel's own screen: the Pi's, Pixel sans Pi, Pixel Lab
          setTimeout(() => { try { window.PixelAlbum.snap('jeu'); } catch (e) { /* a photo is a bonus */ } }, 1200);   // a moment worth a photo (souvenirs: « Une partie gagnée », 🎲)
        }
      }
    }
  }
  /* all the lights off (Hue rooms, the Pi's): his fear of the dark while he is awake, played before persona.js's own « Il
     fait tout noir ! » (it gives way to a scene that plays); asleep, he only mumbles; going to bed, he asks for his light */
  function lights(p) {
    const rooms = (p.lights && p.lights.rooms) || [], lit = rooms.length ? rooms.some(r => r.on) : null, was = V.lit;
    V.lit = lit;
    if (was === null || lit === null || was === lit || L.scr !== 'visage' || L.boot >= 0 || Sc.casting || game() || exosOpen()) return;
    const f = (Hs.peurs && Hs.peurs.noir) || { on: false, courage: 0 };
    if (!lit) {
      if (Hs.dort) { event('habitude-dodo', { kind: 'noir' }); return; }
      if (Hs.etat === 'coucher') { event(f.on && f.courage < 100 ? 'habitude-coucher' : 'habitude-dodo', { kind: f.on && f.courage < 100 ? 'veilleuse' : 'noir' }); return; }
      event('peur-noir', f.on ? { courage: f.courage } : { off: true });
      if (f.on && f.courage < 70) son('peur');
    } else if (Hs.dort) event('habitude-dodo', { kind: 'lumiere' });
    else if (PER && /^peur-noir/.test(PER.state.cur || '')) PER.stop();     // the light is back: « Ah, la lumière ! » (persona.js)
  }

  /* ---- persona.js hooks: his quiet hours follow his schedule, the world waits during a game or his sleep, his phrases ---- */
  function hooks() {
    if (V.hooked || !PER || typeof PER.hook !== 'function') return;
    V.hooked = true;
    PER.hook('night', nightAt); PER.hook('gate', gate); PER.hook('lines', ownLines);
  }
  function schedNow() { return new Date(Date.now() + off + ((Hs && Hs.horloge && Hs.horloge.decalage) || 0)); }
  function nightAt(h) {                                             // quiet hours: not awake by his schedule (undefined: the old ones)
    if (!Hs || !Hs.horaires || !Hs.horaires.actif || (Hs.horloge && Hs.horloge.pause)) return undefined;
    const now = schedNow(), d = h === new Date().getHours() ? now : new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, 30);
    return etatAt(Hs.horaires, d, Hs.sautee)[0] !== 'eveille';
  }
  const WORLD = new Set(['notif', 'weather', 'lights-change', 'action', 'typing', 'codex-start', 'codex-ok', 'codex-fail', 'nourrir-faim']);
  function gate(name, data) {                                       // false: the event does not reach him
    if (name === 'action' && data && /^habitudes\./.test(data.name || '')) return false;   // his own habits: his own scenes answer them
    return !(WORLD.has(name) && (game() || asleep()));
  }
  /* his phrases: a scene's line he may say his own way (moment, index of its line in the scene's say) */
  const USE = { bonjour: { coucou: 0, retour: 0, bonjour: 0, 'habitude-reveil': 1 }, 'bonne-nuit': { 'habitude-dodo': 0 }, content: { content: 0, saut: 0, joie: 0, 'jeu-prefere': 1 },
    merci: { 'nourrir-miam': 2, 'nourrir-aime': 2, 'peur-rassure': 0 }, 'au-revoir': { 'poche-part': 0, 'poche-rentre': 0 }, bravo: { 'exo-bravo': 0, 'exo-fier': 0, 'jeu-gagne': 0 },
    faim: { faim: 0, 'nourrir-creux': 0, 'nourrir-affame': 1 } };
  const BY_SCENE = {}; for (const [m, x] of Object.entries(USE)) for (const [id, i] of Object.entries(x)) BY_SCENE[id] = [m, i];
  const PHRASE_P = 0.4;
  function ownLines(sc, lines) {
    const u = BY_SCENE[sc.id], list = u && Hs && Hs.expressions && Hs.expressions[u[0]];
    if (!list || !list.length || (V.forceLine ? false : Math.random() >= PHRASE_P)) return;
    const i = u[1], l = lines[i]; if (!l || !l[2]) return;
    const span = l[1] - l[0], fit = list.filter(x => x.length <= 38 || span >= 3000), pool = fit.length ? fit : null; if (!pool) return;
    const text = pool[Math.floor(Math.random() * pool.length)], half = (window.PixelHabitudesPack || {}).half;
    V.said = { scene: sc.id, moment: u[0], texte: text };
    if (text.length <= 38 || !half) { l[2] = text; return; }
    const mid = Math.round((l[0] + l[1]) / 2);                     // a long one: two bubbles, one after the other
    lines.splice(i, 1, [l[0], mid, half(text, 0).replace(/^« /, '')], [mid, l[1], half(text, 1).replace(/ »$/, '')]);
  }

  /* ---- his sleep: on his face screen, by his schedule (the night, his nap) ---- */
  const DOZE_MS = 60000;                                            // touched at night, he sleeps again a minute later
  setInterval(() => {
    if (!Hs || !P) return;
    if (PER && PER.state.cur === 'peur-araignee' && !V.spiderSeen) { V.spiderSeen = true; V.spiderAt = Date.now(); }
    if (PER && PER.state.cur !== 'peur-araignee') V.spiderSeen = false;
    const busy = !!game() || exosOpen() || visitOn() || Sc.casting || L.boot >= 0;   // a friend's visit ends first when he falls asleep (pixel/amis.py)
    if (!Hs.dort || busy || L.scr !== 'visage') {
      if (V.mine) {                                                 // his sleep is his face screen's: another screen's keys work at once
        if (L.sleepy) L.sleepy = false;
        if (Hs.dort && !busy) V.sleepNow = true; else V.mine = false;   // back on his face at night: asleep again
      }
      return;
    }
    if (L.sleepy) { V.sleepNow = false; return; }
    const cur = PER && PER.state.cur, idle = performance.now() - L.lastInput;
    if (V.played && cur !== V.played) V.played = null;
    if ((V.sleepNow || idle > DOZE_MS) && (!cur || (group(cur) === 'vie' && cur !== V.played)) && !Sc.menuOpen) {   // a scene asked for (« fais le poisson ») plays to its end
      if (PER && cur) PER.stop();
      L.sleepy = true; V.mine = true; V.sleepNow = false; V.sleptAt = performance.now(); L.local = null; L.pack = null; L.dirty = true;
    }
  }, 250);
  /* a touch while he sleeps by his schedule: on his face, he mumbles (or smiles at a cuddle) and sleeps on; anything else
     (a key, the command bar, a swipe for the quick menu or another screen) works as usual and leaves him asleep */
  const cv = typeof document !== 'undefined' ? document.getElementById('crt') : null, T = { down: null };
  if (cv) {
    addEventListener('pointerdown', e => { T.down = e.target === cv ? { x: e.clientX, y: e.clientY, t: performance.now(), up: 0, ux: e.clientX, uy: e.clientY, petted: false } : null; }, true);
    addEventListener('pointerup', e => { const d = T.down; if (d && !d.up) { d.up = performance.now(); d.ux = e.clientX; d.uy = e.clientY; } }, true);
  }
  function touchKind() {
    const d = T.down, t = performance.now();
    if (!d) return 'other';
    if (!d.up) return t - d.t >= 450 && t - d.t < 4000 ? 'press' : 'other';   // a long press (Pixel de poche): a cuddle
    if (t - d.up > 1500) return 'other';                            // an old touch: this is something else (a key, the command bar)
    if (d.held || d.petted) return 'petted';                        // the release of a long press or of a stroke: nothing more
    if (d.up - d.t > 4000) return 'other';
    const a = Sc.toCanvas({ clientX: d.x, clientY: d.y }), b = Sc.toCanvas({ clientX: d.ux, clientY: d.uy }), dx = b.x - a.x, dy = b.y - a.y;
    if ((Math.abs(dy) > 90 && Math.abs(dy) > 1.5 * Math.abs(dx)) || (Math.abs(dx) > 90 && Math.abs(dx) > 2 * Math.abs(dy))) return 'other';   // a swipe (app.js)
    return Math.abs(a.x - 400) < 330 && a.y > 40 && a.y < 430 ? 'tap' : 'other';
  }
  const in0 = Sc.input;
  Sc.input = () => {
    if (!asleep()) return in0();
    const k = touchKind();
    L.lastInput = performance.now(); L.inputAt = realNow();
    if (k === 'petted') return true;
    if (k === 'tap') { mumble(); return true; }
    if (k === 'press') { if (T.down) T.down.held = true; cuddle(); return true; }
    return false;
  };
  const hit0 = Sc.hit;                                              // what reaches the touch zones while he sleeps is no tap (his taps mumble above):
  Sc.hit = (x, y) => (asleep() && !Sc.menuOpen ? undefined : hit0(x, y));   // a swipe up (no food tray at night) or a stray one leaves him asleep
  function mumble() {
    const t = performance.now(); if (t - V.lastMumble < 900) return;
    V.lastMumble = t; event('habitude-dodo', { kind: 'marmonne', etat: Hs.etat }); son('baille');
  }
  function cuddle() {
    const t = performance.now(); if (t - V.lastCalin < 2600) return;
    V.lastCalin = t; event('habitude-dodo', { kind: 'calin' }); son('ronron');
  }
  /* touch and petting: the tickles, comforting him, the spider */
  const FEAR_OF = { 'peur-orage': 'orage', 'peur-noir': 'noir', 'peur-vide': 'vide', 'peur-araignee': 'araignees' };
  const ticklish = () => !!(Hs && Hs.rires && Hs.rires.aime.includes('chatouilles'));
  function tickle() {
    V.taps = []; V.pets = [];
    event('rire-chatouilles', { fou: Math.random() * 100 < 15 + 0.7 * trait('farceur') }); son('rire');
  }
  function comfort(kind) {
    const c = (Hs && Hs.peurs && Hs.peurs[kind] && Hs.peurs[kind].courage) || 0;
    event('peur-rassure', { peur: kind, courage: Math.min(100, c + 10) }); son('bisou');
    send('habitudes.rassure', { peur: kind });
  }
  function spiderHit(p) {
    const PKG = window.PixelHabitudesPack || {}, e = PER.current().e || 0, s = PKG.araignee ? PKG.araignee(e) : null;
    if (!s || s.gone || e < 600) return false;
    if (Math.hypot(p.x - s.x, p.y - s.y) > 85) return false;
    PKG.spiderLast = { x: s.x, y: s.y };
    event('peur-araignee', {}); son('youpi'); send('habitudes.rassure', { peur: 'araignees' });
    return true;
  }
  if (PER) {
    const tap0 = PER.tap, pet0 = PER.pet, play0 = PER.play;
    PER.play = (id, o) => { V.played = id; return play0(id, o); };  // asked for (a command, the lab): his sleep waits for its end
    PER.tap = (p, box, ctx) => {
      if (asleep()) { mumble(); return true; }
      const cur = PER.state.cur;
      if (cur === 'peur-araignee' && p) { if (spiderHit(p)) return true; if ((PER.current().e || 0) < 8000) return true; }   // missed: the spider is still there
      if (ticklish()) {
        const t = performance.now(); V.taps = V.taps.filter(x => t - x < 1300); V.taps.push(t);
        if (/^rire-(chatouilles|fou)$/.test(cur || '')) return true;          // he is laughing already: more of it
        if (V.taps.length >= 3) { tickle(); return true; }
      }
      return tap0(p, box, ctx);
    };
    PER.pet = () => {
      if (asleep()) { if (T.down) T.down.petted = true; cuddle(); return true; }
      const cur = PER.state.cur, f = FEAR_OF[cur];
      if (f) { comfort(f); return true; }
      if (cur === 'peur-rassure' || cur === 'peur-vaincue') return true;      // he is being comforted: he enjoys it
      if (ticklish()) {
        const t = performance.now(); V.pets = V.pets.filter(x => t - x < 1500); V.pets.push(t);
        if (/^rire-(chatouilles|fou)$/.test(cur || '')) return true;
        if (V.pets.length >= 3) { tickle(); return true; }
      }
      return pet0();
    };
  }
  /* the void (Pixel de poche): the phone level again for a moment while he is dizzy comforts him */
  let levelSince = 0;
  setInterval(() => {
    if (!PER || PER.state.cur !== 'peur-vide') { levelSince = 0; return; }
    const lean = L.lean, flat = !lean || (Math.abs(lean.x || 0) < 8 && Math.abs(lean.r || 0) < 0.03);
    if (!flat || (PER.current().e || 0) < 1500) { levelSince = 0; return; }
    if (!levelSince) levelSince = performance.now();
    else if (performance.now() - levelSince > 900) { levelSince = 0; comfort('vide'); }
  }, 200);

  /* ---- his offers: a game when he is bored (web/scenes/habitudes.js jeu-envie), a spider now and then ---- */
  function canPropose(c) {
    if (!Hs || !c || !c.day || c.night || Hs.etat !== 'eveille' || !Hs.jeux || !Hs.jeux.propose || game() || Sc.casting) return false;
    const X = window.PixelExos, N = window.PixelNourrir;
    if ((X && (X.open || X.offering)) || (N && N.trayOpen)) return false;
    const t = Date.now(); if (t - V.offerAt < 30 * 60000 || t - V.gameAt < 20 * 60000) return false;
    return Math.random() * 100 < 15 + 0.7 * trait('energique');
  }
  function offre() { V.offerAt = Date.now(); const f = (Hs && Hs.jeux && Hs.jeux.favoris) || ['cache']; return (V.offre = f[Math.floor(Math.random() * f.length)] || 'cache'); }
  function spiderOk(c) {
    if (!Hs || !c || c.night || Hs.etat !== 'eveille' || !fearOn('araignees') || game()) return false;
    return Date.now() - V.spiderAt > 40 * 60000 && Math.random() < 0.5;
  }
  const offering = () => !!PER && PER.state.cur === 'jeu-envie';

  /* ---- the views over (or instead of) his face screen, in screens.js's ORDER: a game ('jeu', just after an open exercise:
     before a friend's visit and souvenirs' views), then his offer « On joue à… ? » and the night veil ('habitudes', after
     them); Nourrir's tray and plate wait under both (web/nourrir.js) ---- */
  const veilOn = () => asleep() && !game();
  K = Sc.addon({
    name: 'jeu',
    on: scr => scr === 'visage' && L.boot < 0 && !Sc.casting && !!Hs && !!game(),
    instead: () => true,
    busy: () => !!game(),
    fps: () => { const g = game(); return !g ? 0 : g.etat === 'fin' ? 20 : g.jeu === 'pfc' && g.phase === 'choix' ? 20 : 30; },
    state,
    draw(k) { const g = game(); if (g) drawGame(k, g); },
  });
  Sc.addon({
    name: 'habitudes',
    on: scr => scr === 'visage' && L.boot < 0 && !Sc.casting && !!Hs && (offering() || veilOn()),
    busy: () => offering(),
    fps: () => (veilOn() && !(PER && PER.state.cur) ? 12 : 0),
    draw(k) { if (veilOn()) drawVeil(k); if (offering()) drawOffer(k); },
  });

  /* drawing helpers: pixel-art icons (crisp in every theme), buttons, his small face with his scenes */
  const ICONS = {
    pierre: ['....####....', '..##++####..', '.#++######..', '.#+########.', '###########.', '############', '############', '.##########.', '..########..'],
    feuille: ['#######...', '#+++++##..', '#+++++#+#.', '#+++++####', '#++++++++#', '#+#####++#', '#++++++++#', '#+######+#', '#++++++++#', '#+#####++#', '#++++++++#', '##########'],
    ciseaux: ['#........#', '##......##', '.##....##.', '..##..##..', '...####...', '....##....', '...####...', '.+##..##+.', '+..+..+..+', '+..+..+..+', '.++....++.'],
    coeur: ['.##...##.', '####.####', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....'],
    etoile: ['....#....', '...###...', '#########', '.#######.', '..#####..', '.###.###.', '##.....##'],
    lune: ['...####.', '..##....', '.##.....', '.##.....', '.##.....', '.##.....', '..##....', '...####.'],
    note: ['...####', '...#..#', '...#..#', '...#..#', '.###.##', '####...', '####...', '.##....'],
    araignee: ['#..#..#..#', '.#.####.#.', '..######..', '##########', '..######..', '.#.####.#.', '#..#..#..#'],
  };
  function icon(k, name, x, y, u, c1, c2) {
    const g = ICONS[name]; if (!g) return; const X = k.X;
    X.save(); X.shadowBlur = 0;
    g.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const ch = row[i]; if (ch === '.') continue; X.fillStyle = ch === '+' ? (c2 || c1) : c1; X.fillRect(Math.round(x + i * u), Math.round(y + j * u), Math.ceil(u), Math.ceil(u)); } });
    X.restore();
  }
  const iconW = (name, u) => (ICONS[name] ? ICONS[name][0].length * u : 0), iconH = (name, u) => (ICONS[name] ? ICONS[name].length * u : 0);
  const up = (k, s) => (k.T.upper ? s.toUpperCase() : s);
  function button(k, x, y, w, h, text, fn, o = {}) {
    const { G, D, B } = k.c, c = o.dim ? D : o.warn ? k.c.AM : G, on = !!o.fill;
    k.box(x, y, w, h, c, on ? c : B);
    const size = o.size || 28; k.txt(k.fit(up(k, text), w - 14, size), x + w / 2, y + (h - size) / 2 + 1, size, on ? (k.T.onFg || B) : c, 'center');
    if (fn) k.hit(x, y, w, h, () => { if (L.petted) { L.petted = false; return; } L.dirty = true; fn(); });
  }
  const M0 = { x: 0, y: 0, s: 1, r: 0, f: false, sx: 1, sy: 1 };
  function smallFace(k, box, want, md) {                           // his face in a box, his scenes scaled to it; returns his line
    const PV = k.PV, sc = box.w / 672, X = k.X;
    const m = PV.id ? { ...PV.m, x: PV.m.x * sc, y: PV.m.y * sc } : null;
    X.save(); k.face('hab', PV.id ? PV.anim : want, PV.id ? (PV.mood || md) : md, box.x, box.y, box.w, box.h, m); X.restore();
    let line = '';
    if (PV.id && PER) { X.save(); X.shadowBlur = 0; line = PER.drawOver(box, m || M0, { noBubble: true }) || ''; X.restore(); k.glow(); }
    return line;
  }
  function sayBox(k, x, y, w, text, dim) {                          // his line in a bubble of its own
    if (!text) return;
    const { G, D, B, WH } = k.c, fs = 24, ls = k.wrap(text, w - 20, fs).slice(0, 2), lh = fs + 2, h = 20 + ls.length * lh;
    k.box(x, y, w, h, dim ? D : G, B);
    ls.forEach((l, i) => k.txt(k.fit(l, w - 20, fs), x + w / 2, y + 10 + i * lh, fs, dim ? D : WH, 'center'));
  }
  const TITLE = { cache: 'Cache-cache', pfc: 'Pierre-feuille-ciseaux', etoiles: 'Attrape-étoiles', simon: 'Simon' };
  function drawGame(k, g) {
    const t = srv(), e = t - g.phase_t;
    if (g.etat === 'fin') return drawFin(k, g, e);
    if (g.jeu === 'cache') drawCache(k, g, e, t);
    else if (g.jeu === 'pfc') drawPfc(k, g, e);
    else if (g.jeu === 'etoiles') drawEtoiles(k, g, t);
    else if (g.jeu === 'simon') drawSimon(k, g, e);
    button(k, 8, 412, 60, 60, '×', () => send('habitudes.stop'), { size: 36, dim: true });
  }
  /* cache-cache: he hides behind an edge of the screen and peeks out now and then; touch the edge where he is */
  const SPOT_AT = (g, spot) => { const i = (g.id + g.manche) % 3; return spot === 'gauche' || spot === 'droite' ? [130, 240, 330][i] : [220, 400, 580][i]; };
  function spotBox(spot, along, q) {                                // his box (16:9) when he peeks out q (0 hidden, 1 out)
    const w = 216, h = 122;
    if (spot === 'gauche') return { x: -w + 112 * q, y: along - h / 2, w, h, r: 0.2 * q };       // one eye out, then the other
    if (spot === 'droite') return { x: W - 112 * q, y: along - h / 2, w, h, r: -0.2 * q };
    if (spot === 'haut') return { x: along - w / 2, y: 48 - h + 74 * q, w, h, r: 0 };            // his eyes, under the top line
    return { x: along - w / 2, y: HT - 74 * q, w, h, r: 0 };
  }
  function nearestSpot(p) { const d = { gauche: p.x, droite: W - p.x, haut: p.y - 48, bas: HT - p.y }; return Object.keys(d).reduce((a, b) => (d[b] < d[a] ? b : a)); }
  function drawCache(k, g, e) {
    const { G, D, DK, AM, WH } = k.c, X = k.X, spot = g.cachette, along = SPOT_AT(g, spot);
    k.header(`${TITLE.cache} · ${g.manche}/${g.manches}`, k.clock());
    X.save(); X.globalAlpha = 0.5; X.setLineDash([10, 12]); X.strokeStyle = D; X.lineWidth = 3; X.strokeRect(14, 60, W - 28, HT - 74); X.restore();   // the edges of his hiding place
    let box = null, want = 'curieux', md = 'ecoute', label = '';
    if (g.phase === 'cache') {                                      // he runs off to his spot
      const q = out(e / CACHE.hide), c = { x: 400 - 108, y: 240 - 61, w: 216, h: 122 }, s = spotBox(spot, along, 0);
      box = { x: c.x + (s.x - c.x) * q, y: c.y + (s.y - c.y) * q, w: 216, h: 122, r: 0 }; want = 'rire'; md = 'content';
      label = e < 900 ? '1, 2, 3…' : 'Je me cache !';
    } else if (g.phase === 'cherche') {                             // hidden: he peeks out every few seconds
      const c = e % 2600, q = c < 300 ? c / 300 : c < 1200 ? 1 : c < 1500 ? 1 - (c - 1200) / 300 : 0;
      if (q > 0) box = spotBox(spot, along, q * (0.75 + 0.25 * Math.sin(e / 140)));
      label = 'Où suis-je ?';
    } else {                                                        // found, or out by himself: he comes to the middle
      const q = out(e / 600), s = spotBox(spot, along, 0.4), c = { x: 400 - 120, y: 230 - 68 };
      box = { x: s.x + (c.x - s.x) * q, y: s.y + (c.y - s.y) * q, w: 240, h: 135, r: s.r * (1 - q) };
      want = g.phase === 'trouve' ? 'rire' : 'clin-oeil'; md = 'content';
      label = g.phase === 'trouve' ? 'Trouvé !' : 'Je suis là !';
    }
    if (label) k.txt(up(k, label), 400, 92, 52, g.phase === 'trouve' ? AM : WH, 'center', 'title');
    if (g.phase === 'cherche') k.txt(k.fit(up(k, 'Touche le bord où il se cache'), 560, 24), 400, 154, 24, D, 'center');
    for (let i = 0; i < g.manches; i++) icon(k, 'etoile', 400 - g.manches * 26 + i * 52 + 5, 196, 6, i < g.trouves ? AM : DK);   // found so far, in the middle
    if (V.miss && performance.now() - V.miss.at < 1300) {          // a wrong edge: « Pas là ! », and a giggle from where he is
      const m = V.miss, a = 1 - (performance.now() - m.at) / 1300, sb = spotBox(spot, along, 0.6);
      X.save(); X.globalAlpha = a; k.txt(up(k, 'Pas là !'), clamp(m.x, 90, W - 90), clamp(m.y - 40, 170, 380), 32, AM, 'center', 'title');
      k.txt('hihi', clamp(sb.x + sb.w / 2, 60, W - 60), clamp(sb.y + sb.h / 2, 190, 400), 26, D, 'center'); X.restore();
    }
    if (box) {
      X.save(); X.beginPath(); X.rect(0, 48, W, HT - 48); X.clip();
      const PV = k.PV, m = { ...M0, r: box.r || 0 };
      k.face('hab-cache', PV.id ? PV.anim : want, PV.id ? (PV.mood || md) : md, box.x, box.y, box.w, box.h, m);
      X.restore();
      if (PV.id && g.phase !== 'cherche' && PER) { X.save(); const line = PER.drawOver(box, m, { noBubble: true }) || ''; X.restore(); k.glow(); if (line) sayBox(k, 260, 372, 280, line); }
    }
    k.hit(0, 48, W, HT - 48, p => {
      if (L.petted) { L.petted = false; return; }
      if (g.phase !== 'cherche') return;
      const s = nearestSpot(p); if (s !== spot && !g.rates.includes(s)) V.miss = { x: p.x, y: p.y, at: performance.now() };
      L.dirty = true; send('habitudes.coup', { id: g.id, manche: g.manche, cote: s });
    });
  }
  /* pierre-feuille-ciseaux: three big buttons; then both hands side by side */
  const HAND_LABEL = { pierre: 'Pierre', feuille: 'Feuille', ciseaux: 'Ciseaux' };
  function hand(k, name, cx, cy, u, col, col2) { icon(k, name, cx - iconW(name, u) / 2, cy - iconH(name, u) / 2, u, col, col2); }
  function drawPfc(k, g, e) {
    const { G, D, B, AM, WH, PK } = k.c, box = { x: 8, y: 54, w: 288, h: 162 };
    k.header(`${TITLE.pfc} · manche ${g.manche}`, k.clock());
    const line = smallFace(k, box, g.phase === 'montre' ? ({ toi: 'surpris', lui: 'fier', egal: 'confus' }[g.gagnant] || 'content') : 'ecoute', g.phase === 'montre' ? 'content' : 'ecoute');
    sayBox(k, 14, 226, 276, line || (g.phase === 'choix' ? 'Choisis ta main !' : ''), !line);
    k.txt(up(k, 'Toi'), 420, 62, 26, D, 'center'); k.txt(String(g.score[0]), 420, 88, 64, WH, 'center', 'title');
    k.txt('–', 554, 92, 56, D, 'center', 'title');
    k.txt(k.fit(up(k, (P && P.caractere && P.caractere.nom) || 'Pixel'), 200, 26), 688, 62, 26, D, 'center'); k.txt(String(g.score[1]), 688, 88, 64, WH, 'center', 'title');
    if (g.phase === 'choix') {
      const words = ['Pierre…', 'feuille…', 'ciseaux !'], n = Math.min(3, Math.floor((e % 3200) / 650) + 1);
      k.txt(k.fit(up(k, words.slice(0, n).join(' ')), 470, 34), 554, 196, 34, AM, 'center', 'title');
    } else if (g.phase === 'montre') {
      const q = out(e / 300);
      hand(k, g.toi, 420, 232 - 8 * (1 - q), 7, G, k.c.WH); hand(k, g.lui, 688, 232 - 8 * (1 - q), 7, G, k.c.WH);
      k.txt('VS', 554, 214, 34, D, 'center', 'title');
      const res = { toi: 'Gagné !', lui: 'Perdu !', egal: 'Égalité !' }[g.gagnant] || '';
      k.txt(up(k, res), 554, 168, 34, g.gagnant === 'toi' ? AM : WH, 'center', 'title');
    }
    HANDS.forEach((h, i) => {                                      // the three big buttons
      const x = 80 + i * 240, y = 300, w = 224, h2 = 104, on = g.phase === 'choix', picked = g.phase === 'montre' && g.toi === h;
      k.box(x, y, w, h2, on || picked ? G : D, picked ? G : B);
      hand(k, h, x + 56, y + h2 / 2, 6, picked ? (k.T.onFg || B) : on ? G : D, picked ? (k.T.onFg || B) : on ? WH : D);
      k.txt(k.fit(up(k, HAND_LABEL[h]), 110, 28), x + 160, y + h2 / 2 - 14, 28, picked ? (k.T.onFg || B) : on ? WH : D, 'center');
      if (on) k.hit(x, y, w, h2, () => { if (L.petted) { L.petted = false; return; } V.pressed = { h, at: performance.now() }; L.dirty = true; send('habitudes.coup', { id: g.id, manche: g.manche, choix: h }); });
    });
  }
  /* attrape-étoiles: catch the falling stars before they reach the bottom */
  function starAt(s, el) { return { x: s.x + Math.sin((el - s.t) / 380 + s.x) * 10, y: -40 + s.v * (el - s.t) / 1000 }; }
  function drawEtoiles(k, g, t) {
    const { G, D, DK, AM, WH } = k.c, X = k.X, el = t - g.t0, left = clamp((ETOILES.ms - el) / 1000, 0, 30);
    k.header(`${TITLE.etoiles} · ${Math.ceil(left)} s`, k.clock());
    k.bar(24, 54, 15, left / 30 * 15, 30, 10, 4, left < 8 ? AM : G, DK);
    icon(k, 'etoile', 600, 56, 4, AM); k.txt(String(g.score), 646, 48, 40, WH, 'left', 'title');
    const pix = !!k.T.faceFps, now = performance.now();
    X.save(); X.beginPath(); X.rect(0, 72, W, HT - 72); X.clip();      // they fall from under the top line
    g.etoiles.forEach((s, i) => {
      const caught = g.prises.includes(i) || V.caught.has(i), p = starAt(s, el);
      if (caught) {                                                 // a sparkle where it was caught
        const at = V.caught.get(i); if (at === undefined || now - at > 500) return;
        const q = (now - at) / 500, c = V.caughtAt && V.caughtAt[i] || p;
        X.save(); X.globalAlpha = 1 - q; for (let j = 0; j < 6; j++) { const a = j * Math.PI / 3; icon(k, 'etoile', c.x + Math.cos(a) * 40 * q - 7, c.y + Math.sin(a) * 40 * q - 7, 2, j % 2 ? AM : WH); } X.restore();
        return;
      }
      if (el < s.t || p.y > HT + 40) return;
      const u = s.d ? (pix ? 7 : 6) : (pix ? 5 : 4.5);
      icon(k, 'etoile', p.x - 4.5 * u, p.y - 3.5 * u, u, s.d ? AM : WH);
    });
    X.restore();
    const recent = V.lastCatch && now - V.lastCatch < 700;
    smallFace(k, { x: 280, y: 345, w: 240, h: 135 }, recent ? 'etoiles' : 'curieux', recent ? 'excite' : 'ecoute');
    k.hit(0, 64, W, HT - 64, p => {
      if (L.petted) { L.petted = false; return; }
      const e2 = srv() - g.t0; let best = -1, bd = 1e9;
      g.etoiles.forEach((s, i) => { if (g.prises.includes(i) || V.caught.has(i) || e2 < s.t) return; const q = starAt(s, e2), d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd && d < (s.d ? 78 : 66)) { bd = d; best = i; } });
      if (best < 0) return;
      V.caught.set(best, performance.now()); (V.caughtAt ||= {})[best] = starAt(g.etoiles[best], e2); V.lastCatch = performance.now(); L.dirty = true;
      son('bip'); send('habitudes.coup', { id: g.id, etoile: best });
    });
  }
  /* Simon: he shows a sequence of pads, you play it back; one more each round */
  const PADS = [[316, 60, 'coeur'], [558, 60, 'etoile'], [316, 240, 'lune'], [558, 240, 'note']], PW = 230, PH = 168, PAD_SON = ['bip', 'hic', 'bisou', 'coucou'];
  function drawSimon(k, g, e) {
    const { G, D, B, AM, WH, PK } = k.c, box = { x: 8, y: 54, w: 288, h: 162 }, cols = [PK, AM, WH, G], now = performance.now();
    k.header(`${TITLE.simon} · ${g.long} couleurs`, k.clock());
    const showing = g.phase === 'montre', lit = showing ? g.seq.slice(0, g.long).findIndex((_, i) => e >= i * SIMON.step + 150 && e < i * SIMON.step + 150 + SIMON.lit) : -1;
    const litPad = lit >= 0 ? g.seq[lit] : -1;
    if (litPad >= 0 && V.sang !== `${g.id}:${g.manche}:${lit}`) { V.sang = `${g.id}:${g.manche}:${lit}`; son(PAD_SON[litPad]); }
    const line = smallFace(k, box, showing ? 'ecoute' : g.phase === 'bravo' ? 'content' : 'reflechit', showing ? 'ecoute' : 'content');
    sayBox(k, 14, 226, 276, line || (showing ? 'Regarde bien…' : g.phase === 'joue' ? `À toi ! ${g.fait}/${g.long}` : 'Bravo !'), !line);
    PADS.forEach(([x, y, name], i) => {
      const pressed = V.pressed && V.pressed.pad === i && now - V.pressed.at < 260, on = i === litPad || pressed, c = cols[i];
      k.box(x, y, PW, PH, on ? c : D, on ? c : B);
      const u = 9; icon(k, name, x + PW / 2 - iconW(name, u) / 2, y + PH / 2 - iconH(name, u) / 2, u, on ? (k.T.onFg || B) : c);
      if (g.phase === 'joue') k.hit(x, y, PW, PH, () => {
        if (L.petted) { L.petted = false; return; }
        const key = g.id + ':' + g.manche, t = performance.now();
        if (!V.simon || V.simon.key !== key) V.simon = { key, n: 0, at: 0 };
        if (V.simon.n < g.fait || (V.simon.n > g.fait && t - V.simon.at > 1500)) V.simon.n = g.fait;   // another screen played, or a press was lost
        const j = V.simon.n; if (j >= g.long) return;
        V.simon.n++; V.simon.at = t; V.pressed = { pad: i, at: t }; L.dirty = true;
        son(PAD_SON[i]); send('habitudes.coup', { id: g.id, manche: g.manche, pad: i, i: j });
      });
    });
  }
  /* the end of a game: the result, « Rejouer » and « Fini » (it closes by itself after a few seconds) */
  function finText(g) {
    const f = g.fin, s = f.score;
    if (g.jeu === 'cache') return [f.resultat === 'gagne' ? 'Bravo, tu m’as trouvé !' : 'J’étais bien caché !', `Trouvé ${s || 0} fois sur ${g.manches}`];
    if (g.jeu === 'pfc') return [f.resultat === 'gagne' ? 'Bravo, tu as gagné !' : f.resultat === 'perdu' ? 'J’ai gagné ! Hé hé !' : f.resultat === 'egal' ? 'Égalité !' : 'Fin de la partie', `${g.score[0]} à ${g.score[1]}`];
    if (g.jeu === 'etoiles') return [f.resultat === 'gagne' ? 'Bravo, quelle pluie d’étoiles !' : 'Bien joué !', `${s || 0} étoile${(s || 0) > 1 ? 's' : ''} attrapée${(s || 0) > 1 ? 's' : ''}`];
    return [f.resultat === 'gagne' ? 'Bravo, quelle mémoire !' : 'Bien joué !', s ? `Tu as retenu ${s} couleurs` : 'On recommence ?'];
  }
  function drawFin(k, g, e) {
    const { G, D, AM, WH } = k.c, [title, sub] = finText(g), win = g.fin.resultat === 'gagne';
    k.header(TITLE[g.jeu], k.clock());
    const line = smallFace(k, { x: 8, y: 54, w: 288, h: 162 }, win ? 'etoiles' : g.fin.resultat === 'perdu' ? 'fier' : 'content', win ? 'excite' : 'content');
    if (line) sayBox(k, 14, 226, 276, line);
    k.txt(k.fit(up(k, title), 470, 40), 554, 84, 40, win ? AM : WH, 'center', 'title');
    k.txt(k.fit(up(k, sub), 470, 32), 554, 148, 32, G, 'center');
    if (g.fin.record) k.txt(up(k, 'Nouveau record !'), 554, 196, 30, AM, 'center', 'title');
    if (win) for (let i = 0; i < 3; i++) icon(k, 'etoile', 470 + i * 64, 246 + Math.round(Math.sin(e / 300 + i) * 6), 6, AM);
    button(k, 316, 330, 230, 64, 'Rejouer', () => send('habitudes.jouer', { jeu: g.jeu, par: 'rejoue' }), { fill: true });
    button(k, 558, 330, 230, 64, 'Fini', () => send('habitudes.stop'));
  }
  /* his offer « On joue à … ? »: two buttons under him */
  function drawOffer(k) {
    const e = PER.current().e || 0; if (e < 1400) return;
    const X = k.X, q = clamp((e - 1400) / 300, 0, 1), y = 410 + Math.round((1 - q) * 24);
    X.save(); X.globalAlpha = q; X.shadowBlur = 0; X.fillStyle = k.c.B; X.fillRect(0, 403, W, 77); X.restore();
    X.save(); X.globalAlpha = q;
    button(k, 196, y, 196, 60, 'Plus tard', () => { if (PER) PER.play('jeu-plustard'); });
    button(k, 408, y, 196, 60, 'Oui !', () => { if (PER) PER.stop(); send('habitudes.jouer', { jeu: V.offre, par: 'lui' }); }, { fill: true });
    X.restore();
  }
  /* the night veil: the screen dimmed, a few stars, the moon, and his night-light when he fears the dark */
  function drawVeil(k) {
    const X = k.X, { AM, WH, D } = k.c, t = performance.now(), cur = PER && PER.state.cur, pix = !!k.T.faceFps;
    const a = (cur ? 0.32 : 0.56) * clamp((t - V.sleptAt) / 1800, 0, 1);
    X.save(); X.shadowBlur = 0;
    X.globalAlpha = a; X.fillStyle = '#04050d'; X.fillRect(0, 0, W, HT);
    X.globalAlpha = Math.min(1, a * 1.6);
    for (let i = 0; i < 9; i++) { const x = (i * 97 + 41) % 760 + 20, y = 62 + (i * 53) % 90, tw = 0.4 + 0.6 * Math.abs(Math.sin(t / 900 + i)); X.globalAlpha = Math.min(1, a * 1.6) * tw; icon(k, 'etoile', x, y, 2, WH); }
    X.globalAlpha = Math.min(1, a * 1.8); icon(k, 'lune', 730, 64, 5, AM);
    const n = Hs.peurs && Hs.peurs.noir;
    if (n && n.on && n.courage < 100) {                             // his night-light, bottom left: a soft glow, a little moon lamp
      const x = 70, y = 392, glow = 0.55 + 0.2 * Math.sin(t / 800);
      const gr = X.createRadialGradient(x, y, 4, x, y, 96); gr.addColorStop(0, AM); gr.addColorStop(1, 'rgba(0,0,0,0)');   // light: soft in every theme
      X.globalAlpha = (pix ? 0.42 : 0.5) * glow; X.fillStyle = gr; X.fillRect(x - 96, y - 96, 192, 192);
      X.globalAlpha = 1; icon(k, 'lune', x - 20, y - 22, 5, AM); X.fillStyle = D; X.fillRect(x - 18, y + 20, 36, 8);
    }
    X.restore();
  }

  return {
    get state() { return Hs; }, get asleep() { return asleep(); }, get offering() { return offering(); }, get game() { return game(); }, send,
    canPropose, offre, spiderOk, fearOn, V, ICONS, touchKind,
    sayOwn(on) { V.forceLine = !!on; },                            // tests: a taught phrase every time it fits
  };
}

/* ---------- the phone: the « Ses habitudes » panel ---------- */
const PANEL = (() => {
  if (typeof document === 'undefined') return null;
  const kiosk = typeof location !== 'undefined' && /[?&]kiosk\b/.test(location.search);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const btn = (cls, text, fn) => { const b = el('button', cls, text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; };
  let sheet = null, ui = null, opener = null, snap = null;
  /* times every 15 min, a value not in the list (set by Claude: 7 h 20) gets its own option */
  function timeSelect(label, from, to, step, fn) {
    const l = el('label', 'hab-time'), s = el('select');
    for (let m = from; m <= to; m += step) { const o = el('option', null, hm(m % 1440)); o.value = String(m % 1440); s.append(o); }
    s.setAttribute('aria-label', label); s.addEventListener('change', () => { fn(Number(s.value)); s.blur(); });   // blurred: a refused time shows the kept one again
    l.append(el('span', null, label), s); return { l, s };
  }
  function setSel(s, v) {
    if (document.activeElement === s) return;
    const val = String(v); if (![...s.options].some(o => o.value === val)) { const o = el('option', null, hm(v)); o.value = val; s.append(o); }
    s.value = val;
  }
  function sw(label, help, fn) {
    const b = btn('hab-sw'); b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', 'false');
    b.append(el('span', 'hab-sw-t', label), help ? el('small', null, help) : '', el('i', 'hab-knob'));
    b.addEventListener('click', () => fn(b.getAttribute('aria-checked') !== 'true')); return b;
  }
  const setSw = (b, on) => b.setAttribute('aria-checked', String(!!on));
  function sprite(name, c1, c2) {                                    // a game's icon, in the theme's colours
    const g = SCREEN && SCREEN.ICONS[name], cv = el('canvas', 'hab-ic'); if (!g) return cv;
    cv.width = g[0].length; cv.height = g.length; cv.setAttribute('aria-hidden', 'true');
    const x = cv.getContext && cv.getContext('2d');
    if (x) g.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] !== '.') { x.fillStyle = row[i] === '+' ? c2 || c1 : c1; x.fillRect(i, j, 1, 1); } });
    return cv;
  }
  const GAME_ICON = { cache: 'lune', pfc: 'ciseaux', etoiles: 'etoile', simon: 'coeur' };
  const FEAR_TEXT = { orage: 'L’orage dehors (selon la météo) : un éclair, il sursaute et se cache.', noir: 'Quand toutes les lumières s’éteignent. Au coucher, il demande sa veilleuse.',
    araignees: 'Parfois, une petite araignée passe sur son écran : touche-la, elle s’en va.', vide: 'Sur le Pixel de poche, quand tu penches beaucoup le téléphone.' };
  function build(root, o = {}) {
    const send0 = o.send || (() => {}), send = (a, x) => { last = ''; send0(a, x); };   // the next snapshot repaints all (a refused change too)
    root.classList.add('hab-body');
    const now = el('p', 'hab-now'); now.setAttribute('aria-live', 'polite');
    const wake = btn('hab-btn hab-wake', 'Réveille-le', () => send('habitudes.reveiller'));
    // his schedule
    const sched = el('div', 'hab-sched');
    const actif = sw('Il suit son emploi du temps', 'Sinon, il ne se couche jamais tout seul.', v => send('habitudes.horaires', { actif: v }));
    const rv = timeSelect('Réveil', 4 * 60, 12 * 60, 15, v => send('habitudes.horaires', { reveil: v }));
    const cb = timeSelect('Coucher', 18 * 60, 26 * 60, 15, v => send('habitudes.horaires', { coucher: v }));
    const napSw = sw('Une sieste', null, v => send('habitudes.horaires', { sieste: v ? { de: 13 * 60 + 30, duree: 60 } : null }));
    const nd = timeSelect('Début', 11 * 60, 17 * 60, 15, v => send('habitudes.horaires', { sieste: { de: v } }));
    const nl = el('label', 'hab-time'), ns = el('select'); ns.setAttribute('aria-label', 'Durée de la sieste');
    for (const m of [15, 20, 30, 45, 60, 75, 90, 120]) { const op = el('option', null, m < 60 ? `${m} min` : hm(m).replace(' h', ' h').replace(/^(\d+) h$/, '$1 h')); op.value = String(m); ns.append(op); }
    ns.addEventListener('change', () => { send('habitudes.horaires', { sieste: { duree: Number(ns.value) } }); ns.blur(); }); nl.append(el('span', null, 'Durée'), ns);
    const napRow = el('div', 'hab-row'); napRow.append(nd.l, nl);
    const weSw = sw('Le week-end, d’autres horaires', 'Debout plus tard le samedi et le dimanche, au lit plus tard le vendredi et le samedi.', v => send('habitudes.horaires', { weekend: v ? {} : null }));
    const wr = timeSelect('Réveil', 5 * 60, 12 * 60, 15, v => send('habitudes.horaires', { weekend: { reveil: v } }));
    const wc = timeSelect('Coucher', 18 * 60, 26 * 60, 15, v => send('habitudes.horaires', { weekend: { coucher: v } }));
    const weRow = el('div', 'hab-row'); weRow.append(wr.l, wc.l);
    const mainRow = el('div', 'hab-row'); mainRow.append(rv.l, cb.l);
    sched.append(actif, mainRow, napSw, napRow, weSw, weRow,
      el('p', 'hab-note', '15 minutes avant le coucher, il bâille, se brosse les dents et dit bonne nuit. La nuit, il dort : touche-le, il marmonne et se rendort. Les autres suivent sa nuit : son ventre dort aussi, pas de question de maths ni de notification qui le réveille.'));
    // his games
    const jeux = el('div', 'hab-jeux'), cards = {};
    for (const [id, name] of Object.entries(JEUX)) {
      const c = el('div', 'hab-jeu'), top = el('div', 'hab-jeu-top'), heart = btn('hab-fav', '♥', () => send('habitudes.favori', { jeu: id }));
      heart.setAttribute('aria-label', `${name} : un de ses jeux préférés`); heart.setAttribute('aria-pressed', 'false');
      const ic = el('span', 'hab-jeu-ic'); ic.dataset.icon = GAME_ICON[id];
      top.append(ic, heart);                                   // its name below, on the card's whole width (Pierre-feuille-ciseaux)
      const rec = el('small', 'hab-rec'), play = btn('hab-btn hab-play', 'Jouer', () => { send('habitudes.jouer', { jeu: id, par: 'telephone' }); if (o.onPlay) o.onPlay(id); });
      c.append(top, el('b', 'hab-jeu-name', name), rec, play); jeux.append(c); cards[id] = { c, heart, rec, play, ic };
    }
    const propose = sw('Il te propose de jouer', 'Quand il s’ennuie, de temps en temps, jamais la nuit (plus souvent s’il est énergique).', v => send('habitudes.propose', { on: v }));
    // what makes him laugh
    const rires = el('div', 'hab-chips'), chips = {};
    for (const [id, name] of Object.entries(RIRES)) { const b = btn('hab-chip', name, () => send('habitudes.rires', { kind: id, on: b.getAttribute('aria-pressed') !== 'true' })); b.setAttribute('aria-pressed', 'false'); rires.append(b); chips[id] = b; }
    const rireBtns = el('div', 'hab-row hab-acts');
    rireBtns.append(btn('hab-btn', 'Une blague', () => send('habitudes.rire', { kind: 'blague' })), btn('hab-btn', 'Une grimace', () => send('habitudes.rire', { kind: 'grimace' })),
      btn('hab-btn', 'Un bruit rigolo', () => send('habitudes.rire', { kind: 'bruit' })));
    // his fears
    const peurs = el('div', 'hab-peurs'), fears = {};
    for (const [id, name] of Object.entries(PEURS)) {
      const row = el('div', 'hab-peur'), s = sw(name, FEAR_TEXT[id], v => send('habitudes.peurs', { peur: id, on: v }));
      const meter = el('div', 'hab-courage'), fill = el('i'), lab = el('span', 'hab-courage-t');
      meter.setAttribute('role', 'meter'); meter.setAttribute('aria-valuemin', '0'); meter.setAttribute('aria-valuemax', '100'); meter.setAttribute('aria-label', `Courage : ${name}`);
      meter.append(fill); row.append(s, lab, meter); peurs.append(row); fears[id] = { s, fill, lab, meter };
    }
    // his phrases
    const exprs = el('div', 'hab-exprs'), lists = {};
    for (const [id, name] of Object.entries(MOMENTS)) { const box = el('div', 'hab-expr'); box.append(el('span', 'hab-expr-t', name)); const ul = el('ul', 'hab-said'); box.append(ul); exprs.append(box); lists[id] = { box, ul }; }
    const form = el('form', 'hab-teach'); form.autocomplete = 'off';
    const msel = el('select', 'hab-moment'); msel.setAttribute('aria-label', 'Le moment');
    for (const [id, name] of Object.entries(MOMENTS)) { const op = el('option', null, name); op.value = id; msel.append(op); }
    const inp = el('input', 'hab-phrase'); Object.assign(inp, { type: 'text', maxLength: PHRASE_MAX, placeholder: 'Salut les loulous !', enterKeyHint: 'done', spellcheck: false });
    inp.setAttribute('aria-label', 'La phrase à lui apprendre');
    const teach = btn('hab-btn hab-learn', 'Apprendre'); teach.type = 'submit';
    const fmsg = el('p', 'hab-msg'); fmsg.setAttribute('role', 'status');
    form.append(msel, inp, teach, fmsg);
    form.addEventListener('submit', e => { e.preventDefault(); const c = cleanPhrase(inp.value); if (!c) { fmsg.textContent = 'Écris une petite phrase (60 lettres au plus).'; return; } send('habitudes.apprendre', { moment: msel.value, phrase: c }); inp.value = ''; fmsg.textContent = `Il retient : « ${c} »`; });
    inp.addEventListener('keydown', e => e.stopPropagation());       // typing a phrase is not a command (app.js)
    const h3 = t => el('h3', 'hab-h', t);
    root.append(now, wake, h3('Son emploi du temps'), sched, h3('Ses jeux préférés'), el('p', 'hab-note', 'Touche ♥ pour choisir ses deux jeux préférés : quand tu choisis l’un d’eux, il saute de joie. On joue en touchant son écran.'), jeux, propose,
      h3('Ce qui le fait rire'), rires, rireBtns, el('p', 'hab-note', 'Les chatouilles : tapote vite son visage, ou frotte-le. Plus il est farceur, plus il rit.'),
      h3('Ses peurs'), el('p', 'hab-note', 'Rien de vraiment effrayant. Quand il a peur, caresse-le : il prend du courage, et jour après jour sa peur diminue.'), peurs,
      h3('Ses expressions'), el('p', 'hab-note', 'Apprends-lui tes phrases : il les dira de temps en temps, à la place des siennes. Cinq par moment.'), form, exprs);
    let last = '';
    function render(H) {
      if (!H) return;
      const h = H.horaires, key = JSON.stringify([H.horaires, H.etat, H.jeux, H.rires, H.peurs, H.expressions, H.prochain && Math.floor(H.prochain.t / 60000)]);
      if (key === last) return; last = key;
      const nx = H.prochain, nt = nx ? new Date(nx.t + ((H.horloge && H.horloge.decalage) || 0)) : null, at = nt ? hm(nt.getHours() * 60 + nt.getMinutes()) : '';   // on his clock (the lab's simulated one too)
      now.textContent = !h.actif ? 'Emploi du temps éteint : il ne se couche pas tout seul.' : H.horloge && H.horloge.pause ? 'Mode démo : son horloge est en pause (il reste réveillé).'
        : { eveille: `Il est réveillé. Il se couche à ${hm(h.coucher)}.`, reveil: 'Il vient de se réveiller.', sieste: `Il fait la sieste${at ? ` jusqu’à ${at}` : ''}.`,
          coucher: `Il se prépare pour la nuit : dodo à ${at || hm(h.coucher)}.`, nuit: `Il dort. Il se réveille à ${at || hm(h.reveil)}.` }[H.etat] || '';
      wake.hidden = H.etat !== 'sieste';
      setSw(actif, h.actif); setSel(rv.s, h.reveil); setSel(cb.s, h.coucher);
      setSw(napSw, !!h.sieste); napRow.hidden = !h.sieste; if (h.sieste) { setSel(nd.s, h.sieste.de); setSel(ns, h.sieste.duree); }
      setSw(weSw, !!h.weekend); weRow.hidden = !h.weekend; if (h.weekend) { setSel(wr.s, h.weekend.reveil); setSel(wc.s, h.weekend.coucher); }
      for (const el2 of [rv.s, cb.s, nd.s, ns, wr.s, wc.s]) el2.disabled = !h.actif;
      const asleep = H.dort || H.etat === 'coucher';
      for (const [id, c] of Object.entries(cards)) {
        const fav = (H.jeux.favoris || []).includes(id), r = (H.jeux.records || {})[id];
        c.heart.setAttribute('aria-pressed', String(fav)); c.c.classList.toggle('fav', fav);
        c.rec.textContent = r ? (id === 'pfc' ? `Parties gagnées : ${r}` : id === 'etoiles' ? `Record : ${r} étoiles` : id === 'simon' ? `Record : ${r} couleurs` : `Record : trouvé ${r} fois`) : 'Pas encore de record';
        c.play.disabled = asleep; c.play.title = asleep ? 'Il dort : on jouera plus tard' : '';
      }
      setSw(propose, H.jeux.propose);
      for (const [id, b] of Object.entries(chips)) b.setAttribute('aria-pressed', String(H.rires.aime.includes(id)));
      for (const [id, f] of Object.entries(fears)) {
        const p = H.peurs[id] || { on: false, courage: 0 }, c = p.courage || 0;
        setSw(f.s, p.on); f.fill.style.width = c + '%'; f.meter.setAttribute('aria-valuenow', String(c));
        f.lab.textContent = !p.on ? 'Il n’en a pas peur.' : c >= 100 ? 'Courage : il n’a plus peur !' : `Courage : ${'★'.repeat(Math.floor(c / 20))}${'☆'.repeat(5 - Math.floor(c / 20))}`;
      }
      for (const [id, x] of Object.entries(lists)) {
        const said = (H.expressions && H.expressions[id]) || [];
        x.box.classList.toggle('empty', !said.length);
        x.ul.replaceChildren(...(said.length ? said.map(s => {
          const li = el('li'), say = btn('hab-say', s, () => send('habitudes.dire', { moment: id, phrase: s })), del = btn('hab-del', '×', () => send('habitudes.oublier', { moment: id, phrase: s }));
          say.title = 'Il le dit maintenant'; del.setAttribute('aria-label', `Oublier « ${s} »`); li.append(say, del); return li;
        }) : [el('li', 'hab-none', 'Ses phrases à lui')]));
      }
      if (o.onRender) o.onRender(H);
    }
    return { render };
  }
  function open() {
    if (!sheet || document.body.classList.contains('poche')) return;
    sheet.hidden = false; document.body.classList.add('hab-open'); sheet.firstChild.scrollTop = 0;
    if (snap) ui.render(snap);
    const x = sheet.querySelector('.hab-x'); if (x) x.focus({ preventScroll: true });
  }
  function close(refocus = true) { if (!sheet || sheet.hidden) return; sheet.hidden = true; document.body.classList.remove('hab-open'); if (opener && refocus) opener.focus({ preventScroll: true }); }
  function mount() {
    if (kiosk || sheet || !document.querySelector('.kb .kfoot > span') || !Sc) return;
    sheet = el('div', 'hab-sheet'); sheet.hidden = true; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-labelledby', 'habTitle');
    const box = el('div', 'hab-box'), top = el('header', 'hab-top'), title = el('h2', 'hab-title', 'Ses habitudes'), x = btn('hab-x', '×', () => close()), body = el('div');
    title.id = 'habTitle'; x.setAttribute('aria-label', 'Fermer'); top.append(title, x); box.append(top, body); sheet.append(box); document.body.append(sheet);
    ui = build(body, { send: (a, xx) => SCREEN && SCREEN.send(a, xx), onPlay: () => { close(false); const s = document.getElementById('screen'); if (s && s.scrollIntoView) s.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } });
    sheet.addEventListener('click', e => { if (e.target === sheet) close(); });
    sheet.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') close(); });
    if (typeof MutationObserver === 'function') new MutationObserver(() => { if (document.body.classList.contains('poche')) close(false); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    opener = btn('follow hab-go', 'Habitudes', open); opener.title = 'Ses habitudes : son emploi du temps, ses jeux, ses blagues, ses peurs, ses phrases';
    document.querySelector('.kb .kfoot > span').append(opener);      // with Caractère, Nourrir, Exos (the integrator groups them)
    paint();
  }
  function paint() {                                                  // the game icons in the theme's colours
    if (!sheet) return;
    const cs = getComputedStyle(document.body), c1 = cs.getPropertyValue('--c-fg').trim() || '#46ff82', c2 = cs.getPropertyValue('--k-act').trim() || '#ffb347';
    sheet.querySelectorAll('.hab-jeu-ic').forEach(s => s.replaceChildren(sprite(s.dataset.icon, c1, c2)));
  }
  let painted = '';
  function state(H, theme) {
    snap = H;
    if (theme !== painted) { painted = theme; setTimeout(paint); }
    if (ui && sheet && !sheet.hidden) ui.render(H);
    if (opener) opener.hidden = !H;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(mount)); else setTimeout(mount);
  return { build, open, close, state, get isOpen() { return !!sheet && !sheet.hidden; }, mount };
})();
function panelState() { if (PANEL && SCREEN) { const H = SCREEN.state, th = (typeof Screens !== 'undefined' && Screens.local && Screens.local.theme) || ''; PANEL.state(H, th); } }

return {
  ...RULES, hub,
  /* the screens (web/scenes/habitudes.js asks these) */
  canPropose: c => (SCREEN ? SCREEN.canPropose(c) : false), offre: () => (SCREEN ? SCREEN.offre() : 'cache'), spiderOk: c => (SCREEN ? SCREEN.spiderOk(c) : false),
  fearOn: k => (SCREEN ? SCREEN.fearOn(k) : false), favoris: () => ((SCREEN && SCREEN.state && SCREEN.state.jeux && SCREEN.state.jeux.favoris) || []),
  get screen() { return SCREEN; },
  /* the phone (app.js PixelPanel('habitudes')): the panel */
  panel(on) { if (!PANEL) return false; if (on === false) PANEL.close(); else PANEL.open(); return true; },
  build: (root, o) => (PANEL ? PANEL.build(root, o) : null),
  get panelOpen() { return !!(PANEL && PANEL.isOpen); },
};
})();
