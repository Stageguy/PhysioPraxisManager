/** Preislisten (W97): Standard und mehrere aktive Listen; Rechnungen bleiben bei Preisänderungen unverändert, Entwürfe nur auf Knopfdruck */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import type { Db } from '../src/db/index.ts';
import { karteiDienst } from '../src/kartei/dienst.ts';
import { patientAnlegen, verordnungAnlegen } from '../src/kartei/patienten.ts';
import { preiseAktualisieren, rechnungLesen, rechnungStatus } from '../src/kartei/rechnungen.ts';
import { preisliste, standardSetzen, verwendung } from '../src/preise/preislisten.ts';
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

/** Freigegebene Liste mit einer Position 21201 (MT) zu `preis` */
async function liste(name: string, preis: number): Promise<string> {
  const id = (await db.query<{ id: string }>("INSERT INTO preisliste (name, status, freigegeben_am) VALUES ($1, 'freigegeben', now()) RETURNING id::text", [name])).rows[0]!.id;
  await db.query("INSERT INTO preisliste_position (preisliste_id, reihenfolge, nummer, bezeichnung, gkv_preis, eigener_preis, uebernehmen) VALUES ($1, 1, '21201', 'Manuelle Therapie', 35.59, $2, true)", [id, preis]);
  return id;
}

