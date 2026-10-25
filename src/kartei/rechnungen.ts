/**
 * Ausgangsrechnungen (W79, W81): Ein Rezept oder eine Serie legt sofort einen **Entwurf** an, mit den
 * Leistungen als Positionen (Preise aus der Preisliste des Patienten) und den automatischen
 * Textbausteinen. Lilli ergänzt, gibt frei („Fertig“), Lexware vergibt Nummer und PDF, dann Versand.
 *
 * Eine Rechnung enthält nur eine Leistungsgruppe: Heilbehandlung (steuerfrei § 4 Nr. 14 UStG) oder
 * Wellness (19 % – oder 0 % mit Kleinunternehmerregelung § 19 UStG). Nie gemischt.
 *
 * Status: entwurf → freigegeben („Fertig – wartet auf Lexware“) → in_lexware (Nummer + PDF) → gesendet → bezahlt;
 * storniert jederzeit mit Grund. Was Lexware meldet (storniert, anderer Betrag), steht als Abweichung an der Rechnung.
 */
import { protokolliere, type Db } from '../db/index.ts';
import type { Tresor } from '../tresor.ts';
import { kleinunternehmer, textbausteine, type Textbaustein } from './konfiguration.ts';
import { KarteiFehler } from './patienten.ts';

export type RechnungStatus = 'entwurf' | 'freigegeben' | 'in_lexware' | 'gesendet' | 'bezahlt' | 'storniert';
export const STATUS_TEXT: Record<RechnungStatus, [string, string]> = {
  entwurf: ['Entwurf', 'preset10'], freigegeben: ['Fertig – wartet auf Lexware', 'preset3'], in_lexware: ['In Lexware', 'preset7'],
  gesendet: ['Versendet', 'preset4'], bezahlt: ['Bezahlt', 'preset19'], storniert: ['Storniert', 'preset12'],
};
export const ART_TEXT: Record<string, string> = { einzel: 'Rechnung', zwischenrechnung: 'Zwischenrechnung', abschlussrechnung: 'Abschlussrechnung', monat: 'Monatsrechnung', ausfall: 'Ausfallgebühr' };

export interface Position {
  id: string;
  reihenfolge: number;
  datum: string | null;
  nummer: string | null;
  bezeichnung: string;
  anzahl: number;
  einzelpreis: number;
  betrag: number;
  verordnungId: string | null;
  terminId: string | null;
  behandlungLeistungId: string | null;
}

export interface Baustein {
  id: string;
  code: string | null;
  kurzname: string;
  text: string;
  wirkung: string;
}

export interface Rechnung {
  id: string;
  patientId: string;
  fallId: string | null;
  verordnungId: string | null;
  art: string;
  steuerklasse: 'heilbehandlung_steuerfrei' | 'wellness_19';
  status: RechnungStatus;
  empfaenger: { name: string; strasse?: string; plz?: string; ort?: string; land?: string; zusatz?: string };
  preisliste: { id: string; name: string } | null;
  zeitraumVon: string | null;
  zeitraumBis: string | null;
  datum: string | null;
  faelligAm: string | null;
  nummer: string | null;
  netto: number;
  ust: number;
  ustSatz: number;
  betrag: number;
  kleinunternehmer: boolean;
  versandArt: string | null;
  versendetAm: string | null;
  bezahltAm: string | null;
  storniertAm: string | null;
  stornoGrund: string | null;
  lexware: { invoiceId: string | null; status: string | null; betrag: number | null; geprueftAm: string | null; abweichung: string | null; pdfAm: string | null };
  notiz: string | null;
  erstelltAm: string;
  positionen: Position[];
  bausteine: Baustein[];
}

const tag = (v: unknown) => (v === null || v === undefined ? null : typeof v === 'string' ? v.slice(0, 10) : new Date(v as Date).toISOString().slice(0, 10));
const zahl = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const rund = (n: number) => Math.round(n * 100) / 100;

// ── Lesen ───────────────────────────────────────────────────────────────────

