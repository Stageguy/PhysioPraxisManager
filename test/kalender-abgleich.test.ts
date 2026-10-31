import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alleTermineSpiegeln, ereignisKoerper, fahrtKoerper, initialen, terminSpiegeln } from '../src/kartei/kalender.ts';
import { einstellungSetzen } from '../src/kartei/konfiguration.ts';
import { adresseSpeichern, patientAnlegen, terminAnlegen, terminStatus } from '../src/kartei/patienten.ts';
import { testdatenAnlegen, testdatenErweitert, testtermineAnlegen } from '../src/kartei/testdaten.ts';
import { allePruefen } from '../src/preise/quellen.ts';
import { neuerHauptschluessel, tresor } from '../src/tresor.ts';
import { graphAttrappe } from './attrappe.ts';
import { berlinZeitUtc } from '../src/zeit.ts';
import { testDb } from './testdb.ts';

const t = tresor({ PRAXIS_TRESOR_SCHLUESSEL: neuerHauptschluessel() });
const mitDelete = (g: ReturnType<typeof graphAttrappe>) => Object.assign(g, { async delete(pfad: string) { g.aufrufe.push({ methode: 'DELETE', pfad }); } });

test('Kalender: Termin wird mit Initialen, Kategorie und Ortszeit gespiegelt; Absage löscht das Ereignis', async () => {
  const db = await testDb();
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
  assert.equal(k.body.contentType, 'HTML');
  assert.doesNotMatch(k.body.content, /href/, 'ohne PRAXIS_URL kein Link');
  process.env.PRAXIS_URL = 'http://praxis.test:10001/';
  try {
    const k2 = ereignisKoerper({ id: tid, patient_id: pid, vorname: 'Erika', nachname: 'Muster', patientennummer: 'P-1001', beginn: '2026-11-03T08:30:00Z', ende: '2026-11-03T09:00:00Z', art: 'behandlung', status: 'bestaetigt', exchange_event_id: null, verordnung_id: null } as Parameters<typeof ereignisKoerper>[0]);
    assert.match(k2.body.content, new RegExp(`href="http://praxis.test:10001/patienten/${pid}#termine"`));
  } finally {
    delete process.env.PRAXIS_URL;
  }
  const gespeichert = (await db.query<{ e: string }>('SELECT exchange_event_id AS e FROM termin WHERE id = $1', [tid])).rows[0]!.e;
  assert.equal(gespeichert, 'neu-1');
  assert.equal(await terminSpiegeln(db, graph, tid, 'l'), 'aktualisiert');
  await terminStatus(db, pid, tid, 'abgesagt_patient', 'l');
  assert.equal(await terminSpiegeln(db, graph, tid, 'l'), 'entfernt');
  assert.ok(graph.aufrufe.some((a) => a.methode === 'DELETE' && a.pfad === '/me/events/neu-1'));
  assert.equal((await db.query<{ e: string | null }>('SELECT exchange_event_id AS e FROM termin WHERE id = $1', [tid])).rows[0]!.e, null);
  assert.equal(initialen('anna-lena', 'von berg'), 'A. V.');
});

