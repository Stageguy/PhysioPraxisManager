/** Ein Formular für Anlegen und Bearbeiten (W115): Stammdaten, Adresse, Termin, Rechnung, Terminart, Textbaustein – Seiten, Aktionen, Abbrechen */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import type { Db } from '../src/db/index.ts';
import { karteiDienst } from '../src/kartei/dienst.ts';
import { terminLesen, terminStatus } from '../src/kartei/patienten.ts';
import { praxisDienst } from '../src/server.ts';
import { neuerHauptschluessel, tresor } from '../src/tresor.ts';
import { berlinZeitUtc, heuteBerlin, tagPlus } from '../src/zeit.ts';
import { testDb } from './testdb.ts';

let basis = '';
let db: Db;
let server: ReturnType<typeof praxisDienst>;
let pid = '';
let tid = '';
const t = tresor({ PRAXIS_TRESOR_SCHLUESSEL: neuerHauptschluessel() });
const wer = { 'Tailscale-User-Login': 'lilli@example.org' };
const post = (felder: Record<string, string>) => fetch(`${basis}/patienten/aktion`, { method: 'POST', redirect: 'manual', headers: { ...wer, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(felder).toString() });
const ziel = (r: Response) => decodeURIComponent(r.headers.get('location') ?? '');
const seite = async (pfad: string) => (await fetch(`${basis}${pfad}`, { headers: wer })).text();
const status = async (pfad: string) => (await fetch(`${basis}${pfad}`, { headers: wer })).status;
const morgen = tagPlus(heuteBerlin(), 1);

before(async () => {
  db = await testDb();
  server = praxisDienst({ erlaubt: ['lilli@example.org'], fassung: 't', angemeldet: async () => true, pruefen: async () => [], kartei: karteiDienst({ db, tresor: t }) });
  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  pid = /\/patienten\/(\d+)/.exec(ziel(await post({ aktion: 'anlegen', vorname: 'Fiona', nachname: 'Formular', geburtsname: 'Alt', notiz: 'Erste Notiz', strasse: 'Weg', hausnummer: '1', plz: '86825', ort: 'Bad Wörishofen' })))![1]!;
  await post({ aktion: 'termin_anlegen', id: pid, datum: morgen, zeit: '09:00', dauer_min: '30' });
  tid = (await db.query<{ id: string }>('SELECT id::text FROM termin WHERE patient_id = $1', [pid])).rows[0]!.id;
});
after(() => server.close());

test('Neuer Patient und Stammdaten bearbeiten teilen sich die Personfelder; Anlegen nimmt alle Felder; Speichern, Archivieren', async () => {
  const neu = await seite('/patienten/neu');
  assert.match(neu, /<form method="post" action="\/patienten\/aktion" class="tafel formular" data-hilfe="patient.neu.formular">/);
  assert.match(neu, /<fieldset><legend>Person<\/legend>[\s\S]*name="geburtsname"[\s\S]*name="kommunikationshilfe"[\s\S]*name="beruf_belastung"[\s\S]*name="notiz"/);
  assert.match(neu, /<a class="knopf" href="\/patienten" data-abbrechen data-hilfe="formular.abbrechen">Abbrechen<\/a>/);
  const html = await seite(`/patienten/${pid}/bearbeiten`);
  assert.match(html, /data-hilfe="patient.bearbeiten.formular"/);
  assert.match(html, /<input type="hidden" name="aktion" value="stammdaten"><input type="hidden" name="id" value="\d+"><input type="hidden" name="zurueck" value="\/patienten\/\d+\/bearbeiten">/);
  assert.match(html, /name="vorname" value="Fiona"[\s\S]*name="geburtsname" value="Alt"[\s\S]*<textarea name="notiz" rows="2">Erste Notiz<\/textarea>/, 'Anlegen hat alle Felder übernommen');
  assert.match(html, /<select name="preisliste_id" data-hilfe="patient.preisliste">[\s\S]*<select name="rechnungsversand"/);
  assert.match(html, /<button class="knopf warnend" name="aktion" value="archivieren" data-hilfe="patient.archivieren">Archivieren<\/button>/);
  assert.match(html, new RegExp(`<a class="knopf" href="/patienten/${pid}" data-abbrechen data-hilfe="formular.abbrechen">Abbrechen</a>`));
  assert.equal(ziel(await post({ aktion: 'stammdaten', id: pid, vorname: 'Fiona', nachname: 'Formular', notiz: 'Zweite Notiz', zurueck: `/patienten/${pid}/bearbeiten` })), `/patienten/${pid}?meldung=Stammdaten gespeichert.`);
  assert.match(await seite(`/patienten/${pid}/bearbeiten`), /<textarea name="notiz" rows="2">Zweite Notiz<\/textarea>/);
  assert.match(ziel(await post({ aktion: 'stammdaten', id: pid, vorname: '', nachname: 'Formular', zurueck: `/patienten/${pid}/bearbeiten` })), new RegExp(`^/patienten/${pid}/bearbeiten\\?fehler=`), 'Fehler bleibt auf der Formularseite');
  assert.equal(await status('/patienten/999999/bearbeiten'), 404);
});

test('Adresse: neu und bearbeiten über dieselbe Seite; Speichern mit adresse_id ändert die Kachel', async () => {
  assert.match(await seite(`/patienten/${pid}/adressen/neu`), /<input type="hidden" name="aktion" value="adresse_speichern">[\s\S]*name="strasse" value=""[\s\S]*name="land" value="DE"/);
  const aid = (await db.query<{ id: string }>('SELECT id::text FROM patient_adresse WHERE patient_id = $1', [pid])).rows[0]!.id;
  const html = await seite(`/patienten/${pid}/adressen/${aid}`);
  assert.match(html, new RegExp(`<input type="hidden" name="adresse_id" value="${aid}">[\\s\\S]*name="strasse" value="Weg"[\\s\\S]*name="rechnungsadresse" value="1" checked`));
  assert.equal(ziel(await post({ aktion: 'adresse_speichern', id: pid, adresse_id: aid, bezeichnung: 'Zuhause', strasse: 'Kurpromenade', hausnummer: '3', plz: '86825', ort: 'Bad Wörishofen', land: 'de', zurueck: `/patienten/${pid}/adressen/${aid}` })), `/patienten/${pid}?meldung=Adresse gespeichert.#adressen`);
  assert.match(await seite(`/patienten/${pid}`), /<b>Zuhause<\/b>\s*<p>Kurpromenade 3<br>86825 Bad Wörishofen<\/p>/);
  assert.equal(await status(`/patienten/${pid}/adressen/999999`), 404);
});

test('Termin bearbeiten: Formular wie „Neuer Termin“ mit Werten; Ändern verschiebt und prüft; nach Absage nicht mehr änderbar', async () => {
  const html = await seite(`/patienten/${pid}/termine/${tid}/bearbeiten`);
  assert.match(html, /<h1>[\s\S]*Termin bearbeiten/);
  assert.match(html, new RegExp(`<input type="hidden" name="aktion" value="termin_aendern">[\\s\\S]*<input type="hidden" name="termin_id" value="${tid}">[\\s\\S]*name="datum" required value="${morgen}"[\\s\\S]*name="zeit" required value="09:00"[\\s\\S]*name="dauer_min" value="30"`));
  assert.match(html, /<button class="knopf primaer" data-hilfe="termin.aendern">Termin speichern<\/button>/);
  const r = await post({ aktion: 'termin_aendern', id: pid, termin_id: tid, datum: morgen, zeit: '10:15', dauer_min: '45', art: 'erstgespraech', zurueck: `/patienten/${pid}/termine/${tid}/bearbeiten` });
  assert.match(ziel(r), new RegExp(`^/patienten/${pid}\\?meldung=Termin geändert\\.`));
  const t1 = (await terminLesen(db, pid, tid))!;
  assert.deepEqual([t1.beginn, t1.ende, t1.art], [berlinZeitUtc(morgen, '10:15').replace('Z', '.000Z'), berlinZeitUtc(morgen, '11:00').replace('Z', '.000Z'), 'erstgespraech']);
  assert.match(ziel(await post({ aktion: 'termin_aendern', id: pid, termin_id: tid, datum: 'gestern', zeit: '10:15', dauer_min: '45', zurueck: `/patienten/${pid}/termine/${tid}/bearbeiten` })), /fehler=/);
  assert.match(ziel(await post({ aktion: 'termin_aendern', id: pid, termin_id: '999999', datum: morgen, zeit: '10:15', dauer_min: '45', zurueck: `/patienten/${pid}` })), /fehler=Diesen Termin gibt es nicht/);
  await terminStatus(db, pid, tid, 'abgesagt_patient', 'x');
  assert.equal(await status(`/patienten/${pid}/termine/${tid}/bearbeiten`), 404);
  assert.match(ziel(await post({ aktion: 'termin_aendern', id: pid, termin_id: tid, datum: morgen, zeit: '10:15', dauer_min: '45', zurueck: `/patienten/${pid}` })), /fehler=Nur bestätigte oder vorgeschlagene Termine/);
});

test('Neue Rechnung als Formularseite; Terminart und Textbaustein: eine Seite für neu und bearbeiten', async () => {
  const re = await seite(`/patienten/${pid}/neu/rechnung`);
  assert.match(re, /<input type="hidden" name="aktion" value="rechnung_neu">[\s\S]*<fieldset data-hilfe="rechnung.neu.art">[\s\S]*value="heilbehandlung_steuerfrei" checked[\s\S]*value="wellness_19"/);
  const neu = await seite('/konfiguration/terminarten/neu?sektion=wellness');
  assert.match(neu, /<input type="hidden" name="aktion" value="terminart_speichern">[\s\S]*<input type="hidden" name="sektion" value="wellness">[\s\S]*name="dauer_min" value="30"/);
  assert.match(neu, /<a class="knopf" href="\/konfiguration\/terminarten#sektion-wellness" data-abbrechen data-hilfe="formular.abbrechen">Abbrechen<\/a>/);
  assert.match(await seite('/konfiguration/terminarten/neu?sektion=unsinn'), /name="sektion" value="rezept"/, 'unbekannte Sektion → Rezept');
  const ta = await seite('/konfiguration/terminarten/1');
  assert.match(ta, /<input type="hidden" name="terminart_id" value="1">[\s\S]*name="kurz" value="[^"]+" required/);
  assert.equal(await status('/konfiguration/terminarten/999999'), 404);
  assert.match(await seite('/konfiguration/textbausteine/neu'), /<input type="hidden" name="aktion" value="textbaustein_speichern">[\s\S]*name="kurzname" value=""/);
  const tb = await seite('/konfiguration/textbausteine/1');
  assert.match(tb, /<input type="hidden" name="textbaustein_id" value="1">[\s\S]*name="kurzname" value="[^"]+" required[\s\S]*<textarea name="text" rows="4" required>[^<]+<\/textarea>/);
  assert.equal(await status('/konfiguration/textbausteine/999999'), 404);
  assert.equal(ziel(await post({ aktion: 'textbaustein_speichern', textbaustein_id: '1', kurzname: 'Steuerfrei', text: 'Neuer Text', wirkung: 'steuerfrei_heilbehandlung', automatisch: 'heilbehandlung', zurueck: '/konfiguration/textbausteine/1' })), '/konfiguration?meldung=Textbaustein gespeichert.');
  assert.match(await seite('/konfiguration/textbausteine/1'), /<textarea name="text" rows="4" required>Neuer Text<\/textarea>/);
});
