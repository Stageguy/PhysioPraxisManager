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
  'termine.namen': { seite: 'Cockpit', titel: 'Namen zeigen / Nur Initialen',
    loest_aus: 'Lädt die Seite neu, mit vollen Termintiteln bzw. wieder nur mit Initialen.', bezug: 'Nur die Termine auf dieser Seite.',
    aendert: 'Nichts – nur die Anzeige; beim nächsten Öffnen stehen wieder Initialen da.',
    ergebnis: 'Die Termintitel, wie sie im Kalender stehen.', rueckweg: '„Nur Initialen zeigen“ klicken.' },
  'uebersicht.rechnungen': { seite: 'Cockpit', titel: 'Neue Rechnungseingänge', loest_aus: AUSKUNFT,
    bezug: 'Lieferantenrechnungen, die der Rechnungseingang erkannt hat – keine Patientenpost.', aendert: NICHTS,
    ergebnis: 'Die Zahl je Stufe, ein Balken für das Verhältnis, der offene Betrag und die neuesten Rechnungen. „Nicht verbunden“ heißt: die Praxis-Datenbank läuft noch nicht.',
    rueckweg: KEIN_RUECKWEG },
  'uebersicht.anfragen': { seite: 'Cockpit', titel: 'Terminanfragen', loest_aus: AUSKUNFT,
    bezug: 'Anfragen von Patienten aus allen Wegen – jeder Weg hat sein Symbol.', aendert: NICHTS,
    ergebnis: 'Heute: welche Wege es geben wird und warum sie noch nicht angebunden sind. Es werden keine Zahlen erfunden.',
    rueckweg: KEIN_RUECKWEG },
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
    ergebnis: 'Bei einer neuen GKV-Liste führt „Neue Preisliste daraus“ direkt zum Anlegen. Eine neue GebüTh-Auflage heißt: Buch bestellen und die Faktoren in einer Vorlage nachtragen.',
    rueckweg: KEIN_RUECKWEG },
  'preislisten.gesehen': { seite: 'Preislisten', titel: 'Als gesehen markieren', loest_aus: 'Markiert alle neuen Grundlagen als gesehen.',
    bezug: 'Den roten Punkt am Menü.', aendert: 'Merkt sich, wer wann gesehen hat.', ergebnis: 'Der rote Punkt verschwindet, bis wieder etwas Neues kommt.',
    rueckweg: 'Nicht nötig – die Grundlagen bleiben gespeichert und wählbar.' },
  'preislisten.kachel': { seite: 'Preislisten', titel: 'Preislisten-Kachel', loest_aus: 'Ein Klick öffnet die Details der Preisliste.',
    bezug: 'Eine der drei neuesten Preislisten (archivierte nicht).', aendert: NICHTS,
    ergebnis: 'Name, Status, Grundlage (GKV-Fassung und Abrufdatum), Beihilfe-Stand, Vorlage, Erstellungs- und Freigabedatum.', rueckweg: KEIN_RUECKWEG },
  'preislisten.aktiv': { seite: 'Preislisten', titel: 'Auswahl „aktiv“',
    loest_aus: 'Macht diese Preisliste zur aktiven – genau eine kann es sein.', bezug: 'Nur freigegebene Preislisten; Entwürfe sind grau.',
    aendert: 'Die bisher aktive verliert den Haken; Eintrag im Protokoll.', ergebnis: 'Neue Rechnungen verwenden künftig diese Preise.',
    rueckweg: 'Eine andere Preisliste aktiv setzen.' },
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
      gebueth: 'Die Gebührenübersicht für Therapeuten (Buch, Buchner & Partner). Es gibt sie nicht zum Herunterladen; ihre Empfehlungen kommen über eine Vorlage.',
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
  'preisliste.feld.vorlage': { seite: 'Preisliste', titel: 'Vorlage übernehmen', loest_aus: 'Nichts – erst „Anlegen“.',
    bezug: 'Eine gespeicherte Auswahl: welche Positionen übernommen werden und mit welchem Faktor – etwa die GebüTh-Empfehlungen.',
    aendert: NICHTS, ergebnis: 'Haken und Faktoren sind vorbelegt; Positionen, die nicht in der Vorlage stehen, sind abgewählt.', rueckweg: '„keine“ wählen.' },
  'preisliste.feld.faktor': { seite: 'Preisliste', titel: 'Allgemeiner Faktor', loest_aus: 'Nichts – erst „Anlegen“ bzw. „auf alle anwenden“.',
    bezug: 'Der Faktor auf den GKV-Preis, z. B. 1,3 = 30 % über GKV.', aendert: NICHTS,
    ergebnis: 'Vorbelegung für jede Position ohne eigenen Faktor aus der Vorlage.', rueckweg: 'Feld leeren.' },
  'preisliste.anlegen': { seite: 'Preisliste', titel: 'Preisliste anlegen', loest_aus: 'Legt die Preisliste als Entwurf an.',
    bezug: 'Grundlage, Beihilfe, Vorlage und Faktor wie gewählt.', aendert: 'Eine neue Preisliste mit allen Positionen der Grundlage; Erstellungsdatum fest.',
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
    bezug: 'Grundlage mit Version und Datum, Beihilfe-Stand, Vorlage, Erstellungsdatum (fest), Status.', aendert: NICHTS,
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
    aendert: 'Die Preisliste; Protokoll.', ergebnis: '„Gespeichert.“ oder ein Hinweis, was nicht passt.', rueckweg: 'Werte ändern und noch einmal speichern.' },
  'preisliste.verwerfen': { seite: 'Preisliste', titel: 'Verwerfen', loest_aus: 'Lädt die Preisliste neu – ungespeicherte Änderungen gehen verloren.', bezug: 'Diese Seite.',
    aendert: NICHTS, ergebnis: 'Der zuletzt gespeicherte Stand.', rueckweg: KEIN_RUECKWEG },
  'preisliste.freigeben': { seite: 'Preisliste', titel: 'Freigeben', loest_aus: 'Macht die Preisliste final – danach nicht mehr änderbar.',
    bezug: 'Diesen Entwurf; jede übernommene Position braucht einen Preis.', aendert: 'Status „freigegeben“, Freigabedatum und wer; Protokoll.',
    ergebnis: 'Sie kann jetzt aktiv gesetzt werden.', rueckweg: 'Keiner – Änderungen über „Als neue Preisliste kopieren“.' },
  'preisliste.vorlage-name': { seite: 'Preisliste', titel: 'Name der Vorlage', loest_aus: 'Nichts – erst „Als Vorlage speichern“.', bezug: 'Die neue Vorlage.',
    aendert: NICHTS, ergebnis: 'Gleicher Name wie eine vorhandene Vorlage: sie wird überschrieben.', rueckweg: 'Anderen Namen wählen.' },
  'preisliste.vorlage': { seite: 'Preisliste', titel: 'Als Vorlage speichern', loest_aus: 'Speichert Haken und Faktoren dieser Preisliste als Vorlage – z. B. „GebüTh 15. Auflage“.',
    bezug: 'Den gespeicherten Stand dieser Preisliste (vorher speichern).', aendert: 'Eine Vorlage; Protokoll.', ergebnis: 'Beim nächsten „Neu“ als Vorlage wählbar.', rueckweg: 'Unter gleichem Namen neu speichern.' },
  'preisliste.loeschen': { seite: 'Preisliste', titel: 'Löschen', loest_aus: 'Löscht den Entwurf mit allen Positionen.',
    bezug: 'Nur Entwürfe, die in keiner Rechnung stehen.', aendert: 'Die Preisliste ist weg; das Protokoll behält den Namen.', ergebnis: 'Zurück zu den Preislisten.', rueckweg: 'Keiner – neu anlegen.' },
  'preisliste.metadaten': { seite: 'Preisliste', titel: 'Angaben', loest_aus: AUSKUNFT,
    bezug: 'Alles über diese Preisliste: Status, Grundlagen mit Original, Vorlage, Faktor, Daten und wer.', aendert: NICHTS,
    ergebnis: 'Woraus die Preise stammen und wer sie wann erstellt und freigegeben hat – auch Jahre später nachvollziehbar.', rueckweg: KEIN_RUECKWEG },
  'preisliste.verwendung': { seite: 'Preisliste', titel: 'Verwendet', loest_aus: AUSKUNFT,
    bezug: 'Bei welchen Patienten und in welchen Rechnungen diese Preisliste steht.', aendert: NICHTS,
    ergebnis: 'Sobald sie in einer Rechnung steht, heißt sie „genutzt“ und lässt sich nicht mehr löschen.', rueckweg: KEIN_RUECKWEG },
  'preisliste.aktionen': { seite: 'Preisliste', titel: 'Aktionen', loest_aus: 'Je nach Status: Bearbeiten, Freigeben, Aktiv setzen, Archivieren, Wiederherstellen, Kopieren, Löschen.',
    bezug: 'Diese Preisliste.', aendert: 'Siehe die einzelne Aktion.', ergebnis: 'Eine Meldung oben auf der Seite.', rueckweg: 'Siehe die einzelne Aktion.' },
  'preisliste.archivieren': { seite: 'Preisliste', titel: 'Archivieren', loest_aus: 'Legt die Preisliste ins Archiv.',
    bezug: 'Freigegebene, nicht aktive Preislisten.', aendert: 'Status „archiviert“; Protokoll.', ergebnis: 'Für Rechnungen nicht mehr wählbar; im Archiv sichtbar.', rueckweg: 'Im Archiv „Wiederherstellen“.' },
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
      '<div class="hilfe-fuss">Esc schließt · <a href="/hilfe#hilfe-' + esc(key.replace(/\./g, '-')) + '">in der Hilfe ansehen</a></div></div>';
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
  { name: 'Preislisten', was: 'Eigene Preise je Leistung auf Grundlage der GKV-Liste, mit Faktor, Beihilfe-Vergleich, Vorlagen (z. B. GebüTh), Freigabe, „aktiv“ und Archiv; nachts Prüfung auf neue Grundlagen mit rotem Punkt.', stand: 'jetzt', woher: 'W59' },
  { name: 'Statusseite', was: 'Zeigt, ob die Verbindung zu Postfach, Kalender und OneDrive steht.', stand: 'jetzt', woher: 'diese Seiten' },
  { name: 'Outlook-Kategorien', was: 'Fünf farbige Kategorien zeigen in Outlook, was mit einer Mail passiert ist.', stand: 'jetzt', woher: 'angelegt am 20.10.2026' },
  { name: 'Finanzordner je Jahr', was: 'Legt „01 Finanzen/<Jahr>“ nach der Vorlage des Vorjahres an, mit „Eingangsrechnungen“.', stand: 'jetzt', woher: '2026 angelegt am 20.10.2026' },
  { name: 'Rechnungseingang', was: 'Erkennt Lieferantenrechnungen im Postfach und legt sie in „Eingangsrechnungen“ ab. Läuft bisher nur als Probelauf – es wird nichts verändert.', stand: 'jetzt', woher: 'Prompt 4' },
  { name: 'Mail-Entwürfe', was: 'Legt eine Mail als Entwurf in „Entwürfe“ – senden tust du.', stand: 'jetzt', woher: 'Leitplanke 3' },
  { name: 'Freigabe', was: 'Rechnungen freigeben, ablehnen (mit Grund) oder zurückstellen – am Handy und am Rechner.', stand: 'jetzt', woher: 'Prompt 15' },
  { name: 'Lexware', was: 'Freigegebene Belege landen in Lexware unter „Belege – zu prüfen“; später auch Rechnungsentwürfe an Patienten.', stand: 'später', woher: 'Prompt 5, 11' },
  { name: 'Bezahlt ins Archiv (Übergang)', was: 'Du setzt „Rechnung: bezahlt“ in Outlook, das System verschiebt die Mail ins Archiv und merkt sich den Stand.', stand: 'jetzt', woher: 'bis zum Tarif XL' },
  { name: 'Übernahme des Bestands', was: 'Rechnungen aus Archiv, Unterordnern und Papierkorb rückwirkend ablegen; was du als bezahlt bestätigst, kommt gleich ins Archiv.', stand: 'jetzt', woher: 'Fragen an Lilli, Nr. 1' },
  { name: 'Zahlungsstand aus Lexware', was: 'Liest aus Lexware, ob eine Rechnung zur Zahlung angestoßen oder bezahlt ist, setzt die Kategorie und archiviert die Mail.', stand: 'später', woher: 'Tarif XL, Prompt 5' },
  { name: 'Terminanfragen', was: 'Erkennt Terminwünsche in Mails, schlägt drei freie Zeiten vor und legt die Antwort als Entwurf an.', stand: 'später', woher: 'Prompt 6, 7' },
  { name: 'Cockpit – weitere Teile', was: 'Offene Zahlungen aus Lexware, Freigabe direkt in der Übersicht, Diskret-Schalter für alle Seiten.', stand: 'später', woher: 'Prompt 8, 10' },
  { name: 'Patientenweg', was: 'Acht Phasen von der Anfrage bis zur Nachsorge – die Pinnwand zeigt, wer wo steht.', stand: 'später', woher: 'Prompt 12, PDF Patientenweg' },
  { name: 'Schnellaktionen', was: 'Ein Tipp auf die Patientenkarte legt eine fertige Mail als Entwurf an.', stand: 'später', woher: 'Prompt 13' },
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

<h2>Preislisten</h2>
<div class="karte">
<p>Eine Preisliste legt fest, was eine Leistung bei dir kostet. Grundlage ist die <b>amtliche GKV-Vergütungsliste</b>:
dein Preis ist GKV-Preis × <b>Faktor</b> – so rechnet auch die GebüTh. Faktor und Preis rechnen sich gegenseitig um.
Daneben steht der <b>Beihilfe-Höchstbetrag</b>: liegt dein Preis darüber, zahlt ein beihilfeberechtigter Patient die Differenz selbst.</p>
<p>Die <b>GebüTh</b> ist ein Buch zum Kaufen, es gibt sie nicht zum Herunterladen. Ihre Empfehlungen trägst du einmal in eine
Preisliste ein und speicherst sie als <b>Vorlage</b> – jede neue Preisliste kann sie dann übernehmen.</p>
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
