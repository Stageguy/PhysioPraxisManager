/**
 * Freie Tage (A26/W111): Feiertage in Bayern als Daten statt nur gerechnet, Brückentage nach Lillis Wahl, Schließtage
 * (Urlaub, Fortbildung, geschlossen) und die Wochenend-Sperre. Terminvorschläge (A15) und die Buchungsseite (W96)
 * lesen die gesperrten Tage. Import von feiertage-api.de (nur_land=BY); fällt die Quelle aus, rechnet
 * src/anfragen/feiertage.ts – so steht nie ein Jahr ohne Feiertage da.
 */
import { protokolliere, type Db } from '../db/index.ts';
import { feiertageBayern } from '../anfragen/feiertage.ts';
import { wochentag } from '../anfragen/slots.ts';
import { heuteBerlin, tagPlus } from '../zeit.ts';
import { KarteiFehler } from './patienten.ts';

export type FreieTagArt = 'feiertag' | 'brueckentag' | 'geschlossen' | 'urlaub' | 'fortbildung';
export interface FreierTag { datum: string; name: string; art: FreieTagArt; gesperrt: boolean; quelle: string }
export interface Brueckentag { datum: string; wegen: string; gesperrt: boolean }
export interface FreieTageDaten { jahr: number; jahre: number[]; liste: FreierTag[]; brueckentage: Brueckentag[] }

export const FREIE_TAG_ART_TEXT: Record<FreieTagArt, string> = { feiertag: 'Feiertag', brueckentag: 'Brückentag', geschlossen: 'Praxis geschlossen', urlaub: 'Urlaub', fortbildung: 'Fortbildung' };
export const WOCHENTAG_KURZ = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const jahrPruefen = (jahr: number): number => {
  if (!Number.isInteger(jahr) || jahr < 2020 || jahr > 2100) throw new KarteiFehler('Jahr zwischen 2020 und 2100');
  return jahr;
};

