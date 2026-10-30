# W121 – Validierungen zu Lexware: zwei Lösungen im Vergleich

Stand 30.10.2026. Anlass: Testrechnungen 167 (Nora) und 174 (Mia), Befund in requirements N41.
Entscheidung durch Christian; Umsetzung danach Schritt für Schritt.

## 1. Ausgangslage

Die Kartei führt den Inhalt einer Rechnung bis „fertig“. Lexware führt Nummer, PDF und Zahlungsstand
(E28). Der Weg heute (W100, E30): Entwurf → Klick 1 „Nach Lexware“ (Nummer und PDF kommen zurück) →
Klick 2 „Versenden“ (Mail mit PDF oder Druck) → der Abgleich setzt bezahlt oder storniert.

Was fehlt (N41): Die Kartei prüft nie, ob das, was sie über Lexware glaubt, noch stimmt. Sie kennt nur
die Richtung Lexware → Kartei, und auch die nur auf Klick. Nummern lassen sich von Hand eintragen, Klick 1
kann eine zweite Lexware-Rechnung anlegen, „zurück in den Entwurf“ geht trotz Lexware-Kennung, Konflikte
werden gezählt statt gemeldet, „versendet“ geht ohne Nummer.

## 2. Woran gemessen wird

| Kriterium | Warum |
|---|---|
| Klicks für Lilli im Normalfall (eine Rechnung von Rezept bis bezahlt) | Ziel: so wenig wie möglich |
| Klicks und Verständnis je Störfall | Begriffe wie „Lexware-Kennung“ oder „Nummernkonflikt“ sollte Lilli nie lesen müssen |
| Doppelrechnung in Lexware möglich? | Der teuerste Fehler: eine zweite rechtsgültige Rechnung |
| Falsche Nummer beim Patienten möglich? | Zweitteuerster Fehler |
| Leitplanken | E30 (Rechnung nur per Klick), Leitplanke 3 (nichts automatisch an Patienten), N28 (Test ohne echtes Lexware) |
| Abhängigkeit von der Lexware-API | Was muss die API können: Rechnung per Kennung lesen, Webhooks |
| Aufwand und Risiko der Umsetzung | Was wird angefasst, was kann dabei kaputtgehen |
| Testbarkeit mit der Attrappe | Jeder Weg muss ohne echtes Lexware prüfbar sein |

## 3. Vorschlag A – „Sieben Schranken“ (der bisherige W121)

Die Kartei bleibt eine eigene Zustandsmaschine (entwurf → freigegeben → in_lexware → gesendet → bezahlt)
und bekommt zusätzliche Prüfungen und Meldungen:

- (a) Rückwärtsprüfung im Abgleich je Lexware-Kennung → Abweichung „in Lexware nicht gefunden“
- (b) Abgleich alle 15 Minuten im Dienst, Zähler „n Abweichungen“ im Cockpit
- (c) keine Nummer von Hand bei Anbindung
- (d) Klick 1 und „Zurück“ gesperrt bei vorhandener Kennung; Knöpfe „Stand aus Lexware holen“ und „Verknüpfung lösen“
- (e) Nummernwechsel durch Lexware als Abweichung melden statt still überschreiben
- (f) Konflikte als Abweichung an beide Rechnungen
- (g) „versendet“ nur ab „in Lexware“

Charakter: **reaktiv**. Die Kartei entdeckt Abweichungen und legt Lilli Knöpfe hin. Jede Abweichung ist
eine Entscheidung für Lilli, mit eigenem Begriff und eigenem Knopf.

## 4. Vorschlag B – „Lexware-Spiegel“ (Alternative)

Grundidee: **Die Kartei hat zu Lexware keine eigene Meinung mehr.** Alles, was Lexware führt (Kennung,
Nummer, PDF, Lexware-Status, Zahlungen), ist in der Kartei nur ein Spiegel, den ein Abgleich laufend
nachzieht – in beide Richtungen, über die Lexware-Kennung, ohne dass Lilli etwas sieht. Lilli hat
weiterhin genau zwei Klicks (E30), und beide sind **beliebig wiederholbar, ohne Schaden**.

### 4.1 Die vier Regeln

1. **Eine Wahrheit je Feld.** Nummer, PDF, Lexware-Status, Zahlungen werden nur noch aus einer Antwort
   von Lexware geschrieben, die per Kennung geholt wurde – nie von Hand, nie aus einem Text, nie aus einem
   Formular. Die Kartei schreibt nur noch: Inhalt, „fertig“, „versendet durch PPM“ mit Weg und Datum, Storno-Wunsch.
   Der angezeigte Status wird **abgeleitet**: aus dem Lexware-Spiegel (offen / bezahlt / storniert / fehlt)
   plus den PPM-Feldern (fertig? versendet?). Es gibt keinen Zustand mehr, der von Lexware abweichen kann,
   weil er nicht gespeichert, sondern berechnet wird.
