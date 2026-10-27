/** Rechnungen aus Lexware als Kacheln beim Patienten (W103): Belegliste, Datei im Tresor, Jahresgruppen, PDF-Anzeige, Probelauf */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import type { Db } from '../src/db/index.ts';
import { karteiDienst } from '../src/kartei/dienst.ts';
import { rechnungenUebernehmen, statusAusLexware } from '../src/kartei/lexware-rechnungen.ts';
import { LexwareClient, type Beleg } from '../src/lexware/client.ts';
import { attrappeKunden } from '../src/lexware/kunden.ts';
import { attrappeRechnungen, lexwareRechnungen, type LexwareRechnungen } from '../src/lexware/rechnungen.ts';
import { praxisDienst } from '../src/server.ts';
import { neuerHauptschluessel, tresor } from '../src/tresor.ts';
import { testDb } from './testdb.ts';

test('Status aus Lexware: paid/paidoff → bezahlt, voided → storniert, draft → Entwurf, sonst versendet', () => {
  assert.deepEqual(['paid', 'paidoff', 'voided', 'draft', 'open', 'overdue', 'transferred', 'sepadebit'].map(statusAusLexware), ['bezahlt', 'bezahlt', 'storniert', 'entwurf', 'gesendet', 'gesendet', 'gesendet', 'gesendet']);
});

test('Client: Belegliste je Kontakt, Datei mit Namen aus Content-Disposition, Entwurf ohne Datei', async () => {
  const abrufe: string[] = [];
  const abruf = (async (url: string) => {
    abrufe.push(url);
    if (url.includes('/voucherlist')) return Response.json({ content: [{ id: 'i1', voucherType: 'invoice', voucherStatus: 'paid', voucherNumber: 'RE-1', contactId: 'c1' }], last: true });
    if (url.endsWith('/invoices/i1/file')) return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { status: 200, headers: { 'content-type': 'application/pdf', 'content-disposition': "attachment; filename*=UTF-8''RE-1%20Test.pdf" } });
    if (url.endsWith('/invoices/i2/file')) return new Response('', { status: 409 });
    return new Response('', { status: 404 });
  }) as typeof fetch;
  const q = lexwareRechnungen(new LexwareClient('k', { abruf, abstandMs: 0 }));
  const belege: Beleg[] = [];
  for await (const b of q.belege({ kontaktId: 'c1' })) belege.push(b);
  assert.equal(belege.length, 1);
  assert.match(abrufe[0]!, /voucherType=invoice&voucherStatus=draft%2Copen%2Cpaid%2Cpaidoff%2Cvoided%2Ctransferred%2Csepadebit&page=0&size=250&contactId=c1$/);
  const d = await q.datei('i1');
  assert.deepEqual([d?.name, Array.from(d!.daten)], ['RE-1 Test.pdf', [0x25, 0x50, 0x44, 0x46]]);
  assert.equal(await q.datei('i2'), undefined, 'Entwurf: 409 → keine Datei');
});

