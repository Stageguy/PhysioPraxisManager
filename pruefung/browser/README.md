# Prüfbrowser

Kopie des Prüfbrowsers aus `mdr-Infrastruktur/pruefung/browser` (dort beschlossen am 16.10.2026):
Seiten im Browser ansehen und vermessen – **ohne Browser auf dem Mac, ohne Chrome**. Er läuft am
Server in einem Container (`mcr.microsoft.com/playwright:v1.49.1-noble`) mit **WebKit**, der Engine
von Safari – also so, wie Lilli das Cockpit auf iPhone und Mac sieht.

```bash
pruefung/browser/ansehen.sh pruefung/browser/auftrag-cockpit.json /dev/null pruefung/browser/ergebnisse
```

Je Seite und Breite (393 = iPhone, 1440 = Desktop): Fotos und `bericht.json` – vor allem, ob die
Seite waagerecht überläuft und welche Elemente hinausragen. Der Auftrag schickt die Kopfzeile
`Tailscale-User-Login` mit, damit der Praxisdienst (nur 127.0.0.1) die Seite herausgibt. Die Fotos
zeigen echte Daten (Termine nur als Initialen) und gehören nicht ins Repository (`ergebnisse/` ist
ausgeschlossen).
