/**
 * Rückmeldungen der Prototyp-Nutzerin (W72): Hinweis oder Fehler zu einem Element, mit Screenshot.
 * Liegt in einer eigenen Entwicklungs-Datenbank (praxis_entwicklung), nie neben Patientendaten.
 */
import { migriere, verbinde, type Db, type Verbindung } from '../db/index.ts';

export class RueckmeldungFehler extends Error {}

export interface Rueckmeldung {
  id: string;
  art: 'hinweis' | 'fehler';
  status: 'offen' | 'erledigt';
  seite: string;
  element: string | null;
  elementTitel: string | null;
  textHtml: string;
  hatBild: boolean;
  fassung: string | null;
  umgebung: string | null;
  browser: string | null;
  fenster: string | null;
  von: string;
  erstelltAm: string;
  erledigtAm: string | null;
  erledigtVon: string | null;
  antwort: string | null;
}

const MIGRATIONEN = new URL('../db/entwicklung/', import.meta.url);
const MAX_BILD = 4 * 1024 * 1024;

/** Entwicklungs-Datenbank aus der Praxis-Adresse ableiten: gleicher Server, Datenbank „praxis_entwicklung“ */
export function entwicklungsAdresse(praxisUrl: string, name = 'praxis_entwicklung'): string {
  const u = new URL(praxisUrl);
  u.pathname = `/${name}`;
  return u.toString();
}

/** Datenbank anlegen, falls es sie noch nicht gibt, und das Schema fortschreiben */
export async function entwicklungsDb(praxisUrl: string): Promise<Verbindung> {
  const name = 'praxis_entwicklung';
  const praxis = verbinde(praxisUrl);
  try {
    const da = await praxis.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (!da.rows.length) await praxis.exec(`CREATE DATABASE ${name}`);
  } finally {
    await praxis.ende();
  }
  const db = verbinde(entwicklungsAdresse(praxisUrl, name));
  await migriere(db, MIGRATIONEN);
  return db;
}

export const entwicklungMigrieren = (db: Db) => migriere(db, MIGRATIONEN);

