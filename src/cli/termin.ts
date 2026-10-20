/**
 * Einen Termin im Praxiskalender anlegen (deutsche Ortszeit, keine Einladungen).
 *
 *   npm run termin -- --titel "Teambesprechung" --beginn 2026-11-03T09:30 --ende 2026-11-03T10:00
 *   … --ort "Praxis" --notiz "…"
 *   … --ausfuehren      # erst damit wird der Termin wirklich angelegt
 */
import { parseArgs } from 'node:util';
import { ALLE_SCOPES, createTokenProvider } from '../auth.ts';
import { loadEnv } from '../config.ts';
import { GraphClient } from '../graph.ts';
import { terminAnlegen, type NeuerTermin } from '../kalender.ts';

const { values } = parseArgs({
  options: {
    titel: { type: 'string', default: '' },
    beginn: { type: 'string', default: '' },
    ende: { type: 'string', default: '' },
    ort: { type: 'string' },
    notiz: { type: 'string' },
    ausfuehren: { type: 'boolean', default: false },
  },
});

const termin: NeuerTermin = { titel: values.titel, beginn: values.beginn, ende: values.ende, ort: values.ort, notiz: values.notiz };
const env = loadEnv();
const graph = new GraphClient(createTokenProvider(env, ALLE_SCOPES, { interaktiv: false }));
const { angelegt } = await terminAnlegen(graph, termin, { ausfuehren: values.ausfuehren });

console.log(`Termin:  ${termin.titel}`);
console.log(`Zeit:    ${termin.beginn.replace('T', ' ')} bis ${termin.ende.replace('T', ' ')} (deutsche Zeit)`);
if (termin.ort) console.log(`Ort:     ${termin.ort}`);
console.log(angelegt ? '✓ Im Praxiskalender angelegt' : '→ Probelauf – nichts angelegt (anlegen mit --ausfuehren)');
