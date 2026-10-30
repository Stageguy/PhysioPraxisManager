/** Erklärungen (Rechtsklick-Hilfe): Status – Teil von src/web/hilfe.ts (A32) */
import { NICHTS, KEIN_RUECKWEG, AUSKUNFT, statuspunkt, type HilfeEintrag } from './basis.ts';

export const STATUS: Record<string, HilfeEintrag> = {
  'status.gesamt': { seite: 'Status', titel: 'Gesamtzustand',
    loest_aus: AUSKUNFT, bezug: 'Alle Prüfpunkte darunter zusammen.', aendert: NICHTS,
    ergebnis: '„Alles in Ordnung“, wenn jeder Punkt ✓ hat. Sonst ein Hinweis – dann bitte Christian Bescheid geben.',
    rueckweg: KEIN_RUECKWEG },
  'status.konto': statuspunkt('Konto', 'Das Microsoft-Konto, mit dem die Praxis-Assistenz arbeitet: praxis@lilli-nebel.de.',
    'Name und Adresse des Kontos. Steht hier ein anderes Konto, stimmt etwas nicht.'),
  'status.posteingang': statuspunkt('Posteingang', 'Der Posteingang von praxis@lilli-nebel.de.',
    'Nur die Anzahl der Mails und der ungelesenen – nie Betreff oder Absender.'),
  'status.kalender': statuspunkt('Kalender', 'Der Kalender von praxis@lilli-nebel.de.',
    'Name des Kalenders und ob die Praxis-Assistenz dort Termine eintragen darf.'),
  'status.onedrive': statuspunkt('OneDrive', 'Das OneDrive von praxis@lilli-nebel.de.',
    'Wie viel Speicher belegt ist. Dateinamen werden nicht angezeigt.'),
  'status.rechte': statuspunkt('Rechte', 'Was Microsoft der Praxis-Assistenz erlaubt hat – immer nur im Namen von praxis@lilli-nebel.de.',
    'Die erteilten Rechte: Mail, Kalender, OneDrive, Kategorien, geteilte Ordner. Fehlt eins, steht hier welches.'),
};
