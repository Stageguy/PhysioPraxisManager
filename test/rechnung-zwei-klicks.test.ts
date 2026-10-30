/** Rechnung in zwei Klicks (W100/A28): Klick 1 nach Lexware (Kontakt, Nummer, PDF), Klick 2 versenden per Mail oder Post */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import type { Db } from '../src/db/index.ts';
import { karteiDienst } from '../src/kartei/dienst.ts';
import { verordnungAnlegen } from '../src/kartei/patienten.ts';
import { LexwareClient } from '../src/lexware/client.ts';
import { attrappeKunden } from '../src/lexware/kunden.ts';
import { attrappeRechnungen, kontaktKoerper, lexwareDatum, lexwareRechnungen, rechnungKoerper } from '../src/lexware/rechnungen.ts';
import { einstellungSetzen } from '../src/kartei/konfiguration.ts';
import { standardSetzen } from '../src/preise/preislisten.ts';
import { rechnungsversandPruefen } from '../src/kartei/nachrichten.ts';
import { praxisDienst } from '../src/server.ts';
import { neuerHauptschluessel, tresor } from '../src/tresor.ts';
import { graphAttrappe } from './attrappe.ts';
import { testDb } from './testdb.ts';

test('Lexware-Datum mit Berliner Zeitzone; Kontakt- und Rechnungskörper wie die API sie will', () => {
  assert.equal(lexwareDatum('2026-10-28'), '2026-10-28T00:00:00.000+01:00', 'Winterzeit');
  assert.equal(lexwareDatum('2026-07-01'), '2026-07-01T00:00:00.000+02:00', 'Sommerzeit');
  const k = kontaktKoerper({ anrede: 'Frau', vorname: 'Anna', nachname: 'Test', strasse: 'Kurpromenade 3', plz: '86825', ort: 'Bad Wörishofen', land: null, email: 'a@example.org' });
  assert.deepEqual(k, { version: 0, roles: { customer: {} }, person: { salutation: 'Frau', firstName: 'Anna', lastName: 'Test' }, addresses: { billing: [{ street: 'Kurpromenade 3', zip: '86825', city: 'Bad Wörishofen', countryCode: 'DE' }] }, emailAddresses: { private: ['a@example.org'] } });
  const r = rechnungKoerper({ kontaktId: 'c1', datum: '2026-10-28', zeitraumVon: '2026-10-01', zeitraumBis: '2026-10-20', titel: 'Abschlussrechnung', bemerkung: 'Steuerfrei nach § 4 Nr. 14 UStG.', ustSatz: 0, positionen: [{ name: 'Manuelle Therapie (21201)', beschreibung: 'Behandlung am 01.10.2026', anzahl: 2, einzelpreis: 35.59 }] });
  assert.deepEqual(r.taxConditions, { taxType: 'vatfree' });
  assert.deepEqual(r.shippingConditions, { shippingType: 'serviceperiod', shippingDate: '2026-10-01T00:00:00.000+02:00', shippingEndDate: '2026-10-20T00:00:00.000+02:00' });
  assert.deepEqual(r.lineItems, [{ type: 'custom', name: 'Manuelle Therapie (21201)', description: 'Behandlung am 01.10.2026', quantity: 2, unitName: 'Einheit', unitPrice: { currency: 'EUR', netAmount: 35.59, taxRatePercentage: 0 } }]);
  assert.deepEqual(rechnungKoerper({ kontaktId: 'c1', datum: '2026-10-28', titel: 'Rechnung', ustSatz: 19, positionen: [] }).taxConditions, { taxType: 'net' });
});

