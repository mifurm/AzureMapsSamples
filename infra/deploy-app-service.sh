#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-rg-geoap}"
LOCATION="${AZURE_LOCATION:-polandcentral}"
APP_SERVICE_PLAN_SKU="${AZURE_APP_SERVICE_PLAN_SKU:-S1}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

command -v az >/dev/null || {
  echo "Azure CLI is required: https://aka.ms/InstallAzureCli" >&2
  exit 1
}

command -v zip >/dev/null || {
  echo "zip is required to package the app." >&2
  exit 1
}

az account show >/dev/null 2>&1 || {
  echo "Sign in first with: az login" >&2
  exit 1
}

SUBSCRIPTION_ID="$(az account show --query id --output tsv)"
APP_NAME="${AZURE_WEBAPP_NAME:-geoap-${SUBSCRIPTION_ID:0:8}}"
APP_SERVICE_PLAN_NAME="${AZURE_APP_SERVICE_PLAN_NAME:-$APP_NAME-plan}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Create it from .env.example and set AZURE_MAPS_SUBSCRIPTION_KEY." >&2
  exit 1
fi

AZURE_MAPS_SUBSCRIPTION_KEY="$(sed -nE 's/^[[:space:]]*AZURE_MAPS_SUBSCRIPTION_KEY[[:space:]]*=[[:space:]]*(.*)[[:space:]]*$/\1/p' "$ENV_FILE" | tail -n 1)"
AZURE_MAPS_SUBSCRIPTION_KEY="${AZURE_MAPS_SUBSCRIPTION_KEY%\"}"
AZURE_MAPS_SUBSCRIPTION_KEY="${AZURE_MAPS_SUBSCRIPTION_KEY#\"}"
AZURE_MAPS_SUBSCRIPTION_KEY="${AZURE_MAPS_SUBSCRIPTION_KEY%\'}"
AZURE_MAPS_SUBSCRIPTION_KEY="${AZURE_MAPS_SUBSCRIPTION_KEY#\'}"

if [[ -z "${AZURE_MAPS_SUBSCRIPTION_KEY:-}" ]]; then
  echo "AZURE_MAPS_SUBSCRIPTION_KEY is required in $ENV_FILE." >&2
  exit 1
fi

echo "Creating or updating resource group: $RESOURCE_GROUP"
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output none

echo "Deploying App Service resources: $APP_NAME"
APP_URL="$(az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file "$ROOT_DIR/infra/main.bicep" \
  --parameters \
    location="$LOCATION" \
    appName="$APP_NAME" \
    appServicePlanName="$APP_SERVICE_PLAN_NAME" \
    appServicePlanSku="$APP_SERVICE_PLAN_SKU" \
    azureMapsSubscriptionKey="$AZURE_MAPS_SUBSCRIPTION_KEY" \
  --query properties.outputs.appUrl.value \
  --output tsv)"

PACKAGE_DIR="$(mktemp -d -t geoap-deploy.XXXXXX)"
PACKAGE_FILE="$PACKAGE_DIR/geoap-deploy.zip"
trap 'rm -rf "$PACKAGE_DIR"' EXIT

echo "Packaging app"
(
  cd "$ROOT_DIR"
  zip -qr "$PACKAGE_FILE" \
    package.json \
    server.mjs \
    public \
    -x '.env' '.env.*' 'node_modules/*' '.git/*'
)

echo "Uploading package"
az webapp deploy \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_NAME" \
  --src-path "$PACKAGE_FILE" \
  --type zip \
  --output none

echo "App deployed: $APP_URL"