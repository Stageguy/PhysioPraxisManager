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
import { buchungsLink, dreiZeiten, schnelltermin, vorlageText } from '../src/kartei/schnelltermin.ts';
import { praxisDienst } from '../src/server.ts';
import { neuerHauptschluessel, tresor } from '../src/tresor.ts';
import { datumBerlin, heuteBerlin, tagPlus, zeitBerlin } from '../src/zeit.ts';
import { testDb } from './testdb.ts';

test('dreiZeiten: möglichst drei verschiedene Tage, sonst zweite Zeiten; Link und Vorlage', () => {
  const t = (d: string, z: string[]) => ({ datum: d, zeiten: z.map((x) => `${d}T${x}:00:00Z`) });
  assert.deepEqual(dreiZeiten([t('2026-11-09', ['07', '08', '09']), t('2026-11-10', ['07']), t('2026-11-11', ['07', '08'])]), ['2026-11-09T07:00:00Z', '2026-11-10T07:00:00Z', '2026-11-11T07:00:00Z']);
  assert.deepEqual(dreiZeiten([t('2026-11-09', ['07', '08', '09']), t('2026-11-10', ['07'])]), ['2026-11-09T07:00:00Z', '2026-11-09T08:00:00Z', '2026-11-10T07:00:00Z'], 'zwei Tage → die zweite Zeit des ersten Tages dazu');
  assert.deepEqual(dreiZeiten([t('2026-11-09', ['07'])]), ['2026-11-09T07:00:00Z'], 'mehr gibt es nicht');
  assert.equal(buchungsLink('https://buchung.example.org/', 30, '2026-11-09T07:00:00Z'), 'https://buchung.example.org/?dauer=30&zeit=2026-11-09T07%3A00%3A00Z');
  const v = vorlageText(30, [{ beginn: '2026-11-09T07:00:00Z', ende: '2026-11-09T07:30:00Z', text: 'Mo., 09.11., 08:00 Uhr', link: 'https://b/?dauer=30&zeit=x', direkt: '/kalender/termin' }], 'Praxis Test');
  assert.match(v, /^Guten Tag,\n\nfür einen Termin \(30 Minuten\) kann ich Ihnen anbieten:\n1\. Mo\., 09\.11\., 08:00 Uhr\n   https:\/\/b\/\?dauer=30&zeit=x\n\nBitte tippen Sie auf den Link/);
  assert.match(v, /Viele Grüße\nPraxis Test$/);
  assert.match(vorlageText(20, [{ beginn: 'x', ende: 'y', text: 'Mo., 09.11., 08:00 Uhr', link: null, direkt: '/k' }], 'P'), /Bitte antworten Sie kurz mit dem passenden Termin/, 'ohne Buchungsseite ohne Links');
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
  assert.equal(s.zeiten[0]!.link, `https://buchung.example.org/?dauer=30&zeit=${encodeURIComponent(s.zeiten[0]!.beginn)}`);
  assert.equal(s.zeiten[0]!.direkt, `/kalender/termin?datum=${MONTAG}&zeit=08:45&dauer_min=30`);
  assert.match(s.vorlage, /1\. .*08:45 Uhr\n   https:\/\/buchung\.example\.org\/\?dauer=30/);
  assert.ok(s.buchung);
  const lang = await schnelltermin(db, undefined, { dauer: 60 });
  assert.deepEqual(lang.zeiten.map((z) => zeitBerlin(z.beginn)), ['08:45', '08:00', '08:00'], '60 Minuten passen Montag ab 08:45 bis 09:45 noch');
  assert.equal(lang.zeiten[0]!.link, null);
  assert.equal((await schnelltermin(db, undefined, { dauer: 999 })).dauer, 30, 'unbekannte Dauer → 30');
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
  assert.ok(!(await seite('/?schnell=25')).includes('schnell-text'), 'nur 20, 30, 40, 60');
});

test('Buchungsseite: Skript wertet dauer und zeit aus dem Link aus', () => {
  const html = buchungsSeite({ praxis: 'Praxis Test', datenschutzUrl: 'https://example.org/datenschutz' });
  assert.match(html, /params\.get\('dauer'\)/);
  assert.match(html, /params\.get\('zeit'\)/);
  assert.match(html, /Die vorgeschlagene Zeit ist leider schon vergeben/);
});
