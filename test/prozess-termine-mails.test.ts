/**
 * Prozesstests (Testerrolle, 31.10.2026): die ganze Kette rund um Termine und Mails – vom Cockpit am Rechner über die
 * Mail an den Patienten, seine Wahl am Handy auf der Buchungsseite, die Anfrage im PPM, Lillis Bestätigung am Handy
 * bis zum Kalender des Postfachs und dem Bestätigungs-Entwurf. Alles gegen PGlite und Attrappen (kein Microsoft, kein
 * Netz); der öffentliche Buchungsdienst läuft dabei echt im Prozess. Die Sichtprüfung der Übergaben Rechner ↔ Handy
 * macht der Prüfbrowser (pruefung/browser/auftrag-prozess-termine.json); der Testplan mit allen Fällen steht in
 * konzept/testplan-termine-mails.md.
 */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { anfrageAnlegen, anfragenListe, patientFinden } from '../src/anfragen/anfragen.ts';
import { anfragenDienst } from '../src/anfragen/dienst.ts';
import { buchungAbgleich } from '../src/buchung/abgleich.ts';
import { anfangszeiten, type Angebot } from '../src/buchung/angebot.ts';
import { buchungsClient } from '../src/buchung/client.ts';
import { buchungsdienst } from '../src/buchung/dienst.ts';
import { cockpitDaten } from '../src/cockpit/daten.ts';
import type { Db } from '../src/db/index.ts';
import { karteiDienst } from '../src/kartei/dienst.ts';
import { einstellungSetzen } from '../src/kartei/konfiguration.ts';
import { adresseSpeichern, patientAnlegen } from '../src/kartei/patienten.ts';
import { terminartAktiv, terminarten } from '../src/kartei/terminarten.ts';
import { praxisDienst } from '../src/server.ts';
import { neuerHauptschluessel, tresor } from '../src/tresor.ts';
import { datumBerlin, zeitBerlin } from '../src/zeit.ts';
import { graphAttrappe } from './attrappe.ts';
import { testDb } from './testdb.ts';

let db: Db;
let praxis = '';
let buchung = '';
let server: ReturnType<typeof praxisDienst>;
let dienst: ReturnType<typeof buchungsdienst>;
const t = tresor({ PRAXIS_TRESOR_SCHLUESSEL: neuerHauptschluessel() });
const lilli = { 'Tailscale-User-Login': 'lilli@example.org' };
const geloescht: string[] = [];
const roh = graphAttrappe({});
const graph = { ...roh, async delete(pfad: string) { geloescht.push(pfad); roh.aufrufe.push({ methode: 'DELETE', pfad }); } };
const client = () => buchungsClient({ url: buchung, schluessel: 'geheim' });
const seite = async (pfad: string) => (await fetch(`${praxis}${pfad}`, { headers: lilli })).text();
const post = (pfad: string, felder: Record<string, string>) => fetch(`${praxis}${pfad}`, { method: 'POST', redirect: 'manual', headers: { ...lilli, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(felder).toString() });
const ziel = (r: Response) => decodeURIComponent(r.headers.get('location') ?? '');
const schreibende = () => roh.aufrufe.filter((a) => a.methode !== 'GET');
interface Ereignis { subject: string; location: { displayName: string }; categories: string[]; isReminderOn: boolean; reminderMinutesBeforeStart?: number; body: { content: string } }
interface Entwurf { subject: string; toRecipients: { emailAddress: { address: string } }[]; body: { content: string }; categories: string[] }

/** Was der Mail-Knopf im Cockpit öffnet: Adresse, Betreff und der Text mit den drei Links */
function mailAusCockpit(html: string): { an: string; betreff: string; text: string; links: URL[] } {
  const href = /href="(mailto:[^"]+)"/.exec(html)![1]!.replace(/&amp;/g, '&');
  const [an, rest] = href.slice('mailto:'.length).split('?') as [string, string];
  const p = new URLSearchParams(rest);
  const text = p.get('body')!;
  return { an, betreff: p.get('subject')!, text, links: [...text.matchAll(/https?:\/\/\S+/g)].map((m) => new URL(m[0])) };
}

