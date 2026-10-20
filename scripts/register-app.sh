#!/usr/bin/env bash
# Legt die App-Registrierung für die Praxis in Entra ID an (einmalig, als Admin ausführen).
# Vorlage: mdr-Infrastruktur/graphapi/scripts/register-app.sh
#
#   ./scripts/register-app.sh [App-Name] [Konto]
#
# - Öffentlicher Client (Gerätecode-Anmeldung, kein Client-Secret)
# - Nur delegierte Berechtigungen: die App handelt ausschließlich im Namen des angemeldeten Kontos
# - Zuweisung erforderlich: anmelden kann sich nur das eine zugewiesene Konto (Patientendaten)
# - Erteilt die Admin-Zustimmung und gibt die Werte für .env aus
# Mehrfach ausführen ist unschädlich: Vorhandenes wird erkannt und ergänzt.
set -euo pipefail

APP_NAME="${1:-praxis-graphapi}"
KONTO="${2:-praxis@lilli-nebel.de}"
GRAPH_APP_ID="00000003-0000-0000-c000-000000000000"
# Mail.ReadWrite: Posteingang lesen, Anhänge, Ordner/Kategorien · Mail.Send: aus dem Praxispostfach senden
# Files.ReadWrite: OneDrive der Praxis · Calendars.ReadWrite: Praxiskalender
SCOPES=(User.Read offline_access Mail.ReadWrite Mail.Send Files.ReadWrite Calendars.ReadWrite)

if ! az account show >/dev/null 2>&1; then
  az login --allow-no-subscriptions >/dev/null
fi
TENANT_ID="$(az account show --query tenantId -o tsv)"
echo "→ Mandant: $TENANT_ID (angemeldet als $(az account show --query user.name -o tsv))"

USER_ID="$(az ad user show --id "$KONTO" --query id -o tsv)"
echo "→ Konto: $KONTO ($USER_ID)"

APP_ID="$(az ad app list --display-name "$APP_NAME" --query '[0].appId' -o tsv)"
if [[ -n "$APP_ID" ]]; then
  echo "→ App-Registrierung '$APP_NAME' existiert bereits ($APP_ID)"
else
  APP_ID="$(az ad app create \
    --display-name "$APP_NAME" \
    --sign-in-audience AzureADMyOrg \
    --is-fallback-public-client true \
    --public-client-redirect-uris "https://login.microsoftonline.com/common/oauth2/nativeclient" \
    --query appId -o tsv)"
  echo "→ App-Registrierung '$APP_NAME' angelegt ($APP_ID)"
fi

for scope in "${SCOPES[@]}"; do
  scope_id="$(az ad sp show --id "$GRAPH_APP_ID" \
    --query "oauth2PermissionScopes[?value=='$scope'].id | [0]" -o tsv)"
  az ad app permission add --id "$APP_ID" --api "$GRAPH_APP_ID" \
    --api-permissions "$scope_id=Scope" --only-show-errors >/dev/null
  echo "  ✓ $scope"
done

az ad sp show --id "$APP_ID" >/dev/null 2>&1 || az ad sp create --id "$APP_ID" >/dev/null
SP_ID="$(az ad sp show --id "$APP_ID" --query id -o tsv)"

# Nur zugewiesene Konten dürfen sich anmelden – und zugewiesen wird nur das Praxiskonto
az ad sp update --id "$SP_ID" --set appRoleAssignmentRequired=true
if [[ -z "$(az rest --method get \
    --url "https://graph.microsoft.com/v1.0/servicePrincipals/$SP_ID/appRoleAssignedTo" \
    --query "value[?principalId=='$USER_ID'].id | [0]" -o tsv)" ]]; then
  # Rolle 00000000-…: „Standardzugriff“, wenn die App keine eigenen Rollen hat
  az rest --method post \
    --url "https://graph.microsoft.com/v1.0/servicePrincipals/$SP_ID/appRoleAssignedTo" \
    --headers "Content-Type=application/json" \
    --body "{\"principalId\":\"$USER_ID\",\"resourceId\":\"$SP_ID\",\"appRoleId\":\"00000000-0000-0000-0000-000000000000\"}" \
    >/dev/null
fi
echo "→ Zuweisung erforderlich, zugewiesen: $KONTO"

# Welche Berechtigung in der erteilten Zustimmung noch fehlt (Ausgabe und Rückgabe 0), oder
# Rückgabe 1, wenn alle da sind.
fehlende_zustimmung() {
  local erteilt scope
  erteilt=" $(az ad app permission list-grants --id "$APP_ID" --query '[].scope' -o tsv 2>/dev/null | tr '\n\t' '  ') "
  for scope in "${SCOPES[@]}"; do
    [[ "$erteilt" == *" $scope "* ]] || { echo "$scope"; return 0; }
  done
  return 1
}

# Die Zustimmung schlägt direkt nach dem Anlegen manchmal fehl, bis Entra repliziert hat – und sie
# gelingt manchmal zu früh, dann für den Stand VOR der neuen Berechtigung (graphapi, 12.10.2026).
# Deshalb zählt nicht die Rückgabe des Befehls, sondern was danach in der Zustimmung steht.
for attempt in 1 2 3 4 5 6; do
  az ad app permission admin-consent --id "$APP_ID" 2>/dev/null || true
  sleep 10
  if ! offen="$(fehlende_zustimmung)"; then
    echo "→ Admin-Zustimmung erteilt"
    break
  fi
  [[ $attempt == 6 ]] && { echo "⚠ Admin-Zustimmung unvollständig ($offen fehlt) – bitte im Entra-Portal erteilen"; break; }
done

cat <<EOF

In .env eintragen:
GRAPH_TENANT_ID=$TENANT_ID
GRAPH_CLIENT_ID=$APP_ID
GRAPH_KONTO=$KONTO
EOF
