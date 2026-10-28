/** Freie Tage (A26/W111): Feiertage als Daten (Import mit Rückfall), Brückentage, Schließtage, Wochenende, Vorschläge und Konfigurationsseite */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { freieSlots, oeffnungszeitenLesen } from '../src/anfragen/slots.ts';
import type { Db } from '../src/db/index.ts';
import { karteiDienst } from '../src/kartei/dienst.ts';
import { brueckentageBerechnen, brueckentageSetzen, feiertageImportieren, feiertageSicherstellen, freierTagLoeschen, freierTagSperren, freieTageListe, freieTageZeitraum, gesperrteTage, schliesstageAnlegen } from '../src/kartei/freie-tage.ts';
import { einstellungen } from '../src/kartei/konfiguration.ts';
import { praxisDienst } from '../src/server.ts';
import { neuerHauptschluessel, tresor } from '../src/tresor.ts';
import { datumBerlin } from '../src/zeit.ts';
import { testDb } from './testdb.ts';

const kaputt = (async () => { throw new Error('offline'); }) as typeof fetch;

test('Import: feiertage-api.de wird gelesen; fällt sie aus, rechnet der eigene Rechner; Sperren von Hand bleiben', async () => {
  const db = await testDb();
  const abruf = (async () => Response.json({ Neujahrstag: { datum: '2027-01-01', hinweis: '' }, 'Heilige Drei Könige': { datum: '2027-01-06', hinweis: '' }, 'Buß- und Bettag': { datum: '2027-11-17', hinweis: '' }, Quatsch: { datum: 'x' } })) as typeof fetch;
  assert.deepEqual(await feiertageImportieren(db, 2027, 'x', { abruf }), { jahr: 2027, anzahl: 3, quelle: 'feiertage-api.de' });
  assert.deepEqual((await freieTageListe(db, 2027)).map((t) => [t.datum, t.gesperrt]), [['2027-01-01', true], ['2027-01-06', true], ['2027-11-17', false]], 'Buß- und Bettag steht drin, aber offen');
  assert.deepEqual(await feiertageImportieren(db, 2026, 'x', { abruf: kaputt }), { jahr: 2026, anzahl: 13, quelle: 'Rechner' });
  const liste = await freieTageListe(db, 2026);
  assert.equal(liste.length, 13);
  assert.deepEqual([liste[0]!.datum, liste[0]!.name, liste[0]!.art, liste[0]!.gesperrt, liste[0]!.quelle], ['2026-01-01', 'Neujahr', 'feiertag', true, 'Rechner']);
  await freierTagSperren(db, '2026-08-15', false, 'x');
  await feiertageImportieren(db, 2026, 'x', { abruf: kaputt });
  assert.equal((await freieTageListe(db, 2026)).find((t) => t.datum === '2026-08-15')!.gesperrt, false, 'erneuter Import überschreibt die Freigabe nicht');
  assert.deepEqual(await feiertageSicherstellen(db, { abruf: kaputt }), [], '2026 und 2027 sind da');
  await assert.rejects(feiertageImportieren(db, 1999, 'x', { abruf: kaputt }), /Jahr/);
});

