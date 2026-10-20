/**
 * Übernahme des Bestands: Rechnungen aus allen Mail-Ordnern eines Zeitraums ablegen (Archiv,
 * Unterordner, auf Wunsch auch „Gelöschte Elemente“) – wie der Rechnungseingang, nur rückwirkend.
 *
 *   npm run rechnungen:uebernahme -- --von 2025-12-01                     # Probelauf, nur Zahlen
 *   npm run rechnungen:uebernahme -- --von 2025-12-01 --bezahlt-bis 2026-09-30 --mit-geloeschten
 *   … --ausfuehren                                                        # braucht DATABASE_URL + rechnungen.ziel
 *
 * --bezahlt-bis: Lilli bestätigt, dass Rechnungen aus Mails bis zu diesem Tag bezahlt sind. Sie
 *   kommen mit „Rechnung: bezahlt“ gleich ins Exchange-Archiv (Quelle „altbestand“). Alles danach
 *   bekommt „Rechnung: eingegangen“ und wartet auf den Zahlungsabgleich.
 * Unklares und Patientenpost werden in der Übernahme nur gezählt, nicht markiert.
 */
import { parseArgs } from 'node:util';
import { ALLE_SCOPES, createTokenProvider } from '../auth.ts';
import { loadEnv } from '../config.ts';
import { verbinde, type Verbindung } from '../db/index.ts';
import { ladeEinstellungen } from '../einstellungen.ts';
import { GraphClient } from '../graph.ts';
import { alleMailordner } from '../mail/ordner.ts';
import { rechnungseingang, type Nachricht } from '../rechnungen/eingang.ts';
import { berlinMitternachtUtc } from '../zeit.ts';

const { values } = parseArgs({
  options: {
    von: { type: 'string' },
    bis: { type: 'string' },
    'bezahlt-bis': { type: 'string' },
    'mit-geloeschten': { type: 'boolean', default: false },
    ausfuehren: { type: 'boolean', default: false },
    details: { type: 'boolean', default: false },
  },
});
const TAG = /^\d{4}-\d{2}-\d{2}$/;
if (!values.von || !TAG.test(values.von)) throw new Error('--von JJJJ-MM-TT fehlt');
for (const k of ['bis', 'bezahlt-bis'] as const) if (values[k] && !TAG.test(values[k]!)) throw new Error(`--${k} ist JJJJ-MM-TT`);

const env = loadEnv();
const { rechnungen: einst } = await ladeEinstellungen();
const graph = new GraphClient(createTokenProvider(env, ALLE_SCOPES, { interaktiv: false }), { maxRetries: 3 });
const db: Verbindung | undefined = values.ausfuehren || process.env.DATABASE_URL ? verbinde() : undefined;

const FELDER = 'id,subject,receivedDateTime,categories,from,hasAttachments,internetMessageId';
async function* nachrichten(): AsyncGenerator<Nachricht> {
  const teile = [`receivedDateTime ge ${berlinMitternachtUtc(values.von!)}`, 'hasAttachments eq true'];
  if (values.bis) teile.push(`receivedDateTime lt ${new Date(Date.parse(berlinMitternachtUtc(values.bis)) + 86_400_000).toISOString()}`);
  const filter = encodeURIComponent(teile.join(' and '));
  for await (const ordner of alleMailordner(graph, { mitGeloeschten: values['mit-geloeschten'] })) {
    yield* graph.paginate<Nachricht>(`/me/mailFolders/${ordner}/messages?$filter=${filter}&$select=${FELDER}&$top=50`, {
      Prefer: 'IdType="ImmutableId", odata.maxpagesize=50',
    });
  }
}

console.log(values.ausfuehren ? '→ Übernahme wird ausgeführt' : '→ Probelauf – es wird nichts verändert');
console.log(
  `  Mails ab ${values.von}${values.bis ? ` bis ${values.bis}` : ''}, alle Ordner${values['mit-geloeschten'] ? ' inkl. Gelöschte' : ''} · ` +
    `bezahlt bis: ${values['bezahlt-bis'] ?? '– (keine Rechnung gilt als bezahlt)'} · Ziel: ${einst.ziel ?? 'noch nicht festgelegt'}`,
);
try {
  const b = await rechnungseingang(graph, einst, {
    ausfuehren: values.ausfuehren,
    db,
    nachrichten: nachrichten(),
    altbestandBezahltBis: values['bezahlt-bis'],
  });
  if (values.details) for (const a of b.abgelegt) console.log(`  ${a.geplant ? '[geplant]' : '[abgelegt]'} ${a.lieferant} → ${a.pfad}`);
  console.log(
    `${b.fehler ? '⚠' : '✓'} ${b.mails} Mails · ${b.rechnungen} Rechnungen · ${b.duplikate} Dubletten · ${b.archiviert} gleich als bezahlt archiviert · ` +
      `${b.verschoben} nach „Verarbeitet“ · ${b.unklar} unklar (nur gezählt) · ${b.patient} Patientenpost (nur gezählt) · ` +
      `${b.eigene} eigene Ausgangsrechnungen · ${b.bekannt} schon bekannt · ${b.fehler} Fehler`,
  );
  process.exitCode = b.fehler ? 1 : 0;
} finally {
  await db?.ende();
}
