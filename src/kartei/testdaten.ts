/**
 * Erfundene Patienten für die Testumgebung (A09e). Nutzt dieselben Funktionen wie die Oberfläche,
 * damit die Testdaten genau so aussehen wie echte Eingaben. Niemand hier existiert; Mailadressen
 * sind Plus-Varianten der Testadresse, Telefonnummern aus dem Fernsehblock (030) 23125 xxx.
 */
import type { Db } from '../db/index.ts';
import type { Tresor } from '../tresor.ts';
import {
  adresseSpeichern, anrufBeginnen, behandlungErfassen, fallAnlegen, kontaktSpeichern, patientAnlegen, statusSetzen, terminAnlegen, terminStatus, verlaufEintragen,
  verordnungAbbrechen, verordnungAnlegen, wellnessSpeichern, zweitschriftVermerken, type Kontaktart,
} from './patienten.ts';
import { anamneseErfassen, befundErfassen, erklaerungErfassen, phaseSetzen } from './pinnwand.ts';
import { bausteinHinzufuegen, lexwareStandUebernehmen, rechnungStatus } from './rechnungen.ts';
import { einstellungSetzen, textbausteinSpeichern, textbausteine } from './konfiguration.ts';
import { terminartSpeichern } from './terminarten.ts';
import { schliesstageAnlegen } from './freie-tage.ts';
import { aktivSetzen, anlegen as preislisteAnlegen, freigeben as preislisteFreigeben, quellen, standardSetzen } from '../preise/preislisten.ts';
import { slotRegeln } from '../anfragen/dienst.ts';
import { belegteZeiten } from '../anfragen/kalender.ts';
import { freieSlots } from '../anfragen/slots.ts';
import { berlinMitternachtUtc, berlinZeitUtc, datumBerlin, zeitBerlin } from '../zeit.ts';

/**
 * Nächste freie Anfangszeit an einem Tag ab der Wunschzeit – mit Pause, Fahrtzeiten, Öffnungszeiten und Schließtagen
 * wie in der Oberfläche (W113d: Testtermine überlappen sich nie und halten die Pause ein); undefined, wenn nichts frei ist
 */
async function freieZeit(db: Db, datum: string, wunsch: string, dauerMin: number): Promise<string | undefined> {
  const regeln = await slotRegeln(db);
  const belegt = await belegteZeiten(undefined, db, berlinMitternachtUtc(datum), berlinMitternachtUtc(tagPlusKalender(datum, 1)), { pufferMin: regeln.pufferMin });
  const suche = (ab: string) => freieSlots({ ab, tage: 1, belegt, regeln: { ...regeln, dauerMin, rasterMin: 5 } })[0];
  // Ab der Wunschzeit; ist danach nichts mehr frei (oder liegt der Wunsch außerhalb der Öffnungszeit), die erste freie Zeit des Tages
  const slot = suche(berlinZeitUtc(datum, wunsch)) ?? suche(berlinMitternachtUtc(datum));
  return slot ? zeitBerlin(slot.beginn) : undefined;
}

/**
 * Künftige Testtermine neu planen (W113d): Termine erfundener Patienten, die sich mit einem früheren Termin des Tages
 * überlappen oder keine Pause (und Fahrt) lassen, werden abgesagt – nie gelöscht – und zur nächsten freien Zeit desselben
 * Tages neu angelegt, wie die Oberfläche es täte. Die festen Testwochen (Kalender T-1041–1043, Hausbesuche T-1051–1053)
 * bleiben, wie sie sind. Läuft beliebig oft; ohne Konflikte ändert sich nichts.
 */
