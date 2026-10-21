import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { migriere, type Db } from '../src/db/index.ts';
import type { RechnungsEinstellungen } from '../src/einstellungen.ts';
import { rechnungseingang } from '../src/rechnungen/eingang.ts';
import { postfach, textAusAttrappe, type TestMail } from './postfach-attrappe.ts';

const einst = (ziel: string | null = 'Büro/Buchhaltung/Eingang'): RechnungsEinstellungen => ({
  seit: '2026-10-01',
  mailordner: 'Posteingang/Rechnungen',
  verarbeitet: 'Posteingang/Rechnungen/Verarbeitet',
  ziel,
  kategorien: { eingegangen: 'Rechnung: eingegangen', patient: 'Prüfen – Patient', unklar: 'Prüfen – unklar' },
  lieferanten: [{ name: 'Telekom', domains: ['telekom.de'] }],
  eigeneAbsender: ['belege.lexware.de'],
});

const RECHNUNG = 'Rechnung\nRechnungsnummer 4711\nGesamtbetrag 49,95 EUR\nUSt-IdNr DE123456789';

const mails = (): TestMail[] => [
  {
    id: 'm-telekom', von: 'rechnung@rechnung.telekom.de', betreff: 'Ihre Rechnung Oktober', eingang: '2026-10-19T22:30:00Z',
    anhaenge: [
      { id: 'a1', name: 'Rechnung.pdf', contentType: 'application/pdf', inhalt: RECHNUNG },
      { id: 'a2', name: 'logo.png', contentType: 'image/png', inline: true },
    ],
  },
  {
    id: 'm-patient', von: 'erika@example.org', betreff: 'Mein Rezept', eingang: '2026-10-20T08:00:00Z',
    anhaenge: [{ id: 'p1', name: 'scan.pdf', contentType: 'application/pdf', inhalt: '' }],
  },
  {
    id: 'm-patient-text', von: 'max@example.org', betreff: 'Unterlagen', eingang: '2026-10-20T09:00:00Z',
    anhaenge: [{ id: 'p2', name: 'dok.pdf', contentType: 'application/pdf', inhalt: 'Heilmittelverordnung Krankengymnastik' }],
  },
  {
    id: 'm-unbekannt', von: 'buchhaltung@neuer-lieferant.de', betreff: 'Rechnung', eingang: '2026-10-20T10:00:00Z',
    anhaenge: [{ id: 'u1', name: 'RE-1.pdf', contentType: 'application/pdf', inhalt: RECHNUNG }],
  },
  {
    id: 'm-eigene', von: 'noreply@belege.lexware.de', betreff: 'Rechnung RE-2026-17', eingang: '2026-10-20T12:00:00Z',
    anhaenge: [{ id: 'e1', name: 'RE-2026-17.pdf', contentType: 'application/pdf', inhalt: `${RECHNUNG}\nDiagnose` }],
  },
  {
    id: 'm-foto', von: 'jemand@example.org', betreff: 'Foto', eingang: '2026-10-20T11:00:00Z',
    anhaenge: [{ id: 'f1', name: 'bild.jpg', contentType: 'image/jpeg' }],
  },
];

let pg: PGlite;
let db: Db;
beforeEach(async () => {
  pg = new PGlite();
  db = { query: (t, v) => pg.query(t, v), exec: (s) => pg.exec(s) } as Db;
  await migriere(db);
});

const zeilen = async () =>
  (await db.query<{ klasse: string; status: string; attachment_name: string | null; onedrive_path: string | null }>(
    'SELECT klasse, status, attachment_name, onedrive_path FROM inbound_document ORDER BY id',
  )).rows;

test('Probelauf: liest nur, schreibt nichts – weder in Microsoft 365 noch in die Datenbank', async () => {
  const g = postfach(mails());
  const b = await rechnungseingang(g, einst(null), { ausfuehren: false, db, textAus: textAusAttrappe });
  assert.deepEqual(g.schreibend, []);
  assert.deepEqual(await zeilen(), []);
  assert.equal(b.quelle, 'posteingang');
  assert.deepEqual(
    { mails: b.mails, rechnungen: b.rechnungen, unklar: b.unklar, patient: b.patient, eigene: b.eigene, ignoriert: b.ignoriert },
    { mails: 6, rechnungen: 1, unklar: 1, patient: 2, eigene: 1, ignoriert: 2 },
  );
  // 22:30 UTC am 19.10. ist in Deutschland schon der 20.10.
  assert.match(b.abgelegt[0]!.pfad, /^<Zielordner offen>\/2026\/10\/20-10-2026-ER-Rechnung\.pdf$/);
});

