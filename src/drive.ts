// Hochladen übernommen aus mdr-Infrastruktur/graphapi/src/drive.ts
import { setTimeout as sleep } from 'node:timers/promises';
import { GraphError, type GraphClient } from './graph.ts';

/** "Praxis/Mailanhänge" → URL-kodierter Pfad für /me/drive/root:/…: */
export function encodeDrivePath(folder: string): string {
  return folder.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

interface Ordner {
  id: string;
  name: string;
  folder?: { childCount: number };
}

/**
 * Welches Laufwerk: das eigene OneDrive ('/me/drive') oder ein geteiltes ('/drives/<id>') –
 * die Praxisablage „Projekte/Praxis Lilli Nebel“ liegt in einem geteilten (requirements N23).
 */
export const laufwerkPfad = (driveId?: string): string => (driveId ? `/drives/${driveId}` : '/me/drive');

/** Kennung eines OneDrive-Ordners, oder undefined, wenn es ihn nicht gibt. Verändert nichts. */
export async function ordnerFinden(
  graph: Pick<GraphClient, 'find'>,
  pfad: string,
  laufwerk = '/me/drive',
): Promise<string | undefined> {
  const item = await graph.find<Ordner>(`${laufwerk}/root:/${encodeDrivePath(pfad)}:?$select=id,name,folder`);
  if (item && !item.folder) throw new Error(`„${pfad}“ ist in OneDrive eine Datei, kein Ordner`);
  return item?.id;
}

/**
 * Legt einen Ordnerpfad an, soweit er fehlt, und gibt die Kennung des letzten Ordners zurück.
 * Sucht vom tiefsten vorhandenen Ordner aus: in einem geteilten Laufwerk sieht praxis@ oft nur
 * den geteilten Ordner, nicht die Ordner darüber („Projekte“ ist dann unsichtbar, aber vorhanden).
 */
export async function ordnerSicherstellen(
  graph: Pick<GraphClient, 'find' | 'post'>,
  pfad: string,
  laufwerk = '/me/drive',
): Promise<string> {
  const teile = pfad.split('/').filter(Boolean);
  if (!teile.length) throw new Error('Leerer Ordnerpfad');
  let vorhanden = teile.length;
  let elternId: string | undefined;
  for (; vorhanden > 0; vorhanden--) {
    elternId = await ordnerFinden(graph, teile.slice(0, vorhanden).join('/'), laufwerk);
    if (elternId) break;
  }
  for (let i = vorhanden; i < teile.length; i++) {
    const ziel = elternId ? `${laufwerk}/items/${elternId}/children` : `${laufwerk}/root/children`;
    const neu = await graph.post<Ordner>(ziel, {
      name: teile[i],
      folder: {},
      '@microsoft.graph.conflictBehavior': 'fail',
    });
    elternId = neu.id;
  }
  return elternId!;
}

const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024;
/** Muss ein Vielfaches von 320 KiB sein */
const CHUNK_SIZE = 16 * 320 * 1024;

export interface UploadedItem {
  id: string;
  name: string;
}

/**
 * Datei in einen OneDrive-Ordner hochladen. Gibt es den Namen schon, vergibt OneDrive einen neuen
 * ("Befund 1.pdf") – es wird nie etwas überschrieben.
 */
export async function uploadFile(
  graph: Pick<GraphClient, 'putBytes' | 'post'>,
  folderId: string,
  name: string,
  bytes: Uint8Array,
  laufwerk = '/me/drive',
): Promise<UploadedItem> {
  const itemPath = `${laufwerk}/items/${folderId}:/${encodeURIComponent(name)}:`;
  if (bytes.length <= SIMPLE_UPLOAD_LIMIT) {
    return graph.putBytes<UploadedItem>(`${itemPath}/content?@microsoft.graph.conflictBehavior=rename`, bytes);
  }

  const session = await graph.post<{ uploadUrl: string }>(`${itemPath}/createUploadSession`, {
    item: { '@microsoft.graph.conflictBehavior': 'rename' },
  });
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    const chunk = bytes.subarray(offset, Math.min(offset + CHUNK_SIZE, bytes.length));
    // Die Upload-URL ist vorab berechtigt – ohne Authorization-Header senden
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(session.uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Length': String(chunk.length),
            'Content-Range': `bytes ${offset}-${offset + chunk.length - 1}/${bytes.length}`,
          },
          body: chunk as Uint8Array<ArrayBuffer>,
          signal: AbortSignal.timeout(120_000),
        });
      } catch (err) {
        // Ein Teilstück erneut zu senden ist gefahrlos
        if (attempt < 5) {
          await sleep(2 ** attempt * 1000);
          continue;
        }
        throw err;
      }
      if (res.status === 200 || res.status === 201) return (await res.json()) as UploadedItem;
      if (res.status === 202) break;
      if ((res.status === 429 || res.status >= 500) && attempt < 5) {
        await sleep((Number(res.headers.get('Retry-After')) || 2 ** attempt) * 1000);
        continue;
      }
      const antwort = await res.text();
      throw new GraphError(res.status, `Upload fehlgeschlagen: ${res.status} ${antwort}`, antwort);
    }
  }
  throw new GraphError(502, 'Upload: keine Abschlussantwort', '');
}
