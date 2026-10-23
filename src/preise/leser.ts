/**
 * Leser für die Preisgrundlagen (W59) – reine Funktionen, ohne Netz:
 * - GKV-Vergütungsliste Physiotherapie (Anlage 2 zum Vertrag nach § 125 SGB V, PDF-Text)
 * - Beihilfe-Höchstbeträge (Anlage 9 BBhV, HTML von gesetze-im-internet.de)
 * - GebüTh: erschienene Auflage aus der Produktseite des Herausgebers
 */

export interface QuellPosition {
  nummer: string;
  code?: string;
  kuerzel?: string;
  gruppe?: string;
  bezeichnung: string;
  regelzeit?: string;
  preis?: number;
  zuzahlung?: number;
  hinweise?: string;
  daten: Record<string, unknown>;
}

const zahl = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));
const leer = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Gruppe nach den ersten Ziffern der Positionsnummer (Heilmittelpositionsnummern) */
export function gruppeVon(code: string): string {
  const n = Number(code.slice(1, 3));
  if (code.startsWith('21')) return 'Außerhalb der Heilmittelerbringung';
  if (n === 1) return 'Massagen';
  if (n === 2) return 'Manuelle Lymphdrainage';
  if (n === 3 || n === 4) return 'Übungsbehandlung';
  if (n >= 5 && n <= 11) return 'Krankengymnastik';
  if (n === 12) return 'Manuelle Therapie';
  if (n === 13) return 'Elektrotherapie';
  if (n === 15) return 'Wärme- und Kältetherapie';
  if (n === 17) return 'Bäder';
  if (n === 18) return 'Inhalation';
  if (n === 19) return 'Berichte';
  if (n === 20) return 'Standardisierte Heilmittelkombination';
  if (n === 97 || n === 99) return 'Hausbesuche, Gebühren';
  return 'Sonstige';
}

/** Kürzel: Klammer im Text („(KG)“, „(BGM)“) oder bekannte Bezeichnung */
export function kuerzelVon(bezeichnung: string): string | undefined {
  const k = /\(((?:KG|KMT|BGM|MT|MLD|KG-[A-Za-zÄÖÜäöü-]+|[A-Z]{2,4}))\)/.exec(bezeichnung)?.[1];
  if (k) return k;
  const t = bezeichnung.toLowerCase();
  const regeln: [RegExp, string][] = [
    [/lymphdrainage.*30 minuten/, 'MLD-30'], [/lymphdrainage.*45 minuten/, 'MLD-45'], [/lymphdrainage.*60 minuten/, 'MLD-60'],
    [/manuelle therapie/, 'MT'], [/kg-muko/, 'KG-Muko'], [/kg-gerät/, 'KG-Gerät'], [/kompressionsbandagierung/, 'KOMP'],
    [/unterwasserdruckstrahl/, 'UWM'], [/elektrotherapie/, 'ET'], [/elektrostimulation/, 'ES'], [/warmpackung/, 'WP'],
    [/heißluft/, 'HL'], [/heiße rolle/, 'HR'], [/ultraschall/, 'US'], [/kältetherapie/, 'KT'], [/hausbesuch/, 'HB'],
    [/traktion/, 'TR'], [/inhalation/, 'INH'], [/bericht/, 'BER'], [/übermittlungsgebühr/, 'MIT'], [/d1 einzelbehandlung/, 'D1'],
  ];
  return regeln.find(([m]) => m.test(t))?.[1];
}

export interface GkvListe {
  version: string;
  gueltigAb?: string;
  positionen: QuellPosition[];
}

/**
 * Text der Anlage 2 (Vergütungsvereinbarung Physiotherapie) → Positionen.
 * `ersteZiffer`: X wird nach Status ersetzt – 2 = Krankengymnast/Physiotherapeut.
 */