/** Feiertage eines Jahres eintragen – von feiertage-api.de, ersatzweise aus dem Rechner; Sperren von Hand bleiben erhalten */
export async function feiertageImportieren(db: Db, jahr: number, wer: string, o: { abruf?: typeof fetch } = {}): Promise<{ jahr: number; anzahl: number; quelle: 'feiertage-api.de' | 'Rechner' }> {
  jahrPruefen(jahr);
  let liste: [string, string][];
  let quelle: 'feiertage-api.de' | 'Rechner';
  try {
    const abruf = o.abruf ?? fetch;
    const res = await abruf(`https://feiertage-api.de/api/?jahr=${jahr}&nur_land=BY`, { signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as Record<string, { datum?: string }>;
    liste = Object.entries(json).map(([name, v]) => [v?.datum ?? '', name.trim()] as [string, string]).filter(([d, n]) => DATUM.test(d) && d.startsWith(String(jahr)) && n);
    if (!liste.length) throw new Error('keine Feiertage in der Antwort');
    quelle = 'feiertage-api.de';
  } catch (err) {
    console.warn(`Feiertage ${jahr}: feiertage-api.de nicht nutzbar (${(err as Error).message.slice(0, 80)}) – eigener Rechner`);
    liste = [...feiertageBayern(jahr)];
    quelle = 'Rechner';
  }
  for (const [datum, name] of liste) {
    await db.query(
      `INSERT INTO freier_tag (datum, name, art, gesperrt, quelle, erstellt_von) VALUES ($1, $2, 'feiertag', true, $3, $4)
       ON CONFLICT (datum) DO UPDATE SET name = EXCLUDED.name, art = 'feiertag', quelle = EXCLUDED.quelle`, [datum, name, quelle, wer],
    );
  }
  await protokolliere(db, { actor: wer, action: 'feiertage_importiert', details: { jahr, anzahl: liste.length, quelle } });
  return { jahr, anzahl: liste.length, quelle };
}

/** Beim Start: laufendes und nächstes Jahr haben Feiertage (ohne Netz aus dem Rechner) */
export async function feiertageSicherstellen(db: Db, o: { abruf?: typeof fetch } = {}): Promise<number[]> {
  const jahr = Number(heuteBerlin().slice(0, 4));
  const neu: number[] = [];
  for (const j of [jahr, jahr + 1]) {
    const da = (await db.query("SELECT 1 FROM freier_tag WHERE art = 'feiertag' AND datum >= $1::date AND datum < ($1::date + interval '1 year') LIMIT 1", [`${j}-01-01`])).rows.length;
    if (!da) { await feiertageImportieren(db, j, 'system', o); neu.push(j); }
  }
  return neu;
}

export async function freieTageListe(db: Db, jahr: number): Promise<FreierTag[]> {
  const { rows } = await db.query<Record<string, unknown>>("SELECT datum::text, name, art::text, gesperrt, quelle FROM freier_tag WHERE datum >= $1::date AND datum < ($1::date + interval '1 year') ORDER BY datum", [`${jahrPruefen(jahr)}-01-01`]);
  return rows.map((r) => ({ datum: String(r.datum).slice(0, 10), name: String(r.name), art: r.art as FreieTagArt, gesperrt: Boolean(r.gesperrt), quelle: String(r.quelle) }));
}

/** Gesperrte Tage eines Zeitraums (beide Grenzen einschließlich) */
export async function gesperrteTage(db: Db, von: string, bis: string): Promise<Set<string>> {
  const { rows } = await db.query<{ datum: string }>('SELECT datum::text FROM freier_tag WHERE gesperrt AND datum BETWEEN $1 AND $2', [von, bis]);
  return new Set(rows.map((r) => String(r.datum).slice(0, 10)));
}

/** Datum → Name für die Kalenderseite (auch nicht gesperrte, mit Hinweis) */
export async function freieTageZeitraum(db: Db, von: string, bis: string): Promise<Record<string, string>> {
  const { rows } = await db.query<{ datum: string; name: string; gesperrt: boolean }>('SELECT datum::text, name, gesperrt FROM freier_tag WHERE datum BETWEEN $1 AND $2', [von, bis]);
  return Object.fromEntries(rows.map((r) => [String(r.datum).slice(0, 10), r.gesperrt ? r.name : `${r.name} (offen)`]));
}

/** Brückentage: Montag vor einem Dienstags-, Freitag nach einem Donnerstagsfeiertag – ohne Feiertage und Wochenenden */
export async function brueckentageBerechnen(db: Db, jahr: number): Promise<Brueckentag[]> {
  const liste = await freieTageListe(db, jahrPruefen(jahr));
  const feiertage = liste.filter((t) => t.art === 'feiertag');
  const quelle = feiertage.length ? new Map(feiertage.map((t) => [t.datum, t.name])) : feiertageBayern(jahr);
  const gesperrt = new Map(liste.filter((t) => t.art === 'brueckentag').map((t) => [t.datum, t.gesperrt]));
  const ergebnis: Brueckentag[] = [];
  for (const [datum, name] of quelle) {
    const wt = wochentag(datum);
    const kandidat = wt === 2 ? tagPlus(datum, -1) : wt === 4 ? tagPlus(datum, 1) : null;
    if (!kandidat || quelle.has(kandidat) || wochentag(kandidat) >= 6 || !kandidat.startsWith(String(jahr))) continue;
    if (!ergebnis.some((b) => b.datum === kandidat)) ergebnis.push({ datum: kandidat, wegen: name, gesperrt: gesperrt.get(kandidat) ?? false });
  }
  return ergebnis.sort((a, b) => a.datum.localeCompare(b.datum));
}

/** Lillis Wahl: die angehakten Brückentage sperren, die anderen freigeben */
export async function brueckentageSetzen(db: Db, jahr: number, gewaehlt: string[], wer: string): Promise<{ gesperrt: number }> {
  const kandidaten = await brueckentageBerechnen(db, jahr);
  const wahl = new Set(gewaehlt.filter((d) => DATUM.test(d)));
  let n = 0;
  for (const k of kandidaten) {
    if (wahl.has(k.datum)) {
      await db.query(
        `INSERT INTO freier_tag (datum, name, art, gesperrt, quelle, erstellt_von) VALUES ($1, $2, 'brueckentag', true, 'hand', $3)
         ON CONFLICT (datum) DO UPDATE SET name = EXCLUDED.name, art = 'brueckentag', gesperrt = true`, [k.datum, `Brückentag (${k.wegen})`, wer],
      );
      n++;
    } else {
      await db.query("DELETE FROM freier_tag WHERE datum = $1 AND art = 'brueckentag'", [k.datum]);
    }
  }
  await protokolliere(db, { actor: wer, action: 'brueckentage_gesetzt', details: { jahr, gesperrt: n } });
  return { gesperrt: n };
}

/** Schließtage von–bis (höchstens 60 Tage), z. B. Urlaub; Feiertage im Zeitraum bleiben Feiertage */
export async function schliesstageAnlegen(db: Db, d: { von: string; bis?: string; name?: string; art: string }, wer: string): Promise<{ tage: number }> {
  if (!DATUM.test(d.von)) throw new KarteiFehler('Bitte ein Datum angeben');
  const bis = d.bis && DATUM.test(d.bis) ? d.bis : d.von;
  if (bis < d.von) throw new KarteiFehler('„Bis“ liegt vor „Von“');
  if (!['geschlossen', 'urlaub', 'fortbildung'].includes(d.art)) throw new KarteiFehler('Unbekannte Art');
  const name = (d.name ?? '').trim() || FREIE_TAG_ART_TEXT[d.art as FreieTagArt];
  let tage = 0;
  for (let datum = d.von; datum <= bis; datum = tagPlus(datum, 1)) {
    if (++tage > 60) throw new KarteiFehler('Höchstens 60 Tage am Stück – bitte aufteilen');
    await db.query(
      `INSERT INTO freier_tag (datum, name, art, gesperrt, quelle, erstellt_von) VALUES ($1, $2, $3, true, 'hand', $4)
       ON CONFLICT (datum) DO UPDATE SET name = CASE WHEN freier_tag.art = 'feiertag' THEN freier_tag.name ELSE EXCLUDED.name END,
         art = CASE WHEN freier_tag.art = 'feiertag' THEN freier_tag.art ELSE EXCLUDED.art END, gesperrt = true`, [datum, name, d.art, wer],
    );
  }
  await protokolliere(db, { actor: wer, action: 'schliesstage_angelegt', details: { von: d.von, bis, art: d.art, tage } });
  return { tage };
}

/** Einen Tag sperren oder freigeben (auch Feiertage, z. B. Mariä Himmelfahrt) */
export async function freierTagSperren(db: Db, datum: string, gesperrt: boolean, wer: string): Promise<void> {
  if (!DATUM.test(datum)) throw new KarteiFehler('Unbekannter Tag');
  const r = await db.query('UPDATE freier_tag SET gesperrt = $2 WHERE datum = $1 RETURNING datum', [datum, gesperrt]);
  if (!r.rows.length) throw new KarteiFehler('Diesen Tag gibt es nicht in der Liste');
  await protokolliere(db, { actor: wer, action: gesperrt ? 'freier_tag_gesperrt' : 'freier_tag_offen', details: { datum } });
}

/** Schließ- und Brückentage entfernen; Feiertage bleiben (sie lassen sich nur öffnen) */
export async function freierTagLoeschen(db: Db, datum: string, wer: string): Promise<void> {
  if (!DATUM.test(datum)) throw new KarteiFehler('Unbekannter Tag');
  const r = await db.query("DELETE FROM freier_tag WHERE datum = $1 AND art <> 'feiertag' RETURNING datum", [datum]);
  if (!r.rows.length) throw new KarteiFehler('Feiertage werden nicht gelöscht – „offen“ setzen, wenn an dem Tag behandelt wird');
  await protokolliere(db, { actor: wer, action: 'freier_tag_geloescht', details: { datum } });
}

export async function freieTageDaten(db: Db, jahr?: number): Promise<FreieTageDaten> {
  const heute = Number(heuteBerlin().slice(0, 4));
  const j = jahr && Number.isInteger(jahr) ? jahr : heute;
  return { jahr: j, jahre: [...new Set([heute, heute + 1, j])].sort(), liste: await freieTageListe(db, j), brueckentage: await brueckentageBerechnen(db, j) };
}
