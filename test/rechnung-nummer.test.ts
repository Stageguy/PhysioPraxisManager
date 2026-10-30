/** Nummernkonflikt mit Lexware (W120): Abweichung als Block, andere Rechnung verlinkt, ein Klick trägt die Nummer hier ein; Attrappe neustartfest (N40) */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import type { Db } from '../src/db/index.ts';
import { karteiDienst } from '../src/kartei/dienst.ts';
import { nummernKonflikt, nummernKonfliktLoesen } from '../src/kartei/lexware-rechnungen.ts';
import { patientAnlegen } from '../src/kartei/patienten.ts';
import { rechnungAnlegen, rechnungLesen } from '../src/kartei/rechnungen.ts';
import { attrappeRechnungen } from '../src/lexware/rechnungen.ts';
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
const lexware = attrappeRechnungen();
const KONFLIKT = 'Lexware hat die Nummer RE-2026-9001 vergeben, die in der Kartei schon an einer anderen Rechnung steht';

let pid = '';
let andere = '';
let diese = '';

before(async () => {
  db = await testDb();
  server = praxisDienst({ erlaubt: ['lilli@example.org'], fassung: 't', angemeldet: async () => true, pruefen: async () => [], kartei: karteiDienst({ db, tresor: t, lexwareRechnungen: lexware }) });
  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  pid = await patientAnlegen(db, t, { vorname: 'Mia', nachname: 'Anamnese' }, 'x');
  // Die ältere Rechnung trägt die Nummer schon (etwa von Hand eingetragen); die neue hat sie von Lexware bekommen – Lexware-Kennung vermerkt, Nummer nicht
  andere = await rechnungAnlegen(db, pid, { steuerklasse: 'heilbehandlung_steuerfrei', art: 'einzel', notiz: 'ältere' }, 'x');
  await db.query("UPDATE rechnung SET nummer = 'RE-2026-9001', status = 'in_lexware', datum = '2026-10-30' WHERE id = $1", [andere]);
  diese = await rechnungAnlegen(db, pid, { steuerklasse: 'heilbehandlung_steuerfrei', art: 'einzel', notiz: 'neue' }, 'x');
  await db.query("UPDATE rechnung SET status = 'freigegeben', lexware_invoice_id = 'attrappe-re-RE-2026-9001', lexware_status = 'open', lexware_abweichung = $2 WHERE id = $1", [diese, KONFLIKT]);
});
after(() => server.close());

test('nummernKonflikt: Nummer und die andere Rechnung aus der Abweichung; andere Abweichungen sind kein Konflikt', async () => {
  assert.deepEqual(await nummernKonflikt(db, diese), { nummer: 'RE-2026-9001', andere: { id: andere, patientId: pid, patientName: 'Mia Anamnese', datum: '2026-10-30' } });
  assert.equal(await nummernKonflikt(db, andere), null, 'ohne Abweichung kein Konflikt');
  assert.equal(await nummernKonflikt(db, 'x'), null);
});

test('Rechnungsseite: die Abweichung steht als umbrechender Block unter dem Kopf, mit Link zur anderen Rechnung und dem Ein-Klick-Knopf; die Lexware-Zeile nennt die Nummer', async () => {
  const html = await seite(`/patienten/${pid}/rechnungen/${diese}`);
  assert.ok(!html.includes('class="chip preset0" data-hilfe="rechnung.abweichung"'), 'kein abgeschnittener Chip mehr im Kopf');
  assert.match(html, /<div class="meldung fehler abweichung" data-hilfe="rechnung.abweichung" tabindex="0">[\s\S]*<b>Abweichung zu Lexware:<\/b> Lexware hat die Nummer RE-2026-9001 vergeben/);
  assert.match(html, new RegExp(`<a href="/patienten/${pid}/rechnungen/${andere}" data-hilfe="rechnung.andere-rechnung">Rechnung Nr. ${andere} von Mia Anamnese</a>`));
  assert.match(html, /<button class="knopf klein primaer" data-hilfe="rechnung.nummer-uebernehmen">.*Nummer RE-2026-9001 hier eintragen<\/button>/);
  assert.match(html, /<dt>Lexware<\/dt><dd>open · Nummer dort RE-2026-9001/);
});

