/**
 * Patientenkartei (W63–W68, requirements §4b): Stammdaten, Kontaktwege, Adressen, Kontaktverlauf
 * (Anrufe mit Gesprächsgrund), Akte (Behandlungsfälle, Behandlungen, Rezepte), Termine.
 *
 * Alles mit Gesundheitsbezug geht durch den Tresor (verschlüsselt in der Datenbank); der Spaltenname
 * ist der Kontext. Dokumentation wird nie geändert – nur ergänzt (Trigger in Migration 007).
 * Jedes Öffnen einer Akte landet im Protokoll (audit_event), ohne Inhalte.
 */
import { protokolliere, type Db } from '../db/index.ts';
import { iso, istId, tag, text, zahl } from '../db/werte.ts';
import type { Tresor } from '../tresor.ts';
import { berlinZeitUtc } from '../zeit.ts';
import { phaseVorruecken, type Phase } from './pinnwand.ts';
import { behandlungZuordnen, entwurfAnKorrekturAnpassen, rechnungAusRezept, rechnungAusSerie, STATUS_TEXT as RECHNUNG_STATUS_TEXT, terminZuordnen } from './rechnungen.ts';

export class KarteiFehler extends Error {}

/** Rechnungen: ab Fälligkeit gelb, ab so vielen Tagen danach (oder nach Mahnung) rot – E25 */
export const VERZUG_ROT_TAGE = 14;

export type Kontaktart = 'mobil' | 'telefon' | 'whatsapp' | 'email' | 'sonstige';
export type Rechnungsstand = 'ok' | 'gelb' | 'rot';

export interface Kontakt {
  id: string;
  art: Kontaktart;
  wert: string;
  normiert: string;
  bezeichnung: string | null;
  primaer: boolean;
}

export interface Adresse {
  id: string;
  bezeichnung: string | null;
  zusatz: string | null;
  strasse: string | null;
  hausnummer: string | null;
  plz: string | null;
  ort: string | null;
  land: string;
  rechnungsadresse: boolean;
}

export interface Bezugsperson {
  id: string;
  rolle: string;
  name: string;
  beziehung: string | null;
  berechtigungsgrund: string | null;
  telefon: string | null;
  email: string | null;
}

export interface Versicherung {
  id: string;
  art: string;
  versicherer: string | null;
  tarif: string | null;
  erstattungssatz: number | null;
}

/** Was die Kachel zeigt (W64) */
export interface PatientKurz {
  id: string;
  patientennummer: string;
  status: 'aktiv' | 'inaktiv' | 'archiviert';
  anrede: string | null;
  titel: string | null;
  vorname: string;
  nachname: string;
  patientSeit: string;
  ansprache: string | null;
  besonderheiten: string | null;
  telefon: Kontakt | null;
  whatsapp: Kontakt | null;
  email: Kontakt | null;
  letzteBehandlung: { id: string; datum: string; fallId: string } | null;
  naechsterTermin: { id: string; beginn: string; rezept: boolean } | null;
  rechnungsstand: Rechnungsstand;
  offeneAnrufe: number;
}

export interface Patient extends PatientKurz {
  geburtsdatum: string | null;
  geburtsname: string | null;
  sprache: string | null;
  kommunikationshilfe: string | null;
  berufBelastung: string | null;
  notiz: string | null;
  abrechnungsmodus: string;
  zwischenrechnungQuartale: number | null;
  exchangeKontaktId: string | null;
  lexwareKundennummer: string | null;
  preisliste: { id: string; name: string } | null;
  rechnungsversand: 'email' | 'post' | 'beides';
  kontakte: Kontakt[];
  adressen: Adresse[];
  bezugspersonen: Bezugsperson[];
  versicherungen: Versicherung[];
}

export interface VerlaufEintrag {
  id: string;
  art: string;
  am: string;
  grund: { code: string; bezeichnung: string } | null;
  notiz: string | null;
  offen: boolean;
  kontakt: { art: Kontaktart; wert: string } | null;
  erfasstVon: string;
}

export interface Gespraechsgrund {
  code: string;
  bezeichnung: string;
}

export interface TerminKurz {
  id: string;
  beginn: string;
  ende: string;
  art: string;
  status: string;
  verordnungId: string | null;
  /** im Exchange-Kalender gespiegelt (W77) */
  imKalender: boolean;
}

export type VerordnungArt = 'erst' | 'folge_unveraendert' | 'folge_angepasst' | 'wiederaufnahme' | 'korrektur';
export const VERORDNUNG_ARTEN: Record<VerordnungArt, string> = {
  erst: 'Erstrezept', folge_unveraendert: 'Folgerezept – unverändert', folge_angepasst: 'Folgerezept – angepasst', wiederaufnahme: 'Erneute Verordnung (Wiederaufnahme)', korrektur: 'Korrektur',
};

export interface VerordnungKurz {
  id: string;
  patientId: string;
  patientName: string;
  art: VerordnungArt;
  langzeit: boolean;
  ausgestelltAm: string;
  gueltigBis: string | null;
  massnahme: string;
  leistungNummer: string | null;
  frequenz: string | null;
  anzahlVerordnet: number;
  /** Haken über die ganze Kette (Original + Korrekturen) */
  abgehakt: number;
  status: string;
  arzt: string | null;
  fallId: string | null;
  fallNummer: number | null;
  vorgaengerId: string | null;
  zweitschriftAm: string | null;
  notiz: string | null;
}

/** Behandlungsserie ohne Rezept: Direktzugang oder Wellness – als Kachel neben den Rezepten (W73) */
export interface Serie {
  id: string;
  patientId: string;
  patientName: string;
  nummer: number;
  grundlage: 'direktzugang' | 'praevention';
  bezeichnung: string | null;
  wellness: { id: string; bezeichnung: string; preis: number } | null;
  begonnenAm: string | null;
  abgeschlossenAm: string | null;
  behandlungen: number;
  letzteAm: string | null;
}

export interface WellnessLeistung {
  id: string;
  code: string;
  bezeichnung: string;
  dauerMin: number | null;
  preis: number;
  aktiv: boolean;
}

export interface RechnungKurz {
  id: string;
  art: string;
  steuerklasse: string;
  datum: string | null;
  faelligAm: string | null;
  nummer: string | null;
  betrag: number | null;
  status: string;
  statusText: string;
  statusFarbe: string;
  gemahnt: boolean;
  positionen: number;
  versandArt: string | null;
  lexwareAbweichung: string | null;
  pdf: boolean;
}

export interface Behandlung {
  id: string;
  datum: string;
  dauerMin: number | null;
  behandeltVon: string;
  status: string;
  massnahmen: string | null;
  verlaufWirkung: string | null;
  reaktionen: string | null;
  uebungen: string | null;
  leistungen: { nummer: string; bezeichnung: string; anzahl: number; einzelpreis: number; verordnungId: string | null }[];
}

export interface Fall {
  id: string;
  nummer: number;
  grundlage: string;
  phase: string;
  steuerklasse: string;
  bezeichnung: string | null;
  anlass: string | null;
  diagnoseArzt: string | null;
  begonnenAm: string | null;
  abgeschlossenAm: string | null;
  behandlungen: Behandlung[];
}


// ── Normierung der Kontaktwege ───────────────────────────────────────────────

/** Telefonnummer nach E.164 für tel:/wa.me-Links („0151 123 45 67“ → „+491511234567“); Deutschland ist Standard */
export function telefonNormieren(wert: string): string {
  let z = wert.replace(/[^\d+]/g, '');
  if (z.startsWith('00')) z = `+${z.slice(2)}`;
  else if (z.startsWith('0')) z = `+49${z.slice(1)}`;
  else if (!z.startsWith('+')) z = `+49${z}`;
  return z;
}

export function kontaktNormieren(art: Kontaktart, wert: string): string {
  const w = wert.trim();
  if (art === 'email') return w.toLowerCase();
  if (art === 'sonstige') return w;
  return telefonNormieren(w);
}

export function kontaktPruefen(art: Kontaktart, wert: string): void {
  const w = wert.trim();
  if (!w) throw new KarteiFehler('Der Kontakt ist leer');
  if (art === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(w)) throw new KarteiFehler(`„${w}“ ist keine Mailadresse`);
  if ((art === 'mobil' || art === 'telefon' || art === 'whatsapp') && !/^\+?[\d\s/().-]{5,}$/.test(w)) throw new KarteiFehler(`„${w}“ ist keine Telefonnummer`);
}

// ── Lesen ───────────────────────────────────────────────────────────────────

