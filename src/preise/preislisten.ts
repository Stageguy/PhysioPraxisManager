/**
 * Preislisten (W59): eigene Preise je Leistung, aufgebaut auf einer Grundlage (GKV-Fassung oder
 * einer anderen Preisliste), mit Faktor auf den GKV-Preis und Beihilfe-Höchstbetrag zum Vergleich.
 *
 * Lebenslauf: Entwurf („erstellt“) → freigegeben (danach unveränderlich) → optional aktiv (genau eine)
 * → archiviert (für Rechnungen nicht mehr wählbar) → wiederherstellbar. „Genutzt“, sobald eine
 * Rechnung sie verwendet (preisliste_verwendung) – dann nie mehr löschbar.
 *
 * Vorlage: speichert, welche Positionen übernommen werden und mit welchem Faktor – etwa die
 * Empfehlungen aus der GebüTh, einmal von Hand erfasst.
 */
import { protokolliere, type Db } from '../db/index.ts';
import { beihilfeZuordnen, aehnlichkeit, type QuellPosition } from './leser.ts';

export class PreislisteFehler extends Error {}

export type Status = 'entwurf' | 'freigegeben' | 'archiviert';

export interface QuelleKurz {
  id: string;
  art: string;
  titel: string;
  version: string;
  gueltigAb: string | null;
  abgerufenAm: string;
  url: string | null;
}

export interface Preisliste {
  id: string;
  name: string;
  status: Status;
  aktiv: boolean;
  genutzt: boolean;
  erstelltAm: string;
  erstelltVon: string | null;
  freigegebenAm: string | null;
  freigegebenVon: string | null;
  archiviertAm: string | null;
  standardFaktor: number | null;
  aufrunden: boolean;
  notiz: string | null;
  gkv: QuelleKurz | null;
  beihilfe: QuelleKurz | null;
  basis: { id: string; name: string } | null;
  vorlage: { id: string; name: string } | null;
  positionen: number;
  uebernommen: number;
}

export interface Position {
  id: string;
  reihenfolge: number;
  nummer: string;
  kuerzel: string | null;
  gruppe: string | null;
  bezeichnung: string;
  regelzeit: string | null;
  gkvPreis: number | null;
  beihilfeHoechstbetrag: number | null;
  beihilfeNummer: string | null;
  uebernehmen: boolean;
  faktor: number | null;
  eigenerPreis: number | null;
  notiz: string | null;
}

const zahlOder = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const iso = (v: unknown) => (v === null || v === undefined ? null : new Date(v as string).toISOString());
export const rund2 = (n: number) => Math.round(n * 100) / 100;
/** Eigener Preis: auf Cent – oder mit „Aufrunden“ auf den nächsten vollen Euro (39,01 → 40,00) */
export const preisRunden = (n: number, aufrunden: boolean) => (aufrunden ? Math.ceil(rund2(n) - 1e-9) : rund2(n));
export const rund4 = (n: number) => Math.round(n * 10000) / 10000;

const QUELL_SQL = (alias: string, spalte: string) =>
  `(SELECT json_build_object('id', q.id::text, 'art', q.art, 'titel', q.titel, 'version', q.version, 'gueltigAb', to_char(q.gueltig_ab, 'YYYY-MM-DD'),
     'abgerufenAm', q.abgerufen_am, 'url', q.url) FROM preisquelle q WHERE q.id = ${alias}.${spalte}) AS ${spalte.replace('_id', '')}`;

const LISTEN_SQL = `SELECT l.id::text, l.name, l.status::text, l.aktiv, l.erstellt_am, l.erstellt_von, l.freigegeben_am, l.freigegeben_von,
  l.archiviert_am, l.standard_faktor::text, l.aufrunden, l.notiz,
  ${QUELL_SQL('l', 'gkv_quelle_id')}, ${QUELL_SQL('l', 'beihilfe_quelle_id')},
  (SELECT json_build_object('id', b.id::text, 'name', b.name) FROM preisliste b WHERE b.id = l.basis_preisliste_id) AS basis,
  (SELECT json_build_object('id', v.id::text, 'name', v.name) FROM preisvorlage v WHERE v.id = l.vorlage_id) AS vorlage,
  EXISTS (SELECT 1 FROM preisliste_verwendung u WHERE u.preisliste_id = l.id) AS genutzt,
  (SELECT count(*)::int FROM preisliste_position p WHERE p.preisliste_id = l.id) AS positionen,
  (SELECT count(*)::int FROM preisliste_position p WHERE p.preisliste_id = l.id AND p.uebernehmen) AS uebernommen
  FROM preisliste l`;

