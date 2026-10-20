/**
 * Kopfdaten einer Lieferantenrechnung aus PDF-Text und Betreff: Rechnungsnummer, Betrag, Datum.
 * Sie sind der Schlüssel, um eine Mail später dem Beleg in Lexware zuzuordnen (requirements N26).
 * Nur für Rechnungen von Lieferanten – nie für Patientenpost.
 */

export interface Kopfdaten {
  rechnungsnummer?: string;
  /** Bruttobetrag in Euro */
  betrag?: number;
  /** JJJJ-MM-TT */
  rechnungsdatum?: string;
}

const NUMMER = [
  /rechnungs?[\s-]*(?:nr|nummer|no)\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-/_.]{2,30})/i,
  /invoice\s*(?:no|number|#)\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-/_.]{2,30})/i,
  /beleg[\s-]*(?:nr|nummer)\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-/_.]{2,30})/i,
];
const BETRAG =
  /(?:gesamtbetrag|rechnungsbetrag|endbetrag|zu zahlen(?:der betrag)?|gesamtsumme|summe brutto|bruttobetrag|total)[^\d\n]{0,30}?(\d{1,3}(?:[.\s]\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})/i;
const DATUM = /(?:rechnungsdatum|rechnungs-datum|datum der rechnung|invoice date|belegdatum)\s*[:.]?\s*(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{2,4})/i;

/** Für den Vergleich mit Lexware: Großbuchstaben, ohne Leerraum */
export const normiereNummer = (n: string): string => n.toUpperCase().replace(/\s+/g, '').replace(/[.]+$/, '');

function betragAlsZahl(s: string): number {
  // "1.234,56" / "1 234,56" / "49,95" / "49.95"
  const deutsch = /,\d{2}$/.test(s);
  const roh = deutsch ? s.replace(/[.\s]/g, '').replace(',', '.') : s;
  return Math.round(Number(roh) * 100) / 100;
}

export function kopfdaten(text: string, betreff = ''): Kopfdaten {
  const k: Kopfdaten = {};
  for (const quelle of [text, betreff]) {
    for (const m of NUMMER) {
      const treffer = m.exec(quelle);
      // Eine "Nummer" ohne Ziffer ist meist ein Wort ("Rechnungsnummer: siehe oben")
      if (treffer && /\d/.test(treffer[1]!)) {
        k.rechnungsnummer = normiereNummer(treffer[1]!);
        break;
      }
    }
    if (k.rechnungsnummer) break;
  }
  const b = BETRAG.exec(text);
  if (b) {
    const wert = betragAlsZahl(b[1]!);
    if (Number.isFinite(wert) && wert > 0) k.betrag = wert;
  }
  const d = DATUM.exec(text);
  if (d) {
    const jahr = Number(d[3]) < 100 ? 2000 + Number(d[3]) : Number(d[3]);
    const iso = `${jahr}-${String(d[2]).padStart(2, '0')}-${String(d[1]).padStart(2, '0')}`;
    if (!Number.isNaN(Date.parse(iso)) && jahr >= 2000) k.rechnungsdatum = iso;
  }
  return k;
}
