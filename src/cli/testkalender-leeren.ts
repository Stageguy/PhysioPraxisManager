/**
 * Alle Ereignisse im Kalender „Praxis-Test“ löschen – vor dem Neuerzeugen der Testdaten, damit keine
 * verwaisten Termine im Postfach bleiben. Nur in der Testumgebung (Schranke 3).
 *
 *   kubectl -n praxis-test exec deploy/praxis-dienst -- node src/cli/testkalender-leeren.ts
 */
import { ALLE_SCOPES, createTokenProvider } from '../auth.ts';
import { loadEnv } from '../config.ts';
import { GraphClient } from '../graph.ts';
import { kalenderBasis, umgebung } from '../umgebung.ts';

if (umgebung() !== 'test') {
  console.error('✗ Nur in der Testumgebung – der Hauptkalender wird nie geleert');
  process.exit(2);
}
const graph = new GraphClient(createTokenProvider(loadEnv(), ALLE_SCOPES, { interaktiv: false }));
const basis = await kalenderBasis(graph);
let n = 0;
for await (const e of graph.paginate<{ id: string }>(`${basis}/events?$select=id&$top=100`)) {
  await graph.delete(`/me/events/${e.id}`);
  n++;
}
console.log(`✓ ${n} Ereignisse aus „Praxis-Test“ gelöscht`);
