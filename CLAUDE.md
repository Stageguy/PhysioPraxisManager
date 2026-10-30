# PhysioPraxisManager – Arbeitsregeln für Claude Code

Digitalisierung der Privatpraxis für Physiotherapie Lilli Nebel (Bad Wörishofen). Ein Postfach
(praxis@lilli-nebel.de, Microsoft 365), eine PostgreSQL-Datenbank, ein Node-Dienst hinter Tailscale.
Lilli bedient alles am iPhone und am Rechner; Christian betreibt es. Alles auf Deutsch – Code,
Kommentare, Oberfläche, Commits.

## Wo was steht

| Datei | Inhalt |
|---|---|
| `konzept/requirements.md` | **Die Wahrheit über den Stand.** Jeder Wunsch ist eine W-Nummer, jede Erkenntnis eine N-Nummer, jede Aufgabe eine A-Nummer, jede offene Frage eine E-Nummer. Vor jeder Arbeit lesen, nach jeder Arbeit fortschreiben. |
| `konzept/claude-code-prompts-praxis-lilli-nebel.md` | Die ursprüngliche Prompt-Sammlung (0–15) mit Leitplanken. Gilt, soweit requirements.md nichts Neueres sagt. Neue Wünsche damit abgleichen. |
| `konzept/fragen-an-lilli.md` | Was nur Lilli entscheiden kann. |
| `konzept/mandantenfaehigkeit.md` | Prüfung Mehrbenutzer und Mandanten (W89). |
| `konzept/lexware-validierung.md` | Validierungen zu Lexware (W121): zwei Lösungen im Vergleich, Empfehlung „Lexware-Spiegel“ in Stufen. |
| `konzept/hilfe-vorschau.html` | Erzeugt aus `src/web/hilfe.ts` – nie von Hand ändern. |
| `README.md` | Einrichtung, Befehle, Bereitstellung. |

## Arbeitsweise

1. **Schritt für Schritt.** Ein Wunsch, eine W-Nummer, eine Umsetzung, ein Commit. Nach jedem Schritt:
   `npm run typecheck`, `npm test`, committen, pushen, in die **Testumgebung** ausspielen
   (`deploy/strato-dev.sh test`). Die Produktion (`prod`) erst nach Lillis Abnahme.
2. **Hilfe immer mitziehen.** Jedes bedienbare Element trägt `data-hilfe="<schlüssel>"`; zu jedem Schlüssel
   steht in `src/web/hilfe/<seite>.ts` (zusammengeführt in `src/web/hilfe.ts`) eine Erklärung mit den fünf Fragen
   (Löst aus · Bezug · Ändert · Ergebnis · Rückweg). `test/hilfe.test.ts` prüft beides; danach
   `npm run hilfe:vorschau -- konzept/hilfe-vorschau.html`.
3. **Prüfbrowser statt eigenem Browser.** Oberfläche nur mit WebKit im Container am Server ansehen
   (`pruefung/browser/ansehen.sh`), kein Chrome auf dem Mac.
4. **Tests gegen PGlite** (`test/testdb.ts`), Graph über Attrappen (`test/attrappe.ts`,
   `test/postfach-attrappe.ts`). Kein Test spricht mit Microsoft, Meta oder Lexware.
5. **Fassungen:** `package.json` ist die Fassungsnummer; eine Minor-Fassung je abgeschlossenem Block.

## Grundprinzip (requirements §4d)

Der Manager hält **alle** Daten und ist die Übersichtsplattform; Lexware ist nur für Kaufmännisches
(Rechnung erzeugen, verbuchen), Exchange nur für Kommunikation (Termine, Mails, ggf. Kontakte). Nach
Lexware gehen nur die Felder, die die Rechnung braucht; aus Lexware wird gelesen und im Manager
angereichert. Ein Abgleich berührt nur Felder, die es in Lexware gibt – Daten, die nur der Manager
kennt, werden nie gelöscht oder überschrieben. Jobs (z. B. Rechnung zusammenstellen) startet der Manager.
**Hauptprämisse (31.10.2026):** Für Lilli mit jeder Funktion so einfach und so schnell wie möglich ans Ergebnis –
weniger Klicks, weniger Begriffe, weniger Entscheidungen, die das System selbst treffen kann. Die Mobilversion darf
weniger Detailfunktionen haben als der Desktop. Lexware führt die Buchhaltung (Rechnungen, Nummern, Zahlungsstand),
der PPM führt Patienten, Organisation und Ablauf (auch Rechnungen als Vorgang) und ist die Drehscheibe. Lilli arbeitet
primär im PPM; was in Lexware zu tun ist (Verbuchung), geschieht dort; gesendet wird in Outlook, der PPM erstellt den
Entwurf – Ungefährliches (Termine) trägt der PPM direkt ein.

## Harte Regeln (Leitplanken, requirements §3 und N28)

- **Nichts geht ohne Lillis Freigabe an Patienten.** Mails nur als Entwurf im Postfach (Leitplanke 3); WhatsApp nur
  per Click-to-Chat vom Handy oder – mit Einwilligung – über die Cloud API, nie automatisch.
  **Grundregel (E30, klargestellt 31.10.2026):** der PPM erstellt (Entwurf), Outlook sendet, Lexware verbucht.
  Ungefährliches darf der PPM direkt senden oder eintragen (z. B. Termine in den Kalender). Rechnungs-Mail: E37 offen
  (heute direkt, Klick 2). Keine Vorgabe zur Zahl der Klicks – so wenig wie möglich (§4d).