test('Ein Klick: die Nummer wandert hierher, die andere Rechnung gibt sie ab und bekommt einen Prüfhinweis; danach kein Konflikt mehr', async () => {
  const r = await post({ aktion: 'rechnung_nummer', id: pid, rechnung_id: diese, zurueck: `/patienten/${pid}/rechnungen/${diese}` });
  assert.match(ziel(r), new RegExp(`^/patienten/${pid}/rechnungen/${diese}\\?meldung=Nummer RE-2026-9001 eingetragen – Rechnung Nr. ${andere} \\(Mia Anamnese\\) hat sie abgegeben und trägt einen Prüfhinweis\\. Kein PDF bekommen`));
  const d = (await rechnungLesen(db, pid, diese))!;
  assert.deepEqual([d.nummer, d.status, d.lexware.abweichung, d.lexware.invoiceId], ['RE-2026-9001', 'in_lexware', null, 'attrappe-re-RE-2026-9001']);
  const a = (await rechnungLesen(db, pid, andere))!;
  assert.equal(a.nummer, null);
  assert.match(a.lexware.abweichung ?? '', new RegExp(`^Nummer RE-2026-9001 abgegeben an Rechnung Nr. ${diese} – Lexware hat sie dort vergeben; bitte in Lexware nachsehen`));
  assert.equal(await nummernKonflikt(db, andere), null, 'der Prüfhinweis ist kein Konflikt – nichts zu klicken');
  assert.match(ziel(await post({ aktion: 'rechnung_nummer', id: pid, rechnung_id: diese, zurueck: '/patienten' })), /fehler=Diese Rechnung hat keinen Nummernkonflikt/);
  await assert.rejects(nummernKonfliktLoesen(db, t, lexware, pid, '999999', 'x'), /gibt es nicht/);
  const log = (await db.query<{ details: Record<string, unknown> }>("SELECT details FROM audit_event WHERE action = 'rechnung_nummer_uebernommen'")).rows[0]!;
  assert.deepEqual(log.details, { rechnung: Number(diese), von: Number(andere) });
});

test('Attrappe neustartfest (N40): Nummern aus der Uhr statt immer wieder 9001, unbekannte Kontakte aus der Zeit vor dem Neustart werden geduldet', async () => {
  const alt = attrappeRechnungen();
  const k = await alt.kontaktAnlegen({ vorname: 'Anna', nachname: 'Test' });
  assert.match((await alt.rechnungAnlegen({ kontaktId: k.id, datum: '2026-10-30', zeitraumVon: null, zeitraumBis: null, titel: 'Rechnung', bemerkung: '', ustSatz: 0, positionen: [{ name: 'KG', anzahl: 1, einzelpreis: 30 }] })).nummer, /^RE-2026-9001$/, 'ohne Option wie bisher – die Tests verlassen sich darauf');
  const fest = attrappeRechnungen({ neustartfest: true });
  const kf = await fest.kontaktAnlegen({ vorname: 'Anna', nachname: 'Test' });
  assert.match(kf.id, /^attrappe-k-\d+-1$/, 'Kennung mit Zeitbasis');
  const re = await fest.rechnungAnlegen({ kontaktId: kf.id, datum: '2026-10-30', zeitraumVon: null, zeitraumBis: null, titel: 'Rechnung', bemerkung: '', ustSatz: 0, positionen: [{ name: 'KG', anzahl: 1, einzelpreis: 30 }] });
  assert.match(re.nummer, /^RE-2026-\d{5,6}$/);
  assert.ok(Number(re.nummer.slice(8)) > 9001, 'weit weg vom festen Nummernkreis');
  const alter = await fest.rechnungAnlegen({ kontaktId: 'attrappe-k-1', datum: '2026-10-30', zeitraumVon: null, zeitraumBis: null, titel: 'Rechnung', bemerkung: '', ustSatz: 0, positionen: [{ name: 'KG', anzahl: 1, einzelpreis: 30 }] });
  assert.notEqual(alter.nummer, re.nummer, 'fortlaufend');
  await assert.rejects(alt.rechnungAnlegen({ kontaktId: 'attrappe-k-99', datum: '2026-10-30', zeitraumVon: null, zeitraumBis: null, titel: 'Rechnung', bemerkung: '', ustSatz: 0, positionen: [] }), /kennt Kontakt/, 'ohne Option streng wie bisher');
});
