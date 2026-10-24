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
import { PreislisteFehler, type PreislistenDienst } from './preise/dienst.ts';
import { KarteiFehler, type KarteiDienst } from './kartei/dienst.ts';
import { cockpitSeite } from './web/cockpit.ts';
import { akteSeite, behandlungNeuSeite, listeSeite, neuSeite as patientNeuSeite, patientSeite, rezeptNeuSeite, terminNeuSeite } from './web/patienten.ts';
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
    // Der rote Punkt am Menü braucht je Anfrage die Zahl neuer Preisgrundlagen
    const neu = req.url?.startsWith('/api/') || !opt.preislisten ? 0 : await opt.preislisten.neueAnzahl().catch(() => 0);
    await menueStand.run({ preislistenNeu: neu }, () => bedienen(req, res));
  });

  async function bedienen(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const adresse = new URL(req.url ?? '/', 'http://localhost');
      const pfad = adresse.pathname;
      const istAktion = req.method === 'POST' && (/^\/finanzen\/rechnungen\/\d+\/aktion$/.test(pfad) || pfad === '/preislisten/aktion' || pfad === '/patienten/aktion');
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
      const freieMeldung = meldung ?? adresse.searchParams.get('meldung')?.slice(0, 300) ?? undefined;
      if (pfad.startsWith('/preislisten')) return await preislistenSeiten(req, res, pfad, adresse, wer, freieMeldung, fehler);
      if (pfad.startsWith('/patienten')) return await patientenSeiten(req, res, pfad, adresse, wer, freieMeldung, fehler);
      if (pfad === '/hilfe') return senden(res, 200, 'text/html', hilfeSeite({ wer, fassung: opt.fassung }));
      if (pfad === '/hilfe.js') return senden(res, 200, 'text/javascript', hilfeSkript());
      if (pfad === '/praxis.js') return senden(res, 200, 'text/javascript', PRAXIS_SKRIPT);
      return senden(res, 404, 'text/plain', 'Nicht gefunden');
    } catch (err) {
      console.error('Fehler bei', req.method, req.url, (err as Error).message);
      if (!res.headersSent) senden(res, 500, 'text/plain', 'Interner Fehler');
    }
  }

  async function patientenSeiten(req: IncomingMessage, res: ServerResponse, pfad: string, adresse: URL, wer: string, meldung?: string, fehler?: string): Promise<void> {
    const d = opt.kartei;
    const r = { wer, fassung: opt.fassung, meldung, fehler };
    if (!d) return senden(res, 503, 'text/plain', 'Die Patientenkartei braucht die Praxis-Datenbank und den Tresor-Schlüssel – noch nicht verbunden');
    if (pfad === '/patienten/aktion') {
      if (!gleicheHerkunft(req)) return senden(res, 403, 'text/plain', 'Nur von den Seiten der Praxis-Assistenz');
      const f = await formular(req);
      const zurueck = /^\/patienten(\/[\w/-]*)?$/.test(f.get('zurueck') ?? '') ? f.get('zurueck')! : '/patienten';
      try {
        const e = await d.aktion(f, wer);
        const [pfadTeil, anker] = e.ziel.split('#');
        return umleiten(res, `${pfadTeil}${pfadTeil!.includes('?') ? '&' : '?'}meldung=${encodeURIComponent(e.meldung)}${anker ? `#${anker}` : ''}`);
      } catch (err) {
        if (err instanceof KarteiFehler) return umleiten(res, `${zurueck}?fehler=${encodeURIComponent(err.message)}`);
        throw err;
      }
    }
    const suche = adresse.searchParams.get('suche')?.slice(0, 80) ?? '';
    if (pfad === '/patienten') return senden(res, 200, 'text/html', listeSeite({ patienten: await d.liste({ suche }), suche }, r));
    if (pfad === '/patienten/archiv') return senden(res, 200, 'text/html', listeSeite({ patienten: await d.liste({ suche, archiv: true }), suche, archiv: true }, r));
    if (pfad === '/patienten/neu') return senden(res, 200, 'text/html', patientNeuSeite(r));
    const m = /^\/patienten\/(\d+)(?:\/(akte)|\/neu\/(termin|behandlung|rezept))?$/.exec(pfad);
    if (!m) return senden(res, 404, 'text/plain', 'Nicht gefunden');
    const [, id, akte, neu] = m as unknown as [string, string, string | undefined, string | undefined];
    if (akte) {
      const a = await d.akte(id, wer);
      return a ? senden(res, 200, 'text/html', akteSeite(a, r)) : senden(res, 404, 'text/plain', 'Diesen Patienten gibt es nicht');
    }
    if (neu) {
      const n = await d.neuAktion(id);
      if (!n) return senden(res, 404, 'text/plain', 'Diesen Patienten gibt es nicht');
      const html = neu === 'termin' ? terminNeuSeite(n, r) : neu === 'behandlung' ? behandlungNeuSeite(n, r) : rezeptNeuSeite(n, r);
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
      if (!gleicheHerkunft(req)) return senden(res, 403, 'text/plain', 'Nur von den Seiten der Praxis-Assistenz');
      const f = await formular(req);
      const zurueck = /^\/preislisten(\/[\w/-]*)?$/.test(f.get('zurueck') ?? '') ? f.get('zurueck')! : '/preislisten';
      try {
        const e = await d.aktion(f, wer);
        return umleiten(res, `${e.ziel}${e.ziel.includes('?') ? '&' : '?'}meldung=${encodeURIComponent(e.meldung)}`);
      } catch (err) {
        if (err instanceof PreislisteFehler) return umleiten(res, `${zurueck}?fehler=${encodeURIComponent(err.message)}`);
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
      res.writeHead(200, {
        'Content-Type': pdf ? 'application/pdf' : o.typ, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `${pdf ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(o.name)}`,
        'Content-Security-Policy': "default-src 'none'; sandbox",
      });
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
