import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface AnhaengeEinstellungen {
  /** Nur Mails ab diesem Tag (JJJJ-MM-TT, deutsche Zeit) – ältere bleiben unberührt */
  seit: string;
  /** OneDrive-Ordner für die Anhänge; darunter je Monat ein Unterordner "2026-10" */
  ziel: string;
  /** Kategorie, an der man in Outlook sieht, dass die Anhänge abgelegt sind */
  kategorie: string;
}

export interface Einstellungen {
  anhaenge: AnhaengeEinstellungen;
}

export async function ladeEinstellungen(
  datei = path.resolve(process.env.EINSTELLUNGEN ?? 'config/praxis.json'),
): Promise<Einstellungen> {
  const e = JSON.parse(await readFile(datei, 'utf8')) as Einstellungen;
  const a = e.anhaenge;
  if (!a?.seit || !a.ziel || !a.kategorie) throw new Error(`${datei}: anhaenge.seit, .ziel und .kategorie sind nötig`);
  return e;
}
