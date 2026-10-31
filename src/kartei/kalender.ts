/**
 * Termine der Kartei in den Exchange-Kalender spiegeln (W77). Die Kartei ist Master; im Kalender
 * steht je Termin ein Ereignis mit Kategorie „Praxis-Termin“, Betreff nur Initialen + Patientennummer
 * (Leitplanke 9: keine Namen, keine Leistung im Kalendertitel). Testumgebung: Kalender „Praxis-Test“
 * und zusätzlich Kategorie „TEST“ (Schranken 3 und 6).
 *
 * Hausbesuch (W130, E33 entschieden 31.10.2026): das Ereignis trägt die Hausbesuchadresse als Ort, im Text zuerst den Link
 * in die Praxis-Assistenz, dann die Wegbeschreibung (Google Maps, Apple Karten – W130b), und die Erinnerung zum Beginn der Anfahrt; Fahrt hin und zurück sind eigene
 * Ereignisse mit Kategorie „Praxis-Fahrt“ – so sieht Lilli in Outlook und am iPhone dasselbe wie im Praxiskalender.
 */
import { protokolliere, type Db } from '../db/index.ts';
import type { GraphClient } from '../graph.ts';
import { KATEGORIEN } from '../mail/kategorien.ts';
import { praxisName } from '../praxis.ts';
import { entwurfKategorien, kalenderBasis } from '../umgebung.ts';
import { datumBerlin, berlinMitternachtUtc, OUTLOOK_ZONE, tagPlus, ZONE } from '../zeit.ts';
import { routenLinks } from './hausbesuche.ts';
import { einstellungen } from './konfiguration.ts';
import { ADRESSE_ZEILE_SQL } from './patienten/termine.ts';
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
  /** Hausbesuch (W113): Ort des Ereignisses ist die Adresse (W130) */
  behandlungsort?: string | null;
  /** Hausbesuch (W130): Adresse in einer Zeile, Fahrtminuten und die Kalender-Kennungen der Fahrten */
  adresse?: string | null;
  fahrt_vor_min?: number;
  fahrt_nach_min?: number;
  fahrt_vor_event_id?: string | null;
  fahrt_nach_event_id?: string | null;
}

const WEG_STATUS = ['abgesagt_patient', 'abgesagt_praxis', 'verschoben'];

/** Wegbeschreibung für den Text eines Ereignisses – am iPhone öffnet der Tipp die Karten-App; Reihenfolge (Christian, 31.10.2026): Google Maps, dann Apple Karten */
const wegbeschreibung = (ziel: string): string => {
  const r = routenLinks(ziel);
  return `<p>Wegbeschreibung: <a href="${r.google}">Google Maps</a> · <a href="${r.apple}">Apple Karten</a></p>`;
};

/** Erster Link in jedem Ereignis: die passende Seite der Praxis-Assistenz (nur im Tailnet erreichbar); ohne PRAXIS_URL keiner */
const ppmLink = (pfad: string): string =>
  (process.env.PRAXIS_URL ? `<p><a href="${process.env.PRAXIS_URL.replace(/\/$/, '')}${pfad}">In der Praxis-Assistenz öffnen</a></p>` : '');

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
  const hausbesuch = t.behandlungsort === 'hausbesuch';
  return {
    subject: `${initialen(t.vorname, t.nachname)} ${t.patientennummer}`,
    start: { dateTime: ortszeit(t.beginn), timeZone: OUTLOOK_ZONE },
    end: { dateTime: ortszeit(t.ende), timeZone: OUTLOOK_ZONE },
    // Die erste Kategorie gibt die Farbe: Selbstzahler holzbraun, Wellness gold, sonst Brombeer (W95)
    categories: [...(t.sektion === 'selbstzahler' ? [KATEGORIEN.terminSelbstzahler.name] : t.sektion === 'wellness' ? [KATEGORIEN.terminWellness.name] : []), KATEGORIEN.termin.name, ...entwurfKategorien()],
    showAs: t.status === 'vorgeschlagen' ? 'tentative' : 'busy',
    // Hausbesuch (W130): die genaue Adresse als Ort – ein Tipp darauf navigiert; die Praxis bleibt nur „Praxis“
    location: { displayName: hausbesuch ? (t.adresse ?? 'Hausbesuch') : 'Praxis' },
    // Nur Initialen im Betreff; im Text zuerst der Link auf die Patientenseite in der Praxis-Assistenz, dann die Wegbeschreibung (Google Maps, Apple Karten)
    body: {
      contentType: 'HTML',
      content: `<p>Praxis-Assistenz · ${art}${hausbesuch ? ' · Hausbesuch' : ''} · Termin Nr. ${t.id}${t.verordnung_id ? ' · Rezept' : ''}</p>`
        + ppmLink(`/patienten/${t.patient_id}#termine`)
        + (hausbesuch && t.adresse ? wegbeschreibung(t.adresse) : '')
        + '<p>Details nur in der Praxis-Assistenz – keine Gesundheitsdaten im Kalender.</p>',
    },
    // Hausbesuch: die Erinnerung kommt, wenn die Anfahrt beginnt (W130)
    isReminderOn: hausbesuch,
    ...(hausbesuch ? { reminderMinutesBeforeStart: Math.max(0, Number(t.fahrt_vor_min ?? 0)) } : {}),
    attendees: [],
  };
}

