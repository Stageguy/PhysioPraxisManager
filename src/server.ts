/**
 * Der Praxisdienst: eine Statusseite und /api/health. Löst nichts aus – keine Ablage, kein
 * Versand, keine Termine; er zeigt nur, ob die Verbindung zu Microsoft 365 steht.
 *
 * Zugang: Im Container hört der Dienst nur auf 127.0.0.1 im Netz des Tailscale-Knotens. Von außen
 * kommt man nur über `tailscale serve` heran, und das setzt die Kopfzeile Tailscale-User-Login
 * mit dem angemeldeten Tailnet-Konto. Hereingelassen wird, wer in ERLAUBTE_NUTZER steht.
 * /api/health sagt nur ok oder nicht ok und braucht keine Anmeldung (für den Docker-Healthcheck).
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Pruefpunkt } from './pruefung.ts';

export interface DienstOptionen {
  /** Tailnet-Konten (Tailscale-User-Login), die die Statusseite sehen dürfen */
  erlaubt: string[];
  pruefen: () => Promise<Pruefpunkt[]>;
  angemeldet: () => Promise<boolean>;
  fassung: string;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

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
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    'Referrer-Policy': 'no-referrer',
  });
  res.end(inhalt);
}

export function statusseite(punkte: Pruefpunkt[], wer: string, fassung: string): string {
  const alleOk = punkte.every((p) => p.ok);
  const zeilen = punkte
    .map((p) => `<li class="${p.ok ? 'ok' : 'fehler'}"><span>${p.ok ? '✓' : '✗'}</span><b>${esc(p.name)}</b> ${esc(p.text)}</li>`)
    .join('\n');
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Praxis Lilli Nebel – Verbindung</title>
<style>
:root{--bg:#faf7f9;--fg:#2b1f28;--akzent:#722e61;--ok:#2e7d4f;--fehler:#b3261e;--karte:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#1b1519;--fg:#f1e9ee;--akzent:#d9a6c9;--ok:#7fd1a0;--fehler:#ff8a80;--karte:#271e24}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}
main{max-width:640px;margin:0 auto;padding:32px 16px}
h1{color:var(--akzent);font-size:24px;margin:0 0 4px}
.stand{font-size:18px;margin:16px 0}
ul{list-style:none;padding:0;margin:0;background:var(--karte);border-radius:12px;overflow:hidden}
li{padding:12px 16px;border-bottom:1px solid color-mix(in srgb,var(--fg) 10%,transparent)}
li:last-child{border-bottom:0}
li span{display:inline-block;width:24px;font-weight:700}
li.ok span{color:var(--ok)} li.fehler span{color:var(--fehler)}
li b{margin-right:6px}
footer{margin-top:24px;font-size:13px;opacity:.7}
</style></head><body><main>
<h1>Praxis Lilli Nebel</h1>
<div>Verbindung zu Microsoft 365 (praxis@lilli-nebel.de)</div>
<p class="stand">${alleOk ? '✓ Alles in Ordnung.' : '⚠ Etwas funktioniert gerade nicht – bitte Christian Bescheid geben.'}</p>
<ul>
${zeilen}
</ul>
<footer>Angemeldet als ${esc(wer)} · PhysioPraxisManager ${esc(fassung)}</footer>
</main></body></html>`;
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
      return senden(res, 404, 'text/plain', 'Nicht gefunden');
    } catch (err) {
      console.error('Fehler bei', req.method, req.url, (err as Error).message);
      if (!res.headersSent) senden(res, 500, 'text/plain', 'Interner Fehler');
    }
  });
}
