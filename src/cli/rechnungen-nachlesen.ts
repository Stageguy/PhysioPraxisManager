/**
 * Kopfdaten bereits abgelegter Rechnungen nachlesen (Betrag, Netto, USt, Nummer, Datum), etwa nach
 * einer besseren Erkennung. Liest die PDFs aus OneDrive, ändert nur leere Felder bzw. Netto/USt.
 * Gibt nur Zahlen aus.
 *
 *   npm run rechnungen:nachlesen               # Probelauf
 *   npm run rechnungen:nachlesen -- --ausfuehren
 */
import { parseArgs } from 'node:util';
import { ALLE_SCOPES, createTokenProvider } from '../auth.ts';
import { loadEnv } from '../config.ts';
import { protokolliere, verbinde } from '../db/index.ts';
import { laufwerkPfad } from '../drive.ts';
import { ladeEinstellungen } from '../einstellungen.ts';
import { GraphClient } from '../graph.ts';
import { kopfdaten } from '../rechnungen/kopfdaten.ts';
import { pdfText } from '../rechnungen/pdf.ts';

const { values } = parseArgs({ options: { ausfuehren: { type: 'boolean', default: false } } });
const graph = new GraphClient(createTokenProvider(loadEnv(), ALLE_SCOPES, { interaktiv: false }));
const lw = laufwerkPfad((await ladeEinstellungen()).rechnungen.laufwerk);
const db = verbinde();
try {
  const { rows } = await db.query<{ id: string; item: string; betrag: string | null; netto: string | null }>(
    `SELECT id::text, onedrive_item_id AS item, betrag::text, netto::text FROM inbound_document
     WHERE klasse = 'rechnung' AND onedrive_item_id IS NOT NULL AND (netto IS NULL OR betrag IS NULL OR rechnungsnummer IS NULL)`,
  );
  let neu = 0;
  for (const r of rows) {
    const k = kopfdaten(await pdfText(await graph.getBytes(`${lw}/items/${r.item}/content`)));
    // Ein von Hand korrigierter Betrag zählt: Netto/USt nur, wenn sie zu ihm passen
    const betrag = r.betrag === null ? k.betrag : Number(r.betrag);
    const passt = k.betrag !== undefined && betrag !== undefined && Math.round(k.betrag * 100) === Math.round(betrag * 100);
    const gewinn = (r.betrag === null && k.betrag !== undefined) || (r.netto === null && passt && k.netto !== undefined);
    if (!gewinn) continue;
    neu++;
    if (!values.ausfuehren) continue;
    await db.query(
      `UPDATE inbound_document SET betrag = coalesce(betrag, $2), rechnungsnummer = coalesce(rechnungsnummer, $3),
         rechnungsdatum = coalesce(rechnungsdatum, $4), netto = CASE WHEN $5 THEN $6 ELSE netto END,
         ust_betrag = CASE WHEN $5 THEN $7 ELSE ust_betrag END, ust_satz = CASE WHEN $5 THEN $8 ELSE ust_satz END, updated_at = now()
       WHERE id = $1`,
      [r.id, k.betrag ?? null, k.rechnungsnummer ?? null, k.rechnungsdatum ?? null, passt || r.betrag === null, k.netto ?? null, k.ust ?? null, k.ustSatz ?? null],
    );
    await protokolliere(db, { actor: 'system:nachlesen', action: 'rechnung_nachgelesen', objectType: 'inbound_document', objectId: r.id });
  }
  console.log(`${values.ausfuehren ? '✓' : '→ Probelauf:'} ${rows.length} Rechnungen mit Lücken · ${neu} ${values.ausfuehren ? 'ergänzt' : 'würden ergänzt'}`);
} finally {
  await db.ende();
}
