/** Terminanfragen (A15, Prompt 6): Erkennung, Feiertage, freie Zeiten, Posteingang, Dienst mit Vorschlag und Bestätigung */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, afterEach, before, test } from 'node:test';
import { anfrageLesen, anfragenListe } from '../src/anfragen/anfragen.ts';
import { anfragenDienst } from '../src/anfragen/dienst.ts';
import { anfragenEingang } from '../src/anfragen/eingang.ts';
import { erkenneAnliegen, erkenneZeitwunsch, htmlZuText } from '../src/anfragen/erkennung.ts';
import { feiertageBayern, istFeiertag } from '../src/anfragen/feiertage.ts';
import { freieSlots, oeffnungszeitenLesen, oeffnungszeitenText, vorschlaege, wochentag } from '../src/anfragen/slots.ts';
import { cockpitDaten } from '../src/cockpit/daten.ts';
import type { Db } from '../src/db/index.ts';
import { karteiDienst } from '../src/kartei/dienst.ts';
import { patientAnlegen, terminAnlegen } from '../src/kartei/patienten.ts';
import { praxisDienst } from '../src/server.ts';
import { neuerHauptschluessel, tresor } from '../src/tresor.ts';
import { graphAttrappe } from './attrappe.ts';
import { testDb } from './testdb.ts';

test('Erkennung: Anliegen aus Schlüsselwörtern, Zeitwünsche aus Wochentagen, Tageszeiten, Daten, Uhrzeiten', () => {
  assert.equal(erkenneAnliegen('Termin', 'Hätten Sie nächste Woche etwas frei?'), 'termin');
  assert.equal(erkenneAnliegen('Re: Ihr Termin', 'ich muss den Termin leider verschieben'), 'verschieben');
  assert.equal(erkenneAnliegen('', 'Ich muss leider absagen, bin krank'), 'absagen');
  assert.equal(erkenneAnliegen('Rechnung', 'Danke für die Rechnung'), 'unklar');
  const z = erkenneZeitwunsch('Am besten dienstags oder Do vormittags, zum Beispiel am 3.11. um 9 Uhr oder 14:30. Nicht am 24.12.2026.', '2026-10-26');
  assert.deepEqual(z, { wochentage: [2, 4], tageszeiten: ['vormittag'], daten: ['2026-11-03', '2026-12-24'], uhrzeiten: ['09:00', '14:30'] });
  assert.deepEqual(erkenneZeitwunsch('am 5.1. bitte', '2026-10-26').daten, ['2027-01-05'], 'ohne Jahr: nächstes Jahr, wenn vorbei');
  assert.equal(htmlZuText('<p>Hallo &amp; <b>Termin</b></p><br><div>Danke</div><style>x{}</style>'), 'Hallo & Termin\n\nDanke');
});

test('Feiertage Bayern 2026 mit Ostern', () => {
  const f = feiertageBayern(2026);
  assert.equal(f.get('2026-04-03'), 'Karfreitag');
  assert.equal(f.get('2026-04-06'), 'Ostermontag');
  assert.equal(f.get('2026-05-14'), 'Christi Himmelfahrt');
  assert.equal(f.get('2026-06-04'), 'Fronleichnam');
  assert.equal(istFeiertag('2026-08-15'), 'Mariä Himmelfahrt');
  assert.equal(istFeiertag('2026-10-27'), undefined);
});

test('Öffnungszeiten lesen und schreiben', () => {
  const o = oeffnungszeitenLesen('Mo 08:00-12:00, 14:00-18:00; di 8:00-18:00');
  assert.deepEqual(o, [{ tag: 1, von: '08:00', bis: '12:00' }, { tag: 1, von: '14:00', bis: '18:00' }, { tag: 2, von: '08:00', bis: '18:00' }]);
  assert.equal(oeffnungszeitenText(o), 'Mo 08:00-12:00,14:00-18:00; Di 08:00-18:00');
  assert.throws(() => oeffnungszeitenLesen('Montag 8-9'), /Wochentag fehlt|Zeitfenster/);
  assert.throws(() => oeffnungszeitenLesen('Mo 18:00-08:00'), /Ende liegt vor/);
  assert.equal(wochentag('2026-10-26'), 1);
  assert.equal(wochentag('2026-11-01'), 7);
});

const REGELN = { oeffnungszeiten: oeffnungszeitenLesen('Mo 08:00-10:00; Di 08:00-09:00; Fr 08:00-09:00'), dauerMin: 30, pufferMin: 0 };

