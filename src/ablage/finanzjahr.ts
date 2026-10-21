/**
 * Finanzordner für ein neues Jahr nach der Vorlage des Vorjahres anlegen – nur Ordner, nie Dateien.
 *
 * Aus "01 Finanzen/2025" wird "01 Finanzen/2026": dieselben Unterordner, die Jahreszahl in Namen
 * ersetzt ("Steuer 2025" → "Steuer 2026"), dazu "Eingangsrechnungen" für den Rechnungseingang.
 * Was es schon gibt, bleibt unberührt.
 */
import { encodeDrivePath } from '../drive.ts';
import type { GraphClient } from '../graph.ts';
import { nurProduktion } from '../umgebung.ts';

interface Item {
  id: string;
  name: string;
  folder?: { childCount: number };
}

/** Ordner, die jedes Jahr zusätzlich bekommt, auch wenn die Vorlage sie nicht hat */
export const PFLICHTORDNER = ['Eingangsrechnungen'];

type JahrGraph = Pick<GraphClient, 'get' | 'find' | 'paginate' | 'post'>;

/** Relativpfade aller Unterordner der Vorlage, Eltern vor Kindern */
export async function vorlagenOrdner(graph: JahrGraph, laufwerk: string, vorlage: string): Promise<string[]> {
  const start = await graph.get<Item>(`${laufwerk}/root:/${encodeDrivePath(vorlage)}:?$select=id,name,folder`);
  const pfade: string[] = [];
  const offen: { id: string; rel: string }[] = [{ id: start.id, rel: '' }];
  for (let n = offen.shift(); n; n = offen.shift()) {
    for await (const k of graph.paginate<Item>(`${laufwerk}/items/${n.id}/children?$top=200&$select=id,name,folder`)) {
      if (!k.folder) continue;
      const rel = n.rel ? `${n.rel}/${k.name}` : k.name;
      pfade.push(rel);
      offen.push({ id: k.id, rel });
    }
  }
  return pfade;
}

/** Jahreszahl der Vorlage in jedem Pfadteil durch das neue Jahr ersetzen */
export function aufJahr(pfade: string[], vorlageJahr: number, jahr: number): string[] {
  const muster = new RegExp(`\\b${vorlageJahr}\\b`, 'g');
  const neu = pfade.map((p) => p.replace(muster, String(jahr)));
  for (const p of PFLICHTORDNER) if (!neu.includes(p)) neu.push(p);
  return neu;
}

export async function finanzjahrAnlegen(
  graph: JahrGraph,
  einst: { laufwerk: string; finanzen: string },
  jahr: number,
  optionen: { ausfuehren: boolean; vorlageJahr?: number },
): Promise<{ vorlage: string; ziel: string; vorhanden: string[]; angelegt: string[]; geplant: string[] }> {
  if (optionen.ausfuehren) nurProduktion('Das Anlegen von Finanzordnern');
  const laufwerk = `/drives/${einst.laufwerk}`;
  const vorlageJahr = optionen.vorlageJahr ?? jahr - 1;
  const vorlage = `${einst.finanzen}/${vorlageJahr}`;
  const ziel = `${einst.finanzen}/${jahr}`;
  const pfade = ['', ...aufJahr(await vorlagenOrdner(graph, laufwerk, vorlage), vorlageJahr, jahr)];
  const r = { vorlage, ziel, vorhanden: [] as string[], angelegt: [] as string[], geplant: [] as string[] };
  const ids = new Map<string, string>();

  for (const rel of pfade) {
    const voll = rel ? `${ziel}/${rel}` : ziel;
    const da = await graph.find<Item>(`${laufwerk}/root:/${encodeDrivePath(voll)}:?$select=id,name,folder`);
    if (da) {
      ids.set(rel, da.id);
      r.vorhanden.push(rel || '.');
      continue;
    }
    if (!optionen.ausfuehren) {
      r.geplant.push(rel || '.');
      continue;
    }
    const elternRel = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
    const name = rel ? rel.slice(rel.lastIndexOf('/') + 1) : String(jahr);
    const elternId =
      rel === ''
        ? (await graph.get<Item>(`${laufwerk}/root:/${encodeDrivePath(einst.finanzen)}:?$select=id`)).id
        : ids.get(elternRel)!;
    const neu = await graph.post<Item>(`${laufwerk}/items/${elternId}/children`, {
      name,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'fail',
    });
    ids.set(rel, neu.id);
    r.angelegt.push(rel || '.');
  }
  return r;
}
