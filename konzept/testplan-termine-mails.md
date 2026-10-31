# Testplan: Termine und Mails – Prozesse und Übergaben Rechner ↔ Handy

Testerrolle, angelegt am 31.10.2026 (Christian: „Geh in die Rolle eines Testers …“). Gegenstand sind alle Wege, auf
denen ein Termin oder eine Mail die Praxis verlässt oder erreicht: Schnelltermin und Links, die Buchungsseite und ihre
Einbettung in die Website, die Wahl eines Termins durch den Patienten, Terminanfragen und Bestätigung, der Kalender des
Postfachs (Outlook, iPhone-Kalender), Entwürfe (Bestätigung, Erinnerung, Rechnung), WhatsApp – und die Übergaben
zwischen Rechner (Lilli am Desktop, Seitenfenster) und Handy (Lilli am iPhone, Patient am Handy).

Drei Prüfebenen, jede mit eigenem Werkzeug:

| Ebene | Werkzeug | Läuft |
|---|---|---|
| **Automatisch** | `test/prozess-termine-mails.test.ts` (ganze Kette gegen PGlite, Graph-Attrappe, echter Buchungsdienst im Prozess) plus die Fachtests (`schnelltermin`, `buchung`, `anfragen`, `kalender-abgleich`, `hausbesuche`, `nachrichten`, `rechnung-zwei-klicks`) | `npm test`, bei jedem Schritt |
| **Sicht** | Prüfbrowser (WebKit am Server, 393 px Handy mit Touch und 1440 px Rechner): `pruefung/browser/auftrag-prozess-termine.json`, `auftrag-mail-links.json`, `auftrag-link-pruefung.json`, `auftrag-direkt-buchen.json`, `auftrag-hausbesuch.json` | nach jedem Deploy in die Testumgebung |
| **Live** | Testumgebung mit echtem Postfach: Mails an `shopping+<name>@2late.de` (gleiche Anmeldung wie hartmann@mondre.net) über Graph auslesen, Links daraus öffnen; Kalendereinträge im Postfach „Praxis-Test“ über ein Prüfskript im Pod lesen (nur Kennzahlen) | vor jeder Abnahme, von Hand |

Regeln, die jeder Fall mitprüft: nichts geht ohne Lillis Freigabe an Patienten (Entwürfe, Click-to-Chat – Leitplanke 3);
keine Namen oder Gesundheitsangaben im Kalendertitel, in Links oder im öffentlichen Angebot (Leitplanke 9); die
Testumgebung schreibt nur an Testadressen und in den Kalender „Praxis-Test“ (Schranken 2, 3, 6).

## 1. Testfälle

Spalte „Auto“ nennt den automatischen Test, „Sicht“ die Ansicht im Prüfbrowser-Auftrag, „Live“ den Handgriff.

### A. Schnelltermin und Links (W117–W117d, W129)

| Nr. | Fall | Erwartung | Auto | Sicht | Live |
|---|---|---|---|---|---|
| A1 | Rechner: Cockpit › Schnelltermin, Kreis tippen | Kreise = Dauern der aktiven Terminarten; drei Zeiten an drei Tagen; Vorlage mit drei Links | `schnelltermin` „Dauern aus den aktiven Terminarten“, P1 | 1-cockpit-schnell (1440) | – |
| A2 | Patient wählen („Für Patient“, Kachel › „+ › Schnelltermin“) | Anrede in der Vorlage, Links mit 12-stelliger Kennung (nur Buchstaben/Ziffern), nie Name oder Mail im Link | `schnelltermin` W117b/W117d, P1 | 1-cockpit-schnell | – |
| A3 | Mail-Knopf | `mailto:` mit Adresse, Betreff „Terminvorschläge (n Minuten) – Praxis“, Text mit CRLF; Knopf aus ohne Mailadresse | P1 (`mailAusCockpit`), `schnelltermin` W117c | 1-cockpit-schnell | Mail an shopping+…@2late.de senden, am iPhone öffnen |
| A4 | WhatsApp-Knopf | `wa.me/<E.164>?text=<Vorlage>`, Vermerk im Verlauf; aus ohne Nummer | P2 | 1-cockpit-schnell | am iPhone antippen → WhatsApp mit Text |
| A5 | Text kopieren | Zwischenablage, Knopf „Kopiert ✓“ | `schnelltermin` Cockpit-Test | – | am iPhone: in Mail einfügen |
| A6 | Hausbesuch-Patient | Hinweis „… Fahrt eingerechnet“, Zeiten frühestens Öffnung + Fahrt, „Direkt buchen“ mit `&ort=adresse:` | P2, `schnelltermin` W129 | 1-cockpit-schnell (T-1051) | – |
| A7 | Alter oder fremder Link (`?schnell=40` nach Änderung der Terminarten) | landet bei der nächsten angebotenen Dauer | `schnelltermin` W117d | – | – |

