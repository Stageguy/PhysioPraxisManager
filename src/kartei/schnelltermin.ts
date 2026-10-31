/**
 * Schnelltermin (W117): Lilli tippt im Cockpit auf 20 · 30 · 40 · 60 Minuten, die Kartei sucht die nächsten drei
 * freien Zeiten dieser Dauer – aus demselben Angebot, das die öffentliche Buchungsseite bekommt, damit jeder Link
 * dort auch wählbar ist – und baut eine Vorlage für Mail oder WhatsApp. Die Vorlage wird nur kopiert, nie gesendet
 * (Leitplanke 3). „Direkt buchen“ führt Lilli in den eigenen Kalender (W116e).
 *
 * Mit bekanntem Patienten (W117b): jeder Link trägt eine zufällige Einladungskennung (`&e=…`). Der Buchungsdienst
 * belegt damit Name, Telefon und Mail vor – nie im Klartext im Link –, und die Buchung kommt über die Kennung dem
 * Patienten sicher zugeordnet zurück. Die Vorlage spricht den Patienten mit Namen an, „Direkt buchen“ öffnet gleich
 * sein Terminformular.
 */
import { randomBytes } from 'node:crypto';
import type { Db } from '../db/index.ts';
import { istId } from '../db/werte.ts';
import type { GraphClient } from '../graph.ts';
import { datumZeitText } from '../format.ts';
import { praxisName } from '../praxis.ts';
import { datumBerlin, zeitBerlin } from '../zeit.ts';
import { angebotErstellen } from '../buchung/abgleich.ts';
import { anfangszeiten, type Einladung } from '../buchung/angebot.ts';
import type { Patient } from './patienten.ts';

type LeseGraph = Pick<GraphClient, 'get' | 'paginate' | 'post' | 'patch' | 'delete'>;

export const SCHNELL_DAUERN = [20, 30, 40, 60] as const;
/** So lange gilt eine Einladung – danach belegt die Buchungsseite nichts mehr vor */
export const EINLADUNG_TAGE = 30;

export interface SchnellZeit {
  beginn: string;
  ende: string;
  /** „Mo., 09.11., 09:00 Uhr“ */
  text: string;
  /** Link für den Patienten auf die Buchungsseite mit vorgewählter Dauer und Zeit – null ohne öffentliche Buchungsseite */
  link: string | null;
  /** Lillis Weg: Terminwahl im Praxiskalender mit vorbelegtem Datum, Zeit und Dauer – mit Patient gleich sein Terminformular */
  direkt: string;
}

export interface SchnellPatient {
  id: string;
  name: string;
  patientennummer: string;
  /** primäre Mailadresse – für den Mail-Knopf (W117c); null = Knopf aus */
  email: { id: string; adresse: string } | null;
  /** WhatsApp-Nummer (E.164) – für den WhatsApp-Knopf; null = Knopf aus */
  whatsapp: { id: string; nummer: string } | null;
}

export interface Schnelltermin {
  dauer: number;
  zeiten: SchnellZeit[];
  /** Fertiger Text für Mail oder WhatsApp */
  vorlage: string;
  /** Betreff für die Mail (W117c) */
  betreff: string;
  /** Es gibt eine öffentliche Buchungsseite – die Vorlage trägt Links */
  buchung: boolean;
  /** Der Patient, für den die Vorlage ist (W117b) – null ohne */
  patient: SchnellPatient | null;
  /** Die Einladung konnte nicht zum Buchungsdienst – die Links gehen, nur ohne Vorbelegung */
  einladungFehler?: string;
}

/** Drei Zeiten, möglichst an verschiedenen Tagen: erst je Tag die erste, dann je Tag die zweite … */
export function dreiZeiten(tage: { datum: string; zeiten: string[] }[], anzahl = 3): string[] {
  const wahl: string[] = [];
  for (let runde = 0; wahl.length < anzahl; runde++) {
    let gefunden = false;
    for (const t of tage) {
      const z = t.zeiten[runde];
      if (z === undefined) continue;
      gefunden = true;
      wahl.push(z);
      if (wahl.length >= anzahl) break;
    }
    if (!gefunden) break;
  }
  return wahl.sort();
}

