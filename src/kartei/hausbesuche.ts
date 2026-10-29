/**
 * Hausbesuche (W113): Behandlungsort je Termin und die Fahrtzeit davor und danach. Die Entfernung wird großzügig
 * aus der Konfiguration geschätzt – ohne fremden Routendienst, damit keine Patientenadresse das Haus verlässt:
 * Standard für unbekannte Orte, eine Zeit innerorts (zwischen zwei Hausbesuchen im selben Ort) und je Ort oder
 * PLZ eine eigene Zeile. Von Hand eingetragene Fahrtzeiten bleiben stehen (`fahrt_manuell`).
 */
import type { Db } from '../db/index.ts';
import { berlinMitternachtUtc, tagPlus } from '../zeit.ts';
import type { TerminKalender } from './patienten.ts';

// ── Wegbeschreibung (W113c) ─────────────────────────────────────────────────

/** Links, die Apple Karten bzw. Google Maps mit der Route vom aktuellen Standort zum Ziel öffnen (am Handy die App) */
export function routenLinks(ziel: string): { apple: string; google: string } {
  const z = encodeURIComponent(ziel);
  return { apple: `https://maps.apple.com/?daddr=${z}&dirflg=d`, google: `https://www.google.com/maps/dir/?api=1&destination=${z}&travelmode=driving` };
}

export interface Fahrt {
  /** hin = zum Hausbesuch; weiter = vom Hausbesuch zum nächsten Termin (Praxis oder nächster Hausbesuch) */
  art: 'hin' | 'weiter';
  /** Beginn der Fahrt und spätestes Ankommen (Beginn des Zieltermins) */
  beginn: string;
  bis: string;
  /** Ziel für die Wegbeschreibung – Adresse des Hausbesuchs oder der Praxis – und wie es heißt */
  ziel: string;
  zielText: string;
  patientId?: string;
  /** Beginnt in höchstens `vorlaufMin` Minuten oder läuft schon – dann fragt das Cockpit nach der Karten-App */
  jetzt: boolean;
}

/**
 * Die nächste anstehende Fahrt aus den Terminen eines Tages: vor jedem Hausbesuch die Fahrt hin, danach die Fahrt
 * weiter zum echten Folgetermin – Praxis, wenn der nächste Termin dort ist oder keiner folgt, sonst der nächste
 * Hausbesuch (die Fahrt zwischen zwei Hausbesuchen zählt einmal, als „weiter“). Start ist immer der aktuelle Standort.
 */
export function naechsteFahrt(
  termine: TerminKalender[], jetzt: Date, praxis: { adresse: string; name: string }, o: { vorlaufMin?: number; name?: (t: TerminKalender) => string } = {},
): Fahrt | null {
  const name = o.name ?? ((t) => `${t.vorname[0] ?? ''}. ${t.nachname[0] ?? ''}.`);
  const liste = termine.filter((t) => t.status === 'bestaetigt' || t.status === 'vorgeschlagen').sort((a, b) => a.beginn.localeCompare(b.beginn));
  const now = jetzt.getTime();
  const iso = (ms: number) => new Date(ms).toISOString();
  const hausbesuch = (t: TerminKalender | undefined): t is TerminKalender => t?.behandlungsort === 'hausbesuch' && Boolean(t.adresse);
  const kandidaten: Fahrt[] = [];
  liste.forEach((t, i) => {
    if (!hausbesuch(t)) return;
    if (!hausbesuch(liste[i - 1])) {
      kandidaten.push({ art: 'hin', beginn: iso(Date.parse(t.beginn) - (t.fahrtVorMin || 0) * 60_000), bis: t.beginn, ziel: t.adresse!, zielText: `Hausbesuch ${name(t)}${t.ort ? ` · ${t.ort}` : ''}`, patientId: t.patientId, jetzt: false });
    }
    const weiter = liste[i + 1];
    const zumHausbesuch = hausbesuch(weiter);
    kandidaten.push({
      art: 'weiter', beginn: t.ende, bis: weiter ? weiter.beginn : iso(Date.parse(t.ende) + (t.fahrtNachMin || 0) * 60_000),
      ziel: zumHausbesuch ? weiter.adresse! : praxis.adresse, zielText: zumHausbesuch ? `Hausbesuch ${name(weiter)}${weiter.ort ? ` · ${weiter.ort}` : ''}` : praxis.name,
      patientId: zumHausbesuch ? weiter.patientId : undefined, jetzt: false,
    });
  });
  const naechste = kandidaten.sort((a, b) => a.beginn.localeCompare(b.beginn)).find((k) => Date.parse(k.bis) >= now - 5 * 60_000);
  if (!naechste) return null;
  naechste.jetzt = now >= Date.parse(naechste.beginn) - (o.vorlaufMin ?? 15) * 60_000;
  return naechste;
}

