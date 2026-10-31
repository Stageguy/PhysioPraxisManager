/**
 * Eine Mail als **Entwurf** im Praxispostfach anlegen (Leitplanke 3: nichts geht automatisch an
 * Patienten). Der Entwurf erscheint in Outlook, Apple Mail und Outlook Web unter „Entwürfe“;
 * senden tut Lilli. Die Signatur hängt Exchange beim Senden per Transportregel an.
 * Ohne `ausfuehren` wird nur gezeigt, was angelegt würde.
 */
import type { GraphClient } from '../graph.ts';
import { entwurfKategorien, pruefeEmpfaenger } from '../umgebung.ts';

export interface Anhang {
  name: string;
  mime: string;
  daten: Uint8Array;
}

export interface NeueMail {
  an: string[];
  cc?: string[];
  betreff: string;
  text: string;
  /** Dateien am Entwurf (Rechnungs-PDF, Unterlagen) – je bis 3 MB, als fileAttachment */
  anhaenge?: Anhang[];
}

const ADRESSE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
/** Größere Anhänge bräuchten eine Upload-Sitzung – für Rechnungen und Scans reicht das */
const ANHANG_MAX = 3 * 1024 * 1024;

export function pruefeMail(mail: NeueMail): void {
  if (!mail.an.length) throw new Error('Kein Empfänger angegeben');
  for (const a of [...mail.an, ...(mail.cc ?? [])]) {
    if (!ADRESSE.test(a)) throw new Error(`„${a}“ ist keine gültige Mailadresse`);
  }
  if (!mail.betreff.trim()) throw new Error('Betreff fehlt');
  if (!mail.text.trim()) throw new Error('Text fehlt');
  for (const a of mail.anhaenge ?? []) {
    if (!a.name.trim()) throw new Error('Ein Anhang hat keinen Dateinamen');
    if (a.daten.length > ANHANG_MAX) throw new Error(`Anhang „${a.name}“ ist größer als 3 MB`);
  }
}

/** Körper für POST /me/messages/{id}/attachments */
export const anhangKoerper = (a: Anhang) => ({
  '@odata.type': '#microsoft.graph.fileAttachment', name: a.name, contentType: a.mime, contentBytes: Buffer.from(a.daten).toString('base64'),
});

/** Körper für POST /me/messages – legt einen Entwurf an, sendet nicht */
export function entwurfKoerper(mail: NeueMail) {
  const empfaenger = (liste: string[] = []) => liste.map((address) => ({ emailAddress: { address } }));
  return {
    subject: mail.betreff,
    body: { contentType: 'Text', content: mail.text },
    toRecipients: empfaenger(mail.an),
    ccRecipients: empfaenger(mail.cc),
    // Schranke 6: Entwürfe der Testumgebung sind in Outlook als „TEST“ erkennbar
    categories: entwurfKategorien(),
  };
}

const htmlZeilen = (text: string) => text.split('\n').map((z) => z.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)).join('<br>');

/**
 * Antwort auf eine vorhandene Mail als Entwurf im selben Faden (createReply): unser Text steht über dem
 * Zitat, Empfänger ist der ursprüngliche Absender. Schranke 2 gilt auch hier.
 */
export async function antwortEntwurf(graph: Pick<GraphClient, 'post' | 'patch'>, nachrichtId: string, text: string, empfaenger: string): Promise<{ id: string; webLink?: string }> {
  pruefeEmpfaenger([empfaenger]);
  const m = await graph.post<{ id: string; webLink?: string }>(`/me/messages/${nachrichtId}/createReply`, { comment: htmlZeilen(text) });
  const kategorien = entwurfKategorien();
  if (kategorien.length) await graph.patch(`/me/messages/${m.id}`, { categories: kategorien });
  return m;
}

export async function entwurfAnlegen(
  graph: Pick<GraphClient, 'post'> & Partial<Pick<GraphClient, 'get'>>,
  mail: NeueMail,
  optionen: { ausfuehren: boolean; /** zusätzlich die unveränderliche Kennung holen, mit der sich der Entwurf nach dem Senden wiederfinden lässt (W122) */ unveraenderlicheKennung?: boolean },
): Promise<{ angelegt: boolean; id?: string; webLink?: string; conversationId?: string; messageId?: string }> {
  pruefeMail(mail);
  // Schranke 2: die Testumgebung schreibt nur an Testadressen – auch im Probelauf geprüft
  pruefeEmpfaenger([...mail.an, ...(mail.cc ?? [])]);
  if (!optionen.ausfuehren) return { angelegt: false };
  // Ohne Prefer-Kopfzeile: nur mit der normalen Kennung funktioniert der Web-Link in Outlook im Web
  const m = await graph.post<{ id: string; webLink: string; conversationId?: string; internetMessageId?: string }>('/me/messages', entwurfKoerper(mail));
  for (const a of mail.anhaenge ?? []) await graph.post(`/me/messages/${m.id}/attachments`, anhangKoerper(a));
  let id = m.id;
  if (optionen.unveraenderlicheKennung && graph.get) {
    // Die unveränderliche Kennung überlebt das Verschieben nach „Gesendete Elemente“; klappt das nicht, hilft später der Faden
    try { id = (await graph.get<{ id: string }>(`/me/messages/${encodeURIComponent(m.id)}?$select=id`, { Prefer: 'IdType="ImmutableId"' })).id; } catch { /* normale Kennung behalten */ }
  }
  return { angelegt: true, id, webLink: m.webLink, conversationId: m.conversationId, messageId: m.internetMessageId };
}
