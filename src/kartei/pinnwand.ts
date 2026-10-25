/**
 * Patienten-Pinnwand (W76, Prompt 12): jeder Behandlungsfall steht in genau einer Phase des
 * Patientenwegs. Die Karte wandert erst weiter, wenn die Daten des vorherigen Schritts vollständig
 * sind – `phasePruefen` sagt, was fehlt. Jeder Wechsel steht im Phasenprotokoll des Falls.
 *
 * Phasen (fest): anfrage → aufnahme → anamnese → befund_start → behandlung → abschluss → rechnung → nachsorge → archiviert
 * Wellness-Serien (Prävention) überspringen Anamnese, Befund und Abschluss (Prompt 12, Fall c).
 */
import { protokolliere, type Db } from '../db/index.ts';
import { istId, tag } from '../db/werte.ts';
import type { Tresor } from '../tresor.ts';
import { KarteiFehler } from './patienten.ts';

export const PHASEN = ['anfrage', 'aufnahme', 'anamnese', 'befund_start', 'behandlung', 'abschluss', 'rechnung', 'nachsorge', 'archiviert'] as const;
export type Phase = (typeof PHASEN)[number];
export const PHASEN_NAMEN: Record<Phase, string> = {
  anfrage: 'Anfrage', aufnahme: 'Aufnahme', anamnese: 'Anamnese', befund_start: 'Befund', behandlung: 'Behandlung', abschluss: 'Abschluss', rechnung: 'Rechnung', nachsorge: 'Nachsorge', archiviert: 'Archiv',
};
/** Was in dieser Phase passiert – für die Spaltenköpfe */
export const PHASEN_TEXT: Record<Phase, string> = {
  anfrage: 'Terminwunsch ist da, Termin vereinbaren', aufnahme: 'Stammdaten, Einwilligung, Rezept', anamnese: 'Beschwerden und Vorgeschichte erfassen',
  befund_start: 'Eingangsbefund und Ziele', behandlung: 'Behandlungen abhaken', abschluss: 'Abschlussbefund', rechnung: 'Rechnung stellen', nachsorge: 'Zahlung erkannt, Nachsorgefrist', archiviert: 'Abgeschlossen',
};
const WELLNESS_UEBERSPRINGT: Phase[] = ['anamnese', 'befund_start', 'abschluss'];

export interface Karte {
  fallId: string;
  patientId: string;
  patientName: string;
  patientennummer: string;
  nummer: number;
  grundlage: 'verordnung' | 'direktzugang' | 'praevention';
  phase: Phase;
  bezeichnung: string | null;
  seitPhase: string | null;
  rezept: { abgehakt: number; anzahl: number; status: string } | null;
  behandlungen: number;
  letzteBehandlung: string | null;
  naechsterTermin: string | null;
  rechnungsstand: 'ok' | 'gelb' | 'rot' | 'keine';
  warnungen: string[];
}

export interface Spalte {
  phase: Phase;
  name: string;
  text: string;
  karten: Karte[];
}


const KARTEN_SQL = `
  SELECT f.id::text AS fall_id, f.patient_id::text, p.vorname || ' ' || p.nachname AS patient_name, p.patientennummer, f.nummer, f.grundlage::text, f.phase::text, f.bezeichnung,
    (SELECT max(am) FROM behandlungsfall_phase ph WHERE ph.fall_id = f.id) AS seit_phase,
    (SELECT row_to_json(x) FROM (SELECT v.anzahl_verordnet AS anzahl, v.status::text AS status,
        (SELECT coalesce(sum(bl.anzahl), 0) FROM behandlung_leistung bl JOIN behandlung b ON b.id = bl.behandlung_id WHERE bl.verordnung_id = v.id AND b.ersetzt_am IS NULL) AS abgehakt
      FROM verordnung v WHERE v.fall_id = f.id AND v.status IN ('aktiv', 'abgeschlossen') ORDER BY v.status = 'aktiv' DESC, v.ausgestellt_am DESC LIMIT 1) x) AS rezept,
    (SELECT count(*) FROM behandlung b WHERE b.fall_id = f.id AND b.ersetzt_am IS NULL AND b.status = 'erledigt') AS behandlungen,
    (SELECT max(b.datum) FROM behandlung b WHERE b.fall_id = f.id AND b.ersetzt_am IS NULL) AS letzte_behandlung,
    (SELECT min(t.beginn) FROM termin t WHERE t.patient_id = f.patient_id AND (t.fall_id = f.id OR t.fall_id IS NULL) AND t.status IN ('vorgeschlagen', 'bestaetigt') AND t.ende >= now()) AS naechster_termin,
    (SELECT CASE WHEN count(*) = 0 THEN 'keine'
       WHEN bool_or(r.status IN ('gesendet','freigegeben') AND (r.gemahnt_am IS NOT NULL OR r.faellig_am < CURRENT_DATE - 14)) THEN 'rot'
       WHEN bool_or(r.status IN ('gesendet','freigegeben') AND r.faellig_am < CURRENT_DATE) THEN 'gelb' ELSE 'ok' END
     FROM rechnung r WHERE r.fall_id = f.id) AS rechnungsstand
  FROM behandlungsfall f JOIN patient p ON p.id = f.patient_id`;

