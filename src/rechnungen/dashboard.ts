/**
 * Rechnungs-Dashboard (Prompt 15): Daten und Aktionen. Nur Lieferantenrechnungen (klasse 'rechnung')
 * – Patientenpost steht nie in inbound_document mit Dateinamen oder Absender.
 *
 * Aktionen: freigeben · ablehnen (mit Grund) · später · privat an/aus · Angaben korrigieren.
 * Jede ändert die Datenbank, setzt die Outlook-Kategorie der aktuellen Stufe, verschiebt bei
 * ablehnen/privat die Datei in OneDrive und schreibt ins Protokoll – nie mit Inhalten.
 */
import path from 'node:path/posix';
import { protokolliere, type Db } from '../db/index.ts';
import { dateiVerschieben, laufwerkPfad, ordnerSicherstellen } from '../drive.ts';
import type { GraphClient } from '../graph.ts';
import { aufStufe, KATEGORIEN } from '../mail/kategorien.ts';
import { normiereNummer } from './kopfdaten.ts';
import { nurProduktion } from '../umgebung.ts';

const PREFER = { Prefer: 'IdType="ImmutableId"' };

export interface Rechnung {
  id: string;
  eingang: string;
  dateiname: string | null;
  absenderName: string | null;
  absenderAdresse: string | null;
  lieferant: string | null;
  rechnungsnummer: string | null;
  betrag: number | null;
  netto: number | null;
  ust: number | null;
  ustSatz: string | null;
  rechnungsdatum: string | null;
  status: string;
  onedrivePfad: string | null;
  onedriveItemId: string | null;
  onedriveWebUrl: string | null;
  mailId: string;
  zurueckgestellt: boolean;
  ablehnungsgrund: string | null;
  geprueftVon: string | null;
  geprueftAm: string | null;
}

const FELDER = `id::text, received_at, attachment_name, absender_name, absender_adresse, lieferant, rechnungsnummer,
  betrag::text, netto::text, ust_betrag::text, ust_satz, to_char(rechnungsdatum, 'YYYY-MM-DD') AS rechnungsdatum, status::text, onedrive_path, onedrive_item_id,
  onedrive_web_url, graph_message_id, zurueckgestellt_am, ablehnungsgrund, reviewed_by, reviewed_at`;

const zuRechnung = (r: Record<string, unknown>): Rechnung => ({
  id: String(r.id),
  eingang: r.received_at instanceof Date ? r.received_at.toISOString() : String(r.received_at),
  dateiname: (r.attachment_name as string) ?? null,
  absenderName: (r.absender_name as string) ?? null,
  absenderAdresse: (r.absender_adresse as string) ?? null,
  lieferant: (r.lieferant as string) ?? null,
  rechnungsnummer: (r.rechnungsnummer as string) ?? null,
  betrag: r.betrag === null || r.betrag === undefined ? null : Number(r.betrag),
  netto: r.netto === null || r.netto === undefined ? null : Number(r.netto),
  ust: r.ust_betrag === null || r.ust_betrag === undefined ? null : Number(r.ust_betrag),
  ustSatz: (r.ust_satz as string) ?? null,
  rechnungsdatum: (r.rechnungsdatum as string) ?? null,
  status: String(r.status),
  onedrivePfad: (r.onedrive_path as string) ?? null,
  onedriveItemId: (r.onedrive_item_id as string) ?? null,
  onedriveWebUrl: (r.onedrive_web_url as string) ?? null,
  mailId: String(r.graph_message_id),
  zurueckgestellt: r.zurueckgestellt_am !== null && r.zurueckgestellt_am !== undefined,
  ablehnungsgrund: (r.ablehnungsgrund as string) ?? null,
  geprueftVon: (r.reviewed_by as string) ?? null,
  geprueftAm: r.reviewed_at instanceof Date ? r.reviewed_at.toISOString() : ((r.reviewed_at as string) ?? null),
});

