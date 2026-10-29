/** Hausbesuche (W113): Adresstyp, Behandlungsort, Fahrtzeiten aus der Konfiguration, belegte Zeiten, Kalender und Formulare */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { belegteZeiten } from '../src/anfragen/kalender.ts';
import { wochentag } from '../src/anfragen/slots.ts';
import type { Db } from '../src/db/index.ts';
import { karteiDienst } from '../src/kartei/dienst.ts';
import { fahrtenBerechnen, fahrtzeitNach, fahrtzeitOrteLesen, fahrtzeitZwischen, naechsteFahrt, routenLinks, type FahrtRegeln } from '../src/kartei/hausbesuche.ts';
import type { TerminKalender } from '../src/kartei/patienten.ts';
import { einstellungSetzen } from '../src/kartei/konfiguration.ts';
import { adresseSpeichern, KarteiFehler, patientAnlegen, patientLesen, terminAendern, terminAnlegen, terminLesen, termineZeitraum, terminStatus } from '../src/kartei/patienten.ts';
import { testhausbesuchAnlegen } from '../src/kartei/testdaten.ts';
import { praxisDienst } from '../src/server.ts';
import { neuerHauptschluessel, tresor } from '../src/tresor.ts';
import { berlinMitternachtUtc, berlinZeitUtc, heuteBerlin, tagPlus, zeitBerlin } from '../src/zeit.ts';
import { testDb } from './testdb.ts';

const REGELN: FahrtRegeln = { standardMin: 30, innerortsMin: 10, orte: fahrtzeitOrteLesen('Türkheim = 15\n87719: 20 Min.\nquatsch\nMindelheim = 999') };

test('Fahrtzeiten lesen und schätzen: PLZ vor Ort, sonst Standard; innerorts im selben Ort, sonst die längere Praxis-Zeit', () => {
  assert.deepEqual([...REGELN.orte], [['türkheim', 15], ['87719', 20]], 'unlesbare und zu große Zeilen fallen weg');
  assert.equal(fahrtzeitNach({ ort: 'Türkheim', plz: '86842' }, REGELN), 15);
  assert.equal(fahrtzeitNach({ ort: 'Mindelheim', plz: '87719' }, REGELN), 20, 'PLZ-Zeile');
  assert.equal(fahrtzeitNach({ ort: 'Irgendwo', plz: null }, REGELN), 30, 'Standard');
  assert.equal(fahrtzeitZwischen({ ort: 'Bad Wörishofen', plz: '86825' }, { ort: 'bad wörishofen', plz: null }, REGELN), 10, 'gleicher Ort → innerorts');
  assert.equal(fahrtzeitZwischen({ ort: 'Türkheim', plz: '86842' }, { ort: 'Irgendwo', plz: null }, REGELN), 30, 'verschieden → großzügig die längere');
});

