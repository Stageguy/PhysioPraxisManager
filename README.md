# PhysioPraxisManager

Verbindung der Privatpraxis Lilli Nebel zu Microsoft 365 über MS Graph: Exchange (Mail, Kalender)
und OneDrive von **praxis@lilli-nebel.de**. Das Muster ist dasselbe wie in
`mdr-Infrastruktur/graphapi`: öffentlicher Client, Gerätecode-Anmeldung, nur delegierte Rechte,
kein Client-Secret. Die App handelt ausschließlich im Namen des Praxiskontos.

## Konzept und Aufgaben

In [konzept/](konzept/): [requirements.md](konzept/requirements.md) (Wünsche, Abgleich, Aufgaben,
offene Entscheidungen), die Prompt-Sammlung und die beiden PDFs für Lilli.

## Wie es zusammenhängt

- **Mandant:** lilli-nebel.de liegt im selben Microsoft-365-Mandanten wie mondre
  (`bba7d110-ed15-4d88-aee5-c4e9e049bf63`).
- **App-Registrierung:** `praxis-graphapi` (`c48cf267-c575-4a1d-b69d-2c32c17c8fde`), getrennt von
  `mondre-graphapi`.
- **Rechte (delegiert, Admin-Zustimmung):** `Mail.ReadWrite`, `Mail.Send`, `Files.ReadWrite`,
  `Calendars.ReadWrite`, dazu `User.Read` und `offline_access`.
- **Zuweisung erforderlich:** anmelden kann sich nur praxis@lilli-nebel.de. Zusätzlich lehnt
  `src/auth.ts` jedes andere Konto ab (`GRAPH_KONTO`), falls im Browser ein anderes angemeldet ist.
- **OneDrive:** besteht bereits (`https://mondrenet-my.sharepoint.com/personal/praxis_lilli-nebel_de/`).
  Ein Admin-Konto sieht es über Graph nicht – auch nicht als Global Admin: Graph meldet dann
  `itemNotFound` statt „kein Zugriff“. Nur die Anmeldung als Praxiskonto zeigt den Inhalt.
- **Anmeldung:** liegt in `.data/token-cache.json` (nur für den eigenen Benutzer lesbar, nicht im
  Git). Das Refresh-Token hält, solange es mindestens alle 90 Tage benutzt wird.

## Einrichtung Schritt für Schritt

Voraussetzungen: Node.js ≥ 24, Azure CLI (`az`), Entra-Admin-Rechte für Schritt 1.

1. **App registrieren** (einmalig, als Admin – erledigt am 20.10.2026):
   ```bash
   npm install
   ./scripts/register-app.sh            # Standard: praxis-graphapi, praxis@lilli-nebel.de
   cp .env.example .env                 # ausgegebene Werte eintragen
   ```
2. **Anmelden:**
   ```bash
   npm run login
   ```
   Es erscheint ein Code und <https://microsoft.com/devicelogin>. Im Browser (privates Fenster)
   den Code eingeben und **als praxis@lilli-nebel.de** anmelden. Die Rechte sind schon vom Admin
   bestätigt; es kommt keine weitere Rückfrage.
3. **Prüfen:**
   ```bash
   npm run pruefen
   ```
   Zeigt Konto, Posteingang (nur Anzahl), Kalender, OneDrive (Belegung) und ob alle Rechte im
   Token stehen. Gibt keine Betreffs, Absender oder Dateinamen aus.

## Befehle

Jeder Befehl, der etwas verändert, ist ohne `--ausfuehren` nur ein Probelauf.

