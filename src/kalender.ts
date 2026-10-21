/**
 * Einen Termin im Praxiskalender anlegen. Ohne `ausfuehren` wird nur gezeigt, was angelegt würde.
 * Zeiten sind deutsche Ortszeit ("2026-11-03T09:30").
 */
import type { GraphClient } from './graph.ts';
import { OUTLOOK_ZONE } from './zeit.ts';

export interface NeuerTermin {
  titel: string;
  beginn: string;
  ende: string;
  ort?: string;
  notiz?: string;
}

const ZEIT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function pruefeTermin(t: NeuerTermin): void {
  if (!t.titel.trim()) throw new Error('Titel fehlt');
  for (const [feld, wert] of [['Beginn', t.beginn], ['Ende', t.ende]] as const) {
    if (!ZEIT.test(wert) || Number.isNaN(Date.parse(`${wert}:00Z`))) {
      throw new Error(`${feld} „${wert}“ ist nicht im Format JJJJ-MM-TTTHH:MM`);
    }
  }
  if (t.ende <= t.beginn) throw new Error('Das Ende liegt nicht nach dem Beginn');
}

/** Körper für POST /me/events */
export function terminKoerper(t: NeuerTermin) {
  return {
    subject: t.titel,
    start: { dateTime: `${t.beginn}:00`, timeZone: OUTLOOK_ZONE },
    end: { dateTime: `${t.ende}:00`, timeZone: OUTLOOK_ZONE },
    ...(t.ort ? { location: { displayName: t.ort } } : {}),
    ...(t.notiz ? { body: { contentType: 'Text', content: t.notiz } } : {}),
    // Keine Einladungen: ohne Teilnehmer bleibt der Termin im eigenen Kalender
    attendees: [],
  };
}

export async function terminAnlegen(
  graph: Pick<GraphClient, 'post'>,
  t: NeuerTermin,
  optionen: { ausfuehren: boolean; /** Kalender aus kalenderBasis() – in der Testumgebung „Praxis-Test“ */ kalender?: string },
): Promise<{ angelegt: boolean; id?: string }> {
  pruefeTermin(t);
  if (!optionen.ausfuehren) return { angelegt: false };
  const ergebnis = await graph.post<{ id: string }>(`${optionen.kalender ?? '/me/calendar'}/events`, terminKoerper(t));
  return { angelegt: true, id: ergebnis.id };
}
