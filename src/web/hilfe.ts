/**
 * Erklärungen per Rechtsklick – Muster aus mdr-Target-Search (public/js/hilfe.js).
 *
 * Kein Hover: ein Rechtsklick auf ein Element mit `data-hilfe="<schlüssel>"` öffnet eine Karte,
 * die immer dieselben fünf Fragen beantwortet, in dieser Reihenfolge:
 *
 *   Löst aus – was passiert · Bezug – worauf es sich bezieht · Ändert – was gespeichert wird
 *   Ergebnis – wie es danach aussieht · Rückweg – wie man es zurücknimmt
 *
 * HILFE ist die eine Stelle für alle Texte. test/hilfe.test.ts prüft: jedes `data-hilfe` auf
 * einer Seite hat hier eine Erklärung, und keine Erklärung bleibt ohne Element.
 * Umschalt + Rechtsklick gibt das Browser-Menü. Tastatur: ? oder F1 auf einem fokussierten
 * Element. Handy und Tablet: lange drücken. Esc schließt. Alles am Stück: /hilfe.
 */
import { KATEGORIEN } from '../mail/kategorien.ts';
import { FINANZEN, KANAELE, PATIENTEN, type Kachel } from './cockpit.ts';
import { esc, seite } from './layout.ts';

export interface HilfeEintrag {
  seite: string;
  titel: string;
  loest_aus: string;
  bezug: string;
  aendert: string;
  ergebnis: string;
  rueckweg: string;
}

const NICHTS = 'Nichts – nur die Anzeige.';
const KEIN_RUECKWEG = 'Nicht nötig; es wurde nichts verändert.';
const AUSKUNFT = 'Nichts – eine Auskunft, keine Schaltfläche.';

const statuspunkt = (titel: string, bezug: string, ergebnis: string): HilfeEintrag => ({
  seite: 'Status', titel, loest_aus: AUSKUNFT, bezug, aendert: NICHTS, ergebnis,
  rueckweg: 'Bei ✗: Christian Bescheid geben. Die Seite neu laden zeigt den aktuellen Stand.',
});

const kachel = (bereich: string, k: Kachel): [string, HilfeEintrag] => [k.key, {
  seite: 'Cockpit', titel: `${bereich}: ${k.titel}`,
  loest_aus: k.href ? `Öffnet „${k.titel}“.` : `Noch nichts – ${k.spaeter}. Die Kachel zeigt, was hier entstehen wird.`,
  bezug: k.text, aendert: NICHTS,
  ergebnis: k.href ? `Die Seite „${k.titel}“.` : 'Bleibt grau, bis die Funktion gebaut ist; dann wird die Kachel anklickbar.',
  rueckweg: k.href ? 'Im Menü oder oben auf „Cockpit“ zurück.' : KEIN_RUECKWEG,
}];

