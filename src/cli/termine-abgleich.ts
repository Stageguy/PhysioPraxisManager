/**
 * Künftige Termine der Kartei ohne Kalendereintrag in den Exchange-Kalender spiegeln (W77).
 *
 *   npm run termine:abgleich
 *   kubectl -n praxis-test exec deploy/praxis-dienst -- node src/cli/termine-abgleich.ts
 *
 * Testumgebung: Kalender „Praxis-Test“ + Kategorie „TEST“; Produktion: Hauptkalender, Kategorie „Praxis-Termin“.
 */
import { ALLE_SCOPES, createTokenProvider } from '../auth.ts';
import { loadEnv } from '../config.ts';
import { verbinde } from '../db/index.ts';
import { GraphClient } from '../graph.ts';
import { alleTermineSpiegeln } from '../kartei/kalender.ts';

const graph = new GraphClient(createTokenProvider(loadEnv(), ALLE_SCOPES, { interaktiv: false }));
const db = verbinde();
try {
  const e = await alleTermineSpiegeln(db, graph, 'termine-abgleich');
  console.log(`✓ ${e.angelegt} Termine in den Kalender gespiegelt${e.fehler ? `, ${e.fehler} Fehler` : ''}`);
} finally {
  await db.ende();
}