/** Link auf die Buchungsseite mit Dauer und Zeit – die Seite wählt Behandlung, Tag und Uhrzeit vor; kurz gehalten („2026-11-02T10:30Z“), damit er in WhatsApp lesbar bleibt. Mit Einladungskennung (W117b) belegt die Seite Name, Telefon und Mail vor */
export const buchungsLink = (url: string, dauer: number, beginn: string, kennung?: string | null): string =>
  `${url.replace(/\/$/, '')}/?dauer=${dauer}&zeit=${beginn.replace(/:\d{2}(\.\d{3})?Z$/, 'Z')}${kennung ? `&e=${kennung}` : ''}`;

/** Anrede für die Vorlage: „Frau Müller“ bzw. „Herr Müller“, sonst Vor- und Nachname */
export const anredeText = (p: Pick<Patient, 'anrede' | 'vorname' | 'nachname'>): string =>
  p.anrede && /^(frau|herr)$/i.test(p.anrede.trim()) ? `${p.anrede.trim()} ${p.nachname}` : `${p.vorname} ${p.nachname}`;

export function vorlageText(dauer: number, zeiten: SchnellZeit[], praxis: string, anrede?: string): string {
  const liste = zeiten.map((z, i) => `${i + 1}. ${z.text}${z.link ? `\n   ${z.link}` : ''}`).join('\n');
  const mitLinks = zeiten.some((z) => z.link);
  return [
    anrede ? `Guten Tag ${anrede},` : 'Guten Tag,',
    '',
    `für einen Termin (${dauer} Minuten) kann ich Ihnen anbieten:`,
    liste,
    '',
    mitLinks
      ? `Bitte tippen Sie auf den Link des passenden Termins und senden Sie dort den Terminwunsch ab${anrede ? ' – Ihre Angaben sind schon eingetragen' : ''} – ich bestätige ihn dann. Passt keiner, melden Sie sich gern.`
      : 'Bitte antworten Sie kurz mit dem passenden Termin – ich bestätige ihn dann. Passt keiner, melden Sie sich gern.',
    '',
    'Viele Grüße',
    praxis,
  ].join('\n');
}

/** Eine Einladung für den Patienten anlegen (Kennung in der Kartei) – was der Buchungsdienst davon bekommt: Kennung, Name, Telefon, Mail, Gültigkeit */
export async function einladungAnlegen(db: Db, p: Patient, dauer: number, wer: string, jetzt = new Date()): Promise<Einladung> {
  const kennung = randomBytes(9).toString('base64url');
  const bis = new Date(jetzt.getTime() + EINLADUNG_TAGE * 86_400_000).toISOString();
  await db.query('INSERT INTO schnelltermin_einladung (kennung, patient_id, dauer_min, erstellt_von, gueltig_bis) VALUES ($1, $2, $3, $4, $5)', [kennung, p.id, dauer, wer, bis]);
  const telefon = p.kontakte.find((k) => k.art === 'mobil' && k.primaer) ?? p.kontakte.find((k) => k.art === 'mobil') ?? p.telefon;
  return { kennung, name: `${p.vorname} ${p.nachname}`, telefon: telefon?.wert ?? '', email: p.email?.wert ?? '', bis };
}

/** Der Patient zu einer Einladungskennung aus einer Buchung – undefined, wenn unbekannt oder abgelaufen */
export async function einladungPatient(db: Db, kennung: string | null | undefined): Promise<string | undefined> {
  if (!kennung || !/^[A-Za-z0-9_-]{8,40}$/.test(kennung)) return undefined;
  const { rows } = await db.query<{ id: string }>('SELECT patient_id::text AS id FROM schnelltermin_einladung WHERE kennung = $1 AND gueltig_bis > now()', [kennung]);
  return rows[0]?.id;
}

