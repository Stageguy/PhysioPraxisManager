import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { migriere, type Db } from '../src/db/index.ts';
import { LexwareClient, LexwareNichtBereit, type Beleg } from '../src/lexware/client.ts';
import { aufStufe, kategorienAnlegen } from '../src/mail/kategorien.ts';
import { kopfdaten } from '../src/rechnungen/kopfdaten.ts';
import { abgleichLexware, abgleichOutlook, belegZu } from '../src/zahlung/abgleich.ts';

test('Kopfdaten: Rechnungsnummer, Betrag, Datum', () => {
  const k = kopfdaten('Rechnung\nRechnungsnummer: RE-2026/0815\nRechnungsdatum: 03.10.2026\nGesamtbetrag 1.234,56 EUR');
  assert.deepEqual(k, { rechnungsnummer: 'RE-2026/0815', betrag: 1234.56, rechnungsdatum: '2026-10-03' });
  assert.equal(kopfdaten('Rechnungsnummer siehe oben').rechnungsnummer, undefined, 'Wort statt Nummer');
  assert.equal(kopfdaten('', 'Ihre Rechnung Nr. 4711-AB').rechnungsnummer, '4711-AB', 'aus dem Betreff');
  assert.equal(kopfdaten('Rechnungsbetrag 49.95').betrag, 49.95);
});

test('Stufen: an einer Mail steht nur die aktuelle, Lillis eigene Kategorien bleiben', () => {
  assert.deepEqual(aufStufe(['Rechnung: eingegangen', 'Privat'], 'Rechnung: bezahlt'), ['Privat', 'Rechnung: bezahlt']);
  assert.deepEqual(aufStufe(['Rechnung: abgelegt'], 'Rechnung: bezahlt'), ['Rechnung: bezahlt'], 'früherer Name verschwindet');
});

test('Lexware-Client: ohne Schlüssel klare Meldung, 401 → Tarif/Schlüssel, 429 → Rückzug', async () => {
  assert.throws(() => new LexwareClient(undefined), LexwareNichtBereit);
  const abruf401 = (async () => new Response('', { status: 401 })) as typeof fetch;
  await assert.rejects(new LexwareClient('k', { abruf: abruf401, abstandMs: 0 }).profil(), /Tarif XL/);
  let n = 0;
  const abruf429 = (async () => (++n === 1 ? new Response('', { status: 429 }) : Response.json({ organizationId: 'o' }))) as typeof fetch;
  assert.deepEqual(await new LexwareClient('k', { abruf: abruf429, abstandMs: 0 }).profil(), { organizationId: 'o' });
  assert.equal(n, 2);
});

test('Lexware-Client: Belegliste über mehrere Seiten, Status als Liste', async () => {
  const urls: string[] = [];
  const abruf = (async (url: string) => {
    urls.push(url);
    const seite = Number(new URL(url).searchParams.get('page'));
    return Response.json({ content: [{ id: `b${seite}`, voucherStatus: 'paid' }], last: seite === 1 });
  }) as typeof fetch;
  const ids = [];
  for await (const b of new LexwareClient('k', { abruf, abstandMs: 0 }).belege({ typ: 'purchaseinvoice', status: ['paid', 'transferred'] })) ids.push(b.id);
  assert.deepEqual(ids, ['b0', 'b1']);
  assert.match(decodeURIComponent(urls[0]!), /voucherType=purchaseinvoice&voucherStatus=paid,transferred&page=0&size=250/);
});