const KACHEL_SQL = `
  p.id::text, p.patientennummer, p.status::text, p.anrede, p.titel, p.vorname, p.nachname, p.patient_seit, p.ansprache_hinweis, p.besonderheiten,
  (SELECT row_to_json(k) FROM (SELECT id::text, art::text, wert, normiert, bezeichnung, primaer FROM patient_kontakt k WHERE k.patient_id = p.id AND k.art IN ('mobil','telefon')
     ORDER BY k.primaer DESC, (k.art = 'mobil') DESC, k.reihenfolge, k.id LIMIT 1) k) AS telefon,
  (SELECT row_to_json(k) FROM (SELECT id::text, art::text, wert, normiert, bezeichnung, primaer FROM patient_kontakt k WHERE k.patient_id = p.id AND k.art = 'whatsapp'
     ORDER BY k.primaer DESC, k.reihenfolge, k.id LIMIT 1) k) AS whatsapp,
  (SELECT row_to_json(k) FROM (SELECT id::text, art::text, wert, normiert, bezeichnung, primaer FROM patient_kontakt k WHERE k.patient_id = p.id AND k.art = 'email'
     ORDER BY k.primaer DESC, k.reihenfolge, k.id LIMIT 1) k) AS email,
  (SELECT row_to_json(b) FROM (SELECT b.id::text, to_char(b.datum, 'YYYY-MM-DD') AS datum, b.fall_id::text AS "fallId" FROM behandlung b JOIN behandlungsfall f ON f.id = b.fall_id
     WHERE f.patient_id = p.id AND b.ersetzt_am IS NULL AND b.status = 'erledigt' ORDER BY b.datum DESC, b.id DESC LIMIT 1) b) AS letzte_behandlung,
  (SELECT row_to_json(t) FROM (SELECT t.id::text, t.beginn, (t.verordnung_id IS NOT NULL) AS rezept FROM termin t
     WHERE t.patient_id = p.id AND t.status IN ('vorgeschlagen','bestaetigt') AND t.ende >= now() ORDER BY t.beginn LIMIT 1) t) AS naechster_termin,
  (SELECT CASE
     WHEN bool_or(r.gemahnt_am IS NOT NULL OR r.faellig_am < CURRENT_DATE - ${VERZUG_ROT_TAGE}) THEN 'rot'
     WHEN bool_or(r.faellig_am < CURRENT_DATE) THEN 'gelb' ELSE 'ok' END
     FROM rechnung r WHERE r.patient_id = p.id AND r.status IN ('gesendet','freigegeben')) AS rechnungsstand,
  (SELECT count(*) FROM patient_kontaktverlauf v WHERE v.patient_id = p.id AND v.offen) AS offene_anrufe`;

type KachelZeile = Record<string, unknown> & { telefon: Kontakt | null; whatsapp: Kontakt | null; email: Kontakt | null };

function zuKurz(t: Tresor, r: KachelZeile): PatientKurz {
  const lb = r.letzte_behandlung as { id: string; datum: string; fallId: string } | null;
  const nt = r.naechster_termin as { id: string; beginn: string; rezept: boolean } | null;
  return {
    id: String(r.id), patientennummer: String(r.patientennummer), status: r.status as PatientKurz['status'],
    anrede: text(r.anrede), titel: text(r.titel), vorname: String(r.vorname), nachname: String(r.nachname), patientSeit: tag(r.patient_seit)!,
    ansprache: t.entschluesselnText(r.ansprache_hinweis as Uint8Array | null, 'patient.ansprache_hinweis'),
    besonderheiten: t.entschluesselnText(r.besonderheiten as Uint8Array | null, 'patient.besonderheiten'),
    telefon: r.telefon, whatsapp: r.whatsapp, email: r.email,
    letzteBehandlung: lb, naechsterTermin: nt ? { ...nt, beginn: iso(nt.beginn)! } : null,
    rechnungsstand: (r.rechnungsstand as Rechnungsstand | null) ?? 'ok', offeneAnrufe: Number(r.offene_anrufe ?? 0),
  };
}

export async function patientenListe(db: Db, t: Tresor, o: { suche?: string; archiv?: boolean } = {}): Promise<PatientKurz[]> {
  const suche = (o.suche ?? '').trim().toLowerCase();
  const werte: unknown[] = [];
  let wo = o.archiv ? "p.status = 'archiviert'" : "p.status <> 'archiviert'";
  if (suche) {
    werte.push(`%${suche}%`);
    wo += ` AND (lower(p.vorname || ' ' || p.nachname) LIKE $1 OR lower(p.nachname || ' ' || p.vorname) LIKE $1 OR lower(p.patientennummer) LIKE $1
      OR EXISTS (SELECT 1 FROM patient_kontakt k WHERE k.patient_id = p.id AND (lower(k.wert) LIKE $1 OR k.normiert LIKE $1)))`;
  }
  const { rows } = await db.query<KachelZeile>(`SELECT ${KACHEL_SQL} FROM patient p WHERE ${wo} ORDER BY lower(p.nachname), lower(p.vorname) LIMIT 300`, werte);
  return rows.map((r) => zuKurz(t, r));
}

export async function patientLesen(db: Db, t: Tresor, id: string): Promise<Patient | undefined> {
  if (!istId(id)) return undefined;
  const r = (await db.query<KachelZeile>(
    `SELECT ${KACHEL_SQL}, p.geburtsdatum, p.geburtsname, p.sprache, p.kommunikationshilfe, p.beruf_belastung, p.notiz, p.abrechnungsmodus::text,
       p.zwischenrechnung_quartale, p.exchange_kontakt_id, p.lexware_kundennummer, p.preisliste_id::text, p.rechnungsversand,
       (SELECT name FROM preisliste l WHERE l.id = p.preisliste_id) AS preisliste_name FROM patient p WHERE p.id = $1`, [id],
  )).rows[0];
  if (!r) return undefined;
  const kontakte = (await db.query<Kontakt>('SELECT id::text, art::text, wert, normiert, bezeichnung, primaer FROM patient_kontakt WHERE patient_id = $1 ORDER BY art, primaer DESC, reihenfolge, id', [id])).rows;
  const adressen = (await db.query<Adresse>('SELECT id::text, bezeichnung, zusatz, strasse, hausnummer, plz, ort, land, rechnungsadresse FROM patient_adresse WHERE patient_id = $1 ORDER BY rechnungsadresse DESC, reihenfolge, id', [id])).rows;
  const bezugspersonen = (await db.query<Bezugsperson>('SELECT id::text, rolle::text, name, beziehung, berechtigungsgrund, telefon, email FROM patient_bezugsperson WHERE patient_id = $1 ORDER BY rolle, id', [id])).rows;
  const versicherungen = (await db.query<Record<string, unknown>>('SELECT id::text, art::text, versicherer, tarif, erstattungssatz FROM patient_versicherung WHERE patient_id = $1 ORDER BY id', [id])).rows
    .map((v) => ({ id: String(v.id), art: String(v.art), versicherer: text(v.versicherer), tarif: text(v.tarif), erstattungssatz: zahl(v.erstattungssatz) }));
  return {
    ...zuKurz(t, r), geburtsdatum: tag(r.geburtsdatum), geburtsname: text(r.geburtsname), sprache: text(r.sprache), kommunikationshilfe: text(r.kommunikationshilfe),
    berufBelastung: t.entschluesselnText(r.beruf_belastung as Uint8Array | null, 'patient.beruf_belastung'),
    notiz: t.entschluesselnText(r.notiz as Uint8Array | null, 'patient.notiz'),
    abrechnungsmodus: String(r.abrechnungsmodus), zwischenrechnungQuartale: zahl(r.zwischenrechnung_quartale),
    exchangeKontaktId: text(r.exchange_kontakt_id), lexwareKundennummer: text(r.lexware_kundennummer),
    preisliste: r.preisliste_id ? { id: String(r.preisliste_id), name: String(r.preisliste_name) } : null, rechnungsversand: (r.rechnungsversand as Patient['rechnungsversand']) ?? 'email',
    kontakte, adressen, bezugspersonen, versicherungen,
  };
}

// ── Anlegen und Stammdaten ──────────────────────────────────────────────────

export interface Stammdaten {
  anrede?: string;
  titel?: string;
  vorname: string;
  nachname: string;
  geburtsname?: string;
  geburtsdatum?: string;
  patientSeit?: string;
  ansprache?: string;
  besonderheiten?: string;
  sprache?: string;
  kommunikationshilfe?: string;
  berufBelastung?: string;
  notiz?: string;
  patientennummer?: string;
  preislisteId?: string;
  rechnungsversand?: string;
}

