/**
 * Anzeige in deutscher Schreibweise – eine Stelle für Datum, Uhrzeit und Beträge. Vorher stand jede
 * dieser Funktionen in bis zu acht Seiten einzeln. Zeitpunkte kommen als ISO (UTC) oder als
 * Kalendertag „JJJJ-MM-TT“ (DATE-Spalten liefert pg als Text, siehe db/index.ts).
 */
import { ZONE } from './zeit.ts';

/** Ein Kalendertag wird als Mittag gelesen, damit er in keiner Zeitzone auf den Vortag rutscht */
const alsZeitpunkt = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);

/** "2026-10-26" oder "2026-10-26T07:00:00Z" → "26.10.2026"; ohne Wert der Platzhalter (Standard „–“) */
export function datumText(iso: string | null | undefined, leer = '–'): string {
  if (!iso) return leer;
  return new Intl.DateTimeFormat('de-DE', { timeZone: ZONE, day: '2-digit', month: '2-digit', year: 'numeric' }).format(alsZeitpunkt(iso));
}

/** Zeitpunkt → "09:00" in deutscher Zeit */
export const zeitText = (iso: string) => new Intl.DateTimeFormat('de-DE', { timeZone: ZONE, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/** "Mo., 26.10., 09:00" – mit `jahr` "Mo., 26.10.2026, 09:00", ohne `wochentag` "26.10.2026, 09:00" */
export function datumZeitText(iso: string, o: { wochentag?: boolean; jahr?: boolean } = {}): string {
  const tag = new Intl.DateTimeFormat('de-DE', {
    timeZone: ZONE, ...(o.wochentag === false ? {} : { weekday: 'short' }), day: '2-digit', month: '2-digit', ...(o.jahr ? { year: 'numeric' } : {}),
  }).format(new Date(iso));
  return `${tag}, ${zeitText(iso)}`;
}

/** 12.5 → "12,50 €"; ohne Wert „–“ */
export const euroText = (n: number | null | undefined) => (n === null || n === undefined ? '–' : n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }));

/** 12.5 → "12,50" – für Eingabefelder, CSV und PDF; ohne Wert leer */
export const preisText = (n: number | null | undefined) => (n === null || n === undefined ? '' : n.toFixed(2).replace('.', ','));
