/** Grundlage der Erklärungen (A32): der Eintrag mit den fünf Fragen, die Standardantworten und zwei Helfer für Kacheln und Statuspunkte */
import type { Kachel } from '../cockpit.ts';

export interface HilfeEintrag {
  seite: string;
  titel: string;
  loest_aus: string;
  bezug: string;
  aendert: string;
  ergebnis: string;
  rueckweg: string;
}

export const NICHTS = 'Nichts – nur die Anzeige.';
export const KEIN_RUECKWEG = 'Nicht nötig; es wurde nichts verändert.';
export const AUSKUNFT = 'Nichts – eine Auskunft, keine Schaltfläche.';

export const statuspunkt = (titel: string, bezug: string, ergebnis: string): HilfeEintrag => ({
  seite: 'Status', titel, loest_aus: AUSKUNFT, bezug, aendert: NICHTS, ergebnis,
  rueckweg: 'Bei ✗: Christian Bescheid geben. Die Seite neu laden zeigt den aktuellen Stand.',
});

export const kachel = (bereich: string, k: Kachel): [string, HilfeEintrag] => [k.key, {
  seite: 'Cockpit', titel: `${bereich}: ${k.titel}`,
  loest_aus: k.href ? `Öffnet „${k.titel}“.` : `Noch nichts – ${k.spaeter}. Die Kachel zeigt, was hier entstehen wird.`,
  bezug: k.text, aendert: NICHTS,
  ergebnis: k.href ? `Die Seite „${k.titel}“.` : 'Bleibt grau, bis die Funktion gebaut ist; dann wird die Kachel anklickbar.',
  rueckweg: k.href ? 'Im Menü oder oben auf „Cockpit“ zurück.' : KEIN_RUECKWEG,
}];