function zuKarte(t: Tresor, r: Record<string, unknown>): Karte {
  const rezept = r.rezept as { anzahl: number; status: string; abgehakt: number } | null;
  const k: Karte = {
    fallId: String(r.fall_id), patientId: String(r.patient_id), patientName: String(r.patient_name), patientennummer: String(r.patientennummer), nummer: Number(r.nummer),
    grundlage: r.grundlage as Karte['grundlage'], phase: r.phase as Phase, bezeichnung: t.entschluesselnText(r.bezeichnung as Uint8Array | null, 'behandlungsfall.bezeichnung'),
    seitPhase: r.seit_phase ? new Date(r.seit_phase as string).toISOString() : null,
    rezept: rezept ? { abgehakt: Number(rezept.abgehakt), anzahl: Number(rezept.anzahl), status: rezept.status } : null,
    behandlungen: Number(r.behandlungen), letzteBehandlung: tag(r.letzte_behandlung), naechsterTermin: r.naechster_termin ? new Date(r.naechster_termin as string).toISOString() : null,
    rechnungsstand: (r.rechnungsstand as Karte['rechnungsstand']) ?? 'keine', warnungen: [],
  };
  // Warnregeln aus Prompt 12 – nur, was sich aus der Kartei lesen lässt
  if (k.grundlage === 'verordnung' && !k.rezept && ['aufnahme', 'anamnese', 'befund_start', 'behandlung'].includes(k.phase)) k.warnungen.push('Rezept fehlt');
  if (k.phase === 'behandlung' && !k.naechsterTermin && k.rezept && k.rezept.status === 'aktiv') k.warnungen.push('kein Folgetermin');
  if (k.phase === 'behandlung' && k.rezept && k.rezept.abgehakt >= k.rezept.anzahl) k.warnungen.push('letzte Einheit erreicht');
  if (k.rechnungsstand === 'gelb') k.warnungen.push('Rechnung überfällig');
  if (k.rechnungsstand === 'rot') k.warnungen.push('Rechnung im Verzug');
  return k;
}

export async function pinnwand(db: Db, t: Tresor, o: { archiv?: boolean } = {}): Promise<Spalte[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `${KARTEN_SQL} WHERE p.status <> 'archiviert' ${o.archiv ? '' : "AND f.phase <> 'archiviert'"} ORDER BY f.geaendert_am DESC LIMIT 500`,
  );
  const karten = rows.map((r) => zuKarte(t, r));
  return PHASEN.filter((ph) => o.archiv || ph !== 'archiviert').map((phase) => ({ phase, name: PHASEN_NAMEN[phase], text: PHASEN_TEXT[phase], karten: karten.filter((k) => k.phase === phase) }));
}

export async function karte(db: Db, t: Tresor, fallId: string): Promise<Karte | undefined> {
  if (!istId(fallId)) return undefined;
  const r = (await db.query<Record<string, unknown>>(`${KARTEN_SQL} WHERE f.id = $1`, [fallId])).rows[0];
  return r ? zuKarte(t, r) : undefined;
}

