/**
 * Finanzordner für ein Jahr nach der Vorlage des Vorjahres anlegen (src/ablage/finanzjahr.ts).
 *
 *   npm run finanzjahr -- --jahr 2026                  # Probelauf: zeigt, was angelegt würde
 *   npm run finanzjahr -- --jahr 2026 --ausfuehren
 *   npm run finanzjahr -- --jahr 2027 --vorlage 2026
 */
import { parseArgs } from 'node:util';
import { finanzjahrAnlegen } from '../ablage/finanzjahr.ts';
import { ALLE_SCOPES, createTokenProvider } from '../auth.ts';
import { loadEnv } from '../config.ts';
import { ladeEinstellungen } from '../einstellungen.ts';
import { GraphClient } from '../graph.ts';

const { values } = parseArgs({
  options: { jahr: { type: 'string' }, vorlage: { type: 'string' }, ausfuehren: { type: 'boolean', default: false } },
});
const jahr = Number(values.jahr);
if (!Number.isInteger(jahr) || jahr < 2000) throw new Error('--jahr braucht eine Jahreszahl, z. B. --jahr 2026');

const { ablage } = await ladeEinstellungen();
if (!ablage) throw new Error('config/praxis.json: Abschnitt "ablage" fehlt');
const graph = new GraphClient(createTokenProvider(loadEnv(), ALLE_SCOPES, { interaktiv: false }));
const r = await finanzjahrAnlegen(graph, ablage, jahr, {
  ausfuehren: values.ausfuehren,
  vorlageJahr: values.vorlage ? Number(values.vorlage) : undefined,
});

console.log(`Vorlage: ${r.vorlage}\nZiel:    ${r.ziel}`);
for (const p of r.angelegt) console.log(`  ✓ angelegt   ${p}`);
for (const p of r.geplant) console.log(`  → würde angelegt ${p}`);
for (const p of r.vorhanden) console.log(`  · schon da   ${p}`);
if (r.geplant.length) console.log('Probelauf – anlegen mit --ausfuehren');