| Befehl | Was er tut |
|---|---|
| `npm run pruefen` | Verbindung prüfen (nur Zahlen) |
| `npm run rechnungen` | Rechnungseingang (Prompt 4): Lieferantenrechnungen (PDF) aus dem Ordner „Posteingang/Rechnungen“ bzw. dem Posteingang erkennen, nach `<ziel>/JJJJ/MM/<datum>_<lieferant>_<sha8>.pdf` ablegen, Mail markieren und nach „Rechnungen/Verarbeitet“ verschieben. Patientenpost wird nur mit „Prüfen – Patient“ markiert, nie abgelegt. Probelauf nur mit Zahlen; `--details` zeigt Lieferant und Ablageort; `--ausfuehren` braucht `DATABASE_URL` und `rechnungen.ziel` |
| `npm run termin -- --titel … --beginn 2026-11-03T09:30 --ende 2026-11-03T10:00` | Termin im Praxiskalender, deutsche Zeit, ohne Einladungen |
| `npm run entwurf -- --an … --betreff … --text …` (oder `--datei brief.txt`) | Mail als **Entwurf** im Praxispostfach – senden tut Lilli in Outlook oder Apple Mail |
| `npm run db:migrieren` | Datenbankschema anlegen bzw. fortschreiben |
| `npm run rechnungen:zaehlen -- --jahr 2026 [--mit-geloeschten]` | Bestandsaufnahme: Mails mit Rechnungs-PDF zählen, je Ordnergruppe (nur Zahlen, verändert nichts) |
| `npm run rechnungen:uebernahme -- --von 2025-12-01 [--bezahlt-bis …] [--mit-geloeschten]` | Altbestand aus allen Ordnern ablegen; bis zum Stichtag bezahlte gleich ins Archiv (`--ausfuehren`) |
| `npm run zahlungen [-- --quelle outlook\|lexware]` | Bezahlte Rechnungen ins Exchange-Archiv – heute über Lillis Kategorie in Outlook, ab Tarif XL aus Lexware (`--ausfuehren`) |
| `npm run kategorien` | Outlook-Kategorien des Rechnungs-Flows anlegen (`--ausfuehren`) |
| `npm run finanzjahr -- --jahr 2027` | Finanzordner eines Jahres nach Vorlage des Vorjahres anlegen, mit „Eingangsrechnungen“ (`--ausfuehren`) |
| `npm run testordner` | Gekennzeichneten Testordner für Probeläufe anlegen (`--ausfuehren`) |
| `npm run onedrive:ordner -- [--drive …] --pfad … --tiefe 3` | Ordnerbaum ansehen – nur Ordnernamen und Anzahlen |
| `npm run hilfe:vorschau -- datei.html` | Hilfeseite als eigenständige Datei zum Ansehen |
| `npm run serve` | Praxisdienst (Statusseite) auf 127.0.0.1:3300 |
| `npm test` | Prüfungen mit Graph-Attrappe – ohne Netz, ohne Microsoft |

Einstellungen für den Rechnungseingang stehen in `config/praxis.json` unter `rechnungen`: `seit`
(nur Mails ab diesem Tag), `mailordner`, `verarbeitet`, `ziel` (OneDrive-Ordner – `null`, bis er
festgelegt ist; bis dahin nur Probeläufe), `kategorien` und `lieferanten` (`{ "name": "Telekom",
"domains": ["telekom.de"] }` – nur von ihnen wird ohne Rückfrage abgelegt, alles andere landet als
„unklar“ bei Lilli). Nichts davon läuft automatisch; es gibt keinen Zeitplaner.

## Cockpit und Bereitstellung auf strato-dev

Der Praxisdienst zeigt das **Praxis-Cockpit** (`/`): Finanzen und Patienten mit ihren Seiten, Termine
heute, neue Rechnungseingänge, Terminanfragen (Kanäle vorbereitet), Änderungen der letzten 7 Tage.
Dazu `/finanzen/rechnungen`, `/status`, `/hilfe`. Nur echte Daten – fehlt eine Quelle, steht das da.

**Bereitstellen** (k3s auf strato-dev, Namespace `praxis`, mit eigener PostgreSQL):

```bash
deploy/strato-dev.sh      # baut am Server, wendet deploy/k8s/*.yaml an, richtet tailscale serve ein
```

Bauphase: erreichbar unter `http://strato-dev.<tailnet>.ts.net:10000/` im bestehenden Tailnet des
Servers, nur für `ERLAUBTE_NUTZER` (`.env`). Umhängen auf den eigenen Praxis-Tailnet: siehe
`konzept/requirements.md` N27.

**Sichtprüfung** wie in mondre – WebKit im Container am Server, kein Browser auf dem Mac:

```bash
pruefung/browser/ansehen.sh pruefung/browser/auftrag-cockpit.json "" pruefung/browser/ergebnisse
```

## Der Praxisdienst im eigenen Tailnet (Zielbild)

Der Container läuft in einem **eigenen Tailscale-Verbund der Praxis**, ohne Verbindung zu den
mondre-Projekten. Zugreifen werden Lilli Nebel (Praxisinhaberin) und Christian.

```
Lillis Gerät ──Tailscale──▶ Knoten „praxis“ (tailscale serve, HTTPS)
                              └─▶ 127.0.0.1:3300 Praxisdienst ──▶ Microsoft Graph
```

- `tailscale` – tritt mit `TS_AUTHKEY` dem Praxis-Tailnet bei und reicht
  `https://praxis.<tailnet>.ts.net` an den Dienst weiter (`tailscale/serve.json`, kein Funnel).