export async function rechnungLesen(db: Db, patientId: string, id: string): Promise<Rechnung | undefined> {
  if (!/^\d+$/.test(id)) return undefined;
  const r = (await db.query<Record<string, unknown>>(
    `SELECT r.*, r.id::text AS id_text, r.patient_id::text AS pid, r.fall_id::text AS fid, r.verordnung_id::text AS vid, r.preisliste_id::text AS plid, l.name AS preisliste_name
     FROM rechnung r LEFT JOIN preisliste l ON l.id = r.preisliste_id WHERE r.id = $1 AND r.patient_id = $2`, [id, patientId],
  )).rows[0];
  if (!r) return undefined;
  const positionen = (await db.query<Record<string, unknown>>(
    'SELECT id::text, reihenfolge, datum, nummer, bezeichnung, anzahl, einzelpreis, betrag, verordnung_id::text AS vid, termin_id::text AS tid, behandlung_leistung_id::text AS blid FROM rechnung_position WHERE rechnung_id = $1 ORDER BY reihenfolge, id', [id],
  )).rows.map((p) => ({
    id: String(p.id), reihenfolge: Number(p.reihenfolge), datum: tag(p.datum), nummer: (p.nummer as string | null) ?? null, bezeichnung: String(p.bezeichnung), anzahl: Number(p.anzahl),
    einzelpreis: zahl(p.einzelpreis), betrag: zahl(p.betrag), verordnungId: (p.vid as string | null) ?? null, terminId: (p.tid as string | null) ?? null, behandlungLeistungId: (p.blid as string | null) ?? null,
  }));
  const bausteine = (await db.query<Record<string, unknown>>('SELECT id::text, code, kurzname, text, wirkung FROM rechnung_textbaustein WHERE rechnung_id = $1 ORDER BY reihenfolge, id', [id])).rows
    .map((b) => ({ id: String(b.id), code: (b.code as string | null) ?? null, kurzname: String(b.kurzname), text: String(b.text), wirkung: String(b.wirkung) }));
  return {
    id: String(r.id_text), patientId: String(r.pid), fallId: (r.fid as string | null) ?? null, verordnungId: (r.vid as string | null) ?? null, art: String(r.art),
    steuerklasse: r.steuerklasse as Rechnung['steuerklasse'], status: r.status as RechnungStatus, empfaenger: (r.empfaenger as Rechnung['empfaenger']) ?? { name: '' },
    preisliste: r.plid ? { id: String(r.plid), name: String(r.preisliste_name) } : null, zeitraumVon: tag(r.zeitraum_von), zeitraumBis: tag(r.zeitraum_bis), datum: tag(r.datum), faelligAm: tag(r.faellig_am),
    nummer: (r.nummer as string | null) ?? null, netto: zahl(r.netto), ust: zahl(r.ust), ustSatz: zahl(r.ust_satz), betrag: zahl(r.betrag), kleinunternehmer: Boolean(r.kleinunternehmer),
    versandArt: (r.versand_art as string | null) ?? null, versendetAm: tag(r.versendet_am), bezahltAm: tag(r.bezahlt_am), storniertAm: tag(r.storniert_am), stornoGrund: (r.storno_grund as string | null) ?? null,
    lexware: { invoiceId: (r.lexware_invoice_id as string | null) ?? null, status: (r.lexware_status as string | null) ?? null, betrag: r.lexware_betrag == null ? null : Number(r.lexware_betrag), geprueftAm: r.lexware_geprueft_am ? new Date(r.lexware_geprueft_am as string).toISOString() : null, abweichung: (r.lexware_abweichung as string | null) ?? null, pdfAm: r.lexware_pdf_am ? new Date(r.lexware_pdf_am as string).toISOString() : null },
    notiz: (r.notiz as string | null) ?? null, erstelltAm: new Date(r.erstellt_am as string).toISOString(), positionen, bausteine,
  };
}

// ── Anlegen ─────────────────────────────────────────────────────────────────

/** Empfänger zum Zeitpunkt der Rechnung festhalten: Rechnungsempfänger (Bezugsperson) vor Patient + Rechnungsadresse */
async function empfaengerErmitteln(db: Db, patientId: string): Promise<Rechnung['empfaenger']> {
  const b = (await db.query<Record<string, string | null>>("SELECT name, strasse, plz, ort, land FROM patient_bezugsperson WHERE patient_id = $1 AND rolle = 'rechnungsempfaenger'", [patientId])).rows[0];
  if (b) return { name: b.name!, strasse: b.strasse ?? undefined, plz: b.plz ?? undefined, ort: b.ort ?? undefined, land: b.land ?? undefined };
  const p = (await db.query<Record<string, string | null>>(
    `SELECT p.anrede, p.titel, p.vorname, p.nachname, a.zusatz, a.strasse, a.hausnummer, a.plz, a.ort, a.land FROM patient p
     LEFT JOIN patient_adresse a ON a.patient_id = p.id AND a.rechnungsadresse WHERE p.id = $1`, [patientId],
  )).rows[0];
  if (!p) throw new KarteiFehler('Diesen Patienten gibt es nicht');
  return { name: [p.anrede, p.titel, p.vorname, p.nachname].filter(Boolean).join(' '), zusatz: p.zusatz ?? undefined, strasse: [p.strasse, p.hausnummer].filter(Boolean).join(' ') || undefined, plz: p.plz ?? undefined, ort: p.ort ?? undefined, land: p.land ?? undefined };
}

