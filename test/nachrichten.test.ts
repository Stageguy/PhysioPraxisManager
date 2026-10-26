/** Nachrichten an Patienten (W90, W91) und Terminanfragen von der Website (W92) */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { anfrageAusFormularMail } from '../src/anfragen/formular.ts';
import type { Db } from '../src/db/index.ts';
import { karteiDienst } from '../src/kartei/dienst.ts';
import { anhangKoerper, entwurfAnlegen } from '../src/mail/entwurf.ts';
import { anredeFuer, gesundheitsbegriffe, rendern, vorlage, VORLAGEN, VorlageFehler } from '../src/nachrichten/vorlagen.ts';
import { praxisDienst } from '../src/server.ts';
import { neuerHauptschluessel, tresor } from '../src/tresor.ts';
import { pruefeTelefonEmpfaenger, SchrankeVerletzt } from '../src/umgebung.ts';
import { eingehendeNachrichten, signaturGueltig, waLink, webhookBestaetigung, WhatsAppCloud } from '../src/whatsapp/schnittstelle.ts';
import { graphAttrappe } from './attrappe.ts';
import { testDb } from './testdb.ts';

const PERSON = { anrede: 'Frau', titel: null, vorname: 'Anna', nachname: 'Test' };

test('Vorlagen: Anrede, Platzhalter, Kanäle; fehlende Werte brechen ab', () => {
  assert.equal(anredeFuer(PERSON), 'Sehr geehrte Frau Test');
  assert.equal(anredeFuer({ ...PERSON, anrede: 'Herr', titel: 'Dr.' }), 'Sehr geehrter Herr Dr. Test');
  assert.equal(anredeFuer({ ...PERSON, anrede: null }), 'Guten Tag Anna Test');
  const mail = rendern(vorlage('terminbestaetigung')!, 'email', { person: PERSON, termin: '2026-11-02T08:00:00Z' });
  assert.equal(mail.betreff, 'Ihr Termin am 02.11.2026');
  assert.match(mail.text, /^Sehr geehrte Frau Test,\n\nhiermit bestätige ich Ihren Termin am Mo\., 02\.11\.2026, 09:00\./);
  assert.match(mail.text, /Herzliche Grüße\nPraxis Lilli Nebel$/);
  const wa = rendern(vorlage('terminbestaetigung')!, 'whatsapp', { person: PERSON, termin: '2026-11-02T08:00:00Z' });
  assert.match(wa.text, /^Guten Tag Anna Test, Ihr Termin in der Praxis Lilli Nebel ist am Mo\., 02\.11\.2026, 09:00\./);
  assert.throws(() => rendern(vorlage('terminbestaetigung')!, 'email', { person: PERSON }), VorlageFehler, 'ohne Termin');
  assert.throws(() => rendern(vorlage('rechnung_info')!, 'whatsapp', { person: PERSON, rechnung: { nummer: 'R-1', betrag: 10 } }), VorlageFehler, 'Rechnung nicht per WhatsApp');
  const r = rendern(vorlage('zahlungserinnerung')!, 'email', { person: PERSON, rechnung: { nummer: 'R-7', betrag: 46.27 } });
  assert.match(r.text, /Rechnung R-7 über 46,27\s€/);
  assert.throws(() => rendern(vorlage('freitext')!, 'email', { person: PERSON }), VorlageFehler, 'Freitext braucht Text');
  // Jede Vorlage lässt sich mit vollen Werten in allen ihren Kanälen rendern
  for (const v of VORLAGEN) for (const k of v.kanaele) rendern(v, k, { person: PERSON, termin: '2026-11-02T08:00:00Z', rechnung: { nummer: 'R-1', betrag: 1 }, freitext: 'Mo 9 Uhr oder Di 10 Uhr' });
  assert.deepEqual(gesundheitsbegriffe('Bitte bringen Sie den Befund zur Bandscheibe mit'), ['befund', 'bandscheib']);
  assert.deepEqual(gesundheitsbegriffe('Bis Montag um 9 Uhr!'), []);
});

