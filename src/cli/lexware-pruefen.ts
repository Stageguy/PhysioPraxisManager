/**
 * Lexware-Schlüssel prüfen (A13) – nur lesend: Profil (Firma, Organisation) und eine Zählung der offenen
 * Ausgangsrechnungen. Verändert nichts, weder in Lexware noch hier.
 *
 *   npm run lexware:pruefen
 *
 * Der Schlüssel kommt aus .env (LEXWARE_API_KEY) – nie ins Repository, nie in den Chat.
 */
import { LexwareClient, LexwareNichtBereit } from '../lexware/client.ts';

const lex = new LexwareClient(process.env.LEXWARE_API_KEY);
try {
  const p = await lex.profil();
  console.log(`✓ Schlüssel gültig · Firma: ${p.companyName ?? '(ohne Namen)'} · Organisation ${p.organizationId}`);
  let offen = 0;
  let betrag = 0;
  for await (const b of lex.belege({ typ: 'invoice', status: ['open', 'overdue'] })) {
    offen++;
    betrag += b.openAmount ?? 0;
    if (offen >= 250) break;
  }
  console.log(`✓ Lesen funktioniert · ${offen} offene Ausgangsrechnungen${offen ? ` · offen ${betrag.toFixed(2)} €` : ''}${offen >= 250 ? ' (mehr vorhanden)' : ''}`);
  console.log('  Nächste Schritte: deploy/strato-dev.sh prod trägt den Schlüssel nur in die Produktion ein (Test bleibt ohne); dann Zahlungsabgleich (A14b) und Ausgangsrechnungen (E28).');
} catch (err) {
  if (err instanceof LexwareNichtBereit) {
    console.error(`✗ ${err.message}`);
    process.exitCode = 1;
  } else throw err;
}