### B. Buchungsseite, Einbettung, Wahl durch den Patienten (W96, W117b, W117d)

| Nr. | Fall | Erwartung | Auto | Sicht | Live |
|---|---|---|---|---|---|
| B1 | Link mit Dauer, Zeit, Kennung am Handy | Behandlung (erste dieser Dauer), Tag, Uhrzeit, Name, Telefon, Mail vorbelegt; nur die Einwilligung fehlt | P1 (`patientinBucht`), `schnelltermin` Buchungsseite | auftrag-link-pruefung: link-45 | Link aus der Mail am iPhone öffnen |
| B2 | Link ohne Kennung (Vorlage ohne Patient) | Behandlung, Tag, Uhrzeit vorbelegt; Felder leer | – | auftrag-mail-links: mail-60-ohne | Mail „Termin“ vom 30.10. |
| B3 | Link, dessen Dauer keine Behandlung hat (alter 40-Min.-Link) | Hinweis „Bitte wählen Sie Ihre Behandlung – Tag und Uhrzeit aus Ihrem Link sind dann vorgewählt“; nach der Wahl Tag und Zeit gesetzt | `schnelltermin` Buchungsseite (`zeitVorwaehlen`) | auftrag-mail-links: mail-40-kennung, auftrag-link-pruefung: link-fremde-dauer | Mail „Terminvorschläge (40 Minuten)“ vom 31.10. |
| B4 | Zeit inzwischen vergeben | „Die vorgeschlagene Zeit ist leider schon vergeben“, Tag bleibt gewählt | `schnelltermin` Buchungsseite | – | Link 05.11. 13:45 (Termin 555 belegt) |
| B5 | Wunsch absenden | 200, Kennung geht mit; Honigtopf, Mindestzeit, 5 je Stunde, Doppelbuchung abgewiesen | P1, `buchung` Buchungsdienst | – | 31.10.: Buchung 0aUGBokM4KaM |
| B6 | Einladung abgelaufen/falsch | `/api/einladung/<x>` 404, Seite ohne Vorbelegung, Buchung ohne Zuordnung | P1, `buchung` | – | – |
| B7 | Einbettung in lilli-nebel.de | `einbetten.js` legt den iframe an, `?terminart=P1` wählt die Behandlung vor, Höhe folgt der Seite; Baustein unter Konfiguration › Terminarten | P3 | – | Baustein auf einer Testseite der Website einsetzen (A27 Funnel) |
| B8 | Öffentliches Angebot | nur aktive Terminarten, freie Fenster „von–bis“, keine Namen, keine Kalenderinhalte | P3, `buchung` Abgleich | – | `GET :10003/api/angebot` |

### C. Anfrage → Bestätigung (A15, W96, W131)

| Nr. | Fall | Erwartung | Auto | Sicht | Live |
|---|---|---|---|---|---|
| C1 | Takt holt die Buchung | Anfrage „Buchungsseite“, Patient über die Kennung (sonst Mail/Telefon), Wunschzeit im Praxiskalender reserviert, Angebot ohne die Zeit | P1, `buchung` Abgleich | 4-anfragen, 5-anfrage-1 | `node src/cli/anfragen.ts --buchung` im Pod |
| C2 | Handy: Anfrage bestätigen | Termin in der Kartei, Reservierung weg, Ereignis im Kalender, Bestätigung als Entwurf an die Mailadresse (nie gesendet), Patientenseite mit Kalender-Marke | P1, `anfragen` | 5-anfrage-1 (393), 6-patient-116 | 31.10.: Anfrage #1 → Termin 556 |
| C3 | Hausbesuch-Patient bestätigen | Termin als Hausbesuch mit Fahrt; drei Kalendereinträge; Meldung „Als Hausbesuch mit Fahrt davor und danach“ | P2 | – | nach W131 wiederholen |
| C4 | „Drei Zeiten vorschlagen“ für Hausbesuch-Patient | Vorschläge lassen die Fahrt frei, Hinweis über dem Knopf | P2 (Hinweis), `anfragen` | 5-anfrage-1 | – |
| C5 | Vorschlagen aus Mail-Anfrage | drei reservierte Zeiten, Antwort-Entwurf im Faden, Web-Link „Antwort-Entwurf in Outlook öffnen“ | `anfragen` Vorschlagen | – | – |
| C6 | Verwerfen, wieder öffnen, 48-h-Aufräumen | Reservierungen weg bzw. wieder da | `anfragen` | – | – |

### D. Kalender des Postfachs – Outlook und iPhone (W77, W112, W130, W130b)

