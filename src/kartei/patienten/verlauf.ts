/** Kontaktverlauf (W67): Anrufe mit Gesprächsgrund, Einträge von Hand, Gesprächsgründe */
import { protokolliere, type Db } from '../../db/index.ts';
import { iso } from '../../db/werte.ts';
import type { Tresor } from '../../tresor.ts';
import { KarteiFehler, geheim, type Kontaktart, type VerlaufEintrag, type Gespraechsgrund } from './basis.ts';

// ── Kontaktverlauf (W67) ────────────────────────────────────────────────────

export const gespraechsgruende = async (db: Db): Promise<Gespraechsgrund[]> =>
  (await db.query<Gespraechsgrund>('SELECT code, bezeichnung FROM gespraechsgrund WHERE aktiv ORDER BY reihenfolge, code')).rows;

export async function kontaktverlauf(db: Db, t: Tresor, patientId: string, limit = 50): Promise<VerlaufEintrag[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT v.id::text, v.art::text, v.am, v.grund_code, g.bezeichnung AS grund_text, v.notiz, v.offen, v.erfasst_von, v.quelle_ref, k.art::text AS k_art, k.wert AS k_wert
     FROM patient_kontaktverlauf v LEFT JOIN gespraechsgrund g ON g.code = v.grund_code LEFT JOIN patient_kontakt k ON k.id = v.kontakt_id
     WHERE v.patient_id = $1 ORDER BY v.offen DESC, v.am DESC LIMIT $2`, [patientId, limit],
  );
  return rows.map((r) => ({
    id: String(r.id), art: String(r.art), am: iso(r.am)!, offen: Boolean(r.offen), erfasstVon: String(r.erfasst_von),
    link: typeof r.quelle_ref === 'string' && /^https:\/\//.test(r.quelle_ref) ? r.quelle_ref : null,
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
