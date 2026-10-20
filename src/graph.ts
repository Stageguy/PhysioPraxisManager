import { setTimeout as sleep } from 'node:timers/promises';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const MAX_RETRIES = 5;
/** Ohne Antwort nach dieser Zeit gilt die Anfrage als abgebrochen (auch große Downloads/Uploads) */
const REQUEST_TIMEOUT_MS = 120_000;
/**
 * Nach einem Netzwerkfehler weiß man nicht, ob die Anfrage angekommen ist. Wiederholt werden daher nur
 * Anfragen, deren Wiederholung nichts doppelt anlegt – nicht POST (z. B. Kalendertermin anlegen).
 */
const SAFE_TO_REPEAT = new Set(['GET', 'PUT', 'PATCH']);

interface Page<T> {
  value: T[];
  '@odata.nextLink'?: string;
}

export class GraphError extends Error {
  readonly status: number;
  /**
   * Was Graph geantwortet hat, ohne Methode und Adresse davor. Die Meldung selbst trägt die
   * ganze Adresse samt Kennung – gut für das Protokoll, zu viel für einen Satz in der Oberfläche.
   */
  readonly antwort: string;

  constructor(status: number, message: string, antwort = '') {
    super(message);
    this.status = status;
    this.antwort = antwort;
  }
}

/**
 * Was Graph gemeldet hat, als Satz ohne Adresse: „Microsoft Graph 409 (nameAlreadyExists): …".
 * Die Antwort von Graph ist JSON mit error.code und error.message; ist sie es nicht, bleibt
 * der Anfang des Textes.
 */
export function graphSatz(err: GraphError): string {
  let code = '';
  let text = err.antwort;
  try {
    const antwort = JSON.parse(err.antwort) as { error?: { code?: string; message?: string } };
    code = antwort.error?.code ?? '';
    text = antwort.error?.message ?? '';
  } catch {
    // keine JSON-Antwort – der Text selbst ist die Meldung
  }
  const kurz = text.replace(/\s+/g, ' ').trim().slice(0, 300);
  return `Microsoft Graph ${err.status}${code ? ` (${code})` : ''}${kurz ? `: ${kurz}` : ''}`;
}

/** Einstellungen des Clients. Ohne Angabe gilt, was für die Aufgaben im Takt richtig ist. */
export interface GraphOptionen {
  retryBaseMs?: number;
  /** Frist je Versuch. Ein Aufruf, auf den jemand wartet, braucht eine kürzere als ein Lauf im Takt. */
  timeoutMs?: number;
  /** Wie oft nach Drosselung, Serverfehler oder Netzwerkfehler wiederholt wird */
  maxRetries?: number;
  /**
   * Längste Wartezeit vor einer Wiederholung. Verlangt Graph mit `Retry-After` mehr, wird nicht
   * gewartet, sondern der Fehler gemeldet – der Aufrufer entscheidet, ob er später wiederkommt.
   */
  maxWaitMs?: number;
  /**
   * Frist für das Holen des Tokens. Ohne Angabe keine: wer sich an der Kommandozeile mit einem
   * Gerätecode anmeldet, braucht Minuten. Ein Aufruf, auf den jemand wartet oder der eine
   * Zeilensperre hält, setzt sie – sonst begrenzt nichts die Zeit, wenn die Anmeldung hängt.
   */
  tokenTimeoutMs?: number;
}

/**
 * Wie AbortSignal.timeout einen Abbruch nennt – so erkennen Aufrufer beide Fristen gleich.
 * `endgueltig`: wer eine Frist für das Token setzt, will nach ihr eine Antwort und nicht sechs
 * Fristen hintereinander; innerhalb desselben Aufrufs wird deshalb nicht wiederholt.
 */
const zeitUeberschritten = (text: string) => Object.assign(new Error(text), { name: 'TimeoutError', endgueltig: true });

/**
 * Eine Datei, die gerade in Word oder PowerPoint offen ist, sperrt OneDrive: Graph antwortet mit
 * 423 und `resourceLocked`. Das ist kein Fehler, sondern ein Zustand – umbenennen und verschieben
 * gehen erst, wenn sie geschlossen ist.
 *
 * Wiederholt wird deshalb nicht: eine Datei kann stundenlang offen sein, und ein Rückzug mit
 * Wartezeit innerhalb desselben Laufs bringt nichts. Der nächste Takt versucht es erneut.
 */
export const istGesperrt = (err: unknown): boolean =>
  err instanceof GraphError && (err.status === 423 || /resourceLocked/i.test(err.message));

/** Schlanker Graph-Client: Bearer-Token, Wiederholung bei Drosselung (429) und Serverfehlern. */
export class GraphClient {
  #getToken: () => Promise<string>;
  #retryBaseMs: number;
  #timeoutMs: number;
  #maxRetries: number;
  #maxWaitMs: number;
  #tokenTimeoutMs: number | undefined;

  constructor(getToken: () => Promise<string>, options: GraphOptionen = {}) {
    this.#tokenTimeoutMs = options.tokenTimeoutMs;
    this.#getToken = getToken;
    this.#retryBaseMs = options.retryBaseMs ?? 1000;
    this.#timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
    this.#maxRetries = options.maxRetries ?? MAX_RETRIES;
    this.#maxWaitMs = options.maxWaitMs ?? Number.POSITIVE_INFINITY;
  }

