import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { praxisDienst, statusseite } from '../src/server.ts';
import { HILFE, hilfeSeite, hilfeSkript } from '../src/web/hilfe.ts';
import { cockpitSeite } from '../src/web/cockpit.ts';
import { dashboardSeite, rechnungSeite, type KachelRechnung } from '../src/web/rechnungen.ts';
import type { CockpitDaten } from '../src/cockpit/daten.ts';
import type { Position, Preisliste, QuelleKurz } from '../src/preise/preislisten.ts';
import { menueStand } from '../src/web/layout.ts';
import { auswahlSeite, detailsSeite, editorSeite, neuSeite, positionSeite, uebersichtSeite } from '../src/web/preislisten.ts';
import { adresseFormularSeite, akteSeite, bearbeitenSeite as patientBearbeitenSeite, behandlungNeuSeite, lexwareKundenSeite, listeSeite, neuSeite as patientNeuSeite, patientSeite, rechnungNeuSeite, rezeptNeuSeite, terminNeuSeite } from '../src/web/patienten.ts';
import type { LexwareKundeStand } from '../src/kartei/lexware-kunden.ts';
import { rezepteSeite, serieNeuSeite, wellnessSeite } from '../src/web/rezepte.ts';
import { rezeptTermineSeite } from '../src/web/rezept-termine.ts';
import { rueckmeldungenSeite } from '../src/web/rueckmeldung.ts';
import { fallNeuSeite, fallSeite, pinnwandSeite } from '../src/web/pinnwand.ts';
import { rechnungSeite as ausgangsrechnungSeite } from '../src/web/rechnung.ts';
import { konfigurationSeite, textbausteinFormularSeite } from '../src/web/konfiguration.ts';
import { kalenderSeite } from '../src/web/kalender.ts';
import { steuerSeite } from '../src/web/steuer.ts';
import { anfrageNeuSeite, anfrageSeite, anfragenSeite } from '../src/web/anfragen.ts';
import { monatSeite, terminAbsagenSeite, terminWahlSeite } from '../src/web/terminplan.ts';
import { terminartenSeite, terminartFormularSeite } from '../src/web/terminarten.ts';
import type { Anfrage } from '../src/anfragen/anfragen.ts';
import type { Karte } from '../src/kartei/pinnwand.ts';
import type { Patient } from '../src/kartei/patienten.ts';

const Q: QuelleKurz = { id: '1', art: 'gkv', titel: 'GKV', version: 'Lesefassung gültig ab 01.01.2026', gueltigAb: '2026-01-01', abgerufenAm: '2026-10-23T03:00:00Z', url: 'https://x' };
const PL = (o: Partial<Preisliste> = {}): Preisliste => ({
  id: '5', name: 'Privat 2026', status: 'entwurf', aktiv: false, standard: false, patienten: 0, nachfolger: null, genutzt: false, erstelltAm: '2026-10-23T10:00:00Z', erstelltVon: 'lilli',
  freigegebenAm: null, freigegebenVon: null, archiviertAm: null, standardFaktor: 1.3, aufrunden: false, notiz: null, gkv: Q, beihilfe: { ...Q, id: '2', art: 'beihilfe', version: 'BBhV Anlage 9' },
  basis: null, vorlage: { id: '1', name: 'GebüTh 15. Auflage' }, positionen: 58, uebernommen: 50, ...o,
});
const PK = { id: '1', art: 'mobil' as const, wert: '0151 1', normiert: '+491511', bezeichnung: null, primaer: true };
const FREIE_TAGE = { jahr: 2026, jahre: [2026, 2027], liste: [{ datum: '2026-11-01', name: 'Allerheiligen', art: 'feiertag' as const, gesperrt: true, quelle: 'Rechner' }, { datum: '2026-12-24', name: 'Weihnachten', art: 'geschlossen' as const, gesperrt: false, quelle: 'hand' }], brueckentage: [{ datum: '2026-05-15', wegen: 'Christi Himmelfahrt', gesperrt: true }] };
const LK_PATIENT = { id: '1', name: 'Anna Test', patientennummer: 'P-1001', status: 'aktiv' };
const LK = (o: Partial<LexwareKundeStand>): LexwareKundeStand => ({
  id: 'lx-1', nummer: '1001', art: 'person', anrede: 'Frau', vorname: 'Anna', nachname: 'Test', firma: null, email: 'a@example.org', telefon: '0151 1',
  adresse: { zusatz: null, strasse: 'Kurpromenade', hausnummer: '3', plz: '86825', ort: 'Bad Wörishofen', land: 'DE' }, notiz: false, archiviert: false, stand: 'neu', patient: null, ...o,
});
const PAT: Patient = {
  id: '1', patientennummer: 'P-1001', status: 'aktiv', anrede: 'Frau', titel: null, vorname: 'Anna', nachname: 'Test', patientSeit: '2026-01-10', ansprache: 'sie/ihr', besonderheiten: 'Hörgerät',
  telefon: PK, whatsapp: { ...PK, id: '2', art: 'whatsapp' }, email: { ...PK, id: '3', art: 'email', wert: 'a@example.org', normiert: 'a@example.org' },
  letzteBehandlung: { id: '5', datum: '2026-10-20', fallId: '1' }, naechsterTermin: { id: '7', beginn: '2026-11-02T08:00:00Z', rezept: true }, rechnungsstand: 'gelb', offeneAnrufe: 1,
  geburtsdatum: '1984-03-12', geburtsname: null, sprache: null, kommunikationshilfe: null, berufBelastung: null, notiz: null, abrechnungsmodus: 'pro_serie', zwischenrechnungQuartale: null,
  exchangeKontaktId: null, lexwareKundennummer: null, preisliste: { id: '5', name: 'Privat 2026' }, preislisteGilt: { id: '5', name: 'Privat 2026', standard: true }, rechnungsversand: 'email', kontakte: [PK, { ...PK, id: '4', primaer: false }],
  adressen: [{ id: '1', bezeichnung: 'Zuhause', zusatz: null, strasse: 'Kurpromenade', hausnummer: '3', plz: '86825', ort: 'Bad Wörishofen', land: 'DE', rechnungsadresse: true, typ: 'rechnung' as const }],
  bezugspersonen: [{ id: '1', rolle: 'notfallkontakt', name: 'Max', beziehung: 'Bruder', berechtigungsgrund: null, telefon: null, email: null }], versicherungen: [],
};
const VERORDNUNG = { id: '1', patientId: '1', patientName: 'Anna Test', art: 'erst' as const, langzeit: true, ausgestelltAm: '2026-10-01', gueltigBis: '2026-12-31', massnahme: 'MT', leistungNummer: '21201', frequenz: '2×/Woche',
  anzahlVerordnet: 6, abgehakt: 2, bestaetigt: 1, geplant: 1, status: 'aktiv', arzt: 'Dr. B', fallId: '1', fallNummer: 1, vorgaengerId: null, zweitschriftAm: '2026-10-05', notiz: 'x' };
