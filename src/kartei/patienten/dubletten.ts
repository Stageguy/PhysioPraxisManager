/**
 * Dubletten (W119): Erkennen, ob es einen Patienten womöglich schon gibt, und die drei Wege, das zu klären –
 * keine Dublette (merken), zusammenführen (alles Verknüpfte wandert zum bleibenden Patienten, die Dublette bleibt
 * archiviert mit Verweis) oder löschen (nur, wenn an der Dublette nichts hängt – die Akte ist unveränderlich).
 *
 * Erkannt wird über Schlüssel je Patient: gleicher Name (umlaut- und reihenfolgeunabhängig), gleiche Mailadresse,
 * gleiche Mobil-/WhatsApp-Nummer, gleiche Festnetznummer mit gleichem Nachnamen, gleiches Geburtsdatum mit
 * gleichem Nachnamen. Ein Schlüssel, den mehr als drei Patienten teilen (Familienadresse, Heim, Testadresse), zählt
 * nicht – das wären keine Dubletten, sondern eine Sammeladresse (N39).
 */
import { protokolliere, type Db } from '../../db/index.ts';
import { istId } from '../../db/werte.ts';
import { KarteiFehler } from './basis.ts';

export type DubletteArt = 'name' | 'geburtstag' | 'email' | 'mobil' | 'telefon';
export interface DubletteGrund { art: DubletteArt; wert: string }
export interface DublettePaar { a: string; b: string; gruende: DubletteGrund[] }

export const DUBLETTE_GRUND_TEXT: Record<DubletteArt, string> = {
  name: 'gleicher Name', geburtstag: 'gleiches Geburtsdatum und Nachname', email: 'gleiche Mailadresse', mobil: 'gleiche Mobilnummer', telefon: 'gleiche Festnetznummer und Nachname',
};

/** Ab so vielen Patienten mit demselben Schlüssel ist es eine Sammeladresse, keine Dublette */
const SAMMEL_AB = 4;

/** Name normieren wie die Datenbank: klein, Umlaute aufgelöst, nur Buchstaben und Ziffern */
const NORM = (x: string) => `regexp_replace(replace(replace(replace(replace(lower(${x}), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss'), '[^a-z0-9]', '', 'g')`;

const SCHLUESSEL_SQL = `
  WITH p AS (SELECT id, vorname, nachname, geburtsdatum FROM patient WHERE status <> 'archiviert'),
  schl AS (
    SELECT p.id, 'name' AS art, least(${NORM('p.vorname')}, ${NORM('p.nachname')}) || '|' || greatest(${NORM('p.vorname')}, ${NORM('p.nachname')}) AS wert FROM p
    UNION ALL SELECT p.id, 'geburtstag', to_char(p.geburtsdatum, 'YYYY-MM-DD') || '|' || ${NORM('p.nachname')} FROM p WHERE p.geburtsdatum IS NOT NULL
    UNION ALL SELECT k.patient_id, 'email', k.normiert FROM patient_kontakt k JOIN p ON p.id = k.patient_id WHERE k.art = 'email' AND k.normiert <> ''
    UNION ALL SELECT k.patient_id, 'mobil', k.normiert FROM patient_kontakt k JOIN p ON p.id = k.patient_id WHERE k.art IN ('mobil', 'whatsapp') AND k.normiert <> ''
    UNION ALL SELECT k.patient_id, 'telefon', k.normiert || '|' || ${NORM('p.nachname')} FROM patient_kontakt k JOIN p ON p.id = k.patient_id WHERE k.art = 'telefon' AND k.normiert <> ''
  ),
  sammel AS (SELECT art, wert FROM schl GROUP BY art, wert HAVING count(DISTINCT id) >= ${SAMMEL_AB})
  SELECT DISTINCT a.id::text AS a, b.id::text AS b, a.art, a.wert
  FROM schl a JOIN schl b ON b.art = a.art AND b.wert = a.wert AND b.id > a.id
  WHERE NOT EXISTS (SELECT 1 FROM sammel s WHERE s.art = a.art AND s.wert = a.wert)
    AND NOT EXISTS (SELECT 1 FROM patient_keine_dublette g WHERE g.patient_a = a.id AND g.patient_b = b.id)`;

