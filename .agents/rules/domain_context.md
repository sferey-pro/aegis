# Contexte du Domaine Métier

*Cette règle système s'applique obligatoirement à **TOUS LES AGENTS** (PM, Engineer, QA, DevOps) lorsqu'ils traitent une requête de l'utilisateur. Elle complète les objectifs et le contexte global décrits dans le fichier `CONTEXT.md` situé à la racine du projet.*

## 1. Moteur Backend (Bun + SQLite)
- **Runtime Bun & Sous-processus** : Le serveur utilise Bun (`Bun.serve`) pour l'API HTTP et les flux. L'exécution des outils d'audit (`npm audit`, `yarn audit`, `bun audit`, `composer audit`) et des commandes Git se fait **exclusivement via des sous-processus sans shell** (pour éviter toute injection).
- **Base de Données Embarquée (SQLite)** : L'historique, les projets, les tags, les annotations de triage et les requêtes IA sont stockés dans un fichier SQLite (`audit.sqlite`) géré par le driver natif Bun avec une connexion paresseuse. Aucune base de données externe n'est requise.
- **Console Live (SSE)** : Les commandes exécutées sont diffusées en temps réel sur un flux Server-Sent Events (SSE) aux clients connectés. Ce flux est purement volatil et n'est jamais persisté.
- **Intégrations (Git & GitHub)** : Le système interroge en direct l'état local et distant des dépôts Git (fetch, pull, avance/retard, dirty state). Il s'intègre également à la GitHub Advisory Database pour récupérer des informations de sécurité manquantes (version corrigée, sévérité), en gérant activement le rate-limit HTTP.
- **Stratégie de Sauvegarde** : Double mécanisme : un système d'import/export JSON idempotent pour la configuration métier (projets, annotations, prompts) et des snapshots SQLite complets (`VACUUM INTO`) pour l'historique d'audit global.

## 2. Interface Utilisateur (Dashboard Sécurité)
- **Tableau de Bord Centralisé** : L'interface permet l'agrégation transversale des rapports de vulnérabilités pour le référent sécurité. Elle offre un triage interactif par (CVE, projet) et génère des contenus Markdown préparés pour Jira, associés à des liens persistants.
- **Stack UI Moderne** : Le projet repose sur React 19, Tailwind CSS 4, Shadcn UI et Zustand (comme défini dans le Blueprint). Le design doit être orienté "flat design", dense et résolument professionnel.
- **Performance & Contrôle** : Le client orchestre les audits globaux de manière concurrente (parallélisme borné, orchestré côté navigateur) et applique des filtres réactifs (par tags, criticité, ou état de triage).

## 3. Garde-fous (Guardrails)
- **Sécurité d'exécution** : Aucune commande externe ne doit être exécutée via une couche shell. Les arguments doivent être passés sous forme de tableau.
- **Sobriété Réseau** : Les appels vers GitHub (Advisory Database) se font uniquement *à la demande* du client ou lors d'une action manuelle, et jamais de manière asynchrone cachée pendant l'exécution d'un audit de lockfile.
- **Déduplication & Intégrité** : Le backend bloque la relance d'audits inutiles en validant le SHA commit Git et le statut "dirty". L'agrégation CVE déduplique rigoureusement via un triplet (CVE, package, titre).
- **Architecture Minimaliste** : N'ajoutez aucune dépendance lourde d'infrastructure (PostgreSQL, Redis, Firebase, etc.). L'écosystème doit rester strictement confiné au duo Bun / SQLite pour garantir portabilité et performances fulgurantes.
