/**
 * Eine Mail als Entwurf im Praxispostfach anlegen – gesendet wird sie von Lilli.
 *
 *   npm run entwurf -- --an empfaenger@example.org --betreff "Terminbestätigung" --text "…"
 *   npm run entwurf -- --an a@example.org --betreff "…" --datei brief.txt
 *   … --ausfuehren      # erst damit wird der Entwurf wirklich angelegt
 */
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { ALLE_SCOPES, createTokenProvider } from '../auth.ts';
import { loadEnv } from '../config.ts';
import { GraphClient } from '../graph.ts';
import { entwurfAnlegen, type NeueMail } from '../mail/entwurf.ts';

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
const r = await entwurfAnlegen(graph, mail, { ausfuehren: values.ausfuehren });

console.log(`Von:     ${env.konto}`);
console.log(`An:      ${mail.an.join(', ')}${mail.cc?.length ? `\nCc:      ${mail.cc.join(', ')}` : ''}`);
console.log(`Betreff: ${mail.betreff}`);
console.log(`Text:    ${text.length} Zeichen`);
console.log(
  r.angelegt
    ? `✓ Entwurf liegt im Postfach unter „Entwürfe“ – senden in Outlook oder Apple Mail\n  ${r.webLink}`
    : '→ Probelauf – nichts angelegt (Entwurf anlegen mit --ausfuehren)',
);
