/**
 * Prüft, ob Mail, Kalender und OneDrive für GRAPH_KONTO erreichbar sind. Fragt nie nach einem
 * Gerätecode und gibt nur Zahlen und Namen von Ordnern aus (siehe src/pruefung.ts).
 *
 *   npm run pruefen
 */
import { ALLE_SCOPES, createTokenProvider } from '../auth.ts';
import { loadEnv } from '../config.ts';
import { GraphClient } from '../graph.ts';
import { verbindungPruefen } from '../pruefung.ts';

const env = loadEnv();
const token = createTokenProvider(env, ALLE_SCOPES, { interaktiv: false });
const punkte = await verbindungPruefen(new GraphClient(token, { maxRetries: 2 }), token);
for (const p of punkte) console.log(`${p.ok ? '✓' : '✗'} ${p.name}: ${p.text}`);
process.exitCode = punkte.every((p) => p.ok) ? 0 : 1;