test('Zuordnung Mail ↔ Beleg: ID, Nummer, bei Gleichstand Betrag – sonst nichts', () => {
  const b = (id: string, nr: string, betrag: number): Beleg => ({ id, voucherType: 'purchaseinvoice', voucherStatus: 'paid', voucherNumber: nr, totalAmount: betrag });
  const nachId = new Map([['x', b('x', 'A1', 10)]]);
  const nachNummer = new Map([['A1', [b('x', 'A1', 10)]], ['B2', [b('y', 'B2', 20), b('z', 'B2', 30)]]]);
  const z = (felder: Partial<{ rechnungsnummer: string; betrag: string; lexware_voucher_id: string }>) =>
    ({ id: '1', graph_message_id: 'm', status: 'wartet_freigabe', rechnungsnummer: null, betrag: null, lexware_voucher_id: null, ...felder });
  assert.equal((belegZu(z({ lexware_voucher_id: 'x' }), nachId, nachNummer) as Beleg).id, 'x');
  assert.equal((belegZu(z({ rechnungsnummer: 'a1' }), nachId, nachNummer) as Beleg).id, 'x', 'Groß/klein egal');
  assert.equal(belegZu(z({ rechnungsnummer: 'B2' }), nachId, nachNummer), 'mehrdeutig');
  assert.equal((belegZu(z({ rechnungsnummer: 'B2', betrag: '30.00' }), nachId, nachNummer) as Beleg).id, 'z');
  assert.equal(belegZu(z({}), nachId, nachNummer), 'keiner', 'ohne Nummer nie raten');
});

// ── Abgleich gegen Datenbank, Postfach-Attrappe und Lexware-Attrappe ─────────
let pg: PGlite;
let db: Db;
beforeEach(async () => {
  pg = new PGlite();
  db = { query: (t, v) => pg.query(t, v), exec: (s) => pg.exec(s) } as Db;
  await migriere(db);
  for (const [id, nr, betrag] of [['m1', 'A1', 10], ['m2', 'B2', 20], ['m3', null, 30]] as const) {
    await db.query(
      `INSERT INTO inbound_document (graph_message_id, attachment_id, received_at, sender_domain, subject_hash, sha256, size, klasse, status, rechnungsnummer, betrag)
       VALUES ($1, 'a', now(), 'x.de', 'h', $1, 1, 'rechnung', 'wartet_freigabe', $2, $3)`,
      [id, nr, betrag],
    );
  }
});

function postfach(mails: Record<string, { categories: string[]; ordner: string }>) {
  const schreibend: string[] = [];
  return {
    schreibend,
    mails,
    async get<T>(pfad: string): Promise<T> {
      if (pfad.startsWith('/me/mailFolders/archive')) return { id: 'archiv' } as T;
      const id = /\/me\/messages\/([^?]+)/.exec(pfad)![1]!;
      if (!mails[id]) throw Object.assign(new Error('404'), { status: 404 });
      return { categories: mails[id].categories, parentFolderId: mails[id].ordner } as T;
    },
    async patch<T>(pfad: string, body: { categories: string[] }): Promise<T> {
      schreibend.push(`PATCH ${pfad}`);
      mails[/messages\/(.+)$/.exec(pfad)![1]!]!.categories = body.categories;
      return {} as T;
    },
    async post<T>(pfad: string, body: { destinationId: string }): Promise<T> {
      schreibend.push(`MOVE ${pfad} → ${body.destinationId}`);
      mails[/messages\/(.+)\/move/.exec(pfad)![1]!]!.ordner = body.destinationId === 'archive' ? 'archiv' : body.destinationId;
      return {} as T;
    },
    async *paginate<T>(): AsyncGenerator<T> {
      for (const [id, m] of Object.entries(mails)) if (m.categories.includes('Rechnung: bezahlt')) yield { id, parentFolderId: m.ordner, categories: m.categories } as T;
    },
  };
}

const lexware = (belege: Beleg[]) => ({
  async *belege() {
    yield* belege;
  },
  async zahlung() {
    return { openAmount: 0, paymentStatus: 'balanced' as const, voucherStatus: 'paid' as const, paidDate: '2026-10-15T00:00:00.000+02:00' };
  },
});