const SERIE = { id: '2', patientId: '1', patientName: 'Anna Test', nummer: 2, grundlage: 'praevention' as const, bezeichnung: 'Entspannung', wellness: { id: '1', bezeichnung: 'Wellnessmassage 60', preis: 65 }, begonnenAm: '2026-10-01', abgeschlossenAm: null, behandlungen: 2, letzteAm: '2026-10-20' };
const WELLNESS = { id: '1', code: 'WM60', bezeichnung: 'Wellnessmassage 60', dauerMin: 60, preis: 65, aktiv: true };
const TERMIN = { id: '7', beginn: '2026-11-02T08:00:00Z', ende: '2026-11-02T08:30:00Z', art: 'behandlung', status: 'bestaetigt', verordnungId: '1', imKalender: true, behandlungsort: 'hausbesuch' as const, ort: 'Türkheim' };
const RK = { id: '1', art: 'einzel', steuerklasse: 'heilbehandlung_steuerfrei', datum: '2026-10-01', faelligAm: '2026-10-15', nummer: 'R-1', betrag: 46.27, status: 'gesendet', statusText: 'Versendet', statusFarbe: 'preset4', gemahnt: false, positionen: 2, versandArt: 'email', lexwareAbweichung: null,
  quelle: 'ppm' as const, bezahltAm: null, storniertAm: null, dateiName: null, lexwareStatus: null, lexwareInvoiceId: null, zahlungen: [] as { datum: string | null; betrag: number; art: string }[], pdf: false };
