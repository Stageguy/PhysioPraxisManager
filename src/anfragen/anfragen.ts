/**
 * Terminanfragen in der Datenbank (A15): anlegen (aus Mail, Website-Formular, WhatsApp, Telefon oder von
 * Hand), Patient zuordnen, Vorschläge merken, bestätigen (→ Termin in der Kartei), abschließen. Der
 * Wortlaut liegt verschlüsselt; erkannte Zeitwünsche und Vorschläge als JSON ohne Gesundheitsdaten.
 */
import { protokolliere, type Db } from '../db/index.ts';
import { iso, istId, text as textWert } from '../db/werte.ts';
import { KarteiFehler, terminAnlegen } from '../kartei/patienten.ts';
import { telefonNormieren } from '../telefon.ts';
import type { Tresor } from '../tresor.ts';
import { datumBerlin, zeitBerlin } from '../zeit.ts';
import type { Anliegen, Zeitwunsch } from './erkennung.ts';
import type { Slot } from './slots.ts';
import type { Sektion } from '../kartei/terminarten.ts';

export type AnfrageStatus = 'neu' | 'vorgeschlagen' | 'bestaetigt' | 'abgesagt' | 'erledigt' | 'verworfen';
export type AnfrageQuelle = 'mail' | 'website' | 'whatsapp' | 'telefon' | 'hand';

export const STATUS_TEXT: Record<AnfrageStatus, [string, string]> = {
  neu: ['neu', 'preset3'], vorgeschlagen: ['Vorschlag im Entwurf', 'preset7'], bestaetigt: ['Termin steht', 'preset19'],
  abgesagt: ['abgesagt', 'preset12'], erledigt: ['erledigt', 'preset4'], verworfen: ['verworfen', 'preset12'],
};
export const QUELLE_TEXT: Record<AnfrageQuelle, string> = { mail: 'E-Mail', website: 'Website', whatsapp: 'WhatsApp', telefon: 'Telefon', hand: 'von Hand' };
export const ANLIEGEN_TEXT: Record<Anliegen, string> = { termin: 'neuer Termin', verschieben: 'verschieben', absagen: 'Absage', unklar: 'unklar' };
export const OFFEN: AnfrageStatus[] = ['neu', 'vorgeschlagen'];

export interface Vorschlag extends Slot {
  exchangeEventId: string | null;
}

export interface AnfrageKurz {
  id: string;
  status: AnfrageStatus;
  quelle: AnfrageQuelle;
  anliegen: Anliegen;
  eingegangenAm: string;
  absenderName: string | null;
  absenderAdresse: string | null;
  absenderTelefon: string | null;
  betreff: string | null;
  patient: { id: string; name: string; patientennummer: string } | null;
  vorschlaege: Vorschlag[];
  terminId: string | null;
  /** Gewählte Terminart (Dropdown der Website oder von Hand, W94) */
  terminart: { id: string; code: string; kurz: string; sektion: Sektion; dauerMin: number } | null;
}

export interface Anfrage extends AnfrageKurz {
  graphMessageId: string | null;
  conversationId: string | null;
  text: string | null;
  erkannt: Partial<Zeitwunsch>;
  dauerMin: number | null;
  leistungNummer: string | null;
  antwortWeblink: string | null;
  erledigtAm: string | null;
  notiz: string | null;
}

const ACTOR = 'system:anfragen';
const STATUS: AnfrageStatus[] = ['neu', 'vorgeschlagen', 'bestaetigt', 'abgesagt', 'erledigt', 'verworfen'];

export interface NeueAnfrage {
  quelle: AnfrageQuelle;
  anliegen?: Anliegen;
  graphMessageId?: string;
  conversationId?: string;
  absenderAdresse?: string | null;
  absenderName?: string | null;
  absenderTelefon?: string | null;
  betreff?: string | null;
  text?: string | null;
  erkannt?: Partial<Zeitwunsch>;
  patientId?: string | null;
  eingegangenAm?: string;
  terminartId?: string | null;
}

/** Patient über Mailadresse oder Telefonnummer finden (aktive vor archivierten) */
export async function patientFinden(db: Db, o: { email?: string | null; telefon?: string | null }): Promise<string | undefined> {
  const werte: string[] = [];
  if (o.email?.trim()) werte.push(o.email.trim().toLowerCase());
  if (o.telefon?.trim()) werte.push(telefonNormieren(o.telefon));
  if (!werte.length) return undefined;
  const { rows } = await db.query<{ id: string }>(
    "SELECT p.id::text FROM patient_kontakt k JOIN patient p ON p.id = k.patient_id WHERE k.normiert = ANY($1) ORDER BY (p.status = 'aktiv') DESC, k.primaer DESC LIMIT 1", [werte],
  );
  return rows[0]?.id;
}

