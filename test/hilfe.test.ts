import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { praxisDienst, statusseite } from '../src/server.ts';
import { HILFE, hilfeSeite, hilfeSkript } from '../src/web/hilfe.ts';

/** Die Namen, die src/pruefung.ts für seine Prüfpunkte verwendet */
const PRUEFPUNKTE = ['Konto', 'Posteingang', 'Kalender', 'OneDrive', 'Rechte'];

const seiten = () => [
  statusseite(PRUEFPUNKTE.map((name) => ({ name, ok: true, text: 'x' })), 'lilli@example.org', '0.0.0'),
  hilfeSeite({ wer: 'lilli@example.org', fassung: '0.0.0' }),
];
const schluessel = (html: string) => [...html.matchAll(/data-hilfe="([^"]+)"/g)].map((m) => m[1]!);

test('jedes Element mit data-hilfe hat eine Erklärung', () => {
  for (const html of seiten()) for (const k of schluessel(html)) assert.ok(HILFE[k], `Erklärung fehlt: ${k}`);
});

test('keine Erklärung ohne Element', () => {
  const benutzt = new Set(seiten().flatMap(schluessel));
  for (const k of Object.keys(HILFE)) assert.ok(benutzt.has(k), `Erklärung ohne Element: ${k}`);
});

test('jede Erklärung beantwortet alle fünf Fragen', () => {
  for (const [k, e] of Object.entries(HILFE)) {
    for (const f of ['loest_aus', 'bezug', 'aendert', 'ergebnis', 'rueckweg'] as const) assert.ok(e[f]?.trim(), `${k}: ${f} fehlt`);
  }
});

test('das Hilfe-Skript ist gültiges JavaScript und bringt die Texte mit', () => {
  const code = hilfeSkript();
  assert.doesNotThrow(() => new Function(code));
  assert.match(code, /"kategorie\.patient"/);
});

test('die Hilfeseite listet jede Erklärung mit Sprungmarke', () => {
  const html = hilfeSeite({ wer: 'x', fassung: '0' });
  for (const k of Object.keys(HILFE)) assert.ok(html.includes(`id="hilfe-${k.replace(/\./g, '-')}"`), k);
  assert.ok(!/<script>/.test(html), 'kein Inline-Skript – die Seite lädt /hilfe.js');
});

test('Dienst: /hilfe und /hilfe.js nur für freigegebene Tailnet-Konten', async () => {
  const dienst = praxisDienst({ erlaubt: ['lilli@example.org'], fassung: 't', angemeldet: async () => true, pruefen: async () => [] });
  await new Promise<void>((fertig) => dienst.listen(0, '127.0.0.1', fertig));
  const basis = `http://127.0.0.1:${(dienst.address() as AddressInfo).port}`;
  try {
    assert.equal((await fetch(`${basis}/hilfe`)).status, 403);
    const h = await fetch(`${basis}/hilfe`, { headers: { 'Tailscale-User-Login': 'lilli@example.org' } });
    assert.equal(h.status, 200);
    assert.match(h.headers.get('content-security-policy') ?? '', /script-src 'self'/);
    const js = await fetch(`${basis}/hilfe.js`, { headers: { 'Tailscale-User-Login': 'lilli@example.org' } });
    assert.match(js.headers.get('content-type') ?? '', /javascript/);
  } finally {
    dienst.close();
  }
});

test('konzept/hilfe-vorschau.html ist aktuell (sonst: npm run hilfe:vorschau -- konzept/hilfe-vorschau.html)', async () => {
  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  const soll = hilfeSeite({ wer: 'Vorschau', fassung: version, skriptInline: hilfeSkript() });
  const ist = await readFile(new URL('../konzept/hilfe-vorschau.html', import.meta.url), 'utf8');
  assert.ok(ist === soll, 'Die Hilfe-Vorschau ist veraltet – npm run hilfe:vorschau -- konzept/hilfe-vorschau.html');
});