function quelleAus(v: unknown): QuelleKurz | null {
  if (!v) return null;
  const o = (typeof v === 'string' ? JSON.parse(v) : v) as Record<string, unknown>;
  return { id: String(o.id), art: String(o.art), titel: String(o.titel), version: String(o.version), gueltigAb: (o.gueltigAb as string) ?? null, abgerufenAm: iso(o.abgerufenAm)!, url: (o.url as string) ?? null };
}
const jsonAus = (v: unknown) => (v ? ((typeof v === 'string' ? JSON.parse(v) : v) as { id: string; name: string }) : null);

function zuListe(r: Record<string, unknown>): Preisliste {
  return {
    id: String(r.id), name: String(r.name), status: r.status as Status, aktiv: Boolean(r.aktiv), genutzt: Boolean(r.genutzt),
    erstelltAm: iso(r.erstellt_am)!, erstelltVon: (r.erstellt_von as string) ?? null,
    freigegebenAm: iso(r.freigegeben_am), freigegebenVon: (r.freigegeben_von as string) ?? null, archiviertAm: iso(r.archiviert_am),
    standardFaktor: zahlOder(r.standard_faktor), aufrunden: Boolean(r.aufrunden), notiz: (r.notiz as string) ?? null,
    gkv: quelleAus(r.gkv_quelle), beihilfe: quelleAus(r.beihilfe_quelle), basis: jsonAus(r.basis), vorlage: jsonAus(r.vorlage),
    positionen: Number(r.positionen), uebernommen: Number(r.uebernommen),
  };
}

export async function listen(db: Db, o: { archiv?: boolean } = {}): Promise<Preisliste[]> {
  const { rows } = await db.query(`${LISTEN_SQL} WHERE l.status ${o.archiv ? "= 'archiviert'" : "<> 'archiviert'"} ORDER BY l.erstellt_am DESC, l.id DESC`);
  return rows.map(zuListe);
}

export async function preisliste(db: Db, id: string): Promise<Preisliste | undefined> {
  if (!/^\d+$/.test(id)) return undefined;
  const { rows } = await db.query(`${LISTEN_SQL} WHERE l.id = $1`, [id]);
  return rows[0] ? zuListe(rows[0]) : undefined;
}

export async function positionen(db: Db, listeId: string): Promise<Position[]> {
  const { rows } = await db.query(
    `SELECT p.id::text, p.reihenfolge, p.nummer, p.kuerzel, p.gruppe, p.bezeichnung, p.regelzeit, p.gkv_preis::text, p.beihilfe_hoechstbetrag::text,
       b.nummer AS beihilfe_nummer, p.uebernehmen, p.faktor::text, p.eigener_preis::text, p.notiz
     FROM preisliste_position p LEFT JOIN preisquelle_position b ON b.id = p.beihilfe_position_id
     WHERE p.preisliste_id = $1 ORDER BY p.reihenfolge`,
    [listeId],
  );
  return rows.map((r: Record<string, unknown>) => ({
    id: String(r.id), reihenfolge: Number(r.reihenfolge), nummer: String(r.nummer), kuerzel: (r.kuerzel as string) ?? null,
    gruppe: (r.gruppe as string) ?? null, bezeichnung: String(r.bezeichnung), regelzeit: (r.regelzeit as string) ?? null,
    gkvPreis: zahlOder(r.gkv_preis), beihilfeHoechstbetrag: zahlOder(r.beihilfe_hoechstbetrag), beihilfeNummer: (r.beihilfe_nummer as string) ?? null,
    uebernehmen: Boolean(r.uebernehmen), faktor: zahlOder(r.faktor), eigenerPreis: zahlOder(r.eigener_preis), notiz: (r.notiz as string) ?? null,
  }));
}

