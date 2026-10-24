/**
 * Patientenkartei (W63–W68, requirements §4b): Stammdaten, Kontaktwege, Adressen, Kontaktverlauf
 * (Anrufe mit Gesprächsgrund), Akte (Behandlungsfälle, Behandlungen, Rezepte), Termine.
 *
 * Alles mit Gesundheitsbezug geht durch den Tresor (verschlüsselt in der Datenbank); der Spaltenname
 * ist der Kontext. Dokumentation wird nie geändert – nur ergänzt (Trigger in Migration 007).
 * Jedes Öffnen einer Akte landet im Protokoll (audit_event), ohne Inhalte.
 */
import { protokolliere, type Db } from '../db/index.ts';
import type { Tresor } from '../tresor.ts';
import { berlinMitternachtUtc } from '../zeit.ts';

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
}

export interface VerordnungKurz {
  id: string;
  ausgestelltAm: string;
  massnahme: string;
  leistungNummer: string | null;
  anzahlVerordnet: number;
  abgehakt: number;
  status: string;
  arzt: string | null;
  fallId: string | null;
}

export interface RechnungKurz {
  id: string;
  art: string;
  datum: string | null;
  faelligAm: string | null;
  nummer: string | null;
  betrag: number | null;
  status: string;
  gemahnt: boolean;
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

const tag = (v: unknown) => (v === null || v === undefined ? null : typeof v === 'string' ? v.slice(0, 10) : new Date(v as Date).toISOString().slice(0, 10));
const iso = (v: unknown) => (v === null || v === undefined ? null : new Date(v as string).toISOString());
const zahl = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const text = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v).trim() || null);
const istId = (s: string) => /^\d+$/.test(s);

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
       p.zwischenrechnung_quartale, p.exchange_kontakt_id, p.lexware_kundennummer FROM patient p WHERE p.id = $1`, [id],
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
    `INSERT INTO patient (${nummer ? 'patientennummer, ' : ''}anrede, titel, vorname, nachname, geburtsname, geburtsdatum, patient_seit, ansprache_hinweis, besonderheiten, sprache, kommunikationshilfe, beruf_belastung, notiz, erstellt_von)
     VALUES (${nummer ? '$15, ' : ''}$1, $2, $3, $4, $5, $6, COALESCE($7::date, CURRENT_DATE), $8, $9, $10, $11, $12, $13, $14) RETURNING id::text`,
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
       ansprache_hinweis = $9, besonderheiten = $10, sprache = $11, kommunikationshilfe = $12, beruf_belastung = $13, notiz = $14, geaendert_am = now()
     WHERE id = $1 RETURNING id`,
    [id, text(d.anrede), text(d.titel), d.vorname.trim(), d.nachname.trim(), text(d.geburtsname), datumPruefen(d.geburtsdatum, 'Geburtsdatum'), datumPruefen(d.patientSeit, 'Patient seit'),
      geheim(t, d.ansprache, 'patient.ansprache_hinweis'), geheim(t, d.besonderheiten, 'patient.besonderheiten'), text(d.sprache), text(d.kommunikationshilfe),
      geheim(t, d.berufBelastung, 'patient.beruf_belastung'), geheim(t, d.notiz, 'patient.notiz')],
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
    `SELECT id::text, beginn, ende, art::text, status::text, verordnung_id::text FROM termin WHERE patient_id = $1 ${o.kommend ? 'AND ende >= now()' : ''} ORDER BY beginn ${o.kommend ? '' : 'DESC'} LIMIT 50`, [patientId],
  );
  return rows.map((r) => ({ id: String(r.id), beginn: iso(r.beginn)!, ende: iso(r.ende)!, art: String(r.art), status: String(r.status), verordnungId: text(r.verordnung_id) }));
}

