/**
 * Konfiguration (W80): Textbausteine für Rechnungen und Praxis-Einstellungen. Die Konfigurationsseite
 * verlinkt außerdem auf Preislisten und Wellness-Katalog – alles, was Lilli selbst pflegt.
 */
import { protokolliere, type Db } from '../db/index.ts';
import { oeffnungszeitenLesen, oeffnungszeitenText } from '../anfragen/slots.ts';
import { KarteiFehler } from './patienten.ts';

export interface Textbaustein {
  id: string;
  code: string;
  kurzname: string;
  text: string;
  wirkung: 'keine' | 'steuerfrei_heilbehandlung' | 'kleinunternehmer';
  automatisch: 'nie' | 'heilbehandlung' | 'wellness' | 'alle';
  aktiv: boolean;
}

export const WIRKUNG_TEXT: Record<Textbaustein['wirkung'], string> = {
  keine: 'nur Text', steuerfrei_heilbehandlung: 'Hinweis § 4 Nr. 14 UStG (Heilbehandlung steuerfrei)', kleinunternehmer: '§ 19 UStG – es wird keine Umsatzsteuer gerechnet',
};
export const AUTOMATISCH_TEXT: Record<Textbaustein['automatisch'], string> = {
  nie: 'nur von Hand', heilbehandlung: 'bei Rechnungen über Heilbehandlung', wellness: 'bei Wellness-Rechnungen', alle: 'bei allen Rechnungen',
};

export async function textbausteine(db: Db, o: { alle?: boolean } = {}): Promise<Textbaustein[]> {
  const { rows } = await db.query<Textbaustein>(`SELECT id::text, code, kurzname, text, wirkung, automatisch, aktiv FROM textbaustein ${o.alle ? '' : 'WHERE aktiv'} ORDER BY reihenfolge, code`);
  return rows;
}

/** Nächste freie Kennung: Buchstabe des Bereichs + Nummer („R4“) */
export async function naechsterCode(db: Db, buchstabe = 'R'): Promise<string> {
  const { rows } = await db.query<{ n: string }>("SELECT coalesce(max(substring(code FROM '[0-9]+$')::int), 0) + 1 AS n FROM textbaustein WHERE code ~ ('^' || $1 || '[0-9]+$')", [buchstabe]);
  return `${buchstabe}${rows[0]!.n}`;
}

export async function textbausteinSpeichern(
  db: Db, d: { id?: string; kurzname: string; text: string; wirkung?: string; automatisch?: string }, wer: string,
): Promise<string> {
  if (!d.kurzname.trim()) throw new KarteiFehler('Der Kurzname fehlt');
  if (!d.text.trim()) throw new KarteiFehler('Der Text fehlt');
  const wirkung = ['keine', 'steuerfrei_heilbehandlung', 'kleinunternehmer'].includes(d.wirkung ?? '') ? d.wirkung! : 'keine';
  const automatisch = ['nie', 'heilbehandlung', 'wellness', 'alle'].includes(d.automatisch ?? '') ? d.automatisch! : 'nie';
  let id = d.id;
  if (id) {
    const r = await db.query('UPDATE textbaustein SET kurzname = $2, text = $3, wirkung = $4, automatisch = $5, geaendert_am = now() WHERE id = $1 RETURNING id', [id, d.kurzname.trim(), d.text.trim(), wirkung, automatisch]);
    if (!r.rows.length) throw new KarteiFehler('Diesen Textbaustein gibt es nicht');
  } else {
    const code = await naechsterCode(db);
    id = (await db.query<{ id: string }>(
      'INSERT INTO textbaustein (code, kurzname, text, wirkung, automatisch, reihenfolge) VALUES ($1, $2, $3, $4, $5, (SELECT coalesce(max(reihenfolge), 0) + 10 FROM textbaustein)) RETURNING id::text',
      [code, d.kurzname.trim(), d.text.trim(), wirkung, automatisch],
    )).rows[0]!.id;
  }
  await protokolliere(db, { actor: wer, action: 'textbaustein_gespeichert', objectType: 'textbaustein', objectId: id });
  return id;
}

export async function textbausteinAktiv(db: Db, id: string, aktiv: boolean, wer: string): Promise<void> {
  await db.query('UPDATE textbaustein SET aktiv = $2, geaendert_am = now() WHERE id = $1', [id, aktiv]);
  await protokolliere(db, { actor: wer, action: aktiv ? 'textbaustein_aktiv' : 'textbaustein_ausgeblendet', objectType: 'textbaustein', objectId: id });
}

export async function einstellungen(db: Db): Promise<Record<string, string>> {
  const { rows } = await db.query<{ schluessel: string; wert: string }>('SELECT schluessel, wert FROM praxis_einstellung');
  return Object.fromEntries(rows.map((r) => [r.schluessel, r.wert]));
}

export const kleinunternehmer = async (db: Db): Promise<boolean> => (await einstellungen(db)).kleinunternehmer === 'ja';

export async function einstellungSetzen(db: Db, schluessel: string, wert: string, wer: string): Promise<void> {
  if (!['kleinunternehmer', 'ust_satz_wellness', 'oeffnungszeiten', 'termin_dauer_min', 'termin_puffer_min', 'anfragen_mailordner'].includes(schluessel)) throw new KarteiFehler('Unbekannte Einstellung');
  if (schluessel === 'kleinunternehmer' && !['ja', 'nein'].includes(wert)) throw new KarteiFehler('Kleinunternehmer: ja oder nein');
  if (schluessel === 'ust_satz_wellness' && !/^\d{1,2}$/.test(wert)) throw new KarteiFehler('Steuersatz als ganze Zahl, z. B. 19');
  if (schluessel === 'oeffnungszeiten') {
    try {
      wert = oeffnungszeitenText(oeffnungszeitenLesen(wert));
    } catch (err) {
      throw new KarteiFehler((err as Error).message);
    }
  }
  if ((schluessel === 'termin_dauer_min' || schluessel === 'termin_puffer_min') && !/^\d{1,3}$/.test(wert)) throw new KarteiFehler('Minuten als ganze Zahl');
  if (schluessel === 'termin_dauer_min' && !(Number(wert) > 0)) throw new KarteiFehler('Die Dauer muss größer 0 sein');
  if (schluessel === 'anfragen_mailordner' && !/^Posteingang(\/[^/]+)+$/.test(wert)) throw new KarteiFehler('Der Ordner liegt unter dem Posteingang, z. B. Posteingang/Terminanfragen');
  await db.query('INSERT INTO praxis_einstellung (schluessel, wert, geaendert_von) VALUES ($1, $2, $3) ON CONFLICT (schluessel) DO UPDATE SET wert = EXCLUDED.wert, geaendert_am = now(), geaendert_von = EXCLUDED.geaendert_von', [schluessel, wert, wer]);
  await protokolliere(db, { actor: wer, action: 'einstellung_geaendert', objectType: 'praxis_einstellung', objectId: schluessel, details: { wert } });
}
