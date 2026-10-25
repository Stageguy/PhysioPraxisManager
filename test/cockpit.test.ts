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

test('Termine heute: Klarname und Link aus der Kartei, wenn der Kalendereintrag von uns stammt; Kartei-Termine ohne Kalendereintrag erscheinen trotzdem', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { migriere } = await import('../src/db/index.ts');
  const { patientAnlegen, terminAnlegen } = await import('../src/kartei/patienten.ts');
  const { neuerHauptschluessel, tresor } = await import('../src/tresor.ts');
  const pg = new PGlite();
  const db = { query: (q: string, v?: unknown[]) => pg.query(q, v), exec: (s: string) => pg.exec(s) } as import('../src/db/index.ts').Db;
  await migriere(db);
  const t = tresor({ PRAXIS_TRESOR_SCHLUESSEL: neuerHauptschluessel() });
  const pid = await patientAnlegen(db, t, { vorname: 'Karin', nachname: 'Zwölfer' }, 'x');
  const { verordnungAnlegen } = await import('../src/kartei/patienten.ts');
  const rezept = await verordnungAnlegen(db, t, pid, { ausgestelltAm: '2026-10-01', massnahme: 'Manuelle Therapie', leistungNummer: '21201', anzahl: 6 }, 'x');
  const t1 = await terminAnlegen(db, pid, { datum: '2026-10-26', zeit: '08:00', dauerMin: 30, verordnungId: rezept }, 'x');
  await terminAnlegen(db, pid, { datum: '2026-10-26', zeit: '14:30', dauerMin: 30 }, 'x');
  await db.query("UPDATE termin SET exchange_event_id = 'ev-1' WHERE id = $1", [t1]);
  const graph = {
    async get<T>(): Promise<T> { return { value: [] } as T; },
    async post<T>(): Promise<T> { return { id: 'kal' } as T; },
    async *paginate<T>(): AsyncGenerator<T> {
      yield { id: 'ev-1', subject: 'K. Z. P-1001', isAllDay: false, start: { dateTime: '2026-10-26T08:00:00' }, end: { dateTime: '2026-10-26T08:30:00' } } as T;
      yield { id: 'fremd', subject: 'Zahnarzt Lilli', isAllDay: false, start: { dateTime: '2026-10-26T11:00:00' }, end: { dateTime: '2026-10-26T12:00:00' } } as T;
    },
  };
  const jetzt = new Date('2026-10-26T06:00:00Z');
  const d = await cockpitDaten({ db, graph, namenZeigen: true, jetzt });
  assert.equal(d.termine.stand, 'ok');
  const termine = d.termine.stand === 'ok' ? d.termine.daten : [];
  assert.deepEqual(termine.map((x) => [x.beginn, x.titel, x.link ?? null, x.leistung ?? null]), [
    ['08:00', 'Karin Zwölfer', `/patienten/${pid}#termine`, 'Manuelle Therapie'],
    ['11:00', 'Zahnarzt Lilli', null, null],
    ['14:30', 'Karin Zwölfer', `/patienten/${pid}#termine`, null],
  ], 'Kurzbezeichnung aus dem Rezept (ohne aktive Preisliste die Maßnahme)');
  const diskret = await cockpitDaten({ db, graph, namenZeigen: false, jetzt });
  assert.deepEqual((diskret.termine.stand === 'ok' ? diskret.termine.daten : []).map((x) => x.titel), ['K. Z.', 'Z. L.', 'K. Z.']);
});