test('Brückentage 2026, Auswahl, Schließtage, Löschen, gesperrte Tage und Vorschläge', async () => {
  const db = await testDb();
  await feiertageImportieren(db, 2026, 'x', { abruf: kaputt });
  const b = await brueckentageBerechnen(db, 2026);
  assert.deepEqual(b.map((x) => [x.datum, x.wegen, x.gesperrt]), [['2026-01-02', 'Neujahr', false], ['2026-01-05', 'Heilige Drei Könige', false], ['2026-05-15', 'Christi Himmelfahrt', false], ['2026-06-05', 'Fronleichnam', false]]);
  assert.deepEqual(await brueckentageSetzen(db, 2026, ['2026-05-15', '2026-06-05', '2026-13-99'], 'x'), { gesperrt: 2 });
  assert.deepEqual((await brueckentageBerechnen(db, 2026)).filter((x) => x.gesperrt).map((x) => x.datum), ['2026-05-15', '2026-06-05']);
  await brueckentageSetzen(db, 2026, ['2026-05-15'], 'x');
  assert.deepEqual((await freieTageListe(db, 2026)).filter((t) => t.art === 'brueckentag').map((t) => t.datum), ['2026-05-15'], 'nicht angehakte werden entfernt');
  assert.deepEqual(await schliesstageAnlegen(db, { von: '2026-08-10', bis: '2026-08-16', name: 'Sommerurlaub', art: 'urlaub' }, 'x'), { tage: 7 });
  const aug = (await freieTageListe(db, 2026)).filter((t) => t.datum >= '2026-08-10' && t.datum <= '2026-08-16');
  assert.equal(aug.length, 7);
  assert.deepEqual([aug.find((t) => t.datum === '2026-08-15')!.art, aug.find((t) => t.datum === '2026-08-15')!.gesperrt], ['feiertag', true], 'Feiertag bleibt Feiertag, Urlaub sperrt ihn wieder');
  assert.equal(aug.find((t) => t.datum === '2026-08-11')!.name, 'Sommerurlaub');
  await assert.rejects(schliesstageAnlegen(db, { von: '2026-09-01', bis: '2026-08-01', art: 'urlaub' }, 'x'), /Bis/);
  await assert.rejects(schliesstageAnlegen(db, { von: '2026-09-01', bis: '2026-12-31', art: 'urlaub' }, 'x'), /60 Tage/);
  await assert.rejects(freierTagLoeschen(db, '2026-08-15', 'x'), /Feiertage werden nicht gelöscht/);
  await freierTagLoeschen(db, '2026-08-10', 'x');
  const gesperrt = await gesperrteTage(db, '2026-08-01', '2026-08-31');
  assert.deepEqual([...gesperrt].sort(), ['2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16']);
  assert.deepEqual(await freieTageZeitraum(db, '2026-05-14', '2026-05-15'), { '2026-05-14': 'Christi Himmelfahrt', '2026-05-15': 'Brückentag (Christi Himmelfahrt)' });
  // Vorschläge: gesperrte Tage und Wochenenden fallen weg – auch mit einem Samstagsfenster
  const regeln = { oeffnungszeiten: oeffnungszeitenLesen('Mo 08:00-10:00; Sa 08:00-10:00'), dauerMin: 30, pufferMin: 0, gesperrt, wochenendeGesperrt: true };
  const slots = freieSlots({ ab: '2026-08-10T00:00:00Z', tage: 7, belegt: [], regeln });
  assert.ok(slots.length > 0 && slots.every((s) => datumBerlin(s.beginn) === '2026-08-10'), 'nur der freigegebene Montag');
  const offen = freieSlots({ ab: '2026-08-17T00:00:00Z', tage: 7, belegt: [], regeln: { ...regeln, wochenendeGesperrt: false } });
  assert.deepEqual([...new Set(offen.map((s) => datumBerlin(s.beginn)))], ['2026-08-17', '2026-08-22'], 'Wochenende offen → Samstagsfenster zählt');
});