// ── Regeln: was ein Schritt braucht ─────────────────────────────────────────

/** Was für die Phase `nach` erledigt sein muss – leer = bereit */
export async function phasePruefen(db: Db, fallId: string, nach: Phase): Promise<string[]> {
  const f = (await db.query<{ patient_id: string; grundlage: string; phase: Phase }>('SELECT patient_id::text, grundlage::text, phase::text FROM behandlungsfall WHERE id = $1', [fallId])).rows[0];
  if (!f) throw new KarteiFehler('Diesen Behandlungsfall gibt es nicht');
  const von = PHASEN.indexOf(f.phase);
  const ziel = PHASEN.indexOf(nach);
  if (ziel < 0) throw new KarteiFehler('Unbekannte Phase');
  if (ziel <= von) return []; // zurück geht immer – mit Grund im Protokoll
  const wellness = f.grundlage === 'praevention';
  const fehlt: string[] = [];
  const zaehle = async (sql: string, werte: unknown[]) => Number((await db.query<{ n: string }>(sql, werte)).rows[0]!.n);
  // Alle Schritte zwischen jetzt und Ziel müssen erfüllt sein
  for (const ph of PHASEN.slice(von + 1, ziel + 1)) {
    if (wellness && WELLNESS_UEBERSPRINGT.includes(ph)) continue;
    switch (ph) {
      case 'aufnahme':
        if (!(await zaehle("SELECT count(*)::text AS n FROM termin WHERE patient_id = $1 AND status IN ('bestaetigt', 'erledigt')", [f.patient_id]))) fehlt.push('ein bestätigter Termin');
        break;
      case 'anamnese': {
        const p = (await db.query<{ geburtsdatum: Date | null; adressen: string; kontakte: string }>(
          `SELECT geburtsdatum, (SELECT count(*)::text FROM patient_adresse a WHERE a.patient_id = p.id AND a.rechnungsadresse) AS adressen,
             (SELECT count(*)::text FROM patient_kontakt k WHERE k.patient_id = p.id AND k.art IN ('mobil', 'telefon', 'email')) AS kontakte FROM patient p WHERE p.id = $1`, [f.patient_id],
        )).rows[0]!;
        if (!p.geburtsdatum) fehlt.push('Geburtsdatum');
        if (p.adressen === '0') fehlt.push('Rechnungsadresse');
        if (p.kontakte === '0') fehlt.push('Telefon oder Mail');
        for (const [art, name] of [['behandlungseinwilligung', 'Behandlungseinwilligung'], ['datenschutzinformation', 'Datenschutzinformation ausgehändigt']] as const) {
          if (!(await zaehle('SELECT count(*)::text AS n FROM patient_erklaerung WHERE patient_id = $1 AND art = $2 AND widerrufen_am IS NULL AND (fall_id IS NULL OR fall_id = $3)', [f.patient_id, art, fallId]))) fehlt.push(name);
        }
        if (f.grundlage === 'verordnung' && !(await zaehle("SELECT count(*)::text AS n FROM verordnung WHERE fall_id = $1 AND status IN ('aktiv', 'abgeschlossen')", [fallId]))) fehlt.push('Rezept am Fall');
        if (f.grundlage === 'direktzugang' && !(await zaehle("SELECT count(*)::text AS n FROM patient_erklaerung WHERE patient_id = $1 AND art = 'kosteninformation' AND widerrufen_am IS NULL", [f.patient_id]))) fehlt.push('Kosteninformation (§ 630c)');
        break;
      }
      case 'befund_start':
        if (!(await zaehle('SELECT count(*)::text AS n FROM anamnese WHERE fall_id = $1 AND ersetzt_am IS NULL', [fallId]))) fehlt.push('Anamnese');
        break;
      case 'behandlung':
        if (!wellness && !(await zaehle("SELECT count(*)::text AS n FROM befund WHERE fall_id = $1 AND art = 'eingang' AND ersetzt_am IS NULL", [fallId]))) fehlt.push('Eingangsbefund');
        break;
      case 'abschluss': {
        if (!(await zaehle("SELECT count(*)::text AS n FROM behandlung WHERE fall_id = $1 AND ersetzt_am IS NULL AND status = 'erledigt'", [fallId]))) fehlt.push('mindestens eine Behandlung');
        const offen = await zaehle(
          `SELECT count(*)::text AS n FROM verordnung v WHERE v.fall_id = $1 AND v.status = 'aktiv'
             AND v.anzahl_verordnet > (SELECT coalesce(sum(bl.anzahl), 0) FROM behandlung_leistung bl JOIN behandlung b ON b.id = bl.behandlung_id WHERE bl.verordnung_id = v.id AND b.ersetzt_am IS NULL)`, [fallId],
        );
        if (offen) fehlt.push('Rezept noch nicht abgehakt (oder abbrechen)');
        break;
      }
      case 'rechnung':
        if (!wellness && !(await zaehle("SELECT count(*)::text AS n FROM befund WHERE fall_id = $1 AND art = 'abschluss' AND ersetzt_am IS NULL", [fallId]))) fehlt.push('Abschlussbefund');
        if (!(await zaehle("SELECT count(*)::text AS n FROM behandlung WHERE fall_id = $1 AND ersetzt_am IS NULL AND status = 'erledigt'", [fallId]))) fehlt.push('mindestens eine Behandlung');
        break;
      case 'nachsorge':
        if (await zaehle("SELECT count(*)::text AS n FROM rechnung WHERE fall_id = $1 AND status IN ('entwurf', 'freigegeben', 'gesendet')", [fallId])) fehlt.push('offene Rechnung bezahlt');
        break;
      case 'archiviert':
        break;
      default:
        break;
    }
  }
  return [...new Set(fehlt)];
}

