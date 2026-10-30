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
import { testdatenAnlegen, testdatenErweitert, testdublettenAnlegen, testhausbesuchAnlegen, testkalenderAnlegen, testtermineAnlegen, testtermineNeuPlanen } from '../kartei/testdaten.ts';
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
  // Erst die festen Zeiten (Kalender-Woche, Hausbesuche), dann alles, was sich die nächste freie Zeit sucht – so überlappt nichts und die Pause bleibt (W113d)
  const k = await testkalenderAnlegen(db as Db, tresor(), { adresse, wer: 'testdaten' });
  console.log(k.uebersprungen ? '✓ Kalender-Testdaten sind schon da' : `✓ Kalender (W116): ${k.patienten} Patienten, ${k.termine} Termine ab Montag ${k.montag} (voll, halb, lange Rüstzeit, Schließtag), Terminart mit eigener Pause`);
  const h = await testhausbesuchAnlegen(db as Db, tresor(), { adresse, wer: 'testdaten' });
  console.log(h.uebersprungen ? '✓ Hausbesuch-Testdaten sind schon da' : `✓ Hausbesuche (W113): ${h.patienten} Patienten, ${h.termine} Termine – Hausbesuche mit Fahrt hin, Transfer zum nächsten Hausbesuch und Rückfahrt zum Praxistermin (Dienstag/Mittwoch der übernächsten Woche)`);
  const e = await testdatenAnlegen(db as Db, tresor(), { adresse, wer: 'testdaten' });
  console.log(e.uebersprungen ? '✓ Testdaten sind schon da – nichts geändert' : `✓ ${e.patienten} erfundene Patienten angelegt (${e.behandlungen} Behandlungen, ${e.termine} Termine, ${e.rechnungen} Rechnungen)`);
  const z = await testtermineAnlegen(db as Db, tresor(), { adresse, wer: 'testdaten' });
  console.log(z.uebersprungen ? '✓ Testtermine sind schon da' : `✓ ${z.patienten} Patienten mit 12er-Rezept und ${z.termine} Terminen in den nächsten Wochen – Kalender: npm run termine:abgleich`);
  const x = await testdatenErweitert(db as Db, tresor(), { adresse, wer: 'testdaten' });
  console.log(x.uebersprungen ? '✓ Erweiterte Testdaten sind schon da' : `✓ Erweitert: ${x.preislisten} Preislisten, ${x.patienten} Patienten, ${x.termine} Termine, ${x.rechnungen} Rechnungen (alle Phasen und Status)`);
  const du = await testdublettenAnlegen(db as Db, tresor(), { adresse, wer: 'testdaten' });
  console.log(du.uebersprungen ? '✓ Dubletten-Testdaten sind schon da' : `✓ Dubletten (W119): ${du.patienten} mögliche Dubletten – T-1061 (leer, löschbar) und T-1062 (Oskar Zwoelfer, zusammenführen)`);
  // Ältere Testdaten ohne Pause: überlappende künftige Termine absagen und neu anlegen (W113d) – läuft jedes Mal, ändert ohne Konflikte nichts
  const n = await testtermineNeuPlanen(db as Db, 'testdaten');
  console.log(n.verlegt || n.entfallen ? `✓ Testtermine neu geplant: ${n.geprueft} geprüft, ${n.verlegt} verlegt (Pause und Fahrt eingehalten), ${n.entfallen} entfallen (Tag voll)` : `✓ ${n.geprueft} künftige Testtermine überlappen sich nicht`);
} finally {
  await db.ende();
}
