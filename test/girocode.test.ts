/** GiroCode (W102): IBAN-Prüfung, EPC-Text, PNG; Bankverbindung aus den Einstellungen */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { einstellungSetzen, ibanNormieren } from '../src/kartei/konfiguration.ts';
import { KarteiFehler } from '../src/kartei/patienten.ts';
import { bankverbindung, epcText, girocodeDataUri, girocodePng, ibanLesbar } from '../src/rechnungen/girocode.ts';
import { testDb } from './testdb.ts';

test('IBAN: Leerzeichen und Kleinschreibung egal, Prüfziffer entscheidet', () => {
  assert.equal(ibanNormieren('de89 3704 0044 0532 0130 00'), 'DE89370400440532013000');
  assert.equal(ibanNormieren('DE89 3704 0044 0532 0130 01'), null, 'Zahlendreher');
  assert.equal(ibanNormieren('DE89'), null);
  assert.equal(ibanNormieren('GB82 WEST 1234 5698 7654 32'), 'GB82WEST12345698765432', 'Buchstaben im Kontoteil');
  assert.equal(ibanLesbar('DE89370400440532013000'), 'DE89 3704 0044 0532 0130 00');
});

test('EPC-Text nach EPC069-12: Kopf, BIC leer erlaubt, Betrag mit Punkt, Rechnungsnummer als Verwendungszweck', async () => {
  const bank = { inhaber: 'Praxis Lilli Nebel', iban: 'DE89370400440532013000', bic: null };
  assert.equal(epcText({ bank, betrag: 89, verwendungszweck: 'RE-2026-0101' }), 'BCD\n002\n1\nSCT\n\nPraxis Lilli Nebel\nDE89370400440532013000\nEUR89.00\n\n\nRE-2026-0101\n');
  assert.equal(epcText({ bank: { ...bank, bic: 'COBADEFFXXX' }, betrag: 12.345, verwendungszweck: 'RE 1\nZeile 2' }).split('\n')[4], 'COBADEFFXXX');
  assert.match(epcText({ bank, betrag: 12.345, verwendungszweck: 'a\nb' }), /EUR12\.35\n\n\na b\n$/);
  assert.throws(() => epcText({ bank, betrag: 0, verwendungszweck: 'x' }), /Betrag/);
  const png = await girocodePng(epcText({ bank, betrag: 89, verwendungszweck: 'RE-2026-0101' }));
  assert.equal(Buffer.from(png).subarray(1, 4).toString(), 'PNG');
  assert.match(await girocodeDataUri({ bank, betrag: 89, verwendungszweck: 'RE-2026-0101' }), /^data:image\/png;base64,iVBOR/);
});

test('Bankverbindung aus den Einstellungen: nur mit gültiger IBAN; BIC und Inhaber geprüft', async () => {
  const db = await testDb();
  assert.equal(await bankverbindung(db), null, 'ohne IBAN kein GiroCode');
  await assert.rejects(einstellungSetzen(db, 'bank_iban', 'DE00 0000 0000 0000 0000 00', 'x'), KarteiFehler);
  await assert.rejects(einstellungSetzen(db, 'bank_bic', 'ABC', 'x'), KarteiFehler);
  await einstellungSetzen(db, 'bank_iban', 'de89 3704 0044 0532 0130 00', 'x');
  await einstellungSetzen(db, 'bank_bic', 'cobadeffxxx', 'x');
  assert.deepEqual(await bankverbindung(db), { inhaber: 'Praxis Lilli Nebel', iban: 'DE89370400440532013000', bic: 'COBADEFFXXX' }, 'Inhaber leer = Praxisname');
  await einstellungSetzen(db, 'bank_inhaber', 'Lilli Nebel Physiotherapie', 'x');
  await einstellungSetzen(db, 'bank_bic', '', 'x');
  assert.deepEqual(await bankverbindung(db), { inhaber: 'Lilli Nebel Physiotherapie', iban: 'DE89370400440532013000', bic: null });
});
