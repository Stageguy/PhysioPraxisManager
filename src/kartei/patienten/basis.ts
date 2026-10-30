/**
 * Grundlage der Patientenkartei (A32): der Fehler für die Oberfläche, die Datentypen der Kartei, Normierung der
 * Kontaktwege und zwei Helfer, die alle Teile brauchen. Alles mit Gesundheitsbezug geht durch den Tresor.
 */
import { telefonNormieren } from '../../telefon.ts';
import type { Tresor } from '../../tresor.ts';
import type { AdresseTyp, Behandlungsort } from '../hausbesuche.ts';

export class KarteiFehler extends Error {}

/** Rechnungen: ab Fälligkeit gelb, ab so vielen Tagen danach (oder nach Mahnung) rot – E25 */
export const VERZUG_ROT_TAGE = 14;

export type Kontaktart = 'mobil' | 'telefon' | 'whatsapp' | 'email' | 'sonstige';
export type Rechnungsstand = 'ok' | 'gelb' | 'rot';

export interface Kontakt {
  id: string;
  art: Kontaktart;
  wert: string;
  normiert: string;
  bezeichnung: string | null;
  primaer: boolean;
}

export interface Adresse {
  id: string;
  bezeichnung: string | null;
  zusatz: string | null;
  strasse: string | null;
  hausnummer: string | null;
  plz: string | null;
  ort: string | null;
  land: string;
  rechnungsadresse: boolean;
  /** Rechnungs-/Wohnadresse, Hausbesuchadresse oder Vormund/Betreuer (W113) */
  typ: AdresseTyp;
}

export interface Bezugsperson {
  id: string;
  rolle: string;
  name: string;
  beziehung: string | null;
  berechtigungsgrund: string | null;
  telefon: string | null;
  email: string | null;
}

export interface Versicherung {
  id: string;
  art: string;
  versicherer: string | null;
  tarif: string | null;
  erstattungssatz: number | null;
}

/** Was die Kachel zeigt (W64) */
export interface PatientKurz {
  id: string;
  patientennummer: string;
  status: 'aktiv' | 'inaktiv' | 'archiviert';
  anrede: string | null;
  titel: string | null;
  vorname: string;
  nachname: string;
  patientSeit: string;
  ansprache: string | null;
  besonderheiten: string | null;
  telefon: Kontakt | null;
  whatsapp: Kontakt | null;
  email: Kontakt | null;
  letzteBehandlung: { id: string; datum: string; fallId: string } | null;
  naechsterTermin: { id: string; beginn: string; rezept: boolean } | null;
  rechnungsstand: Rechnungsstand;
  offeneAnrufe: number;
}

export interface Patient extends PatientKurz {
  geburtsdatum: string | null;
  geburtsname: string | null;
  sprache: string | null;
  kommunikationshilfe: string | null;
  berufBelastung: string | null;
  notiz: string | null;
  abrechnungsmodus: string;
  zwischenrechnungQuartale: number | null;
  exchangeKontaktId: string | null;
  lexwareKundennummer: string | null;
  /** Ausdrücklich zugeordnete Preisliste; null = Standard */
  preisliste: { id: string; name: string } | null;
  /** Die Preisliste, die tatsächlich gilt (eigene, falls aktiv – sonst Standard), W97 */
  preislisteGilt: { id: string; name: string; standard: boolean } | null;
  rechnungsversand: 'email' | 'post' | 'beides';
  kontakte: Kontakt[];
  adressen: Adresse[];
  bezugspersonen: Bezugsperson[];
  versicherungen: Versicherung[];
}

export interface VerlaufEintrag {
  id: string;
  art: string;
  am: string;
  grund: { code: string; bezeichnung: string } | null;
  notiz: string | null;
  offen: boolean;
  kontakt: { art: Kontaktart; wert: string } | null;
  erfasstVon: string;
  /** Verweis nach außen, z. B. der Mail-Entwurf in Outlook Web (W91) */
  link: string | null;
}

export interface Gespraechsgrund {
  code: string;
  bezeichnung: string;
}

export interface TerminKurz {
  id: string;
  beginn: string;
  ende: string;
  art: string;
  status: string;
  verordnungId: string | null;
  /** im Exchange-Kalender gespiegelt (W77) */
  imKalender: boolean;
  /** Praxis oder Hausbesuch (W113) – beim Hausbesuch der Ort der Adresse */
  behandlungsort: Behandlungsort;
  ort: string | null;
}

export type VerordnungArt = 'erst' | 'folge_unveraendert' | 'folge_angepasst' | 'wiederaufnahme' | 'korrektur';
export const VERORDNUNG_ARTEN: Record<VerordnungArt, string> = {
  erst: 'Erstrezept', folge_unveraendert: 'Folgerezept – unverändert', folge_angepasst: 'Folgerezept – angepasst', wiederaufnahme: 'Erneute Verordnung (Wiederaufnahme)', korrektur: 'Korrektur',
};