export async function quellen(db: Db, art: string): Promise<QuelleKurz[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT id::text, art::text, titel, version, to_char(gueltig_ab, 'YYYY-MM-DD') AS gueltig_ab, abgerufen_am, url
     FROM preisquelle WHERE art = $1::preisquelle_art ORDER BY abgerufen_am DESC`,
    [art],
  );
  return rows.map((r) => ({ id: String(r.id), art: String(r.art), titel: String(r.titel), version: String(r.version), gueltigAb: (r.gueltig_ab as string) ?? null, abgerufenAm: iso(r.abgerufen_am)!, url: (r.url as string) ?? null }));
}

export interface Vorlage {
  id: string;
  name: string;
  standardFaktor: number | null;
  aufrunden: boolean;
  positionen: Record<string, { uebernehmen: boolean; faktor?: number | null }>;
  notiz: string | null;
}

export async function vorlagen(db: Db): Promise<Vorlage[]> {
  // Zuletzt geändertes Muster zuerst – es ist bei „Neu“ vorgewählt
  const { rows } = await db.query<Record<string, unknown>>('SELECT id::text, name, standard_faktor::text, aufrunden, positionen, notiz FROM preisvorlage ORDER BY geaendert_am DESC, name');
  return rows.map((r) => ({
    id: String(r.id), name: String(r.name), standardFaktor: zahlOder(r.standard_faktor), aufrunden: Boolean(r.aufrunden),
    positionen: (typeof r.positionen === 'string' ? JSON.parse(r.positionen) : r.positionen) as Vorlage['positionen'], notiz: (r.notiz as string) ?? null,
  }));
}

async function quellPositionen(db: Db, quelleId: string): Promise<(QuellPosition & { id: string })[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT id::text, nummer, code, kuerzel, gruppe, bezeichnung, regelzeit, preis::text, zuzahlung::text, hinweise, daten
     FROM preisquelle_position WHERE quelle_id = $1 ORDER BY reihenfolge`,
    [quelleId],
  );
  return rows.map((r) => ({
    id: String(r.id), nummer: String(r.nummer), code: (r.code as string) ?? undefined, kuerzel: (r.kuerzel as string) ?? undefined,
    gruppe: (r.gruppe as string) ?? undefined, bezeichnung: String(r.bezeichnung), regelzeit: (r.regelzeit as string) ?? undefined,
    preis: r.preis === null ? undefined : Number(r.preis), zuzahlung: r.zuzahlung === null ? undefined : Number(r.zuzahlung),
    hinweise: (r.hinweise as string) ?? undefined, daten: (typeof r.daten === 'string' ? JSON.parse(r.daten) : r.daten) as Record<string, unknown>,
  }));
}

export interface NeuEingabe {
  name: string;
  /** Grundlage: eine GKV-Fassung … */
  gkvQuelleId?: string;
  /** … oder eine andere Preisliste (übernimmt deren Positionen, Faktoren und Preise) */
  basisPreislisteId?: string;
  beihilfeQuelleId?: string;
  vorlageId?: string;
  standardFaktor?: number;
  /** Eigene Preise auf volle Euro aufrunden (sonst wie im Muster) */
  aufrunden?: boolean;
  wer: string;
}