/** Den Patienten zur Wahl im Cockpit finden: Kennung, Patientennummer oder ein eindeutiger Name */
export async function schnellPatientFinden(db: Db, wahl: string | undefined): Promise<string | undefined> {
  const w = (wahl ?? '').trim();
  if (!w) return undefined;
  if (istId(w)) return (await db.query<{ id: string }>("SELECT id::text FROM patient WHERE id = $1 AND status <> 'archiviert'", [w])).rows[0]?.id;
  const nr = /^([A-Za-z]-\d+)/.exec(w)?.[1];
  if (nr) return (await db.query<{ id: string }>("SELECT id::text FROM patient WHERE upper(patientennummer) = upper($1) AND status <> 'archiviert'", [nr])).rows[0]?.id;
  const { rows } = await db.query<{ id: string }>(
    `SELECT id::text FROM patient WHERE status <> 'archiviert' AND (lower(vorname || ' ' || nachname) LIKE $1 OR lower(nachname || ' ' || vorname) LIKE $1 OR lower(nachname || ', ' || vorname) LIKE $1) LIMIT 2`,
    [`%${w.toLowerCase()}%`],
  );
  return rows.length === 1 ? rows[0]!.id : undefined;
}

export async function schnelltermin(
  db: Db, graph: LeseGraph | undefined,
  o: { dauer: number; buchungUrl?: string; jetzt?: Date; anzahl?: number; patient?: Patient; wer?: string; einladen?: (e: Einladung) => Promise<void> },
): Promise<Schnelltermin> {
  const dauer = (SCHNELL_DAUERN as readonly number[]).includes(o.dauer) ? o.dauer : 30;
  const angebot = await angebotErstellen(db, graph, { jetzt: o.jetzt });
  const tage = angebot.tage.map((t) => ({ datum: t.datum, zeiten: anfangszeiten(t.fenster, dauer, angebot.rasterMin) })).filter((t) => t.zeiten.length);
  const p = o.patient;
  let kennung: string | null = null;
  let einladungFehler: string | undefined;
  if (p && o.buchungUrl) {
    const e = await einladungAnlegen(db, p, dauer, o.wer ?? 'system', o.jetzt);
    kennung = e.kennung;
    if (o.einladen) {
      try {
        await o.einladen(e);
      } catch (err) {
        einladungFehler = (err as Error).message.slice(0, 160);
        console.warn(`Schnelltermin: Einladung nicht zum Buchungsdienst – ${einladungFehler}`);
      }
    }
  }
  const zeiten: SchnellZeit[] = dreiZeiten(tage, o.anzahl ?? 3).map((beginn) => ({
    beginn, ende: new Date(Date.parse(beginn) + dauer * 60_000).toISOString(), text: `${datumZeitText(beginn, { wochentag: true })} Uhr`,
    link: o.buchungUrl ? buchungsLink(o.buchungUrl, dauer, beginn, kennung) : null,
    direkt: p
      ? `/patienten/${p.id}/neu/termin?datum=${datumBerlin(beginn)}&zeit=${zeitBerlin(beginn)}&dauer_min=${dauer}`
      : `/kalender/termin?datum=${datumBerlin(beginn)}&zeit=${zeitBerlin(beginn)}&dauer_min=${dauer}`,
  }));
  return {
    dauer, zeiten, vorlage: vorlageText(dauer, zeiten, praxisName(), p ? anredeText(p) : undefined), betreff: `Terminvorschläge (${dauer} Minuten) – ${praxisName()}`, buchung: Boolean(o.buchungUrl),
    patient: p ? {
      id: p.id, name: `${p.vorname} ${p.nachname}`, patientennummer: p.patientennummer,
      email: p.email ? { id: p.email.id, adresse: p.email.normiert } : null, whatsapp: p.whatsapp ? { id: p.whatsapp.id, nummer: p.whatsapp.normiert } : null,
    } : null,
    ...(einladungFehler ? { einladungFehler } : {}),
  };
}
