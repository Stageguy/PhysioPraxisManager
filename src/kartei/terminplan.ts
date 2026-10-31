/**
 * Terminkalender zum Buchen (W116): Monatsplan mit Lücken und Zählern je Dauer, Suche „Nächster freier Termin“ je
 * Woche, nächste freie Zeiten für „Heute im Blick“. Belegt sind Kartei-Termine samt Pause danach (W116a),
 * Reservierungen offener Anfragen und Outlook-Termine; frei ist, was in den Öffnungszeiten übrig bleibt.
 */
import type { Db } from '../db/index.ts';
import { mittagspausenTage, type Mittagspause, type MittagspauseTag } from './mittagspause.ts';
import type { GraphClient } from '../graph.ts';
import { slotRegeln } from '../anfragen/dienst.ts';
import { belegteZeiten } from '../anfragen/kalender.ts';
import { tagGesperrt, wochentag, type Belegt, type Oeffnungszeit, type SlotRegeln } from '../anfragen/slots.ts';
import { freieFenster } from '../buchung/angebot.ts';
import { berlinMitternachtUtc, berlinZeitUtc, datumBerlin, tagPlus } from '../zeit.ts';
import { freieTageZeitraum } from './freie-tage.ts';
import { outlookBloecke, type KalenderBlock } from './outlook-termine.ts';
import { termineZeitraum, type TerminKalender } from './patienten.ts';

type LeseGraph = Pick<GraphClient, 'get' | 'paginate' | 'post'>;

/** Dauern, nach denen Lilli sucht und die der Monat zählt */
export const DAUERN = [20, 30, 40, 60] as const;

export interface Luecke { beginn: string; ende: string; minuten: number }

export interface TagesPlan {
  datum: string;
  /** zu = keine Öffnungszeit oder gesperrt · frei = nichts belegt · teilweise = Termine und noch Platz · voll = kein Platz für 20 Min. · vergangen */
  stand: 'zu' | 'frei' | 'teilweise' | 'voll' | 'vergangen';
  freierTag: string | null;
  termine: TerminKalender[];
  bloecke: KalenderBlock[];
  luecken: Luecke[];
  oeffnung: Oeffnungszeit[];
  /** Mittagspause des Tages (W126) – blau, weder frei noch gebucht */
  mittagspause?: (Mittagspause & { eigen: boolean }) | null;
}

export interface MonatsPlan {
  jahr: number;
  monat: number;
  heute: string;
  tage: TagesPlan[];
  /** Freie Termine je Dauer ab heute bis Monatsende */
  frei: { dauer: number; anzahl: number }[];
  pufferMin: number;
  /** Standarddauer eines Termins (Konfiguration) – Vorbelegung beim Klick in eine Lücke */
  dauerMin: number;
  postfach: boolean;
  fehler?: string;
}

export interface WochenSuche { dauer: number; wochenstart: string; tage: { datum: string; zeiten: string[] }[] }

const minuten = (a: string, b: string): number => Math.round((Date.parse(b) - Date.parse(a)) / 60_000);
export const montagVon = (datum: string): string => tagPlus(datum, 1 - wochentag(datum));

/** Einträge nach deutschem Kalendertag ihres Beginns gruppieren – einmal rechnen statt je Tag filtern */
function nachTag<T extends { beginn: string }>(liste: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const e of liste) {
    const tag = datumBerlin(e.beginn);
    const bisher = m.get(tag);
    if (bisher) bisher.push(e); else m.set(tag, [e]);
  }
  return m;
}
const leer: never[] = [];

/** Lücken eines Tages: Öffnungsfenster minus belegte Blöcke (deren Pause steckt schon im Ende), frühestens `ab` */
export function tagesLuecken(datum: string, regeln: SlotRegeln, belegt: Belegt[], ab?: string): Luecke[] {
  if (tagGesperrt(datum, regeln)) return [];
  const offen = regeln.oeffnungszeiten.filter((f) => f.tag === wochentag(datum)).map((f) => ({ beginn: berlinZeitUtc(datum, f.von), ende: berlinZeitUtc(datum, f.bis) }));
  return freieFenster(offen, belegt, { pufferMin: 0, ab: ab ?? '1970-01-01T00:00:00Z' }).map((f) => ({ beginn: f.beginn, ende: f.ende, minuten: minuten(f.beginn, f.ende) }));
}

