/* Scene pack « notifs » — Notifications: what he does when a notification arrives (event "notif", data.msg = the banner text).
   See the top of web/persona.js: scenes are defined with S('id', 'Label', 'group', { ... }) on one line each
   (pixel/scenes.py reads them), groups tap / fache / calin / retour / vie / evt, plus "on" (events) and "pool" (touch pools).
   The banner shows at the top of the screen while he reacts: every scene speaks beside him (side: true), and in its first
   seconds he steps aside, crouches or shrinks a little so his bubble stays under the banner, and his props stay low.
   Three kinds of scenes:
     - generic reactions (no "when"): any notification;
     - keyword families (when: the banner's text matches, w 4 to 6): messages, mail, calls, agenda, parcels, money...;
     - the rhythm: at night (23 h - 7 h) he grumbles, and three notifications or more within a minute overwhelm him.
   A message with its own family, the night or a burst makes the generic reactions step aside (their weight drops). */
(window.PixelScenePacks ||= []).push(({ S: S0, L, pick, sm, out, inn, seg, bump, tri, jumps, clamp, rnd, TAU, W, HT, A, H, prop }) => {
const MINE = [];
const S = (id, label, group, o) => { const s = S0(id, label, group, { side: true, on: ['notif'], ...o }); MINE.push(s); return s; };

/* ---------- small helpers ---------- */
const fin = (e, a, b) => 1 - sm(seg(e, a, b));                       // 1, then down to 0 between a and b
const io = (e, a, b, c, d) => sm(seg(e, a, b)) * fin(e, c, d);         // 0 -> 1 (a..b) -> 0 (c..d)
const shake = (e, per, amp) => amp * Math.sin(e / per);
const V = (...ls) => o => { const x = pick(ls); return typeof x === 'function' ? x(o) : x; };   // lines that may use the data
const clean = s => { s = String(s || '').replace(/\s+/g, ' ').trim(); if (s === s.toUpperCase() && /[A-ZÀ-Ý]{3}/.test(s)) s = s.charAt(0) + s.slice(1).toLowerCase(); return s; };
const short = (s, n = 22) => { s = clean(s); return s.length <= n ? s : s.slice(0, n - 1).replace(/[\s,.;:!?…-]+$/, '') + '…'; };
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const who = s => { const m = /\b(?:de|from|par)\s+([A-ZÀ-Ý][A-Za-zÀ-ÿ’'-]{1,13})/.exec(String(s || '')); return m ? m[1] : ''; };
const quote = (o, n = 20) => (o && o.msg ? `« ${short(o.msg, n)} »` : '« Rien d’important »');
const today = () => new Date().getDate();
const night = () => { const h = new Date().getHours(); return h >= 23 || h < 7; };

/* ---------- what the banner says: keyword families (on the text without accents, in lower case) ---------- */
const RX = {
  sms: /\b(messages?|sms|mms|textos?|whatsapp|messenger|signal|telegram|imessage|t'a ecrit|t’a ecrit|t'ecrit|t’ecrit)\b/,
  mail: /\b(e-?mails?|mails?|courriels?|gmail|outlook|newsletter|boite de reception)\b/,
  appel: /\b(appels?|appelle|appeler|call|calling|telephone|facetime|visio|sonnerie|repondeur)\b/,
  rdv: /\b(rappels?|reunions?|rdv|rendez-vous|agenda|meeting|evenements?|calendrier|stand-?up|reservation)\b/,
  colis: /\b(colis|livraisons?|livree?|livreur|amazon|paquets?|commandes?|facteur|chronopost|colissimo|ups|dhl|relais|expediee?)\b/,
  anniv: /\b(anniv|anniversaires?|birthday|bougies?)\b/,
  erreur: /\b(erreurs?|echecs?|echoue|error|errors|failed|fail|impossible|refusee?|introuvable|inconnue?|probleme|plante|crash|reessaie)\b/,
  ok: /\b(fini|finie|termine|terminee|succes|reussie?|reussite|done|bravo|gagne|gagnee|associe|validee?|felicitations|ok)\b/,
  urgent: /\b(alertes?|urgent|urgente|urgence|alarme|danger|dangereux|evacu\w*|incendie|inondation)\b/,
  orage: /\b(orages?|orageux|tempete|vigilance|canicule|grele|eclairs?|tonnerre)\b/,
  batt: /\b(batterie|battery|chargeur|recharge|rechargee|autonomie|en charge|charge complete|charge faible)\b/,
  musique: /\b(musique|music|spotify|deezer|chansons?|playlists?|albums?|radio|podcasts?|concert|morceau|soundcloud)\b|♪|♫/,
  video: /\b(videos?|youtube|netflix|twitch|films?|series?|streaming|stream|episodes?|disney|en direct|live)\b/,
  sous: /€|\$|\b(paiement|virement|euros?|banque|payee?|rembourse\w*|salaire|paypal|lydia|cagnotte|prime)\b/,
  facture: /\b(factures?|prelevements?|debit|debite|loyer|impots?|amende|a payer|decouvert)\b/,
  groupe: /\b(discord|slack|teams|serveur|canal|channel|mentionne|mention|groupe|thread)\b|(^|\s)[@#][a-z]/,
  git: /\b(github|gitlab|pull request|pr|merge|merged|commits?|push|issues?|build|pipeline|deploy|deploiement|release|review)\b/,
  minuteur: /\b(minuteur|timer|chrono|chronometre|sablier|pomodoro|compte a rebours)\b/,
  meteo: /°c|\b(meteo|pluie|pluvieux|soleil|ensoleille|neige|nuages?|nuageux|degres|vent|averses?|brouillard|parapluie|eclaircies?)\b/,
  hue: /\b(hue|lumieres?|lampes?|ampoule|scene|pont|eclairage|veilleuse)\b/,
  ia: /\b(claude|codex|anthropic|chatgpt|gpt|ia|robots?|quota)\b/,
  like: /\b(likes?|aime|j'aime|j’aime|abonnes?|abonnee|followers?|follow|suit|reactions?|coeurs?|partage|retweet|commentaires?|commente|instagram|insta|tiktok)\b/,
  famille: /\b(maman|mama|mamie|mamy|papa|papi|papy|grand-mere|grand-pere|mon frere|ma soeur|tata|tonton|tante|oncle)\b/,
  maj: /\b(mise a jour|mises a jour|a jour|maj|update|updates|version|installation|installe|upgrade|redemarrage|reboot|redemarre)\b/,
  bye: /\b(extinction|eteindre|eteins|a bientot|au revoir|bye|bonne nuit)\b/,
  miam: /\b(pizza|uber ?eats|deliveroo|repas|diner|dejeuner|resto|restaurant|manger|burger|sushis?|croissants?|gateau|chocolat|apero)\b/,
};
const LONG = 140;                                   // a long text (the help, the list of scenes): « le pavé »
/* once per notification (the same data object for every scene that looks at it): its words, the burst, the night */
const STAMPS = []; let lastD = null, lastI = null;
function info(d) {
  if (d && d === lastD && lastI) return lastI;
  const now = H.now(); while (STAMPS.length && now - STAMPS[0] > 60000) STAMPS.shift(); STAMPS.push(now);
  const m = norm(d && d.msg), long = m.length > LONG;
  lastD = d; lastI = { m, long, n: STAMPS.length, night: night(), own: long || (/[a-z]/.test(m) && Object.values(RX).some(re => re.test(m))) };
  const away = lastI.own || lastI.night || lastI.n >= 3;
  for (const s of GEN) s.w = s.w0 * (away ? 0.1 : 1);           // the generic reactions step aside
  return lastI;
}
const has = (...keys) => d => { const i = info(d); return !i.long && keys.some(k => RX[k].test(i.m)); };
const hasNot = (keys, not) => d => { const i = info(d); return !i.long && keys.some(k => RX[k].test(i.m)) && !RX[not].test(i.m); };
const caps = d => { const s = String((d && d.msg) || ''), letters = s.replace(/[^A-Za-zÀ-ÿ]/g, ''); info(d); return letters.length >= 8 && letters === letters.toUpperCase() && s.length <= LONG; };

/* ---------- props: drawn with the face's pixel (D.U), solid shapes, in the theme's colours ---------- */
const box = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const disc = (g, x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, Math.max(0.5, r), 0, TAU); g.fill(); };
const poly = (g, pts, c) => { g.fillStyle = c; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };
const line = (D, x1, y1, x2, y2, w, c) => { const g = D.g; g.strokeStyle = c; g.lineWidth = D.lw(w); g.lineCap = 'round'; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
const quad = (D, u0, v0, u1, v1, c) => { const a = D.P(u0, v0), b = D.P(u1, v0), d = D.P(u1, v1), e = D.P(u0, v1); poly(D.g, [[a.x, a.y], [b.x, b.y], [d.x, d.y], [e.x, e.y]], c); };
const ang = D => { const a = D.P(0, 27), b = D.P(96, 27); return Math.atan2(b.y - a.y, b.x - a.x); };   // his tilt on the screen

prop('notifEnvelope', (D, x, y, s = 1, open = 0, r = 0, letter = 0) => {       // an envelope, its flap opening, a letter coming out
  const g = D.g, u = D.U * s, c = D.col, w = 12 * u, h = 8 * u, lid = -h / 2 + 5 * u * (1 - 2 * clamp(open, 0, 1));
  const flap = () => poly(g, [[-w / 2, -h / 2], [w / 2, -h / 2], [0, lid]], c.hi);
  g.save(); g.translate(x, y); g.rotate(r);
  if (open > 0.5) flap();
  if (letter > 0) { const ly = -h / 2 - 6 * u * letter; box(g, -4.5 * u, ly, 9 * u, 7 * u, c.hi); box(g, -3 * u, ly + 1.5 * u, 6 * u, u, c.dim); box(g, -3 * u, ly + 3.5 * u, 4 * u, u, c.dim); }
  box(g, -w / 2, -h / 2, w, h, c.fg);
  g.strokeStyle = c.dim; g.lineWidth = D.lw(0.8 * u); g.beginPath(); g.moveTo(-w / 2, h / 2); g.lineTo(0, 0.6 * u); g.lineTo(w / 2, h / 2); g.stroke();
  if (open <= 0.5) { flap(); D.heart(0, lid - 2.4 * u, 2.6 * u, c.pink); }
  g.restore();
});
prop('notifPhone', (D, x, y, s = 1, ring = 0, r = 0) => {                     // a smartphone, ringing
  const g = D.g, u = D.U * s, c = D.col;
  g.save(); g.translate(x, y); g.rotate(r);
  box(g, -3.8 * u, -6.5 * u, 7.6 * u, 13 * u, c.fg); box(g, -2.8 * u, -5 * u, 5.6 * u, 9 * u, c.bg);
  disc(g, 0, -2.4 * u, 1.4 * u, c.hi); disc(g, -1.4 * u, 2 * u, 0.9 * u, c.fg); disc(g, 1.4 * u, 2 * u, 0.9 * u, c.pink);
  box(g, -1.2 * u, 4.8 * u, 2.4 * u, 0.9 * u, c.dim);
  if (ring > 0) for (const sd of [-1, 1]) for (let i = 1; i <= 2; i++) { g.strokeStyle = c.acc; g.lineWidth = D.lw(0.8 * u); g.beginPath(); g.arc(sd * 4.5 * u, -2 * u, (1.6 + 1.6 * i) * u, sd > 0 ? -0.7 : Math.PI - 0.7, sd > 0 ? 0.7 : Math.PI + 0.7); g.stroke(); }
  g.restore();
});
prop('notifBell', (D, x, y, s = 1, swing = 0, ding = 0) => {                  // a bell swinging from its knob (x, y)
  const g = D.g, u = D.U * s, c = D.col;
  g.save(); g.translate(x, y); g.rotate(swing);
  disc(g, 0, 0, 1.3 * u, c.fg);
  g.fillStyle = c.acc; g.beginPath(); g.moveTo(-1.5 * u, 1 * u); g.quadraticCurveTo(-4.6 * u, 2 * u, -4.6 * u, 7 * u); g.lineTo(-5.6 * u, 8.6 * u); g.lineTo(5.6 * u, 8.6 * u); g.lineTo(4.6 * u, 7 * u); g.quadraticCurveTo(4.6 * u, 2 * u, 1.5 * u, 1 * u); g.closePath(); g.fill();
  box(g, -6 * u, 8.4 * u, 12 * u, 1.4 * u, c.hi); box(g, -2.8 * u, 3 * u, 1.1 * u, 3.6 * u, c.hi);
  disc(g, -swing * 7 * u, 10.8 * u, 1.3 * u, c.fg);
  g.restore();
  if (ding > 0) for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) { const a = sd > 0 ? -0.6 + i * 0.6 : Math.PI + 0.6 - i * 0.6, r0 = 8.5 * u, r1 = 11.5 * u; line(D, x + Math.cos(a) * r0, y + 5 * u + Math.sin(a) * r0, x + Math.cos(a) * r1, y + 5 * u + Math.sin(a) * r1, 0.8 * u, c.hi); }
});
prop('notifParcel', (D, x, y, s = 1, open = 0, pop = 0, item = 'star') => {  // a cardboard box, its flaps opening, a surprise jumping out
  const g = D.g, u = D.U * s, c = D.col;
  g.save(); g.translate(x, y);
  if (pop > 0) { const py = -4.5 * u - 8 * u * pop; if (item === 'heart') D.heart(0, py - 2.5 * u, 5 * u, c.pink); else D.star(0, py, 3.6 * u, c.hi, pop * 2); }
  for (const sd of [-1, 1]) { g.save(); g.translate(sd * 6 * u, -4.5 * u); g.rotate(-sd * open * 2.3); box(g, sd > 0 ? -6 * u : 0, -1.2 * u, 6 * u, 1.2 * u, c.acc); g.restore(); }
  box(g, -6 * u, -4.5 * u, 12 * u, 9 * u, c.acc); box(g, -1 * u, -4.5 * u, 2 * u, 9 * u, c.dim); box(g, 2.2 * u, 0.8 * u, 3 * u, 2.2 * u, c.hi);
  g.restore();
});
prop('notifCalendar', (D, x, y, s = 1, flip = 0, day = 1) => {               // a calendar page, today's date, pages flipping
  const g = D.g, u = D.U * s, c = D.col;
  box(g, x - 6 * u, y - 6.5 * u, 12 * u, 3.5 * u, c.acc); box(g, x - 6 * u, y - 3 * u, 12 * u, 9.5 * u, c.hi);
  box(g, x - 3.8 * u, y - 7.8 * u, 1.3 * u, 2.6 * u, c.fg); box(g, x + 2.5 * u, y - 7.8 * u, 1.3 * u, 2.6 * u, c.fg);
  D.glyph(String(day), x, y + 1.9 * u, 7 * u, c.bg);
  if (flip > 0 && flip < 1) { const k = Math.cos(flip * Math.PI), h = 9.5 * u * Math.abs(k); if (k > 0) box(g, x - 6 * u, y - 3 * u, 12 * u, h, c.fg); else box(g, x - 6 * u, y - 3 * u - h, 12 * u, h, c.dim); }
});
prop('notifCoin', (D, x, y, s = 1, spin = 0) => {                            // a gold coin, spinning
  const g = D.g, u = D.U * s, c = D.col, k = Math.max(0.18, Math.abs(Math.cos(spin)));
  g.fillStyle = c.acc; g.beginPath(); g.ellipse(x, y, 3 * u * k, 3 * u, 0, 0, TAU); g.fill();
  if (k > 0.5) box(g, x - 0.5 * u * k, y - 1.8 * u, 1.1 * u * k, 3.6 * u, c.hi);
});
prop('notifCake', (D, x, y, s = 1, lit = 3, smoke = 0, e = 0) => {          // a birthday cake, three candles
  const g = D.g, u = D.U * s, c = D.col;
  box(g, x - 9.5 * u, y + 4.5 * u, 19 * u, 1.2 * u, c.dim);
  box(g, x - 7.5 * u, y, 15 * u, 4.5 * u, c.pink); box(g, x - 7.5 * u, y, 15 * u, 1.3 * u, c.hi);
  for (let i = 0; i < 4; i++) disc(g, x + (-5.6 + i * 3.7) * u, y + 1.4 * u, 0.8 * u, c.hi);
  box(g, x - 5 * u, y - 3.6 * u, 10 * u, 3.6 * u, c.pink); box(g, x - 5 * u, y - 3.6 * u, 10 * u, 1.1 * u, c.hi);
  for (let i = 0; i < 3; i++) {
    const cx = x + (i - 1) * 3.2 * u; box(g, cx - 0.55 * u, y - 6.8 * u, 1.1 * u, 3.2 * u, c.hi);
    if (i < lit) D.drop(cx, y - 8 * u - Math.abs(Math.sin(e / 90 + i)) * 0.6 * u, 1.4 * u, c.acc);
    else if (smoke > 0) { const q = (smoke + i * 0.2) % 1; D.ring(cx + Math.sin(q * 6) * u, y - 8 * u - q * 8 * u, (0.6 + q) * u, c.dim, 0.6 * u); }
  }
});
prop('notifBinoculars', (D, q = 1) => {                                       // binoculars raised to his eyes
  const c = D.col, l = D.P(34, 23 + (1 - q) * 20), r = D.P(66, 23 + (1 - q) * 20), U = D.U;
  line(D, l.x, l.y, r.x, r.y, 3 * U, c.fg);
  for (const p of [l, r]) { D.ring(p.x, p.y, 6.4 * U, c.fg, 2.2 * U); disc(D.g, p.x - 3 * U, p.y - 3 * U, 0.9 * U, c.hi); }
});
prop('notifArrow', (D, x, y, s = 1) => {                                     // a big arrow pointing up
  const g = D.g, u = D.U * s, c = D.col;
  box(g, x - 1.3 * u, y, 2.6 * u, 7 * u, c.acc); poly(g, [[x - 4 * u, y + 0.5 * u], [x + 4 * u, y + 0.5 * u], [x, y - 4.5 * u]], c.acc);
});
prop('notifPigeon', (D, x, y, s = 1, flap = 0, f = 1, carry = true) => {      // a homing pigeon (f -1: flying left), a letter in its beak
  const g = D.g, u = D.U * s, c = D.col;
  g.save(); g.translate(x, y); g.scale(f, 1);
  poly(g, [[-3.5 * u, -0.5 * u], [-7.5 * u, -2.2 * u], [-7 * u, 1.2 * u]], c.hi);
  g.fillStyle = c.hi; g.beginPath(); g.ellipse(0, 0, 4.6 * u, 2.8 * u, 0, 0, TAU); g.fill();
  disc(g, 3.9 * u, -2.3 * u, 2 * u, c.hi); disc(g, 4.5 * u, -2.7 * u, 0.6 * u, c.bg);
  poly(g, [[5.6 * u, -2.8 * u], [7.6 * u, -2.1 * u], [5.6 * u, -1.5 * u]], c.acc);
  g.fillStyle = c.fg; g.beginPath(); g.ellipse(-0.6 * u, -1.2 * u - flap * 2 * u, 3.8 * u, 1.3 * u + Math.abs(flap) * 1.3 * u, -0.35 * flap, 0, TAU); g.fill();
  if (carry) D.notifEnvelope(7 * u, 1.6 * u, s * 0.42);
  g.restore();
});
prop('notifChair', (D, x, y, s = 1, r = 0) => {                              // a chair (x, y: under its seat), tipping by r
  const g = D.g, u = D.U * s, c = D.col;
  g.save(); g.translate(x - 8 * u, y + 7.5 * u); g.rotate(r); g.translate(8 * u, -7.5 * u);
  box(g, -9 * u, -12 * u, 1.8 * u, 12 * u, c.acc); box(g, -9.6 * u, -12.6 * u, 3 * u, 1.4 * u, c.acc);
  box(g, -9 * u, 0, 18 * u, 1.8 * u, c.acc); box(g, -8.4 * u, 1.8 * u, 1.5 * u, 5.7 * u, c.dim); box(g, 6.9 * u, 1.8 * u, 1.5 * u, 5.7 * u, c.dim);
  g.restore();
});
prop('notifShades', (D, q = 1) => {                                           // sunglasses sliding down onto his eyes
  const c = D.col, dv = -(1 - q) * 16;
  for (const cu of [34, 66]) { quad(D, cu - 7, 19 + dv, cu + 7, 27 + dv, c.fg); quad(D, cu - 6, 20 + dv, cu + 6, 26 + dv, c.bg); quad(D, cu - 5, 20.5 + dv, cu - 3, 22 + dv, c.hi); }
  quad(D, 41, 20 + dv, 59, 21.5 + dv, c.fg); quad(D, 20, 20 + dv, 27, 21.4 + dv, c.fg); quad(D, 73, 20 + dv, 80, 21.4 + dv, c.fg);
});
prop('notifDish', (D, e, q = 1) => {                                          // a radar dish on his head, sending rings out
  const c = D.col, U = D.U, p = D.P(48, 7), a = ang(D);
  quad(D, 47, 8, 49, 13, c.dim);
  D.g.strokeStyle = c.fg; D.g.lineWidth = D.lw(1.2 * U); D.g.beginPath(); D.g.arc(p.x, p.y, 4.2 * U, a + Math.PI * 0.15, a + Math.PI * 0.85); D.g.stroke();
  disc(D.g, p.x, p.y, 1.1 * U, c.acc);
  if (q > 0) for (let i = 0; i < 3; i++) { const ph = ((e / 700) + i / 3) % 1; if (ph < 0.8) D.ring(p.x, p.y - 2 * U, (3 + ph * 11) * U, i % 2 ? c.hi : c.fg, 0.9 * U); }
});
prop('notifMailbox', (D, x, y, s = 1, flag = 0, pop = 0) => {                // a mailbox on its post, its flag going up
  const g = D.g, u = D.U * s, c = D.col;
  box(g, x - 1 * u, y + 2 * u, 2 * u, 10 * u, c.dim);
  if (pop > 0) D.notifEnvelope(x, y - 6 * u - 7 * u * pop, s * 0.6, 0, -0.3 * pop);
  g.fillStyle = c.fg; g.beginPath(); g.arc(x, y - 3 * u, 5.5 * u, Math.PI, TAU); g.fill(); box(g, x - 5.5 * u, y - 3.1 * u, 11 * u, 5.6 * u, c.fg);
  box(g, x - 4 * u, y - 2 * u, 6 * u, 1.2 * u, c.bg);
  g.save(); g.translate(x + 6.2 * u, y + 1.5 * u); g.rotate((1 - clamp(flag, 0, 1)) * Math.PI / 2); box(g, -0.5 * u, -7 * u, 1 * u, 7 * u, c.hi); box(g, 0.5 * u, -7 * u, 3.2 * u, 2.2 * u, c.acc); g.restore();
});
prop('notifLoupe', (D, x, y, s = 1, r = 0.7) => {                             // a magnifying glass
  const u = D.U * s, c = D.col;
  line(D, x + Math.cos(r) * 4.5 * u, y + Math.sin(r) * 4.5 * u, x + Math.cos(r) * 10 * u, y + Math.sin(r) * 10 * u, 2 * u, c.acc);
  D.ring(x, y, 4.2 * u, c.fg, 1.3 * u); box(D.g, x - 2.2 * u, y - 2.4 * u, 1.1 * u, 1.1 * u, c.hi); box(D.g, x - 1.1 * u, y - 3.1 * u, 1.1 * u, 0.9 * u, c.hi);
});
prop('notifStamp', (D, x, y, s = 1, down = 0, inked = 0) => {                 // a slip of paper, a rubber stamp: « LU »
  const g = D.g, u = D.U * s, c = D.col, h = (1 - clamp(down, 0, 1)) * 7 * u;
  box(g, x - 8 * u, y - 2 * u, 16 * u, 9 * u, c.hi); box(g, x - 6 * u, y, 9 * u, u, c.dim); box(g, x - 6 * u, y + 2.4 * u, 6 * u, u, c.dim);
  if (inked) { g.strokeStyle = c.pink; g.lineWidth = D.lw(0.8 * u); g.strokeRect(x - 1 * u, y + 0.6 * u, 8 * u, 5.4 * u); D.glyph('LU', x + 3 * u, y + 3.4 * u, 4.6 * u, c.pink); }
  disc(g, x + 3 * u, y - 10.5 * u - h, 1.8 * u, c.acc); box(g, x + 2.1 * u, y - 9.5 * u - h, 1.8 * u, 4 * u, c.acc); box(g, x - 1.5 * u, y - 5.5 * u - h, 9 * u, 3 * u, c.fg);
});
prop('notifPizza', (D, x, y, s = 1, bite = false) => {                     // a slice of pizza, maybe bitten
  const g = D.g, u = D.U * s, c = D.col;
  poly(g, [[x - 5 * u, y - 4 * u], [x + 5 * u, y - 4 * u], [x, y + 6.5 * u]], c.acc); box(g, x - 5.6 * u, y - 5.6 * u, 11.2 * u, 2.2 * u, c.hi);
  for (const [dx, dy] of [[-2, -1.6], [1.8, -1.2], [0, 2.2]]) disc(g, x + dx * u, y + dy * u, 0.95 * u, c.pink);
  if (bite) { disc(g, x - 4.6 * u, y - 4.4 * u, 2.2 * u, c.bg); disc(g, x - 2.4 * u, y - 5.4 * u, 1.6 * u, c.bg); }
});
prop('notifTyping', (D, x, y, s = 1, e = 0, mark = '') => {                   // a chat bubble: three dots typing, or a mark
  const g = D.g, u = D.U * s, c = D.col;
  box(g, x - 7 * u, y - 4 * u, 14 * u, 8 * u, c.hi); poly(g, [[x - 5 * u, y + 3.9 * u], [x - 1.5 * u, y + 3.9 * u], [x - 6 * u, y + 7 * u]], c.hi);
  if (mark) D.glyph(mark, x, y + 0.4 * u, 6 * u, c.bg);
  else for (let i = 0; i < 3; i++) disc(g, x + (i - 1) * 3.5 * u, y - Math.max(0, Math.sin(e / 120 - i * 0.9)) * 1.4 * u, 1.1 * u, c.bg);
});
prop('notifSiren', (D, e, q = 1) => {                                         // a flashing siren light on his head
  const c = D.col, U = D.U, p = D.P(48, 8), a = e / 140, k = Math.cos(a);
  if (q > 0) for (const sd of [-1, 1]) if (k * sd > 0.2) poly(D.g, [[p.x, p.y], [p.x + sd * 16 * U * q, p.y - 5 * U], [p.x + sd * 16 * U * q, p.y + 2 * U]], c.acc);
  quad(D, 42, 9.5, 54, 12.5, c.fg);
  D.g.fillStyle = Math.floor(e / 180) % 2 ? c.pink : c.hi; D.g.beginPath(); D.g.arc(p.x, p.y + 1.5 * U, 4 * U, ang(D) + Math.PI, ang(D) + TAU); D.g.fill();
});
prop('notifBattery', (D, x, y, s = 1, level = 1, low = false, charging = false) => {   // a battery, its bars, a lightning bolt
  const g = D.g, u = D.U * s, c = D.col;
  g.strokeStyle = c.fg; g.lineWidth = D.lw(1 * u); g.strokeRect(x - 6.5 * u, y - 3.5 * u, 13 * u, 7 * u); box(g, x + 6.5 * u, y - 1.4 * u, 1.4 * u, 2.8 * u, c.fg);
  for (let i = 0; i < 4; i++) if (level * 4 > i + 0.05) box(g, x - 5.2 * u + i * 2.7 * u, y - 2.2 * u, 2 * u, 4.4 * u, low ? c.pink : c.fg);
  if (charging) poly(g, [[x + 0.8 * u, y - 3 * u], [x - 1.8 * u, y + 0.5 * u], [x, y + 0.5 * u], [x - 0.8 * u, y + 3 * u], [x + 1.8 * u, y - 0.5 * u], [x, y - 0.5 * u]], c.acc);
});
prop('notifHeadphones', (D, q = 1, beat = 0) => {                             // headphones on his head, bumping to the beat
  const c = D.col, dv = -(1 - q) * 18 - beat, a = D.P(21, 22 + dv), b = D.P(75, 22 + dv), t = D.P(48, -8 + dv);
  D.g.strokeStyle = c.fg; D.g.lineWidth = D.lw(1.8 * D.U); D.g.beginPath(); D.g.moveTo(a.x, a.y); D.g.quadraticCurveTo(t.x, t.y, b.x, b.y); D.g.stroke();
  quad(D, 15, 17 + dv, 23, 31 + dv, c.acc); quad(D, 73, 17 + dv, 81, 31 + dv, c.acc); quad(D, 21, 19 + dv, 23, 29 + dv, c.dim); quad(D, 73, 19 + dv, 75, 29 + dv, c.dim);
});
prop('notifTV', (D, x, y, s = 1, e = 0) => {                                  // a little screen with a play button, and popcorn
  const g = D.g, u = D.U * s, c = D.col, k = 1 + 0.12 * Math.sin(e / 160);
  box(g, x - 8 * u, y - 6 * u, 16 * u, 11 * u, c.fg); box(g, x - 6.8 * u, y - 4.8 * u, 13.6 * u, 8.6 * u, c.bg); box(g, x - 3 * u, y + 5 * u, 6 * u, 1.4 * u, c.dim);
  poly(g, [[x - 2 * u * k, y - 2.8 * u * k], [x - 2 * u * k, y + 2 * u * k], [x + 2.8 * u * k, y - 0.4 * u]], c.acc);
});
prop('notifPopcorn', (D, x, y, s = 1, e = 0) => {
  const g = D.g, u = D.U * s, c = D.col;
  for (let i = 0; i < 5; i++) disc(g, x + (i - 2) * 1.9 * u, y - 4.8 * u - (i % 2) * 1.2 * u - (Math.floor(e / 400 + i) % 5 === 0 ? 0.8 * u : 0), 1.5 * u, i % 3 ? c.hi : c.acc);
  poly(g, [[x - 5 * u, y - 4 * u], [x + 5 * u, y - 4 * u], [x + 3.8 * u, y + 4 * u], [x - 3.8 * u, y + 4 * u]], c.hi);
  for (const sx of [-2.6, 0, 2.6]) poly(g, [[x + (sx - 0.7) * u, y - 4 * u], [x + (sx + 0.7) * u, y - 4 * u], [x + (sx * 0.78 + 0.55) * u, y + 4 * u], [x + (sx * 0.78 - 0.55) * u, y + 4 * u]], c.pink);
});
prop('notifGit', (D, x, y, s = 1, q = 1) => {                                 // a commit graph: a branch grows and merges back
  const g = D.g, u = D.U * s, c = D.col;
  line(D, x - 11 * u, y, x - 11 * u + 22 * u * clamp(q * 1.4, 0, 1), y, 1.1 * u, c.dim);
  if (q > 0.2) { g.strokeStyle = c.acc; g.lineWidth = D.lw(1.1 * u); g.beginPath(); g.moveTo(x - 6 * u, y); g.quadraticCurveTo(x - 5 * u, y - 6 * u, x, y - 6 * u); if (q > 0.55) g.quadraticCurveTo(x + 5 * u, y - 6 * u, x + 6 * u, y); g.stroke(); }
  [[-10, 0, 0, c.fg], [-6, 0, 0.12, c.fg], [-1.5, -6, 0.35, c.acc], [6, 0, 0.62, c.hi], [10, 0, 0.8, c.fg]].forEach(([dx, dy, t, col]) => { if (q > t) disc(g, x + dx * u, y + dy * u, 1.5 * u, col); });
});
prop('notifHourglass', (D, x, y, s = 1, r = 0, q = 0) => {                     // an hourglass, the sand running, flipping over
  const g = D.g, u = D.U * s, c = D.col, k = 1 - clamp(q, 0, 1);
  g.save(); g.translate(x, y); g.rotate(r);
  poly(g, [[-3.6 * u * k, -5.8 * u * k], [3.6 * u * k, -5.8 * u * k], [0, 0]], c.acc);
  poly(g, [[-3.6 * u, 5.8 * u], [3.6 * u, 5.8 * u], [0, 5.8 * u - 5 * u * clamp(q, 0, 1)]], c.acc);
  if (q > 0 && q < 1) box(g, -0.4 * u, 0, 0.8 * u, 5.8 * u, c.acc);
  g.strokeStyle = c.fg; g.lineWidth = D.lw(0.7 * u); g.beginPath(); g.moveTo(-4 * u, -6 * u); g.lineTo(4 * u, -6 * u); g.lineTo(0.5 * u, 0); g.lineTo(4 * u, 6 * u); g.lineTo(-4 * u, 6 * u); g.lineTo(-0.5 * u, 0); g.closePath(); g.stroke();
  box(g, -5 * u, -7.4 * u, 10 * u, 1.4 * u, c.dim); box(g, -5 * u, 6 * u, 10 * u, 1.4 * u, c.dim);
  g.restore();
});
prop('notifUmbrella', (D, x, y, s = 1, r = 0, e = 0, rain = true) => {        // an umbrella, the rain bouncing off it
  const g = D.g, u = D.U * s, c = D.col;
  if (rain) for (let i = 0; i < 6; i++) { const q = ((e / 520) + i / 6) % 1, dx = (-11 + i * 4.4) * u; D.drop(x + dx, y - 14 * u + q * (Math.abs(dx) < 8 * u ? 9 : 20) * u, 0.9 * u, c.hi); }
  g.save(); g.translate(x, y); g.rotate(r);
  g.fillStyle = c.pink; g.beginPath(); g.arc(0, 0, 8.5 * u, Math.PI, TAU); g.fill();
  for (let i = 0; i < 4; i++) disc(g, (-6.4 + i * 4.25) * u, 0.4 * u, 2.1 * u, c.bg);
  box(g, -0.5 * u, -10 * u, 1 * u, 2 * u, c.fg); box(g, -0.5 * u, -1 * u, 1 * u, 10 * u, c.fg);
  g.strokeStyle = c.fg; g.lineWidth = D.lw(u); g.beginPath(); g.arc(1.4 * u, 9 * u, 1.4 * u, 0, Math.PI); g.stroke();
  g.restore();
});
prop('notifBulb', (D, x, y, s = 1, on = true, e = 0) => {                     // a light bulb, its rays
  const g = D.g, u = D.U * s, c = D.col;
  if (on) for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + e / 1500; line(D, x + Math.cos(a) * 6 * u, y + Math.sin(a) * 6 * u, x + Math.cos(a) * 8.5 * u, y + Math.sin(a) * 8.5 * u, 0.9 * u, c.acc); }
  disc(g, x, y, 4.2 * u, on ? c.hi : c.dim); box(g, x - 2 * u, y + 3 * u, 4 * u, 3 * u, c.fg); box(g, x - 2 * u, y + 4.2 * u, 4 * u, 0.7 * u, c.dim);
  if (on) { box(g, x - 1.5 * u, y - 0.5 * u, 3 * u, 0.8 * u, c.acc); box(g, x - 0.4 * u, y - 0.5 * u, 0.8 * u, 3.4 * u, c.acc); }
});
prop('notifBuddy', (D, x, y, s = 1, kind = 'claude', wave = 0, e = 0) => {    // a little robot colleague, waving
  const g = D.g, u = D.U * s, c = D.col;
  box(g, x - 0.4 * u, y - 7 * u, 0.8 * u, 3 * u, c.dim);
  if (kind === 'claude') D.star(x, y - 8 * u, 2.2 * u, c.acc, e / 400); else disc(g, x, y - 7.6 * u, 1.1 * u, c.acc);
  box(g, x - 5.5 * u, y - 4 * u, 11 * u, 8.5 * u, c.fg); box(g, x - 4.3 * u, y - 2.8 * u, 8.6 * u, 6 * u, c.bg);
  if (kind === 'codex') D.glyph('>_', x, y + 0.2 * u, 4.6 * u, c.hi);
  else { const bl = (e % 2600) < 140; box(g, x - 2.8 * u, y - 1.4 * u + (bl ? 0.9 * u : 0), 1.5 * u, bl ? 0.4 * u : 2.2 * u, c.hi); box(g, x + 1.3 * u, y - 1.4 * u + (bl ? 0.9 * u : 0), 1.5 * u, bl ? 0.4 * u : 2.2 * u, c.hi); box(g, x - 1.5 * u, y + 1.6 * u, 3 * u, 0.8 * u, c.hi); }
  const a = -0.5 - wave * Math.max(0, Math.sin(e / 150)) * 0.9; line(D, x + 5.5 * u, y + 1 * u, x + 5.5 * u + Math.cos(a) * 4 * u, y + 1 * u + Math.sin(a) * 4 * u, 1 * u, c.fg);
  disc(g, x + 5.5 * u + Math.cos(a) * 4.6 * u, y + 1 * u + Math.sin(a) * 4.6 * u, 1.1 * u, c.hi);
});
prop('notifLike', (D, x, y, s = 1, q = 1, e = 0) => {                         // a big heart and its « +1 »
  const u = D.U * s * (1 + 0.1 * Math.sin(e / 110)) * q, c = D.col;
  D.heart(x, y - 4 * u, 9 * u, c.pink); D.glyph('+1', x + 7.5 * u, y - 4.5 * u, 5 * D.U * s, c.hi);
});
prop('notifHand', (D, x, y, s = 1, r = 0) => {                                // a waving hand (x, y: the wrist)
  const g = D.g, u = D.U * s, c = D.col;
  g.save(); g.translate(x, y); g.rotate(r);
  box(g, -2.8 * u, -0.4 * u, 5.6 * u, 2.4 * u, c.fg); box(g, -2.3 * u, -5 * u, 4.6 * u, 4.8 * u, c.hi);
  for (let i = 0; i < 4; i++) box(g, -2.3 * u + i * 1.2 * u, -8 * u + (i === 0 || i === 3 ? 0.8 * u : 0), 0.95 * u, 3.4 * u, c.hi);
  box(g, 2.3 * u, -3.8 * u, 1.8 * u, 1 * u, c.hi);
  g.restore();
});
prop('notifProgress', (D, x, y, w, s = 1, q = 0) => {                         // a progress bar and its percentage
  const g = D.g, u = D.U * s, c = D.col;
  g.strokeStyle = c.fg; g.lineWidth = D.lw(0.9 * u); g.strokeRect(x - w / 2, y, w, 4.4 * u);
  box(g, x - w / 2 + 1.2 * u, y + 1.2 * u, Math.max(0, (w - 2.4 * u) * clamp(q, 0, 1)), 2 * u, c.fg);
  D.glyph(Math.round(clamp(q, 0, 1) * 100) + ' %', x + w / 2 + 7 * u, y + 2.4 * u, 4.4 * u, c.hi);
});
prop('notifNightcap', (D, q = 1, e = 0) => {                                  // a nightcap, its pompom flopping
  const c = D.col, dv = -(1 - q) * 4, P = (u, v) => D.P(u, v + dv), a = P(32, 14), b = P(64, 14), tip = P(80 + 2 * Math.sin(e / 700), 7), c1 = P(42, -2), c2 = P(62, 4), g = D.g;
  g.fillStyle = c.dim; g.beginPath(); g.moveTo(a.x, a.y); g.quadraticCurveTo(c1.x, c1.y, tip.x, tip.y); g.quadraticCurveTo(c2.x, c2.y, b.x, b.y); g.closePath(); g.fill();
  for (const [u, v] of [[40, 9], [50, 7], [58, 9]]) { const p = P(u, v); disc(g, p.x, p.y, 0.9 * D.U, c.acc); }
  quad(D, 31, 12 + dv, 65, 15.5 + dv, c.hi); disc(g, tip.x, tip.y, 2.6 * D.U, c.hi);
});
prop('notifPillow', (D, q = 1, press = 0) => {                                // a pillow pressed on his head
  const c = D.col, p = D.P(48, 9 - (1 - q) * 15 + press * 2.5), a = ang(D), U = D.U, g = D.g;
  g.fillStyle = c.hi; g.beginPath(); g.ellipse(p.x, p.y, 21 * U, (4.6 - press * 1.2) * U, a, 0, TAU); g.fill();
  for (const sd of [-1, 1]) disc(g, p.x + Math.cos(a) * sd * 20 * U, p.y + Math.sin(a) * sd * 20 * U, 2 * U, c.hi);
  line(D, p.x - Math.cos(a) * 12 * U, p.y - Math.sin(a) * 12 * U, p.x + Math.cos(a) * 12 * U, p.y + Math.sin(a) * 12 * U, 0.7 * U, c.dim);
});
prop('notifPile', (D, n = 3, wob = 0) => {                                    // a pile of envelopes on his head
  const a = ang(D);
  for (let i = 0; i < n; i++) { const p = D.P(48 + Math.sin(i * 1.7) * 3 + wob * i * 1.2, 8 - i * 4.3); D.notifEnvelope(p.x, p.y, 0.8, 0, a + Math.sin(i * 2.3) * 0.16 + wob * 0.06 * i); }
});
prop('notifJuggle', (D, e, cx, cy, s = 1, n = 3, spread = 1) => {            // envelopes juggled in a loop above him
  const u = D.U * s;
  for (let i = 0; i < n; i++) {
    const a = TAU * (((e / 1100) + i / n) % 1), up = Math.sin(a);
    D.notifEnvelope(cx + Math.cos(a) * 13 * u * spread, cy - (up > 0 ? up * 15 : up * 2.5) * u * spread, s * 0.55, 0, Math.cos(a) * 0.5);
  }
});
prop('notifMailRain', (D, e, q = 1) => {                                      // envelopes raining down and piling up at his feet
  for (let i = 0; i < 9; i++) {
    const t0 = 150 + i * 210, t = Math.max(0, e - t0) / 1000; if (e < t0) continue;
    const x = 250 + ((i * 97) % 300) + Math.sin(i * 3) * 10, y1 = 405 - (i % 3) * 22 - Math.floor(i / 3) * 4, y = Math.min(y1, 110 + 700 * t * t);
    const k = y >= y1 ? 1 : 0, fly = 1 - q;
    D.notifEnvelope(x + fly * (x - 400) * 2.5, y - fly * 420, 0.75, 0, k ? Math.sin(i * 2.1) * 0.35 : Math.sin(e / 90 + i) * 0.4);
  }
});
prop('notifWarning', (D, x, y, s = 1) => {                                    // a warning triangle « ! »
  const g = D.g, u = D.U * s, c = D.col;
  poly(g, [[x, y - 6.5 * u], [x + 7 * u, y + 5.5 * u], [x - 7 * u, y + 5.5 * u]], c.acc);
  box(g, x - 0.9 * u, y - 2.6 * u, 1.8 * u, 4.6 * u, c.bg); box(g, x - 0.9 * u, y + 2.9 * u, 1.8 * u, 1.6 * u, c.bg);
});
prop('notifBug', (D, x, y, s = 1, e = 0, r = 0) => {                          // a little bug walking about
  const g = D.g, u = D.U * s, c = D.col;
  g.save(); g.translate(x, y); g.rotate(r);
  for (let i = 0; i < 3; i++) for (const sd of [-1, 1]) { const w = Math.sin(e / 50 + i * 2 + (sd > 0 ? 1.5 : 0)) * 0.8 * u; line(D, sd * 1.5 * u, (i - 1) * 1.8 * u, sd * 3.6 * u, (i - 1) * 2.2 * u + w, 0.7 * u, c.fg); }
  line(D, -0.6 * u, -4 * u, -1.8 * u, -6 * u, 0.6 * u, c.fg); line(D, 0.6 * u, -4 * u, 1.8 * u, -6 * u, 0.6 * u, c.fg);
  g.fillStyle = c.acc; g.beginPath(); g.ellipse(0, 0.6 * u, 2.3 * u, 3 * u, 0, 0, TAU); g.fill();
  box(g, -0.3 * u, -2 * u, 0.6 * u, 5.4 * u, c.bg); disc(g, 0, -3.2 * u, 1.4 * u, c.fg);
  g.restore();
});
prop('notifConfetti', (D, e, x0, y0, q = 1) => {                              // a confetti burst from (x0, y0), falling down
  const g = D.g, U = D.U, c = D.col, cols = [c.acc, c.pink, c.hi, c.fg], t = e / 1000;
  if (q <= 0) return;
  for (let i = 0; i < 20; i++) {
    const vx = ((i * 53) % 17 - 8) * 26, vy = -(260 + ((i * 37) % 9) * 28), x = x0 + vx * t, y = y0 + vy * t + 300 * t * t;
    if (y > HT - 40) continue;
    const w = 1.6 * U * Math.max(0.25, Math.abs(Math.cos(t * 7 + i))); box(g, x - w / 2, y - 0.5 * U, w, U, cols[i % 4]);
  }
});
prop('notifTrophy', (D, x, y, s = 1, shine = 0) => {                          // a golden cup
  const g = D.g, u = D.U * s, c = D.col;
  for (const sd of [-1, 1]) D.ring(x + sd * 5 * u, y - 3.5 * u, 2 * u, c.acc, 1 * u);
  g.fillStyle = c.acc; g.beginPath(); g.moveTo(x - 4.8 * u, y - 6.5 * u); g.lineTo(x + 4.8 * u, y - 6.5 * u); g.quadraticCurveTo(x + 4.8 * u, y + 1 * u, x, y + 1.6 * u); g.quadraticCurveTo(x - 4.8 * u, y + 1 * u, x - 4.8 * u, y - 6.5 * u); g.fill();
  box(g, x - 0.9 * u, y + 1.4 * u, 1.8 * u, 2.8 * u, c.acc); box(g, x - 3.8 * u, y + 4 * u, 7.6 * u, 1.8 * u, c.dim);
  if (shine > 0) D.star(x - 2 * u, y - 3.6 * u, 1.8 * u * shine, c.hi, shine * 3);
});
prop('notifStorm', (D, x, y, s = 1, flash = 0) => {                           // a storm cloud, a lightning bolt
  const g = D.g, u = D.U * s, c = D.col;
  if (flash) poly(g, [[x + 1 * u, y + 2 * u], [x - 2.6 * u, y + 8 * u], [x - 0.2 * u, y + 8 * u], [x - 1.8 * u, y + 13 * u], [x + 3 * u, y + 6.4 * u], [x + 0.6 * u, y + 6.4 * u], [x + 2.4 * u, y + 2 * u]], c.acc);
  for (const [dx, dy, r] of [[-5, 1, 3.2], [-1, -1.6, 4.3], [4, 0, 3.6]]) disc(g, x + dx * u, y + dy * u, r * u, c.dim);
  box(g, x - 8 * u, y + 0.5 * u, 15.5 * u, 3.2 * u, c.dim);
});
prop('notifWaves', (D, x, y, s = 1, e = 0, a0 = Math.PI / 2) => {             // loud sound waves coming at him
  const u = D.U * s, c = D.col;
  for (let i = 0; i < 3; i++) { const r = (3 + i * 3 + (e / 90) % 3) * u; D.g.strokeStyle = c.acc; D.g.lineWidth = D.lw(1 * u); D.g.beginPath(); D.g.arc(x, y, r, a0 - 0.6, a0 + 0.6); D.g.stroke(); }
});
prop('notifTV0', (D, w = 0, r = 0) => {                                       // the old TV switching off: a bright line (half width w), a dot (r)
  const p = D.P(48, 27), c = D.col, U = 7;
  if (w > 0) box(D.g, p.x - w * U, p.y - 0.8 * U, 2 * w * U, 1.6 * U, c.hi);
  if (r > 0) disc(D.g, p.x, p.y, r * U, c.hi);
});

/* he makes room for the banner: k (0..1), sliding by (dx, dy) and shrinking to s, in (a..b) and back (c..d) */
const room = (e, a, b, c, d, dx, dy, s) => { const k = io(e, a, b, c, d); return { k, x: dx * k, y: dy * k, s: 1 - (1 - s) * k }; };
const px = (D, k = 1) => 7 * k / D.U;              // a prop size in screen pixels (7 px a unit), whatever his own size

/* ---------- generic reactions: any notification ---------- */
S('notif-ding', 'Ding !', 'evt', { dur: 3000, w: 2, anim: [[0, 'surpris'], [600, 'notification'], [2100, 'content']], mood: 'surpris',
  say: [[200, 1500, L('Ding !', 'Ding dong !', 'Dring !', 'Ding, ding !')], [1550, 2450, V('Une notif !', 'Tiens, du nouveau !', 'C’est pour toi !', o => quote(o, 16))]],
  move: e => { const r = room(e, 0, 350, 2350, 2850, 135, 18, 0.85), j = bump(seg(e, 280, 560)) + 0.7 * bump(seg(e, 1000, 1260)); return { x: r.x, y: r.y - 26 * j, s: r.s, sy: 1 + 0.08 * j, sx: 1 - 0.05 * j }; },
  props: (D, e) => { const q = io(e, 100, 300, 2200, 2500); if (q <= 0) return; const sw = 0.55 * Math.sin(e / 95) * io(e, 150, 300, 1600, 2100); D.notifBell(175, 112, px(D, 1.1 * q), sw, Math.abs(sw) > 0.4 ? 1 : 0); } });
S('notif-jumelles', 'Les jumelles', 'evt', { dur: 3600, anim: [[0, 'curieux'], [1700, 'surpris'], [2500, 'content']], mood: 'ecoute',
  say: [[300, 1600, L('Voyons voir…', 'Qu’est-ce que c’est ?', 'Je zoome…', 'Mode espion !')], [1700, 3100, V(o => quote(o, 18), 'Ah ! Intéressant…', 'Je vois, je vois…', 'Vu, reçu !')]],
  move: e => { const r = room(e, 0, 450, 3000, 3500, -140, 30, 0.82), scan = io(e, 700, 900, 2400, 2700); return { x: r.x + 14 * Math.sin(e / 260) * scan, y: r.y, s: r.s, r: -0.07 * r.k + 0.04 * Math.sin(e / 520) * scan }; },
  props: (D, e) => { const q = io(e, 250, 650, 2900, 3300); if (q > 0) D.notifBinoculars(sm(q)); } });
S('notif-la-haut', 'Là-haut !', 'evt', { dur: 2800, anim: [[0, 'surpris'], [450, 'idle-haut'], [1900, 'content']], mood: 'surpris',
  say: [[150, 1350, L('Là-haut !', 'Regarde, là-haut !', 'Une notif, là !', 'Hop, en haut !')], [1400, 2300, L('Lis-la vite !', 'C’est pour toi !', 'Ça vient d’arriver !')]],
  move: e => { const r = room(e, 0, 300, 2200, 2700, 120, 22, 0.86), h = bump(seg(e, 250, 650)); return { x: r.x, y: r.y - 30 * h, s: r.s, sy: 1 + 0.12 * h, sx: 1 - 0.07 * h, r: -0.05 * r.k }; },
  props: (D, e) => { const q = io(e, 300, 500, 2100, 2400); if (q > 0) { const p = D.P(84, 15); D.notifArrow(p.x, p.y - Math.abs(Math.sin(e / 140)) * 2.5 * D.U, 1.1 * q); } } });
S('notif-pigeon', 'Le pigeon voyageur', 'evt', { dur: 4000, anim: [[0, 'curieux'], [1950, 'surpris'], [2300, 'content']], mood: 'ecoute',
  say: [[300, 1500, L('Un pigeon ?!', 'Oh, un oiseau !', 'Courrier par les airs !')], [2100, 3500, L('Merci, l’oiseau !', 'Il t’apporte ta notif !', 'Livraison par pigeon !')]],
  move: e => { const r = room(e, 0, 400, 3400, 3900, 0, 36, 0.88), b = bump(seg(e, 1950, 2250)); return { y: r.y + 10 * b, s: r.s, sy: 1 - 0.14 * b, sx: 1 + 0.1 * b }; },
  props: (D, e) => {
    const head = D.P(48, 8), land = { x: head.x + 12, y: head.y - 3 * D.U };
    let x, y, fl = Math.sin(e / 55);
    if (e < 1500) { const q = out(seg(e, 0, 1500)); x = 860 + (land.x - 860) * q; y = 170 + (land.y - 170) * q + 8 * Math.sin(e / 140) * (1 - q); }
    else if (e < 2300) { x = land.x; y = land.y; fl = 0.25 * Math.sin(e / 200); }
    else { const q = inn(seg(e, 2300, 3300)); x = land.x - (land.x + 90) * q; y = land.y - 40 * q; }
    if (e < 3300) D.notifPigeon(x, y, 0.85, fl, -1, e < 1800);
    if (e > 1800) { const q = seg(e, 1800, 2000), t = D.P(76, 40), x0 = land.x - 6 * D.U, y0 = land.y + 1.4 * D.U; D.notifEnvelope(x0 + (t.x - x0) * q, y0 + (t.y - y0) * q * q, 0.75, seg(e, 2400, 2800), 0.2 * (1 - seg(e, 2000, 2300)), seg(e, 2800, 3200)); }
  } });
S('notif-enveloppe', 'L’enveloppe', 'evt', { dur: 3400, anim: [[0, 'curieux'], [1300, 'surpris'], [1900, 'content']], mood: 'ecoute',
  say: [[200, 1400, L('Oh, du courrier !', 'Une lettre !', 'Qu’est-ce que c’est ?')], [1800, 3000, V(o => quote(o, 18), 'Oh, c’est gentil !', 'Je l’ouvre !', 'Une lettre pour toi !')]],
  move: e => { const r = room(e, 0, 400, 2900, 3350, -130, 22, 0.85), lean = bump(seg(e, 1250, 1700)); return { x: r.x - 10 * lean, y: r.y, s: r.s, r: -0.08 * lean }; },
  props: (D, e) => { const q = io(e, 150, 550, 2900, 3200); if (q <= 0) return; const p = D.P(86, 38), w = 0.1 * Math.sin(e / 160) * (1 - seg(e, 1200, 1300)); D.notifEnvelope(p.x, p.y + 10 * (1 - out(q)), 1.1 * out(q), seg(e, 1300, 1700), w, seg(e, 1700, 2200)); } });
S('notif-sursaut', 'Le sursaut', 'evt', { dur: 2600, w: 2, anim: [[0, 'surpris'], [1500, 'timide']], mood: 'surpris',
  say: [[260, 1350, L('Waaah !', 'Ouh là !', 'Hiii !', 'Tu m’as fait peur !')], [1450, 2200, L('Fausse alerte…', 'Ça va, ça va…', 'Mon petit cœur…')]],
  move: e => {
    if (e < 120) { const q = seg(e, 0, 120); return { sy: 1 - 0.15 * q, sx: 1 + 0.1 * q, y: 10 * q }; }
    if (e < 1300) { const up = bump(seg(e, 120, 1300)) ** 0.6, st = 0.2 * bump(seg(e, 120, 500)); return { y: 10 - 105 * up, sy: 1 + st, sx: 1 - st * 0.6, x: 3 * Math.sin(e / 25) * seg(e, 400, 500) * (1 - seg(e, 800, 900)) }; }
    const k = fin(e, 2000, 2450), land = Math.exp(-(e - 1300) / 160) * Math.cos((e - 1300) / 45);
    return { y: 30 * k * (1 - Math.exp(-(e - 1300) / 120)) + 8 * land, sy: 1 - 0.2 * land, sx: 1 + 0.12 * land };
  },
  props: (D, e) => { if (e > 120 && e < 1300) { const p = D.P(90, 30); D.glyph('!', Math.min(p.x, W - 30), p.y, 9 * D.U, D.col.acc); } if (e > 1400 && e < 2400) D.sweat(e); } });
S('notif-chaise', 'Tombé de sa chaise', 'evt', { dur: 3800, anim: [[0, 'content'], [400, 'surpris'], [1300, 'confus'], [2600, 'timide']], mood: 'surpris',
  say: [[450, 1250, L('Woh woh woh…', 'Oh là, je glisse…', 'Attention !')], [1350, 2400, L('Badaboum !', 'Aïe !', 'Patatras !')], [2500, 3300, L('Ça va, ça va…', 'J’ai rien senti !', 'Même pas mal !')]],
  move: e => {
    const sit = io(e, 0, 300, 2700, 3500), base = { x: 0, y: 70 * sit, s: 1 - 0.38 * sit, r: 0 };
    if (e < 400) return base;
    if (e < 900) { const q = seg(e, 400, 900); return { ...base, y: base.y - 26 * bump(q), r: -0.25 * sm(q) + 0.05 * Math.sin(e / 40) }; }
    if (e < 1300) { const q = inn(seg(e, 900, 1300)); return { ...base, x: -90 * q, y: base.y + 34 * q, r: -0.25 - 1.15 * q }; }
    if (e < 2300) { const b = Math.exp(-(e - 1300) / 150) * Math.sin((e - 1300) / 50); return { ...base, x: -90, y: base.y + 34 - 6 * b, r: -1.4 }; }
    const q = sm(seg(e, 2300, 2900)); return { ...base, x: -90 * (1 - q), y: base.y + 34 * (1 - q) - 20 * bump(q), r: -1.4 * (1 - q) };
  },
  props: (D, e) => {
    const q = io(e, 0, 250, 2900, 3300); if (q <= 0) return;
    const r = e < 900 ? -0.2 * sm(seg(e, 400, 900)) : e < 1300 ? -0.2 - 1.37 * inn(seg(e, 900, 1300)) : e < 2400 ? -1.57 : -1.57 * (1 - sm(seg(e, 2400, 2900)));
    D.notifChair(400, 388, px(D, 0.86 * q), r);
    if (e > 1300 && e < 2600) D.dizzy(e, 1 - seg(e, 2200, 2600));
  } });
S('notif-cool', 'Trop cool', 'evt', { dur: 3400, anim: [[0, 'fier'], [1800, 'clin-oeil'], [2300, 'fier']], mood: 'fier',
  say: [[300, 1700, L('Une notif ? Tranquille.', 'Ouais, ouais, je sais.', 'Je gère.', 'Pas de stress.')], [1800, 2900, L('Trop stylé.', 'Je suis trop cool.', 'Rien ne m’étonne.', 'Classe, hein ?')]],
  move: e => { const r = room(e, 0, 500, 2800, 3350, 140, 20, 0.85); return { x: r.x, y: r.y + 4 * Math.sin(e / 300) * r.k, s: r.s, r: -0.1 * r.k + 0.03 * Math.sin(e / 300) * r.k }; },
  props: (D, e) => { const q = io(e, 250, 750, 2700, 3200); if (q > 0) D.notifShades(sm(q)); } });
S('notif-radar', 'Le radar', 'evt', { dur: 3200, anim: [[0, 'ecoute'], [1600, 'connexion'], [2400, 'content']], mood: 'ecoute',
  say: [[250, 1550, L('Bip… bip… bip…', 'Signal détecté !', 'Réception…', 'Antenne déployée !')], [1650, 2800, V('Message reçu !', 'Cinq sur cinq !', o => 'Reçu : ' + short(o.msg, 14))]],
  move: e => { const r = room(e, 0, 400, 2700, 3150, 0, 50, 0.85); return { y: r.y, s: r.s, r: 0.12 * Math.sin(e / 320) * io(e, 300, 600, 1500, 1900) }; },
  props: (D, e) => { const q = io(e, 200, 500, 2600, 3000); if (q > 0) D.notifDish(e, e < 2200 ? q : 0); } });
S('notif-boite', 'La boîte aux lettres', 'evt', { dur: 3600, anim: [[0, 'curieux'], [1400, 'surpris'], [2000, 'content']], mood: 'ecoute',
  say: [[200, 1500, L('Tu as du courrier !', 'Le facteur est passé !', 'Ta boîte aux lettres !')], [1700, 3100, V(o => quote(o, 16), 'Une lettre pour toi !', 'Tiens, c’est pour toi !')]],
  move: e => { const r = room(e, 0, 400, 3000, 3500, 130, 20, 0.85), peek = io(e, 1000, 1400, 2000, 2400); return { x: r.x - 40 * peek, y: r.y, s: r.s, r: -0.14 * peek }; },
  props: (D, e) => { const q = io(e, 100, 400, 3000, 3300); if (q > 0) D.notifMailbox(165, 335, px(D, 0.86 * q), sm(seg(e, 500, 900)), sm(seg(e, 1400, 2000)) * fin(e, 2600, 2900)); } });
S('notif-loupe', 'La loupe', 'evt', { dur: 3800, anim: [[0, 'curieux'], [1500, 'parle'], [3000, 'content']], mood: 'ecoute',
  say: [[200, 1450, L('Hmm… voyons…', 'Je lis, je lis…', 'Attends, je déchiffre…')], [1550, 3300, V(o => quote(o, 18), o => (who(o.msg) ? who(o.msg) + ' t’écrit !' : 'C’est écrit petit !'), 'Passionnant !')]],
  move: e => { const r = room(e, 0, 400, 3200, 3700, -140, 25, 0.85); return { x: r.x, y: r.y, s: r.s, r: 0.05 * Math.sin(e / 600) * r.k }; },
  props: (D, e) => { const q = io(e, 250, 600, 3100, 3500); if (q > 0) { const p = D.P(66 + 4 * Math.sin(e / 380), 23 + 2.5 * Math.sin(e / 260) + (1 - q) * 25); D.notifLoupe(p.x, p.y, 1.5, 0.7); } } });
S('notif-cache', 'Caché dans le coin', 'evt', { dur: 4000, anim: [[0, 'surpris'], [500, 'timide'], [2000, 'curieux'], [3200, 'content']], mood: 'surpris',
  say: [[450, 1800, L('Oh non, une notif !', 'Je me cache !', 'Qu’est-ce que c’est ?!')], [2050, 3300, L('Elle est partie ?', 'Bon… je reviens.', 'Fausse alerte !')]],
  move: e => { const k = sm(seg(e, 0, 450)) * fin(e, 3100, 3800), peek = io(e, 1900, 2300, 2900, 3100); return { x: -200 * k + 30 * peek, y: 122 * k - 30 * peek, s: 1 - 0.45 * k, r: 0.25 * k - 0.1 * peek + (e > 500 && e < 1900 ? 0.03 * Math.sin(e / 30) : 0) }; },
  props: (D, e) => { if (e > 500 && e < 2000) D.sweat(e); } });
S('notif-ou', 'Hein, quoi ?', 'evt', { dur: 3000, w: 2, anim: [[0, 'idle-regard'], [1300, 'idle-haut'], [1700, 'surpris'], [2200, 'content']], mood: 'confus',
  say: [[150, 1400, L('Hein ? Quoi ?', 'Qui m’appelle ?', 'C’est quoi, ce bruit ?')], [1650, 2500, L('Ah, une notif !', 'Oh, c’est là-haut !', 'Ah, c’était ça !')]],
  move: e => {
    const k = io(e, 0, 300, 2400, 2900), l = io(e, 50, 250, 550, 700), rr = io(e, 650, 850, 1150, 1300), up = io(e, 1250, 1450, 1800, 2100);
    return { x: -60 * l + 60 * rr, y: 32 * k - 8 * up, s: 1 - 0.12 * k, r: 0.1 * l - 0.1 * rr, f: rr > 0.5, sy: 1 + 0.05 * up };
  },
  props: (D, e) => { if ((e > 100 && e < 650) || (e > 750 && e < 1300)) { const p = D.P(8, 16); D.glyph('?', p.x, p.y, 8 * D.U, D.col.acc); } } });
S('notif-tampon', 'Lu et approuvé', 'evt', { dur: 3600, anim: [[0, 'reflechit'], [1350, 'fier']], mood: 'fier',
  say: [[200, 1300, L('Bien reçu.', 'Voyons ça…', 'Une notification…')], [1450, 3100, L('Lu et approuvé !', 'Tamponné !', 'Classé !', 'Traité !')]],
  move: e => { const r = room(e, 0, 400, 3000, 3500, 130, 22, 0.85), thunk = bump(seg(e, 1200, 1450)); return { x: r.x, y: r.y + 8 * thunk, s: r.s, sy: 1 - 0.1 * thunk, sx: 1 + 0.06 * thunk }; },
  props: (D, e) => { const q = io(e, 200, 450, 2900, 3200); if (q > 0) D.notifStamp(175, 365, px(D, 0.93 * q), e < 1250 ? sm(seg(e, 700, 1250)) : 1 - sm(seg(e, 1500, 2000)), e > 1250); } });

/* ---------- keyword families: the banner's words choose (w 4 to 6) ---------- */
S('notif-message', 'Un message !', 'evt', { dur: 3600, w: 5, when: has('sms'), anim: [[0, 'notification'], [1500, 'etoiles'], [2600, 'content']], mood: 'excite',
  say: [[200, 1500, L('Un message !', 'Bip bip, un message !', 'Quelqu’un t’écrit !')], [1600, 3100, o => { const n = who(o.msg); return n ? pick([n + ' t’écrit !', 'C’est ' + n + ' !', 'Oh, ' + n + ' !']) : pick(['Tu réponds ?', 'Je peux lire ?', 'Réponds vite !']); }]],
  move: e => { const r = room(e, 0, 400, 3000, 3500, -140, 22, 0.85), hop = e > 300 && e < 1500 ? jumps(e - 300, 300, 12) : 0; return { x: r.x, y: r.y + hop, s: r.s, r: 0.05 * Math.sin(e / 200) * io(e, 1500, 1700, 2500, 2800) }; },
  props: (D, e) => { const q = io(e, 250, 500, 2800, 3200); if (q > 0) { const p = D.P(28, 5); D.notifTyping(p.x, p.y, 0.9 * q, e, e > 1500 ? '!' : ''); } } });
S('notif-mail', 'Du courrier', 'evt', { dur: 3800, w: 5, when: has('mail'), anim: [[0, 'curieux'], [2000, 'surpris'], [2500, 'content']], mood: 'ecoute',
  say: [[200, 1700, L('Un mail !', 'Tu as un nouveau mail !', 'Courrier électronique !')], [2100, 3400, o => { const n = who(o.msg); return n ? pick(['De la part de ' + n + ' !', n + ' t’a écrit !']) : pick(['Pas un spam, j’espère…', 'Je le range où ?', 'Encore une newsletter ?']); }]],
  move: e => { const r = room(e, 0, 400, 3300, 3750, 0, 30, 0.85), a = Math.PI + TAU * sm(seg(e, 200, 1900)), fol = io(e, 200, 400, 1700, 2000); return { y: r.y, s: r.s, x: 30 * Math.cos(a) * fol, r: 0.12 * Math.cos(a) * fol }; },
  props: (D, e) => {
    if (e < 200 || e > 3400) return;
    let x, y, rr = 0, open = 0, letter = 0;
    if (e < 1900) { const a = Math.PI + TAU * sm(seg(e, 200, 1900)); x = 400 + 240 * Math.cos(a); y = 290 + 115 * Math.sin(a); rr = 0.4 * Math.sin(a * 2); }
    else { const t = D.P(84, 40), q = sm(seg(e, 1900, 2300)); x = 160 + (t.x - 160) * q; y = 290 + (t.y - 290) * q; open = seg(e, 2400, 2800); letter = seg(e, 2800, 3200); }
    D.notifEnvelope(x, y, 1, open, rr, letter);
    if (e < 2400) D.glyph('@', x, y + 2.2 * D.U, 4.5 * D.U, D.col.bg);
  } });
S('notif-appel', 'Le téléphone sonne', 'evt', { dur: 3600, w: 5, when: has('appel'), anim: [[0, 'surpris'], [500, 'notification'], [1900, 'parle']], mood: 'surpris',
  say: [[150, 1700, L('Dring dring !', 'Ça sonne !', 'Allô ? Allô ?', 'Le téléphone !')], [1800, 3100, o => { const n = who(o.msg); return n ? pick([n + ' t’appelle !', 'C’est ' + n + ' !']) : pick(['Décroche, décroche !', 'Tu réponds ?', 'C’est pour toi !']); }]],
  move: e => { const r = room(e, 0, 350, 3000, 3500, -130, 22, 0.85), ring = (e % 900) < 600 && e < 2600 ? 1 : 0; return { x: r.x + ring * 3 * Math.sin(e / 18), y: r.y, s: r.s, r: ring * 0.02 * Math.sin(e / 22) }; },
  props: (D, e) => { const q = io(e, 100, 350, 2900, 3200); if (q <= 0) return; const ring = (e % 900) < 600 && e < 2600 ? 1 : 0; D.notifPhone(640 + ring * 3 * Math.sin(e / 15), 335, px(D, 1.05 * q), ring, ring * 0.12 * Math.sin(e / 30)); } });
S('notif-agenda', 'L’agenda', 'evt', { dur: 3800, w: 5, when: has('rdv'), anim: [[0, 'curieux'], [1400, 'reflechit'], [2200, 'idee']], mood: 'reflechit',
  say: [[200, 1500, L('Un rappel !', 'Ton agenda !', 'Qu’est-ce qu’on a ?', 'Note bien ça !')], [1700, 3300, V(o => quote(o, 18), 'N’oublie pas !', 'Je te le rappelle !', () => 'Le ' + today() + ', c’est noté !')]],
  move: e => { const r = room(e, 0, 400, 3200, 3700, 140, 22, 0.85), nod = bump(seg(e, 1700, 2000)) + bump(seg(e, 2100, 2400)); return { x: r.x, y: r.y + 8 * nod, s: r.s, r: -0.06 * io(e, 1300, 1500, 2000, 2200) }; },
  props: (D, e) => { const q = io(e, 150, 400, 3100, 3400); if (q > 0) D.notifCalendar(170, 322, px(D, 1.05 * q), (seg(e, 450, 1550) * 3) % 1, today()); } });
S('notif-colis', 'Le colis', 'evt', { dur: 3900, w: 5, when: has('colis'), anim: [[0, 'surpris'], [900, 'etoiles'], [2400, 'amoureux'], [3200, 'content']], mood: 'excite',
  init: o => { o.item = pick(['star', 'heart']); },
  say: [[200, 1800, L('Un colis !', 'Livraison !', 'Ding dong, le livreur !')], [1900, 3400, L('C’est pour moi ?', 'Ouvre-le, ouvre-le !', 'Y a quoi dedans ?')]],
  move: e => { const r = room(e, 0, 400, 3300, 3800, 120, 20, 0.85), hop = e > 900 && e < 1800 ? jumps(e - 900, 300, 14) : 0; return { x: r.x, y: r.y + hop, s: r.s }; },
  props: (D, e, p, o) => { if (e < 100 || e > 3500) return; const q = seg(e, 100, 900), x = -60 + 260 * out(q), y = 362 - 140 * bump(q) * (1 - q * 0.3) - 14 * bump(seg(e, 900, 1150)); D.notifParcel(x, Math.min(y, 362), px(D, 1.1 * fin(e, 3200, 3500)), sm(seg(e, 2000, 2400)), out(seg(e, 2400, 3000)), o.item); } });
S('notif-anniv', 'Joyeux anniversaire', 'evt', { dur: 6000, w: 6, when: has('anniv'), anim: [[0, 'surpris'], [600, 'chante'], [3700, 'bisou'], [4400, 'etoiles']], mood: 'excite',
  say: [[300, 2000, L('Joyeux anniversaire !', 'C’est la fête !', 'Un anniversaire !')], [2100, 3600, L('♪ Joyeux anniv… ♪', 'Fais un vœu !', 'Et des bougies !')], [3700, 4300, L('Fffffff !', 'Fiouuu !')], [4400, 5400, L('Bravo !', 'Youpi !', 'Du gâteau !', 'Hip hip, hourra !')]],
  move: e => {
    const r = room(e, 0, 400, 5300, 5900, -120, 22, 0.82), sw = io(e, 600, 900, 3400, 3700), blow = io(e, 3700, 3850, 4200, 4400), hop = e > 4400 && e < 5300 ? jumps(e - 4400, 450, 14) : 0;
    return { x: r.x + 20 * blow + 10 * Math.sin(e / 400) * sw, y: r.y + hop, s: r.s, r: 0.07 * Math.sin(e / 400) * sw, sx: 1 + 0.08 * blow, sy: 1 - 0.05 * blow };
  },
  props: (D, e) => {
    const q = io(e, 200, 500, 5400, 5800); if (q <= 0) return;
    const lit = e < 3900 ? 3 : e < 4050 ? 2 : e < 4200 ? 1 : 0;
    D.notifCake(630, 350, px(D, 1.05 * q), lit, lit ? 0 : (seg(e, 4200, 5400) * 2) % 1, e);
    if (e > 600 && e < 3600) D.notes(e); if (e > 3750 && e < 4300) D.spray(seg(e, 3750, 4300)); if (e > 4400) D.stars(e - 4400);
  } });
S('notif-erreur', 'Oh oh, une erreur', 'evt', { dur: 3400, w: 5, when: has('erreur'), anim: [[0, 'surpris'], [500, 'erreur'], [1800, 'confus']], mood: 'confus',
  say: [[200, 1500, L('Oh oh…', 'Une erreur ?!', 'Aïe aïe aïe…', 'Ça sent le pépin…')], [1600, 3000, L('C’est pas moi !', 'J’ai rien touché !', 'On répare ça ?', 'Pas de panique…')]],
  move: e => { const r = room(e, 0, 400, 2900, 3350, 0, 40, 0.8), tr = io(e, 300, 500, 1500, 1800); return { x: 3 * Math.sin(e / 22) * tr + 30 * Math.sin(e / 420) * io(e, 1600, 1900, 2600, 2900), y: r.y, s: r.s, sy: 1 - 0.05 * tr }; },
  props: (D, e) => { const q = io(e, 150, 350, 2900, 3200); if (q > 0 && (e % 520) < 360) { const p = D.P(8, 30); D.notifWarning(p.x, p.y, 1.1 * q); } if (e > 400 && e < 3000) D.sweat(e); } });
S('notif-bug', 'La chasse au bug', 'evt', { dur: 4000, w: 4, when: has('erreur', 'git'), anim: [[0, 'bug'], [2350, 'colere'], [2600, 'confus'], [3300, 'boudeur']], mood: 'confus',
  say: [[200, 1700, L('Un bug !', 'Il y a un bug là !', 'Beurk, une bestiole !')], [1800, 2400, L('Bouge pas…', 'Je vais l’avoir…')], [2600, 3600, L('Raté !', 'Reviens ici, toi !', 'Il s’est échappé…')]],
  move: e => { const r = room(e, 0, 400, 3500, 3950, 0, 32, 0.9), slam = bump(seg(e, 2300, 2600)); return { y: r.y + 14 * slam, s: r.s, sy: 1 - 0.28 * slam, sx: 1 + 0.16 * slam, r: 0.08 * Math.sin(e / 300) * io(e, 300, 600, 2000, 2300) }; },
  props: (D, e) => {
    if (e < 200) return;
    if (e < 2400) { const t = seg(e, 200, 2400), p = D.P(16 + 58 * t, 31 + 7 * Math.sin(t * 9)), p2 = D.P(16 + 58 * (t + 0.01), 31 + 7 * Math.sin((t + 0.01) * 9)); D.notifBug(p.x, p.y, 0.9, e, Math.atan2(p2.y - p.y, p2.x - p.x) + Math.PI / 2); }
    else if (e < 3600) { const p = D.P(74, 31 + 7 * Math.sin(9)), q = inn(seg(e, 2450, 3400)); D.notifBug(p.x + (900 - p.x) * q, p.y - 30 * bump(seg(e, 2400, 2550)) - 80 * q, 0.9, e * 2, Math.PI / 2 - 0.4); }
  } });
S('notif-succes', 'Victoire !', 'evt', { dur: 3200, w: 5, when: has('ok'), anim: [[0, 'succes'], [1200, 'etoiles'], [2400, 'fier']], mood: 'fier',
  say: [[150, 1250, L('Youpi !', 'Mission accomplie !', 'C’est fini !', 'Trop fort !')], [1900, 2800, L('On est les meilleurs !', 'Champion !', 'Bien joué !', 'Au suivant !')]],
  move: e => { const r = room(e, 0, 300, 2700, 3150, 0, 34, 0.86), hop = e > 200 && e < 1200 ? jumps(e - 200, 330, 16) : 0, spin = sm(seg(e, 1250, 1850)); return { y: r.y + hop - 18 * bump(seg(e, 1250, 1850)), s: r.s, r: TAU * spin }; },
  props: (D, e) => { if (e > 150 && e < 3000) { D.notifConfetti(e - 150, 240, 330, 1); D.notifConfetti(Math.max(0, e - 450), 560, 330, e > 450 ? 1 : 0); } if (e > 1850) D.stars(e - 1850); } });
S('notif-trophee', 'La coupe', 'evt', { dur: 3600, w: 4, when: has('ok', 'like'), anim: [[0, 'reflechit'], [1500, 'fier'], [2600, 'etoiles']], mood: 'fier',
  say: [[300, 1500, L('Et le gagnant est…', 'Roulement de tambour…', 'Mesdames, messieurs…')], [1600, 3200, L('…moi !', 'Merci, merci !', 'Je dédie ça à toi !', 'Quel honneur !')]],
  move: e => { const r = room(e, 0, 400, 3100, 3550, 120, 40, 0.8), drum = e < 1500 ? 2 * Math.sin(e / 30) * seg(e, 400, 600) : 0, lift = bump(seg(e, 1500, 1900)); return { x: r.x + drum, y: r.y - 14 * lift, s: r.s, sy: 1 + 0.06 * lift }; },
  props: (D, e) => { const q = sm(seg(e, 1450, 1800)) * fin(e, 3000, 3300); if (q > 0) { const p = D.P(84, 16 + (1 - q) * 18); D.notifTrophy(p.x, p.y, 1.1, e > 1800 ? 0.6 + 0.4 * Math.sin(e / 120) : 0); } if (e > 1800 && e < 3200) D.stars(e - 1800); } });
S('notif-alerte', 'Alerte !', 'evt', { dur: 3600, w: 6, urgent: true, when: has('urgent'), anim: [[0, 'panique']], mood: 'surpris',
  say: [[100, 1500, L('ALERTE !', 'Alerte générale !', 'Urgent, urgent !')], [1600, 3100, L('Pas de panique !', 'Je panique !', 'Tous aux abris !', 'Garde ton calme !')]],
  move: e => { const r = room(e, 0, 300, 3000, 3500, 0, 45, 0.82), run = io(e, 300, 500, 2500, 2900); return { x: 150 * Math.sin(e / 320) * run, y: r.y + jumps(e, 160, 5) * run, s: r.s, f: Math.cos(e / 320) * run < -0.05 }; },
  props: (D, e) => { const q = io(e, 50, 250, 3000, 3300); if (q > 0) D.notifSiren(e, q); if (e > 300 && e < 3000) D.sweat(e); } });
S('notif-orage', 'L’orage', 'evt', { dur: 4000, w: 5, when: has('orage'), anim: [[0, 'surpris'], [600, 'panique'], [2200, 'triste']], mood: 'surpris',
  say: [[300, 1800, L('De l’orage ?!', 'Brrr, le tonnerre…', 'J’aime pas l’orage…')], [2000, 3600, L('Reste à l’abri !', 'Je reste avec toi.', 'Ça va passer…', 'Câlin anti-orage ?')]],
  move: e => { const r = room(e, 0, 400, 3500, 3950, 140, 40, 0.8), fl = (e > 900 && e < 1150) || (e > 1700 && e < 1900) ? 1 : 0; return { x: r.x + 2 * Math.sin(e / 20) * r.k, y: r.y - 12 * fl, s: r.s * (1 - 0.04 * fl) }; },
  props: (D, e) => { const q = io(e, 200, 500, 3400, 3800); if (q <= 0) return; const fl = (e > 850 && e < 1100) || (e > 1650 && e < 1850) || (e > 2800 && e < 2950); D.notifStorm(640, 150, px(D, 1.2 * q), fl); } });
S('notif-batterie', 'Batterie faible', 'evt', { dur: 4200, w: 5, when: has('batt'), anim: [[0, 'batterie-faible'], [2200, 'recharge'], [3500, 'content']], mood: 'baille',
  say: [[200, 1900, L('Batterie faible…', 'Je… me… vide…', 'Vite, un chargeur !', 'Plus de jus…')], [2300, 3800, L('Ah, ça recharge !', 'Plein d’énergie !', 'Ça va mieux !', 'Rechargé à bloc !')]],
  move: e => { const r = room(e, 0, 400, 3700, 4150, 130, 25, 0.85), droop = io(e, 300, 1500, 2100, 2500), boing = bump(seg(e, 3300, 3650)); return { x: r.x, y: r.y + 28 * droop - 18 * boing, s: r.s, sy: 1 - 0.14 * droop + 0.08 * boing, sx: 1 + 0.06 * droop, r: 0.1 * droop }; },
  props: (D, e) => { const q = io(e, 100, 350, 3800, 4100); if (q <= 0) return; const lv = e < 2200 ? 1 - 0.85 * sm(seg(e, 300, 1500)) : 0.15 + 0.85 * seg(e, 2300, 3300); D.notifBattery(170, 320, px(D, 1.2 * q), lv < 0.3 && (e % 500) > 330 ? 0 : lv, lv < 0.3, e > 2200 && e < 3400); } });
S('notif-musique', 'La musique', 'evt', { dur: 4500, w: 5, when: has('musique'), anim: [[0, 'ecoute'], [900, 'danse'], [3800, 'content']], mood: 'content',
  say: [[300, 1700, L('♪ J’adore ce son !', 'Ça groove !', 'Monte le son !', 'Ma chanson !')], [1900, 4100, L('♪ Boum tchak boum…', 'On danse ?', '♪ Yeah, yeah !', 'Quel rythme !')]],
  move: e => { const r = room(e, 0, 400, 4000, 4450, 0, 35, 0.88), d = io(e, 900, 1100, 3600, 3900); return { x: 30 * Math.sin(e / 500) * d, y: r.y + jumps(e, 500, 10) * d, s: r.s, r: 0.1 * Math.sin(e / 250) * d }; },
  props: (D, e) => { const q = io(e, 500, 900, 3700, 4100); if (q > 0) D.notifHeadphones(out(q), 0.8 * Math.abs(Math.sin(e / 250)) * io(e, 900, 1100, 3600, 3900)); if (e > 900 && e < 3900) D.notes(e); } });
S('notif-video', 'La vidéo', 'evt', { dur: 4000, w: 5, when: has('video'), anim: [[0, 'curieux'], [1400, 'etoiles'], [2500, 'content']], mood: 'excite',
  say: [[200, 1500, L('Une vidéo !', 'On regarde ensemble ?', 'Séance ciné !')], [1700, 3600, L('Pop-corn !', 'Chut, ça commence !', 'Pas de spoil, hein !', 'Encore un épisode ?')]],
  move: e => { const r = room(e, 0, 400, 3500, 3950, 130, 25, 0.85), chew = io(e, 1700, 1900, 3200, 3500); return { x: r.x, y: r.y + 3 * Math.abs(Math.sin(e / 110)) * chew, s: r.s, r: -0.05 * r.k }; },
  props: (D, e) => { const q = io(e, 150, 450, 3400, 3700); if (q <= 0) return; D.notifTV(170, 318, px(D, 1.25 * q), e); if (e > 1500) { const p = D.P(84, 42); D.notifPopcorn(p.x, p.y, sm(seg(e, 1500, 1800)) * q, e); } } });
S('notif-argent', 'Les sous', 'evt', { dur: 3800, w: 5, when: hasNot(['sous'], 'facture'), anim: [[0, 'surpris'], [500, 'etoiles'], [2600, 'amoureux']], mood: 'excite',
  say: [[200, 1700, L('Des sous !', 'Cha-ching !', 'On est riches !', 'Ça tombe bien !')], [1800, 3400, L('Une pizza, du coup ?', 'Mets-les de côté !', 'Vite, une tirelire !', 'J’adore les sous !')]],
  move: e => { const r = room(e, 0, 400, 3300, 3750, -120, 32, 0.86), hop = e > 500 && e < 2600 ? jumps(e - 500, 350, 10) : 0; return { x: r.x, y: r.y + hop, s: r.s, r: 0.05 * Math.sin(e / 180) * io(e, 500, 700, 2400, 2700) }; },
  props: (D, e) => { for (let i = 0; i < 9; i++) { const t0 = 200 + i * 240, q = seg(e, t0, t0 + 700); if (q <= 0 || q >= 1) continue; const t = D.P(30 + i * 4.5, 14); D.notifCoin(t.x + (i % 2 ? 20 : -20) * (1 - q), 118 + (t.y - 118) * q * q, px(D, 1.1), e / 90 + i); } } });
S('notif-facture', 'La facture', 'evt', { dur: 3800, w: 5, when: has('facture'), anim: [[0, 'surpris'], [600, 'triste'], [2800, 'boudeur']], mood: 'triste',
  say: [[200, 1600, L('Une facture…', 'Oh non, mes sous !', 'Ça part, ça part…')], [1800, 3400, L('Adieu, mes économies…', 'Reviens, petit euro !', 'On mangera des pâtes.', 'Ma tirelire pleure…')]],
  move: e => { const r = room(e, 0, 400, 3300, 3750, -130, 25, 0.85), sag = io(e, 800, 1500, 3000, 3400); return { x: r.x, y: r.y + 16 * sag, s: r.s, sy: 1 - 0.08 * sag, r: 0.06 * sag }; },
  props: (D, e) => {
    const o = D.P(48, 24);
    for (let i = 0; i < 7; i++) { const q = seg(e, 600 + i * 260, 1500 + i * 260); if (q <= 0 || q >= 1) continue; D.notifCoin(o.x + (740 - o.x) * out(q) + Math.sin(q * 9 + i) * 14, o.y + (130 - o.y) * q - 60 * bump(q), px(D, 1), e / 70 + i); }
    if (e > 1200 && e < 3400) D.tear('el', seg(e, 1200, 3200));
  } });
const CHAT = [[12, 16, '#'], [84, 18, '@'], [6, 36, '!'], [90, 38, '…'], [16, 4, '?'], [80, 4, '#']];
S('notif-groupe', 'Ça papote', 'evt', { dur: 3800, w: 5, when: has('groupe'), anim: [[0, 'ecoute'], [1500, 'rire'], [2800, 'parle']], mood: 'ecoute',
  say: [[200, 1600, L('Ça papote !', 'Tout le monde parle !', 'Quelle ambiance !')], [1800, 3400, o => (/mention|@/.test(norm(o.msg)) ? 'On t’a mentionné !' : pick(['Je peux parler aussi ?', 'Bla bla bla…', 'Et moi, et moi ?']))]],
  move: e => { const r = room(e, 0, 400, 3300, 3750, 0, 42, 0.8), i = Math.min(CHAT.length - 1, Math.floor(Math.max(0, e - 200) / 380)), look = io(e, 200, 400, 2500, 2800), side = CHAT[i][0] < 48 ? -1 : 1; return { x: side * 18 * look, y: r.y, s: r.s, r: side * 0.08 * look }; },
  props: (D, e) => { CHAT.forEach(([u, v, m], i) => { const t0 = 200 + i * 380, q = io(e, t0, t0 + 150, t0 + 1000, t0 + 1150); if (q > 0) { const p = D.P(u, v); D.notifTyping(p.x, p.y, 0.7 * q, e, m); } }); } });
S('notif-github', 'Le commit', 'evt', { dur: 3600, w: 5, when: has('git'), anim: [[0, 'code'], [2000, 'succes'], [2900, 'fier']], mood: 'reflechit',
  say: [[200, 1700, L('Nouveau commit !', 'Push sur la branche !', 'Une pull request !', 'Du code tout frais !')], [1900, 3200, L('Et… merge !', 'Revue de code ?', 'Zéro conflit, bravo !', 'Ça compile !')]],
  move: e => { const r = room(e, 0, 400, 3100, 3550, -130, 22, 0.85), tap = e < 1900 ? 2 * Math.abs(Math.sin(e / 70)) * seg(e, 300, 500) : 0, nod = bump(seg(e, 1900, 2250)); return { x: r.x, y: r.y + tap + 10 * nod, s: r.s }; },
  props: (D, e) => { const q = io(e, 200, 400, 3000, 3300); if (q > 0) D.notifGit(620, 335, px(D, 1.2 * q), seg(e, 300, 1950)); if (e > 2000 && e < 3000) D.stars(e - 2000); } });
S('notif-minuteur', 'Le sablier', 'evt', { dur: 3600, w: 5, when: has('minuteur'), anim: [[0, 'idle-impatient'], [1400, 'surpris'], [1900, 'content']], mood: 'surpris',
  say: [[200, 1400, L('Tic tac, tic tac…', 'Le temps file…', 'Plus que trois grains…')], [1500, 3200, L('Le temps est écoulé !', 'Ding ! C’est l’heure !', 'Pause méritée !', 'Top, c’est fini !')]],
  move: e => { const r = room(e, 0, 400, 3100, 3550, 130, 22, 0.85), tap = e < 1400 ? -4 * Math.abs(Math.sin(e / 120)) : 0, hop = bump(seg(e, 1400, 1800)); return { x: r.x, y: r.y + tap - 40 * hop, s: r.s, sy: 1 + 0.1 * hop, sx: 1 - 0.06 * hop }; },
  props: (D, e) => { const q = io(e, 100, 350, 3000, 3300); if (q > 0) D.notifHourglass(170, 330, px(D, 1.2 * q), Math.PI * sm(seg(e, 1900, 2300)), e < 1900 ? seg(e, 200, 1400) : 1 - seg(e, 2300, 3400)); } });
S('notif-meteo', 'Le bulletin météo', 'evt', { dur: 4400, w: 5, when: has('meteo'), anim: [[0, 'parle'], [1800, 'content']], mood: 'content',
  init: o => { const m = norm(o.msg); o.k = /pluie|pluvieux|averse|bruine|orage/.test(m) ? 'pluie' : /neige/.test(m) ? 'neige' : /soleil|ensoleille|degage|beau temps/.test(m) ? 'soleil' : 'nuage'; },
  say: [[200, 1700, L('Et maintenant, la météo !', 'Bulletin météo !', 'La météo de Pixel !')],
    [1900, 4000, o => pick({ pluie: ['Prends ton parapluie !', 'Ça va mouiller !'], neige: ['Bonhomme de neige ?', 'Mets ton bonnet !'], soleil: ['Lunettes de soleil !', 'Grand soleil !'], nuage: ['Un peu de nuages…', 'Ni chaud ni froid.'] }[o.k || 'nuage'])]],
  move: e => { const r = room(e, 0, 400, 3900, 4350, -120, 25, 0.82), pt = io(e, 300, 600, 1500, 1800); return { x: r.x, y: r.y, s: r.s, r: -0.06 * pt + 0.04 * Math.sin(e / 500) * r.k }; },
  props: (D, e, p, o) => {
    const k = o.k || 'nuage', q = io(e, 1700, 2100, 3900, 4250);
    if (e > 300 && e < 1800) { const t = D.P(86, 30); D.glyph('°C', t.x, t.y, 7 * D.U, D.col.acc); }
    if (q <= 0) return;
    if (k === 'pluie') { const t = D.P(48, 6); D.notifUmbrella(t.x, t.y, 1.1 * q, 0.08 * Math.sin(e / 400), e, true); }
    else if (k === 'soleil') { D.notifShades(q); D.sun(e, q); }
    else if (k === 'neige') D.snow(e, q);
    else { const t = D.P(84, 6); D.notifStorm(t.x, t.y, q, false); }
  } });
S('notif-lumiere', 'La lumière', 'evt', { dur: 3400, w: 5, when: has('hue'), anim: [[0, 'curieux'], [700, 'surpris'], [1300, 'content']], mood: 'excite',
  say: [[200, 1400, L('Clic !', 'Et la lumière fut !', 'Lumière !', 'Ça s’allume !')], [1500, 3000, o => { const m = /scene\s*:\s*([a-z0-9 ]+)/.exec(norm(o.msg)); return m ? 'Ambiance ' + m[1].trim().slice(0, 10) + ' !' : pick(['Joli, ces couleurs !', 'Ça brille !', 'J’y vois clair !']); }]],
  move: e => { const r = room(e, 0, 400, 2900, 3350, 130, 22, 0.85), sq = bump(seg(e, 700, 1000)); return { x: r.x, y: r.y + 6 * sq, s: r.s, sy: 1 - 0.1 * sq, sx: 1 + 0.06 * sq }; },
  props: (D, e) => { const q = io(e, 100, 350, 2900, 3200); if (q <= 0) return; const on = e > 700 && !(e > 850 && e < 950) && !(e > 1050 && e < 1100); D.notifBulb(170, 330, px(D, 1.25 * q), on, e); } });
S('notif-claude', 'Les collègues', 'evt', { dur: 4000, w: 5, when: has('ia'), anim: [[0, 'curieux'], [800, 'salut'], [2200, 'content']], mood: 'content',
  init: o => { o.k = /codex/.test(norm(o.msg)) ? 'codex' : 'claude'; },
  say: [[300, 1900, o => (o.k === 'codex' ? pick(['Salut, Codex !', 'Coucou, Codex !']) : pick(['Coucou, Claude !', 'Salut, collègue !']))],
    [2000, 3600, o => { const m = norm(o.msg); return /quota/.test(m) ? 'Il lui faut une pause.' : /termine|fini/.test(m) ? 'Bravo, collègue !' : /deja/.test(m) ? 'Il bosse déjà, chut !' : pick(['On fait équipe ?', 'Entre robots…', 'Mon collègue préféré !']); }]],
  move: e => { const r = room(e, 0, 400, 3500, 3950, 120, 22, 0.85); return { x: r.x, y: r.y + jumps(Math.max(0, e - 800), 400, 6) * io(e, 800, 900, 1900, 2000), s: r.s }; },
  props: (D, e, p, o) => { const q = out(seg(e, 200, 900)) * fin(e, 3200, 3800); if (q > 0) D.notifBuddy(-50 + 230 * q, 345 + 6 * Math.sin(e / 200), px(D, 1.2), o.k, io(e, 900, 1000, 2600, 2800), e); } });
S('notif-like', 'Un like !', 'evt', { dur: 3400, w: 5, when: has('like'), anim: [[0, 'surpris'], [500, 'timide'], [1600, 'fier']], mood: 'amoureux',
  say: [[200, 1500, L('Un like !', 'On m’aime !', 'Un cœur pour moi ?', 'Oh, un j’aime !')], [1600, 3000, L('Je suis célèbre !', 'Merci, merci !', 'Trop de succès…', 'Signez ici !')]],
  move: e => { const r = room(e, 0, 400, 2900, 3350, -120, 25, 0.85), puff = bump(seg(e, 1600, 2200)); return { x: r.x, y: r.y - 10 * puff, s: r.s * (1 + 0.06 * puff), r: -0.04 * puff }; },
  props: (D, e) => { const q = io(e, 200, 500, 2800, 3200); if (q > 0) { const p = D.P(80, 5); D.notifLike(p.x, p.y + 4 * (1 - q) * D.U - seg(e, 200, 3200) * 10, 1, q, e); } D.blush(io(e, 500, 900, 2800, 3200)); if (e > 1600 && e < 3000) D.hearts(e - 1600, 0.7); } });
S('notif-famille', 'C’est la famille', 'evt', { dur: 3600, w: 6, when: has('famille'), anim: [[0, 'salut'], [1700, 'amoureux']], mood: 'amoureux',
  say: [[200, 1600, o => { const m = /(maman|mamie|mamy|papa|papi|papy|tata|tonton)/.exec(norm(o.msg)); return m ? 'Oh, c’est ' + m[1] + ' !' : 'C’est la famille !'; }], [1700, 3200, L('Coucou de ma part !', 'Fais-lui un bisou !', 'Dis-lui que je l’aime !', 'Un gros câlin !')]],
  move: e => { const r = room(e, 0, 400, 3100, 3550, -130, 25, 0.85); return { x: r.x, y: r.y + jumps(e, 600, 6) * io(e, 200, 400, 1500, 1700), s: r.s, r: 0.05 * Math.sin(e / 300) * r.k }; },
  props: (D, e) => { const q = io(e, 200, 450, 2900, 3200); if (q > 0) { const p = D.P(16, 38); D.notifHand(p.x, p.y, 1.1 * q, 0.5 * Math.sin(e / 130)); } if (e > 1700) D.hearts(e - 1700, 1); D.blush(io(e, 1700, 2000, 3000, 3300)); } });
S('notif-maj', 'La mise à jour', 'evt', { dur: 4200, w: 5, when: has('maj'), anim: [[0, 'mise-a-jour'], [1500, 'chargement'], [3000, 'succes']], mood: 'reflechit',
  say: [[200, 1600, L('Mise à jour…', 'Je me mets à jour…', 'Ne m’éteins pas !')], [1800, 2900, L('Presque fini…', 'Encore un peu…', 'Ça charge…')], [3000, 3800, L('Nouveau moi !', 'Tout beau, tout neuf !', 'Version 2.0 !')]],
  move: e => { const r = room(e, 0, 400, 3700, 4150, 0, 18, 0.88), gl = e < 3000 && Math.floor(e / 330) % 4 === 1 ? 1 : 0, pop = bump(seg(e, 3000, 3400)); return { x: 6 * gl * Math.sin(e), y: r.y, s: r.s * (1 + 0.08 * pop), sx: 1 + 0.08 * gl }; },
  props: (D, e) => { const q = io(e, 150, 400, 3500, 3800); if (q > 0) D.notifProgress(380, 384, 280 * q, px(D, 1), sm(seg(e, 300, 3000))); if (e > 3000) D.stars(e - 3000); } });
S('notif-aurevoir', 'L’extinction', 'evt', { dur: 4400, w: 6, when: has('bye'), anim: [[0, 'salut'], [1600, 'sommeil'], [3300, 'reveil'], [3700, 'rire']], mood: 'content',
  say: [[200, 1500, L('À bientôt !', 'Bonne nuit !', 'Au revoir !', 'Bisous, à plus !')], [3400, 4000, L('Je rigole, je suis là !', 'Coucou, c’est re-moi !', 'Pas encore, hein !')]],
  move: e => {
    const y = 25 * io(e, 0, 300, 3700, 4300);
    if (e < 1600) return { y, r: 0.08 * Math.sin(e / 140) * seg(e, 200, 400) * (1 - seg(e, 1300, 1600)) };
    if (e < 2050) { const q = sm(seg(e, 1600, 2050)); return { y, sy: 1 - 0.97 * q, sx: 1 + 0.25 * q }; }
    if (e < 2400) { const q = sm(seg(e, 2050, 2400)); return { y, sy: 0.03, sx: 1.25 - 1.21 * q }; }
    if (e < 3300) return { y, sy: 0.03, sx: 0.04 };
    const q = out(seg(e, 3300, 3700)), b = bump(seg(e, 3300, 3900)); return { y, sy: 0.03 + 0.97 * q + 0.1 * b, sx: 0.04 + 0.96 * q - 0.05 * b };
  },
  props: (D, e) => { if (e > 1850 && e < 3300) D.notifTV0(e < 2400 ? 42 * (1 - sm(seg(e, 2050, 2400))) + 1 : 0, e > 2050 ? 2.6 * (1 - seg(e, 2400, 3250)) : 0); } });
S('notif-pave', 'Le pavé', 'evt', { dur: 5000, w: 6, when: d => info(d).long, anim: [[0, 'surpris'], [600, 'recherche'], [3000, 'confus']], mood: 'confus',
  say: [[600, 2600, L('Ça fait beaucoup à lire…', 'Un roman !', 'Pfiou, c’est long !', 'Attends, je lis tout…')], [2800, 4400, L('J’ai rien compris.', 'Tu me fais un résumé ?', 'Bon, je retiens tout !', 'Trop long, pas lu.')]],
  move: e => { const r = room(e, 0, 500, 4300, 4900, -150, 125, 0.55), read = io(e, 600, 800, 2600, 2800); return { x: r.x + 10 * Math.sin(e / 300) * read, y: r.y, s: r.s, r: 0.06 * Math.sin(e / 300) * read }; },
  props: (D, e) => { if (e > 2800 && e < 4400) D.sweat(e); } });
S('notif-question', 'Une question ?', 'evt', { dur: 3600, w: 4, when: d => !info(d).long && /\?[\s!.)»"’']*$/.test(String(d.msg || '')), anim: [[0, 'curieux'], [600, 'reflechit'], [1900, 'idee']], mood: 'reflechit',
  say: [[250, 1700, L('Une question ?', 'Hmm… bonne question.', 'Laisse-moi réfléchir…')], [1900, 3200, L('Euh… 42 ?', 'Demande à Claude !', 'Je dirais… oui ?', 'Réponse D !')]],
  move: e => { const r = room(e, 0, 400, 3100, 3550, 0, 38, 0.85), th = io(e, 500, 800, 1700, 1900), id = bump(seg(e, 1900, 2300)); return { y: r.y + 3 * Math.sin(e / 250) * th - 22 * id, s: r.s, r: 0.1 * th }; },
  props: (D, e) => {
    if (e > 300 && e < 1800) for (let i = 0; i < 3; i++) { const q = ((e - 300) / 900 + i / 3) % 1, p = D.P(i === 1 ? 84 : 12 + i * 2, 24 - q * 12); D.glyph('?', p.x, p.y, (4 + 3 * q) * D.U, i === 1 ? D.col.hi : D.col.acc); }
    const q = io(e, 1900, 2100, 3000, 3200); if (q > 0) { const p = D.P(86, 15); D.notifBulb(p.x, p.y, 0.9 * q, true, e); }
  } });
S('notif-cris', 'Pas si fort !', 'evt', { dur: 3000, w: 2, when: caps, anim: [[0, 'surpris'], [400, 'boudeur'], [2000, 'confus']], mood: 'fache',
  say: [[250, 1500, L('Pas si fort !', 'Pourquoi tu cries ?', 'Aïe, mes oreilles !', 'Moins fort !')], [1600, 2600, L('On se calme…', 'Chuuut…', 'Je suis pas sourd !', 'Ça résonne…')]],
  move: e => { const r = room(e, 0, 250, 2500, 2950, 0, 42, 0.86), sq = io(e, 100, 300, 1300, 1700); return { x: 3 * Math.sin(e / 20) * sq, y: r.y, s: r.s, sy: 1 - 0.12 * sq, sx: 1 + 0.07 * sq }; },
  props: (D, e) => { if (e > 100 && e < 1500) { D.notifWaves(190, 130, px(D, 1), e, 0.9); D.notifWaves(610, 130, px(D, 1), e, Math.PI - 0.9); } } });
S('notif-miam', 'Miam !', 'evt', { dur: 3600, w: 5, when: has('miam'), anim: [[0, 'surpris'], [500, 'amoureux'], [2400, 'content']], mood: 'amoureux',
  say: [[200, 1500, L('Miam !', 'Ça a l’air bon !', 'J’ai faim, du coup…', 'Slurp !')], [1600, 3200, L('J’en veux aussi !', 'Tu partages ?', 'Garde-m’en un bout !', 'Miam miam miam !')]],
  move: e => { const r = room(e, 0, 400, 3100, 3550, -120, 25, 0.85), bite = bump(seg(e, 2200, 2700)); return { x: r.x + 26 * bite, y: r.y + 4 * Math.sin(e / 200) * r.k, s: r.s, r: 0.05 * Math.sin(e / 400) * r.k + 0.08 * bite }; },
  props: (D, e) => { const q = io(e, 300, 600, 3000, 3300); if (q > 0) { const p = D.P(86, 42); D.notifPizza(p.x, p.y + Math.sin(e / 300) * D.U, 1.1 * q, e > 2450); } if (e > 600 && e < 2300) { const m = D.at('mouth'), q = ((e - 600) / 1100) % 1; D.drop(m.x + 4 * D.U, m.y + 2 * D.U + q * 6 * D.U, 1.4 * D.U, D.col.hi); } } });

/* ---------- the rhythm: at night he grumbles, a burst of notifications overwhelms him ---------- */
S('notif-nuit', 'Chut… il est tard', 'evt', { dur: 4400, w: 10, when: d => info(d).night, anim: [[0, 'idle-somnole'], [300, 'boudeur'], [2600, 'sommeil']], mood: 'endormi',
  say: [[500, 2200, L('Chut… il est tard…', 'Qui écrit à cette heure ?!', 'Mmmh… pas maintenant…', 'Il fait nuit, là…')], [2400, 3800, L('Ça attendra demain.', 'Dodo, tout le monde.', 'Zzz… rendors-toi…', 'Demain, promis.')]],
  move: e => { const r = room(e, 0, 600, 3700, 4350, 130, 42, 0.85), jolt = bump(seg(e, 150, 450)); return { x: r.x, y: r.y - 14 * jolt, s: r.s, r: 0.05 * Math.sin(e / 700) * r.k, sy: 1 - 0.06 * sm(seg(e, 2400, 3200)) * fin(e, 3600, 4200) }; },
  props: (D, e) => { const q = io(e, 0, 400, 3900, 4200); if (q > 0.3) D.notifNightcap(q, e); if (e > 2400) D.zzz(e - 2400, fin(e, 3900, 4300)); } });
S('notif-oreiller', 'Sous l’oreiller', 'evt', { dur: 4200, w: 6, when: d => info(d).night, anim: [[0, 'surpris'], [500, 'fatigue'], [1800, 'sommeil']], mood: 'endormi',
  say: [[450, 1800, L('Laissez-moi dormir !', 'Pas maintenant…', 'Non, non, non…', 'C’est la nuit !')], [2000, 3700, L('Zzz…', 'Mmmh… demain.', 'Ronpchhh…', 'Zzz… pizza…')]],
  move: e => { const r = room(e, 0, 500, 3600, 4150, -125, 45, 0.85), pr = io(e, 700, 1000, 3300, 3700); return { y: r.y + 10 * pr, s: r.s, sy: 1 - 0.14 * pr, sx: 1 + 0.07 * pr, x: r.x + 4 * Math.sin(e / 35) * io(e, 150, 250, 450, 600) }; },
  props: (D, e) => { const q = sm(seg(e, 400, 900)) * fin(e, 3500, 3900); if (q > 0) D.notifPillow(q, io(e, 700, 1000, 3300, 3700)); if (e > 1800 && e < 3800) D.zzz(e - 1800, 1); } });
S('notif-encore', 'Encore une ?!', 'evt', { dur: 3600, w: 8, when: d => info(d).n >= 3, anim: [[0, 'surpris'], [500, 'boudeur'], [2200, 'fatigue']], mood: 'confus',
  init: o => { o.n = Math.max(3, STAMPS.length); },
  say: [[200, 1600, L('Encore une ?!', 'Encore ?!', 'C’est pas fini ?!', 'Et une de plus…')], [1700, 3200, V(o => o.n + ' notifs en une minute !', 'Pause, pitié !', 'Je suis débordé !', 'Ça n’arrête pas !')]],
  move: e => { const r = room(e, 0, 400, 3100, 3550, -130, 50, 0.8), wt = io(e, 300, 1400, 2400, 2800), sh = io(e, 2400, 2500, 2900, 3000); return { x: r.x + 8 * Math.sin(e / 40) * sh, y: r.y + 14 * wt, s: r.s, sy: 1 - 0.12 * wt, sx: 1 + 0.06 * wt, r: 0.05 * Math.sin(e / 40) * sh }; },
  props: (D, e) => { const n = Math.min(4, Math.floor(Math.max(0, e - 150) / 320) + 1), off = sm(seg(e, 2500, 3000)); if (e > 150 && off < 1) D.notifPile(n, 0.4 * Math.sin(e / 130) * (1 + 3 * off)); } });
S('notif-jongle', 'Le jongleur', 'evt', { dur: 4200, w: 6, when: d => info(d).n >= 3, anim: [[0, 'surpris'], [400, 'fier'], [3000, 'surpris'], [3400, 'timide']], mood: 'fier',
  say: [[200, 1600, L('Je gère, je gère !', 'Hop, hop, hop !', 'Regarde, je jongle !')], [1700, 2900, L('Encore une ? Allez !', 'Toujours plus !', 'Facile !')], [3050, 3700, L('Oups…', 'J’en ai fait tomber…', 'Je ramasse !')]],
  move: e => { const r = room(e, 0, 400, 3600, 4100, -125, 45, 0.8), j = io(e, 300, 500, 2900, 3000); return { x: r.x + 10 * Math.sin(e / 275) * j, y: r.y + 4 * Math.abs(Math.sin(e / 275)) * j - 16 * bump(seg(e, 3000, 3300)), s: r.s, r: 0.06 * Math.sin(e / 550) * j }; },
  props: (D, e) => {
    const c = D.P(48, 8), n = e < 1700 ? 3 : 4, s = 0.8, u = D.U * s;
    if (e > 300 && e < 3000) D.notifJuggle(e, c.x, c.y, s, n);
    else if (e >= 3000 && e < 3700) for (let i = 0; i < 4; i++) {
      const t = (e - 3000) / 1000, a = TAU * ((3000 / 1100 + i / 4) % 1), x = c.x + Math.cos(a) * 13 * u + (i - 1.5) * 40 * t, y = c.y - Math.max(0, Math.sin(a)) * 15 * u + 900 * t * t;
      if (y < HT - 30) D.notifEnvelope(x, y, s * 0.55, 0, t * 6 + i);
    }
  } });
S('notif-deborde', 'Débordé', 'evt', { dur: 4400, w: 6, when: d => info(d).n >= 3, anim: [[0, 'surpris'], [600, 'panique'], [2800, 'etoiles'], [3600, 'content']], mood: 'surpris',
  say: [[400, 1600, L('Au secours !', 'Trop de notifs !', 'Je coule !', 'Il en pleut !')], [1700, 2700, L('Glub glub…', 'À l’aide…', 'Je suis enseveli…')], [3300, 4000, L('Ouf ! Libre !', 'Bon, on les lit ?', 'Pfiou…', 'Me revoilà !')]],
  move: e => { const sink = out(seg(e, 0, 1800)) * fin(e, 2800, 3000), burst = bump(seg(e, 2800, 3300)); return { x: 4 * Math.sin(e / 30) * io(e, 600, 800, 2400, 2800), y: 60 * sink - 50 * burst, s: 1 - 0.3 * sink, sy: 1 + 0.1 * burst }; },
  props: (D, e) => { if (e < 4000) D.notifMailRain(e, 1 - sm(seg(e, 2800, 3500))); } });

/* the generic reactions (no "when") step aside when the message has its own scene, at night and in a burst (see info) */
const GEN = MINE.filter(s => !s.when);
for (const s of GEN) s.w0 = s.w;
});
