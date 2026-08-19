#!/usr/bin/env bash
# Script pour automatiser les vérifications de base (Linting, Typage, Tests) avec Bun

# Se placer dans le dossier de l'application (app_build)
APP_DIR="$(dirname "$0")/../../../../app_build"
cd "$APP_DIR" || { echo "⚠️ Dossier app_build introuvable dans $APP_DIR"; exit 1; }

echo "🚀 Lancement des vérifications de code avec Bun dans $(pwd)..."

echo -e "\n[1/3] Vérification du formatage et linting..."
bunx eslint . --ext .ts,.tsx || echo "⚠️ Des erreurs de linting ont été trouvées (ou eslint n'est pas installé/configuré)."

echo -e "\n[2/3] Vérification du typage TypeScript..."
bunx tsc --noEmit || echo "⚠️ Des erreurs de typage ont été trouvées (ou typescript n'est pas installé/configuré)."

echo -e "\n[3/3] Lancement des tests..."
bun test || echo "⚠️ Certains tests ont échoué (ou aucun test n'a été trouvé)."

echo -e "\n✅ Vérifications terminées."
