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

Le backend, écrit en pur **Bun**, expose une API REST ultra-rapide. Les 33 routes d'API
déclarées sont exercées par des tests fonctionnels sur un vrai serveur — voir
[`TESTS.md`](./TESTS.md) § 4.

### Projets

| Méthode | Endpoint | Description |
|---|---|---|
| **GET** | `/api/projects` | Liste des projets, enrichis avec l'état Git live et le dernier run. |
| **POST** | `/api/projects` | Déclare un nouveau projet (201). 403 hors `AEGIS_ALLOWED_ROOTS`, 409 si un projet vise déjà la même cible d'audit. |
| **GET** | `/api/projects/:id` | Un projet enrichi. 404 si inconnu. |
| **PUT** | `/api/projects/:id` | Met à jour un projet. 404 avant toute validation si l'id est inconnu. |
| **DELETE** | `/api/projects/:id` | Supprime un projet (cascade sur runs, annotations, tickets). |
| **POST** | `/api/projects/detect` | Détecte l'outil d'audit d'un répertoire par ses fichiers de verrouillage. |
| **POST** | `/api/projects/:id/audit` | Lance l'audit d'un projet. `?force=true` contourne la déduplication. |
| **POST** | `/api/projects/:id/git-fetch` | `git fetch --verbose` sur la racine du dépôt. |
| **POST** | `/api/projects/:id/git-pull` | `git pull --ff-only` — jamais de commit de fusion. |

### Vulnérabilités et triage

| Méthode | Endpoint | Description |
|---|---|---|
| **GET** | `/api/cves` | Toutes les vulnérabilités agrégées, regroupées par CVE et triées par gravité. |
| **POST** | `/api/annotations` | Enregistre la décision de triage sur une CVE. 404 si le projet n'existe pas. |
| **POST** | `/api/advisories/sync` | Force le rafraîchissement d'un avis GitHub, en contournant le cache. |
| **DELETE** | `/api/advisories/cache` | Vide entièrement le cache d'avis. |

### Audit global et ingestion CI

| Méthode | Endpoint | Description |
|---|---|---|
| **POST** | `/api/audit/run` | Lance l'audit de tous les projets non ignorés. 429 si un audit tourne déjà. |
| **GET** | `/api/audit/status` | État de la file : audit en cours, projet courant, progression. |
| **POST** | `/api/ingest/:slug` | Ingère un rapport poussé par un pipeline CI. Exige l'en-tête `X-Aegis-Token`. |

### Métriques

| Méthode | Endpoint | Description |
|---|---|---|
| **GET** | `/api/stats` | Métriques globales : note de santé, failles critiques, CVE en attente, top risques. |
| **GET** | `/api/history-global` | Série temporelle pour les graphiques. Paramètre `?days=`. |

### Ticketing

| Méthode | Endpoint | Description |
|---|---|---|
| **POST** | `/api/tickets` | Génère le brouillon Markdown de remédiation d'un paquet. |
| **GET** | `/api/tickets/list` | Tickets liés, par couple `(projet, paquet)`. |
| **POST** | `/api/tickets/link` | Associe manuellement une référence de ticket à un paquet. |
| **POST** | `/api/tickets/unlink` | Retire l'association. |
| **POST** | `/api/tickets/create` | Crée l'issue dans Jira (API v3, description ADF). 409 si un contenu identique a déjà été envoyé. |
| **POST** | `/api/tickets/test-connection` | Vérifie les identifiants Jira via `/rest/api/3/myself`. |

### Référentiels

| Méthode | Endpoint | Description |
|---|---|---|
| **GET / POST** | `/api/tags` | Liste et création de tags (palette fixe de 8 couleurs). |
| **DELETE** | `/api/tags/:id` | Supprime un tag (204). |
| **GET / POST** | `/api/prompts` | Bibliothèque de prompts IA. |
| **PUT / DELETE** | `/api/prompts/:id` | Met à jour ou supprime un prompt. |
| **GET / POST** | `/api/reports` | Compte-rendus d'audit global. Le détail est un instantané. |
| **DELETE** | `/api/reports/:id` | Supprime un compte-rendu. |

### Configuration et exploitation

| Méthode | Endpoint | Description |
|---|---|---|
| **GET / PUT** | `/api/settings` | Réglages clé/valeur. Seule `AUDIT_MAX_AGE_HOURS` est contrainte. |
| **GET** | `/api/config/export` | Exporte projets, réglages et annotations. Les secrets sont masqués par `***`. |
| **POST** | `/api/config/import` | Restaure un export. Une valeur `***` n'écrase pas le secret en place. |
| **POST** | `/api/snapshots/create` | Instantané intégral de la base (`VACUUM INTO`). |
| **POST** | `/api/snapshots/restore` | Restaure l'instantané puis provoque le redémarrage du serveur. |
| **GET** | `/api/console` | Flux *Server-Sent Events* des commandes exécutées. Volatil, sans rejeu. |

> **Note.** Un chemin `/api/...` inconnu, ou une route atteinte avec une méthode
> non déclarée, ne renvoie ni 404 ni 405 : la requête tombe dans le fourre-tout
> `/*` et reçoit l'application cliente en HTML. À connaître pour déboguer un
> appel mal orthographié. Voir [`TESTS.md`](./TESTS.md) § 5.

---

## 4. Qualité et tests

| Aspect | État |
|---|---|
| Tests | **1151**, 0 échec, colocalisés (chaque fichier de code a son test à côté) |
| Typage | `tsc --noEmit` en 0, zéro `any` explicite |
| Lint | `biome check --error-on-warnings` en 0 (politique zéro warning) |
| CI | 4 portes : install, lint, typecheck, tests |

- [`TESTING.md`](./TESTING.md) — comment on teste : les deux étages, le harnais,
  les conventions, les pièges rencontrés.
- [`TESTS.md`](./TESTS.md) — ce qui est couvert, module par module, et les 22
  écarts au contrat épinglés par des tests.