/** Richtext aus dem Browser auf wenige Auszeichnungen eindampfen – alles andere wird zu Text */
export function htmlBereinigen(html: string): string {
  const erlaubt = new Set(['b', 'strong', 'i', 'em', 'u', 'p', 'br', 'ul', 'ol', 'li']);
  return html
    .replace(/<\/?([a-z0-9]+)[^>]*>/gi, (ganz, tag: string) => {
      const t = tag.toLowerCase();
      if (!erlaubt.has(t)) return t === 'div' ? (ganz.startsWith('</') ? '<br>' : '') : '';
      const name = t === 'strong' ? 'b' : t === 'em' ? 'i' : t;
      return ganz.startsWith('</') ? (name === 'br' ? '' : `</${name}>`) : `<${name}>`;
    })
    .replace(/&(?!(amp|lt|gt|quot|#39|nbsp);)/g, '&amp;')
    .replace(/(<br>\s*){3,}/g, '<br><br>')
    .trim()
    .slice(0, 20_000);
}

export interface NeueRueckmeldung {
  art: string;
  seite: string;
  element?: string;
  elementTitel?: string;
  textHtml: string;
  /** JPEG/PNG als data:-URL */
  bild?: string;
  fassung?: string;
  umgebung?: string;
  browser?: string;
  fenster?: string;
}

export async function rueckmeldungSpeichern(db: Db, r: NeueRueckmeldung, von: string): Promise<string> {
  if (r.art !== 'hinweis' && r.art !== 'fehler') throw new RueckmeldungFehler('Bitte Hinweis oder Fehler wählen');
  const text = htmlBereinigen(r.textHtml ?? '');
  if (!text.replace(/<[^>]+>|&nbsp;|\s/g, '')) throw new RueckmeldungFehler('Bitte beschreiben, was auffällt');
  let bild: Buffer | null = null;
  let bildTyp: string | null = null;
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(r.bild ?? '');
  if (m) {
    bild = Buffer.from(m[2]!, 'base64');
    bildTyp = m[1]!;
    if (bild.length > MAX_BILD) throw new RueckmeldungFehler('Der Screenshot ist zu groß');
  }
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO rueckmeldung (art, seite, element, element_titel, text_html, bild, bild_typ, fassung, umgebung, browser, fenster, von)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id::text`,
    [r.art, (r.seite ?? '/').slice(0, 300), r.element?.slice(0, 120) || null, r.elementTitel?.slice(0, 200) || null, text, bild, bildTyp,
      r.fassung?.slice(0, 40) || null, r.umgebung?.slice(0, 10) || null, r.browser?.slice(0, 300) || null, r.fenster?.slice(0, 40) || null, von],
  );
  return rows[0]!.id;
}

export async function rueckmeldungen(db: Db, o: { status?: 'offen' | 'erledigt' | 'alle' } = {}): Promise<Rueckmeldung[]> {
  const wo = o.status && o.status !== 'alle' ? 'WHERE status = $1' : '';
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT id::text, art::text, status::text, seite, element, element_titel, text_html, (bild IS NOT NULL) AS hat_bild, fassung, umgebung, browser, fenster, von, erstellt_am, erledigt_am, erledigt_von, antwort
     FROM rueckmeldung ${wo} ORDER BY status = 'offen' DESC, erstellt_am DESC LIMIT 500`, wo ? [o.status] : [],
  );
  return rows.map((r) => ({
    id: String(r.id), art: r.art as Rueckmeldung['art'], status: r.status as Rueckmeldung['status'], seite: String(r.seite), element: (r.element as string | null) ?? null,
    elementTitel: (r.element_titel as string | null) ?? null, textHtml: String(r.text_html), hatBild: Boolean(r.hat_bild), fassung: (r.fassung as string | null) ?? null,
    umgebung: (r.umgebung as string | null) ?? null, browser: (r.browser as string | null) ?? null, fenster: (r.fenster as string | null) ?? null, von: String(r.von),
    erstelltAm: new Date(r.erstellt_am as string).toISOString(), erledigtAm: r.erledigt_am ? new Date(r.erledigt_am as string).toISOString() : null,
    erledigtVon: (r.erledigt_von as string | null) ?? null, antwort: (r.antwort as string | null) ?? null,
  }));
}

export async function rueckmeldungBild(db: Db, id: string): Promise<{ daten: Uint8Array; typ: string } | undefined> {
  if (!/^\d+$/.test(id)) return undefined;
  const r = (await db.query<{ bild: Uint8Array | null; bild_typ: string | null }>('SELECT bild, bild_typ FROM rueckmeldung WHERE id = $1', [id])).rows[0];
  return r?.bild ? { daten: r.bild, typ: r.bild_typ ?? 'image/jpeg' } : undefined;
}

export async function rueckmeldungStatus(db: Db, id: string, status: 'offen' | 'erledigt', wer: string, antwort?: string): Promise<void> {
  const r = await db.query(
    `UPDATE rueckmeldung SET status = $2::rueckmeldung_status, erledigt_am = CASE WHEN $2::text = 'erledigt' THEN now() ELSE NULL END,
       erledigt_von = CASE WHEN $2::text = 'erledigt' THEN $3 ELSE NULL END, antwort = COALESCE($4, antwort) WHERE id = $1 RETURNING id`,
    [id, status, wer, antwort?.trim() || null],
  );
  if (!r.rows.length) throw new RueckmeldungFehler('Diese Rückmeldung gibt es nicht');
}

export const offeneRueckmeldungen = async (db: Db): Promise<number> =>
  Number((await db.query<{ n: string }>("SELECT count(*)::text AS n FROM rueckmeldung WHERE status = 'offen'")).rows[0]!.n);
