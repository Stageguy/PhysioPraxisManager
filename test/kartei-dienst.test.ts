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

test('Rezeptarten: Folgerezept, Korrektur (Haken zählen weiter, kein neues Kontingent), Zweitschrift, Abbruch', async () => {
  const p = await post({ aktion: 'anlegen', vorname: 'Rita', nachname: 'Rezept' });
  const rid = /\/patienten\/(\d+)/.exec(ziel(p))![1]!;
  await post({ aktion: 'verordnung_anlegen', id: rid, ausgestellt_am: '2026-09-01', massnahme: 'KG', anzahl: '3', art: 'erst', langzeit: '1' });
  const erst = (await db.query<{ id: string }>('SELECT id::text FROM verordnung WHERE patient_id = $1', [rid])).rows[0]!.id;
  // Folgerezept braucht den Vorgänger
  assert.match(ziel(await post({ aktion: 'verordnung_anlegen', id: rid, ausgestellt_am: '2026-10-01', massnahme: 'KG', anzahl: '6', art: 'folge_unveraendert' })), /fehler=.*vorherige Rezept/);
  // Zwei Behandlungen auf dem Erstrezept, dann Korrektur mit 4 statt 3
  await post({ aktion: 'behandlung_erfassen', id: rid, fall_id: 'neu', grundlage: 'verordnung', datum: '2026-09-05', verordnung_id: erst, massnahmen: 'KG 1' });
  const fall = (await db.query<{ id: string }>('SELECT id::text FROM behandlungsfall WHERE patient_id = $1', [rid])).rows[0]!.id;
  await post({ aktion: 'behandlung_erfassen', id: rid, fall_id: fall, datum: '2026-09-08', verordnung_id: erst, massnahmen: 'KG 2' });
  assert.match(ziel(await post({ aktion: 'verordnung_anlegen', id: rid, ausgestellt_am: '2026-09-09', massnahme: 'KG', anzahl: '4', art: 'korrektur', vorgaenger_id: erst })), /Korrektur angelegt/);
  const korr = (await db.query<{ id: string; status: string }>("SELECT id::text, status::text FROM verordnung WHERE patient_id = $1 AND art = 'korrektur'", [rid])).rows[0]!;
  assert.equal((await db.query<{ s: string }>('SELECT status::text AS s FROM verordnung WHERE id = $1', [erst])).rows[0]!.s, 'ersetzt');
  let html = await seite(`/patienten/${rid}`);
  assert.match(html, /2 von 4/, 'die Korrektur zählt die beiden Haken des Originals mit');
  assert.match(html, /ersetzt \(korrigiert\)/);
  // Das ersetzte Rezept nimmt keine Haken mehr; die Korrektur schon – bis 4
  assert.match(ziel(await post({ aktion: 'behandlung_erfassen', id: rid, fall_id: fall, datum: '2026-09-12', verordnung_id: erst, massnahmen: 'x' })), /fehler=.*korrigiert/);
  await post({ aktion: 'behandlung_erfassen', id: rid, fall_id: fall, datum: '2026-09-12', verordnung_id: korr.id, massnahmen: 'KG 3' });
  await post({ aktion: 'behandlung_erfassen', id: rid, fall_id: fall, datum: '2026-09-15', verordnung_id: korr.id, massnahmen: 'KG 4' });
  assert.equal((await db.query<{ s: string }>('SELECT status::text AS s FROM verordnung WHERE id = $1', [korr.id])).rows[0]!.s, 'abgeschlossen');
  // Folgerezept unverändert, mit Zweitschrift und Abbruch
  await post({ aktion: 'verordnung_anlegen', id: rid, ausgestellt_am: '2026-10-01', massnahme: 'KG', anzahl: '6', art: 'folge_unveraendert', vorgaenger_id: korr.id });
  const folge = (await db.query<{ id: string; fall_id: string }>("SELECT id::text, fall_id::text FROM verordnung WHERE patient_id = $1 AND art = 'folge_unveraendert'", [rid])).rows[0]!;
  assert.equal(folge.fall_id, fall, 'das Folgerezept übernimmt den Fall des Vorgängers');
  assert.match(ziel(await post({ aktion: 'zweitschrift', id: rid, verordnung_id: folge.id, datum: '2026-10-03' })), /Zweitschrift vermerkt/);
  assert.match(ziel(await post({ aktion: 'verordnung_abbrechen', id: rid, verordnung_id: folge.id, grund: '' })), /fehler=.*Grund/);
  await post({ aktion: 'verordnung_abbrechen', id: rid, verordnung_id: folge.id, grund: 'Patientin verzogen' });
  html = await seite('/rezepte?filter=alle');
  assert.match(html, /Zweitschrift 03\.10\.2026/);
  assert.match(html, /abgebrochen/);
  assert.match(html, /Langzeitbehandlung/);
  assert.match(html, /Rita Rezept/);
  assert.doesNotMatch(await seite('/rezepte'), /Rita Rezept/, 'nur aktive: nichts mehr aktiv');
});

