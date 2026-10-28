/** Bestätigung je Behandlung (W107a): Unterschrift als PNG im Tresor, Papier/mündlich ohne Bild, Akte, Stempelkarte, Bild-Route */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import type { Db } from '../src/db/index.ts';
import { karteiDienst } from '../src/kartei/dienst.ts';
import { akte, verordnungAnlegen, verordnungen } from '../src/kartei/patienten.ts';
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
/** Kleinstes gültiges PNG (1×1), wie es der Browser aus der Fläche liefern würde – hier künstlich aufgefüllt, damit es über 100 Byte liegt */
const PNG = Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'), Buffer.alloc(64, 0)]);
const UNTERSCHRIFT = `data:image/png;base64,${PNG.toString('base64')}`;

before(async () => {
  db = await testDb();
  server = praxisDienst({ erlaubt: ['lilli@example.org'], fassung: 't', angemeldet: async () => true, pruefen: async () => [], kartei: karteiDienst({ db, tresor: t }) });
  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

let pid = '';
let vid = '';
test('Formular hat die Bestätigung; Unterschrift wird verschlüsselt gespeichert, Akte und Stempelkarte zeigen sie, die Bild-Route liefert das PNG', async () => {
  pid = /\/patienten\/(\d+)/.exec(ziel(await post({ aktion: 'anlegen', vorname: 'Ulla', nachname: 'Unterschrift' })))![1]!;
  vid = await verordnungAnlegen(db, t, pid, { ausgestelltAm: '2026-10-01', massnahme: 'Krankengymnastik', leistungNummer: '20501', anzahl: 6 }, 'x');
  const formular = await seite(`/patienten/${pid}/neu/behandlung`);
  assert.match(formular, /<fieldset class="bestaetigung" data-hilfe="behandlung.bestaetigung">[\s\S]*name="bestaetigung" value="unterschrift" checked[\s\S]*<canvas class="unterschrift" data-unterschrift="unterschrift-feld"[\s\S]*data-unterschrift-loeschen/);
  const r = await post({ aktion: 'behandlung_erfassen', id: pid, fall_id: 'neu', grundlage: 'verordnung', datum: '2026-10-28', dauer_min: '20', verordnung_id: vid, leistung_nummer: '20501', massnahmen: 'KG', bestaetigung: 'unterschrift', unterschrift: UNTERSCHRIFT, bestaetigt_von: '' });
  assert.match(ziel(r), /meldung=Behandlung in der Akte eingetragen und vom Patienten bestätigt \(Unterschrift am Bildschirm\)\.#b-(\d+)/);
  const bid = /#b-(\d+)/.exec(ziel(r))![1]!;
  const zeile = (await db.query<Record<string, unknown>>('SELECT art::text, bild, bild_mime AS mime, wer_name AS wn FROM behandlung_bestaetigung WHERE behandlung_id = $1', [bid])).rows[0]!;
  assert.deepEqual([zeile.art, zeile.mime, zeile.wn], ['unterschrift', 'image/png', null]);
  assert.notEqual(Buffer.from(zeile.bild as Uint8Array).subarray(1, 4).toString(), 'PNG', 'im Tresor, nicht im Klartext');
  // Akte
  const faelle = await akte(db, t, pid, 'x');
  assert.deepEqual([faelle[0]!.behandlungen[0]!.bestaetigung?.art, faelle[0]!.behandlungen[0]!.bestaetigung?.bild], ['unterschrift', true]);
  const html = await seite(`/patienten/${pid}/akte`);
  assert.match(html, /Bestätigt: Unterschrift am Bildschirm · [^<]{5,40}\d\d:\d\d · <a href="\/patienten\/\d+\/behandlungen\/\d+\/unterschrift\.png" data-pdf="Unterschrift 28\.10\.2026" data-hilfe="akte.unterschrift">Unterschrift ansehen<\/a>/);
  assert.match(html, /id="pdf-fenster"/, 'Dokumentfenster auf der Akte');
  // Stempelkarte
  const v = (await verordnungen(db, { patientId: pid })).find((x) => x.id === vid)!;
  assert.deepEqual([v.abgehakt, v.bestaetigt], [1, 1]);
  assert.match(await seite(`/patienten/${pid}`), /1 von 6 · ✓ 1 bestätigt/);
  // Bild-Route: entschlüsselt, als Bild, im Sandkasten
  const bild = await fetch(`${basis}/patienten/${pid}/behandlungen/${bid}/unterschrift.png`, { headers: wer });
  assert.equal(bild.status, 200);
  assert.equal(bild.headers.get('content-type'), 'image/png');
  assert.match(bild.headers.get('content-security-policy') ?? '', /sandbox/);
  assert.equal(Buffer.from(await bild.arrayBuffer()).subarray(1, 4).toString(), 'PNG');
  assert.equal((await fetch(`${basis}/patienten/${pid}/behandlungen/999999/unterschrift.png`, { headers: wer })).status, 404);
  // Fremder Patient sieht das Bild nicht
  const andere = /\/patienten\/(\d+)/.exec(ziel(await post({ aktion: 'anlegen', vorname: 'Vera', nachname: 'Fremd' })))![1]!;
  assert.equal((await fetch(`${basis}/patienten/${andere}/behandlungen/${bid}/unterschrift.png`, { headers: wer })).status, 404);
  // Export nennt die Bestätigung
  const { akteExport } = await import('../src/kartei/akte-export.ts');
  const pdf = await akteExport(db, t, pid, 'x');
  assert.ok(pdf.daten.length > 1000);
});

test('Ohne Zeichnung keine Unterschrift – Behandlung bleibt trotzdem in der Akte; Papier und mündlich ohne Bild; keine = nichts', async () => {
  let r = await post({ aktion: 'behandlung_erfassen', id: pid, fall_id: 'neu', grundlage: 'verordnung', datum: '2026-10-29', massnahmen: 'KG', bestaetigung: 'unterschrift', unterschrift: '' });
  assert.match(ziel(r), /meldung=Behandlung in der Akte eingetragen – ohne Bestätigung: Bitte auf der Fläche unterschreiben – oder eine andere Art der Bestätigung wählen#b-\d+/);
  r = await post({ aktion: 'behandlung_erfassen', id: pid, fall_id: 'neu', grundlage: 'verordnung', datum: '2026-10-30', massnahmen: 'KG', bestaetigung: 'papier', bestaetigt_von: 'Mutter' });
  assert.match(ziel(r), /vom Patienten bestätigt \(auf Papier unterschrieben\)/);
  const bid = /#b-(\d+)/.exec(ziel(r))![1]!;
  assert.deepEqual((await db.query('SELECT art::text, bild, wer_name AS wn FROM behandlung_bestaetigung WHERE behandlung_id = $1', [bid])).rows[0], { art: 'papier', bild: null, wn: 'Mutter' });
  assert.equal((await fetch(`${basis}/patienten/${pid}/behandlungen/${bid}/unterschrift.png`, { headers: wer })).status, 404, 'kein Bild bei Papier');
  r = await post({ aktion: 'behandlung_erfassen', id: pid, fall_id: 'neu', grundlage: 'verordnung', datum: '2026-10-31', massnahmen: 'KG', bestaetigung: 'keine' });
  assert.match(ziel(r), /meldung=Behandlung in der Akte eingetragen\.#b-\d+/);
  assert.match(await seite(`/patienten/${pid}/akte`), /ohne Bestätigung des Patienten/);
  // Kein PNG, sondern etwas anderes als Unterschrift: abgelehnt
  r = await post({ aktion: 'behandlung_erfassen', id: pid, fall_id: 'neu', grundlage: 'verordnung', datum: '2026-11-01', massnahmen: 'KG', bestaetigung: 'unterschrift', unterschrift: `data:image/png;base64,${Buffer.alloc(200, 1).toString('base64')}` });
  assert.match(ziel(r), /ohne Bestätigung: Bitte auf der Fläche unterschreiben/);
});
