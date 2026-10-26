/**
 * Terminanfragen aus dem Postfach lesen (A15, Prompt 6): der Outlook-Ordner „Posteingang/Terminanfragen“
 * (per Outlook-Regel befüllt: Betreff enthält „Termin“, oder Formular-Mails der Website) wird gelesen,
 * jede neue Mail wird eine Anfrage. Schranken 1 und 5 (umgebung.ts): die Testumgebung nimmt nur
 * Testadressen, die Produktion nie. Es wird nichts an der Mail verändert und nichts verschoben –
 * die Kennung der Mail verhindert Dubletten.
 */
import type { Db } from '../db/index.ts';
import type { GraphClient } from '../graph.ts';
import { mailOrdnerFinden } from '../mail/ordner.ts';
import type { Tresor } from '../tresor.ts';
import { patientenpostZulassen } from '../umgebung.ts';
import { heuteBerlin } from '../zeit.ts';
import { anfrageAnlegen } from './anfragen.ts';
import { erkenneAnliegen, erkenneZeitwunsch, htmlZuText } from './erkennung.ts';
import { anfrageAusFormularMail } from './formular.ts';
import { terminartFinden } from '../kartei/terminarten.ts';

export type AnfragenGraph = Pick<GraphClient, 'get' | 'paginate' | 'post'>;

export interface EingangBericht {
  quelle: 'ordner' | 'fehlt';
  mails: number;
  neu: number;
  bekannt: number;
  /** Schranke 1/5: Absender, die diese Umgebung nicht annimmt */
  uebersprungen: number;
  fehler: number;
}

interface Kopf {
  id: string;
  subject?: string;
  receivedDateTime: string;
  conversationId?: string;
  from?: { emailAddress?: { address?: string; name?: string } };
}

const PREFER = { Prefer: 'IdType="ImmutableId", odata.maxpagesize=50' };

export async function anfragenEingang(graph: AnfragenGraph, db: Db, t: Tresor, o: { ordner: string; ausfuehren: boolean; hoechstens?: number; heute?: string }): Promise<EingangBericht> {
  const b: EingangBericht = { quelle: 'ordner', mails: 0, neu: 0, bekannt: 0, uebersprungen: 0, fehler: 0 };
  const ordnerId = await mailOrdnerFinden(graph, o.ordner);
  if (!ordnerId) return { ...b, quelle: 'fehlt' };
  const heute = o.heute ?? heuteBerlin();
  for await (const m of graph.paginate<Kopf>(`/me/mailFolders/${ordnerId}/messages?$top=50&$orderby=receivedDateTime desc&$select=id,subject,receivedDateTime,from,conversationId`, PREFER)) {
    if (o.hoechstens !== undefined && b.mails >= o.hoechstens) break;
    b.mails++;
    try {
      if ((await db.query('SELECT 1 FROM terminanfrage WHERE graph_message_id = $1', [m.id])).rows.length) { b.bekannt++; continue; }
      const absender = m.from?.emailAddress?.address?.trim().toLowerCase() ?? '';
      if (!absender || !patientenpostZulassen(absender)) { b.uebersprungen++; continue; }
      const voll = await graph.get<{ body?: { contentType?: string; content?: string } }>(`/me/messages/${m.id}?$select=body`, { Prefer: 'outlook.body-content-type="text"' });
      const roh = voll.body?.content ?? '';
      const text = voll.body?.contentType?.toLowerCase() === 'html' ? htmlZuText(roh) : roh.trim();
      const betreff = m.subject?.trim() ?? '';
      const formular = anfrageAusFormularMail(text);
      const website = Boolean(formular && (formular.email || formular.telefon));
      b.neu++;
      if (!o.ausfuehren) continue;
      await anfrageAnlegen(db, t, {
        quelle: website ? 'website' : 'mail',
        anliegen: erkenneAnliegen(betreff, website ? `${formular!.wunsch ?? ''} ${formular!.anliegen ?? ''}` : text),
        graphMessageId: m.id, conversationId: m.conversationId,
        absenderAdresse: (website && formular!.email) || absender, absenderName: (website && formular!.name) || m.from?.emailAddress?.name || null,
        absenderTelefon: website ? formular!.telefon : null, betreff, text,
        erkannt: erkenneZeitwunsch(website ? `${formular!.wunsch ?? ''} ${formular!.anliegen ?? ''}` : `${betreff}\n${text}`, heute),
        eingegangenAm: m.receivedDateTime,
        terminartId: website && formular!.terminart ? (await terminartFinden(db, formular!.terminart))?.id ?? null : null,
      });
    } catch (err) {
      b.fehler++;
      console.warn(`Anfrage aus Mail ${m.id.slice(0, 12)}…: ${(err as Error).message.slice(0, 160)}`);
    }
  }
  return b;
}