/** Was die Patientin am Handy tut: Link öffnen, Wunsch absenden */
async function patientinBucht(link: URL, terminart: string, angaben: { name: string; telefon: string; email: string }): Promise<string> {
  const html = await (await fetch(link.toString())).text();
  assert.match(html, /<title>Termin anfragen – Praxis Lilli Nebel<\/title>/, 'die Buchungsseite kommt');
  const zeit = new Date(link.searchParams.get('zeit')!).toISOString();
  const angebot = await (await fetch(`${buchung}/api/angebot`)).json() as Angebot;
  const tag = angebot.tage.find((x) => x.datum === datumBerlin(zeit))!;
  assert.ok(anfangszeiten(tag.fenster, Number(link.searchParams.get('dauer')), angebot.rasterMin).includes(zeit), 'die Zeit aus dem Link ist auf der Seite wählbar');
  const r = await fetch(`${buchung}/api/buchung`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ terminart, beginn: zeit, ...angaben, nachricht: '', einwilligung: true, website: '', dauerMs: 5000, einladung: link.searchParams.get('e') }) });
  assert.equal(r.status, 200, await r.text());
  return zeit;
}

before(async () => {
  db = await testDb();
  process.env.PRAXIS_URL = 'http://praxis.test:10001';
  await einstellungSetzen(db, 'oeffnungszeiten', 'Mo 08:00-12:00; Di 08:00-12:00; Mi 08:00-12:00; Do 08:00-12:00; Fr 08:00-12:00', 'x');
  await einstellungSetzen(db, 'termin_puffer_min', '10', 'x');
  await einstellungSetzen(db, 'buchung_vorlauf_stunden', '0', 'x');
  await einstellungSetzen(db, 'buchung_tage', '14', 'x');
  await einstellungSetzen(db, 'fahrtzeit_orte', 'Türkheim = 15', 'x');
  await einstellungSetzen(db, 'praxis_adresse', 'Schulstraße 17, 86825 Bad Wörishofen', 'x');
  await terminartAktiv(db, (await terminarten(db)).find((x) => x.code === 'P4')!.id, true, 'x');
  dienst = buchungsdienst({ schluessel: 'geheim', praxis: 'Praxis Lilli Nebel', datenschutzUrl: 'https://example.org/datenschutz', mindestDauerMs: 1000 });
  await new Promise<void>((f) => dienst.listen(0, '127.0.0.1', f));
  buchung = `http://127.0.0.1:${(dienst.address() as AddressInfo).port}`;
  const anfragen = anfragenDienst({ db, tresor: t, graph });
  const kartei = karteiDienst({ db, tresor: t, graph, buchung: { url: buchung, oeffentlich: true }, buchungClient: client() });
  server = praxisDienst({ erlaubt: ['lilli@example.org'], fassung: 't', angemeldet: async () => true, pruefen: async () => [], kartei, anfragen, cockpit: ({ namenZeigen }) => cockpitDaten({ db, graph, namenZeigen, anfragen: anfragen.stand }) });
  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  praxis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // Der Takt hat das Angebot schon zum Buchungsdienst geschoben, bevor der erste Link verschickt wird
  await buchungAbgleich(db, t, graph, client());
});
after(() => {
  server.close();
  dienst.close();
  delete process.env.PRAXIS_URL;
});

let hanna = '';

