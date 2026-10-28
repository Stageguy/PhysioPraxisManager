/**
 * Lexware-Kunden neben der Kartei (W99): jeder Kunde ist entweder **verknüpft** (ein Patient trägt seine
 * Kundennummer), **vermutet** (ein Patient hat denselben Namen) oder **neu** (noch nicht in der Kartei).
 * Geschrieben wird nur die Verknüpfung am Patienten (lexware_kundennummer, lexware_kontakt_id) –
 * Patienten entstehen weiterhin über „Neuer Patient“, vorbelegt aus der Kundenkarte.
 */
import { protokolliere, type Db } from '../db/index.ts';
import { istId, text } from '../db/werte.ts';
import type { LexwareKunde } from '../lexware/kunden.ts';
import type { NeuerKontakt } from '../lexware/rechnungen.ts';
import { telefonNormieren } from '../telefon.ts';
import type { Tresor } from '../tresor.ts';
import { adresseSpeichern, KarteiFehler, kontaktSpeichern, patientAnlegen, patientLesen, type Kontaktart, type Patient } from './patienten.ts';

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

// ── Abgleich der gemeinsamen Felder (W99b, E30b: der PPM führt, Lexware-Werte nur per Klick) ──────────────────

export type AbgleichFeld = 'anrede' | 'vorname' | 'nachname' | 'email' | 'telefon' | 'adresse';
export interface Abweichung {
  feld: AbgleichFeld;
  titel: string;
  ppm: string | null;
  lexware: string;
}