test('Ausführen verweigert ohne Zielordner und ohne Datenbank', async () => {
  await assert.rejects(rechnungseingang(postfach(mails()), einst(null), { ausfuehren: true, db }), /Zielordner/);
  await assert.rejects(rechnungseingang(postfach(mails()), einst(), { ausfuehren: true }), /Datenbank/);
});

test('Ausführen: Rechnung abgelegt, Patientenpost nur markiert, Unklares vermerkt', async () => {
  const liste = mails();
  const g = postfach(liste);
  const b = await rechnungseingang(g, einst(), { ausfuehren: true, db, textAus: textAusAttrappe });
  assert.equal(b.fehler, 0);
  assert.deepEqual(g.hochgeladen.map((h) => h.pfad), ['Büro/Buchhaltung/Eingang/2026/10']);
  assert.equal(g.hochgeladen[0]!.name, '20-10-2026-ER-Rechnung.pdf');

  const z = await zeilen();
  assert.deepEqual(z.map((r) => [r.klasse, r.status]), [['rechnung', 'wartet_freigabe'], ['unklar', 'klassifiziert']]);
  assert.equal(z[0]!.attachment_name, 'Rechnung.pdf');
  assert.equal(z[1]!.attachment_name, null, 'kein Dateiname bei Unklarem');

  const kat = Object.fromEntries(liste.map((m) => [m.id, m.categories ?? []]));
  assert.deepEqual(kat['m-telekom'], ['Rechnung: eingegangen']);
  assert.deepEqual(kat['m-patient'], ['Prüfen – Patient']);
  assert.deepEqual(kat['m-patient-text'], ['Prüfen – Patient']);
  assert.deepEqual(kat['m-unbekannt'], ['Prüfen – unklar']);
  assert.deepEqual(kat['m-foto'], []);
  assert.deepEqual(kat['m-eigene'], [], 'eigene Ausgangsrechnungen bleiben unberührt');
  assert.equal(b.verschoben, 1, 'nur die Mail mit abgelegter Rechnung');

  // Patientenpost hinterlässt keine Zeile und keinen Anhangsabruf in der Datenbank
  const { rows } = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM inbound_document WHERE graph_message_id LIKE 'm-patient%'");
  assert.equal(rows[0]!.n, 0);
  const aktionen = (await db.query<{ action: string }>('SELECT action FROM audit_event ORDER BY id')).rows.map((r) => r.action);
  assert.deepEqual(aktionen.sort(), ['anhang_unklar', 'mail_patient_markiert', 'mail_patient_markiert', 'rechnung_abgelegt'].sort());
});

test('Zweiter Lauf tut nichts mehr', async () => {
  const liste = mails();
  await rechnungseingang(postfach(liste), einst(), { ausfuehren: true, db, textAus: textAusAttrappe });
  const g = postfach(liste);
  const b = await rechnungseingang(g, einst(), { ausfuehren: true, db, textAus: textAusAttrappe });
  assert.deepEqual(g.schreibend, []);
  assert.equal(b.rechnungen, 0);
});

test('Dieselbe Rechnung in zwei Mails wird nur einmal abgelegt', async () => {
  const liste = mails().slice(0, 1);
  liste.push({ ...liste[0]!, id: 'm-telekom-2', anhaenge: [{ ...liste[0]!.anhaenge[0]!, id: 'a9' }] });
  const g = postfach(liste);
  const b = await rechnungseingang(g, einst(), { ausfuehren: true, db, textAus: textAusAttrappe });
  assert.equal(g.hochgeladen.length, 1);
  assert.equal(b.duplikate, 1);
});

test('Fehler beim Hochladen: Mail bleibt unmarkiert, keine Zeile für die Rechnung', async () => {
  const liste = mails().slice(0, 1);
  const b = await rechnungseingang(postfach(liste, { uploadFehler: true }), einst(), { ausfuehren: true, db, textAus: textAusAttrappe });
  assert.equal(b.fehler, 1);
  assert.deepEqual(liste[0]!.categories ?? [], []);
  assert.deepEqual(await zeilen(), []);
});