/** Neue Preisliste als Entwurf */
export async function anlegen(db: Db, e: NeuEingabe): Promise<string> {
  const name = e.name.trim();
  if (!name) throw new PreislisteFehler('Bitte einen Namen angeben');
  if (!e.gkvQuelleId === !e.basisPreislisteId) throw new PreislisteFehler('Bitte genau eine Grundlage wählen: eine GKV-Fassung oder eine Preisliste');
  const vorlage = e.vorlageId ? (await vorlagen(db)).find((v) => v.id === e.vorlageId) : undefined;
  if (e.vorlageId && !vorlage) throw new PreislisteFehler('Diese Vorlage gibt es nicht');
  const standard = e.standardFaktor ?? vorlage?.standardFaktor ?? null;
  const aufrunden = e.aufrunden || (vorlage?.aufrunden ?? false);

  let gkvId = e.gkvQuelleId ?? null;
  let beihilfeId = e.beihilfeQuelleId ?? null;
  type Zeile = Omit<Position, 'id' | 'beihilfeNummer'> & { quellId: string | null; beihilfeId: string | null };
  let zeilen: Zeile[];

  if (e.basisPreislisteId) {
    const basis = await preisliste(db, e.basisPreislisteId);
    if (!basis) throw new PreislisteFehler('Diese Preisliste gibt es nicht');
    gkvId = basis.gkv?.id ?? null;
    beihilfeId ??= basis.beihilfe?.id ?? null;
    const { rows } = await db.query<Record<string, unknown>>(
      'SELECT quell_position_id::text AS q, beihilfe_position_id::text AS b FROM preisliste_position WHERE preisliste_id = $1 ORDER BY reihenfolge',
      [basis.id],
    );
    zeilen = (await positionen(db, basis.id)).map((p, i) => ({ ...p, quellId: (rows[i]?.q as string) ?? null, beihilfeId: (rows[i]?.b as string) ?? null }));
  } else {
    const gkv = await quellPositionen(db, gkvId!);
    if (!gkv.length) throw new PreislisteFehler('Diese GKV-Fassung hat keine Positionen');
    const beihilfe = beihilfeId ? await quellPositionen(db, beihilfeId) : [];
    zeilen = gkv.map((p, i) => {
      const b = beihilfeZuordnen(p, beihilfe) as (QuellPosition & { id: string }) | undefined;
      return {
        reihenfolge: i, nummer: p.nummer, kuerzel: p.kuerzel ?? null, gruppe: p.gruppe ?? null, bezeichnung: p.bezeichnung,
        regelzeit: p.regelzeit ?? null, gkvPreis: p.preis ?? null, beihilfeHoechstbetrag: b?.preis ?? null,
        uebernehmen: true, faktor: null, eigenerPreis: null, notiz: null, quellId: p.id, beihilfeId: b?.id ?? null,
      };
    });
  }

  // Vorlage und Standardfaktor anwenden: Faktor je Position aus der Vorlage, sonst der allgemeine
  for (const z of zeilen) {
    if (vorlage) {
      const v = vorlage.positionen[z.nummer];
      z.uebernehmen = v ? v.uebernehmen : false;
      const f = v?.faktor ?? vorlage.standardFaktor ?? standard;
      if (f !== null && f !== undefined) [z.faktor, z.eigenerPreis] = [f, z.gkvPreis === null ? null : preisRunden(z.gkvPreis * f, aufrunden)];
    } else if (!e.basisPreislisteId && standard !== null) {
      [z.faktor, z.eigenerPreis] = [standard, z.gkvPreis === null ? null : preisRunden(z.gkvPreis * standard, aufrunden)];
    }
    // Aufgerundet: der Faktor folgt dem Preis
    if (aufrunden && z.eigenerPreis !== null && z.gkvPreis) z.faktor = rund4(z.eigenerPreis / z.gkvPreis);
  }

  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO preisliste (name, gkv_quelle_id, beihilfe_quelle_id, basis_preisliste_id, vorlage_id, standard_faktor, aufrunden, erstellt_von)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id::text`,
    [name, gkvId, beihilfeId, e.basisPreislisteId ?? null, vorlage?.id ?? null, standard, aufrunden, e.wer],
  );
  const id = rows[0]!.id;
  for (const z of zeilen) {
    await db.query(
      `INSERT INTO preisliste_position (preisliste_id, reihenfolge, nummer, kuerzel, gruppe, bezeichnung, regelzeit, gkv_preis,
         quell_position_id, beihilfe_position_id, beihilfe_hoechstbetrag, uebernehmen, faktor, eigener_preis, notiz)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [id, z.reihenfolge, z.nummer, z.kuerzel, z.gruppe, z.bezeichnung, z.regelzeit, z.gkvPreis, z.quellId, z.beihilfeId,
        z.beihilfeHoechstbetrag, z.uebernehmen, z.faktor, z.eigenerPreis, z.notiz],
    );
  }
  await protokolliere(db, { actor: e.wer, action: 'preisliste_angelegt', objectType: 'preisliste', objectId: id, details: { positionen: zeilen.length } });
  return id;
}

export interface ZeileEingabe {
  nummer: string;
  uebernehmen: boolean;
  faktor: string;
  eigenerPreis: string;
}

const zahlLesen = (s: string): number | null => {
  const t = s.trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) throw new PreislisteFehler(`„${s}“ ist keine gültige Zahl`);
  return n;
};

