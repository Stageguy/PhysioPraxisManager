/**
 * Erfundene Patienten für die Testumgebung (A09e). Nutzt dieselben Funktionen wie die Oberfläche,
 * damit die Testdaten genau so aussehen wie echte Eingaben. Niemand hier existiert; Mailadressen
 * sind Plus-Varianten der Testadresse, Telefonnummern aus dem Fernsehblock (030) 23125 xxx.
 */
import type { Db } from '../db/index.ts';
import type { Tresor } from '../tresor.ts';
import { anrufBeginnen, behandlungErfassen, fallAnlegen, patientAnlegen, terminAnlegen, verlaufEintragen, verordnungAnlegen, wellnessSpeichern, type Kontaktart } from './patienten.ts';
import { anamneseErfassen, befundErfassen, erklaerungErfassen, phaseSetzen } from './pinnwand.ts';

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
      await terminAnlegen(db, id, { datum: tag, zeit: p.zeit, dauerMin: p.dauer, verordnungId: rezept, fallId: fall }, wer);
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
  if (!(await db.query('SELECT 1 FROM preisliste WHERE aktiv')).rows.length) {
    await db.query("UPDATE preisliste SET status = 'freigegeben', aktiv = true, freigegeben_am = COALESCE(freigegeben_am, now()), freigegeben_von = COALESCE(freigegeben_von, $1) WHERE id = (SELECT min(id) FROM preisliste WHERE status <> 'archiviert')", [o.wer]);
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
        await behandlungErfassen(db, t, id, {
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
        await terminAnlegen(db, id, { datum: tag(2 + i + k * 3), zeit: `${String(8 + (i + k) % 9).padStart(2, '0')}:${k ? '30' : '00'}`, dauerMin: 30, verordnungId: offen ? rezept : undefined }, wer);
        termine++;
      }
    } else if (i === 8) {
      await terminAnlegen(db, id, { datum: tag(5), zeit: '15:00', dauerMin: 30, art: 'erstgespraech' }, wer);
      termine++;
    } else {
      // Jonas: Wellness-Serie und eine Behandlung ohne Rezept (Direktzugang)
      const wf = await fallAnlegen(db, t, id, { grundlage: 'praevention', wellnessLeistungId: wellness[1], begonnenAm: tag(-20) }, wer);
      await behandlungErfassen(db, t, id, { fallId: wf, datum: tag(-20), dauerMin: 60, massnahmen: 'Wellnessmassage Rücken/Nacken (erfunden)', behandeltVon: 'Lilli' }, wer);
      await behandlungErfassen(db, t, id, { fallId: wf, datum: tag(-6), dauerMin: 60, massnahmen: 'Wellnessmassage Ganzkörper (erfunden)', behandeltVon: 'Lilli' }, wer);
      behandlungen += 2;
      const df = await fallAnlegen(db, t, id, { grundlage: 'direktzugang', bezeichnung: 'Nacken, Verspannung', anlass: 'Verspannung nach Bildschirmarbeit (erfunden)', begonnenAm: tag(-10) }, wer);
      await behandlungErfassen(db, t, id, { fallId: df, datum: tag(-10), dauerMin: 30, leistungNummer: '21201', massnahmen: 'Manuelle Therapie HWS (erfunden)', behandeltVon: 'Lilli' }, wer);
      behandlungen++;
      await terminAnlegen(db, id, { datum: tag(4), zeit: '11:00', dauerMin: 60, fallId: wf }, wer);
      termine++;
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
    // Kontaktverlauf: ein paar Gespräche, bei Anna ein offener Anruf
    await verlaufEintragen(db, t, id, { art: 'anruf_eingehend', grund: 'terminvereinbarung', notiz: 'Erstkontakt, Termin vereinbart (erfunden)' }, wer);
    if (i % 2 === 1) await verlaufEintragen(db, t, id, { art: 'whatsapp', grund: 'terminverschiebung', notiz: 'Bittet um späteren Termin' }, wer);
    if (i === 0) await anrufBeginnen(db, id, (await db.query<{ id: string }>("SELECT id::text FROM patient_kontakt WHERE patient_id = $1 AND art = 'mobil'", [id])).rows[0]?.id, wer);
  }
  return { uebersprungen: false, patienten: PERSONEN.length, behandlungen, termine, rechnungen };
}
