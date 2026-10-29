/** Buchungsseite (W96): Angebot, öffentlicher Buchungsdienst, Abgleich mit dem Manager */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { anfrageLesen, anfragenListe } from '../src/anfragen/anfragen.ts';
import { angebotPruefen, anfangszeiten, buchungPruefen, freieFenster, passt, sperren, type Angebot, type Buchung } from '../src/buchung/angebot.ts';
import { angebotErstellen, buchungAbgleich } from '../src/buchung/abgleich.ts';
import { buchungsClient } from '../src/buchung/client.ts';
import { buchungsdienst } from '../src/buchung/dienst.ts';
import type { Db } from '../src/db/index.ts';
import { einstellungSetzen } from '../src/kartei/konfiguration.ts';
import { patientAnlegen, terminAnlegen } from '../src/kartei/patienten.ts';
import { terminartAktiv, terminarten } from '../src/kartei/terminarten.ts';
import { neuerHauptschluessel, tresor } from '../src/tresor.ts';
import { graphAttrappe } from './attrappe.ts';
import { testDb } from './testdb.ts';

const ANGEBOT: Angebot = {
  erstellt: '2026-10-26T10:00:00.000Z', praxis: 'Praxis Test', hinweis: 'Hallo', rasterMin: 15,
  terminarten: [{ code: 'P4', sektion: 'rezept', kurz: 'Krankengymnastik (KG)', lang: 'Bewegung', dauerMin: 30 }, { code: 'W1', sektion: 'wellness', kurz: 'Abhyanga', lang: null, dauerMin: 90 }],
  tage: [{ datum: '2026-11-02', fenster: [{ beginn: '2026-11-02T07:00:00.000Z', ende: '2026-11-02T09:00:00.000Z' }] }, { datum: '2026-11-03', fenster: [{ beginn: '2026-11-03T07:00:00.000Z', ende: '2026-11-03T08:00:00.000Z' }] }],
};

test('Angebot: freie Fenster, Anfangszeiten, passt, sperren, prüfen', () => {
  const frei = freieFenster([{ beginn: '2026-11-02T07:00:00Z', ende: '2026-11-02T11:00:00Z' }], [{ beginn: '2026-11-02T08:00:00Z', ende: '2026-11-02T08:30:00Z' }, { beginn: '2026-11-02T10:30:00Z', ende: '2026-11-02T12:00:00Z' }], { pufferMin: 10, ab: '2026-11-02T07:20:00Z' });
  // Pause (W116a): vor jedem Block bleibt die Pause des neuen Termins frei; die Pause des Blocks steckt schon in dessen Ende
  assert.deepEqual(frei, [{ beginn: '2026-11-02T07:20:00.000Z', ende: '2026-11-02T07:50:00.000Z' }, { beginn: '2026-11-02T08:30:00.000Z', ende: '2026-11-02T10:20:00.000Z' }]);
  assert.deepEqual(anfangszeiten(frei, 30, 15).map((z) => z.slice(11, 16)), ['08:30', '08:45', '09:00', '09:15', '09:30', '09:45']);
  assert.ok(passt(ANGEBOT, '2026-11-02T08:30:00.000Z', 30));
  assert.ok(!passt(ANGEBOT, '2026-11-02T08:45:00.000Z', 30), 'ragt über das Fenster');
  assert.ok(!passt(ANGEBOT, '2026-11-02T08:05:00.000Z', 30), 'außerhalb des Rasters');
  assert.ok(!passt(ANGEBOT, '2026-11-03T07:00:00.000Z', 90), 'Fenster zu kurz für 90 Minuten');
  const g = sperren(ANGEBOT, '2026-11-02T07:30:00.000Z', 30);
  assert.deepEqual(g.tage[0]!.fenster, [{ beginn: '2026-11-02T07:00:00.000Z', ende: '2026-11-02T07:30:00.000Z' }, { beginn: '2026-11-02T08:00:00.000Z', ende: '2026-11-02T09:00:00.000Z' }]);
  assert.equal(angebotPruefen(JSON.parse(JSON.stringify(ANGEBOT))).terminarten.length, 2);
  assert.throws(() => angebotPruefen({ erstellt: 'x' }), /Zeitstempel/);
  assert.throws(() => angebotPruefen({ ...ANGEBOT, terminarten: [{ code: 'X9', kurz: 'x', dauerMin: 30, sektion: 'rezept' }] }), /unvollständig/);
  const b = buchungPruefen({ terminart: 'P4', beginn: '2026-11-02T07:00:00Z', name: 'Anna Test', telefon: '0151 1234567', email: 'A@Example.org', nachricht: 'x', einwilligung: true }, ANGEBOT);
  assert.deepEqual([b.dauerMin, b.email, b.beginn], [30, 'a@example.org', '2026-11-02T07:00:00.000Z']);
  assert.throws(() => buchungPruefen({ terminart: 'P4', beginn: '2026-11-02T07:00:00Z', name: 'Anna', telefon: '0151 1234567', einwilligung: true }, ANGEBOT), /Vor- und Nachname/);
  assert.throws(() => buchungPruefen({ terminart: 'P4', beginn: '2026-11-02T07:00:00Z', name: 'Anna Test', telefon: '12', einwilligung: true }, ANGEBOT), /Telefonnummer/);
  assert.throws(() => buchungPruefen({ terminart: 'P4', beginn: '2026-11-02T07:00:00Z', name: 'Anna Test', telefon: '0151 1234567', einwilligung: false }, ANGEBOT), /zustimmen/);
  assert.throws(() => buchungPruefen({ terminart: 'P9', beginn: '2026-11-02T07:00:00Z', name: 'Anna Test', telefon: '0151 1234567', einwilligung: true }, ANGEBOT), /Terminart/);
});

