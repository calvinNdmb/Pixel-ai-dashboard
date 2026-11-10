// « Son look » in a browser:  node tests/test_look.js [--shots DIR]
//   LOOK_PORT=8405 (the demo server: a temporary data folder, every theme on)
// 1. Pixel Lab (from the demo server), drawing offscreen as the screens draw:
//    - every eye shape in the six themes, on the pack's face and on the living face: drawn without error, and not his round
//      eyes; the moods' own eyes (hearts, stars, sunglasses) win over the shape;
//    - every accessory in the six themes, on both faces: drawn, it follows his face (the face moved, the pack's own motion),
//      never over his eyes (but what goes on them), never over the info line;
//    - the colours: a red eye is red, a blue cheek is blue, in each theme its own way (a colour phosphor in Rétro, a colour
//      pocket console in LCD), « Écran tout vert » keeps those two green, the rainbow moves;
//    - the seasons by date (lab.look: Halloween, Christmas, New Year, winter, summer, his birthday; what you choose comes
//      first), his pyjama while he sleeps (a stand-in for the habits: S.habitudes.dort) and his little scenes;
//    - PixelLook.get(), with(), clean(); the lab's « Son look » panel; its typed commands step by step the same as the Pi's.
// 2. The demo server: the phone's « Son look » sheet at 390x844 (his face live in it, no sideways scroll, big targets, a tap
//    changes him on the Pi's screen at once and he shows it, « Remettre comme avant », « Look de tous les jours » in two
//    touches, Escape, the app's menu and back button); the Pixel de poche wears the same; nothing over him there.
// 3. Pixel sans Pi (the phone app's offline page, tools/build_app_bundle.py, as a file:// page with no network): his look comes
//    from his Pi's snapshot (cleaned, no old reaction replayed), works there (a typed command, the panel), is kept by the app
//    ({local_save}) and stays after a restart, even when his Pi's older snapshot is given again.
// --shots DIR: screenshots of the panel (three themes) and of the Pi's screen dressed up in the six themes.
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const { spawn, execFileSync } = require('child_process');
const APP = path.join(__dirname, '..');
const SHOTS = (i => (i >= 0 ? process.argv[i + 1] : null))(process.argv.indexOf('--shots'));
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (name, ok, info = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (!ok && info ? `  [${info}]` : '')); if (!ok) fails++; };
const PORT = Number(process.env.LOOK_PORT) || 8405, BASE = `http://127.0.0.1:${PORT}`;
const wait = ms => new Promise(r => setTimeout(r, ms));
const portOpen = () => new Promise(r => { const s = net.connect(PORT, '127.0.0.1'); s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });
const until = async (fn, ms = 6000, step = 100) => { const end = Date.now() + ms; let v; while (Date.now() < end) { if ((v = await fn())) return v; await wait(step); } return v; };
const THEMES = ['retro', 'moderne', 'manga', 'neon', 'croquis', 'lcd'];
const PLAIN = { saisons: false, nuit: false };       // no season, no pyjama: only what is asked

/* in the lab page: a face in a theme, with a look, drawn on a canvas of its own as the screens draw it; pixel differences */
function helpers() {
  const W = 800, H = 480;
  window.__draw = (theme, face, look, o = {}) => {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true }), T0 = o.t ?? 1000;
    const TH = PixelThemes({ X: g, RM: true, get now() { return T0; }, S: 1, blinkP: () => 9, txt() {}, wrap: () => [], fit: s => s, scr: 'visage', crt: true })[theme];
    g.fillStyle = TH.c.bg; g.fillRect(0, 0, W, H);
    const dx = o.dx || 0, dy = o.dy || 0;
    const draw = () => (face === 'pack' ? TH.packFace(64 + dx, 50 + dy, 672, 378, { id: o.anim || 'idle-respire', time: o.time ?? 0.5, from: null, k: 1 })
      : TH.face(400 + dx, 236 + dy, 16, o.mood || 'neutre', 0, 0, o.a || null));
    if (o.none) { /* the background alone */ } else if (look) PixelLook.with(look, draw); else draw();
    return g.getImageData(0, 0, W, H).data;
  };
  window.__diff = (a, b, thr = 40) => {        // the pixels that differ: how many, their box, a mask
    const m = new Uint8Array(W * H); let n = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let i = 0, p = 0; i < a.length; i += 4, p++) {
      if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) <= thr) continue;
      m[p] = 1; n++; const x = p % W, y = (p / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return { n, box: n ? [x0, y0, x1, y1] : null, m };
  };
  window.__avg = (a, m) => { let r = 0, g = 0, b = 0, n = 0; for (let p = 0; p < m.length; p++) if (m[p]) { r += a[p * 4]; g += a[p * 4 + 1]; b += a[p * 4 + 2]; n++; } return n ? [r / n, g / n, b / n].map(Math.round) : null; };
}

