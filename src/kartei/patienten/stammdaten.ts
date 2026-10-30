/** Patienten lesen und anlegen, Stammdaten, Kontaktwege und Adressen (W63–W66, W97, W113) */
import { protokolliere, type Db } from '../../db/index.ts';
import { iso, istId, tag, text, zahl } from '../../db/werte.ts';
import type { Tresor } from '../../tresor.ts';
import { ADRESSE_TYPEN, type AdresseTyp } from '../hausbesuche.ts';
import { KarteiFehler, datumPruefen, geheim, VERZUG_ROT_TAGE, kontaktNormieren, kontaktPruefen, type Kontaktart, type Rechnungsstand, type Kontakt, type Adresse, type Bezugsperson, type PatientKurz, type Patient } from './basis.ts';

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
       (SELECT name FROM preisliste l WHERE l.id = p.preisliste_id) AS preisliste_name,
       (SELECT json_build_object('id', g.id::text, 'name', g.name, 'standard', g.standard) FROM preisliste g WHERE g.id = coalesce((SELECT l.id FROM preisliste l WHERE l.id = p.preisliste_id AND l.status = 'freigegeben' AND l.aktiv), (SELECT id FROM preisliste WHERE standard LIMIT 1))) AS preisliste_gilt
     FROM patient p WHERE p.id = $1`, [id],
  )).rows[0];
  if (!r) return undefined;
  const kontakte = (await db.query<Kontakt>('SELECT id::text, art::text, wert, normiert, bezeichnung, primaer FROM patient_kontakt WHERE patient_id = $1 ORDER BY art, primaer DESC, reihenfolge, id', [id])).rows;
  const adressen = (await db.query<Adresse>('SELECT id::text, bezeichnung, zusatz, strasse, hausnummer, plz, ort, land, rechnungsadresse, typ FROM patient_adresse WHERE patient_id = $1 ORDER BY rechnungsadresse DESC, reihenfolge, id', [id])).rows;
  const bezugspersonen = (await db.query<Bezugsperson>('SELECT id::text, rolle::text, name, beziehung, berechtigungsgrund, telefon, email FROM patient_bezugsperson WHERE patient_id = $1 ORDER BY rolle, id', [id])).rows;
  const versicherungen = (await db.query<Record<string, unknown>>('SELECT id::text, art::text, versicherer, tarif, erstattungssatz FROM patient_versicherung WHERE patient_id = $1 ORDER BY id', [id])).rows
    .map((v) => ({ id: String(v.id), art: String(v.art), versicherer: text(v.versicherer), tarif: text(v.tarif), erstattungssatz: zahl(v.erstattungssatz) }));
  return {
    ...zuKurz(t, r), geburtsdatum: tag(r.geburtsdatum), geburtsname: text(r.geburtsname), sprache: text(r.sprache), kommunikationshilfe: text(r.kommunikationshilfe),
    berufBelastung: t.entschluesselnText(r.beruf_belastung as Uint8Array | null, 'patient.beruf_belastung'),
    notiz: t.entschluesselnText(r.notiz as Uint8Array | null, 'patient.notiz'),
    abrechnungsmodus: String(r.abrechnungsmodus), zwischenrechnungQuartale: zahl(r.zwischenrechnung_quartale),
    exchangeKontaktId: text(r.exchange_kontakt_id), lexwareKundennummer: text(r.lexware_kundennummer),
    preisliste: r.preisliste_id ? { id: String(r.preisliste_id), name: String(r.preisliste_name) } : null,
    preislisteGilt: r.preisliste_gilt ? ((typeof r.preisliste_gilt === 'string' ? JSON.parse(r.preisliste_gilt) : r.preisliste_gilt) as Patient['preislisteGilt']) : null, rechnungsversand: (r.rechnungsversand as Patient['rechnungsversand']) ?? 'email',
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

function stammdatenPruefen(d: Stammdaten): void {
  if (!d.vorname?.trim() || !d.nachname?.trim()) throw new KarteiFehler('Vorname und Nachname sind nötig');
  datumPruefen(d.geburtsdatum, 'Geburtsdatum');
  datumPruefen(d.patientSeit, 'Patient seit');
}

export async function patientAnlegen(
  db: Db, t: Tresor,
  d: Stammdaten & {
    kontakte?: { art: Kontaktart; wert: string; bezeichnung?: string }[];
    adresse?: Omit<Adresse, 'id' | 'rechnungsadresse' | 'land' | 'typ'> & { land?: string; typ?: AdresseTyp };
    /** Hausbesuchadresse gleich beim Anlegen (W115b) – wird Behandlungsort für Hausbesuche (W113) */
    hausbesuchAdresse?: Omit<Adresse, 'id' | 'rechnungsadresse' | 'land' | 'typ'> & { land?: string };
  },
  wer: string,
): Promise<string> {
  stammdatenPruefen(d);
  for (const k of d.kontakte ?? []) kontaktPruefen(k.art, k.wert);
  const nummer = text(d.patientennummer);
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO patient (${nummer ? 'patientennummer, ' : ''}anrede, titel, vorname, nachname, geburtsname, geburtsdatum, patient_seit, ansprache_hinweis, besonderheiten, sprache, kommunikationshilfe, beruf_belastung, notiz, erstellt_von, preisliste_id)
     VALUES (${nummer ? '$15, ' : ''}$1, $2, $3, $4, $5, $6, COALESCE($7::date, CURRENT_DATE), $8, $9, $10, $11, $12, $13, $14, $${nummer ? 16 : 15}) RETURNING id::text`,
    [text(d.anrede), text(d.titel), d.vorname.trim(), d.nachname.trim(), text(d.geburtsname), datumPruefen(d.geburtsdatum, 'Geburtsdatum'), datumPruefen(d.patientSeit, 'Patient seit'),
      geheim(t, d.ansprache, 'patient.ansprache_hinweis'), geheim(t, d.besonderheiten, 'patient.besonderheiten'), text(d.sprache), text(d.kommunikationshilfe),
      geheim(t, d.berufBelastung, 'patient.beruf_belastung'), geheim(t, d.notiz, 'patient.notiz'), wer, ...(nummer ? [nummer] : []),
      // Ohne ausdrückliche Wahl keine feste Zuordnung – es gilt der Standard (W97)
      d.preislisteId && istId(d.preislisteId) ? d.preislisteId : null],
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
  if (d.hausbesuchAdresse && (d.hausbesuchAdresse.strasse || d.hausbesuchAdresse.ort || d.hausbesuchAdresse.plz)) {
    await adresseSpeichern(db, id, { ...d.hausbesuchAdresse, rechnungsadresse: false, typ: 'hausbesuch' }, wer, { ohneProtokoll: true });
  }
  // Rechnungsversand gleich beim Anlegen (W115b); ohne Angabe gilt „per Mail“ (Standard der Tabelle)
  if (['email', 'post', 'beides'].includes(d.rechnungsversand ?? '')) await db.query('UPDATE patient SET rechnungsversand = $2 WHERE id = $1', [id, d.rechnungsversand]);
  await protokolliere(db, { actor: wer, action: 'patient_angelegt', objectType: 'patient', objectId: id });
  return id;
}

