/** Termine eines Patienten und aller Patienten (W77, W82, W113, W115): anlegen, ändern, Status, Behandlungsort, Kalenderabfrage */
import { protokolliere, type Db } from '../../db/index.ts';
import { iso, text } from '../../db/werte.ts';
import { SEKTION_SQL, type Sektion } from '../terminarten.ts';
import { berlinZeitUtc, datumBerlin } from '../../zeit.ts';
import { fahrtenBerechnen, type Behandlungsort } from '../hausbesuche.ts';
import { terminZuordnen } from '../rechnungen.ts';
import { KarteiFehler, datumPruefen, type Adresse, type TerminKurz } from './basis.ts';
import { adresseSpeichern } from './stammdaten.ts';

// ── Termine, Rezepte, Rechnungen (Kachel und Patientenseite) ────────────────

export async function termine(db: Db, patientId: string, o: { kommend?: boolean } = {}): Promise<TerminKurz[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT t.id::text, t.beginn, t.ende, t.art::text, t.status::text, t.verordnung_id::text, t.exchange_event_id, t.behandlungsort, pa.ort, ${ADRESSE_ZEILE_SQL} AS adresse, t.fahrt_vor_min, t.fahrt_nach_min
     FROM termin t LEFT JOIN patient_adresse pa ON pa.id = t.adresse_id WHERE t.patient_id = $1 ${o.kommend ? 'AND t.ende >= now()' : ''} ORDER BY t.beginn ${o.kommend ? '' : 'DESC'} LIMIT 50`, [patientId],
  );
  return rows.map((r) => ({
    id: String(r.id), beginn: iso(r.beginn)!, ende: iso(r.ende)!, art: String(r.art), status: String(r.status), verordnungId: text(r.verordnung_id), imKalender: r.exchange_event_id != null,
    behandlungsort: r.behandlungsort === 'hausbesuch' ? 'hausbesuch' : 'praxis', ort: text(r.ort), adresse: text(r.adresse), fahrtVorMin: Number(r.fahrt_vor_min ?? 0), fahrtNachMin: Number(r.fahrt_nach_min ?? 0),
  }));
}

/** Angaben zum Behandlungsort aus dem Formular (W113) – Fahrtzeiten leer = automatisch */
export interface OrtAngabe {
  /** „praxis“, „adresse:<id>“ oder „rechnung_kopieren“ (Rechnungsadresse als Hausbesuchadresse übernehmen) */
  behandlungsort?: string;
  fahrtVorMin?: number | null;
  fahrtNachMin?: number | null;
}

/**
 * Wahl des Behandlungsorts prüfen: beim Hausbesuch gehört die Adresse zum Patienten; „rechnung_kopieren“ legt aus der
 * Rechnungsadresse eine Hausbesuchadresse an (nur wenn es noch keine gibt). Ein Hausbesuch ohne Adresse wird abgelehnt.
 */
export async function behandlungsortKlaeren(db: Db, patientId: string, wahl: string | undefined, wer: string): Promise<{ behandlungsort: Behandlungsort; adresseId: string | null }> {
  const w = (wahl ?? 'praxis').trim();
  if (!w || w === 'praxis') return { behandlungsort: 'praxis', adresseId: null };
  const adressen = (await db.query<Adresse>('SELECT id::text, bezeichnung, zusatz, strasse, hausnummer, plz, ort, land, rechnungsadresse, typ FROM patient_adresse WHERE patient_id = $1 ORDER BY rechnungsadresse DESC, reihenfolge, id', [patientId])).rows;
  const m = /^adresse:(\d+)$/.exec(w);
  if (m) {
    if (!adressen.some((a) => a.id === m[1])) throw new KarteiFehler('Diese Adresse gehört nicht zu diesem Patienten');
    return { behandlungsort: 'hausbesuch', adresseId: m[1]! };
  }
  if (w === 'rechnung_kopieren') {
    const vorhanden = adressen.find((a) => a.typ === 'hausbesuch');
    if (vorhanden) return { behandlungsort: 'hausbesuch', adresseId: vorhanden.id };
    const r = adressen.find((a) => a.rechnungsadresse) ?? adressen[0];
    if (!r) throw new KarteiFehler('Für einen Hausbesuch braucht der Patient eine Adresse – zuerst unter „Adressen“ anlegen');
    const id = await adresseSpeichern(db, patientId, { bezeichnung: 'Hausbesuch', zusatz: r.zusatz, strasse: r.strasse, hausnummer: r.hausnummer, plz: r.plz, ort: r.ort, land: r.land, rechnungsadresse: false, typ: 'hausbesuch' }, wer);
    return { behandlungsort: 'hausbesuch', adresseId: id };
  }
  throw new KarteiFehler('Für einen Hausbesuch braucht der Termin eine Hausbesuchadresse – unter „Adressen“ anlegen oder die Rechnungsadresse übernehmen');
}

/** Fahrtzeiten aus dem Formular: beide leer = automatisch, sonst von Hand (eine leere Angabe zählt als 0) */
const fahrtWerte = (o: OrtAngabe, hausbesuch: boolean): { vor: number; nach: number; manuell: boolean } => {
  const gesetzt = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n);
  if (!hausbesuch || (!gesetzt(o.fahrtVorMin) && !gesetzt(o.fahrtNachMin))) return { vor: 0, nach: 0, manuell: false };
  const vor = gesetzt(o.fahrtVorMin) ? o.fahrtVorMin : 0;
  const nach = gesetzt(o.fahrtNachMin) ? o.fahrtNachMin : 0;
  if (vor < 0 || vor > 240 || nach < 0 || nach > 240) throw new KarteiFehler('Fahrtzeiten zwischen 0 und 240 Minuten');
  return { vor, nach, manuell: true };
};

export async function terminAnlegen(
  db: Db, patientId: string, d: { datum: string; zeit: string; dauerMin: number; art?: string; verordnungId?: string; fallId?: string; terminartId?: string; leistungNummer?: string } & OrtAngabe, wer: string,
): Promise<string> {
  const tagText = datumPruefen(d.datum, 'Datum');
  if (!tagText || !/^\d{2}:\d{2}$/.test(d.zeit)) throw new KarteiFehler('Datum und Uhrzeit sind nötig');
  if (!(d.dauerMin > 0)) throw new KarteiFehler('Die Dauer muss größer 0 sein');
  const beginn = new Date(berlinZeitUtc(tagText, d.zeit)).getTime();
  const ende = beginn + d.dauerMin * 60_000;
  const ort = await behandlungsortKlaeren(db, patientId, d.behandlungsort, wer);
  const fahrt = fahrtWerte(d, ort.behandlungsort === 'hausbesuch');
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO termin (patient_id, fall_id, verordnung_id, art, beginn, ende, erstellt_von, terminart_id, leistung_nummer, behandlungsort, adresse_id, fahrt_vor_min, fahrt_nach_min, fahrt_manuell)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id::text`,
    [patientId, d.fallId || null, d.verordnungId || null, d.art ?? 'behandlung', new Date(beginn).toISOString(), new Date(ende).toISOString(), wer, d.terminartId && /^\d+$/.test(d.terminartId) ? d.terminartId : null, text(d.leistungNummer),
      ort.behandlungsort, ort.adresseId, fahrt.vor, fahrt.nach, fahrt.manuell],
  );
  await protokolliere(db, { actor: wer, action: 'termin_angelegt', objectType: 'patient', objectId: patientId, details: { rezept: !!d.verordnungId, hausbesuch: ort.behandlungsort === 'hausbesuch' } });
  if (d.verordnungId) await terminZuordnen(db, d.verordnungId, rows[0]!.id, tagText);
  await fahrtenBerechnen(db, tagText);
  return rows[0]!.id;
}

