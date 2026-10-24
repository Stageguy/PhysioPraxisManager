# Requirements – Digitalisierung Praxis Lilli Nebel

Stand: 24.10.2026 · lebendes Dokument, wird bei jedem Schritt fortgeschrieben.

**Wozu diese Datei:** Hier stehen Christians Wünsche (W), der Abgleich mit der Prompt-Sammlung
und dem tatsächlichen Stand (N), die Aufgaben in Reihenfolge (A) und was noch zu entscheiden ist (E).
Neue Ideen bekommen eine W-Nummer und werden sofort mit den Prompts abgeglichen.

**Grundlagen in diesem Ordner:**

| Datei | Inhalt | Rolle |
|---|---|---|
| [claude-code-prompts-praxis-lilli-nebel.md](claude-code-prompts-praxis-lilli-nebel.md) | Prompts 0–14, Leitplanken, Ideen-Backlog, Speicherort-Tabelle (mit Claude Desktop erstellt) | Vorlage – gilt, soweit unten (N) nichts Neueres steht |
| [Praxis-Assistenz_Buero-und-Rechnungen.pdf](Praxis-Assistenz_Buero-und-Rechnungen.pdf) | Kaufmännischer Ablauf für Lilli (4 Seiten): Poststelle, drei Ablagen, Ausgangsrechnungen, Lillis Anteil | Erklärung für Lilli |
| [Praxis-Assistenz_Patientenweg.pdf](Praxis-Assistenz_Patientenweg.pdf) | Patientenweg (6 Seiten): 8 Phasen, Neu-/Bestandspatient, Alternativen, Rezept-Details, Pinnwand | Erklärung für Lilli |

---

## 1. Wünsche (W) – was Christian vorgeschlagen hat

| # | Wunsch | Prompt | Stand |
|---|---|---|---|
| W01 | Praxis digitalisieren, Lexware Office (online) einbinden | alle | Konzept steht |
| W02 | Zugriff auf Exchange-Postfach mit Anhängen und OneDrive Business wie in mondre-infra/graphapi | 1, 2 | ✅ erledigt (delegiert, siehe N1/N2) |
| W03 | Eingangsrechnungen: Mails mit Rechnungs-PDF ablegen → per API nach Lexware → Freigabe durch Lilli | 4, 5 | offen |
| W04 | Terminanfragen per Mail und WhatsApp eintragen und beantworten | 6, 7 | offen |
| W05 | Tägliche Übersicht über Termine und Patienten | 8 | offen |
| W06 | Grundsätzlich klären, welche Daten wo gespeichert werden dürfen | Anhang, 9, 11 | Arbeitsgrundlage im Anhang der Prompts |
| W07 | Lösungen bei Strato und OneDrive für Physiopraxen (Sicherheit) | 9, 11 | Arbeitsgrundlage, Entscheidung E6 |
| W08 | Prompts für Claude Code | – | ✅ Prompt-Sammlung |
| W09 | Höherer Lexware-Tarif mit API-Zugriff | Leitplanke 7, 5 | offen – vor A13 prüfen (N12) |
| W10 | Übersichtsseite: aktuelle Termine, offene Zahlungen, neue Posteingänge mit Rechnungen – für Desktop und Handy | 10 | offen |
| W11 | Zentrale Poststelle: Eingangskanäle bündeln, zentral verarbeiten, sinnvoll in Datenbank und/oder OneDrive ablegen, ausgewählte Daten in ein medizinisch gesichertes Verzeichnis | 11 | offen |
| W12 | Termine und Rechnungsausgänge verarbeiten und in Lexware als Ausgangsrechnung vorbereiten – Lilli soll so wenig wie möglich selbst tun | 11 | offen |
| W13 | Patientenweg Neupatient: Erstaufnahme → Anamnese → Behandlung → Rechnung, mit Alternativen | 12 | offen |
| W14 | Derselbe Weg für Bestandspatienten | 12 | offen |
| W15 | Immer sehen, welcher Patient in welcher Phase ist | 12 (Pinnwand) | offen |
| W16 | Je ein PDF (kaufmännisch, Patientenweg) für Lilli ohne Technikkenntnisse | – | ✅ beide PDFs |
| W17 | Schnellaktionen in der Pinnwand: Standard-Mails per Tipp als Entwurf ins Mailprogramm, nur noch senden | 13 | offen |
| W18 | Rezepte mit Anzahl Behandlungen; Termine dem Rezept zuordnen bzw. mit dem Patienten besprechen; nach jeder Sitzung je Rezept einen Termin abhaken | 14 | offen, in PDF Patientenweg S. 5 |
| W19 | Rechnung nach Rezeptende; Zwischenrechnungen, wenn ein Rezept länger als pro Kunde konfigurierbare Quartale läuft; Rezeptabbruch mit Abschlussrechnung | 14 | offen, in PDF S. 5 |
| W20 | Termine bis 24 h vorher verschieben oder absagen; mit Rezept nur verschieben | 14 | offen, Regel unter 24 h: E7 |
| W21 | Anwendungen laufen in einem **eigenen Tailscale-Verbund**, ohne Verbindung zu den mondre-Projekten | Backlog #3 | ✅ Container angelegt, Tailnet noch nicht (A09) |
| W22 | Lilli (Praxisinhaberin) greift später selbst per Tailscale zu | Backlog #3, 10 | eingeplant (A09) |
| W23 | Schritt für Schritt vorgehen; Vorschläge merken und mit der Prompt-Sammlung abgleichen | – | diese Datei |
| W24 | Der Praxis Manager läuft **auf dem Strato-Server**, nicht lokal in OrbStack – dort als Container oder in Kubernetes | 9 | entschieden: `strato-dev`, k3s (E6, E12) |
| W25 | Auf `strato-dev` die Praxis **trennen** und nur für die Praxis verfügbar machen; VS Code (Christian) darf auf den Server zugreifen | 9 | offen (A09) |
| W26 | Erst alles bauen und ansehen, später härten | 9 | angenommen mit Grenze, siehe N16 |
| W27 | Lösung für die Ablage von Patientendaten und -dateien: reicht Strato HiDrive bzw. HiDrive-Objektspeicher (S3), oder braucht es etwas anderes? | 11 | geprüft 20.10.2026, siehe §4a und N17 |
| W28 | **Keine Fachsoftware** – deren Bedienbarkeit ist meist zu schlecht; wir bauen selbst | 11, 12 | entschieden (E14) |
| W29 | Den heutigen OneDrive-Inhalt vorerst ignorieren; welcher Ordner relevant ist, wird später festgelegt | 4 | entschieden (N5), `rechnungen.ziel` bleibt leer |
| W30 | Noch kein HiDrive vorhanden: Lösung für Patientendaten auf OneDrive, auf dem Strato-Server selbst oder mit HiDrive – ginge auch eine Datenbank, in der die Textobjekte liegen? | 11 | beantwortet: §4a, N19, E16 |
| W31 | Mit dem Rechnungsworkflow beginnen | 3, 4, 5 | ▶ Rechnungseingang gebaut (A06) |
| W32 | Ist der Rechnungsworkflow ein „Hybrid“, weil in den Rechnungspositionen die Leistungen stehen? | 11, 14 | beantwortet: N20, E17 |
| W33 | OneDrive-Bestandsaufnahme; unter „07 Technik“ einen gekennzeichneten Ordner für Probeläufe anlegen | 4 | ✅ 20.10.2026: „07 Technik/_TEST PhysioPraxisManager – Probeläufe“ mit LIESMICH (N23) |
| W34 | In „01 Finanzen“ (Steuern, Bankinformationen) einen Ordner 2026 nach Vorlage 2025 anlegen, ergänzt um „Eingangsrechnungen“ – dort landen die eingehenden Rechnungs-PDFs | 4 | ✅ 20.10.2026 mit `npm run finanzjahr -- --jahr 2026` (N23) |
| W35 | In Exchange Kategorien, die dem Eingangs-Flow entsprechen – das System legt sie an | 4 | ✅ 20.10.2026: fünf Kategorien (E18) |
| W38 | Kategorie „Rechnung bezahlt“, wenn in Lexware eine Zahlung angestoßen wurde – ist das prüfbar? | 5, 10 | ✅ prüfbar (N24); zwei Kategorien vorgeschlagen (E22), noch nicht in Outlook angelegt |
| W39 | Kategorie „Rechnung: abgelegt“ heißt jetzt „Rechnung: eingegangen“ | 4 | ✅ 20.10.2026, in Outlook neu angelegt, alter Name entfernt |
| W40 | Ist die Rechnung bezahlt, wandert die Mail ins Exchange-Archiv | 5 | ✅ vorbereitet (A14a) |
| W41 | Lösung 3: „bezahlt“ vollautomatisch aus Lexware lesen und die Mail archivieren; braucht Public API (Tarif XL) und eine eindeutige Zuordnung Mail ↔ Beleg, etwa über die Rechnungsnummer. XL kommt noch – Lösung 3 schon vorbereiten | 5 | ✅ vorbereitet: `npm run zahlungen -- --quelle lexware` (N26) |
| W42 | Übergang bis XL: wie mit bereits bezahlten Rechnungen und mit Rechnungen umgehen, die in der Zwischenzeit übernommen werden | 5 | ✅ Lösung N26 |
| W43 | Dokument „Fragen an Lilli“ im Ordner konzept, Frage 1: Sind Mails mit PDFs im Archiv schon bezahlt? | – | ✅ [fragen-an-lilli.md](fragen-an-lilli.md) |
| W44 | Die Hilfe-HTML immer mit anpassen | 10 | ✅ Regel; ein Test erzwingt eine aktuelle Vorschau |
| W45 | Praxis-Cockpit: Schaltflächen mit Grafiken, Symbolen und Text für die Funktionen; zwei Hauptbereiche Finanzen und Patienten mit ihren Screens (Finanzen: Rechnungs-Dashboard); daneben eine Übersicht zu neuen Rechnungseingängen, Terminanfragen und Terminen des Tages; ein Protokoll, was sich in der letzten Woche geändert hat; Symbole für die Herkunft von Anfragen (WhatsApp, E-Mail …). Nichts erfinden, nur vorbereiten | 10, 12 | ✅ 0.2.0 (20.10.2026) |
| W46 | Erste Fassung auf den Strato-Server in Kubernetes | 9 | ✅ k3s auf strato-dev, Namespace `praxis` (N27) |
| W47 | Über Tailscale anzeigen; später umhängen – ist der eigene Praxis-Tailnet jetzt nötig? | – | beantwortet: N27 |
| W48 | Browserprüfungen wie in mondre (nicht Chrome) | – | ✅ Prüfbrowser übernommen: WebKit im Container am Server |
| W49 | Bis auf Weiteres alles im mondre-Tailnet; später mit Lilli ihren eigenen Tailscale-Account anlegen, alles umziehen und im mondre-Tailnet löschen | – | entschieden 21.10.2026 (E4, Umzugs-Checkliste §5a) |
| W50 | Rechnungs-Dashboard ausbauen: Freigabe; Auswertung & Suche; neue Rechnungen als Kacheln mit Dateiname, Eingang (Mail-Datum), Absender; beim Darüberfahren der Ort der Mail im Postfach; Haken „privat“ (nicht im Firmenkontext verbuchen); Klick öffnet PDF-Viewer | 5, 10 → **Prompt 15** | ✅ 0.3.0 gebaut (21.10.2026), nur mit Test- und Beispieldaten geprüft (W51) |
| W51 | Noch nicht das Postfach durchsuchen und keine Echtdaten einbinden | – | eingehalten: Datenbank am Server leer, kein Lauf gegen das Postfach |
| W52 | Die letzten zwei Monate im Postfach durchsuchen und die Rechnungs-PDFs anzeigen; den Rest später mit Lexware XL. Alle Rechnungs-PDFs ohne Patientenbezug als Kachel – Privates hakt Lilli ab | 15 | ▶ 21.10.2026 (`unbekannteAlsRechnung`) |
| W53 | PDFs in `01 Finanzen/<Jahr>/Eingangsrechnungen` ablegen, Name `TT-MM-JJJJ-ER-<Dateiname>`, Datum und Jahr = Eingang der Mail | 4 | ✅ umgesetzt; Hinweis: Jahr-Monat-Tag sortiert besser, Christian wählte Tag-Monat-Jahr. Für die Buchhaltung unbedenklich: der Inhalt des PDFs bleibt unverändert (GoBD), der Name ist frei |
| W54 | Mails der übernommenen zwei Monate nur mit Kategorie versehen, nicht verschieben | 4 | ✅ `mailsVerschieben: false` |
| W55 | In der Kachel Brutto groß, darunter klein Netto und Steuer | 15 | ✅ aus dem PDF gelesen, nur wenn Netto + Steuer = Brutto (Migration 004). Hinweis: Als Physiotherapiepraxis mit steuerfreier Heilbehandlung kann Lilli die Vorsteuer meist nicht abziehen – mit der Steuerberatung klären |
| W56 | Testumgebung in Kubernetes: alles dort entwickeln und ansehen; Patientendaten erfunden; erst nach Abnahme durch Lilli in die Produktion | – | entschieden 21.10.2026 (N28) |
| W57 | Kein eigener Produktionsserver – Christian verwaltet ohnehin beide; Produktion bleibt auf strato-dev | – | entschieden 21.10.2026 (E6) |
| W58 | Kein Fake-Outlook: Rechnungen, Mails und Kalender aus dem echten Postfach von praxis@lilli-nebel.de; nur Patienten erfunden, ihre Mailadressen sind Christians Testadressen mit eigenem Postfach | – | entschieden 21.10.2026 (N28) |
| W59 | Preislisten-Seite zwischen Status und Hilfe: aktuelle GebüTh herunterladen, nachts auf neue prüfen (roter Punkt am Menü); drei Kacheln mit „aktiv“; Neu, Bearbeiten, Prüfen; Bearbeitungsseite mit Kopf (Grundlage, Version, Erstellungsdatum fest, Speichern/Verwerfen/Löschen, Faktor), Scroll-Tabelle (Übernehmen, ID, Kürzel, Position, Grundpreis, Faktor ↔ eigener Preis), Detailansicht je Zeile; „Muster“ für die Übernahme; Details (Verwendung bei Patienten/Rechnungen), Archiv mit Wiederherstellen; mobil nur ansehen | – | ✅ 0.6.0 in der Testumgebung (N29) |
| W60 | Im Kopf bei „Allgemeiner Faktor“ ein Haken „Aufrunden“ (eigene Preise auf ganze Euro aufrunden), mit Rechtsklick-Erklärung | – | ✅ 0.7.0 (Test): je Preisliste und im Muster gespeichert; Faktor folgt dem gerundeten Preis (Migration 006) |
| W61 | Beim Speichern fragen, ob es ein neues Muster geben soll – nur wenn sich zum bisherigen Muster etwas geändert hat | – | ✅ 0.7.0: Vergleich von Haken, Faktoren (über den daraus folgenden Preis, damit Rundung keinen Fehlalarm gibt), allgemeinem Faktor und Aufrunden; Antworten: neues Muster · bestehendes aktualisieren · nein |
| W62 | Die Übernehmen-Haken sollen von einem Muster vorbelegt sein | – | ✅ 0.7.0: bei „Neu“ ist das zuletzt geänderte Muster vorgewählt; in der Bearbeitung „Haken aus Muster übernehmen“. In der Oberfläche heißt es wieder „Muster“ (statt „Vorlage“) |
| W63 | **Patientenstammdaten als Hybrid:** Kontaktdaten als Exchange-Kontakte (am Handy schnell anrufen oder anschreiben) plus die notwendigen Patientendaten in der eigenen Datenbank | 11, 12 | ▶ Datenmodell 0.8.0 (Migration 007, §4b); Abgleich mit Exchange: A19b |
| W64 | **Patientenkachel:** Vorname Name; immer primäre Telefonnummer, WhatsApp-Kontakt und Mailadresse; Patient seit; letzte Behandlung (Klick öffnet den Behandlungsverlauf); nächster Termin (Rezept oder Individual); gelb/rot bei leicht verzögerter bzw. überfälliger Rechnung; „+“ für neue Aktivität (Rezept, Behandlung, Rechnung, Termin) | 10, 12, 14 | vorgemerkt – Datenmodell deckt alles ab (§4b); Oberfläche: A19c; Fristen gelb/rot: E25 |
| W65 | Gendern/Ansprache nur auf Wunsch, als eigenes Feld in den Stammdaten; andere Besonderheiten auf der Kachel anzeigen | – | ✅ Felder `ansprache_hinweis`, `besonderheiten` (verschlüsselt) |
| W66 | Adresse als Knopf: mehrere Adressen je Patient als Kacheln, darin ein Radio „Rechnungsadresse“ – nur eine kann es sein | 11 | ✅ `patient_adresse`, erzwungen durch die Datenbank |
| W67 | Klick auf die Telefonnummer startet am Handy den Anruf; der Anruf landet in der Patientenhistorie; danach schnell den Gesprächsgrund eintragen – Standardbegriffe wie „Terminverschiebung“, „Absage Patient“, „Absage Praxis“ | 12, 13 | ✅ `patient_kontaktverlauf` mit `offen` + Tabelle `gespraechsgrund` (9 Begriffe, erweiterbar); Oberfläche: A19c |
| W68 | Grundlage der Patientendaten sind die geltenden Gesetze (§ 630f BGB u. a. – selbst ergänzt: § 630c, § 630d/e, § 630g, § 14 UStG, § 4 Nr. 14 UStG, Art. 9 DSGVO) | Anhang | ✅ eingearbeitet in §4b |
| W37 | Hilfeseite, die Kategorien und spätere Funktionen erklärt; Rechtsklick-Erklärungen an Schaltflächen und Eingabefeldern wie in den mondre-Projekten | 10 | ✅ 20.10.2026: `/hilfe`, `/hilfe.js`, Vorschau `npm run hilfe:vorschau` |
| W36 | Postfach durchlesen: wie viele Mails enthalten Rechnungen, die für das Geschäftsjahr 2026 relevant sind? | 4 | ✅ gezählt 20.10.2026, N21 |

