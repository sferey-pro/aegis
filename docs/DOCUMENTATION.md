# Documentation du Projet : Aegis (Audit Aggregator)

## 1. Objectif du Projet
Aegis est un outil de centralisation et de gestion des vulnérabilités de dépendances. Conçu principalement pour les **référents sécurité** et les **Tech Leads**, son objectif est d'agréger les rapports d'audit de sécurité générés par différents gestionnaires de paquets (`npm`, `yarn`, `bun`, `composer`) provenant de multiples projets.

Plutôt que d'analyser les failles projet par projet en ligne de commande, Aegis offre un tableau de bord unique pour :
- Piloter la sécurité d'un écosystème logiciel complet.
- Prendre des décisions de triage ("Vulnérabilité exploitable", "Faux positif", etc.).
- Préparer la remédiation en générant des tickets formatés pour Jira.

## 2. Fonctionnalités Principales

### 🛡️ Triage et Agrégation des Vulnérabilités (CVEs)
- **Centralisation** : Récupère les vulnérabilités de tous les projets surveillés.
- **Déduplication intelligente** : Les vulnérabilités identiques détectées sur différents projets sont regroupées par référence (CVE/GHSA).
- **Statuts de Triage** : Permet au référent de marquer une faille comme `Atteignable`, `Non Atteignable` (Non affecté) ou `Ignoré`. Ces décisions sont persistantes même lors des ré-audits.
- **Résolution Automatique** : Connecteur avec la *GitHub Advisory Database* pour trouver automatiquement les correctifs manquants (`fixed_in`) et unifier les sévérités.

### 📊 Vue d'Ensemble et Métriques
- **Dashboard Global** : Affiche une note de santé (Grade de A à F), le nombre de projets surveillés, de failles critiques, et l'évolution dans le temps via des graphiques.
- **Top Risques** : Identification instantanée des projets les plus à risque et des vulnérabilités les plus fréquentes dans l'écosystème.

### 🎫 Intégration Jira et Remédiation
- **Générateur de Tickets** : Formate automatiquement un rapport Markdown contenant les CVEs critiques et moins importantes d'un package donné pour le copier dans Jira.
- **Détection des Dérives** : Sauvegarde un lien vers le ticket Jira associé. Si de nouvelles CVEs apparaissent sur ce package par la suite, l'outil signale que le ticket Jira n'est plus à jour.
- **Bibliothèque de Prompts IA** : Outil intégré pour stocker des instructions types facilitant la communication de remédiation envers les développeurs.

### ⚙️ Moteur d'Exécution et Console Live
- **Multi-technologies** : Supporte `npm audit`, `yarn audit`, `bun audit` et `composer audit`.
- **Intégration Git** : Calcule en direct l'avance ou le retard des dépôts locaux (`git fetch`, `git pull` intégrés).
- **Console Temps Réel (SSE)** : Diffuse en direct à tous les clients connectés les commandes exécutées sur le serveur (Git, Audit, GitHub) sans bloquer l'UI.

### 💾 Architecture et Sauvegarde
- **Base de Données** : Utilisation de SQLite embarqué, ne nécessitant aucun serveur lourd.
- **Import/Export JSON** : La configuration (projets, annotations de triage, tags) est exportable et importable en un clic sous forme de fichier JSON, permettant la portabilité complète de la base de connaissances.
- **Instantanés (Snapshots)** : Sauvegardes intégrales et rotatives de la base de données.

---

## 3. Endpoints de l'API (Backend)

Le backend, écrit en pur **Bun**, expose une API REST ultra-rapide. Voici les routes principales :

| Méthode | Endpoint | Description |
|---|---|---|
| **GET** | `/api/stats` | Métriques globales (health grade, vulnérabilités critiques, pending CVEs). |
| **GET** | `/api/history-global` | Données d'évolution historique pour les graphiques. |
| **GET** | `/api/projects` | Liste des projets, enrichis avec l'état Git live et le dernier rapport d'audit. |
| **POST** | `/api/projects` | Déclare un nouveau projet à surveiller. |
| **POST** | `/api/projects/:id/audit` | Lance le processus d'audit de sécurité sur un projet précis. |
| **POST** | `/api/projects/:id/git-fetch` | Met à jour l'état distant Git du projet. |
| **POST** | `/api/detect` | Scanne un répertoire pour détecter automatiquement les lockfiles. |
| **GET** | `/api/cves` | Récupère toutes les vulnérabilités agrégées, filtrées et triées par gravité. |
| **POST** | `/api/annotations` | Sauvegarde la décision de triage d'un référent sécurité sur une CVE. |
| **POST** | `/api/annotations/fetch-fix` | Interroge l'API GitHub pour récupérer la version corrigée d'une faille. |
| **POST** | `/api/tickets` | Associe une URL Jira à une vulnérabilité (enregistre la baseline). |
| **GET** | `/api/console` | Route *Server-Sent Events* (SSE) streamant les logs d'exécution serveur en temps réel. |
| **GET** | `/api/config/export` | Exporte la configuration et les décisions de triage en format JSON. |
| **POST** | `/api/config/import` | Restaure une configuration de sauvegarde JSON. |
