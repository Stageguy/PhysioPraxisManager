/**
 * Der Praxisdienst: Statusseite, Hilfe (/hilfe, /hilfe.js) und /api/health. Löst nichts aus – keine Ablage, kein
 * Versand, keine Termine; er zeigt nur, ob die Verbindung zu Microsoft 365 steht.
 *
 * Zugang: Im Container hört der Dienst nur auf 127.0.0.1 im Netz des Tailscale-Knotens. Von außen
 * kommt man nur über `tailscale serve` heran, und das setzt die Kopfzeile Tailscale-User-Login
 * mit dem angemeldeten Tailnet-Konto. Hereingelassen wird, wer in ERLAUBTE_NUTZER steht.
 * /api/health sagt nur ok oder nicht ok und braucht keine Anmeldung (für den Docker-Healthcheck).
 */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Db } from './db/index.ts';
import { offeneRueckmeldungen, rueckmeldungBild, rueckmeldungen, RueckmeldungFehler, rueckmeldungSpeichern, rueckmeldungStatus } from './entwicklung/rueckmeldung.ts';
import { RUECKMELDUNG_SKRIPT, rueckmeldungenSeite } from './web/rueckmeldung.ts';
import type { CockpitDaten } from './cockpit/daten.ts';
import type { Pruefpunkt } from './pruefung.ts';
import { AktionAbgelehnt, filterAus, type Aktion } from './rechnungen/dashboard.ts';
import type { RechnungsDienst } from './rechnungen/dienst.ts';
import { PreislisteFehler, type PreislistenDienst } from './preise/dienst.ts';
import { KarteiFehler, type KarteiDienst } from './kartei/dienst.ts';
import type { AnfragenDienst, AnfragenFilter } from './anfragen/dienst.ts';
import { anfrageSeite, anfragenSeite } from './web/anfragen.ts';
import { cockpitSeite } from './web/cockpit.ts';
import { akteSeite, behandlungNeuSeite, listeSeite, neuSeite as patientNeuSeite, patientSeite, rezeptNeuSeite, terminNeuSeite } from './web/patienten.ts';
import { rezepteSeite, serieNeuSeite, wellnessSeite } from './web/rezepte.ts';
import { fallNeuSeite, fallSeite, pinnwandSeite } from './web/pinnwand.ts';
import { rechnungSeite as ausgangsrechnungSeite } from './web/rechnung.ts';
import { konfigurationSeite } from './web/konfiguration.ts';
import { terminartenSeite } from './web/terminarten.ts';
import { kalenderSeite } from './web/kalender.ts';
import { steuerSeite } from './web/steuer.ts';
import { steuerCsv, steuerPdf } from './kartei/steuer.ts';
import { datumText, zeitText } from './format.ts';
import { eingehendeNachrichten, signaturGueltig, webhookBestaetigung } from './whatsapp/schnittstelle.ts';
import { berlinMitternachtUtc, heuteBerlin, tagPlus, wocheUm } from './zeit.ts';
import { menueStand } from './web/layout.ts';
import { auswahlSeite, detailsSeite, editorSeite, neuSeite, positionSeite, uebersichtSeite } from './web/preislisten.ts';
import { dashboardSeite, PRAXIS_SKRIPT, rechnungSeite } from './web/rechnungen.ts';
import { hilfeSeite, hilfeSkript } from './web/hilfe.ts';
import { esc, seite } from './web/layout.ts';

export interface DienstOptionen {
  /** Tailnet-Konten (Tailscale-User-Login), die die Statusseite sehen dürfen */
  erlaubt: string[];
  pruefen: () => Promise<Pruefpunkt[]>;
  angemeldet: () => Promise<boolean>;
  fassung: string;
  cockpit?: (o: { namenZeigen: boolean }) => Promise<CockpitDaten>;
  rechnungen?: RechnungsDienst;
  preislisten?: PreislistenDienst;
  kartei?: KarteiDienst;
  /** Terminanfragen (A15) */
  anfragen?: AnfragenDienst;
  /** Entwicklungs-Datenbank für Rückmeldungen (W72) – getrennt von den Patientendaten */
  entwicklung?: Db;
  /** WhatsApp Cloud API (W90): Webhook nur mit App-Secret (Signatur) und Verify-Token */
  whatsapp?: { verifyToken?: string; appSecret?: string };
  /**
   * Nur für die Bauphase ohne Tailscale (Zugang per SSH-Tunnel bzw. kubectl port-forward): Anfragen
   * von 127.0.0.1 ohne Tailscale-Kopfzeile gelten als dieses Konto. Nie zusammen mit dem
   * Tailscale-Knoten setzen – dort kämen Anfragen getaggter Geräte ebenfalls ohne Kopfzeile.
   */
  lokalerZugang?: string;
}