export interface TerminDetail {
  id: string;
  beginn: string;
  ende: string;
  art: string;
  status: string;
  verordnungId: string | null;
  fallId: string | null;
  terminartId: string | null;
  leistungNummer: string | null;
  /** Hausbesuch (W113): Adresse und Fahrtzeiten; `fahrtManuell` = von Hand eingetragen, wird nicht neu gerechnet */
  behandlungsort: Behandlungsort;
  adresseId: string | null;
  fahrtVorMin: number;
  fahrtNachMin: number;
  fahrtManuell: boolean;
}

export async function terminLesen(db: Db, patientId: string, terminId: string): Promise<TerminDetail | undefined> {
  const r = (await db.query<Record<string, unknown>>(
    `SELECT id::text, beginn, ende, art::text, status::text, verordnung_id::text, fall_id::text, terminart_id::text, leistung_nummer, behandlungsort, adresse_id::text, fahrt_vor_min, fahrt_nach_min, fahrt_manuell
     FROM termin WHERE id = $1 AND patient_id = $2`, [terminId, patientId],
  )).rows[0];
  return r && {
    id: String(r.id), beginn: iso(r.beginn)!, ende: iso(r.ende)!, art: String(r.art), status: String(r.status), verordnungId: text(r.verordnung_id), fallId: text(r.fall_id),
    terminartId: text(r.terminart_id), leistungNummer: text(r.leistung_nummer),
    behandlungsort: r.behandlungsort === 'hausbesuch' ? 'hausbesuch' : 'praxis', adresseId: text(r.adresse_id), fahrtVorMin: Number(r.fahrt_vor_min), fahrtNachMin: Number(r.fahrt_nach_min), fahrtManuell: Boolean(r.fahrt_manuell),
  };
}

