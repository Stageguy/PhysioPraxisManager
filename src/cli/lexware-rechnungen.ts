/**
 * Ausgangsrechnungen aus Lexware zählen – und übernehmen (W103). Nur lesend, bis --ausfuehren kommt.
 *
 *   npm run lexware:rechnungen                   Zählung: Rechnungen je Jahr und Status, Kunden, PDF-Erwartung
 *   npm run lexware:rechnungen -- --pdf-pruefen  dazu je Rechnung nachsehen, ob Lexware die Datei liefert (2 Anfragen/s – dauert)
 *   npm run lexware:rechnungen -- --jahr 2025    nur ein Jahr zählen
 *   npm run lexware:rechnungen -- --ausfuehren   Übernahme für alle verknüpften Patienten (nur im Pod der Produktion:
 *                                                kubectl -n praxis exec deploy/praxis-dienst -- node src/cli/lexware-rechnungen.ts --ausfuehren)
 *
 * Mit DATABASE_URL wird zusätzlich gezählt, wie viele Rechnungen zu einem verknüpften Patienten gehören.
 * Ausgaben enthalten Zahlen, keine Namen (Leitplanke 9). Die Testumgebung übernimmt nie echte Rechnungen (N28).
 */
import { verbinde } from '../db/index.ts';
import { rechnungenUebernehmen, uebernahmeText } from '../kartei/lexware-rechnungen.ts';
import { LexwareClient, LexwareNichtBereit, type Beleg } from '../lexware/client.ts';
import { ALLE_STATUS, lexwareRechnungen } from '../lexware/rechnungen.ts';
import { tresor } from '../tresor.ts';
import { umgebung } from '../umgebung.ts';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const pdfPruefen = process.argv.includes('--pdf-pruefen');
const ausfuehren = process.argv.includes('--ausfuehren');
const nurJahr = arg('--jahr');

const zaehler = <K extends string>() => {
  const m = new Map<K, number>();
  return { plus: (k: K) => m.set(k, (m.get(k) ?? 0) + 1), liste: () => [...m.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))) };
};

try {
  const lex = new LexwareClient(process.env.LEXWARE_API_KEY);
  const belege: Beleg[] = [];
  for await (const b of lex.belege({ typ: 'invoice', status: ALLE_STATUS })) {
    if (nurJahr && !(b.voucherDate ?? '').startsWith(nurJahr)) continue;
    belege.push(b);
  }
  const jahre = zaehler<string>();
  const status = zaehler<string>();
  const kunden = new Set<string>();
  let summe = 0;
  let offen = 0;
  let ohneKontakt = 0;
  for (const b of belege) {
    jahre.plus((b.voucherDate ?? '????').slice(0, 4));
    status.plus(b.voucherStatus);
    if (b.contactId) kunden.add(b.contactId); else ohneKontakt++;
    if (b.voucherStatus !== 'voided' && b.voucherStatus !== 'draft') summe += b.totalAmount ?? 0;
    offen += b.openAmount ?? 0;
  }
  const entwuerfe = belege.filter((b) => b.voucherStatus === 'draft').length;
  console.log(`✓ ${belege.length} Ausgangsrechnungen in Lexware${nurJahr ? ` (Jahr ${nurJahr})` : ''} · ${kunden.size} verschiedene Kunden${ohneKontakt ? ` · ${ohneKontakt} ohne Kontakt (freie Adresse)` : ''}`);
  console.log(`  je Jahr:   ${jahre.liste().map(([j, n]) => `${j}: ${n}`).join(' · ')}`);
  console.log(`  je Status: ${status.liste().map(([s, n]) => `${s}: ${n}`).join(' · ')}`);
  console.log(`  Summe gestellt (ohne Entwürfe und Storno) ${summe.toFixed(2)} € · davon offen ${offen.toFixed(2)} €`);
  console.log(`  PDF: Lexware erzeugt die Datei beim Festschreiben – erwartet für ${belege.length - entwuerfe} Rechnungen, keine für ${entwuerfe} Entwürfe`);

  if (pdfPruefen) {
    let da = 0;
    let fehlt = 0;
    let bytes = 0;
    const fehltBei = zaehler<string>();
    for (const b of belege) {
      const e = await lex.rechnungDateiVorhanden(b.id);
      if (e.vorhanden) { da++; bytes += e.groesse ?? 0; } else { fehlt++; fehltBei.plus(`${b.voucherStatus}/${e.status}`); }
    }
    console.log(`  Datei geprüft: ${da} vorhanden${bytes ? ` (${(bytes / 1024 / 1024).toFixed(1)} MB, Ø ${(bytes / Math.max(da, 1) / 1024).toFixed(0)} KB)` : ''} · ${fehlt} fehlen${fehlt ? ` (${fehltBei.liste().map(([k, n]) => `${k}: ${n}`).join(', ')})` : ''}`);
  }

  if (process.env.DATABASE_URL) {
    const db = verbinde();
    try {
      const { rows } = await db.query<{ kontakt: string | null }>('SELECT lexware_kontakt_id AS kontakt FROM patient WHERE lexware_kontakt_id IS NOT NULL OR lexware_kundennummer IS NOT NULL');
      const verknuepft = new Set(rows.map((r) => r.kontakt).filter(Boolean) as string[]);
      const mitPatient = belege.filter((b) => b.contactId && verknuepft.has(b.contactId));
      const vorhanden = (await db.query<{ n: string }>('SELECT count(*)::text AS n FROM rechnung WHERE lexware_invoice_id IS NOT NULL')).rows[0]!.n;
      console.log(`  Kartei: ${rows.length} Patienten mit Lexware-Verknüpfung · ${mitPatient.length} Rechnungen gehören zu ${new Set(mitPatient.map((b) => b.contactId)).size} davon · ${belege.length - mitPatient.length} ohne verknüpften Patienten · ${vorhanden} Rechnungen schon mit Lexware-ID in der Kartei`);
      if (ausfuehren) {
        if (umgebung() === 'test') throw new Error('Die Testumgebung übernimmt keine echten Rechnungen (N28)');
        if (!process.env.PRAXIS_TRESOR_SCHLUESSEL) throw new Error('PRAXIS_TRESOR_SCHLUESSEL fehlt – die Dateien gehören in den Tresor');
        const e = await rechnungenUebernehmen(db, tresor(), lexwareRechnungen(lex), { wer: 'cli:lexware-rechnungen' });
        console.log(`✓ Übernahme: ${uebernahmeText(e)}`);
      }
    } finally {
      await db.ende();
    }
  } else {
    console.log(`  Ohne DATABASE_URL keine Zuordnung zu Patienten${ausfuehren ? ' und keine Übernahme' : ''} – das liefert die Produktion (kubectl -n praxis exec deploy/praxis-dienst -- node src/cli/lexware-rechnungen.ts${ausfuehren ? ' --ausfuehren' : ''}).`);
  }
} catch (err) {
  if (err instanceof LexwareNichtBereit) {
    console.error(`✗ ${err.message}`);
    process.exitCode = 1;
  } else throw err;
}
