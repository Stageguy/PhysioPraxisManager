# Mehrere Nutzer je Praxis und Mandantenfähigkeit – Prüfung und Aufwandsschätzung (W89)

Stand: 26.10.2026 · nur Prüfung, nichts davon ist gebaut. Zahlen sind Personentage (PT) für einen
Entwickler mit dem heutigen Code, ohne Abnahme durch Lilli und ohne Wartezeiten auf Dritte.

## 1. Ausgangslage (Fassung 0.14.0)

Was der Code heute voraussetzt – und was davon für mehrere Nutzer oder Praxen im Weg steht:

| Bereich | Heute | Für Mehrbenutzer | Für Mandanten |
|---|---|---|---|
| Zugang | `ERLAUBTE_NUTZER`: flache Liste von Tailnet-Konten, alle dürfen alles | Rollen fehlen | je Praxis eigene Liste (Namespace: ✅ schon so) |
| Wer hat was getan | `wer` (Tailnet-Login) steht an jedem Schreibvorgang (audit_event, Kontaktverlauf, Phasen, Rechnungen) | ✅ reicht als Grundlage | ✅ |
| Datenbank | 33 Tabellen, **keine `praxis_id`**; globale Nummernkreise (`patientennummer_seq`), globale UNIQUE-Regeln (`preisliste.name`, genau eine aktive Preisliste, `wellness_leistung.code`, `textbaustein.code`), `praxis_einstellung` ohne Mandant | kein Hindernis | Hindernis für eine **gemeinsame** Datenbank, keins für eine Datenbank je Praxis |
| Microsoft 365 | ein Postfach (`GRAPH_KONTO`), ein Token-Cache als Datei in `/data`, delegierte Rechte per Gerätecode | Kalender je Therapeut braucht mehr (E2: app-only) | je Praxis eigener M365-Mandant → eigene Anmeldung, eigene App-Zustimmung |
| Tresor | ein Hauptschlüssel je Namespace (Secret `praxis-tresor`) | ✅ | ✅ je Namespace; in einer gemeinsamen Datenbank bräuchte es eine Schlüsselhierarchie |
| Konfiguration | `process.env` an 19 Stellen (config.ts, umgebung.ts, serve.ts, kalender.ts …), `config/praxis.json` im Image, Praxisname und Adresse fest im Code (14 Stellen in 9 Dateien) | kein Hindernis | Praxisname/Konto müssen aus Umgebung oder Datenbank kommen |
| Kubernetes | Namespace je Umgebung (`praxis`, `praxis-test`), `deploy/strato-dev.sh prod\|test` setzt NS, Port, Serve-Port, Secrets; Dienst mit `hostNetwork` auf 127.0.0.1, `tailscale serve` des Servers davor | ✅ | **Das ist bereits das Muster „Mandant = Namespace“** – nur noch nicht nach Praxis parametrisiert |
| Oberfläche | serverseitig gerendert, kein Zustand im Browser | ✅ | ✅ |
| Prüfungen | 119 Tests gegen PGlite, Attrappen für Graph | ✅ | ✅ |

Kurz: Das Fundament trennt heute nach **Umgebung**, nicht nach **Praxis** – aber genau derselbe
Mechanismus (Namespace + Secrets + Deploy-Parameter) trägt auch die Trennung nach Praxis.

## 2. Mehrere Nutzer je Praxis

Szenario: Lilli stellt eine zweite Therapeutin und eine Empfangskraft ein; die Steuerberatung soll
nur die Steuerliste sehen.

**Was fehlt**

1. **Nutzer und Rollen** in der Datenbank: Tabelle `nutzer` (Tailnet-Login, Anzeigename, Rolle,
   aktiv). Rollen als Vorschlag: `inhaber` (alles), `therapeut` (Kartei, Akte, Termine, Rezepte,
   eigene Behandlungen), `empfang` (Patienten, Termine, Kontaktverlauf – **keine** Akte, keine
   Anamnese/Befunde, § 630f/§ 203), `buchhaltung` (Rechnungen, Steuerliste, lesend). `ERLAUBTE_NUTZER`
   bleibt als Notfall-Hintertür für den Inhaber.
