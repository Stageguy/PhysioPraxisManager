/**
 * Lexware-Kunden neben der Kartei (W99): jeder Kunde ist entweder **verknüpft** (ein Patient trägt seine
 * Kundennummer), **vermutet** (ein Patient hat denselben Namen) oder **neu** (noch nicht in der Kartei).
 * Geschrieben wird nur die Verknüpfung am Patienten (lexware_kundennummer, lexware_kontakt_id) –
 * Patienten entstehen weiterhin über „Neuer Patient“, vorbelegt aus der Kundenkarte.
 */
import { protokolliere, type Db } from '../db/index.ts';
import { istId, text } from '../db/werte.ts';
import type { LexwareKunde } from '../lexware/kunden.ts';
import { KarteiFehler } from './patienten.ts';

export type KundeStand = 'verknuepft' | 'vermutet' | 'neu';

export interface LexwareKundeStand extends LexwareKunde {
  stand: KundeStand;
  /** Verknüpfter bzw. vermuteter Patient */
  patient: { id: string; name: string; patientennummer: string; status: string } | null;
}

interface PatientZeile { id: string; vorname: string; nachname: string; patientennummer: string; status: string; lexware_kundennummer: string | null }

/** Namensschlüssel: klein, ohne Akzente, ohne Satzzeichen, einfache Abstände */
export const namensschluessel = (vorname: string, nachname: string): string =>
  `${vorname} ${nachname}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

const kurz = (p: PatientZeile) => ({ id: p.id, name: `${p.vorname} ${p.nachname}`.trim(), patientennummer: p.patientennummer, status: p.status });

/** Jeden Kunden gegen die Kartei stellen: Kundennummer zuerst, dann der Name (auch „Nachname Vorname“ und Firmenname) */
export async function kundenAbgleich(db: Db, kunden: LexwareKunde[]): Promise<LexwareKundeStand[]> {
  const { rows } = await db.query<PatientZeile>('SELECT id::text, vorname, nachname, patientennummer, status, lexware_kundennummer FROM patient');
  const nachNummer = new Map<string, PatientZeile>();
  const nachName = new Map<string, PatientZeile[]>();
  for (const p of rows) {
    if (p.lexware_kundennummer) nachNummer.set(p.lexware_kundennummer, p);
    const s = namensschluessel(p.vorname, p.nachname);
    if (s) nachName.set(s, [...(nachName.get(s) ?? []), p]);
  }
  // Bei mehreren Namensgleichen zuerst der aktive, dann der ohne Lexware-Nummer
  const bester = (liste: PatientZeile[] | undefined) =>
    liste?.slice().sort((a, b) => Number(a.status !== 'aktiv') - Number(b.status !== 'aktiv') || Number(Boolean(a.lexware_kundennummer)) - Number(Boolean(b.lexware_kundennummer)))[0];
  return kunden.map((k) => {
    const verknuepft = nachNummer.get(k.nummer);
    if (verknuepft) return { ...k, stand: 'verknuepft', patient: kurz(verknuepft) };
    const kandidaten = [namensschluessel(k.vorname, k.nachname), namensschluessel(k.nachname, k.vorname), ...(k.firma ? [namensschluessel('', k.firma)] : [])].filter(Boolean);
    const treffer = kandidaten.map((s) => bester(nachName.get(s))).find((p) => p && !p.lexware_kundennummer);
    return treffer ? { ...k, stand: 'vermutet', patient: kurz(treffer) } : { ...k, stand: 'neu', patient: null };
  });
}

const nummerPruefen = (nummer: string): string => {
  const n = nummer.trim();
  if (!/^\d{1,12}$/.test(n)) throw new KarteiFehler('Keine Lexware-Kundennummer');
  return n;
};

/** Die Kundennummer darf nur an einem Patienten stehen – vor dem Anlegen prüfen, damit kein halber Patient entsteht */
export async function lexwareNummerFrei(db: Db, nummer: string, ausserPatientId?: string): Promise<void> {
  const n = nummerPruefen(nummer);
  const { rows } = await db.query<{ patientennummer: string }>('SELECT patientennummer FROM patient WHERE lexware_kundennummer = $1 AND ($2::text IS NULL OR id <> $2::bigint)', [n, ausserPatientId && istId(ausserPatientId) ? ausserPatientId : null]);
  if (rows.length) throw new KarteiFehler(`Lexware-Kunde ${n} ist schon Patient ${rows[0]!.patientennummer} zugeordnet`);
}

/** Kundennummer und Kontakt-ID an den Patienten schreiben */
export async function lexwareVerknuepfen(db: Db, patientId: string, kunde: { nummer: string; kontaktId?: string }, wer: string): Promise<{ name: string }> {
  if (!istId(patientId)) throw new KarteiFehler('Unbekannter Patient');
  const n = nummerPruefen(kunde.nummer);
  await lexwareNummerFrei(db, n, patientId);
  const { rows } = await db.query<{ vorname: string; nachname: string }>(
    'UPDATE patient SET lexware_kundennummer = $2, lexware_kontakt_id = $3, geaendert_am = now() WHERE id = $1 RETURNING vorname, nachname',
    [patientId, n, text(kunde.kontaktId)],
  );
  if (!rows.length) throw new KarteiFehler('Unbekannter Patient');
  await protokolliere(db, { actor: wer, action: 'patient_lexware_verknuepft', objectType: 'patient', objectId: patientId });
  return { name: `${rows[0]!.vorname} ${rows[0]!.nachname}`.trim() };
}

/** Verknüpfung lösen – der Kunde steht danach wieder unter „neu“ oder „vermutet“ */
export async function lexwareLoesen(db: Db, patientId: string, wer: string): Promise<{ nummer: string | null }> {
  if (!istId(patientId)) throw new KarteiFehler('Unbekannter Patient');
  const { rows } = await db.query<{ nummer: string | null }>('SELECT lexware_kundennummer AS nummer FROM patient WHERE id = $1', [patientId]);
  if (!rows.length) throw new KarteiFehler('Unbekannter Patient');
  await db.query('UPDATE patient SET lexware_kundennummer = NULL, lexware_kontakt_id = NULL, geaendert_am = now() WHERE id = $1', [patientId]);
  await protokolliere(db, { actor: wer, action: 'patient_lexware_geloest', objectType: 'patient', objectId: patientId });
  return { nummer: rows[0]!.nummer };
}
