# Claude-Code-Prompts – Digitalisierung Praxis Lilli Nebel

Stand: 20.10.2026 · Reihenfolge = empfohlene Umsetzungsreihenfolge.
Jeder Prompt wird als eigene Claude-Code-Sitzung (bzw. eigener Plan-Mode-Durchlauf) ausgeführt. Platzhalter in `<SPITZEN_KLAMMERN>` werden vor dem Start ersetzt.

| Platzhalter | Bedeutung |
|---|---|
| `<INFRA_REPO>` | Bestehendes Repo mit der Graph-API-Vorarbeit |
| `<PRAXIS_REPO>` | Neues (oder gleiches) Repo für die Praxis-Workflows |
| `<TENANT_DOMAIN>` | M365-Mandant der Praxis, z. B. `lilli-nebel.de` |
| `<PRAXIS_MAILBOX>` | z. B. `praxis@lilli-nebel.de` |
| `<LILLI_UPN>` | UPN von Lilli (Besitzerin des OneDrive) |

---

## Vorab: Leitplanken (gelten für alle Prompts)

1. **Verantwortliche ist Lilli** (Art. 4 Nr. 7 DSGVO). Darum wird die App-Registrierung **in ihrem Mandanten** angelegt, nicht nur per Consent in Christians Mandant „mitbenutzt“. Christian agiert als Dienstleister → AVV + Verpflichtung nach § 203 Abs. 4 StGB schriftlich.
2. **Least Privilege**: Mail/Kalender nur über *Exchange RBAC for Applications* auf genau das Praxispostfach; OneDrive nur über `Sites.Selected` auf Lillis OneDrive-Site. Keine tenantweiten `Mail.Read`/`Files.ReadWrite.All`-Grants in Entra – diese würden die Scopes aushebeln.
3. **Kein Auto-Versand**: Antworten an Patienten werden als Entwurf erzeugt; gesendet wird erst nach Freigabe durch Lilli.
4. **Keine Klardaten an LLMs**: Mail-Inhalte mit Patientenbezug verlassen den Server nur pseudonymisiert (Presidio) und nur über Bedrock Frankfurt bzw. lokales Modell. Für Eingangsrechnungen zunächst regelbasiert, ohne LLM.
5. **Backend ist Source of Truth** (PostgreSQL). OneDrive/Exchange/Lexware sind Ablage- bzw. Anzeigeschichten.
6. **Secrets** niemals im Repo: Zertifikat-Auth für Graph (kein Client Secret), Lexware-API-Key in SOPS/age bzw. Key Vault.
7. **Lexware-Tarif**: Die Public API ist erst ab **Lexware Office XL** enthalten (ohne Aufpreis für die API selbst). Vor Prompt 5 wird der Tarif auf XL angehoben und ein eigener technischer Lexware-Benutzer „Praxis-Automation“ angelegt, dessen API-Key ausschließlich von diesem System genutzt wird.

---

## Prompt 0 – CLAUDE.md für das Praxis-Repo anlegen

```text
Lege im Repo-Root eine CLAUDE.md an, die für alle folgenden Sitzungen gilt. Inhalt:

Projekt: Digitalisierung der Physiotherapie-/Privatpraxis Lilli Nebel (Bayern).
Sprache: Code-Kommentare Englisch, Doku und UI-Texte Deutsch.

Harte Regeln (nicht verhandelbar):
- Gesundheitsdaten = Art. 9 DSGVO, Berufsgeheimnis § 203 StGB. Datenschutz geht vor Komfort.
- Keine Patientendaten (Namen, Diagnosen, Verordnungen, Freitext aus Mails) in Logs, Exceptions, Commit-Messages, Testfixtures. Logging nur mit IDs/Hashes.
- Keine Klardaten an externe LLM-APIs. Falls LLM nötig: vorher lokale Pseudonymisierung (Presidio + de_core_news_lg), Endpoint nur AWS Bedrock eu-central-1 oder lokales Modell.
- Graph-Zugriff ausschließlich app-only mit Zertifikat; Berechtigungen nur scoped (Exchange RBAC for Applications, Sites.Selected). Niemals tenantweite Grants vorschlagen.
- Nichts wird automatisch an Patienten gesendet. Ausgehende Nachrichten = Entwurf + Freigabe.
- PostgreSQL ist Source of Truth. Exchange, OneDrive, Lexware sind Ziel-/Anzeigesysteme.
- Secrets nur via SOPS/age oder Azure Key Vault; .env.example ohne Werte.
- Mehrmandantenfähig: Jeder Workflow erhält eine tenant_id; Konfiguration pro Mandant in config/tenants/<tenant>.yaml.

Stack: Python 3.12, FastAPI, SQLAlchemy 2 + Alembic, PostgreSQL 16 (pgcrypto, pgaudit, RLS), msgraph-sdk-python + azure-identity (CertificateCredential), httpx, APScheduler oder RQ, pytest + respx, Docker Compose auf Strato-Linux-Server, Caddy als Reverse Proxy.

Arbeitsweise: Erst Plan (Plan Mode), dann kleine Commits, Tests zu jedem Modul, am Ende kurze Zusammenfassung was offen ist.
```

---

## Prompt 1 – Bestandsaufnahme der Graph-Vorarbeit

