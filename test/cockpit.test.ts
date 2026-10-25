import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { cockpitDaten, initialen, protokoll, rechnungsstand } from '../src/cockpit/daten.ts';
import { migriere, type Db } from '../src/db/index.ts';
import { praxisDienst } from '../src/server.ts';
import { cockpitSeite } from '../src/web/cockpit.ts';

test('Diskret-Modus: Initialen statt Namen', () => {
  assert.equal(initialen('Max Mustermann KG'), 'M. M. K.');
  assert.equal(initialen('Erika – Erstbefund'), 'E. E.');
  assert.equal(initialen('12:00'), 'Termin');
});

test('Ohne Datenbank und Kalender: „nicht verbunden“ statt erfundener Zahlen', async () => {
  const d = await cockpitDaten({ namenZeigen: false, jetzt: new Date('2026-10-20T10:00:00Z') });
  assert.equal(d.rechnungen.stand, 'nicht-verbunden');
  assert.equal(d.termine.stand, 'nicht-verbunden');
  const html = cockpitSeite(d, { wer: 'x', fassung: '0' });
  assert.match(html, /noch nicht verbunden/);
  assert.ok(!/<b>\d+<\/b><span>eingegangen/.test(html), 'keine Zahl ohne Quelle');
  for (const kanal of ['E-Mail', 'WhatsApp', 'Telefon-Notiz', 'Website-Formular', 'Online-Buchung']) assert.match(html, new RegExp(kanal));
});

test('Termine heute aus dem Kalender: Zeitraum Berliner Tag, Initialen, Absagen weg', async () => {
  let url = '';
  const graph = {
    async get<T>(): Promise<T> { return { value: [] } as T; },
    async post<T>(): Promise<T> { return { id: 'kal' } as T; },
    async *paginate<T>(u: string): AsyncGenerator<T> {
      url = u;
      yield { subject: 'Erika Muster', isAllDay: false, start: { dateTime: '2026-10-20T09:00:00.0000000' }, end: { dateTime: '2026-10-20T09:45:00.0000000' } } as T;
      yield { subject: 'Abgesagt', isAllDay: false, isCancelled: true, start: { dateTime: '2026-10-20T11:00:00' }, end: { dateTime: '2026-10-20T12:00:00' } } as T;
    },
  };
  const d = await cockpitDaten({ graph, namenZeigen: false, jetzt: new Date('2026-10-20T10:00:00Z') });
  assert.match(url, /startDateTime=2026-10-19T22:00:00Z&endDateTime=2026-10-20T22:00:00Z/);
  assert.deepEqual(d.termine, { stand: 'ok', daten: [{ beginn: '09:00', ende: '09:45', ganztags: false, titel: 'E. M.', frei: false }] });
  const mitNamen = await cockpitDaten({ graph, namenZeigen: true });
  assert.equal(mitNamen.termine.stand === 'ok' && mitNamen.termine.daten[0]!.titel, 'Erika Muster');
});

test('Rechnungsstand und Protokoll aus der Datenbank', async () => {
  const pg = new PGlite();
  const db = { query: (t: string, v?: unknown[]) => pg.query(t, v), exec: (s: string) => pg.exec(s) } as Db;
  await migriere(db);
  const zeile = (id: string, klasse: string, status: string, betrag: number | null) => db.query(
    `INSERT INTO inbound_document (graph_message_id, attachment_id, received_at, sender_domain, subject_hash, sha256, size, klasse, status, betrag, lieferant)
     VALUES ($1, 'a', now(), 'x.de', 'h', $1, 1, $2, $3, $4, 'Telekom')`, [id, klasse, status, betrag]);
  await zeile('m1', 'rechnung', 'wartet_freigabe', 10.5);
  await zeile('m2', 'rechnung', 'bezahlt', 20);
  await zeile('m3', 'unklar', 'klassifiziert', null);
  await zeile('m4', 'keine_rechnung', 'klassifiziert', null);
  await db.query("INSERT INTO audit_event (actor, action, details) VALUES ('t', 'rechnung_abgelegt', '{\"lieferant\":\"Telekom\"}')");
  const r = await rechnungsstand(db);
  assert.ok(r.stand === 'ok');
  assert.deepEqual(r.daten.zaehler, { eingegangen: 1, unklar: 1, angestossen: 0, bezahlt: 1 });
  assert.equal(r.daten.offenerBetrag, 10.5);
  assert.equal(r.daten.neueste.length, 3, 'keine_rechnung erscheint nicht');
  const p = await protokoll(db);
  assert.ok(p.stand === 'ok' && p.daten[0]!.details.lieferant === 'Telekom');
});

test('Dienst: Cockpit unter /, lokaler Zugang nur ohne Tailscale-Kopfzeile von 127.0.0.1', async () => {
  const dienst = praxisDienst({ erlaubt: ['lilli@example.org'], fassung: 't', angemeldet: async () => true, pruefen: async () => [], lokalerZugang: 'christian@example.org' });
  await new Promise<void>((f) => dienst.listen(0, '127.0.0.1', f));
  const basis = `http://127.0.0.1:${(dienst.address() as AddressInfo).port}`;
  try {
    // lokalerZugang wird nur wirksam, wenn das Konto auch erlaubt ist (serve.ts trägt es ein)
    assert.equal((await fetch(`${basis}/`)).status, 403);
    const ok = await fetch(`${basis}/`, { headers: { 'Tailscale-User-Login': 'lilli@example.org' } });
    assert.equal(ok.status, 200);
    assert.match(await ok.text(), /Praxis-Cockpit/);
    assert.equal((await fetch(`${basis}/finanzen/rechnungen`, { headers: { 'Tailscale-User-Login': 'lilli@example.org' } })).status, 200);
  } finally {
    dienst.close();
  }
  const zwei = praxisDienst({ erlaubt: ['christian@example.org'], fassung: 't', angemeldet: async () => true, pruefen: async () => [], lokalerZugang: 'christian@example.org' });
  await new Promise<void>((f) => zwei.listen(0, '127.0.0.1', f));
  try {
    assert.equal((await fetch(`http://127.0.0.1:${(zwei.address() as AddressInfo).port}/`)).status, 200);
  } finally {
    zwei.close();
  }
});
