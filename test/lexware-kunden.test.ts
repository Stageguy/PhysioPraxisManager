/** Lexware-Kunden neben der Kartei (W99): Kundenkarte aus dem Kontakt, Zwischenspeicher, Abgleich, Zuordnen, Anlegen mit Vorbelegung */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import type { Db } from '../src/db/index.ts';
import { karteiDienst } from '../src/kartei/dienst.ts';
import { namensschluessel } from '../src/kartei/lexware-kunden.ts';
import { LexwareClient, type Kontakt } from '../src/lexware/client.ts';
import { attrappeKunden, kundeAus, lexwareKunden, personAusFirma, strasseTeilen, type LexwareKunde, type LexwareKunden } from '../src/lexware/kunden.ts';
import { attrappeRechnungen } from '../src/lexware/rechnungen.ts';
import { praxisDienst } from '../src/server.ts';
import { neuerHauptschluessel, tresor } from '../src/tresor.ts';
import { testDb } from './testdb.ts';

test('Kundenkarte aus dem Lexware-Kontakt: Person, Firma mit Ansprechpartner, Firma mit Personennamen, Adresse geteilt', () => {
  const person: Kontakt = {
    id: 'k1', version: 1, roles: { customer: { number: 10001 } }, person: { salutation: 'Frau', firstName: 'Anna', lastName: 'Test' },
    addresses: { billing: [{ street: 'Kurpromenade 3a', zip: '86825', city: 'Bad Wörishofen', countryCode: 'DE', supplement: 'Hinterhaus' }] },
    emailAddresses: { business: ['Anna@Example.org'], private: ['Privat@example.org'] }, phoneNumbers: { business: ['08247 1'], mobile: ['0151 2'] }, note: 'x', archived: false,
  };
  const k = kundeAus(person);
  assert.deepEqual([k.nummer, k.art, k.anrede, k.vorname, k.nachname, k.firma, k.email, k.telefon, k.notiz, k.archiviert], ['10001', 'person', 'Frau', 'Anna', 'Test', null, 'privat@example.org', '0151 2', true, false]);
  assert.deepEqual(k.adresse, { zusatz: 'Hinterhaus', strasse: 'Kurpromenade', hausnummer: '3a', plz: '86825', ort: 'Bad Wörishofen', land: 'DE' });
  const firma = kundeAus({ id: 'k2', version: 1, roles: { customer: { number: 10002 } }, company: { name: 'Kurhotel Sonnenhof GmbH', contactPersons: [{ firstName: 'Max', lastName: 'Leiter', primary: true, salutation: 'Herr' }] } });
  assert.deepEqual([firma.art, firma.firma, firma.vorname, firma.nachname, firma.anrede, firma.adresse, firma.email], ['firma', 'Kurhotel Sonnenhof GmbH', 'Max', 'Leiter', 'Herr', null, null]);
  const geraten = kundeAus({ id: 'k3', version: 1, roles: { customer: { number: 10003 } }, company: { name: 'Yvonne Zeller' } });
  assert.deepEqual([geraten.art, geraten.vorname, geraten.nachname], ['firma', 'Yvonne', 'Zeller']);
  const nurFirma = kundeAus({ id: 'k4', version: 1, roles: { customer: { number: 10004 } }, company: { name: 'Praxis am Park' } });
  assert.deepEqual([nurFirma.vorname, nurFirma.nachname], ['', 'Praxis am Park']);
  assert.equal(kundeAus({ id: 'k5', version: 1, roles: {} }).nummer, '', 'ohne Kundenrolle keine Nummer');
  assert.deepEqual(strasseTeilen('Hauptstraße 12 - 14'), { strasse: 'Hauptstraße', hausnummer: '12-14' });
  assert.deepEqual(strasseTeilen('Postfach'), { strasse: 'Postfach', hausnummer: null });
  assert.equal(personAusFirma('Müller & Söhne'), null);
  assert.equal(personAusFirma('Hotel Sonne'), null);
  assert.equal(namensschluessel('Zoë', 'Groß-Müller'), 'zoe gross muller');
});

