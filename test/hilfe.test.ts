import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { praxisDienst, statusseite } from '../src/server.ts';
import { HILFE, hilfeSeite, hilfeSkript } from '../src/web/hilfe.ts';
import { cockpitSeite } from '../src/web/cockpit.ts';
import { dashboardSeite, rechnungSeite, type KachelRechnung } from '../src/web/rechnungen.ts';
import type { CockpitDaten } from '../src/cockpit/daten.ts';

const RE: KachelRechnung = {
  id: '7', eingang: '2026-10-20T08:00:00Z', dateiname: 'Rechnung.pdf', absenderName: 'Telekom', absenderAdresse: 'rechnung@telekom.de',
  lieferant: 'Telekom', rechnungsnummer: 'A1', betrag: 49.95, netto: 41.97, ust: 7.98, ustSatz: '19 %', rechnungsdatum: '2026-10-19', status: 'wartet_freigabe',
  onedrivePfad: 'x/2026/Eingangsrechnungen/a.pdf', onedriveItemId: 'i', onedriveWebUrl: 'https://x', mailId: 'm',
  zurueckgestellt: false, ablehnungsgrund: null, geprueftVon: null, geprueftAm: null, ort: 'Posteingang › Rechnungen',
};
const AUSWERTUNG = { jahr: 2026, monate: [0, 0, 0, 0, 0, 0, 0, 0, 0, 49.95, 0, 0], lieferanten: [{ name: 'Telekom', summe: 49.95 }], summe: 49.95, ohneBetrag: 0, jahre: [2026] };
const ZEILE = { id: '1', eingang: '2026-10-20T08:00:00Z', lieferant: 'Telekom', rechnungsnummer: 'A1', betrag: 49.95, klasse: 'rechnung' as const, status: 'wartet_freigabe', onedrivePfad: 'a/b/c.pdf' };
const STAND = { stand: 'ok' as const, daten: { zaehler: { eingegangen: 1, unklar: 0, angestossen: 0, bezahlt: 0 }, offenerBetrag: 49.95, neueste: [ZEILE] } };
const DATEN: CockpitDaten = {
  heute: '2026-10-20', namenZeigen: false, rechnungen: STAND,
  termine: { stand: 'ok', daten: [{ beginn: '09:00', ende: '09:30', ganztags: false, titel: 'M. K.', frei: false }] },
  protokoll: { stand: 'ok', daten: [{ zeit: '2026-10-20T08:00:00Z', aktion: 'rechnung_abgelegt', objekt: '1', details: { lieferant: 'Telekom' } }] },
};

/** Die Namen, die src/pruefung.ts für seine Prüfpunkte verwendet */
const PRUEFPUNKTE = ['Konto', 'Posteingang', 'Kalender', 'OneDrive', 'Rechte'];

const seiten = () => [
  statusseite(PRUEFPUNKTE.map((name) => ({ name, ok: true, text: 'x' })), 'lilli@example.org', '0.0.0'),
  hilfeSeite({ wer: 'lilli@example.org', fassung: '0.0.0' }),
  cockpitSeite(DATEN, { wer: 'lilli@example.org', fassung: '0.0.0', jetzt: '10:00' }),
  dashboardSeite({ stand: STAND, neu: [RE], privat: [{ ...RE, id: '8', status: 'privat' }], auswertung: AUSWERTUNG, liste: [RE],
    filter: { jahr: 2026, stand: 'alle', suche: '' } }, { wer: 'lilli@example.org', fassung: '0.0.0' }),
  rechnungSeite(RE, { wer: 'lilli@example.org', fassung: '0.0.0' }),
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
