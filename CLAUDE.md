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
| `konzept/hilfe-vorschau.html` | Erzeugt aus `src/web/hilfe.ts` – nie von Hand ändern. |
| `README.md` | Einrichtung, Befehle, Bereitstellung. |

## Arbeitsweise

1. **Schritt für Schritt.** Ein Wunsch, eine W-Nummer, eine Umsetzung, ein Commit. Nach jedem Schritt:
   `npm run typecheck`, `npm test`, committen, pushen, in die **Testumgebung** ausspielen
   (`deploy/strato-dev.sh test`). Die Produktion (`prod`) erst nach Lillis Abnahme.
2. **Hilfe immer mitziehen.** Jedes bedienbare Element trägt `data-hilfe="<schlüssel>"`; zu jedem Schlüssel
   steht in `src/web/hilfe.ts` eine Erklärung mit den fünf Fragen (Löst aus · Bezug · Ändert · Ergebnis ·
   Rückweg). `test/hilfe.test.ts` prüft beides; danach `npm run hilfe:vorschau -- konzept/hilfe-vorschau.html`.
3. **Prüfbrowser statt eigenem Browser.** Oberfläche nur mit WebKit im Container am Server ansehen
   (`pruefung/browser/ansehen.sh`), kein Chrome auf dem Mac.
4. **Tests gegen PGlite** (`test/testdb.ts`), Graph über Attrappen (`test/attrappe.ts`,
   `test/postfach-attrappe.ts`). Kein Test spricht mit Microsoft, Meta oder Lexware.
5. **Fassungen:** `package.json` ist die Fassungsnummer; eine Minor-Fassung je abgeschlossenem Block.

## Harte Regeln (Leitplanken, requirements §3 und N28)

- **Nichts geht automatisch an Patienten.** Mails nur als Entwurf im Postfach (Leitplanke 3); WhatsApp nur
  per Click-to-Chat vom Handy oder – mit Einwilligung – über die Cloud API, nie automatisch.
- **Keine Gesundheitsdaten außerhalb der Kartei:** nicht im Kalendertitel (nur Initialen + Patientennummer),
  nicht in Mails oder WhatsApp, nicht in Protokollen (Leitplanke 9). Gesundheitsbezogenes in der Datenbank
  nur verschlüsselt (`src/tresor.ts`, Kontext = Spaltenname).
- **Testumgebung und Produktion** hängen am selben Postfach. Die Schranken stehen in `src/umgebung.ts`
  (Testadressen, Kalender „Praxis-Test“, Kontaktordner „Patienten-Test“, Kategorie TEST, TEST_TELEFONE).
  Nie Echtdaten in die Testumgebung, nie Testadressen in der Produktion.
- **Akte ist unveränderlich** (§ 630f BGB): Behandlungen werden ersetzt, nie geändert oder gelöscht
  (Trigger in Migration 007). Patienten werden archiviert, nicht gelöscht.
- **Rechnungen:** eine Leistungsgruppe je Rechnung (Heilbehandlung § 4 Nr. 14 UStG getrennt von
  Wellness); Nummer, PDF und Zahlungsstand kommen aus Lexware (E28).
- **Zeit:** gespeichert in UTC, gerechnet in Europe/Berlin über `src/zeit.ts` (nie „Mitternacht + Minuten“).
  DATE-Spalten kommen als Text (`pg.types.setTypeParser(1082)`).

## Code-Konventionen

- TypeScript auf Node 24 ohne Build (`node src/cli/serve.ts`), `node:http`, serverseitiges HTML,
  CSP `script-src 'self'` – kein Inline-Skript, Skripte in `/praxis.js`, `/hilfe.js`, `/rueckmeldung.js`.
- **Zentrale Helfer benutzen statt kopieren:** `src/format.ts` (Datum, Uhrzeit, Euro, Preis),
  `src/db/werte.ts` (Werte aus Zeilen), `src/web/bausteine.ts` (Rahmen, Meldungen, Formulare, Chips),
  `src/zeit.ts` (ZONE, heuteBerlin, tagPlus, wocheUm), `src/praxis.ts` (Praxisname, Konto),
  `src/telefon.ts` (E.164).
- Schichten: `src/kartei/*` (Fachlogik gegen `Db`), `src/kartei/dienst.ts` (Aktionen aus Formularen),
  `src/server.ts` (Routen, Zugang, Kopfzeilen), `src/web/*` (HTML). Keine SQL in `src/web`.
- Fehler für die Oberfläche sind `KarteiFehler`/`PreislisteFehler`/`AktionAbgelehnt` – sie landen als
  Meldung auf der Seite, alles andere ist ein 500 und gehört ins Protokoll.
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
