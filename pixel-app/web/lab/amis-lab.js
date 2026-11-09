/* Pixel Lab: les amis de Pixel (../amis.js draws them, ../scenes/amis.js plays them). The lab's mirror of pixel/amis.py,
   plugged into demo-hub.js's fake server (PixelHub.local: its state S and its actions A): the same snapshot "amis", the same
   actions amis.* and the same typed commands, with no relay and no network: a built-in demo friend, « Bip » (and a few
   more to make), is played by this page. Try a visit both ways (« Va voir Bip » sends Pixel off, « Bip vient te voir » brings
   Bip here), a coucou, a sticker, « Me demander avant », a friend who sleeps or does not answer, a code to give or to type.
   Then a « Les amis » panel after « Exos de maths ». The lab only: Pixel sans Pi (window.PIXEL_LOCAL) has no friends yet. */
(() => {
const hub = window.PixelHub, AM = window.PixelAmis, ART = window.PixelAmisArt, $ = id => document.getElementById(id);
if (!hub || !hub.local || !AM || window.PIXEL_LOCAL) return;
const S = hub.S, H = hub.local, A = H.A, toast = (m, ms = 4000) => H.toast(m, ms);
const hex = n => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
const now = () => Date.now();
const DEMO = [['Bip', 'farceur', 'neon'], ['Zia', 'calin', 'manga'], ['Momo', 'gourmand', 'croquis'], ['Lulu', 'reveur', 'moderne'], ['Tic', 'pile', 'lcd']];
const friend = ([nom, caractere, theme], t = now()) => ({ id: hex(16), nom, caractere, theme, look: null, depuis: t, vu: t, visite: 0, n: 0, coucou: 0 });
const lab = { muet: false, dort: false, court: true };       // the lab's buttons: he does not answer, he sleeps, short visits (30 s)
const st = { on: true, visites: true, demander: false, amis: [friend(DEMO[0], now() - 3 * 864e5)], code: null, ajout: null, visite: null, evs: [], journal: [], montre: 0, ev: 0, out: {} };
const durs = () => Object.fromEntries((typeof Screens !== 'undefined' && Screens.persona ? Screens.persona.scenes : []).map(s => [s.id, s.dur]));
const visitMs = () => (lab.court ? 30000 : 180000);
const myCard = () => ({ v: 1, id: 'labo00000000000a', nom: (S.caractere && S.caractere.nom) || 'Pixel', caractere: (S.caractere && S.caractere.preset) || 'pixel', theme: S.view.theme, look: S.look || null });
const find = ami => st.amis.find(f => f.id === ami) || st.amis.find(f => AM.norm(f.nom) === AM.norm(ami)) || null;
const ACT = AM.ACTIVITES.concat(['ami-photo']);
function pub() {
  S.amis = { dispo: true, pourquoi: '', on: st.on, visites: st.visites, demander: st.demander, relais: 'relais de démo (dans la page)', lien: st.on ? 'ok' : 'off', max: 20,
    moi: myCard(), code: st.code ? { code: st.code.code, ...AM.ecrit(st.code.code), expire: st.code.expire, qr: [] } : null, montre: st.montre > now() && st.code ? st.montre : 0,
    ajout: st.ajout ? { ...st.ajout } : null, amis: st.amis.map(f => ({ ...f })), arrivent: [], visite: st.visite ? { ...st.visite } : null,
    evs: st.evs.map(e => ({ ...e })), journal: st.journal.map(j => ({ ...j })) };
}
const done = () => { pub(); H.mark(); };
function ev(kind, f, data = {}) { st.ev++; st.evs = [...st.evs, { id: st.ev, kind, t0: now(), ...(f ? { ami: f.id, nom: f.nom, look: f.look } : {}), ...data }].slice(-6); }
function log(quoi, f, data = {}) { st.journal = [{ t: now(), quoi, ami: f ? f.id : '', nom: f ? f.nom : (data.nom || ''), ...data }, ...st.journal].slice(0, 30); }
const off = () => { if (!st.on) { toast('Les amis de Pixel sont éteints. Rallume-les dans le panneau « Les amis ».', 5000); return true; } return false; };

/* ---------- his own visits (pixel/amis.py visiter): Bip answers in a second, unless he sleeps or does not answer ---------- */
function home(fait, refus, par) {
  const v = st.visite; if (!v || v.sens !== 'sortie') return;
  const f = find(v.ami); st.visite = null; S.anim = null; S.screen = 'visage';
  if (refus) { ev('retour', f, { refus, ...(f ? {} : { nom: v.nom }) }); log('refus', f, { refus, nom: v.nom }); return done(); }
  ev('retour', f, { fait: fait || [], par: par || 'fin', ...(f ? {} : { nom: v.nom }) });
  if (f && v.etat === 'chez') { f.visite = now(); f.n++; }
  if (v.etat === 'chez') log('visite', f, { fait: fait || [], nom: v.nom });
  done();
}
function go(ami) {
  const f = find(ami); if (!f || off()) return;
  if (st.visite) return toast(st.visite.sens === 'sortie' ? `${myCard().nom} est déjà parti chez ${st.visite.nom} !` : `${myCard().nom} a de la visite : il ne peut pas sortir maintenant.`);
  const vid = hex(12), t = now();
  st.visite = { vid, sens: 'sortie', ami: f.id, nom: f.nom, etat: 'demande', t0: t, jusqua: t + 8000 };
  S.anim = null; S.screen = 'visage'; done();
  setTimeout(() => {
    const v = st.visite; if (!v || v.vid !== vid || lab.muet) return;
    if (lab.dort) return home(null, 'dort');
    const dur = visitMs(); Object.assign(v, { etat: 'chez', fin: now() + dur, jusqua: now() + dur + 30000 }); done();
    setTimeout(() => { const w = st.visite; if (w && w.vid === vid) home(ACT.filter(() => Math.random() < 0.5).slice(0, 4).concat(['ami-photo']), null, 'fin'); }, dur);
  }, 1200);
}
/* ---------- Bip comes here (pixel/amis.py _accueillir): the same programme of two-Pixel scenes as on the Pi ---------- */
function welcome(f, vid) {
  const h = new Date().getHours(), { items, total } = AM.programme(visitMs(), h >= 20 || h < 5, durs()), t0 = now() + 400;
  st.visite = { vid, sens: 'accueil', ami: f.id, nom: f.nom, etat: 'chez', t0, fin: t0 + total, programme: items, seed: Math.floor(Math.random() * 1e9) };
  S.anim = null; S.screen = 'visage';
}
function visit(f) {
  if (!f || off()) return;
  if (!st.visites) { log('refuse', f, { refus: 'ferme' }); return toast(`${f.nom} voulait venir : les visites sont fermées.`); }
  if (st.visite) { log('refuse', f, { refus: st.visite.sens === 'sortie' ? 'absent' : 'visite' }); return toast(`${f.nom} voulait venir, mais ${st.visite.sens === 'sortie' ? 'Pixel n’est pas là' : 'il y a déjà de la visite'}.`); }
  if (S.exos && S.exos.cur && S.exos.cur.etat === 'question') { log('refuse', f, { refus: 'exo' }); return toast(`${f.nom} voulait venir : un exo est ouvert.`); }
  const vid = hex(12);
  if (st.demander) { st.visite = { vid, sens: 'accueil', ami: f.id, nom: f.nom, etat: 'question', t0: now(), jusqua: now() + 45000 }; ev('question', f); S.screen = 'visage'; return; }
  welcome(f, vid);
}
function hostEnd() {
  const v = st.visite; if (!v || v.sens !== 'accueil') return;
  const f = find(v.ami), e = now() - v.t0, fait = (v.programme || []).filter(it => it.at <= e && AM.ACTIVITES.concat(['ami-photo', 'ami-dodo']).includes(it.id)).map(it => it.id);
  st.visite = null; if (f) { f.visite = now(); f.n++; }
  log('accueil', f, { fait, nom: v.nom }); done();
}
function goodbye(par) {
  const v = st.visite; if (!v || v.sens !== 'accueil' || v.etat !== 'chez') return;
  const e = now() - v.t0; if (v.programme.some(it => it.id === 'ami-aurevoir' && it.at <= e + 1000)) return;
  v.programme = v.programme.filter(it => it.at <= e).concat([{ id: 'ami-aurevoir', at: Math.max(0, e) + 300 }]); v.fin = v.t0 + Math.max(0, e) + 300 + (durs()['ami-aurevoir'] || 9000); v.par = par;
}
setInterval(() => {
  const v = st.visite, t = now(); if (!v) { if (st.montre && t > st.montre) { st.montre = 0; done(); } return; }
  if (v.sens === 'sortie' && (v.etat === 'demande' || v.etat === 'attente') && t > v.jusqua) home(null, 'pas-de-reponse');
  else if (v.sens === 'sortie' && v.etat === 'chez' && t > v.jusqua) home([], null, 'temps');
  else if (v.sens === 'accueil' && v.etat === 'question' && t > v.jusqua) { const f = find(v.ami); st.visite = null; log('refuse', f, { refus: 'pas-repondu' }); done(); }
  else if (v.sens === 'accueil' && v.etat === 'chez' && t >= v.fin) hostEnd();
}, 250);

/* ---------- becoming friends (the meeting is pretend: a demo friend says yes in a second) ---------- */
function newFriend() {
  const used = new Set(st.amis.map(f => f.nom)), d = DEMO.find(x => !used.has(x[0])) || [`Pixou ${st.amis.length + 1}`, 'pixel', 'retro'];
  const f = friend(d); st.amis.push(f); ev('nouvel-ami', f); log('nouvel-ami', f); return f;
}
Object.assign(A, {
  'amis.code': () => { if (off()) return; if (st.amis.length >= 20) return toast('Pixel a déjà 20 amis : c’est le maximum.'); if (!st.code || now() > st.code.expire) st.code = { code: AM.nouveau(), expire: now() + 864e5 }; pub(); },
  'amis.code_annule': () => { st.code = null; st.montre = 0; pub(); },
  'amis.montre': ({ on = true } = {}) => { if (on === false) st.montre = 0; else { A['amis.code'](); if (st.code) { st.montre = now() + 90000; S.anim = null; S.screen = 'visage'; } } pub(); },
  'amis.ajoute': ({ code = '' } = {}) => {
    if (off()) return;
    const p = AM.parse(code);
    if (!p.code) { st.ajout = { etat: 'erreur', pourquoi: AM.pourquoi(p.why), t: now() }; return pub(); }
    if (st.code && st.code.code === p.code) { st.ajout = { etat: 'erreur', pourquoi: 'C’est le code de ton Pixel ! Donne-le à ton copain : c’est lui qui le tape.', t: now() }; return pub(); }
    st.ajout = { etat: 'attente', t: now() }; pub();
    setTimeout(() => { if (!st.ajout || st.ajout.etat !== 'attente') return; const f = newFriend(); st.ajout = { etat: 'ok', nom: f.nom, t: now() }; done(); }, 1500);
  },
  'amis.ajout_ok': () => { st.ajout = null; pub(); },
  'amis.visite': ({ ami = '' } = {}) => go(String(ami)),
  'amis.rappel': () => { const v = st.visite; if (v && v.sens === 'sortie') home([], null, 'rappel'); },
  'amis.raccompagne': () => { const v = st.visite; if (!v || v.sens !== 'accueil') return; if (v.etat === 'question') { st.visite = null; log('refuse', find(v.ami), { refus: 'non' }); } else goodbye('hote'); pub(); },
  'amis.reponse': ({ vid = '', oui = false } = {}) => {
    const v = st.visite; if (!v || v.sens !== 'accueil' || v.etat !== 'question' || v.vid !== vid) return;
    const f = find(v.ami); if (oui === true && f) welcome(f, vid); else { st.visite = null; log('refuse', f, { refus: 'non' }); }
    pub();
  },
  'amis.coucou': ({ ami = '' } = {}) => {
    const f = find(String(ami)); if (!f || off()) return;
    if (now() - (st.out['c' + f.id] || 0) < 20000) return toast('Doucement : ton coucou est déjà parti !');
    st.out['c' + f.id] = now(); ev('envoi', f); log('coucou-envoye', f); pub();
    setTimeout(() => { if (find(f.id) && !st.visite) { ev('coucou', f); log('coucou-recu', f); f.coucou = now(); done(); } }, 4500);   // he waves back
  },
  'amis.sticker': ({ ami = '', s = '' } = {}) => {
    const f = find(String(ami)); if (!f || !ART || !ART.BY[s] || off()) return;
    if (now() - (st.out['s' + f.id] || 0) < 8000) return toast('Doucement : ton autocollant est déjà parti !');
    st.out['s' + f.id] = now(); ev('envoi', f, { s, sn: ART.BY[s].nom }); log('sticker-envoye', f, { s }); pub();
  },
  'amis.retire': ({ ami = '' } = {}) => {
    const f = find(String(ami)); if (!f) return;
    if (st.visite && st.visite.ami === f.id) { if (st.visite.sens === 'sortie') home([], null, 'fin'); else st.visite = null; }
    st.amis = st.amis.filter(x => x !== f); for (const j of st.journal) if (j.ami === f.id) j.ami = '';
    log('retire', null, { nom: f.nom }); toast(`${f.nom} n’est plus dans ses amis.`); pub();
  },
  'amis.reglages': ({ on = null, visites = null, demander = null } = {}) => {
    if (typeof visites === 'boolean') st.visites = visites;
    if (typeof demander === 'boolean') st.demander = demander;
    if (typeof on === 'boolean' && on !== st.on) { st.on = on; if (!on) { if (st.visite && st.visite.sens === 'sortie') home([], null, 'fin'); st.visite = null; st.ajout = null; st.montre = 0; } }
    pub();
  },
  /* the lab's own: what the demo friend does */
  'lab.amis': ({ quoi = '', s = 'coeur' } = {}) => {
    const f = st.amis[0] || null;
    if (quoi === 'muet' || quoi === 'dort' || quoi === 'court') { lab[quoi] = !lab[quoi]; return pub(); }
    if (quoi === 'bip') { if (!st.amis.some(x => x.nom === 'Bip')) { const b = friend(DEMO[0]); st.amis.unshift(b); ev('nouvel-ami', b); log('nouvel-ami', b); } return pub(); }
    if (quoi === 'code') { if (!st.code) A['amis.code'](); if (!st.code) return; st.code = null; st.montre = 0; newFriend(); return pub(); }   // a friend types your code
    if (!f || off()) return;
    if (quoi === 'scene' && AM.ACTIVITES.concat(['ami-arrive', 'ami-photo', 'ami-dodo', 'ami-aurevoir']).includes(s)) {   // one two-Pixel scene, now
      const d = durs()[s] || 10000, t = now(), v = st.visite;
      if (v && v.sens === 'accueil' && v.etat === 'chez') { const e = t - v.t0; v.programme = v.programme.filter(it => it.at < e).concat([{ id: s, at: e }]); v.fin = t + d; }
      else if (!v) { st.visite = { vid: hex(12), sens: 'accueil', ami: f.id, nom: f.nom, etat: 'chez', t0: t, fin: t + d, programme: [{ id: s, at: 0 }], seed: Math.floor(Math.random() * 1e9) }; S.anim = null; S.screen = 'visage'; }
      return pub();
    }
    if (quoi === 'visite') visit(f);
    else if (quoi === 'coucou') { ev('coucou', f); log('coucou-recu', f); f.coucou = now(); }
    else if (quoi === 'sticker' && ART && ART.BY[s]) { ev('sticker', f, { s, sn: ART.BY[s].nom }); log('sticker-recu', f, { s }); }
    pub();
  },
});
/* the typed commands (pixel/amis.py command()): asked first here, they never take another feature's words */
const cmd0 = A.cmd;
A.cmd = ({ text } = {}) => {
  const r = AM.command(String(text ?? '').slice(0, 2000), S.amis);
  if (!r) return cmd0({ text });
  if (r.toast) return toast(r.toast, r.ms || 6000);
  return A[r.action] ? A[r.action](r.args || {}) : undefined;
};
pub();

/* ---------- the lab's panel « Les amis », after « Exos de maths » ---------- */
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const act = (a, x) => { if (typeof Screens !== 'undefined') { Screens.local.sleepy = false; Screens.local.lastInput = performance.now(); } hub.dispatch(a, x || {}); };
const button = (label, fn, id) => { const b = el('button', null, label); b.type = 'button'; if (id) b.id = id; b.addEventListener('click', () => { fn(); setTimeout(render, 60); }); return b; };
const group = (title, ...kids) => { const box = el('div', 'ev'); box.append(el('h3', null, title), ...kids); return box; };
const sec = el('section', 'grp amis-lab'), h2 = el('h2', null, 'Les amis'); h2.id = 'hAmis'; sec.setAttribute('aria-labelledby', 'hAmis'); sec.id = 'amis-lab';
const list = el('div', 'btns'), bipB = el('div', 'btns'), code = el('div', 'btns'), set = el('div', 'btns'), stick = el('div', 'amis-lab-stickers'), state = el('p', 'note'), jr = el('ol', 'amis-lab-journal');
const form = el('form', 'inline'), inp = el('input'), addB = el('button', null, 'Ajouter'); addB.type = 'submit';
Object.assign(inp, { type: 'text', placeholder: 'lapin soleil tarte 4271', autocomplete: 'off', spellcheck: false }); inp.setAttribute('aria-label', 'Le code d’ami d’un copain');
form.append(inp, addB); form.addEventListener('submit', e => { e.preventDefault(); if (inp.value.trim()) { act('amis.ajoute', { code: inp.value }); inp.value = ''; setTimeout(render, 60); } });
const first = () => st.amis[0];
bipB.append(button('Il vient te voir', () => act('lab.amis', { quoi: 'visite' })), button('Il fait coucou', () => act('lab.amis', { quoi: 'coucou' })),
  button('Il dort', () => act('lab.amis', { quoi: 'dort' }), 'amisLabDort'), button('Il ne répond pas', () => act('lab.amis', { quoi: 'muet' }), 'amisLabMuet'));
for (const s of ART ? ART.STICKERS : []) {
  const b = el('button'), c = el('canvas'); b.type = 'button'; c.width = c.height = 12; b.append(c); b.dataset.s = s.id; b.title = s.nom; b.setAttribute('aria-label', 'Il t’envoie ' + s.nom);
  b.addEventListener('click', () => act('lab.amis', { quoi: 'sticker', s: s.id })); stick.append(b);
}
code.append(button('Mon code d’ami', () => act('amis.montre', { on: true })), button('Un copain tape mon code', () => act('lab.amis', { quoi: 'code' })), button('Remettre Bip', () => act('lab.amis', { quoi: 'bip' })));
set.append(button('Accepter les visites', () => act('amis.reglages', { visites: !st.visites }), 'amisLabVis'), button('Me demander avant', () => act('amis.reglages', { demander: !st.demander }), 'amisLabAsk'),
  button('Amis', () => act('amis.reglages', { on: !st.on }), 'amisLabOn'), button('Visites courtes (30 s)', () => act('lab.amis', { quoi: 'court' }), 'amisLabCourt'));
const bipTitle = el('h3', null, 'Son ami');
const scenes = el('div', 'chips');                         // each two-Pixel scene of a visit, on its own
for (const [id, label] of [['ami-arrive', 'Il arrive'], ['ami-danse', 'Danse'], ['ami-tape', 'Tape là'], ['ami-course', 'Course'], ['ami-gouter', 'Goûter'], ['ami-cache', 'Cache-cache'],
  ['ami-blague', 'Blague'], ['ami-bavarde', 'Bavardage'], ['ami-photo', 'Photo'], ['ami-dodo', 'Dodo'], ['ami-aurevoir', 'Au revoir']]) {
  const b = el('button', 'chip', label); b.type = 'button'; b.addEventListener('click', () => act('lab.amis', { quoi: 'scene', s: id })); scenes.append(b);
}
const bipBox = el('div', 'ev'); bipBox.append(bipTitle, bipB, stick, el('h3', null, 'Une scène à deux, tout de suite'), scenes);
sec.append(h2, el('p', 'note', 'Ses amis sont les Pixels des copains, chacun chez lui. Ici, un faux relais dans la page joue son ami « Bip » : envoie Pixel chez lui, ou fais-le venir ici. Sur le vrai Pixel, tout passe chiffré par un relais (docs/AMIS.md).'),
  group('Ses amis', list), bipBox, group('Devenir amis', code, form), group('Réglages', set), state, jr);
const exosSec = $('hExos') && $('hExos').closest('section');
if (exosSec) exosSec.after(sec); else if ($('panel')) $('panel').append(sec);
let painted = '';
function render() {
  const a = S.amis; if (!a) return;
  const th = S.view.theme, t = hub.ALLT.find(x => x.id === th) || hub.ALLT[0];
  if (ART && t && t.c && painted !== th) { painted = th; const col = ART.theme(t.c); stick.style.setProperty('--al-bg', t.c.bg); stick.querySelectorAll('button').forEach(b => { const g = b.firstChild.getContext('2d'); g.clearRect(0, 0, 12, 12); const sp = ART.sprite(b.dataset.s, col); if (sp) g.drawImage(sp, 0, 0); }); }
  const f = first(), busy = !!a.visite;
  list.replaceChildren(...(a.amis.length ? a.amis.flatMap(x => [button(`Va voir ${x.nom}`, () => act('amis.visite', { ami: x.id })), button(`Coucou à ${x.nom}`, () => act('amis.coucou', { ami: x.id })), button(`Un cœur à ${x.nom}`, () => act('amis.sticker', { ami: x.id, s: 'coeur' })), button(`Retirer ${x.nom}`, () => act('amis.retire', { ami: x.id }))])
    : [el('span', 'note', 'Pas encore d’ami : « Un copain tape mon code », ou tape un code ci-dessous.')]));
  list.querySelectorAll('button').forEach(b => { if (/^Va voir/.test(b.textContent)) b.disabled = busy || !a.on; });
  bipTitle.textContent = f ? `Son ami ${f.nom} (pour de faux)` : 'Son ami';
  bipBox.hidden = !f;
  const press = (id, on) => { const b = $(id); if (b) b.setAttribute('aria-pressed', String(!!on)); };
  press('amisLabDort', lab.dort); press('amisLabMuet', lab.muet); press('amisLabVis', a.visites); press('amisLabAsk', a.demander); press('amisLabOn', a.on); press('amisLabCourt', lab.court);
  const v = a.visite;
  const vs = !v ? 'Pas de visite en ce moment.' : v.sens === 'sortie' ? `Pixel est parti chez ${v.nom} (${({ demande: 'il frappe', attente: 'on lui demande', chez: 'ils jouent' })[v.etat] || v.etat}).`
    : v.etat === 'question' ? `${v.nom} frappe à la porte : réponds sur l’écran.` : `${v.nom} est en visite : ${(v.programme || []).length} scènes.`;
  const cs = a.code ? ` Son code : ${AM.texte(a.code.code)}.` : '', as = a.ajout ? ` ${a.ajout.etat === 'ok' ? a.ajout.nom + ' est son ami !' : a.ajout.etat === 'erreur' ? a.ajout.pourquoi : 'On cherche le Pixel du copain…'}` : '';
  const txt = vs + cs + as;
  if (state.textContent !== txt) state.textContent = txt;
  const lines = (a.journal || []).slice(0, 4).map(j => AM.said(j)).filter(Boolean);
  if (jr.dataset.k !== lines.join('|')) { jr.dataset.k = lines.join('|'); jr.replaceChildren(...lines.map(l => el('li', 'note', l))); }
}
let seen = '';
setInterval(() => { const k = JSON.stringify([S.amis, S.view.theme, lab]); if (k !== seen) { seen = k; render(); } }, 400);
render();
{                                                         // the commands to type (« Commandes à taper »), as caractere-lab.js does
  const ul = document.querySelector('section[aria-labelledby="hHelp"] .cmds');
  if (ul) for (const [c, d] of [['va voir Bip', 'chez son ami'], ['dis coucou à Bip', 'un coucou'], ['mes amis', 'la liste']]) { const li = el('li'); li.append(el('code', null, c), el('span', null, d)); ul.append(li); }
}
})();
