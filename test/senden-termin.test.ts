import assert from 'node:assert/strict';
import { test } from 'node:test';
import { terminAnlegen, terminKoerper } from '../src/kalender.ts';
import { mailSenden, sendMailKoerper } from '../src/mail/senden.ts';
import { berlinMitternachtUtc, datumBerlin } from '../src/zeit.ts';
import { graphAttrappe } from './attrappe.ts';

const mail = { an: ['patient@example.org'], betreff: 'Termin', text: 'Hallo' };

test('Mail: Probelauf sendet nichts', async () => {
  const g = graphAttrappe({});
  assert.deepEqual(await mailSenden(g, mail, { ausfuehren: false }), { gesendet: false });
  assert.deepEqual(g.schreibende(), []);
});

test('Mail: Ausführen ruft sendMail genau einmal', async () => {
  const g = graphAttrappe({});
  await mailSenden(g, mail, { ausfuehren: true });
  assert.deepEqual(g.schreibende(), [{ methode: 'POST', pfad: '/me/sendMail', body: sendMailKoerper(mail) }]);
});

test('Mail: ungültige Angaben werden vor jedem Aufruf abgewiesen', async () => {
  const g = graphAttrappe({});
  await assert.rejects(mailSenden(g, { ...mail, an: ['kein-at'] }, { ausfuehren: true }), /keine gültige/);
  await assert.rejects(mailSenden(g, { ...mail, an: [] }, { ausfuehren: true }), /Kein Empfänger/);
  await assert.rejects(mailSenden(g, { ...mail, betreff: ' ' }, { ausfuehren: true }), /Betreff/);
  assert.deepEqual(g.aufrufe, []);
});

const termin = { titel: 'Teambesprechung', beginn: '2026-11-03T09:30', ende: '2026-11-03T10:00' };

test('Termin: Probelauf legt nichts an', async () => {
  const g = graphAttrappe({});
  assert.deepEqual(await terminAnlegen(g, termin, { ausfuehren: false }), { angelegt: false });
  assert.deepEqual(g.aufrufe, []);
});

test('Termin: Ausführen legt ihn in deutscher Zeit ohne Teilnehmer an', async () => {
  const g = graphAttrappe({});
  const r = await terminAnlegen(g, termin, { ausfuehren: true });
  assert.equal(r.angelegt, true);
  const body = g.schreibende()[0]!.body as ReturnType<typeof terminKoerper>;
  assert.deepEqual(body.start, { dateTime: '2026-11-03T09:30:00', timeZone: 'W. Europe Standard Time' });
  assert.deepEqual(body.attendees, []);
});

test('Termin: falsche Zeiten werden abgewiesen', async () => {
  const g = graphAttrappe({});
  await assert.rejects(terminAnlegen(g, { ...termin, ende: '2026-11-03T09:00' }, { ausfuehren: true }), /Ende/);
  await assert.rejects(terminAnlegen(g, { ...termin, beginn: '3.11.2026 9:30' }, { ausfuehren: true }), /Format/);
});

test('Zeit: Mitternacht in Deutschland, Sommer und Winter', () => {
  assert.equal(berlinMitternachtUtc('2026-07-01'), '2026-06-30T22:00:00Z');
  assert.equal(berlinMitternachtUtc('2026-12-01'), '2026-11-30T23:00:00Z');
  assert.equal(berlinMitternachtUtc('2026-10-25'), '2026-10-24T22:00:00Z', 'Tag der Zeitumstellung');
  assert.equal(datumBerlin('2026-10-19T22:30:00Z'), '2026-10-20');
});
