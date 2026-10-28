/**
 * Rechnungen aus Lexware in die Kartei übernehmen (W103) – für Patienten, die über die Lexware-Kontakt-ID verknüpft
 * sind (W99). Neu: Kachel mit quelle = 'lexware' (Nummer, Datum, Fälligkeit, Betrag, Status, Datei im Tresor).
 * Bekannt (gleiche Lexware-ID, oder eine PPM-Rechnung mit derselben Nummer): Stand übernehmen – Status, Betrag,
 * Zahldatum, Datei nachholen. Es wird nichts gelöscht; was nur der PPM kennt (Positionen, Rezept, Fall), bleibt (§4d).
 */
import { protokolliere, type Db } from '../db/index.ts';
import { datumText } from '../format.ts';
import type { Tresor } from '../tresor.ts';
import type { LexwareRechnungen } from '../lexware/rechnungen.ts';
import type { LexwareKunden } from '../lexware/kunden.ts';
import type { Zahlung } from '../lexware/client.ts';
import { nurProduktion, SchrankeVerletzt } from '../umgebung.ts';
import { ART_TEXT, lexwareStandUebernehmen, rechnungLesen, rechnungStatus, type RechnungStatus } from './rechnungen.ts';
import { lexwareVerknuepfen } from './lexware-kunden.ts';
import { KarteiFehler, patientLesen } from './patienten.ts';

export interface Uebernahme {
  /** In Lexware gefunden (im gewählten Ausschnitt) */
  gefunden: number;
  neu: number;
  aktualisiert: number;
  unveraendert: number;
  /** Rechnungen, deren Lexware-Kontakt keinem Patienten zugeordnet ist (oder ohne Kontakt) */
  ohnePatient: number;
  /** Dieselbe Nummer bzw. Lexware-ID steht schon bei einem anderen Patienten */
  konflikt: number;
  /** Festgeschrieben, aber Lexware liefert keine Datei */
  ohneDatei: number;
  /** Dateien, die in dieser Runde geholt wurden */
  dateien: number;
  /** Rechnungen, die in dieser Runde auf „bezahlt“ gegangen sind (A29) */
  bezahlt: number;
}

const ZAHLUNGSART: Record<string, string> = { manualPayment: 'manuell erfasst', partPaymentFinancialTransaction: 'Bankumsatz', partPaymentCashBox: 'Kasse', cashDiscount: 'Skonto', dunningCosts: 'Mahnkosten', irrecoverableReceivable: 'uneinbringlich' };

/** Zahlungsposten aus Lexware an der Rechnung festhalten – bei jedem Abgleich neu (Quelle lexware) */
export async function zahlungenSpeichern(db: Db, rechnungId: string, posten: NonNullable<Zahlung['paymentItems']>): Promise<void> {
  await db.query("DELETE FROM rechnung_zahlung WHERE rechnung_id = $1 AND quelle = 'lexware'", [rechnungId]);
  for (const p of posten) {
    if (!Number.isFinite(p.amount)) continue;
    await db.query('INSERT INTO rechnung_zahlung (rechnung_id, datum, betrag, art) VALUES ($1, $2, $3, $4)', [rechnungId, tagVon(p.postingDate), p.amount, ZAHLUNGSART[p.paymentItemType] ?? p.paymentItemType]);
  }
}

/** Lexware-Status → Kachelstatus: offen heißt hier „versendet“ (vor dem PPM verschickt), bezahlt, storniert, Entwurf */
export const statusAusLexware = (s: string): RechnungStatus =>
  s === 'paid' || s === 'paidoff' ? 'bezahlt' : s === 'voided' ? 'storniert' : s === 'draft' ? 'entwurf' : 'gesendet';

const iso = (s: string | undefined | null): string | null => (s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : null);
const tagVon = (s: string | undefined | null): string | null => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);

/** Patient hat eine Kundennummer, aber noch keine Kontakt-ID (von Hand eingetragen): aus der Kundenliste nachtragen */
export async function kontaktIdNachtragen(db: Db, kunden: LexwareKunden | undefined, patientId: string): Promise<string | null> {
  const p = (await db.query<{ kontakt: string | null; nummer: string | null }>('SELECT lexware_kontakt_id AS kontakt, lexware_kundennummer AS nummer FROM patient WHERE id = $1', [patientId])).rows[0];
  if (!p) throw new KarteiFehler('Unbekannter Patient');
  if (p.kontakt) return p.kontakt;
  if (!p.nummer || !kunden) return null;
  const kunde = (await kunden.alle()).kunden.find((k) => k.nummer === p.nummer);
  if (!kunde) return null;
  await db.query('UPDATE patient SET lexware_kontakt_id = $2, geaendert_am = now() WHERE id = $1', [patientId, kunde.id]);
  return kunde.id;
}