before(async () => {
  db = await testDb();
  server = praxisDienst({ erlaubt: ['lilli@example.org'], fassung: 't', angemeldet: async () => true, pruefen: async () => [], kartei: karteiDienst({ db, tresor: t }) });
  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

test('Preisänderung = neue Liste: fertige Rechnung bleibt, Entwurf behält Preise bis „Preise übernehmen“; Verwendung wird vermerkt', async () => {
  const alt = await liste('Preise 2026', 50);
  await standardSetzen(db, alt, 'x');
  const pid = await patientAnlegen(db, t, { vorname: 'Karin', nachname: 'Zwölfer', adresse: { bezeichnung: 'Zuhause', zusatz: null, strasse: 'Weg', hausnummer: '1', plz: '86825', ort: 'Bad Wörishofen' } }, 'x');
  await verordnungAnlegen(db, t, pid, { ausgestelltAm: '2026-10-01', massnahme: 'Manuelle Therapie', leistungNummer: '21201', anzahl: 2 }, 'x');
  const entwurf = (await db.query<{ id: string }>('SELECT id::text FROM rechnung WHERE patient_id = $1', [pid])).rows[0]!.id;
  let r = (await rechnungLesen(db, pid, entwurf))!;
  assert.deepEqual([r.preisliste?.id, r.positionen.map((p) => p.einzelpreis), r.betrag], [alt, [50, 50], 100]);
  assert.deepEqual((await verwendung(db, alt)).rechnungen, [`Rechnung ${entwurf}`], 'Verwendung vermerkt');
  assert.equal((await preisliste(db, alt))!.genutzt, true, 'genutzt – nie mehr löschbar');
  // Zweite Rechnung fertigstellen, dann die Preise ändern (= neue Standard-Liste)
  await verordnungAnlegen(db, t, pid, { ausgestelltAm: '2026-10-02', massnahme: 'Manuelle Therapie', leistungNummer: '21201', anzahl: 1 }, 'x');
  const fertigId = (await db.query<{ id: string }>('SELECT id::text FROM rechnung WHERE patient_id = $1 ORDER BY id DESC LIMIT 1', [pid])).rows[0]!.id;
  await rechnungStatus(db, pid, fertigId, 'fertig', {}, 'x');
  const neu = await liste('Preise 2027', 60);
  await standardSetzen(db, neu, 'x');
  const fertig = (await rechnungLesen(db, pid, fertigId))!;
  assert.deepEqual([fertig.status, fertig.preisliste?.id, fertig.positionen[0]!.einzelpreis, fertig.betrag], ['freigegeben', alt, 50, 50], 'fertige Rechnung: alte Liste, alter Preis');
  await assert.rejects(preiseAktualisieren(db, pid, fertigId, 'x'), /Entwurf/);
  r = (await rechnungLesen(db, pid, entwurf))!;
  assert.deepEqual([r.preisliste?.id, r.betrag], [alt, 100], 'Entwurf behält die alten Preise von selbst');
  // Rechnungsseite bietet die Übernahme an, weil die gültige Liste abweicht
  let html = await seite(`/patienten/${pid}/rechnungen/${entwurf}`);
  assert.match(html, /data-hilfe="rechnung.preise">[\s\S]{0,600}?Preise aus „Preise 2027“ übernehmen/);
  const u = await post({ aktion: 'rechnung_preise', id: pid, rechnung_id: entwurf, zurueck: `/patienten/${pid}` });
  assert.match(ziel(u), /meldung=Preise aus „Preise 2027“ übernommen – 2 Position\(en\) angepasst/);
  r = (await rechnungLesen(db, pid, entwurf))!;
  assert.deepEqual([r.preisliste?.id, r.positionen.map((p) => p.einzelpreis), r.betrag], [neu, [60, 60], 120]);
  html = await seite(`/patienten/${pid}/rechnungen/${entwurf}`);
  assert.doesNotMatch(html, /rechnung\.preise/, 'nichts mehr zu übernehmen');
  assert.match(html, /Preise 2027<\/a> <span class="hint">\(Stand dieser Rechnung\)/);
  // Neue Rechnung nach der Änderung nimmt die neue Liste
  await verordnungAnlegen(db, t, pid, { ausgestelltAm: '2026-10-03', massnahme: 'Manuelle Therapie', leistungNummer: '21201', anzahl: 1 }, 'x');
  const dritte = (await db.query<{ id: string }>('SELECT id::text FROM rechnung WHERE patient_id = $1 ORDER BY id DESC LIMIT 1', [pid])).rows[0]!.id;
  assert.equal((await rechnungLesen(db, pid, dritte))!.preisliste?.id, neu);
});

test('Stammdaten: Standard oder aktive Liste wählbar; inaktive Zuordnung fällt auf den Standard zurück', async () => {
  const standard = (await db.query<{ id: string; name: string }>('SELECT id::text, name FROM preisliste WHERE standard')).rows[0]!;
  const tagesgast = await liste('Tagesgast', 80);
  await db.query('UPDATE preisliste SET aktiv = true WHERE id = $1', [tagesgast]);
  const p = await post({ aktion: 'anlegen', vorname: 'Theo', nachname: 'Tagesgast' });
  const pid = /\/patienten\/(\d+)/.exec(ziel(p))![1]!;
  let html = await seite(`/patienten/${pid}/bearbeiten`);
  assert.match(html, new RegExp(`<option value="" selected>Standard \\(zurzeit „${standard.name}“\\)</option>`));
  assert.match(html, /<option value="\d+">Tagesgast<\/option>/);
  assert.match(html, new RegExp(`Es gilt: ${standard.name} \\(Standard\\)`));
  // Stammdaten speichern mit Tagesgast
  await post({ aktion: 'stammdaten', id: pid, vorname: 'Theo', nachname: 'Tagesgast', preisliste_id: tagesgast });
  html = await seite(`/patienten/${pid}/bearbeiten`);
  assert.match(html, /<option value="\d+" selected>Tagesgast<\/option>/);
  assert.match(html, /Es gilt: Tagesgast</);
  await verordnungAnlegen(db, t, pid, { ausgestelltAm: '2026-10-01', massnahme: 'Manuelle Therapie', leistungNummer: '21201', anzahl: 1 }, 'x');
  const re = (await db.query<{ id: string }>('SELECT id::text FROM rechnung WHERE patient_id = $1', [pid])).rows[0]!.id;
  assert.equal((await rechnungLesen(db, pid, re))!.positionen[0]!.einzelpreis, 80, 'Tagesgast-Preis');
  // Tagesgast deaktivieren: Zuordnung bleibt, es gilt der Standard
  await db.query('UPDATE preisliste SET aktiv = false WHERE id = $1', [tagesgast]);
  html = await seite(`/patienten/${pid}/bearbeiten`);
  assert.match(html, /Tagesgast \(nicht mehr aktiv – es gilt der Standard\)/);
  assert.match(html, new RegExp(`Es gilt: ${standard.name}`));
  // Zurück auf Standard (leere Wahl)
  await post({ aktion: 'stammdaten', id: pid, vorname: 'Theo', nachname: 'Tagesgast', preisliste_id: '' });
  assert.equal((await db.query<{ p: string | null }>('SELECT preisliste_id::text AS p FROM patient WHERE id = $1', [pid])).rows[0]!.p, null);
});