/** Alle ungeklärten Paare möglicher Dubletten unter den nicht archivierten Patienten – mit Patient nur seine */
export async function dublettenPaare(db: Db, o: { patientId?: string } = {}): Promise<DublettePaar[]> {
  const mit = o.patientId !== undefined;
  if (mit && !istId(o.patientId!)) return [];
  const { rows } = await db.query<{ a: string; b: string; art: DubletteArt; wert: string }>(
    `${SCHLUESSEL_SQL}${mit ? ' AND (a.id = $1 OR b.id = $1)' : ''} ORDER BY a, b, art`, mit ? [o.patientId] : [],
  );
  const paare = new Map<string, DublettePaar>();
  for (const r of rows) {
    const k = `${r.a}|${r.b}`;
    const p = paare.get(k) ?? { a: r.a, b: r.b, gruende: [] };
    // Für Name und Geburtstag ist der Schlüssel nur technisch – angezeigt wird der Grund, bei Mail und Nummer der Wert
    p.gruende.push({ art: r.art, wert: r.art === 'email' || r.art === 'mobil' ? r.wert : r.art === 'telefon' ? r.wert.split('|')[0]! : '' });
    paare.set(k, p);
  }
  return [...paare.values()];
}

/** Je Patient die Zahl seiner ungeklärten möglichen Dubletten – für das Symbol an der Kachel */
export async function dublettenZaehlen(db: Db, patientId?: string): Promise<Map<string, number>> {
  const z = new Map<string, number>();
  for (const p of await dublettenPaare(db, { patientId })) {
    z.set(p.a, (z.get(p.a) ?? 0) + 1);
    z.set(p.b, (z.get(p.b) ?? 0) + 1);
  }
  return z;
}

/** Was an einem Patienten hängt – entscheidet, ob er gelöscht werden darf oder zusammengeführt werden muss */
export interface Verknuepft {
  termine: number;
  termineKommend: number;
  verordnungen: number;
  faelle: number;
  behandlungen: number;
  rechnungen: number;
  dokumente: number;
  erklaerungen: number;
  verlauf: number;
  anfragen: number;
  einladungen: number;
  kontakte: number;
  adressen: number;
  bezugspersonen: number;
  versicherungen: number;
  lexware: string | null;
}

export const KEINE_VERKNUEPFUNG: Verknuepft = {
  termine: 0, termineKommend: 0, verordnungen: 0, faelle: 0, behandlungen: 0, rechnungen: 0, dokumente: 0, erklaerungen: 0, verlauf: 0, anfragen: 0, einladungen: 0,
  kontakte: 0, adressen: 0, bezugspersonen: 0, versicherungen: 0, lexware: null,
};

/** Reihenfolge und Namen für die Gegenüberstellung */
export const VERKNUEPFT_NAME: [keyof Verknuepft, string][] = [
  ['termine', 'Termine'], ['verordnungen', 'Rezepte'], ['faelle', 'Behandlungsfälle'], ['behandlungen', 'Behandlungen'], ['rechnungen', 'Rechnungen'], ['dokumente', 'Dokumente'],
  ['erklaerungen', 'Erklärungen'], ['verlauf', 'Kontaktverlauf'], ['anfragen', 'Terminanfragen'], ['kontakte', 'Kontaktwege'], ['adressen', 'Adressen'], ['bezugspersonen', 'Bezugspersonen'], ['versicherungen', 'Versicherungen'],
];

/** Alles außer Stammdaten (Kontaktwege, Adressen, Bezugspersonen, Versicherungen) – das darf nicht verloren gehen */
const AKTE: (keyof Verknuepft)[] = ['termine', 'verordnungen', 'faelle', 'behandlungen', 'rechnungen', 'dokumente', 'erklaerungen', 'verlauf', 'anfragen', 'einladungen'];

/** Nichts verknüpft und kein Lexware-Kunde: dann darf die Dublette gelöscht werden */
export const istLeer = (v: Verknuepft): boolean => AKTE.every((k) => !v[k]) && !v.lexware;
/** Wie viel an der Akte hängt – wer mehr hat, sollte bleiben */
export const akteGewicht = (v: Verknuepft): number => AKTE.reduce((s, k) => s + Number(v[k]), 0);

