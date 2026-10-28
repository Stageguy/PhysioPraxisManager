/**
 * Nachrichten an Patienten aus der Kartei (W90, W91): E-Mail-Entwürfe mit Anhängen im Praxispostfach
 * (Lilli sendet in Outlook – Leitplanke 3), WhatsApp per Click-to-Chat oder Cloud API, eingehende
 * WhatsApp-Nachrichten in den Kontaktverlauf. Jede Nachricht hinterlässt einen Eintrag im Verlauf;
 * Inhalte liegen verschlüsselt (Tresor), nie Gesundheitsdaten im Text (Vorlagen + Begriffsprüfung).
 */
import type { Db } from '../db/index.ts';
import { protokolliere } from '../db/index.ts';
import { GraphError, type GraphClient } from '../graph.ts';
import { anhangKoerper, entwurfAnlegen, entwurfKoerper, pruefeMail, type Anhang, type NeueMail } from '../mail/entwurf.ts';
import { gesundheitsbegriffe, rendern, VORLAGEN, vorlage, VorlageFehler, type Kanal } from '../nachrichten/vorlagen.ts';
import type { Tresor } from '../tresor.ts';
import { pruefeEmpfaenger, SchrankeVerletzt } from '../umgebung.ts';
import { waLink, WhatsAppFehler, type EingehendeNachricht, type WhatsAppCloud } from '../whatsapp/schnittstelle.ts';
import { KarteiFehler, patientLesen, rechnungen, termine, type Patient, type RechnungKurz, type TerminKurz } from './patienten.ts';
import { rechnungLesen, rechnungPdf, rechnungStatus } from './rechnungen.ts';
import { bankverbindung, epcText, girocodePng } from '../rechnungen/girocode.ts';

export interface DokumentKurz {
  id: string;
  titel: string;
  mime: string;
  groesse: number;
  art: string;
  datum: string | null;
}

/** Unterlagen der Akte, die man einer Mail anhängen kann (Titel verschlüsselt, Inhalt bleibt in der DB) */
export async function dokumente(db: Db, t: Tresor, patientId: string): Promise<DokumentKurz[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    'SELECT id::text, titel, mime, groesse, art::text, dokument_datum FROM dokument WHERE patient_id = $1 AND ungueltig_am IS NULL ORDER BY dokument_datum DESC NULLS LAST, id DESC LIMIT 50', [patientId],
  );
  return rows.map((r) => ({
    id: String(r.id), titel: t.entschluesselnText(r.titel as Uint8Array, 'dokument.titel') ?? 'Dokument', mime: String(r.mime), groesse: Number(r.groesse), art: String(r.art),
    datum: r.dokument_datum ? String(r.dokument_datum).slice(0, 10) : null,
  }));
}

/**
 * Klick 2 (W100/A28): die Rechnung versenden – per Mail sofort aus dem Praxispostfach mit dem PDF aus Lexware
 * (die bewusste Ausnahme von Leitplanke 3, E30a), per Post als Vermerk mit Druckhinweis. Schranke 2: Test nur an Testadressen.
 */
