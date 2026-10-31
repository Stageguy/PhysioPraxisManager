/**
 * Mittagspause (W126): jeden Tag eine Pause um die Mittagszeit, Standard 60 Minuten (Konfiguration `mittagspause_min`),
 * je Tag änderbar (Tabelle mittagspause_tag, 0 = keine). Sie richtet sich nach den Terminen: Beginn um 12:00 oder gleich
 * nach dem Termin, der über 12:00 läuft; Ende nach der eingestellten Dauer oder früher, wenn der nächste Termin beginnt.
 * Die Pause ist belegt (keine Buchung, kein Vorschlag), zählt aber weder als frei noch als gebucht.
 */
import { protokolliere, type Db } from '../db/index.ts';
import { tag } from '../db/werte.ts';
import { freieFenster } from '../buchung/angebot.ts';
import { oeffnungszeitenLesen, OEFFNUNGSZEITEN_STANDARD, wochentag, type Belegt } from '../anfragen/slots.ts';
import { berlinMitternachtUtc, berlinZeitUtc, datumBerlin, tagPlus } from '../zeit.ts';
import { einstellungen } from './konfiguration.ts';
import { KarteiFehler } from './patienten/basis.ts';

export const MITTAGSPAUSE_STANDARD = 60;
/** Die Pause liegt im Fenster 11:00–15:00, Ziel ist 12:00 */
const FENSTER_VON = '11:00';
const FENSTER_BIS = '15:00';
const MITTAG = '12:00';

export interface Mittagspause {
  beginn: string;
  ende: string;
  /** tatsächliche Länge – kürzer als eingestellt, wenn der nächste Termin früher beginnt */
  minuten: number;
}

/** Ein Tag aus Sicht der Pause: eingestellte Dauer, ob eigens gesetzt, und wo sie liegt (null = keine, etwa 0 Minuten oder kein Platz) */
export interface MittagspauseTag {
  datum: string;
  minuten: number;
  eigen: boolean;
  pause: Mittagspause | null;
}

export const mittagspauseMinuten = (e: Record<string, string | undefined>): number => {
  const n = Number(e.mittagspause_min);
  return e.mittagspause_min !== undefined && Number.isInteger(n) && n >= 0 && n <= 240 ? n : MITTAGSPAUSE_STANDARD;
};

export async function mittagspauseAusnahmen(db: Db, vonTag: string, bisTag: string): Promise<Map<string, number>> {
  const { rows } = await db.query<{ datum: unknown; minuten: unknown }>('SELECT datum, minuten FROM mittagspause_tag WHERE datum >= $1 AND datum <= $2', [vonTag, bisTag]);
  return new Map(rows.map((r) => [tag(r.datum)!, Number(r.minuten)]));
}

/**
 * Die Pause eines Tages legen: in der freien Zeit (Öffnungsfenster minus Belegtes) mit der größten Überdeckung des
 * Mittagsfensters. Beginn 12:00, wenn frei; läuft ein Termin über 12:00, gleich danach; endet die freie Zeit vor 12:00,
 * so spät wie möglich darin. Ende nach der Dauer oder am nächsten Termin.
 */
export function mittagspauseLegen(datum: string, fenster: { beginn: string; ende: string }[], belegt: Belegt[], minuten: number): Mittagspause | null {
  if (minuten <= 0 || !fenster.length) return null;
  const frei = freieFenster(fenster, belegt.filter((b) => b.art !== 'pause'), { pufferMin: 0, ab: '1970-01-01T00:00:00Z' });
  const ms = (s: string) => Date.parse(s);
  const von = ms(berlinZeitUtc(datum, FENSTER_VON));
  const bis = ms(berlinZeitUtc(datum, FENSTER_BIS));
  const mittag = ms(berlinZeitUtc(datum, MITTAG));
  const dauer = minuten * 60_000;
  // Je freier Zeit im Mittagsfenster: wo die Pause darin läge (12:00, sonst gleich nach dem Termin davor; passt die volle
  // Dauer nicht mehr hinein, rückt sie nach vorn bis an den Termin davor) und wie lang sie würde
  const lagen = frei.flatMap((f) => {
    const gb = ms(f.beginn);
    const ge = ms(f.ende);
    if (Math.min(ge, bis) - Math.max(gb, von) <= 0) return [];
    let start = gb <= mittag && mittag < ge ? mittag : gb > mittag ? gb : Math.max(gb, ge - dauer);
    if (ge - start < dauer && gb < start) start = Math.max(gb, ge - dauer);
    // „um die Mittagszeit“: nicht vor 11:00 beginnen – lieber verkürzt oder eine spätere Lücke
    start = Math.max(start, von);
    const ende = Math.min(start + dauer, ge);
    return ende - start >= 60_000 ? [{ start, ende, voll: ende - start >= dauer, abstand: Math.abs(start - mittag) }] : [];
  });
  if (!lagen.length) return null;
  // Erste Wahl: eine Lage, in die die volle Pause passt – die am nächsten an 12:00; sonst die längste (verkürzte) Pause
  const volle = lagen.filter((l) => l.voll).sort((a, b) => a.abstand - b.abstand);
  const lage = volle[0] ?? lagen.sort((a, b) => (b.ende - b.start) - (a.ende - a.start) || a.abstand - b.abstand)[0]!;
  return { beginn: new Date(lage.start).toISOString(), ende: new Date(lage.ende).toISOString(), minuten: Math.round((lage.ende - lage.start) / 60_000) };
}

