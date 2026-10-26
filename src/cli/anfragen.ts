/**
 * Terminanfragen aus dem Postfach lesen (A15, Prompt 6) – der Praxisdienst tut das selbst alle paar
 * Minuten; von Hand für Probeläufe und Nacharbeit:
 *
 *   npm run anfragen                  # Probelauf: zählt, was im Ordner liegt, legt nichts an
 *   npm run anfragen -- --ausfuehren  # Anfragen anlegen (braucht DATABASE_URL, PRAXIS_TRESOR_SCHLUESSEL)
 *   npm run anfragen -- --aufraeumen  # Reservierungen unbestätigter Vorschläge nach 48 h aus dem Kalender nehmen
 *   npm run anfragen -- --buchung     # Buchungsseite: Angebot schieben, Buchungen abholen (W96)
 */
import { parseArgs } from 'node:util';
import { anfragenDienst } from '../anfragen/dienst.ts';
import { anfragenEingang } from '../anfragen/eingang.ts';
import { ALLE_SCOPES, createTokenProvider } from '../auth.ts';
import { loadEnv } from '../config.ts';
import { verbinde } from '../db/index.ts';
import { GraphClient } from '../graph.ts';
import { einstellungen } from '../kartei/konfiguration.ts';
import { buchungAbgleich } from '../buchung/abgleich.ts';
import { buchungsClientAusUmgebung } from '../buchung/client.ts';
import { tresor } from '../tresor.ts';

const { values } = parseArgs({ options: { ausfuehren: { type: 'boolean', default: false }, aufraeumen: { type: 'boolean', default: false }, buchung: { type: 'boolean', default: false }, hoechstens: { type: 'string' } } });
const env = loadEnv();
const graph = new GraphClient(createTokenProvider(env, ALLE_SCOPES, { interaktiv: false }));
const db = verbinde();
const t = tresor();
try {
  const ordner = (await einstellungen(db)).anfragen_mailordner ?? 'Posteingang/Terminanfragen';
  if (values.buchung) {
    const client = buchungsClientAusUmgebung();
    if (!client) throw new Error('BUCHUNG_URL und BUCHUNG_SCHLUESSEL fehlen');
    const b = await buchungAbgleich(db, t, graph, client);
    console.log(`✓ Buchungsseite: ${b.buchungen} abgeholt, ${b.neu} neu, ${b.bekannt} bekannt, ${b.fehler} Fehler · Angebot: ${b.angebot.terminarten} Terminarten, ${b.angebot.tage} Tage`);
  } else if (values.aufraeumen) {
    const n = await anfragenDienst({ db, tresor: t, graph }).aufraeumen();
    console.log(`✓ ${n} Reservierungen aus dem Kalender genommen`);
  } else {
    console.log(values.ausfuehren ? `→ Anfragen aus „${ordner}“ werden angelegt` : `→ Probelauf: „${ordner}“ wird nur gezählt (anlegen mit --ausfuehren)`);
    const b = await anfragenEingang(graph, db, t, { ordner, ausfuehren: values.ausfuehren, hoechstens: values.hoechstens ? Number(values.hoechstens) : undefined });
    if (b.quelle === 'fehlt') console.log(`✗ Ordner „${ordner}“ gibt es im Postfach nicht – in Outlook anlegen und eine Regel darauf zeigen lassen`);
    else console.log(`${b.fehler ? '⚠' : '✓'} ${b.mails} Mails · ${b.neu} ${values.ausfuehren ? 'angelegt' : 'neu'} · ${b.bekannt} schon bekannt · ${b.uebersprungen} übersprungen (Schranke 1/5) · ${b.fehler} Fehler`);
    process.exitCode = b.fehler ? 1 : 0;
  }
} finally {
  await db.ende();
}