test('Nächste Fahrt: hin zum Hausbesuch, weiter zum echten Folgetermin (Praxis oder nächster Hausbesuch), Standard Praxis; Routenlinks', () => {
  const KT: TerminKalender = { id: '1', patientId: '1', vorname: 'Hanna', nachname: 'Hausbesuch', patientennummer: 'T-1051', beginn: '2026-11-10T12:00:00Z', ende: '2026-11-10T12:45:00Z', art: 'behandlung', status: 'bestaetigt', rezept: false, imKalender: false, exchangeEventId: null, leistung: null, sektion: null, behandlungsort: 'hausbesuch', ort: 'Türkheim', adresse: 'Bahnhofstraße 3, 86842 Türkheim', fahrtVorMin: 15, fahrtNachMin: 15 };
  const hugo: TerminKalender = { ...KT, id: '2', patientId: '2', vorname: 'Hugo', nachname: 'Heimweg', beginn: '2026-11-10T14:00:00Z', ende: '2026-11-10T14:30:00Z', ort: 'Bad Wörishofen', adresse: 'Hauptstraße 44, 86825 Bad Wörishofen', fahrtVorMin: 15, fahrtNachMin: 10 };
  const praxisTermin: TerminKalender = { ...KT, id: '3', patientId: '3', vorname: 'Ilse', nachname: 'Innerorts', beginn: '2026-11-10T15:00:00Z', ende: '2026-11-10T15:30:00Z', behandlungsort: 'praxis', ort: null, adresse: null, fahrtVorMin: 0, fahrtNachMin: 0 };
  const praxis = { adresse: 'Kneippstraße 1, 86825 Bad Wörishofen', name: 'Praxis' };
  const um = (iso: string) => new Date(iso);
  // 11:30 UTC: die Fahrt hin beginnt 11:45 – in 15 Minuten, also „jetzt“
  let f = naechsteFahrt([praxisTermin, hugo, KT], um('2026-11-10T11:30:00Z'), praxis)!;
  assert.deepEqual([f.art, f.beginn, f.bis, f.ziel, f.zielText, f.jetzt], ['hin', '2026-11-10T11:45:00.000Z', '2026-11-10T12:00:00Z', KT.adresse, 'Hausbesuch H. H. · Türkheim', true]);
  f = naechsteFahrt([KT, hugo, praxisTermin], um('2026-11-10T09:00:00Z'), praxis)!;
  assert.equal(f.jetzt, false, 'erst in drei Stunden');
  // Während des Hausbesuchs: als Nächstes die Fahrt weiter zu Hugo – nicht Hugos „hin“ (die Fahrt zählt einmal)
  f = naechsteFahrt([KT, hugo, praxisTermin], um('2026-11-10T12:30:00Z'), praxis, { name: (t) => `${t.vorname} ${t.nachname}` })!;
  assert.deepEqual([f.art, f.beginn, f.bis, f.ziel, f.zielText, f.patientId, f.jetzt], ['weiter', '2026-11-10T12:45:00Z', '2026-11-10T14:00:00Z', hugo.adresse, 'Hausbesuch Hugo Heimweg · Bad Wörishofen', '2', true]);
  // Nach Hugo: zurück in die Praxis (echter Folgetermin dort)
  f = naechsteFahrt([KT, hugo, praxisTermin], um('2026-11-10T14:20:00Z'), praxis)!;
  assert.deepEqual([f.art, f.beginn, f.bis, f.ziel, f.zielText, f.patientId], ['weiter', '2026-11-10T14:30:00Z', '2026-11-10T15:00:00Z', praxis.adresse, 'Praxis', undefined]);
  // Ohne Folgetermin: Rückfahrt zur Praxis für die Fahrtzeit „danach“
  f = naechsteFahrt([hugo], um('2026-11-10T14:35:00Z'), praxis)!;
  assert.deepEqual([f.art, f.bis, f.ziel], ['weiter', '2026-11-10T14:40:00.000Z', praxis.adresse]);
  assert.equal(naechsteFahrt([hugo], um('2026-11-10T16:00:00Z'), praxis), null, 'alles vorbei');
  assert.equal(naechsteFahrt([praxisTermin, { ...KT, status: 'abgesagt_praxis' }], um('2026-11-10T11:30:00Z'), praxis), null, 'nur Praxis und Abgesagtes');
  const r = routenLinks('Bahnhofstraße 3, 86842 Türkheim');
  assert.equal(r.apple, 'https://maps.apple.com/?daddr=Bahnhofstra%C3%9Fe%203%2C%2086842%20T%C3%BCrkheim&dirflg=d');
  assert.equal(r.google, 'https://www.google.com/maps/dir/?api=1&destination=Bahnhofstra%C3%9Fe%203%2C%2086842%20T%C3%BCrkheim&travelmode=driving');
});