2. **Rechteprüfung** an einer Stelle: `server.ts` kennt `wer`; ein `rolleVon(wer)` und ein
   `darf(rolle, 'akte_lesen')` vor jeder Route bzw. im `KarteiDienst.aktion`. Die Hilfe (Rechtsklick)
   bekommt je Element „wer darf das“.
3. **Therapeut am Vorgang**: `termin.therapeut_id`, `behandlung.therapeut_id` (heute nur `wer` als
   Text), `behandlungsfall.therapeut_id` als Zuständigkeit; Filter „meine Termine“ in Cockpit und
   Kalenderseite; Pinnwand mit Spalte/Filter je Therapeut.
4. **Kalender je Therapeut**: heute ein Kalender „Praxis“ im Postfach praxis@. Mit mehreren
   Therapeuten entweder mehrere Kalender im selben Postfach (einfach, Graph erlaubt es – 0,5 PT) oder
   je Therapeut das eigene Postfach (braucht app-only-Rechte, E2/A23 – 3–5 PT).
5. **Anzeigenamen** statt Tailnet-Logins in Protokoll, Kontaktverlauf, Phasenverlauf.
6. **Testdaten und Tests**: Rollen in der Testerrolle (W84) durchspielen; je Route ein
   Zugriffstest.

**Aufwand**

| Schritt | PT |
|---|---|
| Nutzer, Rollen, Rechteprüfung, Hilfe | 2–3 |
| Therapeut an Termin/Fall/Behandlung, Filter in Cockpit, Kalenderseite, Pinnwand | 2 |
| Kalender je Therapeut im selben Postfach | 0,5 |
| Anzeigenamen, Testdaten, Tests | 1 |
| **Summe (ohne eigene Postfächer)** | **5–7** |
| optional: eigenes Postfach/Kalender je Therapeut (app-only, A23) | +3–5 |

Datenschutz: Eine Empfangsrolle ohne Akteneinsicht ist nicht Kür, sondern Pflicht
(Need-to-know, Art. 32 DSGVO; § 203 StGB gilt für Gehilfen mit). Die Rollen gehören deshalb vor den
zweiten Nutzer, nicht danach.

## 3. Mandantenfähigkeit – zwei Wege

### Weg A: „Ein Mandant = ein Namespace“ (Container-Isolation) – **Empfehlung**

Jede Praxis bekommt einen eigenen Kubernetes-Namespace mit eigener Datenbank, eigenem
Tresor-Schlüssel, eigener Microsoft-Anmeldung, eigenem Tailnet-Zugang. Das Image ist dasselbe,
die Secrets und Parameter unterscheiden sich. Genau das macht `deploy/strato-dev.sh` heute für
`prod|test` – es fehlt die Parametrisierung nach Praxis.

**Was zu tun ist**

1. **Praxis aus dem Code holen**: `PRAXIS_NAME`, `PRAXIS_KONTO`, Anschrift, Bankverbindung als
   Umgebung bzw. in `praxis_einstellung` (Tabelle gibt es); die 14 festen Stellen „Praxis Lilli
   Nebel“/„praxis@lilli-nebel.de“ in `server.ts`, `cockpit/daten.ts`, `preise/quellen.ts`,
   `einstellungen.ts`, `umgebung.ts`, `drive.ts`, Hilfe-Texte ersetzen. `config/praxis.json` aus dem
   Image heraus in eine ConfigMap je Namespace (oder ganz in die Datenbank).
2. **Deploy nach Praxis parametrisieren**: `deploy/praxis.sh <praxis> <prod|test>` mit einer
   Wertedatei je Praxis (`deploy/praxen/<name>.env`: Namespace, Ports, Graph-Mandant/-Client/-Konto,
   erlaubte Nutzer, Testadressen, Tailnet). Sauberer als sed: ein Helm-Chart oder kustomize-Overlay je
   Praxis – 1 PT mehr, dafür nachvollziehbare Unterschiede.