test('P1 Rechner: Schnelltermin → Mail-Knopf · Handy: Patientin wählt über den Link · PPM: Anfrage mit Patientin und Reservierung · Handy: Lilli bestätigt · Kalender und Bestätigungs-Entwurf', async () => {
  hanna = await patientAnlegen(db, t, { anrede: 'Frau', vorname: 'Hanna', nachname: 'Prozess', kontakte: [{ art: 'email', wert: 'shopping@2late.de' }, { art: 'mobil', wert: '0151 3333333' }] }, 'x');
  // 1 Rechner – Cockpit, Schnelltermin 30 Minuten für Hanna: der Mail-Knopf trägt Adresse, Betreff und drei Links mit Einladungskennung
  const cockpit = await seite(`/?schnell=30&patient=${hanna}`);
  const mail = mailAusCockpit(cockpit);
  assert.equal(mail.an, 'shopping@2late.de');
  assert.equal(mail.betreff, 'Terminvorschläge (30 Minuten) – Praxis Lilli Nebel');
  assert.match(mail.text, /^Guten Tag Frau Prozess,\r\n\r\nfür einen Termin \(30 Minuten\)/, 'Anrede, CRLF-Zeilen (W117d)');
  assert.equal(mail.links.length, 3);
  const link = mail.links[0]!;
  assert.equal(link.origin, buchung, 'Links zeigen auf die öffentliche Buchungsseite');
  const kennung = link.searchParams.get('e')!;
  assert.match(kennung, /^[A-Za-z0-9]{12}$/, 'Kennung statt Name im Link');
  assert.equal(link.searchParams.get('dauer'), '30');
  assert.ok(!mail.text.includes('Prozess,') || !link.toString().includes('Prozess'), 'der Name steht im Text, nie im Link');
  // 2 Buchungsdienst: die Einladung gibt es nur mit der Kennung
  const e = await (await fetch(`${buchung}/api/einladung/${kennung}`)).json() as { name: string; telefon: string; email: string };
  assert.deepEqual(e, { name: 'Hanna Prozess', telefon: '0151 3333333', email: 'shopping@2late.de' });
  assert.equal((await fetch(`${buchung}/api/einladung/falschfalsch`)).status, 404);
  // 3 Handy der Patientin: Link öffnen, Wunsch absenden – mit den vorbelegten Angaben und der Kennung
  const zeit = await patientinBucht(link, 'P4', e);
  // 4 PPM-Takt: die Buchung wird eine Anfrage für Hanna (über die Kennung), die Wunschzeit ist im Praxiskalender reserviert und für andere weg
  const b = await buchungAbgleich(db, t, graph, client());
  assert.deepEqual([b.neu, b.fehler], [1, 0]);
  const a = (await anfragenListe(db, t, { filter: 'offen' })).find((x) => x.quelle === 'buchung')!;
  assert.equal(a.patient?.id, hanna, 'über die Einladungskennung zugeordnet – keine Dublette');
  assert.equal(a.vorschlaege[0]!.beginn, zeit);
  assert.ok(a.vorschlaege[0]!.exchangeEventId, 'im Praxiskalender reserviert');
  const danach = await (await fetch(`${buchung}/api/angebot`)).json() as Angebot;
  assert.ok(!anfangszeiten(danach.tage.find((x) => x.datum === datumBerlin(zeit))?.fenster ?? [], 30, danach.rasterMin).includes(zeit), 'die Zeit ist für andere Patienten weg');
  // 5 Handy von Lilli: Anfragenliste und Anfrageseite – ein Tipp bestätigt
  assert.match(await seite('/anfragen'), new RegExp(`href="/anfragen/${a.id}"`));
  const detail = await seite(`/anfragen/${a.id}`);
  assert.match(detail, /Gebucht über die Website: P4 – Krankengymnastik \(KG\)/);
  assert.match(detail, /data-hilfe="anfrage.bestaetigen"/);
  assert.ok(!detail.includes('data-hilfe="anfrage.hausbesuch"'), 'Praxis-Patientin: kein Hausbesuch-Hinweis');
  const vorher = schreibende().length;
  const r = await post('/anfragen/aktion', { aktion: 'bestaetigen', id: a.id, wahl: '0' });
  assert.match(ziel(r), new RegExp(`^/patienten/${hanna}\\?meldung=Termin am .* angelegt\\. Termin steht im Kalender\\. Die Bestätigung liegt als Entwurf im Postfach\\.#termine$`));
  // 6 Ergebnis: Termin in Kartei und Kalender, Reservierung weg, Bestätigung als Entwurf an die Patientin – nie gesendet (Leitplanke 3)
  const termin = (await db.query<{ beginn: Date; e: string | null; ort: string }>('SELECT t.beginn, t.exchange_event_id AS e, t.behandlungsort AS ort FROM terminanfrage a JOIN termin t ON t.id = a.termin_id WHERE a.id = $1', [a.id])).rows[0]!;
  assert.equal(new Date(termin.beginn).toISOString(), zeit);
  assert.ok(termin.e, 'im Kalender des Postfachs');
  assert.equal(termin.ort, 'praxis');
  assert.ok(geloescht.includes(`/me/events/${a.vorschlaege[0]!.exchangeEventId}`), 'Reservierung gelöscht – der echte Termin steht eigens im Kalender');
  const neu = schreibende().slice(vorher);
  const entwurf = neu.find((x) => x.pfad === '/me/messages')!.body as Entwurf;
  assert.match(entwurf.subject, /^Ihr Termin am /);
  assert.equal(entwurf.toRecipients[0]!.emailAddress.address, 'shopping@2late.de');
  assert.match(entwurf.body.content, /^Sehr geehrte Frau Prozess,/);
  assert.deepEqual(entwurf.categories, ['PPM'], 'zählt im Cockpit unter „Entwürfe“ (W123)');
  assert.ok(!neu.some((x) => x.pfad === '/me/sendMail'), 'nichts automatisch gesendet');
  // 7 Patientenseite (Rechner wie Handy): der Termin steht mit Kalender-Marke, keine offene Anfrage mehr
  assert.match(await seite(`/patienten/${hanna}`), /data-hilfe="termin.kalender"/);
  assert.equal((await anfragenListe(db, t, { filter: 'offen' })).length, 0);
});