const NICHT_VERBUNDEN = { stand: 'nicht-verbunden' as const, hinweis: 'Noch nicht verbunden.' };

const istLoopback = (adresse = '') => adresse === '127.0.0.1' || adresse === '::1' || adresse === '::ffff:127.0.0.1';

/** Wer fragt? Das Tailnet-Konto, wenn die Anfrage über tailscale serve kam, sonst undefined */
export function tailnetKonto(req: IncomingMessage, lokalerZugang?: string): string | undefined {
  if (!istLoopback(req.socket.remoteAddress)) return undefined;
  const login = req.headers['tailscale-user-login'];
  if (typeof login === 'string' && login) return login.toLowerCase();
  return lokalerZugang?.toLowerCase();
}

/** Aktionen nur von unseren eigenen Seiten – schützt vor Formularen fremder Websites (CSRF) */
export function gleicheHerkunft(req: IncomingMessage): boolean {
  const site = req.headers['sec-fetch-site'];
  if (typeof site === 'string') return site === 'same-origin';
  const origin = req.headers.origin;
  try {
    return typeof origin === 'string' && new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

async function rumpf(req: IncomingMessage, max: number): Promise<string> {
  let text = '';
  for await (const teil of req) {
    text += teil;
    if (text.length > max) throw new AktionAbgelehnt('Formular zu groß');
  }
  return text;
}

const formular = async (req: IncomingMessage): Promise<URLSearchParams> => new URLSearchParams(await rumpf(req, 64 * 1024));

/** html2canvas für die Screenshots der Rückmeldungen – aus node_modules, einmal gelesen */
let html2canvasQuelle: Promise<string> | undefined;
const html2canvas = () => (html2canvasQuelle ??= readFile(createRequire(import.meta.url).resolve('html2canvas/dist/html2canvas.min.js'), 'utf8'));

function aktionAus(f: URLSearchParams): Aktion {
  switch (f.get('aktion')) {
    case 'freigeben': return { art: 'freigeben' };
    case 'spaeter': return { art: 'spaeter' };
    case 'ablehnen': return { art: 'ablehnen', grund: f.get('grund') ?? '' };
    case 'privat': return { art: 'privat', an: f.getAll('an').at(-1) === '1' };
    case 'speichern': return {
      art: 'speichern', lieferant: f.get('lieferant') ?? '', rechnungsnummer: f.get('rechnungsnummer') ?? '',
      betrag: f.get('betrag') ?? '', rechnungsdatum: f.get('rechnungsdatum') ?? '',
    };
    default: throw new AktionAbgelehnt('Unbekannte Aktion');
  }
}

const MELDUNG: Record<string, string> = {
  freigegeben: 'Rechnung freigegeben.', abgelehnt: 'Rechnung abgelehnt – die Datei liegt jetzt in „Abgelehnt“.',
  zurueckgestellt: 'Rechnung zurückgestellt.', privat: 'Als privat markiert – die Datei liegt jetzt in „Privat“.',
  'nicht-privat': 'Nicht mehr privat – die Rechnung ist zurück in „Eingangsrechnungen“.', gespeichert: 'Angaben gespeichert.',
  unveraendert: 'Nichts geändert.',
};

function umleiten(res: ServerResponse, ziel: string): void {
  res.writeHead(303, { Location: ziel, 'Cache-Control': 'no-store' });
  res.end();
}

/** Adresse um einen Abfrageparameter ergänzen – mit „?“ oder „&“, je nachdem, ob schon einer da ist */
const mitParameter = (url: string, name: string, wert: string) => `${url}${url.includes('?') ? '&' : '?'}${name}=${encodeURIComponent(wert)}`;

const FREMDE_HERKUNFT = 'Nur von den Seiten der Praxis-Assistenz';

/** Aktion von einer fremden Seite? Dann ist 403 schon gesendet */
function fremdeHerkunft(req: IncomingMessage, res: ServerResponse): boolean {
  if (gleicheHerkunft(req)) return false;
  senden(res, 403, 'text/plain', FREMDE_HERKUNFT);
  return true;
}

/**
 * Kopfzeilen für eine Datei (PDF, Bild, Original): zum Ansehen im eigenen Rahmen oder als Download.
 * `sandbox` für fremde Inhalte (hochgeladene Originale, Screenshots) – nichts davon darf unter unserer Adresse Skripte ausführen.
 */
function dateiKopf(res: ServerResponse, typ: string, name: string, o: { inline?: boolean; sandbox?: boolean } = {}): void {
  res.writeHead(200, {
    'Content-Type': typ, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Disposition': `${o.inline === false ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(name)}`,
    ...(o.sandbox ? { 'Content-Security-Policy': "default-src 'none'; sandbox" } : { 'X-Frame-Options': 'SAMEORIGIN' }),
  });
}

function senden(res: ServerResponse, status: number, typ: string, inhalt: string): void {
  res.writeHead(status, {
    'Content-Type': `${typ}; charset=utf-8`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; form-action 'self'; frame-ancestors 'self'",
    'Referrer-Policy': 'no-referrer',
  });
  res.end(inhalt);
}

/** Name des Prüfpunkts → Schlüssel seiner Erklärung ("OneDrive" → "status.onedrive") */
const hilfeSchluessel = (name: string) => `status.${name.toLowerCase()}`;

export function statusseite(punkte: Pruefpunkt[], wer: string, fassung: string, skriptInline?: string): string {
  const alleOk = punkte.every((p) => p.ok);
  const zeilen = punkte
    .map((p) => `<li class="${p.ok ? 'ok' : 'fehler'}" data-hilfe="${esc(hilfeSchluessel(p.name))}" tabindex="0"><span>${p.ok ? '✓' : '✗'}</span><b>${esc(p.name)}</b> ${esc(p.text)}</li>`)
    .join('\n');
  return seite({
    titel: 'Praxis Lilli Nebel – Verbindung', aktiv: 'status', wer, fassung, skriptInline,
    inhalt: `<h1>Praxis Lilli Nebel</h1>
<div>Verbindung zu Microsoft 365 (praxis@lilli-nebel.de)</div>
<p class="stand" data-hilfe="status.gesamt" tabindex="0" style="font-size:18px;margin:16px 0">${alleOk ? '✓ Alles in Ordnung.' : '⚠ Etwas funktioniert gerade nicht – bitte Christian Bescheid geben.'}</p>
<ul class="liste">
${zeilen}
</ul>`,
  });
}

export function praxisDienst(opt: DienstOptionen): Server {
  const erlaubt = new Set(opt.erlaubt.map((e) => e.trim().toLowerCase()).filter(Boolean));
  return createServer(async (req, res) => {
    // Der rote Punkt am Menü braucht je Anfrage die Zahl neuer Preisgrundlagen
    const neu = req.url?.startsWith('/api/') || !opt.preislisten ? 0 : await opt.preislisten.neueAnzahl().catch(() => 0);
    await menueStand.run({ preislistenNeu: neu }, () => bedienen(req, res));
  });

  async function bedienen(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const adresse = new URL(req.url ?? '/', 'http://localhost');
      const pfad = adresse.pathname;
      const istAktion = req.method === 'POST' && (/^\/finanzen\/rechnungen\/\d+\/aktion$/.test(pfad) || ['/preislisten/aktion', '/patienten/aktion', '/anfragen/aktion', '/rueckmeldung', '/rueckmeldungen/aktion', '/whatsapp/webhook'].includes(pfad));
      if (req.method !== 'GET' && !istAktion) return senden(res, 405, 'text/plain', 'Nur GET');

      if (pfad === '/api/health') {
        const ok = await opt.angemeldet();
        return senden(res, ok ? 200 : 503, 'application/json', JSON.stringify({ ok, fassung: opt.fassung }));
      }
      // WhatsApp-Webhook (W90): Meta ruft von außen – ohne Tailnet-Konto, dafür mit Signatur
      if (pfad === '/whatsapp/webhook') return await whatsappWebhook(req, res, adresse);

      const wer = tailnetKonto(req, opt.lokalerZugang);
      if (!wer || !erlaubt.has(wer)) {
        return senden(res, 403, 'text/plain', 'Kein Zugang. Bitte über Tailscale mit einem freigegebenen Konto öffnen.');
      }
      if (pfad === '/') {
        const namenZeigen = adresse.searchParams.get('namen') === '1';
        const daten: CockpitDaten = opt.cockpit
          ? await opt.cockpit({ namenZeigen })
          : { heute: new Date().toISOString().slice(0, 10), rechnungen: NICHT_VERBUNDEN, termine: NICHT_VERBUNDEN, anfragen: NICHT_VERBUNDEN, protokoll: NICHT_VERBUNDEN, namenZeigen };
        const jetzt = zeitText(new Date().toISOString());
        return senden(res, 200, 'text/html', cockpitSeite(daten, { wer, fassung: opt.fassung, jetzt }));
      }
      const meldung = MELDUNG[adresse.searchParams.get('ergebnis') ?? ''];
      const fehler = adresse.searchParams.get('fehler')?.slice(0, 200) || undefined;
      const st = /^\/finanzen\/rechnungen\/steuerfrei(\.csv|\.pdf)?$/.exec(pfad);
      if (st) {
        if (!opt.kartei) return senden(res, 503, 'text/plain', 'Die Liste braucht die Praxis-Datenbank');
        const jahrParam = Number(adresse.searchParams.get('jahr'));
        const jahr = Number.isInteger(jahrParam) && jahrParam > 2000 ? jahrParam : Number(heuteBerlin().slice(0, 4));
        // Erster Aufruf: maskiert. Formular: maskiert nur mit Haken. Exportlinks: namen=1 = ausgeschrieben
        const maskiert = adresse.searchParams.get('namen') === '1' ? false : adresse.searchParams.has('form') ? adresse.searchParams.has('maskiert') : true;
        const liste = await opt.kartei.steuer(jahr, maskiert);
        if (st[1] === '.csv') {
          dateiKopf(res, 'text/csv; charset=utf-8', `steuerfreie-umsaetze-${jahr}.csv`, { inline: false });
          return void res.end(steuerCsv(liste));
        }
        if (st[1] === '.pdf') {
          const pdf = steuerPdf(liste, { praxis: 'Praxis Lilli Nebel', erstellt: datumText(heuteBerlin()) });
          dateiKopf(res, 'application/pdf', `steuerfreie-umsaetze-${jahr}.pdf`);
          return void res.end(Buffer.from(pdf));
        }
        return senden(res, 200, 'text/html', steuerSeite(liste, { wer, fassung: opt.fassung }));
      }
      if (pfad === '/finanzen/rechnungen') {
        const filter = filterAus(adresse.searchParams);
        const d = opt.rechnungen
          ? await opt.rechnungen.dashboard(filter)
          : { stand: NICHT_VERBUNDEN, neu: [], privat: [], liste: [], filter };
        return senden(res, 200, 'text/html', dashboardSeite(d, { wer, fassung: opt.fassung, meldung, fehler }));
      }
      const rm = /^\/finanzen\/rechnungen\/(\d+)(?:\/(pdf|onedrive|aktion))?$/.exec(pfad);
      if (rm && opt.rechnungen) {
        const [, id, teil] = rm as unknown as [string, string, string | undefined];
        if (teil === 'aktion') {
          if (fremdeHerkunft(req, res)) return;
          const f = await formular(req);
          const zurueck = /^\/finanzen\/rechnungen(\/\d+)?$/.test(f.get('zurueck') ?? '') ? f.get('zurueck')! : `/finanzen/rechnungen/${id}`;
          try {
            const ergebnis = await opt.rechnungen.aktion(id, aktionAus(f), wer);
            return umleiten(res, mitParameter(zurueck, 'ergebnis', ergebnis));
          } catch (err) {
            if (err instanceof AktionAbgelehnt) return umleiten(res, mitParameter(zurueck, 'fehler', err.message));
            throw err;
          }
        }
        if (teil === 'pdf') {
          const p = await opt.rechnungen.pdf(id);
          if (!p) return senden(res, 404, 'text/plain', 'Kein PDF');
          // Ohne CSP, damit der PDF-Viewer des Browsers es zeigen darf; nur im eigenen Rahmen
          dateiKopf(res, 'application/pdf', p.name);
          const leser = p.antwort.body?.getReader();
          if (leser) for (let t = await leser.read(); !t.done; t = await leser.read()) res.write(t.value);
          return void res.end();
        }
        if (teil === 'onedrive') {
          const link = await opt.rechnungen.onedriveLink(id);
          if (!link?.startsWith('https://')) return senden(res, 404, 'text/plain', 'Kein OneDrive-Link');
          res.writeHead(302, { Location: link, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
          return void res.end();
        }
        const r = await opt.rechnungen.ansicht(id);
        if (!r) return senden(res, 404, 'text/plain', 'Diese Rechnung gibt es nicht');
        return senden(res, 200, 'text/html', rechnungSeite(r, { wer, fassung: opt.fassung, meldung, fehler }));
      }
      if (pfad === '/status') return senden(res, 200, 'text/html', statusseite(await opt.pruefen(), wer, opt.fassung));
      const freieMeldung = meldung ?? adresse.searchParams.get('meldung')?.slice(0, 300) ?? undefined;
      if (pfad.startsWith('/preislisten')) return await preislistenSeiten(req, res, pfad, adresse, wer, freieMeldung, fehler);
      if (pfad.startsWith('/patienten') || pfad.startsWith('/rezepte') || pfad.startsWith('/pinnwand') || pfad.startsWith('/konfiguration') || pfad === '/kalender') return await patientenSeiten(req, res, pfad, adresse, wer, freieMeldung, fehler);
      if (pfad.startsWith('/anfragen')) return await anfragenSeiten(req, res, pfad, adresse, wer, freieMeldung, fehler);
      if (pfad === '/rueckmeldung.js') return senden(res, 200, 'text/javascript', RUECKMELDUNG_SKRIPT);
      if (pfad === '/html2canvas.js') return senden(res, 200, 'text/javascript', await html2canvas());
      if (pfad.startsWith('/rueckmeldung')) return await rueckmeldungSeiten(req, res, pfad, adresse, wer, freieMeldung, fehler);
      if (pfad === '/hilfe') return senden(res, 200, 'text/html', hilfeSeite({ wer, fassung: opt.fassung }));
      if (pfad === '/hilfe.js') return senden(res, 200, 'text/javascript', hilfeSkript());
      if (pfad === '/praxis.js') return senden(res, 200, 'text/javascript', PRAXIS_SKRIPT);
      return senden(res, 404, 'text/plain', 'Nicht gefunden');
    } catch (err) {
      console.error('Fehler bei', req.method, req.url, (err as Error).message);
      if (!res.headersSent) senden(res, 500, 'text/plain', 'Interner Fehler');
    }
  }

  async function anfragenSeiten(req: IncomingMessage, res: ServerResponse, pfad: string, adresse: URL, wer: string, meldung?: string, fehler?: string): Promise<void> {
    const d = opt.anfragen;
    const r = { wer, fassung: opt.fassung, meldung, fehler };
    if (!d) return senden(res, 503, 'text/plain', 'Terminanfragen brauchen die Praxis-Datenbank und den Tresor-Schlüssel – noch nicht verbunden');
    if (pfad === '/anfragen/aktion') {
      if (fremdeHerkunft(req, res)) return;
      const f = await formular(req);
      const zurueck = /^\/anfragen(\/\d+)?$/.test(f.get('zurueck') ?? '') ? f.get('zurueck')! : '/anfragen';
      try {
        const e = await d.aktion(f, wer);
        const [pfadTeil, anker] = e.ziel.split('#');
        return umleiten(res, `${mitParameter(pfadTeil!, 'meldung', e.meldung)}${anker ? `#${anker}` : ''}`);
      } catch (err) {
        if (err instanceof KarteiFehler) return umleiten(res, mitParameter(zurueck, 'fehler', err.message));
        throw err;
      }
    }
    if (pfad === '/anfragen') {
      const filter = (['offen', 'alle', 'neu', 'vorgeschlagen', 'bestaetigt', 'abgesagt', 'erledigt', 'verworfen'] as AnfragenFilter[]).find((x) => x === adresse.searchParams.get('filter')) ?? 'offen';
      const stand = await d.stand();
      return senden(res, 200, 'text/html', anfragenSeite({ anfragen: await d.liste(filter), filter, stand, terminarten: await d.terminarten() }, r));
    }
    const m = /^\/anfragen\/(\d+)$/.exec(pfad);
    if (m) {
      const a = await d.details(m[1]!);
      return a ? senden(res, 200, 'text/html', anfrageSeite(a, r)) : senden(res, 404, 'text/plain', 'Diese Anfrage gibt es nicht');
    }
    return senden(res, 404, 'text/plain', 'Nicht gefunden');
  }

  /** GET: Einrichtung bei Meta bestätigen (Verify-Token). POST: signierte Nachrichten in den Kontaktverlauf */
  async function whatsappWebhook(req: IncomingMessage, res: ServerResponse, adresse: URL): Promise<void> {
    const w = opt.whatsapp;
    if (!w?.appSecret || !opt.kartei) return senden(res, 404, 'text/plain', 'Nicht eingerichtet');
    if (req.method === 'GET') {
      const challenge = webhookBestaetigung(w.verifyToken ?? '', adresse.searchParams);
      return challenge ? senden(res, 200, 'text/plain', challenge) : senden(res, 403, 'text/plain', 'Falsches Verify-Token');
    }
    const roh = await rumpf(req, 1024 * 1024);
    if (!signaturGueltig(w.appSecret, roh, req.headers['x-hub-signature-256'] as string | undefined)) return senden(res, 403, 'text/plain', 'Signatur ungültig');
    let body: unknown;
    try {
      body = JSON.parse(roh);
    } catch {
      return senden(res, 400, 'text/plain', 'Kein JSON');
    }
    const ergebnis = { zugeordnet: 0, medien: 0, unbekannt: 0 };
    for (const n of eingehendeNachrichten(body)) ergebnis[await opt.kartei.whatsappEingang(n)]++;
    return senden(res, 200, 'application/json', JSON.stringify(ergebnis));
  }

  async function rueckmeldungSeiten(req: IncomingMessage, res: ServerResponse, pfad: string, adresse: URL, wer: string, meldung?: string, fehler?: string): Promise<void> {
    const db = opt.entwicklung;
    const json = (status: number, inhalt: unknown) => senden(res, status, 'application/json', JSON.stringify(inhalt));
    if (!db) return pfad === '/rueckmeldung' ? json(503, { ok: false, fehler: 'Rückmeldungen sind hier nicht eingerichtet' }) : senden(res, 503, 'text/plain', 'Rückmeldungen sind hier nicht eingerichtet');
    if (pfad === '/rueckmeldung') {
      if (!gleicheHerkunft(req)) return json(403, { ok: false, fehler: FREMDE_HERKUNFT });
      try {
        const daten = JSON.parse(await rumpf(req, 6 * 1024 * 1024)) as Parameters<typeof rueckmeldungSpeichern>[1];
        return json(200, { ok: true, id: await rueckmeldungSpeichern(db, daten, wer) });
      } catch (err) {
        if (err instanceof RueckmeldungFehler || err instanceof AktionAbgelehnt || err instanceof SyntaxError) return json(400, { ok: false, fehler: err.message });
        throw err;
      }
    }
    if (pfad === '/rueckmeldungen/aktion') {
      if (fremdeHerkunft(req, res)) return;
      const f = await formular(req);
      const zurueck = /^\/rueckmeldungen(\?status=\w+)?$/.test(f.get('zurueck') ?? '') ? f.get('zurueck')! : '/rueckmeldungen';
      try {
        const status = f.get('aktion') === 'offen' ? 'offen' : 'erledigt';
        await rueckmeldungStatus(db, f.get('id') ?? '', status, wer, f.get('antwort') ?? undefined);
        return umleiten(res, mitParameter(zurueck, 'meldung', status === 'erledigt' ? 'Als erledigt markiert.' : 'Wieder geöffnet.'));
      } catch (err) {
        if (err instanceof RueckmeldungFehler) return umleiten(res, mitParameter(zurueck, 'fehler', err.message));
        throw err;
      }
    }
    const bild = /^\/rueckmeldungen\/(\d+)\/bild$/.exec(pfad);
    if (bild) {
      const b = await rueckmeldungBild(db, bild[1]!);
      if (!b) return senden(res, 404, 'text/plain', 'Kein Screenshot');
      dateiKopf(res, b.typ, `rueckmeldung-${bild[1]}`, { sandbox: true });
      return void res.end(Buffer.from(b.daten));
    }
    if (pfad === '/rueckmeldungen') {
      const status = (['offen', 'erledigt', 'alle'] as const).find((x) => x === adresse.searchParams.get('status')) ?? 'offen';
      return senden(res, 200, 'text/html', rueckmeldungenSeite({ liste: await rueckmeldungen(db, { status }), status, offen: await offeneRueckmeldungen(db) }, { wer, fassung: opt.fassung, meldung, fehler }));
    }
    return senden(res, 404, 'text/plain', 'Nicht gefunden');
  }

  async function patientenSeiten(req: IncomingMessage, res: ServerResponse, pfad: string, adresse: URL, wer: string, meldung?: string, fehler?: string): Promise<void> {
    const d = opt.kartei;
    const r = { wer, fassung: opt.fassung, meldung, fehler };
    if (!d) return senden(res, 503, 'text/plain', 'Die Patientenkartei braucht die Praxis-Datenbank und den Tresor-Schlüssel – noch nicht verbunden');
    if (pfad === '/patienten/aktion') {
      if (fremdeHerkunft(req, res)) return;
      const f = await formular(req);
      const zurueck = /^\/(patienten|rezepte|pinnwand|konfiguration)(\/[\w/-]*)?(\?[\w=&]+)?$/.test(f.get('zurueck') ?? '') ? f.get('zurueck')! : '/patienten';
      // Drag & Drop auf der Pinnwand fragt per fetch und will eine Antwort als JSON statt einer Umleitung
      const alsJson = (req.headers.accept ?? '').includes('application/json');
      try {
        const e = await d.aktion(f, wer);
        if (alsJson) return senden(res, 200, 'application/json', JSON.stringify({ ok: true, meldung: e.meldung }));
        const [pfadTeil, anker] = (f.get('zurueck')?.startsWith('/rezepte') || f.get('zurueck')?.startsWith('/pinnwand') || f.get('zurueck') === '/konfiguration' ? zurueck : e.ziel).split('#');
        return umleiten(res, `${mitParameter(pfadTeil!, 'meldung', e.meldung)}${anker ? `#${anker}` : ''}`);
      } catch (err) {
        if (err instanceof KarteiFehler) {
          if (alsJson) return senden(res, 200, 'application/json', JSON.stringify({ ok: false, fehler: err.message }));
          return umleiten(res, mitParameter(zurueck, 'fehler', err.message));
        }
        throw err;
      }
    }
    if (pfad === '/konfiguration') return senden(res, 200, 'text/html', konfigurationSeite(await d.konfiguration(), r));
    if (pfad === '/konfiguration/terminarten') return senden(res, 200, 'text/html', terminartenSeite({ terminarten: await d.terminarten() }, r));
    if (pfad === '/kalender') {
      const heuteTag = heuteBerlin();
      const tagParam = adresse.searchParams.get('tag') ?? '';
      const tag = /^\d{4}-\d{2}-\d{2}$/.test(tagParam) && !Number.isNaN(Date.parse(`${tagParam}T12:00:00Z`)) ? tagParam : heuteTag;
      const ansicht = adresse.searchParams.get('ansicht') === 'woche' ? 'woche' : 'tag';
      const tage = ansicht === 'woche' ? wocheUm(tag) : [tag];
      const termine = await d.kalender(berlinMitternachtUtc(tage[0]!), berlinMitternachtUtc(tagPlus(tage[tage.length - 1]!, 1)));
      return senden(res, 200, 'text/html', kalenderSeite({ tag, ansicht, termine, namenZeigen: adresse.searchParams.get('namen') === '1', heute: heuteTag }, r));
    }
    const rm = /^\/patienten\/(\d+)\/rechnungen\/(\d+)(\/pdf)?$/.exec(pfad);
    if (rm) {
      if (rm[3]) {
        const pdf = await d.rechnungPdf(rm[1]!, rm[2]!);
        if (!pdf) return senden(res, 404, 'text/plain', 'Kein PDF aus Lexware');
        dateiKopf(res, 'application/pdf', pdf.name);
        return void res.end(Buffer.from(pdf.daten));
      }
      const rd = await d.rechnung(rm[1]!, rm[2]!);
      return rd ? senden(res, 200, 'text/html', ausgangsrechnungSeite(rd, r)) : senden(res, 404, 'text/plain', 'Diese Rechnung gibt es nicht');
    }
    if (pfad === '/pinnwand') {
      const ansicht = adresse.searchParams.get('ansicht') === 'vertikal' ? 'vertikal' : 'horizontal';
      const archiv = adresse.searchParams.get('archiv') === '1';
      return senden(res, 200, 'text/html', pinnwandSeite({ spalten: await d.pinnwand({ archiv }), ansicht, archiv }, r));
    }
    if (pfad === '/pinnwand/neu') return senden(res, 200, 'text/html', fallNeuSeite({ patienten: await d.liste({}), wellness: (await d.wellness()).filter((w) => w.aktiv) }, r));
    if (pfad === '/rezepte') return senden(res, 200, 'text/html', rezepteSeite(await d.rezepte(adresse.searchParams.get('filter') === 'alle' ? 'alle' : 'aktiv'), r));
    if (pfad === '/rezepte/wellness') return senden(res, 200, 'text/html', wellnessSeite(await d.wellness(), r));
    const suche = adresse.searchParams.get('suche')?.slice(0, 80) ?? '';
    if (pfad === '/patienten') return senden(res, 200, 'text/html', listeSeite({ patienten: await d.liste({ suche }), suche }, r));
    if (pfad === '/patienten/archiv') return senden(res, 200, 'text/html', listeSeite({ patienten: await d.liste({ suche, archiv: true }), suche, archiv: true }, r));
    if (pfad === '/patienten/neu') {
      // Vorbelegung aus einer Terminanfrage (A15): Name, Mail, Mobil – der Patient wird danach der Anfrage zugeordnet
      const q = (k: string) => adresse.searchParams.get(k)?.slice(0, 120) ?? '';
      const anfrage = /^\d+$/.test(q('anfrage')) ? q('anfrage') : '';
      return senden(res, 200, 'text/html', patientNeuSeite({ ...r, vorbelegung: anfrage || q('vorname') || q('nachname') ? { anfrageId: anfrage, vorname: q('vorname'), nachname: q('nachname'), email: q('email'), mobil: q('mobil') } : undefined }));
    }
    const fm = /^\/patienten\/(\d+)\/faelle\/(\d+)$/.exec(pfad);
    if (fm) {
      const fd = await d.fall(fm[1]!, fm[2]!, wer);
      return fd ? senden(res, 200, 'text/html', fallSeite(fd, r)) : senden(res, 404, 'text/plain', 'Diesen Fall gibt es nicht');
    }
    const ap = /^\/patienten\/(\d+)\/akte\.pdf$/.exec(pfad);
    if (ap) {
      const pdf = await d.aktePdf(ap[1]!, wer);
      if (!pdf) return senden(res, 404, 'text/plain', 'Diesen Patienten gibt es nicht');
      dateiKopf(res, 'application/pdf', pdf.name);
      return void res.end(Buffer.from(pdf.daten));
    }
    const m = /^\/patienten\/(\d+)(?:\/(akte)|\/neu\/(termin|behandlung|rezept|direktzugang|wellness))?$/.exec(pfad);
    if (!m) return senden(res, 404, 'text/plain', 'Nicht gefunden');
    const [, id, akte, neu] = m as unknown as [string, string, string | undefined, string | undefined];
    if (akte) {
      const a = await d.akte(id, wer);
      return a ? senden(res, 200, 'text/html', akteSeite(a, r)) : senden(res, 404, 'text/plain', 'Diesen Patienten gibt es nicht');
    }
    if (neu) {
      const n = await d.neuAktion(id);
      if (!n) return senden(res, 404, 'text/plain', 'Diesen Patienten gibt es nicht');
      const html = neu === 'termin' ? terminNeuSeite(n, r) : neu === 'behandlung' ? behandlungNeuSeite(n, r)
        : neu === 'direktzugang' ? serieNeuSeite(n, 'direktzugang', r) : neu === 'wellness' ? serieNeuSeite(n, 'praevention', r)
        : rezeptNeuSeite(n, { ...r, vorgaenger: adresse.searchParams.get('vorgaenger') ?? undefined });
      return senden(res, 200, 'text/html', html);
    }
    const p = await d.patient(id);
    return p ? senden(res, 200, 'text/html', patientSeite(p, r)) : senden(res, 404, 'text/plain', 'Diesen Patienten gibt es nicht');
  }

  async function preislistenSeiten(req: IncomingMessage, res: ServerResponse, pfad: string, adresse: URL, wer: string, meldung?: string, fehler?: string): Promise<void> {
    const d = opt.preislisten;
    const r = { wer, fassung: opt.fassung, meldung, fehler };
    if (!d) return senden(res, 503, 'text/plain', 'Preislisten brauchen die Praxis-Datenbank – noch nicht verbunden');
    if (pfad === '/preislisten/aktion') {
      if (fremdeHerkunft(req, res)) return;
      const f = await formular(req);
      const zurueck = /^\/preislisten(\/[\w/-]*)?$/.test(f.get('zurueck') ?? '') ? f.get('zurueck')! : '/preislisten';
      try {
        const e = await d.aktion(f, wer);
        return umleiten(res, mitParameter(e.ziel, 'meldung', e.meldung));
      } catch (err) {
        if (err instanceof PreislisteFehler) return umleiten(res, mitParameter(zurueck, 'fehler', err.message));
        throw err;
      }
    }
    if (pfad === '/preislisten') return senden(res, 200, 'text/html', uebersichtSeite(await d.uebersicht(), r));
    if (pfad === '/preislisten/neu') {
      const v = { gkv: adresse.searchParams.get('gkv') ?? undefined, basis: adresse.searchParams.get('basis') ?? undefined };
      return senden(res, 200, 'text/html', neuSeite(await d.neu(v), r));
    }
    if (pfad === '/preislisten/bearbeiten') return senden(res, 200, 'text/html', auswahlSeite(await d.auswahl(false), r));
    if (pfad === '/preislisten/archiv') return senden(res, 200, 'text/html', auswahlSeite(await d.auswahl(true), { ...r, titel: 'Archiv', archiv: true }));
    const quelle = /^\/preislisten\/quelle\/(\d+)\/original$/.exec(pfad);
    if (quelle) {
      const o = await d.original(quelle[1]!);
      if (!o) return senden(res, 404, 'text/plain', 'Kein Original gespeichert');
      // PDF zum Ansehen; fremdes HTML nur als Download – nie unter unserer Adresse ausführen
      const pdf = o.typ.startsWith('application/pdf');
      dateiKopf(res, pdf ? 'application/pdf' : o.typ, o.name, { inline: pdf, sandbox: true });
      return void res.end(Buffer.from(o.daten));
    }
    const m = /^\/preislisten\/(\d+)(?:\/(bearbeiten)|\/positionen\/(\d+))?$/.exec(pfad);
    if (m) {
      const [, id, bearbeiten, posId] = m as unknown as [string, string, string | undefined, string | undefined];
      if (posId) {
        const p = await d.position(id, posId);
        return p ? senden(res, 200, 'text/html', positionSeite(p.liste, p.detail, r)) : senden(res, 404, 'text/plain', 'Diese Position gibt es nicht');
      }
      if (bearbeiten) {
        const e = await d.editor(id, adresse.searchParams.get('muster_frage') === '1');
        return e ? senden(res, 200, 'text/html', editorSeite(e.liste, e.positionen, { ...r, muster: e.muster, abweichung: e.abweichung })) : senden(res, 404, 'text/plain', 'Diese Preisliste gibt es nicht');
      }
      const det = await d.details(id);
      return det ? senden(res, 200, 'text/html', detailsSeite(det.liste, det.positionen, det.verwendung, r)) : senden(res, 404, 'text/plain', 'Diese Preisliste gibt es nicht');
    }
    return senden(res, 404, 'text/plain', 'Nicht gefunden');
  }
}
