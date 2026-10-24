import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { migriere, type Db } from '../src/db/index.ts';
import { karteiDienst } from '../src/kartei/dienst.ts';
import { telefonNormieren } from '../src/kartei/patienten.ts';
import { testdatenAnlegen } from '../src/kartei/testdaten.ts';
import { praxisDienst } from '../src/server.ts';
import { neuerHauptschluessel, tresor } from '../src/tresor.ts';

let basis = '';
let db: Db;
let server: ReturnType<typeof praxisDienst>;
const t = tresor({ PRAXIS_TRESOR_SCHLUESSEL: neuerHauptschluessel() });
const wer = { 'Tailscale-User-Login': 'lilli@example.org' };
const post = (felder: Record<string, string | string[]>, kopf: Record<string, string> = { 'Sec-Fetch-Site': 'same-origin' }) => {
  const f = new URLSearchParams();
  for (const [k, v] of Object.entries(felder)) for (const x of [v].flat()) f.append(k, x);
  return fetch(`${basis}/patienten/aktion`, { method: 'POST', redirect: 'manual', headers: { ...wer, ...kopf, 'Content-Type': 'application/x-www-form-urlencoded' }, body: f.toString() });
};
const ziel = (r: Response) => decodeURIComponent(r.headers.get('location') ?? '');
const seite = async (pfad: string) => (await fetch(`${basis}${pfad}`, { headers: wer })).text();

