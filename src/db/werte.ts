/**
 * Werte aus Datenbankzeilen in die Typen des Codes. pg liefert numeric als Text, DATE als
 * „JJJJ-MM-TT“ (Typ-Parser in index.ts), timestamptz als Date; PGlite in den Prüfungen teils anders –
 * diese Wandler gleichen das aus und standen vorher in jeder Kartei-Datei einzeln.
 */

/** Kalendertag „JJJJ-MM-TT“ – aus Text oder Date */
export const tag = (v: unknown): string | null => (v === null || v === undefined ? null : typeof v === 'string' ? v.slice(0, 10) : new Date(v as Date).toISOString().slice(0, 10));

/** Zeitpunkt als ISO (UTC) */
export const iso = (v: unknown): string | null => (v === null || v === undefined ? null : new Date(v as string).toISOString());

/** Zahl oder null */
export const zahl = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** Betrag – fehlt er, 0 */
export const betrag = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

/** Getrimmter Text; leer wird null */
export const text = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v).trim() || null);

/** Auf Cent runden */
export const rund = (n: number): number => Math.round(n * 100) / 100;

/** Kennung aus Adresse oder Formular: nur Ziffern */
export const istId = (s: string): boolean => /^\d+$/.test(s);