export const HILFE: Record<string, HilfeEintrag> = {
  // ── Menü ──────────────────────────────────────────────────────────────────
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

  // ── Cockpit ───────────────────────────────────────────────────────────────
  'bereich.finanzen': { seite: 'Cockpit', titel: 'Bereich Finanzen', loest_aus: AUSKUNFT,
    bezug: 'Alles Kaufmännische: Eingangsrechnungen, Freigabe, Zahlungen.', aendert: NICHTS,
    ergebnis: 'Darunter die Seiten dieses Bereichs. Grau heißt: kommt später.', rueckweg: KEIN_RUECKWEG },
  'bereich.patienten': { seite: 'Cockpit', titel: 'Bereich Patienten', loest_aus: AUSKUNFT,
    bezug: 'Alles rund um Patienten: Anfragen, Patientenweg, Rezepte, Mails.', aendert: NICHTS,
    ergebnis: 'Darunter die Seiten dieses Bereichs. Grau heißt: kommt später.', rueckweg: KEIN_RUECKWEG },
  ...Object.fromEntries([...FINANZEN.map((k) => kachel('Finanzen', k)), ...PATIENTEN.map((k) => kachel('Patienten', k))]),
  'bereich.uebersicht': { seite: 'Cockpit', titel: 'Heute im Blick', loest_aus: AUSKUNFT,
    bezug: 'Was heute wichtig ist: Termine, neue Rechnungen, Anfragen von Patienten.', aendert: NICHTS,
    ergebnis: 'Darunter drei Tafeln; am iPhone stehen sie ganz oben, vor Finanzen und Patienten.', rueckweg: KEIN_RUECKWEG },
  'uebersicht.termine': { seite: 'Cockpit', titel: 'Termine heute', loest_aus: AUSKUNFT,
    bezug: 'Der Kalender von praxis@lilli-nebel.de, heute von 0 bis 24 Uhr.', aendert: NICHTS,
    ergebnis: 'Oben die Tagesleiste (jeder Block ein Termin, die rote Linie ist jetzt), darunter die Liste. Namen erscheinen nur als Initialen – für den Fall, dass jemand mit auf den Bildschirm schaut.',
    rueckweg: KEIN_RUECKWEG },
  'termine.patient': { seite: 'Cockpit', titel: 'Termin → Patient',
    loest_aus: 'Öffnet die Patientenseite, Abschnitt Termine.', bezug: 'Ein Termin aus der Kartei. Im Kalender steht nur „Initialen + Nummer“; hier mit „Namen zeigen“ der volle Name aus der Kartei.',
    aendert: NICHTS, ergebnis: 'Die Patientenseite.', rueckweg: 'Zurück zum Cockpit.' },
  'termine.leistung': { seite: 'Cockpit', titel: 'Behandlung am Termin',
    loest_aus: AUSKUNFT, bezug: 'Kurzbezeichnung der Behandlung zur Vorbereitung (Material, Liege): Kürzel aus der Preisliste (KG, MT, MLD …), sonst die Maßnahme des Rezepts, bei Wellness das Katalog-Kürzel. Grün = mit Rezept.',
    aendert: NICHTS, ergebnis: 'Nur hier in der Praxis-Assistenz – im Kalender des Postfachs stehen weiterhin nur Initialen und Nummer (Leitplanke 9).', rueckweg: KEIN_RUECKWEG },
  'termine.namen': { seite: 'Cockpit', titel: 'Namen zeigen / Nur Initialen',
    loest_aus: 'Lädt die Seite neu, mit vollen Termintiteln bzw. wieder nur mit Initialen.', bezug: 'Nur die Termine auf dieser Seite.',
    aendert: 'Nichts – nur die Anzeige; beim nächsten Öffnen stehen wieder Initialen da.',
    ergebnis: 'Die Termintitel, wie sie im Kalender stehen.', rueckweg: '„Nur Initialen zeigen“ klicken.' },
  'uebersicht.rechnungen': { seite: 'Cockpit', titel: 'Neue Rechnungseingänge', loest_aus: AUSKUNFT,
    bezug: 'Lieferantenrechnungen, die der Rechnungseingang erkannt hat – keine Patientenpost.', aendert: NICHTS,
    ergebnis: 'Die Zahl je Stufe, ein Balken für das Verhältnis, der offene Betrag und die neuesten Rechnungen. „Nicht verbunden“ heißt: die Praxis-Datenbank läuft noch nicht.',
    rueckweg: KEIN_RUECKWEG },
  'uebersicht.anfragen': { seite: 'Cockpit', titel: 'Terminanfragen', loest_aus: AUSKUNFT,
    bezug: 'Offene Terminanfragen: „neu“ wartet auf einen Blick von Ihnen, „Vorschlag im Entwurf“ wartet auf die Antwort des Patienten. Darunter die fünf neuesten.', aendert: NICHTS,
    ergebnis: 'Zahlen und Namen aus der Anfragen-Tabelle; Mails kommen alle paar Minuten aus dem Ordner „Terminanfragen“ des Postfachs dazu.',
    rueckweg: KEIN_RUECKWEG },
  'uebersicht.anfrage': { seite: 'Cockpit', titel: 'Anfrage öffnen', loest_aus: 'Öffnet die Anfrage mit Wortlaut, Patient und Vorschlägen.', bezug: 'Diese eine Anfrage.', aendert: NICHTS, ergebnis: 'Die Anfrage-Seite.', rueckweg: KEIN_RUECKWEG },
  'uebersicht.kanaele': { seite: 'Cockpit', titel: 'Wege der Anfragen', loest_aus: 'Klappt die Liste der Wege auf: E-Mail, Website-Formular, WhatsApp, Telefon, Online-Buchung.', bezug: 'Wie Anfragen hereinkommen und was davon schon angebunden ist.', aendert: NICHTS, ergebnis: 'Je Weg eine Zeile mit Stand.', rueckweg: 'Wieder zuklappen.' },
  'anfragen.filter': { seite: 'Anfragen', titel: 'Auswahl', loest_aus: 'Zeigt offene, bestätigte, erledigte oder alle Anfragen.', bezug: 'Status der Anfrage: neu → Vorschlag im Entwurf → Termin steht / erledigt / abgesagt / verworfen.', aendert: NICHTS, ergebnis: 'Die Kacheln der gewählten Auswahl, neue zuerst.', rueckweg: '„Offen“ ist die Vorgabe.' },
  'anfragen.kachel': { seite: 'Anfragen', titel: 'Anfrage-Kachel', loest_aus: 'Öffnet die Anfrage.', bezug: 'Weg (Symbol), Absender, Anliegen, Eingang, Betreff, zugeordneter Patient oder „Patient unbekannt“, Zahl der Vorschläge.', aendert: NICHTS, ergebnis: 'Die Anfrage-Seite.', rueckweg: 'Zurück zur Liste.' },
  'anfragen.neu': { seite: 'Anfragen', titel: 'Anfrage von Hand', loest_aus: 'Klappt ein Formular auf für Anfragen, die nicht per Mail kamen: Telefon, WhatsApp, persönlich.', bezug: 'Name, Telefon, Mail, Wunsch – ist die Adresse oder Nummer in der Kartei bekannt, wird der Patient gleich zugeordnet.', aendert: 'Beim Anlegen eine neue Anfrage mit Status „neu“.', ergebnis: 'Die Anfrage-Seite; dort Zeiten vorschlagen.', rueckweg: 'Anfrage verwerfen.' },
  'anfragen.neu.quelle': { seite: 'Anfragen', titel: 'Weg', loest_aus: 'Merkt, wie die Anfrage kam – Telefon, WhatsApp oder persönlich.', bezug: 'Nur das Symbol auf der Kachel und die Auswertung, welche Wege Patienten nutzen.', aendert: 'Das Feld „Quelle“ der Anfrage.', ergebnis: 'Symbol auf der Kachel.', rueckweg: KEIN_RUECKWEG },
  'anfrage.text': { seite: 'Anfrage', titel: 'Wortlaut', loest_aus: AUSKUNFT, bezug: 'Der Text der Mail bzw. die Felder des Website-Formulars oder Ihre Notiz vom Telefon – verschlüsselt gespeichert, weil er Gesundheitsangaben enthalten kann.', aendert: NICHTS, ergebnis: 'Der Text, wie er ankam.', rueckweg: KEIN_RUECKWEG },
  'anfrage.erkannt': { seite: 'Anfrage', titel: 'Erkannte Wünsche', loest_aus: AUSKUNFT, bezug: 'Wochentage, Tageszeiten, Daten und Uhrzeiten, die im Text stehen – regelbasiert erkannt, ohne Sprachmodell. Danach richten sich die Vorschläge.', aendert: NICHTS, ergebnis: 'Grüne Marken; „keine“, wenn nichts erkennbar war – dann gelten die nächsten freien Zeiten.', rueckweg: 'Beim Vorschlagen „Zeitwünsche nicht beachten“ anhaken.' },
  'anfrage.patient': { seite: 'Anfrage', titel: 'Patient', loest_aus: 'Öffnet die Patientenseite.', bezug: 'Der Patient, der zu Adresse oder Nummer der Anfrage gefunden oder von Hand zugeordnet wurde.', aendert: NICHTS, ergebnis: 'Die Patientenseite.', rueckweg: 'Zurück zur Anfrage.' },
  'anfrage.zuordnen': { seite: 'Anfrage', titel: 'Patienten zuordnen', loest_aus: 'Verknüpft die Anfrage mit einem bestehenden Patienten.', bezug: 'Nötig, bevor ein Termin bestätigt werden kann – der Termin gehört in die Kartei des Patienten.', aendert: 'Das Feld Patient der Anfrage.', ergebnis: 'Name und Nummer stehen bei der Anfrage, „bestätigen“ wird möglich.', rueckweg: 'Einen anderen Patienten wählen (geht, solange die Anfrage offen ist).' },
  'anfrage.neuer-patient': { seite: 'Anfrage', titel: 'Neuen Patienten anlegen', loest_aus: 'Öffnet „Neuer Patient“ mit Name, Mail und Mobilnummer aus der Anfrage vorbelegt.', bezug: 'Neupatienten, die es noch nicht in der Kartei gibt.', aendert: 'Nach dem Anlegen ist der Patient der Anfrage zugeordnet.', ergebnis: 'Zurück auf der Anfrage mit zugeordnetem Patienten.', rueckweg: 'Patient archivieren; die Zuordnung bleibt.' },
  'anfrage.dauer': { seite: 'Anfrage', titel: 'Dauer', loest_aus: 'Legt fest, wie lang die vorgeschlagenen Zeiten sind.', bezug: 'Vorgabe aus der Konfiguration (Termin-Dauer); je nach Leistung anpassen, z. B. 45 oder 60 Minuten.', aendert: 'Nur die Berechnung.', ergebnis: 'Vorschläge dieser Länge.', rueckweg: KEIN_RUECKWEG },
  'anfrage.ab': { seite: 'Anfrage', titel: 'Ab', loest_aus: 'Frühester Tag für Vorschläge; heute bedeutet frühestens in einer Stunde.', bezug: 'Zusammen mit dem Zeitraum in Tagen das Suchfenster.', aendert: 'Nur die Berechnung.', ergebnis: 'Vorschläge ab diesem Tag.', rueckweg: KEIN_RUECKWEG },
  'anfrage.vorschlagen': { seite: 'Anfrage', titel: 'Drei Zeiten vorschlagen', loest_aus: 'Berechnet drei freie Zeiten (Öffnungszeiten, keine Feiertage, nichts Belegtes in Kartei, Haupt- und Praxiskalender, möglichst passend zum Wunsch, auf verschiedene Tage verteilt), reserviert sie im Praxiskalender als „Reserviert – Anfrage #…“ und legt die Antwort als Entwurf ins Postfach.', bezug: 'Diese Anfrage; vorherige Reservierungen werden ersetzt.', aendert: 'Vorschläge an der Anfrage (Status „Vorschlag im Entwurf“), vorläufige Kalendereinträge, ein Mail-Entwurf.', ergebnis: 'Die Liste der Vorschläge und der Link zum Entwurf – Sie prüfen und senden. Reservierungen ohne Bestätigung verschwinden nach 48 Stunden von selbst.', rueckweg: 'Erneut vorschlagen oder die Anfrage abschließen – beides räumt die Reservierungen weg.' },
  'anfrage.vorschlag': { seite: 'Anfrage', titel: 'Vorschläge', loest_aus: AUSKUNFT, bezug: 'Die vorgeschlagenen Zeiten; „reserviert“ heißt: im Kalender vorläufig blockiert.', aendert: NICHTS, ergebnis: 'Bei jedem Vorschlag ein Knopf zum Bestätigen, sobald der Patient zugeordnet ist.', rueckweg: KEIN_RUECKWEG },
  'anfrage.bestaetigen': { seite: 'Anfrage', titel: 'Diesen Termin bestätigen', loest_aus: 'Trägt den Termin fest in die Kartei des Patienten ein, spiegelt ihn in den Kalender (Initialen + Nummer), nimmt die Reservierungen weg und legt die Terminbestätigung als Entwurf ins Postfach.', bezug: 'Der gewählte Vorschlag – nachdem der Patient zugesagt hat.', aendert: 'Ein Termin in der Kartei, ein Kalendereintrag, Status „Termin steht“, ein Mail-Entwurf.', ergebnis: 'Sie landen auf der Patientenseite bei den Terminen.', rueckweg: 'Termin beim Patienten absagen; die Anfrage lässt sich wieder öffnen.' },
  'anfrage.antwort': { seite: 'Anfrage', titel: 'Antwort-Entwurf in Outlook', loest_aus: 'Öffnet den Entwurf in Outlook Web (neuer Reiter).', bezug: 'Die Antwort mit den Vorschlägen bzw. der Bestätigung – im selben Mail-Faden, falls die Anfrage per Mail kam.', aendert: NICHTS, ergebnis: 'Der Entwurf zum Prüfen und Senden; die Praxis-Assistenz sendet nie selbst.', rueckweg: 'Entwurf in Outlook löschen.' },
  'anfrage.status': { seite: 'Anfrage', titel: 'Abschluss', loest_aus: 'Erledigt (ohne Termin hier), Abgesagt (Patient will doch nicht) oder Verwerfen (war keine Anfrage); bei abgeschlossenen „Wieder öffnen“.', bezug: 'Der Status der Anfrage; Reservierungen im Kalender werden dabei entfernt.', aendert: 'Status, Zeitpunkt und wer; die Vorschläge werden geleert.', ergebnis: 'Die Anfrage verschwindet aus „Offen“.', rueckweg: '„Wieder öffnen“.' },
  'anfrage.termin': { seite: 'Anfrage', titel: 'Zum Termin', loest_aus: 'Öffnet die Patientenseite bei den Terminen.', bezug: 'Der aus dieser Anfrage entstandene Termin.', aendert: NICHTS, ergebnis: 'Die Termine des Patienten.', rueckweg: KEIN_RUECKWEG },
  'anfrage.notiz': { seite: 'Anfrage', titel: 'Notiz', loest_aus: 'Speichert eine Bemerkung zur Anfrage.', bezug: 'Was beim Telefonat besprochen wurde, Rückrufwunsch, Besonderheiten – verschlüsselt.', aendert: 'Die Notiz der Anfrage.', ergebnis: 'Steht beim nächsten Öffnen da.', rueckweg: 'Leeren und speichern.' },
  'konfiguration.terminarten': { seite: 'Konfiguration', titel: 'Terminarten für die Online-Anfrage',
    loest_aus: 'Öffnet die Seite mit den Terminart-Kacheln.', bezug: 'Was Patienten bei einer Online-Terminanfrage im Dropdown wählen können – mit Dauer für die Terminvorschläge.',
    aendert: NICHTS, ergebnis: 'Drei Sektionen (Rezept, Selbstzahler, Wellness) mit Kacheln, Vorschau des Dropdowns und HTML-Baustein für die Website.', rueckweg: 'Zurück zur Konfiguration.' },
  'terminart.kachel': { seite: 'Terminarten', titel: 'Terminart-Kachel', loest_aus: AUSKUNFT,
    bezug: 'Eine Wahl im Dropdown der Online-Anfrage: Kennung, Kurzbeschreibung (fett), Langbeschreibung, Dauer, ggf. GKV-Nummer mit Regelbehandlungszeit. Der farbige Rand oben zeigt die Sektion.',
    aendert: NICHTS, ergebnis: 'Blass = inaktiv, steht nicht im Dropdown.', rueckweg: KEIN_RUECKWEG },
  'terminart.code': { seite: 'Terminarten', titel: 'Kennung', loest_aus: AUSKUNFT,
    bezug: 'Buchstabe der Sektion und Nummer: P = Physioleistungen auf Rezept, S = Selbstzahler, W = Wellness. Die Formular-Mail der Website trägt sie („Terminart: P4 – …“), daran erkennt die Praxis-Assistenz die Wahl.',
    aendert: NICHTS, ergebnis: 'Vergibt das System, ändert sich nie.', rueckweg: KEIN_RUECKWEG },
  'terminart.dauer': { seite: 'Terminarten', titel: 'Dauer', loest_aus: AUSKUNFT,
    bezug: 'So lang werden die Terminvorschläge für diese Terminart. Vorgabe bei Kassenleistungen: obere Regelbehandlungszeit der GKV-Liste, auf 15 Minuten aufgerundet; Umziehen und Dokumentation kommen über den Puffer der Öffnungszeiten dazu. Bei den Angeboten der Website sind es Vorschläge – dort steht keine Dauer.',
    aendert: NICHTS, ergebnis: 'Unter „bearbeiten“ änderbar.', rueckweg: KEIN_RUECKWEG },
  'terminart.gkv': { seite: 'Terminarten', titel: 'GKV-Nummer', loest_aus: AUSKUNFT,
    bezug: 'Positionsnummer der GKV-Vergütungsliste (z. B. 20501 KG) mit Regelbehandlungszeit – Bezug zu Preisliste und Rechnung.', aendert: NICHTS, ergebnis: 'Fehlt bei Leistungen außerhalb des Katalogs.', rueckweg: KEIN_RUECKWEG },
  'terminart.aktiv': { seite: 'Terminarten', titel: 'Aktiv',
    loest_aus: 'Schaltet die Terminart an oder aus.', bezug: 'Nur aktive Terminarten stehen im Dropdown der Online-Anfrage und im Baustein für die Website. Intern (Neuer Termin, Anfrage von Hand) sind alle wählbar.',
    aendert: 'Den Haken der Terminart; steht im Protokoll.', ergebnis: 'Vorschau und Baustein auf dieser Seite zeigen den neuen Stand – den Baustein danach neu in die Website kopieren.', rueckweg: 'Haken wieder umschalten.' },
  'terminart.bearbeiten': { seite: 'Terminarten', titel: 'Bearbeiten',
    loest_aus: 'Klappt das Formular auf: Kurzbeschreibung, Langbeschreibung, Dauer, GKV-Nummer.', bezug: 'Kurzbeschreibung höchstens 80 Zeichen (Dropdown). In beiden Texten keine Diagnosen – sie stehen öffentlich auf der Website.',
    aendert: 'Beim Speichern die Kachel; Sektion und Kennung bleiben.', ergebnis: 'Die Kachel mit neuem Text.', rueckweg: 'Erneut bearbeiten.' },
  'terminart.neu': { seite: 'Terminarten', titel: 'Neue Terminart',
    loest_aus: 'Klappt das Formular für eine neue Kachel in dieser Sektion auf.', bezug: 'Die Kennung vergibt das System (nächste Nummer der Sektion).',
    aendert: 'Eine neue, zunächst inaktive Terminart.', ergebnis: 'Die Kachel am Ende der Sektion.', rueckweg: 'Inaktiv lassen – gelöscht wird nicht, damit alte Anfragen und Termine ihre Terminart behalten.' },
  'terminart.sektion.rezept': { seite: 'Terminarten', titel: 'Sektion „Physioleistungen gemäß Katalog und Rezept“', loest_aus: AUSKUNFT,
    bezug: 'Behandlungen auf ärztliche Verordnung nach dem Heilmittelkatalog – dazu Neupatient, neues Rezept, Folgerezept, Hausbesuch. Farbe Brombeer, Symbol Rezept.',
    aendert: NICHTS, ergebnis: 'Termine dieser Sektion tragen in Kalenderseite und Cockpit den Brombeer-Rand und das Rezept-Symbol, in Outlook die Kategorie „Praxis-Termin“ (Brombeer).', rueckweg: KEIN_RUECKWEG },
  'terminart.sektion.selbstzahler': { seite: 'Terminarten', titel: 'Sektion „Selbstzahler – Behandlungen nach Physioverordnung“', loest_aus: AUSKUNFT,
    bezug: 'Physiotherapie, die Patienten selbst bezahlen – ohne Rezept oder mit einem Rezept, das die Kasse nicht übernimmt; dazu die Spezialangebote der Website (Beckenboden, Craniosacral, CMD …). Farbe Holzbraun, Symbol Euro.',
    aendert: NICHTS, ergebnis: 'Termine: holzbrauner Rand und Euro-Symbol, in Outlook die Kategorie „Praxis-Termin: Selbstzahler“ (Holzbraun).', rueckweg: KEIN_RUECKWEG },
  'terminart.sektion.wellness': { seite: 'Terminarten', titel: 'Sektion „Wellness & Ayurveda“', loest_aus: AUSKUNFT,
    bezug: 'Ayurveda-Massagen, Lomi Lomi, Kneipp, Yoga – die Angebote von lilli-nebel.de. Farbe Gold, Symbol Wellness.',
    aendert: NICHTS, ergebnis: 'Termine: goldener Rand und Wellness-Symbol, in Outlook die Kategorie „Praxis-Termin: Wellness“ (Gold).', rueckweg: KEIN_RUECKWEG },
  'terminart.vorschau': { seite: 'Terminarten', titel: 'Vorschau des Dropdowns',
    loest_aus: 'Zeigt das Dropdown so, wie Patienten es auf der Website sehen; eine Wahl blendet ihre Langbeschreibung und Dauer ein.', bezug: 'Nur aktive Terminarten, gruppiert nach Sektion.',
    aendert: NICHTS, ergebnis: 'Nichts wird gespeichert – nur zum Ansehen.', rueckweg: KEIN_RUECKWEG },
  'terminart.baustein': { seite: 'Terminarten', titel: 'Baustein für die Website',
    loest_aus: AUSKUNFT, bezug: 'HTML-Code des Dropdowns (Feldname „Terminart“, je Sektion eine Gruppe, Dauer und Beschreibung als Datenattribute) für das Anfrageformular auf lilli-nebel.de.',
    aendert: NICHTS, ergebnis: 'Kopieren und in das Formular der Website einsetzen; die Formular-Mail trägt dann „Terminart: P4 – …“ und die Anfrage bekommt die Terminart samt Dauer.', rueckweg: KEIN_RUECKWEG },
  'terminart.einbetten': { seite: 'Terminarten', titel: 'Buchungsseite einbetten', loest_aus: AUSKUNFT,
    bezug: 'Die Buchungsseite ist ein eigener kleiner Dienst ohne Zugang zu Kartei, Postfach oder Tresor: der Manager schiebt ihm alle paar Minuten die aktiven Terminarten und die freien Zeitfenster, holt die Buchungswünsche ab und macht daraus Anfragen mit reserviertem Wunschtermin.',
    aendert: NICHTS, ergebnis: 'Zwei Schnipsel: das Skript fügt die Seite in lilli-nebel.de ein und passt die Höhe an; der iframe geht auch mit vorgewählter Terminart (?terminart=P1). Öffentlich erreichbar ist die Seite erst nach Freigabe (A27, Tailscale Funnel) – bis dahin nur im Tailnet.', rueckweg: KEIN_RUECKWEG },
  'anfrage.buchung': { seite: 'Anfrage', titel: 'Wunschtermin von der Buchungsseite', loest_aus: AUSKUNFT,
    bezug: 'Der Patient hat Terminart, Tag und Uhrzeit selbst gewählt; die Zeit ist im Praxiskalender als „Reserviert – Anfrage #…“ geblockt und auf der Buchungsseite nicht mehr wählbar.',
    aendert: NICHTS, ergebnis: '„Diesen Termin bestätigen“ macht daraus den festen Termin mit Bestätigungs-Entwurf; „Drei Zeiten vorschlagen“ ersetzt den Wunsch durch andere Zeiten; Abschließen gibt die Reservierung frei.', rueckweg: KEIN_RUECKWEG },
  'konfiguration.buchung-vorlauf': { seite: 'Konfiguration', titel: 'Buchungsseite: Vorlauf', loest_aus: 'Legt fest, wie viele Stunden ab jetzt der früheste buchbare Termin liegt.', bezug: 'Schutz vor Buchungen „in zehn Minuten“; Vorgabe 24 Stunden.', aendert: 'Die Einstellung; das Angebot wird beim nächsten Takt neu geschoben.', ergebnis: 'Die Buchungsseite zeigt keine Zeiten vor diesem Vorlauf.', rueckweg: 'Erneut speichern.' },
  'konfiguration.buchung-tage': { seite: 'Konfiguration', titel: 'Buchungsseite: Zeitraum', loest_aus: 'Wie viele Tage im Voraus die Buchungsseite freie Zeiten zeigt (1 bis 90).', bezug: 'Vorgabe 21 Tage – länger heißt mehr Verpflichtung, kürzer weniger Treffer.', aendert: 'Die Einstellung.', ergebnis: 'Das Monatsblatt reicht so weit.', rueckweg: 'Erneut speichern.' },
  'konfiguration.buchung-hinweis': { seite: 'Konfiguration', titel: 'Buchungsseite: Hinweis', loest_aus: 'Der Satz über dem Formular der Buchungsseite.', bezug: 'Z. B. „Ihr Wunsch ist eine Anfrage – wir melden uns zur Bestätigung“. Keine Gesundheitsangaben, der Text ist öffentlich.', aendert: 'Die Einstellung.', ergebnis: 'Steht beim nächsten Takt auf der Buchungsseite.', rueckweg: 'Erneut speichern.' },
  'sektion.legende': { seite: 'Kalender', titel: 'Farben der Sektionen', loest_aus: AUSKUNFT,
    bezug: 'Brombeer mit Rezept-Symbol = Physioleistung auf Rezept, Holzbraun mit Euro = Selbstzahler, Gold mit Wellness-Symbol = Wellness & Ayurveda. Die Sektion kommt aus der Terminart des Termins, sonst aus Rezept (→ Rezept), Wellness-Serie (→ Wellness) oder Direktzugang (→ Selbstzahler).',
    aendert: NICHTS, ergebnis: 'Dieselben Farben in Kalenderseite, Cockpit und – als Kategorie – in Outlook. Ohne Sektion bleibt der Termin neutral.', rueckweg: KEIN_RUECKWEG },
  'termin.terminart': { seite: 'Patient', titel: 'Terminart des Termins',
    loest_aus: 'Ordnet den Termin einer Terminart zu.', bezug: 'Bestimmt Farbe und Symbol im Kalender (Sektion) und die Kurzbezeichnung am Termin; ohne Wahl gilt Rezept bzw. Fall.',
    aendert: 'Die Terminart am Termin.', ergebnis: 'Im Kalender erkennbar an Rand und Symbol; in Outlook an der Farbe.', rueckweg: 'Termin absagen und neu anlegen.' },
  'anfrage.terminart': { seite: 'Anfrage', titel: 'Terminart der Anfrage',
    loest_aus: 'Setzt oder ändert die Terminart – die Wahl aus dem Website-Dropdown steht hier schon, wenn sie kam.', bezug: 'Ihre Dauer gilt für die Terminvorschläge; beim Bestätigen bekommt der Termin diese Terminart (Farbe im Kalender).',
    aendert: 'Die Terminart der Anfrage.', ergebnis: 'Dauer im Vorschlagsformular angepasst.', rueckweg: 'Andere Terminart wählen oder „noch offen“.' },
  'anfragen.neu.terminart': { seite: 'Anfragen', titel: 'Terminart', loest_aus: 'Wählt, worum es bei der Anfrage geht.', bezug: 'Alle Terminarten, auch nicht online freigegebene.', aendert: 'Die Terminart der neuen Anfrage.', ergebnis: 'Dauer und Farbe folgen ihr.', rueckweg: 'Auf der Anfrage-Seite ändern.' },
  'konfiguration.oeffnungszeiten': { seite: 'Konfiguration', titel: 'Öffnungszeiten', loest_aus: 'Speichert die Zeiten, in denen Termine vorgeschlagen werden.', bezug: 'Schreibweise: „Mo 08:00-12:00,14:00-18:00; Di 08:00-18:00“ – Tage ohne Angabe sind frei von Vorschlägen.', aendert: 'Die Einstellung; bestehende Termine bleiben.', ergebnis: 'Vorschläge nur innerhalb dieser Fenster, nie an bayerischen Feiertagen.', rueckweg: 'Erneut speichern.' },
  'konfiguration.termin-dauer': { seite: 'Konfiguration', titel: 'Dauer eines Termins', loest_aus: 'Vorgabe in Minuten für Terminvorschläge.', bezug: 'Lässt sich je Anfrage ändern.', aendert: 'Die Einstellung.', ergebnis: 'Vorbelegung auf der Anfrage-Seite.', rueckweg: 'Erneut speichern.' },
  'konfiguration.puffer': { seite: 'Konfiguration', titel: 'Puffer', loest_aus: 'Minuten Abstand zu belegten Zeiten vor und nach jedem Vorschlag.', bezug: 'Umziehen, Liege richten, Lüften.', aendert: 'Die Einstellung.', ergebnis: 'Vorschläge halten diesen Abstand.', rueckweg: 'Auf 0 setzen.' },
  'konfiguration.anfragen-ordner': { seite: 'Konfiguration', titel: 'Ordner mit Terminanfragen', loest_aus: 'Legt fest, aus welchem Outlook-Ordner die Praxis-Assistenz Anfragen liest.', bezug: 'Eine Outlook-Regel füllt den Ordner (Betreff enthält „Termin“, Formular-Mails der Website). Gibt es ihn nicht, meldet das Protokoll des Dienstes es.', aendert: 'Die Einstellung.', ergebnis: 'Alle paar Minuten neue Anfragen aus diesem Ordner.', rueckweg: 'Erneut speichern.' },
  ...Object.fromEntries(KANAELE.map((k) => [k.key, {
    seite: 'Cockpit', titel: `Weg: ${k.name}`, loest_aus: AUSKUNFT,
    bezug: `Terminanfragen, die per ${k.name} kommen.`, aendert: NICHTS,
    ergebnis: `Das Symbol zeigt bei jeder Anfrage, dass sie per ${k.name} kam. Stand: ${k.stand}.`, rueckweg: KEIN_RUECKWEG,
  } satisfies HilfeEintrag])),
  'uebersicht.protokoll': { seite: 'Cockpit', titel: 'Was sich geändert hat', loest_aus: AUSKUNFT,
    bezug: 'Alles, was die Praxis-Assistenz in den letzten sieben Tagen getan hat – aus ihrem Protokoll, das sich nicht ändern lässt.',
    aendert: NICHTS, ergebnis: 'Je Zeile Zeitpunkt und was geschah: Rechnung abgelegt, unklarer Anhang, Patientenpost markiert, bezahlt und archiviert … Ohne Patientennamen.',
    rueckweg: KEIN_RUECKWEG },

  // ── Rechnungs-Dashboard ──────────────────────────────────────────────────
  'rechnungen.zaehler.eingegangen': { seite: 'Rechnungs-Dashboard', titel: 'Zahl: eingegangen', loest_aus: AUSKUNFT,
    bezug: 'Rechnungen mit „Rechnung: eingegangen“ – abgelegt, noch nicht bezahlt.', aendert: NICHTS,
    ergebnis: 'Wie viele es sind; ihr Betrag zusammen steht als „offen“ darunter.', rueckweg: KEIN_RUECKWEG },
  'rechnungen.zaehler.unklar': { seite: 'Rechnungs-Dashboard', titel: 'Zahl: unklar', loest_aus: AUSKUNFT,
    bezug: 'PDFs, die nach Rechnung aussehen, aber von einem unbekannten Absender kommen – nichts wurde abgelegt.', aendert: NICHTS,
    ergebnis: 'Wie viele auf deinen Blick warten (in Outlook: „Prüfen – unklar“).', rueckweg: KEIN_RUECKWEG },
  'rechnungen.zaehler.angestossen': { seite: 'Rechnungs-Dashboard', titel: 'Zahl: Zahlung angestoßen', loest_aus: AUSKUNFT,
    bezug: 'Rechnungen, deren Zahlung in Lexware beauftragt ist – kommt mit dem Tarif XL.', aendert: NICHTS,
    ergebnis: 'Wie viele unterwegs sind; bis zum Tarif XL bleibt es bei 0.', rueckweg: KEIN_RUECKWEG },
  'rechnungen.zaehler.bezahlt': { seite: 'Rechnungs-Dashboard', titel: 'Zahl: bezahlt', loest_aus: AUSKUNFT,
    bezug: 'Bezahlte Rechnungen – heute, wenn du „Rechnung: bezahlt“ in Outlook gesetzt hast; später laut Lexware.', aendert: NICHTS,
    ergebnis: 'Wie viele erledigt und im Outlook-Archiv sind.', rueckweg: KEIN_RUECKWEG },
  'rechnungen.tabelle': { seite: 'Rechnungs-Dashboard', titel: 'Liste der Rechnungen', loest_aus: 'Ein Klick auf den Dateinamen öffnet die Rechnung.',
    bezug: 'Alle Lieferantenrechnungen des gewählten Jahres, mit Stand und Suche gefiltert, neueste oben.', aendert: NICHTS,
    ergebnis: 'Eingang, Datei, Lieferant und Absender, Rechnungsnummer, Betrag, Stand und der Weg nach OneDrive.', rueckweg: KEIN_RUECKWEG },
  'rechnungen.neu': { seite: 'Rechnungs-Dashboard', titel: 'Neue Rechnungen', loest_aus: AUSKUNFT,
    bezug: 'Rechnungen bekannter Lieferanten, die eingegangen und noch nicht entschieden sind.', aendert: NICHTS,
    ergebnis: 'Eine Kachel je Rechnung; zurückgestellte stehen hinten und sind blasser.', rueckweg: KEIN_RUECKWEG },
  'rechnungen.kachel': { seite: 'Rechnungs-Dashboard', titel: 'Rechnungskachel',
    loest_aus: 'Ein Klick öffnet die Rechnung mit dem PDF, der Freigabe und den Angaben.',
    bezug: 'Eine Rechnung: Dateiname des Anhangs, Lieferant, Betrag, Eingang der Mail und wer sie geschickt hat.', aendert: NICHTS,
    ergebnis: 'Die Rechnungsansicht. Mit der Maus darüber zeigt die Kachel, wo die Mail im Postfach liegt.', rueckweg: 'Zurück zum Rechnungs-Dashboard.' },
  'rechnungen.netto': { seite: 'Rechnungs-Dashboard', titel: 'Netto und Umsatzsteuer', loest_aus: AUSKUNFT,
    bezug: 'Was das System aus dem PDF gelesen hat: Nettobetrag, Steuer und Steuersatz.', aendert: NICHTS,
    ergebnis: 'Steht nur da, wenn Netto + Steuer genau den Brutto-Betrag ergeben. „errechnet“ heißt: die Rechnung nennt nur den Satz („inkl. 19 % MwSt“) – Netto und Steuer sind aus dem Brutto gerechnet. Sonst „nicht sicher erkannt“ – dann gilt, was auf der Rechnung steht. Wird der Betrag korrigiert, verfallen Netto und Steuer.',
    rueckweg: KEIN_RUECKWEG },
  'rechnungen.ort': { seite: 'Rechnungs-Dashboard', titel: 'Wo die Mail liegt', loest_aus: AUSKUNFT,
    bezug: 'Die Mail, mit der die Rechnung kam – live aus dem Postfach gelesen.', aendert: NICHTS,
    ergebnis: 'Der Ordner, z. B. „Posteingang › Rechnungen › Verarbeitet“. „Nicht mehr im Postfach“ heißt: gelöscht oder endgültig entfernt – die Datei in OneDrive bleibt.',
    rueckweg: KEIN_RUECKWEG },
  'rechnungen.privat': { seite: 'Rechnungs-Dashboard', titel: 'Haken „privat“',
    loest_aus: 'Ein Haken nimmt die Rechnung aus der Praxisbuchhaltung; der Haken weg holt sie zurück. Ohne JavaScript mit „übernehmen“.',
    bezug: 'Diese eine Rechnung.', aendert: 'Stand „privat“, die Datei wandert nach „<Jahr>/Privat“, die Mail bekommt „Rechnung: privat“, Eintrag im Protokoll.',
    ergebnis: 'Die Kachel verschwindet aus „Neue Rechnungen“ und steht unter „Als privat markiert“; sie zählt in keiner Summe.',
    rueckweg: 'Haken wieder entfernen: Datei und Stand kommen zurück, wie sie vorher waren.' },
  'rechnungen.privatliste': { seite: 'Rechnungs-Dashboard', titel: 'Als privat markiert',
    loest_aus: 'Klappt die Liste der privaten Rechnungen auf oder zu.', bezug: 'Alle Rechnungen mit Haken „privat“.', aendert: NICHTS,
    ergebnis: 'Die Kacheln mit gesetztem Haken – zum Nachsehen oder Zurücknehmen.', rueckweg: 'Noch einmal klicken.' },
  'rechnungen.filter.jahr': { seite: 'Rechnungs-Dashboard', titel: 'Filter: Jahr', loest_aus: 'Lädt Auswertung und Liste für das gewählte Jahr.',
    bezug: 'Rechnungsdatum, sonst der Tag des Eingangs.', aendert: NICHTS, ergebnis: 'Diagramme und Liste nur für dieses Jahr.', rueckweg: 'Anderes Jahr wählen.' },
  'rechnungen.filter.stand': { seite: 'Rechnungs-Dashboard', titel: 'Filter: Stand', loest_aus: 'Lädt die Liste nur mit Rechnungen dieses Stands.',
    bezug: 'eingegangen, freigegeben, Zahlung angestoßen, bezahlt, abgelehnt, privat – oder alle.', aendert: NICHTS,
    ergebnis: 'Die Liste darunter; die Diagramme zeigen immer alle außer privat und abgelehnt.', rueckweg: '„alle“ wählen.' },
  'rechnungen.filter.suche': { seite: 'Rechnungs-Dashboard', titel: 'Suche', loest_aus: 'Sucht beim Anwenden in Lieferant, Dateiname, Rechnungsnummer und Absender.',
    bezug: 'Die Rechnungen des gewählten Jahres.', aendert: NICHTS, ergebnis: 'Nur Treffer in der Liste.', rueckweg: 'Feld leeren und anwenden.' },
  'rechnungen.filter.anwenden': { seite: 'Rechnungs-Dashboard', titel: 'Anwenden', loest_aus: 'Lädt die Seite mit Jahr, Stand und Suche neu.',
    bezug: 'Auswertung und Liste.', aendert: NICHTS, ergebnis: 'Die gefilterte Liste; die Adresse merkt sich die Auswahl (Lesezeichen möglich).', rueckweg: 'Filter zurückstellen.' },
  'rechnungen.diagramm.monate': { seite: 'Rechnungs-Dashboard', titel: 'Summe je Monat', loest_aus: AUSKUNFT,
    bezug: 'Alle Lieferantenrechnungen des Jahres ohne privat und abgelehnt; Monat nach Rechnungsdatum, sonst Eingang.', aendert: NICHTS,
    ergebnis: 'Eine Säule je Monat; mit der Maus darüber der genaue Betrag. Beschriftet ist nur der höchste Monat.', rueckweg: KEIN_RUECKWEG },
  'rechnungen.diagramm.lieferanten': { seite: 'Rechnungs-Dashboard', titel: 'Summe je Lieferant', loest_aus: AUSKUNFT,
    bezug: 'Dieselben Rechnungen, nach Lieferant zusammengezählt.', aendert: NICHTS,
    ergebnis: 'Die acht größten Lieferanten, der Rest als „Übrige“.', rueckweg: KEIN_RUECKWEG },
  'rechnungen.onedrive': { seite: 'Rechnungs-Dashboard', titel: 'In OneDrive öffnen', loest_aus: 'Öffnet die abgelegte Datei in OneDrive, in einem neuen Tab.',
    bezug: 'Die Datei dieser Rechnung in der Praxisablage.', aendert: NICHTS, ergebnis: 'Die Datei in OneDrive – auch zum Herunterladen oder Weiterleiten.', rueckweg: 'Tab schließen.' },

  // ── Rechnungsansicht ──────────────────────────────────────────────────────
  'rechnung.zurueck': { seite: 'Rechnungsansicht', titel: 'Zurück zum Rechnungs-Dashboard', loest_aus: 'Öffnet das Rechnungs-Dashboard.',
    bezug: 'Alle Rechnungen.', aendert: NICHTS, ergebnis: 'Die Kacheln und die Auswertung.', rueckweg: KEIN_RUECKWEG },
  'rechnung.pdf': { seite: 'Rechnungsansicht', titel: 'Rechnungs-PDF', loest_aus: AUSKUNFT,
    bezug: 'Die Datei aus OneDrive – direkt durchgereicht, nirgends zwischengespeichert.', aendert: NICHTS,
    ergebnis: 'Das PDF zum Lesen. Am iPhone zeigt der Rahmen oft nur die erste Seite – dann „PDF in voller Größe“.', rueckweg: KEIN_RUECKWEG },
  'rechnung.vollbild': { seite: 'Rechnungsansicht', titel: 'PDF in voller Größe', loest_aus: 'Öffnet das PDF allein in einem neuen Tab.',
    bezug: 'Die Datei dieser Rechnung.', aendert: NICHTS, ergebnis: 'Alle Seiten, zum Blättern, Zoomen und Drucken.', rueckweg: 'Tab schließen.' },
  'rechnung.onedrive': { seite: 'Rechnungsansicht', titel: 'In OneDrive öffnen', loest_aus: 'Öffnet die Datei in OneDrive, in einem neuen Tab.',
    bezug: 'Die Datei dieser Rechnung.', aendert: NICHTS, ergebnis: 'Die Datei in OneDrive.', rueckweg: 'Tab schließen.' },
  'rechnung.ort': { seite: 'Rechnungsansicht', titel: 'Wo die Mail liegt', loest_aus: AUSKUNFT,
    bezug: 'Die Mail, mit der die Rechnung kam.', aendert: NICHTS, ergebnis: 'Der Ordner im Postfach, live gelesen.', rueckweg: KEIN_RUECKWEG },
  'rechnung.freigeben': { seite: 'Rechnungsansicht', titel: 'Freigeben',
    loest_aus: 'Gibt die Rechnung frei. Mit Lexware-Tarif XL geht sie danach als Beleg nach Lexware.',
    bezug: 'Diese Rechnung.', aendert: 'Stand „freigegeben“, wer und wann, Mail-Kategorie „Rechnung: freigegeben“, Protokoll.',
    ergebnis: 'Die Kachel verschwindet aus „Neue Rechnungen“; die Rechnung steht in der Liste als freigegeben.',
    rueckweg: 'Noch nicht als Knopf – bei Bedarf über Christian (Protokoll zeigt, wer freigegeben hat).' },
  'rechnung.spaeter': { seite: 'Rechnungsansicht', titel: 'Später', loest_aus: 'Stellt die Rechnung zurück.',
    bezug: 'Diese Rechnung.', aendert: 'Merkt sich den Zeitpunkt; Protokoll.', ergebnis: 'Die Kachel rückt nach hinten und wird blasser.',
    rueckweg: 'Später freigeben oder ablehnen – dann zählt die Zurückstellung nicht mehr.' },
  'rechnung.grund': { seite: 'Rechnungsansicht', titel: 'Grund für die Ablehnung', loest_aus: 'Nichts – erst „Ablehnen“ schickt ihn ab.',
    bezug: 'Die Ablehnung dieser Rechnung.', aendert: NICHTS, ergebnis: 'Steht danach bei der Rechnung (höchstens 500 Zeichen).', rueckweg: 'Feld leeren.' },
  'rechnung.ablehnen': { seite: 'Rechnungsansicht', titel: 'Ablehnen', loest_aus: 'Lehnt die Rechnung ab – nur mit Grund.',
    bezug: 'Diese Rechnung.', aendert: 'Stand „abgelehnt“, Grund, die Datei wandert nach „Eingangsrechnungen/Abgelehnt“, Mail-Kategorie „Rechnung: abgelehnt“, Protokoll.',
    ergebnis: 'Die Rechnung wird nicht gebucht und zählt in keiner Summe.', rueckweg: 'Noch nicht als Knopf – bei Bedarf über Christian.' },
  'rechnung.feld.lieferant': { seite: 'Rechnungsansicht', titel: 'Lieferant', loest_aus: 'Nichts – erst „Speichern“.',
    bezug: 'Der Name, unter dem die Rechnung zählt.', aendert: NICHTS, ergebnis: 'Nach dem Speichern in Liste und Auswertung.', rueckweg: 'Alten Namen wieder eintragen.' },
  'rechnung.feld.nummer': { seite: 'Rechnungsansicht', titel: 'Rechnungsnummer', loest_aus: 'Nichts – erst „Speichern“.',
    bezug: 'Die Nummer auf der Rechnung – über sie findet das System sie später in Lexware wieder.', aendert: NICHTS,
    ergebnis: 'Nach dem Speichern in Großbuchstaben, ohne Leerzeichen.', rueckweg: 'Alte Nummer wieder eintragen.' },
  'rechnung.feld.betrag': { seite: 'Rechnungsansicht', titel: 'Betrag', loest_aus: 'Nichts – erst „Speichern“.',
    bezug: 'Der Bruttobetrag in Euro, z. B. 49,95.', aendert: NICHTS, ergebnis: 'Nach dem Speichern in Summen und Diagrammen.', rueckweg: 'Alten Betrag wieder eintragen.' },
  'rechnung.feld.datum': { seite: 'Rechnungsansicht', titel: 'Rechnungsdatum', loest_aus: 'Nichts – erst „Speichern“.',
    bezug: 'Das Datum auf der Rechnung; es entscheidet über Monat und Jahr in der Auswertung.', aendert: NICHTS,
    ergebnis: 'Nach dem Speichern in der Auswertung.', rueckweg: 'Altes Datum wieder eintragen.' },
  'rechnung.speichern': { seite: 'Rechnungsansicht', titel: 'Speichern', loest_aus: 'Speichert Lieferant, Rechnungsnummer, Betrag und Datum.',
    bezug: 'Diese Rechnung.', aendert: 'Die vier Angaben; das Protokoll nennt, welche Felder geändert wurden (nicht die Werte).',
    ergebnis: '„Angaben gespeichert“ oder ein Hinweis, was nicht passt.', rueckweg: 'Alte Werte eintragen und noch einmal speichern.' },
  'rechnung.privat': { seite: 'Rechnungsansicht', titel: 'Haken „privat“',
    loest_aus: 'Wie an der Kachel: nimmt die Rechnung aus der Praxisbuchhaltung bzw. holt sie zurück.', bezug: 'Diese Rechnung.',
    aendert: 'Stand, Ablageort („<Jahr>/Privat“), Mail-Kategorie, Protokoll.', ergebnis: 'Die Seite lädt neu und nennt den neuen Stand.',
    rueckweg: 'Haken wieder entfernen.' },

  // ── Preislisten ─────────────────────────────────────────────────────────
  'menue.preislisten': { seite: 'Menü', titel: 'Preislisten',
    loest_aus: 'Öffnet die Preislisten.', bezug: 'Die eigenen Preise je Leistung, aufgebaut auf der GKV-Vergütungsliste.',
    aendert: NICHTS, ergebnis: 'Die letzten drei Preislisten, welche aktiv ist, und die Grundlagen.', rueckweg: KEIN_RUECKWEG },
  'menue.preislisten-neu': { seite: 'Menü', titel: 'Roter Punkt an „Preislisten“', loest_aus: AUSKUNFT,
    bezug: 'Neue Grundlagen, die die nächtliche Prüfung gefunden hat: GKV-Vergütungsliste, Beihilfe-Höchstbeträge oder eine neue GebüTh-Auflage.',
    aendert: NICHTS, ergebnis: 'Die Zahl nennt, wie viele neue Fassungen noch nicht angesehen sind.', rueckweg: 'Auf der Seite Preislisten „Als gesehen markieren“.' },
  'preislisten.neu-hinweis': { seite: 'Preislisten', titel: 'Neue Grundlage verfügbar', loest_aus: AUSKUNFT,
    bezug: 'Neu gefundene Fassungen der Grundlagen.', aendert: NICHTS,
    ergebnis: 'Bei einer neuen GKV-Liste führt „Neue Preisliste daraus“ direkt zum Anlegen. Eine neue GebüTh-Auflage heißt: Buch bestellen und die Faktoren in einem Muster nachtragen.',
    rueckweg: KEIN_RUECKWEG },
  'preislisten.gesehen': { seite: 'Preislisten', titel: 'Als gesehen markieren', loest_aus: 'Markiert alle neuen Grundlagen als gesehen.',
    bezug: 'Den roten Punkt am Menü.', aendert: 'Merkt sich, wer wann gesehen hat.', ergebnis: 'Der rote Punkt verschwindet, bis wieder etwas Neues kommt.',
    rueckweg: 'Nicht nötig – die Grundlagen bleiben gespeichert und wählbar.' },
  'preislisten.kachel': { seite: 'Preislisten', titel: 'Preislisten-Kachel', loest_aus: 'Ein Klick öffnet die Details der Preisliste.',
    bezug: 'Eine der drei neuesten Preislisten (archivierte nicht).', aendert: NICHTS,
    ergebnis: 'Name, Status, Grundlage (GKV-Fassung und Abrufdatum), Beihilfe-Stand, Vorlage, Erstellungs- und Freigabedatum.', rueckweg: KEIN_RUECKWEG },
  'preislisten.aktiv': { seite: 'Preislisten', titel: 'Haken „aktiv“',
    loest_aus: 'Schaltet die Preisliste für Patienten wählbar (an) oder nicht (aus). Mehrere Listen können aktiv sein – etwa „Gerundet“ und „Tagesgast“.', bezug: 'Nur freigegebene Preislisten; Entwürfe sind grau. Der Standard bleibt immer aktiv, sein Haken ist gesperrt.',
    aendert: 'Den Haken; Eintrag im Protokoll. Patienten, die eine nun inaktive Liste zugeordnet haben, rechnen ab sofort nach dem Standard – ihre Zuordnung bleibt gespeichert.', ergebnis: 'Aktive Listen stehen beim Patienten unter Stammdaten zur Wahl.',
    rueckweg: 'Haken wieder setzen.' },
  'preislisten.standard': { seite: 'Preislisten', titel: 'Standard',
    loest_aus: 'Macht diese Preisliste zum Standard – genau eine kann es sein; sie wird dabei aktiv.', bezug: 'Der Standard gilt für jeden Patienten ohne eigene Preisliste (W97) – also für die meisten.',
    aendert: 'Die bisherige Standard-Liste verliert den Punkt, bleibt aber aktiv; Protokoll. Rechnungen ändern sich nicht: fertige nie, Entwürfe erst auf Knopfdruck („Preise übernehmen“).', ergebnis: 'Neue Rechnungsentwürfe für Patienten ohne eigene Liste nehmen diese Preise.',
    rueckweg: 'Eine andere Preisliste als Standard setzen.' },
  'preisliste.umstellen': { seite: 'Preisliste', titel: 'Patienten umstellen',
    loest_aus: 'Stellt alle Patienten, die diese Liste ausdrücklich zugeordnet haben, auf eine andere aktive Liste oder auf den Standard um.', bezug: 'Nur die feste Zuordnung in den Stammdaten. Rechnungen bleiben, wie sie sind.',
    aendert: 'Das Feld Preisliste dieser Patienten; Protokoll mit Anzahl.', ergebnis: 'Neue Entwürfe dieser Patienten rechnen nach der neuen Liste.', rueckweg: 'Beim Patienten die Liste wieder wählen.' },
  'preisliste.nachfolger': { seite: 'Preisliste', titel: 'Nachfolger beim Archivieren',
    loest_aus: 'Wohin die zugeordneten Patienten beim Archivieren wandern: auf eine aktive Liste oder auf den Standard.', bezug: 'Nur Patienten mit fester Zuordnung; alle anderen hatten ohnehin den Standard.',
    aendert: 'Mit dem Archivieren die Zuordnung der Patienten; die archivierte Liste merkt sich den Nachfolger.', ergebnis: 'Im Archiv steht, wohin die Patienten gingen.', rueckweg: 'Wiederherstellen und Patienten zurückstellen.' },
  'rechnung.preise': { seite: 'Rechnung', titel: 'Preise aus der aktuellen Preisliste übernehmen',
    loest_aus: 'Stellt diesen Entwurf auf die Preisliste um, die heute für den Patienten gilt, und rechnet alle Positionen mit Leistungsnummer neu.', bezug: 'Nur Entwürfe. Erscheint, wenn sich die Liste des Patienten oder der Standard geändert hat, seit der Entwurf entstand. Eine fertige Rechnung ändert sich nie (GoBD, § 14 UStG) – sie trägt Preisliste und Einzelpreise vom Zeitpunkt der Erstellung.',
    aendert: 'Preisliste der Rechnung, Einzelpreis und Betrag der Positionen, Summen; Protokoll.', ergebnis: 'Meldung, wie viele Positionen angepasst wurden; Wellness- und Handpositionen bleiben.', rueckweg: 'Positionen von Hand ändern – oder gar nicht drücken: der Entwurf behält die alten Preise.' },
  'preislisten.neu': { seite: 'Preislisten', titel: 'Neu', loest_aus: 'Prüft zuerst, ob es neue Grundlagen gibt, und öffnet dann das Anlegen.',
    bezug: 'Eine neue Preisliste.', aendert: 'Beim Prüfen werden neue Grundlagen gespeichert.', ergebnis: 'Die Seite „Neue Preisliste“.', rueckweg: 'Zurück zu Preislisten.' },
  'preislisten.bearbeiten': { seite: 'Preislisten', titel: 'Bearbeiten', loest_aus: 'Öffnet die Liste aller Preislisten zum Auswählen.',
    bezug: 'Alle nicht archivierten Preislisten.', aendert: NICHTS, ergebnis: 'Name, Grundlage, Daten und Status; ein Klick öffnet die Preisliste.', rueckweg: KEIN_RUECKWEG },
  'preislisten.pruefen': { seite: 'Preislisten', titel: 'Prüfen', loest_aus: 'Holt jetzt GKV-Liste, Beihilfe-Höchstbeträge und GebüTh-Auflage – sonst geschieht das jede Nacht um 3 Uhr.',
    bezug: 'Die drei Grundlagen.', aendert: 'Neue Fassungen werden mit Original gespeichert.', ergebnis: 'Eine Meldung je Grundlage: neu, unverändert oder Fehler.', rueckweg: KEIN_RUECKWEG },
  'preislisten.archiv': { seite: 'Preislisten', titel: 'Archiv', loest_aus: 'Öffnet die archivierten Preislisten.',
    bezug: 'Preislisten, die für Rechnungen nicht mehr wählbar sind.', aendert: NICHTS, ergebnis: 'Die Liste mit „Wiederherstellen“.', rueckweg: KEIN_RUECKWEG },
  ...Object.fromEntries((['gkv', 'beihilfe', 'gebueth'] as const).map((art) => [`preislisten.quelle.${art}`, {
    seite: 'Preislisten', titel: { gkv: 'Grundlage: GKV-Vergütungsliste', beihilfe: 'Grundlage: Beihilfe-Höchstbeträge', gebueth: 'Grundlage: GebüTh' }[art],
    loest_aus: AUSKUNFT,
    bezug: {
      gkv: 'Die amtliche Vergütungsliste Physiotherapie (Anlage 2 zum Vertrag nach § 125 SGB V) des GKV-Spitzenverbands – Preis je Position, Basis für den Faktor.',
      beihilfe: 'Die Höchstbeträge der Bundesbeihilfe (Anlage 9 BBhV) – zeigt, wie viel ein beihilfeberechtigter Patient erstattet bekommt.',
      gebueth: 'Die Gebührenübersicht für Therapeuten (Buch, Buchner & Partner). Es gibt sie nicht zum Herunterladen; ihre Empfehlungen kommen über ein Muster.',
    }[art],
    aendert: NICHTS, ergebnis: art === 'gebueth' ? 'Welche Auflage zuletzt erschienen ist.' : 'Fassung und Abrufdatum; „Original“ zeigt bzw. lädt das gespeicherte Dokument.',
    rueckweg: KEIN_RUECKWEG,
  } satisfies HilfeEintrag])),
  'preisliste.feld.name': { seite: 'Preisliste', titel: 'Name', loest_aus: 'Nichts – erst „Anlegen“ bzw. „Speichern“.', bezug: 'Diese Preisliste.', aendert: NICHTS, ergebnis: 'So heißt sie in Kacheln und Listen.', rueckweg: 'Anderen Namen eintragen.' },
  'preisliste.grundlage': { seite: 'Preisliste', titel: 'Grundlage', loest_aus: 'Nichts – erst „Anlegen“.',
    bezug: 'Woraus die Positionen kommen: eine GKV-Fassung oder eine andere Preisliste (dann mit deren Faktoren und Preisen).', aendert: NICHTS,
    ergebnis: 'Wird beim Anlegen festgehalten und lässt sich danach nicht mehr ändern.', rueckweg: 'Andere Grundlage wählen, bevor angelegt wird.' },
  'preisliste.feld.beihilfe': { seite: 'Preisliste', titel: 'Beihilfe zum Vergleich', loest_aus: 'Nichts – erst „Anlegen“.',
    bezug: 'Welche Fassung der Beihilfe-Höchstbeträge neben den eigenen Preisen steht.', aendert: NICHTS,
    ergebnis: 'Jede Position bekommt einen passenden Höchstbetrag (Vorschlag), änderbar in der Positionsansicht.', rueckweg: '„keine“ wählen.' },
  'preisliste.feld.vorlage': { seite: 'Preisliste', titel: 'Muster übernehmen', loest_aus: 'Nichts – erst „Anlegen“.',
    bezug: 'Ein gespeichertes Muster: welche Positionen übernommen werden (Haken), mit welchem Faktor und ob aufgerundet wird – etwa die GebüTh-Empfehlungen. Vorgewählt ist das zuletzt geänderte.',
    aendert: NICHTS, ergebnis: 'Haken und Faktoren sind vorbelegt; Positionen, die nicht im Muster stehen, sind abgewählt.', rueckweg: '„keins“ wählen.' },
  'preisliste.feld.faktor': { seite: 'Preisliste', titel: 'Allgemeiner Faktor', loest_aus: 'Nichts – erst „Anlegen“ bzw. „auf alle anwenden“.',
    bezug: 'Der Faktor auf den GKV-Preis, z. B. 1,3 = 30 % über GKV.', aendert: NICHTS,
    ergebnis: 'Vorbelegung für jede Position ohne eigenen Faktor aus dem Muster.', rueckweg: 'Feld leeren.' },
  'preisliste.anlegen': { seite: 'Preisliste', titel: 'Preisliste anlegen', loest_aus: 'Legt die Preisliste als Entwurf an.',
    bezug: 'Grundlage, Beihilfe, Muster, Faktor und Aufrunden wie gewählt.', aendert: 'Eine neue Preisliste mit allen Positionen der Grundlage; Erstellungsdatum fest.',
    ergebnis: 'Die Bearbeitungsseite.', rueckweg: 'Den Entwurf dort löschen.' },
  'preislisten.auswahl': { seite: 'Preislisten', titel: 'Alle Preislisten', loest_aus: 'Ein Klick auf eine Zeile öffnet die Preisliste – Entwürfe zum Bearbeiten, freigegebene in den Details.',
    bezug: 'Alle nicht archivierten Preislisten, neueste oben.', aendert: NICHTS, ergebnis: 'Name, Grundlage, Daten und Status (erstellt, freigegeben, genutzt).', rueckweg: KEIN_RUECKWEG },
  'preislisten.archivliste': { seite: 'Preislisten', titel: 'Archivierte Preislisten', loest_aus: AUSKUNFT,
    bezug: 'Preislisten, die für Rechnungen nicht mehr wählbar sind.', aendert: NICHTS, ergebnis: 'Wann sie archiviert wurden.', rueckweg: '„Wiederherstellen“.' },
  'preislisten.wiederherstellen': { seite: 'Preislisten', titel: 'Wiederherstellen', loest_aus: 'Holt die Preisliste aus dem Archiv zurück.',
    bezug: 'Diese Preisliste.', aendert: 'Status „freigegeben“; Protokoll.', ergebnis: 'Sie ist wieder wählbar, aber nicht aktiv.', rueckweg: 'Wieder archivieren.' },
  'preislisten.wiederherstellen-aktiv': { seite: 'Preislisten', titel: 'Wiederherstellen und aktiv setzen', loest_aus: 'Holt die Preisliste zurück und macht sie zur aktiven.',
    bezug: 'Diese Preisliste.', aendert: 'Status „freigegeben“, aktiv; die bisher aktive verliert den Haken; Protokoll.', ergebnis: 'Neue Rechnungen verwenden wieder diese Preise.', rueckweg: 'Eine andere Preisliste aktiv setzen.' },
  'preisliste.kopfdaten': { seite: 'Preisliste', titel: 'Angaben zur Preisliste', loest_aus: AUSKUNFT,
    bezug: 'Grundlage mit Version und Datum, Beihilfe-Stand, Muster, Erstellungsdatum (fest), Status.', aendert: NICHTS,
    ergebnis: '„Original“ öffnet das gespeicherte GKV-Dokument.', rueckweg: KEIN_RUECKWEG },
  'preisliste.faktor-alle': { seite: 'Preisliste', titel: 'Faktor auf alle anwenden', loest_aus: 'Trägt den allgemeinen Faktor in jede übernommene Zeile ein und rechnet die Preise neu.',
    bezug: 'Alle Zeilen mit Haken.', aendert: 'Nur die Eingaben – gespeichert wird erst mit „Speichern“.', ergebnis: 'Neue Faktoren und Preise in der Tabelle.', rueckweg: '„Verwerfen“.' },
  'preisliste.tabelle': { seite: 'Preisliste', titel: 'Positionen', loest_aus: 'Ein Klick auf eine Zeile (nicht auf ein Feld) öffnet alle Angaben zur Position.',
    bezug: 'Alle Positionen der Grundlage – je Zeile ID, Kürzel, Name, Regelzeit, Beihilfe-Höchstbetrag, GKV-Preis, Faktor, eigener Preis.',
    aendert: NICHTS, ergebnis: 'Rot markiert: eigener Preis über dem Beihilfe-Höchstbetrag – die Differenz zahlt ein beihilfeberechtigter Patient selbst.', rueckweg: KEIN_RUECKWEG },
  'preisliste.uebernehmen': { seite: 'Preisliste', titel: 'Übernehmen', loest_aus: 'Nimmt die Position in die Preisliste auf oder heraus.',
    bezug: 'Diese Position.', aendert: 'Erst mit „Speichern“.', ergebnis: 'Abgewählte Zeilen sind blass und erscheinen nicht in Rechnungen.', rueckweg: 'Haken wieder setzen.' },
  'preisliste.position': { seite: 'Preisliste', titel: 'Position', loest_aus: 'Öffnet alle Angaben zur Position.', bezug: 'Diese Position.', aendert: NICHTS,
    ergebnis: 'GKV-Originaltext, Hinweise, Zuzahlung, Beihilfe-Zuordnung, eigene Werte.', rueckweg: 'Zurück zur Preisliste.' },
  'preisliste.faktor': { seite: 'Preisliste', titel: 'Faktor', loest_aus: 'Beim Tippen rechnet sich der eigene Preis mit (GKV-Preis × Faktor).',
    bezug: 'Diese Position.', aendert: 'Erst mit „Speichern“.', ergebnis: 'Der eigene Preis daneben ändert sich sofort.', rueckweg: '„Verwerfen“.' },
  'preisliste.preis': { seite: 'Preisliste', titel: 'Eigener Preis', loest_aus: 'Beim Tippen rechnet sich der Faktor mit (Preis ÷ GKV-Preis).',
    bezug: 'Diese Position.', aendert: 'Erst mit „Speichern“ – beim Speichern zählt der Preis, der Faktor folgt ihm.', ergebnis: 'Der Faktor daneben ändert sich sofort.', rueckweg: '„Verwerfen“.' },
  'preisliste.speichern': { seite: 'Preisliste', titel: 'Speichern', loest_aus: 'Speichert Name, Faktoren, Preise und Haken.', bezug: 'Diesen Entwurf.',
    aendert: 'Die Preisliste; Protokoll.', ergebnis: '„Gespeichert.“ oder ein Hinweis, was nicht passt. Weicht die Liste danach von ihrem Muster ab, fragt die Seite, ob es ein neues Muster geben soll.', rueckweg: 'Werte ändern und noch einmal speichern.' },
  'preisliste.verwerfen': { seite: 'Preisliste', titel: 'Verwerfen', loest_aus: 'Lädt die Preisliste neu – ungespeicherte Änderungen gehen verloren.', bezug: 'Diese Seite.',
    aendert: NICHTS, ergebnis: 'Der zuletzt gespeicherte Stand.', rueckweg: KEIN_RUECKWEG },
  'preisliste.freigeben': { seite: 'Preisliste', titel: 'Freigeben', loest_aus: 'Macht die Preisliste final – danach nicht mehr änderbar.',
    bezug: 'Diesen Entwurf; jede übernommene Position braucht einen Preis.', aendert: 'Status „freigegeben“, Freigabedatum und wer; Protokoll.',
    ergebnis: 'Sie kann jetzt aktiv gesetzt werden.', rueckweg: 'Keiner – Änderungen über „Als neue Preisliste kopieren“.' },
  'preisliste.vorlage-name': { seite: 'Preisliste', titel: 'Name des Musters', loest_aus: 'Nichts – erst „Als Muster speichern“.', bezug: 'Das neue Muster.',
    aendert: NICHTS, ergebnis: 'Gleicher Name wie ein vorhandenes Muster: es wird überschrieben.', rueckweg: 'Anderen Namen wählen.' },
  'preisliste.vorlage': { seite: 'Preisliste', titel: 'Als Muster speichern', loest_aus: 'Speichert Haken, Faktoren, allgemeinen Faktor und Aufrunden dieser Preisliste als Muster – z. B. „GebüTh 15. Auflage“.',
    bezug: 'Den gespeicherten Stand dieser Preisliste (vorher speichern).', aendert: 'Ein Muster; die Preisliste folgt ihm; Protokoll.', ergebnis: 'Beim nächsten „Neu“ als Muster wählbar.', rueckweg: 'Unter gleichem Namen neu speichern.' },
  'preisliste.loeschen': { seite: 'Preisliste', titel: 'Löschen', loest_aus: 'Löscht den Entwurf mit allen Positionen.',
    bezug: 'Nur Entwürfe, die in keiner Rechnung stehen.', aendert: 'Die Preisliste ist weg; das Protokoll behält den Namen.', ergebnis: 'Zurück zu den Preislisten.', rueckweg: 'Keiner – neu anlegen.' },
  'preisliste.metadaten': { seite: 'Preisliste', titel: 'Angaben', loest_aus: AUSKUNFT,
    bezug: 'Alles über diese Preisliste: Status, Grundlagen mit Original, Muster, Faktor, Aufrunden, Daten und wer.', aendert: NICHTS,
    ergebnis: 'Woraus die Preise stammen und wer sie wann erstellt und freigegeben hat – auch Jahre später nachvollziehbar.', rueckweg: KEIN_RUECKWEG },
  'preisliste.verwendung': { seite: 'Preisliste', titel: 'Verwendet', loest_aus: AUSKUNFT,
    bezug: 'Bei welchen Patienten und in welchen Rechnungen diese Preisliste steht.', aendert: NICHTS,
    ergebnis: 'Sobald sie in einer Rechnung steht, heißt sie „genutzt“ und lässt sich nicht mehr löschen.', rueckweg: KEIN_RUECKWEG },
  'preisliste.aktionen': { seite: 'Preisliste', titel: 'Aktionen', loest_aus: 'Je nach Status: Bearbeiten, Freigeben, Aktiv setzen, Archivieren, Wiederherstellen, Kopieren, Löschen.',
    bezug: 'Diese Preisliste.', aendert: 'Siehe die einzelne Aktion.', ergebnis: 'Eine Meldung oben auf der Seite.', rueckweg: 'Siehe die einzelne Aktion.' },
  'preisliste.archivieren': { seite: 'Preisliste', titel: 'Archivieren', loest_aus: 'Legt die Preisliste ins Archiv; zugeordnete Patienten wandern auf den gewählten Nachfolger oder den Standard.',
    bezug: 'Freigegebene Preislisten, die nicht der Standard sind. Rechnungen, die diese Liste verwenden, bleiben unverändert – sie tragen ihre Preise selbst.', aendert: 'Status „archiviert“, Haken aktiv weg, Zuordnung der Patienten; Protokoll.', ergebnis: 'Für Patienten nicht mehr wählbar; im Archiv sichtbar mit dem Nachfolger.', rueckweg: 'Im Archiv „Wiederherstellen“.' },
  'preisliste.kopieren': { seite: 'Preisliste', titel: 'Als neue Preisliste kopieren', loest_aus: 'Öffnet „Neu“ mit dieser Preisliste als Grundlage.',
    bezug: 'Positionen, Faktoren und Preise dieser Preisliste.', aendert: NICHTS, ergebnis: 'Ein neuer Entwurf, den man ändern kann.', rueckweg: 'Den Entwurf löschen.' },
  'position.zurueck': { seite: 'Position', titel: 'Zurück zur Preisliste', loest_aus: 'Öffnet die Preisliste.', bezug: 'Diese Preisliste.', aendert: NICHTS,
    ergebnis: 'Die Tabelle aller Positionen – im Entwurf zum Bearbeiten, sonst die Details.', rueckweg: KEIN_RUECKWEG },
  'position.eigene': { seite: 'Position', titel: 'Eigene Angaben', loest_aus: AUSKUNFT, bezug: 'Faktor, eigener Preis und die Differenz zu GKV-Preis und Beihilfe-Höchstbetrag.',
    aendert: NICHTS, ergebnis: 'Eine positive Differenz zur Beihilfe zahlt ein beihilfeberechtigter Patient selbst.', rueckweg: KEIN_RUECKWEG },
  'position.gkv': { seite: 'Position', titel: 'GKV-Vergütungsliste', loest_aus: AUSKUNFT, bezug: 'Alles, was die GKV-Liste zu dieser Position sagt – auch der Originaltext.',
    aendert: NICHTS, ergebnis: 'Nummer (mit X-Code), Gruppe, Regelzeit, Preis, Zuzahlung, Hinweise.', rueckweg: KEIN_RUECKWEG },
  'position.beihilfe': { seite: 'Position', titel: 'Beihilfe-Zuordnung', loest_aus: AUSKUNFT, bezug: 'Welcher Höchstbetrag der Anlage 9 BBhV zu dieser Position passt.',
    aendert: NICHTS, ergebnis: 'Das System schlägt den ähnlichsten Eintrag vor (★); bei Bedarf von Hand ändern.', rueckweg: KEIN_RUECKWEG },
  'position.zuordnung': { seite: 'Position', titel: 'Zuordnung wählen', loest_aus: 'Nichts – erst „Speichern“.', bezug: 'Die Beihilfe-Einträge, ähnlichste zuerst (★ = guter Treffer).',
    aendert: NICHTS, ergebnis: 'Nach dem Speichern steht der Höchstbetrag in der Tabelle.', rueckweg: 'Anderen Eintrag oder „keine“ wählen.' },
  'position.speichern': { seite: 'Position', titel: 'Speichern', loest_aus: 'Speichert Zuordnung und Notiz.', bezug: 'Diese Position (nur im Entwurf).',
    aendert: 'Zuordnung, Höchstbetrag, Notiz; Protokoll.', ergebnis: '„Zuordnung gespeichert.“', rueckweg: 'Andere Zuordnung speichern.' },
  'preisliste.aufrunden': { seite: 'Preisliste', titel: 'Aufrunden',
    loest_aus: 'Rundet jeden eigenen Preis auf den nächsten vollen Euro auf – beim Tippen sofort, verbindlich beim Speichern.',
    bezug: 'Alle Positionen dieser Preisliste.', aendert: 'Erst mit „Speichern“; der Faktor folgt dem gerundeten Preis.',
    ergebnis: 'Aus 43,88 € wird 44,00 €, aus 39,01 € wird 40,00 €; ganze Beträge bleiben.', rueckweg: 'Haken entfernen und speichern – die Preise folgen dann wieder dem Faktor auf den Cent.' },
  'preisliste.feld.aufrunden': { seite: 'Preisliste', titel: 'Aufrunden (beim Anlegen)', loest_aus: 'Nichts – erst „Anlegen“.',
    bezug: 'Die neue Preisliste.', aendert: NICHTS, ergebnis: 'Eigene Preise werden auf volle Euro aufgerundet. Hat das Muster „Aufrunden“, gilt es auch ohne Haken.',
    rueckweg: 'Später in der Bearbeitung den Haken entfernen.' },
  'preisliste.muster-frage': { seite: 'Preisliste', titel: 'Neues Muster speichern?', loest_aus: AUSKUNFT,
    bezug: 'Erscheint nach dem Speichern, wenn die Preisliste von ihrem Muster abweicht – bei Haken, Faktoren, allgemeinem Faktor oder Aufrunden.',
    aendert: NICHTS, ergebnis: 'Drei Wege: neues Muster, bestehendes Muster aktualisieren oder alles lassen.', rueckweg: KEIN_RUECKWEG },
  'preisliste.muster-neu': { seite: 'Preisliste', titel: 'Als neues Muster speichern', loest_aus: 'Speichert den jetzigen Stand unter dem eingetragenen Namen als neues Muster.',
    bezug: 'Diese Preisliste.', aendert: 'Ein neues Muster; die Preisliste folgt ab jetzt ihm; Protokoll.', ergebnis: 'Das bisherige Muster bleibt unverändert.',
    rueckweg: 'Das Muster bleibt bestehen; ein anderes lässt sich jederzeit wählen.' },
  'preisliste.muster-aktualisieren': { seite: 'Preisliste', titel: 'Muster aktualisieren', loest_aus: 'Überschreibt das bisherige Muster mit dem jetzigen Stand.',
    bezug: 'Das Muster dieser Preisliste.', aendert: 'Das Muster; Protokoll. Andere Preislisten bleiben, wie sie sind.', ergebnis: 'Künftige Preislisten mit diesem Muster bekommen die neuen Haken und Faktoren.',
    rueckweg: 'Eine Preisliste mit dem alten Stand erneut als Muster speichern.' },
  'preisliste.muster-nein': { seite: 'Preisliste', titel: 'Nein, Muster lassen', loest_aus: 'Schließt die Frage.', bezug: 'Diese Frage.', aendert: NICHTS,
    ergebnis: 'Die Preisliste ist gespeichert, das Muster unverändert.', rueckweg: KEIN_RUECKWEG },
  'preisliste.muster-anwenden': { seite: 'Preisliste', titel: 'Haken aus Muster', loest_aus: 'Setzt die Übernehmen-Haken so, wie das gewählte Muster sie vorsieht.',
    bezug: 'Alle Positionen dieses Entwurfs; Faktoren und Preise bleiben.', aendert: 'Haken und das Muster der Preisliste; Protokoll.',
    ergebnis: 'Positionen, die nicht im Muster stehen, sind abgewählt.', rueckweg: 'Haken von Hand setzen oder ein anderes Muster übernehmen.' },

  // ── Testumgebung ─────────────────────────────────────────────────────────
  'umgebung.test': { seite: 'Testumgebung', titel: 'Band „TESTUMGEBUNG“', loest_aus: AUSKUNFT,
    bezug: 'Diese ganze Anwendung: die Testumgebung, in der neue Funktionen vor Lillis Abnahme laufen.',
    aendert: NICHTS,
    ergebnis: 'Hier sind alle Patienten erfunden. Mails gehen nur an Testadressen, Termine nur in den Kalender „Praxis-Test“, Entwürfe tragen die Kategorie „TEST“. Rechnungen, Ablage und Zahlungen verändert nur die echte Praxis-Anwendung.',
    rueckweg: KEIN_RUECKWEG },

  // ── Status ────────────────────────────────────────────────────────────────
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

  // ── Patienten (W63–W68) ───────────────────────────────────────────────────
  'patienten.suche': { seite: 'Patienten', titel: 'Suche',
    loest_aus: 'Filtert die Kacheln nach dem, was du eintippst – Name, Patientennummer, Telefonnummer oder Mailadresse.', bezug: 'Alle aktiven Patienten (im Archiv: die archivierten).',
    aendert: NICHTS, ergebnis: 'Nur passende Kacheln bleiben stehen.', rueckweg: 'Feld leeren und erneut suchen.' },
  'patienten.neu': { seite: 'Patienten', titel: 'Neu',
    loest_aus: 'Öffnet das Formular für einen neuen Patienten.', bezug: 'Die Kartei.', aendert: 'Noch nichts – erst „Patient anlegen“ speichert.',
    ergebnis: 'Ein Formular mit Name, Geburtsdatum, Kontaktwegen und Adresse.', rueckweg: 'Zurück zur Liste, ohne zu speichern.' },
  'patienten.archiv': { seite: 'Patienten', titel: 'Archiv',
    loest_aus: 'Zeigt archivierte Patienten.', bezug: 'Patienten, die nicht mehr in Behandlung sind. Ihre Akte bleibt zehn Jahre erhalten (§ 630f BGB).',
    aendert: NICHTS, ergebnis: 'Dieselben Kacheln, grau markiert; in den Stammdaten lässt sich ein Patient wieder aktiv setzen.', rueckweg: 'Knopf „Aktive Patienten“.' },
  // ── Kunden aus Lexware (W99) ──────────────────────────────────────────────
  'patienten.lexware': { seite: 'Patienten', titel: 'Aus Lexware',
    loest_aus: 'Zeigt die Kunden aus Lexware Office neben der Kartei: wer schon Patient ist, wer wahrscheinlich und wer noch fehlt.',
    bezug: 'Alle Kontakte mit der Rolle „Kunde“ in Lexware – nur gelesen, über den Schlüssel der Praxis. In der Testumgebung sind es erfundene Kunden.',
    aendert: NICHTS, ergebnis: 'Kundenkacheln in drei Gruppen: noch nicht in der Kartei, wahrscheinlich schon Patient, verknüpft.', rueckweg: 'Knopf „Alle Patienten“.' },
  'lexware.suche': { seite: 'Aus Lexware', titel: 'Suche',
    loest_aus: 'Filtert die Kundenkacheln nach Name, Firma, Kundennummer, Ort oder Mailadresse.', bezug: 'Die Kunden aus Lexware.',
    aendert: NICHTS, ergebnis: 'Nur passende Kacheln bleiben stehen.', rueckweg: 'Feld leeren und erneut suchen.' },
  'lexware.neuladen': { seite: 'Aus Lexware', titel: 'Neu laden',
    loest_aus: 'Holt die Kunden frisch aus Lexware statt aus dem Zwischenspeicher, der fünf Minuten hält.', bezug: 'Lexware Office (höchstens zwei Anfragen je Sekunde).',
    aendert: NICHTS, ergebnis: 'Die Liste zeigt den Stand von jetzt – auch Kunden, die gerade erst in Lexware angelegt wurden.', rueckweg: KEIN_RUECKWEG },
  'lexware.kachel': { seite: 'Aus Lexware', titel: 'Kundenkachel',
    loest_aus: 'Zeigt einen Lexware-Kunden: Name oder Firma, Kundennummer, Telefon, Mail, Rechnungsadresse, Anrede. Eine Notiz in Lexware wird nur erwähnt, nicht gezeigt.',
    bezug: 'Ein Kontakt aus Lexware mit Kundenrolle. „Firma“ heißt: in Lexware als Firma angelegt – oft sind das trotzdem Personen; dann steht der geratene Name dabei.',
    aendert: NICHTS,
    ergebnis: 'Der linke Rand: gestrichelt grau = noch nicht in der Kartei, gelb = wahrscheinlich schon Patient (gleicher Name), grün = verknüpft über die Kundennummer.', rueckweg: KEIN_RUECKWEG },
  'lexware.auswahl': { seite: 'Aus Lexware', titel: 'Für die Sammelübernahme auswählen',
    loest_aus: 'Setzt den Haken für „Ausgewählte als Patienten anlegen“.', bezug: 'Ein Kunde, der noch nicht in der Kartei ist. Bei Firmen ohne Personennamen ist der Haken gesperrt – die bitte einzeln anlegen.',
    aendert: 'Noch nichts.', ergebnis: 'Der Kunde ist markiert.', rueckweg: 'Haken wieder entfernen.' },
  'lexware.anlegen-mehrere': { seite: 'Aus Lexware', titel: 'Ausgewählte als Patienten anlegen',
    loest_aus: 'Legt alle markierten Kunden auf einen Klick als Patienten an – mit Anrede, Name, Mail, Telefon, Rechnungsadresse und der Lexware-Kundennummer (W99b).',
    bezug: 'Die angehakten Kunden der Gruppe „Noch nicht in der Kartei“.', aendert: 'Legt Patienten an (Patient seit = heute) und verknüpft sie; das Protokoll vermerkt nur Zahlen. Nichts in Lexware.',
    ergebnis: 'Die Meldung nennt, wie viele angelegt und welche übersprungen wurden (schon verknüpft, Firma ohne Personenname).', rueckweg: 'Einen angelegten Patienten archivieren und die Verknüpfung lösen.' },
  'lexware.anlegen': { seite: 'Aus Lexware', titel: 'Als Patient anlegen',
    loest_aus: 'Öffnet „Neuer Patient“ mit Anrede, Name, Mail, Telefon und Adresse aus Lexware.', bezug: 'Dieser Lexware-Kunde.',
    aendert: 'Noch nichts – erst „Patient anlegen“ speichert. Dann trägt der Patient die Lexware-Kundennummer.',
    ergebnis: 'Das Formular zum Prüfen und Ergänzen (Geburtsdatum, WhatsApp). Bei Firmen sind Vor- und Nachname geraten – bitte prüfen.', rueckweg: 'Zurück zur Liste, ohne zu speichern.' },
  'lexware.zuordnen': { seite: 'Aus Lexware', titel: 'Zuordnen',
    loest_aus: 'Verknüpft den Lexware-Kunden mit dem Patienten gleichen Namens.', bezug: 'Der Patient, dessen Name passt – vorher prüfen, ob es wirklich dieselbe Person ist.',
    aendert: 'Schreibt nur die Lexware-Kundennummer in die Stammdaten des Patienten (Protokoll ohne Namen); Adresse und Kontakte bleiben, wie sie in der Kartei sind.',
    ergebnis: 'Die Kachel wandert nach „Verknüpft“; auf der Patientenseite steht „Lexware <Nummer>“.', rueckweg: '„Verknüpfung lösen“ auf der Kachel.' },
  'lexware.patient': { seite: 'Aus Lexware', titel: 'Verknüpfter Patient',
    loest_aus: 'Öffnet die Patientenseite des verknüpften Patienten.', bezug: 'Der Patient, der diese Lexware-Kundennummer trägt.',
    aendert: NICHTS, ergebnis: 'Die Patientenseite.', rueckweg: KEIN_RUECKWEG },
  'lexware.loesen': { seite: 'Aus Lexware', titel: 'Verknüpfung lösen',
    loest_aus: 'Nimmt die Lexware-Kundennummer vom Patienten.', bezug: 'Der verknüpfte Patient.',
    aendert: 'Löscht Kundennummer und Kontakt-ID in den Stammdaten (Protokoll ohne Namen). In Lexware ändert sich nichts.',
    ergebnis: 'Die Kachel steht wieder unter „Noch nicht in der Kartei“ oder „Wahrscheinlich schon Patient“.', rueckweg: 'Erneut zuordnen.' },
  'patienten.kachel': { seite: 'Patienten', titel: 'Patientenkachel',
    loest_aus: 'Der Name öffnet die Patientenseite; Telefon, WhatsApp und Mail sind echte Links; „+“ legt Neues an.',
    bezug: 'Ein Patient: Name, Hinweise (Ansprache, Besonderheiten), die primären Kontaktwege, Patient seit, letzte Behandlung, nächster Termin.',
    aendert: 'Nichts beim Ansehen. Ein Tipp auf einen Kontaktweg vermerkt den Kontakt im Verlauf.',
    ergebnis: 'Der linke Rand ist gelb, wenn eine Rechnung überfällig ist, und rot, wenn sie länger als 14 Tage überfällig oder gemahnt ist.', rueckweg: KEIN_RUECKWEG },
  'kachel.telefon': { seite: 'Patienten', titel: 'Anrufen',
    loest_aus: 'Am Handy: startet den Anruf unter der primären Nummer (Mobil vor Festnetz). Am Rechner: öffnet das Telefonprogramm, falls eins eingerichtet ist.',
    bezug: 'Der primäre Telefonkontakt des Patienten.', aendert: 'Legt im Kontaktverlauf einen offenen Eintrag „Anruf“ an.',
    ergebnis: 'Nach dem Gespräch fragt die Patientenseite nach dem Gesprächsgrund (Terminverschiebung, Absage …).', rueckweg: 'Kam kein Gespräch zustande: beim offenen Eintrag „kein Gespräch – verwerfen“.' },
  'kachel.whatsapp': { seite: 'Patienten', titel: 'WhatsApp',
    loest_aus: 'Öffnet WhatsApp mit dem Chat dieses Patienten (wa.me-Link).', bezug: 'Die WhatsApp-Nummer des Patienten – nur, wenn er eingewilligt hat (Einwilligung im Datenmodell, Frage 11 an Lilli).',
    aendert: 'Vermerkt „WhatsApp“ im Kontaktverlauf.', ergebnis: 'WhatsApp zeigt den Chat; geschrieben wird dort von dir.', rueckweg: 'Den offenen Eintrag im Verlauf verwerfen.' },
  'kachel.email': { seite: 'Patienten', titel: 'E-Mail',
    loest_aus: 'Öffnet eine neue Mail an den Patienten im Mailprogramm.', bezug: 'Die primäre Mailadresse.', aendert: 'Vermerkt „E-Mail“ im Kontaktverlauf.',
    ergebnis: 'Das Mailprogramm mit vorbelegter Adresse; der Text kommt von dir.', rueckweg: 'Den offenen Eintrag im Verlauf verwerfen.' },
  'kachel.behandlung': { seite: 'Patienten', titel: 'Letzte Behandlung',
    loest_aus: 'Öffnet die Akte und springt zur letzten Behandlung.', bezug: 'Der neueste Eintrag in der Behandlungsdokumentation.', aendert: 'Das Öffnen der Akte steht im Protokoll (wer, wann – ohne Inhalte).',
    ergebnis: 'Der Behandlungsverlauf mit allen Fällen.', rueckweg: 'Zurück zur Patientenseite oder zur Liste.' },
  'kachel.termin': { seite: 'Patienten', titel: 'Nächster Termin',
    loest_aus: 'Springt zu den Terminen auf der Patientenseite.', bezug: 'Der nächste bestätigte Termin – „Rezept“ heißt: er gehört zu einer Verordnung, „Individual“: ohne Rezept.',
    aendert: NICHTS, ergebnis: 'Die Terminliste mit Absagen und „nicht erschienen“.', rueckweg: KEIN_RUECKWEG },
  'kachel.status': { seite: 'Patienten', titel: 'Rechnung überfällig / im Verzug',
    loest_aus: AUSKUNFT, bezug: 'Offene Rechnungen des Patienten. Gelb: Fälligkeit überschritten. Rot: länger als 14 Tage oder bereits gemahnt (Vorschlag, E25).',
    aendert: NICHTS, ergebnis: 'Die Kachel bekommt denselben Farbrand.', rueckweg: 'Verschwindet, sobald die Rechnung bezahlt oder storniert ist.' },
  'kachel.offen': { seite: 'Patienten', titel: 'Gespräch ohne Grund',
    loest_aus: 'Springt zum offenen Eintrag im Kontaktverlauf.', bezug: 'Anrufe oder Nachrichten, bei denen der Gesprächsgrund noch fehlt.',
    aendert: NICHTS, ergebnis: 'Dort wählst du den Grund mit einem Tipp.', rueckweg: KEIN_RUECKWEG },
  'kachel.plus': { seite: 'Patienten', titel: '„+“ – neue Aktivität',
    loest_aus: 'Klappt das Menü auf: Termin, Behandlung, Rezept, Rechnung.', bezug: 'Dieser Patient.', aendert: 'Noch nichts – erst das jeweilige Formular speichert.',
    ergebnis: 'Vier Einträge; „Neue Rechnung“ kommt mit Lexware XL und ist bis dahin grau.', rueckweg: 'Noch einmal auf „+“ oder daneben tippen.' },
  'plus.termin': { seite: 'Patienten', titel: 'Neuer Termin',
    loest_aus: 'Öffnet das Terminformular.', bezug: 'Dieser Patient, wahlweise ein aktives Rezept.', aendert: 'Noch nichts.',
    ergebnis: 'Datum, Uhrzeit, Dauer, Art und Rezept wählen.', rueckweg: 'Zurück ohne Speichern.' },
  'plus.behandlung': { seite: 'Patienten', titel: 'Neue Behandlung',
    loest_aus: 'Öffnet das Formular „Behandlung erfassen“.', bezug: 'Die Akte dieses Patienten.', aendert: 'Noch nichts.',
    ergebnis: 'Fall wählen oder neu anlegen, Rezept abhaken, Maßnahmen und Verlauf eintragen.', rueckweg: 'Zurück ohne Speichern.' },
  'plus.rezept': { seite: 'Patienten', titel: 'Neues Rezept',
    loest_aus: 'Öffnet das Rezeptformular.', bezug: 'Dieser Patient.', aendert: 'Noch nichts.',
    ergebnis: 'Ausstellungsdatum, Ärztin/Arzt, Maßnahme, Anzahl, Diagnose.', rueckweg: 'Zurück ohne Speichern.' },
  'plus.rechnung': { seite: 'Patienten', titel: 'Neue Rechnung',
    loest_aus: 'Springt zu den Rechnungen des Patienten – dort „Neue Rechnung Heilbehandlung“ oder „Wellness“.', bezug: 'Rezepte und Serien legen ihren Entwurf schon selbst an; hier für Einzelleistungen.',
    aendert: 'Noch nichts.', ergebnis: 'Der Abschnitt Rechnungen.', rueckweg: KEIN_RUECKWEG },
  'patient.neu.formular': { seite: 'Patienten', titel: 'Formular „Neuer Patient“',
    loest_aus: 'Nichts, bis „Patient anlegen“ gedrückt wird.', bezug: 'Stammdaten nach § 630f BGB und für die Rechnung: Name, Geburtsdatum, Kontaktwege, Adresse. Ansprache und Besonderheiten nur auf Wunsch.',
    aendert: 'Beim Anlegen: ein neuer Patient mit fortlaufender Nummer; die erste Adresse wird Rechnungsadresse; der Haken macht die Mobilnummer auch zur WhatsApp-Nummer.',
    ergebnis: 'Die Patientenseite mit Kachel.', rueckweg: 'Stammdaten lassen sich jederzeit ändern; einen versehentlich angelegten Patienten ohne Akte archivierst du.' },
  'patient.anlegen': { seite: 'Patienten', titel: 'Patient anlegen',
    loest_aus: 'Speichert den neuen Patienten.', bezug: 'Die Angaben im Formular.', aendert: 'Patient, Kontaktwege und Adresse in der Kartei; Protokolleintrag.',
    ergebnis: 'Die Patientenseite.', rueckweg: 'Stammdaten ändern oder archivieren.' },
  'patient.akte': { seite: 'Patient', titel: 'Akte / Behandlungsverlauf',
    loest_aus: 'Öffnet die Behandlungsdokumentation.', bezug: 'Alle Fälle und Behandlungen des Patienten – Gesundheitsdaten, verschlüsselt gespeichert.',
    aendert: 'Das Öffnen steht im Protokoll (wer, wann), ohne Inhalte.', ergebnis: 'Die Akte, neuester Fall zuerst.', rueckweg: KEIN_RUECKWEG },
  'verlauf.anruf-vermerken': { seite: 'Patient', titel: 'Anruf vermerken',
    loest_aus: 'Legt einen offenen Eintrag „Anruf“ an – für Anrufe vom Festnetz oder wenn der Tipp auf die Nummer nicht vermerkt wurde.', bezug: 'Der Kontaktverlauf dieses Patienten.',
    aendert: 'Ein Eintrag mit Zeitpunkt, noch ohne Grund.', ergebnis: 'Oben im Verlauf erscheint die Frage nach dem Gesprächsgrund.', rueckweg: '„kein Gespräch – verwerfen“.' },
  'verlauf.offen': { seite: 'Patient', titel: 'Worum ging es?',
    loest_aus: 'Nichts, bis du einen Grund wählst und „Eintragen“ drückst.', bezug: 'Ein Anruf oder eine Nachricht ohne Gesprächsgrund.',
    aendert: 'Beim Eintragen: Grund und Notiz (verschlüsselt) am Eintrag; er gilt dann als erledigt.', ergebnis: 'Der Eintrag wandert in die Liste darunter.', rueckweg: 'Einträge bleiben; ein Irrtum wird mit einem weiteren Eintrag richtiggestellt.' },
  'verlauf.grund': { seite: 'Patient', titel: 'Gesprächsgrund',
    loest_aus: 'Wählt den Grund – ein Tipp genügt.', bezug: 'Die Standardbegriffe: Terminvereinbarung, Terminverschiebung, Absage Patient, Absage Praxis, Erinnerung, Rückfragen, Nicht erreicht, Sonstiges. Lilli kann die Liste erweitern (Frage 16).',
    aendert: 'Nichts, bis „Eintragen“ gedrückt wird.', ergebnis: 'Der gewählte Begriff ist farbig markiert.', rueckweg: 'Anderen Begriff wählen.' },
  'verlauf.verwerfen': { seite: 'Patient', titel: 'kein Gespräch – verwerfen',
    loest_aus: 'Löscht den offenen Eintrag.', bezug: 'Ein Anruf, der niemanden erreicht hat, oder ein versehentlicher Tipp.', aendert: 'Der offene Eintrag verschwindet (nur offene lassen sich verwerfen).',
    ergebnis: 'Die Frage ist weg.', rueckweg: 'Mit „Eintrag von Hand“ neu anlegen – z. B. mit Grund „Nicht erreicht“.' },
  'verlauf.liste': { seite: 'Patient', titel: 'Kontaktverlauf',
    loest_aus: AUSKUNFT, bezug: 'Alle Anrufe, Nachrichten und Notizen zu diesem Patienten, neueste zuerst – in einem Fenster zum Scrollen, ganz unten auf der Seite.', aendert: NICHTS,
    ergebnis: 'Je Eintrag: Grund, Art, Zeitpunkt, Kontaktweg und Notiz.', rueckweg: KEIN_RUECKWEG },
  'verlauf.eintragen': { seite: 'Patient', titel: 'Eintrag von Hand',
    loest_aus: 'Klappt ein Formular auf: Art (Anruf eingehend, Brief, persönlich …), Grund und Notiz.', bezug: 'Kontakte, die nicht über die Kachel liefen – etwa ein Anruf des Patienten in der Praxis.',
    aendert: 'Beim Speichern ein Eintrag im Verlauf.', ergebnis: 'Steht in der Liste.', rueckweg: 'Einträge bleiben; ein Irrtum wird mit einem weiteren Eintrag richtiggestellt.' },
  'verlauf.oeffnen': { seite: 'Patient', titel: 'In Outlook öffnen',
    loest_aus: 'Öffnet den Mail-Entwurf in Outlook Web (neuer Reiter).', bezug: 'Der Entwurf, den die Praxis-Assistenz für diesen Patienten angelegt hat – er liegt im Postfach unter „Entwürfe“, auch in Outlook und Apple Mail.',
    aendert: NICHTS, ergebnis: 'Der Entwurf zum Prüfen und Senden. Gesendet wird nur dort, nie von der Praxis-Assistenz.', rueckweg: 'Reiter schließen. Den Entwurf löscht man in Outlook.' },
  'nachricht.whatsapp': { seite: 'Patient', titel: 'WhatsApp-Knöpfe',
    loest_aus: 'Öffnet WhatsApp (Handy: die App, Rechner: WhatsApp Web) mit der Nummer des Patienten und dem fertigen Text der Vorlage.', bezug: 'Vorlagen ohne Termin: Rezept fehlt, Rezept bald aufgebraucht, Bitte um Rückruf, Dank, Nachfrage. Terminbestätigung und -erinnerung stehen an jedem Termin.',
    aendert: 'Ein Eintrag „WhatsApp“ im Kontaktverlauf mit dem Namen der Vorlage – nicht der Text.', ergebnis: 'Sie lesen den Text in WhatsApp, ändern ihn bei Bedarf und senden selbst. Die Nachricht geht von Ihrem WhatsApp aus, nicht von der Praxis-Assistenz.',
    rueckweg: 'In WhatsApp nicht senden. Der Verlaufseintrag bleibt und sagt nur „geöffnet“.' },
  'termin.whatsapp': { seite: 'Patient', titel: 'Termin per WhatsApp',
    loest_aus: 'Öffnet WhatsApp mit Bestätigung oder Erinnerung für genau diesen Termin (Datum, Uhrzeit, Praxis).', bezug: 'Der Termin dieser Kachel und die WhatsApp-Nummer des Patienten.',
    aendert: 'Ein Eintrag „WhatsApp“ im Kontaktverlauf, mit dem Termin verknüpft.', ergebnis: 'Fertiger Text in WhatsApp – senden Sie selbst. Nie Diagnose oder Behandlung im Text.', rueckweg: 'Nicht senden; der Eintrag sagt nur „geöffnet“.' },
  'nachricht.vorlage': { seite: 'Patient', titel: 'Vorlage',
    loest_aus: 'Wählt den Text der Mail: Terminbestätigung, Erinnerung, Vorschlag, Absage mit Ersatz, Rezept fehlt, Rezept bald aufgebraucht, Rechnung zusenden, Zahlungserinnerung, Rückruf, Dank, Nachfrage, freier Text.',
    bezug: 'Vorlagen mit Anrede, Platzhaltern (Termin, Rechnung, Praxis) und Gruß. Keine Diagnosen – die Vorlagen enthalten nur Organisatorisches, eigener Text wird auf Gesundheitsbegriffe geprüft.',
    aendert: NICHTS, ergebnis: 'Der fertige Text steht im Entwurf und lässt sich in Outlook noch ändern.', rueckweg: KEIN_RUECKWEG },
  'nachricht.termin': { seite: 'Patient', titel: 'Termin für die Nachricht',
    loest_aus: 'Setzt Datum und Uhrzeit in Bestätigung, Erinnerung oder Absage ein.', bezug: 'Die kommenden Termine dieses Patienten.',
    aendert: NICHTS, ergebnis: 'Ohne Termin brechen diese drei Vorlagen mit einer Meldung ab.', rueckweg: KEIN_RUECKWEG },
  'nachricht.rechnung': { seite: 'Patient', titel: 'Rechnung für die Nachricht',
    loest_aus: 'Setzt Nummer und Betrag in „Rechnung zusenden“ oder „Zahlungserinnerung“ ein; bei „Rechnung zusenden“ hängt das PDF aus Lexware automatisch an.',
    bezug: 'Rechnungen mit Nummer (ab „In Lexware“).', aendert: NICHTS, ergebnis: 'Betreff „Ihre Rechnung R-…“ mit Betrag.', rueckweg: KEIN_RUECKWEG },
  'nachricht.text': { seite: 'Patient', titel: 'Eigener Text',
    loest_aus: 'Füllt „Freier Text“, „Terminvorschlag“ und „Absage mit Ersatztermin“ – dort steht Ihr Text zwischen Anrede und Gruß.', bezug: 'Nur Organisatorisches. Begriffe wie Diagnose, Befund oder Krankheitsnamen führen bei WhatsApp zur Ablehnung, bei Mail zu einem Hinweis.',
    aendert: NICHTS, ergebnis: 'Ihr Text im Entwurf.', rueckweg: KEIN_RUECKWEG },
  'nachricht.anhang': { seite: 'Patient', titel: 'Anhänge',
    loest_aus: 'Hängt Rechnungs-PDFs (aus Lexware) und Unterlagen aus der Akte an den Entwurf.', bezug: 'Nur Dateien dieses Patienten; je Datei bis 3 MB.',
    aendert: 'Nichts in der Kartei – die Dateien werden an den Entwurf im Postfach kopiert.', ergebnis: 'Der Entwurf trägt die Anhänge; sichtbar in Outlook.', rueckweg: 'Anhang im Entwurf in Outlook entfernen.' },
  'nachricht.mail': { seite: 'Patient', titel: 'Entwurf in Outlook anlegen',
    loest_aus: 'Legt die Mail als Entwurf im Praxispostfach an – an die Mailadresse des Patienten, mit Vorlagentext und Anhängen. Es wird nichts gesendet.',
    bezug: 'Postfach praxis@ (Testumgebung: nur an Testadressen, Kategorie TEST). Leitplanke 3: Senden tun Sie, in Outlook oder Apple Mail unter „Entwürfe“.',
    aendert: 'Ein Entwurf im Postfach; ein Eintrag „E-Mail“ im Kontaktverlauf mit Link „in Outlook öffnen“.', ergebnis: 'Meldung „Entwurf liegt im Postfach“; in Outlook prüfen, ergänzen, senden.',
    rueckweg: 'Entwurf in Outlook löschen. Der Verlaufseintrag bleibt („noch nicht gesendet“).' },
  'nachricht.whatsapp-senden': { seite: 'Patient', titel: 'Per WhatsApp senden',
    loest_aus: 'Sendet den Vorlagentext über die WhatsApp-Business-Schnittstelle direkt – ohne Umweg über das Handy.', bezug: 'Nur mit eingerichteter Cloud API und mit dokumentierter Einwilligung des Patienten (Erklärung „Einwilligung WhatsApp“). Text mit Gesundheitsbegriffen wird abgelehnt.',
    aendert: 'Die Nachricht geht an den Patienten; Eintrag „WhatsApp“ im Verlauf mit dem gesendeten Text (verschlüsselt).', ergebnis: 'Meldung „gesendet“. Antworten kommen über den Webhook in den Kontaktverlauf.', rueckweg: 'Gesendet ist gesendet – ggf. eine Korrektur nachsenden.' },
  'termine.kachel': { seite: 'Patient', titel: 'Termin-Kachel',
    loest_aus: AUSKUNFT, bezug: 'Ein kommender Termin aus der Kartei – „Rezept“ gehört zu einer Verordnung, „Individual“ nicht. Der Kalender im Postfach wird im nächsten Schritt abgeglichen.',
    aendert: NICHTS, ergebnis: 'Datum, Zeit, Art, Status; grüner Rahmen bei Rezept-Terminen; unten das Feld „ändern …“.', rueckweg: KEIN_RUECKWEG },
  'termin.kalender': { seite: 'Patient', titel: 'Im Kalender',
    loest_aus: AUSKUNFT, bezug: 'Dieser Termin steht als Ereignis im Kalender des Postfachs (Kategorie „Praxis-Termin“).', aendert: NICHTS,
    ergebnis: 'Fehlt die Marke, war der Kalender beim Anlegen nicht erreichbar – der nächtliche Abgleich bzw. „termine:abgleich“ trägt ihn nach.', rueckweg: KEIN_RUECKWEG },
  'termin.status': { seite: 'Patient', titel: 'Termin ändern',
    loest_aus: 'Setzt den Termin auf abgesagt (Patient oder Praxis) oder „nicht erschienen“.', bezug: 'Ein bestätigter Termin. Die 24-Stunden-Regel und Ausfallgebühr (E7) kommen mit Prompt 14.',
    aendert: 'Status des Termins; Protokolleintrag; bei Absage wird das Ereignis aus dem Kalender gelöscht.', ergebnis: 'Der Termin verschwindet aus „nächster Termin“ auf der Kachel und aus dem Kalender.', rueckweg: 'Neuen Termin anlegen – ein abgesagter wird nicht zurückgeholt.' },
  'patient.rechnung': { seite: 'Patient', titel: 'Rechnungs-Kachel',
    loest_aus: 'Öffnet die Rechnungsseite mit Positionen, Textbausteinen und den Schritten Fertig, Versendet, Bezahlt.',
    bezug: 'Eine Ausgangsrechnung, die hier im PPM entstanden ist: Nummer, Betrag, Gruppe, Datum, Fälligkeit, Zahldatum, Status; überfällige haben einen gelben, gemahnte einen roten Rand. Die Kacheln stehen nach Jahr gruppiert, Entwürfe zuerst.',
    aendert: NICHTS, ergebnis: 'Die Rechnungsseite.', rueckweg: KEIN_RUECKWEG },
  'patient.rechnung.lexware': { seite: 'Patient', titel: 'Rechnung aus Lexware',
    loest_aus: 'Öffnet die Rechnungsdatei (PDF) im seitlichen Fenster – kein Tab-Wechsel; am iPhone im selben Tab, „Zurück“ führt hierher.',
    bezug: 'Eine Rechnung, die Lexware kennt und die „Rechnungen aus Lexware holen“ übernommen hat: Nummer, Dateiname, Betrag, Rechnungsdatum, Fälligkeit, Zahldatum, Storno, Status in Lexware. Die Datei liegt verschlüsselt im Patienten-Tresor. Positionen, Rezept und Behandlung fehlen bei älteren Rechnungen – künftige Rechnungen aus dem PPM tragen sie.',
    aendert: NICHTS, ergebnis: 'Das PDF rechts im Fenster. Der Rand der Kachel ist braun gestrichelt (siehe Legende); überfällige gelb, gemahnte rot.', rueckweg: '„Schließen“ im Fenster oder die Escape-Taste.' },
  'patient.lexware-abgleich': { seite: 'Patient', titel: 'Abgleich mit Lexware',
    loest_aus: AUSKUNFT, bezug: 'Die gemeinsamen Felder von PPM und Lexware-Kunde: Anrede, Vor- und Nachname, Mail, Telefon, Rechnungsadresse. Angezeigt wird nur, was in Lexware anders oder zusätzlich steht (W99b).',
    aendert: 'Nichts von selbst – der PPM führt (Grundprinzip §4d); Lexware-Werte kommen nur per Klick.', ergebnis: 'Je Feld der Wert hier und in Lexware.', rueckweg: KEIN_RUECKWEG },
  'patient.lexware-uebernehmen': { seite: 'Patient', titel: 'Lexware-Wert übernehmen',
    loest_aus: 'Schreibt den Wert aus Lexware in dieses eine Feld.', bezug: 'Das Feld in der Zeile.', aendert: 'Stammdaten, ein neuer Kontaktweg (Mail, Telefon – als primär, wenn keiner da war) oder die Rechnungsadresse; Protokoll mit dem Feldnamen.',
    ergebnis: 'Die Zeile verschwindet aus dem Abgleich.', rueckweg: 'Stammdaten, Kontaktwege oder Adresse wieder ändern.' },
  'patient.lexware-kunde': { seite: 'Patient', titel: 'In Lexware als Kunde anlegen',
    loest_aus: 'Legt den Patienten in Lexware als Kunden an – nur mit den Feldern der Rechnung: Anrede, Name, Rechnungsadresse, Mail. Keine Gesundheitsdaten.',
    bezug: 'Ein Patient ohne Lexware-Kundennummer. Beim ersten „Nach Lexware“ einer Rechnung passiert dasselbe von selbst.', aendert: 'In Lexware entsteht ein Kunde; hier bekommt der Patient die Kundennummer. Die Testumgebung spricht mit der Attrappe.',
    ergebnis: 'Die Meldung nennt die Kundennummer.', rueckweg: 'Verknüpfung lösen unter „Aus Lexware“; den Kunden in Lexware archivieren.' },
  'patient.rechnung.legende': { seite: 'Patient', titel: 'Legende der Rechnungskacheln',
    loest_aus: AUSKUNFT, bezug: 'Was die Ränder bedeuten: durchgezogen = im PPM entstanden, braun gestrichelt = aus Lexware übernommen, gelb = überfällig, rot = gemahnt. Der Status (Entwurf, Fertig, In Lexware, Versendet, Bezahlt, Storniert) steht als farbiger Chip in jeder Kachel.',
    aendert: NICHTS, ergebnis: 'Nur die Erklärung.', rueckweg: KEIN_RUECKWEG },
  'patient.rechnung.jahr': { seite: 'Patient', titel: 'Jahr auf- und zuklappen',
    loest_aus: 'Klappt die Rechnungen eines Jahres auf oder zu.',
    bezug: 'Alle Rechnungen mit Rechnungsdatum in diesem Jahr; „Entwürfe“ sammelt die noch nicht gestellten. Entwürfe und das neueste Jahr sind offen, ältere Jahre zeigen nur die Zeile mit „Anz. Rechnungen“.',
    aendert: NICHTS, ergebnis: 'Die Kacheln erscheinen oder verschwinden; die Anzahl bleibt in der Zeile stehen.', rueckweg: 'Noch einmal klicken.' },
  'pdf.schliessen': { seite: 'Dokumentfenster', titel: 'Schließen',
    loest_aus: 'Schließt das seitliche Dokumentfenster.', bezug: 'Das gerade angezeigte PDF.', aendert: NICHTS,
    ergebnis: 'Die Seite darunter, unverändert – auch mit der Escape-Taste.', rueckweg: 'Die Kachel erneut anklicken.' },
  'pdf.oeffnen': { seite: 'Dokumentfenster', titel: 'Öffnen',
    loest_aus: 'Zeigt das PDF bildschirmfüllend im Browser – falls das Fenster es nicht vollständig darstellt, etwa mehrseitige Dateien am iPhone.', bezug: 'Dasselbe PDF.', aendert: NICHTS,
    ergebnis: 'Der PDF-Betrachter des Browsers, ohne neuen Tab.', rueckweg: 'Die Zurück-Taste des Browsers führt zur Seite.' },
  'patient.lexware_rechnungen': { seite: 'Patient', titel: 'Rechnungen und Zahlungen aus Lexware prüfen',
    loest_aus: 'Liest alle Rechnungen dieses Kunden aus Lexware: neue kommen als Kacheln mit Datei, bekannte bekommen Status, Zahldatum und die Zahlungsposten (Bankumsatz, manuell, Skonto). Lexware erlaubt zwei Anfragen je Sekunde, bei vielen Rechnungen dauert es einen Moment.',
    bezug: 'Der Lexware-Kunde, mit dem dieser Patient verknüpft ist (Kundennummer in den Stammdaten). Verbucht wird in Lexware – hier wird das Ergebnis übernommen (W101).',
    aendert: 'Legt neue Rechnungskacheln an, aktualisiert bekannte (Status „bezahlt“ oder „storniert“, Betrag, Zahldatum, Zahlungen, Datei) und verknüpft PPM-Rechnungen mit derselben Nummer. Löscht nichts; was nur das PPM kennt, bleibt (Grundprinzip §4d). Das Protokoll vermerkt nur Zahlen.',
    ergebnis: 'Die Meldung sagt, wie viele neu, aktualisiert, unverändert oder jetzt bezahlt sind.', rueckweg: 'Nicht nötig – ein erneuter Klick holt nur Änderungen.' },
  'kontakt.primaer': { seite: 'Patient', titel: 'Kontakt als primär',
    loest_aus: 'Macht diesen Eintrag zum primären seiner Art.', bezug: 'Je Art (Mobil, Telefon, WhatsApp, E-Mail) gibt es genau einen primären – den zeigt die Kachel.',
    aendert: 'Der bisherige primäre Eintrag derselben Art verliert die Markierung.', ergebnis: 'Die Kachel zeigt den neuen Eintrag.', rueckweg: 'Beim anderen Eintrag „primär“ drücken.' },
  'kontakt.loeschen': { seite: 'Patient', titel: 'Kontakt entfernen',
    loest_aus: 'Entfernt den Kontaktweg.', bezug: 'Ein Eintrag aus der Liste.', aendert: 'Der Eintrag ist weg; war er primär, rückt der nächste nach. Alte Verlaufseinträge verweisen dann ohne Nummer.',
    ergebnis: 'Die Liste ohne den Eintrag.', rueckweg: 'Mit „Kontakt hinzufügen“ neu anlegen.' },
  'kontakt.neu': { seite: 'Patient', titel: 'Kontakt hinzufügen',
    loest_aus: 'Speichert einen weiteren Kontaktweg.', bezug: 'Art, Nummer bzw. Adresse, Bezeichnung (privat, Arbeit …).',
    aendert: 'Ein Eintrag in der Kartei; Telefonnummern werden für Anruf- und WhatsApp-Links normiert (+49 …). Der erste seiner Art wird primär.',
    ergebnis: 'Erscheint in der Liste; mit „als primär“ auch auf der Kachel.', rueckweg: '„entfernen“.' },
  'adresse.kachel': { seite: 'Patient', titel: 'Adresse',
    loest_aus: AUSKUNFT, bezug: 'Eine Adresse des Patienten (Zuhause, Arbeit, Eltern …). Mehrere sind möglich.', aendert: NICHTS,
    ergebnis: 'Die Rechnungsadresse hat einen grünen Rahmen.', rueckweg: KEIN_RUECKWEG },
  'adresse.rechnungsadresse': { seite: 'Patient', titel: 'Rechnungsadresse',
    loest_aus: 'Macht diese Adresse zur Rechnungsadresse – es kann nur eine sein.', bezug: 'Die Adresse auf Rechnungen an den Patienten (§ 14 UStG). Ein abweichender Rechnungsempfänger (z. B. Eltern) steht bei den Bezugspersonen.',
    aendert: 'Die bisherige Rechnungsadresse verliert die Markierung.', ergebnis: 'Grüner Rahmen wechselt.', rueckweg: 'Bei der anderen Adresse wählen.' },
  'adresse.loeschen': { seite: 'Patient', titel: 'Adresse entfernen',
    loest_aus: 'Entfernt die Adresse.', bezug: 'Eine Adresskachel.', aendert: 'Die Adresse ist weg; war sie Rechnungsadresse, wird die nächste dazu.',
    ergebnis: 'Eine Kachel weniger.', rueckweg: 'Mit „+ Adresse“ neu anlegen.' },
  'adresse.neu': { seite: 'Patient', titel: '+ Adresse',
    loest_aus: 'Klappt das Adressformular auf.', bezug: 'Straße, Nummer, PLZ, Ort, Land, Bezeichnung; Haken „Rechnungsadresse“.', aendert: 'Beim Speichern eine neue Adresskachel.',
    ergebnis: 'Die Kachel erscheint im Raster.', rueckweg: '„entfernen“ auf der Kachel.' },
  'bezugspersonen.liste': { seite: 'Patient', titel: 'Bezugspersonen',
    loest_aus: AUSKUNFT, bezug: 'Vertragspartner, Rechnungsempfänger, Vertretung (mit Berechtigungsgrund), Notfallkontakt – getrennt von der behandelten Person.',
    aendert: NICHTS, ergebnis: 'Die Liste; bearbeiten kommt mit dem nächsten Schritt.', rueckweg: KEIN_RUECKWEG },
  'patient.stammdaten': { seite: 'Patient', titel: 'Stammdaten bearbeiten',
    loest_aus: 'Klappt direkt unter der Knopfreihe das Formular mit allen Stammdaten auf (noch einmal: zu).', bezug: 'Name, Geburtsdatum, Patient seit, Ansprache, Besonderheiten, Sprache, Beruf, Notiz.',
    aendert: 'Nichts, bis „Speichern“ gedrückt wird.', ergebnis: 'Das Formular; darunter Nummer und Abrechnungsart.', rueckweg: 'Zuklappen ohne Speichern.' },
  'patient.speichern': { seite: 'Patient', titel: 'Stammdaten speichern',
    loest_aus: 'Speichert die Stammdaten.', bezug: 'Das Formular darüber.', aendert: 'Die Stammdaten; Ansprache, Besonderheiten, Beruf und Notiz verschlüsselt. Protokolleintrag.',
    ergebnis: 'Die Kachel zeigt die neuen Werte.', rueckweg: 'Erneut ändern und speichern.' },
  'patient.archivieren': { seite: 'Patient', titel: 'Archivieren',
    loest_aus: 'Setzt den Patienten auf „archiviert“.', bezug: 'Ein Patient, der nicht mehr kommt. Gelöscht wird nichts – die Akte bleibt zehn Jahre (§ 630f Abs. 3 BGB).',
    aendert: 'Status und Archivdatum.', ergebnis: 'Verschwindet aus der Liste, steht im Archiv.', rueckweg: 'Im Archiv öffnen und „Wieder aktiv“.' },
  'patient.reaktivieren': { seite: 'Patient', titel: 'Wieder aktiv',
    loest_aus: 'Holt den Patienten aus dem Archiv.', bezug: 'Ein archivierter Patient.', aendert: 'Status „aktiv“.', ergebnis: 'Steht wieder in der Liste.', rueckweg: '„Archivieren“.' },
  'akte.fall': { seite: 'Akte', titel: 'Behandlungsfall',
    loest_aus: AUSKUNFT, bezug: 'Ein Fall: Grundlage (Verordnung, Direktzugang, Prävention), Steuerklasse, Anlass, ärztliche Diagnose, Zeitraum. Darunter seine Behandlungen.',
    aendert: NICHTS, ergebnis: 'Neuester Fall zuerst.', rueckweg: KEIN_RUECKWEG },
  'akte.behandlung': { seite: 'Akte', titel: 'Behandlung',
    loest_aus: AUSKUNFT, bezug: 'Eine Sitzung: Datum, Dauer, wer behandelt hat, abgerechnete Leistung (mit „Rezept ✓“ = Haken auf der Stempelkarte), Maßnahmen, Verlauf, Reaktionen, Übungen.',
    aendert: 'Nichts – Einträge sind unveränderlich (§ 630f BGB).', ergebnis: 'Der Eintrag, wie er beim Erfassen gespeichert wurde.', rueckweg: 'Ein Irrtum wird durch einen Folgeeintrag richtiggestellt, nie durch Ändern.' },
  'akte.pdf': { seite: 'Akte', titel: 'Akte als PDF (§ 630g)',
    loest_aus: 'Erzeugt die vollständige Akte als PDF (neuer Reiter): Stammdaten, Rezepte, je Fall Anamnese, Befunde, Erklärungen und Behandlungen, Termine.',
    bezug: 'Das Einsichtsrecht des Patienten nach § 630g BGB – auf Verlangen unverzüglich, auch als Abschrift (Kopie), Kosten darf die Praxis erstatten lassen. Dasselbe PDF taugt für Weitergabe an Nachbehandler oder Gutachter mit Einwilligung.',
    aendert: 'Nichts an der Akte; der Export steht im Protokoll (wer, wann) – Einsicht ist ein Zugriff auf Gesundheitsdaten.',
    ergebnis: 'Ein PDF „Patientenakte-P-….pdf“ zum Speichern, Drucken oder als Anhang an eine Mail (unter „Nachricht an …“ noch nicht wählbar – von Hand in Outlook anhängen).',
    rueckweg: 'PDF löschen; das Protokoll bleibt.' },
  'akte.neu': { seite: 'Akte', titel: 'Behandlung erfassen',
    loest_aus: 'Öffnet das Formular „Behandlung erfassen“.', bezug: 'Diese Akte.', aendert: 'Noch nichts.', ergebnis: 'Das Formular.', rueckweg: 'Zurück ohne Speichern.' },
  'termin.formular': { seite: 'Neuer Termin', titel: 'Terminformular',
    loest_aus: 'Nichts, bis „Termin anlegen“ gedrückt wird.', bezug: 'Datum, Uhrzeit, Dauer, Art; wahlweise ein aktives Rezept – dann zählt der Termin zur Verordnung.',
    aendert: 'Beim Anlegen: ein Termin in der Kartei und ein Ereignis im Kalender des Postfachs mit Kategorie „Praxis-Termin“ (lila), Betreff nur Initialen und Patientennummer – Testumgebung: Kalender „Praxis-Test“ plus Kategorie „TEST“.', ergebnis: 'Die Kachel zeigt ihn als nächsten Termin; im Cockpit steht er unter „Termine heute“.', rueckweg: 'Auf der Patientenseite unter Termine „ändern …“ – eine Absage nimmt ihn auch aus dem Kalender.' },
  'termin.anlegen': { seite: 'Neuer Termin', titel: 'Termin anlegen',
    loest_aus: 'Speichert den Termin.', bezug: 'Das Formular.', aendert: 'Termin in der Kartei, Protokolleintrag.', ergebnis: 'Zurück zur Patientenseite, Abschnitt Termine.', rueckweg: 'Dort „ändern …“.' },
  'behandlung.formular': { seite: 'Behandlung erfassen', titel: 'Formular „Behandlung erfassen“',
    loest_aus: 'Nichts, bis „In die Akte eintragen“ gedrückt wird.',
    bezug: 'Fall (bestehend oder neu mit Grundlage), Datum, Dauer, Rezept zum Abhaken, Leistungsnummer aus der aktiven Preisliste, Termin, Maßnahmen (Pflicht), Verlauf, Reaktionen, Übungen – die Inhalte nach § 630f BGB.',
    aendert: 'Beim Eintragen: Behandlung (verschlüsselt), ggf. neuer Fall, ein Haken auf dem Rezept, Preis der Leistung festgehalten, Termin „erledigt“.',
    ergebnis: 'Die Akte mit dem neuen Eintrag.', rueckweg: 'Einträge bleiben; ein Irrtum wird durch einen Folgeeintrag richtiggestellt.' },
  'behandlung.speichern': { seite: 'Behandlung erfassen', titel: 'In die Akte eintragen',
    loest_aus: 'Speichert die Behandlung unveränderlich.', bezug: 'Das Formular.', aendert: 'Siehe Formular; Protokolleintrag.', ergebnis: 'Die Akte.', rueckweg: 'Folgeeintrag.' },
  'rezept.formular': { seite: 'Neues Rezept', titel: 'Rezeptformular',
    loest_aus: 'Nichts, bis „Rezept anlegen“ gedrückt wird.', bezug: 'Ausstellungsdatum, Ärztin/Arzt (wird in der Ärzteliste gemerkt), Maßnahme, Nummer in der Preisliste, Anzahl, Frequenz, Diagnose (verschlüsselt), Fall.',
    aendert: 'Beim Anlegen: ein aktives Rezept mit leerer Stempelkarte.', ergebnis: 'Erscheint unter Rezepte und bei „Neuer Termin“ zur Auswahl.', rueckweg: 'Abbrechen eines Rezepts (mit Grund) kommt mit Prompt 14.' },
  'rezept.anlegen': { seite: 'Neues Rezept', titel: 'Rezept anlegen',
    loest_aus: 'Speichert das Rezept.', bezug: 'Das Formular.', aendert: 'Rezept in der Kartei, Protokolleintrag.', ergebnis: 'Zurück zur Patientenseite, Abschnitt Rezepte.', rueckweg: 'Siehe Formular.' },

  // ── Rezepte als Kacheln (W73, W74) ────────────────────────────────────────
  'rezepte.kachel': { seite: 'Rezepte', titel: 'Rezept-Kachel',
    loest_aus: AUSKUNFT, bezug: 'Eine Verordnung: Maßnahme, Rezeptart (Erst, Folge unverändert/angepasst, Wiederaufnahme, Korrektur), Langzeit, Ärztin/Arzt, Nummer in der Preisliste, Gültigkeit, Fall; die Stempelkarte zählt die Haken – bei einer Korrektur über die ganze Kette.',
    aendert: NICHTS, ergebnis: 'Grüner Rahmen = aktiv; „ersetzt“ heißt: es gibt eine Korrektur, die gilt.', rueckweg: KEIN_RUECKWEG },
  'rezept.mehr': { seite: 'Rezepte', titel: 'mehr …',
    loest_aus: 'Klappt die Aktionen zum Rezept auf: Zweitschrift, Abbrechen, Folgerezept/Korrektur.', bezug: 'Ein aktives Rezept.', aendert: 'Noch nichts.', ergebnis: 'Drei Knöpfe.', rueckweg: 'Noch einmal tippen.' },
  'rezept.zweitschrift': { seite: 'Rezepte', titel: 'Zweitschrift vermerken',
    loest_aus: 'Vermerkt, dass es eine Zweitschrift (Ersatz für ein verlorenes Rezept) gibt.', bezug: 'Dieses Rezept – die Zweitschrift ist kein neues Rezept und bringt kein neues Kontingent.',
    aendert: 'Datum der Zweitschrift am Rezept; Protokolleintrag.', ergebnis: 'Die Kachel zeigt „Zweitschrift <Datum>“.', rueckweg: 'Bleibt vermerkt; bei Irrtum Christian Bescheid geben.' },
  'rezept.abbrechen': { seite: 'Rezepte', titel: 'Rezept abbrechen',
    loest_aus: 'Beendet das Rezept vorzeitig – der Grund ist Pflicht.', bezug: 'Ein aktives Rezept, das nicht zu Ende behandelt wird (Patient bricht ab, Arzt ändert die Therapie).',
    aendert: 'Status „abgebrochen“ mit Grund und Datum; Protokolleintrag. Die Abschlussrechnung über die erbrachten Einheiten kommt mit der Abrechnung (Prompt 14).',
    ergebnis: 'Die Kachel wird blass; keine Haken mehr möglich.', rueckweg: 'Nicht rücknehmbar – bei Bedarf ein neues Rezept anlegen.' },
  'rezept.folge': { seite: 'Rezepte', titel: 'Folgerezept / Korrektur',
    loest_aus: 'Öffnet das Rezeptformular mit diesem Rezept als Vorgänger.', bezug: 'Dieses Rezept.', aendert: 'Noch nichts.',
    ergebnis: 'Im Formular ist die Rezeptart „Folgerezept – unverändert“ vorgewählt; Korrektur oder angepasst lässt sich wählen.', rueckweg: 'Zurück ohne Speichern.' },
  'rezept.art': { seite: 'Neues Rezept', titel: 'Rezeptart',
    loest_aus: 'Legt fest, was dieses Rezept ist.', bezug: 'Erstrezept (neuer Fall) · Folgerezept unverändert (gleiche Maßnahmen, eigenes Kontingent) · Folgerezept angepasst (andere Therapie, Dauer, Häufigkeit, Anzahl) · erneute Verordnung bei Wiederaufnahme (nach Abschluss oder Pause; Fall fortführen oder neu) · Korrektur (berichtigt ein Rezept, kein neues Kontingent).',
    aendert: 'Beim Anlegen: die Art am Rezept; bei Korrektur wird der Vorgänger „ersetzt“.', ergebnis: 'Die Kachel zeigt die Art als Marke.', rueckweg: 'Vor dem Speichern anders wählen.' },
  'rezept.vorgaenger': { seite: 'Neues Rezept', titel: 'Vorheriges Rezept',
    loest_aus: 'Verknüpft das neue Rezept mit dem vorherigen.', bezug: 'Pflicht bei Folgerezept, Wiederaufnahme und Korrektur. Folgerezepte und Korrekturen übernehmen den Fall des Vorgängers, wenn kein anderer gewählt ist.',
    aendert: 'Die Verknüpfung; bei Korrektur zählen die Haken des Vorgängers weiter.', ergebnis: 'Die Kachel zeigt „↑ Vorgänger“.', rueckweg: 'Vor dem Speichern anders wählen.' },
  'rezept.langzeit': { seite: 'Neues Rezept', titel: 'Langzeitbehandlung',
    loest_aus: 'Markiert das Rezept als Dauerverordnung.', bezug: 'Chronische oder länger anhaltende Problematik; kann mit Erst- und Folgerezepten vorkommen. Umfang und Erstattung richten sich nach Verordnung und Tarif.',
    aendert: 'Ein Zusatzmerkmal am Rezept.', ergebnis: 'Grüne Marke „Langzeitbehandlung“ auf der Kachel.', rueckweg: 'Vor dem Speichern abwählen.' },
  'rezepte.filter': { seite: 'Rezepte', titel: 'Anzeigen: aktive / alle',
    loest_aus: 'Wechselt zwischen aktiven Rezepten und laufenden Serien oder allem, auch abgeschlossenem.', bezug: 'Alle Patienten.', aendert: NICHTS, ergebnis: 'Die Kacheln darunter.', rueckweg: 'Zurückschalten.' },
  'rezepte.patient-waehlen': { seite: 'Rezepte', titel: 'Neu: beim Patienten über „+“',
    loest_aus: 'Führt zur Patientenliste – ein Rezept gehört immer zu einem Patienten und wird dort über „+“ angelegt.', bezug: 'Die Kartei.', aendert: NICHTS, ergebnis: 'Die Patientenliste.', rueckweg: KEIN_RUECKWEG },
  'rezepte.wellness-katalog': { seite: 'Rezepte', titel: 'Wellness-Katalog',
    loest_aus: 'Öffnet die Liste der Wellness-Leistungen.', bezug: 'Leistungen ohne Krankheitsbezug, nicht aus der GKV-Liste, 19 % USt.', aendert: NICHTS, ergebnis: 'Tabelle und Formular zum Anlegen.', rueckweg: KEIN_RUECKWEG },
  'plus.direktzugang': { seite: 'Patienten', titel: 'Behandlung ohne Rezept',
    loest_aus: 'Öffnet das Formular für eine Behandlungsserie ohne ärztliche Verordnung (Direktzugang).', bezug: 'Eigenverantwortliche Behandlung einer Erkrankung – braucht die sektorale Heilpraktikererlaubnis (Frage 15). Keine Rezeptart, sondern eine eigene Behandlungsgrundlage.',
    aendert: 'Noch nichts.', ergebnis: 'Kurzbezeichnung, Anlass, Beginn.', rueckweg: 'Zurück ohne Speichern.' },
  'plus.wellness': { seite: 'Patienten', titel: 'Wellness',
    loest_aus: 'Öffnet das Formular für eine Wellness-Serie.', bezug: 'Leistung aus dem Wellness-Katalog, ohne Krankheitsbezug, 19 % USt, nie mit Heilbehandlung auf einer Rechnung gemischt.',
    aendert: 'Noch nichts.', ergebnis: 'Leistung wählen, Beginn.', rueckweg: 'Zurück ohne Speichern.' },
  'serie.direktzugang': { seite: 'Rezepte', titel: 'Serie: Behandlung ohne Rezept',
    loest_aus: AUSKUNFT, bezug: 'Ein Behandlungsfall mit Grundlage „Direktzugang“: Kurzbezeichnung, Beginn, Zahl der Behandlungen. Steuerfrei als Heilbehandlung.',
    aendert: NICHTS, ergebnis: 'Grüner Rahmen = laufend.', rueckweg: KEIN_RUECKWEG },
  'serie.wellness': { seite: 'Rezepte', titel: 'Serie: Wellness',
    loest_aus: AUSKUNFT, bezug: 'Ein Behandlungsfall mit Grundlage „Prävention/Wellness“ und der gewählten Leistung aus dem Katalog; jede Behandlung darin übernimmt Leistung und Preis (19 %).',
    aendert: NICHTS, ergebnis: 'Grüner Rahmen = laufend.', rueckweg: KEIN_RUECKWEG },
  'serie.abschliessen': { seite: 'Rezepte', titel: 'Serie abschließen',
    loest_aus: 'Beendet die Serie.', bezug: 'Eine laufende Serie ohne Rezept.', aendert: 'Abschlussdatum und Phase „Abschluss“ am Fall; Protokoll.', ergebnis: 'Kachel wird „abgeschlossen“; bei „alle“ weiter sichtbar.', rueckweg: 'Neue Serie anlegen.' },
  'serie.direktzugang.formular': { seite: 'Behandlung ohne Rezept', titel: 'Formular Behandlung ohne Rezept',
    loest_aus: 'Nichts, bis „anlegen“ gedrückt wird.', bezug: 'Kurzbezeichnung (Pflicht), Anlass, Beginn.', aendert: 'Beim Anlegen: ein Fall mit Grundlage Direktzugang, steuerfrei.',
    ergebnis: 'Eine Serien-Kachel beim Patienten und unter Rezepte.', rueckweg: '„Serie abschließen“ auf der Kachel.' },
  'serie.direktzugang.anlegen': { seite: 'Behandlung ohne Rezept', titel: 'Behandlung ohne Rezept anlegen',
    loest_aus: 'Speichert die Serie.', bezug: 'Das Formular.', aendert: 'Fall, Phasenprotokoll, Protokoll.', ergebnis: 'Zurück zum Patienten, Abschnitt Rezepte.', rueckweg: '„Serie abschließen“.' },
  'serie.wellness.formular': { seite: 'Wellness-Serie', titel: 'Formular Wellness-Serie',
    loest_aus: 'Nichts, bis „anlegen“ gedrückt wird.', bezug: 'Leistung aus dem Katalog (Pflicht), Kurzbezeichnung, Anlass, Beginn.', aendert: 'Beim Anlegen: ein Fall mit Grundlage Wellness, 19 % USt, Leistung am Fall.',
    ergebnis: 'Eine Serien-Kachel.', rueckweg: '„Serie abschließen“.' },
  'serie.wellness.anlegen': { seite: 'Wellness-Serie', titel: 'Wellness-Serie anlegen',
    loest_aus: 'Speichert die Serie.', bezug: 'Das Formular.', aendert: 'Fall, Phasenprotokoll, Protokoll.', ergebnis: 'Zurück zum Patienten.', rueckweg: '„Serie abschließen“.' },
  'wellness.zeile': { seite: 'Wellness-Katalog', titel: 'Wellness-Leistung',
    loest_aus: AUSKUNFT, bezug: 'Kürzel, Bezeichnung, Dauer, Bruttopreis (19 %).', aendert: NICHTS, ergebnis: 'Blass = ausgeblendet, nicht mehr wählbar.', rueckweg: KEIN_RUECKWEG },
  'wellness.aktiv': { seite: 'Wellness-Katalog', titel: 'ausblenden / anbieten',
    loest_aus: 'Blendet die Leistung aus oder bietet sie wieder an.', bezug: 'Eine Leistung des Katalogs; bestehende Serien bleiben unberührt.', aendert: 'Das Merkmal „aktiv“.', ergebnis: 'Ausgeblendete fehlen bei „Wellness“ am Patienten.', rueckweg: 'Derselbe Knopf.' },
  'wellness.speichern': { seite: 'Wellness-Katalog', titel: 'Leistung speichern',
    loest_aus: 'Legt die Leistung an oder ändert die mit demselben Kürzel.', bezug: 'Kürzel (2–12 Zeichen), Bezeichnung, Dauer, Preis.', aendert: 'Katalog; Protokoll.', ergebnis: 'Zeile in der Tabelle.', rueckweg: '„ausblenden“ – gelöscht wird nicht, weil Serien darauf verweisen.' },

  // ── Rückmeldungen (W72) ───────────────────────────────────────────────────
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

  // ── Pinnwand und Fall-Details (W76) ───────────────────────────────────────
  'pinnwand.karte': { seite: 'Pinnwand', titel: 'Fall-Karte',
    loest_aus: 'Klick öffnet die Fall-Details; mit der Maus lässt sich die Karte in eine andere Phase ziehen.',
    bezug: 'Ein Behandlungsfall: Patient, Fall-Nummer und Kurzbezeichnung, Grundlage (Rezept, Direktzugang, Wellness), seit wann er in dieser Phase steht, Rezept-Fortschritt, nächster Termin, Warnungen.',
    aendert: 'Ziehen: die Phase – nur wenn die Daten des vorherigen Schritts vollständig sind, sonst sagt die Pinnwand, was fehlt. Zurück nur mit Grund.',
    ergebnis: 'Die Karte steht in der neuen Phase; der Wechsel steht im Phasenprotokoll des Falls.', rueckweg: 'Zurückziehen (mit Grund) oder in den Details „Phase verschieben“.' },
  'pinnwand.plus': { seite: 'Pinnwand', titel: '„+“ an der Karte',
    loest_aus: 'Klappt die Aktionen zu diesem Fall auf: Behandlung, Termin, Rezept, Anamnese/Befund, Einwilligung.', bezug: 'Dieser Fall.', aendert: 'Noch nichts.', ergebnis: 'Fünf Einträge.', rueckweg: 'Noch einmal tippen.' },
  'pinnwand.plus.anamnese': { seite: 'Pinnwand', titel: 'Anamnese / Befund',
    loest_aus: 'Springt in den Fall-Details zu Anamnese und Befunden.', bezug: 'Die Daten der Schritte Anamnese und Befund.', aendert: 'Noch nichts.', ergebnis: 'Formulare zum Erfassen.', rueckweg: 'Zurück zur Pinnwand.' },
  'pinnwand.plus.erklaerung': { seite: 'Pinnwand', titel: 'Einwilligung / Erklärung',
    loest_aus: 'Springt in den Fall-Details zu den Erklärungen.', bezug: 'Behandlungseinwilligung, Datenschutzinformation, Kosteninformation – nötig für den Schritt Anamnese.', aendert: 'Noch nichts.', ergebnis: 'Liste und Formular.', rueckweg: 'Zurück zur Pinnwand.' },
  'pinnwand.phase': { seite: 'Pinnwand', titel: 'Phase (Spalte bzw. Zeile)',
    loest_aus: 'Nimmt gezogene Karten an.', bezug: 'Ein Schritt des Patientenwegs: Anfrage → Aufnahme → Anamnese → Befund → Behandlung → Abschluss → Rechnung → Nachsorge → Archiv. Die Zahl ist die Anzahl der Fälle darin.',
    aendert: 'Nichts beim Ansehen.', ergebnis: 'Beim Ziehen leuchtet die Zielphase auf.', rueckweg: KEIN_RUECKWEG },
  'pinnwand.neu': { seite: 'Pinnwand', titel: '+ Fall',
    loest_aus: 'Öffnet das Formular für einen neuen Fall in der Phase Anfrage.', bezug: 'Ein bestehender Patient mit neuem Anliegen (Bestandspatient) oder ein frisch angelegter.', aendert: 'Noch nichts.', ergebnis: 'Patient, Grundlage, Kurzbezeichnung, Anlass.', rueckweg: 'Zurück ohne Speichern.' },
  'pinnwand.horizontal': { seite: 'Pinnwand', titel: 'Horizontal',
    loest_aus: 'Zeigt die Phasen als Spalten nebeneinander (bei vielen Phasen mit Querscrollen).', bezug: 'Die Darstellung – der Inhalt bleibt gleich.', aendert: 'Merkt sich die Wahl im Browser.', ergebnis: 'Spalten.', rueckweg: '„Vertikal“.' },
  'pinnwand.vertikal': { seite: 'Pinnwand', titel: 'Vertikal',
    loest_aus: 'Zeigt die Phasen als Zeilen untereinander, die Karten darin nebeneinander.', bezug: 'Die Darstellung.', aendert: 'Merkt sich die Wahl im Browser.', ergebnis: 'Zeilen.', rueckweg: '„Horizontal“.' },
  'pinnwand.archiv': { seite: 'Pinnwand', titel: 'Archiv zeigen / ausblenden',
    loest_aus: 'Blendet die Phase „Archiv“ mit abgeschlossenen Fällen ein oder aus.', bezug: 'Fälle nach der Nachsorge.', aendert: NICHTS, ergebnis: 'Eine Phase mehr oder weniger.', rueckweg: 'Derselbe Knopf.' },
  'pinnwand.neu.formular': { seite: 'Neuer Fall', titel: 'Formular Neuer Fall',
    loest_aus: 'Nichts, bis „Fall anlegen“ gedrückt wird.', bezug: 'Patient (muss in der Kartei sein), Grundlage, bei Wellness die Leistung, Kurzbezeichnung, Anlass.',
    aendert: 'Beim Anlegen: ein Fall in der Phase Anfrage mit Phasenprotokoll.', ergebnis: 'Die Fall-Details; die Karte steht auf der Pinnwand unter Anfrage.', rueckweg: 'Den Fall per Karte nach Archiv ziehen geht erst nach den Schritten; ein Fall ohne Inhalte lässt sich über Christian entfernen.' },
  'pinnwand.neu.anlegen': { seite: 'Neuer Fall', titel: 'Fall anlegen',
    loest_aus: 'Speichert den Fall.', bezug: 'Das Formular.', aendert: 'Fall, Phasenprotokoll, Protokoll.', ergebnis: 'Die Fall-Details.', rueckweg: 'Siehe Formular.' },
  'fall.weg-liste': { seite: 'Fall', titel: 'Patientenweg',
    loest_aus: AUSKUNFT, bezug: 'Alle Phasen; die aktuelle ist farbig, vergangene blass, kommende grün umrandet, wenn alles dafür da ist – sonst steht darunter, was fehlt.',
    aendert: NICHTS, ergebnis: 'Auf einen Blick: was als Nächstes zu tun ist.', rueckweg: KEIN_RUECKWEG },
  'fall.weg': { seite: 'Fall', titel: 'Phase im Patientenweg',
    loest_aus: AUSKUNFT, bezug: 'Ein Schritt und seine Voraussetzungen – z. B. Anamnese braucht Geburtsdatum, Rechnungsadresse, Kontakt, Behandlungseinwilligung, Datenschutzinformation und bei Rezeptfällen ein Rezept; Befund braucht die Anamnese; Behandlung den Eingangsbefund; Abschluss alle Haken; Rechnung den Abschlussbefund; Nachsorge keine offene Rechnung. Wellness überspringt Anamnese, Befund und Abschluss.',
    aendert: NICHTS, ergebnis: '„bereit“ oder „fehlt: …“.', rueckweg: KEIN_RUECKWEG },
  'fall.phase': { seite: 'Fall', titel: 'Phase verschieben',
    loest_aus: 'Wählt die Zielphase – für Handy und Tablet, wo Ziehen nicht geht.', bezug: 'Dieser Fall.', aendert: 'Nichts, bis „Verschieben“ gedrückt wird.', ergebnis: 'Die Auswahl.', rueckweg: 'Anders wählen.' },
  'fall.phase.setzen': { seite: 'Fall', titel: 'Verschieben',
    loest_aus: 'Setzt die Phase – mit denselben Regeln wie beim Ziehen; zurück nur mit Grund.', bezug: 'Die gewählte Phase.', aendert: 'Phase und Phasenprotokoll; „Archiv“ setzt Abschluss und Aufbewahrungsfrist (zehn Jahre).', ergebnis: 'Der Patientenweg oben wandert.', rueckweg: 'Zurück verschieben mit Grund.' },
  'fall.patient': { seite: 'Fall', titel: 'Patient',
    loest_aus: 'Öffnet die Patientenseite.', bezug: 'Der Patient dieses Falls.', aendert: NICHTS, ergebnis: 'Kachel, Rezepte, Termine, Kontaktverlauf.', rueckweg: KEIN_RUECKWEG },
  'fall.anamnese': { seite: 'Fall', titel: 'Anamnese',
    loest_aus: AUSKUNFT, bezug: 'Die aktuelle Fassung: Beschwerden, Vorgeschichte, Medikamente, Allergien, Risiken – verschlüsselt gespeichert.', aendert: NICHTS,
    ergebnis: 'Ältere Fassungen bleiben in der Akte.', rueckweg: KEIN_RUECKWEG },
  'fall.anamnese.neu': { seite: 'Fall', titel: 'Anamnese erfassen',
    loest_aus: 'Klappt das Anamnese-Formular auf.', bezug: 'Beschwerden (Pflicht), Vorgeschichte, Medikamente, Allergien, Risiken, Sonstiges; Art: Gespräch, online, Tablet, übernommen.',
    aendert: 'Beim Speichern: neue Fassung, alte als ersetzt markiert; der Fall rückt automatisch nach „Befund“, wenn alles dafür da ist.', ergebnis: 'Die Anamnese oben.', rueckweg: 'Neue Fassung – Ändern gibt es nicht (§ 630f).' },
  'fall.befund': { seite: 'Fall', titel: 'Befund',
    loest_aus: AUSKUNFT, bezug: 'Eingangs-, Verlaufs- oder Abschlussbefund mit Datum, Text und Messwerten.', aendert: NICHTS, ergebnis: 'Neueste zuerst.', rueckweg: KEIN_RUECKWEG },
  'fall.befund.neu': { seite: 'Fall', titel: 'Befund erfassen',
    loest_aus: 'Klappt das Befund-Formular auf.', bezug: 'Art, Datum, Text, Messwerte.', aendert: 'Beim Speichern: ein Befund (unveränderlich). Eingangsbefund rückt den Fall nach „Behandlung“, Abschlussbefund nach „Rechnung“ – wenn alles dafür da ist.',
    ergebnis: 'Der Befund in der Liste.', rueckweg: 'Ein weiterer Befund richtigstellt.' },
  'fall.erklaerung': { seite: 'Fall', titel: 'Erklärung',
    loest_aus: AUSKUNFT, bezug: 'Eine Einwilligung oder Information mit Datum, Form und Fassung; „gilt für alle Fälle“, wenn sie nicht an diesen Fall gebunden ist.', aendert: NICHTS, ergebnis: 'Widerrufene sind blass.', rueckweg: KEIN_RUECKWEG },
  'fall.erklaerung.widerrufen': { seite: 'Fall', titel: 'Erklärung widerrufen',
    loest_aus: 'Vermerkt den Widerruf mit Datum und Grund.', bezug: 'Eine gültige Erklärung.', aendert: 'Widerrufsdatum; die Erklärung bleibt in der Akte.', ergebnis: 'Blass; für Phasenregeln zählt sie nicht mehr.', rueckweg: 'Neue Erklärung erfassen.' },
  'fall.erklaerung.neu': { seite: 'Fall', titel: 'Erklärung erfassen',
    loest_aus: 'Klappt das Formular auf.', bezug: 'Art (Aufklärung, Einwilligung, Kosteninformation, Honorarvereinbarung, Datenschutzinformation, freiwillige Einwilligungen), Form, Datum, Fassung, Inhalt. Keine Pauschal-Einwilligung – jede einzeln (§4b).',
    aendert: 'Beim Speichern: ein Eintrag, dem Fall zugeordnet.', ergebnis: 'In der Liste; Phasenregeln sehen ihn.', rueckweg: '„widerrufen“.' },
  'fall.phasen': { seite: 'Fall', titel: 'Phasenprotokoll',
    loest_aus: AUSKUNFT, bezug: 'Jeder Phasenwechsel: von, nach, wann, wer, Grund („automatisch: …“ oder von Hand).', aendert: NICHTS, ergebnis: 'Neueste zuerst.', rueckweg: KEIN_RUECKWEG },

  // ── Rechnungen (W79, W81), Konfiguration (W80), Kalender (W82) ───────────
  'rechnung.neu.heil': { seite: 'Patient', titel: 'Neue Rechnung Heilbehandlung',
    loest_aus: 'Legt einen leeren Rechnungsentwurf für Heilbehandlung an (steuerfrei § 4 Nr. 14 UStG).', bezug: 'Für Fälle ohne Rezept-Entwurf, z. B. Einzelleistungen. Rezepte und Serien legen ihren Entwurf selbst an.',
    aendert: 'Ein Entwurf mit Empfänger, Preisliste des Patienten und Textbaustein R1.', ergebnis: 'Die Rechnungsseite.', rueckweg: 'Storno mit Grund.' },
  'rechnung.neu.wellness': { seite: 'Patient', titel: 'Neue Rechnung Wellness',
    loest_aus: 'Legt einen leeren Rechnungsentwurf für Wellness an (19 % – oder keine USt mit Kleinunternehmerregelung).', bezug: 'Wellness-Leistungen stehen nie mit Heilbehandlung auf einer Rechnung.',
    aendert: 'Ein Entwurf; mit Kleinunternehmerregelung kommt R2 (§ 19 UStG) automatisch dazu.', ergebnis: 'Die Rechnungsseite.', rueckweg: 'Storno mit Grund.' },
  'patient.preisliste': { seite: 'Patient', titel: 'Preisliste des Patienten',
    loest_aus: 'Wählt, nach welcher Preisliste die Leistungen dieses Patienten berechnet werden – oder „Standard“.', bezug: '„Standard“ heißt: keine feste Zuordnung, es gilt immer die aktuelle Standard-Preisliste (W97). Wählbar sind nur aktive, freigegebene Listen. Darunter steht, welche Liste heute gilt.',
    aendert: 'Beim Speichern die Zuordnung; bestehende Rechnungen und Entwürfe behalten ihre Preise (Entwürfe lassen sich auf der Rechnung mit „Preise übernehmen“ umstellen).', ergebnis: 'Neue Rezept-Entwürfe nutzen die gewählte Liste.', rueckweg: '„Standard“ wählen.' },
  'patient.rechnungsversand': { seite: 'Patient', titel: 'Rechnungen per Mail oder Post',
    loest_aus: 'Legt fest, wie der Patient seine Rechnungen bekommen möchte.', bezug: 'Vorgabe für „Als versendet vermerken“ auf der Rechnungsseite.', aendert: 'Das Merkmal am Patienten.', ergebnis: 'Die Rechnungsseite schlägt diesen Weg vor.', rueckweg: 'Anders wählen.' },
  'rechnung.empfaenger': { seite: 'Rechnung', titel: 'Empfänger',
    loest_aus: AUSKUNFT, bezug: 'Rechnungsempfänger aus den Bezugspersonen, sonst der Patient mit seiner Rechnungsadresse – festgehalten beim Anlegen des Entwurfs, damit spätere Adressänderungen alte Rechnungen nicht verändern.',
    aendert: NICHTS, ergebnis: 'Name und Anschrift, darunter der Versandwunsch.', rueckweg: 'Adresse beim Patienten ändern und einen neuen Entwurf anlegen.' },
  'rechnung.position': { seite: 'Rechnung', titel: 'Position',
    loest_aus: AUSKUNFT, bezug: 'Eine Leistung: Datum (aus dem Termin bzw. der erfassten Behandlung), Nummer aus der Preisliste, Bezeichnung, Anzahl × Einzelpreis, Betrag. „behandelt“ = die Behandlung ist in der Akte erfasst.',
    aendert: NICHTS, ergebnis: 'Grüner Rand, sobald die Behandlung erfasst ist.', rueckweg: KEIN_RUECKWEG },
  'rechnung.position.bearbeiten': { seite: 'Rechnung', titel: '✎ Position bearbeiten',
    loest_aus: 'Klappt Datum, Bezeichnung, Anzahl und Preis zum Ändern auf (nur im Entwurf).', bezug: 'Diese Position.', aendert: 'Beim Speichern die Position und die Summen.', ergebnis: 'Die Kachel zeigt die neuen Werte.', rueckweg: 'Erneut bearbeiten.' },
  'rechnung.position.entfernen': { seite: 'Rechnung', titel: '− Position entfernen',
    loest_aus: 'Nimmt die Position aus dem Entwurf.', bezug: 'Diese Position.', aendert: 'Position weg, Summen neu.', ergebnis: 'Eine Kachel weniger.', rueckweg: 'Mit „+“ wieder hinzufügen.' },
  'rechnung.position.neu': { seite: 'Rechnung', titel: '+ Position hinzufügen',
    loest_aus: 'Klappt die Auswahl auf: Leistung aus der Preisliste des Patienten (Heilbehandlung) oder aus dem Wellness-Katalog (Wellness), Datum, Anzahl, Preis.', bezug: 'Der Preis kommt aus der Liste; ein eingetragener Preis gewinnt.',
    aendert: 'Beim Hinzufügen eine Position und die Summen.', ergebnis: 'Neue Kachel am Ende.', rueckweg: '„−“ an der Kachel.' },
  'rechnung.summen': { seite: 'Rechnung', titel: 'Summen',
    loest_aus: AUSKUNFT, bezug: 'Heilbehandlung: keine USt (§ 4 Nr. 14 UStG). Wellness: USt zum eingestellten Satz – außer der Baustein § 19 UStG liegt bei, dann keine USt.', aendert: NICHTS, ergebnis: 'Netto, USt und Gesamt.', rueckweg: KEIN_RUECKWEG },
  'rechnung.textbaustein': { seite: 'Rechnung', titel: 'Textbaustein auf der Rechnung',
    loest_aus: AUSKUNFT, bezug: 'Ein Text unter den Positionen – Kopie des Bausteins aus der Konfiguration; hier anpassbar, ohne den Baustein zu ändern.', aendert: NICHTS,
    ergebnis: '„steuerfrei“ bzw. „keine USt“ zeigt, dass der Baustein die Steuer beeinflusst.', rueckweg: KEIN_RUECKWEG },
  'rechnung.textbaustein.text': { seite: 'Rechnung', titel: 'Text übernehmen',
    loest_aus: 'Speichert den geänderten Text nur für diese Rechnung.', bezug: 'Dieser Baustein.', aendert: 'Den Text an der Rechnung.', ergebnis: 'Der Text steht so auf der Rechnung.', rueckweg: 'Erneut ändern.' },
  'rechnung.textbaustein.entfernen': { seite: 'Rechnung', titel: '− Text entfernen',
    loest_aus: 'Nimmt den Baustein von der Rechnung.', bezug: 'Dieser Baustein. Ohne § 19-Baustein rechnet eine Wellness-Rechnung wieder USt.', aendert: 'Baustein weg, Summen neu.', ergebnis: 'Eine Kachel weniger.', rueckweg: '„+ Text hinzufügen“.' },
  'rechnung.textbaustein.neu': { seite: 'Rechnung', titel: '+ Text hinzufügen',
    loest_aus: 'Klappt die Auswahl der Textbausteine auf (Dank, Hinweise …).', bezug: 'Die Bausteine aus der Konfiguration.', aendert: 'Beim Hinzufügen eine Kopie an der Rechnung.', ergebnis: 'Neue Kachel.', rueckweg: '„−“ an der Kachel.' },
  'rechnung.fertig': { seite: 'Rechnung', titel: 'Fertig – an Lexware übertragen',
    loest_aus: 'Schließt den Entwurf ab: Status „Fertig – wartet auf Lexware“, Rechnungsdatum und Zeitraum werden gesetzt.', bezug: 'Ein Entwurf mit mindestens einer Position.',
    aendert: 'Status; die Übertragung nach Lexware kommt mit dem Tarif XL – bis dahin trägt Lilli die Nummer von Hand ein.', ergebnis: 'Die Knöpfe für Nummer und Zurück erscheinen.', rueckweg: '„Zurück in den Entwurf“, solange Lexware die Rechnung nicht hat.' },
  'ausgang.zurueck': { seite: 'Rechnung', titel: 'Zurück in den Entwurf',
    loest_aus: 'Macht die Rechnung wieder bearbeitbar.', bezug: 'Nur im Stand „Fertig – wartet auf Lexware“.', aendert: 'Status „Entwurf“.', ergebnis: 'Positionen und Texte lassen sich wieder ändern.', rueckweg: '„Fertig“.' },
  'rechnung.nummer': { seite: 'Rechnung', titel: 'Rechnungsnummer eintragen',
    loest_aus: 'Trägt die Nummer ein, die Lexware vergeben hat, und setzt „In Lexware“.', bezug: 'Lexware vergibt die fortlaufende Nummer – nie die Praxis-Assistenz (§ 14 UStG).', aendert: 'Nummer, Rechnungsdatum, Fälligkeit (14 Tage), Status.',
    ergebnis: 'Die Rechnung trägt ihre endgültige Nummer; „Versendet“ wird möglich.', rueckweg: 'Storno mit Grund – Nummern werden nicht wiederverwendet.' },
  'rechnung.nummer-holen': { seite: 'Rechnung', titel: 'Nummer aus Lexware holen (später)',
    loest_aus: 'Noch nichts – mit dem Lexware-Tarif XL legt die Praxis-Assistenz die Rechnung in Lexware an und holt Nummer und PDF selbst.', bezug: 'Die Lexware Public API.', aendert: NICHTS, ergebnis: 'Bleibt grau, bis XL da ist.', rueckweg: KEIN_RUECKWEG },
  'rechnung.versendet': { seite: 'Rechnung', titel: 'Als versendet vermerken',
    loest_aus: 'Vermerkt, dass die Rechnung per Mail, Post oder beidem rausging.', bezug: 'Vorbelegt mit dem Wunsch des Patienten aus den Stammdaten.', aendert: 'Status „Versendet“, Versandart, Datum, Fälligkeit.', ergebnis: 'Ab Fälligkeit wird die Patientenkachel gelb, 14 Tage danach rot.', rueckweg: '„Bezahlt“ oder Storno.' },
  'rechnung.bezahlt': { seite: 'Rechnung', titel: 'Bezahlt',
    loest_aus: 'Vermerkt den Zahlungseingang.', bezug: 'Später meldet Lexware das selbst (Zahlungsabgleich).', aendert: 'Status „Bezahlt“ mit Datum.', ergebnis: 'Die Kachel wird grün; Fall kann nach Nachsorge.', rueckweg: 'Nicht rücknehmbar; bei Irrtum Christian Bescheid geben.' },
  'rechnung.storno': { seite: 'Rechnung', titel: 'Storno',
    loest_aus: 'Storniert die Rechnung – der Grund ist Pflicht.', bezug: 'Jede nicht bezahlte Rechnung. Ist sie schon in Lexware, dort ebenfalls stornieren.', aendert: 'Status „Storniert“ mit Datum und Grund.', ergebnis: 'Blass; der Abgleich meldet eine Abweichung, bis Lexware ebenfalls storniert ist.', rueckweg: 'Neuen Entwurf anlegen.' },
  'rechnung.abweichung': { seite: 'Rechnung', titel: 'Abweichung zu Lexware',
    loest_aus: AUSKUNFT, bezug: 'Der Abgleich hat in Lexware etwas anderes gefunden: storniert, anderer Betrag. Lexware ist für Nummer und Betrag maßgeblich.', aendert: NICHTS,
    ergebnis: 'Die Kachel beim Patienten zeigt dieselbe Warnung.', rueckweg: 'In Lexware oder hier angleichen; beim nächsten Abgleich verschwindet die Warnung.' },
  'ausgang.pdf': { seite: 'Rechnung', titel: 'PDF aus Lexware',
    loest_aus: 'Öffnet das PDF, das Lexware mit Briefkopf erzeugt hat, im seitlichen Fenster.', bezug: 'Kommt mit dem Abgleich (Tarif XL) bzw. mit „Rechnungen aus Lexware holen“; liegt verschlüsselt im Tresor.', aendert: NICHTS, ergebnis: 'Das PDF rechts im Fenster, kein Tab-Wechsel.', rueckweg: '„Schließen“ oder Escape.' },
  'rechnung.lexware': { seite: 'Rechnung', titel: 'Nach Lexware',
    loest_aus: 'Legt die Rechnung in Lexware an und schreibt sie fest: Lexware vergibt die Nummer und erzeugt das PDF, beides kommt sofort zurück (Klick 1 von zwei, W100). Ein Entwurf wird dabei fertiggestellt.',
    bezug: 'Diese Rechnung mit Positionen und Textbausteinen; der Empfänger als Lexware-Kunde – fehlt er, wird er angelegt und am Patienten vermerkt.',
    aendert: 'Status „In Lexware“, Nummer, Rechnungsdatum, Fälligkeit (14 Tage), PDF im Tresor; am Patienten die Lexware-Kundennummer. In Lexware entsteht eine festgeschriebene Rechnung. Die Testumgebung spricht mit einer Attrappe.',
    ergebnis: 'Die Rechnungsseite mit Nummer und PDF – danach „Versenden“.', rueckweg: 'Keiner: Festgeschriebene Rechnungen lassen sich nur stornieren, hier und in Lexware.' },
  'rechnung.versenden': { seite: 'Rechnung', titel: 'Versenden',
    loest_aus: 'Schickt die Rechnung über den gewählten Weg: per Mail sofort aus dem Praxispostfach mit dem PDF im Anhang (Klick 2 von zwei – die eine Ausnahme von „nichts geht automatisch“, E30); per Post wird der Versand vermerkt und du druckst das PDF.',
    bezug: 'Die Rechnung aus Lexware (Nummer und PDF), die Mailadresse des Patienten und die Vorlage „Rechnung zusenden“.',
    aendert: 'Status „Versendet“ mit Datum und Versandweg, Eintrag im Kontaktverlauf; die Mail liegt in „Gesendete Elemente“. Testumgebung: nur an Testadressen.',
    ergebnis: 'Die Meldung nennt den Empfänger; bei Post den Hinweis zum Drucken.', rueckweg: 'Eine gesendete Mail lässt sich nicht zurückholen; die Rechnung selbst nur per Storno.' },
  'rechnung.girocode': { seite: 'Rechnung', titel: 'GiroCode',
    loest_aus: AUSKUNFT, bezug: 'Ein QR-Code nach dem EPC-Standard mit IBAN, Kontoinhaber, Betrag und der Rechnungsnummer als Verwendungszweck – aus der Bankverbindung in der Konfiguration. Der Patient scannt ihn mit seiner Banking-App, auch direkt vom Bildschirm in der Praxis; er hängt außerdem als Bild an der Rechnungs-Mail.',
    aendert: NICHTS, ergebnis: 'Die Überweisung kommt mit der exakten Rechnungsnummer an – Lexware ordnet sie automatisch zu (W102).', rueckweg: KEIN_RUECKWEG },
  'rechnung.lexware-link': { seite: 'Rechnung', titel: 'In Lexware öffnen',
    loest_aus: 'Öffnet dieselbe Rechnung in Lexware Office (neuer Tab, Anmeldung dort) – etwa, um einen Zuordnungsvorschlag für den Bankumsatz zu bestätigen oder zu stornieren.',
    bezug: 'Die Rechnung in Lexware, verknüpft über ihre Lexware-ID.', aendert: 'Hier nichts; was du in Lexware änderst, holt „Rechnungen und Zahlungen aus Lexware prüfen“ nach.',
    ergebnis: 'Lexware mit der Rechnung.', rueckweg: 'Tab schließen.' },
  'rechnung.versand-art': { seite: 'Rechnung', titel: 'Versandweg',
    loest_aus: 'Wählt Mail, Post oder beides – vorbelegt mit dem Wunsch aus den Stammdaten des Patienten.', bezug: 'Rechnungsversand in den Stammdaten.',
    aendert: 'Nur diese Sendung.', ergebnis: 'Der gewählte Weg steht nach dem Versand an der Rechnung.', rueckweg: KEIN_RUECKWEG },
  'konfiguration.link': { seite: 'Rechnung', titel: 'Konfiguration',
    loest_aus: 'Öffnet die Konfigurationsseite (Textbausteine, Steuer, Preislisten, Wellness).', bezug: 'Für den Rechner; am Handy ausgeblendet.', aendert: NICHTS, ergebnis: 'Die Konfigurationsseite.', rueckweg: KEIN_RUECKWEG },
  'konfiguration.preislisten': { seite: 'Konfiguration', titel: 'Preislisten', loest_aus: 'Öffnet die Preislisten.', bezug: 'Eigene Preise je Leistung.', aendert: NICHTS, ergebnis: 'Die Preislisten-Seite.', rueckweg: KEIN_RUECKWEG },
  'konfiguration.wellness': { seite: 'Konfiguration', titel: 'Wellness-Katalog', loest_aus: 'Öffnet den Wellness-Katalog.', bezug: 'Leistungen ohne Krankheitsbezug.', aendert: NICHTS, ergebnis: 'Der Katalog.', rueckweg: KEIN_RUECKWEG },
  'konfiguration.rueckmeldungen': { seite: 'Konfiguration', titel: 'Rückmeldungen', loest_aus: 'Öffnet die gesammelten Rückmeldungen.', bezug: 'Was über das Fähnchen gemeldet wurde.', aendert: NICHTS, ergebnis: 'Die Liste.', rueckweg: KEIN_RUECKWEG },
  'konfiguration.textbaustein': { seite: 'Konfiguration', titel: 'Textbaustein',
    loest_aus: AUSKUNFT, bezug: 'Kennung (R + Nummer), Kurzname oben, Text darunter; Wirkung (nur Text / § 4 Nr. 14 / § 19) und wann er automatisch auf eine Rechnung kommt.', aendert: NICHTS,
    ergebnis: 'Blass = ausgeblendet.', rueckweg: KEIN_RUECKWEG },
  'konfiguration.textbaustein.bearbeiten': { seite: 'Konfiguration', titel: 'Textbaustein bearbeiten',
    loest_aus: 'Klappt Kurzname, Text, Wirkung und Automatik auf.', bezug: 'Dieser Baustein. Bestehende Rechnungen behalten ihre Kopie.', aendert: 'Beim Speichern den Baustein für künftige Rechnungen.', ergebnis: 'Die Kachel zeigt die neuen Werte.', rueckweg: 'Erneut bearbeiten.' },
  'konfiguration.textbaustein.aktiv': { seite: 'Konfiguration', titel: 'ausblenden / wieder anbieten',
    loest_aus: 'Nimmt den Baustein aus der Auswahl oder bringt ihn zurück.', bezug: 'Gelöscht wird nicht – alte Rechnungen verweisen darauf.', aendert: 'Das Merkmal „aktiv“.', ergebnis: 'Ausgeblendete fehlen bei „+ Text“.', rueckweg: 'Derselbe Knopf.' },
  'konfiguration.textbaustein.neu': { seite: 'Konfiguration', titel: '+ Textbaustein',
    loest_aus: 'Klappt das Formular für einen neuen Baustein auf.', bezug: 'Kurzname, Text, Wirkung, Automatik; die Kennung vergibt das System (nächste freie R-Nummer).', aendert: 'Beim Anlegen ein neuer Baustein.', ergebnis: 'Neue Kachel.', rueckweg: '„ausblenden“.' },
  'konfiguration.kleinunternehmer': { seite: 'Konfiguration', titel: 'Kleinunternehmerregelung',
    loest_aus: 'Schaltet, ob § 19 UStG gilt.', bezug: 'Gilt sie, rechnet keine Wellness-Rechnung Umsatzsteuer, und R2 kommt automatisch dazu. Heilbehandlung ist davon unabhängig steuerfrei. Grenzen 2025: 25.000 € Vorjahr, 100.000 € laufend.',
    aendert: 'Die Einstellung; bestehende Entwürfe ändern sich erst, wenn ihr Baustein geändert wird.', ergebnis: 'Neue Wellness-Entwürfe ohne bzw. mit USt.', rueckweg: 'Zurückschalten.' },
  'konfiguration.bank-inhaber': { seite: 'Konfiguration', titel: 'Kontoinhaber',
    loest_aus: 'Speichert den Namen, der im GiroCode als Zahlungsempfänger steht.', bezug: 'Die Bankverbindung der Praxis für Rechnungen (W102).', aendert: 'Die Einstellung; wirkt auf alle künftig erzeugten GiroCodes.',
    ergebnis: 'Leer = Praxisname.', rueckweg: 'Feld ändern und erneut speichern.' },
  'konfiguration.bank-iban': { seite: 'Konfiguration', titel: 'IBAN',
    loest_aus: 'Speichert die IBAN für den GiroCode – mit Prüfung der Prüfziffer, damit kein Zahlendreher in den Code gerät.', bezug: 'Das Konto, auf das Patienten Rechnungen überweisen; sollte zum Lexware-Bankkonto passen, damit der Abgleich greift.',
    aendert: 'Die Einstellung; ohne gültige IBAN gibt es keinen GiroCode (Rechnungsseite und Mail bleiben ohne).', ergebnis: 'Die IBAN steht ohne Leerzeichen da.', rueckweg: 'Feld leeren und speichern schaltet den GiroCode ab.' },
  'konfiguration.bank-bic': { seite: 'Konfiguration', titel: 'BIC',
    loest_aus: 'Speichert die BIC – optional, innerhalb des Euroraums braucht der GiroCode sie nicht.', bezug: 'Die Bankverbindung der Praxis.', aendert: 'Die Einstellung.',
    ergebnis: 'Leer oder 8 bzw. 11 Zeichen.', rueckweg: 'Feld leeren und speichern.' },
  'konfiguration.ust-satz': { seite: 'Konfiguration', titel: 'Umsatzsteuersatz Wellness',
    loest_aus: 'Legt den Satz fest, der ohne Kleinunternehmerregelung auf Wellness gerechnet wird.', bezug: 'Regelsatz 19 %.', aendert: 'Die Einstellung.', ergebnis: 'Die Summen neuer Wellness-Rechnungen.', rueckweg: 'Wert ändern.' },
  'uebersicht.kalender': { seite: 'Cockpit', titel: '→ Kalender',
    loest_aus: 'Öffnet die Kalenderseite mit allen Terminen eines Tages oder einer Woche.', bezug: 'Termine aus der Kartei.', aendert: NICHTS, ergebnis: 'Der heutige Tag; oben Wechsel auf Woche.', rueckweg: 'Zurück zum Cockpit.' },
  'kalender.tag': { seite: 'Kalender', titel: 'Tag',
    loest_aus: 'Der Tagesname öffnet diesen Tag in der Tagesansicht.', bezug: 'Alle Termine der Kartei an diesem Tag; die Zahl ist die Anzahl.', aendert: NICHTS, ergebnis: 'Heute hat einen farbigen Rahmen.', rueckweg: KEIN_RUECKWEG },
  'kalender.termin': { seite: 'Kalender', titel: 'Termin',
    loest_aus: 'Öffnet die Patientenseite, Abschnitt Termine.', bezug: 'Zeit, Patient (Initialen oder Name), Rezept/Individual, ob er im Kalender des Postfachs steht.', aendert: NICHTS, ergebnis: 'Dort lässt sich der Termin ändern.', rueckweg: 'Zurück.' },
  'kalender.zurueck': { seite: 'Kalender', titel: '‹ zurück', loest_aus: 'Einen Tag bzw. eine Woche zurück.', bezug: 'Die Ansicht.', aendert: NICHTS, ergebnis: 'Der vorherige Zeitraum.', rueckweg: '„weiter ›“.' },
  'kalender.weiter': { seite: 'Kalender', titel: 'weiter ›', loest_aus: 'Einen Tag bzw. eine Woche weiter.', bezug: 'Die Ansicht.', aendert: NICHTS, ergebnis: 'Der nächste Zeitraum.', rueckweg: '„‹ zurück“.' },
  'kalender.heute': { seite: 'Kalender', titel: 'Heute', loest_aus: 'Springt zum heutigen Tag.', bezug: 'Die Ansicht.', aendert: NICHTS, ergebnis: 'Heute.', rueckweg: KEIN_RUECKWEG },
  'kalender.ansicht-tag': { seite: 'Kalender', titel: 'Tag', loest_aus: 'Zeigt einen Tag als Liste.', bezug: 'Die Darstellung.', aendert: NICHTS, ergebnis: 'Ein Tag.', rueckweg: '„Woche“.' },
  'kalender.ansicht-woche': { seite: 'Kalender', titel: 'Woche', loest_aus: 'Zeigt Montag bis Sonntag als Spalten.', bezug: 'Die Darstellung.', aendert: NICHTS, ergebnis: 'Sieben Spalten.', rueckweg: '„Tag“.' },
  'kalender.namen': { seite: 'Kalender', titel: 'Namen zeigen / Nur Initialen',
    loest_aus: 'Schaltet zwischen Initialen und vollen Namen.', bezug: 'Diskret-Modus wie im Cockpit – am Bildschirm in der Praxis besser Initialen.', aendert: NICHTS, ergebnis: 'Die Karten zeigen Namen oder Initialen.', rueckweg: 'Zurückschalten.' },

  // ── Steuerfreie Umsätze (W85) ─────────────────────────────────────────────
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

  // ── Outlook-Kategorien (aus src/mail/kategorien.ts) ──────────────────────
  ...Object.fromEntries(
    Object.entries(KATEGORIEN).map(([key, k]) => [
      `kategorie.${key}`,
      {
        seite: 'Outlook-Kategorien', titel: `Kategorie „${k.name}“ (${k.farbname})`,
        loest_aus: 'Nichts – eine farbige Markierung an der Mail in Outlook, auf iPhone und Mac.',
        bezug: 'Eine Mail im Praxispostfach.',
        aendert: `Die Praxis-Assistenz setzt die Kategorie selbst (${k.ab === 'jetzt' ? 'schon heute' : k.ab}).`,
        ergebnis: `${k.wann} Was du tust: ${k.tun}`,
        rueckweg: 'In Outlook die Kategorie entfernen. Was abgelegt wurde, bleibt abgelegt; das System legt nichts doppelt ab.',
      } satisfies HilfeEintrag,
    ]),
  ),
};