export async function anfrageAnlegen(db: Db, t: Tresor, d: NeueAnfrage, wer = ACTOR): Promise<{ id: string; neu: boolean }> {
  if (!d.absenderName?.trim() && !d.absenderAdresse?.trim() && !d.absenderTelefon?.trim() && !d.patientId) throw new KarteiFehler('Eine Anfrage braucht wenigstens einen Namen, eine Mailadresse oder eine Telefonnummer');
  const patientId = d.patientId ?? (await patientFinden(db, { email: d.absenderAdresse, telefon: d.absenderTelefon }));
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO terminanfrage (quelle, anliegen, graph_message_id, conversation_id, absender_adresse, absender_name, absender_telefon, betreff, text, erkannt, patient_id, eingegangen_am, erstellt_von, terminart_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, coalesce($12::timestamptz, now()), $13, $14)
     ON CONFLICT (graph_message_id) DO NOTHING RETURNING id::text`,
    [d.quelle, d.anliegen ?? 'unklar', d.graphMessageId ?? null, d.conversationId ?? null, textWert(d.absenderAdresse)?.toLowerCase() ?? null, textWert(d.absenderName), d.absenderTelefon?.trim() ? telefonNormieren(d.absenderTelefon) : null,
      textWert(d.betreff), d.text?.trim() ? t.verschluesseln(d.text.trim(), 'terminanfrage.text') : null, JSON.stringify(d.erkannt ?? {}), patientId ?? null, d.eingegangenAm ?? null, wer, d.terminartId && istId(d.terminartId) ? d.terminartId : null],
  );
  if (!rows[0]) {
    const alt = (await db.query<{ id: string }>('SELECT id::text FROM terminanfrage WHERE graph_message_id = $1', [d.graphMessageId])).rows[0]!;
    return { id: alt.id, neu: false };
  }
  await protokolliere(db, { actor: wer, action: 'anfrage_eingegangen', objectType: 'terminanfrage', objectId: rows[0].id, details: { quelle: d.quelle, anliegen: d.anliegen ?? 'unklar', patient: Boolean(patientId) } });
  return { id: rows[0].id, neu: true };
}

const SELECT = `SELECT a.id::text, a.status::text, a.quelle::text, a.anliegen::text, a.eingegangen_am, a.absender_name, a.absender_adresse, a.absender_telefon, a.betreff,
    a.graph_message_id, a.conversation_id, a.text, a.erkannt, a.vorschlaege, a.dauer_min, a.leistung_nummer, a.antwort_weblink, a.termin_id::text, a.erledigt_am, a.notiz,
    p.id::text AS p_id, p.vorname || ' ' || p.nachname AS p_name, p.patientennummer,
    ta.id::text AS ta_id, ta.code AS ta_code, ta.kurz AS ta_kurz, ta.sektion::text AS ta_sektion, ta.dauer_min AS ta_dauer
  FROM terminanfrage a LEFT JOIN patient p ON p.id = a.patient_id LEFT JOIN terminart ta ON ta.id = a.terminart_id`;

const vorschlaegeAus = (v: unknown): Vorschlag[] => {
  const liste = typeof v === 'string' ? (JSON.parse(v) as unknown) : v;
  return Array.isArray(liste) ? (liste as Vorschlag[]) : [];
};

function zuAnfrage(t: Tresor, r: Record<string, unknown>): Anfrage {
  const erkannt = typeof r.erkannt === 'string' ? (JSON.parse(r.erkannt) as Partial<Zeitwunsch>) : ((r.erkannt as Partial<Zeitwunsch> | null) ?? {});
  return {
    id: String(r.id), status: r.status as AnfrageStatus, quelle: r.quelle as AnfrageQuelle, anliegen: r.anliegen as Anliegen, eingegangenAm: iso(r.eingegangen_am)!,
    absenderName: textWert(r.absender_name), absenderAdresse: textWert(r.absender_adresse), absenderTelefon: textWert(r.absender_telefon), betreff: textWert(r.betreff),
    patient: r.p_id ? { id: String(r.p_id), name: String(r.p_name), patientennummer: String(r.patientennummer) } : null,
    vorschlaege: vorschlaegeAus(r.vorschlaege), terminId: textWert(r.termin_id),
    terminart: r.ta_id ? { id: String(r.ta_id), code: String(r.ta_code), kurz: String(r.ta_kurz), sektion: r.ta_sektion as Sektion, dauerMin: Number(r.ta_dauer) } : null,
    graphMessageId: textWert(r.graph_message_id), conversationId: textWert(r.conversation_id),
    text: t.entschluesselnText(r.text as Uint8Array | null, 'terminanfrage.text'), erkannt,
    dauerMin: r.dauer_min === null || r.dauer_min === undefined ? null : Number(r.dauer_min), leistungNummer: textWert(r.leistung_nummer),
    antwortWeblink: textWert(r.antwort_weblink), erledigtAm: iso(r.erledigt_am), notiz: t.entschluesselnText(r.notiz as Uint8Array | null, 'terminanfrage.notiz'),
  };
}

export async function anfragenListe(db: Db, t: Tresor, o: { filter?: 'offen' | 'alle' | AnfrageStatus } = {}): Promise<Anfrage[]> {
  const filter = o.filter ?? 'offen';
  const wo = filter === 'alle' ? 'true' : filter === 'offen' ? "a.status IN ('neu', 'vorgeschlagen')" : 'a.status = $1';
  const { rows } = await db.query<Record<string, unknown>>(`${SELECT} WHERE ${wo} ORDER BY (a.status = 'neu') DESC, a.eingegangen_am DESC LIMIT 200`, filter === 'alle' || filter === 'offen' ? [] : [filter]);
  return rows.map((r) => zuAnfrage(t, r));
}

export async function anfrageLesen(db: Db, t: Tresor, id: string): Promise<Anfrage | undefined> {
  if (!istId(id)) return undefined;
  const r = (await db.query<Record<string, unknown>>(`${SELECT} WHERE a.id = $1`, [id])).rows[0];
  return r ? zuAnfrage(t, r) : undefined;
}

export async function offeneAnfragen(db: Db): Promise<{ neu: number; vorgeschlagen: number }> {
  const { rows } = await db.query<{ status: string; n: number }>("SELECT status::text, count(*)::int AS n FROM terminanfrage WHERE status IN ('neu', 'vorgeschlagen') GROUP BY status");
  const je = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
  return { neu: je.neu ?? 0, vorgeschlagen: je.vorgeschlagen ?? 0 };
}

async function pruefen(db: Db, id: string): Promise<void> {
  if (!istId(id) || !(await db.query('SELECT 1 FROM terminanfrage WHERE id = $1', [id])).rows.length) throw new KarteiFehler('Unbekannte Anfrage');
}

export async function patientZuordnen(db: Db, id: string, patientId: string, wer: string): Promise<void> {
  await pruefen(db, id);
  if (!istId(patientId) || !(await db.query('SELECT 1 FROM patient WHERE id = $1', [patientId])).rows.length) throw new KarteiFehler('Unbekannter Patient');
  await db.query('UPDATE terminanfrage SET patient_id = $2, geaendert_am = now() WHERE id = $1', [id, patientId]);
  await protokolliere(db, { actor: wer, action: 'anfrage_patient', objectType: 'terminanfrage', objectId: id });
}

export async function vorschlaegeSetzen(db: Db, id: string, vorschlaege: Vorschlag[], o: { dauerMin: number; leistungNummer?: string | null; antwortWeblink?: string | null }, wer: string): Promise<void> {
  await pruefen(db, id);
  await db.query(
    "UPDATE terminanfrage SET vorschlaege = $2, dauer_min = $3, leistung_nummer = $4, antwort_weblink = coalesce($5, antwort_weblink), status = 'vorgeschlagen', geaendert_am = now() WHERE id = $1",
    [id, JSON.stringify(vorschlaege), o.dauerMin, o.leistungNummer ?? null, o.antwortWeblink ?? null],
  );
  await protokolliere(db, { actor: wer, action: 'anfrage_vorschlaege', objectType: 'terminanfrage', objectId: id, details: { anzahl: vorschlaege.length } });
}

export async function anfrageStatus(db: Db, id: string, status: AnfrageStatus, wer: string): Promise<Vorschlag[]> {
  await pruefen(db, id);
  if (!STATUS.includes(status)) throw new KarteiFehler('Unbekannter Status');
  const alt = (await db.query<{ vorschlaege: unknown }>('SELECT vorschlaege FROM terminanfrage WHERE id = $1', [id])).rows[0]!;
  const abgeschlossen = ['abgesagt', 'erledigt', 'verworfen'].includes(status);
  await db.query(
    `UPDATE terminanfrage SET status = $2, erledigt_am = ${abgeschlossen ? 'now()' : 'NULL'}, erledigt_von = ${abgeschlossen ? '$3' : 'NULL'}, vorschlaege = ${abgeschlossen ? "'[]'" : 'vorschlaege'}, geaendert_am = now() WHERE id = $1`,
    abgeschlossen ? [id, status, wer] : [id, status],
  );
  await protokolliere(db, { actor: wer, action: `anfrage_${status}`, objectType: 'terminanfrage', objectId: id });
  // Reservierungen, die der Aufrufer im Kalender löschen soll
  return abgeschlossen ? vorschlaegeAus(alt.vorschlaege) : [];
}

export async function terminartSetzen(db: Db, id: string, terminartId: string | undefined, wer: string): Promise<void> {
  await pruefen(db, id);
  if (terminartId && !(istId(terminartId) && (await db.query('SELECT 1 FROM terminart WHERE id = $1', [terminartId])).rows.length)) throw new KarteiFehler('Unbekannte Terminart');
  await db.query('UPDATE terminanfrage SET terminart_id = $2, geaendert_am = now() WHERE id = $1', [id, terminartId || null]);
  await protokolliere(db, { actor: wer, action: 'anfrage_terminart', objectType: 'terminanfrage', objectId: id });
}

export async function notizSetzen(db: Db, t: Tresor, id: string, notiz: string | undefined, wer: string): Promise<void> {
  await pruefen(db, id);
  await db.query('UPDATE terminanfrage SET notiz = $2, geaendert_am = now() WHERE id = $1', [id, notiz?.trim() ? t.verschluesseln(notiz.trim(), 'terminanfrage.notiz') : null]);
  await protokolliere(db, { actor: wer, action: 'anfrage_notiz', objectType: 'terminanfrage', objectId: id });
}

/** Gewählten Vorschlag fest eintragen: Termin in der Kartei; die übrigen Reservierungen gibt es zurück zum Löschen */
export async function anfrageBestaetigen(db: Db, t: Tresor, id: string, wahl: number, wer: string): Promise<{ terminId: string; gewaehlt: Vorschlag; andere: Vorschlag[] }> {
  const a = await anfrageLesen(db, t, id);
  if (!a) throw new KarteiFehler('Unbekannte Anfrage');
  if (!a.patient) throw new KarteiFehler('Bitte zuerst den Patienten zuordnen oder anlegen');
  const gewaehlt = a.vorschlaege[wahl];
  if (!gewaehlt) throw new KarteiFehler('Diesen Vorschlag gibt es nicht');
  const dauer = Math.round((new Date(gewaehlt.ende).getTime() - new Date(gewaehlt.beginn).getTime()) / 60_000);
  const terminId = await terminAnlegen(db, a.patient.id, { datum: datumBerlin(gewaehlt.beginn), zeit: zeitBerlin(gewaehlt.beginn), dauerMin: dauer, terminartId: a.terminart?.id }, wer);
  await db.query("UPDATE terminanfrage SET status = 'bestaetigt', termin_id = $2, vorschlaege = $3, erledigt_am = now(), erledigt_von = $4, geaendert_am = now() WHERE id = $1", [id, terminId, JSON.stringify([{ ...gewaehlt, exchangeEventId: null }]), wer]);
  await protokolliere(db, { actor: wer, action: 'anfrage_bestaetigt', objectType: 'terminanfrage', objectId: id, details: { termin: terminId } });
  return { terminId, gewaehlt, andere: a.vorschlaege.filter((_, i) => i !== wahl) };
}

/** Vorschläge, die älter als `stunden` sind und noch nicht bestätigt wurden – ihre Reservierungen sollen weg */
export async function abgelaufeneVorschlaege(db: Db, stunden = 48): Promise<{ id: string; vorschlaege: Vorschlag[] }[]> {
  const { rows } = await db.query<{ id: string; vorschlaege: unknown }>(
    "SELECT id::text, vorschlaege FROM terminanfrage WHERE status = 'vorgeschlagen' AND geaendert_am < now() - make_interval(hours => $1) AND vorschlaege::text <> '[]'", [stunden],
  );
  return rows.map((r) => ({ id: r.id, vorschlaege: vorschlaegeAus(r.vorschlaege) }));
}

export async function reservierungenVergessen(db: Db, id: string): Promise<void> {
  await db.query("UPDATE terminanfrage SET vorschlaege = (SELECT coalesce(jsonb_agg(v - 'exchangeEventId' || '{\"exchangeEventId\": null}'), '[]') FROM jsonb_array_elements(vorschlaege) v) WHERE id = $1", [id]);
}
