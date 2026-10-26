/**
 * Terminanfragen erkennen – Stufe 1, regelbasiert (Prompt 6): Anliegen aus Schlüsselwörtern, Zeitwünsche
 * aus Wochentagen, Tageszeiten, Datums- und Uhrzeitmustern. Kein Sprachmodell, nichts verlässt den
 * Server. Was hier herauskommt, enthält keine Gesundheitsdaten – der Wortlaut bleibt verschlüsselt.
 */
export type Anliegen = 'termin' | 'verschieben' | 'absagen' | 'unklar';

export interface Zeitwunsch {
  /** 1 = Montag … 7 = Sonntag */
  wochentage: number[];
  tageszeiten: ('vormittag' | 'nachmittag' | 'abend')[];
  /** JJJJ-MM-TT */
  daten: string[];
  /** HH:MM */
  uhrzeiten: string[];
}

const WOCHENTAGE: [RegExp, number][] = [
  [/\bmo(?:ntag)?s?\b/i, 1], [/\bdi(?:enstag)?s?\b/i, 2], [/\bmi(?:ttwoch)?s?\b/i, 3], [/\bdo(?:nnerstag)?s?\b/i, 4],
  [/\bfr(?:eitag)?s?\b/i, 5], [/\bsa(?:mstag)?s?\b/i, 6], [/\bso(?:nntag)?s?\b/i, 7],
];

/** Verschieben/Absagen vor Termin prüfen: „Termin verschieben“ ist eine Verschiebung, keine Neuanfrage */
export function erkenneAnliegen(betreff: string, text: string): Anliegen {
  const t = `${betreff}\n${text}`.toLowerCase();
  // Wortstämme ohne Grenze am Ende: „verschieben“, „absagen“, „Terminanfrage“
  if (/\b(verschieb|verleg|anderen termin|umbuch|später|spaeter|früher|frueher)/.test(t)) return 'verschieben';
  if (/\b(absag|stornier|nicht kommen|nicht wahrnehmen|fällt aus|faellt aus|muss leider)/.test(t)) return 'absagen';
  if (/\b(termin|vereinbar|physio|behandl|krankengymnastik|massage|lymphdrainage|rezept|verordnung)/.test(t) || /\b(frei|wann)\b/.test(t)) return 'termin';
  return 'unklar';
}

/** Wochentage, Tageszeiten, Daten („3.11.“, „03.11.2026“) und Uhrzeiten („9 Uhr“, „14:30“) aus dem Text */
export function erkenneZeitwunsch(text: string, heute: string): Zeitwunsch {
  const jahr = Number(heute.slice(0, 4));
  const wochentage = WOCHENTAGE.filter(([m]) => m.test(text)).map(([, n]) => n);
  const tageszeiten: Zeitwunsch['tageszeiten'] = [];
  if (/\b(vormittag|morgens|früh|frueh)/i.test(text)) tageszeiten.push('vormittag');
  if (/\b(nachmittag|mittag)/i.test(text)) tageszeiten.push('nachmittag');
  if (/\b(abend|nach der arbeit|nach feierabend|spät|spaet)/i.test(text)) tageszeiten.push('abend');
  const daten: string[] = [];
  for (const m of text.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(?:(\d{4}|\d{2})\b)?/g)) {
    const tag = Number(m[1]);
    const monat = Number(m[2]);
    if (tag < 1 || tag > 31 || monat < 1 || monat > 12) continue;
    let j = m[3] ? Number(m[3]) : jahr;
    if (j < 100) j += 2000;
    let iso = `${j}-${String(monat).padStart(2, '0')}-${String(tag).padStart(2, '0')}`;
    // Ohne Jahr: liegt das Datum schon hinter uns, ist das nächste Jahr gemeint
    if (!m[3] && iso < heute) iso = `${j + 1}${iso.slice(4)}`;
    if (!daten.includes(iso)) daten.push(iso);
  }
  const uhrzeiten: string[] = [];
  for (const m of text.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*uhr\b|\b(\d{1,2}):(\d{2})\b(?!\.\d)/gi)) {
    const h = Number(m[1] ?? m[3]);
    const min = Number(m[2] ?? m[4] ?? 0);
    if (h > 23 || min > 59) continue;
    const z = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    if (!uhrzeiten.includes(z)) uhrzeiten.push(z);
  }
  return { wochentage, tageszeiten, daten, uhrzeiten };
}

/** HTML-Mail → lesbarer Text (Absätze, Zeilenumbrüche, Entities); Skripte und Stile fallen weg */
export function htmlZuText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (ganz, e: string) => entity(e) ?? ganz)
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', euro: '€', ndash: '–', mdash: '—', hellip: '…', bdquo: '„', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»' };

function entity(e: string): string | undefined {
  if (e.startsWith('#x') || e.startsWith('#X')) return String.fromCodePoint(parseInt(e.slice(2), 16));
  if (e.startsWith('#')) return String.fromCodePoint(Number(e.slice(1)));
  return ENTITIES[e];
}
