/**
 * Formulareingaben einheitlich lesen und prüfen (A32) – eine Stelle statt je Aktion ein eigener Ausdruck.
 * Was hier abgelehnt wird, kommt als KarteiFehler auf die Seite.
 */
import { KarteiFehler, type Kontaktart } from './patienten.ts';

/** Ganze Zahl aus dem Feld, sonst der Standard (Leerzeichen erlaubt) */
export const ganz = (s: string | null | undefined, standard = 0): number => (s && /^\d+$/.test(s.trim()) ? Number(s) : standard);

/**
 * Minuten, die auch leer bleiben dürfen: leer = null (automatisch bzw. Standard), ganze Zahl bis `max` = der Wert,
 * alles andere = -1, damit die Fachlogik es als ungültig ablehnt (Fahrtzeiten W113, Pause je Terminart W116)
 */
export function minutenOderLeer(wert: string | null | undefined, max = 240): number | null {
  const s = (wert ?? '').trim();
  return s === '' ? null : /^\d{1,3}$/.test(s) && Number(s) <= max ? Number(s) : -1;
}

/** Minuten als Pflichtangabe zwischen 0 und `max` – sonst KarteiFehler mit dem Namen des Felds */
export function minuten(wert: string | null | undefined, was: string, max = 240): string {
  const s = (wert ?? '').trim();
  if (!/^\d{1,3}$/.test(s) || Number(s) > max) throw new KarteiFehler(`${was}: 0 bis ${max} Minuten`);
  return s;
}

const ARTEN: Kontaktart[] = ['mobil', 'telefon', 'whatsapp', 'email', 'sonstige'];
/** Kontaktart aus dem Formular – Unbekanntes wird „sonstige“ */
export const kontaktart = (s: string | null | undefined): Kontaktart => (ARTEN.includes(s as Kontaktart) ? (s as Kontaktart) : 'sonstige');
