/**
 * Terminvorschläge zu einem Rezept (W110): nach der Anzahl der Behandlungen, in der Frequenz des Rezepts (z. B. 2× pro
 * Woche), mit der Dauer aus der Regelbehandlungszeit. Die Vorschläge folgen einem Muster – dieselben Wochentage und
 * Uhrzeiten Woche für Woche, soweit frei –, denn Patienten merken sich „immer montags und donnerstags um 9“.
 * Lilli hakt ab, was passt, und legt die Termine mit einem Klick an (Kartei + Kalender).
 */
import type { Db } from '../db/index.ts';
import type { GraphClient } from '../graph.ts';
import { belegteZeiten } from '../anfragen/kalender.ts';
import { slotRegeln } from '../anfragen/dienst.ts';
import { freieSlots, wochentag, type Belegt, type Slot, type SlotRegeln } from '../anfragen/slots.ts';
import { berlinMitternachtUtc, datumBerlin, heuteBerlin, tagPlus, zeitBerlin } from '../zeit.ts';
import { einstellungen } from './konfiguration.ts';
import { KarteiFehler, patientLesen, termine, verordnungen, type Patient, type TerminKurz, type VerordnungKurz } from './patienten.ts';
import { dauerFuer } from './regelzeiten.ts';

export type Tageszeit = 'vormittag' | 'nachmittag' | 'abend';

const ZAHLWORT: Record<string, number> = { ein: 1, zwei: 2, drei: 3, vier: 4, fünf: 5 };

/** „2× pro Woche“, „3 x wöchentlich“, „zweimal die Woche“, „2/Woche“, „täglich“ → Behandlungen je Woche (1–5); nichts erkannt → Vorgabe */
export function proWocheAusFrequenz(frequenz: string | null | undefined, vorgabe = 2): number {
  const f = (frequenz ?? '').toLowerCase().replace(/(ein|zwei|drei|vier|fünf)\s*-?\s*mal/g, (_, w: string) => `${ZAHLWORT[w]} x`);
  if (!f.trim()) return vorgabe;
  if (/alle (?:zwei|2) wochen|14-?tägig|zweiwöchentlich/.test(f)) return 1;
  if (/täglich|jeden tag|werktäglich/.test(f)) return 5;
  // „1–2× pro Woche“ nimmt die obere Zahl: der Treffer am „×“ gewinnt vor dem am Bindestrich
  const m = /(\d+)\s*(?:×|x|mal|-mal)?\s*(?:pro|je|\/|in der|die)?\s*w(?:o|ö)ch/.exec(f) ?? /(\d+)\s*(?:×|x)/.exec(f);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 5) : vorgabe;
}

const tageszeitVon = (iso: string): Tageszeit => {
  const h = Number(zeitBerlin(iso).slice(0, 2));
  return h < 12 ? 'vormittag' : h < 17 ? 'nachmittag' : 'abend';
};

/** Montag der Woche eines Tages */
const montag = (datum: string): string => tagPlus(datum, 1 - wochentag(datum));

/**
 * Eine Serie aus den freien Slots: je Woche `proWoche` Tage mit Abstand, aus der ersten Woche entsteht das Muster
 * (Wochentag + Uhrzeit), das die folgenden Wochen nachbilden – ersatzweise derselbe Tag zu anderer Zeit, sonst ein
 * anderer Tag der Woche.
 */
