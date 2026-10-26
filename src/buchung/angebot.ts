/**
 * Das Angebot der Buchungsseite (W96): was der Manager dem öffentlichen Buchungsdienst gibt – aktive
 * Terminarten und freie Zeitfenster der nächsten Tage. Keine Patientendaten, keine Namen, keine
 * Kalenderinhalte: nur „frei von – bis“. Der Buchungsdienst rechnet daraus die wählbaren Uhrzeiten
 * je Dauer; derselbe Code prüft eine Buchung, bevor sie angenommen wird.
 */
import type { Sektion } from '../kartei/terminarten.ts';

export interface AngebotTerminart {
  code: string;
  sektion: Sektion;
  kurz: string;
  lang: string | null;
  dauerMin: number;
}

export interface Fenster {
  beginn: string;
  ende: string;
}

export interface Angebot {
  /** Wann der Manager das Angebot erzeugt hat (ISO) */
  erstellt: string;
  praxis: string;
  /** Hinweis über dem Formular (z. B. „Termine nach Vereinbarung – wir melden uns zur Bestätigung“) */
  hinweis: string;
  /** Raster der Anfangszeiten in Minuten */
  rasterMin: number;
  terminarten: AngebotTerminart[];
  /** Freie Zeitfenster je Tag (UTC-ISO), Puffer und Vorlauf schon abgezogen; Tage ohne Fenster fehlen */
  tage: { datum: string; fenster: Fenster[] }[];
}

export const SEKTION_NAME: Record<Sektion, string> = { rezept: 'Physiotherapie auf Rezept', selbstzahler: 'Physiotherapie als Selbstzahler', wellness: 'Wellness & Ayurveda' };

/** Freie Fenster: Öffnungsfenster minus belegte Zeiten (mit Puffer), nur was nach `ab` liegt */
export function freieFenster(offen: Fenster[], belegt: Fenster[], o: { pufferMin: number; ab: string }): Fenster[] {
  const puffer = o.pufferMin * 60_000;
  const abMs = new Date(o.ab).getTime();
  const sperren = belegt.map((b) => ({ von: new Date(b.beginn).getTime() - puffer, bis: new Date(b.ende).getTime() + puffer })).sort((a, b) => a.von - b.von);
  const frei: Fenster[] = [];
  for (const f of offen) {
    let von = Math.max(new Date(f.beginn).getTime(), abMs);
    const bis = new Date(f.ende).getTime();
    for (const s of sperren) {
      if (s.bis <= von || s.von >= bis) continue;
      if (s.von > von) frei.push({ beginn: new Date(von).toISOString(), ende: new Date(s.von).toISOString() });
      von = Math.max(von, s.bis);
    }
    if (von < bis) frei.push({ beginn: new Date(von).toISOString(), ende: new Date(bis).toISOString() });
  }
  return frei;
}

/** Anfangszeiten im Raster, die mit `dauerMin` ganz in ein freies Fenster passen */
export function anfangszeiten(fenster: Fenster[], dauerMin: number, rasterMin: number): string[] {
  const raster = rasterMin * 60_000;
  const dauer = dauerMin * 60_000;
  const zeiten: string[] = [];
  for (const f of fenster) {
    const bis = new Date(f.ende).getTime();
    for (let t = Math.ceil(new Date(f.beginn).getTime() / raster) * raster; t + dauer <= bis; t += raster) zeiten.push(new Date(t).toISOString());
  }
  return zeiten;
}

/** Passt dieser Beginn mit dieser Dauer in ein freies Fenster des Angebots? */
export function passt(angebot: Angebot, beginn: string, dauerMin: number): boolean {
  const t = new Date(beginn).getTime();
  if (!Number.isFinite(t) || t % (angebot.rasterMin * 60_000) !== 0) return false;
  const ende = t + dauerMin * 60_000;
  return angebot.tage.some((tag) => tag.fenster.some((f) => new Date(f.beginn).getTime() <= t && ende <= new Date(f.ende).getTime()));
}

/** Eine gebuchte Zeit aus dem Angebot herausnehmen, damit niemand sie ein zweites Mal wählt */
export function sperren(angebot: Angebot, beginn: string, dauerMin: number, pufferMin = 0): Angebot {
  const belegt: Fenster = { beginn, ende: new Date(new Date(beginn).getTime() + dauerMin * 60_000).toISOString() };
  return {
    ...angebot,
    tage: angebot.tage.map((tag) => ({ ...tag, fenster: freieFenster(tag.fenster, [belegt], { pufferMin, ab: '1970-01-01T00:00:00Z' }) })).filter((tag) => tag.fenster.length),
  };
}