const datumPruefen = (d: string | undefined, was: string): string | null => {
  const v = (d ?? '').trim();
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T12:00:00Z`))) throw new KarteiFehler(`${was}: bitte ein gültiges Datum (JJJJ-MM-TT)`);
  return v;
};

function stammdatenPruefen(d: Stammdaten): void {
  if (!d.vorname?.trim() || !d.nachname?.trim()) throw new KarteiFehler('Vorname und Nachname sind nötig');
  datumPruefen(d.geburtsdatum, 'Geburtsdatum');
  datumPruefen(d.patientSeit, 'Patient seit');
}

const geheim = (t: Tresor, wert: string | undefined, kontext: string) => (wert?.trim() ? t.verschluesseln(wert.trim(), kontext) : null);

export async function patientAnlegen(
  db: Db, t: Tresor,
  d: Stammdaten & { kontakte?: { art: Kontaktart; wert: string; bezeichnung?: string }[]; adresse?: Omit<Adresse, 'id' | 'rechnungsadresse' | 'land'> & { land?: string } },
  wer: string,
): Promise<string> {
  stammdatenPruefen(d);
  for (const k of d.kontakte ?? []) kontaktPruefen(k.art, k.wert);
  const nummer = text(d.patientennummer);
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO patient (${nummer ? 'patientennummer, ' : ''}anrede, titel, vorname, nachname, geburtsname, geburtsdatum, patient_seit, ansprache_hinweis, besonderheiten, sprache, kommunikationshilfe, beruf_belastung, notiz, erstellt_von, preisliste_id)
     VALUES (${nummer ? '$15, ' : ''}$1, $2, $3, $4, $5, $6, COALESCE($7::date, CURRENT_DATE), $8, $9, $10, $11, $12, $13, $14, (SELECT id FROM preisliste WHERE aktiv LIMIT 1)) RETURNING id::text`,
    [text(d.anrede), text(d.titel), d.vorname.trim(), d.nachname.trim(), text(d.geburtsname), datumPruefen(d.geburtsdatum, 'Geburtsdatum'), datumPruefen(d.patientSeit, 'Patient seit'),
      geheim(t, d.ansprache, 'patient.ansprache_hinweis'), geheim(t, d.besonderheiten, 'patient.besonderheiten'), text(d.sprache), text(d.kommunikationshilfe),
      geheim(t, d.berufBelastung, 'patient.beruf_belastung'), geheim(t, d.notiz, 'patient.notiz'), wer, ...(nummer ? [nummer] : [])],
  );
  const id = rows[0]!.id;
  const gesehen = new Set<string>();
  for (const k of d.kontakte ?? []) {
    if (!k.wert.trim()) continue;
    await kontaktSpeichern(db, id, { art: k.art, wert: k.wert, bezeichnung: k.bezeichnung, primaer: !gesehen.has(k.art) }, wer, { ohneProtokoll: true });
    gesehen.add(k.art);
  }
  if (d.adresse && (d.adresse.strasse || d.adresse.ort || d.adresse.plz)) {
    await adresseSpeichern(db, id, { ...d.adresse, rechnungsadresse: true }, wer, { ohneProtokoll: true });
  }
  await protokolliere(db, { actor: wer, action: 'patient_angelegt', objectType: 'patient', objectId: id });
  return id;
}

export async function stammdatenSpeichern(db: Db, t: Tresor, id: string, d: Stammdaten, wer: string): Promise<void> {
  stammdatenPruefen(d);
  const r = await db.query(
    `UPDATE patient SET anrede = $2, titel = $3, vorname = $4, nachname = $5, geburtsname = $6, geburtsdatum = $7, patient_seit = COALESCE($8::date, patient_seit),
       ansprache_hinweis = $9, besonderheiten = $10, sprache = $11, kommunikationshilfe = $12, beruf_belastung = $13, notiz = $14,
       preisliste_id = COALESCE($15::bigint, preisliste_id), rechnungsversand = COALESCE($16, rechnungsversand), geaendert_am = now()
     WHERE id = $1 RETURNING id`,
    [id, text(d.anrede), text(d.titel), d.vorname.trim(), d.nachname.trim(), text(d.geburtsname), datumPruefen(d.geburtsdatum, 'Geburtsdatum'), datumPruefen(d.patientSeit, 'Patient seit'),
      geheim(t, d.ansprache, 'patient.ansprache_hinweis'), geheim(t, d.besonderheiten, 'patient.besonderheiten'), text(d.sprache), text(d.kommunikationshilfe),
      geheim(t, d.berufBelastung, 'patient.beruf_belastung'), geheim(t, d.notiz, 'patient.notiz'),
      d.preislisteId && istId(d.preislisteId) ? d.preislisteId : null, ['email', 'post', 'beides'].includes(d.rechnungsversand ?? '') ? d.rechnungsversand : null],
  );
  if (!r.rows.length) throw new KarteiFehler('Diesen Patienten gibt es nicht');
  await protokolliere(db, { actor: wer, action: 'patient_geaendert', objectType: 'patient', objectId: id });
}

export async function statusSetzen(db: Db, id: string, status: 'aktiv' | 'inaktiv' | 'archiviert', wer: string): Promise<void> {
  await db.query(
    `UPDATE patient SET status = $2::patient_status, archiviert_am = CASE WHEN $2::text = 'archiviert' THEN now() ELSE NULL END, geaendert_am = now() WHERE id = $1`,
    [id, status],
  );
  await protokolliere(db, { actor: wer, action: `patient_${status}`, objectType: 'patient', objectId: id });
}

// ── Kontaktwege und Adressen ────────────────────────────────────────────────

export async function kontaktSpeichern(
  db: Db, patientId: string, k: { kontaktId?: string; art: Kontaktart; wert: string; bezeichnung?: string; primaer?: boolean }, wer: string, o: { ohneProtokoll?: boolean } = {},
): Promise<string> {
  kontaktPruefen(k.art, k.wert);
  const normiert = kontaktNormieren(k.art, k.wert);
  const vorhanden = (await db.query<{ n: string }>('SELECT count(*)::text AS n FROM patient_kontakt WHERE patient_id = $1 AND art = $2', [patientId, k.art])).rows[0]!.n;
  const primaer = k.primaer || vorhanden === '0';
  if (primaer) await db.query('UPDATE patient_kontakt SET primaer = false WHERE patient_id = $1 AND art = $2', [patientId, k.art]);
  let id = k.kontaktId;
  if (id) {
    await db.query('UPDATE patient_kontakt SET art = $3, wert = $4, normiert = $5, bezeichnung = $6, primaer = $7 WHERE id = $1 AND patient_id = $2',
      [id, patientId, k.art, k.wert.trim(), normiert, text(k.bezeichnung), primaer]);
  } else {
    id = (await db.query<{ id: string }>(
      'INSERT INTO patient_kontakt (patient_id, art, wert, normiert, bezeichnung, primaer) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id::text',
      [patientId, k.art, k.wert.trim(), normiert, text(k.bezeichnung), primaer],
    )).rows[0]!.id;
  }
  await db.query('UPDATE patient SET geaendert_am = now() WHERE id = $1', [patientId]);
  if (!o.ohneProtokoll) await protokolliere(db, { actor: wer, action: 'patient_kontakt', objectType: 'patient', objectId: patientId, details: { art: k.art } });
  return id;
}

export async function kontaktLoeschen(db: Db, patientId: string, kontaktId: string, wer: string): Promise<void> {
  const r = await db.query<{ art: Kontaktart; primaer: boolean }>('DELETE FROM patient_kontakt WHERE id = $1 AND patient_id = $2 RETURNING art, primaer', [kontaktId, patientId]);
  const weg = r.rows[0];
  if (!weg) throw new KarteiFehler('Diesen Kontakt gibt es nicht');
  // Der nächste Kontakt derselben Art wird primär, damit die Kachel nie leer bleibt
  if (weg.primaer) {
    await db.query('UPDATE patient_kontakt SET primaer = true WHERE id = (SELECT id FROM patient_kontakt WHERE patient_id = $1 AND art = $2 ORDER BY reihenfolge, id LIMIT 1)', [patientId, weg.art]);
  }
  await protokolliere(db, { actor: wer, action: 'patient_kontakt_entfernt', objectType: 'patient', objectId: patientId, details: { art: weg.art } });
}