/** Die eigenen Einstellungen direkt lesen – kein Import aus konfiguration.ts, das wäre ein Kreis über patienten.ts */
const einstellungen = async (db: Db): Promise<Record<string, string>> =>
  Object.fromEntries((await db.query<{ schluessel: string; wert: string }>("SELECT schluessel, wert FROM praxis_einstellung WHERE schluessel LIKE 'fahrtzeit_%' OR schluessel = 'termin_puffer_min'")).rows.map((r) => [r.schluessel, r.wert]));

export type Behandlungsort = 'praxis' | 'hausbesuch';
export type AdresseTyp = 'rechnung' | 'hausbesuch' | 'betreuer';

export const BEHANDLUNGSORT_TEXT: Record<Behandlungsort, string> = { praxis: 'Praxis', hausbesuch: 'Hausbesuch' };
export const ADRESSE_TYP_TEXT: Record<AdresseTyp, string> = { rechnung: 'Rechnungs-/Wohnadresse', hausbesuch: 'Hausbesuchadresse', betreuer: 'Vormund / Betreuer' };
export const ADRESSE_TYPEN = Object.keys(ADRESSE_TYP_TEXT) as AdresseTyp[];

export interface FahrtRegeln {
  /** Praxis ↔ unbekannter Ort */
  standardMin: number;
  /** zwischen zwei Hausbesuchen im selben Ort */
  innerortsMin: number;
  /** Ort (kleingeschrieben) oder PLZ → Minuten von der Praxis */
  orte: Map<string, number>;
}

const schluessel = (s: string | null | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** „Ort = Minuten“ je Zeile (auch „Ort: Minuten“ oder „87719 = 15“) – unbrauchbare Zeilen werden übergangen */
export function fahrtzeitOrteLesen(text: string | null | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const zeile of (text ?? '').split(/\r?\n|;/)) {
    const t = /^\s*([^=:]+?)\s*[=:]\s*(\d{1,3})\s*(?:min\.?|minuten)?\s*$/i.exec(zeile);
    if (t && Number(t[2]) <= 240) m.set(schluessel(t[1]), Number(t[2]));
  }
  return m;
}

export async function fahrtRegeln(db: Db): Promise<FahrtRegeln> {
  const e = await einstellungen(db);
  const minuten = (wert: string | undefined, standard: number) => (/^\d{1,3}$/.test(wert ?? '') && Number(wert) <= 240 ? Number(wert) : standard);
  return { standardMin: minuten(e.fahrtzeit_standard_min, 30), innerortsMin: minuten(e.fahrtzeit_innerorts_min, 10), orte: fahrtzeitOrteLesen(e.fahrtzeit_orte) };
}

export interface Ortsangabe { ort: string | null; plz: string | null }

/** Fahrtzeit Praxis → Ort: Zeile zur PLZ, sonst zum Ort, sonst der Standard */
export function fahrtzeitNach(o: Ortsangabe, regeln: FahrtRegeln): number {
  const plz = schluessel(o.plz);
  if (plz && regeln.orte.has(plz)) return regeln.orte.get(plz)!;
  const ort = schluessel(o.ort);
  if (ort && regeln.orte.has(ort)) return regeln.orte.get(ort)!;
  return regeln.standardMin;
}