```text
Analysiere das Repo <INFRA_REPO> (nur lesen, nichts ändern) und erstelle docs/bestandsaufnahme-graph.md mit:
1. Welche Entra-App-Registrierungen / Service Principals werden angelegt (IaC: Terraform, Bicep, PowerShell, az CLI)? In welchem Mandanten?
2. Welche Graph-Permissions (delegated vs. application) sind konfiguriert, inkl. ob tenantweit oder scoped (Application Access Policy, RBAC for Applications, Sites.Selected).
3. Authentifizierung: Client Secret oder Zertifikat? Wo liegen Secrets?
4. Vorhandene Code-Module für Mail (Delta-Query, Attachments), Kalender, OneDrive/Drive-Upload, Webhooks/Subscriptions.
5. Wo ist die Mandanten-ID/Postfach-Adresse hartcodiert? Liste alle Stellen (Datei:Zeile).
6. Empfehlung: Was kann für einen zweiten Mandanten (<TENANT_DOMAIN>) wiederverwendet werden, was muss parametrisiert werden?
Bewerte jede Berechtigung gegen das Least-Privilege-Prinzip aus CLAUDE.md und markiere Abweichungen.
```

---

## Prompt 2 – Mandant „Lilli Nebel“ anbinden (Entra + Exchange + OneDrive)

```text
Basierend auf docs/bestandsaufnahme-graph.md: Erstelle die Infrastruktur für den zusätzlichen Mandanten <TENANT_DOMAIN>.
Ziel: Eine eigene App-Registrierung IM Mandanten <TENANT_DOMAIN> (single-tenant), Zertifikat-Auth, minimal berechtigt.

Liefere:
a) IaC im Stil des bestehenden Repos (bevorzugt Terraform azuread-Provider, sonst PowerShell 7 + Microsoft.Graph-Modul):
   - App-Registrierung "praxis-automation-<tenant>"
   - Application Permissions: Sites.Selected (Graph). KEINE Mail.*/Calendars.* Grants in Entra (die kommen über Exchange RBAC).
   - Zertifikat: Erzeugung per openssl-Skript (RSA 3072, 24 Monate), Upload des Public Keys, privater Key nur lokal/SOPS.
b) scripts/exo-rbac-<tenant>.ps1 (PowerShell 7, ExchangeOnlineManagement):
   - New-ServicePrincipal mit AppId/ObjectId der Enterprise App
   - New-ManagementScope "PraxisPostfach" mit RecipientRestrictionFilter auf <PRAXIS_MAILBOX>
   - New-ManagementRoleAssignment für "Application Mail.ReadWrite" und "Application Calendars.ReadWrite" mit -CustomResourceScope
   - (Mail.Send NICHT vergeben – Antworten werden als Entwurf erzeugt)
   - Test-ServicePrincipalAuthorization gegen <PRAXIS_MAILBOX> und gegen ein Fremd-Postfach (muss InScope False liefern)
   - Hinweis ausgeben: Änderungen werden erst nach 30–120 Min. wirksam.
c) scripts/grant-sites-selected-<tenant>.ps1:
   - Ermittelt die OneDrive-Site von <LILLI_UPN> und vergibt per POST /sites/{id}/permissions die Rolle "write" nur an diese App.
   - Legt Ordnerstruktur an: /Praxis-Automation/Buchhaltung/Eingang/{JJJJ}/{MM}, /Buchhaltung/Freigegeben, /Buchhaltung/Abgelehnt.
d) config/tenants/lilli-nebel.yaml (ohne Secrets) + Erweiterung des bestehenden Config-Loaders um tenant_id.
e) docs/mandant-lilli-runbook.md: Schritt-für-Schritt, welche Rolle (Global Admin / Exchange Admin) bei Lilli welche Aktion ausführt, inkl. Admin-Consent-Link. Alles, was eine interaktive Admin-Anmeldung braucht, führe NICHT selbst aus, sondern bereite es als Skript zur manuellen Ausführung vor.
Schreibe abschließend einen Smoke-Test (pytest, markiert @integration), der mit dem Zertifikat ein Token holt, 1 Mail-Metadatum aus dem Praxispostfach liest und eine Testdatei in /Praxis-Automation schreibt und wieder löscht.
```

---

## Prompt 3 – Datenmodell & Grundgerüst

```text
Lege das Backend-Grundgerüst an (FastAPI, SQLAlchemy 2, Alembic, Docker Compose mit postgres:16 und caddy).
Tabellen (alle mit tenant_id, created_at, updated_at; RLS-Policy auf tenant_id):
- inbound_document (id, graph_message_id, internet_message_id, sender_domain, subject_hash, attachment_name, sha256, size, onedrive_item_id, status ENUM[eingegangen, klassifiziert, wartet_freigabe, freigegeben, an_lexware, abgelehnt, fehler], lexware_file_id, lexware_voucher_id, reviewed_by, reviewed_at, error_code)
- appointment_request (id, channel ENUM[mail, whatsapp], source_ref, patient_ref NULLABLE, requested_window JSONB, proposed_slots JSONB, status ENUM[neu, vorschlag_erstellt, entwurf_bereit, bestaetigt, abgelehnt], draft_message_id)
- audit_event (append-only, Trigger verhindert UPDATE/DELETE)
Patientenbezogene Freitexte werden mit pgcrypto (pgp_sym_encrypt) verschlüsselt gespeichert, Schlüssel aus Env/SOPS.
Ergänze: Health-Endpoint, strukturiertes Logging (structlog) mit Redaction-Filter für E-Mail-Adressen, Telefonnummern, Namen aus einer Blocklist, Alembic-Migration, Makefile, pytest-Grundgerüst.
```

---

## Prompt 4 – Workflow A: Rechnungs-PDFs aus Mail → OneDrive

