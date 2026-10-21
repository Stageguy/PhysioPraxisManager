import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { migriere, type Db } from '../src/db/index.ts';
import { AktionAbgelehnt, auswertung, ausfuehren, filterAus, liste, neueRechnungen, type Umgebung } from '../src/rechnungen/dashboard.ts';
import { rechnungsDienst } from '../src/rechnungen/dienst.ts';
import { gleicheHerkunft, praxisDienst } from '../src/server.ts';

let pg: PGlite;
let db: Db;

/** OneDrive + Postfach als Attrappe: Ordner nach Pfad, Dateien mit Elternordner, Mail-Kategorien */
function umgebung() {
  const ordner = new Map<string, string>([['x', 'o-x'], ['x/2026', 'o-jahr'], ['x/2026/Eingangsrechnungen', 'o-ein']]);
  const dateien = new Map<string, { eltern: string; name: string }>([['i1', { eltern: 'o-ein', name: 'a.pdf' }], ['i2', { eltern: 'o-ein', name: 'b.pdf' }]]);
  const mails = new Map<string, string[]>([['m1', ['Rechnung: eingegangen', 'Eigene']], ['m2', ['Rechnung: eingegangen']]]);
  const pfadVon = (id: string) => [...ordner].find(([, v]) => v === id)?.[0];
  let n = 0;
  const graph = {
    async get<T>(): Promise<T> { throw new Error('nicht erwartet'); },
    async find<T>(p: string): Promise<T | undefined> {
      const m = /\/me\/messages\/([^?]+)\?/.exec(p);
      if (m) return mails.has(m[1]!) ? ({ categories: mails.get(m[1]!), parentFolderId: 'f' } as T) : undefined;
      const o = /root:\/(.+):\?/.exec(p);
      if (o) { const id = ordner.get(decodeURIComponent(o[1]!)); return id ? ({ id, name: 'x', folder: { childCount: 0 } } as T) : undefined; }
      return undefined;
    },
    async post<T>(p: string, body: { name: string }): Promise<T> {
      const eltern = pfadVon(/items\/([^/]+)\/children/.exec(p)![1]!)!;
      const id = `o${++n}`;
      ordner.set(`${eltern}/${body.name}`, id);
      return { id, name: body.name } as T;
    },
    async patch<T>(p: string, body: { categories?: string[]; parentReference?: { id: string } }): Promise<T> {
      const mail = /\/me\/messages\/(.+)$/.exec(p);
      if (mail) { mails.set(mail[1]!, body.categories!); return {} as T; }
      const item = /items\/([^?]+)\?/.exec(p)![1]!;
      const d = dateien.get(item)!;
      d.eltern = body.parentReference!.id;
      return { id: item, name: d.name, webUrl: `https://od/${item}` } as T;
    },
    async stream(p: string): Promise<Response> { return new Response(`%PDF-1.4 ${p}`); },
  };
  return { graph, ordner, dateien, mails, pfadVon };
}

beforeEach(async () => {
  pg = new PGlite();
  db = { query: (t, v) => pg.query(t, v), exec: (s) => pg.exec(s) } as Db;
  await migriere(db);
  const zeile = (id: number, mail: string, item: string, lieferant: string, betrag: number | null, datum: string, status = 'wartet_freigabe') => db.query(
    `INSERT INTO inbound_document (id, graph_message_id, attachment_id, received_at, sender_domain, subject_hash, sha256, size, klasse, status,
       lieferant, betrag, rechnungsdatum, attachment_name, absender_name, absender_adresse, onedrive_item_id, onedrive_path)
     VALUES ($1, $2, 'a', $3::date, 'x.de', 'h', $2, 1, 'rechnung', $4, $5, $6, $3::date, 'Rechnung.pdf', 'Telekom', 'rechnung@telekom.de', $7, $8)`,
    [id, mail, datum, status, lieferant, betrag, item, `x/2026/Eingangsrechnungen/${item === 'i1' ? 'a' : 'b'}.pdf`]);
  await zeile(1, 'm1', 'i1', 'Telekom', 49.95, '2026-10-03');
  await zeile(2, 'm2', 'i2', 'bueroshop24', 20, '2026-09-15');
  await zeile(3, 'm3', 'i3', 'Telekom', 30, '2026-10-20', 'bezahlt');
});

