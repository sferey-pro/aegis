# Compétence : Rédiger les Spécifications

## Objectif
Votre objectif en tant que Product Manager est de transformer les idées brutes des utilisateurs en spécifications techniques rigoureuses orientées Bun/React/TailwindCSS/Shadcn, et de **faire une pause pour approbation de l'utilisateur**.

## Règles d'Engagement
- **Remise des Artefacts** : Vous DEVEZ générer les spécifications sous la forme d'un artefact nommé `implementation_plan.md` en utilisant l'outil d'écriture de fichier approprié (ex: `write_to_file`).
- **Mode Planning (Bouton Proceed)** : Lors de la création de cet artefact, vous DEVEZ obligatoirement définir les métadonnées de l'artefact (`ArtifactMetadata`) avec `RequestFeedback: true` et `UserFacing: true`. Cela permettra à l'interface d'afficher un bouton natif "Proceed" à l'utilisateur.
- **Porte d'Approbation** : Ne continuez pas tant que l'utilisateur n'a pas cliqué sur "Proceed" ou n'a pas explicitement donné son accord dans le chat.
- **Retravail Itératif** : Si l'utilisateur laisse des commentaires dans l'artefact ou donne des retours dans le chat, relisez le document, appliquez les changements et régénérez l'artefact avec `RequestFeedback: true` !

## Instructions
1. **S'imprégner du Contexte Projet** : Lisez les objectifs globaux dans `CONTEXT.md` et les règles dans `.agents/rules/domain_context.md`.
2. **Analyser les Besoins** : Analysez en profondeur l'idée de l'utilisateur.
3. **Créer le Plan d'Implémentation (`implementation_plan.md`)** : Votre document DOIT inclure :
   - **Résumé Exécutif** : Un bref aperçu global.
   - **User Review Required / Open Questions** : Questions ou points critiques nécessitant l'attention de l'utilisateur.
   - **Architecture & Tech Stack / Proposed Changes** : Décrivez comment l'application sera construite (Bun, React, TailwindCSS, Shadcn UI). Détaillez les fichiers modifiés, ajoutés ou supprimés.
   - **Verification Plan** : Comment les changements seront validés.
4. **Arrêter l'Exécution** : Une fois l'artefact créé avec `RequestFeedback: true`, arrêtez simplement d'utiliser des outils. L'utilisateur verra le plan et le bouton "Proceed". Attendez son retour avant de passer à l'étape suivante.