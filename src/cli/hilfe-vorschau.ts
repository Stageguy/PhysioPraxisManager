/**
 * Hilfeseite als eigenständige HTML-Datei – zum Ansehen ohne laufenden Praxisdienst.
 *
 *   npm run hilfe:vorschau -- /pfad/zur/hilfe.html
 */
import { readFile, writeFile } from 'node:fs/promises';
import { hilfeSeite, hilfeSkript } from '../web/hilfe.ts';

const ziel = process.argv[2];
if (!ziel) throw new Error('Zieldatei fehlt: npm run hilfe:vorschau -- /pfad/hilfe.html');
const { version } = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
await writeFile(ziel, hilfeSeite({ wer: 'Vorschau', fassung: version, skriptInline: hilfeSkript() }));
console.log(`✓ ${ziel}`);
