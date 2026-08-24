# CONTEXT — Aegis, référence de comportement

> **Ce que fait cette application, et sous quelles règles.** Uniquement des données, des règles métier, des algorithmes, des endpoints et des cas limites. Aucun élément de design, d'UX, de mise en page ou de couleur n'y figure — cette discipline est héritée de la version précédente et vaut d'être conservée : elle empêche le document de vieillir au rythme de l'interface.

## Ce document a changé de nature le 23/08/2026

La version précédente était un **prompt de reconstruction** : une spécification écrite *avant* l'application, pour la faire naître, et destinée à la recréer à l'identique. L'application l'a dépassée — quatorze fonctionnalités livrées n'y figuraient pas, cinq endpoints spécifiés n'ont jamais existé, et son niveau de détail décrivait un outil plus simple que celui d'aujourd'hui.

Elle a été remplacée par **ce document découpé**, qui décrit le produit tel qu'il est construit. L'ancienne version reste consultable dans l'historique git :

```bash
git show 92ffb14:docs/CONTEXT.md
```

**Il reste normatif.** Les messages de validation y sont cités mot pour mot, les clés d'identité et les règles de déduplication y sont fixées, et les tests s'y réfèrent par numéro de section. Quand un comportement observé s'en écarte, c'est le comportement qui est en tort — ou ce document qui doit être amendé **explicitement**, jamais par dérive.

La numérotation `§1`–`§12` est inchangée, précisément pour que les 124 renvois présents dans le code restent valides. Les sections `§13`–`§15` couvrent ce qui existait sans être décrit.

---

## Objectif

Agréger les rapports de vulnérabilités de dépendances (`npm audit`, `yarn audit`, `bun audit`, `composer audit`) de plusieurs projets dans un tableau de bord unique, à destination d'un **référent sécurité**.

Pour chaque projet on déclare une racine git, éventuellement un sous-dossier de lockfile, un type et un outil. L'application lance les audits à la demande, persiste un historique, agrège les CVE par référence, permet un triage par (CVE, projet), crée des tickets Jira de remédiation, enrichit les données manquantes depuis la GitHub Advisory Database, accepte des rapports produits par une CI, et sauvegarde/restaure l'ensemble.

## Contraintes techniques

- **Runtime Bun** : un seul process sert l'API et la SPA. Sous-processus **sans shell** — arguments passés en tableau, aucune injection possible.
- **SQLite embarqué, deux fichiers.** `DB_PATH` (défaut `audit.sqlite`) porte la configuration du parc ; `<base>-advisories.sqlite` (surchargeable par `ADVISORY_DB_PATH`) porte tout ce qui relève du dialogue avec GitHub. Ce découpage n'est pas cosmétique : il rend la remise à zéro ([§12](context/12-sauvegarde.md)) structurelle.
- **Migrations par `ALTER TABLE` inline**, avalant uniquement l'erreur « duplicate column name ».
- **Connexion paresseuse** : ouverte à la première requête, jamais au simple import d'un module, afin qu'aucun import ne crée le fichier de base.

---

## Les quinze sections

Chaque fichier est autonome : ce que la fonctionnalité fait, ses règles, ses cas limites, ses défauts connus.

