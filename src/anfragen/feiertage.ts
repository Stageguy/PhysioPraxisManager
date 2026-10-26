/**
 * Gesetzliche Feiertage in Bayern (Bad Wörishofen: katholisch geprägt, mit Mariä Himmelfahrt). An
 * Feiertagen werden keine Termine vorgeschlagen (Prompt 6). Ostern nach der Gauß-Formel.
 */
const tag = (j: number, m: number, t: number) => `${j}-${String(m).padStart(2, '0')}-${String(t).padStart(2, '0')}`;

function ostersonntag(j: number): Date {
  const a = j % 19;
  const b = Math.floor(j / 100);
  const c = j % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);
  const t = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(j, monat - 1, t));
}

const plus = (d: Date, n: number) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

/** Feiertage eines Jahres: „JJJJ-MM-TT“ → Name */
export function feiertageBayern(j: number): Map<string, string> {
  const o = ostersonntag(j);
  return new Map<string, string>([
    [tag(j, 1, 1), 'Neujahr'], [tag(j, 1, 6), 'Heilige Drei Könige'], [plus(o, -2), 'Karfreitag'], [plus(o, 1), 'Ostermontag'],
    [tag(j, 5, 1), 'Tag der Arbeit'], [plus(o, 39), 'Christi Himmelfahrt'], [plus(o, 50), 'Pfingstmontag'], [plus(o, 60), 'Fronleichnam'],
    [tag(j, 8, 15), 'Mariä Himmelfahrt'], [tag(j, 10, 3), 'Tag der Deutschen Einheit'], [tag(j, 11, 1), 'Allerheiligen'],
    [tag(j, 12, 25), '1. Weihnachtstag'], [tag(j, 12, 26), '2. Weihnachtstag'],
  ]);
}

export const istFeiertag = (datum: string): string | undefined => feiertageBayern(Number(datum.slice(0, 4))).get(datum);
