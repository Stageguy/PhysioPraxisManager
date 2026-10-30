/** Ein Stammdatenformular für „Neuer Patient“ und „Stammdaten bearbeiten“ (W115b): Kontaktwege, Adressen als Kacheln wie auf der Patientenseite, Preisliste und Versand beim Anlegen */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import type { Db } from '../src/db/index.ts';
import { karteiDienst } from '../src/kartei/dienst.ts';
import { patientLesen } from '../src/kartei/patienten.ts';
import { praxisDienst } from '../src/server.ts';
import { neuerHauptschluessel, tresor } from '../src/tresor.ts';
import { testDb } from './testdb.ts';

let basis = '';
let db: Db;
let server: ReturnType<typeof praxisDienst>;
const t = tresor({ PRAXIS_TRESOR_SCHLUESSEL: neuerHauptschluessel() });
const wer = { 'Tailscale-User-Login': 'lilli@example.org' };
const post = (felder: Record<string, string>) => fetch(`${basis}/patienten/aktion`, { method: 'POST', redirect: 'manual', headers: { ...wer, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(felder).toString() });
const ziel = (r: Response) => decodeURIComponent(r.headers.get('location') ?? '');
const seite = async (pfad: string) => (await fetch(`${basis}${pfad}`, { headers: wer })).text();

before(async () => {
  db = await testDb();
  server = praxisDienst({ erlaubt: ['lilli@example.org'], fassung: 't', angemeldet: async () => true, pruefen: async () => [], kartei: karteiDienst({ db, tresor: t }) });
  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

test('„Neuer Patient“ hat dieselben vier Blöcke wie „Stammdaten bearbeiten“: Person, Kontaktwege, Adressen als Kachelraster mit „+“, Abrechnung', async () => {
  const neu = await seite('/patienten/neu');
  for (const block of ['<legend>Person</legend>', '<legend>Kontaktwege</legend>', '<legend>Adressen</legend>', '<legend>Abrechnung</legend>']) assert.ok(neu.includes(block), block);
  assert.match(neu, /<div class="adr-raster"><details class="plus-kachel adr-feld adr-neu" data-adresse-kachel="0" data-adresse-neu><summary data-hilfe="patient.formular.adresse-neu">/, 'die „+“-Kachel zuerst, ohne Adressen mit Nummer 0');
  assert.match(neu, /<template id="adr-vorlage"><details class="plus-kachel adr-feld adr-neu" data-adresse-kachel="__N__" data-adresse-neu>/);
  assert.match(neu, /<select name="adr_0_typ" data-hilfe="adresse.typ"><option value="rechnung" selected>Rechnungs-\/Wohnadresse<\/option><option value="hausbesuch">Hausbesuchadresse<\/option><option value="betreuer">Vormund \/ Betreuer<\/option><\/select>/);
  assert.match(neu, /<input type="radio" name="rechnungsadresse_wahl" value="0" data-hilfe="patient.formular.rechnungsadresse">/);
  assert.match(neu, /name="adr_0_wie_rechnung" value="1" data-adresse-kopie/);
  assert.ok(!neu.includes('adr_0_loeschen'), 'entfernen gibt es nur bei gespeicherten Adressen');
  assert.match(neu, /<select name="preisliste_id" data-hilfe="patient.preisliste"><option value="" selected>Standard/);
  assert.match(neu, /<select name="rechnungsversand"[^>]*><option value="email" selected>/);
  assert.ok(!neu.includes('Nummer T-'), 'die Info-Zeile gibt es erst beim Bearbeiten');
  const skript = await seite('/praxis.js');
  assert.match(skript, /data-adresse-kachel/);
  assert.match(skript, /adr-vorlage/);
});

test('Anlegen mit zwei Adresskacheln (Rechnung gewählt, Hausbesuch), Preisliste und Versand; Bearbeiten zeigt Kacheln mit Kennung und ändert nur Geändertes', async () => {
  const r = await post({
    aktion: 'anlegen', vorname: 'Hanne', nachname: 'Heim', mobil: '0151 2345678', whatsapp_wie_mobil: '1', email: 'hanne@example.org',
    adr_0_strasse: 'Kneippstraße', adr_0_hausnummer: '5', adr_0_plz: '86825', adr_0_ort: 'Bad Wörishofen', adr_0_typ: 'rechnung',
    adr_1_bezeichnung: 'Pflegeheim', adr_1_strasse: 'Bahnhofstraße', adr_1_hausnummer: '3', adr_1_plz: '86842', adr_1_ort: 'Türkheim', adr_1_typ: 'hausbesuch',
    adr_2_typ: 'betreuer', rechnungsadresse_wahl: '0', rechnungsversand: 'post', zurueck: '/patienten/neu',
  });
  const pid = /\/patienten\/(\d+)/.exec(ziel(r))![1]!;
  let p = (await patientLesen(db, t, pid))!;
  assert.deepEqual(p.adressen.map((a) => [a.typ, a.rechnungsadresse, a.bezeichnung, a.ort]), [['rechnung', true, 'Zuhause', 'Bad Wörishofen'], ['hausbesuch', false, 'Pflegeheim', 'Türkheim']], 'die leere dritte Kachel zählt nicht');
  assert.equal(p.rechnungsversand, 'post');
  assert.deepEqual(p.kontakte.map((k) => [k.art, k.primaer]).sort(), [['email', true], ['mobil', true], ['whatsapp', true]]);
  // Bearbeiten: „+“-Kachel zuerst (Nummer 2), dann beide Adressen mit Kennung, Marke und Stift
  const html = await seite(`/patienten/${pid}/bearbeiten`);
  assert.match(html, /<div class="adr-raster"><details class="plus-kachel adr-feld adr-neu" data-adresse-kachel="2" data-adresse-neu>/);
  assert.match(html, /<input type="hidden" name="adr_0_id" value="\d+">/);
  assert.match(html, /<input type="hidden" name="adr_1_id" value="\d+">/);
  assert.match(html, /<span class="adr-titel"><b>Zuhause<\/b><span class="adr-stift"/);
  assert.match(html, /<span class="adr-marken rz-marken"><span class="marke jetzt">Rechnungsadresse<\/span><\/span><span class="adr-text">Kneippstraße 5<br>86825 Bad Wörishofen<\/span>/);
  assert.match(html, /<b>Pflegeheim<\/b>[\s\S]*?<span class="marke hausbesuch">Hausbesuchadresse<\/span>/);
  assert.match(html, /<input type="radio" name="rechnungsadresse_wahl" value="0" checked/);
  assert.match(html, /name="adr_1_loeschen" value="1"/);
  assert.match(html, /<input type="hidden" name="mobil_id" value="\d+">/);
  assert.match(html, /name="whatsapp_wie_mobil" value="1" checked/);
  assert.match(html, /<option value="post" selected>/);
  assert.match(html, /Nummer P-\d+ · Abrechnung/);
  // Speichern: Hausnummer der Hausbesuchadresse geändert, Mobil geändert; Rechnungsadresse unverändert → bleibt dieselbe Zeile
  const id0 = /name="adr_0_id" value="(\d+)"/.exec(html)![1]!;
  const id1 = /name="adr_1_id" value="(\d+)"/.exec(html)![1]!;
  const mobilId = /name="mobil_id" value="(\d+)"/.exec(html)![1]!;
  await post({
    aktion: 'stammdaten', id: pid, vorname: 'Hanne', nachname: 'Heim', mobil: '0151 9999999', mobil_id: mobilId, whatsapp_wie_mobil: '1',
    adr_0_id: id0, adr_0_bezeichnung: 'Zuhause', adr_0_strasse: 'Kneippstraße', adr_0_hausnummer: '5', adr_0_plz: '86825', adr_0_ort: 'Bad Wörishofen', adr_0_typ: 'rechnung',
    adr_1_id: id1, adr_1_bezeichnung: 'Pflegeheim', adr_1_strasse: 'Bahnhofstraße', adr_1_hausnummer: '4', adr_1_plz: '86842', adr_1_ort: 'Türkheim', adr_1_typ: 'hausbesuch',
    rechnungsadresse_wahl: '0', preisliste_id: '', rechnungsversand: 'email', zurueck: `/patienten/${pid}`,
  });
  p = (await patientLesen(db, t, pid))!;
  assert.deepEqual(p.adressen.map((a) => [a.id, a.hausnummer, a.rechnungsadresse]), [[id0, '5', true], [id1, '4', false]], 'keine neuen Adressen, dieselben Kennungen');
  assert.deepEqual(p.kontakte.filter((k) => k.art === 'mobil').map((k) => [k.id, k.wert]), [[mobilId, '0151 9999999']]);
  assert.equal(p.kontakte.find((k) => k.art === 'whatsapp')!.wert, '0151 9999999', 'WhatsApp zieht mit der Mobilnummer mit');
  assert.equal(p.rechnungsversand, 'email');
  // Rechnungsadresse auf die Hausbesuchadresse umlegen und die alte entfernen; eine neue Kachel „Betreuer“ dazu
  await post({
    aktion: 'stammdaten', id: pid, vorname: 'Hanne', nachname: 'Heim',
    adr_0_id: id0, adr_0_strasse: 'Kneippstraße', adr_0_hausnummer: '5', adr_0_plz: '86825', adr_0_ort: 'Bad Wörishofen', adr_0_typ: 'rechnung', adr_0_loeschen: '1',
    adr_1_id: id1, adr_1_bezeichnung: 'Pflegeheim', adr_1_strasse: 'Bahnhofstraße', adr_1_hausnummer: '4', adr_1_plz: '86842', adr_1_ort: 'Türkheim', adr_1_typ: 'hausbesuch',
    adr_2_bezeichnung: 'Tochter', adr_2_strasse: 'Am Anger', adr_2_hausnummer: '9', adr_2_plz: '86825', adr_2_ort: 'Bad Wörishofen', adr_2_typ: 'betreuer',
    rechnungsadresse_wahl: '1', zurueck: `/patienten/${pid}`,
  });
  p = (await patientLesen(db, t, pid))!;
  assert.deepEqual(p.adressen.map((a) => [a.typ, a.rechnungsadresse, a.bezeichnung]), [['hausbesuch', true, 'Pflegeheim'], ['betreuer', false, 'Tochter']]);
  // Ohne Kontakt- und Adressfelder (alte Aufrufer) ändert das Speichern daran nichts
  await post({ aktion: 'stammdaten', id: pid, vorname: 'Hanne', nachname: 'Heim-Neu', zurueck: `/patienten/${pid}` });
  p = (await patientLesen(db, t, pid))!;
  assert.equal(p.nachname, 'Heim-Neu');
  assert.equal(p.adressen.length, 2);
  assert.equal(p.kontakte.length, 3);
});

test('„Felder der Rechnungsadresse übernehmen“ ohne Skript, alte Feldnamen beim Anlegen, ohne Adresse keine Adresse', async () => {
  const r = await post({ aktion: 'anlegen', vorname: 'Willi', nachname: 'Wie', adr_0_strasse: 'Hauptstraße', adr_0_hausnummer: '44', adr_0_plz: '86825', adr_0_ort: 'Bad Wörishofen', adr_1_typ: 'hausbesuch', adr_1_wie_rechnung: '1', zurueck: '/patienten/neu' });
  const p = (await patientLesen(db, t, /\/patienten\/(\d+)/.exec(ziel(r))![1]!))!;
  assert.deepEqual(p.adressen.map((a) => [a.typ, a.rechnungsadresse, a.bezeichnung, a.strasse]), [['rechnung', true, 'Zuhause', 'Hauptstraße'], ['hausbesuch', false, 'Hausbesuch', 'Hauptstraße']], 'ohne Wahl wird die erste Rechnungsadresse');
  const alt = await post({ aktion: 'anlegen', vorname: 'Alma', nachname: 'Alt', strasse: 'Kurallee', hausnummer: '1', plz: '86825', ort: 'Bad Wörishofen', zurueck: '/patienten/neu' });
  assert.deepEqual((await patientLesen(db, t, /\/patienten\/(\d+)/.exec(ziel(alt))![1]!))!.adressen.map((a) => [a.typ, a.rechnungsadresse, a.strasse]), [['rechnung', true, 'Kurallee']], 'alte Feldnamen gelten weiter');
  const ohne = await post({ aktion: 'anlegen', vorname: 'Olga', nachname: 'Ohne', zurueck: '/patienten/neu' });
  assert.equal((await patientLesen(db, t, /\/patienten\/(\d+)/.exec(ziel(ohne))![1]!))!.adressen.length, 0);
});
