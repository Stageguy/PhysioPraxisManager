import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { before, after, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { migriere, type Db } from '../src/db/index.ts';
import { preislistenDienst } from '../src/preise/dienst.ts';
import { praxisDienst } from '../src/server.ts';

const GKV = `Lesefassung gültig ab 01.01.2026\n${Array.from({ length: 25 }, (_, i) => `X05${String(i).padStart(2, '0')} Leistung ${i} (KG)\n(Regelbehandlungszeit 15 bis 25 Minuten) ${20 + i},00 2,00`).join('\n')}`;
const BH = `<table>${Array.from({ length: 25 }, (_, i) => `<tr><td>${i + 1}</td><td>Leistung ${i} (KG), Richtwert: 15 bis 25 Minuten</td><td>${19 + i},00</td></tr>`).join('')}</table>`;
const holen = async (url: string) =>
  url.endsWith('.jsp') ? new Response('<a href="/m/a.pdf" title="Link &ouml;ffnet PDF &quot;Anlage 2: Verg&uuml;tungsvereinbarung (Lesefassung, g&uuml;ltig ab 01.01.2026)&quot;">x</a>')
    : url.endsWith('.pdf') ? new Response('%PDF') : url.includes('gesetze') ? new Response(BH) : new Response('15. Auflage');

let basis = '';
let db: Db;
let server: ReturnType<typeof praxisDienst>;
const wer = { 'Tailscale-User-Login': 'lilli@example.org' };
const post = (felder: Record<string, string | string[]>, kopf: Record<string, string> = { 'Sec-Fetch-Site': 'same-origin' }) => {
  const f = new URLSearchParams();
  for (const [k, v] of Object.entries(felder)) for (const x of [v].flat()) f.append(k, x);
  return fetch(`${basis}/preislisten/aktion`, { method: 'POST', redirect: 'manual', headers: { ...wer, ...kopf, 'Content-Type': 'application/x-www-form-urlencoded' }, body: f.toString() });
};
const ziel = (r: Response) => decodeURIComponent(r.headers.get('location') ?? '');
const seite = async (pfad: string) => (await fetch(`${basis}${pfad}`, { headers: wer })).text();

before(async () => {
  const pg = new PGlite();
  db = { query: (t, v) => pg.query(t, v), exec: (s) => pg.exec(s) } as Db;
  await migriere(db);
  server = praxisDienst({ erlaubt: ['lilli@example.org'], fassung: 't', angemeldet: async () => true, pruefen: async () => [],
    preislisten: preislistenDienst({ db, holen, textAus: async () => GKV }) });
  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

test('Ablauf: prüfen → roter Punkt → anlegen → speichern → freigeben → aktiv → archiv → zurück', async () => {
  assert.equal((await post({ aktion: 'pruefen' }, {})).status, 403, 'nur von der eigenen Seite');
  const p = await post({ aktion: 'pruefen' });
  assert.match(ziel(p), /GKV: neu – Lesefassung gültig ab 01\.01\.2026 · Beihilfe: neu – .* · GebüTh: neu – 15\. Auflage/);
  assert.match(await seite('/'), /class="menue-punkt"[^>]*>3</, 'roter Punkt am Menü – auch auf anderen Seiten');
  await post({ aktion: 'gesehen' });
  assert.ok(!/class="menue-punkt"/.test(await seite('/preislisten')));

  const gkv = (await db.query<{ id: string }>("SELECT id::text FROM preisquelle WHERE art = 'gkv'")).rows[0]!.id;
  const bh = (await db.query<{ id: string }>("SELECT id::text FROM preisquelle WHERE art = 'beihilfe'")).rows[0]!.id;
  const neu = await post({ aktion: 'anlegen', name: 'Privat 2026', grundlage: 'gkv', gkv_id: gkv, beihilfe_id: bh, standard_faktor: '1,3', zurueck: '/preislisten/neu' });
  const m = /\/preislisten\/(\d+)\/bearbeiten/.exec(ziel(neu));
  assert.ok(m, ziel(neu));
  const id = m![1]!;
  const editor = await seite(`/preislisten/${id}/bearbeiten`);
  assert.match(editor, /name="z_preis_20500" value="26,00"/, '20,00 × 1,3');
  assert.match(editor, /Beihilfe 19,00/);

  const nummern = Array.from({ length: 25 }, (_, i) => `205${String(i).padStart(2, '0')}`);
  const felder: Record<string, string | string[]> = { aktion: 'speichern', id, name: 'Privat 2026', standard_faktor: '1,3', z_nummer: nummern, zurueck: `/preislisten/${id}/bearbeiten` };
  for (const n of nummern) Object.assign(felder, { [`z_uebernehmen_${n}`]: '1', [`z_faktor_${n}`]: '1,3', [`z_preis_${n}`]: '' });
  felder.z_preis_20500 = '30,00';
  delete felder.z_uebernehmen_20524;
  assert.match(ziel(await post(felder)), /Gespeichert/);
  assert.match(await seite(`/preislisten/${id}/bearbeiten`), /name="z_faktor_20500" value="1,5"/, 'Faktor folgt dem Preis');

  assert.match(ziel(await post({ aktion: 'freigeben', id })), /Freigegeben/);
  assert.match(ziel(await post({ aktion: 'speichern', id, name: 'x', z_nummer: [], zurueck: `/preislisten/${id}/bearbeiten` })), /fehler=.*nicht mehr ändern/);
  assert.match(ziel(await post({ aktion: 'aktiv', aktiv_id: id })), /aktive Preisliste/);
  assert.match(await seite('/preislisten'), /class="pk aktiv"/);
  assert.match(ziel(await post({ aktion: 'archivieren', id, zurueck: `/preislisten/${id}` })), /fehler=.*aktive/);

  const zweit = /\/preislisten\/(\d+)\//.exec(ziel(await post({ aktion: 'anlegen', name: 'Kopie', grundlage: 'preisliste', basis_id: id, zurueck: '/preislisten/neu' })))![1]!;
  assert.match(await seite(`/preislisten/${zweit}/bearbeiten`), /name="z_preis_20500" value="30,00"/, 'Kopie übernimmt die Preise');
  for (const n of nummern) felder[`z_uebernehmen_${n}`] = '1';
  await post({ ...felder, id: zweit, zurueck: `/preislisten/${zweit}/bearbeiten` });
  await post({ aktion: 'freigeben', id: zweit });
  await post({ aktion: 'aktiv', aktiv_id: zweit });
  assert.match(ziel(await post({ aktion: 'archivieren', id, zurueck: `/preislisten/${id}` })), /Archiviert/);
  assert.match(await seite('/preislisten/archiv'), /Privat 2026/);
  assert.match(ziel(await post({ aktion: 'wiederherstellen_aktiv', id, zurueck: '/preislisten/archiv' })), /aktiv gesetzt/);
});

test('Original der Grundlage: PDF zum Ansehen, fremdes HTML nur als Download', async () => {
  const ids = (await db.query<{ id: string; art: string }>('SELECT id::text, art::text FROM preisquelle')).rows;
  const pdf = await fetch(`${basis}/preislisten/quelle/${ids.find((x) => x.art === 'gkv')!.id}/original`, { headers: wer });
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  const html = await fetch(`${basis}/preislisten/quelle/${ids.find((x) => x.art === 'beihilfe')!.id}/original`, { headers: wer });
  assert.match(html.headers.get('content-disposition') ?? '', /^attachment/);
  assert.match(html.headers.get('content-security-policy') ?? '', /sandbox/);
});

test('Positionsseite und Zuordnung ändern', async () => {
  const neu = await post({ aktion: 'anlegen', name: 'Pos', grundlage: 'gkv', gkv_id: (await db.query<{ id: string }>("SELECT id::text FROM preisquelle WHERE art = 'gkv'")).rows[0]!.id,
    beihilfe_id: (await db.query<{ id: string }>("SELECT id::text FROM preisquelle WHERE art = 'beihilfe'")).rows[0]!.id, zurueck: '/preislisten/neu' });
  const id = /\/preislisten\/(\d+)\//.exec(ziel(neu))![1]!;
  const pos = (await db.query<{ id: string }>("SELECT id::text FROM preisliste_position WHERE preisliste_id = $1 AND nummer = '20503'", [id])).rows[0]!.id;
  const html = await seite(`/preislisten/${id}/positionen/${pos}`);
  assert.match(html, /X0503/);
  const kandidat = (await db.query<{ id: string }>("SELECT id::text FROM preisquelle_position WHERE nummer = '10'")).rows[0]!.id;
  assert.match(ziel(await post({ aktion: 'beihilfe', id, position_id: pos, beihilfe_position_id: kandidat, notiz: 'geprüft', zurueck: `/preislisten/${id}/positionen/${pos}` })), /Zuordnung gespeichert/);
  assert.match(await seite(`/preislisten/${id}/positionen/${pos}`), /Nr\. <b>10<\/b>/);
});

test('Speichern fragt nach einem neuen Muster – nur bei Abweichung; neues Muster, Name doppelt, Nein', async () => {
  const gkv = (await db.query<{ id: string }>("SELECT id::text FROM preisquelle WHERE art = 'gkv'")).rows[0]!.id;
  const id = /\/preislisten\/(\d+)\//.exec(ziel(await post({ aktion: 'anlegen', name: 'M', grundlage: 'gkv', gkv_id: gkv, standard_faktor: '1,2', zurueck: '/preislisten/neu' })))![1]!;
  const nummern = Array.from({ length: 25 }, (_, i) => `205${String(i).padStart(2, '0')}`);
  const felder = (preis20500: string) => {
    const f: Record<string, string | string[]> = { aktion: 'speichern', id, name: 'M', standard_faktor: '1,2', z_nummer: nummern, zurueck: `/preislisten/${id}/bearbeiten` };
    for (const n of nummern) Object.assign(f, { [`z_uebernehmen_${n}`]: '1', [`z_faktor_${n}`]: '1,2', [`z_preis_${n}`]: '' });
    f.z_preis_20500 = preis20500;
    return f;
  };
  assert.ok(!/muster_frage/.test(ziel(await post(felder('')))), 'ohne Muster keine Frage');
  assert.match(ziel(await post({ aktion: 'vorlage', id, vorlage_name: 'Grundmuster', zurueck: `/preislisten/${id}/bearbeiten` })), /Muster „Grundmuster“ gespeichert/);
  assert.ok(!/muster_frage/.test(ziel(await post(felder('')))), 'unverändert zum Muster: keine Frage');
  const mitFrage = ziel(await post(felder('99,00')));
  assert.match(mitFrage, /bearbeiten\?muster_frage=1&meldung=Gespeichert/);
  assert.match(await seite(`/preislisten/${id}/bearbeiten?muster_frage=1`), /Neues Muster speichern\?.*Grundmuster/s);
  assert.match(ziel(await post({ aktion: 'muster_neu', id, muster_name: 'Grundmuster', zurueck: `/preislisten/${id}/bearbeiten?muster_frage=1` })), /fehler=Ein Muster „Grundmuster“ gibt es schon/);
  assert.match(ziel(await post({ aktion: 'muster_neu', id, muster_name: 'Grundmuster 2', zurueck: `/preislisten/${id}/bearbeiten` })), /Neues Muster „Grundmuster 2“/);
  assert.ok(!/Neues Muster speichern\?/.test(await seite(`/preislisten/${id}/bearbeiten?muster_frage=1`)), 'jetzt gleich dem neuen Muster');
  assert.match(ziel(await post({ aktion: 'muster_nein', id })), /Muster bleibt/);
});