// ── Konfigurationsseite und Aktionen ────────────────────────────────────────
let basis = '';
let db: Db;
let server: ReturnType<typeof praxisDienst>;
const t = tresor({ PRAXIS_TRESOR_SCHLUESSEL: neuerHauptschluessel() });
const wer = { 'Tailscale-User-Login': 'lilli@example.org' };
const post = (felder: [string, string][]) => fetch(`${basis}/patienten/aktion`, { method: 'POST', redirect: 'manual', headers: { ...wer, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(felder).toString() });
const ziel = (r: Response) => decodeURIComponent(r.headers.get('location') ?? '');
const seite = async (pfad: string) => (await fetch(`${basis}${pfad}`, { headers: wer })).text();

before(async () => {
  db = await testDb();
  server = praxisDienst({ erlaubt: ['lilli@example.org'], fassung: 't', angemeldet: async () => true, pruefen: async () => [], kartei: karteiDienst({ db, tresor: t, abruf: kaputt }) });
  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

test('Konfigurationsseite: Feiertage laden, Liste, Brückentage mit Haken, Wochenende, Schließtage; Kalender zeigt den Tag', async () => {
  let html = await seite('/konfiguration?jahr=2026');
  assert.match(html, /<h2 id="freie-tage">Kalender: freie Tage<\/h2>/);
  assert.match(html, /Noch keine freien Tage für 2026/);
  let r = await post([['aktion', 'feiertage_importieren'], ['jahr', '2026'], ['zurueck', '/konfiguration?jahr=2026']]);
  assert.match(ziel(r), /\/konfiguration\?jahr=2026\?meldung=13 Feiertage 2026 eingetragen \(Quelle: Rechner\)\.#freie-tage|\/konfiguration\?jahr=2026&meldung=13 Feiertage 2026 eingetragen \(Quelle: Rechner\)\.#freie-tage/);
  html = await seite('/konfiguration?jahr=2026');
  assert.match(html, /<td>So 01\.11\.2026<\/td><td>Allerheiligen<\/td><td>Feiertag<\/td>/);
  assert.match(html, /name="tag" value="2026-01-02" data-hilfe="konfiguration.brueckentag"/);
  assert.match(html, /name="wert_gesperrt" value="1" checked/, 'Wochenende vorbelegt gesperrt');
  r = await post([['aktion', 'brueckentage_setzen'], ['jahr', '2026'], ['tag', '2026-01-02'], ['zurueck', '/konfiguration?jahr=2026']]);
  assert.match(ziel(r), /meldung=1 Brückentag 2026 gesperrt\./);
  html = await seite('/konfiguration?jahr=2026');
  assert.match(html, /name="tag" value="2026-01-02" checked/);
  assert.match(html, /<td>Fr 02\.01\.2026<\/td><td>Brückentag \(Neujahr\)<\/td><td>Brückentag<\/td>/);
  r = await post([['aktion', 'einstellung'], ['schluessel', 'kalender_wochenende'], ['zurueck', '/konfiguration?jahr=2026']]);
  assert.match(ziel(r), /meldung=Einstellung gespeichert\./);
  assert.equal((await einstellungen(db)).kalender_wochenende, 'offen');
  r = await post([['aktion', 'schliesstage_anlegen'], ['von', '2026-12-24'], ['bis', '2026-12-31'], ['name', 'Weihnachten'], ['art', 'geschlossen'], ['zurueck', '/konfiguration?jahr=2026']]);
  assert.match(ziel(r), /meldung=8 Schließtage eingetragen\./);
  r = await post([['aktion', 'freier_tag_loeschen'], ['datum', '2026-12-24'], ['zurueck', '/konfiguration?jahr=2026']]);
  assert.match(ziel(r), /meldung=Tag entfernt\./);
  r = await post([['aktion', 'freier_tag_sperren'], ['datum', '2026-12-26'], ['gesperrt', 'nein'], ['zurueck', '/konfiguration?jahr=2026']]);
  assert.match(ziel(r), /meldung=Tag freigegeben/);
  html = await seite('/konfiguration?jahr=2026');
  assert.match(html, /<tr class="offen">\s*<td>Sa 26\.12\.2026<\/td>/);
  assert.doesNotMatch(html, /24\.12\.2026/);
  // Kalenderseite zeigt den freien Tag
  const kal = await seite('/kalender?tag=2026-12-25');
  assert.match(kal, /<span class="chip preset12" data-hilfe="kalender.frei" tabindex="0">1\. Weihnachtstag<\/span>/);
  assert.match(await seite('/kalender?tag=2026-12-26'), /2\. Weihnachtstag \(offen\)/);
});
