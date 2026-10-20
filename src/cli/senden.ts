/**
 * Eine Mail aus praxis@lilli-nebel.de senden.
 *
 *   npm run senden -- --an empfaenger@example.org --betreff "Terminbestätigung" --text "…"
 *   npm run senden -- --an a@example.org --an b@example.org --betreff "…" --datei brief.txt
 *   … --ausfuehren      # erst damit geht die Mail wirklich raus
 */
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { ALLE_SCOPES, createTokenProvider } from '../auth.ts';
import { loadEnv } from '../config.ts';
import { GraphClient } from '../graph.ts';
import { mailSenden, type NeueMail } from '../mail/senden.ts';

const { values } = parseArgs({
  options: {
    an: { type: 'string', multiple: true, default: [] },
    cc: { type: 'string', multiple: true, default: [] },
    betreff: { type: 'string', default: '' },
    text: { type: 'string' },
    datei: { type: 'string' },
    ausfuehren: { type: 'boolean', default: false },
  },
});

const text = values.datei ? await readFile(values.datei, 'utf8') : (values.text ?? '');
const mail: NeueMail = { an: values.an, cc: values.cc, betreff: values.betreff, text };

const env = loadEnv();
const graph = new GraphClient(createTokenProvider(env, ALLE_SCOPES, { interaktiv: false }));
const { gesendet } = await mailSenden(graph, mail, { ausfuehren: values.ausfuehren });

console.log(`Von:     ${env.konto}`);
console.log(`An:      ${mail.an.join(', ')}${mail.cc?.length ? `\nCc:      ${mail.cc.join(', ')}` : ''}`);
console.log(`Betreff: ${mail.betreff}`);
console.log(`Text:    ${text.length} Zeichen`);
console.log(gesendet ? '✓ Gesendet' : '→ Probelauf – nichts gesendet (senden mit --ausfuehren)');
