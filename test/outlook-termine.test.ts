/** Öffnungszeiten je Wochentag und Outlook-Termine im Kalender (W112): Formular, Blöcke, Abgleich Outlook → Kartei, Kalenderseite */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { oeffnungszeitenAusTagen, oeffnungszeitenJeTag, oeffnungszeitenLesen, oeffnungszeitenText } from '../src/anfragen/slots.ts';
import type { Db } from '../src/db/index.ts';
import { karteiDienst } from '../src/kartei/dienst.ts';
import { einstellungen, einstellungSetzen } from '../src/kartei/konfiguration.ts';
import { imOeffnungsfenster, outlookBloecke, outlookTermineUebernehmen, patientennummerAus } from '../src/kartei/outlook-termine.ts';
import { patientAnlegen, terminAnlegen } from '../src/kartei/patienten.ts';
import { praxisDienst } from '../src/server.ts';
import { neuerHauptschluessel, tresor } from '../src/tresor.ts';
import { berlinMitternachtUtc } from '../src/zeit.ts';
import { graphAttrappe } from './attrappe.ts';
import { testDb } from './testdb.ts';

test('Öffnungszeiten: Text ↔ Tabelle je Wochentag mit Pause; Fehler bei Unsinn', () => {
  const tage = oeffnungszeitenJeTag(oeffnungszeitenLesen('Mo 08:00-12:00,13:00-18:00; Di 08:00-14:00'));
  assert.deepEqual(tage.slice(0, 3).map((t) => [t.name, t.offen, t.von, t.bis, t.pauseVon, t.pauseBis]), [['Mo', true, '08:00', '18:00', '12:00', '13:00'], ['Di', true, '08:00', '14:00', '', ''], ['Mi', false, '', '', '', '']]);
  assert.equal(tage.length, 7);
  assert.equal(oeffnungszeitenText(oeffnungszeitenAusTagen(tage)), 'Mo 08:00-12:00,13:00-18:00; Di 08:00-14:00', 'Rundreise ohne Verlust');
  const mo = { ...tage[0]! };
  assert.throws(() => oeffnungszeitenAusTagen([{ ...mo, pauseVon: '19:00', pauseBis: '20:00' }]), /Mo: die Pause muss innerhalb/);
  assert.throws(() => oeffnungszeitenAusTagen([{ ...mo, von: '18:00', bis: '08:00', pauseVon: '', pauseBis: '' }]), /Mo: Ende liegt vor dem Beginn/);
  assert.throws(() => oeffnungszeitenAusTagen([{ ...mo, von: 'acht' }]), /Mo: Beginn wie 08:00/);
  assert.deepEqual(oeffnungszeitenAusTagen([{ ...mo, von: '8:00:00', bis: '18:00:00', pauseVon: '', pauseBis: '' }]), [{ tag: 1, von: '08:00', bis: '18:00' }], 'Sekunden aus dem Browser werden abgeschnitten');
  assert.deepEqual(oeffnungszeitenAusTagen([{ ...mo, offen: false }]), [], 'zu = kein Fenster');
});

test('Patientennummer im Betreff; Öffnungsfenster', () => {
  assert.deepEqual(['E. M. P-1001', 'P-1001 Knie', 'T-1011', 'Zahnarzt', 'XP-1001', 'P-10010'].map(patientennummerAus), ['P-1001', 'P-1001', 'T-1011', null, null, 'P-10010']);
  const fenster = oeffnungszeitenLesen('Mo 08:00-12:00; Di 08:00-12:00');
  // Montag 2026-11-02, 09:00–09:30 Berlin = 08:00Z
  assert.equal(imOeffnungsfenster({ beginn: '2026-11-02T08:00:00.000Z', ende: '2026-11-02T08:30:00.000Z', ganztags: false, frei: false }, fenster), true);
  assert.equal(imOeffnungsfenster({ beginn: '2026-11-02T11:30:00.000Z', ende: '2026-11-02T12:30:00.000Z', ganztags: false, frei: false }, fenster), false, '12:30–13:30 liegt nach dem Fenster');
  assert.equal(imOeffnungsfenster({ beginn: '2026-11-02T10:30:00.000Z', ende: '2026-11-02T12:30:00.000Z', ganztags: false, frei: false }, fenster), true, 'überlappt das Fensterende');
  assert.equal(imOeffnungsfenster({ beginn: '2026-11-04T08:00:00.000Z', ende: '2026-11-04T08:30:00.000Z', ganztags: false, frei: false }, fenster), false, 'Mittwoch geschlossen');
  assert.equal(imOeffnungsfenster({ beginn: '2026-11-02T08:00:00.000Z', ende: '2026-11-02T08:30:00.000Z', ganztags: true, frei: false }, fenster), false);
  assert.equal(imOeffnungsfenster({ beginn: '2026-11-02T08:00:00.000Z', ende: '2026-11-02T08:30:00.000Z', ganztags: false, frei: true }, fenster), false);
});

