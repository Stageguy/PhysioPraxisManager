# PhysioPraxisManager

Verbindung der Privatpraxis Lilli Nebel zu Microsoft 365 über MS Graph: Exchange (Mail, Kalender)
und OneDrive von **praxis@lilli-nebel.de**. Das Muster ist dasselbe wie in
`mdr-Infrastruktur/graphapi`: öffentlicher Client, Gerätecode-Anmeldung, nur delegierte Rechte,
kein Client-Secret. Die App handelt ausschließlich im Namen des Praxiskontos.

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
| `npm run anhaenge` | Mailanhänge aus dem Posteingang nach OneDrive: `<ziel>/<JJJJ-MM>/<JJJJ-MM-TT> <Name>`, danach Kategorie „In OneDrive abgelegt“ an der Mail. Probelauf nur mit Zahlen; `--details` zeigt Betreff und Dateinamen, `--hoechstens 5` begrenzt |
| `npm run termin -- --titel … --beginn 2026-11-03T09:30 --ende 2026-11-03T10:00` | Termin im Praxiskalender, deutsche Zeit, ohne Einladungen |
| `npm run senden -- --an … --betreff … --text …` (oder `--datei brief.txt`) | Mail aus praxis@lilli-nebel.de; die Signatur setzt Exchange |
| `npm run serve` | Praxisdienst (Statusseite) auf 127.0.0.1:3300 |
| `npm test` | Prüfungen mit Graph-Attrappe – ohne Netz, ohne Microsoft |

Einstellungen für die Anhänge stehen in `config/praxis.json`: `seit` (nur Mails ab diesem Tag),
`ziel` (OneDrive-Ordner), `kategorie`. **Vor dem ersten `--ausfuehren` den Zielordner festlegen** –
der Ordner wird beim Ausführen angelegt, falls er fehlt. Nichts davon läuft automatisch; es gibt
keinen Zeitplaner.

## Der Praxisdienst im eigenen Tailnet

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

## Datenschutz

Im Postfach und im OneDrive stehen Gesundheitsdaten (Art. 9 DSGVO). Deshalb:

- `.env` und `.data/` nie einchecken, nie in Protokolle oder an eine KI geben.
- Neue Befehle geben nur aus, was zur Bedienung nötig ist; Inhalte bleiben im Arbeitsspeicher.
- Zugriff widerrufen: in Entra unter *Unternehmensanwendungen → praxis-graphapi* die Zuweisung
  oder die App entfernen, oder lokal `.data/token-cache.json` löschen.