export async function rechnungSenden(
  db: Db, t: Tresor, graph: Pick<GraphClient, 'postOhneAntwort'> | undefined, patientId: string, rechnungId: string, d: { art?: string }, wer: string,
): Promise<{ meldung: string; art: string }> {
  const patient = await patientLesen(db, t, patientId);
  if (!patient) throw new KarteiFehler('Unbekannter Patient');
  const r = await rechnungLesen(db, patientId, rechnungId);
  if (!r) throw new KarteiFehler('Diese Rechnung gibt es nicht');
  if (r.status !== 'in_lexware') throw new KarteiFehler(r.status === 'gesendet' || r.status === 'bezahlt' ? 'Die Rechnung ist schon versendet' : 'Versenden erst, wenn die Rechnung in Lexware ist (Nummer und PDF)');
  const art = ['email', 'post', 'beides'].includes(d.art ?? '') ? d.art! : patient.rechnungsversand;
  const kurz = (await rechnungen(db, patientId)).find((x) => x.id === rechnungId)!;
  const wege: string[] = [];
  if (art === 'email' || art === 'beides') {
    if (!graph) throw new KarteiFehler('Kein Postfach verbunden – Versand per Mail nicht möglich');
    if (!patient.email) throw new KarteiFehler('Keine Mailadresse hinterlegt – bitte Versand per Post wählen');
    const pdf = await rechnungPdf(db, t, patientId, rechnungId);
    if (!pdf) throw new KarteiFehler('Für diese Rechnung liegt noch kein PDF aus Lexware vor');
    const { betreff, text } = nachrichtText('email', 'rechnung_info', patient, { rechnung: kurz });
    const mail: NeueMail = { an: [patient.email.normiert], betreff, text, anhaenge: [{ name: pdf.name, mime: 'application/pdf', daten: pdf.daten }] };
    // GiroCode (W102): Banking-App liest IBAN, Betrag und Rechnungsnummer – nur mit hinterlegter Bankverbindung
    const bank = await bankverbindung(db);
    if (bank && kurz.nummer && (kurz.betrag ?? 0) > 0) {
      mail.anhaenge!.push({ name: `GiroCode-${kurz.nummer}.png`, mime: 'image/png', daten: await girocodePng(epcText({ bank, betrag: kurz.betrag!, verwendungszweck: kurz.nummer })) });
      mail.text += '\n\nPS: Mit dem beigefügten GiroCode überweisen Sie per Banking-App – scannen, prüfen, bestätigen; Betrag und Rechnungsnummer sind vorbelegt.';
    }
    try {
      pruefeMail(mail);
      pruefeEmpfaenger(mail.an);
      await graph.postOhneAntwort('/me/sendMail', { message: { ...entwurfKoerper(mail), attachments: (mail.anhaenge ?? []).map(anhangKoerper) }, saveToSentItems: true });
    } catch (err) {
      if (err instanceof SchrankeVerletzt) throw new KarteiFehler(err.message);
      if (err instanceof GraphError) throw new KarteiFehler(`Postfach nicht erreichbar (${err.status}) – die Rechnung wurde nicht gesendet`);
      if (err instanceof Error && !(err instanceof KarteiFehler) && /Anhang|Mailadresse|Empfänger/.test(err.message)) throw new KarteiFehler(err.message);
      throw err;
    }
    await verlauf(db, t, patientId, { art: 'email', kontaktId: patient.email.id, terminId: null, notiz: `Rechnung ${kurz.nummer ?? rechnungId} per Mail gesendet (${pdf.name})`, quelleRef: null, wer });
    wege.push(`per Mail an ${patient.email.wert}`);
  }
  if (art === 'post' || art === 'beides') wege.push('per Post – bitte das PDF drucken');
  await rechnungStatus(db, patientId, rechnungId, 'versendet', { versandArt: art }, wer);
  await protokolliere(db, { actor: wer, action: 'rechnung_gesendet', objectType: 'patient', objectId: patientId, details: { rechnung: Number(rechnungId), art } });
  return { meldung: `Rechnung ${kurz.nummer ?? ''} versendet ${wege.join(' und ')}.`, art };
}

/** Gültige Einwilligung in WhatsApp (patient_erklaerung, nicht widerrufen, nicht abgelaufen) */
export async function whatsappEinwilligung(db: Db, patientId: string): Promise<boolean> {
  const { rows } = await db.query(
    "SELECT 1 FROM patient_erklaerung WHERE patient_id = $1 AND art = 'einwilligung_whatsapp' AND widerrufen_am IS NULL AND (gueltig_bis IS NULL OR gueltig_bis >= CURRENT_DATE) LIMIT 1", [patientId],
  );
  return rows.length > 0;
}

export interface NachrichtWerte {
  vorlage: string;
  terminId?: string;
  rechnungId?: string;
  freitext?: string;
}

