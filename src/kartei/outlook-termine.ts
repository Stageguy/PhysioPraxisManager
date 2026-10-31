/**
 * Outlook-Termine im Praxiskalender (W112): was Lilli im Postfach einträgt, erscheint im Kalender der
 * Praxis-Assistenz – als Patiententermin, wenn Kategorie „Praxis-Termin“ und eine Patientennummer im Betreff stehen,
 * sonst als geblockter Block mit Link auf den Outlook-Termin (kein Betreff: Leitplanke 9, und Privates bleibt privat).
 * Der Abgleich übernimmt Patiententermine in die Kartei und zieht verschobene Zeiten gespiegelter Termine nach;
 * gelöscht wird nichts – die Kartei bleibt Master (W77). Produktion liest den Hauptkalender, Test „Praxis-Test“ (Schranke 3).
 */
import { protokolliere, type Db } from '../db/index.ts';
import type { GraphClient } from '../graph.ts';
import { wochentag, type Oeffnungszeit } from '../anfragen/slots.ts';
import { KATEGORIEN } from '../mail/kategorien.ts';
import { kalenderBasis } from '../umgebung.ts';
import { berlinMitternachtUtc, berlinZeitUtc, datumBerlin, heuteBerlin, tagPlus } from '../zeit.ts';

type LeseGraph = Pick<GraphClient, 'get' | 'paginate' | 'post'>;

export interface OutlookEreignis {
  id: string;
  betreff: string;
  beginn: string;
  ende: string;
  ganztags: boolean;
  frei: boolean;
  kategorien: string[];
  webLink: string | null;
}

export interface KalenderBlock {
  outlookId: string;
  beginn: string;
  ende: string;
  webLink: string | null;
  /** 'patient': Praxis-Termin mit bekannter Patientennummer, noch nicht in der Kartei; 'geblockt': alles andere */
  art: 'patient' | 'geblockt';
  /** Reservierung einer Terminanfrage (A15) */
  reserviert: boolean;
  patientennummer: string | null;
  patientId: string | null;
}

interface Roh {
  id: string;
  subject?: string;
  start: { dateTime: string };
  end: { dateTime: string };
  isAllDay?: boolean;
  showAs?: string;
  isCancelled?: boolean;
  categories?: string[];
  webLink?: string;
}

const TERMIN_KATEGORIEN: string[] = [KATEGORIEN.termin.name, KATEGORIEN.terminSelbstzahler.name, KATEGORIEN.terminWellness.name];
export const istPraxisTermin = (kategorien: string[]): boolean => kategorien.some((k) => TERMIN_KATEGORIEN.includes(k));
export const istReservierung = (betreff: string): boolean => /^reserviert\b/i.test(betreff);
/** Patientennummer im Betreff („E. M. P-1001“, „P-1001 Knie“) */
export const patientennummerAus = (betreff: string): string | null => /(?:^|[^A-Z0-9-])([A-Z]-\d{3,6})(?![\d-])/.exec(betreff)?.[1] ?? null;

const alsUtc = (dateTime: string) => new Date(dateTime.endsWith('Z') ? dateTime : `${dateTime.replace(/\.\d+$/, '')}Z`).toISOString();

/** Ereignisse des Praxiskalenders im Zeitraum (ohne abgesagte) */
export async function outlookEreignisse(graph: LeseGraph, von: string, bis: string): Promise<OutlookEreignis[]> {
  const basis = await kalenderBasis(graph);
  const liste: OutlookEreignis[] = [];
  for await (const e of graph.paginate<Roh>(
    `${basis}/calendarView?startDateTime=${von}&endDateTime=${bis}&$select=id,subject,start,end,isAllDay,showAs,isCancelled,categories,webLink&$orderby=start/dateTime&$top=100`,
    { Prefer: 'outlook.timezone="UTC"' },
  )) {
    if (e.isCancelled) continue;
    liste.push({ id: e.id, betreff: e.subject?.trim() ?? '', beginn: alsUtc(e.start.dateTime), ende: alsUtc(e.end.dateTime), ganztags: Boolean(e.isAllDay), frei: e.showAs === 'free', kategorien: e.categories ?? [], webLink: e.webLink ?? null });
  }
  return liste;
}

/** Liegt das Ereignis in einem Öffnungsfenster seines Tages? Ganztägige und als „frei“ markierte zählen nicht */
export function imOeffnungsfenster(e: Pick<OutlookEreignis, 'beginn' | 'ende' | 'ganztags' | 'frei'>, fenster: Oeffnungszeit[]): boolean {
  if (e.ganztags || e.frei) return false;
  const tag = datumBerlin(e.beginn);
  const b = Date.parse(e.beginn);
  const x = Date.parse(e.ende);
  return fenster.filter((f) => f.tag === wochentag(tag)).some((f) => Date.parse(berlinZeitUtc(tag, f.von)) < x && Date.parse(berlinZeitUtc(tag, f.bis)) > b);
}