test('Wellness-Katalog und Serien ohne Rezept: Behandlung übernimmt Leistung und Preis (19 %)', async () => {
  const p = await post({ aktion: 'anlegen', vorname: 'Willi', nachname: 'Wellness' });
  const wid = /\/patienten\/(\d+)/.exec(ziel(p))![1]!;
  assert.match(ziel(await post({ aktion: 'serie_anlegen', id: wid, grundlage: 'praevention' })), /fehler=.*Wellness-Katalog/);
  assert.match(ziel(await post({ aktion: 'wellness_speichern', code: 'w', bezeichnung: 'x', preis: '1' })), /fehler=.*Kürzel/);
  assert.match(ziel(await post({ aktion: 'wellness_speichern', code: 'wm60', bezeichnung: 'Wellnessmassage 60 Minuten', dauer_min: '60', preis: '65,00' })), /rezepte\/wellness\?meldung=/);
  const w = (await db.query<{ id: string; code: string }>('SELECT id::text, code FROM wellness_leistung')).rows[0]!;
  assert.equal(w.code, 'WM60');
  assert.match(ziel(await post({ aktion: 'serie_anlegen', id: wid, grundlage: 'praevention', wellness_id: w.id })), /Wellness-Serie angelegt/);
  const fall = (await db.query<{ id: string; steuerklasse: string }>('SELECT id::text, steuerklasse::text FROM behandlungsfall WHERE patient_id = $1', [wid])).rows[0]!;
  assert.equal(fall.steuerklasse, 'wellness_19');
  await post({ aktion: 'behandlung_erfassen', id: wid, fall_id: fall.id, datum: '2026-10-20', massnahmen: 'Wellnessmassage' });
  const l = (await db.query<{ nummer: string; einzelpreis: string; steuerklasse: string }>('SELECT bl.nummer, bl.einzelpreis::text, bl.steuerklasse::text FROM behandlung_leistung bl JOIN behandlung b ON b.id = bl.behandlung_id WHERE b.fall_id = $1', [fall.id])).rows[0]!;
  assert.deepEqual(l, { nummer: 'WM60', einzelpreis: '65.00', steuerklasse: 'wellness_19' });
  let html = await seite(`/patienten/${wid}`);
  assert.match(html, /Wellness · 19 % USt/);
  assert.match(html, /Wellnessmassage 60 Minuten · 65,00/);
  // Direktzugang braucht eine Bezeichnung; dann abschließen
  await post({ aktion: 'serie_anlegen', id: wid, grundlage: 'direktzugang', bezeichnung: 'Nacken' });
  html = await seite('/rezepte');
  assert.match(html, /Direktzugang · Heilpraktikererlaubnis/);
  const dz = (await db.query<{ id: string }>("SELECT id::text FROM behandlungsfall WHERE patient_id = $1 AND grundlage = 'direktzugang'", [wid])).rows[0]!.id;
  assert.match(ziel(await post({ aktion: 'serie_abschliessen', id: wid, fall_id: dz })), /Serie abgeschlossen/);
  assert.doesNotMatch(await seite('/rezepte'), /Nacken/);
  assert.match(await seite('/rezepte?filter=alle'), /Nacken/);
  // Katalog ausblenden: Leistung verschwindet aus der Auswahl
  await post({ aktion: 'wellness_aktiv', wellness_id: w.id, aktiv: '0' });
  assert.doesNotMatch(await seite(`/patienten/${wid}/neu/wellness`), /option value="1">Wellnessmassage/);
  assert.match(await seite('/rezepte/wellness'), /anbieten/);
});

