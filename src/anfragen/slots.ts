/**
 * Freie Zeiten für Terminvorschläge (Prompt 6): Öffnungszeiten je Wochentag, Dauer je Leistung, Puffer,
 * keine Feiertage (Bayern), nichts, was im Kalender schon belegt ist (Kartei-Termine, Haupt- und
 * Praxiskalender). Rechnet in deutscher Ortszeit über zeit.ts – auch am Tag der Zeitumstellung.
 */
import { berlinZeitUtc, datumBerlin, tagPlus, zeitBerlin } from '../zeit.ts';
import { istFeiertag } from './feiertage.ts';
import type { Zeitwunsch } from './erkennung.ts';

export interface Oeffnungszeit {
  /** 1 = Montag … 7 = Sonntag */
  tag: number;
  von: string;
  bis: string;
}

const TAGE: Record<string, number> = { mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6, so: 7 };
const TAG_NAMEN = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** „Mo 08:00-12:00,14:00-18:00; Di 08:00-18:00“ → Fenster; Fehler bei unlesbaren Angaben */
export function oeffnungszeitenLesen(text: string): Oeffnungszeit[] {
  const liste: Oeffnungszeit[] = [];
  for (const teil of text.split(';').map((s) => s.trim()).filter(Boolean)) {
    const m = /^([a-zäö]{2})\.?\s+(.+)$/i.exec(teil);
    const tag = m && TAGE[m[1]!.toLowerCase()];
    if (!m || !tag) throw new Error(`Öffnungszeit „${teil}“: Wochentag fehlt (Mo, Di, Mi, Do, Fr, Sa, So)`);
    for (const fenster of m[2]!.split(',').map((s) => s.trim()).filter(Boolean)) {
      const f = /^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/.exec(fenster);
      if (!f) throw new Error(`Öffnungszeit „${teil}“: Zeitfenster wie 08:00-12:00 erwartet`);
      const von = f[1]!.padStart(5, '0');
      const bis = f[2]!.padStart(5, '0');
      if (von >= bis) throw new Error(`Öffnungszeit „${teil}“: Ende liegt vor dem Beginn`);
      liste.push({ tag, von, bis });
    }
  }
  return liste;
}

export const oeffnungszeitenText = (liste: Oeffnungszeit[]): string => {
  const je = new Map<number, string[]>();
  for (const o of liste) je.set(o.tag, [...(je.get(o.tag) ?? []), `${o.von}-${o.bis}`]);
  return [...je.entries()].sort((a, b) => a[0] - b[0]).map(([t, f]) => `${TAG_NAMEN[t]} ${f.join(',')}`).join('; ');
};

export interface Belegt {
  beginn: string;
  ende: string;
}

export interface SlotRegeln {
  oeffnungszeiten: Oeffnungszeit[];
  dauerMin: number;
  pufferMin: number;
  /** Raster der Anfangszeiten in Minuten (Standard 15) */
  rasterMin?: number;
}

export interface Slot {
  beginn: string;
  ende: string;
}

/** Wochentag 1–7 eines Kalendertags */
export const wochentag = (datum: string): number => ((new Date(`${datum}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

const tageszeit = (iso: string): 'vormittag' | 'nachmittag' | 'abend' => {
  const h = Number(zeitBerlin(iso).slice(0, 2));
  return h < 12 ? 'vormittag' : h < 17 ? 'nachmittag' : 'abend';
};

/** Alle freien Anfangszeiten eines Zeitraums, Tag für Tag, frühestens `ab` */
export function freieSlots(o: { ab: string; tage: number; belegt: Belegt[]; regeln: SlotRegeln }): Slot[] {
  const raster = (o.regeln.rasterMin ?? 15) * 60_000;
  const dauer = o.regeln.dauerMin * 60_000;
  const puffer = o.regeln.pufferMin * 60_000;
  const abMs = new Date(o.ab).getTime();
  const belegt = o.belegt.map((b) => ({ von: new Date(b.beginn).getTime() - puffer, bis: new Date(b.ende).getTime() + puffer })).sort((a, b) => a.von - b.von);
  const slots: Slot[] = [];
  let datum = datumBerlin(o.ab);
  for (let i = 0; i < o.tage; i++, datum = tagPlus(datum, 1)) {
    if (istFeiertag(datum)) continue;
    const wt = wochentag(datum);
    for (const fenster of o.regeln.oeffnungszeiten.filter((f) => f.tag === wt)) {
      const von = new Date(berlinZeitUtc(datum, fenster.von)).getTime();
      const bis = new Date(berlinZeitUtc(datum, fenster.bis)).getTime();
      let t = Math.max(von, Math.ceil(abMs / raster) * raster);
      while (t + dauer <= bis) {
        const konflikt = belegt.find((b) => b.von < t + dauer && b.bis > t);
        if (konflikt) {
          t = Math.max(t + raster, Math.ceil(konflikt.bis / raster) * raster);
          continue;
        }
        slots.push({ beginn: new Date(t).toISOString(), ende: new Date(t + dauer).toISOString() });
        t += raster;
      }
    }
  }
  return slots;
}

/**
 * Drei Vorschläge: möglichst passend zum Wunsch (Wochentag, Tageszeit, Datum, Uhrzeit), auf verschiedene
 * Tage verteilt; reicht das nicht, wird mit den nächsten freien Zeiten aufgefüllt.
 */
export function vorschlaege(o: { ab: string; tage: number; belegt: Belegt[]; regeln: SlotRegeln; wunsch?: Partial<Zeitwunsch>; anzahl?: number }): Slot[] {
  const anzahl = o.anzahl ?? 3;
  const alle = freieSlots(o);
  const w = o.wunsch ?? {};
  const passt = (s: Slot) => {
    const datum = datumBerlin(s.beginn);
    if (w.daten?.length && !w.daten.includes(datum)) return false;
    if (w.wochentage?.length && !w.wochentage.includes(wochentag(datum))) return false;
    if (w.tageszeiten?.length && !w.tageszeiten.includes(tageszeit(s.beginn))) return false;
    if (w.uhrzeiten?.length && !w.uhrzeiten.includes(zeitBerlin(s.beginn))) return false;
    return true;
  };
  const gewaehlt: Slot[] = [];
  const tage = new Set<string>();
  const nimm = (liste: Slot[], jeTag: boolean) => {
    for (const s of liste) {
      if (gewaehlt.length >= anzahl) return;
      if (gewaehlt.includes(s)) continue;
      const datum = datumBerlin(s.beginn);
      if (jeTag && tage.has(datum)) continue;
      gewaehlt.push(s);
      tage.add(datum);
    }
  };
  const passende = alle.filter(passt);
  nimm(passende, true);
  nimm(passende, false);
  nimm(alle, true);
  nimm(alle, false);
  return gewaehlt.sort((a, b) => a.beginn.localeCompare(b.beginn));
}