before(async () => {
  const pg = new PGlite();
  db = { query: (q, v) => pg.query(q, v), exec: (s) => pg.exec(s) } as Db;
  await migriere(db);
  server = praxisDienst({ erlaubt: ['lilli@example.org'], fassung: 't', angemeldet: async () => true, pruefen: async () => [], kartei: karteiDienst({ db, tresor: t }) });
  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

test('Telefonnummern werden für tel:/wa.me-Links normiert', () => {
  assert.equal(telefonNormieren('0151 123 45 67'), '+491511234567');
  assert.equal(telefonNormieren('+49 (0)8247 / 12 34'), '+4908247123 4'.replace(' ', ''));
  assert.equal(telefonNormieren('0043 1 234'), '+431234');
});

let id = '';
test('Patient anlegen: Kachel zeigt Telefon, WhatsApp, Mail und Patient seit', async () => {
  assert.equal((await post({ aktion: 'anlegen', vorname: 'Anna', nachname: 'Test' }, {})).status, 403, 'nur von der eigenen Seite');
  const r = await post({ aktion: 'anlegen', vorname: 'Anna', nachname: 'Test', geburtsdatum: '1984-03-12', mobil: '0151 1234567', whatsapp_wie_mobil: '1', email: 'Shopping+Anna@2late.de', strasse: 'Kurpromenade', hausnummer: '3', plz: '86825', ort: 'Bad Wörishofen', besonderheiten: 'Hörgerät' });
  assert.equal(r.status, 303);
  id = /\/patienten\/(\d+)/.exec(ziel(r))![1]!;
  const liste = await seite('/patienten');
  assert.match(liste, /Anna Test/);
  assert.match(liste, /href="tel:\+491511234567"/);
  assert.match(liste, /href="https:\/\/wa\.me\/491511234567"/);
  assert.match(liste, /href="mailto:shopping\+anna@2late\.de"/);
  assert.match(liste, /Hörgerät/);
  assert.match(liste, /P-1001/);
  assert.doesNotMatch(await seite('/patienten?suche=niemand'), /Anna Test/);
  assert.match(await seite('/patienten?suche=1234567'), /Anna Test/, 'Suche über die Nummer');
});

test('Fehler landen als Meldung auf der Seite, nicht als 500', async () => {
  const r = await post({ aktion: 'anlegen', vorname: '', nachname: 'X' });
  assert.match(ziel(r), /fehler=Vorname und Nachname/);
  const k = await post({ aktion: 'kontakt_speichern', id, art: 'email', wert: 'keine-adresse' });
  assert.match(ziel(k), /fehler=.*keine Mailadresse/);
});

test('Anruf aus der Kachel → offener Eintrag → Gesprächsgrund → im Verlauf', async () => {
  const kontaktId = (await db.query<{ id: string }>("SELECT id::text FROM patient_kontakt WHERE patient_id = $1 AND art = 'mobil'", [id])).rows[0]!.id;
  // So schickt es /praxis.js per sendBeacon
  const b = await post({ aktion: 'anruf', id, kontakt_id: kontaktId, zurueck: '/patienten' });
  assert.equal(b.status, 303);
  let html = await seite(`/patienten/${id}`);
  assert.match(html, /worum ging es\?/);
  assert.match(await seite('/patienten'), /1 Gespräch ohne Grund/);
  const eintrag = (await db.query<{ id: string }>('SELECT id::text FROM patient_kontaktverlauf WHERE patient_id = $1 AND offen', [id])).rows[0]!.id;
  assert.match(ziel(await post({ aktion: 'verlauf_abschliessen', id, eintrag_id: eintrag, grund: 'terminverschiebung', notiz: 'auf Dienstag' })), /Gespräch eingetragen/);
  html = await seite(`/patienten/${id}`);
  assert.doesNotMatch(html, /worum ging es\?/);
  assert.match(html, /<b>Terminverschiebung<\/b>/);
  assert.match(html, /auf Dienstag/);
  // Notiz liegt verschlüsselt in der Datenbank
  const roh = (await db.query<{ notiz: Uint8Array }>('SELECT notiz FROM patient_kontaktverlauf WHERE id = $1', [eintrag])).rows[0]!.notiz;
  assert.ok(!Buffer.from(roh).toString('latin1').includes('Dienstag'));
  // Zweiter Anruf ohne Gespräch: verwerfen
  await post({ aktion: 'anruf', id, kontakt_id: kontaktId });
  const offen = (await db.query<{ id: string }>('SELECT id::text FROM patient_kontaktverlauf WHERE patient_id = $1 AND offen', [id])).rows[0]!.id;
  await post({ aktion: 'verlauf_verwerfen', id, eintrag_id: offen });
  assert.equal((await db.query('SELECT 1 FROM patient_kontaktverlauf WHERE patient_id = $1 AND offen', [id])).rows.length, 0);
});

test('Adressen: Kacheln, genau eine Rechnungsadresse, entfernen rückt nach', async () => {
  await post({ aktion: 'adresse_speichern', id, bezeichnung: 'Arbeit', strasse: 'Industriestraße', hausnummer: '8', plz: '86825', ort: 'Bad Wörishofen' });
  let adressen = (await db.query<{ id: string; bezeichnung: string; rechnungsadresse: boolean }>('SELECT id::text, bezeichnung, rechnungsadresse FROM patient_adresse WHERE patient_id = $1 ORDER BY id', [id])).rows;
  assert.deepEqual(adressen.map((a) => [a.bezeichnung, a.rechnungsadresse]), [['Zuhause', true], ['Arbeit', false]]);
  await post({ aktion: 'rechnungsadresse', id, adresse_id: adressen[1]!.id });
  adressen = (await db.query<{ id: string; bezeichnung: string; rechnungsadresse: boolean }>('SELECT id::text, bezeichnung, rechnungsadresse FROM patient_adresse WHERE patient_id = $1 ORDER BY id', [id])).rows;
  assert.deepEqual(adressen.map((a) => a.rechnungsadresse), [false, true]);
  const html = await seite(`/patienten/${id}`);
  assert.equal((html.match(/class="adr aktiv"/g) ?? []).length, 1);
  await post({ aktion: 'adresse_loeschen', id, adresse_id: adressen[1]!.id });
  const rest = (await db.query<{ rechnungsadresse: boolean }>('SELECT rechnungsadresse FROM patient_adresse WHERE patient_id = $1', [id])).rows;
  assert.deepEqual(rest.map((a) => a.rechnungsadresse), [true], 'die verbleibende wird Rechnungsadresse');
});

test('Rezept, Termin, Behandlung: neuer Fall, Haken auf der Stempelkarte, Akte protokolliert', async () => {
  assert.match(ziel(await post({ aktion: 'verordnung_anlegen', id, ausgestellt_am: '2026-10-01', arzt: 'Dr. Beispiel', massnahme: 'Manuelle Therapie', leistung_nummer: '21201', anzahl: '2', diagnose: 'M75.1' })), /Rezept angelegt/);
  const rezept = (await db.query<{ id: string }>('SELECT id::text FROM verordnung WHERE patient_id = $1', [id])).rows[0]!.id;
  assert.match(ziel(await post({ aktion: 'termin_anlegen', id, datum: '2099-01-05', zeit: '09:30', dauer_min: '30', verordnung_id: rezept })), /Termin angelegt/);
  let liste = await seite('/patienten');
  assert.match(liste, /05\.01\.2099, 09:30/);
  assert.match(liste, /jetzt">Rezept</);
  // Behandlung ohne Maßnahmen ist nicht erlaubt (§ 630f)
  assert.match(ziel(await post({ aktion: 'behandlung_erfassen', id, fall_id: 'neu', grundlage: 'verordnung', datum: '2026-10-20', massnahmen: '' })), /fehler=.*Maßnahmen/);
  const b1 = await post({ aktion: 'behandlung_erfassen', id, fall_id: 'neu', grundlage: 'verordnung', fall_bezeichnung: 'Schulter rechts', anlass: 'Schmerz beim Heben', datum: '2026-10-20', dauer_min: '30', verordnung_id: rezept, massnahmen: 'MT Schulter, Mobilisation', verlauf_wirkung: 'NRS 6 → 4' });
  assert.match(ziel(b1), /\/patienten\/\d+\/akte\?meldung=.*#b-\d+$/);
  const fall = (await db.query<{ id: string }>('SELECT id::text FROM behandlungsfall WHERE patient_id = $1', [id])).rows[0]!.id;
  const b2 = await post({ aktion: 'behandlung_erfassen', id, fall_id: fall, datum: '2026-10-22', verordnung_id: rezept, massnahmen: 'MT Schulter' });
  assert.match(ziel(b2), /akte/);
  // Dritter Haken geht nicht – das Rezept hat nur zwei
  assert.match(ziel(await post({ aktion: 'behandlung_erfassen', id, fall_id: fall, datum: '2026-10-24', verordnung_id: rezept, massnahmen: 'MT' })), /fehler=.*nicht mehr aktiv|fehler=.*alle Behandlungen/);
  const v = (await db.query<{ status: string }>('SELECT status::text FROM verordnung WHERE id = $1', [rezept])).rows[0]!;
  assert.equal(v.status, 'abgeschlossen');
  liste = await seite('/patienten');
  assert.match(liste, /22\.10\.2026 · Verlauf/, 'letzte Behandlung auf der Kachel – der abgewiesene dritte Eintrag hat nichts hinterlassen');
  assert.equal((await db.query<{ n: string }>('SELECT count(*)::text AS n FROM behandlung')).rows[0]!.n, '2');
  const akte = await seite(`/patienten/${id}/akte`);
  assert.match(akte, /Schulter rechts/);
  assert.match(akte, /MT Schulter, Mobilisation/);
  assert.match(akte, /NRS 6 → 4/);
  assert.match(akte, /2 von 2|Rezept ✓/);
  const protokoll = (await db.query<{ n: string }>("SELECT count(*)::text AS n FROM audit_event WHERE action = 'akte_geoeffnet' AND object_id = $1", [id])).rows[0]!.n;
  assert.equal(protokoll, '1', 'das Öffnen der Akte steht im Protokoll');
  const patientSeite = await seite(`/patienten/${id}`);
  assert.match(patientSeite, /2 von 2/);
  // Maßnahmen liegen verschlüsselt
  const roh = (await db.query<{ m: Uint8Array }>('SELECT massnahmen AS m FROM behandlung LIMIT 1')).rows[0]!.m;
  assert.ok(!Buffer.from(roh).toString('latin1').includes('Schulter'));
});

test('Kachelfarbe: gelb bei überfälliger Rechnung, rot nach Mahnung', async () => {
  const einfuegen = (faellig: string, gemahnt: string | null) => db.query(
    "INSERT INTO rechnung (patient_id, art, steuerklasse, empfaenger, datum, faellig_am, betrag, status, gemahnt_am) VALUES ($1, 'einzel', 'heilbehandlung_steuerfrei', '{}', CURRENT_DATE - 30, $2::date, 50, 'gesendet', $3::date)",
    [id, faellig, gemahnt],
  );
  const gestern = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  await einfuegen(gestern, null);
  assert.match(await seite('/patienten'), /class="pat gelb"/);
  await einfuegen(gestern, gestern);
  assert.match(await seite('/patienten'), /class="pat rot"/);
  await db.query("UPDATE rechnung SET status = 'bezahlt' WHERE patient_id = $1", [id]);
  assert.match(await seite('/patienten'), /class="pat ok"/);
});

test('Archivieren statt löschen; Archiv und zurück', async () => {
  assert.match(ziel(await post({ aktion: 'stammdaten', id, vorname: 'Anna', nachname: 'Test', aktion_x: '', ansprache: 'Pronomen sie/ihr' })), /Stammdaten gespeichert/);
  assert.match(await seite('/patienten'), /Pronomen sie\/ihr/);
  await post({ aktion: 'archivieren', id });
  assert.doesNotMatch(await seite('/patienten'), /Anna Test/);
  assert.match(await seite('/patienten/archiv'), /Anna Test/);
  await post({ aktion: 'reaktivieren', id });
  assert.match(await seite('/patienten'), /Anna Test/);
  assert.equal((await fetch(`${basis}/patienten/999`, { headers: wer })).status, 404);
});

test('Testdaten: nur einmal, erfundene Adressen, verschiedene Kachelzustände', async () => {
  const pg = new PGlite();
  const db2 = { query: (q, v) => pg.query(q, v), exec: (s) => pg.exec(s) } as Db;
  await migriere(db2);
  const e = await testdatenAnlegen(db2, t, { adresse: 'shopping@2late.de', wer: 'test' });
  assert.equal(e.patienten, 10);
  assert.ok(e.behandlungen > 10 && e.termine > 5 && e.rechnungen > 8);
  assert.ok((await testdatenAnlegen(db2, t, { adresse: 'shopping@2late.de', wer: 'test' })).uebersprungen);
  const mails = (await db2.query<{ normiert: string }>("SELECT normiert FROM patient_kontakt WHERE art = 'email'")).rows.map((r) => r.normiert);
  assert.ok(mails.every((m) => /^shopping\+[a-z]+@2late\.de$/.test(m)), mails.join(','));
  const tel = (await db2.query<{ normiert: string }>("SELECT normiert FROM patient_kontakt WHERE art IN ('mobil','telefon','whatsapp')")).rows.map((r) => r.normiert);
  assert.ok(tel.every((n) => n.startsWith('+493023125')), 'nur Nummern aus dem Fernsehblock');
  const d = karteiDienst({ db: db2, tresor: t });
  const liste = await d.liste({});
  assert.deepEqual([...new Set(liste.map((p) => p.rechnungsstand))].sort(), ['gelb', 'ok', 'rot']);
  assert.ok(liste.some((p) => p.offeneAnrufe === 1));
  assert.ok(liste.some((p) => p.naechsterTermin?.rezept) && liste.some((p) => p.letzteBehandlung));
});
