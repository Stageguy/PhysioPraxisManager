// Übernommen aus mdr-Infrastruktur/graphapi/src/auth.ts – Gerätecode-Anmeldung, nur delegierte Rechte.
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AuthenticationResult,
  type ICachePlugin,
} from '@azure/msal-node';
import type { Env } from './config.ts';

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

const cacheDatei = (env: Env) => path.join(env.dataDir, 'token-cache.json');

/** Token-Cache als Datei (Ordner und Datei nur für den eigenen Benutzer lesbar). */
function fileCachePlugin(file: string): ICachePlugin {
  return {
    async beforeCacheAccess(ctx) {
      try {
        ctx.tokenCache.deserialize(await readFile(file, 'utf8'));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
    },
    async afterCacheAccess(ctx) {
      if (!ctx.cacheHasChanged) return;
      await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      // Erst in eine temporäre Datei, dann umbenennen – ein paralleler Leser sieht nie eine halbe Datei
      const temp = `${file}.${process.pid}.tmp`;
      await writeFile(temp, ctx.tokenCache.serialize(), { mode: 0o600 });
      await rename(temp, file);
    },
  };
}

/** Alle Berechtigungen, denen der Mandant zugestimmt hat – angefordert wird alles auf einmal */
export const ALLE_SCOPES = [
  'Mail.ReadWrite',
  'Mail.Send',
  'Files.ReadWrite',
  'Calendars.ReadWrite',
  'MailboxSettings.ReadWrite',
  'Sites.Read.All',
  'Files.ReadWrite.All',
];

/** Ohne Anmeldung (oder mit dem falschen Konto im Cache) – `npm run login` hilft */
export class NichtAngemeldet extends Error {
  /** Für den Graph-Client: diesen Fehler heilt kein zweiter Versuch – sofort melden */
  readonly endgueltig = true;

  constructor(grund = 'Nicht bei Microsoft angemeldet') {
    super(`${grund} – einmalig \`npm run login\` ausführen`);
  }
}

function clientFuer(env: Env): PublicClientApplication {
  return new PublicClientApplication({
    auth: {
      clientId: env.clientId,
      authority: `https://login.microsoftonline.com/${env.tenantId}`,
    },
    cache: { cachePlugin: fileCachePlugin(cacheDatei(env)) },
  });
}

/** Anmeldung verwerfen, z. B. wenn sich das falsche Konto angemeldet hat */
export async function abmelden(env: Env): Promise<void> {
  await rm(cacheDatei(env), { force: true });
}

/**
 * Liefert eine Funktion, die ein gültiges Access-Token für GRAPH_KONTO zurückgibt.
 * Beim ersten Aufruf (oder wenn das Refresh-Token abgelaufen ist) per Gerätecode-Anmeldung –
 * außer mit `interaktiv: false`: dann endet es in NichtAngemeldet statt in einer Wartezeit.
 * Ein anderes Konto im Cache wird nie benutzt.
 */
export function createTokenProvider(
  env: Env,
  scopes: string[],
  optionen: { interaktiv?: boolean } = {},
): () => Promise<string> {
  const pca = clientFuer(env);

  let current: AuthenticationResult | undefined;

  async function acquire(): Promise<AuthenticationResult> {
    const account = (await pca.getAllAccounts()).find((a) => a.username.toLowerCase() === env.konto);
    if (account) {
      try {
        return await pca.acquireTokenSilent({ account, scopes });
      } catch (err) {
        if (!(err instanceof InteractionRequiredAuthError)) throw err;
      }
    }
    if (optionen.interaktiv === false) throw new NichtAngemeldet();
    const result = await pca.acquireTokenByDeviceCode({
      scopes,
      deviceCodeCallback: (response) =>
        console.log(`\n${response.message}\n\n→ Anmelden als ${env.konto} – nicht mit einem anderen Konto!\n`),
    });
    if (!result) throw new Error('Anmeldung fehlgeschlagen');
    if (result.account?.username.toLowerCase() !== env.konto) {
      await abmelden(env);
      throw new NichtAngemeldet(`Angemeldet war ${result.account?.username ?? 'ein unbekanntes Konto'} statt ${env.konto}, Anmeldung verworfen`);
    }
    return result;
  }

  return async () => {
    const expiresAt = current?.expiresOn?.getTime() ?? 0;
    if (!current || expiresAt - Date.now() < REFRESH_MARGIN_MS) {
      current = await acquire();
    }
    return current.accessToken;
  };
}
