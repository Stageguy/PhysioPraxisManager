import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import type { Db } from '../src/db/index.ts';
import { entwicklungMigrieren, entwicklungsAdresse, htmlBereinigen, rueckmeldungen, rueckmeldungSpeichern, RueckmeldungFehler } from '../src/entwicklung/rueckmeldung.ts';
import { praxisDienst } from '../src/server.ts';
import { RUECKMELDUNG_SKRIPT } from '../src/web/rueckmeldung.ts';
import { testDb } from './testdb.ts';

let basis = '';
let db: Db;
let server: ReturnType<typeof praxisDienst>;
const wer = { 'Tailscale-User-Login': 'lilli@example.org' };
// 1×1-PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

before(async () => {
  db = await testDb(entwicklungMigrieren);
  server = praxisDienst({ erlaubt: ['lilli@example.org'], fassung: 't', angemeldet: async () => true, pruefen: async () => [], entwicklung: db });
  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

test('Entwicklungs-Datenbank: eigene Adresse auf demselben Server', () => {
  assert.equal(entwicklungsAdresse('postgres://praxis:pw@praxis-db.praxis-test.svc:5432/praxis'), 'postgres://praxis:pw@praxis-db.praxis-test.svc:5432/praxis_entwicklung');
});

test('Richtext: nur b, i, u, p, br, ul, ol, li bleiben – Skripte und Attribute nicht', () => {
  assert.equal(htmlBereinigen('<p onclick="x()">Hallo <strong>fett</strong> <script>alert(1)</script><a href="x">Link</a></p><div>Zeile</div>'), '<p>Hallo <b>fett</b> alert(1)Link</p>Zeile<br>');
  assert.equal(htmlBereinigen('<ul><li>eins</li></ul><img src=x onerror=alert(1)>'), '<ul><li>eins</li></ul>');
});

test('Speichern prüft Art und Text; Screenshot nur als Bild-Daten-URL', async () => {
  await assert.rejects(rueckmeldungSpeichern(db, { art: 'egal', seite: '/', textHtml: 'x' }, 'l'), RueckmeldungFehler);
  await assert.rejects(rueckmeldungSpeichern(db, { art: 'hinweis', seite: '/', textHtml: '<p><br></p>' }, 'l'), /beschreiben/);
  const id = await rueckmeldungSpeichern(db, { art: 'fehler', seite: '/patienten', element: 'kachel.plus', textHtml: '<p>Knopf <b>fehlt</b></p>', bild: 'data:text/html;base64,PHA+', fenster: '393×852' }, 'lilli');
  const [r] = await rueckmeldungen(db);
  assert.equal(r!.id, id);
  assert.equal(r!.hatBild, false, 'kein Bild – falscher Typ wird verworfen');
  assert.equal(r!.textHtml, '<p>Knopf <b>fehlt</b></p>');
});

test('Dienst: POST /rueckmeldung als JSON, Liste, Bild, erledigt – nur mit Anmeldung und gleicher Herkunft', async () => {
  const body = JSON.stringify({ art: 'hinweis', seite: '/preislisten', element: 'preislisten.neu', elementTitel: 'Neu', textHtml: '<p>Bitte <i>größer</i></p>', bild: PNG, fassung: '0.9.0', umgebung: 'test', browser: 'WebKit', fenster: '1440×900' });
  assert.equal((await fetch(`${basis}/rueckmeldung`, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } })).status, 403, 'ohne Anmeldung');
  const fremd = await fetch(`${basis}/rueckmeldung`, { method: 'POST', body, headers: { ...wer, 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' } });
  assert.equal(fremd.status, 403, 'fremde Herkunft');
  const r = await fetch(`${basis}/rueckmeldung`, { method: 'POST', body, headers: { ...wer, 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin' } });
  assert.equal(r.status, 200);
  const a = (await r.json()) as { ok: boolean; id: string };
  assert.ok(a.ok && a.id);
  const schlecht = await fetch(`${basis}/rueckmeldung`, { method: 'POST', body: '{"art":"hinweis","seite":"/","textHtml":""}', headers: { ...wer, 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin' } });
  assert.equal(schlecht.status, 400);
  assert.match(((await schlecht.json()) as { fehler: string }).fehler, /beschreiben/);
  let html = await (await fetch(`${basis}/rueckmeldungen`, { headers: wer })).text();
  assert.match(html, /Bitte <i>größer<\/i>/);
  assert.match(html, new RegExp(`/rueckmeldungen/${a.id}/bild`));
  assert.match(html, /1440×900/);
  const bild = await fetch(`${basis}/rueckmeldungen/${a.id}/bild`, { headers: wer });
  assert.equal(bild.headers.get('content-type'), 'image/png');
  assert.equal((await bild.arrayBuffer()).byteLength, Buffer.from(PNG.split(',')[1]!, 'base64').length);
  const f = new URLSearchParams({ id: a.id, aktion: 'erledigt', antwort: 'größer gemacht', zurueck: '/rueckmeldungen?status=offen' });
  const e = await fetch(`${basis}/rueckmeldungen/aktion`, { method: 'POST', redirect: 'manual', body: f.toString(), headers: { ...wer, 'Content-Type': 'application/x-www-form-urlencoded', 'Sec-Fetch-Site': 'same-origin' } });
  assert.equal(e.status, 303);
  assert.match(decodeURIComponent(e.headers.get('location') ?? ''), /status=offen&meldung=Als erledigt/);
  html = await (await fetch(`${basis}/rueckmeldungen?status=erledigt`, { headers: wer })).text();
  assert.match(html, /größer gemacht/);
  assert.doesNotMatch(await (await fetch(`${basis}/rueckmeldungen`, { headers: wer })).text(), /Bitte <i>größer/);
  // Das Skript und html2canvas werden ausgeliefert
  assert.match(await (await fetch(`${basis}/rueckmeldung.js`, { headers: wer })).text(), /rmMarke/);
  const h2c = await fetch(`${basis}/html2canvas.js`, { headers: wer });
  assert.equal(h2c.status, 200);
  assert.match(h2c.headers.get('content-type') ?? '', /javascript/);
});

/** Das Skript mit einem Dokument-Platzhalter laden und die angemeldeten Horcher zurückgeben */
function horcher(mitMaus: boolean): string[] {
  const namen: string[] = [];
  const dokument = { addEventListener: (n: string) => { namen.push(n); } };
  const fenster = { matchMedia: (abfrage: string) => ({ matches: abfrage === '(hover: hover)' && mitMaus }) };
  new Function('window', 'document', RUECKMELDUNG_SKRIPT)(fenster, dokument);
  return namen;
}

test('Fähnchen nur mit Maus (W118, N38): ohne hover kein mouseover-Horcher und kein Seiten-Fähnchen, der Link „melden“ bleibt', () => {
  assert.doesNotThrow(() => new Function(RUECKMELDUNG_SKRIPT));
  const maus = horcher(true);
  assert.ok(maus.includes('mouseover') && maus.includes('focusin') && maus.includes('DOMContentLoaded'), 'am Rechner: Fähnchen beim Überfahren, Fokus und für die Seite');
  const handy = horcher(false);
  assert.ok(!handy.includes('mouseover') && !handy.includes('focusin') && !handy.includes('DOMContentLoaded'), 'am Handy ändert kein Horcher die Seite beim Tippen');
  assert.ok(handy.includes('click'), 'der Link „melden“ in der Erklärung funktioniert weiter');
});
