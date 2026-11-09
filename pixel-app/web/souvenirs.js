/* Ses souvenirs, l'album et le carnet d'humeur on the screens. pixel/souvenirs.py and pixel/album.py keep them (snapshots
   "souvenirs", "humeur", "album"); web/scenes/souvenirs.js has his scenes; web/album.js takes the photos.
   - every screen: his scenes from the server's news (your birthday noted, a memory told, your mood: joy, a hug, a breath
     together), and once a day on each screen, when you are there, your birthday party or a day you met;
   - Pixel's own screen (the Pi's, Pixel sans Pi, Pixel Lab: web/album.js HOME), when someone is there (a touch in the last
     90 s) and he is free (his face screen, no cast, no menu, no exercise, no food tray, no scene but a moment of life, not
     asleep: habitudes "dort" or 'coucher', read defensively): from "heure", « Comment tu vas aujourd'hui ? » (humeur.pose);
     the next day, « Hier, tu étais triste… ça va mieux ? »; once ever, « C'est quand ton anniversaire ? »; now and then (2 h
     apart, 3 a day at most, in the day), a memory: « Tu te souviens de ta série de 12 bonnes réponses ? »;
   - the view on his face screen (a screens.js add-on), one thing at a time: the quick menu and a cast come first (the cast
     covers it, its question waits under it), then an open exercise and its offer (web/exos.js), then, here: the album
     (« montre l'album »: a slideshow, on his own screen), the birthday picker, the mood question (5 big faces, then a few
     words, if you like), his offer « Je te dis ! »; the food tray and its plate wait (web/nourrir.js, wrapped here);
   - the phone: « Souvenirs » and « Album » buttons under the keys open one sheet with three tabs: Souvenirs (your birthday,
     the day you met, his records, the timeline), Carnet (today's mood, the week, the month, the settings), Album (the grid,
     a full screen view, ★, Enregistrer, Supprimer); PixelPanel('souvenirs' | 'album') opens it from the app's menu;
   - the same rules as pixel/souvenirs.py (rules), and the in-page hub for Pixel Lab and Pixel sans Pi (hub(), called by
     lab/demo-hub.js): Pixel sans Pi keeps the album in IndexedDB (web/album.js store), never in the state S.
   Loaded after screens.js, exos.js and album.js, before app.js; in the lab, before demo-hub.js. */