test('Lexware: bezahlt → Kategorie, Archiv, Datenbank; angestoßen → nur Kategorie; Probelauf ändert nichts', async () => {
  const mails = { m1: { categories: ['Rechnung: eingegangen'], ordner: 'verarbeitet' }, m2: { categories: ['Rechnung: eingegangen'], ordner: 'verarbeitet' }, m3: { categories: [], ordner: 'verarbeitet' } };
  const belege: Beleg[] = [
    { id: 'L1', voucherType: 'purchaseinvoice', voucherStatus: 'paid', voucherNumber: 'a1', totalAmount: 10 },
    { id: 'L2', voucherType: 'purchaseinvoice', voucherStatus: 'transferred', voucherNumber: 'B2', totalAmount: 20 },
  ];
  const probe = postfach(structuredClone(mails));
  const p = await abgleichLexware(probe, db, lexware(belege), { ausfuehren: false });
  assert.deepEqual(probe.schreibend, []);
  assert.deepEqual({ bezahlt: p.bezahlt, angestossen: p.angestossen, ohne: p.ohneZuordnung }, { bezahlt: 1, angestossen: 1, ohne: 1 });

  const g = postfach(mails);
  const b = await abgleichLexware(g, db, lexware(belege), { ausfuehren: true });
  assert.equal(b.archiviert, 1);
  assert.deepEqual(mails.m1, { categories: ['Rechnung: bezahlt'], ordner: 'archiv' });
  assert.deepEqual(mails.m2, { categories: ['Rechnung: Zahlung angestoßen'], ordner: 'verarbeitet' });
  const zeilen = (await db.query<{ graph_message_id: string; status: string; bezahlt_am: string | null; zahlstatus_quelle: string | null; lexware_voucher_id: string | null }>(
    "SELECT graph_message_id, status::text, to_char(bezahlt_am, 'YYYY-MM-DD') AS bezahlt_am, zahlstatus_quelle, lexware_voucher_id FROM inbound_document ORDER BY graph_message_id",
  )).rows;
  assert.deepEqual(zeilen[0], { graph_message_id: 'm1', status: 'bezahlt', bezahlt_am: '2026-10-15', zahlstatus_quelle: 'lexware', lexware_voucher_id: 'L1' });
  assert.equal(zeilen[1]!.status, 'zahlung_angestossen');
  assert.equal(zeilen[2]!.status, 'wartet_freigabe', 'ohne Rechnungsnummer bleibt alles, wie es ist');

  const zweiter = postfach(mails);
  await abgleichLexware(zweiter, db, lexware(belege), { ausfuehren: true });
  assert.deepEqual(zweiter.schreibend, [], 'ein zweiter Lauf tut nichts');
});

test('Übergang: von Lilli in Outlook als bezahlt markierte Mails kommen ins Archiv', async () => {
  const mails = { m1: { categories: ['Rechnung: eingegangen', 'Rechnung: bezahlt'], ordner: 'verarbeitet' }, m2: { categories: ['Rechnung: bezahlt'], ordner: 'archiv' } };
  const g = postfach(mails);
  const b = await abgleichOutlook(g, db, { ausfuehren: true });
  assert.equal(b.archiviert, 1, 'was schon im Archiv liegt, bleibt');
  assert.deepEqual(mails.m1, { categories: ['Rechnung: bezahlt'], ordner: 'archiv' });
  const { rows } = await db.query<{ status: string; zahlstatus_quelle: string }>("SELECT status::text, zahlstatus_quelle FROM inbound_document WHERE graph_message_id = 'm1'");
  assert.deepEqual(rows[0], { status: 'bezahlt', zahlstatus_quelle: 'manuell' });
});

test('Kategorien: früherer Name wird entfernt, aber nur wenn keine Mail ihn trägt', async () => {
  const geloescht: string[] = [];
  const graph = (benutzt: boolean) => ({
    async *paginate<T>(): AsyncGenerator<T> {
      yield { id: 'alt', displayName: 'Rechnung: abgelegt', color: 'preset3' } as T;
    },
    async post<T>(): Promise<T> {
      return {} as T;
    },
    async get<T>(): Promise<T> {
      return { value: benutzt ? [{ id: 'm' }] : [] } as T;
    },
    async delete(pfad: string) {
      geloescht.push(pfad);
    },
  });
  const a = await kategorienAnlegen(graph(true), { ausfuehren: true });
  assert.deepEqual([a.nochBenutzt, geloescht], [['Rechnung: abgelegt'], []]);
  const b = await kategorienAnlegen(graph(false), { ausfuehren: true });
  assert.deepEqual([b.entfernt, geloescht], [['Rechnung: abgelegt'], ['/me/outlook/masterCategories/alt']]);
});