export async function adresseSpeichern(
  db: Db, patientId: string, a: Partial<Adresse> & { adresseId?: string }, wer: string, o: { ohneProtokoll?: boolean } = {},
): Promise<string> {
  if (!text(a.ort) && !text(a.strasse)) throw new KarteiFehler('Eine Adresse braucht mindestens Straße oder Ort');
  const anzahl = (await db.query<{ n: string }>('SELECT count(*)::text AS n FROM patient_adresse WHERE patient_id = $1', [patientId])).rows[0]!.n;
  const rechnungsadresse = a.rechnungsadresse || anzahl === '0';
  if (rechnungsadresse) await db.query('UPDATE patient_adresse SET rechnungsadresse = false WHERE patient_id = $1', [patientId]);
  const werte = [patientId, text(a.bezeichnung), text(a.zusatz), text(a.strasse), text(a.hausnummer), text(a.plz), text(a.ort), text(a.land)?.toUpperCase() ?? 'DE', rechnungsadresse];
  let id = a.adresseId;
  if (id) {
    await db.query('UPDATE patient_adresse SET bezeichnung = $3, zusatz = $4, strasse = $5, hausnummer = $6, plz = $7, ort = $8, land = $9, rechnungsadresse = $10 WHERE id = $2 AND patient_id = $1', [patientId, id, ...werte.slice(1)]);
  } else {
    id = (await db.query<{ id: string }>(
      'INSERT INTO patient_adresse (patient_id, bezeichnung, zusatz, strasse, hausnummer, plz, ort, land, rechnungsadresse) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id::text', werte,
    )).rows[0]!.id;
  }
  await db.query('UPDATE patient SET geaendert_am = now() WHERE id = $1', [patientId]);
  if (!o.ohneProtokoll) await protokolliere(db, { actor: wer, action: 'patient_adresse', objectType: 'patient', objectId: patientId });
  return id;
}

export async function rechnungsadresseSetzen(db: Db, patientId: string, adresseId: string, wer: string): Promise<void> {
  await db.query('UPDATE patient_adresse SET rechnungsadresse = false WHERE patient_id = $1', [patientId]);
  const r = await db.query('UPDATE patient_adresse SET rechnungsadresse = true WHERE id = $1 AND patient_id = $2 RETURNING id', [adresseId, patientId]);
  if (!r.rows.length) throw new KarteiFehler('Diese Adresse gibt es nicht');
  await protokolliere(db, { actor: wer, action: 'patient_rechnungsadresse', objectType: 'patient', objectId: patientId });
}

export async function adresseLoeschen(db: Db, patientId: string, adresseId: string, wer: string): Promise<void> {
  const r = await db.query<{ rechnungsadresse: boolean }>('DELETE FROM patient_adresse WHERE id = $1 AND patient_id = $2 RETURNING rechnungsadresse', [adresseId, patientId]);
  if (!r.rows[0]) throw new KarteiFehler('Diese Adresse gibt es nicht');
  if (r.rows[0].rechnungsadresse) {
    await db.query('UPDATE patient_adresse SET rechnungsadresse = true WHERE id = (SELECT id FROM patient_adresse WHERE patient_id = $1 ORDER BY reihenfolge, id LIMIT 1)', [patientId]);
  }
  await protokolliere(db, { actor: wer, action: 'patient_adresse_entfernt', objectType: 'patient', objectId: patientId });
}

// ── Kontaktverlauf (W67) ────────────────────────────────────────────────────

export const gespraechsgruende = async (db: Db): Promise<Gespraechsgrund[]> =>
  (await db.query<Gespraechsgrund>('SELECT code, bezeichnung FROM gespraechsgrund WHERE aktiv ORDER BY reihenfolge, code')).rows;

export async function kontaktverlauf(db: Db, t: Tresor, patientId: string, limit = 50): Promise<VerlaufEintrag[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT v.id::text, v.art::text, v.am, v.grund_code, g.bezeichnung AS grund_text, v.notiz, v.offen, v.erfasst_von, k.art::text AS k_art, k.wert AS k_wert
     FROM patient_kontaktverlauf v LEFT JOIN gespraechsgrund g ON g.code = v.grund_code LEFT JOIN patient_kontakt k ON k.id = v.kontakt_id
     WHERE v.patient_id = $1 ORDER BY v.offen DESC, v.am DESC LIMIT $2`, [patientId, limit],
  );
  return rows.map((r) => ({
    id: String(r.id), art: String(r.art), am: iso(r.am)!, offen: Boolean(r.offen), erfasstVon: String(r.erfasst_von),
    grund: r.grund_code ? { code: String(r.grund_code), bezeichnung: String(r.grund_text ?? r.grund_code) } : null,
    notiz: t.entschluesselnText(r.notiz as Uint8Array | null, 'kontaktverlauf.notiz'),
    kontakt: r.k_art ? { art: r.k_art as Kontaktart, wert: String(r.k_wert) } : null,
  }));
}

/** Anruf aus der Kachel: Eintrag „offen“ – der Gesprächsgrund kommt nach dem Gespräch */
export async function anrufBeginnen(db: Db, patientId: string, kontaktId: string | undefined, wer: string): Promise<string> {
  const art = kontaktId ? (await db.query<{ art: Kontaktart }>('SELECT art::text AS art FROM patient_kontakt WHERE id = $1 AND patient_id = $2', [kontaktId, patientId])).rows[0]?.art : undefined;
  const verlaufArt = art === 'whatsapp' ? 'whatsapp' : art === 'email' ? 'email' : 'anruf_ausgehend';
  const { rows } = await db.query<{ id: string }>(
    'INSERT INTO patient_kontaktverlauf (patient_id, kontakt_id, art, offen, erfasst_von) VALUES ($1, $2, $3, true, $4) RETURNING id::text',
    [patientId, art ? kontaktId : null, verlaufArt, wer],
  );
  await protokolliere(db, { actor: wer, action: 'patient_kontaktiert', objectType: 'patient', objectId: patientId, details: { art: verlaufArt } });
  return rows[0]!.id;
}

export async function verlaufAbschliessen(db: Db, t: Tresor, patientId: string, eintragId: string, d: { grund: string; notiz?: string }, wer: string): Promise<void> {
  if (!d.grund) throw new KarteiFehler('Bitte einen Gesprächsgrund wählen');
  const r = await db.query(
    'UPDATE patient_kontaktverlauf SET grund_code = $3, notiz = $4, offen = false WHERE id = $1 AND patient_id = $2 AND offen RETURNING id',
    [eintragId, patientId, d.grund, geheim(t, d.notiz, 'kontaktverlauf.notiz')],
  );
  if (!r.rows.length) throw new KarteiFehler('Dieser Eintrag ist nicht mehr offen');
}

export async function verlaufEintragen(
  db: Db, t: Tresor, patientId: string, d: { art: string; grund?: string; notiz?: string; kontaktId?: string }, wer: string,
): Promise<string> {
  const arten = ['anruf_ausgehend', 'anruf_eingehend', 'email', 'whatsapp', 'sms', 'brief', 'persoenlich', 'notiz'];
  if (!arten.includes(d.art)) throw new KarteiFehler('Unbekannte Art des Eintrags');
  if (!d.grund && !d.notiz?.trim()) throw new KarteiFehler('Bitte einen Gesprächsgrund wählen oder eine Notiz schreiben');
  const { rows } = await db.query<{ id: string }>(
    'INSERT INTO patient_kontaktverlauf (patient_id, kontakt_id, art, grund_code, notiz, erfasst_von) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id::text',
    [patientId, d.kontaktId || null, d.art, d.grund || null, geheim(t, d.notiz, 'kontaktverlauf.notiz'), wer],
  );
  return rows[0]!.id;
}

export async function verlaufVerwerfen(db: Db, patientId: string, eintragId: string): Promise<void> {
  await db.query('DELETE FROM patient_kontaktverlauf WHERE id = $1 AND patient_id = $2 AND offen', [eintragId, patientId]);
}

// ── Termine, Rezepte, Rechnungen (Kachel und Patientenseite) ────────────────

export async function termine(db: Db, patientId: string, o: { kommend?: boolean } = {}): Promise<TerminKurz[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT id::text, beginn, ende, art::text, status::text, verordnung_id::text, exchange_event_id FROM termin WHERE patient_id = $1 ${o.kommend ? 'AND ende >= now()' : ''} ORDER BY beginn ${o.kommend ? '' : 'DESC'} LIMIT 50`, [patientId],
  );
  return rows.map((r) => ({ id: String(r.id), beginn: iso(r.beginn)!, ende: iso(r.ende)!, art: String(r.art), status: String(r.status), verordnungId: text(r.verordnung_id), imKalender: r.exchange_event_id != null }));
}