test('WhatsApp: Click-to-Chat-Link, Webhook-Bestätigung, Signatur, eingehende Nachrichten', () => {
  assert.equal(waLink('+49 151 1234567', 'Hallo & bis bald'), 'https://wa.me/491511234567?text=Hallo%20%26%20bis%20bald');
  assert.equal(waLink('0151 1234567'), 'https://wa.me/491511234567');
  const q = new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': 'pruef', 'hub.challenge': '4711' });
  assert.equal(webhookBestaetigung('pruef', q), '4711');
  assert.equal(webhookBestaetigung('anders', q), undefined);
  const roh = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { messages: [
    { from: '491511234567', id: 'wamid.1', timestamp: String(Date.UTC(2026, 9, 26, 8) / 1000), type: 'text', text: { body: 'Passt, danke!' } },
    { from: '491511234567', id: 'wamid.2', timestamp: String(Date.UTC(2026, 9, 26, 8, 0, 1) / 1000), type: 'image' },
  ] } }] }] });
  const sig = `sha256=${createHmac('sha256', 'geheim').update(roh).digest('hex')}`;
  assert.ok(signaturGueltig('geheim', roh, sig));
  assert.ok(!signaturGueltig('geheim', `${roh} `, sig), 'anderer Body');
  assert.ok(!signaturGueltig('anders', roh, sig), 'anderes Secret');
  assert.ok(!signaturGueltig('geheim', roh, undefined));
  assert.deepEqual(eingehendeNachrichten(JSON.parse(roh)), [
    { id: 'wamid.1', von: '+491511234567', zeit: '2026-10-26T08:00:00.000Z', typ: 'text', text: 'Passt, danke!' },
    { id: 'wamid.2', von: '+491511234567', zeit: '2026-10-26T08:00:01.000Z', typ: 'image', text: null },
  ]);
  assert.deepEqual(eingehendeNachrichten({ object: 'page' }), []);
});

test('Schranke 8: Testumgebung schreibt per WhatsApp nur an Testnummern', () => {
  pruefeTelefonEmpfaenger(['+491511234567'], 'prod', []);
  assert.throws(() => pruefeTelefonEmpfaenger(['+491511234567'], 'test', []), SchrankeVerletzt, 'ohne Liste nichts');
  pruefeTelefonEmpfaenger(['0151 1234567'], 'test', ['+491511234567']);
  assert.throws(() => pruefeTelefonEmpfaenger(['+491700000000'], 'test', ['+491511234567']), SchrankeVerletzt);
});

test('Mail-Entwurf mit Anhängen: Nachricht, dann je Datei ein fileAttachment', async () => {
  const g = graphAttrappe({});
  const e = await entwurfAnlegen(g, { an: ['shopping@2late.de'], betreff: 'Test', text: 'Hallo', anhaenge: [{ name: 'Rechnung-R-1.pdf', mime: 'application/pdf', daten: new Uint8Array([37, 80, 68, 70]) }] }, { ausfuehren: true });
  assert.equal(e.angelegt, true);
  assert.deepEqual(g.schreibende().map((a) => a.pfad), ['/me/messages', '/me/messages/neu-1/attachments']);
  assert.deepEqual(g.schreibende()[1]!.body, anhangKoerper({ name: 'Rechnung-R-1.pdf', mime: 'application/pdf', daten: new Uint8Array([37, 80, 68, 70]) }));
  assert.equal((g.schreibende()[1]!.body as { contentBytes: string }).contentBytes, 'JVBERg==');
  await assert.rejects(entwurfAnlegen(g, { an: ['shopping@2late.de'], betreff: 'x', text: 'y', anhaenge: [{ name: 'gross.pdf', mime: 'application/pdf', daten: new Uint8Array(3 * 1024 * 1024 + 1) }] }, { ausfuehren: false }), /größer als 3 MB/);
});

test('Website-Formular: Terminanfrage aus der Formular-Mail lesen', () => {
  const a = anfrageAusFormularMail('Neue Anfrage über die Website\n\nVorname: Anna\nNachname: Test\nTelefon: 0151 1234567\nE-Mail: Anna@Example.org\nWunschtermin: nächste Woche vormittags\nAnliegen: Rückenschmerzen nach dem Sport\n\n-- gesendet von praxis-website.de');
  assert.deepEqual(a, { name: 'Anna Test', telefon: '0151 1234567', email: 'anna@example.org', wunsch: 'nächste Woche vormittags', anliegen: 'Rückenschmerzen nach dem Sport', terminart: null, quelle: 'website' });
  assert.deepEqual(anfrageAusFormularMail('> Name: Bernd Beispiel\n> Handy: 0170 12 34 56\n> Nachricht: Termin bitte'), { name: 'Bernd Beispiel', telefon: '0170 12 34 56', email: null, wunsch: null, anliegen: 'Termin bitte', terminart: null, quelle: 'website' });
  assert.equal(anfrageAusFormularMail('Name: X\nTelefon: 12')!.telefon, null, 'zu kurz für eine Nummer');
  assert.equal(anfrageAusFormularMail('Hallo, viele Grüße'), undefined);
});

