import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { migriere, type Db } from '../src/db/index.ts';
import { neuerHauptschluessel, tresor, TresorFehler } from '../src/tresor.ts';

// ── Tresor ──────────────────────────────────────────────────────────────────
const SCHLUESSEL = neuerHauptschluessel();
const env = (s = SCHLUESSEL) => ({ PRAXIS_TRESOR_SCHLUESSEL: s });

test('Tresor: verschlüsselt und entschlüsselt Text und Dateien', () => {
  const t = tresor(env());
  const geheim = t.verschluesseln('Schulter rechts, seit 3 Wochen', 'anamnese.beschwerden');
  assert.ok(!geheim.toString('latin1').includes('Schulter'));
  assert.equal(t.entschluesselnText(geheim, 'anamnese.beschwerden'), 'Schulter rechts, seit 3 Wochen');
  assert.equal(t.entschluesselnText(null, 'x'), null);
  const datei = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0, 255]);
  assert.deepEqual([...t.entschluesseln(t.verschluesseln(datei, 'dokument.inhalt'), 'dokument.inhalt')], [...datei]);
  // Zweimal verschlüsseln ergibt verschiedene Bytes (eigener Datenschlüssel und IV je Wert)
  assert.notDeepEqual(t.verschluesseln('a', 'k'), t.verschluesseln('a', 'k'));
});

test('Tresor: falscher Kontext, falscher Schlüssel und veränderte Daten scheitern', () => {
  const t = tresor(env());
  const geheim = t.verschluesseln('Diagnose', 'fall.diagnose_arzt');
  assert.throws(() => t.entschluesseln(geheim, 'fall.anlass'), TresorFehler);
  assert.throws(() => tresor(env(neuerHauptschluessel())).entschluesseln(geheim, 'fall.diagnose_arzt'), TresorFehler);
  const kaputt = Buffer.from(geheim);
  kaputt[kaputt.length - 1]! ^= 0x01;
  assert.throws(() => t.entschluesseln(kaputt, 'fall.diagnose_arzt'), TresorFehler);
  assert.throws(() => tresor({}), /PRAXIS_TRESOR_SCHLUESSEL fehlt/);
  assert.throws(() => tresor(env('zukurz')), /32 Byte/);
});

test('Tresor: Schlüsselwechsel – alte Werte bleiben mit dem alten Schlüssel lesbar', () => {
  const alt = tresor(env(`1:${SCHLUESSEL}`));
  const geheim = alt.verschluesseln('alt', 'notiz');
  const neuerSchluessel = neuerHauptschluessel();
  const neu = tresor(env(`2:${neuerSchluessel}`), { 1: SCHLUESSEL });
  assert.equal(neu.entschluesselnText(geheim, 'notiz'), 'alt');
  assert.equal(neu.verschluesseln('neu', 'notiz')[1], 2);
  assert.throws(() => tresor(env(`2:${neuerSchluessel}`)).entschluesseln(geheim, 'notiz'), /Nr. 1 ist nicht hinterlegt/);
});

// ── Datenmodell (Migration 007) ─────────────────────────────────────────────
let db: Db;
let patientId: string;

before(async () => {
  const pg = new PGlite();
  db = { query: async (t, w) => ({ rows: (await pg.query(t, w as unknown[])).rows as never }), exec: (s) => pg.exec(s) };
  const neu = await migriere(db);
  assert.ok(neu.includes('007_patientenkartei.sql'));
  const r = await db.query<{ id: string; patientennummer: string }>(
    "INSERT INTO patient (vorname, nachname, geburtsdatum) VALUES ('Anna', 'Muster', '1980-05-01') RETURNING id::text, patientennummer",
  );
  patientId = r.rows[0]!.id;
  assert.equal(r.rows[0]!.patientennummer, 'P-1001');
});

test('Kartei: Patientennummern laufen fort und lassen sich beim Import vorgeben', async () => {
  const a = await db.query<{ n: string }>("INSERT INTO patient (vorname, nachname) VALUES ('Ben', 'Beispiel') RETURNING patientennummer AS n");
  assert.equal(a.rows[0]!.n, 'P-1002');
  const b = await db.query<{ n: string }>("INSERT INTO patient (patientennummer, vorname, nachname) VALUES ('K-10077', 'Carla', 'Import') RETURNING patientennummer AS n");
  assert.equal(b.rows[0]!.n, 'K-10077');
  await assert.rejects(db.query("INSERT INTO patient (patientennummer, vorname, nachname) VALUES ('K-10077', 'Doppelt', 'X')"), /unique|duplicate/i);
});