const PATIENT_DATEN = {
  patient: PAT, gruende: [{ code: 'absage_patient', bezeichnung: 'Absage Patient' }],
  verlauf: [
    { id: '1', art: 'anruf_ausgehend', am: '2026-10-24T09:00:00Z', grund: null, notiz: null, offen: true, kontakt: { art: 'mobil' as const, wert: '0151 1' }, erfasstVon: 'lilli', link: null },
    { id: '2', art: 'whatsapp', am: '2026-10-23T09:00:00Z', grund: { code: 'absage_patient', bezeichnung: 'Absage Patient' }, notiz: 'krank', offen: false, kontakt: null, erfasstVon: 'lilli', link: null },
    { id: '3', art: 'email', am: '2026-10-22T09:00:00Z', grund: null, notiz: 'Entwurf „Ihr Termin“ im Postfach', offen: false, kontakt: null, erfasstVon: 'lilli', link: 'https://outlook.office.com/owa/x' },
  ],
  dokumente: [{ id: '1', titel: 'Rezept Scan', mime: 'application/pdf', groesse: 1234, art: 'verordnung', datum: '2026-10-01' }],
  whatsapp: [
    { code: 'terminbestaetigung', name: 'Terminbestätigung', link: 'https://wa.me/491511?text=x', terminId: '7' },
    { code: 'rueckruf_bitte', name: 'Bitte um Rückruf', link: 'https://wa.me/491511?text=y' },
  ],
  whatsappCloud: true, lexwareRechnungen: true, lexwareKundeAnlegbar: false,
  lexwareAbgleich: { nummer: '10001', abweichungen: [{ feld: 'email' as const, titel: 'E-Mail', ppm: 'a@example.org', lexware: 'anna@example.org' }, { feld: 'adresse' as const, titel: 'Rechnungsadresse', ppm: null, lexware: 'Kurpromenade 3, 86825 Bad Wörishofen' }] },
  termine: [TERMIN], verordnungen: [VERORDNUNG, { ...VERORDNUNG, id: '3', art: 'korrektur' as const, status: 'ersetzt', vorgaengerId: '1' }], serien: [SERIE, { ...SERIE, id: '4', grundlage: 'direktzugang' as const, wellness: null, abgeschlossenAm: '2026-10-22' }],
  rechnungen: [RK, { ...RK, id: '2', status: 'entwurf', statusText: 'Entwurf', statusFarbe: 'preset10', nummer: null, datum: null, faelligAm: null, lexwareAbweichung: 'in Lexware storniert', pdf: true, steuerklasse: 'wellness_19' },
    { ...RK, id: '3', quelle: 'lexware' as const, pdf: true, dateiName: 'RE-2025-0007.pdf', status: 'bezahlt', statusText: 'Bezahlt', statusFarbe: 'preset19', datum: '2025-03-01', faelligAm: '2025-03-15', bezahltAm: '2025-03-20', lexwareStatus: 'paid', lexwareInvoiceId: 'lx-re-1', zahlungen: [{ datum: '2025-03-20', betrag: 46.27, art: 'Bankumsatz' }], positionen: 0, steuerklasse: '' }],
  preislisten: [PL({ status: 'freigegeben', aktiv: true, standard: true }), PL({ id: '6', name: 'Tagesgast', status: 'freigegeben', aktiv: true })],
};
const ANFRAGE: Anfrage = {
  id: '1', status: 'neu', quelle: 'website', anliegen: 'termin', eingegangenAm: '2026-10-26T08:00:00Z', absenderName: 'Anna Test', absenderAdresse: 'a@example.org', absenderTelefon: '+491511', betreff: 'Terminanfrage',
  patient: null, vorschlaege: [], terminId: null, graphMessageId: 'm1', conversationId: 'c1', text: 'Dienstag vormittags wäre gut', erkannt: { wochentage: [2], tageszeiten: ['vormittag'], daten: ['2026-11-03'], uhrzeiten: ['09:00'] },
  dauerMin: null, leistungNummer: null, antwortWeblink: null, erledigtAm: null, notiz: null, terminart: null,
};
const ANFRAGE_MIT: Anfrage = { ...ANFRAGE, terminart: { id: '1', code: 'P1', kurz: 'Neupatient', sektion: 'rezept', dauerMin: 60 }, id: '2', status: 'vorgeschlagen', patient: { id: '1', name: 'Anna Test', patientennummer: 'P-1001' }, vorschlaege: [{ beginn: '2026-11-03T08:00:00Z', ende: '2026-11-03T08:30:00Z', exchangeEventId: 'e1' }], antwortWeblink: 'https://outlook.office.com/owa/x', dauerMin: 30, notiz: 'Rückruf' };
const ANFRAGE_FERTIG: Anfrage = { ...ANFRAGE_MIT, id: '3', status: 'bestaetigt', terminId: '7' };
const ANFRAGE_BUCHUNG: Anfrage = { ...ANFRAGE_MIT, id: '4', status: 'neu', quelle: 'buchung' };
const RGE = { id: '1', patientId: '1', fallId: '1', verordnungId: '1', art: 'abschlussrechnung', steuerklasse: 'heilbehandlung_steuerfrei' as const, quelle: 'ppm' as const, status: 'entwurf' as const, empfaenger: { name: 'Anna Test', strasse: 'Kurpromenade 3', plz: '86825', ort: 'Bad Wörishofen' },
  preisliste: { id: '5', name: 'Privat 2026' }, zeitraumVon: null, zeitraumBis: null, datum: null, faelligAm: null, nummer: null, netto: 92.54, ust: 0, ustSatz: 0, betrag: 92.54, kleinunternehmer: false, versandArt: null, versendetAm: null, bezahltAm: null, storniertAm: null, stornoGrund: null,
  lexware: { invoiceId: null, status: null, betrag: null, geprueftAm: null, abweichung: null, pdfAm: null, pdfName: null, erstelltAm: null, geaendertAm: null }, notiz: null, erstelltAm: '2026-10-25T10:00:00Z',
  positionen: [{ id: '1', reihenfolge: 1, datum: '2026-10-26', nummer: '21201', bezeichnung: 'Manuelle Therapie', anzahl: 1, einzelpreis: 46.27, betrag: 46.27, verordnungId: '1', terminId: '7', behandlungLeistungId: '3' }, { id: '2', reihenfolge: 2, datum: null, nummer: '21201', bezeichnung: 'Manuelle Therapie', anzahl: 1, einzelpreis: 46.27, betrag: 46.27, verordnungId: '1', terminId: null, behandlungLeistungId: null }],
  zahlungen: [] as { datum: string | null; betrag: number; art: string }[], bausteine: [{ id: '1', code: 'R1', kurzname: 'Steuerfrei – Heilbehandlung', text: '§ 4 Nr. 14', wirkung: 'steuerfrei_heilbehandlung' }] };
const TB = { id: '1', code: 'R1', kurzname: 'Steuerfrei', text: 'x', wirkung: 'steuerfrei_heilbehandlung' as const, automatisch: 'heilbehandlung' as const, aktiv: true };
const RECHNUNG_DATEN = { patient: PAT, rechnung: RGE, lexware: true, postfach: true, girocode: 'data:image/png;base64,iVBORw0KGgo=', textbausteine: [TB, { ...TB, id: '3', code: 'R3', kurzname: 'Dank', wirkung: 'keine' as const, automatisch: 'nie' as const }], preislistePositionen: [{ id: '9', nummer: '21201', bezeichnung: 'MT', preis: 46.27 }], wellness: [WELLNESS], preislisteAktuell: { id: '6', name: 'Tagesgast' } };
const KT = { id: '7', patientId: '1', vorname: 'Anna', nachname: 'Test', patientennummer: 'P-1001', beginn: '2026-10-26T07:00:00Z', ende: '2026-10-26T07:30:00Z', art: 'behandlung', status: 'bestaetigt', rezept: true, imKalender: false, exchangeEventId: null, leistung: 'MT', sektion: 'rezept' as const, behandlungsort: 'hausbesuch' as const, ort: 'Türkheim', adresse: 'Bahnhofstraße 3, 86842 Türkheim', fahrtVorMin: 15, fahrtNachMin: 0 };
const AKTE = { patient: PAT, faelle: [{ id: '1', nummer: 1, grundlage: 'verordnung', phase: 'behandlung', steuerklasse: 'heilbehandlung_steuerfrei', bezeichnung: 'Schulter', anlass: 'Schmerz', diagnoseArzt: 'M75.1', begonnenAm: '2026-10-01', abgeschlossenAm: null,
  behandlungen: [{ id: '5', datum: '2026-10-20', dauerMin: 30, behandeltVon: 'Lilli', status: 'erledigt', bestaetigung: { art: 'unterschrift' as const, zeitpunkt: '2026-10-20T10:30:00Z', werName: null, bild: true }, massnahmen: 'MT', verlaufWirkung: 'besser', reaktionen: null, uebungen: null, leistungen: [{ nummer: '21201', bezeichnung: 'MT', anzahl: 1, einzelpreis: 46.27, verordnungId: '1' }] }] }] };