test('Client liest Kontakte seitenweise; die Quelle hält sie fünf Minuten und teilt einen laufenden Abruf', async () => {
  const seiten: string[] = [];
  const abruf = (async (url: string) => {
    const u = new URL(url);
    seiten.push(u.search);
    const page = Number(u.searchParams.get('page'));
    return Response.json({ content: [{ id: `k${page}`, version: 1, roles: { customer: { number: 100 + page } }, person: { firstName: 'P', lastName: `Nr${page}` } }], last: page === 1 });
  }) as typeof fetch;
  let zeit = 0;
  const quelle = lexwareKunden(new LexwareClient('k', { abruf, abstandMs: 0 }), { haltbarMs: 1000, jetzt: () => zeit });
  const [a, b] = await Promise.all([quelle.alle(), quelle.alle()]);
  assert.deepEqual(a.kunden.map((k) => k.nummer), ['100', '101']);
  assert.equal(a, b, 'ein Abruf für beide');
  assert.deepEqual(seiten, ['?customer=true&page=0&size=250', '?customer=true&page=1&size=250']);
  await quelle.alle();
  assert.equal(seiten.length, 2, 'innerhalb der Haltbarkeit aus dem Speicher');
  zeit = 2000;
  await quelle.alle();
  assert.equal(seiten.length, 4, 'abgelaufen → neu gelesen');
  await quelle.alle({ neu: true });
  assert.equal(seiten.length, 6, 'neu = sofort neu gelesen');
  assert.equal(quelle.attrappe, false);
});

test('Attrappe: erfundene Kunden mit Namen aus den Testdaten, nur Testadressen', async () => {
  const { kunden } = await attrappeKunden().alle();
  assert.ok(kunden.length >= 6);
  assert.ok(kunden.some((k) => k.vorname === 'Anna' && k.nachname === 'Beispiel'));
  assert.ok(kunden.every((k) => !k.email || /@2late\.de$/.test(k.email)), 'nur Testadressen');
  assert.equal(attrappeKunden().attrappe, true);
});