| § | Fonctionnalité | Ce qu'il faut y chercher |
|---|---|---|
| [1](context/01-projets.md) | **Gestion des projets** | modèle, cible d'audit résolue, doublon par cible, projet ignoré, messages de validation, détection d'outil |
| [2](context/02-audits.md) | **Exécution des audits** | commandes par outil, six conditions de déduplication, fenêtre de fraîcheur, `newCves`, concurrence, « Tout auditer », lot serveur |
| [3](context/03-parsing.md) | **Parsing & normalisation** | modèle `Vulnerability`, six sévérités, formats par outil, clé de déduplication |
| [4](context/04-historique.md) | **Historique & évolution** | définition unique du « dernier run », historique par projet, suppression d'un run, série globale, buckets UTC, amorçage, bornes de `?days` |
| [5](context/05-git.md) | **Intégration Git** | `GitInfo`, séquence de lecture, sens de `rev-list`, `fetch` et `pull --ff-only` |
| [6](context/06-advisories.md) | **GitHub Advisory Database** | `keyFrom`, cache en base séparée, détection de quota, trois modes d'interrogation, repli sur la valeur de l'outil |
| [7](context/07-triage.md) | **Agrégation CVE & triage** | `buildCveGroups`, superposition des avis, **les trois clés d'identité**, annotations, ancienneté et SLA |
| [8](context/08-jira.md) | **Tickets Jira** | création réelle (ADF, API v3), garde anti-doublon par hash, test de connexion |
| [9](context/09-tags.md) | **Tags** | catalogue sensible à la casse, normalisation, cascade fonctionnelle, périmètre d'audit |
| [10](context/10-prompts.md) | **Bibliothèque de prompts** | modèle, tri, déduplication par titre |
| [11](context/11-console.md) | **Console live** | flux SSE volatile, modèle d'événement, **`ok` et non `exitCode`**, troncature |
| [12](context/12-sauvegarde.md) | **Sauvegarde & réglages** | instantanés datés, restauration en sept étapes, export/import, remise à zéro, liste blanche des réglages, variables d'environnement |
| [13](context/13-ingestion-ci.md) | **Ingestion CI** | authentification à temps constant, traitement, ce que l'ingestion ne fait pas |
| [14](context/14-rapports.md) | **Comptes-rendus d'audit** | ce qui est compté, ce qui ne l'est pas, ordre de listage |
| [15](context/15-securite.md) | **Invariants de sécurité** | pas de shell, `AEGIS_ALLOWED_ROOTS` et ses quatre propriétés, secrets, double validation de l'URL Jira |

### Par où commencer

- **Comprendre le cœur du produit** : [§2](context/02-audits.md) puis [§7](context/07-triage.md). Ce sont les deux sections que le code cite le plus (46 et 9 renvois).
- **Avant de toucher à la sécurité** : [§15](context/15-securite.md), en entier. Chaque règle y est un garde-fou dont la violation est une régression, pas un choix.
- **Avant de toucher à l'identité d'une vulnérabilité** : [§7](context/07-triage.md), section « les trois clés ». Elles sont distinctes **à dessein** ; les unifier casse la conformité de [§3](context/03-parsing.md).
- **Avant de toucher à la base** : [§12](context/12-sauvegarde.md), pour le découpage en deux fichiers et la séquence de restauration, dont l'ordre est la garantie.

---

## Récapitulatif des endpoints