export function gkvLesen(text: string, ersteZiffer = '2'): GkvListe {
  const gueltig = /Lesefassung gültig ab (\d{2})\.(\d{2})\.(\d{4})/.exec(text);
  const version = gueltig ? `Lesefassung gültig ab ${gueltig[1]}.${gueltig[2]}.${gueltig[3]}` : 'Fassung unbekannt';
  // Nur Teil A (Vergütungsliste); Seitenköpfe weg
  const teilA = text.split(/\nB\. Abrechnung der Leistungen/)[0] ?? text;
  const zeilen = teilA.split('\n').map((z) => z.trim()).filter((z) =>
    z && !/^(Anlage 2: Vergütungsvereinbarung|zum Vertrag nach § 125|Lesefassung gültig ab|Seite \d+ von \d+|LEGS:|Pos\.-Nr\. Leistungsbeschreibung|in Euro|Zuzahlung)/.test(z));
  const bloecke: { code: string; text: string[] }[] = [];
  for (const z of zeilen) {
    const m = /^(X\d{4}|2\d{4})\b\s*(.*)$/.exec(z);
    // „X9933 in X9950 umbenannt“ ist ein Hinweis, keine neue Position
    if (m && !/^in X\d{4}/.test(m[2]!)) bloecke.push({ code: m[1]!, text: m[2] ? [m[2]] : [] });
    else if (bloecke.length && !/^Vergütung von Leistungen außerhalb/.test(z)) bloecke.at(-1)!.text.push(z);
  }
  const positionen: QuellPosition[] = [];
  for (const b of bloecke) {
    const ganz = b.text.join('\n');
    // Preis und Zuzahlung: das letzte Paar „12,34 1,23“ bzw. „12,34 -“
    const paare = [...ganz.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{1,3},\d{2}|-)\s*$/gm)];
    const p = paare.at(-1);
    if (!p) continue;
    const vorPreis = ganz.slice(0, p.index).trim();
    const regel = /\(Regelbehandlungszeit ([^)]*)\)/.exec(vorPreis.replace(/\n/g, ' '));
    const flach = leer(vorPreis);
    const ende = regel ? flach.indexOf(`(Regelbehandlungszeit ${leer(regel[1]!)})`) : -1;
    const bezeichnung = leer((ende >= 0 ? flach.slice(0, ende) : flach.split(/ (?:Voraussetzung:|Die Position|Für Patienten|Ein Kreuz|Hinweis:|Bis zu)/)[0]!));
    const hinweise = leer(ende >= 0 ? flach.slice(ende + `(Regelbehandlungszeit ${leer(regel![1]!)})`.length) : flach.slice(bezeichnung.length));
    const nummer = b.code.startsWith('X') ? `${ersteZiffer}${b.code.slice(1)}` : b.code;
    positionen.push({
      nummer, code: b.code, gruppe: gruppeVon(b.code), kuerzel: kuerzelVon(bezeichnung), bezeichnung,
      regelzeit: regel ? leer(regel[1]!) : undefined, preis: zahl(p[1]!), zuzahlung: p[2] === '-' ? undefined : zahl(p[2]!),
      hinweise: hinweise || undefined,
      daten: { positionsnummer: b.code, abrechnungsnummer: nummer, originaltext: leer(ganz), zuzahlungsfrei: p[2] === '-' },
    });
  }
  return { version, gueltigAb: gueltig ? `${gueltig[3]}-${gueltig[2]}-${gueltig[1]}` : undefined, positionen };
}

/** Link auf die aktuelle Lesefassung der Anlage 2 auf der Physiotherapie-Seite des GKV-Spitzenverbands */
export function gkvLinkFinden(html: string, basis = 'https://www.gkv-spitzenverband.de'): { url: string; titel: string } | undefined {
  for (const m of html.matchAll(/<a[^>]*href="([^"]+\.pdf)"[^>]*title="([^"]*)"/g)) {
    const titel = m[2]!.replace(/&ouml;/g, 'ö').replace(/&uuml;/g, 'ü').replace(/&auml;/g, 'ä').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    if (/Anlage 2: Vergütungsvereinbarung \(Lesefassung/.test(titel) && !/aeltere|aenderung/i.test(m[1]!)) {
      return { url: new URL(m[1]!, basis).href, titel: titel.replace(/^Link öffnet PDF "|"$/g, '') };
    }
  }
  return undefined;
}

const entities = (s: string) =>
  s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([aouAOU])uml;/g, (_, v) => ({ a: 'ä', o: 'ö', u: 'ü', A: 'Ä', O: 'Ö', U: 'Ü' })[v as 'a']!).replace(/&szlig;/g, 'ß');

export interface BeihilfeListe {
  version: string;
  positionen: QuellPosition[];
}

