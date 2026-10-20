/** Outlook-Ordner nach Pfad finden oder anlegen. "Posteingang/Rechnungen" – der erste Teil ist immer der Posteingang. */
import type { GraphClient } from '../graph.ts';

interface MailOrdner {
  id: string;
  displayName: string;
}

type OrdnerGraph = Pick<GraphClient, 'get' | 'paginate' | 'post'>;

async function kind(graph: OrdnerGraph, elternId: string, name: string): Promise<MailOrdner | undefined> {
  for await (const k of graph.paginate<MailOrdner>(`/me/mailFolders/${elternId}/childFolders?$top=100&$select=id,displayName`)) {
    if (k.displayName.toLowerCase() === name.toLowerCase()) return k;
  }
  return undefined;
}

/** Kennung des Ordners, oder undefined, wenn es ihn (noch) nicht gibt. Verändert nichts. */
export async function mailOrdnerFinden(graph: OrdnerGraph, pfad: string): Promise<string | undefined> {
  const [, ...teile] = pfad.split('/').filter(Boolean);
  let ordner = await graph.get<MailOrdner>('/me/mailFolders/inbox?$select=id,displayName');
  for (const name of teile) {
    const naechster = await kind(graph, ordner.id, name);
    if (!naechster) return undefined;
    ordner = naechster;
  }
  return ordner.id;
}

/** Wie mailOrdnerFinden, legt aber fehlende Ordner an */
export async function mailOrdnerSicherstellen(graph: OrdnerGraph, pfad: string): Promise<string> {
  const [, ...teile] = pfad.split('/').filter(Boolean);
  let ordner = await graph.get<MailOrdner>('/me/mailFolders/inbox?$select=id,displayName');
  for (const name of teile) {
    ordner =
      (await kind(graph, ordner.id, name)) ??
      (await graph.post<MailOrdner>(`/me/mailFolders/${ordner.id}/childFolders`, { displayName: name }));
  }
  return ordner.id;
}

interface OrdnerInfo {
  id: string;
  displayName: string;
  childFolderCount: number;
}

/** Ordner, die bei einem Durchgang durch das ganze Postfach nie gelesen werden */
const NIE = ['junkemail', 'drafts', 'outbox', 'sentitems', 'conversationhistory', 'syncissues', 'recoverableitemsdeletions'];

/**
 * Alle Mail-Ordner des Postfachs (Posteingang, Unterordner, Archiv, eigene Ordner) – ohne Junk,
 * Entwürfe, Postausgang, Gesendete; „Gelöschte Elemente“ nur auf Wunsch.
 * Liefert nur Kennungen: Ordnernamen können Patientennamen tragen.
 */
export async function* alleMailordner(
  graph: Pick<GraphClient, 'find' | 'paginate'>,
  optionen: { mitGeloeschten?: boolean } = {},
): AsyncGenerator<string> {
  const aus = new Set<string>();
  for (const w of [...NIE, ...(optionen.mitGeloeschten ? [] : ['deleteditems'])]) {
    const o = await graph.find<{ id: string }>(`/me/mailFolders/${w}?$select=id`);
    if (o) aus.add(o.id);
  }
  async function* tiefer(eltern?: string): AsyncGenerator<string> {
    const url = eltern ? `/me/mailFolders/${eltern}/childFolders` : '/me/mailFolders';
    for await (const o of graph.paginate<OrdnerInfo>(`${url}?$top=100&$select=id,displayName,childFolderCount&includeHiddenFolders=true`)) {
      if (aus.has(o.id)) continue;
      yield o.id;
      if (o.childFolderCount) yield* tiefer(o.id);
    }
  }
  yield* tiefer();
}
