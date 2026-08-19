#!/bin/bash
# Script de test pour l'API d'ingestion Aegis

# Configuration (à adapter si besoin)
SLUG="mon-projet"
TOKEN=${AEGIS_INGEST_TOKEN:-"votre-token-secret"}
HOST="http://localhost:3001"
SHA=$(git rev-parse HEAD 2>/dev/null || echo "123456789")

# Simuler un retour npm audit (JSON valide)
AUDIT_OUTPUT='{
  "auditReportVersion": 2,
  "vulnerabilities": {},
  "metadata": {
    "vulnerabilities": {
      "info": 0,
      "low": 0,
      "moderate": 0,
      "high": 0,
      "critical": 0,
      "total": 0
    },
    "dependencies": 0
  }
}'

echo "Envoi de l'audit pour le projet '$SLUG' (SHA: $SHA)..."
echo "----------------------------------------"

curl -X POST "$HOST/api/ingest/$SLUG?sha=$SHA" \
     -H "X-Aegis-Token: $TOKEN" \
     -H "Content-Type: text/plain" \
     -d "$AUDIT_OUTPUT"

echo -e "\n----------------------------------------"
echo "Terminé !"
