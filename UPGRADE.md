# 🚀 Suggestions d'Évolution (Expert Sécurité)

Ce document liste les améliorations fonctionnelles identifiées pour pallier les manques de la version 1, en particulier sur l'axe de la **rapidité de communication avec les autres équipes (Dev/Ops/Produit)** et le suivi des SLAs.

## ⏳ 1. Suivi des SLAs (Time to Remediate)
Dans la V1, l'outil se concentre sur l'état instantané (le dernier run). 
- **Le besoin :** En sécurité, il est crucial de savoir *depuis quand* une vulnérabilité est présente pour faire appliquer les délais de correction (ex: 48h pour Critique, 7j pour Élevée).
- **L'évolution :** Ajouter un champ `first_seen_at` sur les occurrences de CVE. Cela permettra de calculer l'âge de la faille et de mettre en surbrillance rouge les CVE "Hors SLA" lors des revues.

## 👥 2. Propriété et Routage (Owners)
Les "Tags" permettent d'identifier les équipes (ex: `team-core`), mais ne sont pas actionnables directement.
- **Le besoin :** Savoir immédiatement qui contacter sans avoir à chercher dans un annuaire d'entreprise externe.
- **L'évolution :** Ajouter un champ `owner` (email, nom d'équipe ou lien Slack) aux `projects`. Génération de liens de type `mailto:` ou raccourcis Slack directs depuis la vue d'une CVE.

## 📢 3. Communication de masse et Export
Le générateur Markdown pour Jira est parfait pour le grain fin (projet par package), mais devient fastidieux à l'échelle.
- **Le besoin :** Gérer la communication pour plusieurs projets d'un coup (ex: Bilan mensuel pour la Team Frontend).
- **L'évolution :** 
  - Bouton "Copier un résumé global" (filtré par Tag) regroupant les alertes de plusieurs projets.
  - Option d'export CSV/PDF du tableau de bord pour les reportings de conformité.

## 🔔 4. Notifications Push (Webhooks)
La V1 nécessite une démarche proactive (Pull) du référent sécurité pour constater les dérives ou les nouvelles CVE.
- **Le besoin :** Être alerté en temps réel sans avoir les yeux rivés sur l'outil.
- **L'évolution :** Ajouter une configuration de webhook (Slack/Teams). Lors d'un run "Tout auditer", l'outil pousse un message si de `newCves` critiques sont découvertes ou si la baseline d'un ticket Jira a dérivé.

## 🤖 5. Exploitation des Prompts IA
L'application dispose d'une bibliothèque de prompts, mais ne l'intègre pas dans le flux de travail de communication.
- **Le besoin :** Rédiger très vite des conseils de remédiation précis et compréhensibles par un développeur junior.
- **L'évolution :** Bouton "Générer un message avec l'IA" sur la fiche d'une CVE. L'outil fusionnerait le contexte de la faille (nom du package, sévérité, `fixed_in`) avec un prompt sélectionné dans la bibliothèque pour recracher un brouillon prêt à être envoyé.

## 🎨 6. Évolution Continue de l'UI/UX
L'interface a récemment fait un bond qualitatif majeur (design *glassmorphism*, centralisation des largeurs de pages, densification des tableaux avec `tfoot` pour la pagination).
- **Le besoin :** Maintenir une interface premium qui s'adapte à tous les profils d'utilisateurs.
- **L'évolution :**
  - Mettre en place un système de thèmes clair/sombre basculable (Light/Dark mode) pour l'accessibilité.
  - Importer/Exporter la configuration depuis la page *Paramètres* sous forme de fichier JSON cliquable pour simplifier le partage de contexte entre différents référents.
  - Rendre les graphiques de la *Vue d'ensemble* cliquables pour atterrir directement sur les CVE concernées lors des pics de vulnérabilités.