/** Wie viele Termine der Dauer in die Lücken passen – mit Pause zwischen je zwei */
export const passen = (luecken: Luecke[], dauer: number, puffer: number): number =>
  luecken.reduce((n, l) => n + Math.max(0, Math.floor((l.minuten + puffer) / (dauer + puffer))), 0);

/** Anfangszeiten für die Suche: dicht gepackt (Dauer + Pause) ab Lückenbeginn, höchstens `max` je Lücke */
export function anfaenge(luecken: Luecke[], dauer: number, puffer: number, max = 6): string[] {
  const liste: string[] = [];
  for (const l of luecken) {
    const ende = Date.parse(l.ende);
    for (let t = Date.parse(l.beginn), n = 0; t + dauer * 60_000 <= ende && n < max; t += (dauer + puffer) * 60_000, n++) liste.push(new Date(t).toISOString());
  }
  return liste;
}

/** Belegte Zeiten – fällt das Postfach aus, zählen nur Kartei und Reservierungen */
async function belegtSicher(graph: LeseGraph | undefined, db: Db, von: string, bis: string, pufferMin: number): Promise<{ belegt: Belegt[]; fehler?: string }> {
  try {
    return { belegt: await belegteZeiten(graph, db, von, bis, { pufferMin }) };
  } catch (err) {
    if (!graph) throw err;
    console.warn(`Kalender: ${(err as Error).message.slice(0, 200)}`);
    return { belegt: await belegteZeiten(undefined, db, von, bis, { pufferMin }), fehler: 'Der Kalender des Postfachs war nicht erreichbar – Outlook-Termine fehlen in dieser Ansicht.' };
  }
}

const monatsGrenzen = (jahr: number, monat: number) => {
  const erster = `${jahr}-${String(monat).padStart(2, '0')}-01`;
  const naechster = monat === 12 ? `${jahr + 1}-01-01` : `${jahr}-${String(monat + 1).padStart(2, '0')}-01`;
  return { erster, naechster };
};

export async function monatsPlan(db: Db, graph: LeseGraph | undefined, jahr: number, monat: number, o: { jetzt?: Date } = {}): Promise<MonatsPlan> {
  const jetzt = o.jetzt ?? new Date();
  const heute = datumBerlin(jetzt.toISOString());
  const { erster, naechster } = monatsGrenzen(jahr, monat);
  const von = berlinMitternachtUtc(erster);
  const bis = berlinMitternachtUtc(naechster);
  const regeln = await slotRegeln(db);
  const [termine, freieTage, { belegt, fehler }] = await Promise.all([termineZeitraum(db, von, bis), freieTageZeitraum(db, erster, tagPlus(naechster, -1)), belegtSicher(graph, db, von, bis, regeln.pufferMin)]);
  let bloecke: KalenderBlock[] = [];
  if (graph && !fehler) {
    try { bloecke = await outlookBloecke(db, graph, von, bis, regeln.oeffnungszeiten); } catch (err) { console.warn(`Kalender: ${(err as Error).message.slice(0, 200)}`); }
  }
  const termineJeTag = nachTag(termine);
  const bloeckeJeTag = nachTag(bloecke);
  const belegtJeTag = nachTag(belegt);
  const tage: TagesPlan[] = [];
  for (let d = erster; d < naechster; d = tagPlus(d, 1)) {
    const oeffnung = tagGesperrt(d, regeln) ? [] : regeln.oeffnungszeiten.filter((f) => f.tag === wochentag(d));
    const tTermine = termineJeTag.get(d) ?? leer;
    const tBloecke = bloeckeJeTag.get(d) ?? leer;
    const luecken = d < heute ? [] : tagesLuecken(d, regeln, belegtJeTag.get(d) ?? leer, d === heute ? jetzt.toISOString() : undefined);
    const stand: TagesPlan['stand'] = d < heute ? 'vergangen'
      : !oeffnung.length ? 'zu'
        : !tTermine.length && !tBloecke.length && luecken.length ? 'frei'
          : passen(luecken, 20, regeln.pufferMin) ? 'teilweise' : 'voll';
    const pause = oeffnung.length ? (belegtJeTag.get(d) ?? leer).find((b) => b.art === 'pause') : undefined;
    tage.push({ datum: d, stand, freierTag: freieTage[d] ?? null, termine: tTermine, bloecke: tBloecke, luecken, oeffnung,
      mittagspause: pause ? { beginn: pause.beginn, ende: pause.ende, minuten: Math.round((Date.parse(pause.ende) - Date.parse(pause.beginn)) / 60_000), eigen: Boolean(pause.eigen) } : null });
  }
  const frei = DAUERN.map((dauer) => ({ dauer, anzahl: tage.filter((t) => t.datum >= heute).reduce((n, t) => n + passen(t.luecken, dauer, regeln.pufferMin), 0) }));
  return { jahr, monat, heute, tage, frei, pufferMin: regeln.pufferMin, dauerMin: regeln.dauerMin, postfach: Boolean(graph), fehler };
}