test('Freie Zeiten: Öffnungszeiten, Belegtes, Puffer, Feiertag, Zeitumstellung', () => {
  // Fr 23.10. (Sommerzeit) und Mo 26.10. (Winterzeit): 08:00 Berlin ist 06:00Z bzw. 07:00Z
  const s = freieSlots({ ab: '2026-10-23T00:00:00Z', tage: 4, belegt: [], regeln: REGELN });
  assert.deepEqual(s.map((x) => x.beginn), ['2026-10-23T06:00:00.000Z', '2026-10-23T06:15:00.000Z', '2026-10-23T06:30:00.000Z', '2026-10-26T07:00:00.000Z', '2026-10-26T07:15:00.000Z', '2026-10-26T07:30:00.000Z', '2026-10-26T07:45:00.000Z', '2026-10-26T08:00:00.000Z', '2026-10-26T08:15:00.000Z', '2026-10-26T08:30:00.000Z']);
  // Belegt 08:10–08:40 am Montag: erst wieder ab 08:45 (Raster), mit Puffer 10 ab 09:00
  const belegt = [{ beginn: '2026-10-26T07:10:00Z', ende: '2026-10-26T07:40:00Z' }];
  assert.deepEqual(freieSlots({ ab: '2026-10-26T00:00:00Z', tage: 1, belegt, regeln: REGELN }).map((x) => x.beginn).slice(0, 2), ['2026-10-26T07:45:00.000Z', '2026-10-26T08:00:00.000Z']);
  assert.equal(freieSlots({ ab: '2026-10-26T00:00:00Z', tage: 1, belegt, regeln: { ...REGELN, pufferMin: 10 } })[0]!.beginn, '2026-10-26T08:00:00.000Z');
  // Feiertag: Freitag 25.12.2026 fällt weg
  assert.equal(freieSlots({ ab: '2026-12-25T00:00:00Z', tage: 1, belegt: [], regeln: REGELN }).length, 0);
  // Ganztägig belegt
  assert.equal(freieSlots({ ab: '2026-10-26T00:00:00Z', tage: 1, belegt: [{ beginn: '2026-10-25T23:00:00Z', ende: '2026-10-26T23:00:00Z' }], regeln: REGELN }).length, 0);
});

test('Vorschläge: passend zum Wunsch, auf Tage verteilt, aufgefüllt', () => {
  const v = vorschlaege({ ab: '2026-10-26T00:00:00Z', tage: 14, belegt: [], regeln: REGELN, wunsch: { wochentage: [2] } });
  assert.deepEqual(v.map((x) => x.beginn), ['2026-10-27T07:00:00.000Z', '2026-11-03T07:00:00.000Z', '2026-10-27T07:15:00.000Z'].sort());
  const ohne = vorschlaege({ ab: '2026-10-26T00:00:00Z', tage: 14, belegt: [], regeln: REGELN });
  assert.deepEqual(ohne.map((x) => x.beginn.slice(0, 10)), ['2026-10-26', '2026-10-27', '2026-10-30'], 'drei verschiedene Tage');
  const spaet = vorschlaege({ ab: '2026-10-26T00:00:00Z', tage: 3, belegt: [], regeln: REGELN, wunsch: { tageszeiten: ['abend'] } });
  assert.equal(spaet.length, 3, 'kein Abendfenster – trotzdem drei Vorschläge aufgefüllt');
});

