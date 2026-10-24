#!/usr/bin/env bash
# ============================================================================
# Praxisdienst auf strato-dev bereitstellen (k3s) – wiederholbar.
#
#   deploy/strato-dev.sh prod    # Produktion: Namespace praxis,      Port 3300, Tailscale :10000
#   deploy/strato-dev.sh test    # Testumgebung: Namespace praxis-test, Port 3301, Tailscale :10001
#
# Beide nutzen das echte Postfach praxis@lilli-nebel.de; die Testumgebung mit harten Schranken
# (src/umgebung.ts, requirements N28): erfundene Patienten, Mails nur an TEST_ADRESSEN usw.
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

ZIEL_UMGEBUNG="${1:-}"
case "$ZIEL_UMGEBUNG" in
  prod) NS=praxis;      PORT=3300; SERVE_PORT=10000; UMGEBUNG="" ;;
  test) NS=praxis-test; PORT=3301; SERVE_PORT=10001; UMGEBUNG=test ;;
  *) echo "Aufruf: deploy/strato-dev.sh prod|test"; exit 1 ;;
esac
HOST="${PRAXIS_HOST:-dev-server}"
HIER="$(cd "$(dirname "$0")/.." && pwd)"
ZIEL="praxis/PhysioPraxisManager"
FASSUNG="$(node -p "require('$HIER/package.json').version")-$(git -C "$HIER" rev-parse --short HEAD)$(git -C "$HIER" diff --quiet && git -C "$HIER" diff --cached --quiet || echo "-arbeit")"
BILD="physio-praxis-manager:$FASSUNG"

cd "$HIER"
[ -f .env ] || { echo "✗ .env fehlt"; exit 1; }
[ -s .data/token-cache.json ] || { echo "✗ .data/token-cache.json fehlt – erst npm run login"; exit 1; }
ERLAUBT="${ERLAUBTE_NUTZER:-$(grep -E '^ERLAUBTE_NUTZER=' .env | cut -d= -f2-)}"
[ -n "$ERLAUBT" ] || { echo "✗ ERLAUBTE_NUTZER leer – in .env eintragen (Tailnet-Konto, z. B. name@icloud.com)"; exit 1; }
TESTADR="$(grep -E '^TEST_ADRESSEN=' .env | cut -d= -f2- || true)"
[ "$ZIEL_UMGEBUNG" != test ] || [ -n "$TESTADR" ] || { echo "✗ TEST_ADRESSEN leer – die Testumgebung braucht sie"; exit 1; }
# Manifeste für diese Umgebung
manifest() { sed -e "s|__NS__|$NS|g" -e "s|__PORT__|$PORT|g" "deploy/k8s/$1"; }

echo "→ Dateien nach $HOST:$ZIEL"
ssh "$HOST" "mkdir -p '$ZIEL'"
git ls-files --cached --others --exclude-standard -z \
  | grep -zv -E '^(konzept/|deploy/|test/)' \
  | rsync -az --delete-after --from0 --files-from=- ./ "$HOST:$ZIEL/"

echo "→ Bild $BILD bauen"
# k3s läuft auf strato-dev mit Docker als Laufzeit (--docker): gebaute Bilder sind sofort verfügbar
ssh "$HOST" "cd '$ZIEL' && docker build -q -t '$BILD' . >/dev/null"

echo "→ $ZIEL_UMGEBUNG: Namespace $NS und Secrets"
manifest namespace.yaml | ssh "$HOST" kubectl apply -f - >/dev/null
# Werte für den Dienst – nur was er braucht, nicht die ganze .env
{
  grep -E '^(GRAPH_TENANT_ID|GRAPH_CLIENT_ID|GRAPH_KONTO)=' .env
  echo "ERLAUBTE_NUTZER=$ERLAUBT"
  echo "PRAXIS_UMGEBUNG=$UMGEBUNG"
  echo "TEST_ADRESSEN=$TESTADR"
  # Lexware nur in der Produktion – die Testumgebung schreibt keine Rechnungen
  [ "$ZIEL_UMGEBUNG" = prod ] && grep -E '^LEXWARE_API_KEY=.+' .env || true
} | ssh "$HOST" "kubectl -n $NS create secret generic praxis-env --from-env-file=/dev/stdin --dry-run=client -o yaml | kubectl apply -f - >/dev/null"
ssh "$HOST" "kubectl -n $NS get secret praxis-db >/dev/null 2>&1 || kubectl -n $NS create secret generic praxis-db --from-literal=passwort=\$(openssl rand -hex 24) >/dev/null"
# Hauptschlüssel des Patienten-Tresors: einmalig je Umgebung, danach nie mehr neu erzeugen (§4b).
# Notfallkopie: ssh $HOST kubectl -n $NS get secret praxis-tresor -o jsonpath='{.data.PRAXIS_TRESOR_SCHLUESSEL}' | base64 -d
if ! ssh "$HOST" "kubectl -n $NS get secret praxis-tresor >/dev/null 2>&1"; then
  echo "→ Tresor-Schlüssel für $NS neu erzeugt – Notfallkopie sichern (siehe deploy/strato-dev.sh)"
  node src/cli/tresor-schluessel.ts | ssh "$HOST" "kubectl -n $NS create secret generic praxis-tresor --from-env-file=/dev/stdin >/dev/null"
fi
if ! ssh "$HOST" "kubectl -n $NS get secret praxis-anmeldung >/dev/null 2>&1"; then
  ssh "$HOST" "kubectl -n $NS create secret generic praxis-anmeldung --from-file=token-cache.json=/dev/stdin >/dev/null" < .data/token-cache.json
  echo "  Microsoft-Anmeldung übernommen"
fi

echo "→ Datenbank und Dienst"
manifest postgres.yaml | ssh "$HOST" kubectl apply -f - >/dev/null
manifest praxis.yaml | sed "s|image: BILD|image: $BILD|" | ssh "$HOST" kubectl apply -f - >/dev/null
manifest preisquellen.yaml | sed "s|image: BILD|image: $BILD|" | ssh "$HOST" kubectl apply -f - >/dev/null
ssh "$HOST" "kubectl -n $NS rollout status statefulset/praxis-db --timeout=180s && kubectl -n $NS rollout status deployment/praxis-dienst --timeout=180s"

echo "→ tailscale serve :$SERVE_PORT → 127.0.0.1:$PORT"
ssh "$HOST" "tailscale serve --bg --http=$SERVE_PORT http://127.0.0.1:$PORT >/dev/null"
NAME="$(ssh "$HOST" "tailscale status --json" | python3 -c 'import sys,json; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')"
echo "✓ $ZIEL_UMGEBUNG – Praxisdienst $FASSUNG: http://$NAME:$SERVE_PORT/  (nur für: $ERLAUBT)"
