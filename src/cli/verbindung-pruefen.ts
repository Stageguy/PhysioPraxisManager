/**
 * Prüft, ob Mail, Kalender und OneDrive für GRAPH_KONTO erreichbar sind. Fragt nie nach einem
 * Gerätecode und gibt nur Zahlen und Namen von Ordnern aus – keine Betreffs, keine Absender,
 * keine Dateinamen (im Postfach stehen Patientendaten).
 *
 *   npm run pruefen
 */
import { ALLE_SCOPES, createTokenProvider } from '../auth.ts';
import { loadEnv } from '../config.ts';
import { GraphClient, GraphError, graphSatz } from '../graph.ts';

const env = loadEnv();
const token = createTokenProvider(env, ALLE_SCOPES, { interaktiv: false });
const graph = new GraphClient(token, { maxRetries: 2 });

let fehler = 0;
async function pruefe(name: string, schritt: () => Promise<string>): Promise<void> {
  try {
    console.log(`✓ ${name}: ${await schritt()}`);
  } catch (err) {
    fehler++;
    const text = err instanceof GraphError ? graphSatz(err) : (err as Error).message;
    console.log(`✗ ${name}: ${text}`);
  }
}

await pruefe('Konto', async () => {
  const me = await graph.get<{ userPrincipalName: string; displayName: string }>('/me?$select=userPrincipalName,displayName');
  return `${me.displayName} (${me.userPrincipalName})`;
});

await pruefe('Posteingang', async () => {
  const box = await graph.get<{ totalItemCount: number; unreadItemCount: number }>(
    '/me/mailFolders/inbox?$select=totalItemCount,unreadItemCount',
  );
  return `${box.totalItemCount} Mails, davon ${box.unreadItemCount} ungelesen`;
});

await pruefe('Kalender', async () => {
  const kal = await graph.get<{ name: string; canEdit: boolean }>('/me/calendar?$select=name,canEdit');
  return `„${kal.name}“${kal.canEdit ? ', beschreibbar' : ', nur lesbar'}`;
});

await pruefe('OneDrive', async () => {
  try {
    const drive = await graph.get<{ driveType: string; quota?: { used: number; total: number } }>(
      '/me/drive?$select=driveType,quota',
    );
    const gb = (n = 0) => (n / 1024 ** 3).toFixed(1);
    return `${drive.driveType}, ${gb(drive.quota?.used)} von ${gb(drive.quota?.total)} GB belegt`;
  } catch (err) {
    if (err instanceof GraphError && err.status === 404) {
      throw new Error('noch nicht angelegt – einmal als praxis@lilli-nebel.de auf https://onedrive.com anmelden, dann erneut prüfen');
    }
    throw err;
  }
});

// Ob die Zustimmung alle Rechte umfasst (auch Mail.Send, das sich ohne Versand nicht ausprobieren
// lässt), steht im Token selbst: im Feld scp
await pruefe('Rechte', async () => {
  const nutzlast = (await token()).split('.')[1] ?? '';
  const scp = String(JSON.parse(Buffer.from(nutzlast, 'base64url').toString('utf8')).scp ?? '').split(' ');
  const fehlt = ALLE_SCOPES.filter((s) => !scp.includes(s));
  if (fehlt.length) throw new Error(`es fehlt ${fehlt.join(', ')} – Admin-Zustimmung erneuern (scripts/register-app.sh)`);
  return ALLE_SCOPES.join(', ');
});

process.exitCode = fehler ? 1 : 0;