async function inLab(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } }), lab = await ctx.newPage(), errs = [];
  lab.on('pageerror', e => errs.push(e.message)); lab.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await lab.goto(`${BASE}/app/lab/index.html?themes=all`); await wait(1500);
  await lab.evaluate(() => { try { localStorage.removeItem('pixel_lab_look'); } catch {} PixelHub.dispatch('look.reset'); PixelHub.dispatch('lab.look', { date: null, dort: null, fete: null }); });
  await lab.evaluate(helpers);

  // the eye shapes
  const shapes = await lab.evaluate(([themes, plain]) => {
    const out = [];
    for (const th of themes) for (const face of ['pack', 'vivant']) {
      const base = __draw(th, face, { ...plain });
      for (const [s] of PixelLook.SHAPES) if (s !== 'rond') out.push([th, face, s, __diff(base, __draw(th, face, { ...plain, yeux: s })).n]);
    }
    return out;
  }, [THEMES, PLAIN]);
  check(`every eye shape (${shapes.length / 12 + 1}) in the 6 themes, on the pack's face and the living face: drawn, and not his round eyes`,
    shapes.length === 72 && shapes.every(x => x[3] > 40), JSON.stringify(shapes.filter(x => x[3] <= 40)));
  const moods = await lab.evaluate(([themes, plain]) => themes.flatMap(th => ['amoureux', 'excite', 'fier'].map(md =>
    [th, md, __diff(__draw(th, 'vivant', { ...plain }, { mood: md }), __draw(th, 'vivant', { ...plain, yeux: 'chat' }, { mood: md })).n])), [THEMES, PLAIN]);
  check('his moods\' own eyes win over the shape (hearts, stars: the same as with round eyes; sunglasses over them)',
    moods.every(x => x[2] < (x[1] === 'fier' ? 900 : 12)), JSON.stringify(moods.filter(x => x[2] >= (x[1] === 'fier' ? 900 : 12))));

  // the accessories: drawn, following his face, never over his eyes nor over the info line
  const acc = await lab.evaluate(([themes, plain]) => {
    const out = [], DX = 56;
    for (const th of themes) for (const face of ['pack', 'vivant']) {
      const b0 = __draw(th, face, { ...plain }), b1 = __draw(th, face, { ...plain }, { dx: DX });
      const eyes = __diff(b0, __draw(th, face, { ...plain, couleur_yeux: 'rouge' })).m;      // his eyes: what their colour changes
      let en = 0; for (let p = 0; p < eyes.length; p++) if (eyes[p]) en++;
      for (const [it, , slot] of PixelLook.ITEMS) {
        const look = { ...plain, accessoires: { [slot]: it } };
        const A = __diff(b0, __draw(th, face, look)), B = __diff(b1, __draw(th, face, look, { dx: DX }));
        let over = 0; for (let p = 0; p < A.m.length; p++) if (A.m[p] && eyes[p]) over++;
        const a = A.box, b = B.box;
        const follows = !!a && !!b && Math.abs(b[0] - a[0] - DX) <= 2 && Math.abs(b[2] - a[2] - DX) <= 2 && Math.abs(b[1] - a[1]) <= 1 && Math.abs(b[3] - a[3]) <= 1;
        out.push({ th, face, it, slot, n: A.n, box: a, b, follows, over: en ? over / en : 1 });
      }
    }
    return out;
  }, [THEMES, PLAIN]);
  check(`every accessory (${acc.length / 12}) in the 6 themes, on both faces: drawn`, acc.length === 192 && acc.every(x => x.n > 60), JSON.stringify(acc.filter(x => x.n <= 60).map(x => [x.th, x.face, x.it, x.n])));
  check('…it follows his face (his face 56 px to the right: it too)', acc.every(x => x.follows), JSON.stringify(acc.filter(x => !x.follows).map(x => [x.th, x.face, x.it, x.box, x.b])));
  const covers = acc.filter(x => x.slot !== 'yeux' && x.over > 0.02);          // Néon's glow may brush them
  check('…never over his eyes (only what goes on them)', covers.length === 0, JSON.stringify(covers.map(x => [x.th, x.face, x.it, Math.round(x.over * 1000) / 10 + ' %'])));
  check('…and never over the info line at the bottom of the screen', acc.every(x => !x.box || x.box[3] <= 434), JSON.stringify(acc.filter(x => x.box && x.box[3] > 434).map(x => [x.th, x.face, x.it, x.box[3]])));
  // his living face hops (life's a.hop): what he wears hops with what it sits on (a hat with his head, a moustache with his
  // mouth, a bow tie with his chin, headphones with his head; LCD's creature: its eyes and mouth jump higher than its head)
  const hops = await lab.evaluate(([themes, plain]) => {
    const life = hop => ({ t: 1000, mood: 'neutre', from: 'neutre', k: 1, since: 0, blink: 0, lx: 0, ly: 0, sq: 0, hop, tilt: 0, squint: 0, breath: 0, press: false, act: '' });
    const bg = th => __draw(th, 'vivant', null, { none: true }), red = { ...plain, couleur_yeux: 'rouge' };
    return themes.flatMap(th => {
      const r = [0, 1.5].map(h => { const o = { a: life(h) }, bare = __draw(th, 'vivant', { ...plain }, o);
        return { o, bare, face: __diff(bg(th), bare).box, eye: __diff(bare, __draw(th, 'vivant', red, o)).box }; });
      const faceTop = r[1].face[1] - r[0].face[1], faceBot = r[1].face[3] - r[0].face[3], eye = r[1].eye[1] - r[0].eye[1];
      return [['chapeau', 3, faceTop], ['casque', 3, faceTop], ['moustache', 1, eye], ['lunettes-soleil', 3, eye], ['noeud', 1, faceBot]].map(([it, side, want]) => {
        const look = { ...plain, accessoires: { [PixelLook.ITEM[it].slot]: it } }, b = r.map(x => __diff(x.bare, __draw(th, 'vivant', look, x.o)).box);
        const got = b[1][side] - b[0][side];
        return [th, it, want, got, want < -4 && Math.abs(got - want) <= 3];
      });
    });
  }, [THEMES, PLAIN]);
  check('…when he hops, it hops with what it sits on (the living face, every theme)', hops.every(h => h[4]), JSON.stringify(hops.filter(h => !h[4])));
  // the pack's own motion (« fier »: his head goes up and tilts): the hat goes with his eyes
  const moves = await lab.evaluate(([themes, plain]) => themes.map(th => {
    const hat = { ...plain, accessoires: { tete: 'chapeau' } }, red = { ...plain, couleur_yeux: 'rouge' };
    const rows = [0.05, 0.3, 0.5, 0.7, 0.9, 1.1, 1.3, 1.6].map(t => {
      const o = { anim: 'fier', time: t }, bare = __draw(th, 'pack', { ...plain }, o);
      return { t, eye: __diff(bare, __draw(th, 'pack', red, o)).box, hat: __diff(bare, __draw(th, 'pack', hat, o)).box };
    });
    const r0 = rows[0], far = rows.reduce((m, r) => (r.eye && Math.abs(r.eye[1] - r0.eye[1]) > Math.abs(m.eye[1] - r0.eye[1]) ? r : m), r0);
    return [th, far.eye[1] - r0.eye[1], far.hat[3] - r0.hat[3]];
  }), [['retro', 'moderne', 'lcd'], PLAIN]);
  check(`…and with the pack's own motion: his head goes up in « fier », his hat with it (${moves.map(m => m[0] + ' ' + m[1] + '/' + m[2] + ' px').join(', ')})`,
    moves.every(m => m[1] < -4 && m[2] < -4 && Math.abs(m[2] - m[1]) <= 8), JSON.stringify(moves));

  // the colours
  const colours = await lab.evaluate(([themes, plain]) => themes.map(th => {
    const r = {}, base = __draw(th, 'pack', { ...plain });
    const red = __draw(th, 'pack', { ...plain, couleur_yeux: 'rouge' }), dR = __diff(base, red);
    r.red = __avg(red, dR.m); r.redN = dR.n;
    const blue = __draw(th, 'pack', { ...plain, couleur_joues: 'bleu' }), dB = __diff(base, blue);
    r.blue = __avg(blue, dB.m); r.blueN = dB.n;
    const mono = __draw(th, 'pack', { ...plain, couleur_yeux: 'rouge', mono: true }), dM = __diff(base, mono);
    r.mono = __avg(mono, dR.m); r.monoN = dM.n;
    const a1 = __draw(th, 'pack', { ...plain, couleur_yeux: 'arc' }, { t: 1000 }), a2 = __draw(th, 'pack', { ...plain, couleur_yeux: 'arc' }, { t: 2600 });
    r.arc = __diff(a1, a2).n;
    const v0 = __draw(th, 'vivant', { ...plain }), v1 = __draw(th, 'vivant', { ...plain, couleur_yeux: 'violet' }), dV = __diff(v0, v1);
    r.violet = __avg(v1, dV.m);
    return [th, r];
  }), [THEMES, PLAIN]);
  const C = Object.fromEntries(colours);
  check('his eyes in red: red in every theme (pack\'s face)', colours.every(([, r]) => r.red && r.redN > 30 && r.red[0] > r.red[1] + 20 && r.red[0] > r.red[2] + 10), JSON.stringify(colours.map(([t, r]) => [t, r.red, r.redN])));
  check('…and violet ones on his living face', colours.every(([, r]) => r.violet && r.violet[2] > r.violet[1] + 10 && r.violet[0] > r.violet[1]), JSON.stringify(colours.map(([t, r]) => [t, r.violet])));
  check('blue cheeks: blue', colours.every(([, r]) => r.blue && r.blueN > 6 && r.blue[2] > r.blue[0]), JSON.stringify(colours.map(([t, r]) => [t, r.blue, r.blueN])));
  const sum = c => c[0] + c[1] + c[2];
  check('Rétro: a colour phosphor (lighter, glowing); LCD: a pocket console\'s deeper colours (darker than the swatch)', sum(C.retro.red) > sum(C.lcd.red) + 20 && sum(C.lcd.red) < 0xff + 0x52 + 0x52 - 40,
    JSON.stringify([C.retro.red, C.lcd.red]));
  check('« Écran tout vert »: Rétro and LCD keep only their greens; the other themes ignore it',
    ['retro', 'lcd'].every(t => C[t].mono && C[t].mono[1] >= C[t].mono[0] && C[t].mono[1] >= C[t].mono[2]) && ['moderne', 'manga', 'neon', 'croquis'].every(t => C[t].monoN === C[t].redN),
    JSON.stringify(['retro', 'lcd', 'moderne'].map(t => [t, C[t].mono, C[t].monoN, C[t].redN])));
  check('the rainbow moves', colours.every(([, r]) => r.arc > 20), JSON.stringify(colours.map(([t, r]) => [t, r.arc])));

  // the API
  const api = await lab.evaluate(() => {
    const g = PixelLook.get(), inside = PixelLook.with({ yeux: 'coeur', accessoires: { tete: 'couronne' }, nuit: false, saisons: false }, () => [PixelLook.cur().shape, PixelLook.cur().wear.tete]);
    return { keys: Object.keys(g).sort().join(), inside, after: PixelLook.cur() && PixelLook.cur().shape, clean: PixelLook.clean({ yeux: 'laser', accessoires: { tete: 'moustache' } }), nested: PixelLook.with({ yeux: 'chat' }, () => PixelLook.with({ yeux: 'carre' }, () => PixelLook.cur().shape) + PixelLook.cur().shape) };
  });
  check('window.PixelLook: get() (his look and what he wears), with(look, fn) (another look for a moment, nested), clean()',
    api.keys === 'accessoires,couleur_joues,couleur_yeux,mono,nuit,porte,saisons,sans,yeux' && api.inside.join() === 'coeur,couronne' && api.after === 'rond'
    && api.clean.yeux === 'rond' && api.clean.accessoires.tete === null && api.nested === 'carrechat', JSON.stringify(api));

  // the seasons by date, the night (lab.look pretends another day; S.habitudes stands in for his habits)
  const at = async (args, ms = 300) => { await lab.evaluate(a => PixelHub.dispatch('lab.look', a), args); await wait(ms); return lab.evaluate(() => ({ ...PixelHub.S.look.porte, cur: Screens.persona.state.cur, main: PixelLook.cur() && PixelLook.cur().wear })); };
  await lab.evaluate(() => { PixelHub.dispatch('look.reset'); Screens.persona.stop(); });
  const days = {};
  for (const [k, date] of [['h24', '2026-10-24T12:00'], ['h25', '2026-10-25T12:00'], ['noel', '2026-12-24T12:00'], ['an', '2026-12-31T18:00'], ['hiver', '2027-01-15T12:00'],
    ['ete', '2026-07-14T15:00'], ['soir', '2026-07-14T21:00'], ['nov', '2026-11-09T14:00']]) days[k] = await at({ date });
  check('the seasons come by themselves: Halloween (witch, pumpkin), Christmas, New Year, winter, summer in the day; nothing in November',
    days.h24.tete === 'sorciere' && days.h25.tete === 'citrouille' && days.noel.tete === 'pere-noel' && days.noel.cou === 'echarpe' && days.an.tete === 'fete'
    && days.hiver.tete === 'bonnet' && days.ete.yeux === 'lunettes-soleil' && !days.soir.yeux && !days.nov.tete && !days.nov.yeux, JSON.stringify(days));
  check('…and the screen wears them (PixelLook.cur())', days.noel.main.tete === 'pere-noel' && days.ete.main.yeux === 'lunettes-soleil');
  await lab.evaluate(() => Screens.persona.stop());
  const xmas = await at({ date: '2026-12-24T12:00' }, 600);
  check(`…with a little scene when one arrives (${xmas.cur})`, /^look-/.test(xmas.cur) || days.noel.cur.startsWith('look-'), JSON.stringify([xmas.cur, days.noel.cur]));
  await lab.evaluate(() => PixelHub.dispatch('look.porte', { item: 'chapeau' }));
  const mine = await at({ date: '2026-12-24T12:00' });
  check('what you choose comes first: his top hat at Christmas, the scarf from the season', mine.tete === 'chapeau' && mine.cou === 'echarpe' && mine.saison === 'noel');
  await lab.evaluate(() => PixelHub.dispatch('look.reset'));
  const bday = await at({ date: '2026-11-09T14:00', fete: 'anniversaire' });
  check('his birthday (souvenirs.fete): the party hat', bday.tete === 'fete' && bday.saison === 'anniversaire', JSON.stringify(bday));
  // back to today, in the afternoon: the night below starts from the day (a scene when he goes to bed), and the typed commands
  // further down compare his look with the Pi's, dates included (« enlève ton chapeau » keeps the slot empty until tomorrow)
  const d0 = new Date(), p2 = n => String(n).padStart(2, '0'), today = `${d0.getFullYear()}-${p2(d0.getMonth() + 1)}-${p2(d0.getDate())}`;
  await at({ fete: null, date: `${today}T14:00` });
  // his schedule on (a stand-in with the real snapshot's keys and his clock running; the lab's own clock is paused, which says
  // nothing): asleep by it, the pyjama comes at once, with no scene of his look's own: his habits' routine tells his bedtime
  // and his wake-up (« Bientôt l'heure du dodo ! », « Bonjour ! »)
  const sched = s => lab.evaluate(x => { Screens.persona.stop(); const h = PixelHub.S.habitudes || {}; PixelHub.S.habitudes = { ...h, horaires: { ...(h.horaires || {}), actif: true }, horloge: { decalage: 0, pause: false }, ...x }; }, s);
  await sched({ dort: true, nuit: true, etat: 'nuit' });
  const night = await until(() => lab.evaluate(() => PixelHub.S.look.porte.nuit && { ...PixelHub.S.look.porte, main: PixelLook.cur().wear }), 5000);
  await wait(900); const nightCur = await lab.evaluate(() => Screens.persona.state.cur);
  check(`he sleeps by his schedule (S.habitudes, a stand-in): nightcap and pyjama, at once, and no scene of his look's own (${nightCur})`,
    !!night && night.tete === 'bonnet-nuit' && night.cou === 'pyjama' && night.main.tete === 'bonnet-nuit' && !/^look-/.test(nightCur || ''), JSON.stringify([night, nightCur]));
  await lab.evaluate(() => { Screens.persona.stop(); PixelHub.dispatch('look.porte', { item: 'couronne' }); });
  const later = await until(() => lab.evaluate(() => Screens.persona.state.cur && [Screens.persona.state.cur, PixelLook.cur().wear.tete, PixelHub.S.look.accessoires.tete]), 3000);
  check(`…a crown put on in his pyjama waits for the morning (« Je le mettrai demain ! »: ${later && later[0]})`, !!later && later.join() === 'look-demain,bonnet-nuit,couronne', JSON.stringify(later));
  await sched({ dort: false, nuit: false, etat: 'eveille' });
  const day = await until(() => lab.evaluate(() => !PixelHub.S.look.porte.nuit && { ...PixelHub.S.look.porte }), 5000);
  await wait(900); const dayCur = await lab.evaluate(() => Screens.persona.state.cur);
  check(`…awake: off they come, and on goes the crown, quietly (${dayCur})`, !!day && day.tete === 'couronne' && !day.cou && !/^look-/.test(dayCur || ''), JSON.stringify([day, dayCur]));
  // his schedule off (or paused): his quiet hours (23 h - 6 h), and his look's own little scenes tell his night
  await lab.evaluate(() => { Screens.persona.stop(); const h = PixelHub.S.habitudes || {}; PixelHub.S.habitudes = { ...h, horaires: { ...(h.horaires || {}), actif: false }, dort: false, nuit: false, etat: 'eveille' }; });
  await lab.evaluate(d => PixelHub.dispatch('lab.look', { date: d }), `${today}T23:30`);
  const pj = await until(() => lab.evaluate(() => (PixelHub.S.look.porte.nuit && /^look-dodo$/.test(Screens.persona.state.cur) ? Screens.persona.state.cur : '')), 5000);
  check(`…his schedule off: his quiet hours (23 h 30), the pyjama and his own little scene (« C'est l'heure du pyjama ! »: ${pj})`, pj === 'look-dodo');
  await lab.evaluate(d => { Screens.persona.stop(); PixelHub.dispatch('lab.look', { date: d }); }, `${today}T14:00`);
  const up = await until(() => lab.evaluate(() => (!PixelHub.S.look.porte.nuit && Screens.persona.state.cur === 'look-debout' ? Screens.persona.state.cur : '')), 5000);
  check(`…and « Debout ! » in the day (${up})`, up === 'look-debout');
  await lab.evaluate(() => PixelHub.dispatch('look.set', { nuit: false }));
  await sched({ dort: true, nuit: true, etat: 'nuit' });
  const off = await until(() => lab.evaluate(() => PixelHub.S.look.nuit === false && PixelHub.S.look.porte), 5000);
  await wait(3300);
  check('« Pyjama la nuit » off: no pyjama, even asleep', !(await lab.evaluate(() => PixelHub.S.look.porte.nuit)) && !!off);
  await lab.evaluate(() => { delete PixelHub.S.habitudes; PixelHub.dispatch('look.reset'); PixelHub.dispatch('look.set', { nuit: true }); });

  // the lab's « Son look » panel
  const panel = await lab.evaluate(() => {
    const p = document.getElementById('look');
    return p && { h: [...p.querySelectorAll('.look-h')].map(h => h.textContent).join(','), shapes: p.querySelectorAll('[data-yeux]').length, items: p.querySelectorAll('[data-item]').length,
      dots: p.querySelectorAll('.look-dot').length, tenues: p.querySelectorAll('[data-tenue]').length, order: [...document.querySelectorAll('h2')].map(h => h.id).filter(Boolean).join(',') };
  });
  check('Pixel Lab: a « Son look » panel (Yeux, Couleurs, Accessoires, Saisons), after Exos', !!panel && panel.h === 'Yeux,Couleurs,Accessoires,Saisons' && panel.shapes === 7 && panel.items === 16
    && panel.dots === 21 && panel.tenues === 9 && /hExos,hLook/.test(panel.order), JSON.stringify(panel));
  await lab.evaluate(() => Screens.persona.stop());
  await lab.click('#look [data-yeux="chat"]'); await wait(400);
  const tapped = await lab.evaluate(() => [PixelHub.S.look.yeux, Screens.persona.state.cur, document.querySelector('#look [data-yeux="chat"]').getAttribute('aria-pressed')]);
  check(`…a tap there: cat eyes, and he shows them (${tapped[1]})`, tapped[0] === 'chat' && /^look-/.test(tapped[1]) && tapped[2] === 'true', JSON.stringify(tapped));
  await lab.evaluate(() => PixelHub.dispatch('look.reset'));
  check('Pixel Lab: no error', errs.length === 0, errs.slice(0, 3).join(' | '));
  return { lab, ctx, errs };
}