/** Je Tag des Zeitraums die Pause aus Konfiguration, Tagesausnahmen, Öffnungszeiten und dem Belegten (ohne frühere Pausen) */
export async function mittagspausenTage(db: Db, von: string, bis: string, belegt: Belegt[]): Promise<MittagspauseTag[]> {
  const e = await einstellungen(db);
  const standard = mittagspauseMinuten(e);
  const oeff = oeffnungszeitenLesen(e.oeffnungszeiten ?? OEFFNUNGSZEITEN_STANDARD);
  const erster = datumBerlin(von);
  const letzter = datumBerlin(new Date(Date.parse(bis) - 1).toISOString());
  if (letzter < erster) return [];
  const ausnahmen = await mittagspauseAusnahmen(db, erster, letzter);
  const tage: MittagspauseTag[] = [];
  for (let d = erster; d <= letzter; d = tagPlus(d, 1)) {
    const minuten = ausnahmen.get(d) ?? standard;
    const fenster = oeff.filter((f) => f.tag === wochentag(d)).map((f) => ({ beginn: berlinZeitUtc(d, f.von), ende: berlinZeitUtc(d, f.bis) }));
    const tagVon = berlinMitternachtUtc(d);
    const tagBis = berlinMitternachtUtc(tagPlus(d, 1));
    const des = belegt.filter((b) => b.art !== 'pause' && b.beginn < tagBis && b.ende > tagVon);
    tage.push({ datum: d, minuten, eigen: ausnahmen.has(d), pause: mittagspauseLegen(d, fenster, des, minuten) });
  }
  return tage;
}

/** Die Pausen als belegte Zeiten – so sehen Buchungsseite, Vorschläge und Lücken sie */
export async function mittagspausenBelegt(db: Db, von: string, bis: string, belegt: Belegt[]): Promise<Belegt[]> {
  return (await mittagspausenTage(db, von, bis, belegt)).filter((t) => t.pause).map((t) => ({ beginn: t.pause!.beginn, ende: t.pause!.ende, art: 'pause' as const, eigen: t.eigen }));
}

/** Dauer für einen Tag setzen (0 = keine Pause); null nimmt die Ausnahme zurück – es gilt wieder der Standard */
export async function mittagspauseTagSetzen(db: Db, datum: string, minuten: number | null, wer: string): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || Number.isNaN(Date.parse(`${datum}T12:00:00Z`))) throw new KarteiFehler('Kein gültiges Datum für die Mittagspause');
  if (minuten === null) {
    await db.query('DELETE FROM mittagspause_tag WHERE datum = $1', [datum]);
  } else {
    if (!Number.isInteger(minuten) || minuten < 0 || minuten > 240) throw new KarteiFehler('Mittagspause: ganze Minuten von 0 bis 240, keine negativen Zahlen');
    await db.query(
      'INSERT INTO mittagspause_tag (datum, minuten, geaendert_von) VALUES ($1, $2, $3) ON CONFLICT (datum) DO UPDATE SET minuten = EXCLUDED.minuten, geaendert_am = now(), geaendert_von = EXCLUDED.geaendert_von',
      [datum, minuten, wer],
    );
  }
  await protokolliere(db, { actor: wer, action: 'mittagspause_tag', objectType: 'kalender', objectId: datum, details: { minuten } });
}
