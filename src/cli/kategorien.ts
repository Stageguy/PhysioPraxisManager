/**
 * Outlook-Kategorien des Rechnungs-Flows anlegen (src/mail/kategorien.ts). Vorhandene bleiben, wie sie sind.
 *
 *   npm run kategorien                 # zeigt, was fehlt
 *   npm run kategorien -- --ausfuehren # legt Fehlendes an
 */
import { parseArgs } from 'node:util';
import { ALLE_SCOPES, createTokenProvider } from '../auth.ts';
import { loadEnv } from '../config.ts';
import { GraphClient } from '../graph.ts';
import { KATEGORIEN, kategorienAnlegen } from '../mail/kategorien.ts';

const { values } = parseArgs({ options: { ausfuehren: { type: 'boolean', default: false } } });
const graph = new GraphClient(createTokenProvider(loadEnv(), ALLE_SCOPES, { interaktiv: false }));
const r = await kategorienAnlegen(graph, { ausfuehren: values.ausfuehren });

for (const k of Object.values(KATEGORIEN)) {
  const zustand = r.angelegt.includes(k.name) ? '✓ angelegt' : r.vorhanden.includes(k.name) ? '· war schon da' : '→ fehlt';
  console.log(`${zustand.padEnd(15)} ${k.name} (${k.farbname})${r.andereFarbe.includes(k.name) ? ' – hat eine andere Farbe, bleibt so' : ''}`);
}
for (const k of r.entfernt) console.log(`✓ entfernt      ${k} (früherer Name)`);
for (const k of r.nochBenutzt) console.log(`· bleibt        ${k} – noch an Mails, früherer Name`);
for (const k of r.fehlt.filter((x) => x.startsWith('(entfernen)'))) console.log(`→ würde entfernt ${k.slice(12)} (früherer Name, an keiner Mail)`);
if (r.fehlt.length) console.log('Probelauf – anlegen bzw. entfernen mit --ausfuehren');
