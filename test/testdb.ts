/** Eingebettetes PostgreSQL (PGlite) mit allen Migrationen – frisch je Aufruf, kein Netz, keine Datei */
import { PGlite } from '@electric-sql/pglite';
import { migriere, type Db } from '../src/db/index.ts';

export async function testDb(migrieren: (db: Db) => Promise<unknown> = migriere): Promise<Db> {
  const pg = new PGlite();
  const db: Db = { query: async (t, w) => ({ rows: (await pg.query(t, w)).rows as never }), exec: (s) => pg.exec(s) };
  await migrieren(db);
  // Mittagspause (W126) in Prüfungen aus – die vielen Lücken-, Angebots- und Vorschlagsprüfungen rechnen ohne sie; wer sie prüft, setzt sie ausdrücklich
  if (migrieren === migriere) await db.query("INSERT INTO praxis_einstellung (schluessel, wert, geaendert_von) VALUES ('mittagspause_min', '0', 'test') ON CONFLICT (schluessel) DO UPDATE SET wert = '0'");
  return db;
}
