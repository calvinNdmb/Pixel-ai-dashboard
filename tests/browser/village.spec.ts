import { test, expect, type Page } from '@playwright/test';

const fixture = 'http://127.0.0.1:7497';
const dock = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Navigation du village' }).getByRole('button', { name, exact: true });

test.beforeEach(async ({ request }) => {
  await request.post(`${fixture}/__test__/reset`);
});

test('village 3D, navigation, suivi SSE et sélection d’un personnage', async ({ page, request }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.village-canvas')).toBeVisible();
  await expect(page.locator('.village-loading')).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Sam · Chef' })).toBeVisible();
  await expect(page.getByText('2 sessions dans le village')).toBeVisible();
  await page.screenshot({ path: `test-results/village-${testInfo.project.name}.png` });
  const bounds = await page.locator('.village-canvas').boundingBox();
  expect(bounds!.height).toBe(await page.evaluate(() => innerHeight));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await dock(page, 'Missions').click();
  await expect(page.getByRole('heading', { name: 'Les missions' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Créer le dashboard responsive' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Documenter les routes API' })).toBeHidden();
  await page.getByRole('button', { name: 'Toutes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Documenter les routes API' })).toBeVisible();

  await dock(page, 'Missions').click();
  await expect(page.locator('#side-panel')).toBeHidden();
  const lea = page.getByRole('button', { name: 'Léa : Prépare les composants', exact: true });
  await lea.click();
  await expect(page.getByRole('region', { name: 'Détail de Léa' })).toBeVisible();
  await request.post(`${fixture}/__test__/update`, {
    data: { id: 'lea', patch: { activity: 'reading', activityLabel: 'Lit le fichier README.md' } },
  });
  await expect(
    page.getByRole('region', { name: 'Détail de Léa' }).getByText('Lit le fichier README.md', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Fermer le panneau', exact: true }).click();
  await dock(page, 'Journal').click();
  await expect(page.getByRole('region', { name: "Journal d'activité" })).toBeVisible();
  await expect(page.getByText('Modifie Dashboard.tsx')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#side-panel')).toBeHidden();
  expect(errors).toEqual([]);
});

test('le chef envoie les consignes et le recrutement crée une vraie commande API', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sam · Chef' })).toBeVisible();
  await page.getByRole('button', { name: 'Discuter', exact: true }).click();
  await page.getByRole('textbox', { name: 'Message au Chef' }).fill('Prépare la prochaine livraison');
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await expect(page.getByText('Bien reçu. Je prépare la mission demandée.')).toBeVisible();
  const requests = await (await request.get(`${fixture}/__test__/requests`)).json();
  expect(requests).toContainEqual({ path: '/api/manager/message', body: { text: 'Prépare la prochaine livraison' } });
  await dock(page, 'Missions').click();
  await page.getByRole('button', { name: 'Nouvelle', exact: true }).click();
  await page.getByRole('textbox', { name: 'Mission', exact: true }).fill('Vérifier le responsive sur téléphone');
  await page.getByRole('textbox', { name: 'Prénom (optionnel)' }).fill('Nova');
  await page
    .getByRole('button', { name: /Recruter|Lancer/ })
    .last()
    .click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('region', { name: 'Détail de Nova' })).toBeVisible();
  const commands = await (await request.get(`${fixture}/__test__/requests`)).json();
  expect(
    commands.some(
      (c: { path: string; body: { task?: string } }) =>
        c.path === '/api/sessions' && c.body.task === 'Vérifier le responsive sur téléphone',
    ),
  ).toBe(true);
});

test('une validation montre le détail exact, puis transmet la décision', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Voir la demande', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Détail de Bruno' })).toBeVisible();
  await expect(
    page
      .getByRole('group', { name: "Demande d'autorisation de Bruno" })
      .getByText('Exécuter : npm test', { exact: true }),
  ).toBeVisible();
  await page.getByText('Voir le détail (Bash)', { exact: true }).click();
  await expect(page.getByText('npm test -- --runInBand', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Autoriser', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Détail de Bruno' }).getByText('Lance les tests', { exact: true }),
  ).toBeVisible();
  const commands = await (await request.get(`${fixture}/__test__/requests`)).json();
  expect(commands).toContainEqual({ path: '/api/permissions/test-permission', body: { decision: 'allow' } });
});

test('caméra, animations et réglages restent indépendants des sessions', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.village-loading')).toBeHidden({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Suspendre les animations', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reprendre les animations', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Vue du monde', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Le village', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Le village', exact: true }).click();
  await page.getByRole('button', { name: 'Réglages du village', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Les réglages du village' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Les réglages du village' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Sam · Chef' })).toBeVisible();
});

test('sans WebGL, le QG 2D et les commandes restent accessibles', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
      if (String(args[0]).startsWith('webgl')) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.goto('/');
  await expect(page.getByText(/La 3D n’est pas disponible/)).toBeVisible();
  await expect(page.locator('.legacy-canvas')).toBeVisible();
  await dock(page, 'Agents').click();
  await expect(page.getByRole('heading', { name: 'Agents', exact: true })).toBeVisible();
});

test('petit écran, demandes refusées par le serveur et ouverture de l’aide', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sam · Chef' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const actions = await page.locator('.overview-actions').boundingBox();
  const nav = await page.locator('.village-dock').boundingBox();
  expect(actions!.y + actions!.height).toBeLessThan(nav!.y);
  await page.getByRole('button', { name: 'Voir la demande', exact: true }).click();
  await page.route('**/api/permissions/test-permission', (route) =>
    route.fulfill({ status: 409, json: { error: 'La demande a expiré' } }),
  );
  await page.getByRole('button', { name: 'Autoriser', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'La demande a expiré' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Autoriser', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Réglages du village', exact: true }).click();
  await page.getByRole('button', { name: 'Aide', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Comment lire le QG' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Les réglages du village' })).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});