export async function verknuepfteElemente(db: Db, patientId: string): Promise<Verknuepft> {
  if (!istId(patientId)) return KEINE_VERKNUEPFUNG;
  const r = (await db.query<Record<string, unknown>>(
    `SELECT
       (SELECT count(*) FROM termin WHERE patient_id = $1) AS termine,
       (SELECT count(*) FROM termin WHERE patient_id = $1 AND status IN ('vorgeschlagen', 'bestaetigt') AND ende >= now()) AS termine_kommend,
       (SELECT count(*) FROM verordnung WHERE patient_id = $1) AS verordnungen,
       (SELECT count(*) FROM behandlungsfall WHERE patient_id = $1) AS faelle,
       (SELECT count(*) FROM behandlung b JOIN behandlungsfall f ON f.id = b.fall_id WHERE f.patient_id = $1) AS behandlungen,
       (SELECT count(*) FROM rechnung WHERE patient_id = $1) AS rechnungen,
       (SELECT count(*) FROM dokument WHERE patient_id = $1) AS dokumente,
       (SELECT count(*) FROM patient_erklaerung WHERE patient_id = $1) AS erklaerungen,
       (SELECT count(*) FROM patient_kontaktverlauf WHERE patient_id = $1) AS verlauf,
       (SELECT count(*) FROM terminanfrage WHERE patient_id = $1) AS anfragen,
       (SELECT count(*) FROM schnelltermin_einladung WHERE patient_id = $1) AS einladungen,
       (SELECT count(*) FROM patient_kontakt WHERE patient_id = $1) AS kontakte,
       (SELECT count(*) FROM patient_adresse WHERE patient_id = $1) AS adressen,
       (SELECT count(*) FROM patient_bezugsperson WHERE patient_id = $1) AS bezugspersonen,
       (SELECT count(*) FROM patient_versicherung WHERE patient_id = $1) AS versicherungen,
       (SELECT lexware_kundennummer FROM patient WHERE id = $1) AS lexware`, [patientId],
  )).rows[0] ?? {};
  const n = (k: string) => Number(r[k] ?? 0);
  return {
    termine: n('termine'), termineKommend: n('termine_kommend'), verordnungen: n('verordnungen'), faelle: n('faelle'), behandlungen: n('behandlungen'), rechnungen: n('rechnungen'),
    dokumente: n('dokumente'), erklaerungen: n('erklaerungen'), verlauf: n('verlauf'), anfragen: n('anfragen'), einladungen: n('einladungen'), kontakte: n('kontakte'), adressen: n('adressen'),
    bezugspersonen: n('bezugspersonen'), versicherungen: n('versicherungen'), lexware: r.lexware ? String(r.lexware) : null,
  };
}

interface Kopf { id: string; patientennummer: string; status: string; dublette_von: string | null }

async function zwei(db: Db, a: string, b: string): Promise<[Kopf, Kopf]> {
  if (!istId(a) || !istId(b)) throw new KarteiFehler('Unbekannter Patient');
  if (a === b) throw new KarteiFehler('Ein Patient kann nicht seine eigene Dublette sein');
  const { rows } = await db.query<Kopf>('SELECT id::text, patientennummer, status::text, dublette_von::text FROM patient WHERE id = $1 OR id = $2', [a, b]);
  const ka = rows.find((r) => r.id === a);
  const kb = rows.find((r) => r.id === b);
  if (!ka || !kb) throw new KarteiFehler('Einen der beiden Patienten gibt es nicht (mehr)');
  return [ka, kb];
}

