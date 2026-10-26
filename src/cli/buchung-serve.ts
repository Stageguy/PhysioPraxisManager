/**
 * Startet den öffentlichen Buchungsdienst (W96) – eigener Prozess, eigener Pod, kein Zugang zu
 * Datenbank, Tresor oder Postfach.
 *
 *   npm run buchung
 *
 * BUCHUNG_PORT (Standard 3310), BUCHUNG_SCHLUESSEL (gemeinsam mit dem Manager), BUCHUNG_DATEI
 * (Zustand, Standard <DATA_DIR>/buchung.json), PRAXIS_NAME, BUCHUNG_DATENSCHUTZ_URL.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buchungsdienst } from '../buchung/dienst.ts';
import { praxisName } from '../praxis.ts';

const port = Number(process.env.BUCHUNG_PORT ?? 3310);
const schluessel = process.env.BUCHUNG_SCHLUESSEL ?? '';
if (!schluessel) console.warn('⚠ BUCHUNG_SCHLUESSEL fehlt – der Manager kann kein Angebot schieben und keine Buchungen abholen');
const { version } = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };

const dienst = buchungsdienst({
  schluessel, praxis: praxisName(),
  datenschutzUrl: process.env.BUCHUNG_DATENSCHUTZ_URL || 'https://lilli-nebel.de/nachweise.html#datenschutz',
  datei: process.env.BUCHUNG_DATEI || path.join(process.env.DATA_DIR ?? '.data', 'buchung.json'),
});
await dienst.laden();
// Nur 127.0.0.1: nach außen über tailscale serve bzw. funnel
dienst.listen(port, '127.0.0.1', () => console.log(`Buchungsdienst ${version} auf 127.0.0.1:${port} – Angebot ${dienst.zustand().angebot?.erstellt ?? 'noch keins'}, ${dienst.zustand().buchungen.length} offene Buchungen`));
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => dienst.close(() => process.exit(0)));