// ── Buchungsdienst über HTTP ──────────────────────────────────────────────────
let basis = '';
let dienst: ReturnType<typeof buchungsdienst>;
before(async () => {
  dienst = buchungsdienst({ schluessel: 'geheim', praxis: 'Praxis Test', datenschutzUrl: 'https://example.org/datenschutz', mindestDauerMs: 1000, hoechstensJeStunde: 6 });
  await new Promise<void>((f) => dienst.listen(0, '127.0.0.1', f));
  basis = `http://127.0.0.1:${(dienst.address() as AddressInfo).port}`;
});
after(() => dienst.close());
const mitSchluessel = { 'X-Buchung-Schluessel': 'geheim', 'Content-Type': 'application/json' };
const buchen = (daten: Record<string, unknown>, kopf: Record<string, string> = {}) => fetch(`${basis}/api/buchung`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...kopf }, body: JSON.stringify({ dauerMs: 5000, ...daten }) });

test('Buchungsdienst: Seite, Angebot nur mit Schlüssel, Buchung mit Prüfung, Honigtopf, Doppelbuchung, Abholen', async () => {
  const seite = await (await fetch(`${basis}/`)).text();
  assert.match(seite, /<title>Termin anfragen – Praxis Test<\/title>/);
  assert.match(seite, /api\/angebot/);
  assert.doesNotMatch(seite, /frame-ancestors/);
  assert.match((await fetch(`${basis}/einbetten.js`)).headers.get('content-type') ?? '', /javascript/);
  assert.equal((await fetch(`${basis}/api/angebot`)).status, 200, 'leeres Angebot ist erlaubt');
  assert.equal((await fetch(`${basis}/api/angebot`, { method: 'PUT', body: JSON.stringify(ANGEBOT) })).status, 403, 'ohne Schlüssel');
  const r = await fetch(`${basis}/api/angebot`, { method: 'PUT', headers: mitSchluessel, body: JSON.stringify(ANGEBOT) });
  assert.deepEqual(await r.json(), { ok: true, terminarten: 2, tage: 2 });
  const a = (await (await fetch(`${basis}/api/angebot`)).json()) as Angebot;
  assert.equal(a.terminarten[0]!.kurz, 'Krankengymnastik (KG)');
  assert.equal((await buchen({ terminart: 'P4', beginn: '2026-11-02T07:00:00Z', name: 'Anna Test', telefon: '0151 1234567', einwilligung: true, website: 'spam' })).status, 400, 'Honigtopf');
  assert.equal((await buchen({ terminart: 'P4', beginn: '2026-11-02T07:00:00Z', name: 'Anna Test', telefon: '0151 1234567', einwilligung: true, dauerMs: 10 })).status, 400, 'zu schnell abgeschickt');
  const ok = await buchen({ terminart: 'P4', beginn: '2026-11-02T07:00:00Z', name: 'Anna Test', telefon: '0151 1234567', email: 'anna@example.org', nachricht: 'Bitte vormittags', einwilligung: true });
  assert.equal(ok.status, 200);
  const doppelt = await buchen({ terminart: 'P4', beginn: '2026-11-02T07:15:00Z', name: 'Bernd Beispiel', telefon: '0170 1234567', einwilligung: true });
  assert.equal(doppelt.status, 400, 'überschneidet die erste Buchung');
  assert.match(((await doppelt.json()) as { fehler: string }).fehler, /nicht mehr frei/);
  const nach = (await (await fetch(`${basis}/api/angebot`)).json()) as Angebot;
  assert.equal(nach.tage[0]!.fenster[0]!.beginn, '2026-11-02T07:30:00.000Z', 'gebuchte Zeit ist aus dem Angebot');
  const liste = (await (await fetch(`${basis}/api/buchungen?ab=0`, { headers: mitSchluessel })).json()) as { buchungen: Buchung[] };
  assert.equal(liste.buchungen.length, 1);
  assert.deepEqual([liste.buchungen[0]!.nr, liste.buchungen[0]!.name, liste.buchungen[0]!.dauerMin], [1, 'Anna Test', 30]);
  // Neues Angebot vom Manager: die noch nicht abgeholte Buchung bleibt gesperrt
  await fetch(`${basis}/api/angebot`, { method: 'PUT', headers: mitSchluessel, body: JSON.stringify(ANGEBOT) });
  assert.equal(((await (await fetch(`${basis}/api/angebot`)).json()) as Angebot).tage[0]!.fenster[0]!.beginn, '2026-11-02T07:30:00.000Z');
  await fetch(`${basis}/api/buchungen/abgeholt`, { method: 'POST', headers: mitSchluessel, body: JSON.stringify({ bis: 1 }) });
  assert.equal(((await (await fetch(`${basis}/api/buchungen?ab=0`, { headers: mitSchluessel })).json()) as { buchungen: Buchung[] }).buchungen.length, 0);
  // Drosselung je Adresse
  let letzter = 200;
  for (let i = 0; i < 4; i++) letzter = (await buchen({ terminart: 'W1', beginn: '2026-11-02T07:30:00Z', name: 'Spam Bot', telefon: '0', einwilligung: true })).status;
  assert.equal(letzter, 429);
});