const u = (graph: Umgebung['graph']): Umgebung => ({ db, graph, laufwerk: 'd', wer: 'lilli@example.org' });
const zeile = async (id: number) => (await db.query<Record<string, unknown>>('SELECT status::text, onedrive_path, reviewed_by, ablehnungsgrund, zurueckgestellt_am FROM inbound_document WHERE id = $1', [id])).rows[0]!;
const aktionen = async () => (await db.query<{ action: string }>('SELECT action FROM audit_event ORDER BY id')).rows.map((r) => r.action);

test('Freigeben: Stand, wer, Kategorie (eigene bleiben), Protokoll', async () => {
  const e = umgebung();
  assert.equal(await ausfuehren(u(e.graph), '1', { art: 'freigeben' }), 'freigegeben');
  assert.deepEqual([(await zeile(1)).status, (await zeile(1)).reviewed_by], ['freigegeben', 'lilli@example.org']);
  assert.deepEqual(e.mails.get('m1'), ['Eigene', 'Rechnung: freigegeben']);
  assert.deepEqual(await aktionen(), ['rechnung_freigegeben']);
  await assert.rejects(ausfuehren(u(e.graph), '1', { art: 'freigeben' }), AktionAbgelehnt, 'nicht zweimal');
});

test('Ablehnen: nur mit Grund; Datei nach Eingangsrechnungen/Abgelehnt', async () => {
  const e = umgebung();
  await assert.rejects(ausfuehren(u(e.graph), '1', { art: 'ablehnen', grund: '  ' }), /Grund/);
  await ausfuehren(u(e.graph), '1', { art: 'ablehnen', grund: 'doppelt berechnet' });
  const z = await zeile(1);
  assert.deepEqual([z.status, z.ablehnungsgrund, z.onedrive_path], ['abgelehnt', 'doppelt berechnet', 'x/2026/Eingangsrechnungen/Abgelehnt/a.pdf']);
  assert.equal(e.pfadVon(e.dateien.get('i1')!.eltern), 'x/2026/Eingangsrechnungen/Abgelehnt');
  assert.deepEqual(e.mails.get('m1'), ['Eigene', 'Rechnung: abgelehnt']);
});

test('Privat an und wieder aus: Datei, Stand und Kategorie kommen zurück', async () => {
  const e = umgebung();
  await ausfuehren(u(e.graph), '1', { art: 'privat', an: true });
  assert.equal((await zeile(1)).status, 'privat');
  assert.equal(e.pfadVon(e.dateien.get('i1')!.eltern), 'x/2026/Privat');
  assert.deepEqual(e.mails.get('m1'), ['Eigene', 'Rechnung: privat']);
  assert.deepEqual((await neueRechnungen(db)).map((r) => r.id), ['2'], 'privat steht nicht mehr bei den neuen');
  await ausfuehren(u(e.graph), '1', { art: 'privat', an: false });
  const z = await zeile(1);
  assert.deepEqual([z.status, z.onedrive_path], ['wartet_freigabe', 'x/2026/Eingangsrechnungen/a.pdf']);
  assert.equal(e.pfadVon(e.dateien.get('i1')!.eltern), 'x/2026/Eingangsrechnungen');
  assert.deepEqual(e.mails.get('m1'), ['Eigene', 'Rechnung: eingegangen']);
});

test('Später stellt zurück: Kachel rückt nach hinten', async () => {
  const e = umgebung();
  assert.deepEqual((await neueRechnungen(db)).map((r) => r.id), ['1', '2']);
  await ausfuehren(u(e.graph), '1', { art: 'spaeter' });
  const neu = await neueRechnungen(db);
  assert.deepEqual(neu.map((r) => [r.id, r.zurueckgestellt]), [['2', false], ['1', true]]);
});

test('Angaben korrigieren: prüfen, speichern, nur Feldnamen ins Protokoll', async () => {
  const e = umgebung();
  const felder = { lieferant: 'Telekom', rechnungsnummer: 're 4711', betrag: '59,90', rechnungsdatum: '2026-10-04' };
  await assert.rejects(ausfuehren(u(e.graph), '1', { art: 'speichern', ...felder, betrag: 'viel' }), /Betrag/);
  assert.equal(await ausfuehren(u(e.graph), '1', { art: 'speichern', ...felder }), 'gespeichert');
  const r = (await db.query<{ rechnungsnummer: string; betrag: string }>('SELECT rechnungsnummer, betrag::text FROM inbound_document WHERE id = 1')).rows[0];
  assert.deepEqual(r, { rechnungsnummer: 'RE4711', betrag: '59.90' });
  const d = (await db.query<{ details: { felder: string[] } }>("SELECT details FROM audit_event WHERE action = 'rechnung_korrigiert'")).rows[0]!.details;
  assert.deepEqual(d.felder.sort(), ['betrag', 'rechnungsdatum', 'rechnungsnummer']);
  assert.equal(await ausfuehren(u(e.graph), '1', { art: 'speichern', ...felder, rechnungsnummer: 'RE4711' }), 'unveraendert');
});

