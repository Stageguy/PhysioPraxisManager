/** Schnelltermin (W117): drei freie Zeiten je Dauer aus dem Angebot der Buchungsseite, Vorlage mit Links, Cockpit-Abschnitt, Vorwahl auf der Buchungsseite */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { wochentag } from '../src/anfragen/slots.ts';
import { buchungsSeite } from '../src/buchung/seite.ts';
import { cockpitDaten } from '../src/cockpit/daten.ts';
import type { Db } from '../src/db/index.ts';
import { karteiDienst } from '../src/kartei/dienst.ts';
import { einstellungSetzen } from '../src/kartei/konfiguration.ts';
import { patientAnlegen, terminAnlegen } from '../src/kartei/patienten.ts';
import type { Einladung } from '../src/buchung/angebot.ts';
import { anredeText, buchungsLink, dreiZeiten, einladungPatient, naechsteDauer, neueKennung, schnellDauern, schnellPatientFinden, schnelltermin, vorlageText } from '../src/kartei/schnelltermin.ts';
import { patientLesen } from '../src/kartei/patienten.ts';
import { praxisDienst } from '../src/server.ts';
import { neuerHauptschluessel, tresor } from '../src/tresor.ts';
import { datumBerlin, heuteBerlin, tagPlus, zeitBerlin } from '../src/zeit.ts';
import { testDb } from './testdb.ts';

test('dreiZeiten: möglichst drei verschiedene Tage, sonst zweite Zeiten; Link und Vorlage', () => {
  const t = (d: string, z: string[]) => ({ datum: d, zeiten: z.map((x) => `${d}T${x}:00:00Z`) });
  assert.deepEqual(dreiZeiten([t('2026-11-09', ['07', '08', '09']), t('2026-11-10', ['07']), t('2026-11-11', ['07', '08'])]), ['2026-11-09T07:00:00Z', '2026-11-10T07:00:00Z', '2026-11-11T07:00:00Z']);
  assert.deepEqual(dreiZeiten([t('2026-11-09', ['07', '08', '09']), t('2026-11-10', ['07'])]), ['2026-11-09T07:00:00Z', '2026-11-09T08:00:00Z', '2026-11-10T07:00:00Z'], 'zwei Tage → die zweite Zeit des ersten Tages dazu');
  assert.deepEqual(dreiZeiten([t('2026-11-09', ['07'])]), ['2026-11-09T07:00:00Z'], 'mehr gibt es nicht');
  assert.equal(buchungsLink('https://buchung.example.org/', 30, '2026-11-09T07:00:00.000Z'), 'https://buchung.example.org/?dauer=30&zeit=2026-11-09T07:00Z', 'kurz, ohne Sekunden – Date versteht es');
  assert.equal(new Date('2026-11-09T07:00Z').toISOString(), '2026-11-09T07:00:00.000Z');
  const v = vorlageText(30, [{ beginn: '2026-11-09T07:00:00Z', ende: '2026-11-09T07:30:00Z', text: 'Mo., 09.11., 08:00 Uhr', link: 'https://b/?dauer=30&zeit=x', direkt: '/kalender/termin' }], 'Praxis Test');
  assert.match(v, /^Guten Tag,\n\nfür einen Termin \(30 Minuten\) kann ich Ihnen anbieten:\n1\. Mo\., 09\.11\., 08:00 Uhr\n   https:\/\/b\/\?dauer=30&zeit=x\n\nBitte tippen Sie auf den Link/);
  assert.match(v, /Viele Grüße\nPraxis Test$/);
  assert.match(vorlageText(20, [{ beginn: 'x', ende: 'y', text: 'Mo., 09.11., 08:00 Uhr', link: null, direkt: '/k' }], 'P'), /Bitte antworten Sie kurz mit dem passenden Termin/, 'ohne Buchungsseite ohne Links');
  // Mit Patient (W117b): Anrede und Kennung im Link
  assert.equal(buchungsLink('https://b', 30, '2026-11-09T07:00:00.000Z', 'k7Hx2pQdLmZ'), 'https://b/?dauer=30&zeit=2026-11-09T07:00Z&e=k7Hx2pQdLmZ');
  assert.equal(anredeText({ anrede: 'Frau', vorname: 'Hanna', nachname: 'Müller' }), 'Frau Müller');
  assert.equal(anredeText({ anrede: null, vorname: 'Hanna', nachname: 'Müller' }), 'Hanna Müller');
  assert.equal(anredeText({ anrede: 'Divers', vorname: 'Kim', nachname: 'Müller' }), 'Kim Müller');
  assert.match(vorlageText(30, [{ beginn: 'x', ende: 'y', text: 'Mo., 09.11., 08:00 Uhr', link: 'https://b/?e=k', direkt: '/k' }], 'P', 'Frau Müller'), /^Guten Tag Frau Müller,\n[\s\S]*Ihre Angaben sind schon eingetragen/);
});

