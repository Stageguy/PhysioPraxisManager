/** Akte-Einsicht nach § 630g (A19d): vollständiges PDF je Patient, Export im Protokoll */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import type { Db } from '../src/db/index.ts';
import { akteExport } from '../src/kartei/akte-export.ts';
import { karteiDienst } from '../src/kartei/dienst.ts';
import { behandlungErfassen, fallAnlegen, patientAnlegen, terminAnlegen, verordnungAnlegen } from '../src/kartei/patienten.ts';
import { anamneseErfassen, befundErfassen, erklaerungErfassen } from '../src/kartei/pinnwand.ts';
import { textPdf } from '../src/pdf/text.ts';
import { praxisDienst } from '../src/server.ts';
import { neuerHauptschluessel, tresor } from '../src/tresor.ts';
import { testDb } from './testdb.ts';

let basis = '';
let db: Db;
let server: ReturnType<typeof praxisDienst>;
const t = tresor({ PRAXIS_TRESOR_SCHLUESSEL: neuerHauptschluessel() });
const wer = { 'Tailscale-User-Login': 'lilli@example.org' };

before(async () => {
  db = await testDb();
  server = praxisDienst({ erlaubt: ['lilli@example.org'], fassung: 't', angemeldet: async () => true, pruefen: async () => [], kartei: karteiDienst({ db, tresor: t }) });
  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

test('Text-PDF: Seitenumbruch, Umlaute in WinAnsi, Seitenzahlen', () => {
  const pdf = Buffer.from(textPdf({ titel: 'Prüfung – Übersicht', untertitel: 'Zeile € 1', abschnitte: [{ titel: 'A', zeilen: Array.from({ length: 150 }, (_, i) => `Zeile ${i} mit etwas längerem Text, der über die Breite der Seite hinaus laufen kann und deshalb umbrochen wird, Ä Ö Ü ß`) }] })).toString('latin1');
  assert.ok(pdf.startsWith('%PDF-1.4'));
  assert.match(pdf, /\/Count ([3-9]|\d{2})/, 'mehrere Seiten');
  assert.match(pdf, /Seite 1 von \d+/);
  assert.match(pdf, /Pr\\374fung \\226 \\334bersicht/, 'ü, – und Ü als WinAnsi-Oktal');
  assert.match(pdf, /Zeile \\200 1/, '€');
  assert.match(pdf, /%%EOF\n$/);
});

test('Akte-Export: alle Teile im PDF, Protokolleintrag, Route mit Dateikopf', async () => {
  const pid = await patientAnlegen(db, t, { vorname: 'Anna', nachname: 'Test', anrede: 'Frau', geburtsdatum: '1984-03-12', kontakte: [{ art: 'mobil', wert: '0151 1234567' }], adresse: { bezeichnung: 'Zuhause', zusatz: null, strasse: 'Kurpromenade', hausnummer: '3', plz: '86825', ort: 'Bad Wörishofen' } }, 'x');
  const rezept = await verordnungAnlegen(db, t, pid, { ausgestelltAm: '2026-10-01', massnahme: 'Manuelle Therapie', leistungNummer: '21201', anzahl: 6, arzt: 'Dr. Beispiel', diagnose: 'M54.2' }, 'x');
  const fallId = await fallAnlegen(db, t, pid, { grundlage: 'verordnung', bezeichnung: 'HWS', anlass: 'Nackenschmerzen seit Juli', diagnoseArzt: 'M54.2 Zervikalneuralgie', phase: 'behandlung' }, 'x');
  await anamneseErfassen(db, t, pid, fallId, { art: 'erstanamnese', beschwerden: 'Schmerz beim Drehen', medikamente: 'Ibuprofen bei Bedarf' }, 'x');
  await befundErfassen(db, t, pid, fallId, { art: 'eingang', text: 'Rotation rechts eingeschränkt', messwerte: 'Rotation re 45°' }, 'x');
  await erklaerungErfassen(db, t, pid, { fallId, art: 'behandlungseinwilligung', form: 'muendlich', inhalt: 'Einwilligung in MT' }, 'x');
  await terminAnlegen(db, pid, { datum: '2026-11-02', zeit: '09:00', dauerMin: 30, verordnungId: rezept }, 'x');
  await behandlungErfassen(db, t, pid, { fallId, datum: '2026-10-20', dauerMin: 30, verordnungId: rezept, leistungNummer: '21201', massnahmen: 'Mobilisation C2–C4', verlaufWirkung: 'deutlich freier', reaktionen: 'keine', uebungen: 'Dehnung 2×/Tag' }, 'lilli');
  const e = await akteExport(db, t, pid, 'lilli@example.org');
  assert.match(e.name, /^Patientenakte-P-\d+-\d{4}-\d{2}-\d{2}\.pdf$/);
  const pdf = Buffer.from(e.daten).toString('latin1');
  for (const erwartet of ['Patientenakte Anna Test', '630g', 'Stammdaten', 'Kurpromenade 3', 'Mobil: 0151 1234567', 'Rezepte', 'Manuelle Therapie', 'Dr. Beispiel', 'Fall 1 \\226 HWS', 'Nackenschmerzen seit Juli', 'Zervikalneuralgie', 'Anamnese vom', 'Schmerz beim Drehen', 'Ibuprofen', 'Befund vom', 'Rotation re 45', 'Einwilligung in die Behandlung', 'Einwilligung in MT', '1 Behandlungen', 'Mobilisation C2', 'deutlich freier', 'Dehnung 2', 'Termine', 'auf Rezept', 'Vertraulich']) {
    assert.ok(pdf.includes(erwartet), `fehlt im PDF: ${erwartet}`);
  }
  assert.ok(!pdf.includes('kontaktverlauf'), 'nur Akte, kein Verlauf');
  const protokoll = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM audit_event WHERE action = 'akte_export' AND object_id = $1 AND actor = 'lilli@example.org'", [pid]);
  assert.equal(protokoll.rows[0]!.n, 1);
  const r = await fetch(`${basis}/patienten/${pid}/akte.pdf`, { headers: wer });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.match(r.headers.get('content-disposition') ?? '', /^inline; filename\*=UTF-8''Patientenakte-P-/);
  assert.ok((await r.text()).startsWith('%PDF-1.4'));
  assert.equal((await fetch(`${basis}/patienten/999/akte.pdf`, { headers: wer })).status, 404);
  assert.match(await (await fetch(`${basis}/patienten/${pid}/akte`, { headers: wer })).text(), /data-hilfe="akte.pdf"/);
});