export async function stammdatenSpeichern(db: Db, t: Tresor, id: string, d: Stammdaten, wer: string): Promise<void> {
  stammdatenPruefen(d);
  const r = await db.query(
    `UPDATE patient SET anrede = $2, titel = $3, vorname = $4, nachname = $5, geburtsname = $6, geburtsdatum = $7, patient_seit = COALESCE($8::date, patient_seit),
       ansprache_hinweis = $9, besonderheiten = $10, sprache = $11, kommunikationshilfe = $12, beruf_belastung = $13, notiz = $14,
       preisliste_id = CASE WHEN $15::text = 'standard' THEN NULL WHEN $15::text ~ '^[0-9]+$' THEN $15::bigint ELSE preisliste_id END, rechnungsversand = COALESCE($16, rechnungsversand), geaendert_am = now()
     WHERE id = $1 RETURNING id`,
    [id, text(d.anrede), text(d.titel), d.vorname.trim(), d.nachname.trim(), text(d.geburtsname), datumPruefen(d.geburtsdatum, 'Geburtsdatum'), datumPruefen(d.patientSeit, 'Patient seit'),
      geheim(t, d.ansprache, 'patient.ansprache_hinweis'), geheim(t, d.besonderheiten, 'patient.besonderheiten'), text(d.sprache), text(d.kommunikationshilfe),
      geheim(t, d.berufBelastung, 'patient.beruf_belastung'), geheim(t, d.notiz, 'patient.notiz'),
      d.preislisteId === 'standard' ? 'standard' : d.preislisteId && istId(d.preislisteId) ? d.preislisteId : null, ['email', 'post', 'beides'].includes(d.rechnungsversand ?? '') ? d.rechnungsversand : null],
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
  const typ: AdresseTyp = a.typ && ADRESSE_TYPEN.includes(a.typ) ? a.typ : 'rechnung';
  const werte = [patientId, text(a.bezeichnung), text(a.zusatz), text(a.strasse), text(a.hausnummer), text(a.plz), text(a.ort), text(a.land)?.toUpperCase() ?? 'DE', rechnungsadresse, typ];
  let id = a.adresseId;
  if (id) {
    await db.query('UPDATE patient_adresse SET bezeichnung = $3, zusatz = $4, strasse = $5, hausnummer = $6, plz = $7, ort = $8, land = $9, rechnungsadresse = $10, typ = $11 WHERE id = $2 AND patient_id = $1', [patientId, id, ...werte.slice(1)]);
  } else {
    id = (await db.query<{ id: string }>(
      'INSERT INTO patient_adresse (patient_id, bezeichnung, zusatz, strasse, hausnummer, plz, ort, land, rechnungsadresse, typ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id::text', werte,
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