/** Fahrtzeit zwischen zwei Hausbesuchen: im selben Ort (oder derselben PLZ) innerorts, sonst großzügig die längere der beiden Praxis-Zeiten */
export function fahrtzeitZwischen(a: Ortsangabe, b: Ortsangabe, regeln: FahrtRegeln): number {
  const gleicherOrt = (schluessel(a.plz) && schluessel(a.plz) === schluessel(b.plz)) || (schluessel(a.ort) && schluessel(a.ort) === schluessel(b.ort));
  return gleicherOrt ? regeln.innerortsMin : Math.max(fahrtzeitNach(a, regeln), fahrtzeitNach(b, regeln));
}

interface TagTermin {
  id: string;
  beginn: number;
  ende: number;
  hausbesuch: boolean;
  ort: string | null;
  plz: string | null;
  vor: number;
  nach: number;
  manuell: boolean;
  puffer: number;
}

/**
 * Fahrtzeiten aller Hausbesuche eines Tages neu rechnen (nach jeder Terminänderung an diesem Tag): vor dem Hausbesuch
 * die Fahrt von der Praxis bzw. vom vorherigen Hausbesuch, danach die Fahrt zurück – außer der nächste Termin ist
 * wieder ein Hausbesuch (dann gehört die Fahrt zu dessen „vor“). Zählt Überschneidungen zwischen Nachbarn.
 */
export async function fahrtenBerechnen(db: Db, datum: string, o: { regeln?: FahrtRegeln; pufferMin?: number } = {}): Promise<{ geaendert: number; kollisionen: number }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return { geaendert: 0, kollisionen: 0 };
  const regeln = o.regeln ?? await fahrtRegeln(db);
  const puffer = o.pufferMin ?? (Number((await einstellungen(db)).termin_puffer_min ?? 0) || 0);
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT t.id::text, t.beginn, t.ende, t.behandlungsort, pa.ort, pa.plz, t.fahrt_vor_min, t.fahrt_nach_min, t.fahrt_manuell, coalesce(ta.puffer_min, $3) AS puffer
     FROM termin t LEFT JOIN patient_adresse pa ON pa.id = t.adresse_id LEFT JOIN terminart ta ON ta.id = t.terminart_id
     WHERE t.beginn >= $1 AND t.beginn < $2 AND t.status IN ('vorgeschlagen', 'bestaetigt') ORDER BY t.beginn, t.id`,
    [berlinMitternachtUtc(datum), berlinMitternachtUtc(tagPlus(datum, 1)), Math.max(0, Math.round(puffer))],
  );
  const termine: TagTermin[] = rows.map((r) => ({
    id: String(r.id), beginn: new Date(r.beginn as string).getTime(), ende: new Date(r.ende as string).getTime(), hausbesuch: r.behandlungsort === 'hausbesuch',
    ort: (r.ort as string | null) ?? null, plz: (r.plz as string | null) ?? null, vor: Number(r.fahrt_vor_min), nach: Number(r.fahrt_nach_min), manuell: Boolean(r.fahrt_manuell), puffer: Number(r.puffer),
  }));
  let geaendert = 0;
  for (const [i, t] of termine.entries()) {
    if (t.manuell) continue;
    let vor = 0;
    let nach = 0;
    if (t.hausbesuch) {
      const vorher = termine[i - 1];
      const nachher = termine[i + 1];
      vor = vorher?.hausbesuch ? fahrtzeitZwischen(vorher, t, regeln) : fahrtzeitNach(t, regeln);
      nach = nachher?.hausbesuch ? 0 : fahrtzeitNach(t, regeln);
    }
    if (vor !== t.vor || nach !== t.nach) {
      await db.query('UPDATE termin SET fahrt_vor_min = $2, fahrt_nach_min = $3 WHERE id = $1', [t.id, vor, nach]);
      t.vor = vor;
      t.nach = nach;
      geaendert++;
    }
  }
  let kollisionen = 0;
  for (let i = 1; i < termine.length; i++) {
    const a = termine[i - 1]!;
    const b = termine[i]!;
    if (a.ende + (a.puffer + a.nach) * 60_000 > b.beginn - b.vor * 60_000 && (a.hausbesuch || b.hausbesuch)) kollisionen++;
  }
  return { geaendert, kollisionen };
}
