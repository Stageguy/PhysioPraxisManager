import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Lieferant } from './rechnungen/klassifikation.ts';

export interface RechnungsEinstellungen {
  /** Nur Mails ab diesem Tag (JJJJ-MM-TT, deutsche Zeit) – ältere bleiben unberührt */
  seit: string;
  /** Outlook-Ordner, den eine Outlook-Regel mit Rechnungen befüllt; fehlt er, gilt der Posteingang */
  mailordner: string;
  /** Wohin erledigte Mails verschoben werden (wird beim Ausführen angelegt) */
  verarbeitet: string;
  /**
   * OneDrive-Ordner für Rechnungen; null = noch nicht festgelegt, dann nur Probeläufe.
   * Platzhalter {JJJJ} und {MM} nach dem Eingangstag; ohne Platzhalter kommt /JJJJ/MM dahinter.
   */
  ziel: string | null;
  /** Laufwerk des Ziels: fehlt es, das eigene OneDrive von praxis@; sonst die driveId eines geteilten */
  laufwerk?: string;
  kategorien: { eingegangen: string; patient: string; unklar: string };
  /** Bekannte Lieferanten – nur von ihnen wird eine Rechnung ohne Rückfrage abgelegt */
  lieferanten: Lieferant[];
  /**
   * Absender eigener Ausgangsrechnungen (Kopien aus Lexware, z. B. "belege.lexware.de"): diese
   * Mails überspringt der Rechnungseingang ganz – sie sind keine Eingangsrechnungen und tragen
   * Patientendaten (requirements N25).
   */
  eigeneAbsender?: string[];
}

export interface AblageEinstellungen {
  /** driveId des Laufwerks mit der Praxisablage (geteilt) */
  laufwerk: string;
  /** "Projekte/Praxis Lilli Nebel/01 Finanzen" – darunter je Jahr ein Ordner */
  finanzen: string;
  /** Gekennzeichneter Testordner für Probeläufe */
  probelauf: string;
}

export interface Einstellungen {
  rechnungen: RechnungsEinstellungen;
  ablage?: AblageEinstellungen;
}

/** Zielordner für einen Eingangstag ("2026-10-20") */
export function zielOrdner(ziel: string, tag: string): string {
  const [jjjj, mm] = [tag.slice(0, 4), tag.slice(5, 7)];
  return /\{JJJJ\}|\{MM\}/.test(ziel) ? ziel.replace(/\{JJJJ\}/g, jjjj).replace(/\{MM\}/g, mm) : `${ziel}/${jjjj}/${mm}`;
}

export async function ladeEinstellungen(
  datei = path.resolve(process.env.EINSTELLUNGEN ?? 'config/praxis.json'),
): Promise<Einstellungen> {
  const e = JSON.parse(await readFile(datei, 'utf8')) as Einstellungen;
  const r = e.rechnungen;
  if (!r?.seit || !r.mailordner || !r.verarbeitet || !r.kategorien || !Array.isArray(r.lieferanten)) {
    throw new Error(`${datei}: rechnungen.seit, .mailordner, .verarbeitet, .kategorien und .lieferanten sind nötig`);
  }
  if (r.ziel !== null && typeof r.ziel !== 'string') throw new Error(`${datei}: rechnungen.ziel ist ein Ordnerpfad oder null`);
  return e;
}
