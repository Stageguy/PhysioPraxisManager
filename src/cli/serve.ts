/**
 * Startet den Praxisdienst (Statusseite und /api/health) – im Container hinter tailscale serve.
 *
 *   npm run serve
 *
 * PORT (Standard 3300), ERLAUBTE_NUTZER (Tailnet-Konten, durch Komma getrennt), DATABASE_URL
 * (optional – ohne sie zeigt das Cockpit „nicht verbunden“), LOKALER_ZUGANG (nur Bauphase ohne Tailscale).
 */
import { readFile } from 'node:fs/promises';
import { ALLE_SCOPES, createTokenProvider } from '../auth.ts';
import { loadEnv } from '../config.ts';
import { GraphClient } from '../graph.ts';
import { verbindungPruefen } from '../pruefung.ts';
import { cockpitDaten, rechnungsliste, rechnungsstand } from '../cockpit/daten.ts';
import { migriere, verbinde } from '../db/index.ts';
import { praxisDienst } from '../server.ts';

const env = loadEnv();
const port = Number(process.env.PORT ?? 3300);
const erlaubt = (process.env.ERLAUBTE_NUTZER ?? '').split(',').filter((s) => s.trim());
if (!erlaubt.length) console.warn('⚠ ERLAUBTE_NUTZER ist leer – die Statusseite lässt niemanden herein');

const { version } = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
const token = createTokenProvider(env, ALLE_SCOPES, { interaktiv: false });
// Auf die Statusseite wartet jemand: kurze Fristen statt der langen für Läufe
const graph = new GraphClient(token, { timeoutMs: 15_000, tokenTimeoutMs: 15_000, maxRetries: 1, maxWaitMs: 5_000 });

const db = process.env.DATABASE_URL ? verbinde() : undefined;
if (db) {
  // Beim gemeinsamen Start (k3s) ist die Datenbank oft noch nicht bereit – warten statt abstürzen
  for (let versuch = 1; ; versuch++) {
    try {
      console.log(`Datenbank: ${(await migriere(db)).join(', ') || 'Schema aktuell'}`);
      break;
    } catch (err) {
      if (versuch >= 24) throw err;
      console.warn(`Datenbank noch nicht erreichbar (${(err as { code?: string }).code ?? (err as Error).message}) – neuer Versuch in 5 s`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}
const lokalerZugang = process.env.LOKALER_ZUGANG || undefined;
if (lokalerZugang) {
  console.warn(`⚠ LOKALER_ZUGANG gesetzt: Anfragen von 127.0.0.1 ohne Tailscale gelten als ${lokalerZugang} – nur für die Bauphase`);
  if (!erlaubt.map((e) => e.trim().toLowerCase()).includes(lokalerZugang.toLowerCase())) erlaubt.push(lokalerZugang);
}

const dienst = praxisDienst({
  erlaubt,
  fassung: version,
  lokalerZugang,
  pruefen: () => verbindungPruefen(graph, token),
  angemeldet: () => token().then(() => true, () => false),
  cockpit: ({ namenZeigen }) => cockpitDaten({ db, graph, namenZeigen }),
  rechnungen: async () => ({ stand: await rechnungsstand(db), liste: await rechnungsliste(db) }),
});

// Nur 127.0.0.1: von außen ist der Dienst ausschließlich über tailscale serve erreichbar
dienst.listen(port, '127.0.0.1', () => console.log(`Praxisdienst ${version} auf 127.0.0.1:${port}`));
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => dienst.close(() => void db?.ende().finally(() => process.exit(0))));
