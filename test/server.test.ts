import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { praxisDienst } from '../src/server.ts';

let basis = '';
let angemeldet = true;
const dienst = praxisDienst({
  erlaubt: ['lilli@example.org', ' Christian@Example.org '],
  fassung: '0.0.0-test',
  angemeldet: async () => angemeldet,
  pruefen: async () => [
    { name: 'Konto', ok: true, text: 'Praxis <Test>' },
    { name: 'OneDrive', ok: false, text: 'kaputt' },
  ],
});

before(async () => {
  await new Promise<void>((fertig) => dienst.listen(0, '127.0.0.1', fertig));
  basis = `http://127.0.0.1:${(dienst.address() as AddressInfo).port}`;
});
after(() => dienst.close());

const als = (login?: string) => (login ? { headers: { 'Tailscale-User-Login': login } } : {});

test('Statusseite nur für freigegebene Tailnet-Konten', async () => {
  assert.equal((await fetch(`${basis}/status`)).status, 403);
  assert.equal((await fetch(`${basis}/status`, als('fremd@example.org'))).status, 403);
  const ok = await fetch(`${basis}/status`, als('christian@example.org'));
  assert.equal(ok.status, 200);
  const html = await ok.text();
  assert.match(html, /Praxis &lt;Test&gt;/, 'Inhalte werden maskiert');
  assert.match(html, /Etwas funktioniert gerade nicht/);
});

test('health braucht keine Anmeldung und sagt nur ok oder nicht', async () => {
  angemeldet = true;
  assert.equal((await fetch(`${basis}/api/health`)).status, 200);
  angemeldet = false;
  const r = await fetch(`${basis}/api/health`);
  assert.equal(r.status, 503);
  assert.deepEqual(await r.json(), { ok: false, fassung: '0.0.0-test' });
});

test('nur GET', async () => {
  assert.equal((await fetch(`${basis}/`, { method: 'POST', ...als('lilli@example.org') })).status, 405);
});