/* Pixel sans Pi: the offline page of the phone app, its look seeded from his Pi's snapshot and kept on the phone */
async function sansPi(browser) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-look-local-')), FILE = path.join(tmp, 'pixel-local.html'), PAGE = 'file://' + FILE;
  execFileSync('python3', [path.join(APP, 'tools', 'build_app_bundle.py'), FILE], { stdio: 'pipe' });
  const OLD = Date.now() - 3 * 864e5, pi = { view: { theme: 'retro', face: 'pack' }, settings: { themes: THEMES }, keys: {}, kept_at: OLD,
    look: { yeux: 'chat', couleur_yeux: 'vert', couleur_joues: 'rose', mono: 'oui', accessoires: { tete: 'couronne', cou: 'moustache', yeux: null }, sans: { tete: 'hier' },
      saisons: false, nuit: false, porte: { tete: 'couronne' }, change: { t0: OLD, quoi: 'porte', item: 'couronne' }, avant: 3 } };
  const open = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }), net = [];
    await ctx.route('**/*', r => { if (r.request().url() === PAGE) return r.continue(); net.push(r.request().url()); return r.abort(); });
    await ctx.addInitScript(g => { window.__rn = []; window.ReactNativeWebView = { postMessage: m => window.__rn.push(JSON.parse(m)) }; window.PIXEL_LOCAL_STATE = g; }, { state: null, seed: pi });
    const page = await ctx.newPage(), errs = [];
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(PAGE); await until(() => page.evaluate(() => !!window.PixelLocal && !!window.PixelHub && !!PixelHub.S.look), 8000); await wait(500);
    return { ctx, page, errs, net };
  };
  let { ctx, page, errs, net } = await open();
  const look = () => page.evaluate(() => ({ S: PixelHub.S.look, get: PixelLook.get(), wear: PixelLook.cur() && PixelLook.cur().wear, cur: Screens.persona.state.cur }));
  let l = await look();
  check('Pixel sans Pi: his look from his Pi\'s snapshot (cleaned: a moustache is no scarf, « oui » no switch, no old reaction replayed)',
    l.S.yeux === 'chat' && l.S.couleur_yeux === 'vert' && l.S.couleur_joues === 'rose' && l.S.mono === false && l.S.accessoires.tete === 'couronne' && l.S.accessoires.cou === null
    && !l.S.sans.tete && l.S.change === null && l.get.yeux === 'chat' && l.wear.tete === 'couronne' && !/^look-/.test(l.cur || ''), JSON.stringify(l.S));
  await page.evaluate(() => PixelHub.dispatch('cmd', { text: 'mets ton chapeau' })); await wait(500);
  await page.evaluate(() => PixelHub.dispatch('look.set', { couleur_yeux: 'arc' })); await wait(900);
  l = await look();
  const saved = await page.evaluate(() => { const m = window.__rn.filter(x => x.local_save).pop(); return m && m.local_save.extra && m.local_save.extra.look; });
  check('…it works there (« mets ton chapeau », a rainbow), and the app keeps it ({local_save})', l.S.accessoires.tete === 'chapeau' && l.S.couleur_yeux === 'arc' && l.wear.tete === 'chapeau'
    && !!saved && saved.accessoires.tete === 'chapeau' && saved.couleur_yeux === 'arc', JSON.stringify(saved));
  await page.reload(); await until(() => page.evaluate(() => !!window.PixelLocal && !!window.PixelHub && !!PixelHub.S.look), 8000); await wait(600);
  l = await look();
  check('…a restart (his Pi\'s older snapshot given again): his look of here stays', l.S.accessoires.tete === 'chapeau' && l.S.couleur_yeux === 'arc' && l.S.yeux === 'chat', JSON.stringify(l.S));
  check('…no error, nothing fetched', errs.length === 0 && net.length === 0, errs.concat(net).slice(0, 3).join(' | '));
  await ctx.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