// ── Das Skript im Browser ────────────────────────────────────────────────────
// Bewusst ohne Bibliothek und ohne Inline-Handler: die Seiten erlauben nur Skripte von /hilfe.js.
const CLIENT = String.raw`
(function () {
  var FELDER = [['loest_aus', 'Löst aus'], ['bezug', 'Bezug'], ['aendert', 'Ändert'], ['ergebnis', 'Ergebnis'], ['rueckweg', 'Rückweg']];
  var offenFuer = null, druck = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function platz() {
    var p = document.getElementById('hilfePlatz');
    if (!p) { p = document.createElement('div'); p.id = 'hilfePlatz'; document.body.appendChild(p); }
    return p;
  }
  function karteHtml(key) {
    var e = HILFE[key];
    if (!e) return '<div class="hilfe-karte" id="hilfeKarte" role="dialog"><div class="hilfe-kopf"><strong>Keine Erklärung</strong>' +
      '<button class="hilfe-schliessen" aria-label="Schließen">×</button></div><p>Für dieses Element fehlt die Erklärung („' + esc(key) + '“).</p></div>';
    return '<div class="hilfe-karte" id="hilfeKarte" role="dialog" aria-label="Erklärung: ' + esc(e.titel) + '">' +
      '<div class="hilfe-kopf"><strong>' + esc(e.titel) + '</strong><button class="hilfe-schliessen" aria-label="Schließen">×</button></div>' +
      '<dl class="hilfe-felder">' + FELDER.map(function (f) { return '<dt>' + f[1] + '</dt><dd>' + esc(e[f[0]]) + '</dd>'; }).join('') + '</dl>' +
      '<div class="hilfe-fuss">Esc schließt · <a href="/hilfe#hilfe-' + esc(key.replace(/\./g, '-')) + '">in der Hilfe ansehen</a> · <a href="#" data-rm-melden="' + esc(key) + '">Hinweis oder Fehler melden</a></div></div>';
  }
  function setzen(k, el) {
    var r = el.getBoundingClientRect(), b = k.offsetWidth || 420, h = k.offsetHeight || 280;
    var links = r.left, oben = r.bottom + 6;
    if (links + b > window.innerWidth - 12) links = Math.max(12, window.innerWidth - b - 12);
    if (oben + h > window.innerHeight - 12) oben = Math.max(12, r.top - h - 6);
    k.style.left = Math.round(links) + 'px'; k.style.top = Math.round(oben) + 'px';
  }
  function zeige(el) {
    if (offenFuer === el) { schliesse(); return; }
    offenFuer = el;
    var p = platz(); p.innerHTML = karteHtml(el.getAttribute('data-hilfe'));
    var k = document.getElementById('hilfeKarte'); setzen(k, el);
    k.querySelector('.hilfe-schliessen').addEventListener('click', schliesse);
    try { localStorage.setItem('hilfeGesehen', '1'); } catch (x) { /* privates Fenster */ }
    var hw = document.getElementById('hilfeHinweis'); if (hw) hw.className = 'hilfe-hinweis';
  }
  function schliesse() { var p = document.getElementById('hilfePlatz'); if (p) p.innerHTML = ''; offenFuer = null; }
  function ziel(t) { return t && t.closest ? t.closest('[data-hilfe]') : null; }
  document.addEventListener('contextmenu', function (e) {
    if (e.shiftKey) return;
    var el = ziel(e.target); if (!el) return;
    e.preventDefault(); zeige(el);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { schliesse(); return; }
    if (e.key !== '?' && e.key !== 'F1') return;
    var el = ziel(document.activeElement);
    if (!el || (e.key === '?' && /^(INPUT|TEXTAREA)$/.test(el.tagName))) return;
    e.preventDefault(); zeige(el);
  });
  document.addEventListener('mousedown', function (e) {
    if (offenFuer && !(e.target.closest && e.target.closest('#hilfeKarte'))) schliesse();
  });
  document.addEventListener('touchstart', function (e) {
    var el = ziel(e.target); if (!el) return;
    druck = setTimeout(function () { zeige(el); }, 600);
  }, { passive: true });
  ['touchend', 'touchmove'].forEach(function (n) { document.addEventListener(n, function () { clearTimeout(druck); druck = null; }); });
  document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('hilfeListe')) return; // die Hilfeseite erklärt sich selbst
    var gesehen = false; try { gesehen = localStorage.getItem('hilfeGesehen') === '1'; } catch (x) { /* privat */ }
    var hw = document.createElement('div'); hw.id = 'hilfeHinweis';
    hw.className = 'hilfe-hinweis' + (gesehen ? '' : ' neu');
    hw.innerHTML = 'Rechtsklick (am Handy: lange drücken) erklärt jedes Element · <a href="/hilfe">alle Erklärungen</a>';
    document.body.appendChild(hw);
  });
})();
`;

