/**
 * Startet den Praxisdienst (Statusseite und /api/health) – im Container hinter tailscale serve.
 *
 *   npm run serve
 *
 * PORT (Standard 3300), ERLAUBTE_NUTZER (Tailnet-Konten, durch Komma getrennt), DATABASE_URL
 * (optional – ohne sie zeigt das Cockpit „nicht verbunden“), LOKALER_ZUGANG (nur Bauphase ohne Tailscale).
 */
import { readFile } from 'node:fs/promises';
import { ALLE_SCOPES, createTokenProvider } from '../auth.ts';
import { loadEnv } from '../config.ts';
import { GraphClient } from '../graph.ts';
import { verbindungPruefen } from '../pruefung.ts';
import { cockpitDaten } from '../cockpit/daten.ts';
import { ladeEinstellungen } from '../einstellungen.ts';
import { preislistenDienst } from '../preise/dienst.ts';
import { karteiDienst } from '../kartei/dienst.ts';
import { tresor } from '../tresor.ts';
import { entwicklungsDb } from '../entwicklung/rueckmeldung.ts';
import { rechnungsDienst } from '../rechnungen/dienst.ts';
import { migriere, verbinde } from '../db/index.ts';
import { praxisDienst } from '../server.ts';
import { whatsappAusUmgebung, WhatsAppCloud } from '../whatsapp/schnittstelle.ts';
import { anfragenDienst } from '../anfragen/dienst.ts';
import { anfragenEingang } from '../anfragen/eingang.ts';
import { einstellungen } from '../kartei/konfiguration.ts';

const env = loadEnv();
const port = Number(process.env.PORT ?? 3300);
const erlaubt = (process.env.ERLAUBTE_NUTZER ?? '').split(',').filter((s) => s.trim());
if (!erlaubt.length) console.warn('⚠ ERLAUBTE_NUTZER ist leer – die Statusseite lässt niemanden herein');

const { version } = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
const token = createTokenProvider(env, ALLE_SCOPES, { interaktiv: false });
// Auf die Statusseite wartet jemand: kurze Fristen statt der langen für Läufe
const graph = new GraphClient(token, { timeoutMs: 15_000, tokenTimeoutMs: 15_000, maxRetries: 1, maxWaitMs: 5_000 });

const db = process.env.DATABASE_URL ? verbinde() : undefined;
if (db) {
  // Beim gemeinsamen Start (k3s) ist die Datenbank oft noch nicht bereit – warten statt abstürzen
  for (let versuch = 1; ; versuch++) {
    try {
      console.log(`Datenbank: ${(await migriere(db)).join(', ') || 'Schema aktuell'}`);
      break;
    } catch (err) {
      if (versuch >= 24) throw err;
      console.warn(`Datenbank noch nicht erreichbar (${(err as { code?: string }).code ?? (err as Error).message}) – neuer Versuch in 5 s`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}
const lokalerZugang = process.env.LOKALER_ZUGANG || undefined;
if (lokalerZugang) {
  console.warn(`⚠ LOKALER_ZUGANG gesetzt: Anfragen von 127.0.0.1 ohne Tailscale gelten als ${lokalerZugang} – nur für die Bauphase`);
  if (!erlaubt.map((e) => e.trim().toLowerCase()).includes(lokalerZugang.toLowerCase())) erlaubt.push(lokalerZugang);
}

// Rückmeldungen (W72) in eigener Entwicklungs-Datenbank auf demselben Server
let entwicklung: Awaited<ReturnType<typeof entwicklungsDb>> | undefined;
if (process.env.DATABASE_URL) {
  try {
    entwicklung = await entwicklungsDb(process.env.DATABASE_URL);
  } catch (err) {
    console.warn(`⚠ Entwicklungs-Datenbank nicht erreichbar – Rückmeldungen bleiben aus (${(err as Error).message})`);
  }
}

// WhatsApp Cloud API (W90) nur mit Zugangsdaten – sonst bleibt es beim Click-to-Chat-Link
const whatsappEinstellungen = whatsappAusUmgebung();
const whatsapp = whatsappEinstellungen ? new WhatsAppCloud(whatsappEinstellungen) : undefined;
if (whatsapp) console.log(`WhatsApp Cloud API eingerichtet${whatsappEinstellungen?.appSecret ? ', Webhook /whatsapp/webhook aktiv' : ' – ohne WHATSAPP_APP_SECRET kein Webhook'}`);

const schluessel = db && process.env.PRAXIS_TRESOR_SCHLUESSEL ? tresor() : undefined;
const anfragen = db && schluessel ? anfragenDienst({ db, tresor: schluessel, graph }) : undefined;

const dienst = praxisDienst({
  erlaubt,
  fassung: version,
  lokalerZugang,
  pruefen: () => verbindungPruefen(graph, token),
  angemeldet: () => token().then(() => true, () => false),
  cockpit: ({ namenZeigen }) => cockpitDaten({ db, graph, namenZeigen, anfragen: anfragen?.stand }),
  rechnungen: db ? rechnungsDienst({ db, graph, laufwerk: (await ladeEinstellungen()).rechnungen.laufwerk }) : undefined,
  preislisten: db ? preislistenDienst({ db }) : undefined,
  kartei: db && schluessel ? karteiDienst({ db, tresor: schluessel, graph, whatsapp }) : undefined,
  anfragen,
  entwicklung,
  whatsapp: whatsappEinstellungen ? { verifyToken: whatsappEinstellungen.verifyToken, appSecret: whatsappEinstellungen.appSecret } : undefined,
});
if (db && !process.env.PRAXIS_TRESOR_SCHLUESSEL) console.warn('⚠ PRAXIS_TRESOR_SCHLUESSEL fehlt – die Patientenkartei bleibt aus');

// Terminanfragen aus dem Postfach (A15): alle ANFRAGEN_TAKT_MIN Minuten (Standard 10, 0 = aus); dazu Reservierungen unbestätigter Vorschläge nach 48 h aufräumen
const takt = Number(process.env.ANFRAGEN_TAKT_MIN ?? 10);
if (db && schluessel && anfragen && takt > 0) {
  const lauf = async () => {
    try {
      const ordner = (await einstellungen(db)).anfragen_mailordner ?? 'Posteingang/Terminanfragen';
      const b = await anfragenEingang(graph, db, schluessel, { ordner, ausfuehren: true });
      if (b.quelle === 'fehlt') console.warn(`Terminanfragen: Ordner „${ordner}“ gibt es im Postfach nicht – bitte anlegen (Outlook-Regel)`);
      if (b.neu || b.fehler) console.log(`Terminanfragen: ${b.neu} neu, ${b.bekannt} bekannt, ${b.uebersprungen} übersprungen, ${b.fehler} Fehler`);
      const weg = await anfragen.aufraeumen();
      if (weg) console.log(`Terminanfragen: ${weg} Reservierungen nach 48 h aus dem Kalender genommen`);
    } catch (err) {
      console.warn(`Terminanfragen: ${(err as Error).message.slice(0, 200)}`);
    }
  };
  setTimeout(() => void lauf(), 20_000).unref();
  setInterval(() => void lauf(), takt * 60_000).unref();
  console.log(`Terminanfragen: Postfach alle ${takt} Minuten`);
}

// Nur 127.0.0.1: von außen ist der Dienst ausschließlich über tailscale serve erreichbar
dienst.listen(port, '127.0.0.1', () => console.log(`Praxisdienst ${version} auf 127.0.0.1:${port}`));
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => dienst.close(() => void Promise.all([db?.ende(), entwicklung?.ende()]).finally(() => process.exit(0))));