export async function terminAnlegen(
  db: Db, patientId: string, d: { datum: string; zeit: string; dauerMin: number; art?: string; verordnungId?: string; fallId?: string }, wer: string,
): Promise<string> {
  const tagText = datumPruefen(d.datum, 'Datum');
  if (!tagText || !/^\d{2}:\d{2}$/.test(d.zeit)) throw new KarteiFehler('Datum und Uhrzeit sind nötig');
  if (!(d.dauerMin > 0)) throw new KarteiFehler('Die Dauer muss größer 0 sein');
  const beginn = new Date(berlinMitternachtUtc(tagText)).getTime() + (Number(d.zeit.slice(0, 2)) * 60 + Number(d.zeit.slice(3))) * 60_000;
  const ende = beginn + d.dauerMin * 60_000;
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO termin (patient_id, fall_id, verordnung_id, art, beginn, ende, erstellt_von) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id::text`,
    [patientId, d.fallId || null, d.verordnungId || null, d.art ?? 'behandlung', new Date(beginn).toISOString(), new Date(ende).toISOString(), wer],
  );
  await protokolliere(db, { actor: wer, action: 'termin_angelegt', objectType: 'patient', objectId: patientId, details: { rezept: !!d.verordnungId } });
  return rows[0]!.id;
}

export async function terminStatus(db: Db, patientId: string, terminId: string, status: string, wer: string): Promise<void> {
  const erlaubt = ['bestaetigt', 'abgesagt_patient', 'abgesagt_praxis', 'nicht_erschienen'];
  if (!erlaubt.includes(status)) throw new KarteiFehler('Unbekannter Terminstatus');
  const r = await db.query('UPDATE termin SET status = $3, geaendert_am = now() WHERE id = $1 AND patient_id = $2 RETURNING id', [terminId, patientId, status]);
  if (!r.rows.length) throw new KarteiFehler('Diesen Termin gibt es nicht');
  await protokolliere(db, { actor: wer, action: `termin_${status}`, objectType: 'patient', objectId: patientId });
}

export async function verordnungen(db: Db, patientId: string): Promise<VerordnungKurz[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT v.id::text, v.ausgestellt_am, v.massnahme, v.leistung_nummer, v.anzahl_verordnet, v.status::text, v.fall_id::text, a.name AS arzt,
       (SELECT coalesce(sum(bl.anzahl), 0) FROM behandlung_leistung bl JOIN behandlung b ON b.id = bl.behandlung_id WHERE bl.verordnung_id = v.id AND b.ersetzt_am IS NULL) AS abgehakt
     FROM verordnung v LEFT JOIN arzt a ON a.id = v.arzt_id WHERE v.patient_id = $1 ORDER BY v.status = 'aktiv' DESC, v.ausgestellt_am DESC`, [patientId],
  );
  return rows.map((r) => ({
    id: String(r.id), ausgestelltAm: tag(r.ausgestellt_am)!, massnahme: String(r.massnahme), leistungNummer: text(r.leistung_nummer), anzahlVerordnet: Number(r.anzahl_verordnet),
    abgehakt: Number(r.abgehakt), status: String(r.status), arzt: text(r.arzt), fallId: text(r.fall_id),
  }));
}

