/** Erklärungen (Rechtsklick-Hilfe): Testumgebung – Teil von src/web/hilfe.ts (A32) */
import { NICHTS, KEIN_RUECKWEG, AUSKUNFT, type HilfeEintrag } from './basis.ts';

export const TESTUMGEBUNG: Record<string, HilfeEintrag> = {
  'umgebung.test': { seite: 'Testumgebung', titel: 'Band „TESTUMGEBUNG“', loest_aus: AUSKUNFT,
    bezug: 'Diese ganze Anwendung: die Testumgebung, in der neue Funktionen vor Lillis Abnahme laufen.',
    aendert: NICHTS,
    ergebnis: 'Hier sind alle Patienten erfunden. Mails gehen nur an Testadressen, Termine nur in den Kalender „Praxis-Test“, Entwürfe tragen die Kategorie „TEST“. Rechnungen, Ablage und Zahlungen verändert nur die echte Praxis-Anwendung.',
    rueckweg: KEIN_RUECKWEG },
};
