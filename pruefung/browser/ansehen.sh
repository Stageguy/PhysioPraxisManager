#!/usr/bin/env bash
# ============================================================================
# Seiten im Browser ansehen und vermessen – im Container am Server, mit WebKit (Safari-Engine).
# Auf dem Mac läuft kein Browser; Chrome wird nicht gebraucht.
#
#   pruefung/browser/ansehen.sh <auftrag.json> [<ersatz-ordner>] [<ausgabe-ordner>]
#
# Der Auftrag nennt Seiten, Fensterbreiten und die zu vermessende Tabelle (siehe ansehen.mjs und
# auftrag-tabellen.json). Ein Ersatz-Ordner wird mit hinübergenommen; `ersetzen` im Auftrag zeigt
# auf Dateien darin (Weg relativ zum Werkzeug, z. B. "ersatz/css/style.css"). Fotos und bericht.json
# kommen in den Ausgabe-Ordner (Vorgabe: ./ergebnisse).
#
# Der Container nutzt das Netz des Servers (--network host) und erreicht die Anwendungen so unter
# 127.0.0.1. Das Abbild (mcr.microsoft.com/playwright, feste Fassung) bringt die Browser mit;
# playwright-core in derselben Fassung wird einmal in den Arbeitsordner am Server geholt.
# ============================================================================
set -euo pipefail

AUFTRAG="${1:?Aufruf: ansehen.sh <auftrag.json> [<ersatz-ordner>] [<ausgabe-ordner>]}"
ERSATZ="${2:-}"
AUSGABE="${3:-ergebnisse}"
HOST="${PRUEFBROWSER_HOST:-dev-server}"
ABBILD="mcr.microsoft.com/playwright:v1.49.1-noble"
HIER="$(cd "$(dirname "$0")" && pwd)"
ZIEL="praxis-pruefbrowser"

ssh "$HOST" "mkdir -p '$ZIEL' && rm -rf '$ZIEL/ergebnisse' '$ZIEL/ersatz'"
rsync -az --exclude node_modules --exclude ergebnisse "$HIER/package.json" "$HIER/package-lock.json" "$HIER/ansehen.mjs" "$HOST:$ZIEL/"
rsync -az "$AUFTRAG" "$HOST:$ZIEL/auftrag.json"
[ -n "$ERSATZ" ] && [ -d "$ERSATZ" ] && rsync -az "$ERSATZ/" "$HOST:$ZIEL/ersatz/"

ssh "$HOST" "cd '$ZIEL' && docker run --rm --network host --ipc=host -v \"\$PWD\":/work -w /work $ABBILD \
  sh -c '[ -d node_modules ] || npm ci --silent --no-audit --no-fund; node ansehen.mjs auftrag.json'"

mkdir -p "$AUSGABE"
rsync -az "$HOST:$ZIEL/ergebnisse/" "$AUSGABE/"
echo "Ergebnisse: $AUSGABE"