export async function rechnungenUebernehmen(
  db: Db, t: Tresor, lex: LexwareRechnungen, o: { patientId?: string; wer: string; probelauf?: boolean },
): Promise<Uebernahme> {
  const zeilen = (await db.query<{ id: string; kontakt: string }>(
    `SELECT id::text, lexware_kontakt_id AS kontakt FROM patient WHERE lexware_kontakt_id IS NOT NULL${o.patientId ? ' AND id = $1' : ''}`, o.patientId ? [o.patientId] : [],
  )).rows;
  if (o.patientId && !zeilen.length) throw new KarteiFehler('Dieser Patient ist mit keinem Lexware-Kunden verknüpft – zuerst unter „Aus Lexware“ zuordnen');
  const patientZu = new Map(zeilen.map((z) => [z.kontakt, z.id]));
  const e: Uebernahme = { gefunden: 0, neu: 0, aktualisiert: 0, unveraendert: 0, ohnePatient: 0, konflikt: 0, ohneDatei: 0, dateien: 0, bezahlt: 0 };
  for await (const b of lex.belege({ kontaktId: o.patientId ? zeilen[0]!.kontakt : undefined })) {
    e.gefunden++;
    const patientId = b.contactId ? patientZu.get(b.contactId) : undefined;
    if (!patientId) { e.ohnePatient++; continue; }
    const bekannt = (await db.query<{ id: string; patient_id: string; pdf: boolean; geaendert: string | null; status: string; zahlungen: string }>(
      `SELECT id::text, patient_id::text, (lexware_pdf IS NOT NULL) AS pdf, lexware_geaendert_am AS geaendert, status::text,
         (SELECT count(*)::text FROM rechnung_zahlung z WHERE z.rechnung_id = rechnung.id) AS zahlungen FROM rechnung
       WHERE lexware_invoice_id = $1 OR ($2::text IS NOT NULL AND nummer = $2) ORDER BY (lexware_invoice_id = $1) DESC LIMIT 1`, [b.id, b.voucherNumber ?? null],
    )).rows[0];
    if (bekannt && bekannt.patient_id !== patientId) { e.konflikt++; continue; }
    const geaendert = iso(b.updatedDate);
    if (bekannt?.pdf && bekannt.geaendert && geaendert && iso(bekannt.geaendert) === geaendert) {
      e.unveraendert++;
      // Zahlungsposten nachholen, wenn eine bezahlte Rechnung noch keine hat (ältere Übernahmen vor A29)
      if (!o.probelauf && bekannt.zahlungen === '0' && (b.voucherStatus === 'paid' || b.voucherStatus === 'paidoff')) {
        try { await zahlungenSpeichern(db, bekannt.id, (await lex.zahlung(b.id)).paymentItems ?? []); } catch (err) { console.warn(`Lexware-Zahlung ${b.id}: ${(err as Error).message.slice(0, 120)}`); }
      }
      continue;
    }
    if (o.probelauf) { if (bekannt) e.aktualisiert++; else e.neu++; continue; }
    // Zahldatum und Zahlungsposten nur bei bezahlten Rechnungen – kostet eine Anfrage mehr
    let bezahltAm: string | undefined;
    let posten: NonNullable<Zahlung['paymentItems']> = [];
    const istBezahlt = b.voucherStatus === 'paid' || b.voucherStatus === 'paidoff';
    if (istBezahlt) {
      try {
        const z = await lex.zahlung(b.id);
        bezahltAm = tagVon(z.paidDate) ?? undefined;
        posten = z.paymentItems ?? [];
      } catch (err) { console.warn(`Lexware-Zahlung ${b.id}: ${(err as Error).message.slice(0, 120)}`); }
    }
    const datei = bekannt?.pdf || b.voucherStatus === 'draft' ? undefined : await lex.datei(b.id);
    if (datei) e.dateien++;
    else if (!bekannt?.pdf && b.voucherStatus !== 'draft') e.ohneDatei++;
    let rechnungId: string;
    if (bekannt) {
      await lexwareStandUebernehmen(db, t, bekannt.id, {
        invoiceId: b.id, nummer: b.voucherNumber, status: b.voucherStatus, betrag: b.totalAmount, bezahltAm, pdf: datei?.daten, pdfName: datei?.name,
        erstelltAm: iso(b.createdDate) ?? undefined, geaendertAm: geaendert ?? undefined,
      }, o.wer);
      e.aktualisiert++;
      if (istBezahlt && bekannt.status !== 'bezahlt' && bekannt.status !== 'storniert') e.bezahlt++;
      rechnungId = bekannt.id;
    } else {
      const storniert = b.voucherStatus === 'voided';
      rechnungId = (await db.query<{ id: string }>(
        `INSERT INTO rechnung (patient_id, art, steuerklasse, quelle, empfaenger, datum, faellig_am, nummer, betrag, netto, ust, ust_satz, kleinunternehmer, status, bezahlt_am, storniert_am, storno_grund,
           lexware_invoice_id, lexware_status, lexware_betrag, lexware_geprueft_am, lexware_pdf, lexware_pdf_am, lexware_pdf_name, lexware_erstellt_am, lexware_geaendert_am, erstellt_von)
         VALUES ($1, 'einzel', NULL, 'lexware', $2, $3, $4, $5, $6, $6, 0, 0, true, $7, $8, $9, $10, $11, $12, $6, now(), $13, CASE WHEN $13::bytea IS NULL THEN NULL ELSE now() END, $14, $15, $16, $17) RETURNING id::text`,
        [patientId, JSON.stringify({ name: b.contactName ?? '' }), tagVon(b.voucherDate), tagVon(b.dueDate), b.voucherNumber ?? null, b.totalAmount ?? 0, statusAusLexware(b.voucherStatus),
          bezahltAm ?? null, storniert ? (geaendert?.slice(0, 10) ?? tagVon(b.voucherDate)) : null, storniert ? 'in Lexware storniert' : null,
          b.id, b.voucherStatus, datei ? t.verschluesseln(datei.daten, 'rechnung.lexware_pdf') : null, datei?.name ?? null, iso(b.createdDate), geaendert, o.wer],
      )).rows[0]!.id;
      e.neu++;
      if (istBezahlt) e.bezahlt++;
    }
    if (istBezahlt) await zahlungenSpeichern(db, rechnungId, posten);
  }
  if (!o.probelauf) await protokolliere(db, { actor: o.wer, action: 'rechnung_lexware_import', objectType: 'patient', objectId: o.patientId ?? '0', details: { ...e } });
  return e;
}