export function serieVorschlagen(o: { anzahl: number; proWoche: number; dauerMin: number; ab: string; belegt: Belegt[]; regeln: SlotRegeln; tageszeit?: Tageszeit; wochen?: number }): Slot[] {
  if (o.anzahl <= 0) return [];
  const proWoche = Math.min(Math.max(1, Math.round(o.proWoche)), 5);
  const wochen = o.wochen ?? Math.ceil(o.anzahl / proWoche) + 6;
  const alle = freieSlots({ ab: o.ab, tage: wochen * 7 + 7, belegt: o.belegt, regeln: { ...o.regeln, dauerMin: o.dauerMin } });
  const jeTag = new Map<string, Slot[]>();
  for (const s of alle) {
    const d = datumBerlin(s.beginn);
    jeTag.set(d, [...(jeTag.get(d) ?? []), s]);
  }
  const passtZeit = (s: Slot) => !o.tageszeit || tageszeitVon(s.beginn) === o.tageszeit;
  const ersterSlot = (datum: string, zeit?: string): Slot | undefined => {
    const liste = jeTag.get(datum) ?? [];
    if (zeit) {
      const genau = liste.find((s) => zeitBerlin(s.beginn) === zeit);
      if (genau) return genau;
      // dieselbe Tageszeit zuerst, dann der nächste Slot nach der gewünschten Zeit, dann irgendeiner
      const ziel = Number(zeit.slice(0, 2)) * 60 + Number(zeit.slice(3, 5));
      const nah = [...liste].sort((a, b) => Math.abs(minuten(a) - ziel) - Math.abs(minuten(b) - ziel));
      return nah.find(passtZeit) ?? nah[0];
    }
    return liste.find(passtZeit) ?? liste[0];
  };
  const minuten = (s: Slot) => { const z = zeitBerlin(s.beginn); return Number(z.slice(0, 2)) * 60 + Number(z.slice(3, 5)); };
  const abstand = proWoche >= 5 ? 1 : proWoche === 4 ? 1 : proWoche === 3 ? 2 : proWoche === 2 ? 3 : 7;
  const gewaehlt: Slot[] = [];
  let muster: { wt: number; zeit: string }[] = [];
  const start = montag(datumBerlin(o.ab));
  for (let w = 0; w < wochen && gewaehlt.length < o.anzahl; w++) {
    const wochenstart = tagPlus(start, w * 7);
    const tage = Array.from({ length: 7 }, (_, i) => tagPlus(wochenstart, i)).filter((d) => jeTag.has(d));
    const picks: Slot[] = [];
    if (!muster.length) {
      let letzter = -99;
      for (const d of tage) {
        const wt = wochentag(d);
        if (wt - letzter < abstand) continue;
        const s = ersterSlot(d);
        if (!s) continue;
        picks.push(s);
        letzter = wt;
        if (picks.length >= proWoche) break;
      }
      // Lücken auffüllen, wenn der Abstand nicht reicht (z. B. nur zwei Öffnungstage)
      for (const d of tage) {
        if (picks.length >= proWoche) break;
        if (picks.some((p) => datumBerlin(p.beginn) === d)) continue;
        const s = ersterSlot(d);
        if (s) picks.push(s);
      }
      if (picks.length) muster = picks.map((p) => ({ wt: wochentag(datumBerlin(p.beginn)), zeit: zeitBerlin(p.beginn) }));
    } else {
      const benutzt = new Set<string>();
      for (const m of muster) {
        const d = tagPlus(wochenstart, m.wt - 1);
        const s = jeTag.has(d) && !benutzt.has(d) ? ersterSlot(d, m.zeit) : undefined;
        if (s) { picks.push(s); benutzt.add(d); continue; }
        // Ersatztag: der nächste freie Tag der Woche, der noch nicht genutzt ist
        const ersatz = tage.find((x) => !benutzt.has(x) && Math.abs(wochentag(x) - m.wt) <= 2);
        const e = ersatz ? ersterSlot(ersatz, m.zeit) : undefined;
        if (e) { picks.push(e); benutzt.add(ersatz!); }
      }
    }
    for (const p of picks.sort((a, b) => a.beginn.localeCompare(b.beginn))) {
      if (gewaehlt.length >= o.anzahl) break;
      gewaehlt.push(p);
    }
  }
  return gewaehlt;
}

export interface RezeptTermineDaten {
  patient: Patient;
  verordnung: VerordnungKurz;
  /** schon geplante (kommende) Termine auf dem Rezept */
  geplant: TerminKurz[];
  /** noch zu planende Behandlungen */
  offen: number;
  dauerMin: number;
  dauerHerkunft: string;
  proWoche: number;
  frequenzErkannt: boolean;
  ab: string;
  tageszeit: Tageszeit | null;
  vorschlaege: Slot[];
}

