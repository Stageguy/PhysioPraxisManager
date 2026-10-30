/** Erklärungen (Rechtsklick-Hilfe): Menü – Teil von src/web/hilfe.ts (A32) */
import { NICHTS, KEIN_RUECKWEG, type HilfeEintrag } from './basis.ts';

export const MENUE: Record<string, HilfeEintrag> = {
  'menue.cockpit': { seite: 'Menü', titel: 'Cockpit',
    loest_aus: 'Öffnet die Startseite der Praxis-Assistenz.', bezug: 'Alles, was heute ansteht: Termine, Rechnungen, Anfragen, Änderungen.',
    aendert: NICHTS, ergebnis: 'Links Finanzen und Patienten mit ihren Seiten, rechts die Übersicht, unten was sich in der letzten Woche geändert hat.',
    rueckweg: KEIN_RUECKWEG },
  'menue.patienten': { seite: 'Menü', titel: 'Patienten',
    loest_aus: 'Öffnet die Patientenkartei.', bezug: 'Alle aktiven Patienten als Kacheln – mit Telefon, WhatsApp, Mail, letzter Behandlung und nächstem Termin.',
    aendert: NICHTS, ergebnis: 'Die Liste der Patienten; oben Suche, „Neu“ und Archiv.', rueckweg: KEIN_RUECKWEG },
  'menue.status': { seite: 'Menü', titel: 'Status',
    loest_aus: 'Öffnet die Statusseite.', bezug: 'Die Verbindung der Praxis-Assistenz zu Microsoft 365 (praxis@lilli-nebel.de).',
    aendert: NICHTS, ergebnis: 'Ob Postfach, Kalender und OneDrive erreichbar sind – mit ✓ oder ✗.', rueckweg: KEIN_RUECKWEG },
  'menue.hilfe': { seite: 'Menü', titel: 'Hilfe',
    loest_aus: 'Öffnet alle Erklärungen am Stück – dieselben, die der Rechtsklick zeigt.', bezug: 'Die ganze Praxis-Assistenz.',
    aendert: NICHTS, ergebnis: 'Wie der Rechnungseingang arbeitet, was die Outlook-Kategorien bedeuten, was heute geht und was später kommt.',
    rueckweg: KEIN_RUECKWEG },
};
