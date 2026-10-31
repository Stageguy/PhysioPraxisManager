/** Terminkalender zum Buchen (W116): Pause je Terminart, Lücken, Zähler, Suche, nächste freie Zeiten, Monats- und Tagesansicht, Terminwahl, Absage */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { belegteZeiten } from '../src/anfragen/kalender.ts';
import { freieSlots, oeffnungszeitenLesen, wochentag } from '../src/anfragen/slots.ts';
import { cockpitDaten } from '../src/cockpit/daten.ts';
import type { Db } from '../src/db/index.ts';
import { karteiDienst } from '../src/kartei/dienst.ts';
import { einstellungSetzen } from '../src/kartei/konfiguration.ts';
import { patientAnlegen, terminAnlegen, terminLesen } from '../src/kartei/patienten.ts';
import { terminartSpeichern } from '../src/kartei/terminarten.ts';
import { testkalenderAnlegen } from '../src/kartei/testdaten.ts';
import { anfaenge, freieWoche, monatsPlan, naechsteFreie, passen, tagesLuecken } from '../src/kartei/terminplan.ts';
import { praxisDienst } from '../src/server.ts';
import { neuerHauptschluessel, tresor } from '../src/tresor.ts';
import { berlinMitternachtUtc, berlinZeitUtc, datumBerlin, heuteBerlin, tagPlus, zeitBerlin } from '../src/zeit.ts';
import { testDb } from './testdb.ts';

const OEFFNUNG = 'Mo 08:00-12:00; Di 08:00-12:00; Mi 08:00-12:00; Do 08:00-12:00; Fr 08:00-12:00';
const REGELN = { oeffnungszeiten: oeffnungszeitenLesen(OEFFNUNG), dauerMin: 30, pufferMin: 10, wochenendeGesperrt: true };
// Ein Montag mindestens acht Tage voraus – so spielt „heute“ nie in die Lücken hinein
const MONTAG = (() => { let d = tagPlus(heuteBerlin(), 8); while (wochentag(d) !== 1) d = tagPlus(d, 1); return d; })();
const DIENSTAG = tagPlus(MONTAG, 1);
const MONAT = MONTAG.slice(0, 7);

test('Lücken, Zähler und Anfangszeiten rechnen mit der Pause; freieSlots hält die Pause vor dem nächsten Block frei', () => {
  const belegt = [{ beginn: berlinZeitUtc(MONTAG, '09:00'), ende: berlinZeitUtc(MONTAG, '09:45') }]; // 30 Min. Termin + 15 Pause
  const l = tagesLuecken(MONTAG, REGELN, belegt);
  assert.deepEqual(l.map((x) => [zeitBerlin(x.beginn), zeitBerlin(x.ende), x.minuten]), [['08:00', '09:00', 60], ['09:45', '12:00', 135]]);
  assert.equal(passen(l, 30, 10), 1 + 3, '(60+10)/40 → 1, (135+10)/40 → 3');
  assert.equal(passen(l, 60, 10), 1 + 2);
  assert.deepEqual(anfaenge(l, 30, 10).map(zeitBerlin), ['08:00', '09:45', '10:25', '11:05']);
  assert.deepEqual(tagesLuecken(tagPlus(MONTAG, 5), REGELN, []), [], 'Samstag geschlossen');
  const s = freieSlots({ ab: berlinMitternachtUtc(MONTAG), tage: 1, belegt, regeln: REGELN }).map((x) => zeitBerlin(x.beginn));
  assert.ok(s.includes('08:00') && s.includes('08:15'), '08:15–08:45 lässt die Pause bis 09:00');
  assert.ok(!s.includes('08:30'), '08:30–09:00 ließe keine Pause vor dem Block');
  assert.ok(s.includes('09:45'), 'direkt nach der Pause des Blocks');
});