test('Echte Quelle: Kontakt anlegen holt die Kundennummer nach; Rechnung mit finalize=true, dann Nummer und Fälligkeit lesen', async () => {
  const aufrufe: { methode: string; url: string; body?: unknown }[] = [];
  const abruf = (async (url: string, init?: RequestInit) => {
    aufrufe.push({ methode: init?.method ?? 'GET', url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.endsWith('/v1/contacts') && init?.method === 'POST') return Response.json({ id: 'k-neu', version: 1 }, { status: 201 });
    if (url.endsWith('/v1/contacts/k-neu')) return Response.json({ id: 'k-neu', version: 1, roles: { customer: { number: 10309 } } });
    if (url.endsWith('/v1/invoices?finalize=true') && init?.method === 'POST') return Response.json({ id: 'i-neu', version: 1 }, { status: 201 });
    if (url.endsWith('/v1/invoices/i-neu')) return Response.json({ id: 'i-neu', voucherNumber: 'RE1020', voucherStatus: 'open', voucherDate: '2026-10-28T00:00:00.000+01:00', dueDate: '2026-11-11T00:00:00.000+01:00', createdDate: '2026-10-28T10:00:00.000+01:00', updatedDate: '2026-10-28T10:00:00.000+01:00' });
    return new Response('', { status: 404 });
  }) as typeof fetch;
  const q = lexwareRechnungen(new LexwareClient('k', { abruf, abstandMs: 0 }));
  assert.deepEqual(await q.kontaktAnlegen({ nachname: 'Test' }), { id: 'k-neu', nummer: '10309' });
  const neu = await q.rechnungAnlegen({ kontaktId: 'k-neu', datum: '2026-10-28', titel: 'Rechnung', ustSatz: 0, positionen: [{ name: 'KG', anzahl: 1, einzelpreis: 30 }] });
  assert.deepEqual(neu, { id: 'i-neu', nummer: 'RE1020', datum: '2026-10-28', faellig: '2026-11-11', erstelltAm: '2026-10-28T10:00:00.000+01:00', geaendertAm: '2026-10-28T10:00:00.000+01:00' });
  assert.deepEqual(aufrufe.map((a) => `${a.methode} ${a.url.replace('https://api.lexware.io', '')}`), ['POST /v1/contacts', 'GET /v1/contacts/k-neu', 'POST /v1/invoices?finalize=true', 'GET /v1/invoices/i-neu']);
  assert.equal((aufrufe[2]!.body as { address: { contactId: string } }).address.contactId, 'k-neu');
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
const GET: Record<string, unknown> = {};
const graph = { ...graphAttrappe({ get: GET }), delete: async () => {} };
const lexware = attrappeRechnungen();

before(async () => {
  db = await testDb();
  const liste = (await db.query<{ id: string }>("INSERT INTO preisliste (name, status, freigegeben_am) VALUES ('Preise 2026', 'freigegeben', now()) RETURNING id::text")).rows[0]!.id;
  await db.query("INSERT INTO preisliste_position (preisliste_id, reihenfolge, nummer, bezeichnung, gkv_preis, eigener_preis, uebernehmen) VALUES ($1, 1, '21201', 'Manuelle Therapie', 35.59, 40, true)", [liste]);
  await standardSetzen(db, liste, 'x');
  // Bankverbindung für den GiroCode (W102) – die bekannte Beispiel-IBAN mit gültiger Prüfziffer
  await einstellungSetzen(db, 'bank_inhaber', 'Praxis Lilli Nebel', 'x');
  await einstellungSetzen(db, 'bank_iban', 'DE89 3704 0044 0532 0130 00', 'x');
  server = praxisDienst({ erlaubt: ['lilli@example.org'], fassung: 't', angemeldet: async () => true, pruefen: async () => [], kartei: karteiDienst({ db, tresor: t, graph, lexware: attrappeKunden(), lexwareRechnungen: lexware }) });
  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

let pid = '';
let rid = '';
test('Klick 1 „Nach Lexware“: Entwurf wird fertig, Kunde in Lexware angelegt und am Patienten vermerkt, Nummer und PDF kommen zurück', async () => {
  pid = /\/patienten\/(\d+)/.exec(ziel(await post({ aktion: 'anlegen', vorname: 'Bernd', nachname: 'Mustermann', email: 'shopping+bernd@2late.de', strasse: 'Hauptstraße', hausnummer: '12', plz: '86825', ort: 'Bad Wörishofen' })))![1]!;
  await verordnungAnlegen(db, t, pid, { ausgestelltAm: '2026-10-01', massnahme: 'Manuelle Therapie', leistungNummer: '21201', anzahl: 2 }, 'x');
  rid = (await db.query<{ id: string }>('SELECT id::text FROM rechnung WHERE patient_id = $1', [pid])).rows[0]!.id;
  let html = await seite(`/patienten/${pid}/rechnungen/${rid}`);
  assert.match(html, /data-hilfe="rechnung.lexware">[\s\S]{0,400}Nach Lexware – Nummer und PDF holen/);
  assert.doesNotMatch(html, /rechnung\.nummer-holen/, 'kein Platzhalterknopf mehr, wenn Lexware angebunden ist');
  // Versenden vor Lexware geht nicht
  assert.match(ziel(await post({ aktion: 'rechnung_versenden', id: pid, rechnung_id: rid, zurueck: `/patienten/${pid}` })), /fehler=Versenden erst, wenn die Rechnung in Lexware ist/);
  const r = await post({ aktion: 'rechnung_lexware', id: pid, rechnung_id: rid, zurueck: `/patienten/${pid}` });
  assert.match(ziel(r), /meldung=In Lexware mit Nummer RE-\d{4}-9001 – PDF liegt im Tresor\. Der Empfänger wurde in Lexware als Kunde angelegt\. Jetzt „Versenden“\./);
  const zeile = (await db.query<Record<string, unknown>>('SELECT status::text, nummer, lexware_invoice_id AS lx, lexware_kontakt_id AS kontakt, lexware_status AS ls, (lexware_pdf IS NOT NULL) AS pdf, lexware_pdf_name AS name, datum::text, faellig_am::text, betrag::text FROM rechnung WHERE id = $1', [rid])).rows[0]!;
  assert.equal(zeile.status, 'in_lexware');
  assert.match(String(zeile.nummer), /^RE-\d{4}-9001$/);
  assert.deepEqual([zeile.kontakt, zeile.ls, zeile.pdf, zeile.name, zeile.betrag], ['attrappe-k-1', 'open', true, `${zeile.nummer}.pdf`, '80.00']);
  assert.ok(zeile.datum && zeile.faellig_am && String(zeile.faellig_am) > String(zeile.datum), 'Fälligkeit aus Lexware');
  const patient = (await db.query<{ k: string; n: string }>('SELECT lexware_kontakt_id AS k, lexware_kundennummer AS n FROM patient WHERE id = $1', [pid])).rows[0]!;
  assert.deepEqual(patient, { k: 'attrappe-k-1', n: '10101' }, 'Patient ist jetzt Lexware-Kunde');
  html = await seite(`/patienten/${pid}/rechnungen/${rid}`);
  assert.match(html, /data-hilfe="rechnung.versand-art"[\s\S]{0,300}data-hilfe="rechnung.versenden"/);
  assert.match(html, /data-hilfe="ausgang.pdf"/);
  assert.match(html, /<figure class="girocode" data-hilfe="rechnung.girocode"[^>]*><img src="data:image\/png;base64,[A-Za-z0-9+/=]+" alt="GiroCode zum Bezahlen"/, 'GiroCode auf der Rechnungsseite (W102)');
  // Noch einmal: schon in Lexware
  assert.match(ziel(await post({ aktion: 'rechnung_lexware', id: pid, rechnung_id: rid, zurueck: `/patienten/${pid}` })), /fehler=Die Rechnung ist schon in Lexware/);
  // Die neue Rechnung steht in der Lexware-Belegliste und ist beim Abgleich „unverändert“
  const a = await post({ aktion: 'lexware_rechnungen', id: pid, zurueck: `/patienten/${pid}` });
  assert.match(ziel(a), /1 Rechnung in Lexware – 0 neu, 0 aktualisiert, 1 unverändert\./);
});

test('Klick 2 „Versenden“ per Mail (W122): Entwurf in Outlook mit PDF und GiroCode, Rechnung bleibt „in Lexware“; verworfen → wieder frei; gesendet → „versendet“ mit Outlooks Datum', async () => {
  // Die Attrappe gibt beim Anlegen keine Message-ID zurück – der PPM liest sie nach (Apple Mail, W122b)
  GET['/me/messages/neu-1?$select=internetMessageId'] = { internetMessageId: '<entwurf-1@praxis.example>' };
  const r = await post({ aktion: 'rechnung_versenden', id: pid, rechnung_id: rid, versand_art: 'email', zurueck: `/patienten/${pid}` });
  assert.match(ziel(r), new RegExp(`^/patienten/${pid}/rechnungen/${rid}\\?entwurf=1&meldung=Rechnungs-Mail an shopping\\+bernd@2late\\.de liegt als Entwurf in Outlook – mit PDF und GiroCode\\. „Versendet“ steht hier, sobald Outlook den Versand bestätigt\\.$`));
  assert.ok(!graph.schreibende().some((a) => a.pfad === '/me/sendMail'), 'nichts direkt gesendet – E37');
  const entwurf = graph.schreibende().find((a) => a.pfad === '/me/messages');
  assert.ok(entwurf, 'Entwurf im Postfach angelegt');
  const m = entwurf!.body as { subject: string; toRecipients: { emailAddress: { address: string } }[]; body: { content: string } };
  assert.match(m.subject, /^Ihre Rechnung RE-\d{4}-9001$/);
  assert.equal(m.toRecipients[0]!.emailAddress.address, 'shopping+bernd@2late.de');
  assert.match(m.body.content, /Verwendungszweck nur die Rechnungsnummer RE-\d{4}-9001/);
  assert.match(m.body.content, /PS: Mit dem beigefügten GiroCode/);
  const anhaenge = graph.schreibende().filter((a) => /\/me\/messages\/[^/]+\/attachments$/.test(a.pfad)).map((a) => a.body as { name: string; contentType: string; contentBytes: string });
  assert.match(anhaenge[0]!.name, /^RE-\d{4}-9001\.pdf$/);
  assert.equal(anhaenge[0]!.contentType, 'application/pdf');
  assert.match(anhaenge[1]!.name, /^GiroCode-RE-\d{4}-9001\.png$/);
  assert.equal(Buffer.from(anhaenge[1]!.contentBytes, 'base64').subarray(1, 4).toString(), 'PNG');
  const stand = async () => (await db.query<Record<string, unknown>>('SELECT status::text, versand_art, versendet_am::text, versand_entwurf_id FROM rechnung WHERE id = $1', [rid])).rows[0]!;
  let z = await stand();
  assert.deepEqual([z.status, z.versand_art, z.versendet_am], ['in_lexware', 'email', null], 'noch nicht versendet – erst, wenn Outlook bestätigt');
  const entwurfId = String(z.versand_entwurf_id);
  assert.match(entwurfId, /^neu-\d+$/);
  // Seite: Fenster nach dem Anlegen, Hinweisblock, kein zweites „Versenden“, kein Vermerk von Hand per Mail
  let html = await seite(`/patienten/${pid}/rechnungen/${rid}?entwurf=1`);
  assert.match(html, /<dialog open class="rm-dialog entwurf-dialog" data-hilfe="rechnung.entwurf-dialog">/);
  assert.match(html, /<div class="meldung ok entwurf" data-hilfe="rechnung.entwurf" tabindex="0">/);
  assert.match(html, /<button class="knopf" data-hilfe="rechnung.entwurf-ok">OK – später in Outlook<\/button>/);
  assert.ok(!html.includes('data-hilfe="rechnung.versenden"'), 'kein zweiter Entwurf');
  assert.ok(!html.includes('rechnung.entwurf-applemail'), 'ohne Mac oder iPhone kein Apple-Mail-Knopf');
  const mac = await (await fetch(`${basis}/patienten/${pid}/rechnungen/${rid}?entwurf=1`, { headers: { ...wer, 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15' } })).text();
  assert.match(mac, /<a class="knopf" href="message:\/\/%3Centwurf-1%40praxis\.example%3E" data-hilfe="rechnung.entwurf-applemail">.*In Apple Mail öffnen<\/a><form method="dialog"><button class="knopf" data-hilfe="rechnung.entwurf-ok">OK – später<\/button>/, 'am Mac zusätzlich Apple Mail über die Message-ID');
  assert.match(mac, /<a class="knopf klein" href="message:\/\/%3Centwurf-1%40praxis\.example%3E" data-hilfe="rechnung.entwurf-applemail">/, 'auch im Hinweisblock');
  assert.ok(!html.includes('name="status_aktion" value="versendet"'), 'kein Vermerk von Hand, solange der Entwurf wartet');
  assert.ok(!(await seite(`/patienten/${pid}/rechnungen/${rid}`)).includes('<dialog open class="rm-dialog entwurf-dialog"'), 'das Fenster nur direkt nach dem Anlegen');
  assert.match(ziel(await post({ aktion: 'rechnung_versenden', id: pid, rechnung_id: rid, versand_art: 'email', zurueck: `/patienten/${pid}` })), /fehler=Die Rechnungs-Mail liegt schon als Entwurf in Outlook/);
  assert.match(await seite(`/patienten/${pid}`), /Entwurf in Outlook/, 'Marke an der Rechnungskachel');
  assert.match(await seite(`/patienten/${pid}`), /als Entwurf im Postfach \(RE-\d{4}-9001\.pdf\) – Versand in Outlook/, 'im Kontaktverlauf');
  // Outlook: Entwurf noch da → nichts; Entwurf weg (Lilli hat ihn verworfen) → Rechnung wieder frei
  GET[`/me/messages/${entwurfId}?$select=id,isDraft,sentDateTime`] = { id: entwurfId, isDraft: true, sentDateTime: null };
  assert.deepEqual(await rechnungsversandPruefen(db, t, graph, 'system'), { geprueft: 1, bestaetigt: 0, verworfen: 0, fehler: 0 });
  delete GET[`/me/messages/${entwurfId}?$select=id,isDraft,sentDateTime`];
  assert.deepEqual(await rechnungsversandPruefen(db, t, graph, 'system'), { geprueft: 1, bestaetigt: 0, verworfen: 0, fehler: 0 }, 'ein frischer Entwurf, der (noch) nicht gefunden wird, gilt nicht als verworfen');
  await db.query("UPDATE rechnung SET versand_entwurf_am = now() - interval '1 hour' WHERE id = $1", [rid]);
  assert.deepEqual(await rechnungsversandPruefen(db, t, graph, 'system'), { geprueft: 1, bestaetigt: 0, verworfen: 1, fehler: 0 });
  z = await stand();
  assert.deepEqual([z.status, z.versand_entwurf_id], ['in_lexware', null], 'nicht gesendet, Entwurf vergessen');
  assert.match(await seite(`/patienten/${pid}/rechnungen/${rid}`), /data-hilfe="rechnung.versenden"/, '„Versenden“ geht wieder');
  // Noch einmal anlegen, dann in Outlook gesendet → „versendet“ mit dem Datum aus Outlook
  await post({ aktion: 'rechnung_versenden', id: pid, rechnung_id: rid, versand_art: 'email', zurueck: `/patienten/${pid}` });
  const entwurf2 = String((await stand()).versand_entwurf_id);
  GET[`/me/messages/${entwurf2}?$select=id,isDraft,sentDateTime`] = { id: entwurf2, isDraft: false, sentDateTime: '2026-10-31T09:15:00Z' };
  html = await seite(`/patienten/${pid}/rechnungen/${rid}`);
  assert.ok(!html.includes('rechnung.entwurf"'), 'die Seite sieht beim Öffnen nach – der Hinweis ist weg');
  z = await stand();
  assert.deepEqual([z.status, z.versand_art, z.versendet_am, z.versand_entwurf_id], ['gesendet', 'email', '2026-10-31', null], 'versendet mit dem Datum aus Outlook');
  assert.match(await seite(`/patienten/${pid}`), /per Mail gesendet – von Outlook bestätigt \(31\.10\.2026\)/, 'im Kontaktverlauf');
  assert.deepEqual(await rechnungsversandPruefen(db, t, graph, 'system'), { geprueft: 0, bestaetigt: 0, verworfen: 0, fehler: 0 }, 'nichts mehr offen');
  // Zweite Rechnung per Post: kein Entwurf, sofort vermerkt, Hinweis zum Drucken
  await verordnungAnlegen(db, t, pid, { ausgestelltAm: '2026-10-05', massnahme: 'Manuelle Therapie', leistungNummer: '21201', anzahl: 1 }, 'x');
  const rid2 = (await db.query<{ id: string }>('SELECT id::text FROM rechnung WHERE patient_id = $1 ORDER BY id DESC LIMIT 1', [pid])).rows[0]!.id;
  const vorher = graph.schreibende().length;
  assert.match(ziel(await post({ aktion: 'rechnung_lexware', id: pid, rechnung_id: rid2, zurueck: `/patienten/${pid}` })), /In Lexware mit Nummer RE-\d{4}-9002 – PDF liegt im Tresor\. Jetzt/);
  const p = await post({ aktion: 'rechnung_versenden', id: pid, rechnung_id: rid2, versand_art: 'post', zurueck: `/patienten/${pid}` });
  assert.match(ziel(p), /als versendet vermerkt – per Post, bitte das PDF drucken\./);
  assert.equal(graph.schreibende().length, vorher, 'keine Mail bei Post');
  assert.equal((await db.query<{ v: string }>('SELECT versand_art AS v FROM rechnung WHERE id = $1', [rid2])).rows[0]!.v, 'post');
});

test('Ohne Mailadresse kein Mailversand; Rechnung aus Lexware lässt sich nicht noch einmal anlegen', async () => {
  const ohne = /\/patienten\/(\d+)/.exec(ziel(await post({ aktion: 'anlegen', vorname: 'Olga', nachname: 'Ohnemail' })))![1]!;
  await verordnungAnlegen(db, t, ohne, { ausgestelltAm: '2026-10-01', massnahme: 'Manuelle Therapie', leistungNummer: '21201', anzahl: 1 }, 'x');
  const r = (await db.query<{ id: string }>('SELECT id::text FROM rechnung WHERE patient_id = $1', [ohne])).rows[0]!.id;
  await post({ aktion: 'rechnung_lexware', id: ohne, rechnung_id: r, zurueck: `/patienten/${ohne}` });
  assert.match(ziel(await post({ aktion: 'rechnung_versenden', id: ohne, rechnung_id: r, versand_art: 'email', zurueck: `/patienten/${ohne}` })), /fehler=Keine Mailadresse hinterlegt – bitte Versand per Post wählen/);
  assert.equal((await db.query<{ s: string }>('SELECT status::text AS s FROM rechnung WHERE id = $1', [r])).rows[0]!.s, 'in_lexware', 'nichts versendet');
});