let basis = '';
let db: Db;
let server: ReturnType<typeof praxisDienst>;
const t = tresor({ PRAXIS_TRESOR_SCHLUESSEL: neuerHauptschluessel() });
const wer = { 'Tailscale-User-Login': 'lilli@example.org' };
const seite = async (pfad: string) => (await fetch(`${basis}${pfad}`, { headers: wer })).text();
const MONTAG = (() => { let d = tagPlus(heuteBerlin(), 8); while (wochentag(d) !== 1) d = tagPlus(d, 1); return d; })();

before(async () => {
  db = await testDb();
  await einstellungSetzen(db, 'oeffnungszeiten', 'Mo 08:00-10:00; Di 08:00-10:00; Mi 08:00-10:00; Do 08:00-10:00; Fr 08:00-10:00', 'x');
  await einstellungSetzen(db, 'termin_puffer_min', '10', 'x');
  await einstellungSetzen(db, 'buchung_vorlauf_stunden', '0', 'x');
  const pid = await patientAnlegen(db, t, { vorname: 'Schnell', nachname: 'Test', kontakte: [{ art: 'email', wert: 'schnell@example.org' }] }, 'x');
  // Jeder Werktag bis zum Montag voll (08:00–09:50 belegt) – erst ab Montag gibt es wieder etwas
  for (let d = heuteBerlin(); d < MONTAG; d = tagPlus(d, 1)) if (wochentag(d) <= 5) await terminAnlegen(db, pid, { datum: d, zeit: '08:00', dauerMin: 110 }, 'x');
  // Montag 08:00–08:30 belegt (+10 Pause) → erste freie Zeit Montag 08:40; Dienstag ganz frei
  await terminAnlegen(db, pid, { datum: MONTAG, zeit: '08:00', dauerMin: 30 }, 'x');
  const kartei = karteiDienst({ db, tresor: t, buchung: { url: 'https://buchung.example.org', oeffentlich: true } });
  server = praxisDienst({ erlaubt: ['lilli@example.org'], fassung: 't', angemeldet: async () => true, pruefen: async () => [], kartei, cockpit: ({ namenZeigen }) => cockpitDaten({ db, namenZeigen }) });
  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

test('schnelltermin: drei Zeiten an drei Tagen aus dem Angebot, Raster 15, Pause vor dem belegten Block, Links und Direktweg', async () => {
  const s = await schnelltermin(db, undefined, { dauer: 30, buchungUrl: 'https://buchung.example.org/' });
  assert.equal(s.dauer, 30);
  assert.deepEqual(s.zeiten.map((z) => [datumBerlin(z.beginn), zeitBerlin(z.beginn)]), [[MONTAG, '08:45'], [tagPlus(MONTAG, 1), '08:00'], [tagPlus(MONTAG, 2), '08:00']], 'Montag erst nach Termin + Pause im 15-Minuten-Raster, dann je Tag die erste Zeit');
  assert.equal(s.zeiten[0]!.link, `https://buchung.example.org/?dauer=30&zeit=${s.zeiten[0]!.beginn.replace(/:00(\.000)?Z$/, 'Z')}`);
  assert.equal(s.zeiten[0]!.direkt, `/kalender/termin?datum=${MONTAG}&zeit=08:45&dauer_min=30`);
  assert.match(s.vorlage, /1\. .*08:45 Uhr\n   https:\/\/buchung\.example\.org\/\?dauer=30/);
  assert.ok(s.buchung);
  const lang = await schnelltermin(db, undefined, { dauer: 60 });
  assert.deepEqual(lang.zeiten.map((z) => zeitBerlin(z.beginn)), ['08:45', '08:00', '08:00'], '60 Minuten passen Montag ab 08:45 bis 09:45 noch');
  assert.equal(lang.zeiten[0]!.link, null);
  assert.equal((await schnelltermin(db, undefined, { dauer: 999 })).dauer, 60, 'unbekannte Dauer → die nächste angebotene (W117d)');
  assert.deepEqual(s.dauern, [20, 30, 40, 60], 'ohne aktive Terminarten die Vorgabe');
  assert.deepEqual(await schnellDauern(db), [20, 30, 40, 60]);
  assert.equal(naechsteDauer([30, 45, 90], 40), 45);
  assert.equal(naechsteDauer([30, 45, 90], 37), 30, 'Gleichstand → die kürzere');
  assert.equal(naechsteDauer([30, 45, 90], 200), 90);
  assert.match(neueKennung(), /^[A-Za-z0-9]{12}$/, 'nur Buchstaben und Ziffern – kein Link-Erkenner schneidet etwas ab');
  assert.ok(!/[0O1lI]/.test(neueKennung() + neueKennung() + neueKennung()), 'ohne verwechselbare Zeichen');
});

test('schnelltermin mit Patient (W117b): Einladung in der Kartei und beim Buchungsdienst, Kennung im Link, Anrede, Direktweg ins Terminformular', async () => {
  const pid = await patientAnlegen(db, t, { anrede: 'Frau', vorname: 'Hanna', nachname: 'Müller', kontakte: [{ art: 'mobil', wert: '0151 2222222' }, { art: 'email', wert: 'hanna@example.org' }] }, 'x');
  const patient = (await patientLesen(db, t, pid))!;
  const geschoben: Einladung[] = [];
  const s = await schnelltermin(db, undefined, { dauer: 30, buchungUrl: 'https://buchung.example.org', patient, wer: 'lilli', einladen: async (e) => { geschoben.push(e); } });
  assert.deepEqual(s.patient, { id: pid, name: 'Hanna Müller', patientennummer: patient.patientennummer, email: { id: patient.email!.id, adresse: 'hanna@example.org' }, whatsapp: null }, 'Kontaktwege für die Knöpfe Mail und WhatsApp (W117c)');
  assert.equal(s.betreff, 'Terminvorschläge (30 Minuten) – Praxis Lilli Nebel');
  assert.equal(geschoben.length, 1, 'eine Einladung zum Buchungsdienst');
  const e = geschoben[0]!;
  assert.match(e.kennung, /^[A-Za-z0-9]{12}$/);
  assert.deepEqual([e.name, e.telefon, e.email], ['Hanna Müller', '0151 2222222', 'hanna@example.org']);
  assert.ok(Date.parse(e.bis) > Date.now() + 29 * 86_400_000, '30 Tage gültig');
  assert.equal(s.zeiten[0]!.link, `https://buchung.example.org/?dauer=30&zeit=${s.zeiten[0]!.beginn.replace(/:00(\.000)?Z$/, 'Z')}&e=${e.kennung}`, 'Kennung statt Name und Mail im Link');
  assert.ok(!s.zeiten[0]!.link!.includes('hanna'), 'nichts im Klartext');
  assert.equal(s.zeiten[0]!.direkt, `/patienten/${pid}/neu/termin?datum=${MONTAG}&zeit=08:45&dauer_min=30`);
  assert.match(s.vorlage, /^Guten Tag Frau Müller,/);
  assert.equal(await einladungPatient(db, e.kennung), pid, 'die Buchung findet über die Kennung den Patienten');
  assert.equal(await einladungPatient(db, 'gibtesnicht1'), undefined);
  assert.equal(await einladungPatient(db, null), undefined);
  // Buchungsdienst nicht erreichbar: Links bleiben, die Vorlage sagt es
  const kaputt = await schnelltermin(db, undefined, { dauer: 30, buchungUrl: 'https://buchung.example.org', patient, wer: 'lilli', einladen: async () => { throw new Error('Buchungsdienst 503'); } });
  assert.match(kaputt.einladungFehler ?? '', /503/);
  assert.match(kaputt.zeiten[0]!.link ?? '', /&e=/);
  // Ohne Buchungsseite keine Einladung
  const ohne = await schnelltermin(db, undefined, { dauer: 30, patient, wer: 'lilli', einladen: async (x) => { geschoben.push(x); } });
  assert.equal(geschoben.length, 1);
  assert.match(ohne.vorlage, /^Guten Tag Frau Müller,/);
  // Patient finden: Kennung, Nummer, eindeutiger Name
  assert.equal(await schnellPatientFinden(db, pid), pid);
  assert.equal(await schnellPatientFinden(db, patient.patientennummer.toLowerCase()), pid);
  assert.equal(await schnellPatientFinden(db, 'müll'), pid);
  const schnellTest = (await db.query<{ id: string }>("SELECT id::text FROM patient WHERE nachname = 'Test'")).rows[0]!.id;
  assert.equal(await schnellPatientFinden(db, 'Test'), schnellTest, 'eindeutig');
  assert.equal(await schnellPatientFinden(db, 'e'), undefined, 'passt auf beide – nicht eindeutig');
  assert.equal(await schnellPatientFinden(db, ''), undefined);
});

test('Cockpit: vier Kreise, nach ?schnell=30 der gewählte gefüllt, Direkt-buchen-Knöpfe, Vorlage und Kopieren-Knopf; ohne Dauer nur die Kreise', async () => {
  const ohne = await seite('/');
  assert.match(ohne, /<a class="kreis" href="\/\?schnell=20#t-sc" data-hilfe="schnell.dauer" aria-label="20 Minuten">20<\/a><a class="kreis" href="\/\?schnell=30#t-sc"/);
  assert.ok(!ohne.includes('schnell-text'), 'ohne Tipp keine Vorlage');
  const mit = await seite('/?schnell=30&namen=1');
  assert.match(mit, /<a class="kreis aktiv" href="\/\?schnell=30&namen=1#t-sc"/);
  assert.match(mit, new RegExp(`<a class="knopf" href="/kalender/termin\\?datum=${MONTAG}&amp;zeit=08:45&amp;dauer_min=30" data-fenster="Neuer Termin" data-hilfe="schnell.direkt-zeit">`));
  assert.match(mit, /<textarea id="schnell-text" class="ta-baustein" rows="14" readonly data-hilfe="schnell.vorlage">Guten Tag,/);
  assert.match(mit, /<button type="button" class="knopf" data-kopieren="schnell-text" data-hilfe="schnell.kopieren">/);
  assert.match(await seite('/praxis.js'), /data-kopieren/);
  assert.ok(!(await seite('/?schnell=abc')).includes('schnell-text'), 'keine Zahl – keine Vorlage');
  assert.match(await seite('/?schnell=25'), /<a class="kreis aktiv" href="\/\?schnell=20#t-sc"/, 'fremde Dauer → die nächste angebotene (W117d)');
  // Mit Patient (W117b): Feld mit Vorschlagsliste, Kreise tragen den Patienten, Vorlage mit Anrede, Direktweg ins Terminformular
  const hanna = (await db.query<{ id: string; patientennummer: string }>("SELECT id::text, patientennummer FROM patient WHERE nachname = 'Müller'")).rows[0]!;
  const fuer = await seite(`/?schnell=20&patient=${hanna.patientennummer}`);
  assert.match(fuer, new RegExp(`<a class="kreis aktiv" href="/\\?schnell=20&patient=${hanna.id}#t-sc"`));
  assert.match(fuer, /<form method="get" action="\/" class="schnell-patient" data-hilfe="schnell.patient">/);
  assert.match(fuer, new RegExp(`<datalist id="schnell-patienten">.*<option value="${hanna.patientennummer}">Hanna Müller</option>`));
  assert.match(fuer, /<b>Hanna Müller<\/b> <a href="\/\?schnell=20#t-sc" data-hilfe="schnell.ohne-patient">ohne Patient<\/a>/);
  assert.match(fuer, /Direkt buchen für Hanna Müller/);
  assert.match(fuer, new RegExp(`href="/patienten/${hanna.id}/neu/termin\\?datum=${MONTAG}&amp;zeit=08:45&amp;dauer_min=20"`));
  assert.match(fuer, /readonly data-hilfe="schnell.vorlage">Guten Tag Frau Müller,/);
  assert.match(fuer, /&amp;e=[A-Za-z0-9]{12}/, 'Links mit Einladungskennung');
  // Mail- und WhatsApp-Knopf (W117c): Hanna hat eine Mailadresse, aber keine WhatsApp-Nummer; Zeilen im mailto-Text als CRLF (W117d)
  assert.match(fuer, new RegExp(`<a class="knopf" href="mailto:hanna@example\\.org\\?subject=Terminvorschl%C3%A4ge%20\\(20%20Minuten\\)[^"]*&amp;body=Guten%20Tag%20Frau%20M%C3%BCller%2C%0D%0A%0D%0A[^"]*" data-anruf="${hanna.id}" data-kontakt="\\d+" data-hilfe="schnell.mail">`), 'Mail mit Adresse, Betreff und Vorlage');
  assert.ok(!/body=[^"]*[^D]%0A/.test(fuer), 'kein nacktes LF im mailto-Text');
  assert.match(fuer, /<span class="knopf aus" aria-disabled="true" data-hilfe="schnell.whatsapp" title="Keine WhatsApp-Nummer hinterlegt">/);
  assert.match(mit, /<span class="knopf aus" aria-disabled="true" data-hilfe="schnell.mail" title="Erst einen Patienten wählen">/, 'ohne Patient beide aus');
  assert.match(mit, /<span class="knopf aus" aria-disabled="true" data-hilfe="schnell.whatsapp" title="Erst einen Patienten wählen">/);
  const niemand = await seite('/?schnell=20&patient=Niemand');
  assert.match(niemand, /Niemand passt eindeutig/);
  assert.match(niemand, /<a class="kreis aktiv" href="\/\?schnell=20#t-sc"/);
  assert.match(await seite(`/patienten/${hanna.id}`), new RegExp(`<a href="/\\?schnell=30&patient=${hanna.id}#t-sc" data-hilfe="plus.schnell">`), '„+“ auf der Patientenseite führt zum Schnelltermin');
});

test('Buchungsseite: Skript wertet dauer und zeit aus dem Link aus', () => {
  const html = buchungsSeite({ praxis: 'Praxis Test', datenschutzUrl: 'https://example.org/datenschutz' });
  assert.match(html, /params\.get\('dauer'\)/);
  assert.match(html, /params\.get\('zeit'\)/);
  assert.match(html, /Die vorgeschlagene Zeit ist leider schon vergeben/);
  assert.match(html, /params\.get\('e'\)/, 'Einladungskennung (W117b)');
  assert.match(html, /api\/einladung\//);
  assert.match(html, /einladung: einladung/);
  // W117d: die Zeit aus dem Link gilt auch, wenn keine Behandlung die Dauer hat – sobald der Patient eine wählt
  assert.match(html, /function zeitVorwaehlen\(\)/);
  assert.match(html, /zeichneZeiten\(\);\n    zeitVorwaehlen\(\);\n  }/, 'nach jeder Wahl der Behandlung');
  assert.match(html, /Tag und Uhrzeit aus Ihrem Link sind dann vorgewählt/);
});

test('Dauern aus den aktiven Terminarten (W117d): Kreise, nächste Dauer, Feld „Für Patient“', async () => {
  await db.query("UPDATE terminart SET aktiv = true WHERE code IN ('P4', 'P8', 'W1')");
  try {
    assert.deepEqual(await schnellDauern(db), [30, 45, 90], 'je Dauer ein Kreis, ohne Doppel, aufsteigend');
    const s = await schnelltermin(db, undefined, { dauer: 40, buchungUrl: 'https://buchung.example.org' });
    assert.equal(s.dauer, 45, '40 gibt es nicht → 45; der Link trifft so immer eine Behandlung');
    assert.deepEqual(s.dauern, [30, 45, 90]);
    assert.match(s.zeiten[0]!.link!, /\?dauer=45&zeit=/);
    const html = await seite('/?schnell=40');
    assert.match(html, /<div class="schnell-kreise"><a class="kreis" href="\/\?schnell=30#t-sc"[^>]*>30<\/a><a class="kreis aktiv" href="\/\?schnell=45#t-sc"[^>]*>45<\/a><a class="kreis" href="\/\?schnell=90#t-sc"[^>]*>90<\/a>/, 'drei Kreise, 45 gefüllt');
    assert.ok(!html.includes('schnell=20#'), 'kein Kreis ohne Terminart');
    assert.match(html, /<input type="hidden" name="schnell" value="45">/);
    const ohne = await seite('/');
    assert.match(ohne, /<a class="kreis" href="\/\?schnell=30#t-sc"[^>]*>30<\/a><a class="kreis" href="\/\?schnell=45#t-sc"/, 'auch ohne Tipp die Dauern der Terminarten');
    assert.match(ohne, /<input type="hidden" name="schnell" value="30">/, 'Vorgabe 30, wenn es sie gibt');
  } finally {
    await db.query("UPDATE terminart SET aktiv = false WHERE code IN ('P4', 'P8', 'W1')");
  }
});
