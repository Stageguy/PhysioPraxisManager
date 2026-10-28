/** Kachel-Regeln (W114/W115): „+“-Kachel zuerst, Stift bei bearbeitbaren Kacheln, „+“-Menü bei mehreren Aktionen, Seitenfenster auf jeder Seite, ein Formular für Anlegen und Bearbeiten */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import type { Db } from '../src/db/index.ts';
import { karteiDienst } from '../src/kartei/dienst.ts';
import { verordnungAnlegen } from '../src/kartei/patienten.ts';
import type { Preisliste, QuelleKurz } from '../src/preise/preislisten.ts';
import { praxisDienst } from '../src/server.ts';
import { neuerHauptschluessel, tresor } from '../src/tresor.ts';
import { anfragenSeite } from '../src/web/anfragen.ts';
import { plusKachel, plusMenue, popupLinks, stift } from '../src/web/bausteine.ts';
import { pinnwandSeite } from '../src/web/pinnwand.ts';
import { uebersichtSeite } from '../src/web/preislisten.ts';
import { PRAXIS_SKRIPT } from '../src/web/rechnungen.ts';
import { heuteBerlin, tagPlus } from '../src/zeit.ts';
import { testDb } from './testdb.ts';

const R = { wer: 'lilli@example.org', fassung: '0.0.0' };
const PLUS = '<svg [^>]*><path d="M12 5v14M5 12h14"\\/><\\/svg>';

test('Bausteine: „+“-Kachel als Seitenfenster-Link oder Popup, Plus als Strichzeichnung mittig, Stift, „+“-Menü, Popup-Links; Skript gültig', () => {
  assert.match(
    plusKachel({ text: 'Neuer Patient', hilfe: 'patienten.neu', href: '/patienten/neu' }),
    new RegExp(`^<a class="plus-kachel" href="/patienten/neu" data-fenster="Neuer Patient" data-hilfe="patienten.neu"><span class="plus-zeichen" aria-hidden="true">${PLUS}</span><span class="plus-text">Neuer Patient</span></a>$`),
  );
  const p = plusKachel({ text: 'Neu', titel: 'Auswahl', hilfe: 'plus.rezept-serie', inhalt: '<p>x</p>', klasse: 'sek-rezept' });
  assert.match(p, /^<details class="plus-kachel sek-rezept"><summary data-hilfe="plus.rezept-serie"><span class="plus-zeichen"/);
  assert.match(p, /<div class="plus-popup" role="dialog" aria-label="Auswahl"><header><b>Auswahl<\/b><button type="button" class="knopf klein plus-schliessen" data-hilfe="kachel.popup-schliessen">[\s\S]*<p>x<\/p><\/div><\/details>$/);
  assert.ok(stift('/preislisten/5', 'kachel.stift', { fenster: 'Preisliste', text: 'Bearbeiten' }).startsWith('<a class="kachel-stift" href="/preislisten/5" data-fenster="Preisliste" data-hilfe="kachel.stift" aria-label="Bearbeiten" title="Bearbeiten">'));
  assert.match(plusMenue('<a href="/x">x</a>', 'rezept.plus', { klein: true, label: 'Aktionen' }), new RegExp(`^<details class="plus klein" data-hilfe="rezept.plus"><summary aria-label="Aktionen">${PLUS}</summary><div class="plus-menue"><a href="/x">x</a></div></details>$`));
  assert.match(popupLinks([{ href: '/a', text: 'A', hilfe: 'h', fenster: 'A' }]), /<a href="\/a" data-fenster="A" data-hilfe="h"> A<\/a>/);
  assert.doesNotThrow(() => new Function(PRAXIS_SKRIPT));
  assert.match(PRAXIS_SKRIPT, /a\[data-pdf\],a\[data-fenster\]/);
  assert.match(PRAXIS_SKRIPT, /fenster-schliessen/);
});