| Nr. | Fall | Erwartung | Auto | Sicht | Live |
|---|---|---|---|---|---|
| D1 | Praxistermin | Betreff Initialen + Nummer, Kategorie Praxis-Termin (Farbe nach Sektion), Ort „Praxis“, keine Erinnerung, Text mit PPM-Link | `kalender-abgleich`, P1 | 7-kalender-0211 | Prüfskript im Pod (`ereignisse-pruefen.mjs`) |
| D2 | Hausbesuch | Ort = Adresse, Erinnerung = Beginn der Anfahrt, Links PPM → Google Maps → Apple Karten; „Fahrt zum Hausbesuch“ und „Rückfahrt zur Praxis“ (Praxis-Fahrt, grau) | `kalender-abgleich` W130, P2 | 7-kalender-0211 | 31.10.: Termine 553–556 im Postfach geprüft |
| D3 | Nachbar ändert die Fahrt (zweiter Hausbesuch, Absage) | Rückfahrt entfällt bzw. kommt zurück; Absage löscht alle drei | `kalender-abgleich` W130, P2 | – | – |
| D4 | Takt / `termine:abgleich` | fehlende Spiegel und fehlende Fahrten werden nachgetragen; Outlook → Kartei übernimmt Praxis-Termine mit Nummer, nie Fahrten | `kalender-abgleich`, `outlook-termine` | – | Dienst-Log „Kalender: … nachgetragen“ |
| D5 | Kategorien im Postfach | Praxis-Termin, Selbstzahler, Wellness, Praxis-Fahrt, TEST vorhanden | – | – | `npm run kategorien` (31.10. angelegt) |

### E. Mails und WhatsApp an Patienten (W90, W91, W122, W123)

| Nr. | Fall | Erwartung | Auto | Sicht | Live |
|---|---|---|---|---|---|
| E1 | Nachricht aus der Patientenseite (Vorlage, Termin, Rechnung, Anhänge) | Entwurf im Postfach mit Kategorie PPM (+ TEST), Verlauf „in Outlook öffnen“ | `nachrichten` Mail-Entwurf | 6-patient-116 | in Outlook öffnen, senden, am iPhone lesen |
| E2 | WhatsApp vom Handy | Click-to-Chat mit fertigem Text, Vermerk; Cloud-Versand nur mit Einwilligung und ohne Gesundheitsbegriffe | `nachrichten` | 6-patient-116 (393) | – |
| E3 | Rechnung versenden (Klick 2) | Entwurf mit PDF und GiroCode, Popup mit Outlook-Link, „versendet“ erst nach Outlook; verworfen → wieder frei | `rechnung-zwei-klicks` | 8-rechnung-172 | Entwurf in Outlook senden → Rechnung „versendet“ mit Datum |
| E4 | Cockpit zählt Entwürfe | „n PPM-Mails in Entwürfe“ mit Link nach Outlook | `cockpit` | 9-cockpit | nach C2 steht dort 1 |
| E5 | Absage → Nachricht vorgewählt | Patientenseite öffnet mit „Absage mit Ersatztermin“ und dem Termin | P2 | – | – |

### F. Übergaben Rechner ↔ Handy (W114, W118, W128)

| Nr. | Fall | Erwartung | Auto | Sicht | Live |
|---|---|---|---|---|---|
| F1 | Erfassungsseite aus Kachel, Stift, „Direkt buchen“ | Rechner: Seitenfenster mit Titel „Neuer Termin – Name“; Handy: dieselbe Adresse als Seite; Überschrift nennt den Patienten | P4, `terminplan`, `schnelltermin` | 1-cockpit-schnell (beide Breiten), auftrag-direkt-buchen | – |
| F2 | Vorbelegung | Datum, Uhrzeit, Dauer, Behandlungsort kommen in beiden Welten an | P4, `schnelltermin` W129 | auftrag-direkt-buchen | – |
| F3 | Erster Tipp am iPhone | wirkt sofort; Rückmelde-Fähnchen nur mit Maus (N38) | P4 | auftrag-mobil (hover: none) | am iPhone tippen |
| F4 | Kalender-Symbol im Cockpit | Monatsansicht; Hover-Popup nur mit Maus, Mittagspause blau | `terminplan` | 9-cockpit | – |
| F5 | Links in Mail/WhatsApp vom Handy des Patienten | Buchungsseite erreichbar (öffentlich), kein Tailnet nötig; PPM-Links in Kalendereinträgen nur im Tailnet | B1–B3 | – | iPhone ohne Tailscale: Buchungslink ja, PPM-Link nein (erwartet) |

## 2. Live-Prüfung am 31.10.2026 (Testumgebung, Postfach shopping@2late.de)

Gelesen über die Graph-Anbindung (Konto hartmann@mondre.net, Alias shopping@2late.de):