- `praxis` – teilt das Netz des Knotens und hört nur auf 127.0.0.1. Es gibt keinen Port auf dem
  Rechner. `tailscale serve` setzt die Kopfzeile `Tailscale-User-Login`; hereingelassen wird nur,
  wer in `ERLAUBTE_NUTZER` steht. Kernel-Modus statt Userspace, damit niemand aus dem Tailnet am
  serve vorbei direkt auf Port 3300 kommt.
- Die Anmeldung bei Microsoft kommt aus `DATA_PFAD` (Standard `./.data`, also dieselbe wie bei
  `npm run login`). Auf einem anderen Rechner: dort `npm run login` ausführen oder
  `token-cache.json` sicher hinüberkopieren (enthält den Zugang zum Praxispostfach).
- Der Dienst löst nichts aus: nur Statusseite und `/api/health`.
- Ziel ist der **Strato-Server**, nicht OrbStack auf dem Mac (siehe [konzept/requirements.md](konzept/requirements.md), E6/E12).

### Einrichten

1. **Praxis-Tailnet anlegen** auf <https://login.tailscale.com>. ⚠ lilli-nebel.de und mondre
   teilen sich den Microsoft-Mandanten: Tailscale ordnet Microsoft-Geschäftskonten nach Mandant
   zu. Läuft der mondre-Tailnet mit Microsoft-Anmeldung, landet eine Microsoft-Anmeldung als
   praxis@lilli-nebel.de womöglich im selben Tailnet. Vorher prüfen – sonst mit einer anderen
   Anmeldeart (z. B. Passkey oder ein eigenes Konto) anlegen.
2. In der Admin-Konsole **MagicDNS und HTTPS-Zertifikate** einschalten (DNS → HTTPS Certificates).
3. **Zugriffsregeln** (Access controls), mindestens:
   ```json
   {
     "tagOwners": { "tag:praxis-dienst": ["autogroup:admin"] },
     "grants": [{ "src": ["autogroup:member"], "dst": ["tag:praxis-dienst"], "ip": ["443"] }]
   }
   ```
4. **Schlüssel** (Settings → Keys → Generate auth key): wiederverwendbar nein, Tag
   `tag:praxis-dienst`. In `.env` als `TS_AUTHKEY` eintragen, dazu `ERLAUBTE_NUTZER` mit den
   Tailnet-Konten von Lilli und Christian.
5. Starten: `docker compose up -d --build`, dann `https://praxis.<tailnet>.ts.net` öffnen.
6. **Lilli einladen** (Users → Invite), Tailscale auf ihrem Gerät installieren und anmelden.

## Nachrichten an Patienten (W90, W91)

Auf der Patientenseite steht der Abschnitt „Nachricht an …“:

- **WhatsApp-Knöpfe** (an Patient und Termin) öffnen WhatsApp mit fertigem Text aus den Vorlagen
  (`src/nachrichten/vorlagen.ts`); gesendet wird vom Handy. Der Tipp wird im Kontaktverlauf vermerkt.
- **Mail-Entwurf**: Vorlage, Termin, Rechnung, eigener Text und Anhänge (Rechnungs-PDF, Unterlagen) →
  Entwurf im Praxispostfach unter „Entwürfe“; gesendet wird in Outlook oder Apple Mail. Der Verlauf
  zeigt „in Outlook öffnen“.
- **WhatsApp Cloud API** (optional, `WHATSAPP_*` in `.env`): direkter Versand nur mit Einwilligung des
  Patienten; Antworten kommen über `/whatsapp/webhook` (Signaturprüfung) als offene Einträge in den
  Kontaktverlauf. Der Webhook braucht eine öffentliche Adresse (Tailscale Funnel) – siehe E8.
- Nie Gesundheitsdaten in Nachrichten: Vorlagen enthalten nur Organisatorisches, eigener Text wird auf
  Gesundheitsbegriffe geprüft (Hinweis bei Mail, Ablehnung bei WhatsApp-Versand).

## Datenschutz

Im Postfach und im OneDrive stehen Gesundheitsdaten (Art. 9 DSGVO). Deshalb:

- `.env` und `.data/` nie einchecken, nie in Protokolle oder an eine KI geben.
- Neue Befehle geben nur aus, was zur Bedienung nötig ist; Inhalte bleiben im Arbeitsspeicher.
- Zugriff widerrufen: in Entra unter *Unternehmensanwendungen → praxis-graphapi* die Zuweisung
  oder die App entfernen, oder lokal `.data/token-cache.json` löschen.