window.PixelSouvenirs = (() => {
const p2 = n => String(n).padStart(2, '0');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const norm = s => String(s ?? '').toLowerCase().trim().normalize('NFD').replace(/\p{Mn}/gu, '').replace(/’/g, "'").replace(/œ/g, 'oe');

/* ---------- the rules (pixel/souvenirs.py): dates, moods, commands ---------- */
const MOODS = [['super', 'Super', '😄'], ['bien', 'Bien', '🙂'], ['bof', 'Bof', '😐'], ['triste', 'Triste', '😢'], ['colere', 'En colère', '😠']];
const MOOD = Object.fromEntries(MOODS.map(m => [m[0], m]));
const CHIPS = [['ecole', 'École'], ['copains', 'Copains'], ['famille', 'Famille'], ['fatigue', 'Fatigue'], ['sport', 'Sport'], ['jeux', 'Jeux'], ['dehors', 'Dehors'], ['animaux', 'Animaux']];
const CHIP = Object.fromEntries(CHIPS);
const CHIPS_MAX = 4, TIMELINE_MAX = 200, PINNED_MAX = 40, TEXT_MAX = 100, JOURS_MAX = 400, JOURS_SNAP = 42;
const HEURE = 17 * 60, HEURE_MIN = 7 * 60, HEURE_MAX = 20 * 60 + 30, ASKS_MAX = 2, ASK_GAP = 3600e3, QUESTION_MS = 150e3, ANNIV_AFTER = 2 * 3600e3;
const MILESTONES = [100, 200, 300, 500, 1000, 1500, 2000, 3000], T_MIN = 946684800000;
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const TYPE = /^[a-z][a-z0-9-]{0,23}$/;
const dim = (y, m) => new Date(y, m, 0).getDate();
const isInt = v => typeof v === 'number' && Number.isInteger(v);
const validDay = (j, m) => isInt(m) && m >= 1 && m <= 12 && isInt(j) && j >= 1 && j <= dim(2024, m);
const D = (y, m, d) => new Date(y, m - 1, d);
const dayNum = d => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);   // whole days, whatever the summer time
const ymd = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const parseDay = s => { if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null; const d = D(+s.slice(0, 4), +s.slice(5, 7), +s.slice(8, 10)); return ymd(d) === s ? d : null; };
const birthdayIn = (y, j, m) => D(y, m, Math.min(j, dim(y, m)));   // a 29 February birthday: 28 February in the other years
function nextBirthday(today, j, m) { let d = birthdayIn(today.getFullYear(), j, m); if (dayNum(d) < dayNum(today)) d = birthdayIn(today.getFullYear() + 1, j, m); return d; }
function monthsSince(d0, t) { const n = (t.getFullYear() - d0.getFullYear()) * 12 + t.getMonth() - d0.getMonth(); return t.getDate() < Math.min(d0.getDate(), dim(t.getFullYear(), t.getMonth() + 1)) ? n - 1 : n; }
function monthDay(d0, n) { const k = d0.getMonth() + n, y = d0.getFullYear() + Math.floor(k / 12), m = ((k % 12) + 12) % 12 + 1; return D(y, m, Math.min(d0.getDate(), dim(y, m))); }
function fete(today, anniv, rencontre) {                // today's celebrations (souvenirs.py fete)
  const out = { fete: null, mois: 0, ans: 0, jours: 0 };
  if (anniv && dayNum(today) === dayNum(birthdayIn(today.getFullYear(), anniv.jour, anniv.mois))) out.fete = 'anniversaire';
  if (rencontre && dayNum(today) > dayNum(rencontre)) {
    const n = monthsSince(rencontre, today);
    if (n >= 1 && dayNum(monthDay(rencontre, n)) === dayNum(today)) { if (n % 12 === 0) { out.ans = n / 12; out.fete = out.fete || 'rencontre'; } else out.mois = n; }
    const days = dayNum(today) - dayNum(rencontre); if (MILESTONES.includes(days)) out.jours = days;
  }
  return out;
}
const dateText = (j, m, y) => `le ${j === 1 ? '1er' : j} ${MOIS[m - 1]}${y ? ' ' + y : ''}`;
const cleanText = (v, n = TEXT_MAX) => { if (typeof v !== 'string') return ''; const s = [...v.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim()]; return s.length <= n ? s.join('') : s.slice(0, n - 1).join('').trimEnd() + '…'; };
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const cleanChips = v => [...new Set(Array.isArray(v) ? v : [])].filter(c => typeof c === 'string' && CHIP[c]).slice(0, CHIPS_MAX);
function cleanEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const t = num(e.t, null), texte = cleanText(e.texte);
  if (!isInt(e.id) || e.id < 0 || t == null || t < T_MIN || t > 4102444800000 || typeof e.type !== 'string' || !TYPE.test(e.type) || !texte) return null;
  return { id: e.id, t, type: e.type, texte, epingle: e.epingle === true, photo: typeof e.photo === 'string' && /^[A-Za-z0-9_-]{4,16}$/.test(e.photo) ? e.photo : null };
}
function trim(tl) {                                    // TIMELINE_MAX at most: the oldest go, never a pinned one
  const pins = tl.filter(e => e.epingle).sort((a, b) => a.t - b.t); for (const e of pins.slice(0, Math.max(0, pins.length - PINNED_MAX))) e.epingle = false;
  while (tl.length > TIMELINE_MAX) { const old = tl.filter(e => !e.epingle).sort((a, b) => a.t - b.t || a.id - b.id)[0]; if (!old) break; tl.splice(tl.indexOf(old), 1); }
  return tl;
}
const order = tl => tl.sort((a, b) => b.t - a.t || b.id - a.id);
function cleanSouvenirs(d) {                          // the shape of souvenirs.json, every value checked
  d = d && typeof d === 'object' ? d : {};
  const out = { v: 1, anniv: null, demande: 0, rencontre: null, rencontre_auto: true, debut: 0, records: { serie_max: 0, record_chrono: 0, trophees: [], premier_repas: null, premier_trophee: null, vu: {} }, timeline: [], fetes: {} };
  if (d.anniv && validDay(d.anniv.jour, d.anniv.mois)) out.anniv = { jour: d.anniv.jour, mois: d.anniv.mois };
  out.demande = Math.max(0, num(d.demande, 0)); out.debut = Math.max(0, num(d.debut, 0));
  const r = parseDay(d.rencontre); if (r && r >= D(2020, 1, 1) && dayNum(r) <= dayNum(new Date()) + 1) { out.rencontre = ymd(r); out.rencontre_auto = d.rencontre_auto !== false; }
  const rec = d.records && typeof d.records === 'object' ? d.records : {}, R = out.records;
  for (const k of ['serie_max', 'record_chrono']) if (isInt(rec[k]) && rec[k] >= 0 && rec[k] <= 1e6) R[k] = rec[k];
  if (Array.isArray(rec.trophees)) R.trophees = rec.trophees.filter(x => typeof x === 'string' && TYPE.test(x)).slice(0, 50);
  for (const k of ['premier_repas', 'premier_trophee']) { const v = rec[k]; if (v && typeof v.id === 'string' && TYPE.test(v.id)) R[k] = { id: v.id, label: cleanText(v.label, 40), t: num(v.t, 0) }; }
  if (rec.vu && typeof rec.vu === 'object') for (const k of ['exos', 'nourrir']) if (rec.vu[k] === true) R.vu[k] = true;
  const seen = new Set();
  for (const e of Array.isArray(d.timeline) ? d.timeline : []) { const c = cleanEntry(e); if (c && !seen.has(c.id)) { seen.add(c.id); out.timeline.push(c); } }
  trim(order(out.timeline));
  if (d.fetes && typeof d.fetes === 'object') for (const [k, v] of Object.entries(d.fetes)) if (TYPE.test(k) && typeof v === 'string' && v.length <= 16) out.fetes[k] = v;
  return out;
}
function cleanHumeur(d) {                             // the shape of humeur.json
  d = d && typeof d === 'object' ? d : {};
  const out = { v: 1, on: d.on !== false, heure: HEURE, claude: d.claude === true, jours: {}, asks: { jour: '', n: 0, t: 0 } };
  if (isInt(d.heure) && d.heure >= HEURE_MIN && d.heure <= HEURE_MAX && d.heure % 15 === 0) out.heure = d.heure;
  const j = d.jours && typeof d.jours === 'object' ? d.jours : {};
  for (const k of Object.keys(j).filter(k => parseDay(k) && j[k] && MOOD[j[k].m]).sort().reverse().slice(0, JOURS_MAX)) out.jours[k] = { m: j[k].m, chips: cleanChips(j[k].chips), t: num(j[k].t, 0) };
  const a = d.asks; if (a && typeof a.jour === 'string' && a.jour.length === 10) out.asks = { jour: a.jour, n: isInt(a.n) && a.n >= 0 && a.n < 100 ? a.n : 0, t: num(a.t, 0) };
  return out;
}
const inQuiet = (h, calme) => { const de = isInt(calme && calme.de) ? calme.de : 23, a = isInt(calme && calme.a) ? calme.a : 6; return de === a ? false : de > a ? h >= de || h < a : h >= de && h < a; };
const isAsleep = s => { const h = s && s.habitudes; return !!h && typeof h === 'object' && (h.dort === true || h.etat === 'coucher'); };
/* the typed commands (souvenirs.py command): { action, args } | { toast, ms, mood } | null (not one: Claude). ctx: { anniv, dans, today } */
const MONTHS = { janvier: 1, janv: 1, fevrier: 2, fevr: 2, fev: 2, mars: 3, avril: 4, avr: 4, mai: 5, juin: 6, juillet: 7, juil: 7, aout: 8, septembre: 9, sept: 9, octobre: 10, oct: 10, novembre: 11, nov: 11, decembre: 12, dec: 12 };
const PHOTO = /^(?:prends?|fais|fait)(?:[- ]moi)? (?:une |un )?(?:photo|selfie)(?: de toi)?(?: pixel)?$|^(?:prends?[- ]moi en photo|une photo|photo|clic clac)$/;
const ALBUM = /^(?:montre|montre[- ]moi|ouvre|affiche|fais[- ]moi voir) (?:l'album(?: photo)?|ton album(?: photo)?|tes photos|les photos|ses photos)$|^(?:l'album|album|album photo|ton album|tes photos)$/;
const ANNIV = /^(?:mon anniv(?:ersaire)?|ma date d'anniversaire|la date de mon anniversaire)(?: c'est| c est| est|,| :)? (?:le )?(.+)$|^je suis nee? (?:le )?(.+)$/;
const QUAND = /^(?:c'est )?quand (?:est |c'est )?mon anniv(?:ersaire)?$|^(?:tu (?:connais|sais) )?(?:la date de )?mon anniversaire$|^tu te souviens de mon anniversaire$/;
const RACONTE = /^(?:tu te souviens|raconte(?:[- ]moi)? un souvenir|un souvenir|mes souvenirs|nos souvenirs)$/;
const DATE = /^(1er|premier|\d{1,2})(?: (?:de )?([a-z]+)\.?| ?[/.-] ?(\d{1,2}))(?: ?[/.-]? ?(\d{2}|\d{4}))?$/;
const MOOD_WORDS = {
  super: ['je suis super content', 'je suis super contente', 'je suis trop content', 'je suis trop contente', 'je suis tres content', 'je suis tres contente', 'je suis heureux', 'je suis heureuse',
    'je suis super heureux', 'je suis super heureuse', 'je suis ravi', 'je suis ravie', 'je vais super bien', 'ca va super bien', 'super journee', "j'ai passe une super journee"],
  bien: ['je suis content', 'je suis contente', 'je vais bien', 'ca va bien', 'je suis bien', "bonne journee aujourd'hui", "j'ai passe une bonne journee"],
  bof: ['je suis bof', 'ca va bof', 'bof', 'bof bof', 'je vais bof', 'moyen', 'ca va moyen', 'je suis fatigue', 'je suis fatiguee', 'je suis creve', 'je suis crevee', 'je suis epuise', 'je suis epuisee'],
  triste: ['je suis triste', 'je suis tres triste', 'je suis malheureux', 'je suis malheureuse', 'ca va pas', 'ca ne va pas', 'je vais pas bien', 'je ne vais pas bien', "j'ai du chagrin", "j'ai de la peine"],
  colere: ['je suis en colere', 'je suis fache', 'je suis fachee', 'je suis enerve', 'je suis enervee', 'je suis furieux', 'je suis furieuse', 'je suis vener', "ca m'enerve"],
};
const MOOD_OF = Object.fromEntries(Object.entries(MOOD_WORDS).flatMap(([m, ps]) => ps.map(p => [p, m])));
function parseDate(s) {
  const m = DATE.exec(s.trim()); if (!m) return null;
  const j = m[1] === '1er' || m[1] === 'premier' ? 1 : Number(m[1]);
  let mo; if (m[2]) { mo = MONTHS[m[2]]; if (!mo) return null; } else mo = Number(m[3]);
  return mo >= 1 && mo <= 12 && validDay(j, mo) ? [j, mo] : ['?', null];
}
function moodOf(t) {
  t = t.replace(/^(?:pixel[, ]+)/, '').replace(/[\s!.…]+$/, '').replace(/,? (?:aujourd'hui|ce soir|ce matin|pixel)$/, '').trim();
  const m = MOOD_OF[t]; return m ? [m, /fatigue|creve|epuise/.test(t) ? ['fatigue'] : []] : null;
}
function command(raw, ctx = {}) {
  const t = norm(raw).replace(/\s+/g, ' ').trim(), bare = t.replace(/\s*[!.…]+$/, ''), q = bare.replace(/\s*\?$/, ''); let m;
  if (PHOTO.test(q)) return { action: 'album.photo', args: {} };
  if (ALBUM.test(q)) return { action: 'album.montre', args: {} };
  if (QUAND.test(q) && (bare.endsWith('?') || q.includes('quand') || q.includes('souviens'))) {
    const a = ctx.anniv;
    if (!a) return { toast: 'Je ne le connais pas encore ! Dis-moi « mon anniversaire c\'est le 12 mars », par exemple.', ms: 7000 };
    return { toast: `Ton anniversaire : ${dateText(a.jour, a.mois)}${ctx.dans === 0 ? ' : c\'est aujourd\'hui ! Joyeux anniversaire !' : `, dans ${ctx.dans} jour${ctx.dans > 1 ? 's' : ''} !`}`, ms: 6000 };
  }
  if ((m = ANNIV.exec(bare))) {
    const d = parseDate((m[1] || m[2] || '').replace(/^[ .!]+|[ .!]+$/g, ''));
    if (!d) return null;
    if (d[0] === '?') return { toast: 'Cette date n\'existe pas ! Dis-moi par exemple « mon anniversaire c\'est le 12 mars ».', ms: 6000, mood: 'confus' };
    return { action: 'souvenirs.anniversaire', args: { jour: d[0], mois: d[1] } };
  }
  if (RACONTE.test(q)) return { action: 'souvenirs.raconte', args: {} };
  const mo = moodOf(bare);
  if (mo) {
    let [mm, chips] = mo; const cur = ctx.today;
    if (chips.length && cur) { mm = cur.m; chips = cleanChips([...(cur.chips || []), ...chips]); }
    return { action: 'humeur.note', args: { m: mm, chips } };
  }
  return null;
}
const rules = { MOODS, CHIPS, MOIS, TIMELINE_MAX, PINNED_MAX, JOURS_MAX, fete: (today, anniv, rencontre) => fete(today, anniv, rencontre), nextBirthday, birthdayIn, monthsSince, monthDay,
  dateText, validDay, parseDay, ymd, command, cleanSouvenirs, cleanHumeur, cleanText, trim, inQuiet };

/* ---------- the in-page hub: Pixel Lab and Pixel sans Pi (lab/demo-hub.js calls hub(api)) ----------
   The same actions and snapshots as pixel/souvenirs.py and pixel/album.py. Pixel Lab keeps them in this browser
   (pixel_lab_souvenirs) and its photos in memory; Pixel sans Pi keeps S.souvenirs and S.humeur through local.js (their
   "prive" part: what the server keeps in its files only), and its photos on the phone (web/album.js store: IndexedDB, or a
   small localStorage key), 24 at most, 640 x 384: never in S, which the app copies as JSON. */
let mirror = null;
function hub(api) {
  const { S, A, mark, toast, mood, restorable } = api, LOCAL = !!api.local, KEY = 'pixel_lab_souvenirs';
  const MAXP = LOCAL ? 24 : 60, FAVP = LOCAL ? 12 : 30, AL = window.PixelAlbum;
  let F = cleanSouvenirs({}), HF = cleanHumeur({}), question = null, ev = null, hev = null, day = '', added = [];
  let evid = Date.now() % 100000 * 100;
  const now = () => Date.now(), today = () => new Date(), noon = d => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime();
  if (!LOCAL) try { const k = JSON.parse(localStorage.getItem(KEY)) || {}; F = cleanSouvenirs(k.souvenirs); HF = cleanHumeur(k.humeur); } catch { /* afresh */ }
  const keep = () => { if (!LOCAL) try { localStorage.setItem(KEY, JSON.stringify({ souvenirs: F, humeur: HF })); } catch { /* full */ } };
  const event = (kind, data = {}) => { ev = { id: ++evid, kind, t0: now(), ...data }; };
  const hevent = (kind, data = {}) => { hev = { id: ++evid, kind, t0: now(), ...data }; };
  function add(type, texte, t = null, epingle = false, coalesce = false) {
    const tl = F.timeline, td = ymd(today());
    if (coalesce) { const e = tl.find(x => x.type === type && ymd(new Date(x.t)) === td); if (e) { e.texte = cleanText(texte); e.t = t ?? now(); order(tl); return e; } }
    const e = { id: Math.max(0, ...tl.map(x => x.id)) + 1, t: t ?? now(), type, texte: cleanText(texte), epingle: !!epingle, photo: null };
    tl.push(e); trim(order(tl)); return e;
  }
  if (!F.debut) F.debut = now();
  if (!F.rencontre) { F.rencontre = ymd(today()); F.rencontre_auto = true; add('rencontre', 'Le jour de notre rencontre !', noon(today()), true); }
  const rencontre = () => parseDay(F.rencontre) || today();
  const ansDans = () => { if (!F.anniv) return null; const t = today(); return dayNum(nextBirthday(t, F.anniv.jour, F.anniv.mois)) - dayNum(t); };
  function due(t = now()) {                            // souvenirs.py due()
    if (!HF.on || question) return false;
    const d = new Date(t), j = ymd(d), h = d.getHours();
    if (HF.jours[j] || h * 60 + d.getMinutes() < HF.heure || h >= 21 || h < 7) return false;
    if (inQuiet(h, S.caractere && S.caractere.calme) || isAsleep(S)) return false;
    const a = HF.asks; return !(a.jour === j && (a.n >= ASKS_MAX || t - a.t < ASK_GAP));
  }
  function hier() { const t = today(); for (const n of [1, 2]) { const j = ymd(new Date(t.getFullYear(), t.getMonth(), t.getDate() - n)), v = HF.jours[j]; if (v) return { jour: j, m: v.m, chips: [...v.chips], il_y_a: n }; } return null; }
  function publish() {
    const t = today(), r = rencontre(), f = fete(t, F.anniv, r), R = F.records, j = HF.jours[ymd(t)];
    S.souvenirs = { fete: f.fete, aujourdhui: { mois: f.mois, ans: f.ans, jours: f.jours }, anniv: F.anniv ? { ...F.anniv } : null, anniv_dans: ansDans(),
      anniv_texte: F.anniv ? dateText(F.anniv.jour, F.anniv.mois) : '', rencontre: F.rencontre, rencontre_auto: F.rencontre_auto, depuis: Math.max(0, dayNum(t) - dayNum(r)),
      demander_anniv: !F.anniv && !F.demande && now() - F.debut >= ANNIV_AFTER,
      records: { serie_max: R.serie_max, record_chrono: R.record_chrono, trophees: R.trophees.length, premier_repas: R.premier_repas && { ...R.premier_repas }, premier_trophee: R.premier_trophee && { ...R.premier_trophee } },
      timeline: F.timeline.map(e => ({ ...e })), ev,
      prive: { demande: F.demande, debut: F.debut, fetes: { ...F.fetes }, trophees: [...R.trophees], vu: { ...R.vu } } };   // what the server keeps in its file only
    S.humeur = { on: HF.on, heure: HF.heure, claude: HF.claude, aujourdhui: j ? { m: j.m, chips: [...j.chips], t: j.t } : null, hier: hier(), du: due(), question: question && { ...question },
      jours: Object.keys(HF.jours).sort().reverse().slice(0, JOURS_SNAP).map(k => ({ jour: k, m: HF.jours[k].m, chips: [...HF.jours[k].chips] })), ev: hev,
      prive: { jours: JSON.parse(JSON.stringify(HF.jours)), asks: { ...HF.asks } } };
  }
  function celebrations(t) {                          // souvenirs.py _celebrations
    const f = fete(t, F.anniv, rencontre()), y = String(t.getFullYear());
    if (f.fete === 'anniversaire' && F.fetes.anniversaire !== y) { F.fetes.anniversaire = y; add('anniversaire', 'Ton anniversaire : joyeux anniversaire !'); }
    if (f.ans && F.fetes.rencontre !== y) { F.fetes.rencontre = y; add('rencontre-an', `Ça fait ${f.ans} an${f.ans > 1 ? 's' : ''} qu’on se connaît !`); }
    if (f.jours && F.fetes.jours !== String(f.jours)) { F.fetes.jours = String(f.jours); add('jours', `${f.jours} jours ensemble !`); }
  }
  function observe() {                                // souvenirs.py observe(): his records from the other features' state
    const R = F.records, st = S.exos && S.exos.stats; let ch = false;
    if (st && typeof st === 'object') {
      const n = v => (isInt(v) && v >= 0 ? v : null), sm = n(st.serie_max), rc = n(st.record_chrono), tr = Array.isArray(st.trophees) ? st.trophees.filter(x => typeof x === 'string' && TYPE.test(x)) : [];
      const label = id => { const x = (S.exos.trophees || []).find(y => y && y.id === id); return cleanText(x && x.label, 40) || id; };
      if (!R.vu.exos) { Object.assign(R, { serie_max: sm || 0, record_chrono: rc || 0, trophees: tr }); R.vu.exos = ch = true; }
      else {
        if (sm != null && sm !== R.serie_max) { if (sm > R.serie_max && sm >= 5) { add('record', `Ta série record : ${sm} bonnes réponses d’affilée !`, null, false, true); event('record', { quoi: 'serie', n: sm }); } R.serie_max = sm; ch = true; }
        if (rc != null && rc !== R.record_chrono) { if (rc > R.record_chrono && rc >= 5) { add('chrono', `Ton record du défi chrono : ${rc} en une minute !`, null, false, true); event('record', { quoi: 'chrono', n: rc }); } R.record_chrono = rc; ch = true; }
        const nw = tr.filter(x => !R.trophees.includes(x));
        for (const x of nw) { add('trophee', `Trophée gagné : ${label(x)} !`); if (!R.premier_trophee) R.premier_trophee = { id: x, label: label(x), t: now() }; }
        if (nw.length) { R.trophees = [...R.trophees, ...nw].slice(-50); event('trophee', { ids: nw.slice(0, 5) }); ch = true; }
      }
    }
    const nn = S.nourrir;
    if (nn && typeof nn === 'object') {
      const j = (nn.journal || []).filter(m => m && typeof m.plat === 'string' && TYPE.test(m.plat)), PF = window.PixelFoods, food = id => (PF && PF.BY[id]) || { label: id, nom: id };
      if (!R.vu.nourrir) { R.vu.nourrir = ch = true; if (j.length) { const m = j[j.length - 1]; R.premier_repas = { id: m.plat, label: food(m.plat).label, t: num(m.t, 0) }; } }
      else if (!R.premier_repas && j.length) { const m = j[0]; R.premier_repas = { id: m.plat, label: food(m.plat).label, t: num(m.t, now()) }; add('repas', `Mon tout premier repas avec toi : ${food(m.plat).nom} !`); ch = true; }
    }
    return ch;
  }
  function tick() {
    const t = today(), d = ymd(t); let ch = false;
    if (d !== day) { day = d; celebrations(t); ch = true; }
    if (observe()) ch = true;
    if (question && now() - question.t0 > QUESTION_MS) { question = null; ch = true; }
    const was = S.humeur && S.humeur.du;
    if (ch || was !== due()) { publish(); keep(); mark(); }
  }
  /* the album: Pixel Lab keeps it in memory, Pixel sans Pi on the phone (web/album.js store) */
  const AP = { photos: [], demande: null, ev: null };
  function pubAlbum() { S.album = { photos: AP.photos.map(p => ({ id: p.id, src: p.url, t: p.t, raison: p.raison, fav: p.fav, w: p.w, h: p.h })), max: MAXP, fav_max: FAVP, demande: AP.demande && { ...AP.demande }, ev: AP.ev }; }
  async function loadAlbum() {
    if (!AL || !AL.store) return;
    if (!LOCAL) AL.store.mode = 'mem';
    try {
      const list = await AL.store.all();
      for (const p of AP.photos) if (p.url) URL.revokeObjectURL(p.url);
      AP.photos = list.slice(0, MAXP).map(p => ({ ...p, url: URL.createObjectURL(p.blob) }));
    } catch (e) { console.warn('Pixel: album', e); }
    pubAlbum(); mark();
  }
  const refus = () => {
    if (S.cast && S.cast.id && (!S.cast.until || S.cast.until > now())) return 'quelque chose est casté sur mon écran : arrête-le d\'abord !';
    if (S.exos && S.exos.cur) return 'finis d\'abord ton exo, et je prends la pose !';
    return '';
  };
  function dropPhoto(p) {
    AP.photos.splice(AP.photos.indexOf(p), 1); if (p.url) URL.revokeObjectURL(p.url);
    if (AL && AL.store) AL.store.del(p.id).catch(() => {});
    for (const e of F.timeline) if (e.photo === p.id) e.photo = null;
  }
  async function addPhoto(blob, raison, w, h) {
    raison = typeof raison === 'string' && TYPE.test(raison) ? raison : 'photo';
    const p = { id: Math.random().toString(36).slice(2, 10).padEnd(8, '0'), t: now(), raison, fav: false, w: w | 0, h: h | 0, blob };
    p.url = URL.createObjectURL(blob);
    AP.photos.unshift(p);
    while (AP.photos.length > MAXP) { const old = AP.photos.filter(x => !x.fav).sort((a, b) => a.t - b.t)[0]; if (!old) break; dropPhoto(old); }
    if (AL && AL.store) await AL.store.put({ id: p.id, t: p.t, raison, fav: false, w: p.w, h: p.h, blob }).catch(e => console.warn('Pixel: album', e));
    if (raison === 'photo') AP.demande = null;
    else {                                             // souvenirs.py lier_photo: the memory of that moment shows it
      const types = { anniversaire: ['anniversaire'], rencontre: ['rencontre-an', 'jours'], record: ['record', 'chrono'], trophee: ['trophee'] }[raison] || [raison];
      const e = F.timeline.find(x => types.includes(x.type) && !x.photo && now() - x.t < 6 * 3600e3); if (e) e.photo = p.id;
    }
    AP.ev = { id: ++evid, kind: 'photo', t0: now(), photo: p.id, raison };
    publish(); pubAlbum(); keep(); mark();
    return true;
  }
  Object.assign(A, {
    'souvenirs.anniversaire': ({ jour = null, mois = null } = {}) => {
      if (jour == null && mois == null) { if (!F.anniv) return; F.anniv = null; }
      else { if (!validDay(jour, mois) || (F.anniv && F.anniv.jour === jour && F.anniv.mois === mois)) return; F.anniv = { jour, mois }; F.demande = F.demande || now(); event('anniv', { jour, mois, dans: ansDans() }); }
      day = ''; tick(); publish(); keep();
    },
    'souvenirs.rencontre': ({ date = null } = {}) => {
      const d = parseDay(date); if (!d || d < D(2020, 1, 1) || dayNum(d) > dayNum(today()) || (date === F.rencontre && !F.rencontre_auto)) return;
      F.rencontre = date; F.rencontre_auto = false;
      const e = F.timeline.find(x => x.type === 'rencontre'); if (e) { e.t = noon(d); order(F.timeline); } else add('rencontre', 'Le jour de notre rencontre !', noon(d), true);
      delete F.fetes.rencontre; delete F.fetes.jours; day = ''; tick(); publish(); keep();
    },
    'souvenirs.demande': () => { if (!F.demande) { F.demande = now(); publish(); keep(); } },
    'souvenirs.ajoute': ({ type = null, texte = null, t = null, epingle = false } = {}) => {
      const tx = cleanText(texte), n = now(); if (typeof type !== 'string' || !TYPE.test(type) || type === 'rencontre' || !tx) return;
      added = added.filter(x => n - x < 3600e3); if ((added.length && n - added[added.length - 1] < 2000) || added.length >= 30) return;
      if (F.timeline.some(e => e.type === type && e.texte === tx && Math.abs(n - e.t) < 60000)) return;
      added.push(n); const tt = typeof t === 'number' && t >= T_MIN && t <= n + 864e5 ? t : null;
      const e = add(type, tx, tt, epingle === true && F.timeline.filter(x => x.epingle).length < PINNED_MAX); event('ajoute', { type, texte: e.texte, souvenir: e.id }); publish(); keep();
    },
    'souvenirs.epingle': ({ id = null, on = null } = {}) => {
      const e = F.timeline.find(x => x.id === id); if (!e) return; const v = typeof on === 'boolean' ? on : !e.epingle;
      if (v && !e.epingle && F.timeline.filter(x => x.epingle).length >= PINNED_MAX) { toast(`${PINNED_MAX} souvenirs épinglés au plus.`, 4000); return; }
      e.epingle = v; publish(); keep();
    },
    'souvenirs.efface': ({ id = null } = {}) => { const e = F.timeline.find(x => x.id === id); if (!e || e.type === 'rencontre') return; F.timeline.splice(F.timeline.indexOf(e), 1); publish(); keep(); },
    'souvenirs.raconte': () => { event('raconte'); S.anim = null; S.screen = 'visage'; publish(); },
    'souvenirs.fete': () => { const f = fete(today(), F.anniv, rencontre()); if (!f.fete) { toast('Pas de fête aujourd\'hui… mais je suis content de te voir !', 4000); return; } event('fete', { fete: f.fete, ans: f.ans }); S.anim = null; S.screen = 'visage'; publish(); },
    'humeur.note': ({ m = null, chips = null } = {}) => {
      if (!MOOD[m]) return; const j = ymd(today()), before = HF.jours[j], ch = cleanChips(chips);
      HF.jours[j] = { m, chips: ch, t: now() }; for (const k of Object.keys(HF.jours).sort().reverse().slice(JOURS_MAX)) delete HF.jours[k];
      question = null; hevent('note', { m, chips: ch, again: !!before }); publish(); keep();
    },
    'humeur.pose': () => { if (!due()) return; const j = ymd(today()), a = HF.asks; HF.asks = { jour: j, n: (a.jour === j ? a.n : 0) + 1, t: now() }; question = { id: ++evid, t0: now() }; hevent('question'); publish(); keep(); },
    'humeur.plustard': () => { if (question) { question = null; publish(); } },
    'humeur.reglages': ({ on = null, heure = null, claude = null } = {}) => {
      if (typeof on === 'boolean') { HF.on = on; if (!on) question = null; }
      if (isInt(heure) && heure >= HEURE_MIN && heure <= HEURE_MAX && heure % 15 === 0) HF.heure = heure;
      if (typeof claude === 'boolean') HF.claude = claude;
      publish(); keep();
    },
    'humeur.efface': () => { HF.jours = {}; question = null; hevent('efface'); publish(); keep(); },
    'album.photo': () => { const why = refus(); if (why) { toast('Pas de photo : ' + why, 4000); return; } AP.demande = { id: (++evid).toString(36), t0: now() }; S.anim = null; S.screen = 'visage'; pubAlbum(); },
    'album.fav': ({ id = null, on = null } = {}) => {
      const p = AP.photos.find(x => x.id === id); if (!p) return; const v = typeof on === 'boolean' ? on : !p.fav;
      if (v && !p.fav && AP.photos.filter(x => x.fav).length >= FAVP) { toast(`${FAVP} photos préférées au plus : enlève une étoile d'abord.`, 5000); return; }
      p.fav = v; if (AL && AL.store) AL.store.put({ id: p.id, t: p.t, raison: p.raison, fav: v, w: p.w, h: p.h, blob: p.blob }).catch(() => {}); pubAlbum();
    },
    'album.supprime': ({ id = null } = {}) => { const p = AP.photos.find(x => x.id === id); if (!p) return; dropPhoto(p); publish(); pubAlbum(); keep(); },
    'album.montre': () => {
      if (!AP.photos.length) { toast('Pas encore de photo dans mon album : dis « prends une photo » !', 5000); return; }
      if (S.exos && S.exos.cur) { toast('Finis d\'abord ton exo, et je te montre mon album !', 4000); return; }
      AP.ev = { id: ++evid, kind: 'montre', t0: now() }; S.anim = null; S.screen = 'visage'; pubAlbum();
    },
    'lab.souvenirs': ({ quoi = '' } = {}) => {        // Pixel Lab's buttons: today a celebration, yesterday a mood, a question now
      const t = today(), j = t.getDate(), mo = t.getMonth() + 1, back = n => ymd(new Date(t.getFullYear(), t.getMonth() - n, j));
      if (quoi === 'anniversaire') { F.anniv = { jour: j, mois: mo }; F.demande = F.demande || now(); delete F.fetes.anniversaire; }
      if (quoi === 'rencontre-an') { F.rencontre = ymd(new Date(t.getFullYear() - 1, t.getMonth(), j)); F.rencontre_auto = false; delete F.fetes.rencontre; }
      if (quoi === 'mois') { const d = new Date(t.getFullYear(), t.getMonth() - 3, j); F.rencontre = d.getDate() === j ? back(3) : ymd(new Date(t.getFullYear(), t.getMonth(), j - 100)); F.rencontre_auto = false; }
      if (quoi === 'hier') { const k = ymd(new Date(t.getFullYear(), t.getMonth(), j - 1)); HF.jours[k] = { m: 'triste', chips: ['fatigue'], t: now() - 864e5 }; }
      if (quoi === 'question') { HF.on = true; delete HF.jours[ymd(t)]; question = { id: ++evid, t0: now() }; hevent('question'); }   // now, whatever the time
      if (quoi === 'demande') { F.anniv = null; F.demande = 0; F.debut = now() - ANNIV_AFTER; }
      if (quoi === 'oublie') { F = cleanSouvenirs({}); F.debut = now(); F.rencontre = ymd(t); add('rencontre', 'Le jour de notre rencontre !', noon(t), true); HF = cleanHumeur({}); question = null; }
      const e = F.timeline.find(x => x.type === 'rencontre'); if (e) e.t = noon(rencontre());
      order(F.timeline); day = ''; tick(); publish(); keep();
    },
  });
  /* Pixel sans Pi (local.js): what comes back (the phone's copy, or his Pi's snapshot: its public shape) is cleaned, as
     souvenirs.py cleans its files; the album comes back from the phone's store, never from a snapshot */
  restorable('souvenirs', v => {
    if (!v || typeof v !== 'object') return;
    const pv = v.prive && typeof v.prive === 'object' ? v.prive : {}, rec = v.records || {};
    const c = cleanSouvenirs({ anniv: v.anniv, demande: pv.demande ?? (v.anniv || v.demander_anniv === false ? now() : 0), debut: pv.debut, rencontre: v.rencontre, rencontre_auto: v.rencontre_auto,
      records: { ...rec, trophees: pv.trophees, vu: pv.vu || { exos: true, nourrir: true } }, timeline: v.timeline, fetes: pv.fetes });
    if (!c.rencontre) { c.rencontre = F.rencontre; c.rencontre_auto = F.rencontre_auto; }
    if (!c.debut) c.debut = F.debut;
    if (!c.timeline.some(e => e.type === 'rencontre')) c.timeline.push({ id: Math.max(0, ...c.timeline.map(x => x.id)) + 1, t: noon(parseDay(c.rencontre)), type: 'rencontre', texte: 'Le jour de notre rencontre !', epingle: true, photo: null });
    F = c; order(F.timeline); day = ''; tick(); publish(); keep();
  });
  restorable('humeur', v => {
    if (!v || typeof v !== 'object') return;
    const pv = v.prive && typeof v.prive === 'object' ? v.prive : null;
    HF = cleanHumeur({ on: v.on, heure: v.heure, claude: v.claude, jours: pv ? pv.jours : Object.fromEntries((Array.isArray(v.jours) ? v.jours : []).filter(x => x && typeof x.jour === 'string').map(x => [x.jour, x])), asks: pv && pv.asks });
    question = null; publish(); keep();
  });
  restorable('album', () => { loadAlbum(); });
  setInterval(tick, 20000);
  setInterval(() => { if (AP.demande && now() - AP.demande.t0 > 25000) { AP.demande = null; toast('L\'écran de Pixel n\'a pas pu prendre la photo.', 4000); pubAlbum(); mark(); } }, 2000);
  day = ''; tick(); publish(); pubAlbum(); loadAlbum();
  mirror = {
    addPhoto, tick, publish,
    command(raw) {                                     // demo-hub.js command(): after nourrir's, just before Claude, as commands.py does
      const j = HF.jours[ymd(today())], r = command(String(raw || '').slice(0, 2000), { anniv: F.anniv, dans: ansDans(), today: j });
      if (!r) return false;
      if (r.toast) { toast(r.toast, r.ms || 6000); if (r.mood && mood) mood(r.mood, 2500); return true; }
      if (A[r.action]) A[r.action](r.args || {}); return true;
    },
    get state() { return { F, HF, question, photos: AP.photos.length }; },
  };
  return mirror;
}

/* ---------- every screen: the snapshots, his scenes ---------- */
const Sc = typeof Screens !== 'undefined' ? Screens : null;
const AL = () => window.PixelAlbum || null;
const qs = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const LAB = typeof document !== 'undefined' && !!document.getElementById('lab');
const KIOSK = qs.has('kiosk') && !LAB, LOCAL = !!window.PIXEL_LOCAL, HOME = KIOSK || LOCAL || LAB;
const L = Sc ? Sc.local : null, PER = Sc ? Sc.persona : null;
let P = null, K = null, send = () => {};
const seen = { sv: null, hu: null, q: null, dem: null, al: null, m: '' };
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
const fresh = (p, t0) => !!t0 && (p.server_now || Date.now()) - t0 < 10000;
const sc = (name, data) => (Sc && Sc.event ? Sc.event(name, data || {}, true) : '');
const play = id => { if (!PER) return false; if (L) { L.sleepy = false; L.local = null; L.pack = null; } return PER.play(id); };
const son = n => { const s = window.PixelSon; if (s && s.on) try { s.play(n); } catch (e) { /* his voice never stops him */ } };
function info() { const s = P && P.souvenirs; return s ? { ...(s.aujourdhui || {}) } : { mois: 0, ans: 0, jours: 0 }; }
if (Sc) {
  const set0 = Sc.setState, ss0 = Sc.setSend;
  let act = null;
  Sc.setState = p => {
    let q = p;                                         // our own actions are not « a phone's action » for his personality: they have their scenes
    if (p && p.act && /^(souvenirs|humeur|album)\./.test(p.act.name)) q = { ...p, act };
    else act = p ? p.act : null;
    set0(q);
    try { heard(p); } catch (e) { console.warn('Pixel: souvenirs', e); }
  };
  Sc.setSend = fn => { send = fn; ss0(fn); };
}
function heard(p) {
  const first = !P; P = p;
  const sv = p.souvenirs, hu = p.humeur, al = p.album;
  if (first) {                                         // old news stays old
    seen.sv = sv && sv.ev ? sv.ev.id : null; seen.hu = hu && hu.ev ? hu.ev.id : null; seen.q = hu && hu.question ? hu.question.id : null;
    seen.dem = al && al.demande ? al.demande.id : null; seen.al = al && al.ev ? al.ev.id : null;
    guard(); panelDraw(); return;
  }
  if (sv && sv.ev && sv.ev.id !== seen.sv) { seen.sv = sv.ev.id; if (fresh(p, sv.ev.t0)) onSouvenir(sv.ev); }
  if (hu && hu.ev && hu.ev.id !== seen.hu) { seen.hu = hu.ev.id; if (fresh(p, hu.ev.t0)) onHumeur(hu.ev); }
  if (hu && hu.question && hu.question.id !== seen.q) { seen.q = hu.question.id; if (fresh(p, hu.question.t0) && L && L.scr === 'visage') play('humeur-question'); }
  if (!(hu && hu.question)) V.hidden = false;
  if (al && al.demande && al.demande.id !== seen.dem) { seen.dem = al.demande.id; if (fresh(p, al.demande.t0) && AL()) AL().pose(); }
  if (al && al.ev && al.ev.id !== seen.al) {
    seen.al = al.ev.id;
    if (fresh(p, al.ev.t0) && al.ev.kind === 'montre' && HOME) diapo();
    if (al.ev.kind === 'photo') V.newPhoto = al.ev.photo;
  }
  if (V.album && (!al || !al.photos.length)) V.album = null;
  guard(); panelDraw();
}
function onSouvenir(e) {
  if (e.kind === 'anniv') sc('souvenir-anniv', { texte: dateText(e.jour, e.mois), jour: e.jour, mois: e.mois });
  else if (e.kind === 'fete') { play(e.fete === 'rencontre' ? 'souvenir-rencontre' : 'souvenir-anniversaire'); son('danse'); }
  else if (e.kind === 'raconte') sc('souvenir-rappel', memory());
  else if ((e.kind === 'record' || e.kind === 'trophee') && HOME && AL()) AL().snap(e.kind, { delay: 1600 });   // his cheer shows: a photo of it
}
function onHumeur(e) {
  if (e.kind === 'note') {
    V.hidden = false;
    if (e.again && e.m === seen.m) return;             // the same mood again, a few words more: he already said his piece
    seen.m = e.m; sc('humeur-note', { m: e.m, chips: e.chips || [] });
    son({ super: 'youpi', bien: 'bip', bof: 'hmm', triste: 'bisou', colere: 'ronron' }[e.m] || 'bip');
  }
}
const asleep = () => isAsleep(P);
const night = h => (PER && PER.isNight ? PER.isNight(h) : h >= 23 || h < 6);

/* ---------- what he remembers out loud ---------- */
const ICON = { repas: 'pizza', record: 'etoile', chrono: 'etoile', trophee: 'etoile', anniversaire: 'coeur', ami: 'coeur', 'rencontre-an': 'coeur', jours: 'coeur', perso: 'ampoule' };
function memories() {
  const s = P && P.souvenirs, out = []; if (!s) return out;
  const R = s.records || {};
  if (R.serie_max >= 5) out.push({ texte: `Tu te souviens de ta série de ${R.serie_max} bonnes réponses ?`, icone: 'etoile' });
  if (R.record_chrono >= 5) out.push({ texte: `${R.record_chrono} en une minute au défi chrono… quel record !`, icone: 'etoile' });
  if (R.premier_repas) { const PF = window.PixelFoods, f = PF && PF.BY[R.premier_repas.id]; out.push({ texte: `Mon tout premier repas avec toi : ${f ? f.nom : R.premier_repas.label} !`, icone: 'pizza' }); }
  if (R.premier_trophee) out.push({ texte: `Ton premier trophée : ${R.premier_trophee.label} !`, icone: 'etoile' });
  if (s.depuis >= 2) out.push({ texte: `Ça fait ${s.depuis} jours qu’on se connaît !`, icone: 'coeur' });
  if (s.anniv && s.anniv_dans > 0 && s.anniv_dans <= 14) out.push({ texte: s.anniv_dans === 1 ? 'Ton anniversaire, c’est demain !' : `Plus que ${s.anniv_dans} dodos avant ton anniversaire !`, icone: 'coeur' });
  const n = P.album && P.album.photos ? P.album.photos.length : 0; if (n >= 3) out.push({ texte: `J’ai déjà ${n} photos dans mon album !`, icone: 'etoile' });
  for (const e of (s.timeline || []).filter(e => !['rencontre', 'record', 'chrono', 'repas', 'anniversaire'].includes(e.type)).slice(0, 8))
    out.push({ texte: `Tu te souviens ? ${e.texte.replace(/[!.]$/, '')} !`.replace(/ ! !$/, ' !'), icone: ICON[e.type] || 'coeur' });
  return out;
}
function memory() {
  const all = memories(); if (!all.length) return { texte: 'Tu te souviens du jour de notre rencontre ?', icone: 'coeur' };
  let said = []; try { said = JSON.parse(store.get('pixel.souvenirs.dits')) || []; } catch { said = []; }
  const fresh2 = all.filter(m => !said.includes(m.texte)), m = (fresh2.length ? fresh2 : all)[Math.floor(Math.random() * (fresh2.length || all.length))];
  store.set('pixel.souvenirs.dits', JSON.stringify([...said, m.texte].slice(-4)));
  return m;
}

/* ---------- Pixel's own screen: when you are there, his initiatives (one at a time) ---------- */
const STEP = { at: -1e12 };
function present() { return !!L && !!K && K.now - L.lastInput < 90000 && K.now - L.lastInput > 1200 && (typeof document === 'undefined' || !document.hidden); }
function free() {
  if (!L || !PER || !P || L.scr !== 'visage' || L.boot >= 0 || L.sleepy || Sc.casting || Sc.menuOpen || view() || asleep()) return false;
  const X = window.PixelExos, N = window.PixelNourrir;
  if ((X && (X.open || X.offering)) || (N && N.trayOpen)) return false;
  const cur = PER.state.cur, g = cur ? (PER.scenes.find(s => s.id === cur) || {}).group : '';
  return !cur || g === 'vie';
}
const today = () => ymd(new Date());
function daily(key) { return store.get('pixel.souvenirs.' + key) === today(); }
function done(key) { store.set('pixel.souvenirs.' + key, today()); }
function initiative(force = false) {                   // force: Pixel Lab's buttons (no one needs to have touched him, no pause)
  if (!HOME || !P || !P.souvenirs || !free() || (!force && (!present() || Date.now() - STEP.at < 25000))) return;
  const s = P.souvenirs, hu = P.humeur, h = new Date().getHours(), t = Date.now(), go = () => { STEP.at = Date.now(); };
  if (night(h)) return;
  if (s.fete && !daily('fete-' + s.fete)) {            // your birthday, a year since you met: the party, and a photo of it
    done('fete-' + s.fete); go();
    const id = s.fete === 'rencontre' ? 'souvenir-rencontre' : 'souvenir-anniversaire';
    play(id); son('danse');
    if (AL()) AL().snap(s.fete, { scene: id, e: 2600, wait: 6000 });
    return;
  }
  const a = s.aujourdhui || {};
  if ((a.mois || a.jours) && !daily('mois')) { done('mois'); go(); play('souvenir-mois'); son('youpi'); return; }
  if (hu && hu.on && hu.hier && !daily('hier') && h >= 7 && h < 21) {   // « Hier, tu étais triste… ça va mieux ? »
    done('hier'); go(); sc('humeur-rappel', { texte: hier(hu.hier) }); return;
  }
  if (hu && hu.du && !hu.question && t - (STEP.pose || 0) > 30000 && !(window.PixelExos && window.PixelExos.open)) { STEP.pose = t; go(); send('humeur.pose'); return; }
  if (s.demander_anniv && h >= 9 && h < 19 && !store.get('pixel.souvenirs.demande')) {   // once ever: « C'est quand ton anniversaire ? »
    store.set('pixel.souvenirs.demande', '1'); go(); play('souvenir-question'); send('souvenirs.demande'); return;
  }
  let said = 0, last = 0; try { const m = JSON.parse(store.get('pixel.souvenirs.rappels')) || {}; if (m.jour === today()) said = m.n | 0; last = m.t || 0; } catch { /* none */ }
  if (h >= 9 && h < 20 && said < 3 && t - last > 2 * 3600e3 && Math.random() < 1 / 90 && memories().length) {   // now and then, a memory
    store.set('pixel.souvenirs.rappels', JSON.stringify({ jour: today(), n: said + 1, t })); go(); sc('souvenir-rappel', memory());
  }
}
function hier(x) {
  const when = x.il_y_a === 2 ? 'Avant-hier' : 'Hier', ch = x.chips || [];
  if (ch.includes('fatigue') && x.m !== 'triste' && x.m !== 'colere') return `${when}, grosse fatigue… Tu as bien dormi ?`;
  return { super: `${when}, c’était une super journée ! Et aujourd’hui ?`, bien: `${when}, c’était une bonne journée. Et aujourd’hui ?`, bof: `${when}, c’était bof… Ça va mieux ?`,
    triste: `${when}, tu étais triste… Ça va mieux ?`, colere: `${when}, tu étais en colère… C’est passé ?` }[x.m] || 'Et aujourd’hui, ça va ?';
}
if (Sc) setInterval(() => { try { initiative(); } catch (e) { console.warn('Pixel: souvenirs', e); } }, 1000);

/* ---------- the view on his face screen: the album, the birthday picker, the mood question, his offer ---------- */
const V = { album: null, anniv: null, chips: null, hidden: false, newPhoto: null, imgs: new Map() };
function view() {
  if (!P || !L) return null;
  if (V.album) return 'album';
  if (V.anniv) return 'anniv';
  if (V.chips) return 'chips';
  if (P.humeur && P.humeur.question && !V.hidden) return 'humeur';
  if (PER && PER.state.cur === 'souvenir-question' && (PER.current().e || 0) > 1500) return 'offre';
  return null;
}
const exosOwns = () => { const X = window.PixelExos; return !!(X && (X.open || X.offering)); };
function guard() {                                     // the food tray and its plate wait while a view of ours shows (as web/exos.js does)
  const N = window.PixelNourrir;
  if (N && !N.souvGuard && typeof N.over === 'function') {
    const over = N.over, swipe = N.swipe;
    N.over = k => { if (!view()) return over(k); if (N.trayOpen && N.close) N.close(); };
    if (typeof swipe === 'function') N.swipe = (dy, y0) => (view() ? false : swipe(dy, y0));
    N.souvGuard = true;
  }
  const X = window.PixelExos;                          // his offer « Une petite question ? » waits for ours, and for the party
  if (X && !X.souvGuard && typeof X.canPropose === 'function') { const cp = X.canPropose; X.canPropose = c => !view() && !(P && P.humeur && (P.humeur.question || P.humeur.du)) && cp(c); X.souvGuard = true; }
}
function diapo() { const al = P && P.album; if (!al || !al.photos.length || exosOwns()) return; V.album = { i: 0, t: K ? K.now : 0, list: al.photos.slice(0, 30).map(p => p.id) }; V.anniv = null; V.chips = null; if (L) L.dirty = true; }
const ad = {
  on: scr => scr === 'visage' && !!L && L.boot < 0 && !Sc.casting && !exosOwns() && !!view(),
  instead: () => ['album', 'anniv', 'chips', 'humeur'].includes(view()),
  busy: () => !!view(),
  fps: calm => { const v = view(); return v === 'album' ? 20 : v ? 30 : calm; },
  draw(k) { const v = view(); if (v === 'album') drawAlbum(k); else if (v === 'anniv') drawAnniv(k); else if (v === 'chips') drawChips(k); else if (v === 'humeur') drawHumeur(k); else if (v === 'offre') drawOffre(k); },
};
if (Sc && Sc.addon) K = Sc.addon(ad);
setInterval(() => { if (V.chips && K && K.now - V.chips.t > 30000) closeChips(); if (V.anniv && K && K.now - V.anniv.t > 60000) V.anniv = null; }, 1000);

const up = (k, s) => (k.T.upper ? s.toUpperCase() : s);
function button(k, x, y, w, h, text, fn, o = {}) {     // a touch button of the theme, 56 px high at least
  const { G, D: Dm, B } = k.c, on = !!o.fill, c = o.dim ? Dm : G;
  k.box(x, y, w, h, c, on ? c : B);
  const size = o.size || 28;
  k.txt(k.fit(up(k, text), w - 14, size), x + w / 2, y + (h - size) / 2 + 1, size, on ? (k.T.onFg || B) : c, 'center');
  k.hit(x, y, w, h, () => { if (L.petted) { L.petted = false; return; } L.dirty = true; k.fast(400); fn(); });
}
function fitText(k, s, w, h, sizes, kind) {
  for (const fs of sizes) { const ls = k.wrap(s, w, fs, kind); if (ls.length * (fs + 6) <= h && ls.every(l => { k.X.font = k.T.font(fs, kind); return k.X.measureText(l).width <= w; })) return { fs, ls }; }
  const fs = sizes[sizes.length - 1]; return { fs, ls: k.wrap(s, w, fs, kind).slice(0, Math.max(1, Math.floor(h / (fs + 6)))) };
}
const FB = { x: 24, y: 58, w: 256, h: 144 }, M0 = { x: 0, y: 0, s: 1, r: 0, f: false, sx: 1, sy: 1 };
function face(k, want, md) {                           // his small face, top left, with his scenes scaled down to it
  const PV = k.PV, sc2 = FB.w / 672, m = PV.id ? { ...PV.m, x: PV.m.x * sc2, y: PV.m.y * sc2 } : null;
  k.face('souv', PV.id ? PV.anim : want, PV.id ? (PV.mood || md) : md, FB.x, FB.y, FB.w, FB.h, m);
  let line = ''; if (PV.id && PER) { k.X.save(); k.X.shadowBlur = 0; line = PER.drawOver(FB, m || M0, { noBubble: true }) || ''; k.X.restore(); k.glow(); }
  k.hit(FB.x, FB.y, FB.w, FB.h, p => { if (L.petted) { L.petted = false; return; } if (PER) PER.tap(p, FB, {}); });
  return line;
}
function say(k, text, x = 300, y = 64, w = 484, h = 132) {   // what he says, big, beside his face
  const { G, B, WH } = k.c;
  k.box(x, y, w, h, G, B);
  k.X.fillStyle = B; k.X.beginPath(); k.X.moveTo(x + 1, y + 40); k.X.lineTo(x - 16, y + 54); k.X.lineTo(x + 1, y + 66); k.X.fill();
  const r = fitText(k, text, w - 32, h - 20, [40, 36, 32, 28, 26, 24], 'title'), lh = r.fs + 6, top = y + (h - r.ls.length * lh) / 2 + 2;
  r.ls.forEach((l, i) => k.txt(l, x + w / 2, top + i * lh, r.fs, WH, 'center', 'title'));
}
const surnom = () => { const c = P && P.caractere; return c && c.surnom ? c.surnom : ''; };
const named = s => (surnom() ? s.replace(/ \?$/, `, ${surnom()} ?`) : s);

/* the 5 faces, in pixel art (12 x 12; o its line, a its fill, k a dark mark, p pink, h light), in the theme's colours */
const ART = {
  super: ['....oooo....', '..ooaaaaoo..', '.oaaaaaaaao.', '.oakaaaakao.', 'oakakaakakao', 'oaaaaaaaaaao', 'opkkkkkkkkpo', 'oakhhhhhhkao', '.oakhhhhkao.', '.oaakkkkaao.', '..ooaaaaoo..', '....oooo....'],
  bien: ['....oooo....', '..ooaaaaoo..', '.oaaaaaaaao.', '.oakkaakkao.', 'oaakkaakkaao', 'oaaaaaaaaaao', 'opaaaaaaaapo', 'oakaaaaaakao', '.oakkkkkkao.', '.oaaaaaaaao.', '..ooaaaaoo..', '....oooo....'],
  bof: ['....oooo....', '..ooaaaaoo..', '.oaaaaaaaao.', '.oakkaakkao.', 'oaakkaakkaao', 'oaaaaaaaaaao', 'oaaaaaaaaaao', 'oaakkkkkkaao', '.oaaaaaaaao.', '.oaaaaaaaao.', '..ooaaaaoo..', '....oooo....'],
  triste: ['....oooo....', '..ooaaaaoo..', '.oaaaaaaaao.', '.oaakaakaao.', 'oakkaaaakkao', 'oahaaaaaaaao', 'oahaaaaaaaao', 'oaaakkkkaaao', '.oakaaaakao.', '.oaaaaaaaao.', '..ooaaaaoo..', '....oooo....'],
  colere: ['....oooo....', '..ooaaaaoo..', '.oaaaaaaaao.', '.okaaaaaako.', 'oaakkaakkaao', 'oaakkaakkaao', 'opaaaaaaaapo', 'oaaakkkkaaao', '.oakaaaakao.', '.oaaaaaaaao.', '..ooaaaaoo..', '....oooo....'],
};
const spriteCache = new Map();
function sprite(m, c) {
  const key = m + '|' + c.fg + c.bg + c.accent;
  let cv = spriteCache.get(key); if (cv) return cv;
  if (typeof document === 'undefined' || !ART[m]) return null;
  const lum = h => { const s = String(h || '#000').replace('#', ''), f = s.length === 3 ? s.split('').map(x => x + x).join('') : s.padEnd(6, '0'); const [r, g, b] = [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16) || 0); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
  const light = lum(c.bg) > 0.5, acc = light ? (c.pink && c.pink !== c.dim ? c.pink : c.faint || c.dim) : c.accent && c.accent !== c.fg ? c.accent : c.faint || c.dim;   // a sunny face: amber on the dark screens, pink on paper
  const pal = { o: c.fg, a: acc, k: light || lum(acc) > 0.45 ? '#1b1b1f' : c.bg, p: c.pink || c.accent || c.fg, h: light ? c.bg : c.hi || '#ffffff' };
  if (lum(pal.k) > 0.5 && lum(acc) > 0.5) pal.k = '#1b1b1f';
  cv = document.createElement('canvas'); cv.width = cv.height = 12;
  const g = cv.getContext('2d'); ART[m].forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
  if (spriteCache.size > 100) spriteCache.clear();
  spriteCache.set(key, cv); return cv;
}
function moodFace(k, m, x, y, px) { const s = sprite(m, k.T.c); if (!s) return; const X = k.X; X.save(); X.imageSmoothingEnabled = false; X.shadowBlur = 0; X.drawImage(s, Math.round(x), Math.round(y), 12 * px, 12 * px); X.restore(); }

function drawHumeur(k) {                               // « Comment tu vas aujourd'hui ? »: 5 big faces
  const { G, D: Dm, B, WH } = k.c;
  k.header('Mon carnet', k.clock());
  const line = face(k, 'ecoute', 'ecoute');
  say(k, line || named('Comment tu vas aujourd’hui ?'));
  MOODS.forEach(([m, label], i) => {
    const x = 16 + i * 154, y = 214, w = 148, h = 188;
    k.box(x, y, w, h, G, B);
    moodFace(k, m, x + (w - 96) / 2, y + 14, 8);
    k.txt(k.fit(up(k, label), w - 12, 28), x + w / 2, y + 128, 28, WH, 'center');
    k.hit(x, y, w, h, () => {
      if (L.petted) { L.petted = false; return; }
      V.chips = { m, sel: [], t: k.now }; L.dirty = true; k.fast(500); son('bip');
      send('humeur.note', { m, chips: [] });
    });
  });
  k.txt(up(k, 'Touche une tête !'), 24, 428, 26, Dm);
  button(k, 584, 412, 200, 60, 'Plus tard', () => { V.hidden = true; send('humeur.plustard'); if (PER) PER.stop(); });
}
function drawChips(k) {                                // then a few words, if you like
  const { G, D: Dm, B, WH } = k.c, c = V.chips;
  k.header('Mon carnet', k.clock());
  const line = face(k, 'content', 'content');
  say(k, line || 'Tu veux me dire pourquoi ? Pas obligé !');
  CHIPS.forEach(([id, label], i) => {
    const x = 16 + (i % 4) * 194, y = 216 + Math.floor(i / 4) * 80, w = 186, h = 70, on = c.sel.includes(id);
    k.box(x, y, w, h, on ? G : Dm, on ? G : B);
    k.txt(k.fit(up(k, label), w - 16, 28), x + w / 2, y + 21, 28, on ? (k.T.onFg || B) : WH, 'center');
    k.hit(x, y, w, h, () => {
      if (L.petted) { L.petted = false; return; }
      c.t = k.now; L.dirty = true;
      if (on) c.sel = c.sel.filter(x2 => x2 !== id); else if (c.sel.length < CHIPS_MAX) c.sel = [...c.sel, id];
    });
  });
  moodFace(k, c.m, 24, 392, 6);
  k.txt(k.fit(up(k, MOOD[c.m][1]), 260, 28), 104, 418, 28, WH);
  button(k, 524, 404, 260, 66, 'C’est tout !', closeChips, { fill: true });
}
function closeChips() {
  const c = V.chips; if (!c) return; V.chips = null; if (L) L.dirty = true;
  if (c.sel.length) send('humeur.note', { m: c.m, chips: c.sel });
}
function drawAnniv(k) {                                // « C'est quand ton anniversaire ? »: the month, then the day
  const { G, D: Dm, B, WH } = k.c, a = V.anniv;
  k.header('Ton anniversaire', k.clock());
  const line = face(k, 'ecoute', 'ecoute');
  say(k, line || (a.mois ? `Et quel jour, en ${MOIS[a.mois - 1]} ?` : 'C’est quel mois ?'), 300, 64, 484, 86);
  if (!a.mois) {
    button(k, 584, 158, 200, 50, 'Plus tard', () => { V.anniv = null; }, { size: 24, dim: true });
    MOIS.forEach((m, i) => button(k, 16 + (i % 4) * 194, 216 + Math.floor(i / 4) * 86, 186, 76, m.charAt(0).toUpperCase() + m.slice(1), () => { a.mois = i + 1; a.t = k.now; }, { size: 30 }));
  } else {
    button(k, 584, 158, 200, 50, 'Retour', () => { a.mois = 0; a.t = k.now; }, { size: 24, dim: true });
    const n = dim(2024, a.mois);
    for (let d = 1; d <= n; d++) {
      const i = d - 1, x = 16 + (i % 8) * 96, y = 216 + Math.floor(i / 8) * 64;
      button(k, x, y, 90, 58, String(d), () => { const m = a.mois; V.anniv = null; send('souvenirs.anniversaire', { jour: d, mois: m }); }, { size: 30 });
    }
  }
}
function drawOffre(k) {                                // while he asks: « Plus tard » and « Je te dis ! »
  const e = PER.current().e || 0, X = k.X, q = clamp((e - 1500) / 300, 0, 1), y = 410 + Math.round((1 - q) * 24);
  X.save(); X.globalAlpha = q; X.shadowBlur = 0; X.fillStyle = k.c.B; X.fillRect(0, 403, 800, 77); X.restore();
  X.save(); X.globalAlpha = q;
  button(k, 196, y, 196, 60, 'Plus tard', () => { if (PER) PER.play(PER.scenes.some(s => s.id === 'exo-plustard') ? 'exo-plustard' : 'content'); });
  button(k, 408, y, 196, 60, 'Je te dis !', () => { if (PER) PER.stop(); V.anniv = { mois: 0, t: k.now }; }, { fill: true });
  X.restore();
}
const RAISONS = { photo: 'Une photo', anniversaire: 'Ton anniversaire', rencontre: 'Notre rencontre', record: 'Un record', trophee: 'Un trophée', look: 'Un nouveau look', ami: 'Une visite', jeu: 'Une partie gagnée' };
const longDate = t => { const d = new Date(t); return `${d.getDate() === 1 ? '1er' : d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`; };
function image(src) {
  let im = V.imgs.get(src); if (im) return im;
  im = new Image(); im.decoding = 'async'; im.onload = () => { if (L) L.dirty = true; }; im.src = src;
  if (V.imgs.size > 40) V.imgs.clear();
  V.imgs.set(src, im); return im;
}
function drawAlbum(k) {                                // « montre l'album »: his photos, one by one, as polaroids
  const al = P.album, a = V.album, X = k.X, Dm = k.c.D;
  const list = a.list.map(id => al.photos.find(p => p.id === id)).filter(Boolean);
  if (!list.length) { V.album = null; return; }
  a.i = clamp(a.i, 0, list.length - 1);
  const p = list[a.i], e = k.now - a.t;
  if (e > 6000) { if (a.i >= list.length - 1) { V.album = null; return; } a.i++; a.t = k.now; }
  const next = list[a.i + 1]; if (next) image(next.src);
  const im = image(p.src), kk = clamp(e / 320, 0, 1), slide = (1 - (1 - kk) ** 3) * 1, tilt = (a.i % 2 ? 1 : -1) * 0.025;
  X.save(); X.shadowBlur = 0;
  X.translate(400 + (1 - slide) * 420, 236); X.rotate(tilt * slide);
  X.fillStyle = 'rgba(0,0,0,0.35)'; X.fillRect(-296, -192, 604, 408);
  X.fillStyle = '#fbfaf5'; X.fillRect(-304, -200, 608, 410);
  if (im.complete && im.naturalWidth) { X.imageSmoothingEnabled = true; X.drawImage(im, -288, -184, 576, 346); } else { X.fillStyle = '#d9d3c4'; X.fillRect(-288, -184, 576, 346); }
  X.fillStyle = '#2c2c30'; X.font = k.T.font(26); X.textAlign = 'center'; X.textBaseline = 'top';
  X.fillText(k.fit(`${longDate(p.t)} · ${RAISONS[p.raison] || 'Un souvenir'}${p.fav ? ' ★' : ''}`, 560, 26), 0, 170);
  X.restore();
  k.txt(`${a.i + 1} / ${list.length}`, 24, 14, 26, Dm);
  button(k, 712, 8, 72, 56, '×', () => { V.album = null; }, { size: 36 });
  k.hit(0, 64, 260, 416, () => { a.i = Math.max(0, a.i - 1); a.t = k.now; });
  k.hit(260, 64, 540, 416, () => { if (a.i >= list.length - 1) V.album = null; else { a.i++; a.t = k.now; } });
}

/* ---------- the phone: the « Souvenirs » sheet (tabs Souvenirs, Carnet, Album) ---------- */
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const bt = (text, cls, fn) => { const b = el('button', cls, text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; };
let pv = null, tab = 'souvenirs', drawn = {}, viewer = null;
const PANEL = typeof document !== 'undefined' && !KIOSK && !LAB;
function sure(b, label, fn) {                           // a second touch within 4 s confirms
  let at = 0, tmo = 0;
  b.addEventListener('click', () => {
    if (Date.now() - at < 4000) { at = 0; clearTimeout(tmo); b.textContent = label; fn(); return; }
    at = Date.now(); b.textContent = 'Sûr ? Touche encore'; clearTimeout(tmo); tmo = setTimeout(() => { at = 0; b.textContent = label; }, 4000);
  });
}
function build() {
  const links = document.querySelector('main.device .kfoot span');
  if (!PANEL || !links || pv) return;
  const goS = bt('Souvenirs', 'follow souv-go'), goA = bt('Album', 'follow souv-go');
  goS.title = 'Ses souvenirs et ton carnet d’humeur'; goA.title = 'L’album photo de Pixel';
  const apk = links.querySelector('#apk'); for (const b of [goS, goA]) { if (apk) apk.before(b); else links.append(b); }
  const root = el('div', 'souv'); root.id = 'souv'; root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'souvTitle');
  const sheet = el('div', 'souv-sheet'), head = el('header', 'souv-head'), h2 = el('h2', null, 'Souvenirs'), x = bt('×', 'souv-x', () => panel(false));
  h2.id = 'souvTitle'; x.setAttribute('aria-label', 'Fermer'); head.append(h2, x);
  const tabs = el('div', 'souv-tabs'); tabs.setAttribute('role', 'tablist');
  const panes = {}, tb = {};
  for (const [id, label] of [['souvenirs', '🎂 Souvenirs'], ['carnet', '🙂 Carnet'], ['album', '📷 Album']]) {
    const b = bt(label, 'souv-tab', () => show(id)); b.setAttribute('role', 'tab'); b.id = 'souvTab-' + id; b.setAttribute('aria-controls', 'souvPane-' + id);
    const pane = el('section', 'souv-pane'); pane.id = 'souvPane-' + id; pane.setAttribute('role', 'tabpanel'); pane.setAttribute('aria-labelledby', b.id);
    tabs.append(b); tb[id] = b; panes[id] = pane;
  }
  const v = el('div', 'souv-view'); v.hidden = true; v.setAttribute('role', 'dialog'); v.setAttribute('aria-label', 'Photo');
  sheet.append(head, tabs, ...Object.values(panes)); root.append(sheet, v); document.body.append(root);
  pv = { root, sheet, goS, goA, panes, tb, view: v, h2 };
  goS.addEventListener('click', () => panel(true, 'souvenirs'));
  goA.addEventListener('click', () => panel(true, 'album'));
  root.addEventListener('click', e => { if (e.target === root) panel(false); });
  root.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') back(); });   // typing here is not a command (app.js)
  if (typeof MutationObserver === 'function') new MutationObserver(() => { if (document.body.classList.contains('poche')) panel(false); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  const form = document.getElementById('cmdForm'), cmd = document.getElementById('cmd');   // « montre l'album » typed here opens it here
  if (form && cmd && !HOME) form.addEventListener('submit', () => { const r = command(cmd.value); if (r && r.action === 'album.montre') setTimeout(() => panel(true, 'album'), 50); }, true);
  addEventListener('resize', place);
  panelDraw();
}
const screenBox = () => { const c = document.getElementById('crt'); if (!c || c.offsetParent === null) return null; const r = c.getBoundingClientRect(); return r.height > 40 ? r : null; };
function place() {                                     // the sheet stops under Pixel's screen when there is room (you see him react)
  if (!pv || pv.root.hidden) return;
  const r = screenBox(), top = r && r.top >= -1 ? Math.ceil(r.bottom + 8) : 0, peek = top > 0 && innerHeight - top >= 380;
  pv.root.classList.toggle('peek', peek); pv.root.style.setProperty('--souv-top', peek ? top + 'px' : '');
}
function show(id) {
  tab = id; if (!pv) return;
  for (const [k, b] of Object.entries(pv.tb)) { b.setAttribute('aria-selected', String(k === id)); b.tabIndex = k === id ? 0 : -1; pv.panes[k].hidden = k !== id; }
  pv.h2.textContent = { souvenirs: 'Souvenirs', carnet: 'Mon carnet', album: 'L’album' }[id];
  drawn = {}; panelDraw();
}
function panel(open, which) {
  if (!pv) return false;
  if (open && document.body.classList.contains('poche')) return false;
  if (open) { const r = screenBox(); if (r && r.top < 0) window.scrollBy(0, r.top - 8); show(which || tab); }
  else closeViewer();
  pv.root.hidden = !open; document.body.classList.toggle('souv-on', !!open);
  if (open) { drawn = {}; panelDraw(); place(); pv.sheet.scrollTop = 0; const t = pv.tb[tab]; if (t) t.focus({ preventScroll: true }); }
  else (tab === 'album' ? pv.goA : pv.goS).focus({ preventScroll: true });
  return true;
}
function back() { if (viewer) { closeViewer(); return true; } if (pv && !pv.root.hidden) { panel(false); return true; } return false; }
function panelDraw() {
  if (!pv) return;
  const hu = P && P.humeur, live = !!(hu && (hu.question || (hu.du && !hu.aujourdhui)));
  pv.goS.classList.toggle('live', live && pv.root.hidden);
  const lab = live && pv.root.hidden ? 'Souvenirs •' : 'Souvenirs'; if (pv.goS.textContent !== lab) pv.goS.textContent = lab;
  pv.goS.hidden = pv.goA.hidden = !(P && P.souvenirs);
  if (pv.root.hidden || !P) return;
  if (tab === 'souvenirs') drawSouvenirs(); else if (tab === 'carnet') drawCarnet(); else drawAlbumPane();
  if (viewer) drawViewer();
}
/* -- the Souvenirs tab -- */
const short = t => { const d = new Date(t); return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`; };
const EMO = { rencontre: '🤝', anniversaire: '🎂', 'rencontre-an': '🎉', jours: '🎈', record: '🔥', chrono: '⏱️', trophee: '🏆', repas: '🍕', ami: '👋', look: '👕', jeu: '🎲', perso: '⭐', photo: '📷' };
function drawSouvenirs() {
  const s = P.souvenirs, key = JSON.stringify([s.anniv, s.anniv_dans, s.rencontre, s.depuis, s.fete, s.aujourdhui, s.records, s.timeline, (P.album && P.album.photos || []).map(p => p.id)]);
  if (drawn.s === key) return; drawn.s = key;
  const pane = pv.panes.souvenirs, out = [];
  const f = s.fete || (s.aujourdhui && (s.aujourdhui.mois || s.aujourdhui.jours));
  if (f) {
    const ban = el('div', 'souv-fete');
    ban.append(el('p', null, s.fete === 'anniversaire' ? '🎉 Aujourd’hui, c’est ton anniversaire !' : s.fete === 'rencontre' ? `🎉 Ça fait ${s.aujourdhui.ans > 1 ? s.aujourdhui.ans + ' ans' : 'un an'} qu’on se connaît !`
      : s.aujourdhui.jours ? `🎈 ${s.aujourdhui.jours} jours ensemble aujourd’hui !` : `🎈 Ça fait ${s.aujourdhui.mois} mois qu’on se connaît !`));
    if (s.fete) ban.append(bt('Refaire la fête', 'souv-btn main', () => send('souvenirs.fete')));
    out.push(ban);
  }
  // your birthday
  const ca = el('section', 'souv-card'); ca.append(el('h3', null, '🎂 Ton anniversaire'));
  ca.append(el('p', 'souv-big', s.anniv ? `${s.anniv_texte.replace(/^le /, 'Le ')}` + (s.anniv_dans === 0 ? ' : c’est aujourd’hui !' : ` · dans ${s.anniv_dans} jour${s.anniv_dans > 1 ? 's' : ''}`) : 'Pas encore noté.'));
  const row = el('div', 'souv-row'), sj = el('select'), sm = el('select');
  sj.setAttribute('aria-label', 'Jour'); sm.setAttribute('aria-label', 'Mois');
  for (let d = 1; d <= 31; d++) { const o = el('option', null, String(d)); o.value = String(d); sj.append(o); }
  MOIS.forEach((m, i) => { const o = el('option', null, m); o.value = String(i + 1); sm.append(o); });
  sj.value = String(s.anniv ? s.anniv.jour : 1); sm.value = String(s.anniv ? s.anniv.mois : 1);
  const fixDays = () => { const n = dim(2024, +sm.value); [...sj.options].forEach(o => { o.disabled = +o.value > n; }); if (+sj.value > n) sj.value = String(n); };
  sm.addEventListener('change', fixDays); fixDays();
  row.append(sj, sm, bt(s.anniv ? 'Changer' : 'Enregistrer', 'souv-btn main', () => send('souvenirs.anniversaire', { jour: +sj.value, mois: +sm.value })));
  ca.append(row);
  if (s.anniv) { const o = bt('Oublier', 'souv-btn'); sure(o, 'Oublier', () => send('souvenirs.anniversaire', { jour: null, mois: null })); ca.append(o); }
  out.push(ca);
  // the day you met
  const cr = el('section', 'souv-card'); cr.append(el('h3', null, '🤝 Le jour de notre rencontre'));
  const rd = parseDay(s.rencontre);
  cr.append(el('p', 'souv-big', rd ? `${longDate(rd.getTime())} · ça fait ${s.depuis} jour${s.depuis > 1 ? 's' : ''}` : '—'));
  const rr = el('div', 'souv-row'), di = el('input'); Object.assign(di, { type: 'date', value: s.rencontre || '', min: '2020-01-01', max: today() }); di.setAttribute('aria-label', 'Le jour de notre rencontre');
  rr.append(di, bt('Changer', 'souv-btn', () => { if (parseDay(di.value)) send('souvenirs.rencontre', { date: di.value }); }));
  cr.append(rr);
  if (s.rencontre_auto) cr.append(el('p', 'souv-note', 'Le jour où Pixel s’est allumé pour la première fois. Tu peux le changer.'));
  out.push(cr);
  // his records
  const R = s.records || {}, cd = el('section', 'souv-card'); cd.append(el('h3', null, '🏆 Tes records'));
  const dl = el('dl', 'souv-dl');
  const PF = window.PixelFoods, food = R.premier_repas ? ((PF && PF.BY[R.premier_repas.id]) || { label: R.premier_repas.label }).label : '';
  for (const [a, b] of [['Meilleure série aux exos', R.serie_max ? String(R.serie_max) : '—'], ['Record du défi chrono', R.record_chrono ? String(R.record_chrono) : '—'],
    ['Premier repas', food ? `${food} (${short(R.premier_repas.t || Date.now())})` : '—'], ['Premier trophée', R.premier_trophee ? R.premier_trophee.label : '—'], ['Trophées', String(R.trophees || 0)]]) dl.append(el('dt', null, a), el('dd', null, b));
  cd.append(dl, bt('Raconte-moi un souvenir', 'souv-btn', () => send('souvenirs.raconte')));
  out.push(cd);
  // the timeline
  const ct = el('section', 'souv-card'); ct.append(el('h3', null, '📖 Nos souvenirs'));
  const add = el('form', 'souv-row souv-add'), ti = el('input'); Object.assign(ti, { type: 'text', maxLength: TEXT_MAX, placeholder: 'Ajoute un souvenir…', enterKeyHint: 'done' }); ti.setAttribute('aria-label', 'Un souvenir à ajouter');
  add.append(ti, bt('Ajouter', 'souv-btn main')); add.lastChild.type = 'submit';
  add.addEventListener('submit', e => { e.preventDefault(); const t = cleanText(ti.value); if (t) { send('souvenirs.ajoute', { type: 'perso', texte: t }); ti.value = ''; } });
  ct.append(add);
  const ol = el('ol', 'souv-tl'), photos = (P.album && P.album.photos) || [];
  for (const e of s.timeline || []) {
    const li = el('li', e.epingle ? 'pin' : null), ph = e.photo && photos.find(p => p.id === e.photo);
    li.append(el('span', 'souv-emo', EMO[e.type] || '⭐'));
    const body = el('div', 'souv-tx'); body.append(el('time', null, short(e.t)), el('p', null, e.texte)); li.append(body);
    if (ph) { const im = el('img', 'souv-thumb'); im.alt = 'La photo de ce moment'; im.loading = 'lazy'; im.src = ph.src; im.addEventListener('click', () => openViewer(ph.id)); li.append(im); }
    const pin = bt(e.epingle ? '📌' : '📍', 'souv-ic', () => send('souvenirs.epingle', { id: e.id, on: !e.epingle }));
    pin.setAttribute('aria-pressed', String(e.epingle)); pin.setAttribute('aria-label', e.epingle ? 'Désépingler' : 'Épingler (il le garde toujours)'); pin.title = pin.getAttribute('aria-label');
    li.append(pin);
    if (e.type !== 'rencontre') { const del = bt('🗑', 'souv-ic'); del.setAttribute('aria-label', 'Effacer ce souvenir'); del.title = 'Effacer'; sure(del, '🗑', () => send('souvenirs.efface', { id: e.id })); li.append(del); }
    ol.append(li);
  }
  ct.append(ol, el('p', 'souv-note', `${TIMELINE_MAX} souvenirs au plus : les plus anciens s’en vont, jamais ceux que tu épingles (📌).`));
  out.push(ct);
  pane.replaceChildren(...out);
}
/* -- the Carnet tab -- */
const COL = { super: '#f2c94c', bien: '#6fcf97', bof: '#b6b6b6', triste: '#56a0e8', colere: '#eb5757' };
let chipSel = null, chipT = 0;
function drawCarnet() {
  const h = P.humeur; if (!h) return;
  const key = JSON.stringify([h, chipSel]);
  if (drawn.c === key) return; drawn.c = key;
  const pane = pv.panes.carnet, out = [], td = h.aujourdhui;
  if (chipSel === null) chipSel = td ? [...td.chips] : [];
  const q = el('section', 'souv-card souv-today'); q.append(el('h3', null, h.question ? '💬 Pixel te demande…' : '🙂 Aujourd’hui'));
  q.append(el('p', 'souv-big', td ? `${MOOD[td.m][2]} ${MOOD[td.m][1]}${td.chips.length ? ' · ' + td.chips.map(c => CHIP[c]).join(', ') : ''}` : named('Comment tu vas aujourd’hui ?')));
  const faces = el('div', 'souv-faces'); faces.setAttribute('role', 'group'); faces.setAttribute('aria-label', 'Comment tu vas');
  for (const [m, label, emo] of MOODS) {
    const b = bt('', 'souv-face', () => { send('humeur.note', { m, chips: chipSel || [] }); });
    b.append(el('span', 'souv-emoji', emo), el('span', null, label)); b.style.setProperty('--mood', COL[m]);
    b.setAttribute('aria-pressed', String(!!td && td.m === m)); faces.append(b);
  }
  const chips = el('div', 'souv-chips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', 'Pourquoi');
  for (const [id, label] of CHIPS) {
    const on = chipSel.includes(id), b = bt(label, 'souv-chip', () => {
      chipSel = on ? chipSel.filter(x => x !== id) : chipSel.length < CHIPS_MAX ? [...chipSel, id] : chipSel; drawn.c = ''; drawCarnet();
      clearTimeout(chipT); if (td) chipT = setTimeout(() => send('humeur.note', { m: td.m, chips: chipSel }), 900);   // already said today: the words join it
    });
    b.setAttribute('aria-pressed', String(on)); chips.append(b);
  }
  q.append(faces, el('p', 'souv-note', 'Et pourquoi ? (pas obligé)'), chips);
  out.push(q);
  // the week, the month
  const byDay = Object.fromEntries((h.jours || []).map(x => [x.jour, x])), now = new Date();
  const cell = (d, cls) => {
    const k = ymd(d), x = byDay[k], c = el('div', 'souv-day' + (cls ? ' ' + cls : '') + (k === today() ? ' today' : ''));
    c.append(el('span', 'souv-dn', String(d.getDate()))); if (x) { c.append(el('span', 'souv-emoji', MOOD[x.m][2])); c.style.setProperty('--mood', COL[x.m]); c.classList.add('has'); c.title = `${MOOD[x.m][1]}${x.chips.length ? ' · ' + x.chips.map(c2 => CHIP[c2]).join(', ') : ''}`; c.setAttribute('aria-label', `${d.getDate()} : ${c.title}`); }
    return c;
  };
  const wk = el('section', 'souv-card'); wk.append(el('h3', null, '📅 Cette semaine'));
  const week = el('div', 'souv-week'), mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].forEach((n, i) => { const w = el('div', 'souv-wd'); w.append(el('span', null, n), cell(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i))); week.append(w); });
  wk.append(week); out.push(wk);
  const mo = el('section', 'souv-card'); mo.append(el('h3', null, `🗓️ ${MOIS[now.getMonth()].charAt(0).toUpperCase() + MOIS[now.getMonth()].slice(1)} ${now.getFullYear()}`));
  const grid = el('div', 'souv-month'); for (const n of ['L', 'M', 'M', 'J', 'V', 'S', 'D']) grid.append(el('span', 'souv-mh', n));
  const first = new Date(now.getFullYear(), now.getMonth(), 1); for (let i = 0; i < (first.getDay() + 6) % 7; i++) grid.append(el('span'));
  for (let d = 1; d <= dim(now.getFullYear(), now.getMonth() + 1); d++) grid.append(cell(new Date(now.getFullYear(), now.getMonth(), d), 'small'));
  const legend = el('div', 'souv-legend'); for (const [m, label, emo] of MOODS) { const s = el('span'); s.style.setProperty('--mood', COL[m]); s.append(el('i'), document.createTextNode(`${emo} ${label}`)); legend.append(s); }
  mo.append(grid, legend); out.push(mo);
  // the settings
  const st = el('section', 'souv-card'); st.append(el('h3', null, '⚙️ Réglages du carnet'));
  const sw = (label, help, on, fn) => { const b = bt('', 'souv-sw', fn); b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', String(on)); b.append(el('span', null, label), el('small', null, help), el('i')); return b; };
  st.append(sw('Il me demande comment je vais', 'Une fois par jour, jamais la nuit.', h.on, () => send('humeur.reglages', { on: !h.on })));
  const tr = el('label', 'souv-row'), sel = el('select');
  for (let m = HEURE_MIN; m <= HEURE_MAX; m += 30) { const o = el('option', null, `${Math.floor(m / 60)} h ${p2(m % 60)}`); o.value = String(m); sel.append(o); }
  sel.value = String(h.heure - h.heure % 30); sel.addEventListener('change', () => send('humeur.reglages', { heure: +sel.value })); sel.disabled = !h.on;
  tr.append(el('span', null, 'À partir de'), sel); st.append(tr);
  st.append(sw('Claude peut savoir comment je vais', 'Éteint : ton carnet reste entre Pixel et toi.', h.claude, () => send('humeur.reglages', { claude: !h.claude })));
  const er = bt('Effacer le carnet', 'souv-btn warn'); sure(er, 'Effacer le carnet', () => { chipSel = []; send('humeur.efface'); }); st.append(er);
  st.append(el('p', 'souv-note', LOCAL ? 'Ton carnet reste sur ce téléphone, rien que pour toi.' : 'Ton carnet reste sur Pixel, rien que pour toi : ton téléphone ne le garde pas.'));
  out.push(st);
  pane.replaceChildren(...out);
}
/* -- the Album tab, and its full screen view -- */
function drawAlbumPane() {
  const al = P.album; if (!al) return;
  const key = JSON.stringify([al.photos, al.demande]);
  if (drawn.a === key) return; drawn.a = key;
  const pane = pv.panes.album, out = [];
  const top = el('section', 'souv-card'), shoot = bt('📷 Prends une photo !', 'souv-btn main big', () => { send('album.photo'); });
  shoot.disabled = !!al.demande;
  top.append(shoot, el('p', 'souv-note', al.demande ? 'Pixel prend la pose sur son écran… Cheese !' : 'Pixel prend la pose sur son écran, et la photo arrive ici.'));
  if (al.photos.length) top.append(bt(LOCAL ? 'Le diaporama' : 'Montre-les sur l’écran de Pixel', 'souv-btn', () => send('album.montre')));
  out.push(top);
  const grid = el('div', 'souv-grid');
  for (const p of al.photos) {
    const b = bt('', 'souv-ph' + (p.id === V.newPhoto ? ' new' : ''), () => openViewer(p.id)); b.setAttribute('aria-label', `${longDate(p.t)} · ${RAISONS[p.raison] || 'Un souvenir'}${p.fav ? ', préférée' : ''}`);
    const im = el('img'); im.alt = ''; im.loading = 'lazy'; im.src = p.src; b.append(im);
    if (p.fav) b.append(el('span', 'souv-star', '★'));
    grid.append(b);
  }
  if (!al.photos.length) grid.append(el('p', 'souv-note', 'Pas encore de photo. Touche « Prends une photo ! », ou dis-le-lui.'));
  out.push(grid, el('p', 'souv-note', `${al.max} photos au plus : les plus anciennes s’en vont, jamais tes préférées (★, ${al.fav_max} au plus).`));
  pane.replaceChildren(...out);
}
function openViewer(id) { viewer = { id }; if (pv) { pv.view.hidden = false; drawViewer(); } }
function closeViewer() { viewer = null; if (pv) pv.view.hidden = true; }
function drawViewer() {
  const al = P && P.album, list = (al && al.photos) || [], i = list.findIndex(p => p.id === viewer.id);
  if (i < 0) { closeViewer(); return; }
  const p = list[i], v = pv.view, im = el('img', 'souv-big-img'); im.src = p.src; im.alt = `La photo du ${longDate(p.t)}`;
  const cap = el('p', 'souv-cap', `${longDate(p.t)} · ${RAISONS[p.raison] || 'Un souvenir'}`);
  const bar = el('div', 'souv-vbar');
  const prev = bt('‹', 'souv-btn', () => openViewer(list[i - 1].id)), next = bt('›', 'souv-btn', () => openViewer(list[i + 1].id));
  prev.disabled = i === 0; next.disabled = i === list.length - 1; prev.setAttribute('aria-label', 'Photo précédente'); next.setAttribute('aria-label', 'Photo suivante');
  const fav = bt(p.fav ? '★ Préférée' : '☆ Préférée', 'souv-btn', () => send('album.fav', { id: p.id, on: !p.fav })); fav.setAttribute('aria-pressed', String(p.fav));
  const dl = el('a', 'souv-btn', 'Enregistrer'); dl.href = LOCAL || LAB || /^blob:|^data:/.test(p.src) ? p.src : p.src + '?dl=1';
  const d = new Date(p.t); dl.download = `pixel-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}.${/webp/.test(p.src) ? 'webp' : 'jpg'}`;
  const del = bt('Supprimer', 'souv-btn warn'); sure(del, 'Supprimer', () => { send('album.supprime', { id: p.id }); closeViewer(); });
  const x = bt('×', 'souv-x', closeViewer); x.setAttribute('aria-label', 'Fermer la photo');
  bar.append(prev, fav, dl, del, next);
  v.replaceChildren(x, im, cap, bar);
}
if (typeof document !== 'undefined' && PANEL) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else setTimeout(build); }

return {
  rules, hub, command, memory, memoire: () => memory().texte, info, view, asleep, back,
  get mirror() { return mirror; }, get home() { return HOME; },
  panel(open, which) { if (open === false) return panel(false); return panel(true, which === 'album' ? 'album' : which === 'carnet' ? 'carnet' : 'souvenirs'); },
  get isOpen() { return !!pv && !pv.root.hidden; }, get viewer() { return viewer ? viewer.id : null; },
  diapo, get V() { return { album: V.album && { ...V.album }, anniv: V.anniv && { ...V.anniv }, chips: V.chips && { ...V.chips }, hidden: V.hidden }; },
  layout: { face: FB, faces: MOODS.map((m, i) => ({ m: m[0], x: 16 + i * 154, y: 214, w: 148, h: 188 })), chips: CHIPS.map((c, i) => ({ id: c[0], x: 16 + (i % 4) * 194, y: 216 + Math.floor(i / 4) * 80, w: 186, h: 70 })) },
  ask: () => { if (PER) { play('souvenir-question'); } },   // the lab: he asks your birthday now
  step: (force = true) => initiative(force),
};
})();