/** HTML der Anlage 9 BBhV → Positionen „Nr.“, Leistung, beihilfefähiger Höchstbetrag */
export function beihilfeLesen(html: string, stand?: string): BeihilfeListe {
  const zeilen = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
    [...tr[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((td) => leer(entities(td[1]!.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '')))));
  const positionen: QuellPosition[] = [];
  let bereich = '';
  let eltern: { nr: string; text: string } | undefined;
  let i = 0;
  for (const z of zeilen) {
    if (z.length < 2) continue;
    // Unterpunkte („a)als Einzelinhalation | 12,10“) haben nur zwei Zellen – die erste überspannt Nr. und Leistung
    const [nr, leistung, betrag] = z.length === 2 ? ['', z[0] ?? '', z[1] ?? ''] : [z[0] ?? '', z[1] ?? '', z[2] ?? ''];
    if (/^Nr\.?$/.test(nr)) continue;
    if (!nr && /^Bereich /.test(leistung)) {
      bereich = leistung.replace(/^Bereich /, '');
      continue;
    }
    const unter = nr ? null : /^([a-z])\)\s*(.*)$/.exec(leistung);
    const wert = /(\d{1,3}(?:\.\d{3})*,\d{2})/.exec(betrag)?.[1];
    if (/^\d+$/.test(nr)) {
      eltern = { nr, text: leistung };
      if (wert) positionen.push({ nummer: nr, gruppe: bereich, bezeichnung: leistung, preis: zahl(wert), regelzeit: richtwert(leistung), reihenfolgeHilfe: i++, daten: { nr, bereich, leistung } } as QuellPosition);
    } else if (unter && eltern && wert) {
      const text = `${eltern.text}: ${unter[2]}`;
      positionen.push({ nummer: `${eltern.nr}${unter[1]}`, gruppe: bereich, bezeichnung: text, preis: zahl(wert), regelzeit: richtwert(text), daten: { nr: eltern.nr, unterpunkt: unter[1], bereich, leistung: text } });
    }
  }
  return { version: stand ? `BBhV Anlage 9, ${stand}` : 'BBhV Anlage 9', positionen: positionen.map(({ reihenfolgeHilfe, ...p }: QuellPosition & { reihenfolgeHilfe?: number }) => p) };
}

function richtwert(text: string): string | undefined {
  return /Richtwert:?\s*([^,;]*Minuten)/.exec(text)?.[1]?.trim();
}

/** „Stand: Zuletzt geändert durch Art. 1 V v. 3.7.2026 I Nr. 180“ aus der Übersichtsseite der BBhV */
export function beihilfeStand(html: string): string | undefined {
  const m = /Stand:\s*([^<]+?)(?:<|\n)/.exec(entities(html));
  return m ? leer(m[1]!) : undefined;
}

/** „15. Auflage“ aus der Produktseite des Herausgebers */
export function gebuethAuflage(html: string): string | undefined {
  const m = /(\d{1,2})\.\s*Auflage/.exec(entities(html.replace(/<[^>]+>/g, ' ')));
  return m ? `${m[1]}. Auflage` : undefined;
}

// ── Zuordnung GKV-Position ↔ Beihilfe-Position ──────────────────────────────
const STOP = new Set(['als', 'der', 'die', 'das', 'und', 'oder', 'mit', 'bei', 'auf', 'je', 'zur', 'des', 'den', 'in', 'im', 'einer', 'eines', 'bis', 'nach', 'auch', 'von', 'minuten', 'regelbehandlungszeit', 'richtwert', 'einzelbehandlung']);
const woerter = (s: string) => new Set(s.toLowerCase().replace(/[^a-zäöüß0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));

/** Ähnlichkeit 0…1 (Jaccard über Wörter, Bonus für gleiches Kürzel und gleiche Minuten) */
export function aehnlichkeit(gkv: QuellPosition, bh: QuellPosition): number {
  const a = woerter(gkv.bezeichnung);
  const b = woerter(bh.bezeichnung);
  const schnitt = [...a].filter((w) => b.has(w)).length;
  let s = schnitt / Math.max(1, new Set([...a, ...b]).size);
  if (gkv.kuerzel && new RegExp(`\\(${gkv.kuerzel.replace(/[-]/g, '\\-')}\\)`).test(bh.bezeichnung)) s += 0.3;
  const minuten = (t?: string) => t?.match(/\d+/g)?.join('-');
  if (minuten(gkv.regelzeit) && minuten(gkv.regelzeit) === minuten(bh.regelzeit)) s += 0.15;
  const gruppe = (gkv.bezeichnung.match(/gruppe/i) ? 1 : 0) - (bh.bezeichnung.match(/gruppe/i) ? 1 : 0);
  if (gruppe !== 0) s -= 0.3;
  return s;
}

/** Bester Beihilfe-Treffer je GKV-Position – nur wenn er deutlich passt */
export function beihilfeZuordnen(gkv: QuellPosition, beihilfe: QuellPosition[], schwelle = 0.45): QuellPosition | undefined {
  let best: QuellPosition | undefined;
  let wert = 0;
  for (const b of beihilfe) {
    const s = aehnlichkeit(gkv, b);
    if (s > wert) [best, wert] = [b, s];
  }
  return wert >= schwelle ? best : undefined;
}