test('P2 Hausbesuch-Patientin: Schnelltermin rechnet die Fahrt ein, WhatsApp-Knopf, Buchung → Bestätigung legt einen Hausbesuch an (drei Kalendereinträge, Erinnerung zur Anfahrt, Links PPM → Google Maps → Apple Karten); Absage räumt auf und wählt die Nachricht vor', async () => {
  const hilde = await patientAnlegen(db, t, { anrede: 'Frau', vorname: 'Hilde', nachname: 'Heimweg', kontakte: [{ art: 'email', wert: 'shopping+hilde@2late.de' }, { art: 'whatsapp', wert: '0151 4444444' }] }, 'x');
  await adresseSpeichern(db, hilde, { bezeichnung: 'Pflegeheim', strasse: 'Bahnhofstraße', hausnummer: '3', plz: '86842', ort: 'Türkheim', typ: 'hausbesuch' }, 'x');
  // Rechner: Cockpit sagt, dass die Fahrt eingerechnet ist; Seitenfenster mit Namen; WhatsApp-Knopf mit Nummer und Text
  const cockpit = await seite(`/?schnell=30&patient=${hilde}`);
  assert.match(cockpit, /data-hilfe="schnell.hausbesuch">.*Hausbesuch in Türkheim: 15 Min\. Fahrt davor und danach sind in den Zeiten eingerechnet/);
  assert.match(cockpit, /data-fenster="Neuer Termin – Hilde Heimweg"/, 'Rechner: Seitenfenster mit dem Namen im Titel (W128)');
  assert.match(cockpit, /href="https:\/\/wa\.me\/491514444444\?text=Guten%20Tag%20Frau%20Heimweg%2C[^"]*" target="_blank" rel="noopener" data-anruf="\d+" data-kontakt="\d+" data-hilfe="schnell.whatsapp"/, 'WhatsApp-Knopf: Nummer und Vorlage, Vermerk im Verlauf');
  const mail = mailAusCockpit(cockpit);
  const link = mail.links[0]!;
  const zeit = new Date(link.searchParams.get('zeit')!).toISOString();
  assert.ok(zeitBerlin(zeit) >= '08:15', `frühestens 15 Min. nach Öffnung – Anfahrt: ${zeitBerlin(zeit)}`);
  assert.match(/href="(\/patienten\/\d+\/neu\/termin[^"]+)"/.exec(cockpit)![1]!, /&amp;ort=adresse:\d+$/, '„Direkt buchen“ bringt den Hausbesuch mit');
  // Handy: Patientin bucht; PPM holt ab; die Anfrageseite nennt den Hausbesuch (W131)
  await patientinBucht(link, 'P4', { name: 'Hilde Heimweg', telefon: '0151 4444444', email: 'shopping+hilde@2late.de' });
  assert.equal((await buchungAbgleich(db, t, graph, client())).neu, 1);
  const a = (await anfragenListe(db, t, { filter: 'offen' })).find((x) => x.patient?.id === hilde)!;
  assert.match(await seite(`/anfragen/${a.id}`), /data-hilfe="anfrage.hausbesuch">.*Hausbesuch-Patient \(wie zuletzt, Türkheim\): die Vorschläge lassen rund 15 Min\. Fahrt davor und danach frei, der bestätigte Termin wird als Hausbesuch angelegt/);
  const vorher = schreibende().length;
  const r = await post('/anfragen/aktion', { aktion: 'bestaetigen', id: a.id, wahl: '0' });
  assert.match(ziel(r), /angelegt\. Als Hausbesuch mit Fahrt davor und danach\. Termin steht im Kalender\. Die Bestätigung liegt als Entwurf im Postfach\./);
  // Kartei: Hausbesuch mit Fahrt 15/15; Kalender: Hausbesuch (Adresse als Ort, Erinnerung zur Anfahrt), Fahrt hin, Rückfahrt zur Praxis – Links in der Reihenfolge PPM → Google Maps → Apple Karten
  const termin = (await db.query<{ id: string; ort: string; vor: number; nach: number; e: string | null; hin: string | null; zurueck: string | null }>(
    'SELECT t.id::text, t.behandlungsort AS ort, t.fahrt_vor_min AS vor, t.fahrt_nach_min AS nach, t.exchange_event_id AS e, t.fahrt_vor_event_id AS hin, t.fahrt_nach_event_id AS zurueck FROM terminanfrage a JOIN termin t ON t.id = a.termin_id WHERE a.id = $1', [a.id],
  )).rows[0]!;
  assert.deepEqual([termin.ort, termin.vor, termin.nach, Boolean(termin.e && termin.hin && termin.zurueck)], ['hausbesuch', 15, 15, true]);
  const ereignisse = schreibende().slice(vorher).filter((x) => x.methode === 'POST' && x.pfad === '/me/calendar/events').map((x) => x.body as Ereignis);
  assert.equal(ereignisse.length, 3, 'Hausbesuch, Fahrt hin, Rückfahrt');
  const [hb, hin, zurueck] = ereignisse as [Ereignis, Ereignis, Ereignis];
  const nummer = (await db.query<{ n: string }>('SELECT patientennummer AS n FROM patient WHERE id = $1', [hilde])).rows[0]!.n;
  assert.deepEqual([hb.subject, hb.location.displayName, hb.isReminderOn, hb.reminderMinutesBeforeStart], [`H. H. ${nummer}`, 'Bahnhofstraße 3, 86842 Türkheim', true, 15]);
  assert.deepEqual([hin.subject, hin.categories, hin.location.displayName], [`Fahrt zum Hausbesuch H. H. ${nummer}`, ['Praxis-Fahrt'], 'Bahnhofstraße 3, 86842 Türkheim']);
  assert.deepEqual([zurueck.subject, zurueck.location.displayName], ['Rückfahrt zur Praxis', 'Schulstraße 17, 86825 Bad Wörishofen']);
  for (const k of ereignisse) {
    const html = k.body.content;
    const [ppm, google, apple] = [html.indexOf('In der Praxis-Assistenz öffnen'), html.indexOf('Google Maps'), html.indexOf('Apple Karten')];
    assert.ok(ppm >= 0 && ppm < google && google < apple, `Reihenfolge PPM → Google Maps → Apple Karten in „${k.subject}“`);
    assert.doesNotMatch(JSON.stringify(k), /Hilde|Heimweg/, 'kein Name im Kalender');
  }
  // Patientenseite: Kachel mit Fahrt und Wegbeschreibung; Absage (Handy wie Rechner): drei Kalendereinträge weg, Nachricht „Absage mit Ersatztermin“ vorgewählt
  const ps = await seite(`/patienten/${hilde}`);
  assert.match(ps, /15 Min\. davor · 15 Min\. danach/);
  assert.match(ps, /data-hilfe="termin.route">Google Maps<\/a>/);
  const abs = await post('/patienten/aktion', { aktion: 'termin_absagen', id: hilde, termin_id: termin.id, status: 'abgesagt_patient', zurueck: `/patienten/${hilde}` });
  assert.match(ziel(abs), new RegExp(`^/patienten/${hilde}\\?vorlage=absage_ersatztermin&termin=${termin.id}&meldung=Termin abgesagt\\. Aus dem Kalender genommen\\. Nachricht an den Patienten\\?.*#nachricht$`));
  assert.equal([termin.e, termin.hin, termin.zurueck].filter((id) => geloescht.includes(`/me/events/${id}`)).length, 3, 'Hausbesuch und beide Fahrten aus dem Kalender genommen');
  assert.match(await seite(`/patienten/${hilde}?vorlage=absage_ersatztermin&termin=${termin.id}`), /<option value="absage_ersatztermin" selected>/, 'Nachricht vorgewählt – gesendet wird nur von Hand');
});

