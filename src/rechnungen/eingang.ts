/**
 * Rechnungseingang (Prompt 4): Lieferantenrechnungen aus dem Praxispostfach erkennen, im
 * OneDrive-Büro-Ordner ablegen und zur Freigabe durch Lilli vormerken.
 *
 * Quelle: der Outlook-Ordner `mailordner` (per Outlook-Regel befüllt) über eine Delta-Abfrage –
 * gibt es ihn nicht, der Posteingang mit Anhängen ab `seit`.
 *
 * Je Mail:
 * - nur PDF-Dateianhänge; eingebettete Bilder, Links, angehängte Mails und andere Dateien bleiben
 * - Klassifikation regelbasiert (klassifikation.ts); der PDF-Text bleibt im Arbeitsspeicher
 * - Patientenpost: nichts wird abgelegt oder gespeichert, die Mail bekommt nur die Kategorie
 *   „Prüfen – Patient“
 * - Rechnung: OneDrive `<ziel>/JJJJ/MM/<datum>_<lieferant>_<sha8>.pdf`, Dubletten über sha256,
 *   Status „wartet_freigabe“, Protokoll
 * - unklar: nur vermerkt, Kategorie „Prüfen – unklar“ – Lilli schaut es an
 * - Mail mit Rechnung und ohne Unklares: Kategorie „Rechnung: eingegangen“, Verschieben nach
 *   `verarbeitet` (nie löschen)
 *
 * Ohne `ausfuehren`: liest nur – kein Upload, kein Ordner, keine Kategorie, kein Datenbankeintrag.
 * Ein Fehler bei einer Mail lässt sie unmarkiert; der nächste Lauf versucht es erneut.
 */
import { createHash } from 'node:crypto';
import { protokolliere, type Db } from '../db/index.ts';
import { laufwerkPfad, ordnerSicherstellen, uploadFile } from '../drive.ts';
import { zielOrdner, type RechnungsEinstellungen } from '../einstellungen.ts';
import type { GraphClient } from '../graph.ts';
import { mailOrdnerFinden, mailOrdnerSicherstellen } from '../mail/ordner.ts';
import { berlinMitternachtUtc, datumBerlin } from '../zeit.ts';
import {
  ablageName,
  betreffMitPatientenbezug,
  domainVon,
  klassifiziere,
  lieferantName,
  lieferantZu,
  type Klasse,
} from './klassifikation.ts';
import { kopfdaten, type Kopfdaten } from './kopfdaten.ts';
import { istPdf, pdfText } from './pdf.ts';
import { aufStufe, KATEGORIEN } from '../mail/kategorien.ts';

export type EingangGraph = Pick<GraphClient, 'get' | 'find' | 'paginate' | 'patch' | 'post' | 'getBytes' | 'putBytes'>;

/** Unveränderliche Kennungen: eine Mail behält ihre ID, auch wenn sie verschoben wird */
const PREFER = { Prefer: 'IdType="ImmutableId", odata.maxpagesize=50' };
const ACTOR = 'system:rechnungseingang';
const FELDER = 'id,subject,receivedDateTime,categories,from,hasAttachments,internetMessageId';
const MAX_BYTES = 25 * 1024 * 1024;

export interface Nachricht {
  id: string;
  subject?: string;
  receivedDateTime: string;
  categories?: string[];
  from?: { emailAddress?: { address?: string; name?: string } };
  hasAttachments?: boolean;
  internetMessageId?: string;
  '@removed'?: unknown;
}

interface Anhang {
  '@odata.type': string;
  id: string;
  name?: string;
  contentType?: string;
  size: number;
  isInline: boolean;
}