export async function testtermineNeuPlanen(db: Db, wer: string): Promise<{ geprueft: number; verlegt: number; entfallen: number }> {
  const regeln = await slotRegeln(db);
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT t.id::text, t.patient_id::text, p.patientennummer, t.beginn, t.ende, t.art::text, t.verordnung_id::text, t.fall_id::text, t.terminart_id::text, t.leistung_nummer,
       t.behandlungsort, t.adresse_id::text, t.fahrt_vor_min, t.fahrt_nach_min, coalesce(ta.puffer_min, $1) AS puffer
     FROM termin t JOIN patient p ON p.id = t.patient_id LEFT JOIN terminart ta ON ta.id = t.terminart_id
     WHERE p.patientennummer LIKE 'T-%' AND t.beginn > now() AND t.status IN ('bestaetigt', 'vorgeschlagen') ORDER BY t.beginn, t.id`, [regeln.pufferMin],
  );
  const fest = (nr: string) => /^T-10(4[1-3]|5[1-3])$/.test(nr);
  type Zeile = { id: string; patientId: string; nr: string; beginn: number; ende: number; frei: number; rest: Record<string, unknown> };
  const termine: Zeile[] = rows.map((r) => ({
    id: String(r.id), patientId: String(r.patient_id), nr: String(r.patientennummer), beginn: new Date(r.beginn as string).getTime() - Number(r.fahrt_vor_min) * 60_000,
    ende: new Date(r.ende as string).getTime() + (Number(r.puffer) + Number(r.fahrt_nach_min)) * 60_000, frei: 0, rest: r,
  }));
  // Die festen Testtermine bleiben immer stehen; jeder andere passt, wenn sein Block (mit Fahrt, Pause) keinen behaltenen Block berührt
  const konflikte: Zeile[] = [];
  const behalten: Zeile[] = termine.filter((t) => fest(t.nr));
  for (const t of termine) {
    if (fest(t.nr)) continue;
    if (behalten.some((b) => t.beginn < b.ende && t.ende > b.beginn)) konflikte.push(t);
    else behalten.push(t);
  }
  let verlegt = 0;
  let entfallen = 0;
  for (const k of konflikte) await terminStatus(db, k.patientId, k.id, 'abgesagt_praxis', wer);
  for (const k of konflikte) {
    const r = k.rest;
    const beginn = new Date(r.beginn as string).toISOString();
    const dauerMin = Math.round((new Date(r.ende as string).getTime() - new Date(r.beginn as string).getTime()) / 60_000);
    const id = await terminFrei(db, k.patientId, {
      datum: datumBerlin(beginn), zeit: zeitBerlin(beginn), dauerMin, art: String(r.art), verordnungId: (r.verordnung_id as string | null) ?? undefined, fallId: (r.fall_id as string | null) ?? undefined,
      terminartId: (r.terminart_id as string | null) ?? undefined, leistungNummer: (r.leistung_nummer as string | null) ?? undefined,
      behandlungsort: r.behandlungsort === 'hausbesuch' && r.adresse_id ? `adresse:${r.adresse_id}` : 'praxis',
    }, wer);
    if (id) verlegt++; else entfallen++;
  }
  return { geprueft: termine.length, verlegt, entfallen };
}

/** Termin zur nächsten freien Zeit ab Wunschzeit anlegen; undefined, wenn der Tag voll ist */
async function terminFrei(db: Db, patientId: string, d: Omit<Parameters<typeof terminAnlegen>[2], 'zeit'> & { zeit: string }, wer: string): Promise<string | undefined> {
  const zeit = await freieZeit(db, d.datum, d.zeit, d.dauerMin);
  return zeit ? terminAnlegen(db, patientId, { ...d, zeit }, wer) : undefined;
}

const PERSONEN: { vorname: string; nachname: string; anrede: string; geboren: string; ort: string; strasse: string; plz: string; besonderheiten?: string; ansprache?: string; sprache?: string }[] = [
  { vorname: 'Anna', nachname: 'Beispiel', anrede: 'Frau', geboren: '1984-03-12', ort: 'Bad Wörishofen', strasse: 'Kurpromenade 3', plz: '86825' },
  { vorname: 'Bernd', nachname: 'Mustermann', anrede: 'Herr', geboren: '1961-11-02', ort: 'Bad Wörishofen', strasse: 'Hauptstraße 44', plz: '86825', besonderheiten: 'Hörgerät – bitte deutlich sprechen' },
  { vorname: 'Clara', nachname: 'Testfeld', anrede: 'Frau', geboren: '1992-07-23', ort: 'Mindelheim', strasse: 'Maximilianstraße 12', plz: '87719', ansprache: 'Pronomen sie/ihr' },
  { vorname: 'Dieter', nachname: 'Probst', anrede: 'Herr', geboren: '1948-01-30', ort: 'Türkheim', strasse: 'Am Anger 7', plz: '86842', besonderheiten: 'Kommt mit Begleitung, Treppe schwierig' },
  { vorname: 'Elif', nachname: 'Yilmaz', anrede: 'Frau', geboren: '1979-09-15', ort: 'Bad Wörishofen', strasse: 'Fichtenweg 9', plz: '86825', sprache: 'Deutsch, Türkisch' },
  { vorname: 'Florian', nachname: 'Kurz', anrede: 'Herr', geboren: '2001-05-05', ort: 'Memmingen', strasse: 'Kalchstraße 21', plz: '87700' },
  { vorname: 'Greta', nachname: 'Hofmann', anrede: 'Frau', geboren: '1955-12-24', ort: 'Bad Wörishofen', strasse: 'Sebastian-Kneipp-Straße 2', plz: '86825' },
  { vorname: 'Hakim', nachname: 'Nasser', anrede: 'Herr', geboren: '1988-02-17', ort: 'Landsberg am Lech', strasse: 'Lechstraße 5', plz: '86899', ansprache: 'bitte neutral anreden' },
  { vorname: 'Ida', nachname: 'Brunner', anrede: 'Frau', geboren: '2015-08-08', ort: 'Bad Wörishofen', strasse: 'Schulweg 1', plz: '86825', besonderheiten: 'Kind – Eltern sind Vertragspartner' },
  { vorname: 'Jonas', nachname: 'Weber', anrede: 'Herr', geboren: '1970-06-19', ort: 'Kaufbeuren', strasse: 'Ganghoferstraße 30', plz: '87600' },
];

const tag = (versatz: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + versatz);
  return d.toISOString().slice(0, 10);
};

/** Nächster Werktag ab `versatz` Tagen, als JJJJ-MM-TT */
function werktag(versatz: number): string {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + versatz);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Testtermine (W77): drei Patienten mit 12er-Rezept, je zwölf Termine über die nächsten zwei bis vier
 * Wochen, mehrere pro Tag mit Lücken – für „Heute im Blick“ und den Kalender. Läuft nur einmal (T-1011).
 */
export async function testtermineAnlegen(db: Db, t: Tresor, o: { adresse: string; wer: string }): Promise<{ uebersprungen: boolean; patienten: number; termine: number }> {
  if ((await db.query("SELECT 1 FROM patient WHERE patientennummer = 'T-1011'")).rows.length) return { uebersprungen: true, patienten: 0, termine: 0 };
  const [lokal, domain] = o.adresse.split('@');
  const wer = o.wer;
  // Je Patient: Wochentage (1 = Mo … 5 = Fr) und Uhrzeiten – zusammen ergeben sie mehrere Termine pro Tag mit Lücken
  const PLAN: { vorname: string; nachname: string; geboren: string; ort: string; plz: string; strasse: string; massnahme: string; nummer: string; tage: number[]; zeit: string; dauer: number; start: number }[] = [
    { vorname: 'Karin', nachname: 'Zwölfer', geboren: '1966-04-03', ort: 'Bad Wörishofen', plz: '86825', strasse: 'Kneippstraße 11', massnahme: 'Manuelle Therapie', nummer: '21201', tage: [1, 3, 5], zeit: '08:00', dauer: 30, start: 1 },
    { vorname: 'Leon', nachname: 'Dauerlauf', geboren: '1995-10-19', ort: 'Türkheim', plz: '86842', strasse: 'Bahnhofstraße 4', massnahme: 'Krankengymnastik', nummer: '20501', tage: [1, 2, 4], zeit: '10:30', dauer: 30, start: 2 },
    { vorname: 'Monika', nachname: 'Lymphe', geboren: '1958-12-01', ort: 'Mindelheim', plz: '87719', strasse: 'Krumbacher Straße 2', massnahme: 'Manuelle Lymphdrainage 45 Min.', nummer: '20201', tage: [2, 3, 5], zeit: '14:30', dauer: 45, start: 1 },
  ];
  let termine = 0;
  for (const [i, p] of PLAN.entries()) {
    const nr = String(11 + i).padStart(3, '0');
    const id = await patientAnlegen(db, t, {
      patientennummer: `T-${1011 + i}`, anrede: i === 1 ? 'Herr' : 'Frau', vorname: p.vorname, nachname: p.nachname, geburtsdatum: p.geboren, patientSeit: werktag(-7),
      kontakte: [{ art: 'mobil', wert: `030 23125 ${nr}` }, { art: 'whatsapp', wert: `030 23125 ${nr}` }, { art: 'email', wert: `${lokal}+${p.vorname.toLowerCase()}@${domain}` }],
      adresse: { bezeichnung: 'Zuhause', zusatz: null, strasse: p.strasse.replace(/\s\d+\w?$/, ''), hausnummer: /\s(\d+\w?)$/.exec(p.strasse)?.[1] ?? null, plz: p.plz, ort: p.ort },
    }, wer);
    await erklaerungErfassen(db, t, id, { art: 'datenschutzinformation', form: 'schriftlich', fassung: 'Datenschutzinformation 2026-01' }, wer);
    const rezept = await verordnungAnlegen(db, t, id, {
      ausgestelltAm: werktag(-3), arzt: 'Dr. med. Erika Beispielarzt, Orthopädie Bad Wörishofen', massnahme: p.massnahme, leistungNummer: p.nummer, anzahl: 12, frequenz: '3× pro Woche',
      diagnose: ['M54.4 Lumboischialgie', 'S83.5 Kreuzbandriss (Reha)', 'I89.0 Lymphödem'][i], langzeit: i === 2,
    }, wer);
    // Fall anlegen, Einwilligung dazu, Phase Aufnahme/Anamnese – die Termine gehören zum Rezept
    const fall = await fallAnlegen(db, t, id, { grundlage: 'verordnung', bezeichnung: ['Rücken', 'Knie rechts', 'Lymphödem Arm'][i], anlass: 'Verordnung über zwölf Einheiten (erfunden)', phase: 'aufnahme' }, wer);
    await db.query('UPDATE verordnung SET fall_id = $2 WHERE id = $1', [rezept, fall]);
    await erklaerungErfassen(db, t, id, { fallId: fall, art: 'behandlungseinwilligung', form: 'schriftlich', inhalt: `${p.massnahme} laut Verordnung (erfunden)` }, wer);
    // Zwölf Termine: an den Wochentagen des Plans, ab dem Starttag, bis alle zwölf verteilt sind (ca. vier Wochen)
    let gesetzt = 0;
    for (let v = p.start; gesetzt < 12 && v < 45; v++) {
      const d = new Date();
      d.setUTCHours(12, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() + v);
      if (!p.tage.includes(d.getUTCDay())) continue;
      const tag = d.toISOString().slice(0, 10);
      if (!(await terminFrei(db, id, { datum: tag, zeit: p.zeit, dauerMin: p.dauer, verordnungId: rezept, fallId: fall }, wer))) continue;
      gesetzt++;
      termine++;
    }
    await verlaufEintragen(db, t, id, { art: 'anruf_eingehend', grund: 'terminvereinbarung', notiz: 'Zwölf Termine vereinbart (erfunden)' }, wer);
  }
  return { uebersprungen: false, patienten: PLAN.length, termine };
}

export async function testdatenAnlegen(db: Db, t: Tresor, o: { adresse: string; wer: string }): Promise<{ uebersprungen: boolean; patienten: number; behandlungen: number; termine: number; rechnungen: number }> {
  if ((await db.query("SELECT 1 FROM patient WHERE patientennummer = 'T-1001'")).rows.length) return { uebersprungen: true, patienten: 0, behandlungen: 0, termine: 0, rechnungen: 0 };
  // Ohne aktive Preisliste hätten die Rechnungsentwürfe keine Preise: die erste vorhandene Liste freigeben und aktiv setzen (nur Testumgebung)
  if (!(await db.query('SELECT 1 FROM preisliste WHERE standard')).rows.length) {
    await db.query("UPDATE preisliste SET status = 'freigegeben', aktiv = true, standard = true, freigegeben_am = COALESCE(freigegeben_am, now()), freigegeben_von = COALESCE(freigegeben_von, $1) WHERE id = (SELECT min(id) FROM preisliste WHERE status <> 'archiviert')", [o.wer]);
  }
  const [lokal, domain] = o.adresse.split('@');
  // Wellness-Katalog (W74) – erfundene Beispiele, Lilli ersetzt sie (Frage 10)
  const wellness: string[] = [];
  for (const w of [['WM30', 'Wellnessmassage 30 Minuten', 30, '42,00'], ['WM60', 'Wellnessmassage 60 Minuten', 60, '75,00'], ['HOT', 'Hot-Stone-Massage 50 Minuten', 50, '79,00']] as const) {
    wellness.push(await wellnessSpeichern(db, { code: w[0], bezeichnung: w[1], dauerMin: w[2], preis: w[3] }, o.wer));
  }
  let behandlungen = 0;
  let termine = 0;
  let rechnungen = 0;
  const wer = o.wer;

  for (const [i, p] of PERSONEN.entries()) {
    const nr = String(i + 1).padStart(3, '0');
    const telefon = `030 23125 ${nr}`;
    const kontakte: { art: Kontaktart; wert: string; bezeichnung?: string }[] = [
      { art: 'mobil', wert: telefon }, { art: 'whatsapp', wert: telefon }, { art: 'email', wert: `${lokal}+${p.vorname.toLowerCase()}@${domain}` },
    ];
    if (i % 3 === 0) kontakte.push({ art: 'telefon', wert: `030 23125 9${nr.slice(1)}`, bezeichnung: 'Festnetz' });
    const id = await patientAnlegen(db, t, {
      patientennummer: `T-${1001 + i}`, anrede: p.anrede, vorname: p.vorname, nachname: p.nachname, geburtsdatum: p.geboren, patientSeit: tag(-400 + i * 30),
      ansprache: p.ansprache, besonderheiten: p.besonderheiten, sprache: p.sprache, kontakte,
      adresse: { bezeichnung: 'Zuhause', zusatz: null, strasse: p.strasse.replace(/\s\d+\w?$/, ''), hausnummer: /\s(\d+\w?)$/.exec(p.strasse)?.[1] ?? null, plz: p.plz, ort: p.ort },
    }, wer);
    if (i === 8) {
      await db.query("INSERT INTO patient_bezugsperson (patient_id, rolle, name, beziehung, berechtigungsgrund, telefon) VALUES ($1, 'vertragspartner', 'Martina Brunner', 'Mutter', 'Sorgerecht', '030 23125 909')", [id]);
      await db.query("INSERT INTO patient_bezugsperson (patient_id, rolle, name, beziehung) VALUES ($1, 'rechnungsempfaenger', 'Martina Brunner', 'Mutter')", [id]);
    }
    if (i === 1) await db.query('INSERT INTO patient_adresse (patient_id, bezeichnung, strasse, hausnummer, plz, ort) VALUES ($1, $2, $3, $4, $5, $6)', [id, 'Arbeit', 'Industriestraße', '8', '86825', 'Bad Wörishofen']);
    await db.query("INSERT INTO patient_versicherung (patient_id, art, versicherer, tarif) VALUES ($1, $2, $3, $4)", [id, i % 4 === 0 ? 'beihilfe' : 'pkv', i % 4 === 0 ? 'Beihilfe Bayern + PKV' : 'Debeka (erfunden)', i % 4 === 0 ? '70 % Beihilfe' : 'Tarif N (erfunden)']);

    // Fälle, Rezepte, Behandlungen – nicht bei allen gleich, damit die Kacheln verschieden aussehen
    if (i < 8) {
      const massnahme = ['Manuelle Therapie', 'Krankengymnastik', 'Manuelle Lymphdrainage 45 Min.', 'Klassische Massagetherapie'][i % 4]!;
      const nummer = ['21201', '20501', '20201', '20106'][i % 4]!;
      const rezept = await verordnungAnlegen(db, t, id, {
        ausgestelltAm: tag(-40 - i * 3), arzt: ['Dr. med. Erika Beispielarzt, Orthopädie Bad Wörishofen', 'Dr. med. Karl Musterarzt, Allgemeinmedizin'][i % 2]!,
        massnahme, leistungNummer: nummer, anzahl: 6, frequenz: '2× pro Woche', diagnose: ['M54.5 Kreuzschmerz', 'M75.1 Schulter rechts', 'M17.1 Gonarthrose links', 'M54.2 Zervikalgie'][i % 4],
      }, wer);
      const erledigt = Math.min(i + 1, 5);
      for (let k = 0; k < erledigt; k++) {
        // Zu jeder vergangenen Behandlung ein (erledigter) Termin – so ist der Kalender auch rückwärts gefüllt
        const terminId = await terminAnlegen(db, id, { datum: tag(-30 - i * 2 + k * 4), zeit: `${String(8 + ((i + k) % 8)).padStart(2, '0')}:${k % 2 ? '30' : '00'}`, dauerMin: 30, verordnungId: rezept }, wer);
        termine++;
        await behandlungErfassen(db, t, id, {
          terminId,
          fallId: k === 0 ? undefined : (await db.query<{ id: string }>('SELECT id::text FROM behandlungsfall WHERE patient_id = $1 ORDER BY nummer DESC LIMIT 1', [id])).rows[0]!.id,
          neuerFall: k === 0 ? { grundlage: 'verordnung', bezeichnung: ['Rücken', 'Schulter rechts', 'Knie links', 'Nacken'][i % 4], anlass: 'Schmerzen seit mehreren Wochen, Alltag eingeschränkt (erfunden)', diagnoseArzt: ['Kreuzschmerz', 'Impingement Schulter', 'Gonarthrose', 'Zervikalgie'][i % 4] } : undefined,
          datum: tag(-30 - i * 2 + k * 4), dauerMin: 20 + (i % 3) * 10, verordnungId: rezept, leistungNummer: nummer,
          massnahmen: `${massnahme}, Mobilisation, Weichteiltechniken (erfundener Eintrag ${k + 1})`,
          verlaufWirkung: k === 0 ? 'Erstbefund: Beweglichkeit eingeschränkt, Schmerz NRS 6/10' : `Schmerz rückläufig, NRS ${Math.max(1, 6 - k)}/10`,
          uebungen: 'Heimübungsprogramm 2× täglich', behandeltVon: 'Lilli',
        }, wer);
        behandlungen++;
      }
      // Kommende Termine: mit Rezept (solange offen) oder Individualtermin
      const offen = 6 - erledigt;
      for (let k = 0; k < Math.min(offen, 2); k++) {
        if (await terminFrei(db, id, { datum: tag(2 + i + k * 3), zeit: `${String(8 + (i + k) % 9).padStart(2, '0')}:${k ? '30' : '00'}`, dauerMin: 30, verordnungId: offen ? rezept : undefined }, wer)) termine++;
      }
    } else if (i === 8) {
      if (await terminFrei(db, id, { datum: tag(5), zeit: '15:00', dauerMin: 30, art: 'erstgespraech' }, wer)) termine++;
    } else {
      // Jonas: Wellness-Serie und eine Behandlung ohne Rezept (Direktzugang)
      const wf = await fallAnlegen(db, t, id, { grundlage: 'praevention', wellnessLeistungId: wellness[1], begonnenAm: tag(-20) }, wer);
      await behandlungErfassen(db, t, id, { fallId: wf, datum: tag(-20), dauerMin: 60, massnahmen: 'Wellnessmassage Rücken/Nacken (erfunden)', behandeltVon: 'Lilli' }, wer);
      await behandlungErfassen(db, t, id, { fallId: wf, datum: tag(-6), dauerMin: 60, massnahmen: 'Wellnessmassage Ganzkörper (erfunden)', behandeltVon: 'Lilli' }, wer);
      behandlungen += 2;
      const df = await fallAnlegen(db, t, id, { grundlage: 'direktzugang', bezeichnung: 'Nacken, Verspannung', anlass: 'Verspannung nach Bildschirmarbeit (erfunden)', begonnenAm: tag(-10) }, wer);
      await behandlungErfassen(db, t, id, { fallId: df, datum: tag(-10), dauerMin: 30, leistungNummer: '21201', massnahmen: 'Manuelle Therapie HWS (erfunden)', behandeltVon: 'Lilli' }, wer);
      behandlungen++;
      if (await terminFrei(db, id, { datum: tag(4), zeit: '11:00', dauerMin: 60, fallId: wf }, wer)) termine++;
    }
    // Greta: Folgerezept mit Langzeit und Zweitschrift, Hakim: Korrektur
    if (i === 6 || i === 7) {
      const alt = (await db.query<{ id: string }>('SELECT id::text FROM verordnung WHERE patient_id = $1 ORDER BY id DESC LIMIT 1', [id])).rows[0]!.id;
      await verordnungAnlegen(db, t, id, {
        ausgestelltAm: tag(-3), arzt: 'Dr. med. Erika Beispielarzt, Orthopädie Bad Wörishofen', massnahme: i === 6 ? 'Manuelle Lymphdrainage 45 Min.' : 'Klassische Massagetherapie', leistungNummer: i === 6 ? '20201' : '20106',
        anzahl: i === 6 ? 10 : 6, art: i === 6 ? 'folge_unveraendert' : 'korrektur', vorgaengerId: alt, langzeit: i === 6, notiz: i === 6 ? 'Dauerverordnung laut Arzt' : 'Anzahl auf dem Rezept berichtigt',
      }, wer);
      if (i === 6) await db.query('UPDATE verordnung SET zweitschrift_am = $2 WHERE patient_id = $1 AND langzeit', [id, tag(-1)]);
    }

    // Rechnungen: bezahlt, gelb (überfällig), rot (gemahnt) – für die Kachelfarbe
    const rechnung = async (status: string, art: string, datumVersatz: number, faelligVersatz: number, betrag: number, o2: { gemahnt?: boolean; bezahlt?: boolean } = {}) => {
      await db.query(
        `INSERT INTO rechnung (patient_id, art, steuerklasse, empfaenger, datum, faellig_am, nummer, betrag, status, gesendet_am, gemahnt_am, bezahlt_am, erstellt_von)
         VALUES ($1, $2, 'heilbehandlung_steuerfrei', $3, $4, $5, $6, $7, $8, $4, $9, $10, $11)`,
        [id, art, JSON.stringify({ name: `${p.vorname} ${p.nachname}`, strasse: p.strasse, plz: p.plz, ort: p.ort }), tag(datumVersatz), tag(faelligVersatz),
          `TEST-${1001 + i}-${++rechnungen}`, betrag, status, o2.gemahnt ? tag(faelligVersatz + 7) : null, o2.bezahlt ? tag(faelligVersatz - 3) : null, wer],
      );
    };
    if (i < 8) await rechnung('bezahlt', 'abschlussrechnung', -120, -106, 240 + i * 10, { bezahlt: true });
    if (i === 2 || i === 6) await rechnung('gesendet', 'zwischenrechnung', -20, -6, 185.5);
    if (i === 3) await rechnung('gesendet', 'abschlussrechnung', -50, -36, 312, { gemahnt: true });
    if (i === 5) await rechnung('gesendet', 'einzel', -40, -26, 46.27);

    // Pinnwand (W76): Erklärungen und Anamnese bei den meisten; Ida steht in „Anfrage“, Jonas' Wellness in „Behandlung“
    await erklaerungErfassen(db, t, id, { art: 'datenschutzinformation', form: 'schriftlich', am: tag(-400 + i * 30), fassung: 'Datenschutzinformation 2026-01' }, wer);
    if (i < 8) {
      const fall = (await db.query<{ id: string }>('SELECT id::text FROM behandlungsfall WHERE patient_id = $1 ORDER BY nummer LIMIT 1', [id])).rows[0]!.id;
      await erklaerungErfassen(db, t, id, { fallId: fall, art: 'behandlungseinwilligung', form: 'schriftlich', am: tag(-40 - i * 3), inhalt: 'Physiotherapie laut Verordnung (erfunden)' }, wer);
      await erklaerungErfassen(db, t, id, { fallId: fall, art: 'kosteninformation', form: 'textform', am: tag(-40 - i * 3), inhalt: 'Preisliste Privat 2026 ausgehändigt' }, wer);
      if (i !== 3) await anamneseErfassen(db, t, id, fall, { erhobenAm: tag(-38 - i * 3), art: i % 2 ? 'online' : 'gespraech', beschwerden: 'Schmerzen seit mehreren Wochen, Alltag eingeschränkt (erfunden)', vorgeschichte: 'keine Operationen', medikamente: i % 3 ? 'keine' : 'Ibuprofen bei Bedarf' }, wer);
      if (i !== 3 && i !== 5) await befundErfassen(db, t, id, fall, { erhobenAm: tag(-37 - i * 3), art: 'eingang', text: 'Beweglichkeit eingeschränkt, Druckschmerz (erfunden)', messwerte: 'NRS 6/10' }, wer);
      if (i === 4) { await befundErfassen(db, t, id, fall, { erhobenAm: tag(-2), art: 'abschluss', text: 'Beschwerdefrei, Ziele erreicht (erfunden)' }, wer); }
      if (i === 3) await phaseSetzen(db, id, fall, 'aufnahme', wer, 'Anamnese steht noch aus (erfunden)');
    } else if (i === 8) {
      await fallAnlegen(db, t, id, { grundlage: 'verordnung', bezeichnung: 'Haltung, Schule', anlass: 'Eltern bitten um Termin (erfunden)', phase: 'anfrage' }, wer);
    }
    // Heute immer etwas im Blick: drei Termine am Erzeugungstag (Anna, Elif, Greta)
    if (i === 0 || i === 4 || i === 6) {
      const wunsch = { 0: '09:00', 4: '11:00', 6: '14:30' }[i]!;
      await terminAnlegen(db, id, { datum: tag(0), zeit: (await freieZeit(db, tag(0), wunsch, 30)) ?? wunsch, dauerMin: 30 }, wer);
      termine++;
    }
    // Kontaktverlauf: ein paar Gespräche, bei Anna ein offener Anruf
    await verlaufEintragen(db, t, id, { art: 'anruf_eingehend', grund: 'terminvereinbarung', notiz: 'Erstkontakt, Termin vereinbart (erfunden)' }, wer);
    if (i % 2 === 1) await verlaufEintragen(db, t, id, { art: 'whatsapp', grund: 'terminverschiebung', notiz: 'Bittet um späteren Termin' }, wer);
    if (i === 0) await anrufBeginnen(db, id, (await db.query<{ id: string }>("SELECT id::text FROM patient_kontakt WHERE patient_id = $1 AND art = 'mobil'", [id])).rows[0]?.id, wer);
  }
  return { uebersprungen: false, patienten: PERSONEN.length, behandlungen, termine, rechnungen };
}

/** Termine eines Rezepts auf Wochentage verteilen (1 = Mo … 5 = Fr), ab `start` Tagen, bis alle Einheiten vergeben sind */
async function termineVerteilen(db: Db, patientId: string, rezept: string, fallId: string, anzahl: number, tage: number[], zeit: string, start: number, dauer = 30, wer = 'testdaten'): Promise<string[]> {
  const ids: string[] = [];
  for (let v = start; ids.length < anzahl && v < start + 60; v++) {
    const d = new Date();
    d.setUTCHours(12, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + v);
    if (!tage.includes(d.getUTCDay())) continue;
    const id = await terminFrei(db, patientId, { datum: d.toISOString().slice(0, 10), zeit, dauerMin: dauer, verordnungId: rezept, fallId }, wer);
    if (id) ids.push(id);
  }
  return ids;
}

/**
 * Erweiterte Testdaten (Testerrolle, 26.10.2026): zwei Preislisten aus der aktuellen GKV-Liste („Gerundet“
 * Faktor 1,0 aufgerundet = aktiv; „Tagesgast“ Faktor 1,6 aufgerundet), sechs Patienten mit drei Adressen und
 * der Mailadresse shopping@2late.de, Rezepte mit 6 und 12 Einheiten samt Terminen und automatischen
 * Rechnungsentwürfen – dazu je ein Beispiel für jede Phase der Pinnwand, jeden Rechnungsstatus, Korrektur,
 * Zweitschrift, Abbruch, Storno, Lexware-Abweichung, Wellness, Direktzugang, Bezugspersonen, Kontaktverlauf.
 * Läuft nur einmal (T-1021).
 */
/**
 * Testdaten für den Terminkalender (W116f): eine Terminart mit eigener Pause, Standard-Pause 10 Minuten, drei
 * Patienten, deren Termine in der übernächsten Woche einen vollen Tag, einen halb belegten Tag, einen Tag mit
 * langer Rüstzeit und einen Schließtag ergeben – für Monatsansicht, Zähler und Suche. Läuft nur einmal (T-1041).
 */
export async function testkalenderAnlegen(db: Db, t: Tresor, o: { adresse: string; wer: string }): Promise<{ uebersprungen: boolean; patienten: number; termine: number; montag: string }> {
  if ((await db.query("SELECT 1 FROM patient WHERE patientennummer = 'T-1041'")).rows.length) return { uebersprungen: true, patienten: 0, termine: 0, montag: '' };
  const [lokal, domain] = o.adresse.split('@');
  const wer = o.wer;
  // Standard-Pause 10 Minuten, wenn keine (oder 0) eingetragen ist – die Kalender-Testdaten sind darauf gerechnet
  const pause = (await db.query<{ wert: string }>("SELECT wert FROM praxis_einstellung WHERE schluessel = 'termin_puffer_min'")).rows[0]?.wert;
  if (!Number(pause)) await einstellungSetzen(db, 'termin_puffer_min', '10', wer);
  const vorhandene = (await db.query<{ id: string }>("SELECT id::text FROM terminart WHERE kurz = 'Lymphdrainage 45 + Rüstzeit'")).rows[0]?.id;
  const terminart = vorhandene ?? await terminartSpeichern(db, { sektion: 'rezept', kurz: 'Lymphdrainage 45 + Rüstzeit', lang: 'Manuelle Lymphdrainage 45 Minuten, danach 15 Minuten Rüstzeit (erfunden)', dauerMin: 45, leistungNummer: '20201', pufferMin: 15 }, wer);
  // Übernächste Woche: Montag voll, Dienstag halb, Mittwoch eine lange Behandlung, Donnerstag frei, Freitag Schließtag
  let montag = werktag(8);
  while (new Date(`${montag}T12:00:00Z`).getUTCDay() !== 1) montag = tagPlusKalender(montag, 1);
  const PLAN: { vorname: string; nachname: string; geboren: string; termine: { versatz: number; zeit: string; dauer: number; lang?: boolean }[] }[] = [
    { vorname: 'Ulla', nachname: 'Vollertag', geboren: '1972-02-09', termine: [{ versatz: 0, zeit: '08:00', dauer: 30 }, { versatz: 0, zeit: '09:20', dauer: 30 }, { versatz: 0, zeit: '10:40', dauer: 30 }, { versatz: 1, zeit: '08:00', dauer: 30 }, { versatz: 2, zeit: '09:00', dauer: 45, lang: true }] },
    { vorname: 'Viktor', nachname: 'Halbtag', geboren: '1989-06-30', termine: [{ versatz: 0, zeit: '08:40', dauer: 30 }, { versatz: 0, zeit: '10:00', dauer: 30 }, { versatz: 0, zeit: '11:20', dauer: 30 }, { versatz: 1, zeit: '10:30', dauer: 60 }] },
    // Nachmittag lückenlos bis 18:00 (jeder Termin blockt 10 Minuten Pause danach) – der Montag ist damit voll
    { vorname: 'Wiebke', nachname: 'Lückenlos', geboren: '1964-11-11', termine: [{ versatz: 0, zeit: '12:00', dauer: 30 }, { versatz: 0, zeit: '12:40', dauer: 30 }, { versatz: 0, zeit: '13:20', dauer: 30 }, { versatz: 0, zeit: '14:00', dauer: 60 }, { versatz: 0, zeit: '15:10', dauer: 30 }, { versatz: 0, zeit: '15:50', dauer: 60 }, { versatz: 0, zeit: '17:00', dauer: 30 }, { versatz: 0, zeit: '17:40', dauer: 20 }] },
  ];
  let termine = 0;
  for (const [i, p] of PLAN.entries()) {
    const nr = String(41 + i).padStart(3, '0');
    const id = await patientAnlegen(db, t, {
      patientennummer: `T-${1041 + i}`, anrede: i === 1 ? 'Herr' : 'Frau', vorname: p.vorname, nachname: p.nachname, geburtsdatum: p.geboren, patientSeit: werktag(-14),
      kontakte: [{ art: 'mobil', wert: `030 23125 ${nr}` }, { art: 'email', wert: `${lokal}+${p.vorname.toLowerCase()}@${domain}` }],
      adresse: { bezeichnung: 'Zuhause', zusatz: null, strasse: 'Kneippstraße', hausnummer: String(20 + i), plz: '86825', ort: 'Bad Wörishofen' },
    }, wer);
    for (const x of p.termine) {
      await terminAnlegen(db, id, { datum: tagPlusKalender(montag, x.versatz), zeit: x.zeit, dauerMin: x.dauer, terminartId: x.lang ? terminart : undefined }, wer);
      termine++;
    }
  }
  await schliesstageAnlegen(db, { von: tagPlusKalender(montag, 4), name: 'Fortbildung (erfunden)', art: 'fortbildung' }, wer);
  return { uebersprungen: false, patienten: PLAN.length, termine, montag };
}

const tagPlusKalender = (datum: string, n: number): string => {
  const d = new Date(`${datum}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Hausbesuch-Testdaten (W113): zwei Patienten mit Hausbesuchadresse (einer außerhalb mit eigener Fahrtzeit, einer am
 * Ort), eine Betreueradresse, Hausbesuche in der übernächsten Woche (Dienstag und Mittwoch) – mit automatischer
 * Fahrt davor und danach. Läuft nur einmal (T-1051).
 */
export async function testhausbesuchAnlegen(db: Db, t: Tresor, o: { adresse: string; wer: string }): Promise<{ uebersprungen: boolean; patienten: number; termine: number }> {
  if ((await db.query("SELECT 1 FROM patient WHERE patientennummer = 'T-1051'")).rows.length) return { uebersprungen: true, patienten: 0, termine: 0 };
  const [lokal, domain] = o.adresse.split('@');
  const wer = o.wer;
  const orte = (await db.query<{ wert: string }>("SELECT wert FROM praxis_einstellung WHERE schluessel = 'fahrtzeit_orte'")).rows[0]?.wert ?? '';
  if (!/türkheim/i.test(orte)) await einstellungSetzen(db, 'fahrtzeit_orte', [orte.trim(), 'Türkheim = 15'].filter(Boolean).join('\n'), wer);
  let montag = werktag(8);
  while (new Date(`${montag}T12:00:00Z`).getUTCDay() !== 1) montag = tagPlusKalender(montag, 1);
  const hanna = await patientAnlegen(db, t, {
    patientennummer: 'T-1051', anrede: 'Frau', vorname: 'Hanna', nachname: 'Hausbesuch', geburtsdatum: '1948-03-12', patientSeit: werktag(-30),
    kontakte: [{ art: 'telefon', wert: '030 23125 051' }, { art: 'email', wert: `${lokal}+hanna@${domain}` }],
    adresse: { bezeichnung: 'Zuhause', zusatz: null, strasse: 'Kneippstraße', hausnummer: '5', plz: '86825', ort: 'Bad Wörishofen' },
  }, wer);
  await adresseSpeichern(db, hanna, { bezeichnung: 'Pflegeheim Sonnenhof', zusatz: 'Zimmer 12', strasse: 'Bahnhofstraße', hausnummer: '3', plz: '86842', ort: 'Türkheim', typ: 'hausbesuch' }, wer, { ohneProtokoll: true });
  await adresseSpeichern(db, hanna, { bezeichnung: 'Tochter (Betreuerin)', zusatz: 'Heike Hausbesuch', strasse: 'Am Anger', hausnummer: '9', plz: '86825', ort: 'Bad Wörishofen', typ: 'betreuer' }, wer, { ohneProtokoll: true });
  const hugo = await patientAnlegen(db, t, {
    patientennummer: 'T-1052', anrede: 'Herr', vorname: 'Hugo', nachname: 'Heimweg', geburtsdatum: '1951-07-24', patientSeit: werktag(-30),
    kontakte: [{ art: 'mobil', wert: '030 23125 052' }, { art: 'email', wert: `${lokal}+hugo@${domain}` }],
    adresse: { bezeichnung: 'Zuhause', zusatz: null, strasse: 'Hauptstraße', hausnummer: '44', plz: '86825', ort: 'Bad Wörishofen' },
  }, wer);
  // Ilse kommt in die Praxis – ihre Termine sind die echten Folgetermine nach den Hausbesuchen (Rückfahrt zur Praxis)
  const ilse = await patientAnlegen(db, t, {
    patientennummer: 'T-1053', anrede: 'Frau', vorname: 'Ilse', nachname: 'Innerorts', geburtsdatum: '1969-02-02', patientSeit: werktag(-30),
    kontakte: [{ art: 'mobil', wert: '030 23125 053' }, { art: 'email', wert: `${lokal}+ilse@${domain}` }],
    adresse: { bezeichnung: 'Zuhause', zusatz: null, strasse: 'Kurpromenade', hausnummer: '8', plz: '86825', ort: 'Bad Wörishofen' },
  }, wer);
  // Dienstag: Hausbesuch in Türkheim (Fahrt 15 hin, 15 zurück), danach Ilse in der Praxis.
  // Mittwoch: Türkheim → Hausbesuch in Bad Wörishofen (Transfer hängt am zweiten Termin) → Ilse in der Praxis (Rückfahrt).
  const dienstag = tagPlusKalender(montag, 1);
  const mittwoch = tagPlusKalender(montag, 2);
  await terminAnlegen(db, hanna, { datum: dienstag, zeit: '13:00', dauerMin: 45, behandlungsort: 'rechnung_kopieren' }, wer);
  await terminAnlegen(db, ilse, { datum: dienstag, zeit: '14:30', dauerMin: 30 }, wer);
  await terminAnlegen(db, hanna, { datum: mittwoch, zeit: '14:00', dauerMin: 30, behandlungsort: 'rechnung_kopieren' }, wer);
  await terminAnlegen(db, hugo, { datum: mittwoch, zeit: '15:00', dauerMin: 30, behandlungsort: 'rechnung_kopieren' }, wer);
  await terminAnlegen(db, ilse, { datum: mittwoch, zeit: '16:00', dauerMin: 30 }, wer);
  return { uebersprungen: false, patienten: 3, termine: 5 };
}

export async function testdatenErweitert(db: Db, t: Tresor, o: { adresse: string; wer: string }): Promise<{ uebersprungen: boolean; preislisten: number; patienten: number; termine: number; rechnungen: number }> {
  if ((await db.query("SELECT 1 FROM patient WHERE patientennummer = 'T-1021'")).rows.length) return { uebersprungen: true, preislisten: 0, patienten: 0, termine: 0, rechnungen: 0 };
  const wer = o.wer;
  let termine = 0;

  // ── Preislisten aus der aktuellen GKV-Fassung ──
  let preislisten = 0;
  let tagesgast: string | null = null;
  const gkv = (await quellen(db, 'gkv'))[0];
  if (gkv) {
    const beihilfe = (await quellen(db, 'beihilfe'))[0];
    const fertigmachen = async (id: string) => {
      // Positionen ohne GKV-Preis (z. B. Pauschalen) abwählen, sonst lässt sich die Liste nicht freigeben
      await db.query('UPDATE preisliste_position SET uebernehmen = false WHERE preisliste_id = $1 AND eigener_preis IS NULL', [id]);
      await preislisteFreigeben(db, id, wer);
    };
    // Nach einem Neuaufbau der Patienten gibt es die Listen schon – dann wiederverwenden
    const vorhanden = async (name: string) => (await db.query<{ id: string }>("SELECT id::text FROM preisliste WHERE name = $1 AND status = 'freigegeben' ORDER BY id DESC LIMIT 1", [name])).rows[0]?.id;
    let gerundet = await vorhanden('Gerundet (GKV × 1,0)');
    if (!gerundet) {
      gerundet = await preislisteAnlegen(db, { name: 'Gerundet (GKV × 1,0)', gkvQuelleId: gkv.id, beihilfeQuelleId: beihilfe?.id, standardFaktor: 1, aufrunden: true, wer });
      await fertigmachen(gerundet);
      preislisten++;
    }
    await standardSetzen(db, gerundet, wer);
    tagesgast = (await vorhanden('Tagesgast (GKV × 1,6)')) ?? null;
    if (!tagesgast) {
      tagesgast = await preislisteAnlegen(db, { name: 'Tagesgast (GKV × 1,6)', gkvQuelleId: gkv.id, beihilfeQuelleId: beihilfe?.id, standardFaktor: 1.6, aufrunden: true, wer });
      await fertigmachen(tagesgast);
      preislisten++;
    }
    // Beide Listen aktiv: „Gerundet“ ist der Standard (alle ohne eigene Liste), „Tagesgast“ ausdrücklich den Tagesgästen zugeordnet (W97)
    await aktivSetzen(db, tagesgast, wer);
  }
  // Ein weiterer Textbaustein für die Rechnungen
  if (!(await textbausteine(db, { alle: true })).some((b) => b.kurzname === 'Bankverbindung')) {
    await textbausteinSpeichern(db, { kurzname: 'Bankverbindung', text: 'Bankverbindung: Praxis Lilli Nebel · IBAN DE00 0000 0000 0000 0000 00 (erfunden) · Verwendungszweck: Rechnungsnummer', wirkung: 'keine', automatisch: 'alle' }, wer);
  }
  const bankbaustein = (await textbausteine(db)).find((b) => b.kurzname === 'Bankverbindung');

  // ── Sechs Patienten mit drei Adressen, Rezept mit 6 bzw. 12 Einheiten ──
  const SECHS = [
    { vorname: 'Nora', nachname: 'Sechser', anrede: 'Frau', geboren: '1972-02-14', einheiten: 6, massnahme: 'Krankengymnastik', nummer: '20501', tage: [1, 3], zeit: '09:00' },
    { vorname: 'Oskar', nachname: 'Zwölfer', anrede: 'Herr', geboren: '1965-07-30', einheiten: 12, massnahme: 'Manuelle Therapie', nummer: '21201', tage: [2, 4], zeit: '09:00' },
    { vorname: 'Petra', nachname: 'Rundlich', anrede: 'Frau', geboren: '1980-11-11', einheiten: 6, massnahme: 'Klassische Massagetherapie', nummer: '20106', tage: [1, 3, 5], zeit: '13:00' },
    { vorname: 'Quirin', nachname: 'Tagesgast', anrede: 'Herr', geboren: '1990-05-21', einheiten: 12, massnahme: 'Manuelle Therapie', nummer: '21201', tage: [1, 2, 4], zeit: '15:30' },
    { vorname: 'Rosa', nachname: 'Lymph', anrede: 'Frau', geboren: '1955-09-09', einheiten: 6, massnahme: 'Manuelle Lymphdrainage 45 Min.', nummer: '20201', tage: [2, 5], zeit: '11:00' },
    { vorname: 'Sven', nachname: 'Kraft', anrede: 'Herr', geboren: '1988-03-03', einheiten: 12, massnahme: 'Krankengymnastik', nummer: '20501', tage: [3, 5], zeit: '16:30' },
  ];
  const ids: string[] = [];
  const rezepte: string[] = [];
  for (const [i, p] of SECHS.entries()) {
    const nr = String(21 + i).padStart(3, '0');
    const id = await patientAnlegen(db, t, {
      patientennummer: `T-${1021 + i}`, anrede: p.anrede, vorname: p.vorname, nachname: p.nachname, geburtsdatum: p.geboren, patientSeit: tag(-10 - i),
      kontakte: [{ art: 'mobil', wert: `030 23125 ${nr}` }, { art: 'whatsapp', wert: `030 23125 ${nr}` }, { art: 'email', wert: o.adresse }],
      adresse: { bezeichnung: 'Zuhause', zusatz: null, strasse: 'Hauptstraße', hausnummer: String(10 + i), plz: '86825', ort: 'Bad Wörishofen' },
    }, wer);
    ids.push(id);
    await adresseSpeichern(db, id, { bezeichnung: 'Arbeit', strasse: 'Gewerbering', hausnummer: String(2 + i), plz: '87719', ort: 'Mindelheim' }, wer, { ohneProtokoll: true });
    await adresseSpeichern(db, id, { bezeichnung: i % 2 ? 'Ferienwohnung' : 'Eltern', strasse: 'Seeweg', hausnummer: String(i + 1), plz: '87700', ort: 'Memmingen' }, wer, { ohneProtokoll: true });
    // Die zweite Hälfte rechnet nach der Tagesgast-Liste
    if (i >= 3 && tagesgast) await db.query('UPDATE patient SET preisliste_id = $2 WHERE id = $1', [id, tagesgast]);
    await db.query("INSERT INTO patient_versicherung (patient_id, art, versicherer, tarif) VALUES ($1, $2, $3, $4)", [id, i % 3 === 0 ? 'beihilfe' : 'pkv', i % 3 === 0 ? 'Beihilfe Bayern + PKV' : ['Allianz (erfunden)', 'DKV (erfunden)'][i % 2], i % 3 === 0 ? '50 % Beihilfe' : 'Tarif Privat']);
    await erklaerungErfassen(db, t, id, { art: 'datenschutzinformation', form: 'schriftlich', am: tag(-10 - i), fassung: 'Datenschutzinformation 2026-01' }, wer);
    const fall = await fallAnlegen(db, t, id, { grundlage: 'verordnung', bezeichnung: ['Rücken', 'Schulter links', 'Nacken', 'Knie rechts', 'Lymphödem Bein', 'Hüfte'][i], anlass: 'Beschwerden laut Verordnung (erfunden)', begonnenAm: tag(-5), phase: 'aufnahme' }, wer);
    await erklaerungErfassen(db, t, id, { fallId: fall, art: 'behandlungseinwilligung', form: 'schriftlich', am: tag(-5), inhalt: `${p.massnahme} laut Verordnung` }, wer);
    const rezept = await verordnungAnlegen(db, t, id, {
      ausgestelltAm: tag(-7), arzt: 'Dr. med. Erika Beispielarzt, Orthopädie Bad Wörishofen', massnahme: p.massnahme, leistungNummer: p.nummer, anzahl: p.einheiten,
      frequenz: `${p.tage.length}× pro Woche`, diagnose: ['M54.5', 'M75.4', 'M54.2', 'M23.2', 'I89.0', 'M16.1'][i], fallId: fall,
    }, wer);
    rezepte.push(rezept);
    termine += (await termineVerteilen(db, id, rezept, fall, p.einheiten, p.tage, p.zeit, 1 + i, p.nummer === '20201' ? 45 : 30, wer)).length;
    if (bankbaustein) {
      const re = (await db.query<{ id: string }>('SELECT id::text FROM rechnung WHERE verordnung_id = $1', [rezept])).rows[0];
      if (re && !(await db.query('SELECT 1 FROM rechnung_textbaustein WHERE rechnung_id = $1 AND textbaustein_id = $2', [re.id, bankbaustein.id])).rows.length) await bausteinHinzufuegen(db, id, re.id, bankbaustein.id, wer);
    }
    await verlaufEintragen(db, t, id, { art: ['anruf_eingehend', 'email', 'whatsapp', 'persoenlich', 'sms', 'brief'][i]!, grund: ['terminvereinbarung', 'rueckfrage_rechnung', 'terminverschiebung', 'rueckfrage_behandlung', 'erinnerung', 'sonstiges'][i], notiz: 'Erfundener Kontakt' }, wer);
  }
  // Oskar: zwei Termine abgesagt bzw. nicht erschienen; Petra: Zweitschrift; Sven: Korrektur 12 → 10; Rosa: offener Anruf; Nora: Storno einer zweiten Rechnung
  const oskarTermine = (await db.query<{ id: string }>('SELECT id::text FROM termin WHERE patient_id = $1 ORDER BY beginn', [ids[1]])).rows;
  if (oskarTermine[0]) await terminStatus(db, ids[1]!, oskarTermine[0].id, 'abgesagt_patient', wer);
  if (oskarTermine[1]) await terminStatus(db, ids[1]!, oskarTermine[1].id, 'nicht_erschienen', wer);
  await zweitschriftVermerken(db, ids[2]!, rezepte[2]!, tag(-2), wer);
  await verordnungAnlegen(db, t, ids[5]!, { ausgestelltAm: tag(-3), arzt: 'Dr. med. Erika Beispielarzt, Orthopädie Bad Wörishofen', massnahme: 'Krankengymnastik', leistungNummer: '20501', anzahl: 10, art: 'korrektur', vorgaengerId: rezepte[5], notiz: 'Anzahl berichtigt: 10 statt 12' }, wer);
  await anrufBeginnen(db, ids[4]!, (await db.query<{ id: string }>("SELECT id::text FROM patient_kontakt WHERE patient_id = $1 AND art = 'mobil'", [ids[4]])).rows[0]?.id, wer);
  {
    const { rechnungAnlegen } = await import('./rechnungen.ts');
    const zweite = await rechnungAnlegen(db, ids[0]!, { steuerklasse: 'heilbehandlung_steuerfrei', art: 'einzel', notiz: 'Versehentlich angelegt' }, wer);
    await rechnungStatus(db, ids[0]!, zweite, 'storno', { grund: 'Doppelt angelegt (erfunden)' }, wer);
  }

  // ── Pinnwand: je Phase ein Fall, Rechnungen in jedem Status ──
  const phasen = async (nr: number, vorname: string, nachname: string, geboren: string): Promise<string> => {
    const n = String(nr).padStart(3, '0');
    const id = await patientAnlegen(db, t, {
      patientennummer: `T-1${n}`, anrede: 'Frau', vorname, nachname, geburtsdatum: geboren, patientSeit: tag(-60),
      kontakte: [{ art: 'mobil', wert: `030 23125 ${n}` }, { art: 'email', wert: o.adresse }],
      adresse: { bezeichnung: 'Zuhause', zusatz: null, strasse: 'Kurallee', hausnummer: String(nr), plz: '86825', ort: 'Bad Wörishofen' },
    }, wer);
    await erklaerungErfassen(db, t, id, { art: 'datenschutzinformation', form: 'schriftlich', am: tag(-60), fassung: 'Datenschutzinformation 2026-01' }, wer);
    return id;
  };
  // Anfrage: Kind mit Eltern als Vertragspartner und Rechnungsempfängerin
  const kind = await phasen(27, 'Lea', 'Anfrage', '2016-06-06');
  await db.query("INSERT INTO patient_bezugsperson (patient_id, rolle, name, beziehung, berechtigungsgrund, telefon, strasse, plz, ort) VALUES ($1, 'vertragspartner', 'Sabine Anfrage', 'Mutter', 'Sorgerecht', '030 23125 927', 'Kurallee', '86825', 'Bad Wörishofen')", [kind]);
  await db.query("INSERT INTO patient_bezugsperson (patient_id, rolle, name, beziehung, strasse, plz, ort) VALUES ($1, 'rechnungsempfaenger', 'Sabine Anfrage', 'Mutter', 'Kurallee 27', '86825', 'Bad Wörishofen')", [kind]);
  await fallAnlegen(db, t, kind, { grundlage: 'verordnung', bezeichnung: 'Haltung', anlass: 'Mutter bittet um Termin (erfunden)', phase: 'anfrage' }, wer);
  await verlaufEintragen(db, t, kind, { art: 'email', grund: 'terminvereinbarung', notiz: 'Anfrage per Mail, Rückruf vereinbart' }, wer);
  // Anamnese-Phase: Termin, Einwilligung, Rezept – Anamnese fehlt noch
  const anam = await phasen(28, 'Mia', 'Anamnese', '1999-01-20');
  {
    const fall = await fallAnlegen(db, t, anam, { grundlage: 'verordnung', bezeichnung: 'Sprunggelenk', phase: 'aufnahme' }, wer);
    await erklaerungErfassen(db, t, anam, { fallId: fall, art: 'behandlungseinwilligung', form: 'schriftlich', am: tag(-1) }, wer);
    const rezept = await verordnungAnlegen(db, t, anam, { ausgestelltAm: tag(-2), arzt: 'Dr. med. Karl Musterarzt, Allgemeinmedizin', massnahme: 'Krankengymnastik', leistungNummer: '20501', anzahl: 6, fallId: fall }, wer);
    termine += (await termineVerteilen(db, anam, rezept, fall, 6, [1, 4], '10:00', 2, 30, wer)).length;
    await phaseSetzen(db, anam, fall, 'anamnese', wer);
  }
  // Befund-Phase: Anamnese da, Eingangsbefund fehlt
  const bef = await phasen(29, 'Nina', 'Befund', '1983-04-12');
  {
    const fall = await fallAnlegen(db, t, bef, { grundlage: 'verordnung', bezeichnung: 'LWS', phase: 'aufnahme' }, wer);
    await erklaerungErfassen(db, t, bef, { fallId: fall, art: 'behandlungseinwilligung', form: 'schriftlich', am: tag(-3) }, wer);
    const rezept = await verordnungAnlegen(db, t, bef, { ausgestelltAm: tag(-4), arzt: 'Dr. med. Karl Musterarzt, Allgemeinmedizin', massnahme: 'Manuelle Therapie', leistungNummer: '21201', anzahl: 6, fallId: fall }, wer);
    termine += (await termineVerteilen(db, bef, rezept, fall, 6, [2, 5], '08:30', 1, 30, wer)).length;
    await phaseSetzen(db, bef, fall, 'anamnese', wer);
    await anamneseErfassen(db, t, bef, fall, { art: 'online', beschwerden: 'Schmerzen im unteren Rücken beim Sitzen (erfunden)', vorgeschichte: 'Bandscheibenvorfall 2020' }, wer);
  }
  // Abschluss-Phase: 6er-Rezept voll abgehakt, Rechnung „Fertig – wartet auf Lexware“
  const abs = await phasen(30, 'Olga', 'Abschluss', '1960-10-10');
  {
    const fall = await fallAnlegen(db, t, abs, { grundlage: 'verordnung', bezeichnung: 'Schulter rechts', phase: 'aufnahme', begonnenAm: tag(-40) }, wer);
    await erklaerungErfassen(db, t, abs, { fallId: fall, art: 'behandlungseinwilligung', form: 'schriftlich', am: tag(-40) }, wer);
    const rezept = await verordnungAnlegen(db, t, abs, { ausgestelltAm: tag(-42), arzt: 'Dr. med. Erika Beispielarzt, Orthopädie Bad Wörishofen', massnahme: 'Manuelle Therapie', leistungNummer: '21201', anzahl: 6, fallId: fall }, wer);
    await phaseSetzen(db, abs, fall, 'anamnese', wer);
    await anamneseErfassen(db, t, abs, fall, { art: 'gespraech', beschwerden: 'Schulter eingeschränkt (erfunden)' }, wer);
    await befundErfassen(db, t, abs, fall, { art: 'eingang', text: 'Abduktion 90°, Schmerz NRS 6', messwerte: 'ABD 90°' }, wer);
    for (let k = 0; k < 6; k++) {
      const terminId = await terminAnlegen(db, abs, { datum: tag(-38 + k * 5), zeit: '10:00', dauerMin: 30, verordnungId: rezept, fallId: fall }, wer);
      termine++;
      await behandlungErfassen(db, t, abs, { fallId: fall, datum: tag(-38 + k * 5), dauerMin: 30, verordnungId: rezept, terminId, massnahmen: `MT Schulter, Sitzung ${k + 1} (erfunden)`, verlaufWirkung: `NRS ${6 - k}/10` }, wer);
    }
    await phaseSetzen(db, abs, fall, 'abschluss', wer);
    const re = (await db.query<{ id: string }>('SELECT id::text FROM rechnung WHERE verordnung_id = $1', [rezept])).rows[0]!.id;
    await rechnungStatus(db, abs, re, 'fertig', {}, wer);
  }
  // Rechnungs-Phase: Abschlussbefund da, Rechnung in Lexware mit Nummer, versendet; Lexware meldet anderen Betrag
  const rech = await phasen(31, 'Paula', 'Rechnung', '1978-12-24');
  {
    const fall = await fallAnlegen(db, t, rech, { grundlage: 'verordnung', bezeichnung: 'Knie links', phase: 'aufnahme', begonnenAm: tag(-50) }, wer);
    await erklaerungErfassen(db, t, rech, { fallId: fall, art: 'behandlungseinwilligung', form: 'schriftlich', am: tag(-50) }, wer);
    const rezept = await verordnungAnlegen(db, t, rech, { ausgestelltAm: tag(-52), arzt: 'Dr. med. Erika Beispielarzt, Orthopädie Bad Wörishofen', massnahme: 'Krankengymnastik', leistungNummer: '20501', anzahl: 6, fallId: fall }, wer);
    await phaseSetzen(db, rech, fall, 'anamnese', wer);
    await anamneseErfassen(db, t, rech, fall, { art: 'tablet', beschwerden: 'Knie instabil nach Sturz (erfunden)' }, wer);
    await befundErfassen(db, t, rech, fall, { art: 'eingang', text: 'Flexion 100°, Erguss' }, wer);
    for (let k = 0; k < 6; k++) {
      const terminId = await terminAnlegen(db, rech, { datum: tag(-48 + k * 4), zeit: '14:00', dauerMin: 30, verordnungId: rezept, fallId: fall }, wer);
      termine++;
      await behandlungErfassen(db, t, rech, { fallId: fall, datum: tag(-48 + k * 4), dauerMin: 30, verordnungId: rezept, terminId, massnahmen: `KG Knie, Sitzung ${k + 1} (erfunden)` }, wer);
    }
    await phaseSetzen(db, rech, fall, 'abschluss', wer);
    await befundErfassen(db, t, rech, fall, { art: 'abschluss', text: 'Volle Beweglichkeit, Ziele erreicht (erfunden)' }, wer);
    const re = (await db.query<{ id: string }>('SELECT id::text FROM rechnung WHERE verordnung_id = $1', [rezept])).rows[0]!.id;
    await rechnungStatus(db, rech, re, 'fertig', {}, wer);
    await rechnungStatus(db, rech, re, 'in_lexware', { nummer: 'RE-2026-0101', datum: tag(-20) }, wer);
    const betrag = Number((await db.query<{ b: string }>('SELECT betrag::text AS b FROM rechnung WHERE id = $1', [re])).rows[0]!.b);
    await lexwareStandUebernehmen(db, t, re, { invoiceId: 'lx-test-101', nummer: 'RE-2026-0101', status: 'open', betrag: betrag + 5 }, wer);
  }
  // Nachsorge: Rechnung bezahlt (von Lexware gemeldet), Fall in Nachsorge; dazu ein archivierter Fall und ein archivierter Patient
  const nach = await phasen(32, 'Rita', 'Nachsorge', '1970-02-02');
  {
    const fall = await fallAnlegen(db, t, nach, { grundlage: 'verordnung', bezeichnung: 'HWS', phase: 'aufnahme', begonnenAm: tag(-90) }, wer);
    await erklaerungErfassen(db, t, nach, { fallId: fall, art: 'behandlungseinwilligung', form: 'schriftlich', am: tag(-90) }, wer);
    const rezept = await verordnungAnlegen(db, t, nach, { ausgestelltAm: tag(-92), arzt: 'Dr. med. Karl Musterarzt, Allgemeinmedizin', massnahme: 'Manuelle Therapie', leistungNummer: '21201', anzahl: 6, fallId: fall }, wer);
    await phaseSetzen(db, nach, fall, 'anamnese', wer);
    await anamneseErfassen(db, t, nach, fall, { art: 'gespraech', beschwerden: 'Nackenverspannung (erfunden)' }, wer);
    await befundErfassen(db, t, nach, fall, { art: 'eingang', text: 'Rotation eingeschränkt' }, wer);
    for (let k = 0; k < 6; k++) {
      const terminId = await terminAnlegen(db, nach, { datum: tag(-88 + k * 4), zeit: '09:30', dauerMin: 30, verordnungId: rezept, fallId: fall }, wer);
      termine++;
      await behandlungErfassen(db, t, nach, { fallId: fall, datum: tag(-88 + k * 4), dauerMin: 30, verordnungId: rezept, terminId, massnahmen: `MT HWS, Sitzung ${k + 1} (erfunden)` }, wer);
    }
    await phaseSetzen(db, nach, fall, 'abschluss', wer);
    await befundErfassen(db, t, nach, fall, { art: 'abschluss', text: 'Beschwerdefrei' }, wer);
    const re = (await db.query<{ id: string }>('SELECT id::text FROM rechnung WHERE verordnung_id = $1', [rezept])).rows[0]!.id;
    await rechnungStatus(db, nach, re, 'fertig', {}, wer);
    await rechnungStatus(db, nach, re, 'in_lexware', { nummer: 'RE-2026-0077', datum: tag(-55) }, wer);
    await rechnungStatus(db, nach, re, 'versendet', { versandArt: 'post' }, wer);
    const betrag = Number((await db.query<{ b: string }>('SELECT betrag::text AS b FROM rechnung WHERE id = $1', [re])).rows[0]!.b);
    await lexwareStandUebernehmen(db, t, re, { invoiceId: 'lx-test-077', nummer: 'RE-2026-0077', status: 'paid', betrag, bezahltAm: tag(-40) }, wer);
    await phaseSetzen(db, nach, fall, 'nachsorge', wer);
    // Ein früherer, archivierter Fall derselben Patientin (Wellness-Serie, abgeschlossen)
    const wl = (await db.query<{ id: string }>('SELECT id::text FROM wellness_leistung WHERE aktiv ORDER BY id LIMIT 1')).rows[0]?.id
      ?? (await wellnessSpeichern(db, { code: 'WM45', bezeichnung: 'Wellnessmassage 45 Minuten', dauerMin: 45, preis: '59,00' }, wer));
    const alt = await fallAnlegen(db, t, nach, { grundlage: 'praevention', wellnessLeistungId: wl, begonnenAm: tag(-200) }, wer);
    await behandlungErfassen(db, t, nach, { fallId: alt, datum: tag(-200), dauerMin: 45, massnahmen: 'Wellnessmassage (erfunden)' }, wer);
    const wre = (await db.query<{ id: string }>('SELECT id::text FROM rechnung WHERE fall_id = $1', [alt])).rows[0]!.id;
    await rechnungStatus(db, nach, wre, 'fertig', {}, wer);
    await rechnungStatus(db, nach, wre, 'in_lexware', { nummer: 'RE-2026-0012', datum: tag(-195) }, wer);
    await rechnungStatus(db, nach, wre, 'versendet', { versandArt: 'email' }, wer);
    await rechnungStatus(db, nach, wre, 'bezahlt', { datum: tag(-180) }, wer);
    await phaseSetzen(db, nach, alt, 'archiviert', wer, 'Serie beendet (erfunden)');
  }
  // Archivierter Patient und eine Direktzugangs-Serie mit abgebrochenem Rezept
  const archiv = await phasen(33, 'Uta', 'Archiviert', '1950-05-05');
  await statusSetzen(db, archiv, 'archiviert', wer);
  const direkt = await phasen(34, 'Vera', 'Direktzugang', '1992-08-18');
  {
    await erklaerungErfassen(db, t, direkt, { art: 'kosteninformation', form: 'textform', am: tag(-6), inhalt: 'Kosteninformation per Mail (erfunden)' }, wer);
    await fallAnlegen(db, t, direkt, { grundlage: 'direktzugang', bezeichnung: 'Verspannung nach Sport', anlass: 'ohne Verordnung, sektorale HP-Erlaubnis (erfunden)', begonnenAm: tag(-6) }, wer);
    const fall2 = await fallAnlegen(db, t, direkt, { grundlage: 'verordnung', bezeichnung: 'Altes Rezept', begonnenAm: tag(-120), phase: 'behandlung' }, wer);
    const rezept = await verordnungAnlegen(db, t, direkt, { ausgestelltAm: tag(-122), massnahme: 'Krankengymnastik', leistungNummer: '20501', anzahl: 10, fallId: fall2 }, wer);
    await behandlungErfassen(db, t, direkt, { fallId: fall2, datum: tag(-118), verordnungId: rezept, massnahmen: 'KG (erfunden)' }, wer);
    await verordnungAbbrechen(db, direkt, rezept, 'Patientin verzogen (erfunden)', wer);
    // Die Rechnung über die eine erbrachte Einheit: versendet und überfällig (rote Kachel)
    const abbruchRe = (await db.query<{ id: string }>('SELECT id::text FROM rechnung WHERE verordnung_id = $1', [rezept])).rows[0]!.id;
    await db.query('DELETE FROM rechnung_position WHERE rechnung_id = $1 AND behandlung_leistung_id IS NULL', [abbruchRe]);
    await rechnungStatus(db, direkt, abbruchRe, 'fertig', {}, wer);
    await rechnungStatus(db, direkt, abbruchRe, 'in_lexware', { nummer: 'RE-2026-0050', datum: tag(-40) }, wer);
    await rechnungStatus(db, direkt, abbruchRe, 'versendet', { versandArt: 'post' }, wer);
    await db.query('UPDATE rechnung SET gemahnt_am = $2 WHERE id = $1', [abbruchRe, tag(-10)]);
    await kontaktSpeichern(db, direkt, { art: 'telefon', wert: '030 23125 934', bezeichnung: 'Arbeit' }, wer, { ohneProtokoll: true });
  }
  const rechnungen = Number((await db.query<{ n: string }>("SELECT count(*)::text AS n FROM rechnung WHERE patient_id IN (SELECT id FROM patient WHERE patientennummer >= 'T-1021')")).rows[0]!.n);
  return { uebersprungen: false, preislisten, patienten: 14, termine, rechnungen };
}