const FELD_TITEL: Record<AbgleichFeld, string> = { anrede: 'Anrede', vorname: 'Vorname', nachname: 'Nachname', email: 'E-Mail', telefon: 'Telefon', adresse: 'Rechnungsadresse' };
const glatt = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ');
const adresseText = (a: { strasse?: string | null; hausnummer?: string | null; plz?: string | null; ort?: string | null } | null | undefined) =>
  a ? glatt([[a.strasse, a.hausnummer].filter(Boolean).join(' '), [a.plz, a.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ')) : '';

/** Was in Lexware anders steht als im PPM – nur Felder, die Lexware überhaupt kennt; leere Lexware-Werte zählen nicht */
export function kundenAbweichungen(p: Patient, k: LexwareKunde): Abweichung[] {
  const liste: Abweichung[] = [];
  const pruefe = (feld: AbgleichFeld, ppm: string | null, lexware: string | null) => {
    const l = glatt(lexware);
    if (!l) return;
    const w = glatt(ppm);
    if (w.toLowerCase() !== l.toLowerCase()) liste.push({ feld, titel: FELD_TITEL[feld], ppm: w || null, lexware: l });
  };
  if (k.art === 'person' || k.vorname) {
    pruefe('anrede', p.anrede, k.anrede);
    pruefe('vorname', p.vorname, k.vorname);
    pruefe('nachname', p.nachname, k.nachname);
  }
  pruefe('email', p.email?.normiert ?? null, k.email?.toLowerCase() ?? null);
  if (k.telefon) {
    const norm = telefonNormieren(k.telefon);
    const vorhanden = p.kontakte.some((x) => ['mobil', 'telefon', 'whatsapp'].includes(x.art) && x.normiert === norm);
    if (!vorhanden) liste.push({ feld: 'telefon', titel: FELD_TITEL.telefon, ppm: p.telefon?.wert ?? null, lexware: k.telefon });
  }
  pruefe('adresse', adresseText(p.adressen.find((a) => a.rechnungsadresse)), adresseText(k.adresse));
  return liste;
}

/** Ein Lexware-Wert wird übernommen – gezielt, auf Klick; das Protokoll vermerkt nur das Feld */
export async function feldUebernehmen(db: Db, t: Tresor, patientId: string, k: LexwareKunde, feld: string, wer: string): Promise<string> {
  const p = await patientLesen(db, t, patientId);
  if (!p) throw new KarteiFehler('Unbekannter Patient');
  const a = kundenAbweichungen(p, k).find((x) => x.feld === feld);
  if (!a) throw new KarteiFehler('Dieses Feld weicht nicht (mehr) ab');
  switch (a.feld) {
    case 'anrede': case 'vorname': case 'nachname':
      await db.query(`UPDATE patient SET ${a.feld} = $2, geaendert_am = now() WHERE id = $1`, [patientId, a.lexware]);
      break;
    case 'email':
      await kontaktSpeichern(db, patientId, { art: 'email', wert: a.lexware, primaer: true, bezeichnung: 'aus Lexware' }, wer);
      break;
    case 'telefon': {
      const z = a.lexware.replace(/[^\d+]/g, '');
      await kontaktSpeichern(db, patientId, { art: /^(\+49|0049|0)1[5-7]/.test(z) ? 'mobil' : 'telefon', wert: a.lexware, primaer: !p.telefon, bezeichnung: 'aus Lexware' }, wer);
      break;
    }
    case 'adresse': {
      const r = p.adressen.find((x) => x.rechnungsadresse);
      const kA = k.adresse!;
      await adresseSpeichern(db, patientId, { adresseId: r?.id, bezeichnung: r?.bezeichnung ?? 'Zuhause', zusatz: kA.zusatz, strasse: kA.strasse, hausnummer: kA.hausnummer, plz: kA.plz, ort: kA.ort, land: kA.land, rechnungsadresse: true }, wer);
      break;
    }
  }
  await protokolliere(db, { actor: wer, action: 'patient_lexware_feld', objectType: 'patient', objectId: patientId, details: { feld: a.feld } });
  return a.titel;
}

/** Mehrere gesichtete Kunden auf einen Klick als Patienten anlegen (Sammelübernahme) */
export async function patientenAusKunden(db: Db, t: Tresor, kunden: LexwareKunde[], nummern: string[], wer: string): Promise<{ angelegt: number; uebersprungen: string[] }> {
  const e = { angelegt: 0, uebersprungen: [] as string[] };
  for (const nummer of [...new Set(nummern.map((n) => n.trim()).filter(Boolean))]) {
    const k = kunden.find((x) => x.nummer === nummer);
    if (!k) { e.uebersprungen.push(`${nummer} (nicht in Lexware)`); continue; }
    if (!k.vorname || !k.nachname) { e.uebersprungen.push(`${nummer} (Firma ohne Personenname – bitte einzeln anlegen)`); continue; }
    try { await lexwareNummerFrei(db, nummer); } catch { e.uebersprungen.push(`${nummer} (schon verknüpft)`); continue; }
    const kontakte: { art: Kontaktart; wert: string }[] = [];
    if (k.email) kontakte.push({ art: 'email', wert: k.email });
    if (k.telefon) kontakte.push({ art: /^(\+49|0049|0)1[5-7]/.test(k.telefon.replace(/[^\d+]/g, '')) ? 'mobil' : 'telefon', wert: k.telefon });
    const id = await patientAnlegen(db, t, {
      anrede: k.anrede ?? undefined, vorname: k.vorname, nachname: k.nachname, kontakte,
      adresse: k.adresse ? { bezeichnung: 'Zuhause', zusatz: k.adresse.zusatz, strasse: k.adresse.strasse, hausnummer: k.adresse.hausnummer, plz: k.adresse.plz, ort: k.adresse.ort, land: k.adresse.land } : undefined,
    }, wer);
    await lexwareVerknuepfen(db, id, { nummer, kontaktId: k.id }, wer);
    e.angelegt++;
  }
  return e;
}

/** Den Patienten als Kunden in Lexware anlegen (Rückweg Kartei → Lexware, W99b) – nur die Felder der Rechnung */
export async function kundeInLexwareAnlegen(db: Db, t: Tresor, lex: { kontaktAnlegen(k: NeuerKontakt): Promise<{ id: string; nummer: string }> }, patientId: string, wer: string): Promise<{ nummer: string }> {
  const p = await patientLesen(db, t, patientId);
  if (!p) throw new KarteiFehler('Unbekannter Patient');
  if (p.lexwareKundennummer) throw new KarteiFehler(`Der Patient ist schon Lexware-Kunde ${p.lexwareKundennummer}`);
  const r = p.adressen.find((a) => a.rechnungsadresse);
  const neu = await lex.kontaktAnlegen({ anrede: p.anrede, vorname: p.vorname, nachname: p.nachname, strasse: r ? [r.strasse, r.hausnummer].filter(Boolean).join(' ') : null, plz: r?.plz, ort: r?.ort, land: r?.land, email: p.email?.normiert });
  if (!neu.nummer) throw new KarteiFehler('Lexware hat den Kunden angelegt, aber keine Kundennummer geliefert – bitte unter „Aus Lexware“ zuordnen');
  await lexwareVerknuepfen(db, patientId, { nummer: neu.nummer, kontaktId: neu.id }, wer);
  return { nummer: neu.nummer };
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