export async function terminAnlegen(
  db: Db, patientId: string, d: { datum: string; zeit: string; dauerMin: number; art?: string; verordnungId?: string; fallId?: string }, wer: string,
): Promise<string> {
  const tagText = datumPruefen(d.datum, 'Datum');
  if (!tagText || !/^\d{2}:\d{2}$/.test(d.zeit)) throw new KarteiFehler('Datum und Uhrzeit sind nötig');
  if (!(d.dauerMin > 0)) throw new KarteiFehler('Die Dauer muss größer 0 sein');
  const beginn = new Date(berlinZeitUtc(tagText, d.zeit)).getTime();
  const ende = beginn + d.dauerMin * 60_000;
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO termin (patient_id, fall_id, verordnung_id, art, beginn, ende, erstellt_von) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id::text`,
    [patientId, d.fallId || null, d.verordnungId || null, d.art ?? 'behandlung', new Date(beginn).toISOString(), new Date(ende).toISOString(), wer],
  );
  await protokolliere(db, { actor: wer, action: 'termin_angelegt', objectType: 'patient', objectId: patientId, details: { rezept: !!d.verordnungId } });
  if (d.verordnungId) await terminZuordnen(db, d.verordnungId, rows[0]!.id, tagText);
  return rows[0]!.id;
}

export async function terminStatus(db: Db, patientId: string, terminId: string, status: string, wer: string): Promise<void> {
  const erlaubt = ['bestaetigt', 'abgesagt_patient', 'abgesagt_praxis', 'nicht_erschienen'];
  if (!erlaubt.includes(status)) throw new KarteiFehler('Unbekannter Terminstatus');
  const r = await db.query('UPDATE termin SET status = $3, geaendert_am = now() WHERE id = $1 AND patient_id = $2 RETURNING id', [terminId, patientId, status]);
  if (!r.rows.length) throw new KarteiFehler('Diesen Termin gibt es nicht');
  await protokolliere(db, { actor: wer, action: `termin_${status}`, objectType: 'patient', objectId: patientId });
}

/** Haken über die Kette aus Original und Korrekturen (Korrekturen bringen kein neues Kontingent) */
const HAKEN_SQL = (alias: string) => `(WITH RECURSIVE kette AS (
    SELECT k0.id, k0.vorgaenger_id, k0.art FROM verordnung k0 WHERE k0.id = ${alias}.id
    UNION ALL SELECT k1.id, k1.vorgaenger_id, k1.art FROM verordnung k1 JOIN kette k ON k1.id = k.vorgaenger_id WHERE k.art = 'korrektur')
  SELECT coalesce(sum(bl.anzahl), 0) FROM behandlung_leistung bl JOIN behandlung b ON b.id = bl.behandlung_id
  WHERE bl.verordnung_id IN (SELECT id FROM kette) AND b.ersetzt_am IS NULL)`;

export async function verordnungen(db: Db, o: { patientId?: string; nurAktiv?: boolean } = {}): Promise<VerordnungKurz[]> {
  const wo = [o.patientId ? 'v.patient_id = $1' : 'true', o.nurAktiv ? "v.status = 'aktiv'" : 'true'].join(' AND ');
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT v.id::text, v.patient_id::text, p.vorname || ' ' || p.nachname AS patient_name, v.art::text, v.langzeit, v.ausgestellt_am, v.gueltig_bis, v.massnahme, v.leistung_nummer, v.frequenz,
       v.anzahl_verordnet, v.status::text, v.fall_id::text, f.nummer AS fall_nummer, a.name AS arzt, v.vorgaenger_id::text, v.zweitschrift_am, v.notiz,
       ${HAKEN_SQL('v')} AS abgehakt
     FROM verordnung v JOIN patient p ON p.id = v.patient_id LEFT JOIN arzt a ON a.id = v.arzt_id LEFT JOIN behandlungsfall f ON f.id = v.fall_id
     WHERE ${wo} ORDER BY v.status = 'aktiv' DESC, v.ausgestellt_am DESC, v.id DESC LIMIT 300`, o.patientId ? [o.patientId] : [],
  );
  return rows.map((r) => ({
    id: String(r.id), patientId: String(r.patient_id), patientName: String(r.patient_name), art: r.art as VerordnungArt, langzeit: Boolean(r.langzeit),
    ausgestelltAm: tag(r.ausgestellt_am)!, gueltigBis: tag(r.gueltig_bis), massnahme: String(r.massnahme), leistungNummer: text(r.leistung_nummer), frequenz: text(r.frequenz),
    anzahlVerordnet: Number(r.anzahl_verordnet), abgehakt: Number(r.abgehakt), status: String(r.status), arzt: text(r.arzt), fallId: text(r.fall_id), fallNummer: zahl(r.fall_nummer),
    vorgaengerId: text(r.vorgaenger_id), zweitschriftAm: tag(r.zweitschrift_am), notiz: text(r.notiz),
  }));
}