// ── Dienst und Seiten ───────────────────────────────────────────────────────
let basis = '';
let db: Db;
let server: ReturnType<typeof praxisDienst>;
const t = tresor({ PRAXIS_TRESOR_SCHLUESSEL: neuerHauptschluessel() });
const wer = { 'Tailscale-User-Login': 'lilli@example.org' };
const post = (felder: Record<string, string>) => fetch(`${basis}/patienten/aktion`, { method: 'POST', redirect: 'manual', headers: { ...wer, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(felder).toString() });
const ziel = (r: Response) => decodeURIComponent(r.headers.get('location') ?? '');
const seite = async (pfad: string) => (await fetch(`${basis}${pfad}`, { headers: wer })).text();
const anzahl = async () => Number((await db.query<{ n: string }>('SELECT count(*)::text AS n FROM patient')).rows[0]!.n);

const adresse = { zusatz: null, strasse: 'Hauptstraße', hausnummer: '12', plz: '86825', ort: 'Bad Wörishofen', land: 'DE' };
const KUNDEN: LexwareKunde[] = [
  { id: 'lx-1', nummer: '1001', art: 'person', anrede: 'Frau', vorname: 'Anna', nachname: 'Test', firma: null, email: 'anna@example.org', telefon: '0151 1234567', adresse, notiz: false, archiviert: false },
  { id: 'lx-2', nummer: '1002', art: 'person', anrede: 'Herr', vorname: 'Bernd', nachname: 'Neu', firma: null, email: 'bernd@example.org', telefon: '08247 4711', adresse, notiz: true, archiviert: false },
  { id: 'lx-3', nummer: '1003', art: 'firma', anrede: null, vorname: 'Yvonne', nachname: 'Zeller', firma: 'Yvonne Zeller', email: null, telefon: null, adresse: null, notiz: false, archiviert: false },
];
let kaputt = false;
const quelle: LexwareKunden = {
  attrappe: true,
  alle: async () => {
    if (kaputt) throw new Error('503 Lexware');
    return { kunden: KUNDEN, stand: '2026-10-27T10:00:00Z' };
  },
};

before(async () => {
  db = await testDb();
  server = praxisDienst({ erlaubt: ['lilli@example.org'], fassung: 't', angemeldet: async () => true, pruefen: async () => [], kartei: karteiDienst({ db, tresor: t, lexware: quelle, lexwareRechnungen: attrappeRechnungen() }) });
  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

let annaId = '';
test('Patientenliste bietet „Aus Lexware“; die Seite gruppiert nach dem Stand in der Kartei', async () => {
  annaId = /\/patienten\/(\d+)/.exec(ziel(await post({ aktion: 'anlegen', vorname: 'Anna', nachname: 'Test' })))![1]!;
  assert.match(await seite('/patienten'), /href="\/patienten\/lexware" data-hilfe="patienten.lexware"/);
  const html = await seite('/patienten/lexware');
  assert.match(html, /3 Kunden in Lexware · Stand /);
  assert.match(html, /0 verknüpft · 1 wahrscheinlich bekannt · 2 noch nicht in der Kartei · <b>erfundene Kunden<\/b>/);
  assert.match(html, /id="lexware-neu"[\s\S]*id="lx-1002"[\s\S]*id="lx-1003"/, 'neu: Bernd und die Firma');
  assert.match(html, /id="lexware-vermutet"[\s\S]*id="lx-1001"[\s\S]*Zuordnen: Anna Test \(/, 'vermutet: Anna');
  assert.match(html, /id="lx-1003"[\s\S]{0,400}<span class="marke">Firma<\/span> <span class="marke">als Person: Yvonne Zeller\?<\/span>/);
  assert.match(html, /Notiz in Lexware/);
  assert.doesNotMatch(html, /lexware-verknuepft/);
  // Sammelübernahme (W99b): die Gruppe „neu“ ist ein Formular mit Haken je Kachel
  assert.match(html, /<form method="post" action="\/patienten\/aktion" class="lx-mehrere">[\s\S]{0,600}data-hilfe="lexware.anlegen-mehrere"/, 'Formular um die Gruppe „neu“');
  assert.match(html, /<input type="checkbox" name="kunde" value="1002" data-hilfe="lexware.auswahl">/);
  assert.match(html, /<input type="checkbox" name="kunde" value="1003" data-hilfe="lexware.auswahl">/, 'Firma mit Personenname wählbar');
  assert.match(html, /<a class="knopf primaer" href="\/patienten\/neu\?lexware=1002" data-hilfe="lexware.anlegen">Als Patient anlegen<\/a>/);
  const s = await seite('/patienten/lexware?suche=bernd');
  assert.match(s, /id="lx-1002"/);
  assert.doesNotMatch(s, /id="lx-1001"/);
  assert.match(s, /1 Kunde passend/);
});

test('Zuordnen schreibt nur die Kundennummer an den Patienten; eine Nummer nur einmal; Lösen nimmt sie weg', async () => {
  const r = await post({ aktion: 'lexware_zuordnen', id: annaId, kundennummer: '1001', kontakt_id: 'lx-1', zurueck: '/patienten/lexware' });
  assert.equal(r.status, 303);
  assert.match(ziel(r), /\/patienten\/lexware\?meldung=Lexware-Kunde 1001 ist jetzt Anna Test zugeordnet\.#lx-1001$/);
  assert.deepEqual((await db.query('SELECT lexware_kundennummer AS n, lexware_kontakt_id AS k FROM patient WHERE id = $1', [annaId])).rows[0], { n: '1001', k: 'lx-1' });
  assert.match(await seite(`/patienten/${annaId}`), /Lexware 1001/);
  let html = await seite('/patienten/lexware');
  assert.match(html, /1 verknüpft · 0 wahrscheinlich bekannt · 2 noch nicht in der Kartei/);
  assert.match(html, /id="lexware-verknuepft"[\s\S]*id="lx-1001"[\s\S]*data-hilfe="lexware.patient"[\s\S]*data-hilfe="lexware.loesen"/);
  // Zweite Anna: die Nummer ist vergeben
  const zweite = /\/patienten\/(\d+)/.exec(ziel(await post({ aktion: 'anlegen', vorname: 'Anna', nachname: 'Test' })))![1]!;
  const doppelt = await post({ aktion: 'lexware_zuordnen', id: zweite, kundennummer: '1001', zurueck: '/patienten/lexware' });
  assert.match(ziel(doppelt), /fehler=Lexware-Kunde 1001 ist schon Patient .* zugeordnet/);
  assert.match(ziel(await post({ aktion: 'lexware_zuordnen', id: zweite, kundennummer: 'abc', zurueck: '/patienten/lexware' })), /fehler=Keine Lexware-Kundennummer/);
  // Lösen
  const l = await post({ aktion: 'lexware_loesen', id: annaId, zurueck: '/patienten/lexware' });
  assert.match(ziel(l), /meldung=Verknüpfung mit Lexware-Kunde 1001 gelöst\.#lx-1001$/);
  assert.equal((await db.query<{ n: string | null }>('SELECT lexware_kundennummer AS n FROM patient WHERE id = $1', [annaId])).rows[0]!.n, null);
  html = await seite('/patienten/lexware');
  assert.match(html, /id="lexware-vermutet"[\s\S]*id="lx-1001"/, 'wieder vermutet – eine der beiden Annas');
  await post({ aktion: 'archivieren', id: zweite });
});

test('„Als Patient anlegen“: Formular aus der Kundenkarte vorbelegt; Anlegen verknüpft; keine doppelte Nummer, kein halber Patient', async () => {
  const f = await seite('/patienten/neu?lexware=1002');
  assert.match(f, /Aus <a href="\/patienten\/lexware#lx-1002">Lexware-Kunde 1002<\/a> „Bernd Neu“/);
  assert.match(f, /name="lexware_kundennummer" value="1002"><input type="hidden" name="lexware_kontakt_id" value="lx-2">/);
  assert.match(f, /name="zurueck" value="\/patienten\/neu\?lexware=1002"/);
  for (const [feld, wert] of [['anrede', 'Herr'], ['vorname', 'Bernd'], ['nachname', 'Neu'], ['mobil', ''], ['telefon', '08247 4711'], ['email', 'bernd@example.org'], ['adr_0_strasse', 'Hauptstraße'], ['adr_0_hausnummer', '12'], ['adr_0_plz', '86825'], ['adr_0_ort', 'Bad Wörishofen']]) {
    assert.match(f, new RegExp(`name="${feld}"[^>]*value="${wert}"`), feld);
  }
  assert.match(await seite('/patienten/neu?lexware=1001'), /name="mobil"[^>]*value="0151 1234567"/, 'Mobilnummer an der Vorwahl erkannt');
  assert.match(await seite('/patienten/neu?lexware=1003'), /In Lexware ist das eine Firma – Vor- und Nachname sind geraten/);
  assert.match(await seite('/patienten/neu?lexware=9999'), /Lexware-Kunde 9999 ist nicht bekannt/);
  const r = await post({ aktion: 'anlegen', vorname: 'Bernd', nachname: 'Neu', telefon: '08247 4711', email: 'bernd@example.org', strasse: 'Hauptstraße', hausnummer: '12', plz: '86825', ort: 'Bad Wörishofen', lexware_kundennummer: '1002', lexware_kontakt_id: 'lx-2', zurueck: '/patienten/neu?lexware=1002' });
  assert.match(ziel(r), /\/patienten\/\d+\?meldung=Patient angelegt und mit Lexware-Kunde 1002 verknüpft\./);
  const bid = /\/patienten\/(\d+)/.exec(ziel(r))![1]!;
  assert.deepEqual((await db.query('SELECT lexware_kundennummer AS n, lexware_kontakt_id AS k FROM patient WHERE id = $1', [bid])).rows[0], { n: '1002', k: 'lx-2' });
  assert.match(await seite('/patienten/lexware'), /id="lexware-verknuepft"[\s\S]*id="lx-1002"/);
  const vorher = await anzahl();
  const d = await post({ aktion: 'anlegen', vorname: 'Bernd', nachname: 'Zwei', lexware_kundennummer: '1002', zurueck: '/patienten/neu?lexware=1002' });
  assert.match(ziel(d), /fehler=Lexware-Kunde 1002 ist schon Patient .* zugeordnet/);
  assert.equal(await anzahl(), vorher, 'kein Patient entstanden');
});

test('Lexware nicht erreichbar: Seite bleibt bedienbar mit Hinweis; ohne Anbindung gibt es weder Knopf noch Seite', async () => {
  kaputt = true;
  const html = await seite('/patienten/lexware');
  assert.match(html, /Lexware ist gerade nicht erreichbar – 503 Lexware/);
  assert.doesNotMatch(html, /class="pat lexware/);
  assert.match(await seite('/patienten/neu?lexware=1002'), /Lexware-Kunde 1002 ist nicht bekannt/);
  kaputt = false;
  const ohne = praxisDienst({ erlaubt: ['lilli@example.org'], fassung: 't', angemeldet: async () => true, pruefen: async () => [], kartei: karteiDienst({ db, tresor: t }) });
  await new Promise<void>((f) => ohne.listen(0, '127.0.0.1', f));
  const b2 = `http://127.0.0.1:${(ohne.address() as AddressInfo).port}`;
  try {
    assert.equal((await fetch(`${b2}/patienten/lexware`, { headers: wer })).status, 404);
    assert.doesNotMatch(await (await fetch(`${b2}/patienten`, { headers: wer })).text(), /patienten\.lexware/);
  } finally {
    ohne.close();
  }
});

test('Sammelübernahme (W99b): markierte Kunden werden Patienten; schon verknüpfte und unbekannte werden übersprungen', async () => {
  const r = await post({ aktion: 'lexware_anlegen_mehrere', zurueck: '/patienten/lexware' });
  assert.match(ziel(r), /fehler=Keine Kunden ausgewählt/);
  const f = new URLSearchParams([['aktion', 'lexware_anlegen_mehrere'], ['kunde', '1003'], ['kunde', '1002'], ['kunde', '9999'], ['zurueck', '/patienten/lexware']]);
  const s = await fetch(`${basis}/patienten/aktion`, { method: 'POST', redirect: 'manual', headers: { ...wer, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/x-www-form-urlencoded' }, body: f.toString() });
  assert.match(ziel(s), /meldung=1 Patient aus Lexware angelegt\. Übersprungen: 1002 \(schon verknüpft\), 9999 \(nicht in Lexware\)\./);
  const yvonne = (await db.query<Record<string, unknown>>("SELECT id::text, vorname, nachname, lexware_kundennummer AS n, lexware_kontakt_id AS k FROM patient WHERE lexware_kundennummer = '1003'")).rows[0]!;
  assert.deepEqual([yvonne.vorname, yvonne.nachname, yvonne.n, yvonne.k], ['Yvonne', 'Zeller', '1003', 'lx-3']);
  const html = await seite('/patienten/lexware');
  assert.match(html, /id="lexware-verknuepft"[\s\S]*id="lx-1003"/);
  assert.doesNotMatch(html, /id="lexware-neu"/, 'niemand mehr ohne Kartei');
});

test('Feldabgleich (W99b, E30b): Lexware-Werte erscheinen als Abweichungen, kommen nur per Klick; Patient als Kunde nach Lexware', async () => {
  await post({ aktion: 'lexware_zuordnen', id: annaId, kundennummer: '1001', kontakt_id: 'lx-1', zurueck: '/patienten/lexware' });
  let html = await seite(`/patienten/${annaId}`);
  assert.match(html, /data-hilfe="patient.lexware-abgleich"[^>]*><p><b>Lexware-Kunde 1001:<\/b> 4 Felder weicht ab/);
  for (const t of ['Anrede', 'E-Mail', 'Telefon', 'Rechnungsadresse']) assert.match(html, new RegExp(`<li><b>${t}</b>: hier „–“ · Lexware „`), t);
  assert.doesNotMatch(html, /patient\.lexware-kunde"/, 'schon Kunde – kein Anlegen-Knopf');
  let r = await post({ aktion: 'lexware_uebernehmen', id: annaId, feld: 'email', zurueck: `/patienten/${annaId}` });
  assert.match(ziel(r), /meldung=E-Mail aus Lexware übernommen\./);
  r = await post({ aktion: 'lexware_uebernehmen', id: annaId, feld: 'adresse', zurueck: `/patienten/${annaId}` });
  assert.match(ziel(r), /meldung=Rechnungsadresse aus Lexware übernommen\./);
  assert.match(ziel(await post({ aktion: 'lexware_uebernehmen', id: annaId, feld: 'adresse', zurueck: `/patienten/${annaId}` })), /fehler=Dieses Feld weicht nicht \(mehr\) ab/);
  const kontakte = (await db.query<{ art: string; wert: string; primaer: boolean }>('SELECT art::text, wert, primaer FROM patient_kontakt WHERE patient_id = $1 ORDER BY id', [annaId])).rows;
  assert.deepEqual(kontakte, [{ art: 'email', wert: 'anna@example.org', primaer: true }]);
  const adresse = (await db.query<Record<string, unknown>>('SELECT strasse, hausnummer, plz, ort, rechnungsadresse FROM patient_adresse WHERE patient_id = $1', [annaId])).rows;
  assert.deepEqual(adresse, [{ strasse: 'Hauptstraße', hausnummer: '12', plz: '86825', ort: 'Bad Wörishofen', rechnungsadresse: true }]);
  html = await seite(`/patienten/${annaId}`);
  assert.match(html, /2 Felder weicht ab/);
  // Rückweg: ein Patient ohne Kunde wird in Lexware (Attrappe) angelegt
  const dora = /\/patienten\/(\d+)/.exec(ziel(await post({ aktion: 'anlegen', vorname: 'Dora', nachname: 'Neukund', email: 'shopping@2late.de', strasse: 'Mühlweg', hausnummer: '4', plz: '86825', ort: 'Bad Wörishofen' })))![1]!;
  html = await seite(`/patienten/${dora}`);
  assert.match(html, /data-hilfe="patient.lexware-kunde"/);
  assert.doesNotMatch(html, /patient\.lexware_rechnungen/);
  r = await post({ aktion: 'lexware_kunde_anlegen', id: dora, zurueck: `/patienten/${dora}` });
  assert.match(ziel(r), /meldung=In Lexware als Kunde 10101 angelegt\./);
  assert.deepEqual((await db.query('SELECT lexware_kundennummer AS n, lexware_kontakt_id AS k FROM patient WHERE id = $1', [dora])).rows[0], { n: '10101', k: 'attrappe-k-1' });
  html = await seite(`/patienten/${dora}`);
  assert.doesNotMatch(html, /patient\.lexware-kunde"/);
  assert.match(html, /patient\.lexware_rechnungen/);
  assert.match(ziel(await post({ aktion: 'lexware_kunde_anlegen', id: dora, zurueck: `/patienten/${dora}` })), /fehler=Der Patient ist schon Lexware-Kunde 10101/);
});