/** Text einer Vorlage für diesen Patienten – rein, ohne Datenbank (für Seite und Prüfungen) */
export function nachrichtText(kanal: Kanal, code: string, p: Patient, o: { termin?: TerminKurz; rechnung?: RechnungKurz; freitext?: string } = {}): { betreff: string; text: string } {
  const v = vorlage(code);
  if (!v) throw new KarteiFehler('Unbekannte Vorlage');
  try {
    return rendern(v, kanal, { person: p, termin: o.termin?.beginn, rechnung: o.rechnung ? { nummer: o.rechnung.nummer, betrag: o.rechnung.betrag ?? 0 } : undefined, freitext: o.freitext });
  } catch (err) {
    if (err instanceof VorlageFehler) throw new KarteiFehler(err.message);
    throw err;
  }
}

export interface WhatsAppAngebot {
  code: string;
  name: string;
  /** Click-to-Chat-Link mit fertigem Text */
  link: string;
  terminId?: string;
}

/** Was die Patientenseite als WhatsApp-Knöpfe anbietet: je kommendem Termin Bestätigung und Erinnerung, dazu die allgemeinen Vorlagen */
export function whatsappAngebote(p: Patient, kommende: TerminKurz[]): WhatsAppAngebot[] {
  if (!p.whatsapp) return [];
  const an = p.whatsapp.normiert;
  const liste: WhatsAppAngebot[] = [];
  for (const termin of kommende.filter((x) => x.status === 'bestaetigt' || x.status === 'vorgeschlagen').slice(0, 3)) {
    for (const code of ['terminbestaetigung', 'terminerinnerung']) {
      liste.push({ code, name: vorlage(code)!.name, link: waLink(an, nachrichtText('whatsapp', code, p, { termin }).text), terminId: termin.id });
    }
  }
  for (const v of VORLAGEN.filter((x) => x.kanaele.includes('whatsapp') && !x.braucht)) {
    liste.push({ code: v.code, name: v.name, link: waLink(an, nachrichtText('whatsapp', v.code, p).text) });
  }
  return liste;
}

async function werte(db: Db, t: Tresor, patientId: string, d: NachrichtWerte): Promise<{ patient: Patient; termin?: TerminKurz; rechnung?: RechnungKurz }> {
  const patient = await patientLesen(db, t, patientId);
  if (!patient) throw new KarteiFehler('Unbekannter Patient');
  const termin = d.terminId ? (await termine(db, patientId)).find((x) => x.id === d.terminId) : undefined;
  if (d.terminId && !termin) throw new KarteiFehler('Unbekannter Termin');
  const rechnung = d.rechnungId ? (await rechnungen(db, patientId)).find((x) => x.id === d.rechnungId) : undefined;
  if (d.rechnungId && !rechnung) throw new KarteiFehler('Unbekannte Rechnung');
  return { patient, termin, rechnung };
}

async function verlauf(db: Db, t: Tresor, patientId: string, e: { art: 'email' | 'whatsapp'; kontaktId?: string | null; terminId?: string | null; notiz: string; quelleRef?: string | null; offen?: boolean; wer: string }): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    'INSERT INTO patient_kontaktverlauf (patient_id, kontakt_id, termin_id, art, notiz, quelle_ref, offen, erfasst_von) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id::text',
    [patientId, e.kontaktId ?? null, e.terminId ?? null, e.art, t.verschluesseln(e.notiz, 'kontaktverlauf.notiz'), e.quelleRef ?? null, e.offen ?? false, e.wer],
  );
  return rows[0]!.id;
}

/** Click-to-Chat benutzt (meldet /praxis.js): im Verlauf vermerken – der Text selbst ging über Lillis WhatsApp */
export async function whatsappVermerken(db: Db, t: Tresor, patientId: string, d: { vorlage: string; terminId?: string }, wer: string): Promise<string> {
  const v = vorlage(d.vorlage);
  if (!v) throw new KarteiFehler('Unbekannte Vorlage');
  const patient = await patientLesen(db, t, patientId);
  if (!patient) throw new KarteiFehler('Unbekannter Patient');
  const id = await verlauf(db, t, patientId, { art: 'whatsapp', kontaktId: patient.whatsapp?.id, terminId: d.terminId || null, notiz: `WhatsApp geöffnet mit Vorlage „${v.name}“ – gesendet von Lillis Handy`, wer });
  await protokolliere(db, { actor: wer, action: 'whatsapp_link', objectType: 'patient', objectId: patientId, details: { vorlage: v.code } });
  return id;
}

