/**
 * Daten für das Cockpit – nur echte Quellen, nichts erfunden:
 * - Rechnungseingang und Änderungsprotokoll aus der Praxis-Datenbank (fehlt sie: „nicht verbunden“)
 * - Termine des Tages aus dem Exchange-Kalender von praxis@lilli-nebel.de
 * - Terminanfragen: noch keine Quelle angebunden – die Kanäle sind vorbereitet, Zahlen gibt es keine
 *
 * Patientennamen: Kalendertitel werden standardmäßig nur als Initialen gezeigt (Diskret-Modus).
 */
import type { AnfragenStand } from '../anfragen/dienst.ts';
import type { Db } from '../db/index.ts';
import { zeitText } from '../format.ts';
import type { GraphClient } from '../graph.ts';
import { termineZeitraum, type TerminKalender } from '../kartei/patienten.ts';
import { kalenderBasis } from '../umgebung.ts';
import { berlinMitternachtUtc, datumBerlin, OUTLOOK_ZONE, tagPlus } from '../zeit.ts';

export type Quelle<T> = { stand: 'ok'; daten: T } | { stand: 'nicht-verbunden'; hinweis: string } | { stand: 'fehler'; hinweis: string };

export interface RechnungZeile {
  id: string;
  eingang: string;
  lieferant: string | null;
  rechnungsnummer: string | null;
  betrag: number | null;
  klasse: 'rechnung' | 'unklar';
  status: string;
  onedrivePfad: string | null;
}

export interface Rechnungsstand {
  /** Stufen des Rechnungswegs + unklar */
  zaehler: { eingegangen: number; unklar: number; angestossen: number; bezahlt: number };
  offenerBetrag: number;
  neueste: RechnungZeile[];
}

export interface Termin {
  beginn: string;
  ende: string;
  ganztags: boolean;
  titel: string;
  frei: boolean;
  /** Termin aus der Kartei: Link zur Patientenseite */
  link?: string;
  /** Kurzbezeichnung der Behandlung (Kürzel aus der Preisliste, Maßnahme, Wellness) – zur Vorbereitung */
  leistung?: string;
  rezept?: boolean;
}

export interface LogEintrag {
  zeit: string;
  aktion: string;
  objekt: string | null;
  details: Record<string, unknown>;
}

export interface CockpitDaten {
  heute: string;
  rechnungen: Quelle<Rechnungsstand>;
  termine: Quelle<Termin[]>;
  /** Terminanfragen (A15): offene Zahlen und die neuesten */
  anfragen: Quelle<AnfragenStand>;
  protokoll: Quelle<LogEintrag[]>;
  namenZeigen: boolean;
}

const KEINE_DB = 'Die Praxis-Datenbank ist noch nicht verbunden – Rechnungen erscheinen, sobald der Rechnungseingang läuft.';

const zuZeile = (r: Record<string, unknown>): RechnungZeile => ({
  id: String(r.id),
  eingang: String(r.received_at instanceof Date ? r.received_at.toISOString() : r.received_at),
  lieferant: (r.lieferant as string | null) ?? null,
  rechnungsnummer: (r.rechnungsnummer as string | null) ?? null,
  betrag: r.betrag === null || r.betrag === undefined ? null : Number(r.betrag),
  klasse: r.klasse as 'rechnung' | 'unklar',
  status: String(r.status),
  onedrivePfad: (r.onedrive_path as string | null) ?? null,
});

const ZEILE_FELDER = `id::text, received_at, lieferant, rechnungsnummer, betrag::text, klasse::text, status::text, onedrive_path`;

