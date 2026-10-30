/**
 * Alle Aktionen aus Formularen in einer Tabelle (A32). Aktionen ohne Patient (Konfiguration, Patient anlegen,
 * Sammelübernahme aus Lexware) laufen zuerst; alles andere braucht eine gültige Patientennummer.
 */
import { istId } from '../../db/werte.ts';
import { dublettenPaare, KarteiFehler } from '../patienten.ts';
import { AKTE } from './akte.ts';
import { KONFIGURATION } from './konfiguration.ts';
import type { Aktionen, AktionKontext, Ergebnis } from './kontext.ts';
import { LEXWARE, LEXWARE_OHNE_PATIENT } from './lexware.ts';
import { NACHRICHTEN } from './nachrichten.ts';
import { DUBLETTEN, PATIENT, PATIENT_ANLEGEN } from './patienten.ts';
import { RECHNUNGEN } from './rechnungen.ts';
import { TERMINE } from './termine.ts';

export const OHNE_PATIENT: Aktionen = { ...PATIENT_ANLEGEN, ...KONFIGURATION, ...LEXWARE_OHNE_PATIENT };
export const MIT_PATIENT: Aktionen = { ...AKTE, ...PATIENT, ...DUBLETTEN, ...TERMINE, ...RECHNUNGEN, ...NACHRICHTEN, ...LEXWARE };

/**
 * Solange ein Patient eine ungeklärte mögliche Dublette hat (W119), legt die Kartei nichts Neues an seine Akte:
 * keine Termine, Behandlungen, Rezepte, Rechnungen, keinen neuen Lexware-Kunden, keine Rechnungen aus Lexware –
 * das müsste sonst später mit umziehen. Stammdaten (auch Lexware-Zuordnung und Feldübernahme), Kontaktwege,
 * Adressen, Verlauf, Nachrichten, Archiv und die Klärung selbst gehen weiter.
 */
const TROTZ_DUBLETTE = new Set([
  ...Object.keys(PATIENT), ...Object.keys(DUBLETTEN), ...Object.keys(NACHRICHTEN), 'lexware_zuordnen', 'lexware_uebernehmen', 'lexware_loesen',
]);

export async function aktionAusfuehren(k: AktionKontext): Promise<Ergebnis> {
  const aktion = k.f.get('aktion') ?? '';
  const ohne = Object.hasOwn(OHNE_PATIENT, aktion) ? OHNE_PATIENT[aktion] : undefined;
  if (ohne) return ohne(k);
  if (!istId(k.id)) throw new KarteiFehler('Unbekannter Patient');
  const mit = Object.hasOwn(MIT_PATIENT, aktion) ? MIT_PATIENT[aktion] : undefined;
  if (!mit) throw new KarteiFehler('Unbekannte Aktion');
  if (!TROTZ_DUBLETTE.has(aktion) && (await dublettenPaare(k.db, { patientId: k.id })).length) {
    throw new KarteiFehler('Erst klären, ob es diesen Patienten schon gibt – über das Dubletten-Symbol oben links an der Kachel (W119)');
  }
  return mit(k);
}

export type { Aktion, Aktionen, AktionKontext, DienstQuellen, Ergebnis } from './kontext.ts';
