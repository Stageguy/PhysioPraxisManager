/**
 * Den gekennzeichneten Testordner für Probeläufe anlegen (config/praxis.json → ablage.probelauf),
 * mit einer LIESMICH-Datei darin, die sagt, was er ist. Gibt es ihn schon, bleibt er.
 *
 *   npm run testordner                 # zeigt, was angelegt würde
 *   npm run testordner -- --ausfuehren
 */
import { parseArgs } from 'node:util';
import { ALLE_SCOPES, createTokenProvider } from '../auth.ts';
import { loadEnv } from '../config.ts';
import { ordnerFinden, ordnerSicherstellen, uploadFile } from '../drive.ts';
import { ladeEinstellungen } from '../einstellungen.ts';
import { GraphClient } from '../graph.ts';
import { nurProduktion } from '../umgebung.ts';

const LIESMICH = `TESTORDNER – PhysioPraxisManager

Dieser Ordner gehört zur Praxis-Assistenz (Repository PhysioPraxisManager).
Hier landen nur PROBELÄUFE: Testdateien und Testablagen, keine echten Belege.

Alles hier darf gelöscht werden.
Echte Eingangsrechnungen liegen in: 01 Finanzen/<Jahr>/Eingangsrechnungen

Angelegt am ${new Date().toISOString().slice(0, 10)} von praxis@lilli-nebel.de (PhysioPraxisManager).
`;

const { values } = parseArgs({ options: { ausfuehren: { type: 'boolean', default: false } } });
if (values.ausfuehren) nurProduktion('Das Anlegen des Testordners');
const { ablage } = await ladeEinstellungen();
if (!ablage) throw new Error('config/praxis.json: Abschnitt "ablage" fehlt');
const graph = new GraphClient(createTokenProvider(loadEnv(), ALLE_SCOPES, { interaktiv: false }));
const laufwerk = `/drives/${ablage.laufwerk}`;

const da = await ordnerFinden(graph, ablage.probelauf, laufwerk);
if (da) {
  console.log(`· schon da: ${ablage.probelauf}`);
} else if (!values.ausfuehren) {
  console.log(`→ würde angelegt: ${ablage.probelauf} (mit LIESMICH.txt) – anlegen mit --ausfuehren`);
} else {
  const id = await ordnerSicherstellen(graph, ablage.probelauf, laufwerk);
  await uploadFile(graph, id, 'LIESMICH – Testordner PhysioPraxisManager.txt', new TextEncoder().encode(LIESMICH), laufwerk);
  console.log(`✓ angelegt: ${ablage.probelauf} (mit LIESMICH.txt)`);
}