export async function rechnungsstand(db: Db | undefined, anzahl = 6): Promise<Quelle<Rechnungsstand>> {
  if (!db) return { stand: 'nicht-verbunden', hinweis: KEINE_DB };
  try {
    const z = (await db.query<{ status: string; klasse: string; n: number; summe: string | null }>(
      `SELECT status::text, klasse::text, count(*)::int AS n, sum(betrag)::text AS summe
       FROM inbound_document WHERE klasse IN ('rechnung', 'unklar') GROUP BY 1, 2`,
    )).rows;
    const zaehler = { eingegangen: 0, unklar: 0, angestossen: 0, bezahlt: 0 };
    let offenerBetrag = 0;
    for (const r of z) {
      if (r.klasse === 'unklar') zaehler.unklar += r.n;
      else if (r.status === 'bezahlt') zaehler.bezahlt += r.n;
      else if (r.status === 'zahlung_angestossen') zaehler.angestossen += r.n;
      else if (r.status !== 'abgelehnt') {
        zaehler.eingegangen += r.n;
        offenerBetrag += Number(r.summe ?? 0);
      }
    }
    const neueste = (await db.query(
      `SELECT ${ZEILE_FELDER} FROM inbound_document WHERE klasse IN ('rechnung', 'unklar')
       ORDER BY received_at DESC LIMIT $1`,
      [anzahl],
    )).rows.map(zuZeile);
    return { stand: 'ok', daten: { zaehler, offenerBetrag, neueste } };
  } catch (err) {
    return { stand: 'fehler', hinweis: `Datenbank: ${(err as Error).message}` };
  }
}

/** "Max Mustermann KG" → "M. M." – Diskret-Modus für Kalendertitel */
export function initialen(titel: string): string {
  const w = titel.split(/[\s,/–-]+/).filter((x) => /^\p{L}/u.test(x)).slice(0, 3);
  return w.length ? w.map((x) => `${x[0]!.toUpperCase()}.`).join(' ') : 'Termin';
}

/** Termine der Kartei in diesem Zeitraum (gleiche Abfrage wie die Kalenderseite) – für Klarnamen, Links und Kürzel; ohne Kartei leer */
async function karteiTermine(db: Db | undefined, von: string, bis: string): Promise<TerminKalender[]> {
  if (!db) return [];
  try {
    return (await termineZeitraum(db, von, bis)).filter((t) => ['vorgeschlagen', 'bestaetigt', 'erledigt'].includes(t.status));
  } catch {
    return [];
  }
}

export async function termineHeute(
  graph: Pick<GraphClient, 'paginate' | 'get' | 'post'> | undefined,
  heute: string,
  namenZeigen: boolean,
  db?: Db,
): Promise<Quelle<Termin[]>> {
  const von = berlinMitternachtUtc(heute);
  const bis = berlinMitternachtUtc(tagPlus(heute, 1));
  const kartei = await karteiTermine(db, von, bis);
  const name = (k: { vorname: string; nachname: string }) => (namenZeigen ? `${k.vorname} ${k.nachname}` : `${k.vorname[0]!.toUpperCase()}. ${k.nachname[0]!.toUpperCase()}.`);
  if (!graph) {
    if (!kartei.length) return { stand: 'nicht-verbunden', hinweis: 'Keine Verbindung zum Kalender.' };
    return { stand: 'ok', daten: kartei.map((k) => ({ beginn: zeitText(k.beginn), ende: zeitText(k.ende), ganztags: false, titel: name(k), frei: false, link: `/patienten/${k.patientId}#termine`, leistung: k.leistung ?? undefined, rezept: k.rezept })) };
  }
  try {
    const termine: Termin[] = [];
    const gesehen = new Set<string>();
    // Produktion: Hauptkalender; Testumgebung: Kalender „Praxis-Test“ (Schranke 3)
    const basis = await kalenderBasis(graph);
    for await (const e of graph.paginate<{
      subject?: string; isAllDay: boolean; showAs?: string; isCancelled?: boolean;
      start: { dateTime: string }; end: { dateTime: string }; id: string;
    }>(
      `${basis}/calendarView?startDateTime=${von}&endDateTime=${bis}&$select=id,subject,start,end,isAllDay,showAs,isCancelled&$orderby=start/dateTime&$top=100`,
      { Prefer: `outlook.timezone="${OUTLOOK_ZONE}"` },
    )) {
      if (e.isCancelled) continue;
      const titel = e.subject?.trim() || 'Termin';
      // Termin aus der Kartei? Dann Klarname (auf Wunsch) und Link statt des Kalendertitels
      const k = kartei.find((x) => x.exchangeEventId === e.id);
      if (k) gesehen.add(k.id);
      termine.push({
        beginn: e.start.dateTime.slice(11, 16),
        ende: e.end.dateTime.slice(11, 16),
        ganztags: e.isAllDay,
        titel: k ? name(k) : namenZeigen ? titel : initialen(titel),
        frei: e.showAs === 'free',
        ...(k ? { link: `/patienten/${k.patientId}#termine`, leistung: k.leistung ?? undefined, rezept: k.rezept } : {}),
      });
    }
    // Kartei-Termine, die (noch) nicht im Kalender stehen, trotzdem zeigen
    for (const k of kartei.filter((x) => !gesehen.has(x.id))) {
      termine.push({ beginn: zeitText(k.beginn), ende: zeitText(k.ende), ganztags: false, titel: name(k), frei: false, link: `/patienten/${k.patientId}#termine`, leistung: k.leistung ?? undefined, rezept: k.rezept });
    }
    termine.sort((a, b) => a.beginn.localeCompare(b.beginn));
    return { stand: 'ok', daten: termine };
  } catch (err) {
    return { stand: 'fehler', hinweis: `Kalender: ${(err as Error).message.slice(0, 200)}` };
  }
}

