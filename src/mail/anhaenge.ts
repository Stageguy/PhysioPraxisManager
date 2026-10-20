/**
 * Anhänge aus dem Posteingang in OneDrive ablegen (Vorlage: graphapi/src/mail/fetch.ts).
 *
 * - Ohne `ausfuehren` nur ein Probelauf: liest Mails und Anhangslisten, schreibt nichts, legt
 *   keinen Ordner an, setzt keine Kategorie.
 * - Ziel: <ziel>/<JJJJ-MM>/<JJJJ-MM-TT> <Anhangname> – nach dem Eingangstag der Mail.
 * - Eine Mail gilt erst als erledigt (Kategorie), wenn alle ihre Anhänge abgelegt sind; bei einem
 *   Fehler versucht es der nächste Lauf erneut. OneDrive überschreibt nie, es nummeriert.
 * - Der Bericht nennt Namen nur in `einzeln` – die Befehlszeile zeigt sie nur mit --details.
 */
import { ordnerSicherstellen, uploadFile } from '../drive.ts';
import type { AnhaengeEinstellungen } from '../einstellungen.ts';
import type { GraphClient } from '../graph.ts';
import { berlinMitternachtUtc, datumBerlin } from '../zeit.ts';

export type AnhangGraph = Pick<GraphClient, 'get' | 'find' | 'paginate' | 'patch' | 'getBytes' | 'putBytes' | 'post'>;

export interface Nachricht {
  id: string;
  subject?: string;
  receivedDateTime: string;
  categories: string[];
}

export interface Anhang {
  '@odata.type': string;
  id: string;
  name: string;
  contentType?: string;
  size: number;
  isInline: boolean;
}

export type Entscheidung = { nehmen: true; name: string } | { nehmen: false; grund: string };

const BILD_ENDUNGEN = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.heic'];
/** Kleinere Bilder sind fast immer Logos aus Signaturen */
const KLEINES_BILD_BYTES = 30 * 1024;
const TECHNISCH = [/^winmail\.dat$/i, /^smime\.p7[ms]$/i, /\.ics$/i, /\.vcf$/i];

/** Unzulässige Zeichen für OneDrive ersetzen */
export function sichererName(name: string): string {
  const sauber = name
    .replace(/["*:<>?/\\|\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/, '')
    .trim();
  return sauber || 'Anhang';
}

export function entscheide(anhang: Anhang): Entscheidung {
  const typ = anhang['@odata.type'];
  if (typ === '#microsoft.graph.itemAttachment') return { nehmen: false, grund: 'angehängte Mail oder Termin' };
  if (typ === '#microsoft.graph.referenceAttachment') return { nehmen: false, grund: 'Link auf Cloud-Datei' };
  const name = anhang.name ?? '';
  const endung = name.slice(name.lastIndexOf('.')).toLowerCase();
  const istBild = BILD_ENDUNGEN.includes(endung) || (anhang.contentType ?? '').toLowerCase().startsWith('image/');
  // Nur eingebettete Bilder verwerfen – manche Programme markieren auch PDFs als eingebettet
  if (anhang.isInline && istBild) return { nehmen: false, grund: 'eingebettetes Bild (Logo/Signatur)' };
  if (TECHNISCH.some((m) => m.test(name))) return { nehmen: false, grund: 'technischer Anhang' };
  if (istBild && anhang.size < KLEINES_BILD_BYTES) return { nehmen: false, grund: 'kleines Bild' };
  return { nehmen: true, name: sichererName(name) };
}

/** "2026-10-20" + "Befund.pdf" → "2026-10-20 Befund.pdf"; trägt der Name schon ein Datum vorn, bleibt er */
export function zielName(eingang: string, name: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(name) ? name : `${eingang} ${name}`;
}

export interface Einzeln {
  mail: string;
  betreff: string;
  anhang: string;
  status: 'geplant' | 'abgelegt' | 'übersprungen' | 'fehler';
  detail?: string;
}

export interface Bericht {
  mails: number;
  geplant: number;
  abgelegt: number;
  uebersprungen: number;
  fehler: number;
  markiert: number;
  einzeln: Einzeln[];
}

export async function anhaengeAblegen(
  graph: AnhangGraph,
  einst: AnhaengeEinstellungen,
  optionen: { ausfuehren: boolean; hoechstens?: number },
): Promise<Bericht> {
  const bericht: Bericht = { mails: 0, geplant: 0, abgelegt: 0, uebersprungen: 0, fehler: 0, markiert: 0, einzeln: [] };
  const filter = `receivedDateTime ge ${berlinMitternachtUtc(einst.seit)} and hasAttachments eq true`;
  const ordnerJeMonat = new Map<string, string>();

  for await (const mail of graph.paginate<Nachricht>(
    `/me/mailFolders/inbox/messages?$filter=${encodeURIComponent(filter)}` +
      '&$select=id,subject,receivedDateTime,categories&$top=50',
  )) {
    if (mail.categories.includes(einst.kategorie)) continue;
    if (optionen.hoechstens !== undefined && bericht.mails >= optionen.hoechstens) break;
    bericht.mails++;
    const tag = datumBerlin(mail.receivedDateTime);
    const monatsordner = `${einst.ziel}/${tag.slice(0, 7)}`;
    let mailFehler = false;

    for await (const anhang of graph.paginate<Anhang>(
      `/me/messages/${mail.id}/attachments?$select=id,name,contentType,size,isInline`,
    )) {
      const e = entscheide(anhang);
      const eintrag = { mail: mail.id, betreff: mail.subject ?? '', anhang: anhang.name };
      if (!e.nehmen) {
        bericht.uebersprungen++;
        bericht.einzeln.push({ ...eintrag, status: 'übersprungen', detail: e.grund });
        continue;
      }
      const name = zielName(tag, e.name);
      if (!optionen.ausfuehren) {
        bericht.geplant++;
        bericht.einzeln.push({ ...eintrag, status: 'geplant', detail: `${monatsordner}/${name}` });
        continue;
      }
      try {
        let ordnerId = ordnerJeMonat.get(monatsordner);
        if (!ordnerId) {
          ordnerId = await ordnerSicherstellen(graph, monatsordner);
          ordnerJeMonat.set(monatsordner, ordnerId);
        }
        const bytes = await graph.getBytes(`/me/messages/${mail.id}/attachments/${anhang.id}/$value`);
        const item = await uploadFile(graph, ordnerId, name, bytes);
        bericht.abgelegt++;
        bericht.einzeln.push({ ...eintrag, status: 'abgelegt', detail: `${monatsordner}/${item.name}` });
      } catch (err) {
        mailFehler = true;
        bericht.fehler++;
        bericht.einzeln.push({ ...eintrag, status: 'fehler', detail: (err as Error).message.slice(0, 300) });
      }
    }

    if (optionen.ausfuehren && !mailFehler) {
      await graph.patch(`/me/messages/${mail.id}`, { categories: [...mail.categories, einst.kategorie] });
      bericht.markiert++;
    }
  }
  return bericht;
}
