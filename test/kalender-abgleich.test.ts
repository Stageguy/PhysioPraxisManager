import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { migriere, type Db } from '../src/db/index.ts';
import { alleTermineSpiegeln, ereignisKoerper, initialen, terminSpiegeln } from '../src/kartei/kalender.ts';
import { patientAnlegen, terminAnlegen, terminStatus } from '../src/kartei/patienten.ts';
import { testdatenAnlegen, testtermineAnlegen } from '../src/kartei/testdaten.ts';
import { neuerHauptschluessel, tresor } from '../src/tresor.ts';
import { graphAttrappe } from './attrappe.ts';
import { berlinZeitUtc } from '../src/zeit.ts';

const t = tresor({ PRAXIS_TRESOR_SCHLUESSEL: neuerHauptschluessel() });
const mitDelete = (g: ReturnType<typeof graphAttrappe>) => Object.assign(g, { async delete(pfad: string) { g.aufrufe.push({ methode: 'DELETE', pfad }); } });

test('Kalender: Termin wird mit Initialen, Kategorie und Ortszeit gespiegelt; Absage löscht das Ereignis', async () => {
  const pg = new PGlite();
  const db = { query: (q, v) => pg.query(q, v), exec: (s) => pg.exec(s) } as Db;
  await migriere(db);
  const graph = mitDelete(graphAttrappe({}));
  const pid = await patientAnlegen(db, t, { vorname: 'Erika', nachname: 'Muster' }, 'l');
  const tid = await terminAnlegen(db, pid, { datum: '2026-11-03', zeit: '09:30', dauerMin: 30 }, 'l');
  assert.equal(await terminSpiegeln(db, graph, tid, 'l'), 'angelegt');
  const post = graph.schreibende().find((a) => a.methode === 'POST')!;
  assert.equal(post.pfad, '/me/calendar/events', 'Produktion: Hauptkalender');
  const k = post.body as ReturnType<typeof ereignisKoerper>;
  assert.equal(k.subject, 'E. M. P-1001');
  assert.deepEqual(k.categories, ['Praxis-Termin']);
  assert.equal(k.start.dateTime, '2026-11-03T09:30:00');
  assert.equal(k.end.dateTime, '2026-11-03T10:00:00');
  assert.doesNotMatch(JSON.stringify(k), /Muster|Erika/, 'kein Name im Kalender');
  const gespeichert = (await db.query<{ e: string }>('SELECT exchange_event_id AS e FROM termin WHERE id = $1', [tid])).rows[0]!.e;
  assert.equal(gespeichert, 'neu-1');
  assert.equal(await terminSpiegeln(db, graph, tid, 'l'), 'aktualisiert');
  await terminStatus(db, pid, tid, 'abgesagt_patient', 'l');
  assert.equal(await terminSpiegeln(db, graph, tid, 'l'), 'entfernt');
  assert.ok(graph.aufrufe.some((a) => a.methode === 'DELETE' && a.pfad === '/me/events/neu-1'));
  assert.equal((await db.query<{ e: string | null }>('SELECT exchange_event_id AS e FROM termin WHERE id = $1', [tid])).rows[0]!.e, null);
  assert.equal(initialen('anna-lena', 'von berg'), 'A. V.');
});

test('Testtermine: drei Patienten mit 12er-Rezept, zwölf Termine in den nächsten Wochen, mehrere pro Tag; Abgleich spiegelt alle künftigen', async () => {
  const pg = new PGlite();
  const db = { query: (q, v) => pg.query(q, v), exec: (s) => pg.exec(s) } as Db;
  await migriere(db);
  await testdatenAnlegen(db, t, { adresse: 'shopping@2late.de', wer: 'test' });
  const z = await testtermineAnlegen(db, t, { adresse: 'shopping@2late.de', wer: 'test' });
  assert.deepEqual([z.patienten, z.termine], [3, 36]);
  assert.ok((await testtermineAnlegen(db, t, { adresse: 'shopping@2late.de', wer: 'test' })).uebersprungen);
  const proRezept = (await db.query<{ n: string }>("SELECT count(*)::text AS n FROM termin t JOIN verordnung v ON v.id = t.verordnung_id WHERE v.anzahl_verordnet = 12 GROUP BY v.id")).rows.map((r) => r.n);
  assert.deepEqual(proRezept, ['12', '12', '12']);
  const spanne = (await db.query<{ erster: Date; letzter: Date }>("SELECT min(beginn) AS erster, max(beginn) AS letzter FROM termin WHERE patient_id IN (SELECT id FROM patient WHERE patientennummer >= 'T-1011')")).rows[0]!;
  const tage = (new Date(spanne.letzter).getTime() - new Date(spanne.erster).getTime()) / 86_400_000;
  assert.ok(tage >= 14 && tage <= 35, `Spanne ${tage} Tage`);
  const proTag = (await db.query<{ n: string }>("SELECT count(*)::text AS n FROM termin WHERE patient_id IN (SELECT id FROM patient WHERE patientennummer >= 'T-1011') GROUP BY beginn::date ORDER BY count(*) DESC LIMIT 1")).rows[0]!.n;
  assert.ok(Number(proTag) >= 2, 'mehrere Termine an einem Tag');
  const graph = mitDelete(graphAttrappe({}));
  const e = await alleTermineSpiegeln(db, graph, 'test');
  assert.equal(e.fehler, 0);
  assert.ok(e.angelegt >= 36, `${e.angelegt} gespiegelt`);
  assert.equal((await db.query<{ n: string }>("SELECT count(*)::text AS n FROM termin WHERE exchange_event_id IS NULL AND status = 'bestaetigt' AND ende >= now()")).rows[0]!.n, '0');
});

test('Ortszeit → UTC auch an den Tagen der Zeitumstellung', () => {
  assert.equal(berlinZeitUtc('2026-10-25', '09:00'), '2026-10-25T08:00:00Z', 'Ende der Sommerzeit: 09:00 MEZ');
  assert.equal(berlinZeitUtc('2026-10-25', '01:30'), '2026-10-24T23:30:00Z', 'vor der Umstellung noch MESZ');
  assert.equal(berlinZeitUtc('2026-10-24', '09:00'), '2026-10-24T07:00:00Z', 'Sommerzeit');
  assert.equal(berlinZeitUtc('2026-03-29', '09:00'), '2026-03-29T07:00:00Z', 'Beginn der Sommerzeit');
  assert.equal(berlinZeitUtc('2026-01-15', '14:30'), '2026-01-15T13:30:00Z');
});