export const OFFEN_STATUS = ['eingegangen', 'wartet_freigabe'];

/** Neue Rechnungen für die Kacheln – Zurückgestellte zuletzt */
export async function neueRechnungen(db: Db): Promise<Rechnung[]> {
  const { rows } = await db.query(
    `SELECT ${FELDER} FROM inbound_document WHERE klasse = 'rechnung' AND status::text = ANY($1)
     ORDER BY zurueckgestellt_am NULLS FIRST, received_at DESC LIMIT 60`,
    [OFFEN_STATUS],
  );
  return rows.map(zuRechnung);
}

export async function privateRechnungen(db: Db): Promise<Rechnung[]> {
  const { rows } = await db.query(
    `SELECT ${FELDER} FROM inbound_document WHERE klasse = 'rechnung' AND status = 'privat' ORDER BY received_at DESC LIMIT 60`,
  );
  return rows.map(zuRechnung);
}

export async function rechnung(db: Db, id: string): Promise<Rechnung | undefined> {
  if (!/^\d+$/.test(id)) return undefined;
  const { rows } = await db.query(`SELECT ${FELDER} FROM inbound_document WHERE id = $1 AND klasse = 'rechnung'`, [id]);
  return rows[0] ? zuRechnung(rows[0]) : undefined;
}

// ── Filter, Suche, Auswertung ───────────────────────────────────────────────
export const STAENDE = {
  alle: 'alle',
  offen: 'eingegangen',
  freigegeben: 'freigegeben',
  angestossen: 'Zahlung angestoßen',
  bezahlt: 'bezahlt',
  abgelehnt: 'abgelehnt',
  privat: 'privat',
} as const;
export type Stand = keyof typeof STAENDE;

const STAND_SQL: Record<Stand, string[] | null> = {
  alle: null,
  offen: OFFEN_STATUS,
  freigegeben: ['freigegeben', 'an_lexware'],
  angestossen: ['zahlung_angestossen'],
  bezahlt: ['bezahlt'],
  abgelehnt: ['abgelehnt'],
  privat: ['privat'],
};

export interface Filter {
  jahr: number;
  stand: Stand;
  suche: string;
}

/** Filter aus der Adresse – alles Unbekannte fällt auf die Vorgabe zurück */
export function filterAus(q: URLSearchParams, heute = new Date()): Filter {
  const jahr = Number(q.get('jahr'));
  const stand = (q.get('stand') ?? 'alle') as Stand;
  return {
    jahr: Number.isInteger(jahr) && jahr >= 2000 && jahr <= 2100 ? jahr : heute.getFullYear(),
    stand: stand in STAENDE ? stand : 'alle',
    suche: (q.get('q') ?? '').trim().slice(0, 100),
  };
}

const DATUM_SQL = `coalesce(rechnungsdatum, (received_at AT TIME ZONE 'Europe/Berlin')::date)`;

export async function liste(db: Db, f: Filter): Promise<Rechnung[]> {
  const werte: unknown[] = [f.jahr];
  let wo = `klasse = 'rechnung' AND extract(year FROM ${DATUM_SQL}) = $1`;
  const staende = STAND_SQL[f.stand];
  if (staende) {
    werte.push(staende);
    wo += ` AND status::text = ANY($${werte.length})`;
  }
  if (f.suche) {
    werte.push(`%${f.suche.replace(/[\\%_]/g, (z) => `\\${z}`)}%`);
    const n = `$${werte.length}`;
    wo += ` AND (lieferant ILIKE ${n} OR attachment_name ILIKE ${n} OR rechnungsnummer ILIKE ${n} OR absender_name ILIKE ${n} OR absender_adresse ILIKE ${n})`;
  }
  const { rows } = await db.query(`SELECT ${FELDER} FROM inbound_document WHERE ${wo} ORDER BY received_at DESC LIMIT 500`, werte);
  return rows.map(zuRechnung);
}

