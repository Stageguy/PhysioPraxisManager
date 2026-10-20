/**
 * Ist dieser PDF-Anhang eine Lieferantenrechnung? Regelbasiert, ohne Sprachmodell (Prompt 4).
 *
 * Grundsatz: nicht raten. Eine Rechnung ist nur, was von einem bekannten Lieferanten kommt und
 * nach Rechnung aussieht. Alles, was nach Rechnung aussieht, aber von einem unbekannten Absender
 * kommt, ist „unklar“ – Lilli schaut es an und kann den Lieferanten aufnehmen.
 * Post mit Patientenbezug wird nie verarbeitet (Leitplanke 9).
 */

export type Klasse = 'rechnung' | 'unklar' | 'keine_rechnung' | 'patient';

export interface Lieferant {
  /** Wie er im Dateinamen steht, z. B. "Telekom" */
  name: string;
  /** Absenderdomains; Subdomains zählen mit ("rechnung.telekom.de" passt zu "telekom.de") */
  domains: string[];
}

const MERKMALE: Record<string, RegExp> = {
  titel: /\b(rechnung|invoice)\b/i,
  nummer: /\b(rechnungs?[\s-]*(nr|nummer|no)|invoice\s*(no|number|#))\b/i,
  steuer: /\b(ust|mwst|umsatzsteuer|ust[\s-]*id(nr)?|steuer[\s-]*nr|steuernummer|vat)\b/i,
  iban: /\b[A-Z]{2}\d{2}(?:\s?[0-9A-Z]{4}){3,7}(?:\s?[0-9A-Z]{1,4})?\b/,
  betrag: /\b(gesamt(betrag)?|summe|rechnungsbetrag|endbetrag|total|zu zahlen)\b[^\n]{0,40}?\d+[.,]\d{2}/i,
};

/**
 * Wörter, die auf Patientenpost deuten. Gelernt aus der Zählung vom 20.10.2026 (requirements N25):
 * - stark: eines genügt (Diagnose, Befund, Heilmittelverordnung …)
 * - schwach: kommen auch auf Lieferantenrechnungen vor („Verordnung (EU) …“, „Krankenkasse“) –
 *   im PDF-Text zählen sie erst zu zweit
 * - „Überweisung“ heißt im PDF-Text fast immer „zahlbar per Überweisung“ – zählt nur im Betreff
 */
/** Ein ganzes Wort – auch mit Umlauten am Rand (\\b in JavaScript kennt nur ASCII) */
const wort = (muster: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${muster})(?![\\p{L}\\p{N}])`, 'iu');

const PATIENT_WOERTER: Record<string, RegExp> = {
  diagnose: wort('diagnose'),
  icd: wort('icd[\\s-]?10'),
  befund: wort('befund(?:bericht)?'),
  arztbrief: wort('arztbrief'),
  heilmittelverordnung: wort('heilmittelverordnung'),
  therapiebericht: wort('therapiebericht'),
  anamnese: wort('anamnese'),
  versichertennummer: wort('versichertennummer'),
  ueberweisungsschein: wort('(?:ü|ue)berweisungsschein'),
  attest: wort('attest'),
  rezept: wort('rezept'),
  krankenkasse: wort('krankenkasse'),
  verordnung: wort('verordnung'),
  ueberweisung: wort('(?:ü|ue)berweisung'),
};
const SCHWACH = new Set(['rezept', 'krankenkasse', 'verordnung']);
const NUR_BETREFF = new Set(['ueberweisung']);

/** Welche Patientenwörter der Text trägt – nur die Namen, kein Text */
export function patientMerkmale(text: string): string[] {
  return Object.entries(PATIENT_WOERTER)
    .filter(([, m]) => m.test(text))
    .map(([name]) => name);
}

/** PDF-Text mit Patientenbezug: ein starkes Wort oder zwei schwache */
export function textMitPatientenbezug(text: string): boolean {
  const w = patientMerkmale(text).filter((x) => !NUR_BETREFF.has(x));
  return w.some((x) => !SCHWACH.has(x)) || w.filter((x) => SCHWACH.has(x)).length >= 2;
}

export function domainVon(adresse: string): string {
  const a = adresse.trim().toLowerCase();
  return a.slice(a.lastIndexOf('@') + 1);
}

export function lieferantZu(domain: string, lieferanten: Lieferant[]): Lieferant | undefined {
  const d = domain.toLowerCase();
  return lieferanten.find((l) => l.domains.some((x) => d === x.toLowerCase() || d.endsWith(`.${x.toLowerCase()}`)));
}

/** Welche Rechnungsmerkmale der Text trägt – nur Namen der Merkmale, kein Text */
export function merkmale(text: string): string[] {
  return Object.entries(MERKMALE)
    .filter(([, muster]) => muster.test(text))
    .map(([name]) => name);
}

/** Deutet der Betreff einer Mail auf Patientenpost? Hier genügt jedes Wort – Betreffs sind kurz. */
export function betreffMitPatientenbezug(betreff: string): boolean {
  return patientMerkmale(betreff).length > 0;
}

export function klassifiziere(eingabe: {
  bekannterLieferant: boolean;
  betreff: string;
  /** Text des PDFs; leer, wenn es keinen Text trägt (Scan, Foto) */
  text: string;
}): { klasse: Klasse; merkmale: string[] } {
  const gefunden = merkmale(eingabe.text);
  if (eingabe.bekannterLieferant) {
    // Ein Lieferant schickt auch AGB, Lieferscheine, Werbung – ohne Merkmal schaut Lilli es an
    return { klasse: gefunden.length >= 1 ? 'rechnung' : 'unklar', merkmale: gefunden };
  }
  if (betreffMitPatientenbezug(eingabe.betreff) || textMitPatientenbezug(eingabe.text)) return { klasse: 'patient', merkmale: gefunden };
  // Ein Scan ohne Text von einem Unbekannten kann ein Rezeptfoto sein – nie liegen lassen, nie ablegen
  if (!eingabe.text.trim()) return { klasse: 'unklar', merkmale: gefunden };
  return { klasse: gefunden.length >= 2 ? 'unklar' : 'keine_rechnung', merkmale: gefunden };
}

/** Unzulässige Zeichen für OneDrive ersetzen, Leerraum zusammenziehen */
export function sichererName(name: string): string {
  return (
    name
      .replace(/["*:<>?/\\|\u0000-\u001f]/g, '_')
      .replace(/\s+/g, ' ')
      .replace(/[. ]+$/, '')
      .trim() || 'unbekannt'
  );
}

/** "2026-10-20", "Telekom", "3fa9…" → "2026-10-20_Telekom_3fa91c2e.pdf" */
export function ablageName(datum: string, lieferant: string, sha256: string): string {
  return `${datum}_${sichererName(lieferant).replace(/ /g, '-')}_${sha256.slice(0, 8)}.pdf`;
}

/** Ein Name für einen unbekannten Absender aus seiner Domain: "rechnung.beispiel-gmbh.de" → "beispiel-gmbh" */
export function nameAusDomain(domain: string): string {
  const teile = domain.split('.').filter(Boolean);
  return teile.length >= 2 ? teile[teile.length - 2]! : domain || 'unbekannt';
}