3. **Tailscale je Praxis**: heute `hostNetwork` + `tailscale serve` des Servers auf einem Port je
   Umgebung. Für mehrere Praxen reicht das technisch (ein Port je Praxis), **trennt aber nicht die
   Identität**: alle laufen im Tailnet des Servers. Richtig ist der schon geplante **Tailscale-Sidecar
   je Namespace** (A09b), jeder im **eigenen Tailnet der Praxis** – dann ist jede Praxis von außen nur
   für ihre eigenen Leute sichtbar. Der Dienst hört weiter nur auf 127.0.0.1 im Pod-Netz.
4. **Microsoft 365 je Praxis**: eigener M365-Mandant der Praxis, dort Zustimmung zur App (die
   App-Registrierung kann mandantenübergreifend sein – „Konten in beliebigem Organisationsverzeichnis“ –
   oder je Praxis eine eigene; letzteres ist bei wenigen Praxen einfacher und sauberer). Anmeldung per
   Gerätecode wie heute, Token-Cache im PVC des Namespaces.
5. **Datenbank**: ein Postgres je Namespace wie heute (klein, 128 Mi), oder ein gemeinsamer Postgres
   mit einer **Datenbank je Praxis** und eigenem Rollenpasswort – spart Speicher, die Trennung bleibt
   auf Datenbankebene. Backups je Datenbank (A25) ohnehin nötig.
6. **Betrieb**: Rollout = Schleife über die Praxen; CronJob `preisquellen` je Namespace (GKV-Listen
   sind für alle gleich – später ein gemeinsamer Job, der in alle Datenbanken schreibt, 1 PT).
7. **Rückmeldungen (W72)** laufen heute in eine Entwicklungs-Datenbank auf demselben Server – die darf
   praxisübergreifend bleiben, trägt aber dann einen Praxisnamen je Eintrag (0,5 PT).

**Aufwand**

| Schritt | PT |
|---|---|
| Praxis aus dem Code (Name, Konto, Konfiguration in ConfigMap/DB) | 1–1,5 |
| Deploy nach Praxis (Wertedatei, Skript; mit Helm/kustomize +1) | 1–2 |
| Tailscale-Sidecar je Namespace, eigenes Tailnet (A09b ohnehin geplant) | 1 |
| Rollout-Schleife, Rückmeldungen mit Praxiskennung, Doku je Praxis (Schlüssel, Anmeldung, AVV) | 1 |
| **Summe** | **4–6** |

Laufender Aufwand je weiterer Praxis: etwa 0,5 PT Einrichtung (Tailnet, M365-Zustimmung,
Gerätecode-Anmeldung, Tresor-Schlüssel mit Notfallkopie, Testadressen) plus Betrieb.

**Vorteile**: stärkste Trennung von Gesundheitsdaten (eigene Datenbank, eigener Schlüssel, eigene
Netzidentität – ein Programmfehler kann keine fremden Patienten zeigen); passt zum heutigen Code ohne
Eingriff in die 117 Datenbankabfragen; jede Praxis kann einzeln aktualisiert, gesichert, gelöscht
werden (Art. 17/28 DSGVO, Kündigung einer Praxis = Namespace löschen und Sicherung übergeben).
**Nachteile**: Betrieb skaliert linear (bei 20 Praxen 20 Datenbanken, 20 Anmeldungen); keine
praxisübergreifenden Auswertungen (die will niemand).

### Weg B: Gemeinsame Instanz mit `praxis_id` (Zeilen-Trennung)

Eine Datenbank, ein Dienst, jede Zeile trägt die Praxis.

**Was zu tun wäre**: Tabelle `praxis`; `praxis_id` auf allen 33 Tabellen (bei Kindtabellen
ableitbar, trotzdem redundant für Row-Level-Security); **Row-Level-Security** in Postgres mit
`SET app.praxis_id` je Anfrage, damit nicht jede der 117 Abfragen von Hand gefiltert werden muss;
Nummernkreise je Praxis (Patientennummer, Rechnungsnummer); UNIQUE-Regeln um `praxis_id` erweitern
(aktive Preisliste, Wellness-Codes, Textbausteine, Einstellungen); Zuordnung Anfrage → Praxis (über
Hostname oder Tailnet des Aufrufers); ein **Graph-Token je Praxis** verschlüsselt in der Datenbank
statt der Datei; **Schlüsselhierarchie** im Tresor (Hauptschlüssel + Datenschlüssel je Praxis, damit
eine Praxis gelöscht oder ausgeliefert werden kann, ohne die anderen anzufassen); `ERLAUBTE_NUTZER` →
`nutzer` mit `praxis_id` (Weg B setzt also §2 voraus); Migration der bestehenden Daten; Tests je
Abfrage, dass die Praxis gefiltert ist.

