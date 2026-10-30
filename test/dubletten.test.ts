/** Dubletten (W119): Erkennung, „keine Dublette“, Zusammenführen, Löschen, Schranke für Aktionen, Symbol und Klärungsseite */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import type { Db } from '../src/db/index.ts';
import { karteiDienst } from '../src/kartei/dienst.ts';
import {
  adresseSpeichern, dubletteLoeschen, dublettenPaare, dublettenZaehlen, istLeer, keineDublette, KarteiFehler, kontaktSpeichern, patientAnlegen, patientLesen, terminAnlegen,
  verknuepfteElemente, verlaufEintragen, zusammenfuehren,
} from '../src/kartei/patienten.ts';
import { erklaerungErfassen } from '../src/kartei/pinnwand.ts';
import { praxisDienst } from '../src/server.ts';
import { neuerHauptschluessel, tresor } from '../src/tresor.ts';
import { heuteBerlin, tagPlus } from '../src/zeit.ts';
import { testDb } from './testdb.ts';

let basis = '';
let db: Db;
let server: ReturnType<typeof praxisDienst>;
const t = tresor({ PRAXIS_TRESOR_SCHLUESSEL: neuerHauptschluessel() });
const wer = { 'Tailscale-User-Login': 'lilli@example.org' };
const post = (felder: Record<string, string>) => fetch(`${basis}/patienten/aktion`, { method: 'POST', redirect: 'manual', headers: { ...wer, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(felder).toString() });
const ziel = (r: Response) => decodeURIComponent(r.headers.get('location') ?? '');
const seite = async (pfad: string) => (await fetch(`${basis}${pfad}`, { headers: wer })).text();
const BALD = tagPlus(heuteBerlin(), 10);

let a = '', b = '', c = '', d = '', e = '';

before(async () => {
  db = await testDb();
  server = praxisDienst({ erlaubt: ['lilli@example.org'], fassung: 't', angemeldet: async () => true, pruefen: async () => [], kartei: karteiDienst({ db, tresor: t }) });
  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  a = await patientAnlegen(db, t, { vorname: 'Hanna', nachname: 'Müller', geburtsdatum: '1980-01-01', kontakte: [{ art: 'mobil', wert: '0151 1111111' }, { art: 'email', wert: 'hanna@example.org' }, { art: 'telefon', wert: '08247 1234' }] }, 'x');
  b = await patientAnlegen(db, t, { anrede: 'Frau', vorname: 'Hanna', nachname: 'Mueller', kontakte: [{ art: 'whatsapp', wert: '+49 151 1111111' }, { art: 'email', wert: 'HANNA@Example.org' }] }, 'x');
  c = await patientAnlegen(db, t, { vorname: 'Müller', nachname: 'Hanna' }, 'x');
  d = await patientAnlegen(db, t, { vorname: 'Max', nachname: 'Müller', geburtsdatum: '1980-01-01', kontakte: [{ art: 'telefon', wert: '08247 1234' }] }, 'x');
  e = await patientAnlegen(db, t, { vorname: 'Lisa', nachname: 'Schmidt', kontakte: [{ art: 'telefon', wert: '08247 1234' }] }, 'x');
  // Vier Patienten mit derselben Mailadresse: eine Sammeladresse, keine Dubletten (N39)
  for (const n of ['Anton', 'Berta', 'Carla', 'Dora']) await patientAnlegen(db, t, { vorname: n, nachname: `Heim-${n}`, kontakte: [{ art: 'email', wert: 'sammel@example.org' }] }, 'x');
});
after(() => server.close());

test('Erkennung: Name (Umlaute, Reihenfolge), Mail, Mobil/WhatsApp, Festnetz und Geburtstag je mit Nachname; Sammeladressen zählen nicht', async () => {
  const paare = await dublettenPaare(db, { patientId: a });
  const mit = (x: string) => paare.find((p) => p.a === x || p.b === x)!;
  assert.deepEqual(paare.map((p) => p.b).sort(), [b, c, d].sort(), 'A passt zu B, C und D – nicht zu E (anderer Nachname) und nicht zur Sammeladresse');
  assert.deepEqual(mit(b).gruende.map((g) => `${g.art}:${g.wert}`).sort(), ['email:hanna@example.org', 'mobil:+491511111111', 'name:'], 'Mueller = Müller, WhatsApp = Mobil, Mail unabhängig von Groß/Klein');
  assert.deepEqual(mit(c).gruende.map((g) => g.art), ['name'], 'Vor- und Nachname vertauscht');
  assert.deepEqual(mit(d).gruende.map((g) => g.art).sort(), ['geburtstag', 'telefon'], 'gleiches Geburtsdatum und Festnetz, jeweils mit gleichem Nachnamen');
  assert.equal((await dublettenPaare(db, { patientId: e })).length, 0, 'Festnetz mit anderem Nachnamen zählt nicht');
  const sammel = (await db.query<{ id: string }>("SELECT id::text FROM patient WHERE nachname LIKE 'Heim-%'")).rows.map((r) => r.id);
  for (const s of sammel) assert.equal((await dublettenPaare(db, { patientId: s })).length, 0, 'Sammeladresse');
  const z = await dublettenZaehlen(db);
  assert.deepEqual([z.get(a), z.get(b), z.get(c), z.get(d), z.get(e)], [3, 2, 2, 1, undefined]);
  assert.equal((await patientLesen(db, t, a))!.dubletten, 3);
  assert.equal(await dublettenPaare(db, { patientId: 'x' }).then((p) => p.length), 0);
});

test('Keine Dublette: das Paar wird nicht mehr gemeldet, die anderen bleiben', async () => {
  await keineDublette(db, c, a, 'lilli');
  assert.deepEqual((await dublettenPaare(db, { patientId: a })).map((p) => p.b).sort(), [b, d].sort());
  assert.equal((await dublettenZaehlen(db)).get(c), 1, 'C passt noch zu B');
  await keineDublette(db, c, a, 'lilli');
  await assert.rejects(keineDublette(db, a, a, 'lilli'), /eigene Dublette/);
  await assert.rejects(keineDublette(db, a, '999999', 'lilli'), KarteiFehler);
});

test('Zusammenführen: alles Verknüpfte wandert, Kontaktwege ohne Doppel, leere Felder ergänzt, Dublette archiviert mit Verweis; Erklärungen nur so', async () => {
  await adresseSpeichern(db, a, { bezeichnung: 'Zuhause', strasse: 'Kurpromenade', hausnummer: '3', plz: '86825', ort: 'Bad Wörishofen', rechnungsadresse: true }, 'x');
  await terminAnlegen(db, a, { datum: BALD, zeit: '09:00', dauerMin: 30 }, 'x');
  await adresseSpeichern(db, b, { bezeichnung: 'Pflegeheim', strasse: 'Bahnhofstraße', hausnummer: '3', plz: '86842', ort: 'Türkheim', rechnungsadresse: true }, 'x');
  await kontaktSpeichern(db, b, { art: 'email', wert: 'hanna2@example.org' }, 'x');
  await terminAnlegen(db, b, { datum: BALD, zeit: '11:00', dauerMin: 30 }, 'x');
  await erklaerungErfassen(db, t, b, { art: 'datenschutzinformation', form: 'schriftlich', am: '2026-10-01' }, 'x');
  await verlaufEintragen(db, t, b, { art: 'anruf_eingehend', grund: 'terminvereinbarung', notiz: 'x' }, 'x');
  await assert.rejects(db.query('UPDATE patient_erklaerung SET patient_id = $1 WHERE patient_id = $2', [a, b]), /nur beim Zusammenführen/, 'der Trigger lässt Erklärungen sonst nicht wandern');
  const vb = await verknuepfteElemente(db, b);
  assert.deepEqual([vb.termine, vb.termineKommend, vb.erklaerungen, vb.verlauf, vb.kontakte, vb.adressen, istLeer(vb)], [1, 1, 1, 1, 3, 1, false]);
  const e1 = await zusammenfuehren(db, a, b, 'lilli');
  assert.deepEqual([e1.behalten.id, e1.dublette.id], [a, b]);
  assert.deepEqual(e1.verschoben, { kontakte: 2, adressen: 1, bezugspersonen: 0, versicherungen: 0, faelle: 0, verordnungen: 0, termine: 1, erklaerungen: 1, dokumente: 0, verlauf: 1, rechnungen: 0, anfragen: 0, einladungen: 0 }, 'WhatsApp und die zweite Mailadresse wandern – die erste Mail gab es schon');
  assert.equal(e1.termine.length, 1, 'ein kommender Termin zum Nachziehen im Kalender');
  assert.match(e1.text, /1 Termine, 1 Erklärungen, 1 Kontaktverlauf, 2 Kontaktwege, 1 Adressen/);
  const pa = (await patientLesen(db, t, a))!;
  assert.equal(pa.anrede, 'Frau', 'leeres Feld aus der Dublette ergänzt');
  assert.equal(pa.geburtsdatum, '1980-01-01', 'Vorhandenes bleibt');
  assert.deepEqual(pa.kontakte.map((k) => [k.art, k.wert, k.primaer]).sort(), [['email', 'hanna2@example.org', false], ['email', 'hanna@example.org', true], ['mobil', '0151 1111111', true], ['telefon', '08247 1234', true], ['whatsapp', '+49 151 1111111', false]].sort(), 'Gewandertes nie primär');
  assert.deepEqual(pa.adressen.map((x) => [x.bezeichnung, x.rechnungsadresse]), [['Zuhause', true], ['Pflegeheim', false]]);
  assert.equal(pa.dubletten, 1, 'D bleibt als Kandidat');
  const pb = (await patientLesen(db, t, b))!;
  assert.deepEqual([pb.status, pb.dubletteVon, pb.kontakte.length, pb.adressen.length], ['archiviert', { id: a, patientennummer: pa.patientennummer }, 0, 0]);
  const va = await verknuepfteElemente(db, a);
  assert.deepEqual([va.termine, va.erklaerungen, va.verlauf], [2, 1, 1]);
  assert.ok(!(await dublettenPaare(db, { patientId: a })).some((p) => p.b === b), 'archivierte Dubletten werden nicht mehr gemeldet');
  // Ein zweiter Lauf (etwa nach einem Abbruch) findet nichts mehr und scheitert nicht
  assert.equal(Object.values((await zusammenfuehren(db, a, b, 'lilli')).verschoben).reduce((s, n) => s + n, 0), 0);
  await assert.rejects(zusammenfuehren(db, b, a, 'lilli'), /archiviert/, 'in eine archivierte Dublette geht nichts');
  await assert.rejects(zusammenfuehren(db, a, a, 'lilli'), /eigene Dublette/);
  const log = (await db.query<{ details: Record<string, unknown> }>("SELECT details FROM audit_event WHERE action = 'patient_zusammengefuehrt' ORDER BY id LIMIT 1")).rows[0]!;
  assert.deepEqual(Object.keys(log.details).sort(), ['dublette', 'verschoben'], 'Protokoll nur mit Kennungen und Zahlen');
});

test('Löschen: nur ohne jede Verknüpfung – Stammdaten gehen mit; mit Akte oder Terminen nicht', async () => {
  assert.ok(istLeer(await verknuepfteElemente(db, d)));
  const { patientennummer } = await dubletteLoeschen(db, d, 'lilli');
  assert.match(patientennummer, /^P-/);
  assert.equal(await patientLesen(db, t, d), undefined);
  assert.equal((await db.query('SELECT 1 FROM patient_kontakt WHERE patient_id = $1', [d])).rows.length, 0);
  await assert.rejects(dubletteLoeschen(db, a, 'lilli'), /Verknüpfungen \(Termine, Erklärungen, Kontaktverlauf\)/);
  await dubletteLoeschen(db, c, 'lilli');
  await assert.rejects(dubletteLoeschen(db, '999999', 'lilli'), /nicht/);
  assert.equal((await dublettenZaehlen(db)).get(a), undefined, 'A hat jetzt keine Kandidaten mehr');
});

test('Oberfläche: „Neuer Patient“ mit Treffer führt zur Klärung; Symbol in Liste und Filter; Schranke für Aktionen; keine Dublette, zusammenführen und löschen per Formular', async () => {
  const r1 = await post({ aktion: 'anlegen', vorname: 'Hanna', nachname: 'Müller', email: 'hanna@example.org', zurueck: '/patienten/neu' });
  const neu = /\/patienten\/(\d+)\/dubletten\?meldung=Patient angelegt\. Möglicherweise gibt es diesen Patienten schon/.exec(ziel(r1))?.[1];
  assert.ok(neu, `Weg zur Klärung: ${ziel(r1)}`);
  const pa = (await patientLesen(db, t, a))!;
  const klaerung = await seite(`/patienten/${neu}/dubletten`);
  assert.match(klaerung, /<section class="tafel dublette-paar" data-hilfe="dubletten.vergleich" tabindex="0">/);
  assert.match(klaerung, /<span class="chip dublette">gleiche Mailadresse: hanna@example.org<\/span><span class="chip dublette">gleicher Name<\/span>/);
  assert.match(klaerung, new RegExp(`<input type="radio" name="behalten" value="${a}" checked> ${pa.patientennummer}`), 'Vorschlag: A hat mehr Akte');
  assert.match(klaerung, new RegExp(`name="loeschen_id" value="${neu}"><button class="knopf warnend" data-hilfe="dubletten.loeschen">`), 'der neue ist leer – löschbar');
  assert.ok(!klaerung.includes(`name="loeschen_id" value="${a}"`), 'A hat Termine – nicht löschbar');
  assert.match(klaerung, /<tr><th scope="row">Termine<\/th><td>0<\/td><td>2<\/td><\/tr>/, 'links diese Seite (neu), rechts der Kandidat A');
  assert.match(klaerung, /<td class="gleich">/, 'gleiche Werte gelb');
  const liste = await seite('/patienten');
  assert.match(liste, new RegExp(`<article class="pat ok dublette" data-hilfe="patienten.kachel" id="p-${neu}"><a class="dublette-marke" href="/patienten/${neu}/dubletten" data-hilfe="kachel.dublette"`));
  assert.match(liste, /data-hilfe="patienten.dubletten">.*2 mögliche Dubletten<\/a>/);
  const nur = await seite('/patienten?dubletten=1');
  assert.match(nur, /Patienten – mögliche Dubletten/);
  assert.equal((nur.match(/class="pat ok dublette"/g) ?? []).length, 2, 'A und der neue');
  assert.ok(!nur.includes('Neuer Patient'), 'kein „+“ im Filter');
  const pseite = await seite(`/patienten/${neu}`);
  assert.match(pseite, /<p class="meldung dublette" data-hilfe="patient.dubletten-hinweis">/);
  assert.match(pseite, /<article class="pat ok kopf dublette"/);
  // Schranke: an der Akte des Ungeklärten entsteht nichts Neues; Stammdaten gehen
  const gesperrt = await post({ aktion: 'rechnung_neu', id: neu!, zurueck: `/patienten/${neu}` });
  assert.match(ziel(gesperrt), /fehler=Erst klären, ob es diesen Patienten schon gibt/);
  const frei = await post({ aktion: 'stammdaten', id: neu!, vorname: 'Hanna', nachname: 'Müller', zurueck: `/patienten/${neu}` });
  assert.match(ziel(frei), /meldung=Stammdaten gespeichert/);
  // Keine Dublette per Formular
  const keine = await post({ aktion: 'dublette_keine', id: neu!, anderer_id: a, zurueck: `/patienten/${neu}/dubletten` });
  assert.match(ziel(keine), new RegExp(`^/patienten/${neu}\\?meldung=Keine Dublette`));
  assert.match(await seite(`/patienten/${neu}/dubletten`), /Keine ungeklärte Dublette/);
  assert.match(ziel(await post({ aktion: 'rechnung_neu', id: neu!, steuerklasse: 'heilbehandlung_steuerfrei', art: 'einzel', zurueck: `/patienten/${neu}` })), /meldung=/, 'danach geht die Akte wieder');
  // Zusammenführen per Formular: ein weiterer Doppelter, A bleibt
  const r2 = await post({ aktion: 'anlegen', vorname: 'Hanna', nachname: 'Mueller', mobil: '0151 1111111', zurueck: '/patienten/neu' });
  const neu2 = /\/patienten\/(\d+)\/dubletten/.exec(ziel(r2))![1]!;
  const zs = await post({ aktion: 'dublette_zusammenfuehren', id: neu2, anderer_id: a, behalten: a, zurueck: `/patienten/${neu2}/dubletten` });
  assert.match(ziel(zs), new RegExp(`^/patienten/${a}\\?meldung=Zusammengeführt: nichts zu verschieben von P-\\d+ nach ${pa.patientennummer}; P-\\d+ ist archiviert und verweist hierher\\.$`), 'die Mobilnummer gab es schon, kein Termin – nichts zu spiegeln');
  const weiter = await fetch(`${basis}/patienten/${neu2}`, { headers: wer, redirect: 'manual' });
  assert.ok([302, 303].includes(weiter.status), `Umleitung statt ${weiter.status}`);
  assert.match(decodeURIComponent(weiter.headers.get('location') ?? ''), new RegExp(`^/patienten/${a}\\?meldung=P-\\d+ wurde in ${pa.patientennummer} zusammengeführt`));
  assert.match(await seite('/patienten/archiv'), new RegExp(`<a class="chip dublette" href="/patienten/${a}">zusammengeführt in ${pa.patientennummer}</a>`));
  // Löschen per Formular: der dritte Doppelte ist leer
  const r3 = await post({ aktion: 'anlegen', vorname: 'Hanna', nachname: 'Müller', zurueck: '/patienten/neu' });
  const neu3 = /\/patienten\/(\d+)\/dubletten/.exec(ziel(r3))![1]!;
  assert.match(ziel(await post({ aktion: 'dublette_loeschen', id: neu3, anderer_id: a, loeschen_id: neu3, zurueck: `/patienten/${neu3}/dubletten` })), new RegExp(`^/patienten/${a}\\?meldung=P-\\d+ gelöscht – es war nichts verknüpft`));
  assert.equal(await patientLesen(db, t, neu3), undefined);
  assert.match(ziel(await post({ aktion: 'dublette_loeschen', id: neu!, anderer_id: a, loeschen_id: '42', zurueck: '/patienten' })), /fehler=Welcher Patient/);
});