/** Ereignis der Fahrt zum Hausbesuch („vor“) bzw. zurück zur Praxis („nach“, W130): Kategorie „Praxis-Fahrt“, Ziel als Ort, Wegbeschreibung im Text */
export function fahrtKoerper(t: TerminZeile, art: 'vor' | 'nach', praxisAdresse: string) {
  const minuten = Math.max(0, Number((art === 'vor' ? t.fahrt_vor_min : t.fahrt_nach_min) ?? 0));
  const beginn = art === 'vor' ? new Date(new Date(t.beginn).getTime() - minuten * 60_000) : new Date(t.ende);
  const ende = art === 'vor' ? new Date(t.beginn) : new Date(new Date(t.ende).getTime() + minuten * 60_000);
  const ziel = art === 'vor' ? (t.adresse ?? 'Hausbesuch') : praxisAdresse;
  const titel = art === 'vor' ? `Fahrt zum Hausbesuch ${initialen(t.vorname, t.nachname)} ${t.patientennummer}` : 'Rückfahrt zur Praxis';
  return {
    subject: titel,
    start: { dateTime: ortszeit(beginn), timeZone: OUTLOOK_ZONE },
    end: { dateTime: ortszeit(ende), timeZone: OUTLOOK_ZONE },
    categories: [KATEGORIEN.fahrt.name, ...entwurfKategorien()],
    showAs: 'busy',
    location: { displayName: ziel },
    // Zuerst der Link auf den Tag im Praxiskalender, dann die Wegbeschreibung (Google Maps, Apple Karten)
    body: { contentType: 'HTML', content: `<p>Praxis-Assistenz · ${titel} · ${minuten} Min. · Termin Nr. ${t.id}</p>${ppmLink(`/kalender?ansicht=tag&tag=${datumBerlin(beginn.toISOString())}`)}${wegbeschreibung(ziel)}` },
    isReminderOn: false,
    attendees: [],
  };
}

const FELDER = `t.id::text, t.patient_id::text, p.vorname, p.nachname, p.patientennummer, t.beginn, t.ende, t.art::text, t.status::text, t.exchange_event_id, t.verordnung_id::text,
       ${SEKTION_SQL} AS sektion, t.behandlungsort, ${ADRESSE_ZEILE_SQL} AS adresse, t.fahrt_vor_min, t.fahrt_nach_min, t.fahrt_vor_event_id, t.fahrt_nach_event_id`;
const VERKNUEPFUNG = 'FROM termin t JOIN patient p ON p.id = t.patient_id LEFT JOIN behandlungsfall f ON f.id = t.fall_id LEFT JOIN terminart ta ON ta.id = t.terminart_id LEFT JOIN patient_adresse pa ON pa.id = t.adresse_id';

const lesen = async (db: Db, terminId: string): Promise<TerminZeile | undefined> =>
  (await db.query<TerminZeile>(`SELECT ${FELDER} ${VERKNUEPFUNG} WHERE t.id = $1`, [terminId])).rows[0];

/** Praxisadresse für die Rückfahrt (Konfiguration), sonst der Praxisname */
const praxisZiel = async (db: Db): Promise<string> => (await einstellungen(db)).praxis_adresse?.trim() || praxisName();

const loeschen = async (graph: Graph, eventId: string): Promise<void> => {
  try {
    await graph.delete(`/me/events/${eventId}`);
  } catch (err) {
    if ((err as { status?: number }).status !== 404) throw err;
  }
};

/** Die Fahrt eines Termins (vor/nach) im Kalender nachziehen: anlegen, aktualisieren oder entfernen – je nachdem, ob es sie geben soll */
async function fahrtSpiegeln(db: Db, graph: Graph, t: TerminZeile, art: 'vor' | 'nach', basis: string, praxisAdresse: string): Promise<'angelegt' | 'aktualisiert' | 'entfernt' | 'nichts'> {
  const spalte = art === 'vor' ? 'fahrt_vor_event_id' : 'fahrt_nach_event_id';
  const vorhanden = art === 'vor' ? t.fahrt_vor_event_id : t.fahrt_nach_event_id;
  const minuten = Number((art === 'vor' ? t.fahrt_vor_min : t.fahrt_nach_min) ?? 0);
  const soll = t.behandlungsort === 'hausbesuch' && minuten > 0 && !WEG_STATUS.includes(t.status) && t.status !== 'erledigt';
  if (!soll) {
    if (!vorhanden) return 'nichts';
    await loeschen(graph, vorhanden);
    await db.query(`UPDATE termin SET ${spalte} = NULL WHERE id = $1`, [t.id]);
    return 'entfernt';
  }
  if (vorhanden) {
    await graph.patch(`/me/events/${vorhanden}`, fahrtKoerper(t, art, praxisAdresse));
    return 'aktualisiert';
  }
  const e = await graph.post<{ id: string }>(`${basis}/events`, fahrtKoerper(t, art, praxisAdresse));
  await db.query(`UPDATE termin SET ${spalte} = $2 WHERE id = $1`, [t.id, e.id]);
  return 'angelegt';
}

