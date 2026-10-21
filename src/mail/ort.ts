/**
 * Wo liegt eine Mail im Postfach? "Posteingang › Rechnungen › Verarbeitet" – für den Hinweis an den
 * Rechnungskacheln. Ordnernamen werden je Dienst-Lauf zwischengespeichert (im Arbeitsspeicher).
 */
import type { GraphClient } from '../graph.ts';

const PREFER = { Prefer: 'IdType="ImmutableId"' };

interface Ordner {
  id: string;
  displayName: string;
  parentFolderId?: string;
}

export class MailOrte {
  #graph: Pick<GraphClient, 'get' | 'find'>;
  #ordner = new Map<string, Ordner>();
  #wurzel: Promise<string | undefined> | undefined;

  constructor(graph: Pick<GraphClient, 'get' | 'find'>) {
    this.#graph = graph;
  }

  async #ordnerHolen(id: string): Promise<Ordner | undefined> {
    const da = this.#ordner.get(id);
    if (da) return da;
    const o = await this.#graph.find<Ordner>(`/me/mailFolders/${id}?$select=id,displayName,parentFolderId`, PREFER);
    if (o) this.#ordner.set(id, o);
    return o;
  }

  /** Pfad der Mail, oder undefined, wenn es sie nicht mehr gibt */
  async ort(mailId: string): Promise<string | undefined> {
    const mail = await this.#graph.find<{ parentFolderId: string }>(`/me/messages/${mailId}?$select=parentFolderId`, PREFER);
    if (!mail) return undefined;
    this.#wurzel ??= this.#graph.find<{ id: string }>('/me/mailFolders/msgfolderroot?$select=id', PREFER).then((w) => w?.id);
    const wurzel = await this.#wurzel;
    const teile: string[] = [];
    let id: string | undefined = mail.parentFolderId;
    for (let tiefe = 0; id && id !== wurzel && tiefe < 12; tiefe++) {
      const o = await this.#ordnerHolen(id);
      if (!o) break;
      teile.unshift(o.displayName);
      id = o.parentFolderId;
    }
    return teile.join(' › ') || 'Postfach';
  }
}