/** Inhalt von /hilfe.js: die Texte und das Skript in einer Datei */
export function hilfeSkript(): string {
  return `var HILFE = ${JSON.stringify(HILFE)};\n${CLIENT}`;
}

const FUNKTIONEN: { name: string; was: string; stand: 'jetzt' | 'später'; woher: string }[] = [
  { name: 'Cockpit', was: 'Startseite: Finanzen und Patienten mit ihren Seiten, Termine heute, neue Rechnungen, Anfragen, Änderungen der Woche.', stand: 'jetzt', woher: 'erste Fassung, Prompt 10' },
  { name: 'Rechnungs-Dashboard', was: 'Neue Rechnungen als Kacheln, PDF-Ansicht, Freigabe, Haken „privat“, Summen je Monat und Lieferant, Suche.', stand: 'jetzt', woher: 'Prompt 15' },
  { name: 'Preislisten', was: 'Eigene Preise je Leistung auf Grundlage der GKV-Liste, mit Faktor, Aufrunden, Beihilfe-Vergleich, Mustern (z. B. GebüTh), Freigabe (danach unveränderlich), mehrere aktive Listen und genau ein Standard, Archiv mit Nachfolger; nachts Prüfung auf neue Grundlagen mit rotem Punkt. Rechnungen frieren Preisliste und Einzelpreise ein – eine Preisänderung ist immer eine neue Liste.', stand: 'jetzt', woher: 'W59, W97' },
  { name: 'Rechnungsentwürfe', was: 'Jedes Rezept und jede Serie legt sofort einen Rechnungsentwurf an (Positionen mit Terminen, Preise aus der Preisliste des Patienten, Textbausteine). Positionen und Texte als Kacheln, Statusweg Entwurf → Fertig → In Lexware → Versendet → Bezahlt, Storno mit Grund; Heilbehandlung und Wellness immer getrennt.', stand: 'jetzt', woher: 'W79, W81' },
  { name: 'Steuerfreie Umsätze', was: 'Liste aller gestellten Rechnungen ohne USt (§ 4 Nr. 14, § 19) für das Finanzamt – Namen maskiert oder ausgeschrieben, Export CSV (GoBD) und PDF.', stand: 'jetzt', woher: 'W85' },
  { name: 'Konfiguration', was: 'Textbausteine für Rechnungen (R1 § 4 Nr. 14, R2 § 19, R3 Dank), Kleinunternehmerregelung, Steuersatz, Verweise auf Preislisten und Wellness-Katalog.', stand: 'jetzt', woher: 'W80' },
  { name: 'Kalenderseite', was: 'Alle Termine der Kartei als Tag oder Woche, Initialen oder Namen; über das Kalender-Symbol bei „Heute im Blick“.', stand: 'jetzt', woher: 'W82' },
  { name: 'Rezepte und Serien', was: 'Rezepte als Kacheln mit sieben Rezeptarten (Erst, Folge unverändert/angepasst, Wiederaufnahme, Korrektur, Zweitschrift, Langzeit), Behandlung ohne Rezept (Direktzugang) und Wellness-Serien aus dem eigenen Katalog.', stand: 'jetzt', woher: 'W73, W74' },
  { name: 'Rückmeldungen', was: 'Kleines Fähnchen an jedem erklärten Element und an jeder Seite: Hinweis oder Fehler mit Screenshot und Text melden – landet in einer eigenen Entwicklungs-Datenbank, Sammelseite /rueckmeldungen.', stand: 'jetzt', woher: 'W72' },
  { name: 'Patientenkartei', was: 'Kacheln mit Anrufen, WhatsApp, Mail, letzter Behandlung und nächstem Termin; Kontaktverlauf mit Gesprächsgrund; Adressen mit Rechnungsadresse; Akte nach § 630f (unveränderlich, verschlüsselt); Termine, Rezepte als Stempelkarte.', stand: 'jetzt', woher: 'W63–W68' },
  { name: 'Terminarten für die Online-Anfrage', was: 'Kacheln mit Kennung, Kurz- und Langbeschreibung und Dauer in drei Sektionen (Rezept, Selbstzahler, Wellness); Haken „aktiv“ = im Dropdown der Website; Vorschau und HTML-Baustein für das Formular. Farbe und Symbol der Sektion kehren in Kalenderseite, Cockpit und Outlook wieder.', stand: 'jetzt', woher: 'W94, W95' },
  { name: 'Buchungsseite', was: 'Eigene Buchungsseite zum Einbetten in lilli-nebel.de: Patient wählt Terminart (die aktiven Kacheln), Tag im Monatsblatt und freie Uhrzeit, gibt Name, Telefon, Mail an – der Wunsch kommt als Anfrage mit reserviertem Termin, Lilli bestätigt mit einem Klick. Eigener kleiner Dienst ohne Zugang zu Kartei, Postfach oder Tresor; öffentlich erst nach Freigabe.', stand: 'jetzt', woher: 'W96, E29' },
  { name: 'Akte-Einsicht (§ 630g)', was: 'Die ganze Akte eines Patienten als PDF – Stammdaten, Rezepte, Anamnese, Befunde, Erklärungen, Behandlungen, Termine; jeder Export im Protokoll.', stand: 'jetzt', woher: 'A19d, W68' },
  { name: 'Statusseite', was: 'Zeigt, ob die Verbindung zu Postfach, Kalender und OneDrive steht.', stand: 'jetzt', woher: 'diese Seiten' },
  { name: 'Outlook-Kategorien', was: 'Fünf farbige Kategorien zeigen in Outlook, was mit einer Mail passiert ist.', stand: 'jetzt', woher: 'angelegt am 20.10.2026' },
  { name: 'Finanzordner je Jahr', was: 'Legt „01 Finanzen/<Jahr>“ nach der Vorlage des Vorjahres an, mit „Eingangsrechnungen“.', stand: 'jetzt', woher: '2026 angelegt am 20.10.2026' },
  { name: 'Rechnungseingang', was: 'Erkennt Lieferantenrechnungen im Postfach und legt sie in „Eingangsrechnungen“ ab. Läuft bisher nur als Probelauf – es wird nichts verändert.', stand: 'jetzt', woher: 'Prompt 4' },
  { name: 'Mail-Entwürfe mit Anhängen', was: 'Auf der Patientenseite: Vorlage wählen (Termin, Rezept, Rechnung, Rückruf, Dank, freier Text), Rechnungs-PDF oder Unterlagen anhängen – der fertige Entwurf liegt im Postfach unter „Entwürfe“, gesendet wird in Outlook oder Apple Mail.', stand: 'jetzt', woher: 'W91, Prompt 13, Leitplanke 3' },
  { name: 'WhatsApp', was: 'Knöpfe an Patient und Termin öffnen WhatsApp mit fertigem Text (Bestätigung, Erinnerung, Rezept, Rückruf …) – gesendet wird vom Handy. Mit WhatsApp-Business-Zugang und Einwilligung des Patienten auch direkter Versand und Empfang in den Kontaktverlauf.', stand: 'jetzt', woher: 'W90, Prompt 7, E8' },
  { name: 'Freigabe', was: 'Rechnungen freigeben, ablehnen (mit Grund) oder zurückstellen – am Handy und am Rechner.', stand: 'jetzt', woher: 'Prompt 15' },
  { name: 'Lexware', was: 'Freigegebene Belege landen in Lexware unter „Belege – zu prüfen“; fertige Rechnungsentwürfe werden nach Lexware übertragen, Nummer und PDF kommen zurück, Storno und Zahlung werden abgeglichen.', stand: 'später', woher: 'Prompt 5, 11, E28' },
  { name: 'Bezahlt ins Archiv (Übergang)', was: 'Du setzt „Rechnung: bezahlt“ in Outlook, das System verschiebt die Mail ins Archiv und merkt sich den Stand.', stand: 'jetzt', woher: 'bis zum Tarif XL' },
  { name: 'Übernahme des Bestands', was: 'Rechnungen aus Archiv, Unterordnern und Papierkorb rückwirkend ablegen; was du als bezahlt bestätigst, kommt gleich ins Archiv.', stand: 'jetzt', woher: 'Fragen an Lilli, Nr. 1' },
  { name: 'Zahlungsstand aus Lexware', was: 'Liest aus Lexware, ob eine Rechnung zur Zahlung angestoßen oder bezahlt ist, setzt die Kategorie und archiviert die Mail.', stand: 'später', woher: 'Tarif XL, Prompt 5' },
  { name: 'Terminanfragen', was: 'Liest den Ordner „Terminanfragen“ des Postfachs (freie Mails und Website-Formulare), erkennt Anliegen und Zeitwünsche, ordnet den Patienten zu, schlägt drei freie Zeiten vor (Öffnungszeiten, Feiertage, Kartei, Haupt- und Praxiskalender), reserviert sie im Kalender, legt die Antwort als Entwurf an und trägt den bestätigten Termin in die Kartei ein. Telefon und WhatsApp von Hand.', stand: 'jetzt', woher: 'A15, Prompt 6, W92' },
  { name: 'Cockpit – weitere Teile', was: 'Offene Zahlungen aus Lexware, Freigabe direkt in der Übersicht, Diskret-Schalter für alle Seiten.', stand: 'später', woher: 'Prompt 8, 10' },
  { name: 'Patienten-Pinnwand', was: 'Acht Phasen von der Anfrage bis zur Nachsorge als Spalten oder Zeilen; Fall-Karten ziehen (Regeln prüfen die Daten des vorherigen Schritts), Fall-Details mit Anamnese, Befunden, Erklärungen, Phasenprotokoll.', stand: 'jetzt', woher: 'W76, Prompt 12' },
  { name: 'Schnellaktionen auf der Pinnwand', was: 'Mail-Entwurf direkt aus der Fall-Karte, passend zur Phase; Erkennung „gesendet“ aus „Gesendete Elemente“.', stand: 'später', woher: 'Prompt 13 – der Entwurf selbst geht heute auf der Patientenseite' },
  { name: 'Terminbuchung von der Website', was: 'Das Kontaktformular der Website schickt eine Mail mit festen Feldern; die Praxis-Assistenz liest sie, legt die Anfrage an und schlägt Termine vor.', stand: 'später', woher: 'W92, Prompt 6' },
  { name: 'Rezepte', was: 'Stempelkarte je Rezept, Abhaken nach jeder Behandlung, Zwischen- und Abschlussrechnung.', stand: 'später', woher: 'Prompt 14, PDF Patientenweg S. 5' },
];