/** Über die Cloud API senden – nur mit Einwilligung, nur Vorlagentext ohne Gesundheitsbegriffe */
export async function whatsappSenden(db: Db, t: Tresor, cloud: WhatsAppCloud, patientId: string, d: NachrichtWerte, wer: string): Promise<string> {
  const { patient, termin, rechnung } = await werte(db, t, patientId, d);
  if (!patient.whatsapp) throw new KarteiFehler('Keine WhatsApp-Nummer hinterlegt');
  if (!(await whatsappEinwilligung(db, patientId))) throw new KarteiFehler('Keine Einwilligung in WhatsApp hinterlegt – bitte zuerst unter Erklärungen erfassen');
  const { text } = nachrichtText('whatsapp', d.vorlage, patient, { termin, rechnung, freitext: d.freitext });
  const begriffe = gesundheitsbegriffe(text);
  if (begriffe.length) throw new KarteiFehler(`Nicht per WhatsApp: der Text enthält „${begriffe.join('“, „')}“ – keine Gesundheitsangaben in Nachrichten (Leitplanke 9)`);
  let gesendet: { id: string };
  try {
    gesendet = await cloud.textSenden(patient.whatsapp.normiert, text);
  } catch (err) {
    if (err instanceof SchrankeVerletzt || err instanceof WhatsAppFehler) throw new KarteiFehler(err.message);
    throw err;
  }
  const id = await verlauf(db, t, patientId, { art: 'whatsapp', kontaktId: patient.whatsapp.id, terminId: d.terminId || null, notiz: `Gesendet (${vorlage(d.vorlage)!.name}): ${text}`, quelleRef: gesendet.id, wer });
  await protokolliere(db, { actor: wer, action: 'whatsapp_gesendet', objectType: 'patient', objectId: patientId, details: { vorlage: d.vorlage } });
  return id;
}

/** Eingehende WhatsApp-Nachricht (Webhook): dem Patienten über die Nummer zuordnen, als offener Eintrag in den Verlauf */
export async function whatsappEingang(db: Db, t: Tresor, n: EingehendeNachricht): Promise<'zugeordnet' | 'medien' | 'unbekannt'> {
  const { rows } = await db.query<{ patient_id: string; id: string }>(
    "SELECT patient_id::text, id::text FROM patient_kontakt WHERE normiert = $1 AND art IN ('whatsapp', 'mobil', 'telefon') ORDER BY (art = 'whatsapp') DESC, primaer DESC LIMIT 1", [n.von],
  );
  const k = rows[0];
  if (!k) {
    // Unbekannte Nummer: nichts speichern (Datensparsamkeit), nur zählen
    await protokolliere(db, { actor: 'whatsapp', action: 'whatsapp_unbekannt', details: { typ: n.typ } });
    return 'unbekannt';
  }
  if (n.text === null) {
    await verlauf(db, t, k.patient_id, { art: 'whatsapp', kontaktId: k.id, notiz: `${n.typ} per WhatsApp erhalten – nicht übernommen. Bitte keine Befunde oder Rezepte per WhatsApp; um ein Foto bitten wir per Mail.`, quelleRef: n.id, offen: true, wer: 'whatsapp' });
    await protokolliere(db, { actor: 'whatsapp', action: 'whatsapp_eingang', objectType: 'patient', objectId: k.patient_id, details: { typ: n.typ } });
    return 'medien';
  }
  await verlauf(db, t, k.patient_id, { art: 'whatsapp', kontaktId: k.id, notiz: `Eingegangen: ${n.text.slice(0, 2000)}`, quelleRef: n.id, offen: true, wer: 'whatsapp' });
  await protokolliere(db, { actor: 'whatsapp', action: 'whatsapp_eingang', objectType: 'patient', objectId: k.patient_id, details: { typ: 'text' } });
  return 'zugeordnet';
}

