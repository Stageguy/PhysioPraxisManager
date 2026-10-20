/**
 * Rechnungseingang (Prompt 4): Lieferantenrechnungen aus dem Praxispostfach erkennen und ablegen.
 *
 *   npm run rechnungen                     # Probelauf: liest nur, verändert nichts, nur Zahlen
 *   npm run rechnungen -- --details        # dazu Lieferant und geplanter Ablageort (nie Patientenpost)
 *   npm run rechnungen -- --hoechstens 5   # nur die ersten 5 Mails
 *   npm run rechnungen -- --ausfuehren     # ablegen, markieren, verschieben – braucht DATABASE_URL
 *                                          # und rechnungen.ziel in config/praxis.json
 */
import { parseArgs } from 'node:util';
import { ALLE_SCOPES, createTokenProvider } from '../auth.ts';
import { loadEnv } from '../config.ts';
import { verbinde, type Verbindung } from '../db/index.ts';
import { ladeEinstellungen } from '../einstellungen.ts';
import { GraphClient } from '../graph.ts';
import { rechnungseingang } from '../rechnungen/eingang.ts';

const { values } = parseArgs({
  options: {
    ausfuehren: { type: 'boolean', default: false },
    details: { type: 'boolean', default: false },
    hoechstens: { type: 'string' },
  },
});
const hoechstens = values.hoechstens === undefined ? undefined : Number(values.hoechstens);
if (hoechstens !== undefined && !(Number.isInteger(hoechstens) && hoechstens > 0)) {
  throw new Error('--hoechstens braucht eine positive ganze Zahl');
}

const env = loadEnv();
const { rechnungen: einst } = await ladeEinstellungen();
const graph = new GraphClient(createTokenProvider(env, ALLE_SCOPES, { interaktiv: false }));
const db: Verbindung | undefined = values.ausfuehren || process.env.DATABASE_URL ? verbinde() : undefined;

console.log(values.ausfuehren ? '→ Rechnungen werden abgelegt' : '→ Probelauf – es wird nichts verändert (ablegen mit --ausfuehren)');
console.log(`  Mails ab ${einst.seit} · Zielordner: ${einst.ziel ?? 'noch nicht festgelegt'} · ${einst.lieferanten.length} bekannte Lieferanten`);

try {
  const b = await rechnungseingang(graph, einst, { ausfuehren: values.ausfuehren, db, hoechstens });
  console.log(`  Quelle: ${b.quelle === 'rechnungsordner' ? einst.mailordner : 'Posteingang (Ordner „' + einst.mailordner + '“ fehlt)'}`);
  if (values.details) {
    for (const a of b.abgelegt) console.log(`  ${a.geplant ? '[geplant]' : '[abgelegt]'} ${a.lieferant} → ${a.pfad}`);
  }
  console.log(
    `${b.fehler ? '⚠' : '✓'} ${b.mails} Mails · ${b.rechnungen} Rechnungen · ${b.duplikate} Dubletten · ${b.unklar} unklar · ` +
      `${b.patient} Patientenpost (nur markiert) · ${b.eigene} eigene Ausgangsrechnungen (übersprungen) · ${b.keineRechnung} keine Rechnung · ${b.ignoriert} andere Anhänge · ` +
      `${b.bekannt} schon bekannt · ${b.verschoben} verschoben · ${b.fehler} Fehler`,
  );
  process.exitCode = b.fehler ? 1 : 0;
} finally {
  await db?.ende();
}
