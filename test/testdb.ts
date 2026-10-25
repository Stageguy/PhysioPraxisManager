/** Eingebettetes PostgreSQL (PGlite) mit allen Migrationen – frisch je Aufruf, kein Netz, keine Datei */
import { PGlite } from '@electric-sql/pglite';
import { migriere, type Db } from '../src/db/index.ts';

export async function testDb(migrieren: (db: Db) => Promise<unknown> = migriere): Promise<Db> {
  const pg = new PGlite();
  const db: Db = { query: async (t, w) => ({ rows: (await pg.query(t, w)).rows as never }), exec: (s) => pg.exec(s) };
  await migrieren(db);
  return db;
}