```text
Implementiere den Ingest-Worker "invoice_ingest" für Mandant lilli-nebel:
1. Graph Delta-Query auf den Ordner "Posteingang/Rechnungen" von <PRAXIS_MAILBOX> (Ordner wird per Outlook-Regel befüllt; zusätzlich Fallback: Posteingang mit Filter hasAttachments eq true). Delta-Token in DB persistieren.
2. Nur fileAttachment mit contentType application/pdf; .zip/.docx und Inline-Bilder ignorieren und als Hinweis loggen (ohne Dateinamen-Klartext).
3. Klassifikation REGELBASIERT (kein LLM): Absender-Allowlist aus config (bekannte Lieferanten), Schlüsselwörter im PDF-Text (pdfplumber: "Rechnung", "Rechnungsnummer", "USt", IBAN-Muster). Ergebnis: rechnung | unklar | keine_rechnung.
   Mails von Patienten (Absender nicht in Lieferanten-Allowlist UND Begriffe wie Verordnung/Rezept/Befund) werden NICHT verarbeitet, sondern mit Kategorie "Prüfen – Patient" markiert.
4. Upload nach OneDrive /Praxis-Automation/Buchhaltung/Eingang/{JJJJ}/{MM}/{datum}_{lieferant}_{sha8}.pdf (Upload-Session ab 4 MB). Duplikaterkennung über sha256.
5. Mail per Kategorie "Automation: abgelegt" markieren und in Ordner "Rechnungen/Verarbeitet" verschieben (nicht löschen).
6. Status in inbound_document = wartet_freigabe; audit_event schreiben.
Throttling: Graph-429/503 mit Retry-After respektieren. Tests mit respx-Mocks für Graph, inkl. Delta-Paging und Duplikat.
Betrieb: Polling alle 10 Min. via APScheduler; Graph-Webhooks als späteres Ticket vormerken (benötigt öffentlich erreichbaren Endpoint hinter Caddy).
```

---

## Prompt 5 – Workflow A: Freigabe durch Lilli & Übergabe an Lexware Office

```text
Implementiere Freigabe und Lexware-Anbindung:

Freigabe (Stufe 1, vor Lexware):
- Geschützte Web-Seite /freigabe (Caddy + Authelia oder Entra-ID-Login nur für <LILLI_UPN>, MFA Pflicht), mobil optimiert (iPhone).
- Liste aller inbound_document mit Status wartet_freigabe: Vorschau-Link (OneDrive webUrl, Lilli ist ohnehin Besitzerin), erkannter Lieferant, Betrag, Datum (aus PDF extrahiert, editierbar).
- Buttons: Freigeben | Ablehnen (Grund) | Später. Freigeben verschiebt die Datei nach /Buchhaltung/Freigegeben/{JJJJ}/{MM}, Ablehnen nach /Abgelehnt.

Lexware (Stufe 2):
- Voraussetzung: Lexware Office XL (Public API erst ab XL). Lege docs/lexware-setup.md an: Tarifwechsel auf XL, technischen Benutzer "Praxis-Automation" mit minimalen Rollen anlegen, API-Key unter Einstellungen > Öffentliche API erzeugen, Key in SOPS ablegen, Rotation jährlich. Der Code prüft beim Start per GET /profile, ob der Key gültig ist, und bricht mit klarer Fehlermeldung ab (Hinweis auf Tarif/Key), statt still weiterzulaufen.
- Modul adapters/accounting/ mit Interface AccountingAdapter (upload_receipt, get_status) und Implementierung LexwareOfficeAdapter. (Interface bewusst, damit ein späterer Wechsel z. B. zu sevDesk nur einen neuen Adapter braucht.)
- Basis-URL https://api.lexware.io/v1, Auth: Bearer API-Key aus SOPS. Prüfe die aktuelle offizielle Doku (developers.lexware.io) und passe Endpunkte an, falls abweichend.
- Nach Freigabe: POST /files (multipart, type=voucher) → Beleg landet in Lexware unter "Belege – zu prüfen"; lexware_file_id speichern. Die finale Buchung/Kontierung bleibt in Lexware bei Lilli bzw. Steuerberatung.
- Rate-Limit: max. 2 Requests/s, eigener Token-Bucket, bei 429 exponentielles Backoff (kein Retry-After vorhanden).
- Nur PDF senden; Dateigröße vorher prüfen.
- Benachrichtigung an Lilli: 1× täglich Sammel-Hinweis "X Belege warten auf Freigabe" (als Teil der Tagesübersicht, Prompt 8), keine Einzel-Mails.
Tests: Adapter mit respx-Mocks (Erfolg, 429, 401, 5xx), Freigabe-Statusautomat als Unit-Tests.
```

---

## Prompt 6 – Workflow B: Terminanfragen per Mail

