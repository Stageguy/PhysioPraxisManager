/** Termine zum Rezept (W110): Frequenz, Regelbehandlungszeiten, Serie im Muster, Seite, Anlegen, Rezeptkachel, Konfiguration */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { oeffnungszeitenLesen, wochentag } from '../src/anfragen/slots.ts';
import type { Db } from '../src/db/index.ts';
import { karteiDienst } from '../src/kartei/dienst.ts';
import { einstellungSetzen } from '../src/kartei/konfiguration.ts';
import { verordnungAnlegen, verordnungen } from '../src/kartei/patienten.ts';
import { aufFuenf, dauerFuer, regelzeitLesen, regelzeiten, regelzeitenSicherstellen, regelzeitenUebernehmen, regelzeitSetzen } from '../src/kartei/regelzeiten.ts';
import { proWocheAusFrequenz, serieVorschlagen, terminWerte } from '../src/kartei/rezept-termine.ts';
import { praxisDienst } from '../src/server.ts';
import { neuerHauptschluessel, tresor } from '../src/tresor.ts';
import { berlinMitternachtUtc, datumBerlin, heuteBerlin, tagPlus, zeitBerlin } from '../src/zeit.ts';
import { testDb } from './testdb.ts';

test('Frequenz des Rezepts → Behandlungen je Woche', () => {
  const faelle = ['2× pro Woche', '3 x wöchentlich', '1/Woche', 'zweimal die Woche', 'täglich', 'alle 2 Wochen', '1–2× pro Woche', '10 x pro Woche', '', 'nach Bedarf'];
  assert.deepEqual(faelle.map((f) => proWocheAusFrequenz(f)), [2, 3, 1, 2, 5, 1, 2, 5, 2, 2]);
  assert.equal(proWocheAusFrequenz('nach Bedarf', 0), 0, 'Vorgabe 0 meldet „nicht erkannt“');
});

test('Regelbehandlungszeit lesen und auf 5 Minuten runden', () => {
  assert.deepEqual(regelzeitLesen('Regelbehandlungszeit 15–25 Minuten'), { vonMin: 15, bisMin: 25 });
  assert.deepEqual(regelzeitLesen('30 Minuten'), { vonMin: null, bisMin: 30 });
  assert.equal(regelzeitLesen(null), null);
  assert.equal(regelzeitLesen('ohne Angabe'), null);
  assert.deepEqual([25, 23, 0, 61].map(aufFuenf), [25, 25, 5, 65]);
});

