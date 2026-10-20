/**
 * Mailanhänge aus dem Posteingang in OneDrive ablegen (Einstellungen: config/praxis.json).
 *
 *   npm run anhaenge                       # Probelauf: nur Zahlen, verändert nichts
 *   npm run anhaenge -- --details          # Probelauf mit Betreff und Dateinamen (Patientendaten!)
 *   npm run anhaenge -- --ausfuehren       # wirklich ablegen und Mails mit Kategorie markieren
 *   npm run anhaenge -- --hoechstens 5     # nur die ersten 5 Mails
 */
import { parseArgs } from 'node:util';
import { ALLE_SCOPES, createTokenProvider } from '../auth.ts';
import { loadEnv } from '../config.ts';
import { ladeEinstellungen } from '../einstellungen.ts';
import { GraphClient } from '../graph.ts';
import { anhaengeAblegen } from '../mail/anhaenge.ts';

const { values } = parseArgs({
  options: {
    ausfuehren: { type: 'boolean', default: false },
    details: { type: 'boolean', default: false },
    hoechstens: { type: 'string' },
  },
});

const env = loadEnv();
const { anhaenge } = await ladeEinstellungen();
const graph = new GraphClient(createTokenProvider(env, ALLE_SCOPES, { interaktiv: false }));
const hoechstens = values.hoechstens === undefined ? undefined : Number(values.hoechstens);
if (hoechstens !== undefined && !(Number.isInteger(hoechstens) && hoechstens > 0)) {
  throw new Error('--hoechstens braucht eine positive ganze Zahl');
}

console.log(values.ausfuehren ? '→ Anhänge werden abgelegt' : '→ Probelauf – es wird nichts verändert (ablegen mit --ausfuehren)');
console.log(`  Mails ab ${anhaenge.seit}, Ziel in OneDrive: ${anhaenge.ziel}/<Monat>, Kategorie „${anhaenge.kategorie}“`);

const b = await anhaengeAblegen(graph, anhaenge, { ausfuehren: values.ausfuehren, hoechstens });

if (values.details) {
  for (const e of b.einzeln) console.log(`  [${e.status}] ${e.betreff} · ${e.anhang}${e.detail ? ` → ${e.detail}` : ''}`);
}
console.log(
  `${b.fehler ? '⚠' : '✓'} ${b.mails} Mails · ${b.geplant} geplant · ${b.abgelegt} abgelegt · ` +
    `${b.uebersprungen} übersprungen · ${b.fehler} Fehler · ${b.markiert} markiert`,
);
process.exitCode = b.fehler ? 1 : 0;