/** Entwurf speichern. Eigener Preis und Faktor bedingen sich: der Preis zählt, der Faktor folgt ihm */
export async function speichern(db: Db, id: string, e: { name: string; standardFaktor: string; aufrunden?: boolean; notiz?: string; zeilen: ZeileEingabe[] }, wer: string): Promise<void> {
  const l = await preisliste(db, id);
  if (!l) throw new PreislisteFehler('Diese Preisliste gibt es nicht');
  if (l.status !== 'entwurf') throw new PreislisteFehler('Eine freigegebene Preisliste lässt sich nicht mehr ändern – bitte als neue Preisliste kopieren');
  if (!e.name.trim()) throw new PreislisteFehler('Bitte einen Namen angeben');
  const vorhanden = new Map((await positionen(db, id)).map((p) => [p.nummer, p]));
  const aufrunden = e.aufrunden ?? l.aufrunden;
  await db.query('UPDATE preisliste SET name = $2, standard_faktor = $3, notiz = $4, aufrunden = $5 WHERE id = $1', [id, e.name.trim().slice(0, 120), zahlLesen(e.standardFaktor), e.notiz?.slice(0, 2000) ?? l.notiz, aufrunden]);
  for (const z of e.zeilen) {
    const p = vorhanden.get(z.nummer);
    if (!p) continue;
    let faktor = zahlLesen(z.faktor);
    let preis = zahlLesen(z.eigenerPreis);
    if (preis === null && faktor !== null && p.gkvPreis !== null) preis = p.gkvPreis * faktor;
    if (preis !== null) preis = preisRunden(preis, aufrunden);
    if (preis !== null && p.gkvPreis) faktor = rund4(preis / p.gkvPreis);
    await db.query('UPDATE preisliste_position SET uebernehmen = $3, faktor = $4, eigener_preis = $5 WHERE preisliste_id = $1 AND nummer = $2', [id, z.nummer, z.uebernehmen, faktor, preis]);
  }
  await protokolliere(db, { actor: wer, action: 'preisliste_gespeichert', objectType: 'preisliste', objectId: id });
}

export async function freigeben(db: Db, id: string, wer: string): Promise<void> {
  const l = await preisliste(db, id);
  if (!l || l.status !== 'entwurf') throw new PreislisteFehler('Nur ein Entwurf lässt sich freigeben');
  const ohnePreis = (await positionen(db, id)).filter((p) => p.uebernehmen && p.eigenerPreis === null);
  if (!l.uebernommen) throw new PreislisteFehler('Bitte mindestens eine Position übernehmen');
  if (ohnePreis.length) throw new PreislisteFehler(`${ohnePreis.length} übernommene Position(en) ohne eigenen Preis – bitte ergänzen oder abwählen`);
  await db.query("UPDATE preisliste SET status = 'freigegeben', freigegeben_am = now(), freigegeben_von = $2 WHERE id = $1", [id, wer]);
  await protokolliere(db, { actor: wer, action: 'preisliste_freigegeben', objectType: 'preisliste', objectId: id });
}

export async function aktivSetzen(db: Db, id: string, wer: string): Promise<void> {
  const l = await preisliste(db, id);
  if (!l || l.status !== 'freigegeben') throw new PreislisteFehler('Aktiv sein kann nur eine freigegebene Preisliste');
  await db.query('UPDATE preisliste SET aktiv = false WHERE aktiv AND id <> $1', [id]);
  await db.query('UPDATE preisliste SET aktiv = true WHERE id = $1', [id]);
  await protokolliere(db, { actor: wer, action: 'preisliste_aktiv', objectType: 'preisliste', objectId: id });
}

export async function archivieren(db: Db, id: string, wer: string): Promise<void> {
  const l = await preisliste(db, id);
  if (!l || l.status !== 'freigegeben') throw new PreislisteFehler('Archivieren lässt sich nur eine freigegebene Preisliste');
  if (l.aktiv) throw new PreislisteFehler('Die aktive Preisliste lässt sich nicht archivieren – erst eine andere aktiv setzen');
  await db.query("UPDATE preisliste SET status = 'archiviert', archiviert_am = now() WHERE id = $1", [id]);
  await protokolliere(db, { actor: wer, action: 'preisliste_archiviert', objectType: 'preisliste', objectId: id });
}

export async function wiederherstellen(db: Db, id: string, wer: string, o: { aktiv: boolean }): Promise<void> {
  const l = await preisliste(db, id);
  if (!l || l.status !== 'archiviert') throw new PreislisteFehler('Nur eine archivierte Preisliste lässt sich wiederherstellen');
  await db.query("UPDATE preisliste SET status = 'freigegeben', archiviert_am = NULL WHERE id = $1", [id]);
  await protokolliere(db, { actor: wer, action: 'preisliste_wiederhergestellt', objectType: 'preisliste', objectId: id });
  if (o.aktiv) await aktivSetzen(db, id, wer);
}