test('Kartei: genau eine Rechnungsadresse und ein primärer Kontakt je Art', async () => {
  await db.query('INSERT INTO patient_adresse (patient_id, bezeichnung, strasse, plz, ort, rechnungsadresse) VALUES ($1, $2, $3, $4, $5, true)', [patientId, 'Zuhause', 'Kurstr. 1', '86825', 'Bad Wörishofen']);
  await db.query('INSERT INTO patient_adresse (patient_id, bezeichnung, ort) VALUES ($1, $2, $3)', [patientId, 'Arbeit', 'Mindelheim']);
  await assert.rejects(
    db.query('INSERT INTO patient_adresse (patient_id, bezeichnung, ort, rechnungsadresse) VALUES ($1, $2, $3, true)', [patientId, 'Eltern', 'Augsburg']),
    /unique|duplicate/i,
  );
  await db.query("INSERT INTO patient_kontakt (patient_id, art, wert, normiert, primaer) VALUES ($1, 'mobil', '0151 1234567', '+491511234567', true)", [patientId]);
  await db.query("INSERT INTO patient_kontakt (patient_id, art, wert, normiert, primaer) VALUES ($1, 'email', 'Anna@Example.org', 'anna@example.org', true)", [patientId]);
  await assert.rejects(
    db.query("INSERT INTO patient_kontakt (patient_id, art, wert, normiert, primaer) VALUES ($1, 'mobil', '0170 1', '+491701', true)", [patientId]),
    /unique|duplicate/i,
  );
});

test('Kartei: höchstens ein Rechnungsempfänger, Vertretung braucht keinen, Notfallkontakte mehrere', async () => {
  await db.query("INSERT INTO patient_bezugsperson (patient_id, rolle, name) VALUES ($1, 'rechnungsempfaenger', 'Max Muster')", [patientId]);
  await assert.rejects(db.query("INSERT INTO patient_bezugsperson (patient_id, rolle, name) VALUES ($1, 'rechnungsempfaenger', 'Noch einer')", [patientId]), /unique|duplicate/i);
  await db.query("INSERT INTO patient_bezugsperson (patient_id, rolle, name) VALUES ($1, 'notfallkontakt', 'A')", [patientId]);
  await db.query("INSERT INTO patient_bezugsperson (patient_id, rolle, name) VALUES ($1, 'notfallkontakt', 'B')", [patientId]);
});

test('Kartei: Dokumentation wird nicht geändert oder gelöscht, nur durch eine neue Fassung ersetzt', async () => {
  const t = tresor(env());
  const fall = (await db.query<{ id: string }>("INSERT INTO behandlungsfall (patient_id, nummer, grundlage) VALUES ($1, 1, 'verordnung') RETURNING id::text", [patientId])).rows[0]!.id;
  const a1 = (await db.query<{ id: string }>(
    "INSERT INTO anamnese (fall_id, erhoben_am, art, beschwerden, erstellt_von) VALUES ($1, '2026-10-24', 'gespraech', $2, 'lilli') RETURNING id::text",
    [fall, t.verschluesseln('Schulter rechts', 'anamnese.beschwerden')],
  )).rows[0]!.id;
  await assert.rejects(db.query('UPDATE anamnese SET beschwerden = $2 WHERE id = $1', [a1, t.verschluesseln('geändert', 'anamnese.beschwerden')]), /neue Fassung/);
  await assert.rejects(db.query('DELETE FROM anamnese WHERE id = $1', [a1]), /nicht gelöscht/);
  // Neue Fassung: einfügen mit vorgaenger_id, alte als ersetzt markieren
  await db.query(
    "INSERT INTO anamnese (fall_id, erhoben_am, art, beschwerden, erstellt_von, vorgaenger_id) VALUES ($1, '2026-10-25', 'gespraech', $2, 'lilli', $3)",
    [fall, t.verschluesseln('Schulter rechts, nachts schlimmer', 'anamnese.beschwerden'), a1],
  );
  await db.query('UPDATE anamnese SET ersetzt_am = now() WHERE id = $1', [a1]);
  await assert.rejects(db.query('UPDATE anamnese SET ersetzt_am = now() WHERE id = $1', [a1]), /bereits ersetzt/);
  const aktuell = await db.query<{ beschwerden: Uint8Array }>('SELECT beschwerden FROM anamnese WHERE fall_id = $1 AND ersetzt_am IS NULL', [fall]);
  assert.equal(aktuell.rows.length, 1);
  assert.equal(t.entschluesselnText(aktuell.rows[0]!.beschwerden, 'anamnese.beschwerden'), 'Schulter rechts, nachts schlimmer');
  // Der Fall und der Patient lassen sich jetzt nicht mehr löschen
  await assert.rejects(db.query('DELETE FROM behandlungsfall WHERE id = $1', [fall]), /nicht gelöscht/);
  await assert.rejects(db.query('DELETE FROM patient WHERE id = $1', [patientId]), /archivieren statt löschen/);
});

