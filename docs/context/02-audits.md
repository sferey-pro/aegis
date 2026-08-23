> [Index](../CONTEXT.md) · [← §1 — Gestion des projets](01-projets.md) · [§3 — Parsing & normalisation →](03-parsing.md)

# ⚡ 2. Exécution des audits

## Objectif

Lancer à la demande l'analyse de vulnérabilités d'un projet en exécutant l'outil adapté sur son lockfile, puis persister un rapport normalisé. Optimisé par déduplication commit + fenêtre de fraîcheur ; signale les nouvelles CVE ; transforme **tout** échec en erreur explicite et traçable.

## Commandes

| Outil | Arguments, **en tableau, sans shell** |
|-------|----------------------------------------|
| npm | `npm audit --json` |
| yarn | `yarn audit --json` |
| bun | `bun audit --json` |
| composer | `composer audit --format=json --locked --no-interaction` |

Environnement : `NO_COLOR=1`. Répertoire de travail : la **cible d'audit résolue** (§1), jamais la racine git.

## Barrière de déduplication

Le run est sauté — réponse `{deduped: true}`, aucun run créé — **seulement si toutes** ces conditions tiennent :

1. pas de forçage (`?force=1`, ou `?force=true` toléré) ;
2. arbre de travail **propre** ;
3. SHA du HEAD connu ;
4. un dernier run existe, et il n'est **pas** en erreur ;
5. son `commit_sha` est égal au SHA courant ;
6. il est encore **frais**.

**Relance systématique** si le forçage est demandé, si l'arbre est sale, ou en l'absence de SHA. S'applique à l'audit unitaire comme à « Tout auditer ».

## Fenêtre de fraîcheur (`isFresh`)

Réglage `AUDIT_MAX_AGE_HOURS`, lu dans la table `settings` :

| Valeur | Sémantique |
|--------|------------|
| `> 0` | frais si le run a moins de N heures |
| `0` | **jamais périmé** — la déduplication s'applique toujours |
| `< 0` | **toujours périmé** — la déduplication ne s'applique jamais |

Deux replis distincts, à ne pas confondre : un **réglage illisible** retombe sur **24 h** ; une **date de run illisible** est considérée **fraîche**, par sécurité — mieux vaut sauter un audit que boucler sur une donnée corrompue.

## Diff des nouvelles CVE (`newCves`)

À chaque run réellement exécuté (non dédupliqué), comparaison à la liste du **run précédent**, ignoré s'il était en erreur :

- clé = `package::cve`, repli `package::title` si la CVE est absente ;
- `newCves` = vulnérabilités du nouveau run dont la clé était absente du précédent ;
- chaque entrée : `{ ref (cve sinon package), package, severity }`.

**Premier run, ou run précédent en erreur → tout est nouveau.** On ne peut pas affirmer qu'une faille était déjà là sans point de comparaison, et un rapport vide serait plus trompeur qu'un rapport complet.

Joint à la réponse de l'audit, **non persisté** — recalculé à chaque run. Une seule implémentation (`diffNewCves`) sert l'audit local **et** l'ingestion CI (§13).

## Contrôles préalables

Trois refus **avant** tout `spawn`, chacun persisté comme un run en erreur ordinaire :

| Cas | Message |
|---|---|
| `tool` hors énumération | `Outil d'audit inconnu: <tool>` |
| cible d'audit absente | `Chemin introuvable: <cwd>` |
| lockfile absent | `Lockfile manquant: <noms> (cherché dans <cwd>)` |

Dans cet ordre. Un chemin absent ne peut pas porter de lockfile : annoncer le lockfile masquerait la cause. Un chemin qui existe **sans être un dossier** est traité comme introuvable — en tant que cible d'audit, il n'existe pas.

Lockfiles attendus : `package-lock.json` (npm), `yarn.lock` (yarn), `composer.lock` (composer), et pour bun **`bun.lock` ou `bun.lockb`** — l'un suffit. Le contrôle ne descend pas dans les sous-dossiers : le lockfile d'un monorepo se déclare par `audit_path` (§1). Un manifeste (`package.json`, `composer.json`) ne remplace pas un lockfile, alors que la détection (§1) suffit à en proposer un.

Le but n'est pas d'économiser un `spawn`, c'est de **nommer la cause**. Un dossier renommé rendait « Erreur système: … » avec le `ENOENT` brut de l'outil, et un dossier sans lockfile un message parlant de `package.json` — la mauvaise piste dans les deux cas.

Deux conséquences à connaître :

- **pas de ligne `exit:`** dans ces trois runs, et `duration_ms` à `0` : rien n'a été exécuté, et un code inventé se lirait comme un échec de l'outil ;
- **aucun événement de console** (§11), pour la même raison — il n'y a pas de commande à tracer. Le run en erreur reste, lui, visible partout.