const patientZu = async (db: Db, nummer: string | null): Promise<string | null> =>
  nummer ? ((await db.query<{ id: string }>('SELECT id::text FROM patient WHERE patientennummer = $1', [nummer])).rows[0]?.id ?? null) : null;

/** Blöcke für die Kalenderseite: Outlook-Ereignisse im Öffnungsfenster, die nicht schon als Kartei-Termin gespiegelt sind */
export async function outlookBloecke(db: Db, graph: LeseGraph, von: string, bis: string, fenster: Oeffnungszeit[]): Promise<KalenderBlock[]> {
  const ereignisse = await outlookEreignisse(graph, von, bis);
  if (!ereignisse.length) return [];
  // Gespiegelte Termine und ihre Fahrten (W130) sind keine fremden Blöcke – der Praxiskalender zeigt sie schon
  const ids = ereignisse.map((e) => e.id);
  const bekannt = new Set((await db.query<{ e: string | null }>(
    'SELECT unnest(ARRAY[exchange_event_id, fahrt_vor_event_id, fahrt_nach_event_id]) AS e FROM termin WHERE exchange_event_id = ANY($1) OR fahrt_vor_event_id = ANY($1) OR fahrt_nach_event_id = ANY($1)', [ids],
  )).rows.map((r) => r.e).filter((e): e is string => Boolean(e)));
  const bloecke: KalenderBlock[] = [];
  for (const e of ereignisse) {
    if (bekannt.has(e.id) || !imOeffnungsfenster(e, fenster)) continue;
    const nummer = istPraxisTermin(e.kategorien) && !istReservierung(e.betreff) ? patientennummerAus(e.betreff) : null;
    const patientId = await patientZu(db, nummer);
    bloecke.push({ outlookId: e.id, beginn: e.beginn, ende: e.ende, webLink: e.webLink, art: patientId ? 'patient' : 'geblockt', reserviert: istReservierung(e.betreff), patientennummer: patientId ? nummer : null, patientId });
  }
  return bloecke.sort((a, b) => a.beginn.localeCompare(b.beginn));
}

/**
 * Abgleich Outlook → Kartei: Praxis-Termine mit Patientennummer werden Kartei-Termine (Status bestätigt, Art Behandlung);
 * bei gespiegelten Terminen, die in Outlook verschoben wurden, zieht die Kartei die Zeit nach. Nichts wird gelöscht.
 */
export async function outlookTermineUebernehmen(
  db: Db, graph: LeseGraph, wer: string, o: { von?: string; bis?: string; tage?: number } = {},
): Promise<{ neu: number; verschoben: number; unbekannt: number }> {
  const heute = heuteBerlin();
  const von = o.von ?? berlinMitternachtUtc(heute);
  const bis = o.bis ?? berlinMitternachtUtc(tagPlus(heute, o.tage ?? 60));
  const basis = await kalenderBasis(graph);
  const ereignisse = await outlookEreignisse(graph, von, bis);
  let neu = 0;
  let verschoben = 0;
  let unbekannt = 0;
  for (const e of ereignisse) {
    if (e.ganztags || e.frei) continue;
    const vorhanden = (await db.query<{ id: string; beginn: Date | string; ende: Date | string; status: string; patient_id: string }>(
      'SELECT id::text, beginn, ende, status::text, patient_id::text FROM termin WHERE exchange_event_id = $1', [e.id],
    )).rows[0];
    if (vorhanden) {
      const gleich = new Date(vorhanden.beginn).toISOString() === e.beginn && new Date(vorhanden.ende).toISOString() === e.ende;
      if (!gleich && ['vorgeschlagen', 'bestaetigt'].includes(vorhanden.status)) {
        await db.query('UPDATE termin SET beginn = $2, ende = $3, geaendert_am = now() WHERE id = $1', [vorhanden.id, e.beginn, e.ende]);
        await protokolliere(db, { actor: wer, action: 'termin_aus_outlook_verschoben', objectType: 'patient', objectId: vorhanden.patient_id, details: { terminId: vorhanden.id } });
        verschoben++;
      }
      continue;
    }
    if (!istPraxisTermin(e.kategorien) || istReservierung(e.betreff)) continue;
    const patientId = await patientZu(db, patientennummerAus(e.betreff));
    if (!patientId) {
      unbekannt++;
      continue;
    }
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO termin (patient_id, art, beginn, ende, status, exchange_event_id, kalender, erstellt_von) VALUES ($1, 'behandlung', $2, $3, 'bestaetigt', $4, $5, $6) RETURNING id::text`,
      [patientId, e.beginn, e.ende, e.id, basis, wer],
    );
    await protokolliere(db, { actor: wer, action: 'termin_aus_outlook', objectType: 'patient', objectId: patientId, details: { terminId: rows[0]!.id } });
    neu++;
  }
  return { neu, verschoben, unbekannt };
}