const t = tresor({ PRAXIS_TRESOR_SCHLUESSEL: neuerHauptschluessel() });
const ereignis = (id: string, subject: string, tag: string, von: string, bis: string, mehr: Record<string, unknown> = {}) => ({
  id, subject, start: { dateTime: `${tag}T${von}:00.0000000` }, end: { dateTime: `${tag}T${bis}:00.0000000` }, isAllDay: false, showAs: 'busy', webLink: `https://outlook.example/${id}`, ...mehr,
});
// Zeiten in UTC; im November ist Berlin UTC+1 – 08:00Z = 09:00 Berlin
const EREIGNISSE = [
  ereignis('ev-1', 'E. M. P-1001', '2026-11-03', '09:00', '09:30', { categories: ['Praxis-Termin'] }), // gespiegelter Termin, in Outlook um 30 Min. verschoben
  ereignis('ev-5', 'Reserviert – Anfrage #3', '2026-11-04', '08:00', '08:30', { categories: ['Praxis-Termin'], showAs: 'tentative' }),
  ereignis('ev-3', 'Zahnarzt', '2026-11-04', '10:00', '11:00'),
  ereignis('ev-4', 'Urlaub', '2026-11-04', '00:00', '00:00', { isAllDay: true }),
  ereignis('ev-7', 'Kino', '2026-11-04', '19:00', '21:00'),
  ereignis('ev-8', 'Frei', '2026-11-04', '09:00', '10:00', { showAs: 'free' }),
  ereignis('ev-2', 'E. M. P-1001', '2026-11-05', '08:00', '08:30', { categories: ['Praxis-Termin: Selbstzahler', 'Praxis-Termin'] }),
  ereignis('ev-6', 'X. Y. P-9999', '2026-11-06', '08:00', '08:30', { categories: ['Praxis-Termin'] }),
  ereignis('ev-9', 'abgesagt', '2026-11-06', '09:00', '09:30', { isCancelled: true }),
];
const graph = { ...graphAttrappe({ seiten: { '/me/calendar/calendarView': EREIGNISSE } }), delete: async () => {} };
const VON = berlinMitternachtUtc('2026-11-02');
const BIS = berlinMitternachtUtc('2026-11-09');
const FENSTER = oeffnungszeitenLesen('Mo 08:00-12:00; Di 08:00-12:00; Mi 08:00-12:00; Do 08:00-12:00; Fr 08:00-12:00');

