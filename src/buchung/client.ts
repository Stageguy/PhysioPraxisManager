/** Der Manager spricht mit dem Buchungsdienst (W96): Angebot schieben, Buchungen abholen, Abgeholtes bestätigen */
import type { Angebot, Buchung, Einladung } from './angebot.ts';

export interface BuchungsClient {
  angebotSenden(angebot: Angebot): Promise<{ terminarten: number; tage: number }>;
  buchungenAbholen(ab: number): Promise<Buchung[]>;
  abgeholt(bis: number): Promise<void>;
  /** Einladungen zum Schnelltermin (W117b) hinüberschieben – der Dienst merkt sie sich bis zu ihrer Gültigkeit */
  einladungenSenden(einladungen: Einladung[]): Promise<void>;
}

export class BuchungsdienstFehler extends Error {}

export function buchungsClient(o: { url: string; schluessel: string; holen?: typeof fetch; timeoutMs?: number }): BuchungsClient {
  const holen = o.holen ?? fetch;
  const basis = o.url.replace(/\/$/, '');
  const anfrage = async <T>(pfad: string, init: RequestInit = {}): Promise<T> => {
    const antwort = await holen(`${basis}${pfad}`, { ...init, headers: { 'X-Buchung-Schluessel': o.schluessel, 'Content-Type': 'application/json', ...(init.headers ?? {}) }, signal: AbortSignal.timeout(o.timeoutMs ?? 10_000) });
    if (!antwort.ok) throw new BuchungsdienstFehler(`Buchungsdienst ${antwort.status} bei ${pfad}: ${(await antwort.text()).slice(0, 200)}`);
    return (await antwort.json()) as T;
  };
  return {
    angebotSenden: (angebot) => anfrage('/api/angebot', { method: 'PUT', body: JSON.stringify(angebot) }),
    buchungenAbholen: async (ab) => (await anfrage<{ buchungen: Buchung[] }>(`/api/buchungen?ab=${ab}`)).buchungen,
    abgeholt: async (bis) => { await anfrage('/api/buchungen/abgeholt', { method: 'POST', body: JSON.stringify({ bis }) }); },
    einladungenSenden: async (einladungen) => { await anfrage('/api/einladungen', { method: 'PUT', body: JSON.stringify({ einladungen }) }); },
  };
}

/** Aus der Umgebung: BUCHUNG_URL (intern, z. B. http://127.0.0.1:3310) und BUCHUNG_SCHLUESSEL; undefined = keine Buchungsseite */
export function buchungsClientAusUmgebung(env: NodeJS.ProcessEnv = process.env): BuchungsClient | undefined {
  return env.BUCHUNG_URL && env.BUCHUNG_SCHLUESSEL ? buchungsClient({ url: env.BUCHUNG_URL, schluessel: env.BUCHUNG_SCHLUESSEL }) : undefined;
}