test('Mit Rechnungsordner: Delta-Abfrage, Stand wird gemerkt und beim nächsten Lauf benutzt', async () => {
  const liste = mails().map((m) => ({ ...m, ordner: 'rechnungen' as const }));
  const g = postfach(liste, { rechnungsordner: true });
  const b = await rechnungseingang(g, einst(), { ausfuehren: true, db, textAus: textAusAttrappe });
  assert.equal(b.quelle, 'rechnungsordner');
  const stand = (await db.query<{ value: string }>('SELECT value FROM sync_state')).rows;
  assert.deepEqual(stand.map((s) => s.value), ['https://delta/1']);

  const g2 = postfach(liste, { rechnungsordner: true });
  await rechnungseingang(g2, einst(), { ausfuehren: true, db, textAus: textAusAttrappe });
  assert.equal(g2.deltaAbrufe, 1);
  assert.deepEqual(g2.schreibend, []);
});

test('Probelauf merkt sich keinen Delta-Stand', async () => {
  const liste = mails().map((m) => ({ ...m, ordner: 'rechnungen' as const }));
  await rechnungseingang(postfach(liste, { rechnungsordner: true }), einst(), { ausfuehren: false, db, textAus: textAusAttrappe });
  assert.deepEqual((await db.query('SELECT * FROM sync_state')).rows, []);
});

test('Übernahme: bestätigter Altbestand kommt gleich als bezahlt ins Archiv, Unklares wird nur gezählt', async () => {
  const liste = mails();
  async function* alle() {
    for (const m of liste) yield { id: m.id, subject: m.betreff, receivedDateTime: m.eingang, categories: m.categories ?? [], from: { emailAddress: { address: m.von } }, hasAttachments: true };
  }
  const g = postfach(liste);
  const b = await rechnungseingang(g, einst(), { ausfuehren: true, db, textAus: textAusAttrappe, nachrichten: alle(), altbestandBezahltBis: '2026-10-31' });
  assert.equal(b.quelle, 'uebernahme');
  assert.equal(b.archiviert, 1);
  const telekom = liste.find((m) => m.id === 'm-telekom')!;
  assert.deepEqual(telekom.categories, ['Rechnung: bezahlt']);
  assert.equal((telekom as { verschobenNach?: string }).verschobenNach, 'archive');
  const z = await zeilen();
  assert.deepEqual(z.map((r) => [r.klasse, r.status]), [['rechnung', 'bezahlt']], 'Unklares wird in der Übernahme nicht gespeichert');
  assert.deepEqual(liste.find((m) => m.id === 'm-unbekannt')!.categories ?? [], [], 'und nicht markiert');
  assert.deepEqual(liste.find((m) => m.id === 'm-patient')!.categories ?? [], []);
  const k = (await db.query<{ rechnungsnummer: string; betrag: string }>('SELECT rechnungsnummer, betrag::text FROM inbound_document')).rows[0];
  assert.deepEqual(k, { rechnungsnummer: '4711', betrag: '49.95' });
});

test('Mails nur markieren, nicht verschieben (mailsVerschieben: false); unbekannte Absender als Rechnung', async () => {
  const liste = mails();
  // Eine andere Rechnung als die der Telekom – sonst wäre es eine Dublette
  liste.find((m) => m.id === 'm-unbekannt')!.anhaenge[0]!.inhalt = `${RECHNUNG}\nKundennummer 99`;
  const g = postfach(liste);
  const b = await rechnungseingang(g, { ...einst(), mailsVerschieben: false, unbekannteAlsRechnung: true }, { ausfuehren: true, db, textAus: textAusAttrappe });
  assert.equal(b.verschoben, 0);
  assert.ok(!g.schreibend.some((x) => x.includes('/move')));
  assert.equal(b.rechnungen, 2, 'Telekom und der unbekannte Lieferant');
  const z = (await db.query<{ lieferant: string; absender_adresse: string; attachment_name: string }>(
    "SELECT lieferant, absender_adresse, attachment_name FROM inbound_document WHERE klasse = 'rechnung' ORDER BY id")).rows;
  assert.deepEqual(z.map((r) => r.lieferant), ['Telekom', 'Neuer-lieferant']);
  assert.equal(z[1]!.absender_adresse, 'buchhaltung@neuer-lieferant.de');
  assert.deepEqual(liste.find((m) => m.id === 'm-unbekannt')!.categories, ['Rechnung: eingegangen']);
});

test('Protokoll lässt sich nicht ändern', async () => {
  await db.query("INSERT INTO audit_event (actor, action) VALUES ('test', 'x')");
  await assert.rejects(db.query('DELETE FROM audit_event'), /unveränderlich/);
});
