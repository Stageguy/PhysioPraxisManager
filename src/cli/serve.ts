/**
 * Startet den Praxisdienst (Statusseite und /api/health) – im Container hinter tailscale serve.
 *
 *   npm run serve
 *
 * PORT (Standard 3300), ERLAUBTE_NUTZER (Tailnet-Konten, durch Komma getrennt).
 */
import { readFile } from 'node:fs/promises';
import { ALLE_SCOPES, createTokenProvider } from '../auth.ts';
import { loadEnv } from '../config.ts';
import { GraphClient } from '../graph.ts';
import { verbindungPruefen } from '../pruefung.ts';
import { praxisDienst } from '../server.ts';

const env = loadEnv();
const port = Number(process.env.PORT ?? 3300);
const erlaubt = (process.env.ERLAUBTE_NUTZER ?? '').split(',').filter((s) => s.trim());
if (!erlaubt.length) console.warn('⚠ ERLAUBTE_NUTZER ist leer – die Statusseite lässt niemanden herein');

const { version } = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
const token = createTokenProvider(env, ALLE_SCOPES, { interaktiv: false });
// Auf die Statusseite wartet jemand: kurze Fristen statt der langen für Läufe
const graph = new GraphClient(token, { timeoutMs: 15_000, tokenTimeoutMs: 15_000, maxRetries: 1, maxWaitMs: 5_000 });

const dienst = praxisDienst({
  erlaubt,
  fassung: version,
  pruefen: () => verbindungPruefen(graph, token),
  angemeldet: () => token().then(() => true, () => false),
});

// Nur 127.0.0.1: von außen ist der Dienst ausschließlich über tailscale serve erreichbar
dienst.listen(port, '127.0.0.1', () => console.log(`Praxisdienst ${version} auf 127.0.0.1:${port}`));
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => dienst.close(() => process.exit(0)));
