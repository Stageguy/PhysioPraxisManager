/**
 * Einmalige Anmeldung als GRAPH_KONTO: fordert alle Berechtigungen auf einmal an und speichert
 * die Anmeldung in DATA_DIR/token-cache.json. Danach laufen alle Befehle ohne Rückfrage
 * (das Refresh-Token hält, solange es mindestens alle 90 Tage benutzt wird).
 *
 *   npm run login
 */
import { ALLE_SCOPES, createTokenProvider } from '../auth.ts';
import { loadEnv } from '../config.ts';
import { GraphClient } from '../graph.ts';

const env = loadEnv();
const graph = new GraphClient(createTokenProvider(env, ALLE_SCOPES));
const me = await graph.get<{ userPrincipalName: string }>('/me?$select=userPrincipalName');
console.log(`✓ Angemeldet als ${me.userPrincipalName} – Anmeldung gespeichert in ${env.dataDir}`);