let basis = '';
let db: Db;
let server: ReturnType<typeof praxisDienst>;
let pid = '';
let tid = '';
const wer = { 'Tailscale-User-Login': 'lilli@example.org' };
const post = (felder: Record<string, string>) => fetch(`${basis}/patienten/aktion`, { method: 'POST', redirect: 'manual', headers: { ...wer, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(felder).toString() });
const ziel = (r: Response) => decodeURIComponent(r.headers.get('location') ?? '');
const seite = async (pfad: string) => (await fetch(`${basis}${pfad}`, { headers: wer })).text();

before(async () => {
  db = await testDb();
  server = praxisDienst({ erlaubt: ['lilli@example.org'], fassung: 't', angemeldet: async () => true, pruefen: async () => [], kartei: karteiDienst({ db, tresor: t, graph }) });
  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await einstellungSetzen(db, 'oeffnungszeiten', 'Mo 08:00-12:00; Di 08:00-12:00; Mi 08:00-12:00; Do 08:00-12:00; Fr 08:00-12:00', 'x');
  pid = await patientAnlegen(db, t, { vorname: 'Erika', nachname: 'Muster' }, 'x'); // P-1001
  tid = await terminAnlegen(db, pid, { datum: '2026-11-03', zeit: '09:30', dauerMin: 30 }, 'x');
  await db.query("UPDATE termin SET exchange_event_id = 'ev-1', kalender = '/me/calendar' WHERE id = $1", [tid]);
});
after(() => server.close());

test('Blöcke vor dem Abgleich: Reservierung, Privates im Fenster, Patient aus Outlook, unbekannte Nummer; nichts Ganztägiges, Freies, Abendliches', async () => {
  const b = await outlookBloecke(db, graph, VON, BIS, FENSTER);
  assert.deepEqual(b.map((x) => [x.outlookId, x.art, x.reserviert, x.patientennummer, x.patientId]), [
    ['ev-5', 'geblockt', true, null, null], ['ev-3', 'geblockt', false, null, null], ['ev-2', 'patient', false, 'P-1001', pid], ['ev-6', 'geblockt', false, null, null],
  ]);
  assert.equal(b[1]!.webLink, 'https://outlook.example/ev-3');
  assert.equal(b[2]!.beginn, '2026-11-05T08:00:00.000Z');
});

test('Abgleich Outlook → Kartei: Patiententermin übernommen, verschobene Zeit nachgezogen, unbekannte Nummer gezählt; zweiter Lauf ändert nichts', async () => {
  assert.deepEqual(await outlookTermineUebernehmen(db, graph, 'system', { von: VON, bis: BIS }), { neu: 1, verschoben: 1, unbekannt: 1 });
  const zeilen = (await db.query<{ e: string; b: Date; s: string; k: string; w: string }>('SELECT exchange_event_id AS e, beginn AS b, status::text AS s, kalender AS k, erstellt_von AS w FROM termin WHERE patient_id = $1 ORDER BY beginn', [pid])).rows;
  assert.deepEqual(zeilen.map((z) => [z.e, new Date(z.b).toISOString(), z.s, z.k]), [['ev-1', '2026-11-03T09:00:00.000Z', 'bestaetigt', '/me/calendar'], ['ev-2', '2026-11-05T08:00:00.000Z', 'bestaetigt', '/me/calendar']]);
  assert.equal(zeilen[1]!.w, 'system');
  assert.deepEqual(await outlookTermineUebernehmen(db, graph, 'system', { von: VON, bis: BIS }), { neu: 0, verschoben: 0, unbekannt: 1 });
  const b = await outlookBloecke(db, graph, VON, BIS, FENSTER);
  assert.deepEqual(b.map((x) => x.outlookId), ['ev-5', 'ev-3', 'ev-6'], 'der übernommene Termin ist kein Block mehr');
  const protokoll = (await db.query<{ a: string }>("SELECT action AS a FROM audit_event WHERE action LIKE 'termin_aus_outlook%' ORDER BY id")).rows.map((r) => r.a);
  assert.deepEqual(protokoll, ['termin_aus_outlook_verschoben', 'termin_aus_outlook']);
});

test('Kalenderseite: Öffnungszeit je Tag, grauer Block mit Outlook-Link, Reservierung, Kartei-Termine; geschlossener Tag', async () => {
  const html = await seite('/kalender?tag=2026-11-04&ansicht=woche');
  assert.match(html, /<p class="kal-oeff" data-hilfe="kalender.oeffnung">08:00–12:00<\/p>/);
  assert.match(html, /<p class="kal-oeff" data-hilfe="kalender.oeffnung">geschlossen<\/p>/, 'Samstag');
  assert.match(html, /<a class="kal-termin block" href="https:\/\/outlook.example\/ev-3" target="_blank" rel="noopener" data-hilfe="kalender.block"><b>11:00–12:00<\/b><span>Geblockt · Outlook<\/span><\/a>/);
  assert.match(html, /<b>09:00–09:30<\/b><span>Reserviert · Terminanfrage<\/span>/);
  assert.doesNotMatch(html, /Zahnarzt|Kino|Urlaub/, 'kein Betreff aus Outlook');
  assert.match(html, /E\. M\. <span class="hint">P-1001<\/span>/, 'Kartei-Termine wie bisher');
  assert.doesNotMatch(html, /kommt in die Kartei/, 'nach dem Abgleich kein Outlook-Patient mehr');
  assert.doesNotMatch(html, /Kein Postfach verbunden/);
});

test('Konfiguration: Tabelle der Öffnungszeiten; Speichern mit Pause; Fehler bleibt als Meldung', async () => {
  const html = await seite('/konfiguration');
  assert.match(html, /<h2 id="oeffnungszeiten">Kalender: Öffnungszeiten und Pausen<\/h2>/);
  assert.match(html, /<td>Mo<\/td><td><input type="checkbox" name="offen_1" value="1" checked/);
  assert.match(html, /name="von_1" value="08:00"/);
  assert.match(html, /name="offen_6" value="1" aria-label="Sa geöffnet"/);
  const r = await post({ aktion: 'oeffnungszeiten_setzen', zurueck: '/konfiguration?jahr=2026', offen_1: '1', von_1: '08:00', bis_1: '18:00', pause_von_1: '12:00', pause_bis_1: '13:00', offen_2: '1', von_2: '8:00', bis_2: '12:00', von_3: '08:00', bis_3: '12:00' });
  assert.equal(ziel(r), '/konfiguration?meldung=Öffnungszeiten gespeichert: Mo 08:00-12:00,13:00-18:00; Di 08:00-12:00#oeffnungszeiten');
  assert.equal((await einstellungen(db)).oeffnungszeiten, 'Mo 08:00-12:00,13:00-18:00; Di 08:00-12:00');
  assert.match(await seite('/konfiguration'), /name="pause_von_1" value="12:00"[\s\S]*name="pause_bis_1" value="13:00"/);
  assert.match(ziel(await post({ aktion: 'oeffnungszeiten_setzen', zurueck: '/konfiguration?jahr=2026', offen_1: '1', von_1: '08:00', bis_1: '18:00', pause_von_1: '19:00', pause_bis_1: '20:00' })), /fehler=Mo: die Pause muss innerhalb der Öffnungszeit liegen/);
  assert.match(ziel(await post({ aktion: 'oeffnungszeiten_setzen', zurueck: '/konfiguration?jahr=2026' })), /fehler=Mindestens ein Tag muss geöffnet sein/);
  // Kalender zeigt die neuen Fenster
  assert.match(await seite('/kalender?tag=2026-11-02&ansicht=tag'), /data-hilfe="kalender.oeffnung">08:00–12:00, 13:00–18:00</);
});