export async function verordnungAnlegen(
  db: Db, t: Tresor, patientId: string,
  d: {
    ausgestelltAm: string; arzt?: string; massnahme: string; leistungNummer?: string; anzahl: number; frequenz?: string; diagnose?: string; gueltigBis?: string; fallId?: string;
    art?: string; langzeit?: boolean; vorgaengerId?: string; notiz?: string;
  },
  wer: string,
): Promise<string> {
  const am = datumPruefen(d.ausgestelltAm, 'Ausstellungsdatum');
  if (!am) throw new KarteiFehler('Ausstellungsdatum fehlt');
  if (!d.massnahme?.trim()) throw new KarteiFehler('Die verordnete Maßnahme fehlt (z. B. Manuelle Therapie)');
  if (!(Number.isInteger(d.anzahl) && d.anzahl > 0)) throw new KarteiFehler('Die Anzahl der Behandlungen muss eine ganze Zahl größer 0 sein');
  const art = (d.art ?? 'erst') as VerordnungArt;
  if (!(art in VERORDNUNG_ARTEN)) throw new KarteiFehler('Unbekannte Rezeptart');
  let vorgaenger: { id: string; fall_id: string | null; status: string } | undefined;
  if (d.vorgaengerId) {
    vorgaenger = (await db.query<{ id: string; fall_id: string | null; status: string }>('SELECT id::text, fall_id::text, status::text FROM verordnung WHERE id = $1 AND patient_id = $2', [d.vorgaengerId, patientId])).rows[0];
    if (!vorgaenger) throw new KarteiFehler('Das vorherige Rezept gibt es nicht');
  }
  if (art !== 'erst' && !vorgaenger) throw new KarteiFehler(`${VERORDNUNG_ARTEN[art]}: bitte das vorherige Rezept wählen`);
  if (art === 'korrektur' && vorgaenger!.status !== 'aktiv') throw new KarteiFehler('Nur ein aktives Rezept lässt sich korrigieren');
  let arztId: string | null = null;
  if (text(d.arzt)) {
    const name = d.arzt!.trim();
    arztId = (await db.query<{ id: string }>('SELECT id::text FROM arzt WHERE lower(name) = lower($1) LIMIT 1', [name])).rows[0]?.id
      ?? (await db.query<{ id: string }>('INSERT INTO arzt (name) VALUES ($1) RETURNING id::text', [name])).rows[0]!.id;
  }
  // Folgerezepte und Korrekturen gehören zum Fall des Vorgängers, wenn nichts anderes gewählt ist
  const fallId = d.fallId || (art !== 'erst' && art !== 'wiederaufnahme' ? vorgaenger?.fall_id : null) || null;
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO verordnung (patient_id, fall_id, arzt_id, ausgestellt_am, massnahme, leistung_nummer, anzahl_verordnet, frequenz, gueltig_bis, diagnose, art, langzeit, vorgaenger_id, notiz, erstellt_von)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id::text`,
    [patientId, fallId, arztId, am, d.massnahme.trim(), text(d.leistungNummer), d.anzahl, text(d.frequenz), datumPruefen(d.gueltigBis, 'Gültig bis'),
      geheim(t, d.diagnose, 'verordnung.diagnose'), art, !!d.langzeit, vorgaenger?.id ?? null, text(d.notiz), wer],
  );
  // Korrektur: das berichtigte Rezept gilt nicht mehr, seine Haken zählen in der Kette weiter
  if (art === 'korrektur') {
    await db.query("UPDATE verordnung SET status = 'ersetzt' WHERE id = $1", [vorgaenger!.id]);
    // Entwurf und offene Termine des berichtigten Rezepts gehören jetzt zur Korrektur; die Positionen folgen der neuen Anzahl
    await entwurfAnKorrekturAnpassen(db, patientId, vorgaenger!.id, rows[0]!.id, d.anzahl, text(d.leistungNummer), d.massnahme.trim());
    await db.query("UPDATE termin SET verordnung_id = $2 WHERE verordnung_id = $1 AND status IN ('vorgeschlagen', 'bestaetigt')", [vorgaenger!.id, rows[0]!.id]);
  }
  await protokolliere(db, { actor: wer, action: 'verordnung_angelegt', objectType: 'patient', objectId: patientId, details: { anzahl: d.anzahl, art } });
  // Jedes Rezept bekommt sofort seinen Rechnungsentwurf (W79) – die Korrektur übernimmt den des Vorgängers
  if (art !== 'korrektur') await rechnungAusRezept(db, patientId, rows[0]!.id, wer);
  return rows[0]!.id;
}

/** Zweitschrift: nur ein Vermerk – kein neues Kontingent */
export async function zweitschriftVermerken(db: Db, patientId: string, verordnungId: string, datum: string | undefined, wer: string): Promise<void> {
  const r = await db.query('UPDATE verordnung SET zweitschrift_am = COALESCE($3::date, CURRENT_DATE) WHERE id = $1 AND patient_id = $2 RETURNING id', [verordnungId, patientId, datumPruefen(datum, 'Datum')]);
  if (!r.rows.length) throw new KarteiFehler('Dieses Rezept gibt es nicht');
  await protokolliere(db, { actor: wer, action: 'verordnung_zweitschrift', objectType: 'patient', objectId: patientId });
}

export async function verordnungAbbrechen(db: Db, patientId: string, verordnungId: string, grund: string, wer: string): Promise<void> {
  if (!grund.trim()) throw new KarteiFehler('Der Grund für den Abbruch ist Pflicht');
  const r = await db.query("UPDATE verordnung SET status = 'abgebrochen', abbruch_grund = $3, abbruch_am = CURRENT_DATE WHERE id = $1 AND patient_id = $2 AND status = 'aktiv' RETURNING id", [verordnungId, patientId, grund.trim()]);
  if (!r.rows.length) throw new KarteiFehler('Nur ein aktives Rezept lässt sich abbrechen');
  await protokolliere(db, { actor: wer, action: 'verordnung_abgebrochen', objectType: 'patient', objectId: patientId });
}

// ── Serien ohne Rezept (Direktzugang, Wellness) und Wellness-Katalog ────────

export async function serien(db: Db, t: Tresor, o: { patientId?: string; nurOffen?: boolean } = {}): Promise<Serie[]> {
  const wo = [o.patientId ? 'f.patient_id = $1' : 'true', o.nurOffen ? 'f.abgeschlossen_am IS NULL' : 'true', "f.grundlage IN ('direktzugang', 'praevention')"].join(' AND ');
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT f.id::text, f.patient_id::text, p.vorname || ' ' || p.nachname AS patient_name, f.nummer, f.grundlage::text, f.bezeichnung, f.begonnen_am, f.abgeschlossen_am,
       w.id::text AS w_id, w.bezeichnung AS w_bezeichnung, w.preis AS w_preis,
       (SELECT count(*) FROM behandlung b WHERE b.fall_id = f.id AND b.ersetzt_am IS NULL AND b.status = 'erledigt') AS behandlungen,
       (SELECT max(b.datum) FROM behandlung b WHERE b.fall_id = f.id AND b.ersetzt_am IS NULL) AS letzte_am
     FROM behandlungsfall f JOIN patient p ON p.id = f.patient_id LEFT JOIN wellness_leistung w ON w.id = f.wellness_leistung_id
     WHERE ${wo} ORDER BY f.abgeschlossen_am IS NULL DESC, f.begonnen_am DESC NULLS LAST, f.id DESC LIMIT 300`, o.patientId ? [o.patientId] : [],
  );
  return rows.map((r) => ({
    id: String(r.id), patientId: String(r.patient_id), patientName: String(r.patient_name), nummer: Number(r.nummer), grundlage: r.grundlage as Serie['grundlage'],
    bezeichnung: t.entschluesselnText(r.bezeichnung as Uint8Array | null, 'behandlungsfall.bezeichnung'),
    wellness: r.w_id ? { id: String(r.w_id), bezeichnung: String(r.w_bezeichnung), preis: Number(r.w_preis) } : null,
    begonnenAm: tag(r.begonnen_am), abgeschlossenAm: tag(r.abgeschlossen_am), behandlungen: Number(r.behandlungen), letzteAm: tag(r.letzte_am),
  }));
}

export async function serieAbschliessen(db: Db, patientId: string, fallId: string, wer: string): Promise<void> {
  const r = await db.query("UPDATE behandlungsfall SET abgeschlossen_am = CURRENT_DATE, phase = 'abschluss', geaendert_am = now() WHERE id = $1 AND patient_id = $2 AND abgeschlossen_am IS NULL RETURNING id", [fallId, patientId]);
  if (!r.rows.length) throw new KarteiFehler('Diese Serie ist nicht offen');
  await db.query("INSERT INTO behandlungsfall_phase (fall_id, von, nach, wer, grund) VALUES ($1, 'behandlung', 'abschluss', $2, 'Serie abgeschlossen')", [fallId, wer]);
  await protokolliere(db, { actor: wer, action: 'fall_abgeschlossen', objectType: 'patient', objectId: patientId });
}

export async function wellnessLeistungen(db: Db, o: { alle?: boolean } = {}): Promise<WellnessLeistung[]> {
  const { rows } = await db.query<Record<string, unknown>>(`SELECT id::text, code, bezeichnung, dauer_min, preis, aktiv FROM wellness_leistung ${o.alle ? '' : 'WHERE aktiv'} ORDER BY reihenfolge, bezeichnung`);
  return rows.map((r) => ({ id: String(r.id), code: String(r.code), bezeichnung: String(r.bezeichnung), dauerMin: zahl(r.dauer_min), preis: Number(r.preis), aktiv: Boolean(r.aktiv) }));
}

export async function wellnessSpeichern(db: Db, d: { id?: string; code: string; bezeichnung: string; dauerMin?: number; preis: string }, wer: string): Promise<string> {
  const code = d.code.trim().toUpperCase();
  if (!/^[A-Z0-9-]{2,12}$/.test(code)) throw new KarteiFehler('Kürzel: 2–12 Zeichen, Buchstaben, Ziffern oder Bindestrich (z. B. WM60)');
  if (!d.bezeichnung.trim()) throw new KarteiFehler('Die Bezeichnung fehlt');
  const preis = Number(d.preis.replace(',', '.'));
  if (!(preis >= 0)) throw new KarteiFehler('Der Preis muss eine Zahl sein, z. B. 65,00');
  const werte = [code, d.bezeichnung.trim(), d.dauerMin || null, preis.toFixed(2)];
  const id = d.id
    ? (await db.query<{ id: string }>('UPDATE wellness_leistung SET code = $2, bezeichnung = $3, dauer_min = $4, preis = $5 WHERE id = $1 RETURNING id::text', [d.id, ...werte])).rows[0]?.id
    : (await db.query<{ id: string }>('INSERT INTO wellness_leistung (code, bezeichnung, dauer_min, preis) VALUES ($1, $2, $3, $4) ON CONFLICT (code) DO UPDATE SET bezeichnung = EXCLUDED.bezeichnung, dauer_min = EXCLUDED.dauer_min, preis = EXCLUDED.preis, aktiv = true RETURNING id::text', werte)).rows[0]?.id;
  if (!id) throw new KarteiFehler('Diese Wellness-Leistung gibt es nicht');
  await protokolliere(db, { actor: wer, action: 'wellness_gespeichert', objectType: 'wellness_leistung', objectId: id });
  return id;
}

export async function wellnessAktiv(db: Db, id: string, aktiv: boolean): Promise<void> {
  await db.query('UPDATE wellness_leistung SET aktiv = $2 WHERE id = $1', [id, aktiv]);
}