// ── Abgleich mit dem Manager ──────────────────────────────────────────────────
test('Abgleich: Angebot aus Terminarten, Öffnungszeiten, Kartei und Kalender; Buchung wird Anfrage mit reserviertem Wunschtermin', async () => {
  const db: Db = await testDb();
  const t = tresor({ PRAXIS_TRESOR_SCHLUESSEL: neuerHauptschluessel() });
  const alle = await terminarten(db);
  await terminartAktiv(db, alle.find((x) => x.code === 'P4')!.id, true, 'x');
  await terminartAktiv(db, alle.find((x) => x.code === 'W1')!.id, true, 'x');
  await einstellungSetzen(db, 'oeffnungszeiten', 'Mo 08:00-10:00; Di 08:00-12:00', 'x');
  await einstellungSetzen(db, 'termin_puffer_min', '0', 'x');
  await einstellungSetzen(db, 'buchung_tage', '7', 'x');
  const pid = await patientAnlegen(db, t, { vorname: 'Anna', nachname: 'Test', kontakte: [{ art: 'mobil', wert: '0151 1234567' }] }, 'x');
  await terminAnlegen(db, pid, { datum: '2026-11-02', zeit: '08:00', dauerMin: 30 }, 'x');
  const graph = { ...graphAttrappe({ seiten: { '/me/calendar/calendarView': [{ id: 'e1', start: { dateTime: '2026-11-03T07:00:00.0000000' }, end: { dateTime: '2026-11-03T08:00:00.0000000' }, showAs: 'busy' }] } }), delete: async () => {} };
  const jetzt = new Date('2026-10-30T10:00:00Z');
  const angebot = await angebotErstellen(db, graph, { jetzt });
  assert.deepEqual(angebot.terminarten.map((x) => x.code), ['P4', 'W1']);
  assert.deepEqual(angebot.tage.map((x) => x.datum), ['2026-11-02', '2026-11-03'], 'Mo und Di in den nächsten 7 Tagen; Sa/So/Feiertag Allerheiligen 1.11. nicht');
  assert.deepEqual(angebot.tage[0]!.fenster, [{ beginn: '2026-11-02T07:30:00.000Z', ende: '2026-11-02T09:00:00.000Z' }], 'Montag: Kartei-Termin 08:00–08:30 Berlin raus');
  assert.deepEqual(angebot.tage[1]!.fenster, [{ beginn: '2026-11-03T08:00:00.000Z', ende: '2026-11-03T11:00:00.000Z' }], 'Dienstag: Kalender 08:00–09:00 Berlin raus');
  // Buchungsdienst-Attrappe als Client
  const buchungen: Buchung[] = [{ id: 'b1', nr: 7, eingegangen: '2026-10-30T11:00:00Z', terminart: 'W1', beginn: '2026-11-03T08:30:00.000Z', dauerMin: 90, name: 'Anna Test', telefon: '0151 1234567', email: 'anna@example.org', nachricht: 'Gern mit Öl', einwilligung: true }];
  let geschoben: Angebot | undefined;
  let abgeholtBis = 0;
  const client = { angebotSenden: async (a: Angebot) => { geschoben = a; return { terminarten: a.terminarten.length, tage: a.tage.length }; }, buchungenAbholen: async (ab: number) => buchungen.filter((b) => b.nr > ab), abgeholt: async (bis: number) => { abgeholtBis = bis; } };
  const b = await buchungAbgleich(db, t, graph, client, { jetzt });
  assert.deepEqual([b.buchungen, b.neu, b.bekannt, b.fehler, abgeholtBis], [1, 1, 0, 0, 7]);
  const a = (await anfragenListe(db, t, { filter: 'offen' }))[0]!;
  assert.deepEqual([a.quelle, a.status, a.patient?.id, a.terminart?.code, a.dauerMin], ['buchung', 'neu', pid, 'W1', 90]);
  assert.deepEqual(a.vorschlaege.map((v) => [v.beginn, v.ende, Boolean(v.exchangeEventId)]), [['2026-11-03T08:30:00.000Z', '2026-11-03T10:00:00.000Z', true]], 'Wunsch reserviert');
  assert.match(a.text!, /Gebucht über die Website: W1 – Abhyanga.*Di\., 03\.11\.2026, 09:30 Uhr \(90 Minuten\)/);
  assert.match(a.text!, /Gern mit Öl/);
  assert.deepEqual(a.erkannt, { daten: ['2026-11-03'], uhrzeiten: ['09:30'] });
  assert.ok(geschoben, 'Angebot nach den Buchungen geschoben');
  assert.deepEqual(geschoben!.tage.find((x) => x.datum === '2026-11-03')!.fenster, [{ beginn: '2026-11-03T08:00:00.000Z', ende: '2026-11-03T08:30:00.000Z' }, { beginn: '2026-11-03T10:00:00.000Z', ende: '2026-11-03T11:00:00.000Z' }], 'die Reservierung der Buchung ist jetzt belegt');
  const nochmal = await buchungAbgleich(db, t, graph, client, { jetzt });
  assert.deepEqual([nochmal.buchungen, nochmal.neu], [0, 0], 'letzte Nummer gemerkt');
  buchungen.push({ ...buchungen[0]!, id: 'b1', nr: 8 });
  assert.deepEqual([(await buchungAbgleich(db, t, graph, client, { jetzt })).bekannt], [1], 'gleiche Kennung = Dublette');
  assert.equal((await anfrageLesen(db, t, a.id))!.terminart?.kurz, 'Abhyanga – Ganzkörper-Ölmassage');
});
