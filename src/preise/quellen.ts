/**
 * Preisgrundlagen abrufen und speichern (W59). Jede neue Fassung wird mit dem vollständigen
 * Originaldokument und allen gelesenen Positionen gespeichert; eine Fassung, die es schon gibt
 * (gleicher Inhalt), wird nicht noch einmal gespeichert. Neu = roter Punkt am Menü, bis jemand
 * sie als gesehen markiert.
 *
 * Quellen (öffentlich, amtlich bzw. Herausgeberseite):
 * - GKV: Physiotherapie-Seite des GKV-Spitzenverbands → aktuelle „Anlage 2: Vergütungsvereinbarung“
 * - Beihilfe: Anlage 9 BBhV auf gesetze-im-internet.de
 * - GebüTh: Produktseite beim Herausgeber – nur die erschienene Auflage, keine Inhalte
 */
import { createHash } from 'node:crypto';
import type { Db } from '../db/index.ts';
import { pdfText } from '../rechnungen/pdf.ts';
import { beihilfeLesen, gebuethAuflage, gkvLesen, gkvLinkFinden, type QuellPosition } from './leser.ts';

export const QUELLEN = {
  gkv: {
    titel: 'GKV-Vergütungsliste Physiotherapie (Anlage 2, § 125 SGB V)',
    seite: 'https://www.gkv-spitzenverband.de/krankenversicherung/ambulante_leistungen/heilmittel/125_physio/125_physiotherapie.jsp',
  },
  beihilfe: {
    titel: 'Beihilfe-Höchstbeträge Heilmittel (Anlage 9 BBhV)',
    seite: 'https://www.gesetze-im-internet.de/bbhv/anlage_9.html',
  },
  gebueth: {
    titel: 'GebüTh – Gebührenübersicht für Physiotherapeuten (Buchner & Partner)',
    seite: 'https://www.therafundo.de/gebueth-gebuehrenuebersicht-fuer-physiotherapeuten/262898',
  },
} as const;
export type QuellArt = keyof typeof QUELLEN;

export interface Abruf {
  art: QuellArt;
  titel: string;
  version: string;
  gueltigAb?: string;
  url: string;
  rohdaten: Uint8Array;
  rohdatenTyp: string;
  positionen: QuellPosition[];
}

type Holen = (url: string) => Promise<Response>;
const standardHolen: Holen = (url) =>
  fetch(url, { headers: { 'User-Agent': 'PhysioPraxisManager (Praxis Lilli Nebel; Preisgrundlagen)' }, signal: AbortSignal.timeout(30_000) });

