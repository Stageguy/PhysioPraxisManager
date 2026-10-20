/**
 * Bestandsaufnahme Postfach: Wie viele Mails enthalten Rechnungen für ein Geschäftsjahr?
 * Liest nur – verändert nichts, speichert nichts. PDF-Texte bleiben im Arbeitsspeicher.
 * Ausgabe nur Zahlen; Absender nur als Domain und nur bei rechnungsartigen Mails ohne
 * Patientenbezug (Freemail-Domains werden zusammengefasst).
 *
 *   npm run rechnungen:zaehlen -- --jahr 2026
 *   npm run rechnungen:zaehlen -- --jahr 2026 --mit-geloeschten   # auch „Gelöschte Elemente“
 *
 * Aufgeschlüsselt nach Gruppen: Posteingang, Unterordner des Posteingangs, Archiv, eigene Ordner,
 * Gelöschte Elemente. Namen eigener Ordner erscheinen nicht (sie können Patientennamen tragen).
 * Das Online-Archiv (eigenes Archivpostfach) sieht Microsoft Graph nicht.
 */
import { parseArgs } from 'node:util';
import { ALLE_SCOPES, createTokenProvider } from '../auth.ts';
import { loadEnv } from '../config.ts';
import { GraphClient } from '../graph.ts';
import { betreffMitPatientenbezug, domainVon, merkmale, textMitPatientenbezug } from '../rechnungen/klassifikation.ts';
import { ladeEinstellungen } from '../einstellungen.ts';
import { istPdf, pdfText } from '../rechnungen/pdf.ts';
import { berlinMitternachtUtc, datumBerlin } from '../zeit.ts';

const { values } = parseArgs({
  options: { jahr: { type: 'string', default: '2026' }, 'mit-geloeschten': { type: 'boolean', default: false } },
});
const jahr = Number(values.jahr);
// Rechnungen vom Dezember kommen oft erst im Januar – und umgekehrt
const ab = berlinMitternachtUtc(`${jahr - 1}-12-01`);
const bis = berlinMitternachtUtc(`${jahr + 1}-01-31`);

const env = loadEnv();
const eigene = (await ladeEinstellungen()).rechnungen.eigeneAbsender ?? [];
const graph = new GraphClient(createTokenProvider(env, ALLE_SCOPES, { interaktiv: false }), { maxRetries: 3 });

interface Ordner { id: string; displayName: string; childFolderCount: number }
interface Mail { id: string; subject?: string; receivedDateTime: string; hasAttachments: boolean; from?: { emailAddress?: { address?: string } } }
interface Anhang { '@odata.type': string; id: string; name?: string; contentType?: string; size: number; isInline: boolean }

const AUSSCHLUSS = [...(values['mit-geloeschten'] ? [] : ['deleteditems']), 'junkemail', 'drafts', 'outbox', 'sentitems', 'conversationhistory', 'syncissues', 'recoverableitemsdeletions'];
const FREEMAIL = /^(gmail|googlemail|web|gmx|t-online|yahoo|outlook|hotmail|icloud|me|aol|freenet|posteo|mail|online|arcor|live)\./;
const ausgeschlossen = new Set<string>();
for (const w of AUSSCHLUSS) {
  const o = await graph.find<{ id: string }>(`/me/mailFolders/${w}?$select=id`);
  if (o) ausgeschlossen.add(o.id);
}
const gesendetId = (await graph.find<{ id: string }>('/me/mailFolders/sentitems?$select=id'))?.id;
const WELLKNOWN: Record<string, string> = {};
for (const w of ['inbox', 'archive', 'deleteditems']) {
  const o = await graph.find<{ id: string }>(`/me/mailFolders/${w}?$select=id`);
  if (o) WELLKNOWN[o.id] = w;
}
const GRUPPE: Record<string, string> = { inbox: 'Posteingang', archive: 'Archiv', deleteditems: 'Gelöschte Elemente' };

async function* alleOrdner(eltern?: string, gruppe?: string): AsyncGenerator<Ordner & { gruppe: string }> {
  const url = eltern ? `/me/mailFolders/${eltern}/childFolders` : '/me/mailFolders';
  for await (const o of graph.paginate<Ordner>(`${url}?$top=100&$select=id,displayName,childFolderCount&includeHiddenFolders=true`)) {
    if (ausgeschlossen.has(o.id)) continue;
    const eigene = WELLKNOWN[o.id] ? GRUPPE[WELLKNOWN[o.id]!]! : gruppe ? `${gruppe} – Unterordner` : 'eigene Ordner';
    const g = gruppe && !WELLKNOWN[o.id] ? (gruppe.endsWith('Unterordner') ? gruppe : `${gruppe} – Unterordner`) : eigene;
    yield { ...o, gruppe: g };
    if (o.childFolderCount) yield* alleOrdner(o.id, g);
  }
}

const RECHNUNGSDATUM = /(rechnungsdatum|rechnungs-datum|datum der rechnung|invoice date|belegdatum)\s*[:.]?\s*(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{2,4})/i;
function rechnungsjahr(text: string): number | undefined {
  const m = RECHNUNGSDATUM.exec(text);
  if (!m) return undefined;
  const y = Number(m[4]);
  return y < 100 ? 2000 + y : y;
}

const z = {
  mails: 0, mitPdf: 0, rechnungsmails: 0, rechnungsPdfs: 0, mitPatientenbezug: 0, eigene: 0,
  hinweisOhnePdf: 0, gesendetMitRechnung: 0,
  nachJahr: new Map<string, number>(), nachMonat: new Map<string, number>(), domains: new Map<string, number>(),
  nachGruppe: new Map<string, { mails: number; rechnungen: number; patient: number }>(),
};
const zaehle = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