**Aufwand**: 20–30 PT, davon rund ein Drittel für Tests der Trennung. Dazu das Risiko: **ein**
vergessener Filter zeigt Patienten einer anderen Praxis – bei Gesundheitsdaten ein meldepflichtiger
Vorfall (Art. 33 DSGVO) und ein Fall nach § 203 StGB. RLS senkt das Risiko, beseitigt es nicht
(Aufrufe mit Superuser-Rolle, Migrationen, Exporte).

**Wann Weg B trotzdem?** Erst ab etwa zehn Praxen, wenn der Betrieb von Weg A spürbar wird – und
dann als zweiter Schritt auf einer Grundlage, die Weg A schon bereinigt hat (Praxis aus dem Code,
Nutzer und Rollen).

### Vergleich

| | Weg A: Namespace je Praxis | Weg B: `praxis_id` |
|---|---|---|
| Aufwand | 4–6 PT | 20–30 PT |
| Trennung der Gesundheitsdaten | physisch (DB, Schlüssel, Netz) | logisch (RLS, Code) |
| Risiko Datenvermischung | praktisch null | real, nur durch Tests und RLS beherrschbar |
| Betrieb je Praxis | 0,5 PT Einrichtung, linear | gering |
| Praxis löschen/übergeben | Namespace löschen, Datenbank-Dump übergeben | Export je `praxis_id`, Schlüssel je Praxis nötig |
| Microsoft 365 | eigene Anmeldung je Praxis, natürlich getrennt | Token je Praxis in DB, selbst zu bauen |
| Passt zu Lillis Tailnet (eigener Verbund) | ja, genau so | nein – ein Dienst müsste in mehreren Tailnets stehen |
| Updates | Rollout je Namespace (Schleife) | ein Rollout |

## 4. Empfehlung und Reihenfolge

1. **Weg A** als Zielbild festhalten (E11 anpassen: „Mandant = Namespace“). Nichts jetzt bauen, aber
   die billigen Vorbereitungen mitnehmen, sobald man ohnehin an den Stellen ist:
   - Praxisname und Konto aus dem Code in Umgebung/`praxis_einstellung` (1 PT) – nützt auch der
     Testumgebung (Titel „Praxis-Test“ statt Lillis Namen);
   - `config/praxis.json` in eine ConfigMap je Namespace;
   - A09b (Tailscale-Sidecar) ist für Lillis eigenen Tailnet ohnehin geplant – das ist zugleich die
     Mandanten-Trennung im Netz.
2. **Mehrere Nutzer je Praxis (§2)** erst bauen, wenn der zweite Mensch in der Praxis absehbar ist –
   dann aber **vor** dessen erstem Login (Rollen vor Zugang). 5–7 PT.
3. **Weg B** nicht beginnen, solange es unter zehn Praxen sind.

## 5. Was rechtlich je Praxis anfällt (unabhängig vom Weg)

- Eigene **Auftragsverarbeitung** mit Christian/mondre als Auftragsverarbeiter je Praxis, inklusive
  § 203-Klausel (A24); eigenes Verarbeitungsverzeichnis, eigene TOM (die Trennung nach Namespace
  steht dann als Maßnahme drin).
- **Schlüsselverwahrung** je Praxis: Notfallkopie des Tresor-Schlüssels bei der Praxisinhaberin
  (E26), nie gesammelt an einem Ort.
- **Microsoft 365**: jede Praxis stimmt der App in ihrem eigenen Mandanten zu; Christians
  App-Registrierung darf nicht zur Sammelstelle fremder Postfächer werden (E1 gilt je Praxis).
- **Sicherung** (A25) je Praxis getrennt, verschlüsselt, mit eigenem Aufbewahrungsplan.