test('Hausbesuch im Kalender (W130): Adresse als Ort, Erinnerung zum Beginn der Anfahrt, Wegbeschreibung, Fahrt hin und zurück als eigene Ereignisse; Nachbar ändert die Rückfahrt; Absage löscht alles', async () => {
  const db = await testDb();
  const graph = mitDelete(graphAttrappe({}));
  await einstellungSetzen(db, 'fahrtzeit_orte', 'Türkheim = 15', 'x');
  await einstellungSetzen(db, 'praxis_adresse', 'Kneippstraße 1, 86825 Bad Wörishofen', 'x');
  const pid = await patientAnlegen(db, t, { vorname: 'Hanna', nachname: 'Heim' }, 'l');
  const aid = await adresseSpeichern(db, pid, { bezeichnung: 'Zuhause', strasse: 'Bahnhofstraße', hausnummer: '3', plz: '86842', ort: 'Türkheim', typ: 'hausbesuch' }, 'l');
  const tid = await terminAnlegen(db, pid, { datum: '2026-11-05', zeit: '10:00', dauerMin: 45, behandlungsort: `adresse:${aid}` }, 'l');
  assert.equal(await terminSpiegeln(db, graph, tid, 'l'), 'angelegt');
  const posts = graph.schreibende().filter((a) => a.methode === 'POST');
  assert.equal(posts.length, 3, 'Hausbesuch, Fahrt hin, Fahrt zurück');
  assert.ok(posts.every((a) => a.pfad === '/me/calendar/events'));
  const hb = posts[0]!.body as ReturnType<typeof ereignisKoerper>;
  const hin = posts[1]!.body as ReturnType<typeof fahrtKoerper>;
  const zurueck = posts[2]!.body as ReturnType<typeof fahrtKoerper>;
  assert.equal(hb.subject, 'H. H. P-1001');
  assert.equal(hb.location.displayName, 'Bahnhofstraße 3, 86842 Türkheim', 'die genaue Adresse als Ort');
  assert.deepEqual([hb.isReminderOn, hb.reminderMinutesBeforeStart], [true, 15], 'Erinnerung, wenn die Anfahrt beginnt');
  assert.match(hb.body.content, /Behandlung · Hausbesuch · Termin Nr\./);
  assert.match(hb.body.content, /<a href="https:\/\/maps\.apple\.com\/\?daddr=Bahnhofstra[^"]*">Apple Karten<\/a> · <a href="https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=Bahnhofstra[^"]*">Google Maps<\/a>/);
  assert.doesNotMatch(JSON.stringify(posts), /Hanna|Heim/, 'kein Name im Kalender');
  assert.deepEqual([hin.subject, hin.start.dateTime, hin.end.dateTime, hin.location.displayName, hin.categories, hin.showAs, hin.isReminderOn], ['Fahrt zum Hausbesuch H. H. P-1001', '2026-11-05T09:45:00', '2026-11-05T10:00:00', 'Bahnhofstraße 3, 86842 Türkheim', ['Praxis-Fahrt'], 'busy', false]);
  assert.match(hin.body.content, /15 Min\.[\s\S]*Apple Karten[\s\S]*Google Maps/);
  assert.deepEqual([zurueck.subject, zurueck.start.dateTime, zurueck.end.dateTime, zurueck.location.displayName], ['Rückfahrt zur Praxis', '2026-11-05T10:45:00', '2026-11-05T11:00:00', 'Kneippstraße 1, 86825 Bad Wörishofen']);
  assert.match(zurueck.body.content, /daddr=Kneippstra/);
  const ids = async (id = tid) => (await db.query<{ e: string | null; v: string | null; n: string | null }>('SELECT exchange_event_id AS e, fahrt_vor_event_id AS v, fahrt_nach_event_id AS n FROM termin WHERE id = $1', [id])).rows[0]!;
  assert.deepEqual(await ids(), { e: 'neu-1', v: 'neu-2', n: 'neu-3' });
  // Noch einmal: alles wird nachgezogen, nichts doppelt
  graph.aufrufe.length = 0;
  assert.equal(await terminSpiegeln(db, graph, tid, 'l'), 'aktualisiert');
  assert.deepEqual(graph.schreibende().map((a) => [a.methode, a.pfad]), [['PATCH', '/me/events/neu-1'], ['PATCH', '/me/events/neu-2'], ['PATCH', '/me/events/neu-3']]);
  // Ein zweiter Hausbesuch im selben Ort direkt danach: die Rückfahrt des ersten entfällt (die Fahrt gehört zum zweiten, innerorts 10 Min.) – sein Rückfahrt-Ereignis verschwindet
  const tid2 = await terminAnlegen(db, pid, { datum: '2026-11-05', zeit: '11:00', dauerMin: 30, behandlungsort: `adresse:${aid}` }, 'l');
  graph.aufrufe.length = 0;
  assert.equal(await terminSpiegeln(db, graph, tid2, 'l'), 'angelegt');
  const wege = graph.schreibende().map((a) => [a.methode, a.pfad]);
  assert.ok(wege.some(([m, p]) => m === 'DELETE' && p === '/me/events/neu-3'), `Rückfahrt des ersten gelöscht: ${JSON.stringify(wege)}`);
  assert.equal((await ids()).n, null);
  const zweiter = await ids(tid2);
  assert.equal((await db.query<{ vor: number }>('SELECT fahrt_vor_min AS vor FROM termin WHERE id = $1', [tid2])).rows[0]!.vor, 10, 'innerorts');
  assert.ok(zweiter.e && zweiter.v && zweiter.n, 'zweiter Hausbesuch mit Fahrt hin (innerorts) und zurück');
  // Absage des zweiten: seine drei Ereignisse weg, die Rückfahrt des ersten kommt wieder
  await terminStatus(db, pid, tid2, 'abgesagt_patient', 'l');
  graph.aufrufe.length = 0;
  assert.equal(await terminSpiegeln(db, graph, tid2, 'l'), 'entfernt');
  assert.equal(graph.schreibende().filter((a) => a.methode === 'DELETE').length, 3);
  assert.deepEqual(await ids(tid2), { e: null, v: null, n: null });
  assert.ok((await ids()).n, 'Rückfahrt des ersten wieder im Kalender');
  // Praxistermin: Ort „Praxis“, keine Erinnerung, keine Fahrten
  const praxis = await terminAnlegen(db, pid, { datum: '2026-11-06', zeit: '09:00', dauerMin: 30, behandlungsort: 'praxis' }, 'l');
  graph.aufrufe.length = 0;
  await terminSpiegeln(db, graph, praxis, 'l');
  assert.equal(graph.schreibende().length, 1);
  const pk = graph.schreibende()[0]!.body as ReturnType<typeof ereignisKoerper>;
  assert.deepEqual([pk.location.displayName, pk.isReminderOn], ['Praxis', false]);
  // Abgleich ergänzt fehlende Fahrten eines Hausbesuchs (z. B. aus der Zeit vor W130)
  await db.query('UPDATE termin SET fahrt_vor_event_id = NULL WHERE id = $1', [tid]);
  graph.aufrufe.length = 0;
  const e = await alleTermineSpiegeln(db, graph, 'l');
  assert.equal(e.fehler, 0);
  assert.ok(graph.schreibende().some((a) => a.methode === 'POST' && (a.body as { subject: string }).subject.startsWith('Fahrt zum Hausbesuch')), 'Fahrt hin nachgetragen');
  assert.ok((await ids()).v);
});