test('Attrappe: sechs erfundene Rechnungen zu drei Kunden, jede festgeschriebene mit PDF', async () => {
  const a = attrappeRechnungen();
  const alle: Beleg[] = [];
  for await (const b of a.belege()) alle.push(b);
  assert.equal(alle.length, 6);
  assert.equal(new Set(alle.map((b) => b.contactId)).size, 3);
  for (const b of alle) assert.equal(Buffer.from((await a.datei(b.id))!.daten.subarray(0, 4)).toString(), '%PDF', b.voucherNumber);
  assert.equal((await a.zahlung('attrappe-re-1')).paidDate?.slice(0, 10), '2025-03-12');
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
const anlegen = async (vorname: string, nachname: string, mehr: Record<string, string> = {}) => /\/patienten\/(\d+)/.exec(ziel(await post({ aktion: 'anlegen', vorname, nachname, ...mehr })))![1]!;
const anzahl = async (patientId: string) => Number((await db.query<{ n: string }>('SELECT count(*)::text AS n FROM rechnung WHERE patient_id = $1', [patientId])).rows[0]!.n);

const attrappe = attrappeRechnungen();
/** Attrappe mit Schalter: die offene Rechnung RE-2026-0088 wird in Lexware bezahlt */
let bezahltUmstellen = false;
const quelle: LexwareRechnungen = {
  attrappe: true,
  async *belege(o) {
    for await (const b of attrappe.belege(o)) yield bezahltUmstellen && b.id === 'attrappe-re-3' ? { ...b, voucherStatus: 'paid', openAmount: 0, updatedDate: '2026-10-20T09:00:00Z' } : b;
  },
  datei: (id) => attrappe.datei(id),
  zahlung: async (id) => (bezahltUmstellen && id === 'attrappe-re-3' ? { openAmount: 0, paymentStatus: 'balanced', voucherStatus: 'paid', paidDate: '2026-10-19T00:00:00.000+02:00' } : attrappe.zahlung(id)),
};

before(async () => {
  db = await testDb();
  server = praxisDienst({ erlaubt: ['lilli@example.org'], fassung: 't', angemeldet: async () => true, pruefen: async () => [], kartei: karteiDienst({ db, tresor: t, lexware: attrappeKunden(), lexwareRechnungen: quelle }) });
  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

let annaId = '';
test('Übernahme: Kacheln je Jahr, Datei im Tresor, Zahldatum; Probelauf schreibt nichts; zweiter Lauf unverändert; Bezahlung aus Lexware', async () => {
  annaId = await anlegen('Anna', 'Beispiel', { email: 'shopping+anna@2late.de' });
  let r = await post({ aktion: 'lexware_rechnungen', id: annaId, zurueck: `/patienten/${annaId}` });
  assert.match(ziel(r), /fehler=Dieser Patient ist mit keinem Lexware-Kunden verknüpft/);
  assert.doesNotMatch(await seite(`/patienten/${annaId}`), /patient\.lexware_rechnungen/, 'Knopf erst nach Verknüpfung');
  await post({ aktion: 'lexware_zuordnen', id: annaId, kundennummer: '10001', kontakt_id: 'attrappe-1', zurueck: '/patienten/lexware' });
  assert.match(await seite(`/patienten/${annaId}`), /data-hilfe="patient.lexware_rechnungen"/);
  const probe = await rechnungenUebernehmen(db, t, quelle, { patientId: annaId, wer: 'x', probelauf: true });
  assert.deepEqual([probe.gefunden, probe.neu, probe.aktualisiert, probe.ohnePatient], [3, 3, 0, 0]);
  assert.equal(await anzahl(annaId), 0, 'Probelauf schreibt nichts');
  r = await post({ aktion: 'lexware_rechnungen', id: annaId, zurueck: `/patienten/${annaId}` });
  assert.match(ziel(r), /meldung=Aus Lexware: 3 Rechnungen in Lexware – 3 neu, 0 aktualisiert, 0 unverändert · 3 Dateien in den Tresor gelegt\.#rechnungen$/);
  const rows = (await db.query<Record<string, unknown>>(
    'SELECT nummer, status::text, quelle, datum::text, faellig_am::text, bezahlt_am::text, betrag::text, lexware_pdf_name AS name, lexware_pdf AS pdf, steuerklasse::text, lexware_status FROM rechnung WHERE patient_id = $1 ORDER BY nummer', [annaId],
  )).rows;
  assert.deepEqual(rows.map((x) => [x.nummer, x.status, x.quelle, x.datum, x.faellig_am, x.bezahlt_am, x.betrag, x.name, x.steuerklasse, x.lexware_status]), [
    ['RE-2025-0007', 'bezahlt', 'lexware', '2025-03-03', '2025-03-17', '2025-03-12', '89.00', 'RE-2025-0007.pdf', null, 'paid'],
    ['RE-2026-0031', 'bezahlt', 'lexware', '2026-02-02', '2026-02-16', '2026-02-10', '178.00', 'RE-2026-0031.pdf', null, 'paid'],
    ['RE-2026-0088', 'gesendet', 'lexware', '2026-10-01', '2026-10-15', null, '89.00', 'RE-2026-0088.pdf', null, 'open'],
  ]);
  for (const x of rows) assert.notEqual(Buffer.from(x.pdf as Uint8Array).subarray(0, 4).toString(), '%PDF', 'im Tresor, nicht im Klartext');
  // Patientenseite: Jahre, Dateiname, Zahldatum, Klick führt zum PDF
  const html = await seite(`/patienten/${annaId}`);
  assert.match(html, /<h3 class="rk-jahr">2026 <span class="hint">2<\/span><\/h3>[\s\S]*<h3 class="rk-jahr">2025 <span class="hint">1<\/span><\/h3>/);
  assert.match(html, /href="\/patienten\/\d+\/rechnungen\/\d+\/pdf" target="_blank" rel="noopener" data-hilfe="patient.rechnung.lexware">[\s\S]{0,800}<b>RE-2025-0007<\/b>[\s\S]{0,800}<dt>Datei<\/dt><dd>RE-2025-0007\.pdf<\/dd>[\s\S]{0,400}<dt>Bezahlt<\/dt><dd>12\.03\.2025<\/dd>/);
  assert.match(html, /RE-2026-0088[\s\S]{0,200}überfällig/);
  assert.match(html, /aus Lexware · paid/);
  assert.match(html, /name="anhang_rechnung"[^>]*> Rechnung RE-2025-0007 \(PDF\)/, 'als Mail-Anhang wählbar');
  const rid = (await db.query<{ id: string }>('SELECT id::text FROM rechnung WHERE nummer = $1', ['RE-2025-0007'])).rows[0]!.id;
  const pdf = await fetch(`${basis}/patienten/${annaId}/rechnungen/${rid}/pdf`, { headers: wer });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.match(pdf.headers.get('content-disposition') ?? '', /^inline; filename\*=UTF-8''RE-2025-0007\.pdf$/);
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), '%PDF', 'entschlüsselt ausgeliefert');
  assert.match(await seite(`/patienten/${annaId}/rechnungen/${rid}`), /Aus Lexware übernommen/);
  // zweiter Lauf: nichts zu tun
  r = await post({ aktion: 'lexware_rechnungen', id: annaId, zurueck: `/patienten/${annaId}` });
  assert.match(ziel(r), /3 Rechnungen in Lexware – 0 neu, 0 aktualisiert, 3 unverändert\./);
  // in Lexware bezahlt → aktualisiert, Zahldatum kommt mit
  bezahltUmstellen = true;
  try {
    r = await post({ aktion: 'lexware_rechnungen', id: annaId, zurueck: `/patienten/${annaId}` });
    assert.match(ziel(r), /0 neu, 1 aktualisiert, 2 unverändert/);
    assert.deepEqual((await db.query('SELECT status::text, bezahlt_am::text FROM rechnung WHERE nummer = $1', ['RE-2026-0088'])).rows[0], { status: 'bezahlt', bezahlt_am: '2026-10-19' });
  } finally {
    bezahltUmstellen = false;
  }
});

test('PPM-Rechnung mit derselben Nummer wird verknüpft statt verdoppelt; Storno aus Lexware; Nummer bei fremdem Patienten = Konflikt', async () => {
  const berndId = await anlegen('Bernd', 'Mustermann');
  await post({ aktion: 'lexware_zuordnen', id: berndId, kundennummer: '10002', kontakt_id: 'attrappe-2', zurueck: '/patienten/lexware' });
  await db.query(`INSERT INTO rechnung (patient_id, art, steuerklasse, empfaenger, status, nummer, betrag) VALUES ($1, 'einzel', 'heilbehandlung_steuerfrei', '{"name":"Bernd"}', 'freigegeben', 'RE-2026-0040', 60)`, [berndId]);
  const r = await post({ aktion: 'lexware_rechnungen', id: berndId, zurueck: `/patienten/${berndId}` });
  assert.match(ziel(r), /2 Rechnungen in Lexware – 1 neu, 1 aktualisiert, 0 unverändert · 2 Dateien/);
  const rows = (await db.query<Record<string, unknown>>('SELECT nummer, status::text, quelle, lexware_invoice_id AS lx, storno_grund AS grund, (lexware_pdf IS NOT NULL) AS pdf FROM rechnung WHERE patient_id = $1 ORDER BY nummer', [berndId])).rows;
  assert.deepEqual(rows.map((x) => [x.nummer, x.status, x.quelle, x.lx, x.grund, x.pdf]), [
    ['RE-2024-0012', 'bezahlt', 'lexware', 'attrappe-re-4', null, true],
    ['RE-2026-0040', 'storniert', 'ppm', 'attrappe-re-5', 'in Lexware storniert', true],
  ]);
  assert.equal(await anzahl(berndId), 2, 'nicht verdoppelt');
  // Konflikt: Yvonnes Nummer steht schon bei Anna
  const claraId = await anlegen('Clara', 'Testfeld');
  await post({ aktion: 'lexware_zuordnen', id: claraId, kundennummer: '10005', kontakt_id: 'attrappe-5', zurueck: '/patienten/lexware' });
  await db.query(`INSERT INTO rechnung (patient_id, art, steuerklasse, empfaenger, status, nummer, betrag) VALUES ($1, 'einzel', 'heilbehandlung_steuerfrei', '{"name":"Anna"}', 'freigegeben', 'RE-2026-0075', 95)`, [annaId]);
  const k = await post({ aktion: 'lexware_rechnungen', id: claraId, zurueck: `/patienten/${claraId}` });
  assert.match(ziel(k), /1 Rechnung in Lexware – 0 neu, 0 aktualisiert, 0 unverändert, 1 mit Nummernkonflikt\./);
  assert.equal(await anzahl(claraId), 0);
});

test('Gesamtlauf (CLI-Weg): alle verknüpften Patienten; Konflikte werden nur gezählt', async () => {
  // Anna 3 (RE-2026-0088 trägt noch den Stand „bezahlt am 20.10.“ aus dem Schalter-Lauf → gilt als geändert), Bernd 2 unverändert, Yvonne/Clara 1 Konflikt
  const e = await rechnungenUebernehmen(db, t, attrappe, { wer: 'x', probelauf: true });
  assert.deepEqual([e.gefunden, e.neu, e.aktualisiert, e.unveraendert, e.ohnePatient, e.konflikt], [6, 0, 1, 4, 0, 1]);
});
