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
import type { CockpitDaten, Quelle, RechnungZeile, Rechnungsstand } from './cockpit/daten.ts';
import type { Pruefpunkt } from './pruefung.ts';
import { cockpitSeite, rechnungenSeite } from './web/cockpit.ts';
import { hilfeSeite, hilfeSkript } from './web/hilfe.ts';
import { esc, seite } from './web/layout.ts';

export interface DienstOptionen {
  /** Tailnet-Konten (Tailscale-User-Login), die die Statusseite sehen dürfen */
  erlaubt: string[];
  pruefen: () => Promise<Pruefpunkt[]>;
  angemeldet: () => Promise<boolean>;
  fassung: string;
  cockpit?: (o: { namenZeigen: boolean }) => Promise<CockpitDaten>;
  rechnungen?: () => Promise<{ stand: Quelle<Rechnungsstand>; liste: Quelle<RechnungZeile[]> }>;
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

function senden(res: ServerResponse, status: number, typ: string, inhalt: string): void {
  res.writeHead(status, {
    'Content-Type': `${typ}; charset=utf-8`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; img-src 'self'",
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
      if (req.method !== 'GET') return senden(res, 405, 'text/plain', 'Nur GET');

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
      if (pfad === '/finanzen/rechnungen') {
        const r = opt.rechnungen ? await opt.rechnungen() : { stand: NICHT_VERBUNDEN, liste: NICHT_VERBUNDEN };
        return senden(res, 200, 'text/html', rechnungenSeite(r.stand, r.liste, { wer, fassung: opt.fassung }));
      }
      if (pfad === '/status') return senden(res, 200, 'text/html', statusseite(await opt.pruefen(), wer, opt.fassung));
      if (pfad === '/hilfe') return senden(res, 200, 'text/html', hilfeSeite({ wer, fassung: opt.fassung }));
      if (pfad === '/hilfe.js') return senden(res, 200, 'text/javascript', hilfeSkript());
      return senden(res, 404, 'text/plain', 'Nicht gefunden');
    } catch (err) {
      console.error('Fehler bei', req.method, req.url, (err as Error).message);
      if (!res.headersSent) senden(res, 500, 'text/plain', 'Interner Fehler');
    }
  });
}
