/** Rezepte (Verordnungen) mit Haken über die Korrekturkette, Serien ohne Rezept und der Wellness-Katalog (W73, W74, W107a) */
import { protokolliere, type Db } from '../../db/index.ts';
import { tag, text, zahl } from '../../db/werte.ts';
import type { Tresor } from '../../tresor.ts';
import { entwurfAnKorrekturAnpassen, rechnungAusRezept } from '../rechnungen.ts';
import { KarteiFehler, datumPruefen, geheim, VERORDNUNG_ARTEN, type VerordnungArt, type VerordnungKurz, type Serie, type WellnessLeistung } from './basis.ts';

/** Haken über die Kette aus Original und Korrekturen (Korrekturen bringen kein neues Kontingent) */
export const HAKEN_SQL = (alias: string) => `(WITH RECURSIVE kette AS (
    SELECT k0.id, k0.vorgaenger_id, k0.art FROM verordnung k0 WHERE k0.id = ${alias}.id
    UNION ALL SELECT k1.id, k1.vorgaenger_id, k1.art FROM verordnung k1 JOIN kette k ON k1.id = k.vorgaenger_id WHERE k.art = 'korrektur')
  SELECT coalesce(sum(bl.anzahl), 0) FROM behandlung_leistung bl JOIN behandlung b ON b.id = bl.behandlung_id
  WHERE bl.verordnung_id IN (SELECT id FROM kette) AND b.ersetzt_am IS NULL)`;

/** Bestätigte Behandlungen auf dem Rezept (W107a), über dieselbe Kette */
const BESTAETIGT_SQL = (alias: string) => `(WITH RECURSIVE kette AS (
    SELECT k0.id, k0.vorgaenger_id, k0.art FROM verordnung k0 WHERE k0.id = ${alias}.id
    UNION ALL SELECT k1.id, k1.vorgaenger_id, k1.art FROM verordnung k1 JOIN kette k ON k1.id = k.vorgaenger_id WHERE k.art = 'korrektur')
  SELECT count(DISTINCT b.id) FROM behandlung_leistung bl JOIN behandlung b ON b.id = bl.behandlung_id JOIN behandlung_bestaetigung bb ON bb.behandlung_id = b.id
  WHERE bl.verordnung_id IN (SELECT id FROM kette) AND b.ersetzt_am IS NULL)`;

export async function verordnungen(db: Db, o: { patientId?: string; nurAktiv?: boolean } = {}): Promise<VerordnungKurz[]> {
  const wo = [o.patientId ? 'v.patient_id = $1' : 'true', o.nurAktiv ? "v.status = 'aktiv'" : 'true'].join(' AND ');
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT v.id::text, v.patient_id::text, p.vorname || ' ' || p.nachname AS patient_name, v.art::text, v.langzeit, v.ausgestellt_am, v.gueltig_bis, v.massnahme, v.leistung_nummer, v.frequenz,
       v.anzahl_verordnet, v.status::text, v.fall_id::text, f.nummer AS fall_nummer, a.name AS arzt, v.vorgaenger_id::text, v.zweitschrift_am, v.notiz,
       ${HAKEN_SQL('v')} AS abgehakt, ${BESTAETIGT_SQL('v')} AS bestaetigt,
       (SELECT count(*) FROM termin tm WHERE tm.verordnung_id = v.id AND tm.beginn >= now() AND tm.status IN ('bestaetigt', 'vorgeschlagen')) AS geplant
     FROM verordnung v JOIN patient p ON p.id = v.patient_id LEFT JOIN arzt a ON a.id = v.arzt_id LEFT JOIN behandlungsfall f ON f.id = v.fall_id
     WHERE ${wo} ORDER BY v.status = 'aktiv' DESC, v.ausgestellt_am DESC, v.id DESC LIMIT 300`, o.patientId ? [o.patientId] : [],
  );
  return rows.map((r) => ({
    id: String(r.id), patientId: String(r.patient_id), patientName: String(r.patient_name), art: r.art as VerordnungArt, langzeit: Boolean(r.langzeit),
    ausgestelltAm: tag(r.ausgestellt_am)!, gueltigBis: tag(r.gueltig_bis), massnahme: String(r.massnahme), leistungNummer: text(r.leistung_nummer), frequenz: text(r.frequenz),
    anzahlVerordnet: Number(r.anzahl_verordnet), abgehakt: Number(r.abgehakt), bestaetigt: Number(r.bestaetigt), geplant: Number(r.geplant), status: String(r.status), arzt: text(r.arzt), fallId: text(r.fall_id), fallNummer: zahl(r.fall_nummer),
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