export function hilfeSeite(o: { wer: string; fassung: string; skriptInline?: string }): string {
  const seitenNamen = [...new Set(Object.values(HILFE).map((e) => e.seite))];
  const kategorien = Object.entries(KATEGORIEN)
    .map(([key, k]) => `<tr><td><span class="chip ${k.farbe}" data-hilfe="kategorie.${key}" tabindex="0">${esc(k.name)}</span></td>
      <td>${esc(k.wann)}</td><td>${esc(k.tun)}</td><td><span class="marke${k.ab === 'jetzt' ? ' jetzt' : ''}">${esc(k.ab)}</span></td></tr>`)
    .join('');
  const funktionen = FUNKTIONEN.map((f) => `<tr><td><b>${esc(f.name)}</b></td><td>${esc(f.was)}</td>
    <td><span class="marke${f.stand === 'jetzt' ? ' jetzt' : ''}">${f.stand}</span></td><td class="hint">${esc(f.woher)}</td></tr>`).join('');
  const liste = seitenNamen
    .map((name) => `<div class="karte"><h3>${esc(name)}</h3>${Object.entries(HILFE)
      .filter(([, e]) => e.seite === name)
      .map(([key, e]) => `<div class="hilfe-eintrag" id="hilfe-${esc(key.replace(/\./g, '-'))}"><h3>${esc(e.titel)}</h3>
        <dl class="hilfe-felder"><dt>Löst aus</dt><dd>${esc(e.loest_aus)}</dd><dt>Bezug</dt><dd>${esc(e.bezug)}</dd>
        <dt>Ändert</dt><dd>${esc(e.aendert)}</dd><dt>Ergebnis</dt><dd>${esc(e.ergebnis)}</dd><dt>Rückweg</dt><dd>${esc(e.rueckweg)}</dd></dl></div>`)
      .join('')}</div>`)
    .join('');

  return seite({
    titel: 'Hilfe – Praxis Lilli Nebel', aktiv: 'hilfe', wer: o.wer, fassung: o.fassung, skriptInline: o.skriptInline,
    inhalt: `
<h1>Hilfe</h1>
<p>Die Praxis-Assistenz nimmt dir Büroarbeit ab: Sie sortiert Post, legt Rechnungen ab und bereitet
Antworten vor. <b>Entscheiden tust du.</b> Nichts geht an Patienten, ohne dass du es freigibst.</p>

<h2>Bedienen</h2>
<div class="karte">
<p><b>Rechtsklick</b> auf einen Knopf, eine Kategorie oder einen Prüfpunkt erklärt ihn – am iPhone und iPad
<b>lange drücken</b>. Jede Erklärung beantwortet fünf Fragen: <i>Löst aus</i> (was passiert), <i>Bezug</i>
(worauf), <i>Ändert</i> (was gespeichert wird), <i>Ergebnis</i> (wie es danach aussieht), <i>Rückweg</i>
(wie man es zurücknimmt).</p>
<p class="hint"><kbd>Esc</kbd> schließt die Erklärung. Tastatur: <kbd>?</kbd> oder <kbd>F1</kbd> auf einem
ausgewählten Element. Umschalt + Rechtsklick öffnet das normale Browser-Menü.</p>
<p><b>Etwas melden:</b> Fährst du über ein erklärtes Element, erscheint an seiner Ecke ein winziges <b>Fähnchen</b>; unten links
steht eines für die ganze Seite, und jede Erklärung hat den Link „Hinweis oder Fehler melden“. Ein Klick macht einen Screenshot des
Kastens, fragt <b>Hinweis oder Fehler</b> und nimmt deinen Text auf. Alles landet in einer eigenen Entwicklungs-Datenbank –
<a href="/rueckmeldungen">alle Rückmeldungen</a>.</p>
</div>

<h2>Das Cockpit</h2>
<div class="karte">
<p>Das Cockpit ist die Startseite. <b>Links</b> stehen die beiden Bereiche <b>Finanzen</b> und <b>Patienten</b>
mit ihren Seiten – farbige Kacheln kannst du öffnen, graue kommen später. <b>Rechts</b> „Heute im Blick“:
<b>Termine heute</b> (als Leiste und Liste, Namen nur als Initialen), <b>neue Rechnungseingänge</b> und
<b>Terminanfragen</b> – jede Anfrage trägt das Symbol ihres Wegs: E-Mail, WhatsApp, Telefon, Website,
Online-Buchung. <b>Unten</b> steht, was sich in der letzten Woche geändert hat.</p>
<p class="hint">Das Cockpit zeigt nur echte Daten. Ist eine Quelle noch nicht angebunden, steht das dort –
es werden keine Zahlen erfunden. Am iPhone stehen die Teile untereinander, die Übersicht zuerst.</p>
</div>

<h2>Das Rechnungs-Dashboard</h2>
<div class="karte">
<p>Oben die <b>neuen Rechnungen</b> als Kacheln: Dateiname, Lieferant, Betrag, wann die Mail kam und von wem.
Fährst du mit der Maus darüber, steht da, <b>in welchem Ordner die Mail liegt</b>. Der Haken <b>„privat“</b>
nimmt eine Rechnung aus der Praxisbuchhaltung – die Datei wandert nach „Privat“, zurück geht es mit demselben Haken.</p>
<p>Ein <b>Klick auf die Kachel</b> zeigt das PDF. Daneben: <b>Freigeben</b>, <b>Später</b> oder <b>Ablehnen</b> (mit Grund),
und die Angaben Lieferant, Rechnungsnummer, Betrag und Datum zum Korrigieren.</p>
<p>Unten die <b>Auswertung</b>: Summen je Monat und je Lieferant für ein Jahr, ohne private und abgelehnte Rechnungen,
dazu Suche und Filter und die Liste aller Rechnungen.</p>
</div>

<h2>Die Patientenkartei</h2>
<div class="karte">
<p>Jeder Patient ist eine <b>Kachel</b>: Name, Telefon, WhatsApp und Mail als echte Links – am Handy startet ein Tipp den Anruf.
Danach fragt die Patientenseite, <b>worum es ging</b> (Terminverschiebung, Absage, Rückfrage …); so entsteht der Kontaktverlauf von selbst.
Auf der Kachel stehen außerdem <b>Patient seit</b>, die <b>letzte Behandlung</b> (Klick öffnet die Akte) und der <b>nächste Termin</b>
(Rezept oder Individual). Ist eine Rechnung überfällig, wird der Rand <b>gelb</b>, bei mehr als 14 Tagen oder nach Mahnung <b>rot</b>.
Das <b>„+“</b> legt Termin, Behandlung oder Rezept an.</p>
<p>Die <b>Akte</b> folgt § 630f BGB: Anlass, Diagnose, Maßnahmen, Verlauf, Reaktionen, Übungen – verschlüsselt gespeichert, nie geändert oder gelöscht,
sondern durch Folgeeinträge ergänzt; jedes Öffnen steht im Protokoll. Ein <b>Rezept</b> ist eine Stempelkarte: jede erfasste Behandlung mit Rezept setzt einen Haken.
Adressen gibt es mehrere; genau eine ist die <b>Rechnungsadresse</b>. Patienten werden nicht gelöscht, sondern <b>archiviert</b> – die Akte bleibt zehn Jahre.</p>
<p class="hint">Kontaktdaten erscheinen später zusätzlich als Kontakte im Postfach (für das Handy); Termine wandern in den Kalender – beides kommt mit dem nächsten Schritt.</p>
</div>

<h2>Preislisten</h2>
<div class="karte">
<p>Eine Preisliste legt fest, was eine Leistung bei dir kostet. Grundlage ist die <b>amtliche GKV-Vergütungsliste</b>:
dein Preis ist GKV-Preis × <b>Faktor</b> – so rechnet auch die GebüTh. Faktor und Preis rechnen sich gegenseitig um.
Daneben steht der <b>Beihilfe-Höchstbetrag</b>: liegt dein Preis darüber, zahlt ein beihilfeberechtigter Patient die Differenz selbst.</p>
<p>Die <b>GebüTh</b> ist ein Buch zum Kaufen, es gibt sie nicht zum Herunterladen. Ihre Empfehlungen trägst du einmal in eine
Preisliste ein und speicherst sie als <b>Muster</b> – jede neue Preisliste kann es dann übernehmen, mit allen Haken und Faktoren.
<b>Aufrunden</b> rundet eigene Preise auf volle Euro auf. Weicht eine Preisliste beim Speichern von ihrem Muster ab, fragt das System, ob es ein neues Muster geben soll.</p>
<p>Jede Nacht prüft das System, ob es eine neue GKV-Liste, neue Beihilfe-Höchstbeträge oder eine neue GebüTh-Auflage gibt.
Dann steht am Menü „Preislisten“ ein <b>roter Punkt</b>. Eine Preisliste ist erst ein Entwurf, nach „Freigeben“ ist sie fest;
genau eine ist <b>aktiv</b>. Alte kommen ins <b>Archiv</b> und lassen sich zurückholen. Am Handy lassen sich Preislisten nur ansehen.</p>
</div>

<h2>So arbeitet der Rechnungseingang</h2>
<div class="karte"><ol class="schritte">
<li><b>Einsammeln:</b> Mails mit PDF-Anhang im Ordner „Rechnungen“ (sonst im Posteingang).</li>
<li><b>Erkennen:</b> nach festen Regeln, ohne KI. Eine Rechnung ist nur, was von einem <b>bekannten Lieferanten</b>
kommt und nach Rechnung aussieht (Rechnungsnummer, Betrag, Steuer, IBAN).</li>
<li><b>Ablegen:</b> nach <i>01 Finanzen / &lt;Jahr&gt; / Eingangsrechnungen</i>, Name
<i>Datum_Lieferant_Kennung.pdf</i>. Dieselbe Rechnung kommt nie zweimal hinein. Rechnungsnummer, Betrag und
Rechnungsdatum merkt sich das System – darüber findet es die Rechnung später in Lexware wieder.</li>
<li><b>Markieren:</b> die Mail bekommt „Rechnung: eingegangen“ und wandert nach „Rechnungen/Verarbeitet“ –
gelöscht wird nie etwas.</li>
<li><b>Du entscheidest:</b> Unklares und Patientenpost bleiben bei dir. Später gibst du Rechnungen frei, dann
gehen sie nach Lexware.</li>
<li><b>Bezahlt → Archiv:</b> Ist die Rechnung bezahlt, bekommt die Mail „Rechnung: bezahlt“ und wandert ins
Outlook-Archiv.
<br><b>Heute (bis zum Lexware-Tarif XL):</b> Setze bei einer bezahlten Rechnung die Kategorie „Rechnung: bezahlt“
selbst – in Outlook am Rechner oder auf dem iPhone. Das Verschieben ins Archiv übernimmt das System.
<br><b>Später (mit XL):</b> Das System liest den Zahlungsstand selbst aus Lexware. Stößt du dort die Zahlung an,
zeigt Outlook „Zahlung angestoßen“; hat die Bank gebucht, „bezahlt“ – du musst nichts doppelt eintragen.</li>
</ol>
<p class="hint">Patientenpost (Rezept, Verordnung, Befund, Arztbrief) wird nie im Büro-Ordner abgelegt
und nicht gespeichert – sie bekommt nur die Kategorie „Prüfen – Patient“.</p></div>

<h2>Outlook-Kategorien</h2>
<p class="hint">Die Reihenfolge ist der Weg einer Rechnung: eingegangen → freigegeben → in Lexware → Zahlung
angestoßen → bezahlt (dann im Archiv). An einer Mail steht immer nur die aktuelle Stufe; deine eigenen Kategorien
bleiben. Die beiden „Prüfen“ heißen: hier entscheidest du.</p>
<div class="tabelle"><table><thead><tr><th>Kategorie</th><th>Wann</th><th>Was du tust</th><th>Ab wann</th></tr></thead>
<tbody>${kategorien}</tbody></table></div>

<h2>Was es heute gibt – und was kommt</h2>
<div class="tabelle"><table><thead><tr><th>Funktion</th><th>Was sie tut</th><th>Stand</th><th>Grundlage</th></tr></thead>
<tbody>${funktionen}</tbody></table></div>
<p class="hint">Wie alles zusammenspielt, zeigen die beiden Übersichten „Büro &amp; Rechnungen“ und „Patientenweg“ (PDF).</p>

<h2>Wo was liegt</h2>
<div class="tabelle"><table><tbody>
<tr><th>Postfach, Kalender</th><td>Microsoft 365, Konto praxis@lilli-nebel.de</td></tr>
<tr><th>Büro-Ablage</th><td>OneDrive-Ordner „Praxis Lilli Nebel“ (01 Finanzen … 07 Technik) – nur Kaufmännisches, keine Gesundheitsdaten</td></tr>
<tr><th>Testordner</th><td>07 Technik / „_TEST PhysioPraxisManager – Probeläufe“ – darf gelöscht werden</td></tr>
<tr><th>Praxis-Kartei</th><td>Datenbank auf dem Praxis-Server bei Strato in Deutschland, verschlüsselt</td></tr>
<tr><th>Zugang</th><td>nur über Tailscale, nur für freigegebene Konten</td></tr>
<tr><th>Programm</th><td>PhysioPraxisManager ${esc(o.fassung)}, betreut von Christian</td></tr>
</tbody></table></div>

<h2>Alle Erklärungen</h2>
<div id="hilfeListe">${liste}</div>`,
  });
}
