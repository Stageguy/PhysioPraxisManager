/**
 * Erfundene Patienten für die Testumgebung (A09e, requirements N28/E23).
 *
 *   npm run testdaten            # nur mit PRAXIS_UMGEBUNG=test, DATABASE_URL, PRAXIS_TRESOR_SCHLUESSEL, TEST_ADRESSEN
 *   kubectl -n praxis-test exec deploy/praxis-dienst -- node src/cli/testdaten.ts
 *
 * Schranke: läuft nie in der Produktion. Mailadressen sind Plus-Varianten der ersten Testadresse
 * (shopping+anna@2late.de), Telefonnummern aus dem für Film und Fernsehen reservierten Berliner Block
 * (030) 23125 xxx – sie erreichen niemanden. Läuft nur einmal: gibt es „T-1001“ schon, passiert nichts.
 */
import { migriere, verbinde, type Db } from '../db/index.ts';
import { testdatenAnlegen, testtermineAnlegen } from '../kartei/testdaten.ts';
import { tresor } from '../tresor.ts';
import { testAdressen, umgebung } from '../umgebung.ts';

if (umgebung() !== 'test') {
  console.error('✗ Testdaten gibt es nur in der Testumgebung (PRAXIS_UMGEBUNG=test) – in der Produktion gesperrt (N28)');
  process.exit(2);
}
const adresse = testAdressen()[0];
if (!adresse) {
  console.error('✗ TEST_ADRESSEN fehlt');
  process.exit(2);
}
const db: ReturnType<typeof verbinde> = verbinde();
try {
  await migriere(db);
  const e = await testdatenAnlegen(db as Db, tresor(), { adresse, wer: 'testdaten' });
  console.log(e.uebersprungen ? '✓ Testdaten sind schon da – nichts geändert' : `✓ ${e.patienten} erfundene Patienten angelegt (${e.behandlungen} Behandlungen, ${e.termine} Termine, ${e.rechnungen} Rechnungen)`);
  const z = await testtermineAnlegen(db as Db, tresor(), { adresse, wer: 'testdaten' });
  console.log(z.uebersprungen ? '✓ Testtermine sind schon da' : `✓ ${z.patienten} Patienten mit 12er-Rezept und ${z.termine} Terminen in den nächsten Wochen – Kalender: npm run termine:abgleich`);
} finally {
  await db.ende();
}