```text
Implementiere "appointment_mail":
1. Erkennung neuer Mails im Praxispostfach, die Terminwünsche enthalten. Stufe 1 regelbasiert (Schlüsselwörter: Termin, verschieben, absagen, frei, Wochentage, Datumsmuster via dateparser de).
   Optional Stufe 2 (Feature-Flag, default AUS): Pseudonymisierung mit Presidio (Namen, Telefon, E-Mail, Adresse → Tokens), dann Klassifikation/Extraktion über AWS Bedrock eu-central-1; Re-Identifikation nur lokal.
2. Freie Slots aus dem Exchange-Kalender von <PRAXIS_MAILBOX> per getSchedule/calendarView berechnen. Regeln in config: Öffnungszeiten, Behandlungsdauer je Leistungsart (z. B. KG 30 Min, MT 30 Min, Massage 45/60 Min), Puffer, keine Termine an Feiertagen Bayern (Paket holidays, subdiv BY).
3. Drei Slot-Vorschläge erzeugen, als vorläufige Termine mit showAs=tentative und Betreff nur "Reserviert – Anfrage #<id>" (KEIN Patientenname, keine Leistungsart im Kalendertitel) anlegen; nach 48 h automatisch entfernen, wenn unbestätigt.
4. Antwort als ENTWURF (createReply) mit Textbaustein aus templates/termin_vorschlag.de.j2 im Postfach ablegen. Kein Versand durch das System.
5. Bei Bestätigung durch Patienten (Antwort-Mail wird über conversationId zugeordnet): gewählten Slot fest eintragen (Betreff: Initialen + interne Patienten-ID), übrige Reservierungen löschen, Bestätigungsentwurf erzeugen.
6. Absagen/Verschiebungen analog als Entwurf.
Alles in appointment_request + audit_event protokollieren. Tests für Slot-Berechnung (Randfälle: Überlappung, Feiertag, Ganztagstermin, Sommerzeitumstellung).
```

---

## Prompt 7 – Workflow B: Terminanfragen per WhatsApp (erst nach Datenschutz-Entscheidung)

```text
Bereite eine WhatsApp-Anbindung vor, aber hinter Feature-Flag (default AUS) und mit Datenschutz-Gate:
- Erstelle docs/whatsapp-entscheidungsvorlage.md: Vergleich (1) WhatsApp Business App manuell auf Praxis-Handy, (2) WhatsApp Business Platform/Cloud API (Meta als Auftragsverarbeiter, Server-Standorte, Metadaten an Meta), (3) Alternative: Online-Buchungslink/SMS. Bewerte nach Art. 9 DSGVO, § 203 StGB, Einwilligungserfordernis, Adressbuch-Problematik, Aufwand. Kennzeichne, was rechtlich durch Lilli bzw. Datenschutzberatung zu entscheiden ist.
- Falls Variante (2) gewählt wird: adapters/messaging/whatsapp_cloud.py mit Webhook-Endpoint (Signaturprüfung X-Hub-Signature-256), nur Textnachrichten, Medien werden abgelehnt mit Hinweis "Bitte keine Befunde/Rezepte per WhatsApp senden".
- Erstnachricht eines neuen Kontakts: automatische Info mit Link zur Datenschutzerklärung + Einwilligung; erst nach "JA" wird die Anfrage verarbeitet.
- Gleiche Slot-Logik wie Prompt 6, Antworten werden als Vorschlag in der Freigabe-Oberfläche angezeigt und erst nach Klick gesendet (24-h-Servicefenster beachten, sonst freigegebene Template-Nachricht).
- Inhalte in DB verschlüsselt, Aufbewahrung max. 90 Tage für reine Terminkommunikation (konfigurierbar), Lösch-Job.
```

---

## Prompt 8 – Tagesübersicht (Daily Brief)

```text
Implementiere "daily_brief", werktags 06:45 Europe/Berlin:
- Inhalt: Termine des Tages (Uhrzeit, Initialen/Patienten-ID, Leistungsart aus Backend – NICHT aus Kalendertitel), Lücken im Plan, offene Terminanfragen (Anzahl + Alter), Belege mit Status wartet_freigabe, Fehler aus den Workern der letzten 24 h.
- Ausgabe primär als geschützte Seite /heute in der Freigabe-Oberfläche (mobil, iPhone-Homescreen-tauglich als PWA).
- Zusätzlich eine kurze Mail an <LILLI_UPN> NUR mit Kennzahlen und Link ("Heute 9 Termine, 2 Anfragen offen, 3 Belege zur Freigabe") – keine Patientennamen in der Mail. Dafür wird die Rolle "Application Mail.Send" per RBAC for Applications auf <PRAXIS_MAILBOX> beschränkt ergänzt (Skript aus Prompt 2 erweitern). Im Code eine harte Empfänger-Allowlist: nur Adressen der Domain <TENANT_DOMAIN>; jeder andere Empfänger wirft eine Exception. Patientenantworten bleiben weiterhin reine Entwürfe.
- Template Jinja2, Snapshot-Tests.
```

---

## Prompt 9 – Betrieb, Sicherheit & Doku

```text
Härte und dokumentiere das Gesamtsystem:
1. docker-compose.prod.yml: Container non-root, read-only FS wo möglich, eigene Netze, keine offenen DB-Ports, Caddy mit HSTS, Fail2ban/CrowdSec-Hinweis.
2. Backups: restic verschlüsselt (Postgres-Dump + Konfiguration) auf Strato HiDrive oder zweiten Standort; Restore-Test-Skript.
3. Zertifikats- und API-Key-Rotation: Skript + Kalender-Erinnerung 30 Tage vor Ablauf.
4. Monitoring: Uptime Kuma + Alarm bei Worker-Fehlern (ohne Inhaltsdaten).
5. docs/datenschutz/:
   - verarbeitungsverzeichnis.md (Art. 30) je Workflow: Zweck, Datenkategorien, Empfänger (Microsoft, Lexware/Haufe, Strato, ggf. Meta, AWS), Löschfristen (Rechnungen 8/10 Jahre nach § 147 AO – mit Hinweis auf Prüfung durch Steuerberatung; Behandlungsdoku 10 Jahre; reine Terminkommunikation kurz).
   - tom.md (Art. 32) und dsfa-vorpruefung.md (Art. 35).
   - avv-checkliste.md: Microsoft DPA + Zusatz für Berufsgeheimnisträger prüfen, Lexware AVV, Strato AVV, Christian/KIWI als Dienstleister mit § 203-Verpflichtung.
6. Abschlussbericht: Was ist umgesetzt, was ist bewusst offen, welche Entscheidungen braucht Lilli.
```

