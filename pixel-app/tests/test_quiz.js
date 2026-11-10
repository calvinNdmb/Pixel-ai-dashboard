// Quizzes made to measure on the phone's own Pixel (Pixel sans Pi), in a real browser:  node tests/test_quiz.js [--shots DIR]
// Builds the phone app's offline page and opens it as a file:// page, every network request blocked, in Chromium:
// - in the app (window.ReactNativeWebView stubbed): « quiz sur les volcans » asks the app ({quiz_write}: the subject as typed,
//   5 questions by default, the number asked for), one quiz at a time; the app's answer (PixelLocal.quizDone) is checked
//   (a question with the same answer twice is left out) and played by the exercises: its title, 4 answers, the hint, the
//   correction, the summary, « encore »; an answer for another quiz is ignored; each of the app's errors has its words
//   (no key: where to type it); what a quiz cost is counted, kept across a restart, « budget » says it, « budget 0,
//   budget 5 » set the ceiling, and once it is reached nothing is asked;
// - not in the app (a browser, Pixel Lab's rules): a ready-made quiz, and he says why;
// - the page never fetches anything, and no page error.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const APP = path.join(__dirname, '..');
const SHOTS = (i => (i >= 0 ? process.argv[i + 1] : null))(process.argv.indexOf('--shots'));
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (name, ok, info = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (!ok && info ? `  [${info}]` : '')); if (!ok) fails++; };
const until = async (fn, ms = 5000, step = 80) => { const end = Date.now() + ms; let v; while (Date.now() < end) { if ((v = await fn())) return v; await new Promise(r => setTimeout(r, step)); } return v; };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-quiz-')), FILE = path.join(tmp, 'pixel-local.html'), PAGE = 'file://' + FILE;
execFileSync('python3', [path.join(APP, 'tools', 'build_app_bundle.py'), FILE], { stdio: 'pipe' });

const Q = n => Array.from({ length: n }, (_, i) => ({ question: `Question ${i + 1} ?`, bonne_reponse: `bon${i + 1}`, mauvaises_reponses: [`faux${i + 1}a`, `faux${i + 1}b`, `faux${i + 1}c`], indice: `indice ${i + 1}`, explication: `parce que ${i + 1}` }));
const net = [], errors = [];
async function open(browser, app) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.route('**/*', r => { const u = r.request().url(); if (u === PAGE) return r.continue(); net.push(u); return r.abort(); });
  if (app) await ctx.addInitScript(() => { window.__rn = []; window.ReactNativeWebView = { postMessage: m => window.__rn.push(JSON.parse(m)) }; });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(PAGE);
  await until(() => page.evaluate(() => !!(window.PixelLocal && window.PixelHub && PixelHub.S.exos)));
  return page;
}
const cmd = (page, text) => page.evaluate(t => PixelHub.dispatch('cmd', { text: t }), text);
const asks = page => page.evaluate(() => window.__rn.filter(m => m.quiz_write).map(m => m.quiz_write));
const cur = page => page.evaluate(() => PixelHub.S.exos.cur);
const toast = page => page.evaluate(() => (PixelHub.S.toast || {}).msg || '');
const done = (page, id, r) => page.evaluate(([i, a]) => PixelLocal.quizDone(i, a), [id, r]);
const USAGE = { input_tokens: 2000, output_tokens: 3000 };                    // Sonnet: (2000 × 2 + 3000 × 10) / 1e6 = $0.034

