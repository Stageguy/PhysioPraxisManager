#!/usr/bin/env bash
# ============================================================================
# Praxisdienst auf strato-dev bereitstellen (k3s, Namespace praxis) – wiederholbar.
#
#   deploy/strato-dev.sh
#
# 1. Arbeitskopie (ohne .env, .data, node_modules) zum Server, Bild dort bauen (k3s nutzt Docker)
# 2. Namespace, Secrets (aus .env; DB-Passwort einmalig erzeugt; Microsoft-Anmeldung nur beim
#    ersten Mal aus .data/token-cache.json), Datenbank, Dienst
# 3. tailscale serve des Servers: http://<server>.<tailnet>.ts.net:10000 → 127.0.0.1:3300
#
# Bauphase: Zugang über das bestehende Tailnet des Servers, nur für ERLAUBTE_NUTZER.
# Später auf den eigenen Praxis-Tailnet umhängen (requirements N27).
# ============================================================================
set -euo pipefail

HOST="${PRAXIS_HOST:-dev-server}"
HIER="$(cd "$(dirname "$0")/.." && pwd)"
ZIEL="praxis/PhysioPraxisManager"
FASSUNG="$(node -p "require('$HIER/package.json').version")-$(git -C "$HIER" rev-parse --short HEAD)$(git -C "$HIER" diff --quiet && git -C "$HIER" diff --cached --quiet || echo "-arbeit")"
BILD="physio-praxis-manager:$FASSUNG"
SERVE_PORT="${PRAXIS_SERVE_PORT:-10000}"

cd "$HIER"
[ -f .env ] || { echo "✗ .env fehlt"; exit 1; }
[ -s .data/token-cache.json ] || { echo "✗ .data/token-cache.json fehlt – erst npm run login"; exit 1; }
ERLAUBT="${ERLAUBTE_NUTZER:-$(grep -E '^ERLAUBTE_NUTZER=' .env | cut -d= -f2-)}"
[ -n "$ERLAUBT" ] || { echo "✗ ERLAUBTE_NUTZER leer – in .env eintragen (Tailnet-Konto, z. B. name@icloud.com)"; exit 1; }

echo "→ Dateien nach $HOST:$ZIEL"
ssh "$HOST" "mkdir -p '$ZIEL'"
git ls-files --cached --others --exclude-standard -z \
  | grep -zv -E '^(konzept/|deploy/|test/)' \
  | rsync -az --delete-after --from0 --files-from=- ./ "$HOST:$ZIEL/"

echo "→ Bild $BILD bauen"
# k3s läuft auf strato-dev mit Docker als Laufzeit (--docker): gebaute Bilder sind sofort verfügbar
ssh "$HOST" "cd '$ZIEL' && docker build -q -t '$BILD' . >/dev/null"

echo "→ Namespace und Secrets"
ssh "$HOST" kubectl apply -f - < deploy/k8s/namespace.yaml >/dev/null
# Werte für den Dienst – nur was er braucht, nicht die ganze .env
{
  grep -E '^(GRAPH_TENANT_ID|GRAPH_CLIENT_ID|GRAPH_KONTO)=' .env
  echo "ERLAUBTE_NUTZER=$ERLAUBT"
  grep -E '^LEXWARE_API_KEY=.+' .env || true
} | ssh "$HOST" "kubectl -n praxis create secret generic praxis-env --from-env-file=/dev/stdin --dry-run=client -o yaml | kubectl apply -f - >/dev/null"
ssh "$HOST" "kubectl -n praxis get secret praxis-db >/dev/null 2>&1 || kubectl -n praxis create secret generic praxis-db --from-literal=passwort=\$(openssl rand -hex 24) >/dev/null"
if ! ssh "$HOST" "kubectl -n praxis get secret praxis-anmeldung >/dev/null 2>&1"; then
  ssh "$HOST" "kubectl -n praxis create secret generic praxis-anmeldung --from-file=token-cache.json=/dev/stdin >/dev/null" < .data/token-cache.json
  echo "  Microsoft-Anmeldung übernommen"
fi

echo "→ Datenbank und Dienst"
ssh "$HOST" kubectl apply -f - < deploy/k8s/postgres.yaml >/dev/null
sed "s|image: BILD|image: $BILD|" deploy/k8s/praxis.yaml | ssh "$HOST" kubectl apply -f - >/dev/null
ssh "$HOST" "kubectl -n praxis rollout status statefulset/praxis-db --timeout=180s && kubectl -n praxis rollout status deployment/praxis-dienst --timeout=180s"

echo "→ tailscale serve :$SERVE_PORT → 127.0.0.1:3300"
ssh "$HOST" "tailscale serve --bg --http=$SERVE_PORT http://127.0.0.1:3300 >/dev/null"
NAME="$(ssh "$HOST" "tailscale status --json" | python3 -c 'import sys,json; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')"
echo "✓ Praxisdienst $FASSUNG: http://$NAME:$SERVE_PORT/  (nur für: $ERLAUBT)"