---

## 2. Abgleich: neuere Erkenntnisse (N)

Was die Prompt-Sammlung annimmt und was der Stand vom 20.10.2026 zeigt. Wo hier etwas steht,
gilt es vor dem jeweiligen Prompt.

| # | Thema | Prompt-Sammlung sagt | Tatsächlicher Stand | Empfehlung |
|---|---|---|---|---|
| N1 | **Mandant** | Lilli hat einen eigenen M365-Mandanten; „zusätzlichen Mandanten anlegen“, App-Registrierung dort (Leitplanke 1, Prompt 2) | lilli-nebel.de ist eine Domain **im mondre-Mandanten** (`mondrenet.onmicrosoft.com`, `bba7d110-…`). Postfach und OneDrive (152 GB) liegen dort. | Vorerst so lassen und mit AVV + § 203-Verpflichtung absichern (fordert Leitplanke 1 ohnehin). Ein eigener Mandant hieße Umzug von Postfach und OneDrive – bewusst entscheiden (E1). |
| N2 | **Anmeldeart** | app-only mit Zertifikat; Exchange RBAC for Applications aufs Praxispostfach; `Sites.Selected` aufs OneDrive | **delegiert**, Gerätecode, App `praxis-graphapi`, nur praxis@lilli-nebel.de zugewiesen. Die App sieht damit nur, was dieses Konto sieht. | Für den Start genügt delegiert. Vor dem Dauerbetrieb der Worker auf app-only + Zertifikat + RBAC/Sites.Selected umsteigen (A23): das Refresh-Token verfällt nach 90 Tagen ohne Nutzung und bei Passwortwechsel. Im gemeinsamen Mandanten ist die Begrenzung per RBAC doppelt wichtig – sonst sähe eine app-only-App auch mondre-Postfächer. (E2) |
| N3 | **Mail.Send** | Kein Mail.Send; Antworten nur als Entwurf. Später Mail.Send nur für die Tagesübersicht an @lilli-nebel.de (Prompt 2, 8) | Mail.Send ist erteilt; Befehl `npm run senden` verschickt (nur von Hand mit `--ausfuehren`). | ✅ umgebaut (20.10.2026): `npm run entwurf` legt nur noch einen Entwurf an, `senden` gibt es nicht mehr. Das Recht Mail.Send bleibt erteilt, aber ungenutzt – erst die Tagesübersicht (Prompt 8) braucht es, dann mit Empfänger-Allowlist. |
| N4 | **Anhänge nach OneDrive** | Nur Lieferantenrechnungen (PDF, regelbasiert erkannt) nach `/Praxis-Automation/Buchhaltung/Eingang/JJJJ/MM`; Rezepte/Befunde **nie** in OneDrive (Prompt 4, 11; PDF Büro S. 2) | `npm run anhaenge` legt **alle** Anhänge nach `Mailanhänge/JJJJ-MM` – also auch Rezepte und Befunde. | ✅ ersetzt (20.10.2026) durch `npm run rechnungen` nach Prompt 4 (A06). `anhaenge` gibt es nicht mehr. Nie mit `--ausfuehren` gestartet. |
| N5 | **OneDrive-Bestand** | OneDrive startet leer mit der Struktur `/Praxis-Automation/...` | Im OneDrive liegen bereits 152 GB. Was darin ist, ist unbekannt – womöglich auch Gesundheitsdaten. | Entschieden (W29): Inhalt **vorerst ignorieren**. Den Zielordner für Rechnungen legen wir später fest; bis dahin sind nur Probeläufe möglich. |
| N6 | **Technik** | Python 3.12, FastAPI, SQLAlchemy, Alembic, Presidio, pytest + respx, Jinja2 | TypeScript/Node 24 wie graphapi: Graph-Client, Upload, Gerätecode, Tests mit Graph-Attrappe – erprobt und übernommen | Bei TypeScript bleiben: Wiederverwendung aus graphapi, ein Stack. PostgreSQL wie geplant. Presidio gibt es nur in Python – erst nötig, wenn das KI-Feature kommt, dann als eigener kleiner Container. Prompts beim Umsetzen sinngemäß übertragen (respx → Graph-Attrappe, pdfplumber → unpdf, Jinja2 → Templates in TS). ✅ entschieden: TypeScript (E3) |
| N7 | **Zugang** | Caddy + Authelia oder Entra-OIDC, MFA, Server bei Strato (Prompt 5, 9, 10) | Eigener Tailscale-Knoten `praxis`, `tailscale serve` (HTTPS), Zugang nur für Tailnet-Konten in `ERLAUBTE_NUTZER`; kein offener Port (Ideen-Backlog #3) | Caddy und Authelia entfallen. MFA kommt über die Tailnet-Anmeldung (Passkey). Offen: wie der „Step-up“ vor medizinischen Inhalten (Prompt 12) aussieht – z. B. Passkey in der App. ✅ entschieden: Tailscale |
| N8 | **Tailnet-Anmeldung** | – | Tailscale fasst Microsoft-Geschäftskonten nach Mandant zusammen; Praxis und mondre teilen sich den Mandanten (N1) | Praxis-Tailnet **nicht** mit Microsoft-Anmeldung anlegen, sondern z. B. mit Passkey – sonst droht derselbe Tailnet wie mondre (E4). |
| N9 | **Lillis Konto** | `<LILLI_UPN>` (Lilli) getrennt von `<PRAXIS_MAILBOX>` | Unter lilli-nebel.de gibt es nur **praxis@lilli-nebel.de**; es besitzt auch das OneDrive | Entweder `<LILLI_UPN>` = praxis@lilli-nebel.de, oder ein eigenes Konto für Lilli anlegen (Lizenz) (E5). |
| N10 | **Server-Standort** | Strato-Linux-Server, Docker Compose | Entschieden (W24): Strato. Der Container ist angelegt, aber noch nicht für den Server eingerichtet. | Für den Patienten-Tresor: verschlüsselte Platte, Sicherung, Server in Deutschland. Welcher Strato-Server: E6. |
| N16 | **Erst bauen, später härten** | Härtung in Prompt 9 am Ende | Die Graph-Anmeldung greift schon heute auf das **echte** Praxispostfach (594 Mails) und OneDrive zu – „Testbetrieb“ heißt also nicht „ohne Patientendaten“. | Ja, aber diese Grenzen gelten sofort: eigener Namespace `praxis`, Anmeldung nur als Kubernetes-Secret dort, kein Ingress/NodePort (nur über Tailscale), nur Lesen und Probeläufe, keine Inhalte in Logs. Echte Patientendaten im Tresor (A19) erst nach der Härtung (A25). Optional: ein Test-Postfach für die Bauphase (E13). |
| N17 | **Speicher des Patienten-Tresors** | MinIO mit serverseitiger Verschlüsselung auf dem Strato-Server, verschlüsselte Zweitkopie per restic auf HiDrive (Prompt 11) | Der HiDrive-Objektspeicher (S3) liegt in Deutschland, ist ISO-27001-zertifiziert und kostet 0,018 €/GB im Monat. Er dokumentiert aber weder Verschlüsselung noch Versionierung noch Object Lock (§4a). | Kein eigenes MinIO. Die App verschlüsselt jede Datei selbst und legt nur verschlüsselte Objekte im HiDrive-Objektspeicher ab. Die Sicherung läuft per restic in einen zweiten Bucket. (E14, E15) |
| N18 | **Rechnungseingang: Abweichungen von Prompt 4** | Polling alle 10 Min. per Scheduler; Ziel `/Praxis-Automation/Buchhaltung/Eingang/{JJJJ}/{MM}` | Gebaut als Befehl `npm run rechnungen`, ohne Zeitplaner (W26: erst bauen und ansehen). Das Ziel ist ein frei wählbarer Ordner (`rechnungen.ziel`), darunter `JJJJ/MM` (W29). Zusätzlich: Unbekannte Absender ergeben nie eine Rechnung, sondern „unklar“; ein Scan ohne Text von Unbekannten ist „unklar“ (könnte ein Rezeptfoto sein); Patientenpost hinterlässt keine Datenbankzeile. | Zeitplaner (k3s-CronJob) erst nach dem Ansehen. Die Lieferantenliste füllt Lilli; anfangs ist sie leer, also landet alles als „unklar“ bei ihr. |
| N19 | **Patientendaten: Datenbank statt Dateiablage** | Patienten-Tresor als Objektspeicher (MinIO/HiDrive), Metadaten in PostgreSQL | Noch kein HiDrive (W30). Für eine Praxis sind die Datenmengen klein: Rezeptfotos, Befund-PDFs, Anamnese-Texte – geschätzt 1–3 GB im Jahr. | **Ja, eine Datenbank geht und ist hier die einfachste Lösung:** PostgreSQL auf dem Strato-Server im Namespace `praxis`. Texte und Dateien von der App verschlüsselt (AES-256-GCM) als Spalten abgelegt. Eine Stelle, ein Protokoll, eine Sicherung. Offen bleibt nur eine Sicherung außerhalb des Servers (E16). Details §4a. |
| N20 | **Rechnungen und Gesundheitsdaten** | Eingangs- und Ausgangsrechnungen beide „kaufmännisch“ (Büro-Ordner, Lexware) | **Eingangsrechnungen** von Lieferanten sind rein kaufmännisch. **Ausgangsrechnungen** an Patienten sind ein Hybrid: Name + Leistung + Datum verraten, dass jemand in Behandlung ist – das ist Gesundheitsdatum und fällt unter § 203. | Ausgangsrechnungen bleiben trotzdem in Lexware (nötig für Buchhaltung und Aufbewahrungspflicht; Lexware als Auftragsverarbeiter mit AVV). Regeln: auf der Rechnung nur Leistung und Datum, keine Diagnose (Prompt 11); in OneDrive höchstens das fertige Rechnungs-PDF, keine Behandlungsdetails; die Verbindung Rechnung ↔ Rezept ↔ Behandlung liegt nur in der Praxis-Datenbank. Offen: Privatversicherungen und Beihilfe verlangen auf Physio-Rechnungen oft Diagnose oder Verordnungsbezug (E17). |
| N21 | **Rechnungen im Postfach (Zählung 20.10.2026)** | – | `npm run rechnungen:zaehlen -- --jahr 2026`, Eingang 01.12.2025 bis heute, alle Ordner außer Gelöschte, Junk, Entwürfe: 1.430 Mails, 139 mit PDF; **64 Mails mit Rechnungs-PDF ohne Patientenbezug** (68 PDFs), davon 59 mit Eingang 2026. Zusätzlich: 28 Rechnungs-PDFs mit Patientenbezug, 31 Rechnungshinweise ohne PDF (Kundenportal), 13 gesendete Mails mit Rechnungs-PDF. Rechnungsdatum nur bei 15 lesbar (14× 2026, 1× 2025). **Nachzählung mit „Gelöschte Elemente“ (`--mit-geloeschten`):** 78 Mails mit Rechnungs-PDF ohne Patientenbezug, davon 73 mit Eingang 2026. Verteilung: Archiv 32, Unterordner des Posteingangs 27, Gelöschte Elemente 14, Posteingang 5. Rechnungs-PDFs mit Patientenbezug: 79 (51 davon gelöscht). Das Online-Archiv (eigenes Archivpostfach) sieht Graph nicht; für Mails aus 2026 spielt es kaum eine Rolle. Im Postfach liegen **private und berufliche Rechnungen gemischt** (Mode, Möbel, Versandhandel neben Telekom, Lexware, Fortbildung, Praxisbedarf). | Was „für 2026 relevant“ ist, entscheidet die Lieferantenliste: Lilli markiert, welche Absender beruflich sind. Bei der Einnahmen-Überschuss-Rechnung zählt meist das Zahlungsdatum, nicht das Rechnungsdatum – mit der Steuerberatung klären. Die Erkennung des Rechnungsdatums muss besser werden (49 unbekannt). Die 28 Rechnungen mit Patientenbezug und die 13 gesendeten sind vermutlich Ausgangsrechnungen bzw. Arztrechnungen → bei A19 ansehen. |
| N22 | **OneDrive von praxis@** | – | Im OneDrive von praxis@lilli-nebel.de gibt es keine Ordner „01 Finanzen“ oder „07 Technik“. Oben liegen Anlagen, Bilder, Desktop, Dokumente usw.; „Dokumente“ ist eine gewachsene Sammlung, teils mit Namen in Ordnernamen. | Vorerst ignorieren (W29). |
| N23 | **Wo die Praxisablage liegt** | „SharePoint/Teams der Praxis“ (Annahme 20.10.) | Die Struktur „Praxis Lilli Nebel“ (01 Finanzen … 07 Technik) liegt im **persönlichen OneDrive von hartmann@mondre.net** unter `Projekte/Praxis Lilli Nebel` und ist mit praxis@ geteilt. praxis@ sieht nur diesen Ordner, nicht „Projekte“ darüber. Die Ablage gehört damit Christian, nicht der Praxis. Wird sein Konto gelöscht oder verliert er den Zugang, sind Lillis Finanzunterlagen weg. Außerdem hängt sie am mondre-Konto (vgl. W21). | Für den Probebetrieb in Ordnung. **Vor dem echten Betrieb** die Ablage in das OneDrive von praxis@ umziehen (oder in eine SharePoint-Seite der Praxis). Dann ist Lilli Eigentümerin, und es bleibt keine Verbindung zu mondre (E20). Der Umzug ist nur eine Änderung in `config/praxis.json` (`ablage.laufwerk`, Pfade). |
| N24 | **Zahlungsstand aus Lexware** (geprüft 20.10.2026 an developers.lexware.io) | Prompt 10 nennt `voucherStatus=open/overdue` für offene Zahlungen | Lexware meldet den Zahlungsstand am Beleg: `transferred` = Überweisung über das Lexware-Online-Banking beauftragt, `sepadebit` = Lastschrift autorisiert, beide werden zu `paid`, sobald die Bank bucht. `GET /v1/payments/{voucherId}` liefert `openAmount`, `paymentStatus` (balanced, openExpense …), `paidDate` (Tag der letzten Zahlung) und die Zahlungsposten. Das Ereignis `payment.changed` meldet jede Änderung als Webhook. | **Prüfbar.** Zwei Stufen: „Zahlung angestoßen“ (transferred/sepadebit) und „bezahlt“ (paid). Abfrage zuerst alle 15 Minuten über die Belegliste (2 Anfragen/s erlaubt), Webhook `payment.changed` später über Tailscale Funnel. Voraussetzungen: Lexware XL (N12), und jede Rechnung muss ihre Lexware-Beleg-ID in `inbound_document.lexware_voucher_id` tragen (Prompt 5) – ob der Datei-Upload die Beleg-ID direkt liefert, beim Bau prüfen. Nebenbei: `paidDate` ist das Abflussdatum, das bei der Einnahmen-Überschuss-Rechnung über das Jahr entscheidet (N21). |
| N25 | **Patientenbezug: Fehltreffer und eigene Rechnungen** (Analyse 20.10.2026) | Wortliste in Prompt 4 („Verordnung/Rezept/Befund“) | Von 79 als Patientenpost gezählten Rechnungs-Mails waren **69 Kopien von Lillis eigenen Rechnungen aus Lexware** (Absender belege.lexware.de, mit Diagnose, Krankenkasse, Rezept, Verordnung). **4 waren Lieferantenrechnungen**, die fälschlich als Patientenpost galten: 2× Telekom („Verordnung“ im Rechtshinweis), mondre.me und bueroshop24 („zahlbar per Überweisung“). **6** kamen von Freemail-Absendern mit nur „Verordnung“ – unklar. Außerdem kannte die Wortgrenze in JavaScript keine Umlaute: Wörter mit „Ü“ am Anfang wurden nie erkannt. | Behoben: Im PDF-Text genügt ein starkes Wort, schwache Wörter (Rezept, Krankenkasse, Verordnung) zählen erst zu zweit; „Überweisung“ zählt nur im Betreff; Wortgrenzen mit Unicode. Eigene Ausgangsrechnungen (`rechnungen.eigeneAbsender`: belege.lexware.de) überspringt der Rechnungseingang. **Neue Zählung:** 79 Mails mit Eingangsrechnung ohne Patientenbezug (davon sind manche privat), 78 eigene Ausgangsrechnungen. Folge für E17: Lillis Rechnungen an Patienten tragen Diagnosen, also liegen in Lexware Gesundheitsdaten → AVV mit Lexware/Haufe muss § 203 abdecken. |
| N26 | **Zahlungsstand: Lösung 3 und Übergang** (20.10.2026) | Prompt 5 setzt den XL-Tarif voraus | **Lösung 3, vorbereitet:** `npm run zahlungen -- --quelle lexware` liest alle Eingangsbelege mit `paid`, `transferred` oder `sepadebit` aus der Lexware-Belegliste (eine Abfrage, 250 je Seite, 2 Anfragen/s). Zuordnung Mail ↔ Beleg: zuerst `lexware_voucher_id`, sonst die **Rechnungsnummer**, die der Rechnungseingang jetzt aus PDF bzw. Betreff liest (Migration 002, mit Betrag und Rechnungsdatum), bei gleicher Nummer zusätzlich der Betrag. Nicht eindeutig heißt: nichts tun, nur zählen. `paid` → „Rechnung: bezahlt“, Zahlungsdatum aus `/v1/payments`, Mail ins Exchange-Archiv. Vor jedem Lauf prüft `GET /v1/profile` Schlüssel und Tarif. **Übergang bis XL:** (1) *Neue Rechnungen* laufen wie geplant mit „Rechnung: eingegangen“. (2) *In der Zwischenzeit bezahlt:* Lilli setzt „Rechnung: bezahlt“ in Outlook; `npm run zahlungen -- --quelle outlook` verschiebt die Mail ins Archiv und trägt `bezahlt` mit Quelle `manuell` ein. (3) *Altbestand:* `npm run rechnungen:uebernahme -- --von 2025-12-01 --bezahlt-bis <Tag>` legt Rechnungen aus allen Ordnern ab (auch Archiv, Unterordner, auf Wunsch Papierkorb). Was Lilli bis zu dem Tag als bezahlt bestätigt, kommt gleich als „bezahlt“ ins Archiv (Quelle `altbestand`). Unklares und Patientenpost werden dabei nur gezählt. (4) *Beim Start von XL* holt der erste Lexware-Abgleich alle noch offenen Rechnungen nach; was von Hand oder als Altbestand bezahlt ist, bleibt, wie es ist. | Frage an Lilli Nr. 1 (Archiv bezahlt?) und Nr. 5 (wann XL) |
| N27 | **Bereitstellung Bauphase** (20.10.2026) | Prompt 9: Docker Compose hinter Caddy; eigener Tailscale-Knoten | k3s auf `strato-dev` läuft mit **Docker als Laufzeit** (`--docker`), Speicher `local-path`. Namespace `praxis`: PostgreSQL 16 (StatefulSet, 5 GiB) und Praxisdienst (Deployment, 1 GiB für die Microsoft-Anmeldung). Secrets: `praxis-env` (aus `.env`), `praxis-db` (Passwort, einmal erzeugt), `praxis-anmeldung` (nur beim ersten Mal). Der Dienst nutzt das Netz des Servers und hört nur auf 127.0.0.1:3300; **`tailscale serve` des Servers** (bestehendes Tailnet, HTTP auf Port 10000, da dort keine HTTPS-Zertifikate eingeschaltet sind) setzt die Kopfzeile Tailscale-User-Login; erlaubt ist nur `mondre.net@icloud.com`. Von außen nicht erreichbar (geprüft). Wiederholbar mit `deploy/strato-dev.sh`. | **Umhängen später ohne Programmänderung:** im Deployment `hostNetwork` durch einen Tailscale-Sidecar ersetzen (eigener Knoten im Praxis-Tailnet, wie `docker-compose.yml`), `tailscale serve` des Servers entfernen. **Nötig ist der eigene Tailnet erst**, bevor Lilli Zugang bekommt (sie soll nicht in den mondre-Tailnet) und bevor echte Patientendaten in den Tresor kommen. Offen für die Härtung (A25): NetworkPolicy für die Datenbank (der hostNetwork-Pod kommt von der Knotenadresse), Sicherung der Volumes, Bild-Fassungen anpinnen. |
| N28 | **Testumgebung und Produktion** (21.10.2026) | – | Zwei Namespaces auf strato-dev: `praxis` = **Produktion** (echte Daten; heute 16 Lieferantenrechnungen), `praxis-test` = **Testumgebung** (eigene Datenbank, erfundene Patienten, Band „TESTUMGEBUNG“). Beide nutzen das **echte** Postfach praxis@lilli-nebel.de (W58). Dieselbe Fassung erst nach Test, nach Lillis Abnahme unverändert nach Produktion. | Harte Schranken, weil beide am echten Postfach hängen: (1) Test verarbeitet Patientenpost nur von Christians Testadressen (Absender-Allowlist), (2) Test schreibt nur an Testadressen (Empfänger-Allowlist, sonst Abbruch), (3) Test-Termine nur im eigenen Kalender „Praxis-Test“ von praxis@, (4) Rechnungseingang schreibt nur die Produktion – Test zeigt Finanzen höchstens an, (5) Produktion ignoriert Mails von Testadressen, (6) Test-Entwürfe tragen die Kategorie „TEST“. Nie Echtdaten nach Test kopieren. Abnahme je Funktion mit Checkliste, Ergebnis hier mit Datum. |
| N29 | **GebüTh und Preisgrundlagen** (Recherche 23.10.2026) | „GebüTh herunterladen, alle Daten speichern“ | Die **GebüTh ist ein gekauftes Buch** (Buchner & Partner GmbH, Kiel; „GebüTh – Gebührenübersicht für Physiotherapeuten“, 15. Auflage, ISBN 978-3-9828028-0-0, 16,82 € zzgl. MwSt.) – kein PDF, kein Download, keine Schnittstelle; Kopien auf Praxisseiten wären Urheberrechtsverstöße. Sie rechnet „GKV-Preis × Steigerungssatz“ und nennt einen Minutenpreiskorridor. **Öffentlich und maschinell lesbar** sind ihre Grundlagen: (1) **GKV-Vergütungsliste** Physiotherapie, Anlage 2 zum Vertrag nach § 125 SGB V, GKV-Spitzenverband (PDF, 58 Positionen: Pos.-Nr. X…, Leistung, Regelbehandlungszeit, Preis, Zuzahlung; „Lesefassung gültig ab 01.01.2026“), (2) **Beihilfe-Höchstbeträge**, Anlage 9 BBhV, gesetze-im-internet.de (HTML, 132 Einträge mit Unterpunkten; ohne Stand – neue Fassung am Inhalt erkannt). | Entschieden (Christian): Preislisten auf **GKV + Beihilfe**, GebüTh-Empfehlungen von Hand über eine **Vorlage** (Begriff statt „Muster“). Nachts 3 Uhr (CronJob je Umgebung) Prüfung aller drei – GebüTh nur „neue Auflage erschienen“ (Produktseite des Herausgebers). Jede neue Fassung wird mit **Originaldokument** und allen gelesenen Feldern gespeichert („alle Daten“). Faktor = eigener Preis ÷ GKV-Preis; beim Speichern zählt der Preis. Beihilfe-Zuordnung je Position automatisch vorgeschlagen (27 von 58 sicher), sonst von Hand. Hinweis zur Quelle: gesetze-im-internet.de kann der BVA-Fassung nachlaufen. Fundstelle eines Lesefehlers: Hinweiszeilen „X9933 in X9950 umbenannt“ – behoben und getestet. |
| N30 | **Patientenkartei: Datenmodell** (24.10.2026) | Prompt 3: `tenant_id`, pgcrypto, FastAPI; Prompt 11: `service_catalog`, `billing_position`; Prompt 12: `episode` + `episode_phase_log`; Prompt 14: `prescription`, `appointment_prescription` (n:m), `treatment_checkoff`, `invoice_run` | Migration **007** legt alles in deutscher Benennung an (§4b): `patient` + Kontaktwege, Adressen, Bezugspersonen, Versicherung · `behandlungsfall` (= episode) mit Phasenprotokoll · `anamnese`, `befund`, `behandlung` (unveränderlich, neue Fassungen) · `verordnung`, `termin`, `behandlung_leistung` (= checkoff + billing_position in einem) · `patient_erklaerung`, `dokument` (Tresor) · `patient_kontaktverlauf` · `rechnung` + `rechnung_position` (= invoice_run). Verschlüsselung in der **App** (`src/tresor.ts`, AES-256-GCM mit Umschlag), nicht pgcrypto – so sieht auch die Datenbank keinen Klartext und PGlite-Tests laufen ohne Erweiterung. | Abweichungen: kein `tenant_id` (N13); `service_catalog` ersetzt durch die **Preislisten** (W59) – Leistung, Preis und Steuerklasse werden je Sitzung festgehalten; `appointment_prescription` vereinfacht zu `termin.verordnung_id` (eine Sitzung mit zwei Rezepten läuft über zwei Haken in `behandlung_leistung`); `patient.zwischenrechnung_quartale` wie Prompt 14. **Schranke 7** (N28): die Testumgebung spiegelt Kontakte nur in den Ordner „Patienten-Test“ und nur mit Testadressen. Für den Abgleich fehlt noch das Recht **Contacts.ReadWrite** (A19b). |
| N15 | **Vorhandener Strato-Server** | – | `strato-dev` ist der Entwicklungsserver von **mondre**: Docker, k3s, Plesk, Host im mondre-Tailnet | Der Praxis-Container kann dort mit eigenem Tailscale-Knoten im Praxis-Tailnet laufen, unabhängig vom Tailnet des Hosts. Trotzdem teilt er sich dann Rechner, Root-Zugang und Sicherungen mit mondre. Für Gesundheitsdaten (spätestens mit dem Patienten-Tresor, A19) ist ein **eigener Strato-Server für die Praxis** sauberer, Vertragspartner Lilli (E6). |
| N11 | **Tailscale-Anleitung** | Backlog #3 verweist auf `tailscale-graph-cockpit-anleitung.md` | Datei liegt nicht im Projekt | Falls vorhanden, nach `konzept/` legen; sonst gilt der Abschnitt im README. |
| N12 | **Lexware** | API erst ab Tarif XL; Basis `https://api.lexware.io/v1`; 2 Anfragen/s | ungeprüft | Vor A13 gegen developers.lexware.io prüfen (steht so auch in Prompt 5). |
| N13 | **Mehrmandantenfähigkeit** | `tenant_id` in jeder Tabelle, `config/tenants/<tenant>.yaml` (Prompt 0, 3) | eine Praxis | Nicht vorab bauen; Konfiguration nur sauber trennen. Später nachrüsten, falls eine zweite Praxis kommt (E11). |
| N14 | **Prompt 1 und 2** | Bestandsaufnahme graphapi, dann Mandant anbinden | Beides am 20.10.2026 erledigt bzw. durch N1/N2 ersetzt: `scripts/register-app.sh`, `npm run login`, `npm run pruefen` | Nicht noch einmal ausführen. Prompt 2 wird zu A23 (Umstieg app-only). |

---

## 3. Leitplanken

Die sieben Leitplanken der Prompt-Sammlung gelten, mit diesen Anpassungen:

1. **Verantwortliche ist Lilli.** Christian ist Dienstleister: AVV + § 203-Verpflichtung schriftlich. Der Mandant ist zurzeit der von mondre (N1).
2. **Least Privilege.** Heute: delegiert, nur das Praxiskonto (N2). Später: app-only, begrenzt per RBAC und Sites.Selected.
3. **Kein Auto-Versand an Patienten.** Ausgehendes ist ein Entwurf; senden tut Lilli (N3).
4. **Keine Klardaten an KI-Dienste.** Erst regelbasiert. KI nur pseudonymisiert und nur Bedrock Frankfurt oder ein lokales Modell.
5. **PostgreSQL ist die Quelle der Wahrheit.** Exchange, OneDrive und Lexware sind Ablage und Anzeige.
6. **Keine Geheimnisse im Repo.** `.env` und `.data/` bleiben draußen; später Zertifikat und Lexware-Schlüssel in SOPS/age.
7. **Lexware ab Tarif XL** (N12).
8. *(neu)* **Eigener Tailscale-Verbund**, keine Verbindung zu mondre-Projekten (W21). Code aus graphapi wird kopiert, nie eingebunden.
9. *(neu)* **Gesundheitsdaten nie in OneDrive, Kalendertitel, normale Mails oder Logs** – auch nicht in Ausgaben von Befehlen. Ausgaben zeigen Zahlen, Namen nur auf ausdrücklichen Wunsch (`--details`).

---

## 4. Konzepte (Kurzfassung)

Ausführlich in den PDFs und Prompts; hier nur das Gerüst.

- **Digitale Poststelle** (W11, Prompt 11): Kanäle Mail, WhatsApp, Website-Formular, Foto/Scan, Telefon-Notiz, Bank → einsammeln → erkennen → zuordnen → ablegen. Unsicheres landet im Fach „Bitte anschauen“; das System rät nicht.
- **Drei Ablagen** (W6, W11): *Patienten-Tresor* (Gesundheitsdaten, verschlüsselt, eigener Server), *Büro-Ordner* (OneDrive, nur Kaufmännisches), *Praxis-Kartei* (PostgreSQL: Patient, Termine, Phase, Beträge, Protokoll). Was darf wohin: Tabelle im Anhang der Prompt-Sammlung.
- **Eingangsrechnungen** (W3, Prompt 4–5): Mail → Erkennen (Regeln) → OneDrive `/Praxis-Automation/Buchhaltung/Eingang/JJJJ/MM` → Freigabe durch Lilli → Beleg in Lexware.
- **Ausgangsrechnungen** (W12, Prompt 11, 14): Behandlung „erledigt“ → Rechnungsposition → Entwurf in Lexware, Heilbehandlung (steuerfrei) und Wellness (19 %) nie gemischt → Freigabe → Versand über Lexware → Zahlungsabgleich.
- **Termine** (W4, Prompt 6–7): Anfrage erkennen → 3 freie Zeiten aus dem Kalender → vorläufig reservieren (Titel ohne Namen) → Antwort als Entwurf. WhatsApp erst nach einer Datenschutz-Entscheidung (E8).
- **Patientenweg** (W13–W15, Prompt 12): 8 Phasen *Anfrage → Aufnahme → Anamnese → Befund & Start → Behandlung → Abschluss → Rechnung → Nachsorge*. Bestandspatient: Kurzcheck statt Aufnahme. Wellness: Anamnese und Abschluss entfallen. Alternativen für Anmeldung, Anamnese und Abrechnung.
- **Rezept = Stempelkarte** (W18–W20, Prompt 14): Termine dem Rezept zuordnen, je Sitzung und Rezept abhaken, Abschlussrechnung am Ende, Zwischenrechnung nach pro Patient einstellbaren Quartalen, Abbruch mit sofortiger Abschlussrechnung. Absage nur ohne Rezept, jeweils bis 24 h vorher.
- **Cockpit** (W5, W10, Prompt 8, 10, 12): eine Seite für Desktop und Handy – Termine, Posteingang Rechnungen, offene Zahlungen, Systemstatus, Pinnwand nach Phasen. Diskret-Modus nur mit Initialen.
- **Schnellaktionen** (W17, Prompt 13): Vorlage wählen → Entwurf im Praxispostfach → in Outlook bzw. Apple Mail nur noch senden. Ersatzweise `mailto:`.
- **Zugang** (W21, W22): eigener Tailscale-Verbund. Lilli und Christian melden sich im Tailnet an; der Dienst lässt nur freigegebene Konten herein.

---

## 4a. Ablage von Patientendaten – Prüfung Strato HiDrive (W27)

Stand 20.10.2026, Arbeitsgrundlage, keine Rechtsberatung.

**Was ein Patienten-Tresor braucht:** Speicherort in Deutschland, AVV mit Verschwiegenheit nach
§ 203 StGB, nachweisbare Sicherheit (ISO 27001), Verschlüsselung, bei der der Anbieter nichts lesen
kann, Schutz vor Löschen und Verschlüsselungstrojanern, Aufbewahrung über 10 Jahre und ein
Protokoll, wer was geöffnet hat.

| Anforderung | HiDrive-Objektspeicher (S3) | HiDrive (klassisch) |
|---|---|---|
| Standort | ✅ zwei Rechenzentren in Deutschland | ✅ Deutschland |
| ISO 27001 | ✅ TÜV Nord, Trusted Cloud | ✅ |
| AVV mit § 203 StGB | ✅ Strato-AVV Nr. 5.4 nennt § 203 StGB. ⚠ Anlage 1 nennt „HiDrive Cloud Speicher“, den Objektspeicher nicht ausdrücklich → E15 | ✅ in Anlage 1 |
| Verschlüsselung | ⚠ nicht dokumentiert → **die App verschlüsselt selbst** | ✅ optionale Ende-zu-Ende-Verschlüsselung, aber nur über die HiDrive-Software und die Apps – nicht für einen Serverdienst |
| Versionierung / Object Lock | ⚠ nicht dokumentiert → Schutz über eigene Sicherung (restic) | Snapshots je nach Tarif |
| Programmierschnittstelle | ✅ S3-kompatibel | eigene API |
| Kosten | 0,018 €/GB im Monat, Abruf 0,05 €/GB (50 GB ≈ 0,90 € im Monat) | Pakete |

**Ergebnis:**

1. **Der HiDrive-Objektspeicher reicht als Ablage**, aber nur als „Tresor ohne Schlüssel“. Die App
   verschlüsselt jede Datei auf dem Server, bevor sie hochgeladen wird: AES-256-GCM, je Datei ein
   eigener Schlüssel, eingepackt mit einem Hauptschlüssel. Bei Strato liegen damit nur unlesbare
   Daten. Für § 203 ist das der entscheidende Punkt, denn wer nichts lesen kann, dem wird nichts
   offenbart.
2. **Die Schwachstelle ist nicht der Speicher, sondern der Rechner, der entschlüsselt.** Das ist
   heute `strato-dev`: geteilt mit mondre, mit Plesk und Virtualisierung durch
   Unterauftragsverarbeiter in der Schweiz. Der Hauptschlüssel gehört deshalb nie in den
   Objektspeicher. Er liegt als Secret im Namespace `praxis`, und eine Notfallkopie bewahrt Lilli
   offline auf. Ist der Schlüssel weg, sind die Daten weg. Vor echten Patientendaten noch einmal
   prüfen, ob ein eigener Server nötig ist (N15, A25).
3. **Klassisches HiDrive** mit Ende-zu-Ende-Verschlüsselung eignet sich für Lillis eigene,
   händische Ablage, nicht als Speicher hinter dem System.
4. ~~Eine Fachsoftware für Physiopraxen~~ – entschieden: nein, wir bauen selbst (W28, E14).
5. **OneDrive bleibt für Gesundheitsdaten tabu** (Leitplanke 9). Das gilt auch, weil dort schon
   152 GB Unbekanntes liegen (N5).

**Optionen ohne HiDrive (W30, Stand 20.10.2026):**

| | OneDrive | Strato-Server: PostgreSQL | Strato-Server: Dateien auf Platte | HiDrive-Objektspeicher |
|---|---|---|---|---|
| Vorhanden | ✅ | ✅ (wird für den Rechnungseingang ohnehin gebraucht) | ✅ | ❌ müsste gebucht werden |
| Gesundheitsdaten erlaubt | ❌ Leitplanke 9 – US-Anbieter, § 203 nur mit Zusatzvereinbarung, gemischt mit 152 GB Unbekanntem | ✅ mit App-Verschlüsselung | ✅ mit App-Verschlüsselung | ✅ mit App-Verschlüsselung |
| Texte (Anamnese, Befund, Notizen) | – | ✅ als verschlüsselte Spalten | umständlich | umständlich |
| Dateien (Rezeptfoto, Befund-PDF) | – | ✅ als verschlüsselte `bytea`, gut bis einige GB | ✅ | ✅ beliebig groß |
| Protokoll, wer was öffnet | eigenes | ✅ in derselben Datenbank, eine Transaktion | getrennt | getrennt |
| Sicherung | – | ein `pg_dump` (verschlüsselt per restic) | zusätzlich | Versionierung fehlt |

**Empfehlung:** Alles in **PostgreSQL auf dem Strato-Server** (N19). Texte und Dateien verschlüsselt
die App, bevor sie in der Datenbank landen. Damit reicht ein gestohlenes Backup oder ein Blick in die
Datenbank nicht, um etwas zu lesen. Der Schlüssel liegt als Kubernetes-Secret im Namespace `praxis`,
eine Notfallkopie bewahrt Lilli offline auf. Wächst der Bestand über einige GB, ziehen die Dateien
in einen Objektspeicher um. Die Tabelle merkt sich dann nur noch, wo die Datei liegt. Was noch
fehlt, ist eine Sicherung außerhalb des Servers: dafür kommt später ein HiDrive-Objektspeicher oder
ein zweiter Standort in Frage (E16).

**Aufbau, wenn wir selbst bauen:** Kartei in PostgreSQL (Felder mit Gesundheitsbezug zusätzlich
mit pgcrypto) · Dateien verschlüsselt im Bucket `praxis-tresor` (HiDrive-Objektspeicher) · Sicherung
der Datenbank und Schlüsselverzeichnis per restic in einen zweiten Bucket · jeder Zugriff in
`audit_event`.

Quellen: [HiDrive Objektspeicher](https://www.strato.de/cloud-speicher/hidrive-s3/) ·
[STRATO Blog HiDrive S3](https://www.strato.de/blog/hidrive-s3/) ·
[STRATO AVV](https://www.strato.de/agb/avv/) ·
[HiDrive Ende-zu-Ende-Verschlüsselung](https://www.strato.de/faq/cloud-speicher/ende-zu-ende-verschluesselung-hidrive/) ·
[Trusted Cloud: HiDrive](https://www.trusted-cloud.de/cloudservices/2640/) ·
[§ 203 StGB und Cloud](https://www.boddenberg.de/schweigepflicht-cloud-krankenhaus/) ·
[gesundheitsdatenschutz.org: § 203 StGB](https://www.gesundheitsdatenschutz.org/download/201901_14_Paragraph-203-StGB.pdf)

---

## 4b. Patientenkartei – Datenmodell (W63–W68, Migration 007)

Stand 24.10.2026, Arbeitsgrundlage, keine Rechtsberatung. Prüfung von Christians Vorschlag
(Stammdaten-Tabelle und § 630f-Herleitung vom 24.10.2026) – **der Vorschlag ist tragfähig**; unten steht,
was übernommen, was anders gelöst und was ergänzt wurde.

**Gesetzliche Grundlage (selbst ergänzt, W68):**

| Norm | Was daraus folgt | Wo im Modell |
|---|---|---|
| § 630f Abs. 1 BGB – Dokumentation zeitnah; Änderungen nur so, dass der ursprüngliche Inhalt und der Zeitpunkt erkennbar bleiben | Dokumentation ist **unveränderlich**: Inhalte werden nie geändert oder gelöscht, sondern durch eine neue Fassung ersetzt (`vorgaenger_id`, `ersetzt_am`); ein Trigger erzwingt das | `anamnese`, `befund`, `behandlung` |
| § 630f Abs. 2 – Anamnese, Diagnosen, Untersuchungen, Befunde, Therapien und Wirkungen, Eingriffe, Einwilligungen, Aufklärungen; Arztbriefe | je ein Bereich, ärztliche Diagnose und eigener Befund getrennt | `behandlungsfall`, `anamnese`, `befund`, `behandlung`, `patient_erklaerung`, `dokument` |
| § 630f Abs. 3 – zehn Jahre aufbewahren | kein DELETE: Patienten mit Akte werden archiviert, Dokumente nur „ungültig“ mit Grund; `aufbewahren_bis` je Fall | Trigger `patient_nicht_loeschen`, `nur_markieren` |
| § 630c Abs. 3 – wirtschaftliche Information in Textform, wenn die Kostenübernahme nicht gesichert ist | eigene Erklärung „Kosteninformation“ mit Datum, Fassung und Dokument | `patient_erklaerung.art = kosteninformation` |
| § 630d/§ 630e – Einwilligung nach Aufklärung | Aufklärung und Einwilligung getrennt, je Fall, mit Form (mündlich/schriftlich …) | `patient_erklaerung` |
| § 630g – Einsicht in die Akte | alles lesbar exportierbar (später: Export je Patient) | – (A19d) |
| § 14 Abs. 4 UStG, § 33/§ 34a UStDV – Rechnungsangaben; § 4 Nr. 14 UStG – steuerfreie Heilbehandlung | vollständige, personenbezogene Rechnungen als Normalfall; Steuerklasse je Fall, nie gemischt | `rechnung`, `behandlungsfall.steuerklasse`, `behandlung_leistung.steuerklasse` |
| Art. 9 DSGVO, § 22 BDSG – Gesundheitsdaten; DSK: keine erzwungene Unterschrift unter die Datenschutzinformation | Verarbeitung aus dem Behandlungsvertrag, keine Pauschal-Einwilligung; Aushändigung der Information nur **vermerken**; freiwillige Einwilligungen (Mail, WhatsApp, Erinnerung, Foto) einzeln mit Widerruf | `patient_erklaerung.art = datenschutzinformation`, `einwilligung_*` |
| § 203 StGB, §4a | Gesundheitsdaten verschlüsselt die App vor dem Speichern | `src/tresor.ts`, alle `bytea`-Spalten |
| BVerwG 3 C 19.08 – sektorale Heilpraktikererlaubnis Physiotherapie | „Selbstzahler“ sagt nichts über die Grundlage: je Fall `grundlage` = verordnung · direktzugang · praevention | `behandlungsfall.grundlage` (E26) |

**Stammdaten – Christians Tabelle, Bewertung:**

| Feld aus dem Vorschlag | Übernommen? | Lösung |
|---|---|---|
| Patienten-ID | ✅ | `patientennummer` „P-1001“ fortlaufend, nie wiederverwendet; beim Import aus Lexware vorgebbar |
| Vor-/Nachname, Geburtsdatum | ✅ | Klartext (gesucht, sortiert, abgeglichen) – E24; zusätzlich `geburtsname` |
| Adresse mit Land | ✅ erweitert | **mehrere Adressen** als Kacheln, genau eine `rechnungsadresse` (W66) |
| Telefon, E-Mail | ✅ erweitert | `patient_kontakt`: mobil · telefon · whatsapp · email · sonstige, je Art ein `primaer`; `normiert` (E.164 bzw. klein) für `tel:`/`wa.me`-Links und die Wiedererkennung in der Poststelle |
| Anrede, Titel | ✅ | `anrede`, `titel`; dazu `ansprache_hinweis` für Gendern auf Wunsch (W65) |
| Geschlecht im Stammdatensatz | ❌ bewusst nicht | wie im Vorschlag: gehört, wenn fachlich nötig, in die Anamnese |
| Abweichender Vertragspartner / Rechnungsempfänger, Vertretung mit Berechtigungsgrund, Notfallkontakt | ✅ | `patient_bezugsperson` mit `rolle`; je Patient höchstens ein Vertragspartner und ein Rechnungsempfänger; Vertretung braucht `berechtigungsgrund` |
| Hausarzt / behandelnde Ärzte | ✅ anders | eigene Tabelle `arzt` (mit LANR), `patient.hausarzt_id`, `verordnung.arzt_id` – Ärzte wiederholen sich |
| Beruf / Belastung | ✅ | `beruf_belastung` verschlüsselt (fachlich relevant → Gesundheitsbezug) |
| Sprache / Unterstützungsbedarf | ✅ | `sprache`, `kommunikationshilfe` |
| Versicherung, Tarif, Selbstbehalt, Erstattungssatz, Beihilfe | ✅ optional | `patient_versicherung` (0..n): pkv · beihilfe · gkv · sonstige – Beihilfe und PKV sind oft **beides** |

**Ergänzt (fehlte im Vorschlag):** Besonderheiten für die Kachel (W65) · `patient_seit` (W64) · Abrechnungsmodus und
Zwischenrechnungs-Quartale je Patient (Prompt 12/14) · Exchange- und Lexware-Verweise für den Hybrid (W63) ·
`status` aktiv/inaktiv/archiviert · **Kontaktverlauf** mit Gesprächsgründen (W67) · **Termine** mit Rezeptbezug und
Exchange-Spiegel · **Ausgangsrechnungen** mit Fälligkeit, Erinnerung, Mahnung (für gelb/rot, W64) ·
Phasenprotokoll des Patientenwegs (Prompt 12).

**Behandlungsdokumentation – Christians Herleitung, Bewertung:** alle zwölf Bereiche sind abgebildet.
Anders gelöst: *Diagnose/ICD* liegt am **Fall** (ärztlich mitgeteilt) und an der **Verordnung** (wie auf dem
Rezept), nicht an jeder Sitzung; *Therapieziele/Plan* am Fall; *Untersuchungen/Befunde* als eigene Tabelle mit
**Messwerten als verschlüsseltes JSON nach ICF-Gliederung** (Körperfunktion, Aktivität, Teilhabe, Umwelt);
*durchgeführte Behandlung* in zwei Teilen – Text (`massnahmen`) und **abrechenbare Leistungen** mit Preis aus
der Preisliste zum Behandlungstag (`behandlung_leistung`; mit `verordnung_id` ist das zugleich der Haken auf
der Rezept-Stempelkarte). Die technischen Felder (Autor, Zeitpunkt, Änderungen mit Ursprung) sind drin.

**Verschlüsselt (bytea, `src/tresor.ts`):** Anlass, Bezeichnung, Diagnosen, ICD, Ziele, Plan, Abschlussbefund,
Anamnese, Befunde, Maßnahmen, Verlauf, Reaktionen, Übungen, Notizen, Besonderheiten, Ansprache, Beruf,
Erklärungsinhalte, Dokumente samt Titel und Dateiname. **Klartext:** Identität, Kontaktwege, Adressen,
Bezugspersonen, Versicherung, Termine (Zeit), Rechnungen (Beträge, Status), Leistungsnummern/-bezeichnungen.

**Tresor:** AES-256-GCM, je Wert ein eigener Datenschlüssel, eingepackt mit dem Hauptschlüssel
`PRAXIS_TRESOR_SCHLUESSEL` (Secret `praxis-tresor`, je Umgebung eigener, wird von `deploy/strato-dev.sh`
einmalig erzeugt). Der Spaltenname ist Teil der Prüfung – ein Wert lässt sich nicht in eine andere Spalte
schieben. Schlüsselwechsel: neue Nummer, alte Schlüssel bleiben zum Lesen hinterlegt. **Notfallkopie offline
bei Lilli** – ohne Schlüssel sind die Akten weg (E26).

**Hybrid mit Exchange (W63, A19b):** Die Datenbank ist Master. Je Patient ein Kontakt im Ordner „Patienten“
(Test: „Patienten-Test“, Schranke 7) mit Name, Telefon, Mobil, WhatsApp-Nummer, Mail, Rechnungsadresse und
Patientennummer – **nichts** mit Gesundheitsbezug. Änderungen am Handy (neue Nummer) fließen beim nächsten
Abgleich zurück (`exchange_abgleich_hash` erkennt, wer sich geändert hat; bei beidseitiger Änderung gewinnt
die Datenbank, der Konflikt wird protokolliert). Braucht das Recht Contacts.ReadWrite.

**Kachel (W64) – woher die Werte kommen:** Name, Ansprache, Besonderheiten → `patient`; Telefon/WhatsApp/Mail →
`patient_kontakt` (primär); Patient seit → `patient_seit`; letzte Behandlung → `behandlung` (neueste, nicht
ersetzt); nächster Termin → `termin` (Status bestätigt, `verordnung_id` gesetzt = Rezept); Farbe → `rechnung`
mit Status gesendet und `faellig_am` < heute (gelb bis Frist, rot darüber oder nach Mahnung, E25); „+“ legt
Verordnung, Behandlung, Rechnung oder Termin an.

**Noch nicht gebaut:** Oberfläche (A19c), Exchange-Abgleich (A19b), Export nach § 630g (A19d), Löschlauf
nach Ablauf der Aufbewahrung (A19e), Protokoll „wer hat welche Akte geöffnet“ in `audit_event` (gehört in
A19c).

---

## 5. Aufgaben (A) – Schritt für Schritt

Status: ✅ erledigt · ▶ als Nächstes · ⏳ wartet (auf Entscheidung oder Vorleistung) · ○ später

### Phase 0 – Grundlagen

| # | Aufgabe | Bezug | Status |
|---|---|---|---|
| A01 | Graph-Verbindung für praxis@lilli-nebel.de (App `praxis-graphapi`, delegiert, `login`, `pruefen`) | W2, N2 | ✅ 20.10.2026 |
| A02 | Funktionen angelegt, nur als Probelauf: `anhaenge`, `termin`, `senden` | – | ✅ angelegt, nie ausgeführt |
| A03 | Container + eigener Tailscale-Knoten + Statusseite | W21 | ✅ angelegt, nicht gestartet |
| A04 | Konzeptdateien nach `konzept/`, diese requirements.md | W23 | ✅ |
| A05 | Entscheidungen E1–E6 klären (Christian, teils mit Lilli) | §6 | ▶ |
| A06 | Rechnungseingang nach Prompt 4 (`npm run rechnungen`): nur PDFs, Regeln statt KI, Patientenpost nur markieren, Dubletten, Delta-Abfrage, Datenbank + Protokoll | N4, N18, W31 | ✅ gebaut 20.10.2026, nur getestet (Attrappe), nie gegen das Postfach gelaufen |
| A07 | `senden` → `entwurf` (Entwurf im Postfach statt Versand) | N3 | ✅ 20.10.2026 |
| A08 | Praxisablage gefunden, Zielordner festgelegt: Probeläufe nach `07 Technik/_TEST …/{JJJJ}/Eingangsrechnungen`, echter Betrieb nach `01 Finanzen/{JJJJ}/Eingangsrechnungen` | N23, W33, W34 | ✅ 20.10.2026 |
| A08a | Kategorien anlegen (`npm run kategorien`), Finanzjahr 2026 (`npm run finanzjahr`), Testordner (`npm run testordner`) | W33–W35 | ✅ 20.10.2026 |
| A08b | Hilfeseite mit Rechtsklick-Erklärungen; jede neue Schaltfläche bekommt eine Erklärung (Test erzwingt das) | W37 | ✅ 20.10.2026 |
| A06a | Erster Probelauf von `npm run rechnungen` gegen das echte Postfach (zeigt nur Zahlen) und Lieferantenliste mit Lilli füllen | W31 | ▶ Christian startet ihn |
| A09 | Praxis-Tailnet anlegen (Lillis Apple-ID) – bis dahin mondre-Tailnet | W21, W49, N8 | ⏳ mit Lilli, Checkliste §5a |
| A09a | k3s-Manifeste: Namespace `praxis`, PostgreSQL, Dienst, Secrets; Bereitstellung `deploy/strato-dev.sh` | W24, W25, W46, N27 | ✅ 20.10.2026 (Bauphase über tailscale serve des Servers) |
| A09b | Umhängen auf den eigenen Praxis-Tailnet (Sidecar statt hostNetwork), Lilli einladen | W22, W47, N27 | ⏳ A09 (Tailnet anlegen) |
| A09c | Cockpit 0.2.0 und Rechnungs-Dashboard; Sichtprüfung mit dem Prüfbrowser (WebKit, 393/1440 px) | W45, W48 | ✅ 20.10.2026 |
| A09d | Testumgebung `praxis-test` (eigene Datenbank, Port 3301 / Tailscale :10001), `deploy/strato-dev.sh prod\|test`, Band „TESTUMGEBUNG“, sechs Schranken in `src/umgebung.ts` mit Tests | W56–W58, N28 | ✅ 21.10.2026 (0.5.0) |
| A09e | Testdaten-Generator: erfundene Patienten mit Adresse shopping@2late.de (Plus-Varianten möglich) | W56, E23 | ▶ nächster Schritt |
| A10 | CLAUDE.md für das Repo (Prompt 0, angepasst an N6, N7, N13) | Prompt 0 | ▶ |

### Phase 1 – Büro & Rechnungen

| # | Aufgabe | Bezug | Status |
|---|---|---|---|
| A11 | Datenmodell + PostgreSQL: `inbound_document`, `audit_event` (unveränderlich), `sync_state` ✅ (Migration 001); `appointment_request` kommt mit A15 | Prompt 3 | ✅ Teil 1 |
| A11a | PostgreSQL im Namespace `praxis` auf `strato-dev` (k3s) | A09a | ✅ 20.10.2026, Migrationen 001+002 beim Start |
| A12 | Eingangsrechnungen im Betrieb: Zielordner festlegen, Zeitplaner (k3s-CronJob), Outlook-Regel für den Ordner „Rechnungen“ | W3, Prompt 4 | ○ nach A06a, A08, A11a |
| A13 | Lexware: Tarif XL, technischer Benutzer, API-Schlüssel (Lilli) | W9, Prompt 5, N12 | ⏳ Lilli |
| A14 | Freigabe (Freigeben/Ablehnen/Später, Korrektur, privat) im Rechnungs-Dashboard | W3, W50, Prompt 15 | ✅ 0.3.0 |
| A14d | Beleg-Upload nach Lexware bei „Freigeben“ | Prompt 5 | ⏳ A13 (Tarif XL) |
| A14e | Outlook-Kategorien „Rechnung: abgelehnt“ und „Rechnung: privat“ anlegen (`npm run kategorien -- --ausfuehren`) | W50 | ⏳ wartet auf Christians Go (W51) |
| A14a | Zahlungsstand: Lexware-Abgleich (Lösung 3) und Übergang über Outlook, bezahlt → Exchange-Archiv; Kopfdaten (Rechnungsnummer, Betrag, Datum) beim Eingang | W38, W40–W42, N24, N26 | ✅ gebaut 20.10.2026, getestet (Attrappen), nie gegen Postfach oder Lexware gelaufen |
| A14b | Lexware-Abgleich im Betrieb: Schlüssel eintragen, Zeitplaner alle 15 Min., später Webhook `payment.changed` über Tailscale Funnel | N26 | ⏳ A13 (Tarif XL) |
| A14c | Übernahme des Altbestands mit Lilli: Stichtag „bezahlt bis“ klären, dann `rechnungen:uebernahme` | N26, W42 | ⏳ Fragen an Lilli Nr. 1, Lieferantenliste (Nr. 2) |

### Phase 2 – Termine

| # | Aufgabe | Bezug | Status |
|---|---|---|---|
| A15 | Terminanfragen per Mail: erkennen, freie Zeiten, Reservierung, Antwort-Entwurf | W4, Prompt 6 | ○ |
| A16 | WhatsApp: zuerst nur die Entscheidungsvorlage | W4, Prompt 7 | ○ E8 |

### Phase 3 – Übersicht

| # | Aufgabe | Bezug | Status |
|---|---|---|---|
| A17 | Tagesübersicht (geht im Cockpit auf) | W5, Prompt 8 | ○ |
| A18 | Cockpit für Desktop und Handy: Termine, Posteingang, offene Zahlungen, Status | W10, Prompt 10 | ○ |

### Phase 4 – Patienten

| # | Aufgabe | Bezug | Status |
|---|---|---|---|
| A19 | Poststelle, Patienten-Tresor (App-Verschlüsselung + HiDrive-Objektspeicher, §4a), Ausgangsrechnungen als Lexware-Entwurf | W11, W12, W27, Prompt 11 | ○ E9, E14, E15 |
| A19a | Patientenkartei: Datenmodell (Migration 007), Tresor-Verschlüsselung, Unveränderlichkeit der Dokumentation, Tests | W63–W68, §4b | ✅ 24.10.2026 (0.8.0) |
| A19b | Hybrid mit Exchange-Kontakten: Ordner „Patienten“/„Patienten-Test“, Abgleich in beide Richtungen, Recht Contacts.ReadWrite | W63, N30 | ○ nach A19c |
| A19c | Patientenseiten: Liste, Kachel (W64), Stammdaten mit Adress-Kacheln (W66), Kontaktverlauf mit Anruf und Gesprächsgrund (W67), Akte lesen (Protokoll in `audit_event`), „+“-Aktionen; Hilfe und Rechtsklick-Erklärungen | W64–W67 | ▶ nächster Schritt, zusammen mit A09e (Testdaten) |
| A19d | Einsicht/Export der Akte nach § 630g (PDF je Patient) | W68 | ○ |
| A19e | Löschlauf nach Ablauf der Aufbewahrung (zehn Jahre nach Abschluss, nur mit Bestätigung) | W68 | ○ |
| A20 | Patientenweg mit Phasen + Pinnwand | W13–W15, Prompt 12 | ○ |
| A21 | Schnellaktionen: Mail-Entwürfe aus der Pinnwand | W17, Prompt 13 | ○ |
| A22 | Rezepte, Terminregeln, Zwischen- und Abschlussrechnungen | W18–W20, Prompt 14 | ○ E7, E10 |

### Querschnitt

| # | Aufgabe | Bezug | Status |
|---|---|---|---|
| A23 | Umstieg auf app-only + Zertifikat + RBAC for Applications + Sites.Selected | N2, Prompt 2 | ○ vor Dauerbetrieb der Worker |
| A24 | Datenschutz-Doku früh: AVV-Checkliste, Verarbeitungsverzeichnis, TOM (wegen N1 vorgezogen) | W6, Prompt 9 | ▶ parallel |
| A25 | Betrieb: Härtung, Backups (restic), Rotation, Monitoring | Prompt 9 | ○ |

---

## 5a. Umzugs-Checkliste: vom mondre-Tailnet in Lillis Tailnet

Bis dahin gilt: Lilli bekommt **keinen** Zugang zum mondre-Tailnet, und echte Patientendaten kommen
nicht in den Tresor (N16, N27).

1. Lilli legt mit ihrer Apple-ID den Tailnet an (login.tailscale.com, „E-Mail teilen“, nicht verbergen).
2. In der Admin-Konsole: MagicDNS und HTTPS-Zertifikate einschalten; Christian (mondre.net@icloud.com) als Admin einladen.
3. Zugriffsregeln: `tag:praxis-dienst` mit Owner `autogroup:admin`; Grant `autogroup:member` → `tag:praxis-dienst:443`.
4. Auth-Key (Tag `tag:praxis-dienst`, nicht wiederverwendbar) als `TS_AUTHKEY` in `.env`; `ERLAUBTE_NUTZER` = Lillis und Christians Tailnet-Konten.
5. Deployment umbauen: `hostNetwork` raus, Tailscale-Sidecar rein (Kernel-Modus, `tailscale/serve.json`), Zustand in eigenem Volume; `deploy/strato-dev.sh` ausführen.
6. Prüfen: `https://praxis.<tailnet>.ts.net` für Lilli (iPhone, Mac) und Christian; Prüfbrowser.
7. **Im mondre-Tailnet löschen:** `tailscale serve --http=10000 off` auf strato-dev; `mondre.net@icloud.com` aus `ERLAUBTE_NUTZER` nur entfernen, wenn Christian über den Praxis-Tailnet zugreift; README/requirements anpassen.
8. Danach erst: Lilli einladen, Härtung (A25), Tresor mit echten Daten.

## 6. Offene Entscheidungen (E)

| # | Frage | Wer | Empfehlung |
|---|---|---|---|
| E1 | Im mondre-Mandanten bleiben oder eigener M365-Mandant für die Praxis? | Christian + Lilli | vorerst bleiben, mit AVV (N1) |
| E2 | Wann von delegiert auf app-only + Zertifikat umsteigen? | Christian | vor dem Dauerbetrieb der Worker (N2) |
| E3 | Technik: TypeScript (wie graphapi) oder Python (wie Prompts)? | Christian | ✅ entschieden 20.10.2026: TypeScript |
| E4 | Mit welcher Anmeldung wird das Praxis-Tailnet angelegt? | Christian + Lilli | ✅ entschieden 21.10.2026: vorerst mondre-Tailnet; später Lillis **eigene Apple-ID** (echte E-Mail freigeben, nicht „verbergen“), Christian als Admin eingeladen. Korrektur zu N8: Tailscale trennt nach Identität bzw. Domain – nur Christians Apple-ID führte zurück in den mondre-Tailnet. Tarif für die Praxis prüfen (Business statt Personal) |
| E5 | Eigenes Konto für Lilli oder alles über praxis@lilli-nebel.de? | Christian + Lilli | offen (N9). Empfehlung: bei praxis@lilli-nebel.de bleiben, solange Lilli allein arbeitet. Ein eigenes Konto erst, wenn Mitarbeitende dazukommen oder die Microsoft-Protokolle Lilli und das System unterscheiden sollen – Letzteres löst auch der Umstieg auf app-only (A23). |
| E6 | Welcher Strato-Server? | Christian | ✅ entschieden 20.10.2026 und endgültig 21.10.2026 (W57): `strato-dev` auch für die Produktion mit Patientendaten. Ausgleich: eigener Namespace, Verschlüsselung durch die App, Schlüssel als Secret + Notfallkopie bei Lilli, nur Tailscale, eigene Sicherung; die gemeinsame Nutzung mit mondre steht in den TOM (A24). |
| E23 | Christians Testadresse(n) für erfundene Patienten | Christian | ✅ 21.10.2026: shopping@2late.de für alle Testpatienten (in `.env`/Secret, nicht im Repository). Entwürfe in Outlook, Ergebnis aus „Gesendete Elemente“ |
| E12 | Docker Compose oder Kubernetes (k3s)? | Christian | ✅ entschieden 20.10.2026: **k3s**. Die Compose-Datei bleibt für lokale Tests. |
| E14 | Patientenakte selbst bauen oder eine Fachsoftware nutzen? | Christian | ✅ entschieden 20.10.2026: selbst bauen (W28) |
| E16 | Patientendaten: PostgreSQL auf dem Strato-Server mit App-Verschlüsselung (Empfehlung) – und wohin geht die Sicherung außerhalb des Servers? | Christian | Datenbank: empfohlen (N19). Sicherung: vor dem Tresor (A19) entscheiden – HiDrive-Objektspeicher oder anderer Standort |
| E17 | Was muss auf einer Rechnung an Privatpatienten stehen, damit PKV und Beihilfe erstatten (Diagnose? Verordnungsdatum? Arzt?) | Lilli + Steuerberatung | teils beantwortet (N25): Lillis heutige Rechnungen aus Lexware tragen Diagnose, Krankenkasse, Rezept/Verordnung. Offen: ist das nötig, und deckt der Lexware-AVV § 203 ab? |
| E15 | Bei Strato schriftlich bestätigen lassen: der HiDrive-Objektspeicher fällt unter die AVV samt § 203-Klausel (Nr. 5.4), welche Unterauftragsverarbeiter beteiligt sind, ob Versionierung oder Object Lock gehen | Christian | vor der ersten echten Patientendatei |
| E18 | Outlook-Kategorien: legt das System sie an? | Christian | ✅ entschieden 20.10.2026: ja. Dafür neu erteilt: MailboxSettings.ReadWrite, dazu Sites.Read.All und Files.ReadWrite.All für die geteilte Ablage – alles delegiert, nur im Namen von praxis@ |
| E19 | Wo liegt die Ablage mit „01 Finanzen“ und „07 Technik“? | Christian | ✅ geklärt: OneDrive von hartmann@mondre.net, geteilt (N23) |
| E20 | Praxisablage aus Christians OneDrive in das OneDrive von praxis@ (oder eine SharePoint-Seite der Praxis) umziehen? | Christian + Lilli | empfohlen vor dem echten Betrieb (N23) |
| E21 | „01 Finanzen/<Jahr>“ hat „Rechnungen Business“ (aus der Vorlage) **und** jetzt „Eingangsrechnungen“; daneben gibt es „01 Finanzen/01 Rechnungseingang“. Was liegt wo? | Lilli | offen. Vorschlag: „Eingangsrechnungen“ = was der Rechnungseingang ablegt; „Rechnungen Business“ = was Lilli von Hand ablegt, oder abschaffen |
| E22 | Zahlung: zwei Kategorien („Zahlung angestoßen“ und „bezahlt“) oder nur eine („bezahlt“, schon beim Anstoßen)? | Christian + Lilli | zwei – eine angestoßene Zahlung kann noch scheitern (Deckung, Rücklastschrift) (N24) |
| E13 | Für die Bauphase ein eigenes Test-Postfach (z. B. test@lilli-nebel.de) statt des echten? | Christian | empfohlen, wenn die Lizenz verfügbar ist (N16) |
| E7 | Was gilt bei Absage oder Verschiebung unter 24 h (Ausfallgebühr)? | Lilli | offen, im Code als Schalter, Standard „manuell“ |
| E8 | WhatsApp: Business-App von Hand, Cloud API oder Alternative? | Lilli + Datenschutzberatung | Entscheidungsvorlage abwarten (Prompt 7) |
| E9 | Leistungskatalog und Steuerklassen (Heilbehandlung / Wellness) | Lilli + Steuerberatung | – |
| E10 | Standard für Zwischenrechnungen: nach wie vielen Quartalen? | Lilli | offen (pro Patient überschreibbar) |
| E11 | Mehrmandantenfähigkeit vorab einbauen? | Christian | nein (N13) |
| E24 | Identität und Kontaktwege (Name, Geburtsdatum, Adresse, Telefon, Mail) im Klartext in der Datenbank – oder auch verschlüsselt mit Blindindex? | Christian | Empfehlung: **Klartext** – nötig für Suche, Sortierung, Abgleich mit Exchange/Lexware; alles mit Gesundheitsbezug ist verschlüsselt. Der Schutz der Identität kommt aus Zugang (nur Tailnet), Datenbankpasswort und verschlüsselter Sicherung (A25). Vor echten Daten bestätigen |
| E25 | Fristen für die Kachelfarbe: ab wann „leicht verzögert“ (gelb), ab wann „im Verzug“ (rot)? | Lilli | Vorschlag: gelb ab Fälligkeit, rot 14 Tage nach Fälligkeit oder nach der ersten Mahnung; in `config/praxis.json` einstellbar |
| E26 | Tresor-Schlüssel: wo liegt die Notfallkopie, und wer darf sie öffnen? Hat Lilli eine sektorale Heilpraktikererlaubnis (Direktzugang ohne Verordnung)? | Lilli + Christian | Notfallkopie ausgedruckt im Praxis-Safe (Umschlag), zweite Kopie bei Christian offline; Erlaubnis: Frage 15 an Lilli |

---

## 7. Ideen-Backlog

Neue Ideen hier eintragen (W-Nummer vergeben, mit Prompts abgleichen). Das Backlog der
Prompt-Sammlung (#1–#3a) ist in W17–W22 aufgegangen; Webhooks per Tailscale Funnel (#3a) bleiben „später“.

| # | Idee | aufgenommen | Abgleich |
|---|---|---|---|
| – | – | – | – |
