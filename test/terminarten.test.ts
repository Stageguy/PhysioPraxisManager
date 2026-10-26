/** Terminarten der Online-Anfrage (W94) und Sektionen im Kalender (W95) */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { anfrageLesen } from '../src/anfragen/anfragen.ts';
import { anfragenDienst } from '../src/anfragen/dienst.ts';
import { anfragenEingang } from '../src/anfragen/eingang.ts';
import { anfrageAusFormularMail } from '../src/anfragen/formular.ts';
import type { Db } from '../src/db/index.ts';
import { karteiDienst } from '../src/kartei/dienst.ts';
import { ereignisKoerper, terminSpiegeln } from '../src/kartei/kalender.ts';
import { fallAnlegen, patientAnlegen, terminAnlegen, termineZeitraum, verordnungAnlegen, wellnessSpeichern } from '../src/kartei/patienten.ts';
import { terminartFinden, terminarten, websiteBaustein } from '../src/kartei/terminarten.ts';
import { praxisDienst } from '../src/server.ts';
import { neuerHauptschluessel, tresor } from '../src/tresor.ts';
import { graphAttrappe } from './attrappe.ts';
import { testDb } from './testdb.ts';

let basis = '';
let db: Db;
let server: ReturnType<typeof praxisDienst>;
const t = tresor({ PRAXIS_TRESOR_SCHLUESSEL: neuerHauptschluessel() });
const wer = { 'Tailscale-User-Login': 'lilli@example.org' };
const post = (felder: Record<string, string>, pfad = '/patienten/aktion') => fetch(`${basis}${pfad}`, { method: 'POST', redirect: 'manual', headers: { ...wer, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(felder).toString() });
const ziel = (r: Response) => decodeURIComponent(r.headers.get('location') ?? '');
const seite = async (pfad: string) => (await fetch(`${basis}${pfad}`, { headers: wer })).text();

before(async () => {
  db = await testDb();
  server = praxisDienst({ erlaubt: ['lilli@example.org'], fassung: 't', angemeldet: async () => true, pruefen: async () => [], kartei: karteiDienst({ db, tresor: t }), anfragen: anfragenDienst({ db, tresor: t }) });
  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

test('Standardkacheln: drei Sektionen, alle inaktiv, GKV-Nummern und Regelzeiten', async () => {
  const alle = await terminarten(db);
  const je = (s: string) => alle.filter((a) => a.sektion === s);
  assert.deepEqual([je('rezept').length, je('selbstzahler').length, je('wellness').length], [16, 12, 10]);
  assert.ok(alle.every((a) => !a.aktiv), 'alle inaktiv');
  assert.deepEqual(je('rezept').slice(0, 3).map((a) => a.kurz), ['Neupatient – Erstanamnese und Befund', 'Neues Rezept – erster Termin der Serie', 'Folgerezept – die Behandlung geht weiter']);
  const kg = alle.find((a) => a.code === 'P4')!;
  assert.deepEqual([kg.kurz, kg.leistungNummer, kg.regelzeit, kg.dauerMin], ['Krankengymnastik (KG)', '20501', '15 bis 25 Minuten', 30]);
  assert.equal(alle.find((a) => a.code === 'P9')!.dauerMin, 60, 'MLD-60');
  assert.ok(je('wellness').some((a) => a.kurz.startsWith('Abhyanga')) && je('wellness').some((a) => a.kurz.startsWith('Lomi Lomi')));
  assert.equal(await terminartFinden(db, 'P4 – Krankengymnastik (KG)'), undefined, 'inaktive werden aus der Website nicht angenommen');
  assert.doesNotMatch(websiteBaustein(alle), /<optgroup/, 'Baustein ohne aktive: nur „Bitte wählen“');
});

test('Seite: Kacheln je Sektion, aktivieren, Vorschau und Baustein zeigen nur aktive, bearbeiten, neue Kachel', async () => {
  let html = await seite('/konfiguration/terminarten');
  assert.match(html, /Physioleistungen gemäß Katalog und Rezept/);
  assert.match(html, /Selbstzahler – Behandlungen nach Physioverordnung/);
  assert.match(html, /Wellness &amp; Ayurveda/);
  assert.match(html, /0 von 16 aktiv/);
  assert.match(html, /Noch keine Terminart aktiv/);
  assert.match(await seite('/konfiguration'), /href="\/konfiguration\/terminarten"/);
  const kg = (await terminarten(db)).find((a) => a.code === 'P4')!;
  const w1 = (await terminarten(db)).find((a) => a.code === 'W1')!;
  for (const id of [kg.id, w1.id]) {
    const r = await post({ aktion: 'terminart_aktiv', terminart_id: id, aktiv: '1', zurueck: '/konfiguration/terminarten' });
    assert.match(ziel(r), /^\/konfiguration\/terminarten\?meldung=Aktiv – steht jetzt im Dropdown.*#ta-\d+$/);
  }
  html = await seite('/konfiguration/terminarten');
  assert.match(html, /<select data-terminart-vorschau><option value="">Bitte wählen …<\/option><optgroup label="Physioleistungen gemäß Katalog und Rezept"><option value="\d+">Krankengymnastik \(KG\) \(30 Min\.\)<\/option><\/optgroup><optgroup label="Wellness &amp; Ayurveda"><option value="\d+">Abhyanga – Ganzkörper-Ölmassage \(90 Min\.\)/);
  assert.match(html, /&lt;option value=&quot;P4 – Krankengymnastik \(KG\)&quot; data-dauer=&quot;30&quot;/, 'Baustein mit Kennung im Wert');
  const r = await post({ aktion: 'terminart_speichern', terminart_id: kg.id, kurz: 'Krankengymnastik', lang: 'Bewegungstherapie', dauer_min: '40', leistung_nummer: '20501', zurueck: '/konfiguration/terminarten' });
  assert.match(ziel(r), /meldung=Terminart gespeichert/);
  assert.match(ziel(await post({ aktion: 'terminart_speichern', terminart_id: kg.id, kurz: 'x', dauer_min: '0', zurueck: '/konfiguration/terminarten' })), /fehler=Dauer in Minuten/);
  assert.match(ziel(await post({ aktion: 'terminart_speichern', terminart_id: kg.id, kurz: 'x', dauer_min: '30', leistung_nummer: '205', zurueck: '/konfiguration/terminarten' })), /fehler=GKV-Nummer mit fünf Ziffern/);
  const neu = await post({ aktion: 'terminart_speichern', sektion: 'selbstzahler', kurz: 'Kinesio-Taping', dauer_min: '20', zurueck: '/konfiguration/terminarten' });
  assert.match(ziel(neu), /meldung=Terminart angelegt – noch inaktiv/);
  const taping = (await terminarten(db)).find((a) => a.kurz === 'Kinesio-Taping')!;
  assert.deepEqual([taping.code, taping.aktiv, taping.dauerMin], ['S13', false, 20]);
  assert.equal((await terminartFinden(db, 'P4 – Krankengymnastik (40 Min.)'))?.code, 'P4', 'Kennung zählt, der Text darf abweichen');
  assert.equal((await terminartFinden(db, 'Abhyanga – Ganzkörper-Ölmassage (90 Min.)'))?.code, 'W1', 'oder genau die Kurzbeschreibung');
});

test('Website-Formular mit Terminart → Anfrage mit Terminart; Vorschlagsdauer und Termin folgen ihr', async () => {
  assert.equal(anfrageAusFormularMail('Name: Rita Ruhe\nE-Mail: rita@example.org\nTerminart: W1 – Abhyanga – Ganzkörper-Ölmassage\nWunschtermin: Freitag')!.terminart, 'W1 – Abhyanga – Ganzkörper-Ölmassage');
  const graph = graphAttrappe({
    seiten: { '/me/mailFolders/inbox/childFolders': [{ id: 'ta', displayName: 'Terminanfragen' }], '/me/mailFolders/ta/messages': [{ id: 'w1', subject: 'Kontaktformular', receivedDateTime: '2026-10-26T08:00:00Z', from: { emailAddress: { address: 'formular@lilli-nebel.de' } } }] },
    get: { '/me/mailFolders/inbox?': { id: 'inbox', displayName: 'Posteingang' }, '/me/messages/w1?': { body: { contentType: 'text', content: 'Name: Rita Ruhe\nE-Mail: rita@example.org\nTerminart: W1 – Abhyanga – Ganzkörper-Ölmassage (90 Min.)\nWunschtermin: Freitag' } } },
  });
  await anfragenEingang(graph, db, t, { ordner: 'Posteingang/Terminanfragen', ausfuehren: true, heute: '2026-10-26' });
  const id = (await db.query<{ id: string }>("SELECT id::text FROM terminanfrage WHERE graph_message_id = 'w1'")).rows[0]!.id;
  const a = (await anfrageLesen(db, t, id))!;
  assert.deepEqual([a.terminart?.code, a.terminart?.sektion, a.terminart?.dauerMin], ['W1', 'wellness', 90]);
  const html = await seite(`/anfragen/${id}`);
  assert.match(html, /name="dauer_min" inputmode="numeric" class="kurz" value="90"/, 'Dauer der Terminart im Vorschlagsformular');
  assert.match(html, /<option value="\d+" selected>W1 – Abhyanga/);
  assert.match(await seite('/anfragen'), /sek-sym sek-wellness.*<b>W1<\/b> Abhyanga/s);
  // Terminart von Hand ändern
  const p5 = (await terminarten(db)).find((x) => x.code === 'P5')!;
  assert.match(ziel(await post({ aktion: 'terminart', id, terminart_id: p5.id, zurueck: `/anfragen/${id}` }, '/anfragen/aktion')), /meldung=Terminart gesetzt/);
  assert.equal((await anfrageLesen(db, t, id))!.terminart?.code, 'P5');
});

test('Sektion im Kalender: Terminart vor Rezept vor Fall; Kalenderseite mit Rand und Symbol; Outlook-Kategorie', async () => {
  const pid = await patientAnlegen(db, t, { vorname: 'Karin', nachname: 'Zwölfer' }, 'x');
  const rezept = await verordnungAnlegen(db, t, pid, { ausgestelltAm: '2026-10-01', massnahme: 'Manuelle Therapie', leistungNummer: '21201', anzahl: 6 }, 'x');
  const wm = await wellnessSpeichern(db, { code: 'WM60', bezeichnung: 'Wellnessmassage 60', dauerMin: 60, preis: '65' }, 'x');
  const wellnessFall = await fallAnlegen(db, t, pid, { grundlage: 'praevention', bezeichnung: 'Entspannung', wellnessLeistungId: wm }, 'x');
  const s3 = (await terminarten(db)).find((x) => x.code === 'S3')!;
  const t1 = await terminAnlegen(db, pid, { datum: '2026-11-02', zeit: '08:00', dauerMin: 30, verordnungId: rezept }, 'x');
  const t2 = await terminAnlegen(db, pid, { datum: '2026-11-02', zeit: '09:00', dauerMin: 60, fallId: wellnessFall }, 'x');
  const t3 = await terminAnlegen(db, pid, { datum: '2026-11-02', zeit: '11:00', dauerMin: 30, terminartId: s3.id }, 'x');
  const t4 = await terminAnlegen(db, pid, { datum: '2026-11-02', zeit: '12:00', dauerMin: 30 }, 'x');
  const z = await termineZeitraum(db, '2026-11-01T23:00:00Z', '2026-11-02T23:00:00Z');
  assert.deepEqual(z.map((x) => [x.id, x.sektion]), [[t1, 'rezept'], [t2, 'wellness'], [t3, 'selbstzahler'], [t4, null]]);
  assert.equal(z.find((x) => x.id === t3)!.leistung, 'Manuelle Therapie als Selbstzahler', 'Kurzbezeichnung aus der Terminart');
  const html = await seite('/kalender?tag=2026-11-02&ansicht=tag');
  assert.match(html, /class="kal-termin sek-rezept"/);
  assert.match(html, /class="kal-termin sek-wellness"/);
  assert.match(html, /class="kal-termin sek-selbstzahler"/);
  assert.match(html, /class="kal-termin"/, 'ohne Sektion neutral');
  assert.match(html, /<b><span class="sek-sym sek-wellness"/);
  assert.match(html, /data-hilfe="sektion.legende"/);
  const graph = { ...graphAttrappe({}), delete: async () => {} };
  for (const id of [t1, t2, t3, t4]) await terminSpiegeln(db, graph, id, 'x');
  const kat = graph.schreibende().filter((x) => x.pfad === '/me/calendar/events').map((x) => (x.body as { categories: string[] }).categories);
  assert.deepEqual(kat, [['Praxis-Termin'], ['Praxis-Termin: Wellness', 'Praxis-Termin'], ['Praxis-Termin: Selbstzahler', 'Praxis-Termin'], ['Praxis-Termin']]);
  assert.equal(ereignisKoerper({ id: '1', patient_id: '1', vorname: 'A', nachname: 'B', patientennummer: 'P-1', beginn: '2026-11-02T08:00:00Z', ende: '2026-11-02T08:30:00Z', art: 'behandlung', status: 'bestaetigt', exchange_event_id: null, verordnung_id: null, sektion: 'wellness' }).subject, 'A. B. P-1', 'Betreff bleibt ohne Sektion');
  // Neuer Termin: Terminart wählbar, auch inaktive (intern)
  assert.match(await seite(`/patienten/${pid}/neu/termin`), /<select name="terminart_id" data-hilfe="termin.terminart">.*S3 – Manuelle Therapie als Selbstzahler \(30 Min\.\) · nicht online/s);
});
