/**
 * Anzeige in deutscher Schreibweise – eine Stelle für Datum, Uhrzeit und Beträge. Vorher stand jede
 * dieser Funktionen in bis zu acht Seiten einzeln. Zeitpunkte kommen als ISO (UTC) oder als
 * Kalendertag „JJJJ-MM-TT“ (DATE-Spalten liefert pg als Text, siehe db/index.ts).
 */
import { ZONE } from './zeit.ts';

/** Ein Kalendertag wird als Mittag gelesen, damit er in keiner Zeitzone auf den Vortag rutscht */
const alsZeitpunkt = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);

// Formatierer einmal anlegen – jedes `new Intl.DateTimeFormat` kostet nativen Speicher (ICU), Seiten rufen sie hundertfach
const DATUM = new Intl.DateTimeFormat('de-DE', { timeZone: ZONE, day: '2-digit', month: '2-digit', year: 'numeric' });
const ZEIT = new Intl.DateTimeFormat('de-DE', { timeZone: ZONE, hour: '2-digit', minute: '2-digit' });
const DATUM_ZEIT = new Map<string, Intl.DateTimeFormat>();
const EURO = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

/** "2026-10-26" oder "2026-10-26T07:00:00Z" → "26.10.2026"; ohne Wert der Platzhalter (Standard „–“) */
export function datumText(iso: string | null | undefined, leer = '–'): string {
  if (!iso) return leer;
  return DATUM.format(alsZeitpunkt(iso));
}

/** Zeitpunkt → "09:00" in deutscher Zeit */
export const zeitText = (iso: string) => ZEIT.format(new Date(iso));

/** "Mo., 26.10., 09:00" – mit `jahr` "Mo., 26.10.2026, 09:00", ohne `wochentag` "26.10.2026, 09:00" */
export function datumZeitText(iso: string, o: { wochentag?: boolean; jahr?: boolean } = {}): string {
  const schluessel = `${o.wochentag !== false}/${Boolean(o.jahr)}`;
  let f = DATUM_ZEIT.get(schluessel);
  if (!f) {
    f = new Intl.DateTimeFormat('de-DE', { timeZone: ZONE, ...(o.wochentag === false ? {} : { weekday: 'short' }), day: '2-digit', month: '2-digit', ...(o.jahr ? { year: 'numeric' } : {}) });
    DATUM_ZEIT.set(schluessel, f);
  }
  return `${f.format(new Date(iso))}, ${zeitText(iso)}`;
}

/** 12.5 → "12,50 €"; ohne Wert „–“ */
export const euroText = (n: number | null | undefined) => (n === null || n === undefined ? '–' : EURO.format(n));

/** 12.5 → "12,50" – für Eingabefelder, CSV und PDF; ohne Wert leer */
export const preisText = (n: number | null | undefined) => (n === null || n === undefined ? '' : n.toFixed(2).replace('.', ','));