Ils passent **après** la barrière de déduplication, et c'est voulu : un run dédupliqué suppose un arbre git propre au même commit, état dans lequel un lockfile supprimé aurait rendu l'arbre sale. Contrôler le disque avant la barrière ne changerait donc rien, sinon un `stat` par audit évité.

`command` conserve tout de même la commande qui **aurait** été tentée : c'est la première question posée devant un audit en erreur. Elle est `null` dans le seul cas de l'outil inconnu, où il n'y en a pas.

## Sortie et erreurs

Tout échec devient une ligne de run `status: "error"` portant un champ `error` **multi-ligne** : raison, `cwd:`, `exit:`, stderr brut, stdout brut. Un échec d'audit n'est **jamais** avalé, et un run en erreur porte des compteurs à zéro — c'est un échec, pas un projet sain.

## Concurrence

**Verrou par projet**, plus un plafond de **4** audits simultanés tous projets confondus. Deux audits du même projet écriraient deux runs pour un seul état du lockfile et se dédupliqueraient l'un contre l'autre.

Un refus de concurrence est un **conflit** : `AuditEnCoursError` → **409** sur les deux portes d'entrée. Le message est destiné à l'utilisateur ; les appelants ne doivent pas en faire une correspondance textuelle.

## Mode « Tout auditer »

**Orchestré côté client**, un appel d'audit par projet, sur les projets **visibles** — non ignorés, filtrés par le tag courant s'il y en a un (§9). **Parallèle borné à 4.** Mêmes règles de déduplication et de forçage que l'unitaire.

**Annulable** : un `AbortController` interrompt le lot. Les projets déjà lancés voient leur requête avortée, les suivants ne partent pas, et ils figurent au compte-rendu comme **annulés** — un projet absent se lirait comme un projet sain. L'annulation ne tue pas le sous-processus côté serveur ; il n'existe pas d'endpoint pour cela.

Résultats agrégés dans un compte-rendu (§14), **triés erreurs d'abord, puis par nombre décroissant de nouvelles CVE**, avec départage stable par nom pour que deux lots identiques rendent le même ordre.

## Lot serveur (`POST /api/audit/run`)

Endpoint de déclenchement **sans navigateur**. C'est sa raison d'être : il est appelé par un **cron sur la machine Aegis**, qui audite périodiquement tous les projets présents en local. Aucun écran ne l'appelle, et c'est normal — l'interface orchestre côté client (voir « Mode Tout auditer » ci-dessus).

Les deux modes d'audit périodique coexistent donc, et ne couvrent pas le même cas :

| | Cron sur Aegis → `/api/audit/run` | Cron par projet → `/api/ingest/:slug` ([§13](13-ingestion-ci.md)) |
|---|---|---|
| Code | doit être **présent en local**, et à jour | aucun code côté Aegis |
| Outils d'audit | installés sur la machine Aegis, dans les bonnes versions | ceux du projet, dans son propre environnement |
| Lockfile audité | celui de la copie locale | **celui du build**, donc celui qui compte |
| Déduplication par commit | **oui** | **non** — dix envois sur le même `sha` créent dix runs |
| État git (`ahead`/`behind`, `dirty`) | disponible | absent |
| Configuration | un seul endroit | une par projet |

⚠️ **Migrer entièrement vers l'ingestion demanderait d'abord de doter §13 d'une déduplication.** Son absence est délibérée et convient à une CI — un push, un build, un run qui a du sens — mais un cron horaire produirait vingt-quatre runs identiques par jour et par projet. L'historique et la série globale ([§4](04-historique.md)) en seraient noyés. Même pool de 4, un seul lot à la fois (409 sinon). Applique le contrôle de chemin (§15) et **écarte** du lot les projets hors périmètre, en rendant leur nombre dans `skipped` — un projet mal placé ne doit pas empêcher d'auditer les autres, mais le lot ne doit pas mentir sur sa couverture.

Progression sondée par `GET /api/audit/status` : `isRunning`, `currentProject`, `runningProjects`, `progress`/`total` pour le lot en cours, et `lastCompleted`/`lastTotal`/`lastFinishedAt` pour le dernier lot **terminé** — ces trois derniers valent `null` avant tout lot, car un bilan à zéro se lirait « un lot a tourné et n'a rien trouvé ».

## Aucun appel réseau pendant un audit

L'enrichissement lit le **cache** d'avis local (§6) et n'émet aucune requête. Une requête par vulnérabilité épuisait le quota au premier « Tout auditer », rendait la durée d'un audit dépendante du réseau, et faisait dépendre le contenu d'un run de la disponibilité d'un tiers.

---

> [Index](../CONTEXT.md) · [← §1 — Gestion des projets](01-projets.md) · [§3 — Parsing & normalisation →](03-parsing.md)

Écarts observés entre cette section et le code : [`ISSUE.md`](../ISSUE.md). C'est la **liste unique** des défauts — consultez-la avant de conclure qu'un comportement surprenant est un bug neuf.
