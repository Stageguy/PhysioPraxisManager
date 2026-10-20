/**
 * Datenbankschema anlegen bzw. fortschreiben.
 *
 *   npm run db:migrieren
 */
import { migriere, verbinde } from '../db/index.ts';

const db = verbinde();
try {
  const neu = await migriere(db);
  console.log(neu.length ? `✓ angewendet: ${neu.join(', ')}` : '✓ Schema ist aktuell');
} finally {
  await db.ende();
}
