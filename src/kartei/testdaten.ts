/**
 * Erfundene Patienten für die Testumgebung (A09e). Nutzt dieselben Funktionen wie die Oberfläche,
 * damit die Testdaten genau so aussehen wie echte Eingaben. Niemand hier existiert; Mailadressen
 * sind Plus-Varianten der Testadresse, Telefonnummern aus dem Fernsehblock (030) 23125 xxx.
 */
import type { Db } from '../db/index.ts';
import type { Tresor } from '../tresor.ts';
import { anrufBeginnen, behandlungErfassen, patientAnlegen, terminAnlegen, verlaufEintragen, verordnungAnlegen, type Kontaktart } from './patienten.ts';

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

export async function testdatenAnlegen(db: Db, t: Tresor, o: { adresse: string; wer: string }): Promise<{ uebersprungen: boolean; patienten: number; behandlungen: number; termine: number; rechnungen: number }> {
  if ((await db.query("SELECT 1 FROM patient WHERE patientennummer = 'T-1001'")).rows.length) return { uebersprungen: true, patienten: 0, behandlungen: 0, termine: 0, rechnungen: 0 };
  const [lokal, domain] = o.adresse.split('@');
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

    // Kontaktverlauf: ein paar Gespräche, bei Anna ein offener Anruf
    await verlaufEintragen(db, t, id, { art: 'anruf_eingehend', grund: 'terminvereinbarung', notiz: 'Erstkontakt, Termin vereinbart (erfunden)' }, wer);
    if (i % 2 === 1) await verlaufEintragen(db, t, id, { art: 'whatsapp', grund: 'terminverschiebung', notiz: 'Bittet um späteren Termin' }, wer);
    if (i === 0) await anrufBeginnen(db, id, (await db.query<{ id: string }>("SELECT id::text FROM patient_kontakt WHERE patient_id = $1 AND art = 'mobil'", [id])).rows[0]?.id, wer);
  }
  return { uebersprungen: false, patienten: PERSONEN.length, behandlungen, termine, rechnungen };
}
