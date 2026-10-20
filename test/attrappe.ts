/** Graph-Attrappe: antwortet aus Tabellen und schreibt mit, was geschrieben worden wäre. Kein Netz. */
import { GraphError } from '../src/graph.ts';

export interface Aufruf {
  methode: string;
  pfad: string;
  body?: unknown;
}

export function graphAttrappe(daten: {
  seiten?: Record<string, unknown[]>;
  get?: Record<string, unknown>;
  fehlerBei?: (pfad: string) => boolean;
}) {
  const aufrufe: Aufruf[] = [];
  const schreib = (methode: string, pfad: string, body?: unknown) => {
    aufrufe.push({ methode, pfad, body });
    if (daten.fehlerBei?.(pfad)) throw new GraphError(500, `Fehler bei ${pfad}`, '{}');
  };
  const passend = (pfad: string, tabelle: Record<string, unknown> = {}) =>
    Object.entries(tabelle).find(([anfang]) => pfad.startsWith(anfang))?.[1];
  let zaehler = 0;

  return {
    aufrufe,
    schreibende: () => aufrufe.filter((a) => a.methode !== 'GET'),
    async get<T>(pfad: string): Promise<T> {
      aufrufe.push({ methode: 'GET', pfad });
      const wert = passend(pfad, daten.get);
      if (wert === undefined) throw new GraphError(404, `nicht gefunden: ${pfad}`, '{}');
      return wert as T;
    },
    async find<T>(pfad: string): Promise<T | undefined> {
      aufrufe.push({ methode: 'GET', pfad });
      return passend(pfad, daten.get) as T | undefined;
    },
    async *paginate<T>(pfad: string): AsyncGenerator<T> {
      aufrufe.push({ methode: 'GET', pfad });
      yield* ((passend(pfad, daten.seiten) as T[] | undefined) ?? []);
    },
    async getBytes(pfad: string): Promise<Uint8Array> {
      aufrufe.push({ methode: 'GET', pfad });
      return new Uint8Array([1, 2, 3]);
    },
    async post<T>(pfad: string, body: unknown): Promise<T> {
      schreib('POST', pfad, body);
      return { id: `neu-${++zaehler}`, name: (body as { name?: string })?.name ?? 'x' } as T;
    },
    async postOhneAntwort(pfad: string, body: unknown): Promise<void> {
      schreib('POST', pfad, body);
    },
    async patch<T>(pfad: string, body: unknown): Promise<T> {
      schreib('PATCH', pfad, body);
      return {} as T;
    },
    async putBytes<T>(pfad: string, bytes: Uint8Array): Promise<T> {
      schreib('PUT', pfad, bytes.length);
      const name = decodeURIComponent(/:\/([^:]+):\/content/.exec(pfad)?.[1] ?? 'x');
      return { id: `datei-${++zaehler}`, name } as T;
    },
  };
}