/** Termin ändern (W115): Datum, Zeit, Dauer, Art, Rezept, Terminart, Behandlungsort – solange er bestätigt oder vorgeschlagen ist; der Kalender zieht per Spiegelung nach */
export async function terminAendern(
  db: Db, patientId: string, terminId: string, d: { datum: string; zeit: string; dauerMin: number; art?: string; verordnungId?: string; terminartId?: string } & OrtAngabe, wer: string,
): Promise<void> {
  const t = await terminLesen(db, patientId, terminId);
  if (!t) throw new KarteiFehler('Diesen Termin gibt es nicht');
  if (!['vorgeschlagen', 'bestaetigt'].includes(t.status)) throw new KarteiFehler('Nur bestätigte oder vorgeschlagene Termine lassen sich ändern');
  const tagText = datumPruefen(d.datum, 'Datum');
  if (!tagText || !/^\d{2}:\d{2}$/.test(d.zeit)) throw new KarteiFehler('Datum und Uhrzeit sind nötig');
  if (!(d.dauerMin > 0)) throw new KarteiFehler('Die Dauer muss größer 0 sein');
  const beginn = new Date(berlinZeitUtc(tagText, d.zeit)).getTime();
  // Ohne Angabe bleibt der Behandlungsort, wie er war (Aufrufer ohne das Feld, z. B. Tests)
  const ort = d.behandlungsort === undefined ? { behandlungsort: t.behandlungsort, adresseId: t.adresseId } : await behandlungsortKlaeren(db, patientId, d.behandlungsort, wer);
  const fahrt = fahrtWerte(d, ort.behandlungsort === 'hausbesuch');
  await db.query(
    `UPDATE termin SET beginn = $3, ende = $4, art = $5, verordnung_id = $6, terminart_id = $7, behandlungsort = $8, adresse_id = $9, fahrt_vor_min = $10, fahrt_nach_min = $11, fahrt_manuell = $12, geaendert_am = now()
     WHERE id = $1 AND patient_id = $2`,
    [terminId, patientId, new Date(beginn).toISOString(), new Date(beginn + d.dauerMin * 60_000).toISOString(), d.art ?? t.art, d.verordnungId || null, d.terminartId && /^\d+$/.test(d.terminartId) ? d.terminartId : null,
      ort.behandlungsort, ort.adresseId, fahrt.vor, fahrt.nach, fahrt.manuell],
  );
  await protokolliere(db, { actor: wer, action: 'termin_geaendert', objectType: 'patient', objectId: patientId, details: { terminId } });
  const alterTag = datumBerlin(t.beginn);
  if (alterTag !== tagText) await fahrtenBerechnen(db, alterTag);
  await fahrtenBerechnen(db, tagText);
}

export async function terminStatus(db: Db, patientId: string, terminId: string, status: string, wer: string): Promise<void> {
  const erlaubt = ['bestaetigt', 'abgesagt_patient', 'abgesagt_praxis', 'nicht_erschienen'];
  if (!erlaubt.includes(status)) throw new KarteiFehler('Unbekannter Terminstatus');
  const r = await db.query<{ beginn: Date | string }>('UPDATE termin SET status = $3, geaendert_am = now() WHERE id = $1 AND patient_id = $2 RETURNING beginn', [terminId, patientId, status]);
  if (!r.rows.length) throw new KarteiFehler('Diesen Termin gibt es nicht');
  await protokolliere(db, { actor: wer, action: `termin_${status}`, objectType: 'patient', objectId: patientId });
  // Eine Absage ändert die Nachbarn: Fahrtzeiten des Tages neu rechnen (W113)
  await fahrtenBerechnen(db, datumBerlin(new Date(r.rows[0]!.beginn).toISOString()));
}