/** Die Fahrten aller anderen Hausbesuche desselben Tages nachziehen – ein neuer oder abgesagter Nachbar ändert ihre Fahrtzeiten (W113) */
async function nachbarnFahrtenSpiegeln(db: Db, graph: Graph, t: TerminZeile, basis: string): Promise<void> {
  const tag = datumBerlin(new Date(t.beginn).toISOString());
  const { rows } = await db.query<TerminZeile>(
    `SELECT ${FELDER} ${VERKNUEPFUNG} WHERE t.id <> $1 AND t.beginn >= $2 AND t.beginn < $3 AND (t.behandlungsort = 'hausbesuch' OR t.fahrt_vor_event_id IS NOT NULL OR t.fahrt_nach_event_id IS NOT NULL)`,
    [t.id, berlinMitternachtUtc(tag), berlinMitternachtUtc(tagPlus(tag, 1))],
  );
  if (!rows.length) return;
  const praxisAdresse = await praxisZiel(db);
  for (const n of rows) {
    await fahrtSpiegeln(db, graph, n, 'vor', basis, praxisAdresse);
    await fahrtSpiegeln(db, graph, n, 'nach', basis, praxisAdresse);
  }
}

/** Einen Termin anlegen, aktualisieren oder (bei Absage) aus dem Kalender nehmen – bei Hausbesuchen samt Fahrt hin und zurück (W130) */
export async function terminSpiegeln(db: Db, graph: Graph, terminId: string, wer: string): Promise<'angelegt' | 'aktualisiert' | 'entfernt' | 'nichts'> {
  const t = await lesen(db, terminId);
  if (!t) return 'nichts';
  const basis = await kalenderBasis(graph);
  const weg = WEG_STATUS.includes(t.status);
  const fahrten = async (): Promise<void> => {
    const praxisAdresse = await praxisZiel(db);
    await fahrtSpiegeln(db, graph, t, 'vor', basis, praxisAdresse);
    await fahrtSpiegeln(db, graph, t, 'nach', basis, praxisAdresse);
    await nachbarnFahrtenSpiegeln(db, graph, t, basis);
  };
  if (weg) {
    if (!t.exchange_event_id) {
      await fahrten();
      return 'nichts';
    }
    await loeschen(graph, t.exchange_event_id);
    await db.query('UPDATE termin SET exchange_event_id = NULL WHERE id = $1', [terminId]);
    await fahrten();
    await protokolliere(db, { actor: wer, action: 'termin_kalender_entfernt', objectType: 'patient', objectId: t.patient_id });
    return 'entfernt';
  }
  if (t.exchange_event_id) {
    await graph.patch(`/me/events/${t.exchange_event_id}`, ereignisKoerper(t));
    await fahrten();
    return 'aktualisiert';
  }
  const e = await graph.post<{ id: string }>(`${basis}/events`, ereignisKoerper(t));
  await db.query('UPDATE termin SET exchange_event_id = $2, kalender = $3 WHERE id = $1', [terminId, e.id, basis]);
  await fahrten();
  await protokolliere(db, { actor: wer, action: 'termin_kalender', objectType: 'patient', objectId: t.patient_id });
  return 'angelegt';
}

/** Alle künftigen Termine ohne Kalendereintrag nachtragen (Befehl `termine:abgleich`) – auch Hausbesuche, deren Fahrten noch fehlen (W130) */
export async function alleTermineSpiegeln(db: Db, graph: Graph, wer: string, o: { alle?: boolean } = {}): Promise<{ angelegt: number; aktualisiert: number; fehler: number }> {
  const { rows } = await db.query<{ id: string }>(
    // Auch Termine des laufenden Tages, die schon vorbei sind – „Heute im Blick“ zeigt den ganzen Tag. `alle`: vorhandene Ereignisse neu schreiben (z. B. neuer Text)
    `SELECT id::text FROM termin WHERE ${o.alle ? 'true' : "(exchange_event_id IS NULL OR (behandlungsort = 'hausbesuch' AND status <> 'erledigt' AND ((fahrt_vor_min > 0 AND fahrt_vor_event_id IS NULL) OR (fahrt_nach_min > 0 AND fahrt_nach_event_id IS NULL))))"} AND status IN ('vorgeschlagen', 'bestaetigt', 'erledigt') AND ende >= date_trunc('day', now() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin' ORDER BY beginn`,
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