interface DeltaSeite {
  value: Nachricht[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}

export interface Abgelegt {
  lieferant: string;
  pfad: string;
  geplant: boolean;
}

export interface Bericht {
  quelle: 'rechnungsordner' | 'posteingang' | 'uebernahme';
  /** Altbestand: gleich als bezahlt ins Archiv */
  archiviert: number;
  mails: number;
  rechnungen: number;
  duplikate: number;
  unklar: number;
  patient: number;
  /** Eigene Ausgangsrechnungen (eigeneAbsender) – übersprungen, nichts gelesen */
  eigene: number;
  keineRechnung: number;
  /** Anhänge, die keine PDF-Dateien sind (Bilder, Office, angehängte Mails) */
  ignoriert: number;
  /** Anhänge, die ein früherer Lauf schon bearbeitet hat */
  bekannt: number;
  fehler: number;
  verschoben: number;
  /** Nur Lieferantenrechnungen – nie Patientenpost */
  abgelegt: Abgelegt[];
}

export interface Lauf {
  ausfuehren: boolean;
  /**
   * Übernahme (Migration): diese Mails statt Rechnungsordner bzw. Posteingang – etwa alle Ordner
   * eines Zeitraums. Unklares und Patientenpost werden dann nur gezählt, nicht markiert und nicht
   * gespeichert (sonst landete der ganze Altbestand im Fach „Bitte anschauen“).
   */
  nachrichten?: AsyncIterable<Nachricht>;
  /**
   * Altbestand: Rechnungen aus Mails bis zu diesem Tag (JJJJ-MM-TT) hat Lilli als bezahlt
   * bestätigt – sie kommen gleich mit „Rechnung: bezahlt“ ins Exchange-Archiv.
   */
  altbestandBezahltBis?: string;
  /** Mit `ausfuehren` Pflicht; im Probelauf optional (dann ohne Dublettenprüfung) */
  db?: Db;
  hoechstens?: number;
  /** Für Prüfungen austauschbar */
  textAus?: (bytes: Uint8Array) => Promise<string>;
}

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

async function bekannterAnhang(db: Db | undefined, mailId: string, anhangId: string): Promise<{ klasse: Klasse } | undefined> {
  if (!db) return undefined;
  const { rows } = await db.query<{ klasse: Klasse }>(
    'SELECT klasse FROM inbound_document WHERE graph_message_id = $1 AND attachment_id = $2',
    [mailId, anhangId],
  );
  return rows[0];
}

async function rechnungMitHash(db: Db | undefined, hash: string): Promise<string | undefined> {
  if (!db) return undefined;
  const { rows } = await db.query<{ id: string }>(
    "SELECT id::text FROM inbound_document WHERE sha256 = $1 AND klasse = 'rechnung'",
    [hash],
  );
  return rows[0]?.id;
}

interface Eintrag {
  mail: Nachricht;
  anhang: Anhang;
  hash: string;
  klasse: Klasse;
  lieferant?: string;
  onedriveItemId?: string;
  onedrivePfad?: string;
  onedriveWebUrl?: string;
  status: 'wartet_freigabe' | 'klassifiziert';
  /** Inhalt – nur bei Rechnungen, nur bis zum Upload */
  bytes?: Uint8Array;
  /** Nur bei Rechnungen: Schlüssel für die Zuordnung zu Lexware */
  kopf?: Kopfdaten;
  /** Altbestand: gilt als bezahlt */
  bezahlt?: boolean;
}

async function eintragen(db: Db, e: Eintrag): Promise<string | undefined> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO inbound_document (graph_message_id, internet_message_id, attachment_id, received_at, sender_domain,
       subject_hash, attachment_name, sha256, size, klasse, lieferant, onedrive_item_id, onedrive_path, status,
       rechnungsnummer, betrag, rechnungsdatum, zahlstatus_quelle, archiviert_at,
       absender_name, absender_adresse, onedrive_web_url, netto, ust_betrag, ust_satz)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
     ON CONFLICT (graph_message_id, attachment_id) DO NOTHING
     RETURNING id::text`,
    [
      e.mail.id,
      e.mail.internetMessageId ?? null,
      e.anhang.id,
      e.mail.receivedDateTime,
      domainVon(e.mail.from?.emailAddress?.address ?? ''),
      sha256(new TextEncoder().encode(e.mail.subject ?? '')),
      // Dateiname nur bei Rechnungen – sonst kann er einen Patientennamen tragen
      e.klasse === 'rechnung' ? (e.anhang.name ?? null) : null,
      e.hash,
      e.anhang.size,
      e.klasse,
      e.lieferant ?? null,
      e.onedriveItemId ?? null,
      e.onedrivePfad ?? null,
      e.bezahlt ? 'bezahlt' : e.status,
      e.kopf?.rechnungsnummer ?? null,
      e.kopf?.betrag ?? null,
      e.kopf?.rechnungsdatum ?? null,
      e.bezahlt ? 'altbestand' : null,
      e.bezahlt ? new Date().toISOString() : null,
      // Absender nur bei Lieferantenrechnungen – Name und Adresse eines Patienten gehören nicht hierher
      e.klasse === 'rechnung' ? (e.mail.from?.emailAddress?.name ?? null) : null,
      e.klasse === 'rechnung' ? (e.mail.from?.emailAddress?.address ?? null) : null,
      e.onedriveWebUrl ?? null,
      e.kopf?.netto ?? null,
      e.kopf?.ust ?? null,
      e.kopf?.ustSatz ?? null,
    ],
  );
  return rows[0]?.id;
}

/** Mails aus dem Rechnungsordner (Delta) oder ersatzweise aus dem Posteingang */
async function* quelle(
  graph: EingangGraph,
  einst: RechnungsEinstellungen,
  lauf: Lauf,
  bericht: Bericht,
  merke: (key: string, deltaLink: string) => void,
): AsyncGenerator<Nachricht> {
  const seit = berlinMitternachtUtc(einst.seit);
  const ordnerId = await mailOrdnerFinden(graph, einst.mailordner);
  if (!ordnerId) {
    bericht.quelle = 'posteingang';
    const filter = `receivedDateTime ge ${seit} and hasAttachments eq true`;
    yield* graph.paginate<Nachricht>(
      `/me/mailFolders/inbox/messages?$filter=${encodeURIComponent(filter)}&$select=${FELDER}`,
      PREFER,
    );
    return;
  }
  bericht.quelle = 'rechnungsordner';
  const key = `rechnungen.delta.${ordnerId}`;
  const gespeichert = lauf.db
    ? (await lauf.db.query<{ value: string }>('SELECT value FROM sync_state WHERE key = $1', [key])).rows[0]?.value
    : undefined;
  let url: string | undefined =
    gespeichert ??
    `/me/mailFolders/${ordnerId}/messages/delta?$select=${FELDER}&$filter=${encodeURIComponent(`receivedDateTime ge ${seit}`)}`;
  while (url) {
    const seite: DeltaSeite = await graph.get<DeltaSeite>(url, PREFER);
    for (const m of seite.value) if (!m['@removed']) yield m;
    url = seite['@odata.nextLink'];
    if (seite['@odata.deltaLink']) merke(key, seite['@odata.deltaLink']);
  }
}

export async function rechnungseingang(graph: EingangGraph, einst: RechnungsEinstellungen, lauf: Lauf): Promise<Bericht> {
  if (lauf.ausfuehren && !lauf.db) throw new Error('Zum Ausführen braucht es die Datenbank (DATABASE_URL)');
  if (lauf.ausfuehren && !einst.ziel) {
    throw new Error('Kein OneDrive-Zielordner festgelegt (config/praxis.json → rechnungen.ziel) – bis dahin nur Probeläufe');
  }
  const textAus = lauf.textAus ?? pdfText;
  const uebernahme = lauf.nachrichten !== undefined;
  const k = einst.kategorien;
  const eigene = new Set([k.eingegangen, k.patient, k.unklar, ...Object.values(KATEGORIEN).map((x) => x.name), 'Rechnung: abgelegt']);
  const bericht: Bericht = {
    quelle: 'posteingang', mails: 0, rechnungen: 0, duplikate: 0, unklar: 0, patient: 0, eigene: 0, keineRechnung: 0,
    ignoriert: 0, bekannt: 0, fehler: 0, verschoben: 0, archiviert: 0, abgelegt: [],
  };
  const laufwerk = laufwerkPfad(einst.laufwerk);
  const deltaLinks = new Map<string, string>();
  const ablageOrdner = new Map<string, string>();
  let verarbeitetId: string | undefined;
  let vorzeitig = false;

  const nachrichten = lauf.nachrichten ?? quelle(graph, einst, lauf, bericht, (key, link) => deltaLinks.set(key, link));
  if (uebernahme) bericht.quelle = 'uebernahme';
  for await (const mail of nachrichten) {
    if (!mail.hasAttachments) continue;
    const kategorien = mail.categories ?? [];
    if (kategorien.some((c) => eigene.has(c))) continue;
    if (lauf.hoechstens !== undefined && bericht.mails >= lauf.hoechstens) {
      vorzeitig = true;
      break;
    }
    bericht.mails++;

    try {
      const domain = domainVon(mail.from?.emailAddress?.address ?? '');
      if (lieferantZu(domain, (einst.eigeneAbsender ?? []).map((d) => ({ name: '', domains: [d] })))) {
        bericht.eigene++;
        continue;
      }
      const lieferant = lieferantZu(domain, einst.lieferanten);
      const betreff = mail.subject ?? '';
      const tag = datumBerlin(mail.receivedDateTime);

      // 1. Alles lesen und einordnen, noch nichts tun – eine Patientenmail darf nicht halb abgelegt werden
      const eintraege: Eintrag[] = [];
      let patient = !lieferant && betreffMitPatientenbezug(betreff);
      let bekannteRechnung = false;
      if (!patient) {
        for await (const anhang of graph.paginate<Anhang>(
          `/me/messages/${mail.id}/attachments?$select=id,name,contentType,size,isInline`,
          PREFER,
        )) {
          if (anhang['@odata.type'] !== '#microsoft.graph.fileAttachment' || anhang.isInline || !istPdf(anhang)) {
            bericht.ignoriert++;
            continue;
          }
          const frueher = await bekannterAnhang(lauf.db, mail.id, anhang.id);
          if (frueher) {
            bericht.bekannt++;
            if (frueher.klasse === 'rechnung') bekannteRechnung = true;
            continue;
          }
          if (anhang.size > MAX_BYTES) {
            eintraege.push({ mail, anhang, hash: `zu-gross:${anhang.id}`, klasse: 'unklar', status: 'klassifiziert' });
            continue;
          }
          const bytes = await graph.getBytes(`/me/messages/${mail.id}/attachments/${anhang.id}/$value`);
          if (!istPdf(anhang, bytes)) {
            bericht.ignoriert++;
            continue;
          }
          const text = await textAus(bytes);
          const { klasse } = klassifiziere({ bekannterLieferant: !!lieferant, betreff, text, unbekannteAlsRechnung: einst.unbekannteAlsRechnung });
          if (klasse === 'patient') {
            patient = true;
            break;
          }
          eintraege.push({
            mail, anhang, hash: sha256(bytes), klasse, status: 'klassifiziert',
            lieferant: klasse === 'rechnung' ? (lieferant?.name ?? lieferantName(domain, mail.from?.emailAddress?.name)) : undefined,
            bytes: klasse === 'rechnung' ? bytes : undefined,
            kopf: klasse === 'rechnung' ? kopfdaten(text, betreff) : undefined,
            bezahlt: klasse === 'rechnung' && !!lauf.altbestandBezahltBis && tag <= lauf.altbestandBezahltBis,
          });
        }
      }

      // 2. Patientenpost: nur markieren, nichts speichern
      if (patient) {
        bericht.patient++;
        if (lauf.ausfuehren && !uebernahme) {
          await graph.patch(`/me/messages/${mail.id}`, { categories: [...kategorien, k.patient] }, PREFER);
          await protokolliere(lauf.db!, { actor: ACTOR, action: 'mail_patient_markiert', objectType: 'mail', objectId: mail.id });
        }
        continue;
      }

      // 3. Rechnungen ablegen, Unklares vermerken
      let rechnung = bekannteRechnung;
      let unklar = false;
      for (const e of eintraege) {
        if (e.klasse === 'keine_rechnung') {
          bericht.keineRechnung++;
          if (lauf.ausfuehren) await eintragen(lauf.db!, e);
          continue;
        }
        if (e.klasse === 'unklar') {
          bericht.unklar++;
          if (uebernahme) continue;
          unklar = true;
          if (lauf.ausfuehren) {
            const id = await eintragen(lauf.db!, e);
            await protokolliere(lauf.db!, { actor: ACTOR, action: 'anhang_unklar', objectType: 'inbound_document', objectId: id });
          }
          continue;
        }
        rechnung = true;
        const vorhanden = await rechnungMitHash(lauf.db, e.hash);
        if (vorhanden) {
          bericht.duplikate++;
          if (lauf.ausfuehren) {
            await protokolliere(lauf.db!, {
              actor: ACTOR, action: 'rechnung_duplikat', objectType: 'inbound_document', objectId: vorhanden,
              details: { mail: mail.id },
            });
          }
          continue;
        }
        const ordner = zielOrdner(einst.ziel ?? '<Zielordner offen>', tag);
        const name = ablageName(tag, e.anhang.name ?? 'Rechnung.pdf');
        bericht.rechnungen++;
        if (!lauf.ausfuehren) {
          bericht.abgelegt.push({ lieferant: e.lieferant!, pfad: `${ordner}/${name}`, geplant: true });
          continue;
        }
        let ordnerId = ablageOrdner.get(ordner);
        if (!ordnerId) {
          ordnerId = await ordnerSicherstellen(graph, ordner, laufwerk);
          ablageOrdner.set(ordner, ordnerId);
        }
        const item = await uploadFile(graph, ordnerId, name, e.bytes!, laufwerk);
        const id = await eintragen(lauf.db!, {
          ...e, onedriveItemId: item.id, onedrivePfad: `${ordner}/${item.name}`, onedriveWebUrl: item.webUrl, status: 'wartet_freigabe',
        });
        await protokolliere(lauf.db!, {
          actor: ACTOR, action: 'rechnung_abgelegt', objectType: 'inbound_document', objectId: id,
          details: { lieferant: e.lieferant, sha8: e.hash.slice(0, 8), bytes: e.anhang.size },
        });
        bericht.abgelegt.push({ lieferant: e.lieferant!, pfad: `${ordner}/${item.name}`, geplant: false });
      }

      // 4. Mail markieren; nur verschieben, wenn nichts Unklares mehr darin wartet.
      //    Altbestand (bestätigt bezahlt): gleich „bezahlt“ und ins Exchange-Archiv
      const altBezahlt = rechnung && eintraege.some((e) => e.bezahlt);
      if (lauf.ausfuehren && altBezahlt && !unklar) {
        await graph.patch(`/me/messages/${mail.id}`, { categories: aufStufe(kategorien, KATEGORIEN.bezahlt.name) }, PREFER);
        await graph.post(`/me/messages/${mail.id}/move`, { destinationId: 'archive' }, PREFER);
        bericht.archiviert++;
      } else if (lauf.ausfuehren && (rechnung || unklar)) {
        const neu = [...kategorien, ...(rechnung ? [k.eingegangen] : []), ...(unklar ? [k.unklar] : [])];
        await graph.patch(`/me/messages/${mail.id}`, { categories: neu }, PREFER);
        if (rechnung && !unklar && einst.mailsVerschieben !== false) {
          verarbeitetId ??= await mailOrdnerSicherstellen(graph, einst.verarbeitet);
          await graph.post(`/me/messages/${mail.id}/move`, { destinationId: verarbeitetId }, PREFER);
          bericht.verschoben++;
        }
      }
    } catch (err) {
      // Ohne Inhalt ins Protokoll: die Meldung von Graph kann Dateinamen enthalten
      bericht.fehler++;
      const status = (err as { status?: number }).status;
      if (lauf.ausfuehren) {
        await protokolliere(lauf.db!, {
          actor: ACTOR, action: 'mail_fehler', objectType: 'mail', objectId: mail.id, details: { status: status ?? null },
        });
      }
    }
  }

  // Den Stand der Abholung nur merken, wenn alles durchgelaufen ist – sonst kommt der Rest nie wieder
  if (lauf.ausfuehren && !vorzeitig && bericht.fehler === 0) {
    for (const [key, value] of deltaLinks) {
      await lauf.db!.query(
        `INSERT INTO sync_state (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [key, value],
      );
    }
  }
  return bericht;
}