export async function phaseSetzen(db: Db, patientId: string, fallId: string, nach: Phase, wer: string, grund?: string): Promise<void> {
  const f = (await db.query<{ phase: Phase }>('SELECT phase::text FROM behandlungsfall WHERE id = $1 AND patient_id = $2', [fallId, patientId])).rows[0];
  if (!f) throw new KarteiFehler('Diesen Behandlungsfall gibt es nicht');
  if (f.phase === nach) return;
  const fehlt = await phasePruefen(db, fallId, nach);
  if (fehlt.length) throw new KarteiFehler(`Noch nicht bereit für „${PHASEN_NAMEN[nach]}“ – es fehlt: ${fehlt.join(', ')}`);
  const zurueck = PHASEN.indexOf(nach) < PHASEN.indexOf(f.phase);
  if (zurueck && !grund?.trim()) throw new KarteiFehler('Zurück geht nur mit Grund');
  await db.query(
    `UPDATE behandlungsfall SET phase = $2::fall_phase, abgeschlossen_am = CASE WHEN $2::text = 'archiviert' THEN COALESCE(abgeschlossen_am, CURRENT_DATE) ELSE abgeschlossen_am END,
       aufbewahren_bis = CASE WHEN $2::text = 'archiviert' THEN COALESCE(abgeschlossen_am, CURRENT_DATE) + interval '10 years' ELSE aufbewahren_bis END, geaendert_am = now() WHERE id = $1`,
    [fallId, nach],
  );
  await db.query('INSERT INTO behandlungsfall_phase (fall_id, von, nach, wer, grund) VALUES ($1, $2, $3, $4, $5)', [fallId, f.phase, nach, wer, grund?.trim() || (zurueck ? 'zurück' : 'von Hand')]);
  await protokolliere(db, { actor: wer, action: 'fall_phase', objectType: 'patient', objectId: patientId, details: { von: f.phase, nach } });
}

/** Automatisch weiter, wenn ein Ereignis die Phase erreicht (nie zurück, nie über fehlende Daten hinweg) */
export async function phaseVorruecken(db: Db, patientId: string, fallId: string, mindestens: Phase, wer: string, grund: string): Promise<void> {
  const f = (await db.query<{ phase: Phase }>('SELECT phase::text FROM behandlungsfall WHERE id = $1', [fallId])).rows[0];
  if (!f || PHASEN.indexOf(f.phase) >= PHASEN.indexOf(mindestens)) return;
  if ((await phasePruefen(db, fallId, mindestens)).length) return;
  await db.query('UPDATE behandlungsfall SET phase = $2::fall_phase, geaendert_am = now() WHERE id = $1', [fallId, mindestens]);
  await db.query('INSERT INTO behandlungsfall_phase (fall_id, von, nach, wer, grund) VALUES ($1, $2, $3, $4, $5)', [fallId, f.phase, mindestens, wer, `automatisch: ${grund}`]);
}