test('Pinnwand: Karte wandert nur mit vollständigen Daten; Drag & Drop antwortet als JSON; zurück nur mit Grund', async () => {
  const p = await post({ aktion: 'anlegen', vorname: 'Paula', nachname: 'Pinnwand', geburtsdatum: '1990-01-01', mobil: '0151 999', strasse: 'Weg', hausnummer: '1', plz: '86825', ort: 'Bad Wörishofen' });
  const pid = /\/patienten\/(\d+)/.exec(ziel(p))![1]!;
  assert.match(ziel(await post({ aktion: 'fall_anlegen', id: pid, grundlage: 'verordnung', bezeichnung: 'Knie' })), /\/faelle\/\d+\?meldung=Fall angelegt/);
  const fall = (await db.query<{ id: string; phase: string }>('SELECT id::text, phase::text FROM behandlungsfall WHERE patient_id = $1', [pid])).rows[0]!;
  assert.equal(fall.phase, 'anfrage');
  let html = await seite('/pinnwand');
  assert.match(html, /Paula Pinnwand/);
  assert.match(html, /class="pinnwand horizontal"/);
  assert.match(await seite('/pinnwand?ansicht=vertikal'), /class="pinnwand vertikal"/);
  // Drag & Drop: nach Aufnahme ohne Termin → JSON mit Fehler
  const dnd = (felder: Record<string, string>) => fetch(`${basis}/patienten/aktion`, { method: 'POST', headers: { ...wer, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams(felder).toString() }).then((r) => r.json() as Promise<{ ok: boolean; fehler?: string; meldung?: string }>);
  let a = await dnd({ aktion: 'phase', id: pid, fall_id: fall.id, nach: 'aufnahme' });
  assert.equal(a.ok, false);
  assert.match(a.fehler!, /bestätigter Termin/);
  await post({ aktion: 'termin_anlegen', id: pid, datum: '2099-02-02', zeit: '10:00', dauer_min: '30' });
  a = await dnd({ aktion: 'phase', id: pid, fall_id: fall.id, nach: 'aufnahme' });
  assert.equal(a.ok, true, a.fehler);
  // Zwei Schritte auf einmal: Anamnese braucht Einwilligung, Datenschutzinfo und Rezept
  a = await dnd({ aktion: 'phase', id: pid, fall_id: fall.id, nach: 'anamnese' });
  assert.match(a.fehler!, /Behandlungseinwilligung/);
  assert.match(a.fehler!, /Datenschutzinformation/);
  assert.match(a.fehler!, /Rezept am Fall/);
  await post({ aktion: 'erklaerung_erfassen', id: pid, fall_id: fall.id, art: 'behandlungseinwilligung', form: 'schriftlich' });
  await post({ aktion: 'erklaerung_erfassen', id: pid, art: 'datenschutzinformation', form: 'schriftlich', fassung: '2026-01' });
  await post({ aktion: 'verordnung_anlegen', id: pid, ausgestellt_am: '2026-10-01', massnahme: 'KG', anzahl: '2', fall_id: fall.id });
  a = await dnd({ aktion: 'phase', id: pid, fall_id: fall.id, nach: 'anamnese' });
  assert.equal(a.ok, true, a.fehler);
  // Anamnese erfassen rückt automatisch nach Befund; Eingangsbefund nach Behandlung
  assert.match(ziel(await post({ aktion: 'anamnese_erfassen', id: pid, fall_id: fall.id, beschwerden: 'Knie schmerzt beim Treppensteigen', medikamente: 'keine' })), /Anamnese gespeichert/);
  assert.equal((await db.query<{ p: string }>('SELECT phase::text AS p FROM behandlungsfall WHERE id = $1', [fall.id])).rows[0]!.p, 'befund_start');
  await post({ aktion: 'befund_erfassen', id: pid, fall_id: fall.id, art: 'eingang', text: 'Flexion 100°, Erguss', messwerte: 'NRS 5' });
  assert.equal((await db.query<{ p: string }>('SELECT phase::text AS p FROM behandlungsfall WHERE id = $1', [fall.id])).rows[0]!.p, 'behandlung');
  // Abschluss erst, wenn das Rezept abgehakt ist
  a = await dnd({ aktion: 'phase', id: pid, fall_id: fall.id, nach: 'abschluss' });
  assert.match(a.fehler!, /Behandlung|abgehakt/);
  const rezept = (await db.query<{ id: string }>('SELECT id::text FROM verordnung WHERE patient_id = $1', [pid])).rows[0]!.id;
  await post({ aktion: 'behandlung_erfassen', id: pid, fall_id: fall.id, datum: '2026-10-20', verordnung_id: rezept, massnahmen: 'KG 1' });
  await post({ aktion: 'behandlung_erfassen', id: pid, fall_id: fall.id, datum: '2026-10-22', verordnung_id: rezept, massnahmen: 'KG 2' });
  a = await dnd({ aktion: 'phase', id: pid, fall_id: fall.id, nach: 'abschluss' });
  assert.equal(a.ok, true, a.fehler);
  // Rechnung braucht den Abschlussbefund – der rückt dann automatisch
  a = await dnd({ aktion: 'phase', id: pid, fall_id: fall.id, nach: 'rechnung' });
  assert.match(a.fehler!, /Abschlussbefund/);
  await post({ aktion: 'befund_erfassen', id: pid, fall_id: fall.id, art: 'abschluss', text: 'Beschwerdefrei' });
  assert.equal((await db.query<{ p: string }>('SELECT phase::text AS p FROM behandlungsfall WHERE id = $1', [fall.id])).rows[0]!.p, 'rechnung');
  // Zurück nur mit Grund; dann Nachsorge und Archiv (keine offene Rechnung)
  a = await dnd({ aktion: 'phase', id: pid, fall_id: fall.id, nach: 'behandlung' });
  assert.match(a.fehler!, /Grund/);
  a = await dnd({ aktion: 'phase', id: pid, fall_id: fall.id, nach: 'behandlung', grund: 'Patient kommt doch noch einmal' });
  assert.equal(a.ok, true);
  // Der Rezept-Entwurf (W79) zählt als offene Rechnung – erst erledigen, dann Archiv
  a = await dnd({ aktion: 'phase', id: pid, fall_id: fall.id, nach: 'archiviert' });
  assert.match(a.fehler!, /offene Rechnung/);
  const entwurf = (await db.query<{ id: string }>('SELECT id::text FROM rechnung WHERE verordnung_id = $1', [rezept])).rows[0]!.id;
  await post({ aktion: 'rechnung_status', id: pid, rechnung_id: entwurf, status_aktion: 'storno', grund: 'Testfall' });
  a = await dnd({ aktion: 'phase', id: pid, fall_id: fall.id, nach: 'archiviert' });
  assert.equal(a.ok, true, a.fehler);
  const f2 = (await db.query<{ p: string; ab: Date | null; bis: Date | null }>('SELECT phase::text AS p, abgeschlossen_am AS ab, aufbewahren_bis AS bis FROM behandlungsfall WHERE id = $1', [fall.id])).rows[0]!;
  assert.equal(f2.p, 'archiviert');
  assert.ok(f2.ab && f2.bis);
  html = await seite(`/patienten/${pid}/faelle/${fall.id}`);
  assert.match(html, /Knie schmerzt beim Treppensteigen/);
  assert.match(html, /Beschwerdefrei/);
  assert.match(html, /Patient kommt doch noch einmal/);
  assert.match(html, /automatisch: Eingangsbefund erfasst/);
  assert.doesNotMatch(await seite('/pinnwand'), /Paula Pinnwand/, 'archiviert ist ausgeblendet');
  assert.match(await seite('/pinnwand?archiv=1'), /Paula Pinnwand/);
  // Wellness überspringt Anamnese, Befund und Abschluss
  await post({ aktion: 'wellness_speichern', code: 'WM30', bezeichnung: 'Wellnessmassage 30', preis: '42' });
  const w = (await db.query<{ id: string }>("SELECT id::text FROM wellness_leistung WHERE code = 'WM30'")).rows[0]!.id;
  await post({ aktion: 'fall_anlegen', id: pid, grundlage: 'praevention', wellness_id: w });
  const wf = (await db.query<{ id: string }>("SELECT id::text FROM behandlungsfall WHERE patient_id = $1 AND grundlage = 'praevention'", [pid])).rows[0]!.id;
  a = await dnd({ aktion: 'phase', id: pid, fall_id: wf, nach: 'behandlung' });
  assert.equal(a.ok, true, a.fehler);
});

test('Rechnungsentwürfe: Rezept legt Entwurf mit Positionen und R1 an; Preisliste des Patienten; Behandlung füllt die Position', async () => {
  // Aktive Preisliste mit einer Position 21201 zu 50 €
  const pl = (await db.query<{ id: string }>("INSERT INTO preisliste (name, status, aktiv) VALUES ('Privat Test', 'freigegeben', true) RETURNING id::text")).rows[0]!.id;
  await db.query("INSERT INTO preisliste_position (preisliste_id, reihenfolge, nummer, bezeichnung, gkv_preis, eigener_preis, uebernehmen) VALUES ($1, 1, '21201', 'Manuelle Therapie', 35.59, 50, true)", [pl]);
  const p = await post({ aktion: 'anlegen', vorname: 'Rita', nachname: 'Rechnung', strasse: 'Weg', hausnummer: '2', plz: '86825', ort: 'Bad Wörishofen' });
  const pid = /\/patienten\/(\d+)/.exec(ziel(p))![1]!;
  assert.equal((await db.query<{ p: string }>('SELECT preisliste_id::text AS p FROM patient WHERE id = $1', [pid])).rows[0]!.p, pl, 'neuer Patient bekommt die aktive Preisliste');
  await post({ aktion: 'termin_anlegen', id: pid, datum: '2099-03-02', zeit: '08:00', dauer_min: '30' });
  await post({ aktion: 'verordnung_anlegen', id: pid, ausgestellt_am: '2026-10-01', massnahme: 'Manuelle Therapie', leistung_nummer: '21201', anzahl: '3' });
  const rezept = (await db.query<{ id: string }>('SELECT id::text FROM verordnung WHERE patient_id = $1', [pid])).rows[0]!.id;
  const re = (await db.query<{ id: string; status: string; betrag: string; steuerklasse: string }>('SELECT id::text, status::text, betrag::text, steuerklasse::text FROM rechnung WHERE verordnung_id = $1', [rezept])).rows[0]!;
  assert.equal(re.status, 'entwurf');
  assert.equal(re.betrag, '150.00', '3 × 50 € aus der Preisliste des Patienten');
  assert.equal(re.steuerklasse, 'heilbehandlung_steuerfrei');
  const bausteine = (await db.query<{ code: string }>('SELECT code FROM rechnung_textbaustein WHERE rechnung_id = $1 ORDER BY reihenfolge', [re.id])).rows.map((b) => b.code);
  assert.deepEqual(bausteine, ['R1'], 'Heilbehandlung bekommt § 4 Nr. 14 automatisch');
  let html = await seite(`/patienten/${pid}/rechnungen/${re.id}`);
  assert.match(html, /Entwurf/);
  assert.match(html, /keine Umsatzsteuer/);
  assert.match(html, /Steuerfrei – Heilbehandlung/);
  assert.equal((html.match(/class="rp"/g) ?? []).length, 3, 'drei Positionen');
  // Behandlung mit Rezept hängt sich an die erste offene Position
  await post({ aktion: 'behandlung_erfassen', id: pid, fall_id: 'neu', grundlage: 'verordnung', datum: '2026-10-20', verordnung_id: rezept, massnahmen: 'MT', leistung_nummer: '21201' });
  const pos = (await db.query<{ datum: Date; bl: string | null }>('SELECT datum, behandlung_leistung_id::text AS bl FROM rechnung_position WHERE rechnung_id = $1 ORDER BY reihenfolge', [re.id])).rows;
  assert.ok(pos[0]!.bl, 'erste Position ist jetzt behandelt');
  assert.equal(new Date(pos[0]!.datum).toISOString().slice(0, 10), '2026-10-20');
  // Positionen bearbeiten: + ✎ −
  assert.match(ziel(await post({ aktion: 'rechnung_position_hinzufuegen', id: pid, rechnung_id: re.id, nummer: '21201', anzahl: '2', datum: '2026-10-22' })), /Position hinzugefügt/);
  assert.equal((await db.query<{ b: string }>('SELECT betrag::text AS b FROM rechnung WHERE id = $1', [re.id])).rows[0]!.b, '250.00');
  const letzte = (await db.query<{ id: string }>('SELECT id::text FROM rechnung_position WHERE rechnung_id = $1 ORDER BY reihenfolge DESC LIMIT 1', [re.id])).rows[0]!.id;
  await post({ aktion: 'rechnung_position_aendern', id: pid, rechnung_id: re.id, position_id: letzte, bezeichnung: 'MT lang', anzahl: '1', einzelpreis: '60,00', datum: '2026-10-22' });
  assert.equal((await db.query<{ b: string }>('SELECT betrag::text AS b FROM rechnung WHERE id = $1', [re.id])).rows[0]!.b, '210.00');
  await post({ aktion: 'rechnung_position_loeschen', id: pid, rechnung_id: re.id, position_id: letzte });
  assert.equal((await db.query<{ b: string }>('SELECT betrag::text AS b FROM rechnung WHERE id = $1', [re.id])).rows[0]!.b, '150.00');
  assert.match(ziel(await post({ aktion: 'rechnung_position_hinzufuegen', id: pid, rechnung_id: re.id, nummer: '99999' })), /fehler=.*nicht in der Preisliste/);
  // Textbaustein § 19 gehört nicht auf Heilbehandlung
  const r2 = (await db.query<{ id: string }>("SELECT id::text FROM textbaustein WHERE code = 'R2'")).rows[0]!.id;
  assert.match(ziel(await post({ aktion: 'rechnung_baustein_hinzufuegen', id: pid, rechnung_id: re.id, textbaustein_id: r2 })), /fehler=.*Wellness/);
  const r3 = (await db.query<{ id: string }>("SELECT id::text FROM textbaustein WHERE code = 'R3'")).rows[0]!.id;
  await post({ aktion: 'rechnung_baustein_hinzufuegen', id: pid, rechnung_id: re.id, textbaustein_id: r3 });
  html = await seite(`/patienten/${pid}/rechnungen/${re.id}`);
  assert.match(html, /Vielen Dank/);
  // Status: fertig → Nummer → versendet → bezahlt; zurück nur vor Lexware
  assert.match(ziel(await post({ aktion: 'rechnung_status', id: pid, rechnung_id: re.id, status_aktion: 'fertig' })), /Fertig/);
  assert.match(ziel(await post({ aktion: 'rechnung_position_loeschen', id: pid, rechnung_id: re.id, position_id: letzte })), /fehler=.*Entwurf/);
  await post({ aktion: 'rechnung_status', id: pid, rechnung_id: re.id, status_aktion: 'zurueck' });
  assert.equal((await db.query<{ s: string }>('SELECT status::text AS s FROM rechnung WHERE id = $1', [re.id])).rows[0]!.s, 'entwurf');
  await post({ aktion: 'rechnung_status', id: pid, rechnung_id: re.id, status_aktion: 'fertig' });
  assert.match(ziel(await post({ aktion: 'rechnung_status', id: pid, rechnung_id: re.id, status_aktion: 'in_lexware', nummer: 'RE-2026-0042' })), /RE-2026-0042/);
  assert.match(ziel(await post({ aktion: 'rechnung_status', id: pid, rechnung_id: re.id, status_aktion: 'zurueck' })), /fehler=/);
  assert.match(ziel(await post({ aktion: 'rechnung_status', id: pid, rechnung_id: re.id, status_aktion: 'versendet', versand_art: 'post' })), /per Post/);
  html = await seite(`/patienten/${pid}`);
  assert.match(html, /RE-2026-0042/);
  assert.match(html, /Versendet/);
  await post({ aktion: 'rechnung_status', id: pid, rechnung_id: re.id, status_aktion: 'bezahlt' });
  assert.equal((await db.query<{ s: string }>('SELECT status::text AS s FROM rechnung WHERE id = $1', [re.id])).rows[0]!.s, 'bezahlt');
  assert.match(ziel(await post({ aktion: 'rechnung_status', id: pid, rechnung_id: re.id, status_aktion: 'storno', grund: 'x' })), /fehler=.*bezahlte/);
});

test('Wellness-Rechnung: Kleinunternehmer → R2 und keine USt; ohne Kleinunternehmer 19 %; Gruppen nie gemischt; Lexware-Abweichung', async () => {
  const { lexwareStandUebernehmen } = await import('../src/kartei/rechnungen.ts');
  const p = await post({ aktion: 'anlegen', vorname: 'Willi', nachname: 'Wellnessrechnung' });
  const pid = /\/patienten\/(\d+)/.exec(ziel(p))![1]!;
  await post({ aktion: 'wellness_speichern', code: 'HOT50', bezeichnung: 'Hot Stone 50', preis: '79' });
  const w = (await db.query<{ id: string }>("SELECT id::text FROM wellness_leistung WHERE code = 'HOT50'")).rows[0]!.id;
  await post({ aktion: 'serie_anlegen', id: pid, grundlage: 'praevention', wellness_id: w });
  let re = (await db.query<{ id: string; betrag: string; ust: string; ku: boolean }>("SELECT id::text, betrag::text, ust::text, kleinunternehmer AS ku FROM rechnung WHERE patient_id = $1 AND steuerklasse = 'wellness_19'", [pid])).rows[0]!;
  assert.equal(re.betrag, '79.00');
  assert.equal(re.ust, '0.00', 'Kleinunternehmer: keine USt');
  assert.ok(re.ku);
  assert.deepEqual((await db.query<{ code: string }>('SELECT code FROM rechnung_textbaustein WHERE rechnung_id = $1', [re.id])).rows.map((b) => b.code), ['R2']);
  // § 19-Baustein entfernen → 19 % werden gerechnet
  const b = (await db.query<{ id: string }>('SELECT id::text FROM rechnung_textbaustein WHERE rechnung_id = $1', [re.id])).rows[0]!.id;
  await post({ aktion: 'rechnung_baustein_entfernen', id: pid, rechnung_id: re.id, baustein_id: b });
  re = (await db.query<{ id: string; betrag: string; ust: string; ku: boolean }>('SELECT id::text, betrag::text, ust::text, kleinunternehmer AS ku FROM rechnung WHERE id = $1', [re.id])).rows[0]!;
  assert.equal(re.betrag, '79.00');
  assert.equal(re.ust, '12.61', '79 brutto bei 19 % → 12,61 USt');
  // Heilbehandlungs-Nummer auf eine Wellness-Rechnung geht nicht
  assert.match(ziel(await post({ aktion: 'rechnung_position_hinzufuegen', id: pid, rechnung_id: re.id, nummer: '21201' })), /fehler=.*Wellness-Katalog/);
  // Konfiguration: Kleinunternehmer aus → neue Wellness-Rechnung ohne R2, mit USt
  assert.match(ziel(await post({ aktion: 'einstellung', schluessel: 'kleinunternehmer' })), /konfiguration\?meldung=/);
  await post({ aktion: 'rechnung_neu', id: pid, steuerklasse: 'wellness_19' });
  const neu = (await db.query<{ id: string }>("SELECT id::text FROM rechnung WHERE patient_id = $1 AND steuerklasse = 'wellness_19' ORDER BY id DESC LIMIT 1", [pid])).rows[0]!.id;
  assert.equal((await db.query<{ n: string }>('SELECT count(*)::text AS n FROM rechnung_textbaustein WHERE rechnung_id = $1', [neu])).rows[0]!.n, '0');
  await post({ aktion: 'rechnung_position_hinzufuegen', id: pid, rechnung_id: neu, wellness_id: w });
  assert.equal((await db.query<{ u: string }>('SELECT ust::text AS u FROM rechnung WHERE id = $1', [neu])).rows[0]!.u, '12.61');
  await post({ aktion: 'einstellung', schluessel: 'kleinunternehmer', wert_ja: '1' });
  // Konfiguration: Textbaustein anlegen → nächste Kennung R4
  assert.match(ziel(await post({ aktion: 'textbaustein_speichern', kurzname: 'Hinweis Termin', text: 'Bitte Termine 24 h vorher absagen.' })), /Textbaustein gespeichert/);
  assert.match(await seite('/konfiguration'), /R4/);
  // Lexware meldet: storniert → hier storniert + Abweichung; anderer Betrag → Abweichung
  await post({ aktion: 'rechnung_status', id: pid, rechnung_id: re.id, status_aktion: 'fertig' });
  await lexwareStandUebernehmen(db, re.id, { invoiceId: 'lx-1', nummer: 'RE-7', status: 'open', betrag: 80 }, 'abgleich');
  let r = (await db.query<{ s: string; a: string | null; n: string }>('SELECT status::text AS s, lexware_abweichung AS a, nummer AS n FROM rechnung WHERE id = $1', [re.id])).rows[0]!;
  assert.equal(r.s, 'in_lexware');
  assert.equal(r.n, 'RE-7');
  assert.match(r.a!, /80,00 € statt 79,00 €/);
  await lexwareStandUebernehmen(db, re.id, { status: 'voided', betrag: 79 }, 'abgleich');
  r = (await db.query<{ s: string; a: string | null; n: string }>('SELECT status::text AS s, lexware_abweichung AS a, nummer AS n FROM rechnung WHERE id = $1', [re.id])).rows[0]!;
  assert.equal(r.s, 'storniert');
  assert.match(await seite(`/patienten/${pid}`), /Storniert/);
  // Kalenderseite zeigt Termine der Woche
  await post({ aktion: 'termin_anlegen', id: pid, datum: '2099-03-04', zeit: '09:00', dauer_min: '60' });
  const kal = await seite('/kalender?tag=2099-03-02&ansicht=woche');
  assert.match(kal, /W\. W\./);
  assert.match(kal, /09:00–10:00/);
  assert.match(await seite('/kalender?tag=2099-03-04&namen=1'), /Willi Wellnessrechnung/);
});