export async function loeschen(db: Db, id: string, wer: string): Promise<void> {
  const l = await preisliste(db, id);
  if (!l) throw new PreislisteFehler('Diese Preisliste gibt es nicht');
  if (l.status !== 'entwurf' || l.genutzt) throw new PreislisteFehler('Löschen lässt sich nur ein Entwurf, der in keiner Rechnung steht – sonst archivieren');
  if ((await db.query('SELECT 1 FROM preisliste WHERE basis_preisliste_id = $1', [id])).rows.length) {
    throw new PreislisteFehler('Andere Preislisten bauen auf diesem Entwurf auf – erst sie löschen');
  }
  await db.query('DELETE FROM preisliste WHERE id = $1', [id]);
  await protokolliere(db, { actor: wer, action: 'preisliste_geloescht', objectType: 'preisliste', objectId: id, details: { name: l.name } });
}

/** Auswahl und Faktoren dieser Preisliste als Vorlage speichern (gleicher Name: überschreiben) */
export async function alsVorlage(db: Db, id: string, name: string, wer: string): Promise<string> {
  const l = await preisliste(db, id);
  if (!l) throw new PreislisteFehler('Diese Preisliste gibt es nicht');
  if (!name.trim()) throw new PreislisteFehler('Bitte einen Namen für die Vorlage angeben');
  const pos = Object.fromEntries((await positionen(db, id)).map((p) => [p.nummer, { uebernehmen: p.uebernehmen, faktor: p.faktor }]));
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO preisvorlage (name, standard_faktor, aufrunden, positionen) VALUES ($1, $2, $3, $4)
     ON CONFLICT (name) DO UPDATE SET standard_faktor = EXCLUDED.standard_faktor, aufrunden = EXCLUDED.aufrunden,
       positionen = EXCLUDED.positionen, geaendert_am = now()
     RETURNING id::text`,
    [name.trim().slice(0, 120), l.standardFaktor, l.aufrunden, JSON.stringify(pos)],
  );
  // Die Preisliste folgt ab jetzt diesem Muster – sonst fragte das nächste Speichern gleich wieder
  if (l.status === 'entwurf') await db.query('UPDATE preisliste SET vorlage_id = $2 WHERE id = $1', [id, rows[0]!.id]);
  await protokolliere(db, { actor: wer, action: 'preisvorlage_gespeichert', objectType: 'preisvorlage', objectId: rows[0]!.id, details: { aus: id } });
  return rows[0]!.id;
}

// ── Muster: Abweichung prüfen, Haken übernehmen ─────────────────────────────
/**
 * Weicht die Preisliste von ihrem Muster ab? Verglichen werden Haken, allgemeiner Faktor, Aufrunden
 * und je übernommener Position der Preis, der sich aus dem Faktor des Musters ergäbe (so stört die
 * Rundung nicht). undefined = kein Muster oder keine Abweichung.
 */
export async function musterAbweichung(db: Db, id: string): Promise<{ muster: Vorlage; unterschiede: number } | undefined> {
  const l = await preisliste(db, id);
  if (!l?.vorlage) return undefined;
  const muster = (await vorlagen(db)).find((v) => v.id === l.vorlage!.id);
  if (!muster) return undefined;
  let unterschiede = 0;
  if ((l.standardFaktor ?? null) !== (muster.standardFaktor ?? null)) unterschiede++;
  if (l.aufrunden !== muster.aufrunden) unterschiede++;
  for (const p of await positionen(db, id)) {
    const m = muster.positionen[p.nummer];
    if (p.uebernehmen !== (m?.uebernehmen ?? false)) {
      unterschiede++;
      continue;
    }
    if (!p.uebernehmen || p.gkvPreis === null) continue;
    const f = m?.faktor ?? muster.standardFaktor;
    const erwartet = f === null || f === undefined ? null : preisRunden(p.gkvPreis * f, l.aufrunden);
    if ((p.eigenerPreis ?? null) !== erwartet) unterschiede++;
  }
  return unterschiede ? { muster, unterschiede } : undefined;
}

/** Übernehmen-Haken aus einem Muster setzen (Faktoren und Preise bleiben) */
export async function musterHakenUebernehmen(db: Db, id: string, musterId: string, wer: string): Promise<string> {
  const l = await preisliste(db, id);
  if (!l || l.status !== 'entwurf') throw new PreislisteFehler('Haken lassen sich nur in einem Entwurf übernehmen');
  const muster = (await vorlagen(db)).find((v) => v.id === musterId);
  if (!muster) throw new PreislisteFehler('Dieses Muster gibt es nicht');
  for (const p of await positionen(db, id)) {
    await db.query('UPDATE preisliste_position SET uebernehmen = $3 WHERE preisliste_id = $1 AND nummer = $2', [id, p.nummer, muster.positionen[p.nummer]?.uebernehmen ?? false]);
  }
  await db.query('UPDATE preisliste SET vorlage_id = $2 WHERE id = $1', [id, muster.id]);
  await protokolliere(db, { actor: wer, action: 'preisliste_muster_haken', objectType: 'preisliste', objectId: id, details: { muster: muster.id } });
  return muster.name;
}

// ── Detailansicht einer Position ────────────────────────────────────────────
export interface PositionDetail {
  position: Position;
  gkv: (QuellPosition & { id: string }) | null;
  beihilfe: (QuellPosition & { id: string }) | null;
  kandidaten: (QuellPosition & { id: string; passt: number })[];
}

export async function positionDetail(db: Db, listeId: string, posId: string): Promise<PositionDetail | undefined> {
  const l = await preisliste(db, listeId);
  if (!l || !/^\d+$/.test(posId)) return undefined;
  const position = (await positionen(db, listeId)).find((p) => p.id === posId);
  if (!position) return undefined;
  const ref = (await db.query<{ q: string | null; b: string | null }>(
    'SELECT quell_position_id::text AS q, beihilfe_position_id::text AS b FROM preisliste_position WHERE id = $1', [posId],
  )).rows[0]!;
  const gkvListe = l.gkv ? await quellPositionen(db, l.gkv.id) : [];
  const bhListe = l.beihilfe ? await quellPositionen(db, l.beihilfe.id) : [];
  const gkv = gkvListe.find((p) => p.id === ref.q) ?? null;
  const beihilfe = bhListe.find((p) => p.id === ref.b) ?? null;
  const vergleich = gkv ?? { nummer: position.nummer, bezeichnung: position.bezeichnung, regelzeit: position.regelzeit ?? undefined, kuerzel: position.kuerzel ?? undefined, daten: {} };
  const kandidaten = bhListe.map((b) => ({ ...b, passt: aehnlichkeit(vergleich, b) })).sort((a, b) => b.passt - a.passt);
  return { position, gkv, beihilfe, kandidaten };
}

export async function beihilfeSetzen(db: Db, listeId: string, posId: string, beihilfePosId: string | null, notiz: string, wer: string): Promise<void> {
  const l = await preisliste(db, listeId);
  if (!l || l.status !== 'entwurf') throw new PreislisteFehler('Ändern lässt sich nur ein Entwurf');
  let betrag: number | null = null;
  if (beihilfePosId) {
    const b = (await db.query<{ preis: string }>(
      'SELECT preis::text FROM preisquelle_position WHERE id = $1 AND quelle_id = $2', [beihilfePosId, l.beihilfe?.id ?? '0'],
    )).rows[0];
    if (!b) throw new PreislisteFehler('Diese Beihilfe-Position gehört nicht zur gewählten Fassung');
    betrag = Number(b.preis);
  }
  await db.query(
    'UPDATE preisliste_position SET beihilfe_position_id = $3, beihilfe_hoechstbetrag = $4, notiz = $5 WHERE id = $2 AND preisliste_id = $1',
    [listeId, posId, beihilfePosId, betrag, notiz.trim().slice(0, 1000) || null],
  );
  await protokolliere(db, { actor: wer, action: 'preisliste_position_geaendert', objectType: 'preisliste', objectId: listeId, details: { position: posId } });
}

export async function verwendung(db: Db, id: string): Promise<{ patienten: string[]; rechnungen: string[] }> {
  const { rows } = await db.query<{ patient_ref: string | null; rechnung_ref: string | null }>(
    'SELECT patient_ref, rechnung_ref FROM preisliste_verwendung WHERE preisliste_id = $1 ORDER BY verwendet_am DESC', [id],
  );
  return {
    patienten: [...new Set(rows.map((r) => r.patient_ref).filter((x): x is string => !!x))],
    rechnungen: [...new Set(rows.map((r) => r.rechnung_ref).filter((x): x is string => !!x))],
  };
}
