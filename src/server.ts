/**
 * Der Praxisdienst: Statusseite, Hilfe (/hilfe, /hilfe.js) und /api/health. Löst nichts aus – keine Ablage, kein
 * Versand, keine Termine; er zeigt nur, ob die Verbindung zu Microsoft 365 steht.
 *
 * Zugang: Im Container hört der Dienst nur auf 127.0.0.1 im Netz des Tailscale-Knotens. Von außen
 * kommt man nur über `tailscale serve` heran, und das setzt die Kopfzeile Tailscale-User-Login
 * mit dem angemeldeten Tailnet-Konto. Hereingelassen wird, wer in ERLAUBTE_NUTZER steht.
 * /api/health sagt nur ok oder nicht ok und braucht keine Anmeldung (für den Docker-Healthcheck).
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { CockpitDaten } from './cockpit/daten.ts';
import type { Pruefpunkt } from './pruefung.ts';
import { AktionAbgelehnt, filterAus, type Aktion } from './rechnungen/dashboard.ts';
import type { RechnungsDienst } from './rechnungen/dienst.ts';
import { cockpitSeite } from './web/cockpit.ts';
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

async function formular(req: IncomingMessage): Promise<URLSearchParams> {
  let text = '';
  for await (const teil of req) {
    text += teil;
    if (text.length > 64 * 1024) throw new AktionAbgelehnt('Formular zu groß');
  }
  return new URLSearchParams(text);
}

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

function senden(res: ServerResponse, status: number, typ: string, inhalt: string): void {
  res.writeHead(status, {
    'Content-Type': `${typ}; charset=utf-8`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; img-src 'self'; frame-src 'self'; form-action 'self'; frame-ancestors 'self'",
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
    try {
      const adresse = new URL(req.url ?? '/', 'http://localhost');
      const pfad = adresse.pathname;
      const istAktion = req.method === 'POST' && /^\/finanzen\/rechnungen\/\d+\/aktion$/.test(pfad);
      if (req.method !== 'GET' && !istAktion) return senden(res, 405, 'text/plain', 'Nur GET');

      if (pfad === '/api/health') {
        const ok = await opt.angemeldet();
        return senden(res, ok ? 200 : 503, 'application/json', JSON.stringify({ ok, fassung: opt.fassung }));
      }

      const wer = tailnetKonto(req, opt.lokalerZugang);
      if (!wer || !erlaubt.has(wer)) {
        return senden(res, 403, 'text/plain', 'Kein Zugang. Bitte über Tailscale mit einem freigegebenen Konto öffnen.');
      }
      if (pfad === '/') {
        const namenZeigen = adresse.searchParams.get('namen') === '1';
        const daten: CockpitDaten = opt.cockpit
          ? await opt.cockpit({ namenZeigen })
          : { heute: new Date().toISOString().slice(0, 10), rechnungen: NICHT_VERBUNDEN, termine: NICHT_VERBUNDEN, protokoll: NICHT_VERBUNDEN, namenZeigen };
        const jetzt = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).format(new Date());
        return senden(res, 200, 'text/html', cockpitSeite(daten, { wer, fassung: opt.fassung, jetzt }));
      }
      const meldung = MELDUNG[adresse.searchParams.get('ergebnis') ?? ''];
      const fehler = adresse.searchParams.get('fehler')?.slice(0, 200) || undefined;
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
          if (!gleicheHerkunft(req)) return senden(res, 403, 'text/plain', 'Nur von den Seiten der Praxis-Assistenz');
          const f = await formular(req);
          const zurueck = /^\/finanzen\/rechnungen(\/\d+)?$/.test(f.get('zurueck') ?? '') ? f.get('zurueck')! : `/finanzen/rechnungen/${id}`;
          try {
            const ergebnis = await opt.rechnungen.aktion(id, aktionAus(f), wer);
            return umleiten(res, `${zurueck}?ergebnis=${encodeURIComponent(ergebnis)}`);
          } catch (err) {
            if (err instanceof AktionAbgelehnt) return umleiten(res, `${zurueck}?fehler=${encodeURIComponent(err.message)}`);
            throw err;
          }
        }
        if (teil === 'pdf') {
          const p = await opt.rechnungen.pdf(id);
          if (!p) return senden(res, 404, 'text/plain', 'Kein PDF');
          // Ohne CSP, damit der PDF-Viewer des Browsers es zeigen darf; nur im eigenen Rahmen
          res.writeHead(200, {
            'Content-Type': 'application/pdf', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'no-referrer',
            'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(p.name)}`,
          });
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
      if (pfad === '/hilfe') return senden(res, 200, 'text/html', hilfeSeite({ wer, fassung: opt.fassung }));
      if (pfad === '/hilfe.js') return senden(res, 200, 'text/javascript', hilfeSkript());
      if (pfad === '/praxis.js') return senden(res, 200, 'text/javascript', PRAXIS_SKRIPT);
      return senden(res, 404, 'text/plain', 'Nicht gefunden');
    } catch (err) {
      console.error('Fehler bei', req.method, req.url, (err as Error).message);
      if (!res.headersSent) senden(res, 500, 'text/plain', 'Interner Fehler');
    }
  });
}