2. **Klick 1 ist idempotent.** „Nach Lexware“ heißt: *Sorge dafür, dass diese Rechnung in Lexware liegt.*
   Gibt es schon eine Kennung → Stand per Kennung holen, nichts anlegen. Kennt Lexware die Kennung nicht →
   bevor etwas Neues angelegt wird, in Lexware nach einer Rechnung mit gleichem Kontakt, Betrag und Datum
   suchen und sie übernehmen. Erst wenn es sie nirgends gibt, anlegen. Damit ist eine Doppelrechnung
   durch Wiederholen ausgeschlossen, und der Knopf „Verknüpfung lösen“ entfällt – man drückt einfach noch einmal.
3. **Der Abgleich heilt selbst, was eindeutig ist.** Alle 15 Minuten (und sofort per Webhook, A27):
   - je Kartei-Rechnung mit Kennung: Lexware fragen → Nummer, Status, Zahlung, PDF nachziehen.
     Nummernkonflikte lösen sich dabei von allein: die Nummer gehört der Rechnung, deren Kennung Lexware
     mit dieser Nummer nennt; die andere bekommt ihre eigene Nummer per eigener Kennung. Der Fall 167/174
     wäre so ohne Klick erledigt gewesen.
   - je Lexware-Rechnung ohne Kartei-Gegenstück: wie heute als Lexware-Rechnung anlegen (W103).
   - Nur was **nicht eindeutig** ist, landet in einer Liste „Zu klären“: Lexware kennt eine Kennung nicht,
     obwohl die Rechnung schon beim Patienten war; zwei Kartei-Rechnungen zeigen auf dieselbe
     Lexware-Rechnung; hier storniert, dort nicht; Betrag weicht ab.
4. **Ein Ort, eine Zeile, ein Knopf.** „Zu klären“ ist eine Zeile im Cockpit mit Zähler; jeder Eintrag
   hat genau einen vorgeschlagenen Weg als Knopf, in Lillis Sprache („Diese Rechnung noch einmal nach
   Lexware schicken“, „In Lexware stornieren – dann verschwindet der Eintrag“). Keine Abweichungs-Chips
   mehr an Rechnungen, keine Entscheidungen auf der Rechnungsseite. Die Liste ist im Normalfall leer.

### 4.2 Was aus der Oberfläche verschwindet

- „Rechnungsnummer aus Lexware eintragen“ bei Anbindung (bleibt nur für den Betrieb ohne XL)
- „Zurück in den Entwurf“ bei vorhandener Kennung (Lexware hat die Rechnung – es gibt kein Zurück)
- „Bezahlt“ und „In Lexware“ als Handstatus bei Anbindung
- Abweichungs-Chips und Meldungsblöcke an der Rechnung (ersetzt durch „Zu klären“)
- „Stand aus Lexware holen“, „Verknüpfung lösen“, „Nummer hier eintragen“ – alles Abgleich

### 4.3 Was Lilli noch tut

| Normalfall | Klicks |
|---|---|
| Rezept abgearbeitet, Rechnung ist voll | 0 (Positionen kommen aus den Behandlungen) |
| Klick 1 „Nach Lexware“ | 1 |
| Klick 2 „Versenden“ | 1 |
| Zahlung, Mahnung, Storno aus Lexware | 0 (Abgleich, Webhook) |

Optional B+ (verändert E30, Christians Entscheidung): **ein** Knopf „Rechnung stellen“ = Klick 1 und
Klick 2 hintereinander, Versand nur, wenn Lexware Nummer und PDF geliefert hat. Dann ein Klick je
Rechnung. Nie ohne Klick, nie im Hintergrund – aber nicht mehr zwei.

## 5. Die Störfälle durchgespielt

| Störfall | A – Sieben Schranken | B – Lexware-Spiegel |
|---|---|---|
| Nummernkonflikt (174 bekommt die Nummer von 167) | Abweichung an 174, Lilli liest „Lexware hat die Nummer … vergeben“, klickt „Nummer hier eintragen“; 167 bekommt einen Prüfhinweis, den Lilli auch noch wegklären muss: **2 Klicks, 2 Begriffe** | Abgleich fragt beide Kennungen, jede Rechnung bekommt die Nummer, die Lexware ihr nennt: **0 Klicks**. Nur wenn beide Kennungen dieselbe Lexware-Rechnung meinen → „Zu klären“ (1 Klick: „die zweite stornieren“) |
| Lexware kennt eine Rechnung nicht mehr, noch nicht versendet | Abweichung, „Verknüpfung lösen“, dann Klick 1 neu: **2 Klicks** | Klick 1 noch einmal (idempotent, sucht erst, legt dann an): **1 Klick**, kein neuer Begriff |
| Lexware kennt eine Rechnung nicht mehr, schon versendet (Nora heute) | Abweichung „in Lexware nicht gefunden“, Lilli muss selbst wissen, was zu tun ist | „Zu klären“ mit Vorschlag „noch einmal nach Lexware, danach Patienten informieren“: **1 Klick** + bewusste Entscheidung – zu Recht, das ist ein echter Fall |
| Entwurf mit Lexware-Kennung (174 nach „Zurück“) | „Zurück“ gesperrt; Zustand von heute braucht „Stand holen“: **1 Klick** | Zustand kann nicht entstehen (Status abgeleitet); Bestand heilt der nächste Abgleich: **0 Klicks** |
| Nummer von Hand falsch | Verhindert (c) | Verhindert (Regel 1) |
| Storno hier, nicht in Lexware | Abweichung an der Rechnung | „Zu klären“ mit Knopf „In Lexware öffnen“ – gleich, Lexware-API kann nicht stornieren |
| Zahlung in Lexware | Abgleich alle 15 Min (b) | Webhook sofort, Abgleich als Netz |
| Doppelrechnung in Lexware durch zweiten Klick 1 | Gesperrt (d) – aber nur, solange die Kennung gespeichert ist | Ausgeschlossen: Klick 1 sucht vor dem Anlegen in Lexware (Kontakt, Betrag, Datum) |