const TERMINARTEN = [
  { id: '1', code: 'P1', sektion: 'rezept' as const, kurz: 'Neupatient – Erstanamnese und Befund', lang: 'Erster Termin', dauerMin: 60, leistungNummer: null, regelzeit: null, pufferMin: null, aktiv: true },
  { id: '2', code: 'P4', sektion: 'rezept' as const, kurz: 'Krankengymnastik (KG)', lang: null, dauerMin: 30, leistungNummer: '20501', regelzeit: '15 bis 25 Minuten', pufferMin: null, aktiv: false },
  { id: '3', code: 'S1', sektion: 'selbstzahler' as const, kurz: 'Erstbefund ohne Rezept', lang: 'ohne Rezept', dauerMin: 60, leistungNummer: null, regelzeit: null, pufferMin: null, aktiv: true },
  { id: '4', code: 'W1', sektion: 'wellness' as const, kurz: 'Abhyanga – Ganzkörper-Ölmassage', lang: 'Öl', dauerMin: 90, leistungNummer: null, regelzeit: null, pufferMin: null, aktiv: true },
];
const NEU_AKTION = { patient: PAT, faelle: [{ id: '1', nummer: 1, grundlage: 'verordnung', bezeichnung: 'Schulter' }], verordnungen: [VERORDNUNG], alleVerordnungen: [VERORDNUNG], termine: [TERMIN], wellness: [WELLNESS], terminarten: TERMINARTEN };
const KARTE: Karte = { fallId: '1', patientId: '1', patientName: 'Anna Test', patientennummer: 'P-1001', nummer: 1, grundlage: 'verordnung', phase: 'behandlung', bezeichnung: 'Schulter', seitPhase: '2026-10-20T08:00:00Z',
  rezept: { abgehakt: 2, anzahl: 6, status: 'aktiv' }, behandlungen: 2, letzteBehandlung: '2026-10-20', naechsterTermin: '2026-11-02T08:00:00Z', rechnungsstand: 'gelb', warnungen: ['Rechnung überfällig'] };
const SPALTEN = ['anfrage', 'aufnahme', 'anamnese', 'befund_start', 'behandlung', 'abschluss', 'rechnung', 'nachsorge'].map((phase) => ({ phase: phase as Karte['phase'], name: phase, text: 'x', karten: phase === 'behandlung' ? [KARTE, { ...KARTE, fallId: '2', rezept: null, grundlage: 'praevention' as const, rechnungsstand: 'keine' as const, warnungen: [] }] : [] }));
const FALL = { patient: PAT, details: { karte: KARTE, anlass: 'Schmerz', diagnoseArzt: 'M75.1', therapieziele: 'Beweglichkeit', steuerklasse: 'heilbehandlung_steuerfrei', begonnenAm: '2026-10-01', abgeschlossenAm: null,
  anamnese: { id: '1', erhobenAm: '2026-10-01', art: 'gespraech', beschwerden: 'Schulter', vorgeschichte: null, medikamente: 'Ibuprofen', allergien: null, risiken: null, sonstiges: null },
  befunde: [{ id: '1', erhobenAm: '2026-10-02', art: 'eingang', text: 'Flexion 120°', messwerte: 'NRS 6' }],
  erklaerungen: [{ id: '1', art: 'behandlungseinwilligung', am: '2026-10-01', form: 'schriftlich', inhalt: 'MT', fassung: null, gueltigBis: null, widerrufenAm: null, fallId: '1' }, { id: '2', art: 'einwilligung_whatsapp', am: '2026-10-01', form: 'textform', inhalt: null, fassung: 'v1', gueltigBis: null, widerrufenAm: '2026-10-10', fallId: null }],
  phasen: [{ von: 'befund_start' as const, nach: 'behandlung' as const, am: '2026-10-20T08:00:00Z', wer: 'lilli', grund: 'automatisch: Eingangsbefund erfasst' }],
  naechste: [{ phase: 'abschluss' as const, name: 'Abschluss', fehlt: ['Rezept noch nicht abgehakt'] }, { phase: 'rechnung' as const, name: 'Rechnung', fehlt: [] }] },
  verordnungen: [VERORDNUNG], termine: [TERMIN], rechnungen: [RK] };
const RM = { id: '1', art: 'fehler' as const, status: 'offen' as const, seite: '/patienten', element: 'kachel.plus', elementTitel: '„+“', textHtml: '<p>Der Knopf <b>fehlt</b></p>', hatBild: true, fassung: '0.9.0', umgebung: 'test', browser: 'Safari', fenster: '393×852', von: 'lilli', erstelltAm: '2026-10-24T10:00:00Z', erledigtAm: null, erledigtVon: null, antwort: null };

const POS: Position = { id: '9', reihenfolge: 0, nummer: '20501', kuerzel: 'KG', gruppe: 'Krankengymnastik', bezeichnung: 'Allgemeine Krankengymnastik (KG)', regelzeit: '15 bis 25 Minuten',
  gkvPreis: 29.63, beihilfeHoechstbetrag: 29, beihilfeNummer: '4', uebernehmen: true, faktor: 1.35, eigenerPreis: 40, notiz: null };
const QP = { id: '7', nummer: '4', bezeichnung: 'Krankengymnastik (KG)', preis: 29, gruppe: 'Krankengymnastik', daten: {} };
const R = { wer: 'lilli@example.org', fassung: '0.0.0' };