let basis = '';
let db: Db;
let server: ReturnType<typeof praxisDienst>;
let pid = '';
let tid = '';
const t = tresor({ PRAXIS_TRESOR_SCHLUESSEL: neuerHauptschluessel() });
const wer = { 'Tailscale-User-Login': 'lilli@example.org' };
const post = (felder: Record<string, string>) => fetch(`${basis}/patienten/aktion`, { method: 'POST', redirect: 'manual', headers: { ...wer, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(felder).toString() });
const ziel = (r: Response) => decodeURIComponent(r.headers.get('location') ?? '');
const seite = async (pfad: string) => (await fetch(`${basis}${pfad}`, { headers: wer })).text();
const status = async (pfad: string) => (await fetch(`${basis}${pfad}`, { headers: wer })).status;

before(async () => {
  db = await testDb();
  server = praxisDienst({ erlaubt: ['lilli@example.org'], fassung: 't', angemeldet: async () => true, pruefen: async () => [], kartei: karteiDienst({ db, tresor: t }) });
  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await einstellungSetzen(db, 'oeffnungszeiten', OEFFNUNG, 'x');
  await einstellungSetzen(db, 'termin_puffer_min', '10', 'x');
  pid = await patientAnlegen(db, t, { vorname: 'Kalle', nachname: 'Kalender', kontakte: [{ art: 'email', wert: 'kalle@example.org' }] }, 'x');
  const taId = await terminartSpeichern(db, { sektion: 'rezept', kurz: 'Lymphdrainage lang', dauerMin: 45, pufferMin: 15 }, 'x');
  tid = await terminAnlegen(db, pid, { datum: MONTAG, zeit: '09:00', dauerMin: 45, terminartId: taId }, 'x');
  // Dienstag voll: acht Termine je 30 Minuten von 08:00 bis 11:30 – mit 10 Minuten Pause bleibt keine Lücke
  for (let i = 0; i < 8; i++) await terminAnlegen(db, pid, { datum: DIENSTAG, zeit: `${String(8 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`, dauerMin: 30 }, 'x');
});
after(() => server.close());

test('Belegte Zeiten tragen die Pause der Terminart; Monatsplan: Stand je Tag, Lücken, Zähler', async () => {
  const belegt = await belegteZeiten(undefined, db, berlinMitternachtUtc(MONTAG), berlinMitternachtUtc(DIENSTAG), { pufferMin: 10 });
  assert.deepEqual(belegt.map((b) => [zeitBerlin(b.beginn), zeitBerlin(b.ende)]), [['09:00', '10:00']], '45 Min. + 15 Pause der Terminart');
  const plan = await monatsPlan(db, undefined, Number(MONAT.slice(0, 4)), Number(MONAT.slice(5, 7)));
  const tag = (d: string) => plan.tage.find((x) => x.datum === d)!;
  assert.equal(tag(MONTAG).stand, 'teilweise');
  assert.deepEqual(tag(MONTAG).luecken.map((l) => [zeitBerlin(l.beginn), zeitBerlin(l.ende), l.minuten]), [['08:00', '09:00', 60], ['10:00', '12:00', 120]]);
  assert.equal(tag(DIENSTAG).stand, 'voll');
  assert.equal(tag(DIENSTAG).termine.length, 8);
  assert.equal(tag(tagPlus(MONTAG, 2)).stand, 'frei');
  assert.equal(tag(tagPlus(MONTAG, 5)).stand, 'zu', 'Samstag');
  assert.equal(plan.pufferMin, 10);
  assert.ok(plan.frei.find((f) => f.dauer === 60)!.anzahl >= 3, 'Montag allein fasst 1 + 2 Sechziger');
  assert.ok(plan.frei.find((f) => f.dauer === 20)!.anzahl > plan.frei.find((f) => f.dauer === 60)!.anzahl);
});

test('Suche je Woche und die nächsten freien Zeiten', async () => {
  const w = await freieWoche(db, undefined, { dauer: 30, wochenstart: tagPlus(MONTAG, 2) });
  assert.equal(w.wochenstart, MONTAG, 'Montag der Woche');
  assert.deepEqual(w.tage[0]!.zeiten.map(zeitBerlin), ['08:00', '10:00', '10:40', '11:20']);
  assert.deepEqual(w.tage[1]!.zeiten, [], 'Dienstag voll');
  assert.deepEqual(w.tage[5]!.zeiten, [], 'Samstag zu');
  const n = await naechsteFreie(db, undefined, { jetzt: new Date(berlinMitternachtUtc(MONTAG)) });
  assert.deepEqual(n.map((f) => [datumBerlin(f.beginn), zeitBerlin(f.beginn), zeitBerlin(f.ende)]), [[MONTAG, '08:00', '08:30'], [MONTAG, '10:00', '10:30']]);
  const c = await cockpitDaten({ db, namenZeigen: false, jetzt: new Date(berlinMitternachtUtc(MONTAG)) });
  assert.equal(c.freie?.length, 2);
  assert.equal(c.freie![0]!.tag, MONTAG);
  assert.match(c.freie![0]!.text, /08:00/);
});

test('Monatsansicht: Kästen mit Stand, „Mehr ›“, Zähler, Lücken sichtbar im Kasten (W125); Suche mit Wochenblättern; Patient als Kontext', async () => {
  const html = await seite(`/kalender?ansicht=monat&monat=${MONAT}`);
  assert.match(html, new RegExp(`<a class="mk-tag stand-teilweise" href="/kalender\\?ansicht=tag&tag=${MONTAG}" data-hilfe="kalender.monat-tag">`));
  assert.match(html, new RegExp(`<a class="mk-tag stand-voll" href="/kalender\\?ansicht=tag&tag=${DIENSTAG}"`));
  assert.match(html, /<span class="mk-e mehr">Mehr ›<\/span>/, 'acht Termine → fünf plus „Mehr ›“');
  assert.match(html, /<span class="mk-zaehler"><b>\d+<\/b> × 20 Min\.<\/span>/);
  assert.match(html, /<span class="mk-e luecke"><small>10:00–12:00 \(120\)<\/small> frei<\/span>/);
  assert.match(html, /<span class="mk-mehr"><span class="mk-e bilanz"><b class="frei">180 Min\. frei<\/b> · <b>\d+ Min\. gebucht<\/b><\/span><span class="mk-e rahmen"><small>08:00–12:00<\/small> Öffnung<\/span>/, 'Bilanz und Öffnung als erste Zeilen im Hover (W125b)');
  assert.match(html, /<small>09:00–09:45 \(45\)<\/small> K\. K\./, 'Kürzel, Dauer in Klammern');
  const s = await seite(`/kalender?ansicht=monat&monat=${MONAT}&suche=30&woche=${MONTAG}`);
  assert.match(s, new RegExp(`<a class="mk-zeit" href="/kalender/termin\\?datum=${MONTAG}&zeit=08:00&dauer_min=30" data-hilfe="kalender.suche.zeit">08:00</a>`));
  assert.match(s, new RegExp(`href="/kalender\\?ansicht=monat&monat=${MONAT}&suche=30&woche=${tagPlus(MONTAG, 7)}" data-hilfe="kalender.suche.woche"`));
  const p = await seite(`/kalender?ansicht=monat&monat=${MONAT}&suche=30&woche=${MONTAG}&patient=${pid}`);
  assert.match(p, /Termin für <b>Kalle Kalender<\/b>/);
  assert.match(p, new RegExp(`<a class="mk-zeit" href="/patienten/${pid}/neu/termin\\?datum=${MONTAG}&zeit=08:00&dauer_min=30" data-fenster="Neuer Termin"`));
  assert.equal(await status('/kalender?ansicht=monat&monat=2026-13'), 404);
});

test('Tagesansicht: Lücken grün mit Link, Stift und Absage am Termin; Terminwahl; Vorbelegung des Terminformulars; Anlegen aus der Wahl', async () => {
  const html = await seite(`/kalender?ansicht=tag&tag=${MONTAG}`);
  assert.match(html, new RegExp(`<a class="kal-termin luecke" href="/kalender/termin\\?datum=${MONTAG}&zeit=08:00&dauer_min=30" data-hilfe="kalender.luecke"><b>08:00–09:00</b><span>frei · 60 Min\\.</span></a>`), 'Standarddauer vorbelegt');
  assert.match(html, new RegExp(`href="/patienten/${pid}/termine/${tid}/bearbeiten" data-fenster="Termin bearbeiten" data-hilfe="kalender.termin-stift"`));
  assert.match(html, new RegExp(`href="/patienten/${pid}/termine/${tid}/absagen" data-fenster="Termin absagen" data-hilfe="kalender.termin-absagen"`));
  const mit = await seite(`/kalender?ansicht=tag&tag=${MONTAG}&patient=${pid}`);
  assert.match(mit, new RegExp(`<a class="kal-termin luecke" href="/patienten/${pid}/neu/termin\\?datum=${MONTAG}&zeit=10:00&dauer_min=30" data-fenster="Neuer Termin"`));
  const wahl = await seite(`/kalender/termin?datum=${MONTAG}&zeit=10:00&dauer_min=40`);
  assert.match(wahl, new RegExp(`<input type="hidden" name="aktion" value="termin_anlegen">[\\s\\S]*<select name="id" required data-hilfe="termin.wahl.patient">[\\s\\S]*name="datum" required value="${MONTAG}"[\\s\\S]*name="zeit" required value="10:00"[\\s\\S]*name="dauer_min" value="40"`));
  const form = await seite(`/patienten/${pid}/neu/termin?datum=${MONTAG}&zeit=10:00&dauer_min=40`);
  assert.match(form, new RegExp(`name="datum" required value="${MONTAG}"[\\s\\S]*name="zeit" required value="10:00"[\\s\\S]*name="dauer_min" value="40"`));
  const r = await post({ aktion: 'termin_anlegen', id: pid, datum: MONTAG, zeit: '10:00', dauer_min: '40', zurueck: '/kalender/termin' });
  assert.match(ziel(r), new RegExp(`^/patienten/${pid}\\?meldung=Termin angelegt`));
  const danach = await monatsPlan(db, undefined, Number(MONAT.slice(0, 4)), Number(MONAT.slice(5, 7)));
  assert.deepEqual(danach.tage.find((x) => x.datum === MONTAG)!.luecken.map((l) => [zeitBerlin(l.beginn), zeitBerlin(l.ende)]), [['08:00', '09:00'], ['10:50', '12:00']], 'neuer Termin 10:00–10:40 + 10 Pause');
  // 11:05–11:50 + 10 Pause lässt 10:50–11:05 (15 Min.) übrig – zu kurz für einen Termin, also kein Angebot
  await terminAnlegen(db, pid, { datum: MONTAG, zeit: '11:05', dauerMin: 45 }, 'x');
  const kurz = await seite(`/kalender?ansicht=tag&tag=${MONTAG}`);
  assert.ok(!/frei · 15 Min\./.test(kurz), 'Lücke unter 20 Minuten erscheint nicht');
  assert.match(kurz, /<b>08:00–09:00<\/b><span>frei · 60 Min\./);
  const kurzLuecke = (await monatsPlan(db, undefined, Number(MONAT.slice(0, 4)), Number(MONAT.slice(5, 7)))).tage.find((x) => x.datum === MONTAG)!.luecken.find((l) => l.minuten < 20);
  assert.equal(kurzLuecke?.minuten, 15, 'im Plan bleibt sie (zählt 0 Termine)');
});

test('Kalender-Testdaten (W116f): laufen einmal, Montag voll, Schließtag gesperrt, Terminart mit eigener Pause', async () => {
  const k = await testkalenderAnlegen(db, t, { adresse: 'shopping@2late.de', wer: 'test' });
  assert.deepEqual([k.uebersprungen, k.patienten, k.termine], [false, 3, 17]);
  assert.ok((await testkalenderAnlegen(db, t, { adresse: 'shopping@2late.de', wer: 'test' })).uebersprungen);
  const freitag = tagPlus(k.montag, 4);
  const planMo = await monatsPlan(db, undefined, Number(k.montag.slice(0, 4)), Number(k.montag.slice(5, 7)));
  assert.equal(planMo.tage.find((x) => x.datum === k.montag)!.stand, 'voll');
  const planFr = await monatsPlan(db, undefined, Number(freitag.slice(0, 4)), Number(freitag.slice(5, 7)));
  assert.deepEqual([planFr.tage.find((x) => x.datum === freitag)!.stand, planFr.tage.find((x) => x.datum === freitag)!.freierTag], ['zu', 'Fortbildung (erfunden)']);
  const ta = (await db.query<{ p: number | null }>("SELECT puffer_min AS p FROM terminart WHERE kurz = 'Lymphdrainage 45 + Rüstzeit'")).rows[0]!;
  assert.equal(Number(ta.p), 15);
});

test('Absage: Formular, Aktion setzt Status und wählt die Nachricht auf der Patientenseite vor; danach nicht mehr änderbar', async () => {
  const html = await seite(`/patienten/${pid}/termine/${tid}/absagen`);
  assert.match(html, /<input type="hidden" name="aktion" value="termin_absagen">[\s\S]*name="status" value="abgesagt_praxis" checked[\s\S]*name="status" value="nicht_erschienen"/);
  const r = await post({ aktion: 'termin_absagen', id: pid, termin_id: tid, status: 'abgesagt_patient', zurueck: `/patienten/${pid}/termine/${tid}/absagen` });
  assert.match(ziel(r), new RegExp(`^/patienten/${pid}\\?vorlage=absage_ersatztermin&termin=${tid}&meldung=Termin abgesagt\\.[^#]*#nachricht$`));
  assert.equal((await terminLesen(db, pid, tid))!.status, 'abgesagt_patient');
  const ps = await seite(`/patienten/${pid}?vorlage=absage_ersatztermin&termin=${tid}`);
  assert.match(ps, /<option value="absage_ersatztermin" selected>/);
  assert.match(ps, new RegExp(`<option value="${tid}" selected>[^<]*\\(abgesagt\\)</option>`));
  assert.equal(await status(`/patienten/${pid}/termine/${tid}/absagen`), 404, 'abgesagt → nicht mehr änderbar');
});