test('Kartei: Stempelkarte – je Sitzung und Rezept ein Haken, jede Leistung nur einmal abgerechnet', async () => {
  const fall = (await db.query<{ id: string }>('SELECT id::text FROM behandlungsfall WHERE patient_id = $1', [patientId])).rows[0]!.id;
  const rezept = (await db.query<{ id: string }>(
    "INSERT INTO verordnung (patient_id, fall_id, ausgestellt_am, massnahme, anzahl_verordnet) VALUES ($1, $2, '2026-10-01', 'Manuelle Therapie', 6) RETURNING id::text",
    [patientId, fall],
  )).rows[0]!.id;
  const sitzung = (await db.query<{ id: string }>(
    "INSERT INTO behandlung (fall_id, datum, behandelt_von, erstellt_von) VALUES ($1, '2026-10-24', 'lilli', 'lilli') RETURNING id::text", [fall],
  )).rows[0]!.id;
  const leistung = (await db.query<{ id: string }>(
    "INSERT INTO behandlung_leistung (behandlung_id, verordnung_id, nummer, bezeichnung, einzelpreis) VALUES ($1, $2, '21201', 'Manuelle Therapie', 46.27) RETURNING id::text",
    [sitzung, rezept],
  )).rows[0]!.id;
  await assert.rejects(
    db.query("INSERT INTO behandlung_leistung (behandlung_id, verordnung_id, nummer, bezeichnung, einzelpreis) VALUES ($1, $2, '21201', 'noch mal', 46.27)", [sitzung, rezept]),
    /unique|duplicate/i,
  );
  const r = (await db.query<{ id: string }>(
    "INSERT INTO rechnung (patient_id, fall_id, art, steuerklasse, empfaenger) VALUES ($1, $2, 'abschlussrechnung', 'heilbehandlung_steuerfrei', '{}') RETURNING id::text",
    [patientId, fall],
  )).rows[0]!.id;
  await db.query("INSERT INTO rechnung_position (rechnung_id, behandlung_leistung_id, reihenfolge, bezeichnung, einzelpreis, betrag) VALUES ($1, $2, 1, 'MT', 46.27, 46.27)", [r, leistung]);
  await assert.rejects(
    db.query("INSERT INTO rechnung_position (rechnung_id, behandlung_leistung_id, reihenfolge, bezeichnung, einzelpreis, betrag) VALUES ($1, $2, 2, 'MT', 46.27, 46.27)", [r, leistung]),
    /unique|duplicate/i,
  );
  // Abgerechnet: 1 von 6
  const stand = await db.query<{ haken: string }>('SELECT count(*)::text AS haken FROM behandlung_leistung WHERE verordnung_id = $1', [rezept]);
  assert.equal(stand.rows[0]!.haken, '1');
  // Abbruch ohne Grund ist nicht erlaubt
  await assert.rejects(db.query("UPDATE verordnung SET status = 'abgebrochen' WHERE id = $1", [rezept]), /check/i);
});

test('Kartei: Erklärungen nur widerrufen, Dokumente nur für ungültig erklären; Prävention ist Wellness', async () => {
  const t = tresor(env());
  const e = (await db.query<{ id: string }>(
    "INSERT INTO patient_erklaerung (patient_id, art, am, form, erfasst_von) VALUES ($1, 'einwilligung_whatsapp', '2026-10-24', 'textform', 'lilli') RETURNING id::text", [patientId],
  )).rows[0]!.id;
  await assert.rejects(db.query("UPDATE patient_erklaerung SET art = 'einwilligung_email' WHERE id = $1", [e]), /nur widerrufen/);
  await db.query("UPDATE patient_erklaerung SET widerrufen_am = '2026-11-01', widerruf_grund = 'telefonisch' WHERE id = $1", [e]);
  await assert.rejects(db.query('DELETE FROM patient_erklaerung WHERE id = $1', [e]), /nicht gelöscht/);
  const d = (await db.query<{ id: string }>(
    "INSERT INTO dokument (patient_id, art, titel, mime, groesse, sha256, inhalt, quelle, erstellt_von) VALUES ($1, 'verordnung', $2, 'application/pdf', 3, 'abc', $3, 'upload', 'lilli') RETURNING id::text",
    [patientId, t.verschluesseln('Rezept 01.10.2026', 'dokument.titel'), t.verschluesseln(new Uint8Array([1, 2, 3]), 'dokument.inhalt')],
  )).rows[0]!.id;
  await assert.rejects(db.query("UPDATE dokument SET mime = 'image/png' WHERE id = $1", [d]), /nur widerrufen/);
  await db.query("UPDATE dokument SET ungueltig_am = now(), ungueltig_grund = 'falscher Patient' WHERE id = $1", [d]);
  await assert.rejects(db.query('DELETE FROM dokument WHERE id = $1', [d]), /nicht gelöscht/);
  await assert.rejects(
    db.query("INSERT INTO behandlungsfall (patient_id, nummer, grundlage, steuerklasse) VALUES ($1, 2, 'praevention', 'heilbehandlung_steuerfrei')", [patientId]),
    /check/i,
  );
  const gruende = await db.query<{ code: string }>('SELECT code FROM gespraechsgrund WHERE aktiv ORDER BY reihenfolge');
  assert.deepEqual(gruende.rows.slice(0, 4).map((g) => g.code), ['terminvereinbarung', 'terminverschiebung', 'absage_patient', 'absage_praxis']);
});