## 6. Vergleich nach Kriterien

| Kriterium | A | B |
|---|---|---|
| Klicks Normalfall | 2 | 2 (B+: 1) |
| Klicks je Störfall | 1–2, plus Lesen von Abweichungstexten | 0–1, nur echte Entscheidungen |
| Begriffe, die Lilli kennen muss | Abweichung, Lexware-Kennung, Nummernkonflikt, Stand holen, Verknüpfung lösen | „Zu klären“, „noch einmal nach Lexware“ |
| Doppelrechnung | möglich, wenn die Kennung fehlt oder gelöst wurde | ausgeschlossen durch Suche vor dem Anlegen |
| Falsche Nummer beim Patienten | ausgeschlossen (c, g) | ausgeschlossen (Regel 1) |
| E30 / Leitplanke 3 | eingehalten | eingehalten; B+ braucht Christians Ja (E35) |
| Lexware-API | `GET /v1/invoices/{id}` | dazu `voucherlist`-Suche nach Kontakt und Datum, Webhooks `invoice.*` und `payment.changed` (A27) |
| Umsetzung | sieben kleine Änderungen, 2–3 Blöcke | Abgleich-Modul in beide Richtungen, abgeleiteter Status (berührt Kachel, Rechnungsseite, Dashboard, Steuerliste), „Zu klären“-Liste, idempotenter Klick 1, Webhook: 4–5 Blöcke |
| Risiko der Umsetzung | gering | mittel: der abgeleitete Status ersetzt die Zustandsmaschine; braucht einen Schnappschuss-Vergleich wie bei A32 |
| Testbarkeit | Attrappe reicht | Attrappe braucht `rechnung(id)`, Suche und einen Webhook-Ersatz – alles machbar |
| Betrieb | ein Hintergrundjob | Hintergrundjob plus Webhook über den Funnel (A27 ohnehin geplant) |

## 7. Empfehlung

**B gewinnt bei Lilli, A gewinnt beim Aufwand – und B enthält A.** Die Schranken (c), (e), (f), (g) sind in
B Nebenwirkungen der Regel „eine Wahrheit je Feld“; (a) und (b) sind der Abgleich; (d) wird durch den
idempotenten Klick 1 überflüssig. Deshalb: **B, in Stufen, und jede Stufe nimmt die passenden Schranken aus A mit.**

| Stufe | Inhalt | Was Lilli davon merkt |
|---|---|---|
| B1 | Abgleich je Kennung in beide Richtungen, alle 15 Minuten im Dienst; Konflikte lösen sich über die Kennung; keine Nummer von Hand bei Anbindung; „versendet“ nur mit Nummer; Klick 1 idempotent mit Suche vor dem Anlegen; „Zurück“ bei Kennung weg | Abweichungen verschwinden fast alle von selbst; Klick 1 kann sie wiederholen |
| B2 | Abgeleiteter Status statt Zustandsmaschine; „Zu klären“ im Cockpit mit je einem Knopf; Abweichungs-Chips weg | Ein Ort für alles, was Lexware betrifft; meist leer |
| B3 | Webhook `invoice.*` und `payment.changed` über den Funnel (A27); Attrappe mit Ereignissen | Zahlungen und Stornos sofort statt in 15 Minuten |
| B+ | „Rechnung stellen“ als ein Klick (E35) | Ein Klick je Rechnung |

Für die Testdaten heißt das nach B1: 174 bekommt beim nächsten Abgleich ihren Stand per Kennung (die
neustartfeste Attrappe kennt sie nicht → Klick 1 noch einmal legt sie sauber an), 167 bleibt versendet und
wandert mit „Lexware kennt diese Rechnung nicht“ in „Zu klären“ – was in der Produktion der richtige Alarm
wäre und in der Testumgebung mit einem Klick erledigt ist.

## 8. Offene Entscheidungen

- **E35:** Darf Klick 1 und Klick 2 zu einem Knopf „Rechnung stellen“ werden (B+)? Ändert E30 von „zwei Klicks“ auf „ein Klick, nie ohne Klick“.
- **E36:** Soll der Abgleich eine Rechnung, die Lexware nicht kennt und die noch nie versendet war, **ohne Klick** neu anlegen? Vorschlag: nein – Anlegen in Lexware bleibt Klick 1 (E30).