test('Serie: gleiche Wochentage und Uhrzeiten; belegte Zeit weicht auf dieselbe Tageszeit aus; gesperrter Tag verschiebt das Muster', () => {
  const regeln = { oeffnungszeiten: oeffnungszeitenLesen('Mo 08:00-12:00; Di 08:00-12:00; Mi 08:00-12:00; Do 08:00-12:00; Fr 08:00-12:00'), dauerMin: 30, pufferMin: 0, wochenendeGesperrt: true };
  const ab = berlinMitternachtUtc('2026-11-02'); // ein Montag
  const belegt = [{ beginn: '2026-11-09T07:00:00.000Z', ende: '2026-11-09T07:30:00.000Z' }]; // Montag der 2. Woche, 08:00 Berlin
  const text = (s: { beginn: string }) => `${datumBerlin(s.beginn)} ${zeitBerlin(s.beginn)}`;
  const serie = serieVorschlagen({ anzahl: 6, proWoche: 2, dauerMin: 25, ab, belegt, regeln });
  assert.deepEqual(serie.map(text), ['2026-11-02 08:00', '2026-11-05 08:00', '2026-11-09 08:30', '2026-11-12 08:00', '2026-11-16 08:00', '2026-11-19 08:00']);
  assert.equal(new Date(serie[0]!.ende).getTime() - new Date(serie[0]!.beginn).getTime(), 25 * 60_000, 'Dauer aus der Regelzeit');
  assert.deepEqual(serieVorschlagen({ anzahl: 3, proWoche: 3, dauerMin: 30, ab, belegt: [], regeln }).map(text), ['2026-11-02 08:00', '2026-11-04 08:00', '2026-11-06 08:00']);
  assert.deepEqual(serieVorschlagen({ anzahl: 4, proWoche: 2, dauerMin: 25, ab, belegt, regeln: { ...regeln, gesperrt: new Set(['2026-11-05']) } }).map(text),
    ['2026-11-02 08:00', '2026-11-06 08:00', '2026-11-09 08:30', '2026-11-13 08:00'], 'Donnerstag gesperrt → Freitag wird zum Muster');
  // Beginn mitten in der Woche: das Muster entsteht über die Wochengrenze (Do, dann Mo) – nicht Do + Fr
  assert.deepEqual(serieVorschlagen({ anzahl: 5, proWoche: 2, dauerMin: 25, ab: berlinMitternachtUtc('2026-11-05'), belegt, regeln }).map(text),
    ['2026-11-05 08:00', '2026-11-09 08:30', '2026-11-12 08:00', '2026-11-16 08:30', '2026-11-19 08:00'], 'der erste freie Montag (08:30) prägt die Montagszeit');
  // Nur zwei Öffnungstage, 3× pro Woche: beide Tage, mehr geht nicht
  const kurz = { ...regeln, oeffnungszeiten: oeffnungszeitenLesen('Mo 08:00-12:00; Di 08:00-12:00') };
  assert.deepEqual(serieVorschlagen({ anzahl: 4, proWoche: 3, dauerMin: 30, ab, belegt: [], regeln: kurz }).map(text), ['2026-11-02 08:00', '2026-11-03 08:00', '2026-11-09 08:00', '2026-11-10 08:00']);
  const lang = { ...regeln, oeffnungszeiten: oeffnungszeitenLesen('Mo 08:00-18:00; Di 08:00-18:00') };
  assert.deepEqual(serieVorschlagen({ anzahl: 2, proWoche: 1, dauerMin: 30, ab, belegt: [], regeln: lang, tageszeit: 'nachmittag' }).map(text), ['2026-11-02 12:00', '2026-11-09 12:00']);
  assert.deepEqual(serieVorschlagen({ anzahl: 0, proWoche: 2, dauerMin: 30, ab, belegt: [], regeln }), []);
});

test('Formularwerte: doppelte raus, Vergangenheit und Unsinn abgelehnt', () => {
  const morgen = tagPlus(heuteBerlin(), 1);
  assert.deepEqual(terminWerte([`${morgen}T08:00`, '', `${morgen}T08:00`, `${morgen}T09:15`], 25), [{ datum: morgen, zeit: '08:00', dauerMin: 25 }, { datum: morgen, zeit: '09:15', dauerMin: 25 }]);
  assert.throws(() => terminWerte([], 25), /Kein Termin/);
  assert.throws(() => terminWerte(['2000-01-01T08:00'], 25), /Vergangenheit/);
  assert.throws(() => terminWerte(['morgen früh'], 25), /Unbekannter Termin/);
  assert.throws(() => terminWerte([`${morgen}T08:00`], 0), /Dauer/);
});

