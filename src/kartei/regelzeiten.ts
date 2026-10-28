/**
 * Regelbehandlungszeiten (W110): Rezepte nennen eine Anzahl Behandlungen, keine Minuten – die Dauer kommt aus der
 * Heilmittel-Richtlinie. Die GKV-Vergütungsliste (Preisquelle „gkv“) trägt je Position die „Regelbehandlungszeit“
 * (z. B. 15–25 Minuten); daraus wird die Tabelle `regelzeit` gefüllt, die Lilli in der Konfiguration ändern kann.
 * Terminvorschläge nehmen die obere Grenze, auf 5 Minuten aufgerundet. Der Abgleich mit der Richtlinie selbst
 * (eigene Quelle mit nächtlicher Prüfung) folgt später (W110b).
 */
import { protokolliere, type Db } from '../db/index.ts';
import { KarteiFehler } from './patienten.ts';

export interface Regelzeit { nummer: string; bezeichnung: string; vonMin: number | null; bisMin: number; quelle: string; geaendertAm: string }

export const REGELZEIT_QUELLE_TEXT: Record<string, string> = { gkv: 'GKV-Liste', preisliste: 'Preisliste', hand: 'von Hand' };

/** „15–25 Minuten“ → [15, 25]; „30 Minuten“ → [null, 30]; nichts Brauchbares → null */
export function regelzeitLesen(text: string | null | undefined): { vonMin: number | null; bisMin: number } | null {
  const zahlen = (text ?? '').match(/\d+/g)?.map(Number).filter((n) => n > 0 && n <= 240) ?? [];
  if (!zahlen.length) return null;
  return zahlen.length >= 2 ? { vonMin: Math.min(zahlen[0]!, zahlen[1]!), bisMin: Math.max(zahlen[0]!, zahlen[1]!) } : { vonMin: null, bisMin: zahlen[0]! };
}

/** Auf volle 5 Minuten aufrunden – so liegen Termine im Kalenderraster */
export const aufFuenf = (min: number): number => Math.max(5, Math.ceil(min / 5) * 5);

export async function regelzeiten(db: Db): Promise<Regelzeit[]> {
  const { rows } = await db.query<Record<string, unknown>>('SELECT nummer, bezeichnung, von_min, bis_min, quelle, geaendert_am FROM regelzeit ORDER BY nummer');
  return rows.map((r) => ({ nummer: String(r.nummer), bezeichnung: String(r.bezeichnung), vonMin: r.von_min == null ? null : Number(r.von_min), bisMin: Number(r.bis_min), quelle: String(r.quelle), geaendertAm: new Date(r.geaendert_am as string).toISOString() }));
}

/**
 * Übernehmen: zuerst die neueste GKV-Vergütungsliste (Preisquelle), ergänzt um Positionen aus den Preislisten –
 * je Nummer die neueste Angabe. Werte von Hand bleiben stehen.
 */
export async function regelzeitenUebernehmen(db: Db, wer: string): Promise<{ uebernommen: number; vorhanden: number }> {
  const gkv = await db.query<{ nummer: string; bezeichnung: string; regelzeit: string }>(
    `SELECT DISTINCT ON (p.nummer) p.nummer, p.bezeichnung, p.regelzeit FROM preisquelle_position p JOIN preisquelle q ON q.id = p.quelle_id
     WHERE q.art = 'gkv' AND p.regelzeit IS NOT NULL ORDER BY p.nummer, q.gueltig_ab DESC NULLS LAST, q.id DESC`,
  );
  const listen = await db.query<{ nummer: string; bezeichnung: string; regelzeit: string }>(
    'SELECT DISTINCT ON (nummer) nummer, bezeichnung, regelzeit FROM preisliste_position WHERE regelzeit IS NOT NULL ORDER BY nummer, id DESC',
  );
  const gesehen = new Set<string>();
  const kandidaten = [...gkv.rows.map((r) => ({ ...r, quelle: 'gkv' })), ...listen.rows.map((r) => ({ ...r, quelle: 'preisliste' }))].filter((r) => !gesehen.has(r.nummer) && gesehen.add(r.nummer));
  let uebernommen = 0;
  for (const r of kandidaten) {
    const z = regelzeitLesen(r.regelzeit);
    if (!z) continue;
    const e = await db.query(
      `INSERT INTO regelzeit (nummer, bezeichnung, von_min, bis_min, quelle, geaendert_von) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (nummer) DO UPDATE SET bezeichnung = EXCLUDED.bezeichnung, von_min = EXCLUDED.von_min, bis_min = EXCLUDED.bis_min, quelle = EXCLUDED.quelle, geaendert_am = now(), geaendert_von = EXCLUDED.geaendert_von
       WHERE regelzeit.quelle <> 'hand' RETURNING nummer`, [r.nummer, r.bezeichnung, z.vonMin, z.bisMin, r.quelle, wer],
    );
    if (e.rows.length) uebernommen++;
  }
  await protokolliere(db, { actor: wer, action: 'regelzeiten_uebernommen', details: { uebernommen, positionen: kandidaten.length } });
  return { uebernommen, vorhanden: kandidaten.length };
}

