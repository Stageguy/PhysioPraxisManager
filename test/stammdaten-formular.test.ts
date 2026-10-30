/** Ein Stammdatenformular für „Neuer Patient“ und „Stammdaten bearbeiten“ (W115b): Kontaktwege, Adressen als Kacheln, Preisliste und Versand beim Anlegen */
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

test('„Neuer Patient“ hat dieselben vier Blöcke wie „Stammdaten bearbeiten“: Person, Kontaktwege, Adressen als Kacheln, Abrechnung', async () => {
  const neu = await seite('/patienten/neu');
  for (const block of ['<legend>Person</legend>', '<legend>Kontaktwege</legend>', '<legend>Adressen</legend>', '<legend>Abrechnung</legend>']) assert.ok(neu.includes(block), block);
  assert.match(neu, /<details class="plus-kachel adr-feld" data-adresse-kachel="ra"><summary data-hilfe="patient.formular.rechnungsadresse">/);
  assert.match(neu, /<details class="plus-kachel adr-feld" data-adresse-kachel="ha"><summary data-hilfe="patient.formular.hausbesuchadresse">/);
  assert.match(neu, /name="ha_wie_rechnung" value="1" data-adresse-kopie="ra"/);
  assert.match(neu, /<select name="preisliste_id" data-hilfe="patient.preisliste"><option value="" selected>Standard/);
  assert.match(neu, /<select name="rechnungsversand"[^>]*><option value="email" selected>/);
  assert.ok(!neu.includes('Nummer T-'), 'die Info-Zeile gibt es erst beim Bearbeiten');
  const skript = await seite('/praxis.js');
  assert.match(skript, /data-adresse-kachel/);
  assert.match(skript, /data-adresse-kopie/);
});

test('Anlegen mit Rechnungs- und Hausbesuchadresse, Preisliste und Versand; Bearbeiten zeigt alles vorbelegt und ändert gezielt', async () => {
  const r = await post({
    aktion: 'anlegen', vorname: 'Hanne', nachname: 'Heim', mobil: '0151 2345678', whatsapp_wie_mobil: '1', email: 'hanne@example.org',
    ra_strasse: 'Kneippstraße', ra_hausnummer: '5', ra_plz: '86825', ra_ort: 'Bad Wörishofen',
    ha_bezeichnung: 'Pflegeheim', ha_strasse: 'Bahnhofstraße', ha_hausnummer: '3', ha_plz: '86842', ha_ort: 'Türkheim',
    rechnungsversand: 'post', zurueck: '/patienten/neu',
  });
  const pid = /\/patienten\/(\d+)/.exec(ziel(r))![1]!;
  let p = (await patientLesen(db, t, pid))!;
  assert.deepEqual(p.adressen.map((a) => [a.typ, a.rechnungsadresse, a.bezeichnung, a.ort]), [['rechnung', true, 'Zuhause', 'Bad Wörishofen'], ['hausbesuch', false, 'Pflegeheim', 'Türkheim']]);
  assert.equal(p.rechnungsversand, 'post');
  assert.deepEqual(p.kontakte.map((k) => [k.art, k.primaer]).sort(), [['email', true], ['mobil', true], ['whatsapp', true]]);
  // Bearbeiten: Kontaktwege und beide Adressen stehen vorbelegt, mit Kennungen
  const html = await seite(`/patienten/${pid}/bearbeiten`);
  assert.match(html, /<input type="hidden" name="mobil_id" value="\d+">/);
  assert.match(html, /<input name="mobil" inputmode="tel" placeholder="0151 …" value="0151 2345678">/);
  assert.match(html, /name="whatsapp_wie_mobil" value="1" checked/);
  assert.match(html, /<input type="hidden" name="ra_id" value="\d+">/);
  assert.match(html, /<input type="hidden" name="ha_id" value="\d+">/);
  assert.match(html, /name="ha_ort" value="Türkheim"/);
  assert.match(html, /<span class="adr-text">Kneippstraße 5<br>86825 Bad Wörishofen<\/span>/);
  assert.match(html, /<option value="post" selected>/);
  assert.match(html, /Nummer P-\d+ · Abrechnung/);
  // Speichern: Mobil geändert (bleibt derselbe Eintrag), Hausbesuchadresse geändert (dieselbe Adresse), Rechnungsadresse unverändert
  const raId = /name="ra_id" value="(\d+)"/.exec(html)![1]!;
  const haId = /name="ha_id" value="(\d+)"/.exec(html)![1]!;
  const mobilId = /name="mobil_id" value="(\d+)"/.exec(html)![1]!;
  await post({ aktion: 'stammdaten', id: pid, vorname: 'Hanne', nachname: 'Heim', mobil: '0151 9999999', mobil_id: mobilId, whatsapp_wie_mobil: '1', ha_id: haId, ha_bezeichnung: 'Pflegeheim', ha_strasse: 'Bahnhofstraße', ha_hausnummer: '4', ha_plz: '86842', ha_ort: 'Türkheim', ra_id: raId, ra_strasse: 'Kneippstraße', ra_hausnummer: '5', ra_plz: '86825', ra_ort: 'Bad Wörishofen', preisliste_id: '', rechnungsversand: 'email', zurueck: `/patienten/${pid}` });
  p = (await patientLesen(db, t, pid))!;
  assert.equal(p.adressen.length, 2, 'keine neuen Adressen');
  assert.deepEqual(p.adressen.map((a) => [a.id, a.hausnummer]), [[raId, '5'], [haId, '4']]);
  assert.deepEqual(p.kontakte.filter((k) => k.art === 'mobil').map((k) => [k.id, k.wert]), [[mobilId, '0151 9999999']]);
  assert.equal(p.kontakte.find((k) => k.art === 'whatsapp')!.wert, '0151 9999999', 'WhatsApp zieht mit der Mobilnummer mit');
  assert.equal(p.rechnungsversand, 'email');
  // Ohne Kontakt- und Adressfelder (alte Aufrufer) ändert das Speichern daran nichts
  await post({ aktion: 'stammdaten', id: pid, vorname: 'Hanne', nachname: 'Heim-Neu', zurueck: `/patienten/${pid}` });
  p = (await patientLesen(db, t, pid))!;
  assert.equal(p.nachname, 'Heim-Neu');
  assert.equal(p.adressen.length, 2);
  assert.equal(p.kontakte.length, 3);
});

test('„wie die Rechnungsadresse“ ohne Skript: der Haken kopiert die Rechnungsadresse als Hausbesuchadresse; alte Feldnamen beim Anlegen gelten weiter', async () => {
  const r = await post({ aktion: 'anlegen', vorname: 'Willi', nachname: 'Wie', strasse: 'Hauptstraße', hausnummer: '44', plz: '86825', ort: 'Bad Wörishofen', ha_wie_rechnung: '1', zurueck: '/patienten/neu' });
  const pid = /\/patienten\/(\d+)/.exec(ziel(r))![1]!;
  const p = (await patientLesen(db, t, pid))!;
  assert.deepEqual(p.adressen.map((a) => [a.typ, a.rechnungsadresse, a.bezeichnung, a.strasse]), [['rechnung', true, 'Zuhause', 'Hauptstraße'], ['hausbesuch', false, 'Hausbesuch', 'Hauptstraße']]);
  const ohne = await post({ aktion: 'anlegen', vorname: 'Olga', nachname: 'Ohne', zurueck: '/patienten/neu' });
  assert.equal((await patientLesen(db, t, /\/patienten\/(\d+)/.exec(ziel(ohne))![1]!))!.adressen.length, 0, 'ohne Angaben keine Adresse');
});