  async get<T>(pathOrUrl: string, kopfzeilen?: Record<string, string>): Promise<T> {
    return (await (await this.#request('GET', pathOrUrl, undefined, kopfzeilen)).json()) as T;
  }

  /** Wie get, aber undefined statt Fehler, wenn es das Element nicht gibt. */
  async find<T>(pathOrUrl: string, kopfzeilen?: Record<string, string>): Promise<T | undefined> {
    try {
      return await this.get<T>(pathOrUrl, kopfzeilen);
    } catch (err) {
      if (err instanceof GraphError && err.status === 404) return undefined;
      throw err;
    }
  }

  async post<T>(pathOrUrl: string, body: unknown, kopfzeilen?: Record<string, string>): Promise<T> {
    return (await (await this.#request('POST', pathOrUrl, body, kopfzeilen)).json()) as T;
  }

  /** POST ohne Antwortkörper – etwa sendMail, das mit 202 und leerem Körper antwortet */
  async postOhneAntwort(pathOrUrl: string, body: unknown): Promise<void> {
    const res = await this.#request('POST', pathOrUrl, body);
    await res.body?.cancel().catch(() => {});
  }

  /** Binärdaten hochladen (bis 4 MB; größere Dateien brauchen eine Upload-Sitzung) */
  async putBytes<T>(pathOrUrl: string, bytes: Uint8Array): Promise<T> {
    return (await (await this.#request('PUT', pathOrUrl, bytes)).json()) as T;
  }

  async patch<T>(pathOrUrl: string, body: unknown, kopfzeilen?: Record<string, string>): Promise<T> {
    return (await (await this.#request('PATCH', pathOrUrl, body, kopfzeilen)).json()) as T;
  }

  /** Löscht – eine Datei in den OneDrive-Papierkorb, einen Termin aus dem Kalender. */
  async delete(pathOrUrl: string, kopfzeilen?: Record<string, string>): Promise<void> {
    await this.#request('DELETE', pathOrUrl, undefined, kopfzeilen);
  }

  /** Dateiinhalt – bleibt im Arbeitsspeicher, wird nicht auf die Platte geschrieben. */
  async getBytes(pathOrUrl: string): Promise<Uint8Array> {
    return new Uint8Array(await (await this.#request('GET', pathOrUrl)).arrayBuffer());
  }

  /** Die rohe Antwort – zum Durchreichen großer Inhalte, ohne sie ganz in den Speicher zu laden */
  async stream(pathOrUrl: string): Promise<Response> {
    return this.#request('GET', pathOrUrl);
  }

  /**
   * Die Kopfzeilen gehen an jede Folgeseite mit: `Prefer` gilt je Anfrage, und ohne sie käme
   * die zweite Seite wieder in der Vorgabe von Graph (HTML statt Text, veränderliche Kennungen).
   */
  async *paginate<T>(pathOrUrl: string, kopfzeilen?: Record<string, string>): AsyncGenerator<T> {
    let next: string | undefined = pathOrUrl;
    while (next) {
      const page: Page<T> = await this.get<Page<T>>(next, kopfzeilen);
      yield* page.value;
      next = page['@odata.nextLink'];
    }
  }

  /**
   * Das Token holen, ohne etwas zu rufen – mit derselben Frist wie vor jedem Aufruf. Für alle,
   * die wissen wollen, ob die Anmeldung steht, bevor sie etwas beanspruchen.
   */
  async anmelden(): Promise<void> {
    await this.#token();
  }

  /** Das Token, wenn eingestellt mit Frist */
  async #token(): Promise<string> {
    if (this.#tokenTimeoutMs === undefined) return this.#getToken();
    let wecker: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        this.#getToken(),
        new Promise<never>((_, ablehnen) => {
          wecker = setTimeout(() => ablehnen(zeitUeberschritten('Die Anmeldung bei Microsoft antwortet nicht')), this.#tokenTimeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(wecker);
    }
  }

  async #request(
    method: string,
    pathOrUrl: string,
    body?: unknown,
    // Einzelne Aufrufe brauchen eigene Kopfzeilen, etwa `Prefer` für unveränderliche IDs
    kopfzeilen?: Record<string, string>,
  ): Promise<Response> {
    const url = pathOrUrl.startsWith('https://') ? pathOrUrl : GRAPH_BASE + pathOrUrl;
    for (let attempt = 0; ; attempt++) {
      const binary = body instanceof Uint8Array;
      let res: Response;
      try {
        res = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${await this.#token()}`,
            ...(body === undefined ? {} : { 'Content-Type': binary ? 'application/octet-stream' : 'application/json' }),
            ...kopfzeilen,
          },
          body: body === undefined ? undefined : binary ? (body as Uint8Array<ArrayBuffer>) : JSON.stringify(body),
          signal: AbortSignal.timeout(this.#timeoutMs),
        });
      } catch (err) {
        // Ohne Anmeldung hilft keine Wiederholung: der Aufrufer soll es sofort erfahren, nicht
        // nach einer halben Minute Rückzug (der Fehler kommt aus dem Token-Geber, siehe auth.ts).
        // Dasselbe gilt für die abgelaufene Token-Frist.
        if ((err as { endgueltig?: unknown } | null)?.endgueltig === true) throw err;
        // Netzwerkfehler (z. B. ETIMEDOUT direkt nach dem Aufwachen) oder Zeitüberschreitung
        if (SAFE_TO_REPEAT.has(method) && attempt < this.#maxRetries) {
          await sleep(2 ** attempt * this.#retryBaseMs);
          continue;
        }
        throw err;
      }
      if (res.ok) return res;

      const retryable = res.status === 429 || res.status >= 500;
      const retryAfterMs = Number(res.headers.get('Retry-After')) * 1000 || 2 ** attempt * this.#retryBaseMs;
      if (retryable && attempt < this.#maxRetries && retryAfterMs <= this.#maxWaitMs) {
        await res.body?.cancel().catch(() => {});
        await sleep(retryAfterMs);
        continue;
      }
      const antwort = await res.text();
      throw new GraphError(res.status, `Graph ${res.status} bei ${method} ${url}: ${antwort}`, antwort);
    }
  }
}
