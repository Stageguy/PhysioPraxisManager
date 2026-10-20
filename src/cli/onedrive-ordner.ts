/**
 * OneDrive-Bestandsaufnahme: nur Ordner – Namen, Zahl der Dateien, Größe. Liest keine Dateinamen
 * und keine Inhalte (in Ordnern können Patientennamen in Dateinamen stehen). Verändert nichts.
 *
 *   npm run onedrive:ordner                                  # oberste Ebene
 *   npm run onedrive:ordner -- --pfad "01 Finanzen" --tiefe 4
 *   npm run onedrive:ordner -- --drive <driveId> --pfad "Projekte/…"   # geteiltes Laufwerk
 */
import { parseArgs } from 'node:util';
import { ALLE_SCOPES, createTokenProvider } from '../auth.ts';
import { loadEnv } from '../config.ts';
import { encodeDrivePath } from '../drive.ts';
import { GraphClient } from '../graph.ts';

interface Item {
  id: string;
  name: string;
  size?: number;
  folder?: { childCount: number };
  file?: object;
}

const { values } = parseArgs({
  options: { pfad: { type: 'string', default: '' }, tiefe: { type: 'string', default: '1' }, drive: { type: 'string' } },
});
const tiefe = Number(values.tiefe);

const env = loadEnv();
const graph = new GraphClient(createTokenProvider(env, ALLE_SCOPES, { interaktiv: false }));
const laufwerk = values.drive ? `/drives/${values.drive}` : '/me/drive';
const mb = (n = 0) => (n / 1024 ** 2).toFixed(1).replace('.', ',');

async function zeige(id: string, ebene: number): Promise<void> {
  let dateien = 0;
  const ordner: Item[] = [];
  for await (const k of graph.paginate<Item>(`${laufwerk}/items/${id}/children?$top=200&$select=id,name,size,folder,file`)) {
    if (k.folder) ordner.push(k);
    else dateien++;
  }
  if (dateien) console.log(`${'  '.repeat(ebene)}· ${dateien} Dateien`);
  for (const o of ordner.sort((a, b) => a.name.localeCompare(b.name, 'de'))) {
    console.log(`${'  '.repeat(ebene)}📁 ${o.name}  (${o.folder!.childCount} Einträge, ${mb(o.size)} MB)`);
    if (ebene + 1 < tiefe) await zeige(o.id, ebene + 1);
  }
}

const start = values.pfad
  ? await graph.get<Item>(`${laufwerk}/root:/${encodeDrivePath(values.pfad)}:?$select=id,name,folder`)
  : await graph.get<Item>(`${laufwerk}/root?$select=id,name,folder`);
console.log(`📁 ${values.pfad || '(OneDrive)'}`);
await zeige(start.id, 0);