let basis = '';
let db: Db;
let server: ReturnType<typeof praxisDienst>;
let anna = '';
let bert = '';
let annaTermin = '';
let bertTermin = '';
const t = tresor({ PRAXIS_TRESOR_SCHLUESSEL: neuerHauptschluessel() });
const wer = { 'Tailscale-User-Login': 'lilli@example.org' };
const post = (felder: Record<string, string>) => fetch(`${basis}/patienten/aktion`, { method: 'POST', redirect: 'manual', headers: { ...wer, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(felder).toString() });
const ziel = (r: Response) => decodeURIComponent(r.headers.get('location') ?? '');
const seite = async (pfad: string) => (await fetch(`${basis}${pfad}`, { headers: wer })).text();
// Ein Montag mindestens acht Tage voraus
const MONTAG = (() => { let d = tagPlus(heuteBerlin(), 8); while (wochentag(d) !== 1) d = tagPlus(d, 1); return d; })();

before(async () => {
  db = await testDb();
  server = praxisDienst({ erlaubt: ['lilli@example.org'], fassung: 't', angemeldet: async () => true, pruefen: async () => [], kartei: karteiDienst({ db, tresor: t }) });
  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await einstellungSetzen(db, 'oeffnungszeiten', 'Mo 08:00-18:00; Di 08:00-18:00; Mi 08:00-18:00; Do 08:00-18:00; Fr 08:00-18:00', 'x');
  await einstellungSetzen(db, 'termin_puffer_min', '10', 'x');
  await einstellungSetzen(db, 'fahrtzeit_standard_min', '30', 'x');
  await einstellungSetzen(db, 'fahrtzeit_innerorts_min', '10', 'x');
  await einstellungSetzen(db, 'fahrtzeit_orte', 'Türkheim = 15', 'x');
  anna = await patientAnlegen(db, t, { vorname: 'Anna', nachname: 'Anfahrt', kontakte: [{ art: 'email', wert: 'anna@example.org' }], adresse: { bezeichnung: 'Zuhause', zusatz: null, strasse: 'Kneippstraße', hausnummer: '1', plz: '86825', ort: 'Bad Wörishofen' } }, 'x');
  bert = await patientAnlegen(db, t, { vorname: 'Bert', nachname: 'Besuch', kontakte: [{ art: 'email', wert: 'bert@example.org' }], adresse: { bezeichnung: 'Zuhause', zusatz: null, strasse: 'Bahnhofstraße', hausnummer: '3', plz: '86842', ort: 'Türkheim' } }, 'x');
  await adresseSpeichern(db, bert, { bezeichnung: 'Pflegeheim', strasse: 'Bahnhofstraße', hausnummer: '3', plz: '86842', ort: 'Türkheim', typ: 'hausbesuch' }, 'x');
});
after(() => server.close());

test('Hausbesuch anlegen: Rechnungsadresse wird als Hausbesuchadresse übernommen, Fahrt davor und danach aus dem Standard', async () => {
  annaTermin = await terminAnlegen(db, anna, { datum: MONTAG, zeit: '09:00', dauerMin: 30, behandlungsort: 'rechnung_kopieren' }, 'x');
  const p = (await patientLesen(db, t, anna))!;
  assert.deepEqual(p.adressen.map((a) => [a.typ, a.rechnungsadresse, a.bezeichnung]), [['rechnung', true, 'Zuhause'], ['hausbesuch', false, 'Hausbesuch']]);
  const d = (await terminLesen(db, anna, annaTermin))!;
  assert.equal(d.behandlungsort, 'hausbesuch');
  assert.equal(d.adresseId, p.adressen[1]!.id);
  assert.deepEqual([d.fahrtVorMin, d.fahrtNachMin, d.fahrtManuell], [30, 30, false], 'Bad Wörishofen hat keine eigene Zeile → Standard');
  // Noch ein Hausbesuch mit „übernehmen“ legt keine zweite Hausbesuchadresse an
  const zweiter = await terminAnlegen(db, anna, { datum: tagPlus(MONTAG, 1), zeit: '09:00', dauerMin: 30, behandlungsort: 'rechnung_kopieren' }, 'x');
  assert.equal((await patientLesen(db, t, anna))!.adressen.length, 2);
  await terminStatus(db, anna, zweiter, 'abgesagt_praxis', 'x');
});

test('Nachbarn am selben Tag: Fahrt zwischen zwei Hausbesuchen hängt am zweiten, zurück erst vor einem Praxistermin; belegte Zeiten enthalten die Fahrt', async () => {
  bertTermin = await terminAnlegen(db, bert, { datum: MONTAG, zeit: '10:30', dauerMin: 30, behandlungsort: `adresse:${(await patientLesen(db, t, bert))!.adressen[1]!.id}` }, 'x');
  let a = (await terminLesen(db, anna, annaTermin))!;
  let b = (await terminLesen(db, bert, bertTermin))!;
  assert.deepEqual([a.fahrtVorMin, a.fahrtNachMin], [30, 0], 'nach Anna kommt ein Hausbesuch – die Fahrt gehört zu Bert');
  assert.deepEqual([b.fahrtVorMin, b.fahrtNachMin], [30, 15], 'Bad Wörishofen → Türkheim: die längere der beiden (30); zurück 15 (eigene Zeile)');
  const praxis = await terminAnlegen(db, anna, { datum: MONTAG, zeit: '12:00', dauerMin: 30 }, 'x');
  b = (await terminLesen(db, bert, bertTermin))!;
  assert.deepEqual([b.fahrtVorMin, b.fahrtNachMin], [30, 15], 'Praxistermin danach ändert nichts an der Rückfahrt');
  const belegt = (await belegteZeiten(undefined, db, berlinMitternachtUtc(MONTAG), berlinMitternachtUtc(tagPlus(MONTAG, 1)), { pufferMin: 10 })).map((x) => [zeitBerlin(x.beginn), zeitBerlin(x.ende)]);
  assert.deepEqual(belegt, [['08:30', '09:40'], ['10:00', '11:25'], ['12:00', '12:40']], 'Fahrt davor, Termin, Pause, Fahrt danach');
  // Von Hand: bleibt beim Neurechnen stehen
  await terminAendern(db, bert, bertTermin, { datum: MONTAG, zeit: '10:30', dauerMin: 30, behandlungsort: `adresse:${b.adresseId}`, fahrtVorMin: 5, fahrtNachMin: 5 }, 'x');
  await terminStatus(db, anna, praxis, 'abgesagt_praxis', 'x');
  b = (await terminLesen(db, bert, bertTermin))!;
  assert.deepEqual([b.fahrtVorMin, b.fahrtNachMin, b.fahrtManuell], [5, 5, true]);
  a = (await terminLesen(db, anna, annaTermin))!;
  assert.deepEqual([a.fahrtVorMin, a.fahrtNachMin], [30, 0]);
  const e = await fahrtenBerechnen(db, MONTAG);
  assert.equal(e.kollisionen, 0);
  // Zurück auf automatisch: Felder leer
  await terminAendern(db, bert, bertTermin, { datum: MONTAG, zeit: '10:30', dauerMin: 30, behandlungsort: `adresse:${b.adresseId}` }, 'x');
  b = (await terminLesen(db, bert, bertTermin))!;
  assert.deepEqual([b.fahrtVorMin, b.fahrtNachMin, b.fahrtManuell], [30, 15, false]);
});

test('Plausibilität: Hausbesuch ohne Adresse, fremde Adresse, Praxis ohne Fahrt; Überschneidung wird gezählt', async () => {
  const ohne = await patientAnlegen(db, t, { vorname: 'Olaf', nachname: 'Ohne', kontakte: [{ art: 'email', wert: 'olaf@example.org' }] }, 'x');
  await assert.rejects(terminAnlegen(db, ohne, { datum: MONTAG, zeit: '14:00', dauerMin: 30, behandlungsort: 'rechnung_kopieren' }, 'x'), KarteiFehler);
  await assert.rejects(terminAnlegen(db, ohne, { datum: MONTAG, zeit: '14:00', dauerMin: 30, behandlungsort: `adresse:${(await patientLesen(db, t, bert))!.adressen[1]!.id}` }, 'x'), /gehört nicht/);
  await assert.rejects(terminAnlegen(db, ohne, { datum: MONTAG, zeit: '14:00', dauerMin: 30, behandlungsort: 'unsinn' }, 'x'), KarteiFehler);
  const praxis = await terminAnlegen(db, ohne, { datum: MONTAG, zeit: '14:00', dauerMin: 30, behandlungsort: 'praxis', fahrtVorMin: 20, fahrtNachMin: 20 }, 'x');
  const d = (await terminLesen(db, ohne, praxis))!;
  assert.deepEqual([d.behandlungsort, d.fahrtVorMin, d.fahrtNachMin, d.fahrtManuell], ['praxis', 0, 0, false], 'Fahrt nur bei Hausbesuchen');
  // Ein Praxistermin direkt nach Berts Hausbesuch (11:00 + 10 Pause + 15 Fahrt = 11:25) überschneidet sich mit der Rückfahrt
  const r = await post({ aktion: 'termin_anlegen', id: ohne, datum: MONTAG, zeit: '11:10', dauer_min: '30', behandlungsort: 'praxis', zurueck: `/patienten/${ohne}` });
  assert.match(ziel(r), /Achtung: 1 Überschneidung mit Fahrtzeiten/);
});

test('Oberfläche: Terminformular mit Behandlungsort und Fahrt, Adressformular mit Art, Kalender mit Marke und Fahrt-Blöcken, Konfiguration', async () => {
  const formAnna = await seite(`/patienten/${anna}/neu/termin`);
  assert.match(formAnna, /<select name="behandlungsort" data-hilfe="termin.behandlungsort"><option value="praxis" selected>Praxis<\/option><option value="adresse:\d+">Hausbesuch: Hausbesuch, Kneippstraße 1, 86825 Bad Wörishofen<\/option><\/select>/);
  assert.match(formAnna, /name="fahrt_vor_min"[^>]*placeholder="automatisch"/);
  const ohneHaus = await patientAnlegen(db, t, { vorname: 'Nora', nachname: 'Neu', kontakte: [{ art: 'email', wert: 'nora@example.org' }], adresse: { bezeichnung: 'Zuhause', zusatz: null, strasse: 'Weg', hausnummer: '1', plz: '86825', ort: 'Bad Wörishofen' } }, 'x');
  assert.match(await seite(`/patienten/${ohneHaus}/neu/termin`), /<option value="rechnung_kopieren">Hausbesuch: Rechnungsadresse als Hausbesuchadresse übernehmen \(Zuhause, Weg 1, 86825 Bad Wörishofen\)<\/option>/);
  const bearbeiten = await seite(`/patienten/${bert}/termine/${bertTermin}/bearbeiten`);
  assert.match(bearbeiten, /<option value="adresse:\d+" selected>Hausbesuch: Pflegeheim/);
  assert.match(bearbeiten, /name="fahrt_vor_min"[^>]*value=""[^>]*placeholder="automatisch: 30"/);
  assert.match(await seite(`/patienten/${bert}/adressen/neu`), /<select name="typ" data-hilfe="adresse.typ"><option value="rechnung" selected>Rechnungs-\/Wohnadresse<\/option><option value="hausbesuch">Hausbesuchadresse<\/option><option value="betreuer">Vormund \/ Betreuer<\/option><\/select>/);
  const patientenseite = await seite(`/patienten/${bert}`);
  assert.match(patientenseite, /<span class="marke hausbesuch" data-hilfe="adresse.typ" tabindex="0">[\s\S]*?Hausbesuchadresse<\/span>/);
  assert.match(patientenseite, /data-hilfe="termin.hausbesuch" tabindex="0">[\s\S]*?Hausbesuch · Türkheim<\/span>/);
  const tag = await seite(`/kalender?ansicht=tag&tag=${MONTAG}`);
  assert.match(tag, /data-hilfe="kalender.hausbesuch">[\s\S]*?Hausbesuch · Türkheim<\/span>/);
  assert.match(tag, /<div class="kal-termin fahrt" data-hilfe="kalender.fahrt"><b>[\s\S]*?10:00–10:30<\/b><span>Fahrt zum Hausbesuch · 30 Min\. · <a class="route" href="https:\/\/maps\.apple\.com\/\?daddr=Bahnhofstra%C3%9Fe%203%2C%2086842%20T%C3%BCrkheim&amp;dirflg=d" target="_blank" rel="noopener" data-hilfe="kalender.route">Karten<\/a> · <a class="route" href="https:\/\/www\.google\.com\/maps\/dir\/\?api=1&amp;destination=[^"]+" target="_blank" rel="noopener" data-hilfe="kalender.route">Google Maps<\/a><\/span><\/div>/);
  assert.match(tag, /11:00–11:15<\/b><span>Fahrt zurück · 15 Min\. · <a class="route" href="https:\/\/maps\.apple\.com\/\?daddr=Praxis%20Lilli%20Nebel&amp;dirflg=d"/, 'ohne Praxisadresse sucht die Karten-App den Praxisnamen');
  assert.match(tag, /data-hilfe="kalender.termin-absagen">[\s\S]*?absagen<\/a><span class="hint"><a class="route" href="https:\/\/maps\.apple\.com\/\?daddr=Bahnhofstra/, 'Routenlink am Hausbesuch-Termin');
  const monat = await seite(`/kalender?ansicht=monat&monat=${MONTAG.slice(0, 7)}`);
  assert.match(monat, /<span class="mk-e fahrt"><small>10:00–10:30 \(30\)<\/small> Fahrt<\/span>/);
  assert.match(monat, /<title>Hausbesuch<\/title>/);
  const termine = await termineZeitraum(db, berlinMitternachtUtc(MONTAG), berlinMitternachtUtc(tagPlus(MONTAG, 1)));
  assert.deepEqual(termine.filter((x) => x.status === 'bestaetigt').map((x) => [x.behandlungsort, x.ort, x.fahrtVorMin, x.fahrtNachMin]), [['hausbesuch', 'Bad Wörishofen', 30, 0], ['hausbesuch', 'Türkheim', 30, 15], ['praxis', null, 0, 0], ['praxis', null, 0, 0]]);
  const konf = await seite('/konfiguration');
  assert.match(konf, /<h2 id="fahrtzeiten">Hausbesuche: Fahrtzeiten<\/h2>/);
  assert.match(konf, /<textarea name="fahrtzeit_orte"[^>]*>Türkheim = 15<\/textarea>/);
  const r = await post({ aktion: 'fahrtzeiten_setzen', fahrtzeit_standard_min: '25', fahrtzeit_innerorts_min: '5', fahrtzeit_orte: 'Türkheim = 15\n\n87719 = 20', zurueck: '/konfiguration' });
  assert.match(ziel(r), /Fahrtzeiten gespeichert: Standard 25 Min\., innerorts 5 Min\., 2 Orte/);
  assert.match(ziel(await post({ aktion: 'fahrtzeiten_setzen', fahrtzeit_standard_min: '25', fahrtzeit_innerorts_min: '5', fahrtzeit_orte: 'Türkheim 15', zurueck: '/konfiguration' })), /fehler=Zeile nicht lesbar: „Türkheim 15“/);
  assert.match(ziel(await post({ aktion: 'fahrtzeiten_setzen', fahrtzeit_standard_min: '300', fahrtzeit_innerorts_min: '5', zurueck: '/konfiguration' })), /fehler=Standard-Fahrtzeit: 0 bis 240/);
});

test('Hausbesuch-Testdaten (W113): laufen einmal, Fahrt am Dienstag 15 + 15, am Mittwoch hängt die Fahrt zwischen den beiden am zweiten', async () => {
  await einstellungSetzen(db, 'fahrtzeit_standard_min', '30', 'x');
  const h = await testhausbesuchAnlegen(db, t, { adresse: 'shopping@2late.de', wer: 'test' });
  assert.deepEqual([h.uebersprungen, h.patienten, h.termine], [false, 3, 5]);
  assert.ok((await testhausbesuchAnlegen(db, t, { adresse: 'shopping@2late.de', wer: 'test' })).uebersprungen);
  const hanna = (await db.query<{ id: string }>("SELECT id::text FROM patient WHERE patientennummer = 'T-1051'")).rows[0]!.id;
  const p = (await patientLesen(db, t, hanna))!;
  assert.deepEqual(p.adressen.map((a) => a.typ), ['rechnung', 'hausbesuch', 'betreuer']);
  const termine = (await db.query<{ ort: string; vor: number; nach: number }>(
    "SELECT pa.ort, t.fahrt_vor_min AS vor, t.fahrt_nach_min AS nach FROM termin t JOIN patient p ON p.id = t.patient_id LEFT JOIN patient_adresse pa ON pa.id = t.adresse_id WHERE p.patientennummer IN ('T-1051', 'T-1052') ORDER BY t.beginn",
  )).rows;
  assert.deepEqual(termine.map((x) => [x.ort, x.vor, x.nach]), [['Türkheim', 15, 15], ['Türkheim', 15, 0], ['Bad Wörishofen', 30, 30]], 'Mittwoch: Türkheim → Bad Wörishofen die längere der beiden Praxis-Zeiten (Standard 30), zurück 30 – danach Ilse in der Praxis');
  // Cockpit an diesem Mittwoch um 13:30: die nächste Fahrt ist die hin nach Türkheim (13:45), danach weiter zu Hugo, dann zurück in die Praxis zu Ilse
  const mittwoch = (await db.query<{ tag: string }>("SELECT to_char(min(t.beginn) AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS tag FROM termin t JOIN patient p ON p.id = t.patient_id WHERE p.patientennummer = 'T-1052'")).rows[0]!.tag;
  const { cockpitDaten } = await import('../src/cockpit/daten.ts');
  const um = async (zeit: string) => (await cockpitDaten({ db, namenZeigen: false, jetzt: new Date(berlinZeitUtc(mittwoch, zeit)) })).fahrt!;
  let f = await um('13:30');
  assert.deepEqual([f.art, zeitBerlin(f.beginn), f.zielText, f.jetzt], ['hin', '13:45', 'Hausbesuch H. H. · Türkheim', true]);
  f = await um('14:20');
  assert.deepEqual([f.art, zeitBerlin(f.beginn), f.zielText, f.ziel], ['weiter', '14:30', 'Hausbesuch H. H. · Bad Wörishofen', 'Hauptstraße 44, 86825 Bad Wörishofen']);
  f = await um('15:25');
  assert.deepEqual([f.art, zeitBerlin(f.beginn), f.zielText, f.ziel], ['weiter', '15:30', 'Praxis', 'Praxis Lilli Nebel'], 'Rückfahrt zum echten Folgetermin in der Praxis');
  const cockpit = (await seite('/')).length;
  assert.ok(cockpit > 0);
});