/** Termine aller Patienten in einem Zeitraum (Kalenderseite, W82) */
export interface TerminKalender {
  id: string;
  patientId: string;
  vorname: string;
  nachname: string;
  patientennummer: string;
  beginn: string;
  ende: string;
  art: string;
  status: string;
  rezept: boolean;
  imKalender: boolean;
  exchangeEventId: string | null;
  /** Kurzbezeichnung der Behandlung (W86): Kürzel der aktiven Preisliste, sonst Maßnahme bzw. Wellness-Kürzel */
  leistung: string | null;
  /** Sektion (W95): Rezept, Selbstzahler, Wellness – Farbe und Symbol im Kalender */
  sektion: Sektion | null;
  /** Hausbesuch (W113): Ort der Adresse, die Adresse in einer Zeile (für die Wegbeschreibung) und Fahrtzeiten in Minuten davor und danach */
  behandlungsort: Behandlungsort;
  ort: string | null;
  adresse: string | null;
  fahrtVorMin: number;
  fahrtNachMin: number;
}

/** Adresse in einer Zeile, „Bahnhofstraße 3, 86842 Türkheim“ – SQL-Ausdruck über den Alias pa */
export const ADRESSE_ZEILE_SQL = "nullif(concat_ws(', ', nullif(concat_ws(' ', pa.strasse, pa.hausnummer), ''), nullif(concat_ws(' ', pa.plz, pa.ort), '')), '')";

/** Kurzbezeichnung der Behandlung je Termin – die Alias t (Termin), v (Rezept), f (Fall), w (Wellness-Leistung) liefert TERMIN_VERKNUEPFUNG_SQL */
export const LEISTUNG_SQL = `coalesce(
  (SELECT pp.kuerzel FROM preisliste_position pp JOIN preisliste l ON l.id = pp.preisliste_id WHERE l.standard AND pp.nummer = coalesce(t.leistung_nummer, v.leistung_nummer) LIMIT 1),
  v.massnahme, w.code, CASE f.grundlage WHEN 'direktzugang' THEN 'Direktzugang' WHEN 'praevention' THEN 'Wellness' END)`;
const TERMIN_VERKNUEPFUNG_SQL = 'FROM termin t JOIN patient p ON p.id = t.patient_id LEFT JOIN verordnung v ON v.id = t.verordnung_id LEFT JOIN behandlungsfall f ON f.id = t.fall_id LEFT JOIN wellness_leistung w ON w.id = f.wellness_leistung_id LEFT JOIN terminart ta ON ta.id = t.terminart_id LEFT JOIN patient_adresse pa ON pa.id = t.adresse_id';

export async function termineZeitraum(db: Db, vonIso: string, bisIso: string): Promise<TerminKalender[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT t.id::text, t.patient_id::text, p.vorname, p.nachname, p.patientennummer, t.beginn, t.ende, t.art::text, t.status::text, (t.verordnung_id IS NOT NULL) AS rezept, t.exchange_event_id,
       coalesce(ta.kurz, ${LEISTUNG_SQL}) AS leistung, ${SEKTION_SQL} AS sektion, t.behandlungsort, pa.ort, ${ADRESSE_ZEILE_SQL} AS adresse, t.fahrt_vor_min, t.fahrt_nach_min
     ${TERMIN_VERKNUEPFUNG_SQL}
     WHERE t.beginn - make_interval(mins => t.fahrt_vor_min) < $2 AND t.ende + make_interval(mins => t.fahrt_nach_min) > $1 AND t.status NOT IN ('abgesagt_patient', 'abgesagt_praxis', 'verschoben') ORDER BY t.beginn`, [vonIso, bisIso],
  );
  return rows.map((r) => ({
    id: String(r.id), patientId: String(r.patient_id), vorname: String(r.vorname), nachname: String(r.nachname), patientennummer: String(r.patientennummer),
    beginn: iso(r.beginn)!, ende: iso(r.ende)!, art: String(r.art), status: String(r.status), rezept: Boolean(r.rezept), imKalender: r.exchange_event_id !== null, exchangeEventId: text(r.exchange_event_id), leistung: text(r.leistung), sektion: (text(r.sektion) as Sektion | null),
    behandlungsort: r.behandlungsort === 'hausbesuch' ? 'hausbesuch' : 'praxis', ort: text(r.ort), adresse: text(r.adresse), fahrtVorMin: Number(r.fahrt_vor_min ?? 0), fahrtNachMin: Number(r.fahrt_nach_min ?? 0),
  }));
}