---

## Prompt 10 – Praxis-Cockpit: Übersichtsseite für Desktop und Smartphone

```text
Baue als Abschluss die zentrale Übersichtsseite "Praxis-Cockpit" unter /cockpit (ersetzt /heute aus Prompt 8 als Startseite; /freigabe bleibt als Detailansicht erreichbar).

Zugang & Sicherheit:
- Login nur für <LILLI_UPN> (und optional Christian als Admin) über Entra ID (OIDC) oder Authelia, MFA Pflicht, Session-Timeout 30 Min. inaktiv.
- Keine Daten im Browser-Cache persistieren (Cache-Control: no-store), keine Patientendaten in URLs oder Seitentiteln.
- Optionaler "Diskret-Modus" (Toggle): blendet Namen aus und zeigt nur Initialen/IDs, z. B. wenn der Bildschirm im Behandlungsraum sichtbar ist.

Inhalte (vier Kacheln, jeweils mit Zähler + Liste + Link in die Detailansicht):
1. Termine – heute und die nächsten 7 Tage aus Exchange-Kalender + Backend (Uhrzeit, Initialen/Patienten-ID, Leistungsart aus dem Backend), freie Lücken hervorgehoben, offene Terminanfragen (Mail/WhatsApp) mit Alter.
2. Offene Zahlungen – aus Lexware über den Voucherlist-Endpunkt:
   a) Ausgangsrechnungen an Patienten: voucherType=salesinvoice, voucherStatus=open und overdue → Rechnungsnummer, Betrag offen, Fälligkeit, Tage überfällig (rot ab 1 Tag, Mahnhinweis ab 14 Tagen konfigurierbar).
   b) Eingangsrechnungen: voucherType=purchaseinvoice, voucherStatus=open → Lieferant, Betrag, Fälligkeit (Skonto-Frist hervorheben, falls erkannt).
   Prüfe Parameternamen und Statuswerte gegen die aktuelle Doku auf developers.lexware.io, bevor du implementierst.
   Summenzeile: Summe offene Forderungen / offene Verbindlichkeiten.
3. Neuer Posteingang Rechnungen – inbound_document mit Status eingegangen/wartet_freigabe/fehler: Datum, Lieferant, Betrag, PDF-Vorschau (OneDrive-Link), Direkt-Buttons Freigeben / Ablehnen (gleiche Logik wie /freigabe, inkl. audit_event).
4. Systemstatus – letzte erfolgreiche Synchronisation je Quelle (Graph-Mail, Kalender, OneDrive, Lexware), Fehler der letzten 24 h, Ablaufdatum von Zertifikat und API-Key.

Daten-Aktualität:
- Lexware-Daten werden NICHT bei jedem Seitenaufruf live abgefragt (Rate-Limit 2 req/s), sondern von einem Sync-Job alle 15 Min. in eine Cache-Tabelle lexware_voucher_cache geschrieben; zusätzlich Lexware-Event-Subscriptions (Webhooks) für Rechnungs-/Zahlungsstatus vorbereiten, sobald der öffentliche Endpoint hinter Caddy steht. Seite zeigt "Stand: hh:mm" je Kachel und einen manuellen Aktualisieren-Button (mit Throttling).

Responsive Design (Desktop UND Smartphone):
- Ein Codebase, mobile-first: unter 640 px eine Spalte, Kacheln als aufklappbare Karten in Reihenfolge Termine → Posteingang → Zahlungen → Status, große Touch-Ziele (min. 44 px), Freigabe per Wisch- oder Button-Aktion.
- Ab 1024 px: 2×2-Raster, Tabellen mit Sortierung und Filter, PDF-Vorschau im Seitenpanel.
- Als PWA installierbar (Manifest, Icon im Praxis-Design, iPhone-Homescreen), Service Worker nur für statische Assets – keine Offline-Speicherung von Patienten- oder Finanzdaten.
- Hell-/Dunkelmodus, Schrift im Praxis-Corporate-Design (Farben/Font als CSS-Variablen, Platzhalter bis CI vorliegt).
- Technik: FastAPI + Jinja2 + HTMX + Tailwind (kein schweres SPA-Framework nötig); Teil-Updates der Kacheln per HTMX alle 5 Min.

Tests & Abnahme:
- Unit-Tests für Aggregation (Summen, Überfälligkeit, Zeitzonen Europe/Berlin).
- Playwright-Tests in zwei Viewports (iPhone 15: 393×852, Desktop: 1440×900) inkl. Screenshot-Vergleich und Login-Pflicht.
- Barrierefreiheit: axe-core ohne kritische Befunde.
- Abschließend docs/cockpit-handbuch.md für Lilli: kurze bebilderte Anleitung (Screenshots aus Playwright, Testdaten – keine echten Patientendaten).
```

---

## Prompt 11 – Zentrale Poststelle & Ausgangsrechnungen in Lexware

