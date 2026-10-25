import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { entwurfAnlegen } from '../src/mail/entwurf.ts';
import { kategorienAnlegen } from '../src/mail/kategorien.ts';
import { AktionAbgelehnt, ausfuehren } from '../src/rechnungen/dashboard.ts';
import { rechnungseingang } from '../src/rechnungen/eingang.ts';
import {
  istTestadresse, kalenderBasis, kontaktordnerName, normiereAdresse, nurProduktion, patientenpostZulassen, pruefeEmpfaenger, SchrankeVerletzt,
} from '../src/umgebung.ts';
import { postfach, textAusAttrappe } from './postfach-attrappe.ts';
import { testDb } from './testdb.ts';

const T = ['shopping@2late.de'];
const vorher = { u: process.env.PRAXIS_UMGEBUNG, a: process.env.TEST_ADRESSEN };
function setze(u: 'test' | 'prod') {
  process.env.PRAXIS_UMGEBUNG = u === 'test' ? 'test' : '';
  process.env.TEST_ADRESSEN = T.join(',');
}
afterEach(() => {
  for (const [k, v] of [['PRAXIS_UMGEBUNG', vorher.u], ['TEST_ADRESSEN', vorher.a]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

test('Testadressen: Groß/klein und Plus-Varianten zählen mit', () => {
  assert.equal(normiereAdresse(' Shopping+Anna@2LATE.de '), 'shopping@2late.de');
  assert.ok(istTestadresse('shopping+bernd@2late.de', T));
  assert.ok(!istTestadresse('erika@example.org', T));
});

test('Schranke 7: Testumgebung spiegelt Patienten nur im Ordner „Patienten-Test“', () => {
  assert.equal(kontaktordnerName('test'), 'Patienten-Test');
  assert.equal(kontaktordnerName('prod'), 'Patienten');
});

test('Schranke 2: Test schreibt nur an Testadressen; Produktion frei', () => {
  assert.doesNotThrow(() => pruefeEmpfaenger(['shopping+anna@2late.de'], 'test', T));
  assert.throws(() => pruefeEmpfaenger(['shopping@2late.de', 'erika@example.org'], 'test', T), SchrankeVerletzt);
  assert.throws(() => pruefeEmpfaenger(['shopping@2late.de'], 'test', []), /ohne TEST_ADRESSEN/);
  assert.doesNotThrow(() => pruefeEmpfaenger(['erika@example.org'], 'prod', T));
});

test('Schranken 1 und 5: Patientenpost – Test nur von Testadressen, Produktion nie von Testadressen', () => {
  assert.equal(patientenpostZulassen('shopping@2late.de', 'test', T), true);
  assert.equal(patientenpostZulassen('erika@example.org', 'test', T), false);
  assert.equal(patientenpostZulassen('shopping@2late.de', 'prod', T), false);
  assert.equal(patientenpostZulassen('erika@example.org', 'prod', T), true);
});

test('Schranke 4: nur Produktion', () => {
  assert.throws(() => nurProduktion('X', 'test'), SchrankeVerletzt);
  assert.doesNotThrow(() => nurProduktion('X', 'prod'));
});

test('Schranken 2 und 6 am Entwurf: fremde Empfänger nie, Testentwurf trägt „TEST“', async () => {
  setze('test');
  const geschrieben: unknown[] = [];
  const graph = { async post<R>(_p: string, body: unknown): Promise<R> { geschrieben.push(body); return { id: '1', webLink: 'x' } as R; } };
  await assert.rejects(entwurfAnlegen(graph, { an: ['erika@example.org'], betreff: 'Termin', text: 'Hallo' }, { ausfuehren: true }), SchrankeVerletzt);
  await assert.rejects(entwurfAnlegen(graph, { an: ['erika@example.org'], betreff: 'Termin', text: 'Hallo' }, { ausfuehren: false }), SchrankeVerletzt, 'auch im Probelauf');
  assert.equal(geschrieben.length, 0);
  await entwurfAnlegen(graph, { an: ['shopping+anna@2late.de'], betreff: 'Termin', text: 'Hallo' }, { ausfuehren: true });
  assert.deepEqual((geschrieben[0] as { categories: string[] }).categories, ['TEST']);
  setze('prod');
  await entwurfAnlegen(graph, { an: ['erika@example.org'], betreff: 'Termin', text: 'Hallo' }, { ausfuehren: true });
  assert.deepEqual((geschrieben[1] as { categories: string[] }).categories, []);
});

test('Schranke 3: Test-Termine nur im Kalender „Praxis-Test“ – wird angelegt, wenn er fehlt', async () => {
  const angelegt: string[] = [];
  let vorhanden: { id: string }[] = [];
  const graph = {
    async get<R>(p: string): Promise<R> { assert.match(decodeURIComponent(p), /name eq 'Praxis-Test'/); return { value: vorhanden } as R; },
    async post<R>(_p: string, b: { name: string }): Promise<R> { angelegt.push(b.name); return { id: 'k1' } as R; },
  };
  assert.equal(await kalenderBasis(graph, 'prod'), '/me/calendar');
  assert.equal(await kalenderBasis(graph, 'test'), '/me/calendars/k1');
  assert.deepEqual(angelegt, ['Praxis-Test']);
  vorhanden = [{ id: 'k9' }];
  assert.equal(await kalenderBasis(graph, 'test'), '/me/calendars/k9');
});

test('Schranke 4 in Rechnungseingang, Dashboard und Kategorien', async () => {
  setze('test');
  const db = await testDb();
  const einst = { seit: '2026-10-01', mailordner: 'Posteingang/Rechnungen', verarbeitet: 'x', ziel: 'Z', kategorien: { eingegangen: 'a', patient: 'b', unklar: 'c' }, lieferanten: [] };
  await assert.rejects(rechnungseingang(postfach([]), einst, { ausfuehren: true, db }), SchrankeVerletzt);
  await assert.rejects(ausfuehren({ db, graph: {} as never, wer: 'x' }, '1', { art: 'freigeben' }), AktionAbgelehnt);
  await assert.rejects(kategorienAnlegen({ async *paginate() {}, post: async () => ({}), get: async () => ({}), delete: async () => {} } as never, { ausfuehren: true }), SchrankeVerletzt);
});

test('Schranke 5 im Rechnungseingang: die Produktion überspringt Mails von Testadressen', async () => {
  setze('prod');
  const g = postfach([{ id: 'm', von: 'shopping+test@2late.de', betreff: 'Rechnung', eingang: '2026-10-20T08:00:00Z', anhaenge: [{ id: 'a', name: 'r.pdf', contentType: 'application/pdf', inhalt: 'Rechnung\nRechnungsnummer 1\nGesamtbetrag 5,00' }] }]);
  const b = await rechnungseingang(g, { seit: '2026-10-01', mailordner: 'Posteingang/Rechnungen', verarbeitet: 'x', ziel: null, kategorien: { eingegangen: 'a', patient: 'b', unklar: 'c' }, lieferanten: [], unbekannteAlsRechnung: true }, { ausfuehren: false, textAus: textAusAttrappe });
  assert.deepEqual([b.test, b.rechnungen], [1, 0]);
});