let basis = '';
let db: Db;
let server: ReturnType<typeof praxisDienst>;
let pid = '';
const t = tresor({ PRAXIS_TRESOR_SCHLUESSEL: neuerHauptschluessel() });
const wer = { 'Tailscale-User-Login': 'lilli@example.org' };
const post = (felder: Record<string, string>) => fetch(`${basis}/patienten/aktion`, { method: 'POST', redirect: 'manual', headers: { ...wer, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(felder).toString() });
const ziel = (r: Response) => decodeURIComponent(r.headers.get('location') ?? '');
const seite = async (pfad: string) => (await fetch(`${basis}${pfad}`, { headers: wer })).text();

before(async () => {
  db = await testDb();
  server = praxisDienst({ erlaubt: ['lilli@example.org'], fassung: 't', angemeldet: async () => true, pruefen: async () => [], kartei: karteiDienst({ db, tresor: t }) });
  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  pid = /\/patienten\/(\d+)/.exec(ziel(await post({ aktion: 'anlegen', vorname: 'Kim', nachname: 'Kachel', mobil: '0151 2345678', whatsapp_wie_mobil: '1', strasse: 'Weg', hausnummer: '1', plz: '86825', ort: 'Bad Wörishofen' })))![1]!;
  await post({ aktion: 'termin_anlegen', id: pid, datum: tagPlus(heuteBerlin(), 1), zeit: '09:00', dauer_min: '30' });
  await verordnungAnlegen(db, t, pid, { ausgestelltAm: '2026-10-01', massnahme: 'Krankengymnastik', leistungNummer: '20501', anzahl: 6 }, 'x');
});
after(() => server.close());

test('Patientenliste: „+“-Kachel zuerst, kein Neu-Knopf mehr, Stift öffnet die Stammdaten im Seitenfenster, Archiv ohne „+“, Seitenfenster einmal', async () => {
  const html = await seite('/patienten');
  assert.match(html, /<div class="pat-raster"><a class="plus-kachel" href="\/patienten\/neu" data-fenster="Neuer Patient" data-hilfe="patienten.neu">/);
  assert.doesNotMatch(html, /class="knopf primaer" href="\/patienten\/neu"/);
  assert.match(html, new RegExp(`<a class="kachel-stift" href="/patienten/${pid}/bearbeiten" data-fenster="Stammdaten bearbeiten" data-hilfe="kachel.stift"`));
  assert.equal((html.match(/id="pdf-fenster"/g) ?? []).length, 1, 'Seitenfenster liegt genau einmal im Rahmen');
  assert.doesNotMatch(await seite('/patienten/archiv'), /<a class="plus-kachel"|<details class="plus-kachel"/);
});

test('Patientenseite: „+“-Kacheln vorn; „+“-Menü an Termin und Rezept; Stifte an Kopf, Termin und Adresse führen zu den Formularseiten; kein Klappformular mehr', async () => {
  const html = await seite(`/patienten/${pid}`);
  assert.match(html, /<div class="rz-raster"><details class="plus-kachel"><summary data-hilfe="plus.rezept-serie">/);
  assert.match(html, new RegExp(`<a href="/patienten/${pid}/neu/rezept" data-fenster="Neues Rezept" data-hilfe="plus.rezept">[\\s\\S]*?<a href="/patienten/${pid}/neu/direktzugang" data-fenster="Behandlung ohne Rezept" data-hilfe="plus.direktzugang">[\\s\\S]*?<a href="/patienten/${pid}/neu/wellness" data-fenster="Wellness-Serie" data-hilfe="plus.wellness">`));
  assert.match(html, new RegExp(`<div class="tk-raster"><a class="plus-kachel" href="/patienten/${pid}/neu/termin" data-fenster="Neuer Termin" data-hilfe="plus.termin">`));
  assert.match(html, /<article class="tk mit-plus" data-hilfe="termine.kachel">[\s\S]*?<details class="plus klein" data-hilfe="termin.plus"><summary aria-label="Aktionen zum Termin">[\s\S]*?<\/summary><div class="plus-menue"><a class="marke wa"[\s\S]*?data-hilfe="termin.whatsapp"[\s\S]*?<select name="status" data-hilfe="termin.status"/);
  assert.match(html, new RegExp(`<a class="kachel-stift" href="/patienten/${pid}/termine/\\d+/bearbeiten" data-fenster="Termin bearbeiten" data-hilfe="termin.bearbeiten"`));
  assert.match(html, new RegExp(`<div class="adr-raster"><a class="plus-kachel" href="/patienten/${pid}/adressen/neu" data-fenster="Neue Adresse" data-hilfe="adresse.neu">`));
  assert.match(html, new RegExp(`<a class="kachel-stift" href="/patienten/${pid}/adressen/\\d+" data-fenster="Adresse bearbeiten" data-hilfe="adresse.bearbeiten"`));
  assert.match(html, new RegExp(`<div class="rk-pat-raster"><a class="plus-kachel" href="/patienten/${pid}/neu/rechnung" data-fenster="Neue Rechnung" data-hilfe="rechnung.neu">`));
  assert.match(html, /<article class="rz aktiv mit-plus"[^>]*>[\s\S]*?<details class="plus klein" data-hilfe="rezept.plus">[\s\S]*?Termine planen \(6 offen\)[\s\S]*?data-hilfe="rezept.folge"[\s\S]*?data-hilfe="rezept.zweitschrift"[\s\S]*?data-hilfe="rezept.abbrechen"/);
  assert.doesNotMatch(html, /data-hilfe="rezept\.mehr"|class="rz-mehr"|<a class="knopf klein" href="[^"]*\/termine"|<a class="knopf klein" href="[^"]*\/neu\/termin"|<details class="adr neu"|id="stammdaten"|data-hilfe="rechnung.neu.heil"/);
  assert.match(html, new RegExp(`<a class="kachel-stift" href="/patienten/${pid}/bearbeiten" data-fenster="Stammdaten bearbeiten" data-hilfe="patient.stammdaten"`));
  assert.match(html, new RegExp(`<a class="knopf" href="/patienten/${pid}/bearbeiten" data-fenster="Stammdaten bearbeiten" data-hilfe="patient.stammdaten">`));
  assert.equal((html.match(/id="pdf-fenster"/g) ?? []).length, 1);
  assert.equal(((await seite(`/patienten/${pid}/akte`)).match(/id="pdf-fenster"/g) ?? []).length, 1, 'Akte: Seitenfenster aus dem Rahmen, nicht doppelt');
});

test('Terminarten und Konfiguration: „+“-Kachel und Stift führen zu den Formularseiten, kein Klappformular in der Kachel', async () => {
  const ta = await seite('/konfiguration/terminarten');
  assert.match(ta, /<div class="ta-raster"><a class="plus-kachel sek-\w+" href="\/konfiguration\/terminarten\/neu\?sektion=\w+" data-fenster="Neue Terminart" data-hilfe="terminart.neu">/);
  assert.match(ta, /<a class="kachel-stift" href="\/konfiguration\/terminarten\/\d+" data-fenster="Terminart bearbeiten" data-hilfe="terminart.bearbeiten"/);
  assert.doesNotMatch(ta, /ta-kachel neu|<details id="ta-/);
  const k = await seite('/konfiguration');
  assert.match(k, /<div class="tbk-raster"><a class="plus-kachel" href="\/konfiguration\/textbausteine\/neu" data-fenster="Neuer Textbaustein" data-hilfe="konfiguration.textbaustein.neu">/);
  assert.doesNotMatch(k, /class="tbk neu"|<details id="tb-/);
  if (/<article class="tbk/.test(k)) assert.match(k, /<a class="kachel-stift" href="\/konfiguration\/textbausteine\/\d+" data-fenster="Textbaustein bearbeiten" data-hilfe="konfiguration.textbaustein.bearbeiten"/);
});

test('Anfragen, Pinnwand, Preislisten: „+“-Kachel vorn, alte Knöpfe und Klappformulare weg, Stift an der Preisliste', () => {
  const an = anfragenSeite({ anfragen: [], filter: 'alle', stand: { neu: 0, vorgeschlagen: 0 }, terminarten: [] }, R);
  assert.match(an, /<div class="an-raster"><a class="plus-kachel" href="\/anfragen\/neu" data-fenster="Anfrage von Hand" data-hilfe="anfragen.neu">/);
  assert.doesNotMatch(an, /<details class="tafel mehr-form"/);
  const spalten = [{ phase: 'anfrage', name: 'Anfrage', text: 'x', karten: [] }, { phase: 'behandlung', name: 'Behandlung', text: 'x', karten: [] }] as unknown as Parameters<typeof pinnwandSeite>[0]['spalten'];
  const pw = pinnwandSeite({ spalten, ansicht: 'horizontal', archiv: false }, R);
  assert.match(pw, /<div class="pw-karten"><a class="plus-kachel" href="\/pinnwand\/neu" data-fenster="Neuer Fall" data-hilfe="pinnwand.neu">/);
  assert.equal((pw.match(/<a class="plus-kachel"/g) ?? []).length, 1, 'nur in der Spalte Anfrage');
  assert.doesNotMatch(pw, /\+ Fall/);
  const Q: QuelleKurz = { id: '1', art: 'gkv', titel: 'GKV', version: 'Lesefassung gültig ab 01.01.2026', gueltigAb: '2026-01-01', abgerufenAm: '2026-10-23T03:00:00Z', url: 'https://x' };
  const PL: Preisliste = {
    id: '5', name: 'Privat 2026', status: 'entwurf', aktiv: false, standard: false, patienten: 0, nachfolger: null, genutzt: false, erstelltAm: '2026-10-23T10:00:00Z', erstelltVon: 'lilli',
    freigegebenAm: null, freigegebenVon: null, archiviertAm: null, standardFaktor: 1.3, aufrunden: false, notiz: null, gkv: Q, beihilfe: { ...Q, id: '2', art: 'beihilfe', version: 'BBhV Anlage 9' },
    basis: null, vorlage: { id: '1', name: 'GebüTh 15. Auflage' }, positionen: 58, uebernommen: 50,
  };
  const pl = uebersichtSeite({ neu: [], listen: [PL], stand: { gkv: Q } }, R);
  assert.match(pl, /<div class="pk-raster"><a class="plus-kachel nur-desktop" href="\/preislisten\/neu" data-fenster="Neue Preisliste" data-hilfe="preislisten.neu">/);
  assert.match(pl, /<a class="kachel-stift" href="\/preislisten\/5" data-hilfe="kachel.stift"/);
  assert.doesNotMatch(pl, /class="knopf primaer" href="\/preislisten\/neu"/);
});