test('P3 Einbettung in die Website: Skript legt den iframe mit Vorwahl der Behandlung an; das Angebot kennt nur aktive Terminarten und keine Namen; der Baustein steht in der Konfiguration', async () => {
  const skript = await (await fetch(`${buchung}/einbetten.js`)).text();
  assert.match(skript, /document\.createElement\('iframe'\)/);
  assert.match(skript, /'\?terminart=' \+ encodeURIComponent\(art\)/);
  assert.match(skript, /addEventListener\('message'/, 'Höhe passt sich der Seite an');
  const mitVorwahl = await (await fetch(`${buchung}/?terminart=P4`)).text();
  assert.match(mitVorwahl, /params\.get\('terminart'\)/);
  assert.match(mitVorwahl, /zeitVorwaehlen\(\)/, 'Zeit aus dem Link folgt der Wahl der Behandlung (W117d)');
  const angebot = await (await fetch(`${buchung}/api/angebot`)).json() as Angebot;
  assert.deepEqual(angebot.terminarten.map((x) => x.code), ['P4'], 'nur aktive Terminarten');
  assert.doesNotMatch(JSON.stringify(angebot), /Prozess|Heimweg|Bahnhofstra/, 'keine Patientendaten im öffentlichen Angebot');
  const konfiguration = await seite('/konfiguration/terminarten');
  assert.ok(konfiguration.includes(`${buchung}/einbetten.js`), 'Baustein mit der öffentlichen Adresse');
  assert.ok(konfiguration.includes(`${buchung}/?terminart=P1`), 'iframe-Baustein');
});

test('P4 Übergaben Rechner ↔ Handy: eine Adresse je Schritt, Seitenfenster nur am Rechner, Rückmelde-Fähnchen nur mit Maus, Vorbelegung kommt am Handy als Seite an', async () => {
  // Dieselbe Adresse: am Rechner im Seitenfenster (praxis.js, data-fenster), am Handy als ganze Seite – Navigation und Pfadzeile fehlen im Fenster, der Bezug steht in der Überschrift
  const skript = await seite('/praxis.js');
  assert.match(skript, /a\[data-pdf\],a\[data-fenster\]/);
  assert.match(skript, /classList\.add\('im-fenster'\)/);
  const cockpit = await seite(`/?schnell=30&patient=${hanna}`);
  const direkt = /href="(\/patienten\/\d+\/neu\/termin[^"]+)" data-fenster="Neuer Termin – Hanna Prozess"/.exec(cockpit)![1]!.replace(/&amp;/g, '&');
  const formular = await seite(direkt);
  assert.match(formular, /<h1>.*Neuer Termin <span class="hint bezug">Hanna Prozess · P-1001<\/span><\/h1>/, 'Patientin in der Überschrift – auch ohne Pfadzeile (W128)');
  const u = new URL(direkt, praxis);
  assert.match(formular, new RegExp(`name="datum" required value="${u.searchParams.get('datum')}"[\\s\\S]*name="zeit" required value="${u.searchParams.get('zeit')}"[\\s\\S]*name="dauer_min" value="30"`), 'Datum, Uhrzeit, Dauer aus dem Link');
  assert.match(formular, /\.im-fenster nav,\.im-fenster footer[^}]*\.im-fenster \.pfadzeile\{display:none\}/, 'im Seitenfenster ohne Navigation und Pfadzeile');
  // Handy: Rückmelde-Fähnchen aus, kein Hover-Horcher (N38)
  assert.match(cockpit, /@media \(hover:none\)\{\.rm-marke,\.rm-seite\{display:none!important\}\}/);
  assert.match(await seite('/rueckmeldung.js'), /matchMedia\('\(hover: hover\)'\)/);
  // Kalender vom Cockpit: das Symbol führt in die Monatsansicht (W124); „Direkt buchen“ ohne Patient führt zur Patientenwahl mit Vorbelegung
  assert.match(cockpit, /href="\/kalender\?ansicht=monat"/);
  const ohne = await seite('/?schnell=30');
  const wahl = /href="(\/kalender\/termin[^"]+)" data-fenster="Neuer Termin"/.exec(ohne)![1]!.replace(/&amp;/g, '&');
  assert.match(await seite(wahl), /<select name="id" required data-hilfe="termin.wahl.patient">[\s\S]*name="dauer_min" value="30"/);
});

