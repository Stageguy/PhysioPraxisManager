/**
 * Tresor: Verschlüsselung von Gesundheitsdaten, bevor sie in die Datenbank gehen (requirements §4a, N19).
 *
 * Aufbau je Wert (Umschlagverschlüsselung):
 *   [1 Byte Fassung=1][1 Byte Schlüsselnummer][12 IV][16 Tag][32 eingepackter Datenschlüssel]
 *   [12 IV][16 Tag][Inhalt]
 * Jeder Wert bekommt einen eigenen zufälligen Datenschlüssel (AES-256-GCM); eingepackt wird er mit
 * dem Hauptschlüssel aus PRAXIS_TRESOR_SCHLUESSEL (32 Byte, base64). Ein neuer Hauptschlüssel
 * muss deshalb nur die Umschläge neu packen, nicht die Inhalte. Der `kontext` (z. B.
 * "anamnese.beschwerden") wird als Zusatzdaten mitgeprüft: ein Wert lässt sich nicht in eine
 * andere Spalte verschieben, ohne dass das Entschlüsseln scheitert.
 *
 * Der Hauptschlüssel liegt als Kubernetes-Secret `praxis-tresor`; eine Notfallkopie bewahrt Lilli
 * offline auf. Ohne Schlüssel sind die Daten weg – so gewollt (§4a Punkt 2).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const FASSUNG = 1;
const IV = 12;
const TAG = 16;
const DEK = 32;

export class TresorFehler extends Error {}

export interface Tresor {
  verschluesseln(klartext: string | Uint8Array, kontext: string): Buffer;
  entschluesseln(geheim: Uint8Array, kontext: string): Buffer;
  entschluesselnText(geheim: Uint8Array | null | undefined, kontext: string): string | null;
}

/** Neuen Hauptschlüssel erzeugen (für .env bzw. das Secret) */
export const neuerHauptschluessel = (): string => randomBytes(DEK).toString('base64');

function schluesselAus(env: NodeJS.ProcessEnv): { nummer: number; schluessel: Buffer } {
  const wert = env.PRAXIS_TRESOR_SCHLUESSEL?.trim();
  if (!wert) throw new TresorFehler('PRAXIS_TRESOR_SCHLUESSEL fehlt – ohne Hauptschlüssel keine Patientenakte (siehe .env.example)');
  // "2:base64" erlaubt eine Schlüsselnummer; ohne Angabe gilt 1
  const [nummerText, b64] = wert.includes(':') ? wert.split(':', 2) : ['1', wert];
  const schluessel = Buffer.from(b64 ?? '', 'base64');
  const nummer = Number(nummerText);
  if (schluessel.length !== DEK) throw new TresorFehler('PRAXIS_TRESOR_SCHLUESSEL muss 32 Byte in base64 sein (npm run tresor:schluessel)');
  if (!Number.isInteger(nummer) || nummer < 1 || nummer > 255) throw new TresorFehler('Schlüsselnummer muss zwischen 1 und 255 liegen');
  return { nummer, schluessel };
}

function gcmVerschluesseln(schluessel: Buffer, klartext: Uint8Array, aad: Buffer): Buffer {
  const iv = randomBytes(IV);
  const c = createCipheriv('aes-256-gcm', schluessel, iv);
  c.setAAD(aad);
  const inhalt = Buffer.concat([c.update(klartext), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), inhalt]);
}

function gcmEntschluesseln(schluessel: Buffer, paket: Buffer, aad: Buffer): Buffer {
  if (paket.length < IV + TAG) throw new TresorFehler('Verschlüsselter Wert ist zu kurz');
  const d = createDecipheriv('aes-256-gcm', schluessel, paket.subarray(0, IV));
  d.setAAD(aad);
  d.setAuthTag(paket.subarray(IV, IV + TAG));
  try {
    return Buffer.concat([d.update(paket.subarray(IV + TAG)), d.final()]);
  } catch {
    throw new TresorFehler('Entschlüsseln fehlgeschlagen – falscher Schlüssel, falscher Kontext oder veränderte Daten');
  }
}

/**
 * Tresor mit dem Hauptschlüssel aus der Umgebung. `weitere` nimmt ältere Hauptschlüssel auf
 * (Nummer → base64), damit nach einem Schlüsselwechsel alte Werte lesbar bleiben.
 */
export function tresor(env: NodeJS.ProcessEnv = process.env, weitere: Record<number, string> = {}): Tresor {
  const aktuell = schluesselAus(env);
  const alle = new Map<number, Buffer>([[aktuell.nummer, aktuell.schluessel]]);
  for (const [n, b64] of Object.entries(weitere)) alle.set(Number(n), Buffer.from(b64, 'base64'));

  const kopf = (nummer: number) => Buffer.from([FASSUNG, nummer]);

  return {
    verschluesseln(klartext, kontext) {
      const dek = randomBytes(DEK);
      const daten = typeof klartext === 'string' ? Buffer.from(klartext, 'utf8') : klartext;
      const umschlag = gcmVerschluesseln(aktuell.schluessel, dek, Buffer.concat([kopf(aktuell.nummer), Buffer.from(kontext)]));
      const inhalt = gcmVerschluesseln(dek, daten, Buffer.from(kontext));
      return Buffer.concat([kopf(aktuell.nummer), umschlag, inhalt]);
    },
    entschluesseln(geheim, kontext) {
      const b = Buffer.from(geheim);
      if (b.length < 2 + IV + TAG + DEK + IV + TAG) throw new TresorFehler('Verschlüsselter Wert ist unvollständig');
      if (b[0] !== FASSUNG) throw new TresorFehler(`Unbekannte Tresor-Fassung ${b[0]}`);
      const nummer = b[1]!;
      const haupt = alle.get(nummer);
      if (!haupt) throw new TresorFehler(`Hauptschlüssel Nr. ${nummer} ist nicht hinterlegt`);
      const umschlagEnde = 2 + IV + TAG + DEK;
      const dek = gcmEntschluesseln(haupt, b.subarray(2, umschlagEnde), Buffer.concat([kopf(nummer), Buffer.from(kontext)]));
      return gcmEntschluesseln(dek, b.subarray(umschlagEnde), Buffer.from(kontext));
    },
    entschluesselnText(geheim, kontext) {
      return geheim == null ? null : this.entschluesseln(geheim, kontext).toString('utf8');
    },
  };
}