/** Mittagspausen eines Zeitraums für Tages- und Wochenansicht (W126): je Tag Dauer, ob eigens gesetzt, Lage */
export async function mittagspausenZeitraum(db: Db, graph: LeseGraph | undefined, von: string, bis: string): Promise<MittagspauseTag[]> {
  const regeln = await slotRegeln(db);
  let belegt: Belegt[];
  try {
    belegt = await belegteZeiten(graph, db, von, bis, { pufferMin: regeln.pufferMin, ohneMittagspause: true });
  } catch (err) {
    console.warn(`Mittagspause: ${(err as Error).message.slice(0, 160)}`);
    belegt = await belegteZeiten(undefined, db, von, bis, { pufferMin: regeln.pufferMin, ohneMittagspause: true });
  }
  return mittagspausenTage(db, von, bis, belegt);
}

/** Freie Anfangszeiten einer Woche für eine Dauer – das Suchfenster der Monatsansicht */
export async function freieWoche(db: Db, graph: LeseGraph | undefined, o: { dauer: number; wochenstart: string; jetzt?: Date }): Promise<WochenSuche> {
  const jetzt = o.jetzt ?? new Date();
  const heute = datumBerlin(jetzt.toISOString());
  const start = montagVon(o.wochenstart);
  const regeln = await slotRegeln(db);
  const { belegt } = await belegtSicher(graph, db, berlinMitternachtUtc(start), berlinMitternachtUtc(tagPlus(start, 7)), regeln.pufferMin);
  const belegtJeTag = nachTag(belegt);
  const tage = Array.from({ length: 7 }, (_, i) => tagPlus(start, i)).map((datum) => ({
    datum,
    zeiten: datum < heute ? [] : anfaenge(tagesLuecken(datum, regeln, belegtJeTag.get(datum) ?? leer, datum === heute ? jetzt.toISOString() : undefined), o.dauer, regeln.pufferMin),
  }));
  return { dauer: o.dauer, wochenstart: start, tage };
}

/** Die nächsten freien Zeiten (je Lücke eine) für die Standarddauer – „Heute im Blick“ */
export async function naechsteFreie(db: Db, graph: LeseGraph | undefined, o: { anzahl?: number; tage?: number; jetzt?: Date } = {}): Promise<{ beginn: string; ende: string }[]> {
  const jetzt = o.jetzt ?? new Date();
  const heute = datumBerlin(jetzt.toISOString());
  const regeln = await slotRegeln(db);
  const tage = o.tage ?? 14;
  const { belegt } = await belegtSicher(graph, db, berlinMitternachtUtc(heute), berlinMitternachtUtc(tagPlus(heute, tage)), regeln.pufferMin);
  const belegtJeTag = nachTag(belegt);
  const liste: { beginn: string; ende: string }[] = [];
  for (let i = 0, datum = heute; i < tage && liste.length < (o.anzahl ?? 2); i++, datum = tagPlus(datum, 1)) {
    const luecken = tagesLuecken(datum, regeln, belegtJeTag.get(datum) ?? leer, datum === heute ? jetzt.toISOString() : undefined);
    for (const l of luecken) {
      if (l.minuten < regeln.dauerMin || liste.length >= (o.anzahl ?? 2)) continue;
      liste.push({ beginn: l.beginn, ende: new Date(Date.parse(l.beginn) + regeln.dauerMin * 60_000).toISOString() });
    }
  }
  return liste;
}