- **Keine Gesundheitsdaten außerhalb der Kartei:** nicht im Kalendertitel (nur Initialen + Patientennummer),
  nicht in Mails oder WhatsApp, nicht in Protokollen (Leitplanke 9). Gesundheitsbezogenes in der Datenbank
  nur verschlüsselt (`src/tresor.ts`, Kontext = Spaltenname).
- **Testumgebung und Produktion** hängen am selben Postfach. Die Schranken stehen in `src/umgebung.ts`
  (Testadressen, Kalender „Praxis-Test“, Kontaktordner „Patienten-Test“, Kategorie TEST, TEST_TELEFONE).
  Nie Echtdaten in die Testumgebung, nie Testadressen in der Produktion.
- **Akte ist unveränderlich** (§ 630f BGB): Behandlungen werden ersetzt, nie geändert oder gelöscht
  (Trigger in Migration 007). Patienten werden archiviert, nicht gelöscht – einzige Ausnahme (W119): eine
  Dublette ohne jede Verknüpfung darf gelöscht werden; alles andere wird zusammengeführt (`dublette_von`).
- **Rechnungen:** eine Leistungsgruppe je Rechnung (Heilbehandlung § 4 Nr. 14 UStG getrennt von
  Wellness); Nummer, PDF und Zahlungsstand kommen aus Lexware (E28). Das PDF liegt verschlüsselt im Tresor
  (`rechnung.lexware_pdf`, W103); Rechnungen aus Lexware tragen `quelle = 'lexware'` und haben keine Positionen.
- **Zeit:** gespeichert in UTC, gerechnet in Europe/Berlin über `src/zeit.ts` (nie „Mitternacht + Minuten“).
  DATE-Spalten kommen als Text (`pg.types.setTypeParser(1082)`).

## Code-Konventionen

- TypeScript auf Node 24 ohne Build (`node src/cli/serve.ts`), `node:http`, serverseitiges HTML,
  CSP `script-src 'self'` – kein Inline-Skript, Skripte in `/praxis.js`, `/hilfe.js`, `/rueckmeldung.js`.
- **Zentrale Helfer benutzen statt kopieren:** `src/format.ts` (Datum, Uhrzeit, Euro, Preis),
  `src/db/werte.ts` (Werte aus Zeilen), `src/web/bausteine.ts` (Rahmen, Meldungen, Formulare, Chips),
  `src/zeit.ts` (ZONE, heuteBerlin, tagPlus, wocheUm), `src/praxis.ts` (Praxisname, Konto),
  `src/telefon.ts` (E.164).
- **Zwei Prozesse:** der Praxisdienst (`src/cli/serve.ts`, Tailnet) und der öffentliche Buchungsdienst (`src/cli/buchung-serve.ts`, `src/buchung/`) – Letzterer darf nie Datenbank, Tresor, Postfach oder Kartei importieren; er kennt nur Angebot und Buchungswünsche.
- Schichten: `src/kartei/*` (Fachlogik gegen `Db`; die Patientenkartei in `src/kartei/patienten/*`, zusammengeführt
  in `patienten.ts`), `src/kartei/aktionen/*` (Aktionen aus Formularen als Tabelle je Fachgebiet, Kontext in
  `kontext.ts`; `src/kartei/dienst.ts` liefert Seitendaten und baut den Kontext), `src/kartei/formular.ts`
  (Eingaben prüfen), `src/server.ts` (Routen, Zugang, Kopfzeilen), `src/web/*` (HTML). Keine SQL in `src/web`.
- Fehler für die Oberfläche sind `KarteiFehler`/`PreislisteFehler`/`AktionAbgelehnt` – sie landen als
  Meldung auf der Seite, alles andere ist ein 500 und gehört ins Protokoll.
- **Kachel-Regeln (W114/W115, requirements §4h):** Wo ein Raster Neues zulässt, ist die erste Kachel `plusKachel()`;
  bearbeitbare Kacheln tragen `stift()`; mehrere Aktionen stecken in `plusMenue()` oben rechts. Anlegen und
  Bearbeiten teilen sich **ein** Formular (`formular()` als eigene Seite, öffnet im Seitenfenster); Popups nur für
  Auswahlen. Bausteine in `src/web/bausteine.ts`, nichts davon nachbauen.
- Migrationen in `src/db/migrations/NNN_name.sql`, nur vorwärts, mit `IF NOT EXISTS`-freien, eindeutigen
  Namen (Index ≠ Tabellenname).
- Protokoll (`audit_event`) ohne Patientendaten: Kennungen und Zahlen, keine Namen, keine Texte.

## Umgebungen

| | Produktion | Test |
|---|---|---|
| Namespace | `praxis` | `praxis-test` |
| Port / Tailscale | 3300 / :10000 | 3301 / :10001 |
| Adresse | http://strato-dev.tail6ca16b.ts.net:10000/ | http://strato-dev.tail6ca16b.ts.net:10001/ |
| Daten | echte Patienten, Tresor mit Notfallkopie | erfundene Testdaten (`npm run testdaten`, Testerrolle W84) |

Freigaben für Claude Code liegen in `.claude/settings.local.json` (nicht im Repository).