const RE: KachelRechnung = {
  id: '7', eingang: '2026-10-20T08:00:00Z', dateiname: 'Rechnung.pdf', absenderName: 'Telekom', absenderAdresse: 'rechnung@telekom.de',
  lieferant: 'Telekom', rechnungsnummer: 'A1', betrag: 49.95, netto: 41.97, ust: 7.98, ustSatz: '19 %', rechnungsdatum: '2026-10-19', status: 'wartet_freigabe',
  onedrivePfad: 'x/2026/Eingangsrechnungen/a.pdf', onedriveItemId: 'i', onedriveWebUrl: 'https://x', mailId: 'm',
  zurueckgestellt: false, ablehnungsgrund: null, geprueftVon: null, geprueftAm: null, ort: 'Posteingang › Rechnungen',
};
const AUSWERTUNG = { jahr: 2026, monate: [0, 0, 0, 0, 0, 0, 0, 0, 0, 49.95, 0, 0], lieferanten: [{ name: 'Telekom', summe: 49.95 }], summe: 49.95, ohneBetrag: 0, jahre: [2026] };
const ZEILE = { id: '1', eingang: '2026-10-20T08:00:00Z', lieferant: 'Telekom', rechnungsnummer: 'A1', betrag: 49.95, klasse: 'rechnung' as const, status: 'wartet_freigabe', onedrivePfad: 'a/b/c.pdf' };
const STAND = { stand: 'ok' as const, daten: { zaehler: { eingegangen: 1, unklar: 0, angestossen: 0, bezahlt: 0 }, offenerBetrag: 49.95, neueste: [ZEILE] } };
const DATEN: CockpitDaten = {
  fahrt: { art: 'hin', beginn: '2026-11-02T11:45:00Z', bis: '2026-11-02T12:00:00Z', ziel: 'Bahnhofstraße 3, 86842 Türkheim', zielText: 'Hausbesuch H. H. · Türkheim', patientId: '1', jetzt: true },
  schnell: { dauer: 30, buchung: true, vorlage: 'Guten Tag', zeiten: [{ beginn: '2026-11-02T08:45:00Z', ende: '2026-11-02T09:15:00Z', text: 'Mo., 02.11., 09:45 Uhr', link: 'https://b/?dauer=30&zeit=x', direkt: '/kalender/termin?datum=2026-11-02&zeit=09:45&dauer_min=30' }] },
  heute: '2026-10-20', namenZeigen: false, rechnungen: STAND,
  termine: { stand: 'ok', daten: [{ beginn: '09:00', ende: '09:30', ganztags: false, titel: 'M. K.', frei: false, link: '/patienten/1#termine', leistung: 'MT', rezept: true, sektion: 'rezept' as const }, { beginn: '11:00', ende: '12:00', ganztags: false, titel: 'Z. L.', frei: false, hausbesuch: true }] },
  anfragen: { stand: 'ok' as const, daten: { neu: 1, vorgeschlagen: 1, neueste: [ANFRAGE, ANFRAGE_MIT] } },
  protokoll: { stand: 'ok', daten: [{ zeit: '2026-10-20T08:00:00Z', aktion: 'rechnung_abgelegt', objekt: '1', details: { lieferant: 'Telekom' } }] },
};

/** Die Namen, die src/pruefung.ts für seine Prüfpunkte verwendet */
const PRUEFPUNKTE = ['Konto', 'Posteingang', 'Kalender', 'OneDrive', 'Rechte'];

