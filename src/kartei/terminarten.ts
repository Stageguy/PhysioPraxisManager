/**
 * Terminarten für die Online-Terminanfrage (W94) in drei Sektionen (W95): Physioleistungen gemäß
 * Katalog und Rezept, Selbstzahler nach Physioverordnung, Wellness. Kennung = Buchstabe der Sektion +
 * Nummer; nur aktive stehen im Dropdown der Website. Die Sektion eines Termins kehrt im Kalender
 * wieder – als Farbe und Symbol in der Praxis-Assistenz, als Kategorie-Farbe in Outlook.
 */
import { protokolliere, type Db } from '../db/index.ts';
import { istId, text } from '../db/werte.ts';
import { KarteiFehler } from './patienten.ts';

export type Sektion = 'rezept' | 'selbstzahler' | 'wellness';

export const SEKTIONEN: Record<Sektion, { buchstabe: string; name: string; text: string }> = {
  rezept: { buchstabe: 'P', name: 'Physioleistungen gemäß Katalog und Rezept', text: 'Behandlungen auf ärztliche Verordnung nach dem Leistungskatalog der Heilmittel – mit Rezept.' },
  selbstzahler: { buchstabe: 'S', name: 'Selbstzahler – Behandlungen nach Physioverordnung', text: 'Physiotherapie, die Patienten selbst bezahlen – ohne Rezept oder mit einem Rezept, das die Kasse nicht übernimmt; Preise nach der Preisliste der Praxis.' },
  wellness: { buchstabe: 'W', name: 'Wellness & Ayurveda', text: 'Wellness-, Ayurveda- und Yoga-Angebote ohne medizinischen Anlass.' },
};
export const SEKTION_REIHE: Sektion[] = ['rezept', 'selbstzahler', 'wellness'];

export interface Terminart {
  id: string;
  code: string;
  sektion: Sektion;
  kurz: string;
  lang: string | null;
  dauerMin: number;
  leistungNummer: string | null;
  regelzeit: string | null;
  aktiv: boolean;
}

const zeile = (r: Record<string, unknown>): Terminart => ({
  id: String(r.id), code: String(r.code), sektion: r.sektion as Sektion, kurz: String(r.kurz), lang: text(r.lang), dauerMin: Number(r.dauer_min),
  leistungNummer: text(r.leistung_nummer), regelzeit: text(r.regelzeit), aktiv: Boolean(r.aktiv),
});

