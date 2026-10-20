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
import type { Pruefpunkt } from './pruefung.ts';
import { hilfeSeite, hilfeSkript } from './web/hilfe.ts';
import { esc, seite } from './web/layout.ts';

export interface DienstOptionen {
  /** Tailnet-Konten (Tailscale-User-Login), die die Statusseite sehen dürfen */
  erlaubt: string[];
  pruefen: () => Promise<Pruefpunkt[]>;
  angemeldet: () => Promise<boolean>;
  fassung: string;
}

const istLoopback = (adresse = '') => adresse === '127.0.0.1' || adresse === '::1' || adresse === '::ffff:127.0.0.1';

/** Wer fragt? Das Tailnet-Konto, wenn die Anfrage über tailscale serve kam, sonst undefined */
export function tailnetKonto(req: IncomingMessage): string | undefined {
  if (!istLoopback(req.socket.remoteAddress)) return undefined;
  const login = req.headers['tailscale-user-login'];
  return typeof login === 'string' && login ? login.toLowerCase() : undefined;
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
      const pfad = new URL(req.url ?? '/', 'http://localhost').pathname;
      if (req.method !== 'GET') return senden(res, 405, 'text/plain', 'Nur GET');

      if (pfad === '/api/health') {
        const ok = await opt.angemeldet();
        return senden(res, ok ? 200 : 503, 'application/json', JSON.stringify({ ok, fassung: opt.fassung }));
      }

      const wer = tailnetKonto(req);
      if (!wer || !erlaubt.has(wer)) {
        return senden(res, 403, 'text/plain', 'Kein Zugang. Bitte über Tailscale mit einem freigegebenen Konto öffnen.');
      }
      if (pfad === '/') return senden(res, 200, 'text/html', statusseite(await opt.pruefen(), wer, opt.fassung));
      if (pfad === '/hilfe') return senden(res, 200, 'text/html', hilfeSeite({ wer, fassung: opt.fassung }));
      if (pfad === '/hilfe.js') return senden(res, 200, 'text/javascript', hilfeSkript());
      return senden(res, 404, 'text/plain', 'Nicht gefunden');
    } catch (err) {
      console.error('Fehler bei', req.method, req.url, (err as Error).message);
      if (!res.headersSent) senden(res, 500, 'text/plain', 'Interner Fehler');
    }
  });
}
