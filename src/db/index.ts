/**
 * PostgreSQL – die Quelle der Wahrheit (Leitplanke 5). Der Code spricht nur mit `Db`, damit die
 * Prüfungen dasselbe gegen ein eingebettetes PostgreSQL (PGlite) laufen lassen können.
 */
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

export interface Db {
  query<T = Record<string, unknown>>(text: string, werte?: unknown[]): Promise<{ rows: T[] }>;
  /** Mehrere Anweisungen ohne Parameter (Migrationen) */
  exec(sql: string): Promise<unknown>;
}

export interface Verbindung extends Db {
  ende(): Promise<void>;
}

export function verbinde(url = process.env.DATABASE_URL): Verbindung {
  if (!url) throw new Error('DATABASE_URL fehlt – siehe .env.example');
  const pool = new pg.Pool({ connectionString: url, max: 4 });
  return {
    query: async <T>(text: string, werte?: unknown[]) => ({ rows: (await pool.query(text, werte)).rows as T[] }),
    exec: (sql) => pool.query(sql),
    ende: () => pool.end(),
  };
}

const MIGRATIONEN = new URL('./migrations/', import.meta.url);

/** Offene Migrationen in Namensreihenfolge anwenden; gibt die Namen der angewendeten zurück. */
export async function migriere(db: Db, ordner: URL = MIGRATIONEN): Promise<string[]> {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const erledigt = new Set((await db.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const dateien = (await readdir(ordner)).filter((d) => d.endsWith('.sql')).sort();
  const neu: string[] = [];
  for (const datei of dateien) {
    if (erledigt.has(datei)) continue;
    const sql = await readFile(new URL(datei, ordner), 'utf8');
    await db.exec(`BEGIN;\n${sql}\nINSERT INTO schema_migrations (name) VALUES ('${datei.replace(/'/g, "''")}');\nCOMMIT;`);
    neu.push(datei);
  }
  return neu;
}

/** Ins Protokoll schreiben – ohne Patientendaten, nur Kennungen und Zahlen */
export async function protokolliere(
  db: Db,
  e: { actor: string; action: string; objectType?: string; objectId?: string; details?: Record<string, unknown> },
): Promise<void> {
  await db.query(
    'INSERT INTO audit_event (actor, action, object_type, object_id, details) VALUES ($1, $2, $3, $4, $5)',
    [e.actor, e.action, e.objectType ?? null, e.objectId ?? null, JSON.stringify(e.details ?? {})],
  );
}