test('P5 Geteilte Testadresse (W132): alle Testpatienten haben shopping@2late.de – ohne Kennung entscheidet nur ein eindeutiges Telefon, nie der zufällig erste Patient; eine Mail-Anfrage von der Adresse bleibt ohne Patient', async () => {
  // Karl teilt sich die Adresse mit Hanna (P1) – wie alle Testpatienten im Testpostfach
  const karl = await patientAnlegen(db, t, { vorname: 'Karl', nachname: 'Geteilt', kontakte: [{ art: 'email', wert: 'shopping@2late.de' }, { art: 'mobil', wert: '0151 5555555' }] }, 'x');
  assert.equal(await patientFinden(db, { email: 'shopping@2late.de' }), undefined, 'Hanna und Karl teilen die Adresse → kein Patient');
  assert.equal(await patientFinden(db, { email: 'shopping@2late.de', telefon: '0151 3333333' }), hanna, 'das Telefon entscheidet');
  assert.equal(await patientFinden(db, { telefon: '+49 151 5555555' }), karl, 'Telefon allein, normiert');
  assert.equal(await patientFinden(db, { email: 'shopping@2late.de', telefon: '0151 9999999' }), undefined, 'Telefon unbekannt, Adresse mehrdeutig → niemand');
  assert.equal(await patientFinden(db, { email: 'niemand@example.org' }), undefined);
  const { id } = await anfrageAnlegen(db, t, { quelle: 'mail', anliegen: 'termin', absenderName: 'Jemand Unbekannt', absenderAdresse: 'shopping@2late.de', betreff: 'Termin', text: 'Bitte einen Termin', erkannt: {} }, 'x');
  assert.equal((await anfragenListe(db, t, { filter: 'offen' })).find((a) => a.id === id)!.patient, null, 'Lilli ordnet von Hand zu');
});