async function preislisteFuer(db: Db, patientId: string): Promise<string | null> {
  const r = (await db.query<{ id: string | null }>('SELECT coalesce(p.preisliste_id, (SELECT id FROM preisliste WHERE aktiv LIMIT 1))::text AS id FROM patient p WHERE p.id = $1', [patientId])).rows[0];
  return r?.id ?? null;
}

/** Preis und Bezeichnung einer Leistungsnummer aus einer Preisliste */
async function preisAus(db: Db, preislisteId: string | null, nummer: string): Promise<{ positionId: string; bezeichnung: string; preis: number } | null> {
  if (!preislisteId) return null;
  const r = (await db.query<{ id: string; bezeichnung: string; preis: string | null }>(
    'SELECT id::text, bezeichnung, coalesce(eigener_preis, gkv_preis)::text AS preis FROM preisliste_position WHERE preisliste_id = $1 AND nummer = $2', [preislisteId, nummer],
  )).rows[0];
  return r ? { positionId: r.id, bezeichnung: r.bezeichnung, preis: Number(r.preis ?? 0) } : null;
}

export async function summenBerechnen(db: Db, rechnungId: string): Promise<void> {
  const r = (await db.query<{ steuerklasse: string; kleinunternehmer: boolean; summe: string; mit_ku: boolean }>(
    `SELECT r.steuerklasse::text, r.kleinunternehmer, coalesce((SELECT sum(betrag) FROM rechnung_position WHERE rechnung_id = r.id), 0)::text AS summe,
       EXISTS (SELECT 1 FROM rechnung_textbaustein b WHERE b.rechnung_id = r.id AND b.wirkung = 'kleinunternehmer') AS mit_ku
     FROM rechnung r WHERE r.id = $1`, [rechnungId],
  )).rows[0];
  if (!r) return;
  const brutto = Number(r.summe);
  // Heilbehandlung steuerfrei; Wellness mit USt – außer der Baustein § 19 UStG liegt bei (W80)
  const satz = r.steuerklasse === 'wellness_19' && !r.mit_ku ? Number((await db.query<{ wert: string }>("SELECT wert FROM praxis_einstellung WHERE schluessel = 'ust_satz_wellness'")).rows[0]?.wert ?? 19) : 0;
  const netto = satz ? rund(brutto / (1 + satz / 100)) : brutto;
  await db.query('UPDATE rechnung SET betrag = $2, netto = $3, ust = $4, ust_satz = $5, kleinunternehmer = $6, geaendert_am = now() WHERE id = $1', [rechnungId, rund(brutto), netto, rund(brutto - netto), satz, r.mit_ku]);
}

async function bausteineAutomatisch(db: Db, rechnungId: string, steuerklasse: string): Promise<void> {
  const ku = await kleinunternehmer(db);
  const passend = (await textbausteine(db)).filter((b) =>
    b.automatisch === 'alle' || (b.automatisch === 'heilbehandlung' && steuerklasse === 'heilbehandlung_steuerfrei') || (b.automatisch === 'wellness' && steuerklasse === 'wellness_19' && (b.wirkung !== 'kleinunternehmer' || ku)));
  for (const [i, b] of passend.entries()) await bausteinEinfuegen(db, rechnungId, b, i);
}

const bausteinEinfuegen = (db: Db, rechnungId: string, b: Textbaustein, reihenfolge: number) =>
  db.query('INSERT INTO rechnung_textbaustein (rechnung_id, textbaustein_id, code, kurzname, text, wirkung, reihenfolge) VALUES ($1, $2, $3, $4, $5, $6, $7)', [rechnungId, b.id, b.code, b.kurzname, b.text, b.wirkung, reihenfolge]);