- **„Terminvorschläge (40 Minuten) – Praxis Lilli Nebel“** (31.10., 10:33, von hartmann@mondre.net über den Mail-Knopf, Text): drei Links `?dauer=40&zeit=…&e=l_hTW5J2IAkm`. Kennung gültig (`/api/einladung` 200 mit Name, Telefon, Mail). Am Handy: Hinweis „Bitte wählen Sie Ihre Behandlung …“, weil keine Behandlung 40 Minuten hat (B3 – vor W117d erzeugt; neue Links tragen nur noch angebotene Dauern).
- **„Termin“** (30.10., 19:56, von praxis@lilli-nebel.de aus Outlook mobil, HTML): drei Links `?dauer=60&zeit=…` ohne Kennung. Am Handy: Neupatient 60 Min., Mo. 02.11. 16:15 vorgewählt, Felder leer (B2).
- **„Ihr Rezept“** (30.10., 19:51): Vorlage „Rezept fehlt“ aus der Patientenseite, gesendet aus Outlook (E1).
- **Keine** Mail „Ihr Termin am …“ (Terminbestätigung) und **keine** „Ihre Rechnung …“ im Postfach: die Entwürfe wurden bisher nie aus Outlook gesendet. Der letzte Schritt des Weges (Senden in Outlook, Ankunft beim Patienten, PDF und GiroCode am iPhone) ist damit live noch ungeprüft – Handgriff für Christian/Lilli (E1, E3).
- **Ganze Kette live durchgespielt:** Buchung über den Einladungslink `zedNudAGecwr` (Hanna, P8, 02.11. 16:15) → `anfragen --buchung` im Pod → Anfrage #1 (Patient über Kennung, reserviert) → Bestätigung → Termin 556, Ereignis im Kalender, Bestätigungs-Entwurf (Cockpit: 1 PPM-Mail in Entwürfe).

## 3. Befunde

| Nr. | Befund | Schwere | Stand |
|---|---|---|---|
| T1 | Hausbesuch-Patientin bucht über den Schnelltermin-Link (Fahrt eingerechnet), Lilli bestätigt – der Termin entsteht als **Praxistermin ohne Fahrt** (Termin 556). Ebenso rechnete „Drei Zeiten vorschlagen“ keine Fahrt. | hoch | **W131** behoben, P2 prüft es |
| T2 | Die Meldung „Die Bestätigung liegt als Entwurf im Postfach“ (und „Die Antwort liegt als Entwurf …“) hing am **Web-Link** des Entwurfs, nicht am Entwurf: liefert Graph keinen Link, fehlt die Meldung, obwohl der Entwurf da ist. | mittel | behoben (W131), P1/P2 prüfen es ohne Web-Link |
| T3 | Alte Links (vor W117d) mit Dauern ohne Behandlung landen im Hinweis statt in der Vorbelegung (40-Minuten-Mail vom 31.10.). | niedrig | erwartet; neue Links tragen nur angebotene Dauern |
| T4 | Bestätigungs- und Rechnungs-Mails wurden live noch nie aus Outlook gesendet – der Empfang beim Patienten (Text, PDF, GiroCode am iPhone) ist ungeprüft. | mittel | offen – Handgriff E1/E3 vor der Abnahme |
| T5 | Testtermine 553/554 (3./4.11.) aus der Zeit vor W129 liegen mit Fahrt in Pause bzw. Nachbartermin. | niedrig | Testdaten, verschieben oder stehen lassen |
| T6 | Bestätigungs- und Vorschlags-Entwürfe an einen **zugeordneten Patienten** nahmen den Namen aus der Anfrage statt der Stammdaten: „Guten Tag Hanna Prozess“ statt „Sehr geehrte Frau Prozess“ (Anrede und Titel fehlten). | niedrig | behoben (W131): Stammdaten des Patienten, P1 prüft die Anrede |
| T7 | Prüfbrowser-Lauf mit 7 Ansichten × 2 Breiten brach die SSH-Verbindung ab (Connection reset) – Aufträge besser kurz halten (≤ 5 Ansichten) oder getrennt laufen lassen. | niedrig | Auftrag in zwei Teile geteilt |

## 4. Durchführung

```bash
npm test                                                   # alle Prozess- und Fachtests
node --test test/prozess-termine-mails.test.ts             # nur die Kette
pruefung/browser/ansehen.sh pruefung/browser/auftrag-prozess-termine.json "" pruefung/browser/ergebnisse/prozess-termine
```

Live (Testumgebung): im Cockpit `?schnell=<Dauer>&patient=T-1051`, Mail-Knopf → Mail an shopping+hanna@2late.de senden;
am iPhone den Link öffnen und absenden; im Pod `node src/cli/anfragen.ts --buchung` (oder zehn Minuten warten); Anfrage
am iPhone bestätigen; Kalender „Praxis-Test“ am iPhone prüfen (Hausbesuch: Adresse, Erinnerung, Fahrt-Einträge, Links);
Entwurf in Outlook senden; Ankunft bei shopping+hanna@2late.de über Graph prüfen.