async function laden(holen: Holen, url: string): Promise<Uint8Array> {
  const res = await holen(url);
  if (!res.ok) throw new Error(`${res.status} beim Abruf von ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

const text = (b: Uint8Array, zeichensatz = 'utf-8') => new TextDecoder(zeichensatz).decode(b);
const heute = () => new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());

export async function abrufen(art: QuellArt, holen: Holen = standardHolen, textAus: (b: Uint8Array) => Promise<string> = pdfText): Promise<Abruf> {
  const q = QUELLEN[art];
  if (art === 'gkv') {
    const seite = text(await laden(holen, q.seite));
    const link = gkvLinkFinden(seite);
    if (!link) throw new Error('Auf der Seite des GKV-Spitzenverbands ist keine Anlage 2 (Lesefassung) verlinkt');
    const pdf = await laden(holen, link.url);
    const liste = gkvLesen(await textAus(pdf));
    if (liste.positionen.length < 20) throw new Error(`GKV-Liste: nur ${liste.positionen.length} Positionen gelesen – Aufbau geändert?`);
    return { art, titel: q.titel, version: liste.version, gueltigAb: liste.gueltigAb, url: link.url, rohdaten: pdf, rohdatenTyp: 'application/pdf', positionen: liste.positionen };
  }
  if (art === 'beihilfe') {
    const html = await laden(holen, q.seite);
    const liste = beihilfeLesen(text(html, 'iso-8859-1'));
    if (liste.positionen.length < 20) throw new Error(`Beihilfe: nur ${liste.positionen.length} Positionen gelesen – Aufbau geändert?`);
    // Die Seite nennt keinen Stand – erkannt wird eine neue Fassung am geänderten Inhalt
    return { art, titel: q.titel, version: `${liste.version}, abgerufen am ${heute()}`, url: q.seite, rohdaten: html, rohdatenTyp: 'text/html; charset=iso-8859-1', positionen: liste.positionen };
  }
  const html = await laden(holen, q.seite);
  const auflage = gebuethAuflage(text(html));
  if (!auflage) throw new Error('GebüTh: keine Auflage auf der Seite des Herausgebers gefunden');
  // Nur die Auflage zählt – Preise, Werbung und Layout der Seite ändern sich öfter
  return { art, titel: q.titel, version: auflage, url: q.seite, rohdaten: new TextEncoder().encode(auflage), rohdatenTyp: 'text/plain', positionen: [] };
}

/** Fingerabdruck einer Fassung: bei GKV/Beihilfe die gelesenen Positionen (robust gegen Layout), sonst der Inhalt */
export function fingerabdruck(a: Abruf): string {
  const inhalt = a.positionen.length
    ? JSON.stringify(a.positionen.map((p) => [p.nummer, p.bezeichnung, p.preis ?? null, p.zuzahlung ?? null, p.regelzeit ?? null]))
    : text(a.rohdaten);
  return createHash('sha256').update(`${a.art}|${a.version.replace(/, abgerufen am .*$/, '')}|${inhalt}`).digest('hex');
}

export interface Pruefergebnis {
  art: QuellArt;
  version?: string;
  neu: boolean;
  fehler?: string;
  quelleId?: string;
}

/** Eine Quelle prüfen; mit `speichern` eine neue Fassung samt Positionen ablegen */
export async function pruefen(db: Db, art: QuellArt, optionen: { speichern: boolean; holen?: Holen; textAus?: (b: Uint8Array) => Promise<string> }): Promise<Pruefergebnis> {
  let a: Abruf;
  try {
    a = await abrufen(art, optionen.holen, optionen.textAus);
  } catch (err) {
    return { art, neu: false, fehler: (err as Error).message.slice(0, 300) };
  }
  const hash = fingerabdruck(a);
  const da = (await db.query<{ id: string }>('SELECT id::text FROM preisquelle WHERE art = $1 AND sha256 = $2', [art, hash])).rows[0];
  if (da) return { art, version: a.version, neu: false, quelleId: da.id };
  if (!optionen.speichern) return { art, version: a.version, neu: true };
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO preisquelle (art, titel, version, gueltig_ab, url, sha256, rohdaten, rohdaten_typ)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id::text`,
    [art, a.titel, a.version, a.gueltigAb ?? null, a.url, hash, Buffer.from(a.rohdaten), a.rohdatenTyp],
  );
  const id = rows[0]!.id;
  for (const [i, p] of a.positionen.entries()) {
    await db.query(
      `INSERT INTO preisquelle_position (quelle_id, reihenfolge, nummer, code, kuerzel, gruppe, bezeichnung, regelzeit, preis, zuzahlung, hinweise, daten)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [id, i, p.nummer, p.code ?? null, p.kuerzel ?? null, p.gruppe ?? null, p.bezeichnung, p.regelzeit ?? null, p.preis ?? null, p.zuzahlung ?? null, p.hinweise ?? null, JSON.stringify(p.daten)],
    );
  }
  return { art, version: a.version, neu: true, quelleId: id };
}

export async function allePruefen(db: Db, optionen: { speichern: boolean; holen?: Holen; textAus?: (b: Uint8Array) => Promise<string> }): Promise<Pruefergebnis[]> {
  const ergebnisse: Pruefergebnis[] = [];
  for (const art of Object.keys(QUELLEN) as QuellArt[]) ergebnisse.push(await pruefen(db, art, optionen));
  return ergebnisse;
}

// ── Roter Punkt ─────────────────────────────────────────────────────────────
export interface NeueQuelle {
  id: string;
  art: QuellArt;
  titel: string;
  version: string;
  abgerufenAm: string;
}

export async function neueQuellen(db: Db): Promise<NeueQuelle[]> {
  const { rows } = await db.query<{ id: string; art: QuellArt; titel: string; version: string; abgerufen_am: Date | string }>(
    'SELECT id::text, art::text AS art, titel, version, abgerufen_am FROM preisquelle WHERE gesehen_am IS NULL ORDER BY abgerufen_am DESC',
  );
  return rows.map((r) => ({ id: r.id, art: r.art, titel: r.titel, version: r.version, abgerufenAm: new Date(r.abgerufen_am).toISOString() }));
}

export async function alsGesehen(db: Db, wer: string, id?: string): Promise<void> {
  await db.query(
    `UPDATE preisquelle SET gesehen_am = now(), gesehen_von = $1 WHERE gesehen_am IS NULL ${id ? 'AND id = $2' : ''}`,
    id ? [wer, id] : [wer],
  );
}