(async () => {
  const browser = await chromium.launch();
  const page = await open(browser, true);

  await cmd(page, 'Quiz sur les Châteaux forts !');
  let a = await asks(page);
  check('« quiz sur … » asks the app, with the subject as typed and 5 questions', a.length === 1 && a[0].sujet === 'les Châteaux forts' && a[0].nombre === 5 && Number.isInteger(a[0].id), JSON.stringify(a));
  check('he says the quiz is coming, and thinks', /prépare/.test(await toast(page)) && (await page.evaluate(() => PixelHub.S.mood.name)) === 'reflechit');
  await cmd(page, 'quiz sur les volcans');
  check('one quiz at a time', (await asks(page)).length === 1 && /déjà/.test(await toast(page)));
  await done(page, a[0].id + 99, { titre: 'Autre', questions: Q(5) });
  check('an answer for another quiz is ignored', (await cur(page)) === null);

  const bad = { question: 'Deux fois la même ?', bonne_reponse: 'A', mauvaises_reponses: ['a', 'B', 'C'], indice: '', explication: '' };
  await done(page, a[0].id, { titre: 'Les châteaux', questions: [bad, ...Q(6)], model: 'claude-sonnet-5-5', usage: USAGE });
  let c = await cur(page);
  check('the app\'s answer is played: its title, the first good question, 5 of them', c && c.type === 'Les châteaux' && c.q === 'Question 1 ?' && c.kind === 'quiz' && c.mode === 'serie' && c.n === 5, JSON.stringify(c));
  check('4 answers, and the right one is not told', c.choices.slice().sort().join() === 'bon1,faux1a,faux1b,faux1c' && !('answer' in c));
  if (SHOTS) { await page.waitForTimeout(600); await page.screenshot({ path: path.join(SHOTS, 'quiz-sans-pi.png') }); }
  await page.evaluate(id => PixelHub.dispatch('exos.repondre', { value: 'faux1a', id }), c.id);
  check('a wrong answer: the hint, a second try', (await cur(page)).hint === 'indice 1' && (await cur(page)).etat === 'question');
  await page.evaluate(id => PixelHub.dispatch('exos.repondre', { value: 'bon1', id }), c.id);
  c = await cur(page);
  check('the right one: the correction', c.etat === 'resultat' && c.ok === true && c.explication === 'parce que 1');
  for (let i = 2; i <= 5; i++) {
    await page.evaluate(() => PixelHub.dispatch('exos.passer'));
    c = await cur(page);
    await page.evaluate(([id, v]) => PixelHub.dispatch('exos.repondre', { value: v, id }), [c.id, `bon${i}`]);
  }
  await page.evaluate(() => PixelHub.dispatch('exos.passer'));
  c = await cur(page);
  check('the summary: 5 / 5 under the quiz\'s title', c && c.etat === 'bilan' && c.bons === 5 && c.total === 5 && c.type === 'Les châteaux', JSON.stringify(c));
  await page.evaluate(() => PixelHub.dispatch('exos.encore'));
  check('« encore » plays it again', (await cur(page)).q === 'Question 1 ?');
  await page.evaluate(() => PixelHub.dispatch('exos.stop'));

  await cmd(page, 'budget');
  check('« budget »: what the quiz cost, of 30 €', /0,03 € dépensés ce mois-ci sur 30,00 €/.test(await toast(page)), await toast(page));

  await cmd(page, 'quiz de 3 questions sur la table de 7');
  a = await asks(page);
  check('the number asked for goes to the app', a.length === 2 && a[1].nombre === 3 && a[1].sujet === 'la table de 7', JSON.stringify(a[1]));
  await done(page, a[1].id, { titre: 'Table de 7', questions: [{ question: '7 × 8 ?', bonne_reponse: '56', mauvaises_reponses: ['54', '48', '63'] }], model: 'claude-sonnet-5-5', usage: USAGE });
  c = await cur(page);
  check('a quiz of numbers can be typed', c && c.num === true && c.clavier === 'num' && c.type === 'Table de 7');
  await cmd(page, '56');
  check('typing the number answers it', (await cur(page)).ok === true);
  await page.evaluate(() => PixelHub.dispatch('exos.stop'));

  const SAYS = { no_key: /Clé Claude/, auth: /refusée/, rate: /minute/, network: /internet/, refusal: /autre sujet/, long: /moins de questions/, api: /pas réussi/ };
  for (const [error, re] of Object.entries(SAYS)) {
    await cmd(page, 'interroge-moi sur les capitales');
    a = await asks(page);
    await done(page, a[a.length - 1].id, { error });
    check(`the app says « ${error} »: no quiz, his words`, (await cur(page)) === null && re.test(await toast(page)), await toast(page));
  }
  await cmd(page, 'quiz sur rien');
  a = await asks(page);
  await done(page, a[a.length - 1].id, { titre: 'Vide', questions: [bad], model: 'claude-sonnet-5-5', usage: USAGE });
  check('no usable question: no quiz, but its price is counted', (await cur(page)) === null && /pas réussi/.test(await toast(page)) && Math.abs((await page.evaluate(() => PixelHub.S.budget.usd)) - 0.102) < 1e-9);

  await cmd(page, 'budget 0');
  check('« budget 0 »: no ceiling', /plus de plafond/.test(await toast(page)));
  await page.evaluate(() => { PixelHub.S.budget.usd = 50; });
  await cmd(page, 'budget 5');
  const n = (await asks(page)).length;
  await cmd(page, 'quiz sur les volcans');
  check('the month\'s ceiling reached: nothing is asked, he says so', (await asks(page)).length === n && /budget/.test(await toast(page)), await toast(page));
  await page.waitForTimeout(1500);
  await page.reload();
  await until(() => page.evaluate(() => !!(window.PixelLocal && window.PixelHub && PixelHub.S.exos)));
  const b = await page.evaluate(() => PixelHub.S.budget);
  check('the budget is kept across a restart', b.usd === 50 && b.limite === 5, JSON.stringify(b));
  await page.evaluate(() => { PixelHub.S.budget.mois = '2020-01'; });
  await cmd(page, 'budget');
  check('a new month: the counter starts again', /0,00 € dépensés/.test(await toast(page)), await toast(page));
  await cmd(page, 'c\'est quoi un quiz ?');
  check('a question about quizzes is not a quiz to write', (await asks(page)).length === 0);

  const web = await open(browser, false);
  await cmd(web, 'quiz sur les volcans');
  c = await cur(web);
  check('not in the app: a ready-made quiz, and he says why', c && c.type === 'Quiz de démo' && c.n === 3 && /Sans clé API/.test(await toast(web)), JSON.stringify(c));

  check('the page fetched nothing', net.length === 0, net.join(' '));
  check('no page error', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(`\n${fails} failure(s)`);
  process.exit(fails ? 1 : 0);
})();
