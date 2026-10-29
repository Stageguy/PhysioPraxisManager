/**
 * Alle Aktionen aus Formularen in einer Tabelle (A32). Aktionen ohne Patient (Konfiguration, Patient anlegen,
 * Sammelübernahme aus Lexware) laufen zuerst; alles andere braucht eine gültige Patientennummer.
 */
import { istId } from '../../db/werte.ts';
import { KarteiFehler } from '../patienten.ts';
import { AKTE } from './akte.ts';
import { KONFIGURATION } from './konfiguration.ts';
import type { Aktionen, AktionKontext, Ergebnis } from './kontext.ts';
import { LEXWARE, LEXWARE_OHNE_PATIENT } from './lexware.ts';
import { NACHRICHTEN } from './nachrichten.ts';
import { PATIENT, PATIENT_ANLEGEN } from './patienten.ts';
import { RECHNUNGEN } from './rechnungen.ts';
import { TERMINE } from './termine.ts';

export const OHNE_PATIENT: Aktionen = { ...PATIENT_ANLEGEN, ...KONFIGURATION, ...LEXWARE_OHNE_PATIENT };
export const MIT_PATIENT: Aktionen = { ...AKTE, ...PATIENT, ...TERMINE, ...RECHNUNGEN, ...NACHRICHTEN, ...LEXWARE };

export async function aktionAusfuehren(k: AktionKontext): Promise<Ergebnis> {
  const aktion = k.f.get('aktion') ?? '';
  const ohne = Object.hasOwn(OHNE_PATIENT, aktion) ? OHNE_PATIENT[aktion] : undefined;
  if (ohne) return ohne(k);
  if (!istId(k.id)) throw new KarteiFehler('Unbekannter Patient');
  const mit = Object.hasOwn(MIT_PATIENT, aktion) ? MIT_PATIENT[aktion] : undefined;
  if (!mit) throw new KarteiFehler('Unbekannte Aktion');
  return mit(k);
}

export type { Aktion, Aktionen, AktionKontext, DienstQuellen, Ergebnis } from './kontext.ts';
