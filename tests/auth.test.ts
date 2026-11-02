import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { Request } from 'express';
import { Auth, pairingCode, parseCookies } from '../server/auth';

const TOKEN = 'jeton-de-test-1234567890';
const req = (headers: Record<string, string> = {}, query: Record<string, string> = {}) => ({ headers, query }) as unknown as Request;

test('sans jeton : accès libre (usage local)', () => {
  const a = new Auth(undefined);
  assert.equal(a.required, false);
  assert.equal(a.check(req()), true);
});

test('jeton accepté en Bearer, en-tête dédié ou paramètre ; refus sinon', () => {
  const a = new Auth(TOKEN);
  assert.equal(a.required, true);
  assert.equal(a.check(req()), false);
  assert.equal(a.check(req({ authorization: `Bearer ${TOKEN}` })), true);
  assert.equal(a.check(req({ authorization: 'Bearer presque' })), false);
  assert.equal(a.check(req({ 'x-pixel-token': TOKEN })), true);
  assert.equal(a.check(req({}, { token: TOKEN })), true);
  assert.equal(a.check(req({ cookie: 'pixel_session=inventé' })), false);
});

test('codes d’appairage lisibles, sans caractères ambigus', () => {
  for (let i = 0; i < 200; i++) assert.match(pairingCode(), /^[A-HJKMNP-Z2-9]{3}-[A-HJKMNP-Z2-9]{3}$/);
  assert.deepEqual(parseCookies('a=1; pixel_session=abc%3D; vide='), { a: '1', pixel_session: 'abc=', vide: '' });
});

test('appairage : code à usage unique, insensible à la casse, cookie d’appareil persistant et haché', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pixel-auth-'));
  try {
    const a = new Auth(TOKEN, dir);
    const { code, expiresAt } = a.createPairing();
    assert.ok(expiresAt > Date.now());
    assert.equal(a.pair('111-111', 'test'), null, 'code inconnu');
    const sid = a.pair(code.replace('-', '').toLowerCase(), 'téléphone');
    assert.ok(sid);
    assert.equal(a.pair(code, 'autre'), null, 'code déjà utilisé');
    assert.equal(a.deviceCount(), 1);

    const cookie = a.cookie(sid, false);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.doesNotMatch(cookie, /Secure/);
    assert.match(a.cookie(sid, true), /; Secure$/);
    const withCookie = req({ cookie: `autre=1; pixel_session=${encodeURIComponent(sid)}` });
    assert.equal(a.check(withCookie), true);

    const file = path.join(dir, 'devices.json');
    if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(readFileSync(file, 'utf8').includes(sid), false, 'seule une empreinte est stockée');

    const reloaded = new Auth(TOKEN, dir);
    assert.equal(reloaded.check(withCookie), true, 'toujours connecté après redémarrage');
    assert.equal(reloaded.revokeAll(), 1);
    assert.equal(reloaded.check(withCookie), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('connexion par jeton puis déconnexion de l’appareil', () => {
  const a = new Auth(TOKEN);
  assert.equal(a.login('mauvais', 'x'), null);
  const sid = a.login(TOKEN, 'ordinateur')!;
  assert.ok(sid);
  const r = req({ cookie: `pixel_session=${sid}` });
  assert.equal(a.check(r), true);
  a.logout(r);
  assert.equal(a.check(r), false);
  assert.match(a.clearCookie(false), /Max-Age=0/);
});