```text
Erweitere die Ingest-Worker aus Prompt 4/6/7 zu einer zentralen "Poststelle" (modules/intake/):
1. Einheitliches Eingangsobjekt intake_item (tenant_id, channel ENUM[mail, whatsapp, webform, scan, phone_note, bank], source_ref, received_at, payload_ref, status, category, patient_id NULLABLE, supplier_id NULLABLE). Jeder Kanal hat einen Adapter, der nur intake_items erzeugt – Verarbeitung passiert zentral.
2. Klassifizierer (Regelwerk in config/intake_rules.yaml, versioniert, mit Unit-Tests je Regel):
   lieferantenrechnung | verordnung | befund_arztbrief | terminanfrage | zahlungseingang | unklar.
   Kein Treffer oder Konflikt → "unklar" (Fach "Bitte anschauen" im Cockpit). Eine Entscheidung Lillis kann als neue Regel vorgeschlagen werden (nicht automatisch übernommen).
3. Patienten-Zuordnung: über E-Mail/Telefon aus der Kartei; bei Mehrdeutigkeit nie raten → "unklar".
4. Ablage nach Datenklasse:
   - Gesundheitsdaten (verordnung, befund_arztbrief, Anamnese, Einwilligungen) → "Patienten-Tresor": verschlüsselter Objektspeicher auf dem Strato-Server (MinIO mit SSE + Envelope Encryption, Schlüssel nicht auf demselben Volume), Metadaten in documents-Tabelle mit RLS, Zugriff protokolliert (pgaudit + audit_event). NICHT in OneDrive.
   - Kaufmännisches (lieferantenrechnung, Verträge, Kontoauszüge) → OneDrive /Praxis-Automation/Buchhaltung/... wie Prompt 4.
   - Optionale verschlüsselte Zweitkopie des Tresors (restic) auf Strato HiDrive.
5. Ausgangsrechnungen:
   - Tabelle service_catalog (code, bezeichnung, dauer_min, preis, steuerklasse ENUM[heilbehandlung_steuerfrei, wellness_19]) – Werte werden von Lilli gepflegt, Steuerklassen mit Steuerberatung abgestimmt.
   - Jede als "erledigt" markierte Behandlung erzeugt eine billing_position.
   - Abrechnungsmodus je Patient: pro_termin | pro_serie | monatlich (Default pro_serie).
   - Rechnungslauf erzeugt pro Patient und Steuerklasse GETRENNTE Rechnungen (niemals gemischt) als ENTWURF in Lexware (Invoices-Endpunkt ohne Finalisierung; Parameter gegen aktuelle Doku prüfen). Kontakt wird über den Contacts-Endpunkt angelegt/abgeglichen, nur Rechnungs-Stammdaten, keine Diagnosen im Rechnungstext (nur Leistungsbezeichnung + Datum).
   - Freigabe im Cockpit → Finalisierung + Versand über Lexware; Status-Sync über Voucherlist bzw. Event-Subscriptions; Zahlungserinnerung als Entwurf nach konfigurierbarer Frist.
6. Tests: Klassifizierer-Regeln, Trennung der Steuerklassen, Idempotenz (kein doppelter Rechnungsentwurf), Mocks für Lexware.
```

---

## Prompt 12 – Patientenweg mit Phasen (Neu- und Bestandspatienten)

```text
Implementiere den Patientenweg als Statusautomat (modules/patient_journey/):
Phasen: anfrage → aufnahme → anamnese → befund_start → behandlung → abschluss → rechnung → nachsorge (Enum, Reihenfolge fix).
Jeder Patient hat pro Behandlungsfall (episode) genau eine aktuelle Phase; Historie in episode_phase_log.

Übergänge (automatisch, ereignisgesteuert, je Übergang ein Unit-Test):
- Terminvorschlag gesendet/bestätigt → aufnahme
- Stammdaten + Einwilligung vollständig (+ Verordnung bei Heilbehandlung) → anamnese
- Fragebogen eingereicht ODER Lilli markiert "Anamnese im Gespräch erledigt" → befund_start
- erste Behandlung erledigt → behandlung (Zähler x von y aus Verordnung/Serie)
- letzte Behandlung der Serie erledigt → abschluss
- Abschlussbefund gespeichert → rechnung (löst Rechnungslauf aus Prompt 11 aus, wenn Modus pro_serie)
- Zahlung erkannt → nachsorge; nach Ablauf der Nachsorgefrist → archiviert
Manuelles Verschieben durch Lilli jederzeit möglich (mit Grund, protokolliert).

Bestandspatienten:
- Wiedererkennung über Kontaktdaten; neue episode mit Verweis auf vorherige.
- Fall a) Folgeverordnung: Kurzcheck (Einwilligung gültig, Stammdaten bestätigt per Link), Anamnese = vorherige + Änderungen.
- Fall b) neue Beschwerde: Kurzcheck + neue Anamnese.
- Fall c) Wellness ohne Verordnung: Phasen anamnese und abschluss werden übersprungen (Konfiguration je service_catalog-Eintrag).

Alternativen als Konfiguration (je Patient überschreibbar):
- anmeldung: online_buchung | nachricht_mit_vorschlag (Default) | telefon_notiz
- anamnese: online_vorab (Default, sicherer Einmal-Link, 7 Tage gültig, Erinnerung nach 2 Tagen) | tablet_praxis | gespraech_sprachnotiz (lokale Transkription auf dem Server, nur mit Einwilligung)
- abrechnung: pro_termin | pro_serie (Default) | monatlich

Warnregeln (für das Cockpit): Verordnung fehlt/läuft in ≤7 Tagen ab, Fragebogen offen > 2 Tage, Serie ohne Folgetermin, Abschlussbefund fehlt, Rechnung > 14 Tage offen.

Cockpit-Erweiterung (Prompt 10): Kachel/Ansicht "Patienten nach Phase" als Kanban (8 Spalten, Karten mit Initialen, Fortschrittsbalken, Warnhinweisen); auf dem Smartphone als aufklappbare Liste je Phase. Diskret-Modus zeigt nur Initialen. Medizinische Inhalte erst nach erneuter Authentifizierung (Step-up).
```