// the lab's typed commands, step by step, against the Pi's (the demo server), from the look of every day
const STEPS = ['mets ton chapeau', 'enlève ton chapeau', 'yeux de chat', 'yeux bleus', 'joues roses', 'arc-en-ciel', 'mets ton nœud papillon', "habille-toi pour l'hiver",
  'mets tes lunettes', 'mets tes lunettes de soleil', 'enlève tes lunettes', 'enlève tout', 'yeux en cœur', 'look normal', 'remets comme avant', 'tu as de beaux yeux', 'sois grognon'];
const SAVED = ['yeux', 'couleur_yeux', 'couleur_joues', 'mono', 'accessoires', 'sans', 'saisons', 'nuit'];
const saved = l => JSON.stringify(Object.fromEntries(SAVED.map(k => [k, l[k]])));

(async () => {
  let pw = null; try { pw = require('playwright'); } catch { console.log('SKIP (no Playwright)'); return finish(); }
  if (await portOpen()) { check(`port ${PORT} is free for the demo server`, false); return finish(); }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-look-')), cfg = path.join(tmp, 'config.toml');
  fs.writeFileSync(cfg, `data_dir = "${tmp}"\n[ui]\nthemes = ["retro", "moderne", "manga", "neon", "croquis", "lcd"]\n`);
  const srv = spawn('python3', [path.join(APP, 'server.py'), '--demo', '--port', String(PORT), '--host', '127.0.0.1', '--config', cfg], { cwd: APP, stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill('SIGTERM'); } catch {} });    // never left running (a closed pipe, an error)
  let browser = null, hub = null, st = null;
  try {
    if (!(await until(portOpen, 15000))) throw new Error('le serveur de démo ne démarre pas');
    hub = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); hub.onmessage = e => { const m = JSON.parse(e.data); if (m.type === 'state') st = m.data; };
    await until(() => hub.readyState === 1 && st, 5000);
    const act = (action, args = {}) => hub.send(JSON.stringify({ action, args }));
    browser = await pw.chromium.launch();
    const { lab } = await inLab(browser);
    await sansPi(browser);

    // the same typed commands, here and on the Pi
    act('look.set', { nuit: false, saisons: false }); act('look.reset'); await until(() => st.look.change && st.look.change.quoi === 'normal' && !st.look.nuit);
    await lab.evaluate(() => { PixelHub.dispatch('look.set', { nuit: false, saisons: false }); PixelHub.dispatch('look.reset'); PixelHub.dispatch('caractere.reset'); });
    const differ = [];
    for (const t of STEPS) {
      const t0 = st.look.change ? st.look.change.t0 : 0;
      act('cmd', { text: t }); await lab.fill('#cmd', t); await lab.press('#cmd', 'Enter');
      await until(() => (st.look.change && st.look.change.t0 !== t0) || st.chat.messages.some(m => m.text === t) || (st.caractere && st.caractere.preset === 'grognon'), 1500);
      await wait(150);
      const l = await lab.evaluate(() => PixelHub.S.look);
      if (saved(l) !== saved(st.look)) differ.push([t, saved(l), saved(st.look)]);
    }
    const ends = await lab.evaluate(() => [PixelHub.S.chat.messages.some(m => m.text === 'tu as de beaux yeux'), PixelHub.S.caractere.preset]);
    check(`Pixel Lab's typed commands: step by step the same look as the Pi's (${STEPS.length} phrases, from « mets ton chapeau » to « remets comme avant »)`, differ.length === 0, JSON.stringify(differ[0]));
    check('…and what is not his goes on as before (Claude, his character), here and there', ends[0] && ends[1] === 'grognon' && st.chat.messages.some(m => m.text === 'tu as de beaux yeux')
      && st.caractere.preset === 'grognon', JSON.stringify(ends));
    act('caractere.reset'); act('look.reset');

    // the Pi's screen and the phone
    const errors = page => { const e = []; page.on('pageerror', x => e.push(x.message)); page.on('console', m => { if (m.type() === 'error' && !/pixel\.apk/.test(m.location().url || '')) e.push(m.text()); }); return e; };
    const kctx = await browser.newContext({ viewport: { width: 800, height: 480 } }), kiosk = await kctx.newPage(), kerr = errors(kiosk);
    await kiosk.goto(`${BASE}/?kiosk=1`); await wait(4200);
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }), phone = await pctx.newPage(), perr = errors(phone);
    await phone.addInitScript(() => { window.__rn = []; window.ReactNativeWebView = { postMessage: m => window.__rn.push(JSON.parse(m)) }; });
    await phone.goto(`${BASE}/?mode=both`); await wait(1200);
    const go = await phone.$('.look-go');
    const row = await phone.evaluate(() => [...document.querySelector('.kfoot > span').children].filter(e => !e.hidden).map(e => e.textContent.trim()).join(' · '));
    check(`the phone: a « Son look » button under the keys, with the others (${row})`, !!go && await go.isVisible() && (await go.textContent()) === 'Son look'
      && /Caractère · Son look · Habitudes · Nourrir · Exos/.test(row), row);
    await phone.tap('.look-go'); await wait(500);
    const dom = await phone.evaluate(() => {
      const s = document.querySelector('.look-sheet'), cv = s.querySelector('.look-cv'), g = cv.getContext('2d'), d = g.getImageData(0, 0, cv.width, cv.height).data, cols = new Set();
      for (let i = 0; i < d.length; i += 4 * 97) cols.add(d[i] >> 4 << 8 | d[i + 1] >> 4 << 4 | d[i + 2] >> 4);
      return { open: !s.hidden, h: [...s.querySelectorAll('.look-h')].map(h => h.textContent).join(','), sw: document.documentElement.scrollWidth, box: s.querySelector('.look-box').scrollWidth <= s.querySelector('.look-box').clientWidth,
        cols: cols.size, say: s.querySelector('.look-say').textContent, title: s.querySelector('.look-title').textContent, focus: document.activeElement && document.activeElement.className };
    });
    check(`the sheet: his face live at the top (« ${dom.say} »), Yeux, Couleurs, Accessoires, Saisons, no sideways scroll at 390 px`,
      dom.open && dom.h === 'Yeux,Couleurs,Accessoires,Saisons' && dom.sw <= 390 && dom.box && dom.cols > 3 && /^Il a des yeux/.test(dom.say) && dom.title === 'Son look' && dom.focus === 'look-x', JSON.stringify(dom));
    const small = await phone.evaluate(() => [...document.querySelectorAll('.look-sheet button')].filter(b => !b.hidden && b.getClientRects().length).map(b => { const r = b.getBoundingClientRect(); return [b.className + (b.dataset.yeux || b.dataset.item || b.dataset.c || ''), Math.round(r.width), Math.round(r.height)]; })
      .filter(([, w, h]) => w < 56 || h < 56));
    check('touch targets: 56 px and more', small.length === 0, JSON.stringify(small.slice(0, 6)));
    if (SHOTS) await phone.screenshot({ path: path.join(SHOTS, 'panneau-retro.png') });
    await kiosk.evaluate(() => Screens.persona.stop());
    await phone.tap('.look-opt[data-yeux="chat"]');
    await until(() => st.look.yeux === 'chat');
    const k1 = await until(() => kiosk.evaluate(() => PixelLook.get().yeux === 'chat' && /^look-/.test(Screens.persona.state.cur) && Screens.persona.state.cur));
    check(`a tap: cat eyes on the Pi's screen at once, and he shows them (${k1})`, st.look.yeux === 'chat' && !!k1 && st.screen === 'visage', String(k1));
    await phone.tap('.look-opt[data-item="chapeau"]'); await until(() => st.look.accessoires.tete === 'chapeau');
    const k2 = await until(() => kiosk.evaluate(() => PixelLook.cur().wear.tete === 'chapeau'));
    const pressed = await until(() => phone.evaluate(() => document.querySelector('.look-opt[data-item="chapeau"]').getAttribute('aria-pressed') === 'true' && document.querySelector('.look-none[data-slot="tete"]').getAttribute('aria-pressed') === 'false'));
    check('his top hat: on the Pi at once, pressed in the sheet', k2 && pressed);
    await phone.tap('.look-opt[data-item="chapeau"]'); await until(() => st.look.accessoires.tete === null);
    check('…a second tap takes it off', st.look.accessoires.tete === null && st.look.sans.tete);
    await phone.tap('.look-sw .look-dot[data-c="bleu"]'); await until(() => st.look.couleur_yeux === 'bleu');
    await phone.tap('.look-sw ~ .look-sw .look-dot[data-c="rose"]'); await until(() => st.look.couleur_joues === 'rose');
    check('blue eyes, pink cheeks', st.look.couleur_yeux === 'bleu' && st.look.couleur_joues === 'rose');
    const mono = await phone.evaluate(() => !document.querySelector('.look-sw2[data-k="mono"]').hidden);
    act('theme.set', { name: 'moderne' }); await until(() => st.view.theme === 'moderne'); await wait(300);
    const monoM = await phone.evaluate(() => document.querySelector('.look-sw2[data-k="mono"]').hidden);
    check('« Écran tout vert » is offered in Rétro (and LCD) only', mono && monoM);
    act('theme.set', { name: 'retro' });
    const n0 = st.look.avant;
    await phone.tap('.look-undo'); await until(() => st.look.avant === n0 - 1);
    check('« Remettre comme avant »: one step back', st.look.couleur_joues === 'theme' && st.look.couleur_yeux === 'bleu', JSON.stringify([st.look.couleur_joues, st.look.avant]));
    await phone.tap('.look-tenues [data-tenue="chic"]'); await until(() => st.look.accessoires.visage === 'moustache');
    check('an outfit at once (« Très chic »: top hat, bow tie, moustache)', st.look.accessoires.tete === 'chapeau' && st.look.accessoires.cou === 'noeud');
    const sw = async (k, want) => { await phone.tap(`.look-sw2[data-k="${k}"]`); await until(() => st.look[k] === want);
      return until(() => phone.evaluate(([k, v]) => document.querySelector(`.look-sw2[data-k="${k}"]`).getAttribute('aria-checked') === String(v), [k, want])); };
    const s0 = st.look.saisons, ni = st.look.nuit, flips = [await sw('saisons', !s0), await sw('saisons', s0), await sw('nuit', !ni), await sw('nuit', ni)];
    check('the switches « Tenues de saison » and « Pyjama la nuit », each way, and the sheet shows them', flips.every(Boolean) && st.look.saisons === s0 && st.look.nuit === ni, JSON.stringify(flips));
    if (SHOTS) { await phone.evaluate(() => document.querySelector('.look-box').scrollTo(0, 99999)); await wait(300); await phone.screenshot({ path: path.join(SHOTS, 'panneau-retro-bas.png') }); }
    await phone.tap('.look-reset'); await wait(300);
    check('« Look de tous les jours » asks a second touch', st.look.accessoires.tete === 'chapeau' && await phone.evaluate(() => document.querySelector('.look-reset').textContent.startsWith('Sûr')));
    await phone.tap('.look-reset'); await until(() => st.look.yeux === 'rond' && st.look.accessoires.tete === null);
    check('…then his look of every day', st.look.yeux === 'rond' && st.look.couleur_yeux === 'theme' && Object.values(st.look.accessoires).every(v => v === null));
    await phone.keyboard.press('Escape'); await wait(200);
    check('Escape closes the sheet', await phone.evaluate(() => document.querySelector('.look-sheet').hidden && !document.body.classList.contains('look-open')));
    // the app's menu (PixelPanel) and back button (PixelSheet)
    const offered = await phone.evaluate(() => (window.__rn.filter(m => Array.isArray(m.panels)).pop() || {}).panels);
    await phone.click('#modes button[data-mode="pixel"]'); await wait(200);
    const menu = await phone.evaluate(() => [window.PixelPanel('look'), document.body.dataset.mode, !document.querySelector('.look-sheet').hidden]);
    await wait(200);
    const back = await phone.evaluate(() => [window.PixelSheet.close(), document.querySelector('.look-sheet').hidden, window.PixelSheet.close()]);
    check('the app\'s menu: « Son look » offered ({panels}), it opens from Pixel mode; the back button closes it',
      Array.isArray(offered) && offered.includes('look') && menu.join() === 'true,both,true' && back.join() === 'true,true,false', JSON.stringify({ offered, menu, back }));
    // the Pixel de poche: the same look
    act('look.set', { yeux: 'etoile', couleur_yeux: 'arc', porte: ['couronne', 'noeud'] }); await until(() => st.look.yeux === 'etoile');
    await phone.tap('.look-go'); await wait(300);
    await phone.setViewportSize({ width: 844, height: 390 }); await wait(300);
    await phone.evaluate(() => window.PixelPoche && !PixelPoche.on && PixelPoche.enter('fixe')); await wait(600);
    const poche = await phone.evaluate(() => [window.PixelPoche && PixelPoche.on, PixelLook.get().yeux, PixelLook.cur().wear.tete, PixelLook.cur().eye, document.querySelector('.look-sheet').hidden,
      (() => { const r = document.querySelector('.screen').getBoundingClientRect(), e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!e && !e.closest('.look-sheet'); })()]);
    if (SHOTS) await phone.screenshot({ path: path.join(SHOTS, 'poche.png') });
    check('the Pixel de poche wears the same (star eyes, a rainbow, his crown), and the sheet goes away', poche.join() === 'true,etoile,couronne,arc,true,true', JSON.stringify(poche));
    await phone.evaluate(() => PixelPoche.leave()); await phone.setViewportSize({ width: 390, height: 844 });
    // dressed up, in the six themes, on the Pi
    if (SHOTS) {
      act('look.set', { normal: true }); await wait(300);
      const OUT = { retro: { yeux: 'chat', porte: ['chapeau', 'noeud'] }, moderne: { yeux: 'etoile', couleur_yeux: 'arc', porte: ['fete'] }, manga: { yeux: 'coeur', couleur_yeux: 'rose', porte: ['couronne'] },
        neon: { yeux: 'amande', couleur_yeux: 'turquoise', porte: ['casque', 'casquette'] }, croquis: { yeux: 'lunettes', porte: ['chapeau', 'moustache', 'noeud'] }, lcd: { yeux: 'carre', porte: ['bonnet', 'echarpe'] } };
      for (const th of THEMES) for (const face of ['pack', 'vivant']) {
        act('theme.set', { name: th }); act('face.set', { name: face }); act('look.set', { normal: true }); act('look.set', OUT[th]); await wait(900);
        await kiosk.evaluate(() => { Screens.persona.stop(); const L = Screens.local; L.banner = null; L.local = null; L.pack = null; }); await wait(700);
        await kiosk.screenshot({ path: path.join(SHOTS, `pi-${th}-${face}.png`) });
      }
      for (const th of ['lcd', 'manga', 'neon']) { act('theme.set', { name: th }); await wait(500); await phone.tap('.look-go'); await wait(500); await phone.screenshot({ path: path.join(SHOTS, `panneau-${th}.png`) }); await phone.tap('.look-x'); }
      act('theme.set', { name: 'retro' }); act('face.set', { name: 'pack' });
    }
    act('look.reset');
    check('the phone and the Pi: no error', perr.length === 0 && kerr.length === 0, perr.concat(kerr).slice(0, 3).join(' | '));
  } catch (e) { check('the test ran to the end', false, e.stack.split('\n').slice(0, 3).join(' ')); }
  finally { if (browser) await browser.close(); if (hub) hub.close(); srv.kill('SIGTERM'); }
  finish();
})();
function finish() { console.log(`\n${fails} failure(s)`); process.exit(fails ? 1 : 0); }
