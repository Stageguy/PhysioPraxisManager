/**
 * Zahlungsabgleich: bezahlte Rechnungen bekommen „Rechnung: bezahlt“ und wandern ins Exchange-Archiv.
 *
 *   npm run zahlungen                       # Probelauf; Quelle automatisch: lexware, wenn LEXWARE_API_KEY gesetzt
 *   npm run zahlungen -- --quelle outlook   # Übergang: von Lilli in Outlook als bezahlt markierte Mails archivieren
 *   npm run zahlungen -- --quelle lexware   # Lösung 3 (ab Tarif XL)
 *   … --ausfuehren
 */
import { parseArgs } from 'node:util';
import { ALLE_SCOPES, createTokenProvider } from '../auth.ts';
import { loadEnv } from '../config.ts';
import { verbinde } from '../db/index.ts';
import { GraphClient } from '../graph.ts';
import { LexwareClient } from '../lexware/client.ts';
import { abgleichLexware, abgleichOutlook } from '../zahlung/abgleich.ts';

const { values } = parseArgs({
  options: { quelle: { type: 'string' }, ausfuehren: { type: 'boolean', default: false } },
});
const quelle = values.quelle ?? (process.env.LEXWARE_API_KEY ? 'lexware' : 'outlook');
if (quelle !== 'lexware' && quelle !== 'outlook') throw new Error('--quelle ist lexware oder outlook');

const graph = new GraphClient(createTokenProvider(loadEnv(), ALLE_SCOPES, { interaktiv: false }));
const db = verbinde();
try {
  console.log(`${values.ausfuehren ? '→ Abgleich' : '→ Probelauf – es wird nichts verändert'} · Quelle: ${quelle === 'lexware' ? 'Lexware Office' : 'Outlook (von Hand gesetzt)'}`);
  let b;
  if (quelle === 'lexware') {
    const lex = new LexwareClient(process.env.LEXWARE_API_KEY);
    const profil = await lex.profil();
    console.log(`  Lexware: ${profil.companyName ?? profil.organizationId}`);
    b = await abgleichLexware(graph, db, lex, { ausfuehren: values.ausfuehren });
  } else {
    b = await abgleichOutlook(graph, db, { ausfuehren: values.ausfuehren });
  }
  console.log(
    `✓ ${b.offen ? `${b.offen} offene Rechnungen · ` : ''}${b.angestossen} Zahlung angestoßen · ${b.bezahlt} bezahlt · ` +
      `${b.archiviert} ins Archiv · ${b.ohneZuordnung} ohne Zuordnung · ${b.mehrdeutig} mehrdeutig · ${b.mailFehlt} Mail nicht mehr da`,
  );
} finally {
  await db.ende();
}