// ── Posteingang und Dienst ────────────────────────────────────────────────────
let basis = '';
let db: Db;
let server: ReturnType<typeof praxisDienst>;
const t = tresor({ PRAXIS_TRESOR_SCHLUESSEL: neuerHauptschluessel() });
const wer = { 'Tailscale-User-Login': 'lilli@example.org' };
const MAILS = [
  { id: 'm1', subject: 'Neue Nachricht über das Kontaktformular', receivedDateTime: '2026-10-26T07:30:00Z', conversationId: 'c1', from: { emailAddress: { address: 'formular@praxis-website.de', name: 'Website' } } },
  { id: 'm2', subject: 'Termin?', receivedDateTime: '2026-10-26T06:00:00Z', conversationId: 'c2', from: { emailAddress: { address: 'bernd@example.org', name: 'Bernd Beispiel' } } },
];
const graph = graphAttrappe({
  seiten: {
    '/me/mailFolders/inbox/childFolders': [{ id: 'ta', displayName: 'Terminanfragen' }],
    '/me/mailFolders/ta/messages': MAILS,
    '/me/calendar/calendarView': [{ id: 'ev1', start: { dateTime: '2026-11-03T07:00:00.0000000' }, end: { dateTime: '2026-11-03T07:30:00.0000000' }, showAs: 'busy' }, { id: 'ev2', start: { dateTime: '2026-11-03T00:00:00.0000000' }, end: { dateTime: '2026-11-04T00:00:00.0000000' }, isAllDay: true, showAs: 'free' }],
  },
  get: {
    '/me/mailFolders/inbox?': { id: 'inbox', displayName: 'Posteingang' },
    '/me/messages/m1?': { body: { contentType: 'text', content: 'Vorname: Anna\nNachname: Test\nTelefon: 0151 1234567\nE-Mail: anna@example.org\nWunschtermin: dienstags vormittags\nAnliegen: Nackenverspannung, Rezept liegt vor' } },
    '/me/messages/m2?': { body: { contentType: 'html', content: '<p>Hallo, h&auml;tten Sie am <b>3.11.</b> um 9 Uhr einen Termin frei?</p>' } },
  },
});
const geloescht: string[] = [];
const graphVoll = {
  ...graph,
  async post<T>(pfad: string, body: unknown): Promise<T> {
    const r = await graph.post<{ id: string }>(pfad, body);
    return (pfad.endsWith('/createReply') ? { id: r.id, webLink: `https://outlook.office.com/owa/?ItemID=${r.id}` } : r) as T;
  },
  async delete(pfad: string): Promise<void> { geloescht.push(pfad); },
};
const post = (felder: Record<string, string>, pfad = '/anfragen/aktion') => fetch(`${basis}${pfad}`, { method: 'POST', redirect: 'manual', headers: { ...wer, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(felder).toString() });
const ziel = (r: Response) => decodeURIComponent(r.headers.get('location') ?? '');
const seite = async (pfad: string) => (await fetch(`${basis}${pfad}`, { headers: wer })).text();
const vorher = { u: process.env.PRAXIS_UMGEBUNG, a: process.env.TEST_ADRESSEN };
afterEach(() => {
  for (const [k, v] of [['PRAXIS_UMGEBUNG', vorher.u], ['TEST_ADRESSEN', vorher.a]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});

before(async () => {
  db = await testDb();
  const anfragen = anfragenDienst({ db, tresor: t, graph: graphVoll });
  server = praxisDienst({
    erlaubt: ['lilli@example.org'], fassung: 't', angemeldet: async () => true, pruefen: async () => [],
    kartei: karteiDienst({ db, tresor: t, graph: graphVoll }), anfragen, cockpit: ({ namenZeigen }) => cockpitDaten({ db, namenZeigen, anfragen: anfragen.stand }),
  });
  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

test('Posteingang: Formular-Mail wird Website-Anfrage mit Patient, freie Mail eine Mail-Anfrage; Dubletten; Schranke 1 in der Testumgebung', async () => {
  const pid = await patientAnlegen(db, t, { vorname: 'Anna', nachname: 'Test', kontakte: [{ art: 'email', wert: 'Anna@example.org' }] }, 'x');
  const probe = await anfragenEingang(graph, db, t, { ordner: 'Posteingang/Terminanfragen', ausfuehren: false, heute: '2026-10-26' });
  assert.deepEqual(probe, { quelle: 'ordner', mails: 2, neu: 2, bekannt: 0, uebersprungen: 0, fehler: 0 });
  assert.equal((await anfragenListe(db, t)).length, 0, 'Probelauf legt nichts an');
  const b = await anfragenEingang(graph, db, t, { ordner: 'Posteingang/Terminanfragen', ausfuehren: true, heute: '2026-10-26' });
  assert.equal(b.neu, 2);
  const liste = await anfragenListe(db, t);
  assert.equal(liste.length, 2);
  const web = liste.find((a) => a.quelle === 'website')!;
  assert.equal(web.absenderName, 'Anna Test');
  assert.equal(web.absenderAdresse, 'anna@example.org');
  assert.equal(web.absenderTelefon, '+491511234567');
  assert.equal(web.patient?.id, pid, 'über die Mailadresse gefunden');
  assert.deepEqual(web.erkannt, { wochentage: [2], tageszeiten: ['vormittag'], daten: [], uhrzeiten: [] });
  assert.match(web.text!, /Nackenverspannung/, 'Wortlaut verschlüsselt gespeichert und lesbar');
  const mail = liste.find((a) => a.quelle === 'mail')!;
  assert.equal(mail.absenderName, 'Bernd Beispiel');
  assert.equal(mail.patient, null);
  assert.deepEqual(mail.erkannt, { wochentage: [], tageszeiten: [], daten: ['2026-11-03'], uhrzeiten: ['09:00'] });
  assert.equal(mail.text, 'Hallo, hätten Sie am 3.11. um 9 Uhr einen Termin frei?');
  const nochmal = await anfragenEingang(graph, db, t, { ordner: 'Posteingang/Terminanfragen', ausfuehren: true });
  assert.deepEqual([nochmal.neu, nochmal.bekannt], [0, 2]);
  assert.equal((await anfragenEingang(graph, db, t, { ordner: 'Posteingang/Gibtsnicht', ausfuehren: true })).quelle, 'fehlt');
  process.env.PRAXIS_UMGEBUNG = 'test';
  process.env.TEST_ADRESSEN = 'shopping@2late.de';
  await db.query('DELETE FROM terminanfrage');
  const test = await anfragenEingang(graph, db, t, { ordner: 'Posteingang/Terminanfragen', ausfuehren: true });
  assert.deepEqual([test.neu, test.uebersprungen], [0, 2], 'Testumgebung nimmt nur Testadressen');
  delete process.env.PRAXIS_UMGEBUNG;
  await anfragenEingang(graph, db, t, { ordner: 'Posteingang/Terminanfragen', ausfuehren: true, heute: '2026-10-26' });
});

test('Cockpit zeigt offene Anfragen', async () => {
  const d = await cockpitDaten({ db, namenZeigen: false, anfragen: anfragenDienst({ db, tresor: t }).stand });
  assert.equal(d.anfragen.stand, 'ok');
  if (d.anfragen.stand === 'ok') assert.deepEqual([d.anfragen.daten.neu, d.anfragen.daten.vorgeschlagen, d.anfragen.daten.neueste.length], [2, 0, 2]);
  assert.match(await seite('/'), /Terminanfragen.*<b>2<\/b><span>neu<\/span>/s);
});

test('Anfrage-Seite: Wortlaut, erkannte Wünsche, Patient zuordnen, neuen Patienten vorbelegen', async () => {
  const liste = await seite('/anfragen');
  assert.match(liste, /Anna Test/);
  assert.match(liste, /Bernd Beispiel/);
  assert.match(liste, /Patient unbekannt/);
  const mail = (await anfragenListe(db, t)).find((a) => a.quelle === 'mail')!;
  const html = await seite(`/anfragen/${mail.id}`);
  assert.match(html, /hätten Sie am 3\.11\. um 9 Uhr/);
  assert.match(html, /<span class="marke jetzt">03\.11\.2026<\/span>/);
  assert.match(html, /\/patienten\/neu\?anfrage=\d+&vorname=Bernd&nachname=Beispiel&email=bernd%40example\.org/);
  // Neuer Patient aus der Anfrage → zugeordnet
  const neu = await post({ aktion: 'anlegen', anfrage_id: mail.id, vorname: 'Bernd', nachname: 'Beispiel', email: 'bernd@example.org', zurueck: '/patienten/neu' }, '/patienten/aktion');
  assert.match(ziel(neu), new RegExp(`/anfragen/${mail.id}\\?meldung=Patient angelegt und der Anfrage zugeordnet`));
  assert.ok((await anfrageLesen(db, t, mail.id))!.patient, 'zugeordnet');
  assert.match(await seite('/patienten/neu?anfrage=9&vorname=Carla&nachname=Muster&mobil=0170'), /value="Carla".*value="Muster".*value="0170"/s);
});

test('Vorschlagen reserviert drei Zeiten im Kalender und legt die Antwort im Mail-Faden an; Bestätigen trägt den Termin ein', async () => {
  const mail = (await anfragenListe(db, t)).find((a) => a.quelle === 'mail')!;
  // Kartei belegt Di 3.11. 09:30–10:00; Kalender belegt 08:00–08:30 (ev1), ganztags frei (ev2) zählt nicht
  await terminAnlegen(db, mail.patient!.id, { datum: '2026-11-03', zeit: '09:30', dauerMin: 30 }, 'x');
  const r = await post({ aktion: 'vorschlagen', id: mail.id, dauer_min: '30', ab: '2026-11-02', tage: '7' });
  assert.match(ziel(r), /meldung=3 Zeiten vorgeschlagen und im Kalender reserviert\. Die Antwort liegt als Entwurf im Postfach/);
  const a = (await anfrageLesen(db, t, mail.id))!;
  assert.equal(a.status, 'vorgeschlagen');
  assert.equal(a.vorschlaege.length, 3);
  assert.ok(a.vorschlaege.every((v) => v.exchangeEventId), 'reserviert');
  // Wunsch 3.11. um 9 Uhr: 09:00 Berlin (08:00Z) ist frei (Kalender belegt 08:00–08:30, Kartei 09:30–10:00); dazu je ein Vorschlag an zwei anderen Tagen
  assert.deepEqual(a.vorschlaege.map((v) => v.beginn), ['2026-11-02T07:00:00.000Z', '2026-11-03T08:00:00.000Z', '2026-11-04T07:00:00.000Z']);
  assert.equal(a.antwortWeblink?.startsWith('https://outlook.office.com/owa/?ItemID='), true);
  const reservierungen = graph.schreibende().filter((x) => x.pfad === '/me/calendar/events');
  assert.equal(reservierungen.length, 3);
  assert.equal((reservierungen[0]!.body as { subject: string; showAs: string }).subject, `Reserviert – Anfrage #${mail.id}`);
  assert.equal((reservierungen[0]!.body as { showAs: string }).showAs, 'tentative');
  const antwort = graph.schreibende().find((x) => x.pfad === '/me/messages/m2/createReply')!;
  assert.match((antwort.body as { comment: string }).comment, /Guten Tag Bernd Beispiel,<br><br>für Ihre Behandlung kann ich Ihnen folgende Termine anbieten:<br>– Mo\., 02\.11\.2026, 08:00 Uhr \(30 Minuten\)<br>– Di\., 03\.11\.2026, 09:00 Uhr/);
  const html = await seite(`/anfragen/${mail.id}`);
  assert.match(html, /Antwort-Entwurf in Outlook öffnen/);
  assert.match(html, /Diesen Termin bestätigen/);
  // Bestätigen: Termin in der Kartei, übrige Reservierungen gelöscht, Bestätigung als Entwurf
  const b = await post({ aktion: 'bestaetigen', id: mail.id, wahl: '1' });
  assert.match(ziel(b), /\/patienten\/\d+\?meldung=Termin am .* angelegt\. Termin steht im Kalender\. Die Bestätigung liegt als Entwurf im Postfach\.#termine/);
  const fertig = (await anfrageLesen(db, t, mail.id))!;
  assert.equal(fertig.status, 'bestaetigt');
  assert.ok(fertig.terminId);
  assert.equal(geloescht.length, 3, 'alle drei Reservierungen weg – der echte Termin wird eigens gespiegelt');
  const termin = (await db.query<{ beginn: Date; exchange_event_id: string | null }>('SELECT beginn, exchange_event_id FROM termin WHERE id = $1', [fertig.terminId])).rows[0]!;
  assert.equal(new Date(termin.beginn).toISOString(), a.vorschlaege[1]!.beginn);
  assert.ok(termin.exchange_event_id, 'gespiegelt');
  assert.equal(graph.schreibende().filter((x) => x.pfad === '/me/messages/m2/createReply').length, 2, 'Vorschlag und Bestätigung je ein Entwurf im Faden');
});

test('Anfrage von Hand, verwerfen räumt Reservierungen weg, wieder öffnen', async () => {
  const neu = await post({ aktion: 'neu', quelle: 'telefon', name: 'Carla Muster', telefon: '0170 5555555', text: 'Freitag früh', anliegen: 'termin' });
  const id = /\/anfragen\/(\d+)/.exec(ziel(neu))![1]!;
  const a = (await anfrageLesen(db, t, id))!;
  assert.deepEqual([a.quelle, a.absenderTelefon, a.text], ['telefon', '+491705555555', 'Freitag früh']);
  const v = await post({ aktion: 'vorschlagen', id, ab: '2026-11-02' });
  assert.match(ziel(v), /Keine Mailadresse – bitte telefonisch mitteilen/);
  const vorher = geloescht.length;
  await post({ aktion: 'verwerfen', id });
  assert.equal((await anfrageLesen(db, t, id))!.status, 'verworfen');
  assert.equal(geloescht.length, vorher + 3);
  await post({ aktion: 'wieder_oeffnen', id });
  assert.equal((await anfrageLesen(db, t, id))!.status, 'neu');
  assert.match(ziel(await post({ aktion: 'bestaetigen', id, wahl: '0' })), /fehler=Bitte zuerst den Patienten zuordnen/);
  assert.equal((await post({ aktion: 'neu', name: '' })).status, 303);
  assert.match(ziel(await post({ aktion: 'neu', name: '' })), /fehler=Eine Anfrage braucht/);
});