/** Beim Start: Tabelle füllen, wenn sie leer ist und eine Quelle Regelzeiten hat */
export async function regelzeitenSicherstellen(db: Db): Promise<number> {
  const da = (await db.query('SELECT 1 FROM regelzeit LIMIT 1')).rows.length;
  if (da) return 0;
  return (await regelzeitenUebernehmen(db, 'system')).uebernommen;
}

export async function regelzeitSetzen(db: Db, d: { nummer: string; bezeichnung?: string; vonMin?: number | null; bisMin: number }, wer: string): Promise<void> {
  const nummer = d.nummer.trim();
  if (!/^[A-Za-z0-9.-]{3,12}$/.test(nummer)) throw new KarteiFehler('Leistungsnummer fehlt oder ist ungültig');
  if (!(d.bisMin > 0) || d.bisMin > 240) throw new KarteiFehler('Dauer in Minuten zwischen 1 und 240');
  if (d.vonMin != null && (d.vonMin <= 0 || d.vonMin > d.bisMin)) throw new KarteiFehler('„von“ muss kleiner als „bis“ sein');
  await db.query(
    `INSERT INTO regelzeit (nummer, bezeichnung, von_min, bis_min, quelle, geaendert_von) VALUES ($1, COALESCE(NULLIF($2, ''), $1), $3, $4, 'hand', $5)
     ON CONFLICT (nummer) DO UPDATE SET bezeichnung = COALESCE(NULLIF($2, ''), regelzeit.bezeichnung), von_min = $3, bis_min = $4, quelle = 'hand', geaendert_am = now(), geaendert_von = $5`,
    [nummer, (d.bezeichnung ?? '').trim(), d.vonMin ?? null, d.bisMin, wer],
  );
  await protokolliere(db, { actor: wer, action: 'regelzeit_gesetzt', details: { nummer, bisMin: d.bisMin } });
}

/**
 * Dauer eines Termins zu einer Leistung: Regelzeit (obere Grenze) → Preislisten-Position → Terminart → Vorgabe.
 * Gibt auch die Herkunft zurück, damit die Seite sagt, woher die Minuten kommen.
 */
export async function dauerFuer(db: Db, leistungNummer: string | null | undefined, vorgabeMin: number): Promise<{ dauerMin: number; herkunft: string }> {
  const nummer = (leistungNummer ?? '').trim();
  if (nummer) {
    const r = (await db.query<{ von_min: number | null; bis_min: number; bezeichnung: string }>('SELECT von_min, bis_min, bezeichnung FROM regelzeit WHERE nummer = $1', [nummer])).rows[0];
    if (r) return { dauerMin: aufFuenf(Number(r.bis_min)), herkunft: `Regelbehandlungszeit ${r.von_min ? `${r.von_min}–` : ''}${r.bis_min} Min. (${r.bezeichnung}, Position ${nummer})` };
    const p = (await db.query<{ regelzeit: string | null; bezeichnung: string }>('SELECT regelzeit, bezeichnung FROM preisliste_position WHERE nummer = $1 AND regelzeit IS NOT NULL ORDER BY id DESC LIMIT 1', [nummer])).rows[0];
    const z = regelzeitLesen(p?.regelzeit);
    if (p && z) return { dauerMin: aufFuenf(z.bisMin), herkunft: `Regelbehandlungszeit „${p.regelzeit}“ laut Preisliste (${p.bezeichnung})` };
    const t = (await db.query<{ dauer_min: number; kurz: string }>('SELECT dauer_min, kurz FROM terminart WHERE leistung_nummer = $1 ORDER BY aktiv DESC, id LIMIT 1', [nummer])).rows[0];
    if (t) return { dauerMin: aufFuenf(Number(t.dauer_min)), herkunft: `Terminart „${t.kurz}“` };
  }
  return { dauerMin: aufFuenf(vorgabeMin), herkunft: 'Vorgabe aus der Konfiguration (keine Regelbehandlungszeit zur Leistung hinterlegt)' };
}