test('Testtermine: drei Patienten mit 12er-Rezept, zwölf Termine in den nächsten Wochen, mehrere pro Tag; Abgleich spiegelt alle künftigen', async () => {
  const db = await testDb();
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

test('Erweiterte Testdaten: zwei Preislisten aus der GKV-Liste, sechs Patienten mit drei Adressen, Rezepte 6/12 mit Entwürfen, alle Phasen und Rechnungsstatus', async () => {
  const db = await testDb();
  // GKV- und Beihilfe-Fassung wie in den Preislisten-Tests
  const GKV = `Lesefassung gültig ab 01.01.2026\n${[['X0501', 'Allgemeine Krankengymnastik (KG)', '29,63'], ['X1201', 'Manuelle Therapie', '35,59'], ['X0201', 'Manuelle Lymphdrainage MLD - 45 Minuten', '53,94'], ['X0106', 'Klassische Massagetherapie (KMT)', '21,63'], ['X9701', 'Übermittlungsgebühr', '1,40']].map(([n, b, p]) => `${n} ${b}\n(Regelbehandlungszeit 15 bis 25 Minuten) ${p} 2,00`).join('\n')}${Array.from({ length: 20 }, (_, i) => `\nX06${String(i).padStart(2, '0')} Leistung ${i} (KG)\n(Regelbehandlungszeit 15 bis 25 Minuten) ${20 + i},00 2,00`).join('')}`;
  const BH = `<table>${Array.from({ length: 25 }, (_, i) => `<tr><td>${i + 1}</td><td>Leistung ${i} (KG), Richtwert: 15 bis 25 Minuten</td><td>${19 + i},00</td></tr>`).join('')}</table>`;
  const holen = async (url: string) =>
    url.endsWith('.jsp') ? new Response('<a href="/m/a.pdf" title="Link &ouml;ffnet PDF &quot;Anlage 2: Verg&uuml;tungsvereinbarung (Lesefassung, g&uuml;ltig ab 01.01.2026)&quot;">x</a>')
      : url.endsWith('.pdf') ? new Response('%PDF') : url.includes('gesetze') ? new Response(BH) : new Response('15. Auflage');
  await allePruefen(db, { speichern: true, holen, textAus: async () => GKV });
  await testdatenAnlegen(db, t, { adresse: 'shopping@2late.de', wer: 'test' });
  await testtermineAnlegen(db, t, { adresse: 'shopping@2late.de', wer: 'test' });
  const e = await testdatenErweitert(db, t, { adresse: 'shopping@2late.de', wer: 'test' });
  assert.deepEqual([e.uebersprungen, e.preislisten, e.patienten], [false, 2, 14]);
  assert.ok((await testdatenErweitert(db, t, { adresse: 'shopping@2late.de', wer: 'test' })).uebersprungen);
  // Preislisten: Gerundet aktiv, Tagesgast freigegeben, Preise aufgerundet (MT 35,59 → 36 bzw. × 1,6 = 56,94 → 57)
  const listen = (await db.query<{ name: string; status: string; aktiv: boolean }>("SELECT name, status::text, aktiv, standard FROM preisliste WHERE name LIKE '%GKV%' ORDER BY id")).rows;
  assert.deepEqual(listen, [{ name: 'Gerundet (GKV × 1,0)', status: 'freigegeben', aktiv: true, standard: true }, { name: 'Tagesgast (GKV × 1,6)', status: 'freigegeben', aktiv: true, standard: false }]);
  const mt = (await db.query<{ name: string; p: string }>("SELECT l.name, pp.eigener_preis::text AS p FROM preisliste_position pp JOIN preisliste l ON l.id = pp.preisliste_id WHERE pp.nummer = '21201' AND l.name LIKE '%GKV%' ORDER BY l.id")).rows;
  assert.deepEqual(mt.map((x) => x.p), ['36.00', '57.00']);
  // Sechs Patienten: drei Adressen, genau eine Rechnungsadresse, Mail shopping@2late.de
  const sechs = (await db.query<{ nr: string; adressen: string; rechnung: string; mail: string }>(
    `SELECT p.patientennummer AS nr, (SELECT count(*)::text FROM patient_adresse a WHERE a.patient_id = p.id) AS adressen,
       (SELECT count(*)::text FROM patient_adresse a WHERE a.patient_id = p.id AND a.rechnungsadresse) AS rechnung,
       (SELECT normiert FROM patient_kontakt k WHERE k.patient_id = p.id AND k.art = 'email') AS mail
     FROM patient p WHERE p.patientennummer BETWEEN 'T-1021' AND 'T-1026' ORDER BY p.patientennummer`,
  )).rows;
  assert.equal(sechs.length, 6);
  for (const x of sechs) assert.deepEqual([x.adressen, x.rechnung, x.mail], ['3', '1', 'shopping@2late.de'], x.nr);
  // Rezepte mit 6 und 12 Einheiten, genauso viele Termine, Rechnungsentwurf mit genauso vielen Positionen und Preisen aus der Liste des Patienten
  const rezepte = (await db.query<{ nr: string; einheiten: number; termine: string; status: string; positionen: string; betrag: string }>(
    `SELECT p.patientennummer AS nr, v.anzahl_verordnet AS einheiten, (SELECT count(*)::text FROM termin t WHERE t.verordnung_id = v.id) AS termine,
       r.status::text, (SELECT count(*)::text FROM rechnung_position x WHERE x.rechnung_id = r.id) AS positionen, r.betrag::text
     FROM verordnung v JOIN patient p ON p.id = v.patient_id JOIN rechnung r ON r.verordnung_id = v.id
     WHERE p.patientennummer BETWEEN 'T-1021' AND 'T-1026' AND v.art IN ('erst', 'korrektur') AND r.status = 'entwurf' ORDER BY p.patientennummer`,
  )).rows;
  assert.deepEqual(rezepte.map((r) => [r.einheiten, r.termine, r.status, r.positionen]), [[6, '6', 'entwurf', '6'], [12, '12', 'entwurf', '12'], [6, '6', 'entwurf', '6'], [12, '12', 'entwurf', '12'], [6, '6', 'entwurf', '6'], [10, '12', 'entwurf', '10']], 'Sven: Korrektur auf 10 – Entwurf und Termine wandern mit');
  assert.equal(rezepte[1]!.betrag, '432.00', 'Oskar: 12 × 36 € (Gerundet)');
  assert.equal(rezepte[3]!.betrag, '684.00', 'Quirin: 12 × 57 € (Tagesgast)');
  // Pinnwand: jede Phase besetzt; Rechnungen in jedem Status; Abweichung, Korrektur, Zweitschrift, Abbruch, archivierter Patient
  const phasen = (await db.query<{ phase: string }>('SELECT DISTINCT phase::text FROM behandlungsfall')).rows.map((r) => r.phase).sort();
  assert.deepEqual(phasen, ['abschluss', 'anamnese', 'anfrage', 'archiviert', 'aufnahme', 'befund_start', 'behandlung', 'nachsorge', 'rechnung']);
  const status = (await db.query<{ s: string }>('SELECT DISTINCT status::text AS s FROM rechnung')).rows.map((r) => r.s).sort();
  assert.deepEqual(status, ['bezahlt', 'entwurf', 'freigegeben', 'gesendet', 'in_lexware', 'storniert']);
  assert.ok((await db.query("SELECT 1 FROM rechnung WHERE lexware_abweichung LIKE 'Betrag in Lexware%'")).rows.length);
  assert.ok((await db.query("SELECT 1 FROM verordnung WHERE art = 'korrektur'")).rows.length && (await db.query('SELECT 1 FROM verordnung WHERE zweitschrift_am IS NOT NULL')).rows.length && (await db.query("SELECT 1 FROM verordnung WHERE status = 'abgebrochen'")).rows.length);
  assert.ok((await db.query("SELECT 1 FROM patient WHERE status = 'archiviert'")).rows.length);
  assert.ok((await db.query("SELECT 1 FROM patient_bezugsperson WHERE rolle = 'rechnungsempfaenger'")).rows.length);
  assert.ok((await db.query("SELECT 1 FROM termin WHERE status IN ('abgesagt_patient', 'nicht_erschienen')")).rows.length);
  // Die Rechnungsempfängerin (Mutter) steht auf dem Entwurf des Kindes – sobald es einen gibt – und der Bank-Baustein liegt bei allen Rezept-Entwürfen
  assert.ok((await db.query("SELECT 1 FROM rechnung_textbaustein WHERE kurzname = 'Bankverbindung'")).rows.length);
});
