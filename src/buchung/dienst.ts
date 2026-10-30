/**
 * Der öffentliche Buchungsdienst (W96) – ein eigenes, kleines Programm ohne Datenbank, ohne Tresor,
 * ohne Postfach, ohne Zugang zur Kartei. Er kennt nur das Angebot (vom Manager geschoben) und die
 * Buchungswünsche (vom Manager abgeholt). Fällt er, fällt nur die Buchungsseite; wird er angegriffen,
 * ist nichts zu holen außer den Wünschen, die der Manager noch nicht abgeholt hat.
 *
 * Öffentlich: GET / (Seite), GET /einbetten.js, GET /api/angebot, POST /api/buchung, GET /api/health,
 * GET /api/einladung/<kennung> (Vorbelegung zum Schnelltermin, W117b – nur mit gültiger Kennung).
 * Nur mit Schlüssel (X-Buchung-Schluessel): PUT /api/angebot, PUT /api/einladungen, GET /api/buchungen?ab=<nr>,
 * POST /api/buchungen/abgeholt. Zustand liegt in einer Datei (DATEI), damit ein Neustart nichts verliert.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import path from 'node:path';
import { angebotPruefen, AngebotFehler, BuchungFehler, buchungPruefen, einladungenPruefen, sperren, type Angebot, type Buchung, type Einladung } from './angebot.ts';
import { buchungsSeite, EINBETTEN_SKRIPT } from './seite.ts';

export interface BuchungsdienstOptionen {
  /** Gemeinsamer Schlüssel mit dem Manager; leer = Manager-Schnittstelle gesperrt */
  schluessel: string;
  praxis: string;
  datenschutzUrl: string;
  /** Datei für Angebot und Buchungen; undefined = nur im Speicher (Prüfungen) */
  datei?: string;
  /** Buchungen je Adresse und Stunde */
  hoechstensJeStunde?: number;
  /** Mindestzeit zwischen Laden und Absenden in Millisekunden (Spam-Schutz) */
  mindestDauerMs?: number;
}

interface Zustand {
  angebot: Angebot | null;
  buchungen: Buchung[];
  naechsteNr: number;
  /** Einladungen zum Schnelltermin (W117b) – fallen nach ihrer Gültigkeit weg */
  einladungen: Einladung[];
}

const LEER: Angebot = { erstellt: '1970-01-01T00:00:00.000Z', praxis: '', hinweis: '', rasterMin: 15, terminarten: [], tage: [] };