/** Der Empfänger der Rechnung ist der Patient selbst (sonst eine Bezugsperson – eigener Lexware-Kontakt) */
const istPatient = (name: string, p: { vorname: string; nachname: string }): boolean => {
  const n = name.toLowerCase();
  return n.includes(p.vorname.toLowerCase()) && n.includes(p.nachname.toLowerCase());
};

/**
 * Klick 1 (W100/A28): Rechnung nach Lexware – fertigstellen, Kontakt sicherstellen, Rechnung festgeschrieben anlegen,
 * Nummer und PDF zurück in die Kartei. Schreibt in Lexware nur in der Produktion (Schranke 4); die Testumgebung hat die Attrappe.
 */
export async function rechnungNachLexware(
  db: Db, t: Tresor, lex: LexwareRechnungen, patientId: string, rechnungId: string, wer: string,
): Promise<{ nummer: string; kontaktNeu: boolean }> {
  if (!lex.attrappe) nurProduktion('Rechnung nach Lexware');
  let r = await rechnungLesen(db, patientId, rechnungId);
  if (!r) throw new KarteiFehler('Diese Rechnung gibt es nicht');
  if (r.quelle === 'lexware') throw new KarteiFehler('Diese Rechnung kommt schon aus Lexware');
  if (!['entwurf', 'freigegeben'].includes(r.status)) throw new KarteiFehler('Die Rechnung ist schon in Lexware');
  if (r.status === 'entwurf') {
    await rechnungStatus(db, patientId, rechnungId, 'fertig', {}, wer);
    r = (await rechnungLesen(db, patientId, rechnungId))!;
  }
  if (!r.positionen.length) throw new KarteiFehler('Die Rechnung hat noch keine Position');
  if (r.betrag <= 0) throw new KarteiFehler('Die Rechnung hat keinen Betrag');
  const patient = await patientLesen(db, t, patientId);
  if (!patient) throw new KarteiFehler('Unbekannter Patient');
  // Lexware-Kontakt: der Patient (verknüpft über W99 oder jetzt angelegt) oder die Bezugsperson als Rechnungsempfänger
  const eigener = istPatient(r.empfaenger.name, patient);
  let kontaktId = eigener ? (await db.query<{ k: string | null }>('SELECT lexware_kontakt_id AS k FROM patient WHERE id = $1', [patientId])).rows[0]?.k ?? null : null;
  let kontaktNeu = false;
  if (!kontaktId) {
    const e = r.empfaenger;
    const neu = await lex.kontaktAnlegen(eigener
      ? { anrede: patient.anrede, vorname: patient.vorname, nachname: patient.nachname, strasse: e.strasse, plz: e.plz, ort: e.ort, land: e.land, email: patient.email?.normiert }
      : { nachname: e.name, strasse: e.strasse, plz: e.plz, ort: e.ort, land: e.land });
    kontaktId = neu.id;
    kontaktNeu = true;
    if (eigener && neu.nummer) {
      try { await lexwareVerknuepfen(db, patientId, { nummer: neu.nummer, kontaktId: neu.id }, wer); } catch (err) { if (!(err instanceof KarteiFehler)) throw err; }
    }
  }
  const neu = await lex.rechnungAnlegen({
    kontaktId, datum: r.datum ?? new Date().toISOString().slice(0, 10), zeitraumVon: r.zeitraumVon, zeitraumBis: r.zeitraumBis, titel: ART_TEXT[r.art] ?? 'Rechnung',
    bemerkung: r.bausteine.map((b) => b.text.trim()).filter(Boolean).join('\n\n'), ustSatz: r.ustSatz,
    positionen: r.positionen.map((p) => ({ name: p.nummer ? `${p.bezeichnung} (${p.nummer})` : p.bezeichnung, beschreibung: p.datum ? `Behandlung am ${datumText(p.datum)}` : undefined, anzahl: p.anzahl, einzelpreis: p.einzelpreis })),
  });
  const datei = await lex.datei(neu.id);
  try {
    await lexwareStandUebernehmen(db, t, rechnungId, { invoiceId: neu.id, nummer: neu.nummer, status: 'open', betrag: r.betrag, pdf: datei?.daten, pdfName: datei?.name, erstelltAm: neu.erstelltAm, geaendertAm: neu.geaendertAm }, wer);
  } catch (err) {
    // Die Nummer aus Lexware steht schon an einer anderen Rechnung der Kartei: Lexware-ID trotzdem festhalten, Abweichung melden
    if ((err as { code?: string }).code !== '23505') throw err;
    await db.query("UPDATE rechnung SET lexware_invoice_id = $2, lexware_status = 'open', lexware_abweichung = $3, geaendert_am = now() WHERE id = $1", [rechnungId, neu.id, `Lexware hat die Nummer ${neu.nummer} vergeben, die in der Kartei schon an einer anderen Rechnung steht`]);
    throw new KarteiFehler(`Lexware hat die Rechnung angelegt (${neu.nummer}), aber diese Nummer trägt hier schon eine andere Rechnung – bitte die andere prüfen; die Lexware-ID ist vermerkt`);
  }
  await db.query('UPDATE rechnung SET lexware_kontakt_id = $2, faellig_am = COALESCE($3::date, faellig_am), geaendert_am = now() WHERE id = $1', [rechnungId, kontaktId, neu.faellig]);
  await protokolliere(db, { actor: wer, action: 'rechnung_nach_lexware', objectType: 'patient', objectId: patientId, details: { rechnung: Number(rechnungId), kontaktNeu, pdf: Boolean(datei) } });
  return { nummer: neu.nummer, kontaktNeu };
}

export { SchrankeVerletzt };

export const uebernahmeText = (e: Uebernahme): string =>
  `${e.gefunden} Rechnung${e.gefunden === 1 ? '' : 'en'} in Lexware – ${e.neu} neu, ${e.aktualisiert} aktualisiert, ${e.unveraendert} unverändert${e.bezahlt ? `, ${e.bezahlt} jetzt bezahlt` : ''}${e.ohnePatient ? `, ${e.ohnePatient} ohne verknüpften Patienten` : ''}${e.konflikt ? `, ${e.konflikt} mit Nummernkonflikt` : ''}${e.ohneDatei ? `, ${e.ohneDatei} ohne Datei` : ''}${e.dateien ? ` · ${e.dateien} Datei${e.dateien === 1 ? '' : 'en'} in den Tresor gelegt` : ''}.`;