export async function verordnungAnlegen(
  db: Db, t: Tresor, patientId: string,
  d: { ausgestelltAm: string; arzt?: string; massnahme: string; leistungNummer?: string; anzahl: number; frequenz?: string; diagnose?: string; gueltigBis?: string; fallId?: string },
  wer: string,
): Promise<string> {
  const am = datumPruefen(d.ausgestelltAm, 'Ausstellungsdatum');
  if (!am) throw new KarteiFehler('Ausstellungsdatum fehlt');
  if (!d.massnahme?.trim()) throw new KarteiFehler('Die verordnete Maßnahme fehlt (z. B. Manuelle Therapie)');
  if (!(Number.isInteger(d.anzahl) && d.anzahl > 0)) throw new KarteiFehler('Die Anzahl der Behandlungen muss eine ganze Zahl größer 0 sein');
  let arztId: string | null = null;
  if (text(d.arzt)) {
    const name = d.arzt!.trim();
    arztId = (await db.query<{ id: string }>('SELECT id::text FROM arzt WHERE lower(name) = lower($1) LIMIT 1', [name])).rows[0]?.id
      ?? (await db.query<{ id: string }>('INSERT INTO arzt (name) VALUES ($1) RETURNING id::text', [name])).rows[0]!.id;
  }
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO verordnung (patient_id, fall_id, arzt_id, ausgestellt_am, massnahme, leistung_nummer, anzahl_verordnet, frequenz, gueltig_bis, diagnose, erstellt_von)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id::text`,
    [patientId, d.fallId || null, arztId, am, d.massnahme.trim(), text(d.leistungNummer), d.anzahl, text(d.frequenz), datumPruefen(d.gueltigBis, 'Gültig bis'),
      geheim(t, d.diagnose, 'verordnung.diagnose'), wer],
  );
  await protokolliere(db, { actor: wer, action: 'verordnung_angelegt', objectType: 'patient', objectId: patientId, details: { anzahl: d.anzahl } });
  return rows[0]!.id;
}

export async function rechnungen(db: Db, patientId: string): Promise<RechnungKurz[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    'SELECT id::text, art::text, datum, faellig_am, nummer, betrag, status::text, gemahnt_am FROM rechnung WHERE patient_id = $1 ORDER BY coalesce(datum, erstellt_am::date) DESC, id DESC LIMIT 50', [patientId],
  );
  return rows.map((r) => ({ id: String(r.id), art: String(r.art), datum: tag(r.datum), faelligAm: tag(r.faellig_am), nummer: text(r.nummer), betrag: zahl(r.betrag), status: String(r.status), gemahnt: r.gemahnt_am != null }));
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
  db: Db, t: Tresor, patientId: string, d: { grundlage: string; bezeichnung?: string; anlass?: string; diagnoseArzt?: string; begonnenAm?: string }, wer: string,
): Promise<string> {
  if (!['verordnung', 'direktzugang', 'praevention'].includes(d.grundlage)) throw new KarteiFehler('Bitte die Behandlungsgrundlage wählen');
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO behandlungsfall (patient_id, nummer, grundlage, steuerklasse, phase, bezeichnung, anlass, diagnose_arzt, begonnen_am, erstellt_von)
     VALUES ($1, (SELECT coalesce(max(nummer), 0) + 1 FROM behandlungsfall WHERE patient_id = $1), $2, $3, 'behandlung', $4, $5, $6, COALESCE($7::date, CURRENT_DATE), $8) RETURNING id::text`,
    [patientId, d.grundlage, d.grundlage === 'praevention' ? 'wellness_19' : 'heilbehandlung_steuerfrei', geheim(t, d.bezeichnung, 'behandlungsfall.bezeichnung'),
      geheim(t, d.anlass, 'behandlungsfall.anlass'), geheim(t, d.diagnoseArzt, 'behandlungsfall.diagnose_arzt'), datumPruefen(d.begonnenAm, 'Beginn'), wer],
  );
  const id = rows[0]!.id;
  await db.query("INSERT INTO behandlungsfall_phase (fall_id, von, nach, wer, grund) VALUES ($1, NULL, 'behandlung', $2, 'Fall angelegt')", [id, wer]);
  await protokolliere(db, { actor: wer, action: 'fall_angelegt', objectType: 'patient', objectId: patientId });
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
      `SELECT massnahme, leistung_nummer, status::text, (anzahl_verordnet - (SELECT coalesce(sum(bl.anzahl), 0) FROM behandlung_leistung bl JOIN behandlung b ON b.id = bl.behandlung_id WHERE bl.verordnung_id = v.id AND b.ersetzt_am IS NULL))::text AS offen
       FROM verordnung v WHERE id = $1 AND patient_id = $2`, [d.verordnungId, patientId],
    )).rows[0];
    if (!v) throw new KarteiFehler('Dieses Rezept gibt es nicht');
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
  if (nummer || d.verordnungId) {
    const preis = nummer ? await preisAusAktiverListe(db, nummer) : null;
    const steuer = (await db.query<{ s: string }>('SELECT steuerklasse::text AS s FROM behandlungsfall WHERE id = $1', [fallId])).rows[0]!.s;
    await db.query(
      `INSERT INTO behandlung_leistung (behandlung_id, verordnung_id, preisliste_id, preisliste_position_id, nummer, bezeichnung, anzahl, einzelpreis, steuerklasse)
       VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8)`,
      [behandlungId, d.verordnungId || null, preis?.preislisteId ?? null, preis?.positionId ?? null, nummer ?? '–', preis?.bezeichnung ?? bezeichnung ?? nummer ?? 'Behandlung', preis?.preis ?? 0, steuer],
    );
    if (d.verordnungId) {
      await db.query(
        `UPDATE verordnung SET status = 'abgeschlossen', abgeschlossen_am = $3 WHERE id = $1 AND patient_id = $2 AND status = 'aktiv'
           AND anzahl_verordnet <= (SELECT coalesce(sum(bl.anzahl), 0) FROM behandlung_leistung bl JOIN behandlung b ON b.id = bl.behandlung_id WHERE bl.verordnung_id = verordnung.id AND b.ersetzt_am IS NULL)`,
        [d.verordnungId, patientId, datum],
      );
    }
  }
  if (d.terminId) await db.query("UPDATE termin SET status = 'erledigt', geaendert_am = now() WHERE id = $1 AND patient_id = $2", [d.terminId, patientId]);
  await db.query('UPDATE behandlungsfall SET geaendert_am = now() WHERE id = $1', [fallId]);
  await protokolliere(db, { actor: wer, action: 'behandlung_erfasst', objectType: 'patient', objectId: patientId, details: { rezept: !!d.verordnungId } });
  return { behandlungId, fallId };
}