export async function rechnungen(db: Db, patientId: string): Promise<RechnungKurz[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT id::text, art::text, steuerklasse::text, datum, faellig_am, nummer, betrag, status::text, gemahnt_am, versand_art, lexware_abweichung, (lexware_pdf IS NOT NULL) AS pdf,
       (SELECT count(*) FROM rechnung_position p WHERE p.rechnung_id = rechnung.id) AS positionen
     FROM rechnung WHERE patient_id = $1 ORDER BY status = 'entwurf' DESC, coalesce(datum, erstellt_am::date) DESC, id DESC LIMIT 50`, [patientId],
  );
  return rows.map((r) => {
    const [statusText, statusFarbe] = RECHNUNG_STATUS_TEXT[r.status as keyof typeof RECHNUNG_STATUS_TEXT] ?? [String(r.status), 'preset12'];
    return {
      id: String(r.id), art: String(r.art), steuerklasse: String(r.steuerklasse), datum: tag(r.datum), faelligAm: tag(r.faellig_am), nummer: text(r.nummer), betrag: zahl(r.betrag), status: String(r.status),
      statusText, statusFarbe, gemahnt: r.gemahnt_am != null, positionen: Number(r.positionen), versandArt: text(r.versand_art), lexwareAbweichung: text(r.lexware_abweichung), pdf: Boolean(r.pdf),
    };
  });
}

// ── Akte (§ 630f) ───────────────────────────────────────────────────────────

/** Die Akte lesen – jedes Öffnen steht im Protokoll (ohne Inhalte) */
export async function akte(db: Db, t: Tresor, patientId: string, wer: string): Promise<Fall[]> {
  const faelle = (await db.query<Record<string, unknown>>(
    `SELECT id::text, nummer, grundlage::text, phase::text, steuerklasse::text, bezeichnung, anlass, diagnose_arzt, begonnen_am, abgeschlossen_am
     FROM behandlungsfall WHERE patient_id = $1 ORDER BY nummer DESC`, [patientId],
  )).rows;
  const ergebnis: Fall[] = [];
  for (const f of faelle) {
    const bs = (await db.query<Record<string, unknown>>(
      `SELECT b.id::text, b.datum, b.dauer_min, b.behandelt_von, b.status::text, b.massnahmen, b.verlauf_wirkung, b.reaktionen, b.uebungen_empfehlungen,
         (SELECT coalesce(json_agg(json_build_object('nummer', bl.nummer, 'bezeichnung', bl.bezeichnung, 'anzahl', bl.anzahl, 'einzelpreis', bl.einzelpreis, 'verordnungId', bl.verordnung_id::text) ORDER BY bl.id), '[]')
            FROM behandlung_leistung bl WHERE bl.behandlung_id = b.id) AS leistungen
       FROM behandlung b WHERE b.fall_id = $1 AND b.ersetzt_am IS NULL ORDER BY b.datum DESC, b.id DESC`, [f.id],
    )).rows;
    ergebnis.push({
      id: String(f.id), nummer: Number(f.nummer), grundlage: String(f.grundlage), phase: String(f.phase), steuerklasse: String(f.steuerklasse),
      bezeichnung: t.entschluesselnText(f.bezeichnung as Uint8Array | null, 'behandlungsfall.bezeichnung'),
      anlass: t.entschluesselnText(f.anlass as Uint8Array | null, 'behandlungsfall.anlass'),
      diagnoseArzt: t.entschluesselnText(f.diagnose_arzt as Uint8Array | null, 'behandlungsfall.diagnose_arzt'),
      begonnenAm: tag(f.begonnen_am), abgeschlossenAm: tag(f.abgeschlossen_am),
      behandlungen: bs.map((b) => ({
        id: String(b.id), datum: tag(b.datum)!, dauerMin: zahl(b.dauer_min), behandeltVon: String(b.behandelt_von), status: String(b.status),
        massnahmen: t.entschluesselnText(b.massnahmen as Uint8Array | null, 'behandlung.massnahmen'),
        verlaufWirkung: t.entschluesselnText(b.verlauf_wirkung as Uint8Array | null, 'behandlung.verlauf_wirkung'),
        reaktionen: t.entschluesselnText(b.reaktionen as Uint8Array | null, 'behandlung.reaktionen'),
        uebungen: t.entschluesselnText(b.uebungen_empfehlungen as Uint8Array | null, 'behandlung.uebungen_empfehlungen'),
        leistungen: (b.leistungen as Behandlung['leistungen']).map((l) => ({ ...l, einzelpreis: Number(l.einzelpreis) })),
      })),
    });
  }
  await protokolliere(db, { actor: wer, action: 'akte_geoeffnet', objectType: 'patient', objectId: patientId, details: { faelle: ergebnis.length } });
  return ergebnis;
}

export async function offeneFaelle(db: Db, t: Tresor, patientId: string): Promise<{ id: string; nummer: number; grundlage: string; bezeichnung: string | null }[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    "SELECT id::text, nummer, grundlage::text, bezeichnung FROM behandlungsfall WHERE patient_id = $1 AND phase NOT IN ('archiviert') AND abgeschlossen_am IS NULL ORDER BY nummer DESC", [patientId],
  );
  return rows.map((r) => ({ id: String(r.id), nummer: Number(r.nummer), grundlage: String(r.grundlage), bezeichnung: t.entschluesselnText(r.bezeichnung as Uint8Array | null, 'behandlungsfall.bezeichnung') }));
}

export async function fallAnlegen(
  db: Db, t: Tresor, patientId: string, d: { grundlage: string; bezeichnung?: string; anlass?: string; diagnoseArzt?: string; begonnenAm?: string; wellnessLeistungId?: string; phase?: Phase }, wer: string,
): Promise<string> {
  const phase: Phase = d.phase ?? 'behandlung';
  if (!['verordnung', 'direktzugang', 'praevention'].includes(d.grundlage)) throw new KarteiFehler('Bitte die Behandlungsgrundlage wählen');
  let wellness: { id: string; bezeichnung: string } | undefined;
  if (d.grundlage === 'praevention') {
    if (!d.wellnessLeistungId) throw new KarteiFehler('Wellness: bitte eine Leistung aus dem Wellness-Katalog wählen');
    wellness = (await db.query<{ id: string; bezeichnung: string }>('SELECT id::text, bezeichnung FROM wellness_leistung WHERE id = $1 AND aktiv', [d.wellnessLeistungId])).rows[0];
    if (!wellness) throw new KarteiFehler('Diese Wellness-Leistung gibt es nicht oder sie ist nicht aktiv');
  }
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO behandlungsfall (patient_id, nummer, grundlage, steuerklasse, phase, bezeichnung, anlass, diagnose_arzt, begonnen_am, wellness_leistung_id, erstellt_von)
     VALUES ($1, (SELECT coalesce(max(nummer), 0) + 1 FROM behandlungsfall WHERE patient_id = $1), $2, $3, $10::fall_phase, $4, $5, $6, COALESCE($7::date, CURRENT_DATE), $8, $9) RETURNING id::text`,
    [patientId, d.grundlage, d.grundlage === 'praevention' ? 'wellness_19' : 'heilbehandlung_steuerfrei', geheim(t, d.bezeichnung || wellness?.bezeichnung, 'behandlungsfall.bezeichnung'),
      geheim(t, d.anlass, 'behandlungsfall.anlass'), geheim(t, d.diagnoseArzt, 'behandlungsfall.diagnose_arzt'), datumPruefen(d.begonnenAm, 'Beginn'), wellness?.id ?? null, wer, phase],
  );
  const id = rows[0]!.id;
  await db.query('INSERT INTO behandlungsfall_phase (fall_id, von, nach, wer, grund) VALUES ($1, NULL, $2::fall_phase, $3, $4)', [id, phase, wer, 'Fall angelegt']);
  await protokolliere(db, { actor: wer, action: 'fall_angelegt', objectType: 'patient', objectId: patientId });
  // Serien ohne Rezept (Direktzugang, Wellness) bekommen ihren Rechnungsentwurf gleich mit (W79)
  if (d.grundlage !== 'verordnung') await rechnungAusSerie(db, patientId, id, wer);
  return id;
}

/** Preis einer Leistung aus der aktiven Preisliste – null, wenn es keine gibt */
async function preisAusAktiverListe(db: Db, nummer: string): Promise<{ preislisteId: string; positionId: string; bezeichnung: string; preis: number } | null> {
  const r = (await db.query<Record<string, unknown>>(
    `SELECT l.id::text AS liste, pp.id::text AS position, pp.bezeichnung, coalesce(pp.eigener_preis, pp.gkv_preis) AS preis
     FROM preisliste_position pp JOIN preisliste l ON l.id = pp.preisliste_id WHERE l.aktiv AND pp.nummer = $1 LIMIT 1`, [nummer],
  )).rows[0];
  return r ? { preislisteId: String(r.liste), positionId: String(r.position), bezeichnung: String(r.bezeichnung), preis: Number(r.preis ?? 0) } : null;
}

