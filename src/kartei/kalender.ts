/**
 * Termine der Kartei in den Exchange-Kalender spiegeln (W77). Die Kartei ist Master; im Kalender
 * steht je Termin ein Ereignis mit Kategorie „Praxis-Termin“, Betreff nur Initialen + Patientennummer
 * (Leitplanke 9: keine Namen, keine Leistung im Kalendertitel). Testumgebung: Kalender „Praxis-Test“
 * und zusätzlich Kategorie „TEST“ (Schranken 3 und 6).
 */
import { protokolliere, type Db } from '../db/index.ts';
import type { GraphClient } from '../graph.ts';
import { KATEGORIEN } from '../mail/kategorien.ts';
import { entwurfKategorien, kalenderBasis } from '../umgebung.ts';
import { OUTLOOK_ZONE, ZONE } from '../zeit.ts';
import { SEKTION_SQL } from './terminarten.ts';

type Graph = Pick<GraphClient, 'get' | 'post' | 'patch' | 'delete'>;

interface TerminZeile {
  id: string;
  patient_id: string;
  vorname: string;
  nachname: string;
  patientennummer: string;
  beginn: Date | string;
  ende: Date | string;
  art: string;
  status: string;
  exchange_event_id: string | null;
  verordnung_id: string | null;
  /** Sektion (W95) – bestimmt die Farbe in Outlook */
  sektion?: string | null;
  /** Hausbesuch (W113): nur das Wort im Ort des Ereignisses, keine Adresse (E33) */
  behandlungsort?: string | null;
}

export const initialen = (vorname: string, nachname: string) => `${vorname.trim()[0]?.toUpperCase() ?? ''}. ${nachname.trim()[0]?.toUpperCase() ?? ''}.`;

// Einmal angelegt – jedes `new Intl.DateTimeFormat` kostet nativen Speicher (ICU)
const ORTSZEIT_FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Ortszeit "2026-11-03T09:30:00" für den Kalender */
export function ortszeit(d: Date | string): string {
  const teile = Object.fromEntries(ORTSZEIT_FORMAT.formatToParts(new Date(d)).map((p) => [p.type, p.value])) as Record<string, string>;
  return `${teile.year}-${teile.month}-${teile.day}T${teile.hour}:${teile.minute}:${teile.second}`;
}

export function ereignisKoerper(t: TerminZeile) {
  const art = { erstgespraech: 'Erstgespräch', behandlung: 'Behandlung', sonstige: 'Termin' }[t.art] ?? 'Termin';
  return {
    subject: `${initialen(t.vorname, t.nachname)} ${t.patientennummer}`,
    start: { dateTime: ortszeit(t.beginn), timeZone: OUTLOOK_ZONE },
    end: { dateTime: ortszeit(t.ende), timeZone: OUTLOOK_ZONE },
    // Die erste Kategorie gibt die Farbe: Selbstzahler holzbraun, Wellness gold, sonst Brombeer (W95)
    categories: [...(t.sektion === 'selbstzahler' ? [KATEGORIEN.terminSelbstzahler.name] : t.sektion === 'wellness' ? [KATEGORIEN.terminWellness.name] : []), KATEGORIEN.termin.name, ...entwurfKategorien()],
    showAs: t.status === 'vorgeschlagen' ? 'tentative' : 'busy',
    location: { displayName: t.behandlungsort === 'hausbesuch' ? 'Hausbesuch' : 'Praxis' },
    // Nur Initialen im Betreff; im Text ein Link, der die Patientenseite in der Praxis-Assistenz öffnet (nur im Tailnet erreichbar)
    body: {
      contentType: 'HTML',
      content: `<p>Praxis-Assistenz · ${art} · Termin Nr. ${t.id}${t.verordnung_id ? ' · Rezept' : ''}</p>`
        + (process.env.PRAXIS_URL ? `<p><a href="${process.env.PRAXIS_URL.replace(/\/$/, '')}/patienten/${t.patient_id}#termine">In der Praxis-Assistenz öffnen</a></p>` : '')
        + '<p>Details nur in der Praxis-Assistenz – keine Gesundheitsdaten im Kalender.</p>',
    },
    isReminderOn: false,
    attendees: [],
  };
}