---

## Prompt 13 – Schnellaktionen: E-Mail-Entwürfe direkt aus der Pinnwand

```text
Ergänze die Patienten-Pinnwand (Prompt 10/12) um Schnellaktionen, die mit einem Tipp einen fertigen E-Mail-Entwurf erzeugen, der nur noch gesendet werden muss.

Bedienung:
- Auf jeder Patientenkarte ein Aktionsmenü "✉ E-Mail vorbereiten"; angeboten werden nur die zur aktuellen Phase und Warnlage passenden Vorlagen (z. B. bei "Fragebogen offen > 2 Tage" steht "Erinnerung Fragebogen" oben).
- Zusätzlich Mehrfachauswahl: mehrere Karten markieren → je Patient ein eigener Entwurf (nie ein Sammel-Empfänger, nie CC/BCC mehrerer Patienten).
- Nach dem Erzeugen: Bestätigung "Entwurf liegt im Postfach" + Button "Im Mailprogramm öffnen".

Vorlagen (templates/mail/*.de.j2, von Lilli im Cockpit editierbar, versioniert):
terminvorschlag, terminbestaetigung, terminerinnerung, absage_ersatztermin, fragebogen_link, erinnerung_fragebogen, rezept_fehlt, rezept_laeuft_ab, folgetermin_vorschlag, abschluss_dank, rechnung_info, zahlungserinnerung, nachsorge_wiedervorstellung, freitext.
Platzhalter: Anrede, Vorname/Nachname, Termin(e), Links (Einmal-Links), Praxisdaten. Inhaltsregel: KEINE Diagnosen, Befunde oder Behandlungsdetails im Mailtext – Validierung beim Speichern einer Vorlage (Blockliste medizinischer Begriffe + Hinweis).

Technik – zwei Wege, Weg 1 ist Standard:
1. Graph-Entwurf im Praxispostfach: POST /users/<PRAXIS_MAILBOX>/messages (bzw. createReply, wenn eine Ursprungsmail existiert, damit der Verlauf erhalten bleibt). Der Entwurf erscheint per Exchange-Sync automatisch im Ordner "Entwürfe" in Outlook, Apple Mail (iPhone/Mac) und Outlook Web. Rückgabe webLink → Button "Im Mailprogramm öffnen" (Outlook Web); auf iOS zusätzlich Hinweis "In Mail unter Entwürfe". Benötigt nur Application Mail.ReadWrite (bereits gescoped vorhanden) – KEIN Mail.Send.
   Anhänge (z. B. Rechnungs-PDF aus Lexware) können so mitgegeben werden.
2. Fallback mailto:-Link (wenn Graph nicht erreichbar): öffnet das Standard-Mailprogramm des Geräts mit Empfänger, Betreff und Text vorbefüllt. Ohne Anhänge, Länge begrenzen (~1.500 Zeichen), Text URL-kodieren.

Nachverfolgung:
- Entwurf-ID, Vorlage und Patient in mail_draft speichern; ein Hintergrundjob erkennt per Graph (Ordner "Gesendete Elemente", internetMessageId), ob der Entwurf gesendet wurde → Karte zeigt "✓ gesendet am …", Phase/Warnung wird ggf. automatisch aktualisiert (z. B. "Terminvorschlag gesendet" → Phase aufnahme).
- Nicht gesendete Entwürfe > 3 Tage erscheinen als Hinweis im Cockpit; verwaiste Entwürfe werden nie automatisch gelöscht.
- Doppelte Entwürfe vermeiden: gleiche Vorlage + Patient innerhalb 24 h → Hinweis "Es gibt bereits einen Entwurf" mit Link.

Tests: Vorlagen-Rendering (Snapshot), Blocklisten-Validierung, Graph-Mocks für createMessage/createReply/Sent-Erkennung, mailto-Encoding, Playwright-Test Aktionsmenü mobil + Desktop.
```

---

## Prompt 14 – Rezepte, Terminregeln, Zwischen- und Abschlussrechnungen