/** Lillis Entscheidung „keine Dublette“ – das Paar wird nicht mehr gemeldet */
export async function keineDublette(db: Db, a: string, b: string, wer: string): Promise<void> {
  await zwei(db, a, b);
  const [x, y] = Number(a) < Number(b) ? [a, b] : [b, a];
  await db.query('INSERT INTO patient_keine_dublette (patient_a, patient_b, entschieden_von) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [x, y, wer]);
  await protokolliere(db, { actor: wer, action: 'dublette_verneint', objectType: 'patient', objectId: x, details: { anderer: y } });
}

export interface Zusammengefuehrt {
  behalten: { id: string; patientennummer: string };
  dublette: { id: string; patientennummer: string };
  /** je Tabelle, wie viele Zeilen gewandert sind */
  verschoben: Record<string, number>;
  /** Kommende Termine, die jetzt dem bleibenden Patienten gehören – im Kalender nachziehen (Initialen, Nummer) */
  termine: string[];
  text: string;
}

/**
 * Die Dublette in den bleibenden Patienten überführen. Reihenfolge: erst die Marke an der Dublette (sie erlaubt
 * dem Trigger das Verschieben von Erklärungen und Dokumenten und zeigt einen halb fertigen Lauf an), dann leere
 * Stammdaten ergänzen, dann Tabelle für Tabelle verschieben. Ohne Transaktion (Pool) – ein Abbruch mittendrin lässt
 * die Dublette archiviert mit Verweis zurück, ein zweiter Lauf holt den Rest nach.
 */
export async function zusammenfuehren(db: Db, behaltenId: string, dubletteId: string, wer: string): Promise<Zusammengefuehrt> {
  const [behalten, dublette] = await zwei(db, behaltenId, dubletteId);
  if (behalten.status === 'archiviert') throw new KarteiFehler(`${behalten.patientennummer} ist archiviert – zuerst reaktivieren oder den anderen behalten`);
  if (dublette.dublette_von && dublette.dublette_von !== behalten.id) throw new KarteiFehler(`${dublette.patientennummer} ist schon in einen anderen Patienten zusammengeführt`);
  if (behalten.dublette_von) throw new KarteiFehler(`${behalten.patientennummer} ist selbst schon zusammengeführt`);
  // Was die Dublette an Stammdaten hat, bevor ihre Kennungen gelöscht werden
  const d = (await db.query<Record<string, unknown>>(
    `SELECT anrede, titel, geburtsname, geburtsdatum, sprache, kommunikationshilfe, ansprache_hinweis, besonderheiten, beruf_belastung, notiz, hausarzt_id::text, preisliste_id::text,
            lexware_kundennummer, lexware_kontakt_id, exchange_kontakt_id, zwischenrechnung_quartale FROM patient WHERE id = $1`, [dublette.id],
  )).rows[0]!;
  await db.query(
    `UPDATE patient SET dublette_von = $2, status = 'archiviert', archiviert_am = coalesce(archiviert_am, now()), geaendert_am = now(),
       lexware_kundennummer = NULL, lexware_kontakt_id = NULL, exchange_kontakt_id = NULL WHERE id = $1`, [dublette.id, behalten.id],
  );
  // Leere Felder des bleibenden Patienten aus der Dublette ergänzen – nie Vorhandenes überschreiben
  await db.query(
    `UPDATE patient SET anrede = coalesce(anrede, $2), titel = coalesce(titel, $3), geburtsname = coalesce(geburtsname, $4), geburtsdatum = coalesce(geburtsdatum, $5::date),
       sprache = coalesce(sprache, $6), kommunikationshilfe = coalesce(kommunikationshilfe, $7), ansprache_hinweis = coalesce(ansprache_hinweis, $8), besonderheiten = coalesce(besonderheiten, $9),
       beruf_belastung = coalesce(beruf_belastung, $10), notiz = coalesce(notiz, $11), hausarzt_id = coalesce(hausarzt_id, $12::bigint), preisliste_id = coalesce(preisliste_id, $13::bigint),
       lexware_kundennummer = coalesce(lexware_kundennummer, $14), lexware_kontakt_id = coalesce(lexware_kontakt_id, $15), exchange_kontakt_id = coalesce(exchange_kontakt_id, $16),
       zwischenrechnung_quartale = coalesce(zwischenrechnung_quartale, $17::integer), geaendert_am = now()
     WHERE id = $1`,
    [behalten.id, d.anrede, d.titel, d.geburtsname, d.geburtsdatum, d.sprache, d.kommunikationshilfe, d.ansprache_hinweis, d.besonderheiten, d.beruf_belastung, d.notiz, d.hausarzt_id, d.preisliste_id,
      d.lexware_kundennummer, d.lexware_kontakt_id, d.exchange_kontakt_id, d.zwischenrechnung_quartale],
  );
  const verschoben: Record<string, number> = {};
  const zaehlen = async (name: string, sql: string) => { verschoben[name] = (await db.query<{ id: string }>(sql, [behalten.id, dublette.id])).rows.length; };
  // Kontaktwege: nur, was der bleibende Patient nicht schon hat (Art und normierter Wert); nie primär – das entscheidet Lilli
  await zaehlen('kontakte', `UPDATE patient_kontakt k SET patient_id = $1, primaer = false WHERE k.patient_id = $2
    AND NOT EXISTS (SELECT 1 FROM patient_kontakt x WHERE x.patient_id = $1 AND x.art = k.art AND x.normiert = k.normiert) RETURNING id`);
  await db.query('DELETE FROM patient_kontakt WHERE patient_id = $1', [dublette.id]);
  // Adressen wandern alle (Termine verweisen auf sie), keine davon als Rechnungsadresse
  await zaehlen('adressen', 'UPDATE patient_adresse SET patient_id = $1, rechnungsadresse = false WHERE patient_id = $2 RETURNING id');
  await zaehlen('bezugspersonen', 'UPDATE patient_bezugsperson SET patient_id = $1 WHERE patient_id = $2 RETURNING id');
  await zaehlen('versicherungen', 'UPDATE patient_versicherung SET patient_id = $1 WHERE patient_id = $2 RETURNING id');
  await zaehlen('faelle', 'UPDATE behandlungsfall SET patient_id = $1 WHERE patient_id = $2 RETURNING id');
  await zaehlen('verordnungen', 'UPDATE verordnung SET patient_id = $1 WHERE patient_id = $2 RETURNING id');
  const termine = (await db.query<{ id: string; kommend: boolean }>(
    "UPDATE termin SET patient_id = $1 WHERE patient_id = $2 RETURNING id::text, (status IN ('vorgeschlagen', 'bestaetigt') AND ende >= now()) AS kommend", [behalten.id, dublette.id],
  )).rows;
  verschoben.termine = termine.length;
  await zaehlen('erklaerungen', 'UPDATE patient_erklaerung SET patient_id = $1 WHERE patient_id = $2 RETURNING id');
  await zaehlen('dokumente', 'UPDATE dokument SET patient_id = $1 WHERE patient_id = $2 RETURNING id');
  await zaehlen('verlauf', 'UPDATE patient_kontaktverlauf SET patient_id = $1 WHERE patient_id = $2 RETURNING id');
  await zaehlen('rechnungen', 'UPDATE rechnung SET patient_id = $1 WHERE patient_id = $2 RETURNING id');
  await zaehlen('anfragen', 'UPDATE terminanfrage SET patient_id = $1 WHERE patient_id = $2 RETURNING id');
  await zaehlen('einladungen', 'UPDATE schnelltermin_einladung SET patient_id = $1 WHERE patient_id = $2 RETURNING kennung AS id');
  await protokolliere(db, { actor: wer, action: 'patient_zusammengefuehrt', objectType: 'patient', objectId: behalten.id, details: { dublette: dublette.id, verschoben } });
  const text = VERKNUEPFT_NAME.filter(([k]) => verschoben[k]).map(([k, name]) => `${verschoben[k]} ${name}`).join(', ') || 'nichts zu verschieben';
  return { behalten: { id: behalten.id, patientennummer: behalten.patientennummer }, dublette: { id: dublette.id, patientennummer: dublette.patientennummer }, verschoben, termine: termine.filter((t) => t.kommend).map((t) => t.id), text };
}

/** Die Dublette löschen – nur, wenn nichts an ihr hängt (sonst zusammenführen). Kontaktwege, Adressen, Bezugspersonen, Versicherungen gehen mit */
export async function dubletteLoeschen(db: Db, id: string, wer: string): Promise<{ patientennummer: string }> {
  if (!istId(id)) throw new KarteiFehler('Unbekannter Patient');
  const kopf = (await db.query<Kopf>('SELECT id::text, patientennummer, status::text, dublette_von::text FROM patient WHERE id = $1', [id])).rows[0];
  if (!kopf) throw new KarteiFehler('Diesen Patienten gibt es nicht (mehr)');
  const v = await verknuepfteElemente(db, id);
  if (!istLeer(v)) throw new KarteiFehler(`${kopf.patientennummer} hat Verknüpfungen (${VERKNUEPFT_NAME.filter(([k]) => AKTE.includes(k) && v[k]).map(([, n]) => n).join(', ') || 'Lexware-Kunde'}) – zusammenführen statt löschen`);
  await protokolliere(db, { actor: wer, action: 'patient_geloescht', objectType: 'patient', objectId: id, details: { grund: 'dublette', kontakte: v.kontakte, adressen: v.adressen } });
  await db.query('DELETE FROM patient WHERE id = $1', [id]);
  return { patientennummer: kopf.patientennummer };
}