| Méthode | Route | Rôle | § |
|---------|-------|------|---|
| GET / POST | `/api/projects` | lister (avec dernier run + état git) / créer (409 si doublon de cible) | [1](context/01-projets.md) |
| GET / PUT / DELETE | `/api/projects/:id` | lire / modifier / supprimer (cascade) | [1](context/01-projets.md) |
| POST | `/api/projects/detect` | détection d'outil `{path, auditPath?}` → `{tool}` | [1](context/01-projets.md) |
| POST | `/api/projects/:id/audit` | auditer (dédup ; `?force=1`) → run + `newCves` + `deduped` ; 409 si occupé | [2](context/02-audits.md) |
| GET | `/api/projects/:id/history` | 30 derniers runs, complets, erreurs incluses ; 404 si projet inconnu | [4](context/04-historique.md) |
| DELETE | `/api/runs/:id` | supprimer un run ; 204, 404 si inconnu, 400 si non numérique | [4](context/04-historique.md) |
| POST | `/api/projects/:id/git-fetch` | `git fetch --verbose` + recalcul | [5](context/05-git.md) |
| POST | `/api/projects/:id/git-pull` | `git pull --ff-only` + recalcul | [5](context/05-git.md) |
| POST | `/api/audit/run` | lot serveur, pool de 4 → `{status, count, skipped}` ; 409 si un lot tourne | [2](context/02-audits.md) |
| GET | `/api/audit/status` | progression du lot en cours et bilan du dernier terminé | [2](context/02-audits.md) |
| POST | `/api/ingest/:slug` | ingestion CI, `X-Aegis-Token`, `?sha=` | [13](context/13-ingestion-ci.md) |
| GET | `/api/history-global` | série temporelle globale ; `?days=` ∈ `[1, 365]` | [4](context/04-historique.md) |
| GET | `/api/stats` | agrégation globale (grade, top risques, `pendingCves`) | [7](context/07-triage.md) |
| GET | `/api/cves` | CVE agrégées par référence + annotations + avis | [7](context/07-triage.md) |
| POST | `/api/annotations` | upsert de triage `{cve, projectId, status, note, fixedIn}` | [7](context/07-triage.md) |
| POST | `/api/advisories/sync` | rafraîchir l'avis d'**une** CVE | [6](context/06-advisories.md) |
| POST | `/api/advisories/sync-all` | enrichir tous les avis manquants ; s'arrête au quota | [6](context/06-advisories.md) |
| DELETE | `/api/advisories/cache` | purger le cache d'avis | [6](context/06-advisories.md) |
| GET | `/api/github/rate-limit` | état du quota, relu chez GitHub sans le consommer ; 502 si injoignable | [6](context/06-advisories.md) |
| GET | `/api/tickets/list` | lister les liens de tickets | [8](context/08-jira.md) |
| POST | `/api/tickets/create` | créer l'issue Jira (API v3, ADF) ; 409 sur doublon | [8](context/08-jira.md) |
| POST | `/api/tickets/link` · `/unlink` | attacher / détacher un lien manuel | [8](context/08-jira.md) |
| POST | `/api/tickets/test-connection` | tester la configuration Jira **enregistrée** | [8](context/08-jira.md) |
| GET / POST | `/api/tags` | lister / créer un tag | [9](context/09-tags.md) |
| DELETE | `/api/tags/:id` | supprimer un tag (**cascade fonctionnelle**) | [9](context/09-tags.md) |
| GET / POST | `/api/prompts` | lister (`title ASC`) / créer | [10](context/10-prompts.md) |
| PUT / DELETE | `/api/prompts/:id` | modifier / supprimer | [10](context/10-prompts.md) |
| GET / POST | `/api/reports` | lister / écrire un compte-rendu d'audit global | [14](context/14-rapports.md) |
| DELETE | `/api/reports/:id` | supprimer un compte-rendu (404 si inconnu) | [14](context/14-rapports.md) |
| GET | `/api/snapshots` | inventaire des instantanés + compteurs | [12](context/12-sauvegarde.md) |
| POST | `/api/snapshots/create` | écrire l'instantané du jour | [12](context/12-sauvegarde.md) |
| POST | `/api/snapshots/restore` | restaurer `{file}` ; 409 si un audit tourne | [12](context/12-sauvegarde.md) |
| GET / PUT | `/api/settings` | lire (liste blanche) / modifier | [12](context/12-sauvegarde.md) |
| GET | `/api/config/export` | exporter la configuration (sans runs) | [12](context/12-sauvegarde.md) |
| POST | `/api/config/import` | importer (idempotent, transactionnel) | [12](context/12-sauvegarde.md) |
| POST | `/api/config/reset` | remise à zéro ; 409 si un audit tourne | [12](context/12-sauvegarde.md) |
| GET | `/api/console` | flux SSE des commandes (volatile, sans rejeu) | [11](context/11-console.md) |

`/api/*` non capté répond **404 en JSON**. Cette route doit rester déclarée **avant** le fourre-tout `/*`, qui sert `index.html` pour rendre les routes client accessibles en lien direct.

---

## Défauts connus

Ce document décrit le comportement **voulu**. Les écarts observés, leur constat de vérification et leur priorité vivent dans [`ISSUE.md`](ISSUE.md), qui est la **liste unique** des défauts. Les ⚠️ semés dans les sections y renvoient tous.

Consultez cette liste avant de conclure qu'un comportement surprenant est un bug neuf.

## Documents voisins

| Document | Rôle |
|---|---|
| [`ISSUE.md`](ISSUE.md) | liste unique des défauts, groupée par priorité |
| [`TESTING.md`](TESTING.md) | comment on teste — harnais, pièges, conventions |
| [`TESTS.md`](TESTS.md) | ce qui est couvert, étage par étage |
| [`CI_INGEST.md`](CI_INGEST.md) | mise en place de l'ingestion depuis une CI GitHub Actions |
| [`UPGRADE.md`](UPGRADE.md) | fonctionnalités souhaitées, non encore construites |
