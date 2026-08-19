---
name: code-review
description: Examine les modifications de code pour déceler les bugs, les problèmes de style et s'assurer du respect des bonnes pratiques. À utiliser lors de la revue de PR ou pour vérifier la qualité du code.
---

# Compétence : Revue de Code

Lors de la revue de code, suivez systématiquement ces étapes :

## Liste de vérification (Checklist)

1. **Exactitude (Correctness)** : Le code fait-il ce qu'il est censé faire ? La logique métier est-elle correcte ?
2. **Cas limites (Edge cases)** : Les conditions d'erreur, les valeurs nulles et les entrées inattendues sont-elles gérées correctement ?
3. **Style et Conventions** : Le code respecte-il les conventions de nommage et de style du projet (linting, formatage) ?
4. **Performance** : Y a-t-il des inefficacités évidentes (boucles imbriquées inutiles, requêtes N+1, fuites de mémoire) ?
5. **Sécurité** : Le code introduit-il des vulnérabilités potentielles (injections, exposition de données sensibles) ?
6. **Tests** : Le code est-il accompagné de tests pertinents et suffisants ?

## Comment formuler vos retours (Feedback)

- **Soyez précis** : Indiquez exactement ce qui doit être modifié (utilisez des références ou numéros de ligne si possible).
- **Expliquez le "pourquoi"** : Ne vous contentez pas de dire ce qui est mal, expliquez pourquoi c'est problématique afin de favoriser l'apprentissage.
- **Soyez constructif** : Suggérez des alternatives ou fournissez des exemples de code lorsque cela est possible.
- **Restez bienveillant** : Critiquez le code, pas la personne.

## Fichiers de Référence et Outils

Consultez systématiquement ces ressources avant ou pendant votre revue :
- **Guide de Style** : `references/styleguide.md` (Contient les règles pour Bun, React 19, Tailwind et Shadcn)
- **Modèle de Rapport** : `resources/review_template.md` (Utilisez ce format pour rendre votre compte-rendu)
- **Automatisation** : Exécutez `scripts/run_linters.sh` au début de votre revue pour vérifier le typage et le formatage.