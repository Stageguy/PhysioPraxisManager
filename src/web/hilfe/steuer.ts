/** Erklärungen (Rechtsklick-Hilfe): Steuerfreie Umsätze (W85) – Teil von src/web/hilfe.ts (A32) */
import { NICHTS, KEIN_RUECKWEG, AUSKUNFT, type HilfeEintrag } from './basis.ts';

export const STEUER: Record<string, HilfeEintrag> = {
  'rechnungen.steuerfrei': { seite: 'Rechnungs-Dashboard', titel: 'Steuerfreie Umsätze (Finanzamt)',
    loest_aus: 'Öffnet die Liste aller gestellten Rechnungen ohne Umsatzsteuer.', bezug: 'Heilbehandlung (§ 4 Nr. 14 UStG) und Kleinunternehmer (§ 19 UStG) – mit Nummer, Positionen und Beträgen; Entwürfe fehlen, stornierte stehen grau dabei.',
    aendert: NICHTS, ergebnis: 'Die Liste je Jahr, Namen maskiert.', rueckweg: KEIN_RUECKWEG },
  'steuer.jahr': { seite: 'Steuerfreie Umsätze', titel: 'Jahr', loest_aus: 'Wechselt das Jahr (nach Rechnungsdatum).', bezug: 'Alle Jahre mit gestellten Rechnungen.', aendert: NICHTS, ergebnis: 'Liste und Summen des Jahres.', rueckweg: 'Anderes Jahr wählen.' },
  'steuer.maskiert': { seite: 'Steuerfreie Umsätze', titel: 'Namen maskieren',
    loest_aus: 'Zeigt Vornamen nur mit dem ersten Buchstaben („K**** Zwölfer“) – oder ausgeschrieben.', bezug: 'Name und Honorar unterliegen nicht der Schweigepflicht; das Finanzamt darf sie verlangen. Die Maskierung ist Vorsicht, keine Pflicht. Die Patientennummer bleibt immer als Pseudonym.',
    aendert: 'Nichts – nur die Anzeige und die Exporte.', ergebnis: 'CSV und PDF übernehmen die Einstellung.', rueckweg: 'Haken setzen oder entfernen.' },
  'steuer.csv': { seite: 'Steuerfreie Umsätze', titel: 'CSV (GoBD)',
    loest_aus: 'Lädt die Liste als CSV: eine Zeile je Position, Semikolon, UTF-8 – für Excel, DATEV und Prüfsoftware (Datenzugriff Z3 nach GoBD).', bezug: 'Die angezeigte Liste mit der gewählten Maskierung.',
    aendert: NICHTS, ergebnis: 'Datei steuerfreie-umsaetze-<Jahr>.csv.', rueckweg: KEIN_RUECKWEG },
  'steuer.pdf': { seite: 'Steuerfreie Umsätze', titel: 'PDF',
    loest_aus: 'Erzeugt die Liste als PDF (Querformat) für Steuerberatung oder Ablage.', bezug: 'Die angezeigte Liste mit der gewählten Maskierung.', aendert: NICHTS, ergebnis: 'Das PDF im neuen Tab.', rueckweg: 'Tab schließen.' },
  'steuer.summen': { seite: 'Steuerfreie Umsätze', titel: 'Summen',
    loest_aus: AUSKUNFT, bezug: 'Je Befreiung die Summe der gestellten, nicht stornierten Rechnungen; stornierte daneben, nicht gezählt. Das sind die Beträge für die Umsatzsteuererklärung (Kz. steuerfreie Umsätze) – ELSTER nimmt keine Listen, nur Summen.',
    aendert: NICHTS, ergebnis: 'Vier Zahlen.', rueckweg: KEIN_RUECKWEG },
  'steuer.rechnung': { seite: 'Steuerfreie Umsätze', titel: 'Rechnung in der Liste',
    loest_aus: AUSKUNFT, bezug: 'Nummer, Datum, Befreiung, Patient (Nummer + Name), alle Positionen mit Leistungsdatum, Nummer, Leistung, Anzahl × Preis, Rechnungsbetrag, Zahldatum.', aendert: NICHTS, ergebnis: 'Grau = storniert.', rueckweg: KEIN_RUECKWEG },
};
