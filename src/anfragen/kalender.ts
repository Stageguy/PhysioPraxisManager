/**
 * Kalenderseite der Terminanfragen (A15, E27): belegte Zeiten aus Kartei, Hauptkalender und
 * Praxiskalender lesen; Vorschläge als vorläufige Ereignisse reservieren („Reserviert – Anfrage #id“,
 * showAs tentative – kein Name, keine Leistung, Leitplanke 9); Reservierungen wieder löschen.
 */
import type { Db } from '../db/index.ts';
import type { GraphClient } from '../graph.ts';
import { ortszeit } from '../kartei/kalender.ts';
import { KATEGORIEN } from '../mail/kategorien.ts';
import { entwurfKategorien, kalenderBasis } from '../umgebung.ts';
import { OUTLOOK_ZONE } from '../zeit.ts';
import type { Vorschlag } from './anfragen.ts';
import type { Belegt, Slot } from './slots.ts';

type LeseGraph = Pick<GraphClient, 'get' | 'paginate' | 'post'>;

interface Ereignis {
  id: string;
  start: { dateTime: string };
  end: { dateTime: string };
  isAllDay?: boolean;
  showAs?: string;
  isCancelled?: boolean;
}

/**
 * Belegte Zeiten im Zeitraum: Kartei-Termine, Reservierungen offener Anfragen (aus der Datenbank – auch
 * wenn der Kalender gerade nicht antwortet), Hauptkalender und (falls getrennt) Praxiskalender.
 * `ohneAnfrage`: die eigenen alten Reservierungen zählen nicht, wenn eine Anfrage neu vorschlägt.
 */
export async function belegteZeiten(graph: LeseGraph | undefined, db: Db, von: string, bis: string, o: { ohneAnfrage?: string; pufferMin?: number } = {}): Promise<Belegt[]> {
  const liste: Belegt[] = [];
  // Kartei-Termine samt Pause danach (W116a): Pause der Terminart, sonst der Standard aus der Konfiguration;
  // bei Hausbesuchen (W113) dazu die Fahrt davor und danach
  const { rows } = await db.query<{ beginn: Date | string; ende: Date | string }>(
    `SELECT t.beginn - make_interval(mins => t.fahrt_vor_min) AS beginn, t.ende + make_interval(mins => coalesce(ta.puffer_min, $3) + t.fahrt_nach_min) AS ende
     FROM termin t LEFT JOIN terminart ta ON ta.id = t.terminart_id
     WHERE t.beginn - make_interval(mins => t.fahrt_vor_min) < $2 AND t.ende + make_interval(mins => t.fahrt_nach_min) > $1 AND t.status IN ('vorgeschlagen', 'bestaetigt')`,
    [von, bis, Math.max(0, Math.round(o.pufferMin ?? 0))],
  );
  for (const r of rows) liste.push({ beginn: new Date(r.beginn).toISOString(), ende: new Date(r.ende).toISOString() });
  const reserviert = await db.query<{ id: string; vorschlaege: unknown }>("SELECT id::text, vorschlaege FROM terminanfrage WHERE status IN ('neu', 'vorgeschlagen') AND vorschlaege::text <> '[]'");
  for (const r of reserviert.rows) {
    if (o.ohneAnfrage && r.id === o.ohneAnfrage) continue;
    const v = (typeof r.vorschlaege === 'string' ? JSON.parse(r.vorschlaege) : r.vorschlaege) as Vorschlag[];
    for (const s of v) if (s.beginn < bis && s.ende > von) liste.push({ beginn: s.beginn, ende: s.ende });
  }
  if (!graph) return liste;
  const basis = await kalenderBasis(graph);
  const kalender = ['/me/calendar', ...(basis === '/me/calendar' ? [] : [basis])];
  for (const k of kalender) {
    for await (const e of graph.paginate<Ereignis>(
      `${k}/calendarView?startDateTime=${von}&endDateTime=${bis}&$select=id,start,end,isAllDay,showAs,isCancelled&$top=100`,
      { Prefer: 'outlook.timezone="UTC"' },
    )) {
      if (e.isCancelled || e.showAs === 'free') continue;
      liste.push({ beginn: alsUtc(e.start.dateTime), ende: alsUtc(e.end.dateTime) });
    }
  }
  return liste;
}

const alsUtc = (dateTime: string) => new Date(dateTime.endsWith('Z') ? dateTime : `${dateTime.replace(/\.\d+$/, '')}Z`).toISOString();

/** Vorschläge im Praxiskalender reservieren – vorläufig, ohne Patientenbezug im Titel */
export async function reservieren(graph: LeseGraph, anfrageId: string, slots: Slot[]): Promise<Vorschlag[]> {
  const basis = await kalenderBasis(graph);
  const liste: Vorschlag[] = [];
  for (const s of slots) {
    const e = await graph.post<{ id: string }>(`${basis}/events`, {
      subject: `Reserviert – Anfrage #${anfrageId}`,
      start: { dateTime: ortszeit(s.beginn), timeZone: OUTLOOK_ZONE },
      end: { dateTime: ortszeit(s.ende), timeZone: OUTLOOK_ZONE },
      showAs: 'tentative', isReminderOn: false, attendees: [],
      categories: [KATEGORIEN.termin.name, ...entwurfKategorien()],
      body: { contentType: 'Text', content: 'Vorläufig reserviert aus einer Terminanfrage – wird bestätigt oder nach 48 Stunden entfernt.' },
    });
    liste.push({ ...s, exchangeEventId: e.id });
  }
  return liste;
}

/** Reservierungen aus dem Kalender nehmen; schon gelöschte zählen als erledigt */
export async function reservierungenLoeschen(graph: Pick<GraphClient, 'delete'>, vorschlaege: Vorschlag[]): Promise<number> {
  let n = 0;
  for (const v of vorschlaege) {
    if (!v.exchangeEventId) continue;
    try {
      await graph.delete(`/me/events/${v.exchangeEventId}`);
      n++;
    } catch (err) {
      if ((err as { status?: number }).status !== 404) throw err;
    }
  }
  return n;
}
