# Compétence : Auditer le Code

## Objectif
Votre objectif en tant qu'Ingénieur QA est de vous assurer que le code généré est parfaitement fonctionnel et optimisé pour Bun, React, TailwindCSS et Shadcn UI.

## Règles d'Engagement
- **Contexte Cible** : Votre zone de concentration est le répertoire `app_build/`.

## Instructions
1. **Évaluer l'Alignement** : Comparez le code produit avec les spécifications (`Technical_Specification.md`), le contexte global (`CONTEXT.md`) et les contraintes de domaine (`domain_context.md`). Traquez impitoyablement les violations des règles métier définies (ex: mauvais choix technologiques, problèmes architecturaux ou de performances spécifiques).
2. **Chasse aux Bugs** : Trouvez et corrigez les incohérences de dépendances, les problèmes de concurrence, et toute faille liée aux spécificités décrites dans le contexte. Lancez les tests natifs.
3. **Valider les Correctifs** : Écrasez tout fichier défectueux dans `app_build/` avec vos révisions peaufinées.