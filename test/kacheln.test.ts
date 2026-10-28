/** Kachel-Regeln (W114): „+“-Kachel zuerst, Stift bei bearbeitbaren Kacheln, „+“-Menü bei mehreren Aktionen, Seitenfenster auf jeder Seite */
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

test('Bausteine: „+“-Kachel als Seitenfenster-Link oder Popup, Stift, „+“-Menü, Popup-Links; Skript gültig', () => {
  assert.equal(
    plusKachel({ text: 'Neuer Patient', hilfe: 'patienten.neu', href: '/patienten/neu' }),
    '<a class="plus-kachel" href="/patienten/neu" data-fenster="Neuer Patient" data-hilfe="patienten.neu"><span class="plus-zeichen" aria-hidden="true">+</span><span class="plus-text">Neuer Patient</span></a>',
  );
  const p = plusKachel({ text: 'Neu', titel: 'Adresse', hilfe: 'adresse.neu', inhalt: '<form>x</form>', klasse: 'sek-rezept' });
  assert.match(p, /^<details class="plus-kachel sek-rezept"><summary data-hilfe="adresse.neu"><span class="plus-zeichen"/);
  assert.match(p, /<div class="plus-popup" role="dialog" aria-label="Adresse"><header><b>Adresse<\/b><button type="button" class="knopf klein plus-schliessen" data-hilfe="kachel.popup-schliessen">[\s\S]*<form>x<\/form><\/div><\/details>$/);
  assert.ok(stift('#tb-1', 'konfiguration.textbaustein.bearbeiten', { oeffnet: 'tb-1', text: 'Bearbeiten' }).startsWith('<a class="kachel-stift" href="#tb-1" data-oeffnet="tb-1" data-hilfe="konfiguration.textbaustein.bearbeiten" aria-label="Bearbeiten" title="Bearbeiten">'));
  assert.match(plusMenue('<a href="/x">x</a>', 'rezept.plus', { klein: true, label: 'Aktionen' }), /^<details class="plus klein" data-hilfe="rezept.plus"><summary aria-label="Aktionen">\+<\/summary><div class="plus-menue"><a href="\/x">x<\/a><\/div><\/details>$/);
  assert.match(popupLinks([{ href: '/a', text: 'A', hilfe: 'h', fenster: 'A' }]), /<a href="\/a" data-fenster="A" data-hilfe="h"> A<\/a>/);
  assert.doesNotThrow(() => new Function(PRAXIS_SKRIPT));
  assert.match(PRAXIS_SKRIPT, /a\[data-pdf\],a\[data-fenster\]/);
  assert.match(PRAXIS_SKRIPT, /plus-kachel\[open\]/);
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

test('Patientenliste: „+“-Kachel zuerst, kein Neu-Knopf mehr, Stift an der Patientenkachel, Archiv ohne „+“, Seitenfenster einmal', async () => {
  const html = await seite('/patienten');
  assert.match(html, /<div class="pat-raster"><a class="plus-kachel" href="\/patienten\/neu" data-fenster="Neuer Patient" data-hilfe="patienten.neu">/);
  assert.doesNotMatch(html, /class="knopf primaer" href="\/patienten\/neu"/);
  assert.match(html, new RegExp(`<a class="kachel-stift" href="/patienten/${pid}#stammdaten" data-hilfe="kachel.stift"`));
  assert.equal((html.match(/id="pdf-fenster"/g) ?? []).length, 1, 'Seitenfenster liegt genau einmal im Rahmen');
  assert.doesNotMatch(await seite('/patienten/archiv'), /<a class="plus-kachel"|<details class="plus-kachel"/);
});

test('Patientenseite: „+“-Kacheln vorn in Rezepten, Terminen, Rechnungen, Adressen; „+“-Menü an Termin und Rezept; Stift am Kopf', async () => {
  const html = await seite(`/patienten/${pid}`);
  assert.match(html, /<div class="rz-raster"><details class="plus-kachel"><summary data-hilfe="plus.rezept-serie">/);
  assert.match(html, new RegExp(`<a href="/patienten/${pid}/neu/rezept" data-fenster="Neues Rezept" data-hilfe="plus.rezept">[\\s\\S]*?<a href="/patienten/${pid}/neu/direktzugang" data-fenster="Behandlung ohne Rezept" data-hilfe="plus.direktzugang">[\\s\\S]*?<a href="/patienten/${pid}/neu/wellness" data-fenster="Wellness-Serie" data-hilfe="plus.wellness">`));
  assert.match(html, new RegExp(`<div class="tk-raster"><a class="plus-kachel" href="/patienten/${pid}/neu/termin" data-fenster="Neuer Termin" data-hilfe="plus.termin">`));
  assert.match(html, /<article class="tk mit-plus" data-hilfe="termine.kachel">[\s\S]*?<details class="plus klein" data-hilfe="termin.plus"><summary aria-label="Aktionen zum Termin">\+<\/summary><div class="plus-menue"><a class="marke wa"[\s\S]*?data-hilfe="termin.whatsapp"[\s\S]*?<select name="status" data-hilfe="termin.status"/);
  assert.match(html, /<div class="adr-raster"><details class="plus-kachel"><summary data-hilfe="adresse.neu">[\s\S]*?name="strasse"/);
  assert.match(html, /<div class="rk-pat-raster"><details class="plus-kachel"><summary data-hilfe="rechnung.neu">[\s\S]*?data-hilfe="rechnung.neu.heil"[\s\S]*?data-hilfe="rechnung.neu.wellness"/);
  assert.equal((html.match(/data-hilfe="rechnung.neu.heil"/g) ?? []).length, 1, 'die Knöpfe gibt es nur noch im Popup');
  assert.match(html, /<article class="rz aktiv mit-plus"[^>]*>[\s\S]*?<details class="plus klein" data-hilfe="rezept.plus">[\s\S]*?Termine planen \(6 offen\)[\s\S]*?data-hilfe="rezept.folge"[\s\S]*?data-hilfe="rezept.zweitschrift"[\s\S]*?data-hilfe="rezept.abbrechen"/);
  assert.doesNotMatch(html, /data-hilfe="rezept\.mehr"|class="rz-mehr"|<a class="knopf klein" href="[^"]*\/termine"|<a class="knopf klein" href="[^"]*\/neu\/termin"|<details class="adr neu"/);
  assert.match(html, /<a class="kachel-stift" href="#stammdaten" data-oeffnet="stammdaten" data-hilfe="patient.stammdaten"/);
  assert.equal((html.match(/id="pdf-fenster"/g) ?? []).length, 1);
  assert.equal(((await seite(`/patienten/${pid}/akte`)).match(/id="pdf-fenster"/g) ?? []).length, 1, 'Akte: Seitenfenster aus dem Rahmen, nicht doppelt');
});

test('Terminarten und Konfiguration: „+“-Kachel vorn, Stift klappt das Formular in der Kachel auf', async () => {
  const ta = await seite('/konfiguration/terminarten');
  assert.match(ta, /<div class="ta-raster"><details class="plus-kachel sek-\w+"><summary data-hilfe="terminart.neu">[\s\S]*?name="kurz"/);
  assert.match(ta, /<a class="kachel-stift" href="#ta-(\d+)-bearbeiten" data-oeffnet="ta-\1-bearbeiten" data-hilfe="terminart.bearbeiten"[\s\S]*?<details id="ta-\1-bearbeiten"><summary class="hint nur-ohne-js"/);
  assert.doesNotMatch(ta, /ta-kachel neu/);
  const k = await seite('/konfiguration');
  assert.match(k, /<div class="tbk-raster"><details class="plus-kachel"><summary data-hilfe="konfiguration.textbaustein.neu">/);
  assert.doesNotMatch(k, /class="tbk neu"/);
  if (/<article class="tbk/.test(k)) assert.match(k, /<a class="kachel-stift" href="#tb-(\d+)" data-oeffnet="tb-\1" data-hilfe="konfiguration.textbaustein.bearbeiten"[\s\S]*?<details id="tb-\1">/);
});

test('Anfragen, Pinnwand, Preislisten: „+“-Kachel vorn, alte Knöpfe und Klappformulare weg, Stift an der Preisliste', () => {
  const an = anfragenSeite({ anfragen: [], filter: 'alle', stand: { neu: 0, vorgeschlagen: 0 }, terminarten: [] }, R);
  assert.match(an, /<div class="an-raster"><details class="plus-kachel"><summary data-hilfe="anfragen.neu">[\s\S]*?name="quelle"/);
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