test('Auswertung: Summen je Monat und Lieferant ohne privat und abgelehnt; Filter und Suche', async () => {
  const e = umgebung();
  await ausfuehren(u(e.graph), '2', { art: 'privat', an: true });
  const a = await auswertung(db, 2026);
  assert.equal(a.monate[9], 79.95);
  assert.equal(a.monate[8], 0, 'privat zählt nicht');
  assert.deepEqual(a.lieferanten, [{ name: 'Telekom', summe: 79.95 }]);
  assert.deepEqual((await liste(db, filterAus(new URLSearchParams('jahr=2026&stand=privat')))).map((r) => r.id), ['2']);
  assert.deepEqual((await liste(db, filterAus(new URLSearchParams('jahr=2026&q=telekom.de')))).map((r) => r.id).sort(), ['1', '2', '3']);
  assert.deepEqual((await liste(db, filterAus(new URLSearchParams('jahr=2026&q=100%')))), [], 'Platzhalter werden nicht als Muster gelesen');
  assert.deepEqual(filterAus(new URLSearchParams('jahr=abc&stand=quatsch'), new Date('2026-05-01')), { jahr: 2026, stand: 'alle', suche: '' });
});

test('Dienst: Aktion nur per POST von der eigenen Seite, dann zurück mit Meldung; PDF wird durchgereicht', async () => {
  const e = umgebung();
  const dienst = praxisDienst({
    erlaubt: ['lilli@example.org'], fassung: 't', angemeldet: async () => true, pruefen: async () => [],
    rechnungen: rechnungsDienst({ db, graph: e.graph, laufwerk: 'd' }),
  });
  await new Promise<void>((f) => dienst.listen(0, '127.0.0.1', f));
  const basis = `http://127.0.0.1:${(dienst.address() as AddressInfo).port}`;
  const wer = { 'Tailscale-User-Login': 'lilli@example.org' };
  const post = (kopf: Record<string, string>) => fetch(`${basis}/finanzen/rechnungen/1/aktion`, {
    method: 'POST', redirect: 'manual', headers: { ...wer, 'Content-Type': 'application/x-www-form-urlencoded', ...kopf },
    body: 'aktion=freigeben&zurueck=/finanzen/rechnungen',
  });
  try {
    assert.equal((await post({ 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await post({})).status, 403, 'ohne Herkunft kein Zutritt');
    const ok = await post({ 'Sec-Fetch-Site': 'same-origin' });
    assert.equal(ok.status, 303);
    assert.equal(ok.headers.get('location'), '/finanzen/rechnungen?ergebnis=freigegeben');
    const fehler = await post({ 'Sec-Fetch-Site': 'same-origin' });
    assert.match(decodeURIComponent(fehler.headers.get('location') ?? ''), /fehler=Nur eingegangene/);
    const seite = await fetch(`${basis}/finanzen/rechnungen?ergebnis=freigegeben`, { headers: wer });
    assert.match(await seite.text(), /Rechnung freigegeben\./);
    const ansicht = await fetch(`${basis}/finanzen/rechnungen/2`, { headers: wer });
    assert.equal(ansicht.status, 200);
    const pdf = await fetch(`${basis}/finanzen/rechnungen/2/pdf`, { headers: wer });
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.match(await pdf.text(), /^%PDF-1\.4 \/drives\/d\/items\/i2\/content$/);
    assert.equal((await fetch(`${basis}/finanzen/rechnungen/999`, { headers: wer })).status, 404);
    assert.equal((await fetch(`${basis}/finanzen/rechnungen/1/pdf`)).status, 403, 'ohne Konto nichts');
  } finally {
    dienst.close();
  }
});

test('Herkunftsprüfung ohne Sec-Fetch-Site: Origin muss zum Host passen', () => {
  const req = (h: Record<string, string>) => ({ headers: h }) as never;
  assert.equal(gleicheHerkunft(req({ origin: 'http://praxis:10000', host: 'praxis:10000' })), true);
  assert.equal(gleicheHerkunft(req({ origin: 'https://boese.example', host: 'praxis:10000' })), false);
  assert.equal(gleicheHerkunft(req({ host: 'praxis:10000' })), false);
});