// ── Anamnese, Befund, Erklärungen (die Daten der Schritte) ──────────────────

const geheim = (t: Tresor, wert: string | undefined, kontext: string) => (wert?.trim() ? t.verschluesseln(wert.trim(), kontext) : null);
const datumPruefen = (d: string | undefined, was: string): string | null => {
  const v = (d ?? '').trim();
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new KarteiFehler(`${was}: bitte ein gültiges Datum`);
  return v;
};

export async function anamneseErfassen(
  db: Db, t: Tresor, patientId: string, fallId: string,
  d: { erhobenAm?: string; art?: string; beschwerden?: string; vorgeschichte?: string; medikamente?: string; allergien?: string; risiken?: string; sonstiges?: string }, wer: string,
): Promise<string> {
  if (!d.beschwerden?.trim()) throw new KarteiFehler('Beschwerden / Behandlungsanlass sind Pflicht (§ 630f BGB)');
  const art = ['online', 'tablet', 'gespraech', 'uebernommen'].includes(d.art ?? '') ? d.art! : 'gespraech';
  const alt = (await db.query<{ id: string }>('SELECT id::text FROM anamnese WHERE fall_id = $1 AND ersetzt_am IS NULL ORDER BY id DESC LIMIT 1', [fallId])).rows[0]?.id ?? null;
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO anamnese (fall_id, erhoben_am, art, beschwerden, vorgeschichte, medikamente, allergien, kontraindikationen_risiken, sonstiges, erstellt_von, vorgaenger_id)
     VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id::text`,
    [fallId, datumPruefen(d.erhobenAm, 'Datum'), art, geheim(t, d.beschwerden, 'anamnese.beschwerden'), geheim(t, d.vorgeschichte, 'anamnese.vorgeschichte'), geheim(t, d.medikamente, 'anamnese.medikamente'),
      geheim(t, d.allergien, 'anamnese.allergien'), geheim(t, d.risiken, 'anamnese.kontraindikationen_risiken'), geheim(t, d.sonstiges, 'anamnese.sonstiges'), wer, alt],
  );
  if (alt) await db.query('UPDATE anamnese SET ersetzt_am = now() WHERE id = $1', [alt]);
  await protokolliere(db, { actor: wer, action: 'anamnese_erfasst', objectType: 'patient', objectId: patientId });
  await phaseVorruecken(db, patientId, fallId, 'befund_start', wer, 'Anamnese erfasst');
  return rows[0]!.id;
}

export async function befundErfassen(db: Db, t: Tresor, patientId: string, fallId: string, d: { erhobenAm?: string; art: string; text?: string; messwerte?: string }, wer: string): Promise<string> {
  if (!['eingang', 'verlauf', 'abschluss'].includes(d.art)) throw new KarteiFehler('Befundart: Eingang, Verlauf oder Abschluss');
  if (!d.text?.trim()) throw new KarteiFehler('Der Befundtext fehlt');
  const { rows } = await db.query<{ id: string }>(
    'INSERT INTO befund (fall_id, erhoben_am, art, text, messwerte, erstellt_von) VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3, $4, $5, $6) RETURNING id::text',
    [fallId, datumPruefen(d.erhobenAm, 'Datum'), d.art, geheim(t, d.text, 'befund.text'), geheim(t, d.messwerte, 'befund.messwerte'), wer],
  );
  if (d.art === 'abschluss') await db.query('UPDATE behandlungsfall SET abschlussbefund = $2 WHERE id = $1 AND abschlussbefund IS NULL', [fallId, geheim(t, d.text, 'behandlungsfall.abschlussbefund')]);
  await protokolliere(db, { actor: wer, action: 'befund_erfasst', objectType: 'patient', objectId: patientId, details: { art: d.art } });
  if (d.art === 'eingang') await phaseVorruecken(db, patientId, fallId, 'behandlung', wer, 'Eingangsbefund erfasst');
  if (d.art === 'abschluss') await phaseVorruecken(db, patientId, fallId, 'rechnung', wer, 'Abschlussbefund erfasst');
  return rows[0]!.id;
}

export const ERKLAERUNG_ARTEN: Record<string, string> = {
  aufklaerung: 'Aufklärung (mündlich, dokumentiert)', behandlungseinwilligung: 'Einwilligung in die Behandlung', kosteninformation: 'Kosteninformation in Textform (§ 630c Abs. 3)',
  honorarvereinbarung: 'Honorarvereinbarung', datenschutzinformation: 'Datenschutzinformation ausgehändigt', einwilligung_email: 'Einwilligung E-Mail', einwilligung_whatsapp: 'Einwilligung WhatsApp',
  einwilligung_erinnerung: 'Einwilligung Terminerinnerung', einwilligung_foto: 'Einwilligung Foto', einwilligung_sonstige: 'Sonstige Einwilligung',
};

export async function erklaerungErfassen(
  db: Db, t: Tresor, patientId: string, d: { fallId?: string; art: string; am?: string; form?: string; inhalt?: string; fassung?: string; gueltigBis?: string }, wer: string,
): Promise<string> {
  if (!(d.art in ERKLAERUNG_ARTEN)) throw new KarteiFehler('Unbekannte Erklärung');
  const form = ['muendlich', 'schriftlich', 'textform', 'elektronisch'].includes(d.form ?? '') ? d.form! : 'schriftlich';
  const { rows } = await db.query<{ id: string }>(
    'INSERT INTO patient_erklaerung (patient_id, fall_id, art, am, form, inhalt, dokument_fassung, gueltig_bis, erfasst_von) VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5, $6, $7, $8, $9) RETURNING id::text',
    [patientId, d.fallId || null, d.art, datumPruefen(d.am, 'Datum'), form, geheim(t, d.inhalt, 'patient_erklaerung.inhalt'), d.fassung?.trim() || null, datumPruefen(d.gueltigBis, 'Gültig bis'), wer],
  );
  await protokolliere(db, { actor: wer, action: 'erklaerung_erfasst', objectType: 'patient', objectId: patientId, details: { art: d.art } });
  return rows[0]!.id;
}

export async function erklaerungWiderrufen(db: Db, patientId: string, id: string, grund: string, wer: string): Promise<void> {
  const r = await db.query('UPDATE patient_erklaerung SET widerrufen_am = CURRENT_DATE, widerruf_grund = $3 WHERE id = $1 AND patient_id = $2 AND widerrufen_am IS NULL RETURNING id', [id, patientId, grund.trim() || 'widerrufen']);
  if (!r.rows.length) throw new KarteiFehler('Diese Erklärung ist nicht (mehr) gültig');
  await protokolliere(db, { actor: wer, action: 'erklaerung_widerrufen', objectType: 'patient', objectId: patientId });
}

// ── Fall-Details (Klick auf die Karte) ──────────────────────────────────────

export interface FallDetails {
  karte: Karte;
  anlass: string | null;
  diagnoseArzt: string | null;
  therapieziele: string | null;
  steuerklasse: string;
  begonnenAm: string | null;
  abgeschlossenAm: string | null;
  anamnese: { id: string; erhobenAm: string; art: string; beschwerden: string | null; vorgeschichte: string | null; medikamente: string | null; allergien: string | null; risiken: string | null; sonstiges: string | null } | null;
  befunde: { id: string; erhobenAm: string; art: string; text: string | null; messwerte: string | null }[];
  erklaerungen: { id: string; art: string; am: string; form: string; inhalt: string | null; fassung: string | null; gueltigBis: string | null; widerrufenAm: string | null; fallId: string | null }[];
  phasen: { von: Phase | null; nach: Phase; am: string; wer: string; grund: string | null }[];
  /** Für jede weitere Phase: was fehlt (leer = bereit) */
  naechste: { phase: Phase; name: string; fehlt: string[] }[];
}

export async function fallDetails(db: Db, t: Tresor, patientId: string, fallId: string, wer: string): Promise<FallDetails | undefined> {
  const k = await karte(db, t, fallId);
  if (!k || k.patientId !== patientId) return undefined;
  const f = (await db.query<Record<string, unknown>>('SELECT anlass, diagnose_arzt, therapieziele, steuerklasse::text, begonnen_am, abgeschlossen_am FROM behandlungsfall WHERE id = $1', [fallId])).rows[0]!;
  const a = (await db.query<Record<string, unknown>>('SELECT id::text, erhoben_am, art::text, beschwerden, vorgeschichte, medikamente, allergien, kontraindikationen_risiken, sonstiges FROM anamnese WHERE fall_id = $1 AND ersetzt_am IS NULL ORDER BY id DESC LIMIT 1', [fallId])).rows[0];
  const bs = (await db.query<Record<string, unknown>>('SELECT id::text, erhoben_am, art::text, text, messwerte FROM befund WHERE fall_id = $1 AND ersetzt_am IS NULL ORDER BY erhoben_am DESC, id DESC', [fallId])).rows;
  const es = (await db.query<Record<string, unknown>>('SELECT id::text, art::text, am, form::text, inhalt, dokument_fassung, gueltig_bis, widerrufen_am, fall_id::text FROM patient_erklaerung WHERE patient_id = $1 AND (fall_id IS NULL OR fall_id = $2) ORDER BY am DESC, id DESC', [patientId, fallId])).rows;
  const ps = (await db.query<Record<string, unknown>>('SELECT von::text, nach::text, am, wer, grund FROM behandlungsfall_phase WHERE fall_id = $1 ORDER BY am DESC, id DESC', [fallId])).rows;
  const naechste: FallDetails['naechste'] = [];
  for (const ph of PHASEN.slice(PHASEN.indexOf(k.phase) + 1)) naechste.push({ phase: ph, name: PHASEN_NAMEN[ph], fehlt: await phasePruefen(db, fallId, ph) });
  await protokolliere(db, { actor: wer, action: 'akte_geoeffnet', objectType: 'patient', objectId: patientId, details: { fall: Number(fallId) } });
  const txt = (v: unknown, kontext: string) => t.entschluesselnText(v as Uint8Array | null, kontext);
  return {
    karte: k, anlass: txt(f.anlass, 'behandlungsfall.anlass'), diagnoseArzt: txt(f.diagnose_arzt, 'behandlungsfall.diagnose_arzt'), therapieziele: txt(f.therapieziele, 'behandlungsfall.therapieziele'),
    steuerklasse: String(f.steuerklasse), begonnenAm: tag(f.begonnen_am), abgeschlossenAm: tag(f.abgeschlossen_am),
    anamnese: a ? {
      id: String(a.id), erhobenAm: tag(a.erhoben_am)!, art: String(a.art), beschwerden: txt(a.beschwerden, 'anamnese.beschwerden'), vorgeschichte: txt(a.vorgeschichte, 'anamnese.vorgeschichte'),
      medikamente: txt(a.medikamente, 'anamnese.medikamente'), allergien: txt(a.allergien, 'anamnese.allergien'), risiken: txt(a.kontraindikationen_risiken, 'anamnese.kontraindikationen_risiken'), sonstiges: txt(a.sonstiges, 'anamnese.sonstiges'),
    } : null,
    befunde: bs.map((b) => ({ id: String(b.id), erhobenAm: tag(b.erhoben_am)!, art: String(b.art), text: txt(b.text, 'befund.text'), messwerte: txt(b.messwerte, 'befund.messwerte') })),
    erklaerungen: es.map((e) => ({ id: String(e.id), art: String(e.art), am: tag(e.am)!, form: String(e.form), inhalt: txt(e.inhalt, 'patient_erklaerung.inhalt'), fassung: (e.dokument_fassung as string | null) ?? null, gueltigBis: tag(e.gueltig_bis), widerrufenAm: tag(e.widerrufen_am), fallId: (e.fall_id as string | null) ?? null })),
    phasen: ps.map((p) => ({ von: (p.von as Phase | null) ?? null, nach: p.nach as Phase, am: new Date(p.am as string).toISOString(), wer: String(p.wer), grund: (p.grund as string | null) ?? null })),
    naechste,
  };
}