let basis = '';
let db: Db;
let server: ReturnType<typeof praxisDienst>;
const t = tresor({ PRAXIS_TRESOR_SCHLUESSEL: neuerHauptschluessel() });
const wer = { 'Tailscale-User-Login': 'lilli@example.org' };
const post = (felder: Record<string, string>, mehrfach: [string, string][] = []) => {
  const body = new URLSearchParams(felder);
  for (const [k, v] of mehrfach) body.append(k, v);
  return fetch(`${basis}/patienten/aktion`, { method: 'POST', redirect: 'manual', headers: { ...wer, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
};
const ziel = (r: Response) => decodeURIComponent(r.headers.get('location') ?? '');
const seite = async (pfad: string) => (await fetch(`${basis}${pfad}`, { headers: wer })).text();

before(async () => {
  db = await testDb();
  server = praxisDienst({ erlaubt: ['lilli@example.org'], fassung: 't', angemeldet: async () => true, pruefen: async () => [], kartei: karteiDienst({ db, tresor: t }) });
  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await einstellungSetzen(db, 'oeffnungszeiten', 'Mo 08:00-12:00; Di 08:00-12:00; Mi 08:00-12:00; Do 08:00-12:00; Fr 08:00-12:00', 'x');
  // GKV-Vergütungsliste mit Regelbehandlungszeiten (so, wie der Leser sie ablegt)
  const q = (await db.query<{ id: string }>("INSERT INTO preisquelle (art, titel, version, sha256) VALUES ('gkv', 'GKV', 'Lesefassung 2026', 'abc') RETURNING id::text")).rows[0]!.id;
  await db.query(
    `INSERT INTO preisquelle_position (quelle_id, reihenfolge, nummer, bezeichnung, regelzeit, preis) VALUES
     ($1, 1, '20501', 'Krankengymnastik', 'Regelbehandlungszeit 15–25 Minuten', 27.17), ($1, 2, '21201', 'Manuelle Therapie', '15–25 Minuten', 35.59), ($1, 3, '20710', 'Elektrotherapie', NULL, 7)`, [q],
  );
});
after(() => server.close());

test('Übernehmen aus der GKV-Liste, Dauer je Leistung, Handwerte bleiben', async () => {
  assert.equal(await regelzeitenSicherstellen(db), 2);
  assert.equal(await regelzeitenSicherstellen(db), 0, 'nur beim ersten Mal');
  assert.deepEqual((await regelzeiten(db)).map((r) => [r.nummer, r.vonMin, r.bisMin, r.quelle]), [['20501', 15, 25, 'gkv'], ['21201', 15, 25, 'gkv']]);
  assert.deepEqual(await dauerFuer(db, '20501', 30), { dauerMin: 25, herkunft: 'Regelbehandlungszeit 15–25 Min. (Krankengymnastik, Position 20501)' });
  assert.deepEqual(await dauerFuer(db, '99999', 30), { dauerMin: 30, herkunft: 'Vorgabe aus der Konfiguration (keine Regelbehandlungszeit zur Leistung hinterlegt)' });
  assert.equal((await dauerFuer(db, null, 23)).dauerMin, 25, 'Vorgabe wird auf 5 Minuten gerundet');
  await regelzeitSetzen(db, { nummer: '21201', vonMin: 20, bisMin: 30 }, 'x');
  assert.deepEqual(await regelzeitenUebernehmen(db, 'x'), { uebernommen: 1, vorhanden: 2 }, 'der Handwert bleibt');
  assert.deepEqual((await regelzeiten(db)).map((r) => [r.nummer, r.bisMin, r.quelle]), [['20501', 25, 'gkv'], ['21201', 30, 'hand']]);
  await assert.rejects(regelzeitSetzen(db, { nummer: '21201', vonMin: 40, bisMin: 30 }, 'x'), /kleiner/);
  await assert.rejects(regelzeitSetzen(db, { nummer: 'x', bisMin: 30 }, 'x'), /Leistungsnummer/);
  await assert.rejects(regelzeitSetzen(db, { nummer: '20501', bisMin: 0 }, 'x'), /zwischen 1 und 240/);
});

let pid = '';
let vid = '';
test('Seite: Vorschläge nach Rezept (6 Behandlungen, 2× pro Woche, 25 Minuten); drei anlegen; Kachel zählt geplante; Rest anlegen', async () => {
  pid = /\/patienten\/(\d+)/.exec(ziel(await post({ aktion: 'anlegen', vorname: 'Tina', nachname: 'Termin' })))![1]!;
  vid = await verordnungAnlegen(db, t, pid, { ausgestelltAm: '2026-10-01', massnahme: 'Krankengymnastik', leistungNummer: '20501', anzahl: 6, frequenz: '2× pro Woche' }, 'x');
  const pfad = `/patienten/${pid}/rezepte/${vid}/termine`;
  const html = await seite(pfad);
  assert.match(html, /<h1>[\s\S]*Termine zum Rezept/);
  assert.match(html, /6 verordnet · 0 erledigt · 0 geplant · <b>6 offen<\/b>/);
  assert.match(html, /Dauer: <b>25 Min\.<\/b> – Regelbehandlungszeit 15–25 Min\. \(Krankengymnastik, Position 20501\)/);
  assert.match(html, /name="pro_woche"[^>]*>[\s\S]*?<option value="2" selected>/);
  const werte = [...html.matchAll(/name="termin" value="([^"]+)"/g)].map((m) => m[1]!);
  assert.equal(werte.length, 6);
  const tage = werte.map((w) => wochentag(w.slice(0, 10)));
  assert.deepEqual(tage.slice(2, 4), tage.slice(0, 2), 'Muster: dieselben Wochentage in der zweiten Woche');
  assert.ok(werte.every((w) => wochentag(w.slice(0, 10)) <= 5 && w.slice(11) >= '08:00' && w.slice(11) < '12:00'), werte.join(','));
  assert.ok(werte[0]! > `${heuteBerlin()}T`, 'frühestens morgen');

  const r = await post({ aktion: 'rezept_termine_anlegen', id: pid, verordnung_id: vid, dauer_min: '25', zurueck: pfad }, werte.slice(0, 3).map((w) => ['termin', w]));
  assert.match(ziel(r), new RegExp(`^/patienten/${pid}\\?meldung=3 Termine zum Rezept angelegt\\. Noch nicht im Kalender \\(kein Postfach verbunden\\)\\.#termine$`));
  const zeilen = await db.query<{ v: string; l: string; min: string }>(
    'SELECT verordnung_id::text AS v, leistung_nummer AS l, (extract(epoch FROM (ende - beginn)) / 60)::text AS min FROM termin WHERE patient_id = $1 ORDER BY beginn', [pid],
  );
  assert.deepEqual(zeilen.rows.map((x) => [x.v, x.l, Number(x.min)]), [[vid, '20501', 25], [vid, '20501', 25], [vid, '20501', 25]]);
  const v = (await verordnungen(db, { patientId: pid }))[0]!;
  assert.deepEqual([v.geplant, v.anzahlVerordnet - v.abgehakt - v.geplant], [3, 3]);
  const kachel = await seite(`/patienten/${pid}`);
  assert.match(kachel, /0 von 6 · 3 geplant/);
  assert.match(kachel, /Termine planen \(3 offen\)/);
  assert.ok(kachel.includes(`href="${pfad}" data-hilfe="rezept.termine"`));

  // Zweiter Aufruf: die drei Termine sind belegt, drei Vorschläge bleiben
  const html2 = await seite(pfad);
  assert.match(html2, /6 verordnet · 0 erledigt · 3 geplant · <b>3 offen<\/b>/);
  assert.match(html2, /data-hilfe="rezept-termine.geplant">Schon geplant: /);
  const werte2 = [...html2.matchAll(/name="termin" value="([^"]+)"/g)].map((m) => m[1]!);
  assert.equal(werte2.length, 3);
  assert.ok(werte2.every((w) => !werte.slice(0, 3).includes(w)), 'angelegte Termine werden nicht noch einmal vorgeschlagen');

  // Mehr als offen: abgelehnt
  const zuViel = await post({ aktion: 'rezept_termine_anlegen', id: pid, verordnung_id: vid, dauer_min: '25', zurueck: pfad }, [...werte2, werte[3]!].map((w) => ['termin', w]));
  assert.match(ziel(zuViel), /fehler=Auf dem Rezept sind nur noch 3 Behandlungen offen – 4 Termine gewählt/);
  assert.match(ziel(await post({ aktion: 'rezept_termine_anlegen', id: pid, verordnung_id: '999999', dauer_min: '25', zurueck: pfad }, [['termin', werte2[0]!]])), /fehler=Dieses Rezept gibt es nicht/);
  assert.equal((await fetch(`${basis}/patienten/${pid}/rezepte/999999/termine`, { headers: wer })).status, 404);

  // Vorgaben ändern: 3× pro Woche, 40 Minuten, vormittags, ab in zwei Wochen
  const ab = tagPlus(heuteBerlin(), 14);
  const html3 = await seite(`${pfad}?ab=${ab}&pro_woche=3&tageszeit=vormittag&dauer_min=40`);
  assert.match(html3, /<option value="3" selected>/);
  assert.match(html3, /<option value="vormittag" selected>/);
  assert.match(html3, /Dauer: <b>40 Min\.<\/b> – von Hand geändert/);
  const werte3 = [...html3.matchAll(/name="termin" value="([^"]+)"/g)].map((m) => m[1]!);
  assert.equal(werte3.length, 3);
  assert.ok(werte3.every((w) => w.slice(0, 10) >= ab), 'nicht vor dem gewählten Beginn');

  // Rest anlegen → nichts mehr offen, kein Knopf mehr auf der Kachel
  await post({ aktion: 'rezept_termine_anlegen', id: pid, verordnung_id: vid, dauer_min: '25', zurueck: pfad }, werte2.map((w) => ['termin', w]));
  assert.match(await seite(pfad), /Alle Behandlungen dieses Rezepts sind erledigt oder geplant\./);
  const kachel2 = await seite(`/patienten/${pid}`);
  assert.match(kachel2, /0 von 6 · 6 geplant/);
  assert.doesNotMatch(kachel2, /Termine planen/);
});

test('Neues Rezept führt direkt zu den Terminvorschlägen; Korrektur nicht', async () => {
  const r = await post({ aktion: 'verordnung_anlegen', id: pid, ausgestellt_am: '2026-10-20', massnahme: 'Manuelle Therapie', leistung_nummer: '21201', anzahl: '4', frequenz: '1× pro Woche' });
  assert.match(ziel(r), new RegExp(`^/patienten/${pid}/rezepte/\\d+/termine\\?meldung=Rezept angelegt – hier die Termine dazu planen\\.$`));
  const html = await seite(ziel(r).split('?')[0]!);
  assert.match(html, /Dauer: <b>30 Min\.<\/b> – Regelbehandlungszeit 20–30 Min\. \(Manuelle Therapie, Position 21201\)/);
  assert.match(html, /<option value="1" selected>/);
  assert.equal([...html.matchAll(/name="termin" value="/g)].length, 4);
  const neu = ziel(r).split('/')[4]!;
  const k = await post({ aktion: 'verordnung_anlegen', id: pid, ausgestellt_am: '2026-10-21', massnahme: 'Manuelle Therapie', leistung_nummer: '21201', anzahl: '4', art: 'korrektur', vorgaenger_id: neu });
  assert.match(ziel(k), new RegExp(`^/patienten/${pid}\\?meldung=Korrektur angelegt`));
});

test('Konfiguration: Tabelle der Regelzeiten, Speichern von Hand, Übernehmen', async () => {
  const html = await seite('/konfiguration');
  assert.match(html, /<h2 id="regelzeiten">Regelbehandlungszeiten<\/h2>/);
  assert.match(html, /<td>20501<\/td><td>Krankengymnastik<\/td>/);
  assert.match(html, /name="bis_min" value="30"/);
  const r = await post({ aktion: 'regelzeit_setzen', nummer: '20710', bezeichnung: 'Elektrotherapie', von_min: '', bis_min: '20', zurueck: '/konfiguration?jahr=2026' });
  assert.equal(ziel(r), '/konfiguration?meldung=Regelbehandlungszeit gespeichert.#regelzeiten');
  const e = (await regelzeiten(db)).find((x) => x.nummer === '20710')!;
  assert.deepEqual([e.bezeichnung, e.vonMin, e.bisMin, e.quelle], ['Elektrotherapie', null, 20, 'hand']);
  assert.match(ziel(await post({ aktion: 'regelzeit_setzen', nummer: '20710', bis_min: 'x', zurueck: '/konfiguration?jahr=2026' })), /fehler=Dauer in Minuten zwischen 1 und 240/);
  assert.equal(ziel(await post({ aktion: 'regelzeiten_uebernehmen', zurueck: '/konfiguration?jahr=2026' })), '/konfiguration?meldung=1 Regelbehandlungszeit übernommen (2 Positionen mit Angabe).#regelzeiten');
});