export async function rechnungAnlegen(
  db: Db, patientId: string, d: { fallId?: string | null; verordnungId?: string | null; steuerklasse: 'heilbehandlung_steuerfrei' | 'wellness_19'; art?: string; notiz?: string }, wer: string,
): Promise<string> {
  const empfaenger = await empfaengerErmitteln(db, patientId);
  const preislisteId = await preislisteFuer(db, patientId);
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO rechnung (patient_id, fall_id, verordnung_id, art, steuerklasse, empfaenger, preisliste_id, status, notiz, erstellt_von, kleinunternehmer)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'entwurf', $8, $9, false) RETURNING id::text`,
    [patientId, d.fallId || null, d.verordnungId || null, d.art ?? 'einzel', d.steuerklasse, JSON.stringify(empfaenger), preislisteId, d.notiz?.trim() || null, wer],
  );
  const id = rows[0]!.id;
  await bausteineAutomatisch(db, id, d.steuerklasse);
  await summenBerechnen(db, id);
  await protokolliere(db, { actor: wer, action: 'rechnung_entwurf', objectType: 'patient', objectId: patientId, details: { rechnung: Number(id), steuerklasse: d.steuerklasse } });
  return id;
}

/** Entwurf aus einem Rezept: je verordneter Einheit eine Position, Datum aus den Terminen des Rezepts (W79) */
export async function rechnungAusRezept(db: Db, patientId: string, verordnungId: string, wer: string): Promise<string> {
  const v = (await db.query<{ fall_id: string | null; massnahme: string; leistung_nummer: string | null; anzahl: number }>(
    'SELECT fall_id::text, massnahme, leistung_nummer, anzahl_verordnet AS anzahl FROM verordnung WHERE id = $1 AND patient_id = $2', [verordnungId, patientId],
  )).rows[0];
  if (!v) throw new KarteiFehler('Dieses Rezept gibt es nicht');
  const id = await rechnungAnlegen(db, patientId, { fallId: v.fall_id, verordnungId, steuerklasse: 'heilbehandlung_steuerfrei', art: 'abschlussrechnung' }, wer);
  const preislisteId = await preislisteFuer(db, patientId);
  const preis = v.leistung_nummer ? await preisAus(db, preislisteId, v.leistung_nummer) : null;
  const termine = (await db.query<{ id: string; tag: string }>("SELECT id::text, to_char(beginn AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS tag FROM termin WHERE verordnung_id = $1 AND status IN ('vorgeschlagen','bestaetigt','erledigt') ORDER BY beginn", [verordnungId])).rows;
  for (let i = 0; i < v.anzahl; i++) {
    const t = termine[i];
    await db.query(
      'INSERT INTO rechnung_position (rechnung_id, reihenfolge, datum, nummer, bezeichnung, anzahl, einzelpreis, betrag, verordnung_id, termin_id, preisliste_position_id) VALUES ($1, $2, $3, $4, $5, 1, $6, $6, $7, $8, $9)',
      [id, i + 1, t?.tag ?? null, v.leistung_nummer, preis?.bezeichnung ?? v.massnahme, preis?.preis ?? 0, verordnungId, t?.id ?? null, preis?.positionId ?? null],
    );
  }
  await summenBerechnen(db, id);
  return id;
}

/** Entwurf aus einer Serie ohne Rezept: Wellness mit der Leistung des Falls, Direktzugang leer */
export async function rechnungAusSerie(db: Db, patientId: string, fallId: string, wer: string): Promise<string> {
  const f = (await db.query<{ grundlage: string; w_id: string | null; w_code: string | null; w_bez: string | null; w_preis: string | null }>(
    'SELECT f.grundlage::text, w.id::text AS w_id, w.code AS w_code, w.bezeichnung AS w_bez, w.preis::text AS w_preis FROM behandlungsfall f LEFT JOIN wellness_leistung w ON w.id = f.wellness_leistung_id WHERE f.id = $1 AND f.patient_id = $2', [fallId, patientId],
  )).rows[0];
  if (!f) throw new KarteiFehler('Diesen Fall gibt es nicht');
  const wellness = f.grundlage === 'praevention';
  const id = await rechnungAnlegen(db, patientId, { fallId, steuerklasse: wellness ? 'wellness_19' : 'heilbehandlung_steuerfrei', art: 'einzel' }, wer);
  if (wellness && f.w_id) {
    await db.query('INSERT INTO rechnung_position (rechnung_id, reihenfolge, nummer, bezeichnung, anzahl, einzelpreis, betrag, wellness_leistung_id) VALUES ($1, 1, $2, $3, 1, $4, $4, $5)', [id, f.w_code, f.w_bez, f.w_preis, f.w_id]);
    await summenBerechnen(db, id);
  }
  return id;
}

/** Eine erfasste Behandlung an die passende offene Position des Rezept-Entwurfs hängen */
export async function behandlungZuordnen(db: Db, verordnungId: string, behandlungLeistungId: string, datum: string): Promise<void> {
  const r = (await db.query<{ id: string }>("SELECT id::text FROM rechnung WHERE verordnung_id = $1 AND status = 'entwurf' ORDER BY id DESC LIMIT 1", [verordnungId])).rows[0];
  if (!r) return;
  // Erst die Position mit gleichem Datum, sonst die erste ohne Behandlung
  const pos = (await db.query<{ id: string }>(
    `SELECT id::text FROM rechnung_position WHERE rechnung_id = $1 AND behandlung_leistung_id IS NULL ORDER BY (datum = $2::date) DESC NULLS LAST, reihenfolge LIMIT 1`, [r.id, datum],
  )).rows[0];
  if (!pos) return;
  await db.query('UPDATE rechnung_position SET behandlung_leistung_id = $2, datum = COALESCE(datum, $3::date) WHERE id = $1', [pos.id, behandlungLeistungId, datum]);
}

// ── Positionen und Bausteine bearbeiten (nur im Entwurf) ────────────────────

async function nurEntwurf(db: Db, rechnungId: string, patientId: string): Promise<{ steuerklasse: string; preislisteId: string | null }> {
  const r = (await db.query<{ status: string; steuerklasse: string; preisliste_id: string | null }>('SELECT status::text, steuerklasse::text, preisliste_id::text FROM rechnung WHERE id = $1 AND patient_id = $2', [rechnungId, patientId])).rows[0];
  if (!r) throw new KarteiFehler('Diese Rechnung gibt es nicht');
  if (r.status !== 'entwurf') throw new KarteiFehler('Nur ein Entwurf lässt sich ändern – erst „Zurück in den Entwurf“');
  return { steuerklasse: r.steuerklasse, preislisteId: r.preisliste_id };
}

export async function positionHinzufuegen(
  db: Db, patientId: string, rechnungId: string, d: { nummer?: string; wellnessId?: string; bezeichnung?: string; anzahl?: number; einzelpreis?: string; datum?: string }, wer: string,
): Promise<void> {
  const r = await nurEntwurf(db, rechnungId, patientId);
  const anzahl = d.anzahl && d.anzahl > 0 ? d.anzahl : 1;
  let nummer = d.nummer?.trim() || null;
  let bezeichnung = d.bezeichnung?.trim() || '';
  let preis = d.einzelpreis?.trim() ? Number(d.einzelpreis.replace(',', '.')) : NaN;
  let positionId: string | null = null;
  let wellnessId: string | null = null;
  if (r.steuerklasse === 'wellness_19') {
    if (!d.wellnessId) throw new KarteiFehler('Wellness-Rechnung: bitte eine Leistung aus dem Wellness-Katalog wählen');
    const w = (await db.query<{ id: string; code: string; bezeichnung: string; preis: string }>('SELECT id::text, code, bezeichnung, preis::text FROM wellness_leistung WHERE id = $1', [d.wellnessId])).rows[0];
    if (!w) throw new KarteiFehler('Diese Wellness-Leistung gibt es nicht');
    nummer = w.code; bezeichnung ||= w.bezeichnung; wellnessId = w.id;
    if (Number.isNaN(preis)) preis = Number(w.preis);
  } else {
    if (!nummer) throw new KarteiFehler('Bitte eine Leistungsnummer aus der Preisliste angeben');
    const p = await preisAus(db, r.preislisteId, nummer);
    if (!p && Number.isNaN(preis)) throw new KarteiFehler(`Nr. ${nummer} steht nicht in der Preisliste – bitte Bezeichnung und Preis angeben`);
    bezeichnung ||= p?.bezeichnung ?? '';
    if (Number.isNaN(preis)) preis = p!.preis;
    positionId = p?.positionId ?? null;
  }
  if (!bezeichnung) throw new KarteiFehler('Die Bezeichnung fehlt');
  if (!(preis >= 0)) throw new KarteiFehler('Der Preis muss eine Zahl sein');
  const datum = d.datum?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(d.datum.trim()) ? d.datum.trim() : null;
  await db.query(
    'INSERT INTO rechnung_position (rechnung_id, reihenfolge, datum, nummer, bezeichnung, anzahl, einzelpreis, betrag, preisliste_position_id, wellness_leistung_id) VALUES ($1, (SELECT coalesce(max(reihenfolge), 0) + 1 FROM rechnung_position WHERE rechnung_id = $1), $2, $3, $4, $5, $6, $7, $8, $9)',
    [rechnungId, datum, nummer, bezeichnung, anzahl, rund(preis), rund(preis * anzahl), positionId, wellnessId],
  );
  await summenBerechnen(db, rechnungId);
  await protokolliere(db, { actor: wer, action: 'rechnung_position', objectType: 'patient', objectId: patientId, details: { rechnung: Number(rechnungId) } });
}

export async function positionAendern(db: Db, patientId: string, rechnungId: string, positionId: string, d: { datum?: string; bezeichnung?: string; anzahl?: number; einzelpreis?: string }, wer: string): Promise<void> {
  await nurEntwurf(db, rechnungId, patientId);
  const anzahl = d.anzahl && d.anzahl > 0 ? d.anzahl : 1;
  const preis = Number((d.einzelpreis ?? '').replace(',', '.'));
  if (!(preis >= 0)) throw new KarteiFehler('Der Preis muss eine Zahl sein');
  if (!d.bezeichnung?.trim()) throw new KarteiFehler('Die Bezeichnung fehlt');
  const datum = d.datum?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(d.datum.trim()) ? d.datum.trim() : null;
  const r = await db.query('UPDATE rechnung_position SET datum = $3, bezeichnung = $4, anzahl = $5, einzelpreis = $6, betrag = $7 WHERE id = $1 AND rechnung_id = $2 RETURNING id', [positionId, rechnungId, datum, d.bezeichnung.trim(), anzahl, rund(preis), rund(preis * anzahl)]);
  if (!r.rows.length) throw new KarteiFehler('Diese Position gibt es nicht');
  await summenBerechnen(db, rechnungId);
  await protokolliere(db, { actor: wer, action: 'rechnung_position_geaendert', objectType: 'patient', objectId: patientId, details: { rechnung: Number(rechnungId) } });
}

export async function positionLoeschen(db: Db, patientId: string, rechnungId: string, positionId: string, wer: string): Promise<void> {
  await nurEntwurf(db, rechnungId, patientId);
  await db.query('DELETE FROM rechnung_position WHERE id = $1 AND rechnung_id = $2', [positionId, rechnungId]);
  await summenBerechnen(db, rechnungId);
  await protokolliere(db, { actor: wer, action: 'rechnung_position_entfernt', objectType: 'patient', objectId: patientId, details: { rechnung: Number(rechnungId) } });
}

export async function bausteinHinzufuegen(db: Db, patientId: string, rechnungId: string, textbausteinId: string, wer: string): Promise<void> {
  const r = await nurEntwurf(db, rechnungId, patientId);
  const b = (await textbausteine(db, { alle: true })).find((x) => x.id === textbausteinId);
  if (!b) throw new KarteiFehler('Diesen Textbaustein gibt es nicht');
  if (b.wirkung === 'kleinunternehmer' && r.steuerklasse !== 'wellness_19') throw new KarteiFehler('§ 19 UStG gehört auf Wellness-Rechnungen – Heilbehandlung ist schon nach § 4 Nr. 14 UStG steuerfrei');
  const n = Number((await db.query<{ n: string }>('SELECT coalesce(max(reihenfolge), 0) + 1 AS n FROM rechnung_textbaustein WHERE rechnung_id = $1', [rechnungId])).rows[0]!.n);
  await bausteinEinfuegen(db, rechnungId, b, n);
  await summenBerechnen(db, rechnungId);
  await protokolliere(db, { actor: wer, action: 'rechnung_textbaustein', objectType: 'patient', objectId: patientId, details: { rechnung: Number(rechnungId), code: b.code } });
}

export async function bausteinAendern(db: Db, patientId: string, rechnungId: string, id: string, text: string, wer: string): Promise<void> {
  await nurEntwurf(db, rechnungId, patientId);
  if (!text.trim()) throw new KarteiFehler('Der Text fehlt');
  await db.query('UPDATE rechnung_textbaustein SET text = $3 WHERE id = $1 AND rechnung_id = $2', [id, rechnungId, text.trim()]);
  await protokolliere(db, { actor: wer, action: 'rechnung_textbaustein_geaendert', objectType: 'patient', objectId: patientId, details: { rechnung: Number(rechnungId) } });
}

export async function bausteinEntfernen(db: Db, patientId: string, rechnungId: string, id: string, wer: string): Promise<void> {
  await nurEntwurf(db, rechnungId, patientId);
  await db.query('DELETE FROM rechnung_textbaustein WHERE id = $1 AND rechnung_id = $2', [id, rechnungId]);
  await summenBerechnen(db, rechnungId);
  await protokolliere(db, { actor: wer, action: 'rechnung_textbaustein_entfernt', objectType: 'patient', objectId: patientId, details: { rechnung: Number(rechnungId) } });
}

// ── Status ──────────────────────────────────────────────────────────────────

export async function rechnungStatus(
  db: Db, patientId: string, rechnungId: string, aktion: 'fertig' | 'zurueck' | 'in_lexware' | 'versendet' | 'bezahlt' | 'storno', d: { versandArt?: string; grund?: string; nummer?: string; datum?: string }, wer: string,
): Promise<string> {
  const r = (await db.query<{ status: RechnungStatus; positionen: string; versand: string }>(
    'SELECT r.status::text, (SELECT count(*)::text FROM rechnung_position p WHERE p.rechnung_id = r.id) AS positionen, p.rechnungsversand AS versand FROM rechnung r JOIN patient p ON p.id = r.patient_id WHERE r.id = $1 AND r.patient_id = $2', [rechnungId, patientId],
  )).rows[0];
  if (!r) throw new KarteiFehler('Diese Rechnung gibt es nicht');
  const setze = (sql: string, werte: unknown[] = []) => db.query(`UPDATE rechnung SET ${sql}, geaendert_am = now() WHERE id = $1`, [rechnungId, ...werte]);
  let meldung = '';
  switch (aktion) {
    case 'fertig':
      if (r.status !== 'entwurf') throw new KarteiFehler('Nur ein Entwurf lässt sich fertigstellen');
      if (r.positionen === '0') throw new KarteiFehler('Die Rechnung hat noch keine Position');
      await setze("status = 'freigegeben', datum = COALESCE(datum, CURRENT_DATE), zeitraum_von = COALESCE(zeitraum_von, (SELECT min(datum) FROM rechnung_position WHERE rechnung_id = $1)), zeitraum_bis = COALESCE(zeitraum_bis, (SELECT max(datum) FROM rechnung_position WHERE rechnung_id = $1))");
      meldung = 'Fertig – die Rechnung wartet auf die Übertragung nach Lexware (Nummer und PDF kommen von dort).';
      break;
    case 'zurueck':
      if (!['freigegeben'].includes(r.status)) throw new KarteiFehler('Zurück in den Entwurf geht nur, solange Lexware die Rechnung noch nicht hat');
      await setze("status = 'entwurf'");
      meldung = 'Wieder ein Entwurf.';
      break;
    case 'in_lexware': {
      if (!['freigegeben', 'entwurf'].includes(r.status)) throw new KarteiFehler('Die Rechnung ist schon weiter');
      const nummer = d.nummer?.trim();
      if (!nummer) throw new KarteiFehler('Die Rechnungsnummer aus Lexware fehlt');
      await setze("status = 'in_lexware', nummer = $2, datum = COALESCE($3::date, datum, CURRENT_DATE), faellig_am = COALESCE(faellig_am, COALESCE($3::date, CURRENT_DATE) + 14)", [nummer, d.datum?.trim() || null]);
      meldung = `In Lexware mit Nummer ${nummer}.`;
      break;
    }
    case 'versendet': {
      if (!['in_lexware', 'freigegeben'].includes(r.status)) throw new KarteiFehler('Versenden erst, wenn die Rechnung in Lexware ist');
      const art = ['email', 'post', 'beides'].includes(d.versandArt ?? '') ? d.versandArt! : r.versand;
      await setze("status = 'gesendet', versand_art = $2, versendet_am = CURRENT_DATE, gesendet_am = CURRENT_DATE, faellig_am = COALESCE(faellig_am, CURRENT_DATE + 14)", [art]);
      meldung = `Als versendet vermerkt (${{ email: 'per Mail', post: 'per Post', beides: 'per Mail und Post' }[art]}).`;
      break;
    }
    case 'bezahlt':
      if (!['gesendet', 'in_lexware'].includes(r.status)) throw new KarteiFehler('Bezahlt setzt eine versendete Rechnung voraus');
      await setze("status = 'bezahlt', bezahlt_am = COALESCE($2::date, CURRENT_DATE)", [d.datum?.trim() || null]);
      meldung = 'Als bezahlt vermerkt.';
      break;
    case 'storno':
      if (r.status === 'bezahlt' || r.status === 'storniert') throw new KarteiFehler('Eine bezahlte oder stornierte Rechnung lässt sich nicht stornieren');
      if (!d.grund?.trim()) throw new KarteiFehler('Der Grund für den Storno ist Pflicht');
      await setze("status = 'storniert', storniert_am = CURRENT_DATE, storno_grund = $2", [d.grund.trim()]);
      meldung = 'Storniert. Ist die Rechnung schon in Lexware, dort ebenfalls stornieren – der Abgleich meldet sonst eine Abweichung.';
      break;
    default:
      throw new KarteiFehler('Unbekannte Aktion');
  }
  await protokolliere(db, { actor: wer, action: `rechnung_${aktion}`, objectType: 'patient', objectId: patientId, details: { rechnung: Number(rechnungId) } });
  return meldung;
}

/**
 * Was Lexware meldet, an die Rechnung schreiben (Abgleich, später über die Public API):
 * voided → storniert (wenn hier nicht schon), paid → bezahlt, anderer Betrag → Abweichung für die Kachel.
 */
export async function lexwareStandUebernehmen(
  db: Db, rechnungId: string, l: { invoiceId?: string; nummer?: string; status: string; betrag?: number; bezahltAm?: string; pdf?: Uint8Array }, wer: string,
): Promise<void> {
  const r = (await db.query<{ status: RechnungStatus; betrag: string; patient_id: string }>('SELECT status::text, betrag::text, patient_id::text FROM rechnung WHERE id = $1', [rechnungId])).rows[0];
  if (!r) return;
  const abweichungen: string[] = [];
  if (l.betrag !== undefined && Math.abs(l.betrag - Number(r.betrag)) > 0.005) abweichungen.push(`Betrag in Lexware ${l.betrag.toFixed(2).replace('.', ',')} € statt ${Number(r.betrag).toFixed(2).replace('.', ',')} €`);
  if (l.status === 'voided' && r.status !== 'storniert') abweichungen.push('in Lexware storniert');
  if (r.status === 'storniert' && l.status !== 'voided') abweichungen.push('hier storniert, in Lexware nicht');
  let statusSql = '';
  const bezahlt = (l.status === 'paid' || l.status === 'paidoff') && !['bezahlt', 'storniert'].includes(r.status);
  if (l.status === 'voided' && r.status !== 'storniert') statusSql = ", status = 'storniert', storniert_am = CURRENT_DATE, storno_grund = COALESCE(storno_grund, 'in Lexware storniert')";
  else if (bezahlt) statusSql = ", status = 'bezahlt'";
  else if (['entwurf', 'freigegeben'].includes(r.status) && l.nummer) statusSql = ", status = 'in_lexware', datum = COALESCE(datum, CURRENT_DATE), faellig_am = COALESCE(faellig_am, CURRENT_DATE + 14)";
  await db.query(
    `UPDATE rechnung SET lexware_invoice_id = COALESCE($2, lexware_invoice_id), nummer = COALESCE($3, nummer), lexware_status = $4, lexware_betrag = $5, lexware_geprueft_am = now(),
       bezahlt_am = CASE WHEN $9::boolean THEN COALESCE($6::date, CURRENT_DATE) ELSE bezahlt_am END,
       lexware_abweichung = $7, lexware_pdf = COALESCE($8::bytea, lexware_pdf), lexware_pdf_am = CASE WHEN $8::bytea IS NOT NULL THEN now() ELSE lexware_pdf_am END${statusSql}, geaendert_am = now() WHERE id = $1`,
    [rechnungId, l.invoiceId ?? null, l.nummer ?? null, l.status, l.betrag ?? null, l.bezahltAm ?? null, abweichungen.join(' · ') || null, l.pdf ? Buffer.from(l.pdf) : null, bezahlt],
  );
  await protokolliere(db, { actor: wer, action: 'rechnung_lexware_stand', objectType: 'patient', objectId: r.patient_id, details: { rechnung: Number(rechnungId), status: l.status, abweichung: abweichungen.length } });
}

export async function rechnungPdf(db: Db, patientId: string, rechnungId: string): Promise<{ daten: Uint8Array; name: string } | undefined> {
  const r = (await db.query<{ pdf: Uint8Array | null; nummer: string | null }>('SELECT lexware_pdf AS pdf, nummer FROM rechnung WHERE id = $1 AND patient_id = $2', [rechnungId, patientId])).rows[0];
  return r?.pdf ? { daten: r.pdf, name: `Rechnung-${r.nummer ?? rechnungId}.pdf` } : undefined;
}
