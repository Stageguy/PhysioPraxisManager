/** Erklärungen (Rechtsklick-Hilfe): Rückmeldungen (W72) – Teil von src/web/hilfe.ts (A32) */
import { NICHTS, KEIN_RUECKWEG, AUSKUNFT, type HilfeEintrag } from './basis.ts';

export const RUECKMELDUNGEN: Record<string, HilfeEintrag> = {
  'rueckmeldungen.eintrag': { seite: 'Rückmeldungen', titel: 'Rückmeldung',
    loest_aus: AUSKUNFT, bezug: 'Was über das kleine Fähnchen gemeldet wurde: Hinweis oder Fehler, Seite und Element, Screenshot, Text, Fassung, Browser.',
    aendert: NICHTS, ergebnis: 'Offene zuerst; erledigte blass.', rueckweg: KEIN_RUECKWEG },
  'rueckmeldungen.bild': { seite: 'Rückmeldungen', titel: 'Screenshot',
    loest_aus: 'Öffnet den Screenshot in voller Größe.', bezug: 'Der Kasten, in dem das gemeldete Element lag, so wie der Browser ihn beim Melden sah.', aendert: NICHTS, ergebnis: 'Das Bild in einem neuen Tab.', rueckweg: 'Tab schließen.' },
  'rueckmeldungen.erledigt': { seite: 'Rückmeldungen', titel: 'Erledigt',
    loest_aus: 'Markiert die Rückmeldung als erledigt, mit optionaler Antwort.', bezug: 'Eine offene Rückmeldung.', aendert: 'Status, Zeitpunkt, wer; die Antwort steht darunter.', ergebnis: 'Verschwindet aus „offen“.', rueckweg: '„Wieder öffnen“ unter „erledigt“ oder „alle“.' },
  'rueckmeldungen.offen': { seite: 'Rückmeldungen', titel: 'Wieder öffnen',
    loest_aus: 'Setzt die Rückmeldung zurück auf offen.', bezug: 'Eine erledigte Rückmeldung.', aendert: 'Status.', ergebnis: 'Steht wieder unter „offen“.', rueckweg: '„Erledigt“.' },
  'rueckmeldungen.filter': { seite: 'Rückmeldungen', titel: 'Stand',
    loest_aus: 'Zeigt offene, erledigte oder alle Rückmeldungen.', bezug: 'Die Entwicklungs-Datenbank.', aendert: NICHTS, ergebnis: 'Die Liste darunter.', rueckweg: 'Zurückschalten.' },
};