export interface VerordnungKurz {
  id: string;
  patientId: string;
  patientName: string;
  art: VerordnungArt;
  langzeit: boolean;
  ausgestelltAm: string;
  gueltigBis: string | null;
  massnahme: string;
  leistungNummer: string | null;
  frequenz: string | null;
  anzahlVerordnet: number;
  /** Haken über die ganze Kette (Original + Korrekturen) */
  abgehakt: number;
  /** Behandlungen auf diesem Rezept, die der Patient bestätigt hat (W107a) */
  bestaetigt: number;
  /** Kommende Termine auf diesem Rezept (bestätigt oder vorgeschlagen), W110 */
  geplant: number;
  status: string;
  arzt: string | null;
  fallId: string | null;
  fallNummer: number | null;
  vorgaengerId: string | null;
  zweitschriftAm: string | null;
  notiz: string | null;
}

/** Behandlungsserie ohne Rezept: Direktzugang oder Wellness – als Kachel neben den Rezepten (W73) */
export interface Serie {
  id: string;
  patientId: string;
  patientName: string;
  nummer: number;
  grundlage: 'direktzugang' | 'praevention';
  bezeichnung: string | null;
  wellness: { id: string; bezeichnung: string; preis: number } | null;
  begonnenAm: string | null;
  abgeschlossenAm: string | null;
  behandlungen: number;
  letzteAm: string | null;
}

export interface WellnessLeistung {
  id: string;
  code: string;
  bezeichnung: string;
  dauerMin: number | null;
  preis: number;
  aktiv: boolean;
}

export interface RechnungKurz {
  id: string;
  art: string;
  steuerklasse: string;
  datum: string | null;
  faelligAm: string | null;
  nummer: string | null;
  betrag: number | null;
  status: string;
  statusText: string;
  statusFarbe: string;
  gemahnt: boolean;
  positionen: number;
  versandArt: string | null;
  lexwareAbweichung: string | null;
  /** ppm = hier entstanden; lexware = aus Lexware übernommen (W103) */
  quelle: 'ppm' | 'lexware';
  bezahltAm: string | null;
  storniertAm: string | null;
  /** Dateiname der Rechnung aus Lexware */
  dateiName: string | null;
  /** Status, wie Lexware ihn zuletzt gemeldet hat (open, paid, voided …) */
  lexwareStatus: string | null;
  lexwareInvoiceId: string | null;
  /** Zahlungsposten aus Lexware (A29) */
  zahlungen: { datum: string | null; betrag: number; art: string }[];
  pdf: boolean;
}

export interface Behandlung {
  id: string;
  datum: string;
  dauerMin: number | null;
  behandeltVon: string;
  status: string;
  massnahmen: string | null;
  verlaufWirkung: string | null;
  reaktionen: string | null;
  uebungen: string | null;
  leistungen: { nummer: string; bezeichnung: string; anzahl: number; einzelpreis: number; verordnungId: string | null }[];
  /** Bestätigung durch den Patienten (W107a) – Unterschrift am Bildschirm, auf Papier oder mündlich */
  bestaetigung: { art: 'unterschrift' | 'papier' | 'muendlich'; zeitpunkt: string; werName: string | null; bild: boolean } | null;
}

export const BESTAETIGUNG_TEXT: Record<'unterschrift' | 'papier' | 'muendlich', string> = { unterschrift: 'Unterschrift am Bildschirm', papier: 'auf Papier unterschrieben', muendlich: 'mündlich bestätigt' };

export interface Fall {
  id: string;
  nummer: number;
  grundlage: string;
  phase: string;
  steuerklasse: string;
  bezeichnung: string | null;
  anlass: string | null;
  diagnoseArzt: string | null;
  begonnenAm: string | null;
  abgeschlossenAm: string | null;
  behandlungen: Behandlung[];
}

// ── Normierung der Kontaktwege ───────────────────────────────────────────────

export { telefonNormieren };

export function kontaktNormieren(art: Kontaktart, wert: string): string {
  const w = wert.trim();
  if (art === 'email') return w.toLowerCase();
  if (art === 'sonstige') return w;
  return telefonNormieren(w);
}

export function kontaktPruefen(art: Kontaktart, wert: string): void {
  const w = wert.trim();
  if (!w) throw new KarteiFehler('Der Kontakt ist leer');
  if (art === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(w)) throw new KarteiFehler(`„${w}“ ist keine Mailadresse`);
  if ((art === 'mobil' || art === 'telefon' || art === 'whatsapp') && !/^\+?[\d\s/().-]{5,}$/.test(w)) throw new KarteiFehler(`„${w}“ ist keine Telefonnummer`);
}

export const datumPruefen = (d: string | undefined, was: string): string | null => {
  const v = (d ?? '').trim();
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T12:00:00Z`))) throw new KarteiFehler(`${was}: bitte ein gültiges Datum (JJJJ-MM-TT)`);
  return v;
};

/** Verschlüsselt im Tresor, leer bleibt NULL – Kontext ist der Spaltenname */
export const geheim = (t: Tresor, wert: string | undefined, kontext: string) => (wert?.trim() ? t.verschluesseln(wert.trim(), kontext) : null);
