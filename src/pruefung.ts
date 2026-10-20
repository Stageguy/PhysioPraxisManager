/**
 * Ist alles erreichbar? Für den Befehl `pruefen` und die Statusseite. Liest nur Zahlen und
 * Ordnernamen – keine Betreffs, keine Absender, keine Dateinamen (Patientendaten).
 */
import { ALLE_SCOPES } from './auth.ts';
import { GraphError, graphSatz, type GraphClient } from './graph.ts';

export interface Pruefpunkt {
  name: string;
  ok: boolean;
  text: string;
}

export async function verbindungPruefen(graph: Pick<GraphClient, 'get'>, token: () => Promise<string>): Promise<Pruefpunkt[]> {
  const punkte: Pruefpunkt[] = [];
  async function pruefe(name: string, schritt: () => Promise<string>): Promise<void> {
    try {
      punkte.push({ name, ok: true, text: await schritt() });
    } catch (err) {
      punkte.push({ name, ok: false, text: err instanceof GraphError ? graphSatz(err) : (err as Error).message });
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
    const drive = await graph.get<{ driveType: string; quota?: { used: number; total: number } }>('/me/drive?$select=driveType,quota');
    const gb = (n = 0) => (n / 1024 ** 3).toFixed(1).replace('.', ',');
    return `${gb(drive.quota?.used)} von ${gb(drive.quota?.total)} GB belegt`;
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

  return punkte;
}