async function pruefeOrdner(id: string, gesendet: boolean, gruppe = 'Gesendete Elemente'): Promise<void> {
  const g = z.nachGruppe.get(gruppe) ?? { mails: 0, rechnungen: 0, patient: 0 };
  z.nachGruppe.set(gruppe, g);
  const filter = `receivedDateTime ge ${ab} and receivedDateTime lt ${bis}`;
  for await (const mail of graph.paginate<Mail>(
    `/me/mailFolders/${id}/messages?$filter=${encodeURIComponent(filter)}&$select=id,subject,receivedDateTime,hasAttachments,from&$top=100`,
  )) {
    if (!gesendet) z.mails++;
    g.mails++;
    const betreff = mail.subject ?? '';
    const betreffRechnung = /\b(rechnung|invoice|beleg)\b/i.test(betreff);
    if (!mail.hasAttachments) {
      if (!gesendet && betreffRechnung && !betreffMitPatientenbezug(betreff)) z.hinweisOhnePdf++;
      continue;
    }
    let jahre: (number | undefined)[] = [];
    let pdfs = 0;
    let patient = betreffMitPatientenbezug(betreff);
    let hatPdf = false;
    for await (const a of graph.paginate<Anhang>(`/me/messages/${mail.id}/attachments?$select=id,name,contentType,size,isInline`)) {
      if (a['@odata.type'] !== '#microsoft.graph.fileAttachment' || a.isInline || !istPdf(a) || a.size > 25 * 1024 ** 2) continue;
      const bytes = await graph.getBytes(`/me/messages/${mail.id}/attachments/${a.id}/$value`);
      if (!istPdf(a, bytes)) continue;
      hatPdf = true;
      const text = await pdfText(bytes);
      const m = merkmale(text);
      if (textMitPatientenbezug(text)) patient = true;
      if (m.includes('titel') && m.length >= 2) {
        pdfs++;
        jahre.push(rechnungsjahr(text));
      }
    }
    if (!gesendet && hatPdf) z.mitPdf++;
    if (!pdfs) {
      if (!gesendet && betreffRechnung && !patient) z.hinweisOhnePdf++;
      continue;
    }
    const absenderDomain = domainVon(mail.from?.emailAddress?.address ?? '');
    if (!gesendet && eigene.some((d) => absenderDomain === d || absenderDomain.endsWith(`.${d}`))) {
      z.eigene++;
      continue;
    }
    if (gesendet) {
      z.gesendetMitRechnung++;
      g.rechnungen++;
      continue;
    }
    if (patient) {
      z.mitPatientenbezug++;
      g.patient++;
      continue;
    }
    z.rechnungsmails++;
    g.rechnungen++;
    z.rechnungsPdfs += pdfs;
    const j = jahre.find((x) => x !== undefined);
    zaehle(z.nachJahr, j === undefined ? 'unbekannt' : String(j));
    zaehle(z.nachMonat, datumBerlin(mail.receivedDateTime).slice(0, 7));
    const d = domainVon(mail.from?.emailAddress?.address ?? '');
    zaehle(z.domains, FREEMAIL.test(d) ? '(Freemail)' : d);
  }
}

for await (const o of alleOrdner()) await pruefeOrdner(o.id, false, o.gruppe);
if (gesendetId) await pruefeOrdner(gesendetId, true);

const sortiert = (m: Map<string, number>) => [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
console.log(`Zeitraum Mail-Eingang: ${datumBerlin(ab)} bis ${datumBerlin(new Date(Date.parse(bis) - 1).toISOString())} (${values['mit-geloeschten'] ? 'mit Gelöschten, ohne' : 'ohne Gelöschte,'} Junk, Entwürfe)`);
console.log(`  ${z.mails} Mails, davon ${z.mitPdf} mit PDF-Anhang`);
console.log(`  ${z.rechnungsmails} Mails mit Rechnungs-PDF (${z.rechnungsPdfs} PDFs), ohne Patientenbezug`);
console.log(`  ${z.eigene} eigene Ausgangsrechnungen (Kopien von ${eigene.join(', ') || '–'}, nicht mitgezählt)`);
console.log(`  ${z.mitPatientenbezug} Mails mit Rechnungs-PDF und Patientenbezug (nicht mitgezählt)`);
console.log(`  ${z.hinweisOhnePdf} Mails mit „Rechnung“ im Betreff, aber ohne Rechnungs-PDF (z. B. Rechnung nur im Kundenportal)`);
console.log(`  ${z.gesendetMitRechnung} gesendete Mails mit Rechnungs-PDF (Ausgangsrechnungen?)`);
console.log('Nach Ordnergruppe (Mails im Zeitraum · Rechnungs-Mails ohne · mit Patientenbezug):');
for (const [k, v] of z.nachGruppe) console.log(`  ${k.padEnd(32)} ${String(v.mails).padStart(5)} · ${String(v.rechnungen).padStart(3)} · ${v.patient}`);
console.log('Rechnungsdatum laut PDF:');
for (const [k, v] of sortiert(z.nachJahr)) console.log(`  ${k}: ${v}`);
console.log('Mail-Eingang je Monat:');
for (const [k, v] of sortiert(z.nachMonat)) console.log(`  ${k}: ${v}`);
console.log('Absender (Domain), Kandidaten für die Lieferantenliste:');
for (const [k, v] of [...z.domains.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${v}× ${k}`);