const BLOCK = { outlookId: 'ev-1', beginn: '2026-11-03T08:00:00Z', ende: '2026-11-03T09:00:00Z', webLink: 'https://outlook.example/ev-1', art: 'geblockt' as const, reserviert: false, patientennummer: null, patientId: null };
const TERMIN_DETAIL = { id: '7', beginn: '2026-11-02T08:00:00Z', ende: '2026-11-02T08:30:00Z', art: 'behandlung', status: 'bestaetigt', verordnungId: '1', fallId: '1', terminartId: '1', leistungNummer: null, behandlungsort: 'praxis' as const, adresseId: null, fahrtVorMin: 0, fahrtNachMin: 0, fahrtManuell: false };
const PLAN = {
  jahr: 2026, monat: 11, heute: '2026-11-02', pufferMin: 10, dauerMin: 30, postfach: true, frei: [20, 30, 40, 60].map((dauer) => ({ dauer, anzahl: dauer })),
  tage: Array.from({ length: 30 }, (_, i) => {
    const datum = `2026-11-${String(i + 1).padStart(2, '0')}`;
    const stand = (i === 0 ? 'vergangen' : i === 1 ? 'voll' : i === 2 ? 'teilweise' : i % 7 >= 5 ? 'zu' : 'frei') as 'zu' | 'frei' | 'teilweise' | 'voll' | 'vergangen';
    return { datum, stand, freierTag: i === 0 ? 'Allerheiligen' : null, termine: i === 1 ? Array.from({ length: 7 }, () => KT) : i === 2 ? [KT] : [], bloecke: i === 2 ? [BLOCK] : [], luecken: i === 2 ? [{ beginn: '2026-11-03T09:00:00Z', ende: '2026-11-03T10:00:00Z', minuten: 60 }] : [], oeffnung: [] };
  }),
};
const seiten = () => [
  cockpitSeite({ ...DATEN, freie: [{ tag: '2026-11-02', text: 'Mo., 02.11., 09:00' }] }, { wer: 'lilli@example.org', fassung: '0.0.0', jetzt: '10:00' }),
  monatSeite({ plan: PLAN, suche: { dauer: 30, wochenstart: '2026-11-02', tage: [{ datum: '2026-11-02', zeiten: ['2026-11-02T08:00:00Z'] }, { datum: '2026-11-03', zeiten: [] }] }, woche: '2026-11-02', patient: { id: '1', name: 'Anna Test' }, namenZeigen: false }, R),
  monatSeite({ plan: { ...PLAN, fehler: 'x' }, woche: '2026-11-02', patient: null, namenZeigen: true }, R),
  kalenderSeite({ tag: '2026-11-02', ansicht: 'tag', termine: [KT], namenZeigen: false, heute: '2026-11-02', luecken: [{ beginn: '2026-11-02T09:00:00Z', ende: '2026-11-02T10:00:00Z', minuten: 60 }], patient: { id: '1', name: 'Anna Test' } }, R),
  terminWahlSeite({ patienten: [PAT], terminarten: TERMINARTEN, vorbelegung: { datum: '2026-11-02', zeit: '09:00', dauerMin: 30 } }, R),
  terminAbsagenSeite({ patient: PAT, termin: TERMIN_DETAIL }, R),
  statusseite(PRUEFPUNKTE.map((name) => ({ name, ok: true, text: 'x' })), 'lilli@example.org', '0.0.0'),
  hilfeSeite({ wer: 'lilli@example.org', fassung: '0.0.0' }),
  cockpitSeite(DATEN, { wer: 'lilli@example.org', fassung: '0.0.0', jetzt: '10:00' }),
  dashboardSeite({ stand: STAND, neu: [RE], privat: [{ ...RE, id: '8', status: 'privat' }], auswertung: AUSWERTUNG, liste: [RE],
    filter: { jahr: 2026, stand: 'alle', suche: '' } }, { wer: 'lilli@example.org', fassung: '0.0.0' }),
  rechnungSeite(RE, { wer: 'lilli@example.org', fassung: '0.0.0' }),
  inTest(() => statusseite([], 'christian@example.org', '0.0.0')),
  menueStand.run({ preislistenNeu: 2 }, () => uebersichtSeite({
    neu: [{ id: '1', art: 'gkv', titel: 'GKV', version: 'Lesefassung gültig ab 01.01.2027', abgerufenAm: '2026-12-01T03:00:00Z' }],
    listen: [PL(), PL({ id: '6', status: 'freigegeben', aktiv: true, freigegebenAm: '2026-10-24T10:00:00Z' })],
    stand: { gkv: Q, beihilfe: { ...Q, art: 'beihilfe' }, gebueth: { ...Q, art: 'gebueth', version: '15. Auflage' } },
  }, R)),
  neuSeite({ gkv: [Q], beihilfe: [Q], listen: [PL()], vorlagen: [], vorwahl: {} }, R),
  auswahlSeite([PL()], R),
  auswahlSeite([PL({ status: 'archiviert', archiviertAm: '2026-11-01T00:00:00Z' })], { ...R, titel: 'Archiv', archiv: true }),
  editorSeite(PL(), [POS], { ...R, muster: [{ id: '1', name: 'GebüTh 15. Auflage', standardFaktor: 1.3, aufrunden: true, positionen: {}, notiz: null }],
    abweichung: { muster: { id: '1', name: 'GebüTh 15. Auflage', standardFaktor: 1.3, aufrunden: true, positionen: {}, notiz: null }, unterschiede: 2 } }),
  detailsSeite(PL({ status: 'freigegeben', freigegebenAm: '2026-10-24T10:00:00Z', aktiv: true, patienten: 3 }), [POS], { patienten: [], rechnungen: [] }, { ...R, andere: [PL({ id: '6', name: 'Tagesgast', status: 'freigegeben', aktiv: true, standard: true })] }),
  detailsSeite(PL({ status: 'freigegeben', aktiv: true, standard: true }), [POS], { patienten: [], rechnungen: ['Rechnung 1'] }, R),
  positionSeite(PL(), { position: POS, gkv: { ...QP, id: '3', nummer: '20501', daten: { positionsnummer: 'X0501', originaltext: 'X0501 …' } }, beihilfe: QP, kandidaten: [{ ...QP, passt: 0.8 }] }, R),
  listeSeite({ patienten: [PAT, { ...PAT, id: '2', status: 'archiviert', telefon: null, whatsapp: null, email: null, letzteBehandlung: null, naechsterTermin: null, rechnungsstand: 'rot', offeneAnrufe: 0 }], suche: '', lexware: true }, R),
  listeSeite({ patienten: [], suche: 'x', archiv: true }, R),
  lexwareKundenSeite({ kunden: [LK({}), LK({ id: 'lx-2', nummer: '1002', stand: 'vermutet', patient: LK_PATIENT }), LK({ id: 'lx-3', nummer: '1003', stand: 'verknuepft', art: 'firma', firma: 'Kurhotel GmbH', vorname: '', nachname: 'Kurhotel GmbH', notiz: true, archiviert: true, adresse: null, patient: LK_PATIENT })], stand: '2026-10-27T10:00:00Z', attrappe: true, suche: '' }, R),
  lexwareKundenSeite({ kunden: [], stand: '', attrappe: false, suche: 'x', fehler: 'Lexware ist gerade nicht erreichbar' }, R),
  patientNeuSeite(R),
  patientNeuSeite({ ...R, vorbelegung: { lexwareKundennummer: '1001', lexwareKontaktId: 'lx-1', lexwareName: 'Anna Test', firma: true, anrede: 'Frau', vorname: 'Anna', nachname: 'Test', telefon: '08247 1', strasse: 'Kurpromenade', hausnummer: '3', plz: '86825', ort: 'Bad Wörishofen' } }),
  patientSeite(PATIENT_DATEN, R),
  anfragenSeite({ anfragen: [ANFRAGE, ANFRAGE_MIT, ANFRAGE_FERTIG], filter: 'offen', stand: { neu: 1, vorgeschlagen: 1 }, terminarten: TERMINARTEN }, R),
  terminartenSeite({ terminarten: TERMINARTEN, buchung: { url: 'http://praxis.example:10003', oeffentlich: false } }, R),
  terminartenSeite({ terminarten: TERMINARTEN.map((x) => ({ ...x, aktiv: false })) }, R),
  anfragenSeite({ anfragen: [], filter: 'alle', stand: { neu: 0, vorgeschlagen: 0 }, terminarten: [] }, R),
  anfrageSeite({ anfrage: ANFRAGE, terminarten: TERMINARTEN, patienten: [PAT], regeln: { dauerMin: 30, pufferMin: 0, oeffnungszeiten: 'Mo 08:00-18:00' }, postfach: true }, R),
  anfrageSeite({ anfrage: ANFRAGE_MIT, terminarten: TERMINARTEN, patienten: [], regeln: { dauerMin: 30, pufferMin: 0, oeffnungszeiten: 'Mo 08:00-18:00' }, postfach: false }, R),
  anfrageSeite({ anfrage: ANFRAGE_BUCHUNG, terminarten: TERMINARTEN, patienten: [], regeln: { dauerMin: 30, pufferMin: 0, oeffnungszeiten: 'Mo 08:00-18:00' }, postfach: true }, R),
  anfrageSeite({ anfrage: ANFRAGE_FERTIG, terminarten: [], patienten: [], regeln: { dauerMin: 30, pufferMin: 0, oeffnungszeiten: 'Mo 08:00-18:00' }, postfach: true }, R),
  patientSeite({ ...PATIENT_DATEN, patient: { ...PAT, status: 'archiviert', lexwareKundennummer: null }, lexwareRechnungen: false, lexwareAbgleich: null, lexwareKundeAnlegbar: true }, R),
  akteSeite(AKTE, R),
  terminNeuSeite(NEU_AKTION, R),
  // Ein Formular für Anlegen und Bearbeiten (W115)
  terminNeuSeite(NEU_AKTION, { ...R, termin: TERMIN_DETAIL }),
  patientBearbeitenSeite({ patient: PAT, preislisten: [PL()] }, R),
  patientBearbeitenSeite({ patient: { ...PAT, status: 'archiviert' }, preislisten: [] }, R),
  adresseFormularSeite(PAT, PAT.adressen[0], R),
  adresseFormularSeite(PAT, undefined, R),
  rechnungNeuSeite(PAT, R),
  terminartFormularSeite({ terminart: TERMINARTEN[0], sektion: 'rezept' }, R),
  terminartFormularSeite({ sektion: 'wellness' }, R),
  textbausteinFormularSeite(TB, R),
  textbausteinFormularSeite(undefined, R),
  anfrageNeuSeite({ terminarten: TERMINARTEN }, R),
  rezeptTermineSeite({ patient: PAT, verordnung: VERORDNUNG, geplant: [TERMIN], offen: 3, dauerMin: 25, dauerHerkunft: 'Regelbehandlungszeit 15–25 Min. (MT, Position 21201)', proWoche: 2, frequenzErkannt: true, ab: '2026-11-02', tageszeit: null,
    vorschlaege: [{ beginn: '2026-11-02T07:00:00Z', ende: '2026-11-02T07:25:00Z' }, { beginn: '2026-11-05T07:00:00Z', ende: '2026-11-05T07:25:00Z' }, { beginn: '2026-11-09T07:00:00Z', ende: '2026-11-09T07:25:00Z' }] }, R),
  behandlungNeuSeite(NEU_AKTION, R),
  rezeptNeuSeite(NEU_AKTION, { ...R, vorgaenger: '1' }),
  rezepteSeite({ verordnungen: [VERORDNUNG], serien: [SERIE], filter: 'aktiv' }, R),
  rezepteSeite({ verordnungen: [], serien: [], filter: 'alle' }, R),
  wellnessSeite([WELLNESS, { ...WELLNESS, id: '2', aktiv: false }], R),
  wellnessSeite([], R),
  serieNeuSeite(NEU_AKTION, 'direktzugang', R),
  serieNeuSeite({ ...NEU_AKTION, wellness: [] }, 'praevention', R),
  pinnwandSeite({ spalten: SPALTEN, ansicht: 'horizontal', archiv: false }, R),
  pinnwandSeite({ spalten: SPALTEN, ansicht: 'vertikal', archiv: true }, R),
  fallNeuSeite({ patienten: [PAT], wellness: [WELLNESS] }, R),
  fallSeite(FALL, R),
  fallSeite({ ...FALL, details: { ...FALL.details, anamnese: null, befunde: [], erklaerungen: [], phasen: [] }, verordnungen: [], termine: [], rechnungen: [] }, R),
  ausgangsrechnungSeite(RECHNUNG_DATEN, R),
  ausgangsrechnungSeite({ ...RECHNUNG_DATEN, rechnung: { ...RGE, status: 'freigegeben', steuerklasse: 'wellness_19', ustSatz: 19, ust: 14.77, netto: 77.77, lexware: { ...RGE.lexware, invoiceId: 'lx-1', abweichung: 'Betrag weicht ab', pdfAm: '2026-10-25T10:00:00Z', status: 'open' }, stornoGrund: 'x', storniertAm: '2026-10-25', zeitraumVon: '2026-10-01', zeitraumBis: '2026-10-20' } }, R),
  ausgangsrechnungSeite({ ...RECHNUNG_DATEN, rechnung: { ...RGE, status: 'in_lexware', nummer: 'RE-2026-001' } }, R),
  ausgangsrechnungSeite({ ...RECHNUNG_DATEN, lexware: false, postfach: false, rechnung: { ...RGE, status: 'freigegeben' } }, R),
  ausgangsrechnungSeite({ ...RECHNUNG_DATEN, rechnung: { ...RGE, status: 'gesendet', nummer: 'RE-2026-001' } }, R),
  konfigurationSeite({ freieTage: FREIE_TAGE, regelzeiten: [{ nummer: '20501', bezeichnung: 'Krankengymnastik', vonMin: 15, bisMin: 25, quelle: 'gkv', geaendertAm: '2026-10-28T10:00:00Z' }],textbausteine: [TB, { ...TB, id: '2', code: 'R2', aktiv: false, wirkung: 'kleinunternehmer' as const, automatisch: 'wellness' as const }], einstellungen: { kleinunternehmer: 'ja', ust_satz_wellness: '19' } }, R),
  kalenderSeite({ tag: '2026-10-26', ansicht: 'tag', termine: [KT], namenZeigen: false, heute: '2026-10-26', oeffnungszeiten: [{ tag: 1, von: '08:00', bis: '12:00' }], postfach: true, fehler: 'x',
    bloecke: [{ outlookId: 'ev-1', beginn: '2026-10-26T08:00:00Z', ende: '2026-10-26T09:00:00Z', webLink: 'https://outlook.example/ev-1', art: 'geblockt' as const, reserviert: false, patientennummer: null, patientId: null },
      { outlookId: 'ev-2', beginn: '2026-10-26T09:00:00Z', ende: '2026-10-26T09:30:00Z', webLink: null, art: 'patient' as const, reserviert: false, patientennummer: 'P-1001', patientId: '1' }],freieTage: { '2026-10-26': 'Brückentag (Test)' } }, R),
  kalenderSeite({ tag: '2026-10-26', ansicht: 'woche', termine: [KT, { ...KT, id: '8', rezept: false, imKalender: true, status: 'erledigt', sektion: 'wellness' as const }, { ...KT, id: '9', rezept: false, sektion: null }, { ...KT, id: '10', rezept: false, sektion: 'selbstzahler' as const }], namenZeigen: true, heute: '2026-10-25' }, R),
  steuerSeite({ jahr: 2026, jahre: [2026, 2025], maskiert: true, rechnungen: [{ id: '1', nummer: 'RE-2026-0001', datum: '2026-10-01', status: 'bezahlt', befreiung: '§ 4 Nr. 14 UStG', patientennummer: 'P-1001', name: 'A*** Test', betrag: 92.54, bezahltAm: '2026-10-20', storniertAm: null,
    positionen: [{ datum: '2026-10-01', nummer: '21201', bezeichnung: 'MT', anzahl: 2, einzelpreis: 46.27, betrag: 92.54 }] }, { id: '2', nummer: 'RE-2026-0002', datum: '2026-10-02', status: 'storniert', befreiung: '§ 19 UStG', patientennummer: 'P-1002', name: 'B** Test', betrag: 59, bezahltAm: null, storniertAm: '2026-10-05', positionen: [] }],
    summen: { heilbehandlung: 92.54, kleinunternehmer: 0, storniert: 59, gesamt: 92.54 } }, R),
  steuerSeite({ jahr: 2025, jahre: [2025], maskiert: false, rechnungen: [], summen: { heilbehandlung: 0, kleinunternehmer: 0, storniert: 0, gesamt: 0 } }, R),
  rueckmeldungenSeite({ liste: [RM, { ...RM, id: '2', status: 'erledigt', hatBild: false, antwort: 'behoben', erledigtAm: '2026-10-25T10:00:00Z' }], status: 'alle', offen: 1 }, R),
];
/** Eine Seite einmal in der Testumgebung – dort gibt es das Band */
function inTest<T>(f: () => T): T {
  const vorher = process.env.PRAXIS_UMGEBUNG;
  process.env.PRAXIS_UMGEBUNG = 'test';
  try {
    return f();
  } finally {
    if (vorher === undefined) delete process.env.PRAXIS_UMGEBUNG;
    else process.env.PRAXIS_UMGEBUNG = vorher;
  }
}
const schluessel = (html: string) => [...html.matchAll(/data-hilfe="([^"]+)"/g)].map((m) => m[1]!);