// ── Dienst: Entwurf, WhatsApp-Vermerk, Versand mit Einwilligung, Webhook ─────
let basis = '';
let db: Db;
let server: ReturnType<typeof praxisDienst>;
const t = tresor({ PRAXIS_TRESOR_SCHLUESSEL: neuerHauptschluessel() });
const wer = { 'Tailscale-User-Login': 'lilli@example.org' };
const graph = graphAttrappe({});
const graphMitLink = { ...graph, delete: async () => {}, async post<T>(pfad: string, body: unknown): Promise<T> { await graph.post(pfad, body); return { id: 'm1', webLink: 'https://outlook.office.com/owa/?ItemID=m1' } as T; } };
const gesendet: { url: string; body: unknown }[] = [];
const holen = (async (url: string | URL | Request, init?: RequestInit) => {
  gesendet.push({ url: String(url), body: JSON.parse(String(init?.body)) });
  return new Response(JSON.stringify({ messages: [{ id: 'wamid.gesendet' }] }), { status: 200 });
}) as typeof fetch;
const post = (felder: Record<string, string | string[]>) => {
  const f = new URLSearchParams();
  for (const [k, v] of Object.entries(felder)) for (const x of [v].flat()) f.append(k, x);
  return fetch(`${basis}/patienten/aktion`, { method: 'POST', redirect: 'manual', headers: { ...wer, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/x-www-form-urlencoded' }, body: f.toString() });
};
const ziel = (r: Response) => decodeURIComponent(r.headers.get('location') ?? '');
const seite = async (pfad: string) => (await fetch(`${basis}${pfad}`, { headers: wer })).text();

before(async () => {
  db = await testDb();
  const whatsapp = new WhatsAppCloud({ token: 't', telefonId: '4711' }, holen);
  server = praxisDienst({
    erlaubt: ['lilli@example.org'], fassung: 't', angemeldet: async () => true, pruefen: async () => [],
    kartei: karteiDienst({ db, tresor: t, graph: graphMitLink, whatsapp }), whatsapp: { appSecret: 'geheim', verifyToken: 'pruef' },
  });
  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

let id = '';
test('Patientenseite: WhatsApp-Knöpfe mit fertigem Text, Mail-Formular mit Vorlagen', async () => {
  const r = await post({ aktion: 'anlegen', vorname: 'Anna', nachname: 'Test', anrede: 'Frau', mobil: '0151 1234567', whatsapp_wie_mobil: '1', email: 'shopping+anna@2late.de' });
  id = /\/patienten\/(\d+)/.exec(ziel(r))![1]!;
  await post({ aktion: 'termin_anlegen', id, datum: '2026-11-02', zeit: '09:00', dauer_min: '30' });
  const html = await seite(`/patienten/${id}`);
  assert.match(html, /data-hilfe="nachricht.whatsapp"/);
  assert.match(html, /href="https:\/\/wa\.me\/491511234567\?text=Guten%20Tag%20Anna%20Test%2C%20bitte%20bringen/, 'Rezept fehlt als Link');
  assert.match(html, /data-vorlage="terminbestaetigung" data-termin="\d+" data-hilfe="termin.whatsapp"/, 'Bestätigung am Termin');
  assert.match(html, /Mo\.%2C%2002\.11\.2026%2C%2009%3A00/, 'Termin im WhatsApp-Text');
  assert.match(html, /name="aktion" value="mail_entwurf"/);
  assert.match(html, /name="aktion" value="whatsapp_senden"/, 'Cloud API eingerichtet');
  assert.match(html, /<option value="terminbestaetigung">/);
  assert.doesNotMatch(html, /Diagnose/);
});

test('Mail-Entwurf: Graph legt Nachricht an, Verlauf zeigt „in Outlook öffnen“; ohne Termin eine Meldung statt 500', async () => {
  const ohne = await post({ aktion: 'mail_entwurf', id, vorlage: 'terminbestaetigung' });
  assert.match(ziel(ohne), /fehler=.*braucht einen Termin/);
  const terminId = (await db.query<{ id: string }>('SELECT id::text FROM termin WHERE patient_id = $1', [id])).rows[0]!.id;
  const r = await post({ aktion: 'mail_entwurf', id, vorlage: 'terminbestaetigung', termin_id: terminId });
  assert.equal(r.status, 303);
  assert.match(ziel(r), /meldung=Entwurf liegt im Postfach/);
  const nachricht = graph.schreibende().find((a) => a.pfad === '/me/messages')!.body as { subject: string; toRecipients: { emailAddress: { address: string } }[]; body: { content: string } };
  assert.equal(nachricht.subject, 'Ihr Termin am 02.11.2026');
  assert.equal(nachricht.toRecipients[0]!.emailAddress.address, 'shopping+anna@2late.de');
  assert.match(nachricht.body.content, /Sehr geehrte Frau Test,/);
  const html = await seite(`/patienten/${id}`);
  assert.match(html, /Entwurf „Ihr Termin am 02\.11\.2026“ im Postfach – noch nicht gesendet/);
  assert.match(html, /href="https:\/\/outlook\.office\.com\/owa\/\?ItemID=m1"[^>]*data-hilfe="verlauf.oeffnen"/);
  const frei = await post({ aktion: 'mail_entwurf', id, vorlage: 'freitext', freitext: 'Bitte den Befund mitbringen.' });
  assert.match(ziel(frei), /meldung=Entwurf liegt im Postfach.*enthält „befund“/, 'Hinweis bei Gesundheitsbegriff, aber kein Abbruch');
});

test('WhatsApp: Vermerk vom Knopf; Versand nur mit Einwilligung und ohne Gesundheitsbegriffe', async () => {
  const v = await post({ aktion: 'whatsapp_vermerken', id, vorlage: 'rueckruf_bitte' });
  assert.equal(v.status, 303);
  assert.match(await seite(`/patienten/${id}`), /WhatsApp geöffnet mit Vorlage „Bitte um Rückruf“/);
  const ohne = await post({ aktion: 'whatsapp_senden', id, vorlage: 'rueckruf_bitte' });
  assert.match(ziel(ohne), /fehler=Keine Einwilligung in WhatsApp/);
  assert.equal(gesendet.length, 0);
  await post({ aktion: 'erklaerung_erfassen', id, art: 'einwilligung_whatsapp', form: 'textform', inhalt: 'Terminabsprachen per WhatsApp' });
  const krank = await post({ aktion: 'whatsapp_senden', id, vorlage: 'freitext', freitext: 'Ihre Diagnose liegt vor' });
  assert.match(ziel(krank), /fehler=Nicht per WhatsApp/);
  const ok = await post({ aktion: 'whatsapp_senden', id, vorlage: 'rueckruf_bitte' });
  assert.match(ziel(ok), /meldung=WhatsApp-Nachricht gesendet/);
  assert.equal(gesendet.length, 1);
  assert.match(gesendet[0]!.url, /graph\.facebook\.com\/v21\.0\/4711\/messages$/);
  assert.deepEqual((gesendet[0]!.body as { to: string; type: string }).to, '491511234567');
  assert.match(await seite(`/patienten/${id}`), /Gesendet \(Bitte um Rückruf\): Guten Tag Anna Test, ich habe versucht/);
});

test('Webhook: Bestätigung mit Verify-Token, Signaturprüfung, Antwort landet offen im Kontaktverlauf', async () => {
  const ok = await fetch(`${basis}/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=pruef&hub.challenge=4711`);
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), '4711');
  assert.equal((await fetch(`${basis}/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=falsch&hub.challenge=1`)).status, 403);
  const roh = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { messages: [
    { from: '491511234567', id: 'wamid.a1', timestamp: '1761465600', type: 'text', text: { body: 'Ja, der Termin passt.' } },
    { from: '491700000000', id: 'wamid.a2', timestamp: '1761465600', type: 'text', text: { body: 'Wer sind Sie?' } },
    { from: '491511234567', id: 'wamid.a3', timestamp: '1761465600', type: 'image' },
  ] } }] }] });
  const senden = (sig: string) => fetch(`${basis}/whatsapp/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': sig }, body: roh });
  assert.equal((await senden('sha256=00')).status, 403, 'falsche Signatur');
  const r = await senden(`sha256=${createHmac('sha256', 'geheim').update(roh).digest('hex')}`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { zugeordnet: 1, medien: 1, unbekannt: 1 });
  const html = await seite(`/patienten/${id}`);
  assert.match(html, /Eingegangen: Ja, der Termin passt\./);
  assert.match(html, /image per WhatsApp erhalten – nicht übernommen/);
  assert.match(html, /worum ging es\?/, 'eingegangene Nachricht wartet auf einen Gesprächsgrund');
  const unbekannt = await db.query("SELECT count(*)::int AS n FROM audit_event WHERE action = 'whatsapp_unbekannt'");
  assert.equal((unbekannt.rows[0] as { n: number }).n, 1);
  assert.equal(((await db.query("SELECT count(*)::int AS n FROM patient_kontaktverlauf WHERE notiz IS NOT NULL AND offen AND erfasst_von = 'whatsapp'")).rows[0] as { n: number }).n, 2, 'Text und Medienhinweis offen im Verlauf');
});