export async function terminarten(db: Db, o: { nurAktiv?: boolean } = {}): Promise<Terminart[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT id::text, code, sektion::text, kurz, lang, dauer_min, leistung_nummer, regelzeit, aktiv FROM terminart ${o.nurAktiv ? 'WHERE aktiv' : ''}
     ORDER BY array_position(ARRAY['rezept','selbstzahler','wellness']::terminart_sektion[], sektion), reihenfolge, id`,
  );
  return rows.map(zeile);
}

export async function terminartLesen(db: Db, id: string): Promise<Terminart | undefined> {
  if (!istId(id)) return undefined;
  const r = (await db.query<Record<string, unknown>>('SELECT id::text, code, sektion::text, kurz, lang, dauer_min, leistung_nummer, regelzeit, aktiv FROM terminart WHERE id = $1', [id])).rows[0];
  return r ? zeile(r) : undefined;
}

/** Aus dem Feld „Terminart:“ einer Formular-Mail: Kennung vorn („P4 – Krankengymnastik“) oder genau die Kurzbeschreibung; nur aktive */
export async function terminartFinden(db: Db, wert: string): Promise<Terminart | undefined> {
  const w = wert.trim();
  if (!w) return undefined;
  const aktive = await terminarten(db, { nurAktiv: true });
  const code = /^([PSW]\d{1,3})\b/i.exec(w)?.[1]?.toUpperCase();
  const ohneDauer = w.replace(/\s*\(\d+\s*Min\.?\)\s*$/i, '').replace(/^[PSW]\d{1,3}\s*[–-]\s*/i, '').trim().toLowerCase();
  return (code && aktive.find((a) => a.code === code)) || aktive.find((a) => a.kurz.toLowerCase() === ohneDauer);
}

/** Nächste freie Kennung der Sektion: „P17“ */
async function naechsterCode(db: Db, sektion: Sektion): Promise<string> {
  const b = SEKTIONEN[sektion].buchstabe;
  const { rows } = await db.query<{ n: string }>("SELECT coalesce(max(substring(code FROM '[0-9]+$')::int), 0) + 1 AS n FROM terminart WHERE code ~ ('^' || $1 || '[0-9]+$')", [b]);
  return `${b}${rows[0]!.n}`;
}

export async function terminartSpeichern(
  db: Db, d: { id?: string; sektion?: string; kurz: string; lang?: string; dauerMin: number; leistungNummer?: string }, wer: string,
): Promise<string> {
  const kurz = d.kurz.trim();
  if (!kurz) throw new KarteiFehler('Die Kurzbeschreibung fehlt – sie steht im Dropdown');
  if (kurz.length > 80) throw new KarteiFehler('Die Kurzbeschreibung ist zu lang (höchstens 80 Zeichen, sie muss ins Dropdown passen)');
  if (!(Number.isInteger(d.dauerMin) && d.dauerMin > 0 && d.dauerMin <= 480)) throw new KarteiFehler('Dauer in Minuten, 1 bis 480');
  const leistung = d.leistungNummer?.trim() || null;
  if (leistung && !/^\d{5}$/.test(leistung)) throw new KarteiFehler('GKV-Nummer mit fünf Ziffern, z. B. 20501 – oder leer lassen');
  let id = d.id;
  if (id) {
    const r = await db.query('UPDATE terminart SET kurz = $2, lang = $3, dauer_min = $4, leistung_nummer = $5, geaendert_am = now(), geaendert_von = $6 WHERE id = $1 RETURNING id', [id, kurz, d.lang?.trim() || null, d.dauerMin, leistung, wer]);
    if (!r.rows.length) throw new KarteiFehler('Diese Terminart gibt es nicht');
  } else {
    const sektion = SEKTION_REIHE.find((s) => s === d.sektion);
    if (!sektion) throw new KarteiFehler('Unbekannte Sektion');
    const code = await naechsterCode(db, sektion);
    id = (await db.query<{ id: string }>(
      'INSERT INTO terminart (code, sektion, kurz, lang, dauer_min, leistung_nummer, reihenfolge, geaendert_von) VALUES ($1, $2, $3, $4, $5, $6, (SELECT coalesce(max(reihenfolge), 0) + 10 FROM terminart WHERE sektion = $2), $7) RETURNING id::text',
      [code, sektion, kurz, d.lang?.trim() || null, d.dauerMin, leistung, wer],
    )).rows[0]!.id;
  }
  await protokolliere(db, { actor: wer, action: 'terminart_gespeichert', objectType: 'terminart', objectId: id });
  return id;
}

export async function terminartAktiv(db: Db, id: string, aktiv: boolean, wer: string): Promise<void> {
  const r = await db.query('UPDATE terminart SET aktiv = $2, geaendert_am = now(), geaendert_von = $3 WHERE id = $1 RETURNING id', [id, aktiv, wer]);
  if (!r.rows.length) throw new KarteiFehler('Diese Terminart gibt es nicht');
  await protokolliere(db, { actor: wer, action: aktiv ? 'terminart_aktiv' : 'terminart_inaktiv', objectType: 'terminart', objectId: id });
}

/**
 * Sektion eines Termins – Alias t (Termin), v (Rezept), f (Fall), ta (Terminart): die gewählte Terminart
 * zuerst, sonst Rezept → rezept, Wellness-Serie → wellness, Direktzugang → selbstzahler, sonst keine.
 */
export const SEKTION_SQL = `coalesce(ta.sektion::text, CASE WHEN t.verordnung_id IS NOT NULL THEN 'rezept' WHEN f.grundlage = 'praevention' THEN 'wellness' WHEN f.grundlage = 'direktzugang' THEN 'selbstzahler' END)`;

/** HTML-Baustein für das Formular der Website: Dropdown mit den aktiven Terminarten, je Sektion eine Gruppe */
export function websiteBaustein(arten: Terminart[]): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const gruppen = SEKTION_REIHE.map((s) => {
    const liste = arten.filter((a) => a.aktiv && a.sektion === s);
    if (!liste.length) return '';
    return `  <optgroup label="${esc(SEKTIONEN[s].name)}">\n${liste.map((a) => `    <option value="${esc(`${a.code} – ${a.kurz}`)}" data-dauer="${a.dauerMin}" data-beschreibung="${esc(a.lang ?? '')}">${esc(a.kurz)} (${a.dauerMin} Min.)</option>`).join('\n')}\n  </optgroup>`;
  }).filter(Boolean).join('\n');
  return `<label for="terminart">Terminart</label>\n<select id="terminart" name="Terminart" required>\n  <option value="">Bitte wählen …</option>\n${gruppen}\n</select>`;
}