export async function protokoll(db: Db | undefined, tage = 7): Promise<Quelle<LogEintrag[]>> {
  if (!db) return { stand: 'nicht-verbunden', hinweis: KEINE_DB };
  try {
    const { rows } = await db.query<{ at: Date | string; action: string; object_id: string | null; details: Record<string, unknown> | string }>(
      `SELECT at, action, object_id, details FROM audit_event WHERE at >= now() - make_interval(days => $1) ORDER BY at DESC LIMIT 100`,
      [tage],
    );
    return {
      stand: 'ok',
      daten: rows.map((r) => ({
        zeit: r.at instanceof Date ? r.at.toISOString() : String(r.at),
        aktion: r.action,
        objekt: r.object_id,
        details: typeof r.details === 'string' ? (JSON.parse(r.details) as Record<string, unknown>) : r.details,
      })),
    };
  } catch (err) {
    return { stand: 'fehler', hinweis: `Datenbank: ${(err as Error).message}` };
  }
}

async function anfragenStand(stand?: () => Promise<AnfragenStand>): Promise<Quelle<AnfragenStand>> {
  if (!stand) return { stand: 'nicht-verbunden', hinweis: 'Terminanfragen brauchen die Praxis-Datenbank und den Tresor-Schlüssel.' };
  try {
    return { stand: 'ok', daten: await stand() };
  } catch (err) {
    return { stand: 'fehler', hinweis: `Anfragen: ${(err as Error).message.slice(0, 200)}` };
  }
}

export async function cockpitDaten(q: {
  db?: Db;
  graph?: Pick<GraphClient, 'paginate' | 'get' | 'post'>;
  namenZeigen: boolean;
  jetzt?: Date;
  /** Stand der Terminanfragen (AnfragenDienst.stand) */
  anfragen?: () => Promise<AnfragenStand>;
}): Promise<CockpitDaten> {
  const heute = datumBerlin((q.jetzt ?? new Date()).toISOString());
  const [rechnungen, termine, anfragen, log] = await Promise.all([
    rechnungsstand(q.db),
    termineHeute(q.graph, heute, q.namenZeigen, q.db),
    anfragenStand(q.anfragen),
    protokoll(q.db),
  ]);
  return { heute, rechnungen, termine, anfragen, protokoll: log, namenZeigen: q.namenZeigen };
}