export interface Auswertung {
  jahr: number;
  /** Index 0 = Januar */
  monate: number[];
  lieferanten: { name: string; summe: number }[];
  summe: number;
  ohneBetrag: number;
  jahre: number[];
}

/** Summen für ein Jahr – ohne privat und abgelehnt; Datum: Rechnungsdatum, sonst Eingang */
export async function auswertung(db: Db, jahr: number, top = 8): Promise<Auswertung> {
  const zaehlt = `klasse = 'rechnung' AND status NOT IN ('privat', 'abgelehnt') AND extract(year FROM ${DATUM_SQL}) = $1`;
  const monate = Array<number>(12).fill(0);
  for (const r of (await db.query<{ m: number; s: string }>(
    `SELECT extract(month FROM ${DATUM_SQL})::int AS m, sum(betrag)::text AS s FROM inbound_document WHERE ${zaehlt} GROUP BY 1`,
    [jahr],
  )).rows) monate[r.m - 1] = Number(r.s ?? 0);
  const alle = (await db.query<{ name: string; s: string }>(
    `SELECT coalesce(lieferant, 'ohne Lieferant') AS name, sum(betrag)::text AS s FROM inbound_document
     WHERE ${zaehlt} AND betrag IS NOT NULL GROUP BY 1 ORDER BY sum(betrag) DESC`,
    [jahr],
  )).rows.map((r) => ({ name: r.name, summe: Number(r.s) }));
  const lieferanten = alle.length > top + 1
    ? [...alle.slice(0, top), { name: `Übrige (${alle.length - top})`, summe: alle.slice(top).reduce((s, l) => s + l.summe, 0) }]
    : alle;
  const ohne = (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM inbound_document WHERE ${zaehlt} AND betrag IS NULL`, [jahr])).rows[0]!.n;
  const jahre = (await db.query<{ j: number }>(
    `SELECT DISTINCT extract(year FROM ${DATUM_SQL})::int AS j FROM inbound_document WHERE klasse = 'rechnung' ORDER BY 1 DESC`,
  )).rows.map((r) => r.j);
  return { jahr, monate, lieferanten, summe: monate.reduce((a, b) => a + b, 0), ohneBetrag: ohne, jahre };
}

// ── Aktionen ────────────────────────────────────────────────────────────────
export type Aktion =
  | { art: 'freigeben' }
  | { art: 'ablehnen'; grund: string }
  | { art: 'spaeter' }
  | { art: 'privat'; an: boolean }
  | { art: 'speichern'; lieferant: string; rechnungsnummer: string; betrag: string; rechnungsdatum: string };

export interface Umgebung {
  db: Db;
  graph: Pick<GraphClient, 'get' | 'find' | 'patch' | 'post'>;
  /** driveId der Ablage (fehlt: OneDrive von praxis@) */
  laufwerk?: string;
  /** Tailnet-Konto, das handelt */
  wer: string;
}

export class AktionAbgelehnt extends Error {}

/** Kategorie der Mail auf eine Stufe setzen; fehlt die Mail, nur vermerken */
async function mailStufe(u: Umgebung, mailId: string, kategorie: string): Promise<boolean> {
  const mail = await u.graph.find<{ categories?: string[] }>(`/me/messages/${mailId}?$select=categories`, PREFER);
  if (!mail) return false;
  await u.graph.patch(`/me/messages/${mailId}`, { categories: aufStufe(mail.categories ?? [], kategorie) }, PREFER);
  return true;
}

/** Datei in einen Ordner (Pfad) verschieben; gibt den neuen Pfad und Link zurück */
async function verschieben(u: Umgebung, r: Rechnung, zielOrdner: string): Promise<{ pfad: string; webUrl: string | null }> {
  if (!r.onedriveItemId) throw new AktionAbgelehnt('Zu dieser Rechnung gibt es keine Datei in OneDrive');
  const lw = laufwerkPfad(u.laufwerk);
  const zielId = await ordnerSicherstellen(u.graph, zielOrdner, lw);
  const neu = await dateiVerschieben(u.graph, r.onedriveItemId, zielId, lw);
  return { pfad: `${zielOrdner}/${neu.name}`, webUrl: neu.webUrl ?? r.onedriveWebUrl };
}

const BETRAG = /^\d{1,9}([.,]\d{1,2})?$/;

export async function ausfuehren(u: Umgebung, id: string, a: Aktion): Promise<string> {
  // Schranke 4: Freigabe, privat und Korrekturen verändern Postfach und Ablage – nur Produktion
  try {
    nurProduktion('Das Rechnungs-Dashboard');
  } catch (err) {
    throw new AktionAbgelehnt((err as Error).message);
  }
  const r = await rechnung(u.db, id);
  if (!r) throw new AktionAbgelehnt('Diese Rechnung gibt es nicht');
  const prot = (action: string, details: Record<string, unknown> = {}) =>
    protokolliere(u.db, { actor: u.wer, action, objectType: 'inbound_document', objectId: id, details });
  const offen = OFFEN_STATUS.includes(r.status);

  switch (a.art) {
    case 'freigeben': {
      if (!offen) throw new AktionAbgelehnt('Nur eingegangene Rechnungen lassen sich freigeben');
      await u.db.query(
        `UPDATE inbound_document SET status = 'freigegeben', reviewed_by = $2, reviewed_at = now(), zurueckgestellt_am = NULL, updated_at = now() WHERE id = $1`,
        [id, u.wer],
      );
      const mail = await mailStufe(u, r.mailId, KATEGORIEN.freigegeben.name);
      await prot('rechnung_freigegeben', { mail: mail ? 'markiert' : 'fehlt' });
      return 'freigegeben';
    }
    case 'ablehnen': {
      if (!offen) throw new AktionAbgelehnt('Nur eingegangene Rechnungen lassen sich ablehnen');
      const grund = a.grund.trim();
      if (!grund) throw new AktionAbgelehnt('Bitte einen Grund für die Ablehnung angeben');
      const ordner = r.onedrivePfad ? `${path.dirname(r.onedrivePfad)}/Abgelehnt` : undefined;
      const neu = ordner ? await verschieben(u, r, ordner) : undefined;
      await u.db.query(
        `UPDATE inbound_document SET status = 'abgelehnt', ablehnungsgrund = $2, reviewed_by = $3, reviewed_at = now(),
           onedrive_path = coalesce($4, onedrive_path), onedrive_web_url = coalesce($5, onedrive_web_url), updated_at = now() WHERE id = $1`,
        [id, grund.slice(0, 500), u.wer, neu?.pfad ?? null, neu?.webUrl ?? null],
      );
      const mail = await mailStufe(u, r.mailId, KATEGORIEN.abgelehnt.name);
      await prot('rechnung_abgelehnt', { mail: mail ? 'markiert' : 'fehlt' });
      return 'abgelehnt';
    }
    case 'spaeter': {
      if (!offen) throw new AktionAbgelehnt('Nur eingegangene Rechnungen lassen sich zurückstellen');
      await u.db.query('UPDATE inbound_document SET zurueckgestellt_am = now(), updated_at = now() WHERE id = $1', [id]);
      await prot('rechnung_zurueckgestellt');
      return 'zurueckgestellt';
    }
    case 'privat': {
      if (a.an) {
        if (r.status === 'privat') return 'privat';
        if (!offen && r.status !== 'freigegeben') throw new AktionAbgelehnt('Diese Rechnung ist schon weiter im Ablauf – privat geht nur vorher');
        const ordner = r.onedrivePfad ? path.dirname(r.onedrivePfad) : null;
        const neu = ordner ? await verschieben(u, r, `${path.dirname(ordner)}/Privat`) : undefined;
        await u.db.query(
          `UPDATE inbound_document SET status_vor_privat = status, ordner_vor_privat = $2, status = 'privat',
             onedrive_path = coalesce($3, onedrive_path), onedrive_web_url = coalesce($4, onedrive_web_url),
             reviewed_by = $5, reviewed_at = now(), updated_at = now() WHERE id = $1`,
          [id, ordner, neu?.pfad ?? null, neu?.webUrl ?? null, u.wer],
        );
        const mail = await mailStufe(u, r.mailId, KATEGORIEN.privat.name);
        await prot('rechnung_privat', { an: true, mail: mail ? 'markiert' : 'fehlt' });
        return 'privat';
      }
      if (r.status !== 'privat') return 'nicht-privat';
      const vorher = (await u.db.query<{ s: string | null; o: string | null }>(
        'SELECT status_vor_privat::text AS s, ordner_vor_privat AS o FROM inbound_document WHERE id = $1', [id],
      )).rows[0]!;
      const neu = vorher.o ? await verschieben(u, r, vorher.o) : undefined;
      const status = vorher.s ?? 'wartet_freigabe';
      await u.db.query(
        `UPDATE inbound_document SET status = $2::inbound_status, status_vor_privat = NULL, ordner_vor_privat = NULL,
           onedrive_path = coalesce($3, onedrive_path), onedrive_web_url = coalesce($4, onedrive_web_url), updated_at = now() WHERE id = $1`,
        [id, status, neu?.pfad ?? null, neu?.webUrl ?? null],
      );
      const stufe = status === 'freigegeben' ? KATEGORIEN.freigegeben.name : KATEGORIEN.eingegangen.name;
      const mail = await mailStufe(u, r.mailId, stufe);
      await prot('rechnung_privat', { an: false, mail: mail ? 'markiert' : 'fehlt' });
      return 'nicht-privat';
    }
    case 'speichern': {
      const betrag = a.betrag.trim();
      if (betrag && !BETRAG.test(betrag)) throw new AktionAbgelehnt('Betrag bitte als Zahl, z. B. 49,95');
      const datum = a.rechnungsdatum.trim();
      if (datum && (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || Number.isNaN(Date.parse(datum)))) throw new AktionAbgelehnt('Datum bitte als TT.MM.JJJJ wählen');
      const neu = {
        lieferant: a.lieferant.trim().slice(0, 120) || null,
        rechnungsnummer: a.rechnungsnummer.trim() ? normiereNummer(a.rechnungsnummer.trim()).slice(0, 60) : null,
        betrag: betrag ? Number(betrag.replace(',', '.')) : null,
        rechnungsdatum: datum || null,
      };
      const geaendert = Object.entries(neu)
        .filter(([k, v]) => String(v ?? '') !== String((r as unknown as Record<string, unknown>)[k] ?? ''))
        .map(([k]) => k);
      if (!geaendert.length) return 'unveraendert';
      await u.db.query(
        `UPDATE inbound_document SET lieferant = $2, rechnungsnummer = $3, betrag = $4, rechnungsdatum = $5,
           netto = CASE WHEN betrag IS DISTINCT FROM $4 THEN NULL ELSE netto END,
           ust_betrag = CASE WHEN betrag IS DISTINCT FROM $4 THEN NULL ELSE ust_betrag END,
           ust_satz = CASE WHEN betrag IS DISTINCT FROM $4 THEN NULL ELSE ust_satz END, updated_at = now() WHERE id = $1`,
        [id, neu.lieferant, neu.rechnungsnummer, neu.betrag, neu.rechnungsdatum],
      );
      await prot('rechnung_korrigiert', { felder: geaendert });
      return 'gespeichert';
    }
  }
}

/** Das PDF aus OneDrive – als Antwort zum Durchreichen, nie zwischengespeichert */
export async function pdf(
  graph: Pick<GraphClient, 'stream'>,
  r: Rechnung,
  laufwerk?: string,
): Promise<Response | undefined> {
  if (!r.onedriveItemId) return undefined;
  return graph.stream(`${laufwerkPfad(laufwerk)}/items/${r.onedriveItemId}/content`);
}