test('jedes Element mit data-hilfe hat eine Erklärung', () => {
  for (const html of seiten()) for (const k of schluessel(html)) assert.ok(HILFE[k], `Erklärung fehlt: ${k}`);
});

test('keine Erklärung ohne Element', () => {
  const benutzt = new Set(seiten().flatMap(schluessel));
  for (const k of Object.keys(HILFE)) assert.ok(benutzt.has(k), `Erklärung ohne Element: ${k}`);
});

test('jede Erklärung beantwortet alle fünf Fragen', () => {
  for (const [k, e] of Object.entries(HILFE)) {
    for (const f of ['loest_aus', 'bezug', 'aendert', 'ergebnis', 'rueckweg'] as const) assert.ok(e[f]?.trim(), `${k}: ${f} fehlt`);
  }
});

test('das Hilfe-Skript ist gültiges JavaScript und bringt die Texte mit', () => {
  const code = hilfeSkript();
  assert.doesNotThrow(() => new Function(code));
  assert.match(code, /"kategorie\.patient"/);
});

test('die Hilfeseite listet jede Erklärung mit Sprungmarke', () => {
  const html = hilfeSeite({ wer: 'x', fassung: '0' });
  for (const k of Object.keys(HILFE)) assert.ok(html.includes(`id="hilfe-${k.replace(/\./g, '-')}"`), k);
  assert.ok(!/<script>/.test(html), 'kein Inline-Skript – die Seite lädt /hilfe.js');
});