export interface MailEntwurfWerte extends NachrichtWerte {
  /** Rechnungen, deren PDF (aus Lexware) angehängt wird */
  anhangRechnungen?: string[];
  /** Dokumente der Akte, die angehängt werden */
  anhangDokumente?: string[];
}

/** E-Mail als Entwurf im Praxispostfach – mit Anhängen; Lilli sendet in Outlook. Liefert den Link in Outlook Web und Hinweise */
export async function mailEntwurf(
  db: Db, t: Tresor, graph: Pick<GraphClient, 'post'> | undefined, patientId: string, d: MailEntwurfWerte, wer: string,
): Promise<{ webLink?: string; anhaenge: number; hinweise: string[] }> {
  if (!graph) throw new KarteiFehler('Kein Postfach verbunden – der Entwurf kann nicht angelegt werden');
  const { patient, termin, rechnung } = await werte(db, t, patientId, d);
  if (!patient.email) throw new KarteiFehler('Keine Mailadresse hinterlegt');
  const { betreff, text } = nachrichtText('email', d.vorlage, patient, { termin, rechnung, freitext: d.freitext });
  const hinweise: string[] = [];
  const begriffe = gesundheitsbegriffe(text);
  if (begriffe.length) hinweise.push(`Bitte prüfen: der Text enthält „${begriffe.join('“, „')}“ – keine Gesundheitsangaben in Mails (Leitplanke 9).`);
  const anhaenge: Anhang[] = [];
  const rechnungsIds = new Set(d.anhangRechnungen ?? []);
  if (d.vorlage === 'rechnung_info' && rechnung?.pdf) rechnungsIds.add(rechnung.id);
  for (const rid of rechnungsIds) {
    const pdf = await rechnungPdf(db, t, patientId, rid);
    if (!pdf) throw new KarteiFehler('Für diese Rechnung liegt noch kein PDF aus Lexware vor');
    anhaenge.push({ name: pdf.name, mime: 'application/pdf', daten: pdf.daten });
  }
  for (const did of d.anhangDokumente ?? []) {
    const r = (await db.query<Record<string, unknown>>('SELECT titel, dateiname, mime, inhalt FROM dokument WHERE id = $1 AND patient_id = $2 AND ungueltig_am IS NULL', [did, patientId])).rows[0];
    if (!r) throw new KarteiFehler('Unbekanntes Dokument');
    const name = t.entschluesselnText(r.dateiname as Uint8Array | null, 'dokument.dateiname') ?? `${t.entschluesselnText(r.titel as Uint8Array, 'dokument.titel') ?? 'Dokument'}.bin`;
    anhaenge.push({ name, mime: String(r.mime), daten: r.inhalt as Uint8Array });
  }
  let e: { webLink?: string };
  try {
    e = await entwurfAnlegen(graph, { an: [patient.email.normiert], betreff, text, anhaenge }, { ausfuehren: true });
  } catch (err) {
    if (err instanceof SchrankeVerletzt) throw new KarteiFehler(err.message);
    if (err instanceof GraphError) throw new KarteiFehler(`Postfach nicht erreichbar (${err.status}) – der Entwurf wurde nicht angelegt`);
    if (err instanceof Error && !(err instanceof KarteiFehler) && /Anhang|Mailadresse|Empfänger/.test(err.message)) throw new KarteiFehler(err.message);
    throw err;
  }
  await verlauf(db, t, patientId, {
    art: 'email', kontaktId: patient.email.id, terminId: d.terminId || null,
    notiz: `Entwurf „${betreff}“ im Postfach – noch nicht gesendet${anhaenge.length ? `, ${anhaenge.length} Anhang${anhaenge.length > 1 ? '…' : ''}: ${anhaenge.map((a) => a.name).join(', ')}` : ''}`,
    quelleRef: e.webLink ?? null, wer,
  });
  await protokolliere(db, { actor: wer, action: 'mail_entwurf', objectType: 'patient', objectId: patientId, details: { vorlage: d.vorlage, anhaenge: anhaenge.length } });
  return { webLink: e.webLink, anhaenge: anhaenge.length, hinweise };
}