type LeseGraph = Pick<GraphClient, 'get' | 'paginate' | 'post'>;

/** Seite „Terminvorschläge“: Rezept, offene Behandlungen, Vorschläge nach Muster */
export async function rezeptTermineDaten(
  db: Db, graph: LeseGraph | undefined, t: Parameters<typeof patientLesen>[1], patientId: string, verordnungId: string,
  o: { ab?: string; proWoche?: number; dauerMin?: number; tageszeit?: string; jetzt?: Date } = {},
): Promise<RezeptTermineDaten | undefined> {
  const patient = await patientLesen(db, t, patientId);
  if (!patient) return undefined;
  const verordnung = (await verordnungen(db, { patientId })).find((v) => v.id === verordnungId);
  if (!verordnung) return undefined;
  const jetzt = o.jetzt ?? new Date();
  const geplant = (await termine(db, patientId, { kommend: true })).filter((x) => x.verordnungId === verordnungId && ['bestaetigt', 'vorgeschlagen'].includes(x.status));
  const offen = Math.max(0, verordnung.anzahlVerordnet - verordnung.abgehakt - geplant.length);
  const e = await einstellungen(db);
  const standard = await dauerFuer(db, verordnung.leistungNummer, Number(e.termin_dauer_min ?? 30) || 30);
  const dauerMin = o.dauerMin && o.dauerMin > 0 ? o.dauerMin : standard.dauerMin;
  const frequenzErkannt = proWocheAusFrequenz(verordnung.frequenz, 0) > 0;
  const proWoche = o.proWoche && o.proWoche > 0 ? Math.min(o.proWoche, 5) : proWocheAusFrequenz(verordnung.frequenz, 2);
  const tageszeit = o.tageszeit && ['vormittag', 'nachmittag', 'abend'].includes(o.tageszeit) ? (o.tageszeit as Tageszeit) : null;
  const heute = datumBerlin(jetzt.toISOString());
  const abTag = o.ab && /^\d{4}-\d{2}-\d{2}$/.test(o.ab) && o.ab >= heute ? o.ab : tagPlus(heute, 1);
  let vorschlaege: Slot[] = [];
  if (offen > 0) {
    const regeln = await slotRegeln(db);
    const wochen = Math.ceil(offen / proWoche) + 6;
    const belegt = await belegteZeiten(graph, db, berlinMitternachtUtc(abTag), berlinMitternachtUtc(tagPlus(abTag, wochen * 7 + 7)));
    vorschlaege = serieVorschlagen({ anzahl: offen, proWoche, dauerMin, ab: berlinMitternachtUtc(abTag), belegt, regeln, tageszeit: tageszeit ?? undefined, wochen });
  }
  return { patient, verordnung, geplant, offen, dauerMin: dauerMin === standard.dauerMin ? standard.dauerMin : dauerMin, dauerHerkunft: o.dauerMin && o.dauerMin !== standard.dauerMin ? 'von Hand geändert' : standard.herkunft, proWoche, frequenzErkannt, ab: abTag, tageszeit, vorschlaege };
}

/** Aus dem Formular: Beginne als „JJJJ-MM-TTTHH:MM“ (Berliner Zeit) → Datum/Zeit-Paare, geprüft */
export function terminWerte(eingaben: string[], dauerMin: number): { datum: string; zeit: string; dauerMin: number }[] {
  const liste = eingaben.map((s) => s.trim()).filter(Boolean);
  if (!liste.length) throw new KarteiFehler('Kein Termin ausgewählt');
  if (liste.length > 60) throw new KarteiFehler('Höchstens 60 Termine auf einmal');
  if (!(dauerMin > 0)) throw new KarteiFehler('Die Dauer muss größer 0 sein');
  const heute = heuteBerlin();
  return [...new Set(liste)].map((s) => {
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(s);
    if (!m) throw new KarteiFehler(`Unbekannter Termin „${s}“`);
    if (m[1]! < heute) throw new KarteiFehler('Termine liegen in der Vergangenheit');
    return { datum: m[1]!, zeit: m[2]!, dauerMin };
  });
}
