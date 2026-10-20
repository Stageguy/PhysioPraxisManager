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

## Datenschutz

Im Postfach und im OneDrive stehen Gesundheitsdaten (Art. 9 DSGVO). Deshalb:

- `.env` und `.data/` nie einchecken, nie in Protokolle oder an eine KI geben.
- Neue Befehle geben nur aus, was zur Bedienung nötig ist; Inhalte bleiben im Arbeitsspeicher.
- Zugriff widerrufen: in Entra unter *Unternehmensanwendungen → praxis-graphapi* die Zuweisung
  oder die App entfernen, oder lokal `.data/token-cache.json` löschen.