export class AngebotFehler extends Error {}

/** Angebot aus dem Netz prüfen, bevor der Buchungsdienst es übernimmt */
export function angebotPruefen(roh: unknown): Angebot {
  const a = roh as Partial<Angebot>;
  if (!a || typeof a !== 'object') throw new AngebotFehler('Kein Angebot');
  if (typeof a.erstellt !== 'string' || Number.isNaN(Date.parse(a.erstellt))) throw new AngebotFehler('Angebot ohne Zeitstempel');
  if (!Array.isArray(a.terminarten) || !Array.isArray(a.tage)) throw new AngebotFehler('Angebot ohne Terminarten oder Tage');
  for (const t of a.terminarten) {
    if (!/^[PSW]\d{1,3}$/.test(String(t.code)) || !t.kurz || !(Number(t.dauerMin) > 0) || !['rezept', 'selbstzahler', 'wellness'].includes(String(t.sektion))) throw new AngebotFehler(`Terminart „${String(t.code)}“ unvollständig`);
  }
  for (const tag of a.tage) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(tag.datum)) || !Array.isArray(tag.fenster)) throw new AngebotFehler(`Tag „${String(tag.datum)}“ unvollständig`);
    for (const f of tag.fenster) if (Number.isNaN(Date.parse(f.beginn)) || Number.isNaN(Date.parse(f.ende)) || f.beginn >= f.ende) throw new AngebotFehler('Zeitfenster unlesbar');
  }
  return {
    erstellt: a.erstellt, praxis: String(a.praxis ?? 'Praxis'), hinweis: String(a.hinweis ?? ''), rasterMin: Number(a.rasterMin) || 15,
    terminarten: a.terminarten.map((t) => ({ code: String(t.code), sektion: t.sektion as Sektion, kurz: String(t.kurz).slice(0, 80), lang: t.lang ? String(t.lang).slice(0, 600) : null, dauerMin: Number(t.dauerMin) })),
    tage: a.tage.map((t) => ({ datum: String(t.datum), fenster: t.fenster.map((f) => ({ beginn: new Date(f.beginn).toISOString(), ende: new Date(f.ende).toISOString() })) })),
  };
}

export interface Buchung {
  id: string;
  /** Laufende Nummer – der Manager holt alles ab, was neuer ist als seine letzte */
  nr: number;
  eingegangen: string;
  terminart: string;
  beginn: string;
  dauerMin: number;
  name: string;
  telefon: string;
  email: string;
  nachricht: string;
  /** Hat der Datenschutzinformation zugestimmt */
  einwilligung: boolean;
}

export class BuchungFehler extends Error {}

/** Eingabe eines Patienten prüfen – streng, denn sie kommt aus dem Internet */
export function buchungPruefen(roh: Record<string, unknown>, angebot: Angebot): Omit<Buchung, 'id' | 'nr' | 'eingegangen'> {
  const s = (k: string, max: number) => String(roh[k] ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
  const code = s('terminart', 8);
  const art = angebot.terminarten.find((t) => t.code === code);
  if (!art) throw new BuchungFehler('Bitte eine Terminart wählen.');
  const beginn = s('beginn', 30);
  if (!passt(angebot, beginn, art.dauerMin)) throw new BuchungFehler('Diese Zeit ist nicht mehr frei – bitte eine andere wählen.');
  const name = s('name', 120);
  if (name.length < 3 || !/\s/.test(name)) throw new BuchungFehler('Bitte Vor- und Nachname angeben.');
  const telefon = s('telefon', 40);
  if (telefon.replace(/\D/g, '').length < 6) throw new BuchungFehler('Bitte eine Telefonnummer angeben – für Rückfragen.');
  const email = s('email', 120).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new BuchungFehler('Die Mailadresse sieht nicht richtig aus.');
  if (!roh.einwilligung) throw new BuchungFehler('Bitte der Verarbeitung Ihrer Angaben zustimmen.');
  return { terminart: code, beginn: new Date(beginn).toISOString(), dauerMin: art.dauerMin, name, telefon, email, nachricht: s('nachricht', 500), einwilligung: true };
}