function senden(res: ServerResponse, status: number, typ: string, inhalt: string, extra: Record<string, string> = {}): void {
  res.writeHead(status, {
    'Content-Type': `${typ}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    // Die Seite darf in fremde Seiten eingebettet werden (iframe auf der Website) – dafür kein frame-ancestors-Verbot
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src data:; form-action 'self'; base-uri 'none'",
    ...extra,
  });
  res.end(inhalt);
}
const json = (res: ServerResponse, status: number, inhalt: unknown) => senden(res, status, 'application/json', JSON.stringify(inhalt));

async function rumpf(req: IncomingMessage, max: number): Promise<string> {
  let text = '';
  for await (const teil of req) {
    text += teil;
    if (text.length > max) throw new BuchungFehler('Zu viele Daten');
  }
  return text;
}

export function buchungsdienst(opt: BuchungsdienstOptionen): Server & { zustand(): Zustand; laden(): Promise<void> } {
  const zustand: Zustand = { angebot: null, buchungen: [], naechsteNr: 1, einladungen: [] };
  const gueltige = () => { const jetzt = new Date().toISOString(); return zustand.einladungen.filter((e) => e.bis > jetzt); };
  const hoechstens = opt.hoechstensJeStunde ?? 5;
  const mindest = opt.mindestDauerMs ?? 3000;
  const anfragenJeAdresse = new Map<string, number[]>();

  const speichern = async () => {
    if (!opt.datei) return;
    await mkdir(path.dirname(opt.datei), { recursive: true });
    const temp = `${opt.datei}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(zustand), { mode: 0o600 });
    await rename(temp, opt.datei);
  };
  const laden = async () => {
    if (!opt.datei) return;
    try {
      const alt = JSON.parse(await readFile(opt.datei, 'utf8')) as Zustand;
      zustand.angebot = alt.angebot ? angebotPruefen(alt.angebot) : null;
      zustand.buchungen = Array.isArray(alt.buchungen) ? alt.buchungen : [];
      zustand.naechsteNr = Number(alt.naechsteNr) || zustand.buchungen.reduce((m, b) => Math.max(m, b.nr + 1), 1);
      zustand.einladungen = Array.isArray(alt.einladungen) ? einladungenPruefen(alt.einladungen) : [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.warn(`Buchungsdienst: Zustand nicht lesbar – ${(err as Error).message}`);
    }
  };
  const mitSchluessel = (req: IncomingMessage) => {
    const k = req.headers['x-buchung-schluessel'];
    if (!opt.schluessel || typeof k !== 'string') return false;
    const a = Buffer.from(k);
    const b = Buffer.from(opt.schluessel);
    return a.length === b.length && timingSafeEqual(a, b);
  };
  const zuViele = (adresse: string) => {
    const jetzt = Date.now();
    const liste = (anfragenJeAdresse.get(adresse) ?? []).filter((t) => jetzt - t < 3_600_000);
    anfragenJeAdresse.set(adresse, liste);
    if (liste.length >= hoechstens) return true;
    liste.push(jetzt);
    return false;
  };

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const pfad = url.pathname;
      if (req.method === 'GET' && (pfad === '/' || pfad === '')) return senden(res, 200, 'text/html', buchungsSeite({ praxis: opt.praxis, datenschutzUrl: opt.datenschutzUrl }));
      if (req.method === 'GET' && pfad === '/einbetten.js') return senden(res, 200, 'text/javascript', EINBETTEN_SKRIPT, { 'Cache-Control': 'public, max-age=3600' });
      if (req.method === 'GET' && pfad === '/api/health') return json(res, 200, { ok: true, angebot: zustand.angebot?.erstellt ?? null, offen: zustand.buchungen.length });
      if (req.method === 'GET' && pfad === '/api/angebot') {
        const a = zustand.angebot ?? LEER;
        // Vergangene Fenster fallen weg, auch wenn der Manager länger nicht geschoben hat
        const jetzt = new Date().toISOString();
        return json(res, 200, { ...a, tage: a.tage.map((t) => ({ ...t, fenster: t.fenster.filter((f) => f.ende > jetzt).map((f) => (f.beginn < jetzt ? { beginn: jetzt, ende: f.ende } : f)) })).filter((t) => t.fenster.length) });
      }
      // Vorbelegung zum Schnelltermin (W117b): nur, wer die zufällige Kennung aus seinem Link hat, bekommt Name, Telefon und Mail
      const ek = /^\/api\/einladung\/([A-Za-z0-9_-]{8,40})$/.exec(pfad);
      if (req.method === 'GET' && ek) {
        const e = gueltige().find((x) => x.kennung === ek[1]);
        return e ? json(res, 200, { name: e.name, telefon: e.telefon, email: e.email }) : json(res, 404, { ok: false, fehler: 'Diese Einladung ist nicht mehr gültig.' });
      }
      if (req.method === 'POST' && pfad === '/api/buchung') {
        const adresse = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '?').split(',')[0]!.trim();
        if (zuViele(adresse)) return json(res, 429, { ok: false, fehler: 'Zu viele Anfragen – bitte in einer Stunde noch einmal oder anrufen.' });
        let roh: Record<string, unknown>;
        try {
          roh = JSON.parse(await rumpf(req, 8 * 1024)) as Record<string, unknown>;
        } catch {
          return json(res, 400, { ok: false, fehler: 'Unlesbare Eingabe.' });
        }
        // Honigtopf-Feld gefüllt oder zu schnell abgeschickt: ein Programm, kein Mensch – freundlich abweisen
        if (roh.website || Number(roh.dauerMs) < mindest) return json(res, 400, { ok: false, fehler: 'Bitte das Formular in Ruhe ausfüllen.' });
        if (!zustand.angebot) return json(res, 503, { ok: false, fehler: 'Die Terminwahl ist gerade nicht verfügbar – bitte rufen Sie uns an.' });
        try {
          const b = buchungPruefen(roh, zustand.angebot);
          // Die Kennung zählt nur, wenn die Praxis sie wirklich ausgegeben hat
          if (b.einladung && !gueltige().some((e) => e.kennung === b.einladung)) b.einladung = null;
          const buchung: Buchung = { id: randomBytes(9).toString('base64url'), nr: zustand.naechsteNr++, eingegangen: new Date().toISOString(), ...b };
          zustand.buchungen.push(buchung);
          zustand.angebot = sperren(zustand.angebot, b.beginn, b.dauerMin);
          await speichern();
          return json(res, 200, { ok: true, id: buchung.id });
        } catch (err) {
          if (err instanceof BuchungFehler) return json(res, 400, { ok: false, fehler: err.message });
          throw err;
        }
      }
      // ── Manager-Schnittstelle ──
      if (pfad.startsWith('/api/angebot') || pfad.startsWith('/api/buchungen') || pfad === '/api/einladungen') {
        if (!mitSchluessel(req)) return json(res, 403, { ok: false, fehler: 'Kein Zugang' });
        if (req.method === 'PUT' && pfad === '/api/angebot') {
          try {
            const neu = angebotPruefen(JSON.parse(await rumpf(req, 2 * 1024 * 1024)));
            // Noch nicht abgeholte Buchungen bleiben gesperrt, sonst könnte jemand dieselbe Zeit erneut wählen
            zustand.angebot = zustand.buchungen.reduce((a, b) => sperren(a, b.beginn, b.dauerMin), neu);
            await speichern();
            return json(res, 200, { ok: true, terminarten: neu.terminarten.length, tage: neu.tage.length });
          } catch (err) {
            if (err instanceof AngebotFehler || err instanceof SyntaxError || err instanceof BuchungFehler) return json(res, 400, { ok: false, fehler: err.message });
            throw err;
          }
        }
        if (req.method === 'PUT' && pfad === '/api/einladungen') {
          try {
            const neu = einladungenPruefen((JSON.parse(await rumpf(req, 256 * 1024)) as { einladungen?: unknown }).einladungen);
            const kennungen = new Set(neu.map((e) => e.kennung));
            zustand.einladungen = [...gueltige().filter((e) => !kennungen.has(e.kennung)), ...neu].slice(-2000);
            await speichern();
            return json(res, 200, { ok: true, einladungen: zustand.einladungen.length });
          } catch (err) {
            if (err instanceof AngebotFehler || err instanceof SyntaxError || err instanceof BuchungFehler) return json(res, 400, { ok: false, fehler: err.message });
            throw err;
          }
        }
        if (req.method === 'GET' && pfad === '/api/buchungen') {
          const ab = Number(url.searchParams.get('ab') ?? 0);
          return json(res, 200, { buchungen: zustand.buchungen.filter((b) => b.nr > ab) });
        }
        if (req.method === 'POST' && pfad === '/api/buchungen/abgeholt') {
          const { bis } = JSON.parse(await rumpf(req, 1024)) as { bis?: number };
          const vorher = zustand.buchungen.length;
          zustand.buchungen = zustand.buchungen.filter((b) => b.nr > Number(bis ?? 0));
          await speichern();
          return json(res, 200, { ok: true, entfernt: vorher - zustand.buchungen.length });
        }
      }
      return senden(res, 404, 'text/plain', 'Nicht gefunden');
    } catch (err) {
      console.error('Buchungsdienst:', req.method, req.url, (err as Error).message);
      if (!res.headersSent) senden(res, 500, 'text/plain', 'Interner Fehler');
    }
  });
  return Object.assign(server, { zustand: () => zustand, laden });
}