const lesen = async (db: Db, terminId: string): Promise<TerminZeile | undefined> =>
  (await db.query<TerminZeile>(
    `SELECT t.id::text, t.patient_id::text, p.vorname, p.nachname, p.patientennummer, t.beginn, t.ende, t.art::text, t.status::text, t.exchange_event_id, t.verordnung_id::text,
       ${SEKTION_SQL} AS sektion, t.behandlungsort
     FROM termin t JOIN patient p ON p.id = t.patient_id LEFT JOIN behandlungsfall f ON f.id = t.fall_id LEFT JOIN terminart ta ON ta.id = t.terminart_id WHERE t.id = $1`, [terminId],
  )).rows[0];

/** Einen Termin anlegen, aktualisieren oder (bei Absage) aus dem Kalender nehmen */
export async function terminSpiegeln(db: Db, graph: Graph, terminId: string, wer: string): Promise<'angelegt' | 'aktualisiert' | 'entfernt' | 'nichts'> {
  const t = await lesen(db, terminId);
  if (!t) return 'nichts';
  const basis = await kalenderBasis(graph);
  const weg = ['abgesagt_patient', 'abgesagt_praxis', 'verschoben'].includes(t.status);
  if (weg) {
    if (!t.exchange_event_id) return 'nichts';
    try {
      await graph.delete(`/me/events/${t.exchange_event_id}`);
    } catch (err) {
      if ((err as { status?: number }).status !== 404) throw err;
    }
    await db.query('UPDATE termin SET exchange_event_id = NULL WHERE id = $1', [terminId]);
    await protokolliere(db, { actor: wer, action: 'termin_kalender_entfernt', objectType: 'patient', objectId: t.patient_id });
    return 'entfernt';
  }
  if (t.exchange_event_id) {
    await graph.patch(`/me/events/${t.exchange_event_id}`, ereignisKoerper(t));
    return 'aktualisiert';
  }
  const e = await graph.post<{ id: string }>(`${basis}/events`, ereignisKoerper(t));
  await db.query('UPDATE termin SET exchange_event_id = $2, kalender = $3 WHERE id = $1', [terminId, e.id, basis]);
  await protokolliere(db, { actor: wer, action: 'termin_kalender', objectType: 'patient', objectId: t.patient_id });
  return 'angelegt';
}

/** Alle künftigen Termine ohne Kalendereintrag nachtragen (Befehl `termine:abgleich`) */
export async function alleTermineSpiegeln(db: Db, graph: Graph, wer: string, o: { alle?: boolean } = {}): Promise<{ angelegt: number; aktualisiert: number; fehler: number }> {
  const { rows } = await db.query<{ id: string }>(
    // Auch Termine des laufenden Tages, die schon vorbei sind – „Heute im Blick“ zeigt den ganzen Tag. `alle`: vorhandene Ereignisse neu schreiben (z. B. neuer Text)
    `SELECT id::text FROM termin WHERE ${o.alle ? 'true' : 'exchange_event_id IS NULL'} AND status IN ('vorgeschlagen', 'bestaetigt', 'erledigt') AND ende >= date_trunc('day', now() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin' ORDER BY beginn`,
  );
  let angelegt = 0;
  let aktualisiert = 0;
  let fehler = 0;
  for (const r of rows) {
    try {
      const e = await terminSpiegeln(db, graph, r.id, wer);
      if (e === 'angelegt') angelegt++;
      if (e === 'aktualisiert') aktualisiert++;
    } catch (err) {
      fehler++;
      console.warn(`Termin ${r.id}: ${(err as Error).message.slice(0, 120)}`);
    }
  }
  return { angelegt, aktualisiert, fehler };
}
