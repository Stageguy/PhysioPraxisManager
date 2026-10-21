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
  /** Nur gesetzt, wenn netto + ust = betrag (auf den Cent) */
  netto?: number;
  ust?: number;
  /** "19 %", "7 %", "7 % + 19 %", "0 % (steuerfrei)", "19 % (errechnet)" */
  ustSatz?: string;
}

const NUMMER = [
  /rechnungs?[\s-]*(?:nr|nummer|no)\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-/_.]{2,30})/i,
  /invoice\s*(?:no|number|#)\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-/_.]{2,30})/i,
  /beleg[\s-]*(?:nr|nummer)\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-/_.]{2,30})/i,
];
const BETRAG =
  /(?:gesamtbetrag|rechnungsbetrag|endbetrag|zu zahlen(?:der betrag)?|gesamtsumme|summe brutto|bruttobetrag|total)[^\d\n]{0,30}?(\d{1,3}(?:[.\s]\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})/i;
const DATUM = /(?:rechnungsdatum|rechnungs-datum|datum der rechnung|invoice date|belegdatum)\s*[:.]?\s*(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{2,4})/i;

const ZAHL = String.raw`(\d{1,3}(?:[.\s]\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})`;
const NETTO = new RegExp(String.raw`(?:nettobetrag|netto[\s-]*summe|summe[\s-]*netto|gesamt[\s-]*netto|zwischensumme(?:[\s-]*netto)?|warenwert[\s-]*netto|rechnungsbetrag[\s-]*netto|betrag[\s-]*netto|netto)[^\d\n%]{0,30}?${ZAHL}`, 'i');
// "19 % MwSt 7,98" · "MwSt. 19% 7,98" · "Umsatzsteuer (7 %): 3,50"
const STEUER = new RegExp(String.raw`(?:(\d{1,2}(?:[.,]\d+)?)\s?%\s*(?:mwst|ust|umsatzsteuer|mehrwertsteuer)|(?:mwst|ust|umsatzsteuer|mehrwertsteuer)\.?[^\d\n]{0,15}?(\d{1,2}(?:[.,]\d+)?)\s?%)[^\d\n]{0,30}?${ZAHL}`, 'gi');
/** Ein Steuersatz neben einem Steuerwort, ohne Betrag: „inkl. 19 % MwSt“, „MwSt-Satz 7%“ */
const SATZ_ALLEIN = /(?:(\d{1,2}(?:[.,]\d+)?)\s?%\s*(?:mwst|ust|umsatzsteuer|mehrwertsteuer)|(?:mwst|ust|umsatzsteuer|mehrwertsteuer)[^\d\n]{0,15}?(\d{1,2}(?:[.,]\d+)?)\s?%)/gi;
const STEUERFREI = /steuerfrei|umsatzsteuerbefreit|§\s?4\s?nr|§\s?19\s?ustg|kleinunternehmer/i;

const cent = (n: number) => Math.round(n * 100);

/** Netto, Steuer und Satz – nur wenn sie zum Brutto passen; sonst nichts (lieber leer als falsch) */
export function nettoUndSteuer(text: string, brutto: number | undefined): Pick<Kopfdaten, 'netto' | 'ust' | 'ustSatz'> {
  if (brutto === undefined) return {};
  const posten = [...text.matchAll(STEUER)].map((m) => ({ satz: Number((m[1] ?? m[2])!.replace(',', '.')), betrag: betragAlsZahl(m[3]!) }))
    // Steuersätze in Deutschland und den Nachbarländern; alles andere ist eher eine Fundstelle wie „100 %“
    .filter((p) => p.satz > 0 && p.satz <= 27 && p.betrag < brutto);
  // Dieselbe Zeile steht oft zweimal (Übersicht und Summenblock) – je Satz und Betrag nur einmal
  const eindeutig = [...new Map(posten.map((p) => [`${p.satz}|${p.betrag}`, p])).values()];
  const ust = eindeutig.reduce((s, p) => s + p.betrag, 0);
  const sätze = [...new Set(eindeutig.map((p) => p.satz))].sort((a, b) => a - b);
  const n = NETTO.exec(text);
  const netto = n ? betragAlsZahl(n[1]!) : undefined;
  const satzText = sätze.map((x) => `${String(x).replace('.', ',')} %`).join(' + ');

  if (netto !== undefined && eindeutig.length && cent(netto) + cent(ust) === cent(brutto)) return { netto, ust, ustSatz: satzText };
  if (netto === undefined && sätze.length === 1 && eindeutig.length === 1) {
    const satz = sätze[0]! / 100;
    const zahl = eindeutig[0]!.betrag;
    // Die Zahl hinter dem Satz ist die Steuer …
    const nettoAusSteuer = (cent(brutto) - cent(zahl)) / 100;
    if (Math.abs(nettoAusSteuer * satz - zahl) <= 0.02) return { netto: nettoAusSteuer, ust: zahl, ustSatz: satzText };
    // … oder die Bemessungsgrundlage („19 % auf 41,97“)
    const steuerAusNetto = (cent(brutto) - cent(zahl)) / 100;
    if (Math.abs(zahl * satz - steuerAusNetto) <= 0.02) return { netto: zahl, ust: steuerAusNetto, ustSatz: satzText };
  }
  // Nur „inkl. 19 % MwSt“ ohne Betrag: aus dem Brutto errechnen – aber nur, wenn genau ein Satz genannt ist
  if (!eindeutig.length) {
    const nur = [...new Set([...text.matchAll(SATZ_ALLEIN)].map((m) => Number((m[1] ?? m[2])!.replace(',', '.'))))].filter((x) => x === 19 || x === 7);
    if (nur.length === 1) {
      const n = Math.round((brutto / (1 + nur[0]! / 100)) * 100) / 100;
      return { netto: n, ust: (cent(brutto) - cent(n)) / 100, ustSatz: `${nur[0]} % (errechnet)` };
    }
  }
  if (!eindeutig.length && STEUERFREI.test(text) && (netto === undefined || cent(netto) === cent(brutto))) {
    return { netto: brutto, ust: 0, ustSatz: '0 % (steuerfrei)' };
  }
  return {};
}

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
  Object.assign(k, nettoUndSteuer(text, k.betrag));
  const d = DATUM.exec(text);
  if (d) {
    const jahr = Number(d[3]) < 100 ? 2000 + Number(d[3]) : Number(d[3]);
    const iso = `${jahr}-${String(d[2]).padStart(2, '0')}-${String(d[1]).padStart(2, '0')}`;
    if (!Number.isNaN(Date.parse(iso)) && jahr >= 2000) k.rechnungsdatum = iso;
  }
  return k;
}
