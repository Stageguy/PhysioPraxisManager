/**
 * Preisgrundlagen prüfen (W59): GKV-Vergütungsliste, Beihilfe-Höchstbeträge, GebüTh-Auflage.
 * Neue Fassungen werden mit Original und allen Positionen gespeichert und am Menü „Preislisten“
 * mit einem roten Punkt gemeldet. Läuft nachts als CronJob (deploy/k8s/preisquellen.yaml).
 *
 *   npm run preisquellen                 # Probelauf: nur melden
 *   npm run preisquellen -- --ausfuehren # neue Fassungen speichern
 */
import { parseArgs } from 'node:util';
import { verbinde } from '../db/index.ts';
import { pruefText } from '../preise/dienst.ts';
import { allePruefen } from '../preise/quellen.ts';

const { values } = parseArgs({ options: { ausfuehren: { type: 'boolean', default: false } } });
const db = verbinde();
try {
  const e = await allePruefen(db, { speichern: values.ausfuehren });
  console.log(`${values.ausfuehren ? '✓' : '→ Probelauf:'} ${pruefText(e)}`);
  process.exitCode = e.some((x) => x.fehler) ? 1 : 0;
} finally {
  await db.ende();
}