```text
Erweitere Datenmodell und Logik aus Prompt 11/12 um Rezepte (Verordnungen). Diese Regeln haben Vorrang vor dem "abrechnung"-Default aus Prompt 12.

Datenmodell:
- prescription (id, tenant_id, patient_id, episode_id, aussteller, ausgestellt_am, leistung_code → service_catalog, anzahl_verordnet, status ENUM[aktiv, abgeschlossen, abgebrochen], abbruch_grund, abbruch_am, dokument_id → Patienten-Tresor)
- appointment_prescription (appointment_id, prescription_id) – n:m, weil eine Sitzung mehrere Rezepte bedienen kann
- treatment_checkoff (id, appointment_id, prescription_id, checked_at, checked_by, notiz_verschluesselt) – UNIQUE(appointment_id, prescription_id)
- patient.zwischenrechnung_quartale INT NULL (NULL = Praxis-Standard aus config)
- invoice_run (id, prescription_id NULL, art ENUM[zwischenrechnung, abschlussrechnung, einzel, monat], zeitraum_von, zeitraum_bis, lexware_invoice_id, status)

Regeln:
1. Terminplanung: Beim ersten Termin eines Rezepts schlägt das System Slots für alle verbleibenden Einheiten vor (Logik aus Prompt 6). Lilli bestätigt nach Absprache mit dem Patienten; jeder Termin wird dem Rezept zugeordnet. Mehr Termine als verordnete Einheiten werden verhindert (Warnung).
2. Abhaken: Nach jeder Behandlung hakt Lilli im Cockpit pro Rezept genau eine Einheit ab (bei zwei Rezepten in einer Sitzung zwei Haken). Fortschritt = Anzahl checkoffs / anzahl_verordnet. Rückgängig machen innerhalb von 24 h möglich (protokolliert).
3. Absage/Verschiebung durch den Patienten:
   - Termin OHNE Rezeptzuordnung: bis 24 h vorher verschieben oder absagen.
   - Termin MIT Rezeptzuordnung: bis 24 h vorher nur verschieben, Absagen ist nicht möglich (Zuordnung und Zähler bleiben erhalten).
   - Unter 24 h: Regel noch offen → als konfigurierbare Policy anlegen (late_cancellation_policy: none | ausfallgebuehr | manuell), Default "manuell" = landet im Fach "Bitte anschauen".
   - Diese Regeln gelten für alle Kanäle (Mail, WhatsApp, Online-Buchung, Schnellaktionen aus Prompt 13); Antwortvorlagen bieten bei Rezept-Terminen nur "Verschieben" an.
4. Abrechnung bei Rezept:
   - Abschlussrechnung, sobald alle Einheiten abgehakt sind (Status → abgeschlossen).
   - Zwischenrechnung: Läuft ein Rezept länger als zwischenrechnung_quartale (Kalenderquartale ab erstem Termin), wird zum Quartalsende über alle bis dahin abgehakten, noch nicht abgerechneten Einheiten ein Entwurf erzeugt. Die Abschlussrechnung enthält nur den Rest.
   - Abbruch: Lilli setzt "Rezept abbrechen" (Grund Pflichtfeld) → sofort Abschlussrechnung über erbrachte, noch nicht abgerechnete Einheiten; zukünftige zugeordnete Termine werden storniert (Absage-Entwurf an Patient nach Prompt 13), Status abgebrochen.
   - Jede Einheit wird genau einmal abgerechnet (Idempotenz über invoice_run + Positionsreferenz).
5. Ohne Rezept (Wellness): pro_termin oder monatlich wie in Prompt 12; immer 19 %, nie mit Heilbehandlung gemischt.
6. Cockpit/Pinnwand: Rezept als Stempelkarte (x von y), Warnungen "Rezept ohne Folgetermin", "Zwischenrechnung fällig", "letzte Einheit erreicht"; Aktionen "Abhaken", "Verschieben", "Rezept abbrechen".

Tests: Quartalsgrenzen (inkl. Jahreswechsel), Zwischen- + Abschlussrechnung ohne Doppelabrechnung, Abbruch mit offenen Terminen, 24-h-Grenze in Europe/Berlin inkl. Sommerzeit, Sitzung mit zwei Rezepten, Versuch Absage eines Rezepttermins wird abgewiesen.
```

---

## Ideen-Backlog (wird laufend ergänzt)

| # | Idee / Feature | Status | Umsetzung |
|---|---|---|---|
| 1 | Schnellaktionen in der Pinnwand: Standard-E-Mails per Tipp als Entwurf ins Mailprogramm, nur noch senden | als Prompt ausformuliert | Prompt 13 |
| 2 | Rezepte mit Anzahl Behandlungen: Termine zuordnen und je Sitzung abhaken, Rechnung am Rezeptende, Zwischenrechnung nach pro Patient konfigurierbaren Quartalen, Rezeptabbruch mit Abschlussrechnung, Absage nur ohne Rezept (Rezept: nur verschieben, jeweils bis 24 h vorher) | als Prompt ausformuliert, in beiden PDFs als Detailseite | Prompt 14 |
| 2a | Offene Frage: Regel für Absage/Verschiebung unter 24 h (Ausfallgebühr?) | offen – Entscheidung Lilli | Prompt 14, Policy-Schalter |
| 3 | Zugriff auf Server nur über Tailscale (Mac + iPhone), Cockpit via `tailscale serve`, Anmeldung über Tailscale-Identität + Passkey; Graph nur vom Backend | Anleitung + Prompt erstellt | tailscale-graph-cockpit-anleitung.md |
| 3a | Webhooks (Graph/Lexware) per Tailscale Funnel statt Polling | später | tailscale-graph-cockpit-anleitung.md, Teil D |

---

## Anhang – Speicherorte: was darf wohin? (Arbeitsgrundlage, keine Rechtsberatung)

| Datenart | Exchange-Kalender | OneDrive Business | Strato-Server (eigenes Backend) | Lexware Office | WhatsApp |
|---|---|---|---|---|---|
| Termin (Zeit, Initialen/ID) | ✅ | – | ✅ (Master) | – | ⚠️ nur mit Einwilligung |
| Name + Kontakt Patient | ⚠️ minimal | ⚠️ | ✅ (Master, verschlüsselt) | ✅ für Ausgangsrechnung | ⚠️ |
| Diagnose, Verordnung, Befund, Behandlungsdoku | ❌ | ⚠️ nur mit DPA + § 203-Zusatz, besser nicht | ✅ (verschlüsselt, RLS) bzw. Fachsoftware | ❌ | ❌ |
| Eingangsrechnungen Lieferanten | – | ✅ | ✅ | ✅ | – |
| Ausgangsrechnungen an Patienten | – | ✅ (Archiv) | ✅ | ✅ | ❌ |
