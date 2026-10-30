/** Akte (§ 630f BGB): Fälle, Behandlungen erfassen, Bestätigung des Patienten (W107a) – nur anhängen, nie ändern */
import { protokolliere, type Db } from '../../db/index.ts';
import { iso, istId, tag, text, zahl } from '../../db/werte.ts';
import type { Tresor } from '../../tresor.ts';
import { phaseVorruecken, type Phase } from '../pinnwand.ts';
import { behandlungZuordnen, preislisteFuer, rechnungAusSerie } from '../rechnungen.ts';
import { KarteiFehler, datumPruefen, geheim, type Behandlung, type Fall } from './basis.ts';
import { HAKEN_SQL } from './rezepte.ts';

// ── Bestätigung der Behandlung (W107a) ──────────────────────────────────────

const bestaetigungAus = (v: unknown): Behandlung['bestaetigung'] => {
  const o = (typeof v === 'string' ? JSON.parse(v) : v) as { art: string; zeitpunkt: unknown; werName: string | null; bild: boolean } | null;
  return o ? { art: o.art as 'unterschrift' | 'papier' | 'muendlich', zeitpunkt: iso(o.zeitpunkt)!, werName: text(o.werName), bild: Boolean(o.bild) } : null;
};

const PNG_KOPF = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const UNTERSCHRIFT_MAX = 400 * 1024;

/**
 * Bestätigung an eine Behandlung hängen – Unterschrift als PNG aus dem Formular (data:-Adresse), verschlüsselt im
 * Tresor; „papier“ und „muendlich“ ohne Bild. Höchstens eine je Behandlung, die Behandlung bleibt unverändert.
 */
export async function bestaetigungSpeichern(
  db: Db, t: Tresor, patientId: string, behandlungId: string, d: { art: string; unterschrift?: string; werName?: string }, wer: string,
): Promise<void> {
  if (!['unterschrift', 'papier', 'muendlich'].includes(d.art)) throw new KarteiFehler('Unbekannte Art der Bestätigung');
  const b = (await db.query('SELECT b.id FROM behandlung b JOIN behandlungsfall f ON f.id = b.fall_id WHERE b.id = $1 AND f.patient_id = $2', [behandlungId, patientId])).rows[0];
  if (!b) throw new KarteiFehler('Diese Behandlung gibt es nicht');
  let bild: Buffer | null = null;
  if (d.art === 'unterschrift') {
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec((d.unterschrift ?? '').trim());
    const daten = m ? Buffer.from(m[1]!, 'base64') : null;
    if (!daten || daten.length < 100 || !daten.subarray(0, 4).equals(PNG_KOPF)) throw new KarteiFehler('Bitte auf der Fläche unterschreiben – oder eine andere Art der Bestätigung wählen');
    if (daten.length > UNTERSCHRIFT_MAX) throw new KarteiFehler('Die Unterschrift ist zu groß – bitte noch einmal, kürzer');
    bild = t.verschluesseln(daten, 'behandlung_bestaetigung.bild');
  }
  try {
    await db.query('INSERT INTO behandlung_bestaetigung (behandlung_id, art, bild, bild_mime, wer_name, erfasst_von) VALUES ($1, $2, $3, $4, $5, $6)', [behandlungId, d.art, bild, bild ? 'image/png' : null, text(d.werName), wer]);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new KarteiFehler('Diese Behandlung ist schon bestätigt');
    throw err;
  }
  await protokolliere(db, { actor: wer, action: 'behandlung_bestaetigt', objectType: 'patient', objectId: patientId, details: { behandlung: Number(behandlungId), art: d.art } });
}

/** Das Unterschriftsbild einer Behandlung – aus dem Tresor; jedes Ansehen steht im Protokoll */
export async function bestaetigungBild(db: Db, t: Tresor, patientId: string, behandlungId: string, wer: string): Promise<{ daten: Uint8Array; mime: string } | undefined> {
  if (!istId(patientId) || !istId(behandlungId)) return undefined;
  const r = (await db.query<{ bild: Uint8Array | null; mime: string | null }>(
    'SELECT bb.bild, bb.bild_mime AS mime FROM behandlung_bestaetigung bb JOIN behandlung b ON b.id = bb.behandlung_id JOIN behandlungsfall f ON f.id = b.fall_id WHERE b.id = $1 AND f.patient_id = $2', [behandlungId, patientId],
  )).rows[0];
  if (!r?.bild) return undefined;
  await protokolliere(db, { actor: wer, action: 'unterschrift_angesehen', objectType: 'patient', objectId: patientId, details: { behandlung: Number(behandlungId) } });
  return { daten: new Uint8Array(t.entschluesseln(r.bild, 'behandlung_bestaetigung.bild')), mime: r.mime ?? 'image/png' };
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
            FROM behandlung_leistung bl WHERE bl.behandlung_id = b.id) AS leistungen,
         (SELECT row_to_json(x) FROM (SELECT bb.art::text, bb.zeitpunkt, bb.wer_name AS "werName", (bb.bild IS NOT NULL) AS bild FROM behandlung_bestaetigung bb WHERE bb.behandlung_id = b.id) x) AS bestaetigung
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
        bestaetigung: bestaetigungAus(b.bestaetigung),
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

/** Preis einer Leistung aus der Preisliste, die für den Patienten gilt (W97) – null, wenn es keine gibt */
async function preisAusListe(db: Db, patientId: string, nummer: string): Promise<{ preislisteId: string; positionId: string; bezeichnung: string; preis: number } | null> {
  const listeId = await preislisteFuer(db, patientId);
  if (!listeId) return null;
  const r = (await db.query<Record<string, unknown>>(
    `SELECT l.id::text AS liste, pp.id::text AS position, pp.bezeichnung, coalesce(pp.eigener_preis, pp.gkv_preis) AS preis
     FROM preisliste_position pp JOIN preisliste l ON l.id = pp.preisliste_id WHERE l.id = $2 AND pp.nummer = $1 LIMIT 1`, [nummer, listeId],
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
    const preis = nummer ? await preisAusListe(db, patientId, nummer) : null;
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