export async function behandlungErfassen(
  db: Db, t: Tresor, patientId: string,
  d: {
    fallId?: string; neuerFall?: { grundlage: string; bezeichnung?: string; anlass?: string; diagnoseArzt?: string };
    datum: string; dauerMin?: number; behandeltVon?: string; terminId?: string; verordnungId?: string; leistungNummer?: string;
    massnahmen?: string; verlaufWirkung?: string; reaktionen?: string; uebungen?: string;
  },
  wer: string,
): Promise<{ behandlungId: string; fallId: string }> {
  const datum = datumPruefen(d.datum, 'Datum');
  if (!datum) throw new KarteiFehler('Das Datum der Behandlung fehlt');
  if (!d.massnahmen?.trim()) throw new KarteiFehler('Was wurde gemacht? Die Maßnahmen gehören in die Akte (§ 630f BGB)');
  let fallId = d.fallId;
  if (fallId) {
    const da = (await db.query('SELECT 1 FROM behandlungsfall WHERE id = $1 AND patient_id = $2', [fallId, patientId])).rows.length;
    if (!da) throw new KarteiFehler('Diesen Behandlungsfall gibt es nicht');
  } else {
    if (!d.neuerFall) throw new KarteiFehler('Bitte einen Behandlungsfall wählen oder einen neuen anlegen');
    fallId = await fallAnlegen(db, t, patientId, { ...d.neuerFall, begonnenAm: datum }, wer);
  }
  // Rezept vor dem Eintrag prüfen – ein Eintrag in der Akte lässt sich nicht mehr zurücknehmen
  let nummer = text(d.leistungNummer);
  let bezeichnung: string | null = null;
  if (d.verordnungId) {
    const v = (await db.query<{ massnahme: string; leistung_nummer: string | null; status: string; offen: string }>(
      `SELECT massnahme, leistung_nummer, status::text, (anzahl_verordnet - ${HAKEN_SQL('v')})::text AS offen
       FROM verordnung v WHERE id = $1 AND patient_id = $2`, [d.verordnungId, patientId],
    )).rows[0];
    if (!v) throw new KarteiFehler('Dieses Rezept gibt es nicht');
    if (v.status === 'ersetzt') throw new KarteiFehler('Dieses Rezept wurde korrigiert – bitte die Korrektur wählen');
    if (v.status !== 'aktiv') throw new KarteiFehler('Dieses Rezept ist nicht mehr aktiv');
    if (Number(v.offen) <= 0) throw new KarteiFehler('Auf diesem Rezept sind alle Behandlungen schon abgehakt');
    nummer ??= v.leistung_nummer;
    bezeichnung = v.massnahme;
  }
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO behandlung (fall_id, termin_id, datum, dauer_min, behandelt_von, massnahmen, verlauf_wirkung, reaktionen, uebungen_empfehlungen, erstellt_von)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id::text`,
    [fallId, d.terminId || null, datum, d.dauerMin || null, text(d.behandeltVon) ?? wer, geheim(t, d.massnahmen, 'behandlung.massnahmen'),
      geheim(t, d.verlaufWirkung, 'behandlung.verlauf_wirkung'), geheim(t, d.reaktionen, 'behandlung.reaktionen'), geheim(t, d.uebungen, 'behandlung.uebungen_empfehlungen'), wer],
  );
  const behandlungId = rows[0]!.id;
  // Leistung festhalten: aus dem Rezept oder aus der aktiven Preisliste; mit Rezept ist das der Haken auf der Stempelkarte
  // Wellness-Serie: die Leistung des Falls aus dem Wellness-Katalog
  const fallInfo = (await db.query<{ s: string; w_code: string | null; w_bez: string | null; w_preis: string | null }>(
    'SELECT f.steuerklasse::text AS s, w.code AS w_code, w.bezeichnung AS w_bez, w.preis::text AS w_preis FROM behandlungsfall f LEFT JOIN wellness_leistung w ON w.id = f.wellness_leistung_id WHERE f.id = $1', [fallId],
  )).rows[0]!;
  if (fallInfo.w_code && !nummer && !d.verordnungId) {
    await db.query(
      `INSERT INTO behandlung_leistung (behandlung_id, nummer, bezeichnung, anzahl, einzelpreis, steuerklasse) VALUES ($1, $2, $3, 1, $4, 'wellness_19')`,
      [behandlungId, fallInfo.w_code, fallInfo.w_bez, fallInfo.w_preis],
    );
  }
  if (nummer || d.verordnungId) {
    const preis = nummer ? await preisAusAktiverListe(db, nummer) : null;
    const steuer = fallInfo.s;
    await db.query(
      `INSERT INTO behandlung_leistung (behandlung_id, verordnung_id, preisliste_id, preisliste_position_id, nummer, bezeichnung, anzahl, einzelpreis, steuerklasse)
       VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8)`,
      [behandlungId, d.verordnungId || null, preis?.preislisteId ?? null, preis?.positionId ?? null, nummer ?? '–', preis?.bezeichnung ?? bezeichnung ?? nummer ?? 'Behandlung', preis?.preis ?? 0, steuer],
    );
    if (d.verordnungId) {
      const bl = (await db.query<{ id: string }>('SELECT id::text FROM behandlung_leistung WHERE behandlung_id = $1 AND verordnung_id = $2', [behandlungId, d.verordnungId])).rows[0];
      if (bl) await behandlungZuordnen(db, d.verordnungId, bl.id, datum);
      // Ein Rezept ohne Fall gehört ab jetzt zu diesem Fall
      await db.query('UPDATE verordnung SET fall_id = $3 WHERE id = $1 AND patient_id = $2 AND fall_id IS NULL', [d.verordnungId, patientId, fallId]);
      await db.query(
        `UPDATE verordnung v SET status = 'abgeschlossen', abgeschlossen_am = $3 WHERE v.id = $1 AND v.patient_id = $2 AND v.status = 'aktiv'
           AND v.anzahl_verordnet <= ${HAKEN_SQL('v')}`,
        [d.verordnungId, patientId, datum],
      );
    }
  }
  if (d.terminId) await db.query("UPDATE termin SET status = 'erledigt', geaendert_am = now() WHERE id = $1 AND patient_id = $2", [d.terminId, patientId]);
  await db.query('UPDATE behandlungsfall SET geaendert_am = now() WHERE id = $1', [fallId]);
  await protokolliere(db, { actor: wer, action: 'behandlung_erfasst', objectType: 'patient', objectId: patientId, details: { rezept: !!d.verordnungId } });
  await phaseVorruecken(db, patientId, fallId, 'behandlung', wer, 'Behandlung erfasst');
  return { behandlungId, fallId };
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
}

/** Kurzbezeichnung der Behandlung je Termin – die Alias t (Termin), v (Rezept), f (Fall), w (Wellness-Leistung) liefert TERMIN_VERKNUEPFUNG_SQL */
export const LEISTUNG_SQL = `coalesce(
  (SELECT pp.kuerzel FROM preisliste_position pp JOIN preisliste l ON l.id = pp.preisliste_id WHERE l.aktiv AND pp.nummer = coalesce(t.leistung_nummer, v.leistung_nummer) LIMIT 1),
  v.massnahme, w.code, CASE f.grundlage WHEN 'direktzugang' THEN 'Direktzugang' WHEN 'praevention' THEN 'Wellness' END)`;
const TERMIN_VERKNUEPFUNG_SQL = 'FROM termin t JOIN patient p ON p.id = t.patient_id LEFT JOIN verordnung v ON v.id = t.verordnung_id LEFT JOIN behandlungsfall f ON f.id = t.fall_id LEFT JOIN wellness_leistung w ON w.id = f.wellness_leistung_id';

export async function termineZeitraum(db: Db, vonIso: string, bisIso: string): Promise<TerminKalender[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT t.id::text, t.patient_id::text, p.vorname, p.nachname, p.patientennummer, t.beginn, t.ende, t.art::text, t.status::text, (t.verordnung_id IS NOT NULL) AS rezept, t.exchange_event_id,
       ${LEISTUNG_SQL} AS leistung
     ${TERMIN_VERKNUEPFUNG_SQL}
     WHERE t.beginn < $2 AND t.ende > $1 AND t.status NOT IN ('abgesagt_patient', 'abgesagt_praxis', 'verschoben') ORDER BY t.beginn`, [vonIso, bisIso],
  );
  return rows.map((r) => ({
    id: String(r.id), patientId: String(r.patient_id), vorname: String(r.vorname), nachname: String(r.nachname), patientennummer: String(r.patientennummer),
    beginn: iso(r.beginn)!, ende: iso(r.ende)!, art: String(r.art), status: String(r.status), rezept: Boolean(r.rezept), imKalender: r.exchange_event_id !== null, exchangeEventId: text(r.exchange_event_id), leistung: text(r.leistung),
  }));
}
