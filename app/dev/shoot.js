// Capture d'un banc d'essai (rendu logiciel, sans carte graphique : comptez quelques secondes par image).
// node app/dev/shoot.js app/dev/buildings.html /chemin/sortie.png [largeur hauteur] ["dist=80&theta=1.2"]
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [page_, out, w, h, query] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: +w || 1200, height: +h || 800 }, deviceScaleFactor: 1 })).newPage();
  page.on('pageerror', (e) => console.log('PAGEERR', e.message, (e.stack || '').split('\n').slice(0, 3).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
  await page.goto('file://' + path.resolve(page_) + (query ? '?' + query : ''));
  await page.waitForFunction('window.READY === true', null, { timeout: 90000 }).catch(() => console.log('READY jamais atteint'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: out });
  console.log('stats', JSON.stringify(await page.evaluate(() => window.STATS || null)), '→', out);
  await browser.close();
})();