test('Dienst: /hilfe und /hilfe.js nur für freigegebene Tailnet-Konten', async () => {
  const dienst = praxisDienst({ erlaubt: ['lilli@example.org'], fassung: 't', angemeldet: async () => true, pruefen: async () => [] });
  await new Promise<void>((fertig) => dienst.listen(0, '127.0.0.1', fertig));
  const basis = `http://127.0.0.1:${(dienst.address() as AddressInfo).port}`;
  try {
    assert.equal((await fetch(`${basis}/hilfe`)).status, 403);
    const h = await fetch(`${basis}/hilfe`, { headers: { 'Tailscale-User-Login': 'lilli@example.org' } });
    assert.equal(h.status, 200);
    assert.match(h.headers.get('content-security-policy') ?? '', /script-src 'self'/);
    const js = await fetch(`${basis}/hilfe.js`, { headers: { 'Tailscale-User-Login': 'lilli@example.org' } });
    assert.match(js.headers.get('content-type') ?? '', /javascript/);
  } finally {
    dienst.close();
  }
});

test('konzept/hilfe-vorschau.html ist aktuell (sonst: npm run hilfe:vorschau -- konzept/hilfe-vorschau.html)', async () => {
  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  const soll = hilfeSeite({ wer: 'Vorschau', fassung: version, skriptInline: hilfeSkript() });
  const ist = await readFile(new URL('../konzept/hilfe-vorschau.html', import.meta.url), 'utf8');
  assert.ok(ist === soll, 'Die Hilfe-Vorschau ist veraltet – npm run hilfe:vorschau -- konzept/hilfe-vorschau.html');
});
