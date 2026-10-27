/**
 * Lexware-Kunden zählen oder auflisten (W99) – nur lesend, verändert nichts.
 *
 *   npm run lexware:kunden              Zahlen: Personen, Firmen, mit Mail, Telefon, Adresse, archiviert
 *   npm run lexware:kunden -- --liste   dazu je Kunde Kundennummer, Name, Ort (nur für den eigenen Bildschirm –
 *                                       nichts davon ins Repository oder in den Chat)
 *
 * Der Schlüssel kommt aus .env (LEXWARE_API_KEY). In der Praxis-Assistenz steht dieselbe Sicht unter
 * Patienten › „Aus Lexware“, dort abgeglichen mit der Kartei.
 */
import { LexwareClient, LexwareNichtBereit } from '../lexware/client.ts';
import { kundenName, lexwareKunden } from '../lexware/kunden.ts';

const liste = process.argv.includes('--liste');
try {
  const quelle = lexwareKunden(new LexwareClient(process.env.LEXWARE_API_KEY));
  const { kunden } = await quelle.alle();
  const zaehle = (f: (k: (typeof kunden)[number]) => boolean) => kunden.filter(f).length;
  console.log(`✓ ${kunden.length} Kunden in Lexware · ${zaehle((k) => k.art === 'person')} Personen · ${zaehle((k) => k.art === 'firma')} Firmen (davon ${zaehle((k) => k.art === 'firma' && Boolean(k.vorname))} mit Personennamen)`);
  console.log(`  mit Mail ${zaehle((k) => Boolean(k.email))} · mit Telefon ${zaehle((k) => Boolean(k.telefon))} · mit Adresse ${zaehle((k) => Boolean(k.adresse))} · mit Notiz ${zaehle((k) => k.notiz)} · archiviert ${zaehle((k) => k.archiviert)}`);
  if (liste) {
    for (const k of kunden) console.log(`  ${k.nummer.padStart(6)}  ${kundenName(k).padEnd(40)}  ${k.adresse?.ort ?? '–'}${k.archiviert ? '  (archiviert)' : ''}`);
  } else {
    console.log('  Namen mit --liste; in der Praxis-Assistenz unter Patienten › „Aus Lexware“.');
  }
} catch (err) {
  if (err instanceof LexwareNichtBereit) {
    console.error(`✗ ${err.message}`);
    process.exitCode = 1;
  } else throw err;
}
