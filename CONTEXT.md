# PROMPT — Reconstruire « Audit Aggregator »

> Ce document est une **spécification fonctionnelle complète et autonome**. Il décrit *ce que fait* l'application, jamais *comment elle est présentée*. Aucun élément de design, d'UX, de mise en page ou de couleur n'y figure : uniquement des données, des règles métier, des algorithmes, des endpoints et des cas limites. Il est destiné à être utilisé comme prompt pour reconstruire l'outil à l'identique sur le plan fonctionnel.

## Objectif de l'application

Construire un outil qui **agrège les rapports de vulnérabilités de dépendances** (`composer audit`, `npm audit`, `yarn audit`, `bun audit`) de plusieurs projets dans un tableau de bord unique, à destination d'un **référent sécurité**.

Pour chaque projet on déclare un chemin (racine git), éventuellement un sous-dossier de lockfile, un type et un outil. L'application lance les audits à la demande sur les lockfiles, persiste un historique des exécutions, agrège les CVE par référence, permet un triage sécurité par (CVE, projet), prépare des tickets de remédiation, enrichit à la demande les données manquantes via la GitHub Advisory Database, et sauvegarde/restaure l'ensemble.

## Contraintes techniques (fonctionnelles)

- **Runtime Bun** : serveur HTTP (API + statique), lancement de sous-processus **sans shell** (arguments passés tels quels → aucune injection possible), base de données SQLite embarquée.
- **Persistance SQLite** dans un fichier (chemin configurable via `DB_PATH`, défaut `audit.sqlite`) : projets + historique complet des runs + tables auxiliaires. Migrations par `ALTER TABLE` inline. **Connexion paresseuse** (ouverte à la première requête, jamais au simple import d'un module) afin qu'aucun import ne crée le fichier de base.
- Toutes les commandes externes (audit + git + appels GitHub) ont leur **sortie capturée** (jamais renvoyée au terminal serveur) et sont **diffusées en direct** sur un flux console (voir §11).
- Aucune commande externe n'est lancée via un shell.

---

# 1. Gestion des projets

## But
Déclarer, modifier, supprimer et organiser les projets à auditer. Le catalogue des projets est la source de vérité pour tous les autres écrans (tableau de bord, CVE, tickets, historique).

## Données d'un projet

| Champ | Type | Obligatoire | Description |
|-------|------|-------------|-------------|
| `id` | entier | auto | Identifiant unique auto-incrémenté. |
| `name` | texte | oui | Nom d'affichage libre. |
| `path` | texte | oui | Chemin de la **racine git**. Peut commencer par `~` (expansé vers le home). |
| `audit_path` | texte / null | non | Dossier du lockfile **quand il diffère** de la racine git. `null`/vide = auditer directement `path`. Absolu ou relatif à `path`. Peut commencer par `~`. |
| `type` | énum | oui | `node` ou `composer`. |
| `tool` | énum | oui | `npm`, `yarn`, `bun` ou `composer`. |
| `tags` | liste de textes | non | Noms de tags du catalogue. Défaut = liste vide. |
| `ignored` | booléen | non | Projet EOL mis en sommeil. Défaut = `false`. |
| `created_at` | horodatage | auto | Date de création. |

## Cible d'audit résolue (notion centrale)
La **cible d'audit** = dossier réellement audité, calculée depuis `path` + `audit_path` :
1. Expanser `~` de `path` → **racine git**.
2. Si `audit_path` vide/null → la cible **est** la racine git.
3. Sinon expanser `~` de `audit_path` : absolu → utilisé tel quel ; relatif → `racine_git / audit_path`.
4. **Clé de cible** = ce chemin résolu, `/` finaux supprimés. Elle identifie l'unicité d'un projet.

La racine git sert aux opérations git ; la cible d'audit sert à lancer l'outil d'audit. Cela gère un dépôt dont le `.git` est à la racine mais le lockfile dans un sous-dossier (ex. `app/`).

## Expansion du tilde
`~` seul → home ; `~/…` → home + reste. Appliqué à `path` **et** `audit_path` au moment de résoudre (jamais stocké expansé : la valeur brute saisie est conservée).

## Catalogue de lockfiles reconnus (ordre de priorité)

| Lockfile | type | tool |
|----------|------|------|
| `composer.lock` | composer | composer |
| `package-lock.json` | node | npm |
| `yarn.lock` | node | yarn |
| `bun.lock` | node | bun |
| `bun.lockb` | node | bun |

## Auto-détection des lockfiles
Sur analyse d'un chemin, scanne le disque pour proposer type/outil/`audit_path` :
- **Si `audit_path` fourni** : scanne uniquement ce dossier (résolu absolu/relatif). Chaque détection porte le `audit_path` fourni comme `dir`.
- **Sinon** : scanne d'abord la **racine** ; si ≥ 1 lockfile trouvé, renvoie ces détections (`dir = ""`). Sinon **scan de profondeur 1** : chaque sous-dossier immédiat scanné, `dir` = nom du sous-dossier.
- **Exclus du scan profondeur 1** : dossiers cachés (`.`), `node_modules`, `vendor`.
- **Dédup par outil dans un même dossier** : plusieurs lockfiles d'un même outil (`bun.lock` + `bun.lockb`) → une seule entrée (priorité selon l'ordre du catalogue).
- Aucune détection si le dossier n'existe pas, est illisible, ou sans lockfile connu.
- Résultat par détection : `{ lockfile, type, tool, dir }` (`dir` relatif à la racine, `""` = racine).

## Détection de doublon (unicité par cible d'audit)
Deux projets sont doublons s'ils ont la **même clé de cible d'audit résolue**. À la création : refus si un projet existant a la même cible. À la modification : même contrôle en **excluant** le projet édité. Comparaison sur chemin résolu (`~/app` ≡ `/home/user/app` ≡ `/home/user/app/`).

## Projet ignoré (EOL)
`ignored = true` → exclu des audits (individuels et « Tout auditer »), du résumé du tableau de bord, de la bannière retard git, de l'agrégation CVE et de l'historique global. Reste stocké, **réactivable** à tout moment. La (dé)marque n'efface aucune donnée ni run.

## Normalisation des tags
À la saisie : convertis en texte, trimés, chaînes vides retirées, dédupliqués. La suppression d'un tag du catalogue le retire automatiquement de tous les projets. Les tags stockés sur un projet sont de simples noms référençant le catalogue.

## Validations (corps de requête projet)

| Règle | Erreur |
|-------|--------|
| Corps JSON valide | « JSON invalide » |
| `name` non vide (trim) | « Nom requis » |
| `path` non vide (trim) | « Chemin requis » |
| `type` ∈ {node, composer} | « Type invalide (node\|composer) » |
| `tool` ∈ {npm, yarn, bun, composer} | « Outil invalide (npm\|yarn\|composer) » |

- `audit_path` : trimé ; chaîne vide → `null`.
- `tags` : accepté seulement si tableau (sinon vide), puis normalisé.
- Aucune validation de cohérence `type`/`tool` (ex. composer + npm accepté au parsing). Aucune vérification d'existence du chemin à la création/édition (vérifiée seulement à la détection et au lancement de l'audit).

## Opérations
- **Lister** : tous les projets, triés par `created_at` décroissant, enrichis de leur **dernier run** (ou null) et de leur **état git live** (branche, SHA, upstream, avance/retard, dirty ; refs locales, sans réseau, calculé en parallèle).
- **Créer** : parse + valide + rejette si doublon (conflit) → insère + déclenche sauvegarde config → retourne le projet.
- **Modifier** : rejette si id inexistant (introuvable) ; parse + valide ; rejette si doublon en excluant l'id courant ; met à jour tous les champs éditables + sauvegarde.
- **Supprimer** : supprime le projet + **cascade** runs, annotations, tickets. Sauvegarde. Idempotent (id inexistant → pas d'erreur).
- **Ignorer / réactiver** : bascule `ignored` ; rejette si id inexistant ; sauvegarde.
- **Détecter** : requiert `path` non vide (« Chemin requis ») ; applique l'algorithme d'auto-détection ; retourne `entries` (possiblement vide).

---

# 2. Exécution des audits

## But
Lancer à la demande l'analyse de vulnérabilités d'un projet en exécutant l'outil adapté sur son lockfile, puis persister un rapport normalisé. Optimisé par déduplication commit + fenêtre de fraîcheur ; signale les nouvelles CVE ; transforme tout échec en erreur explicite et traçable. Mode « Tout auditer » = enchaînement parallèle borné.

## Commandes lancées
Un seul outil par projet (champ `tool`). Commande fixe, sans shell, avec `NO_COLOR=1` (JSON sans codes ANSI).

| Outil | Commande exacte | Lockfile requis | Format |
|-------|-----------------|-----------------|--------|
| composer | `composer audit --format=json --locked --no-interaction` | `composer.lock` | JSON (`advisories` + `abandoned`) |
| npm | `npm audit --json` | `package-lock.json` | JSON (`vulnerabilities`) |
| yarn | `yarn audit --json` | `yarn.lock` | NDJSON (1 objet/ligne, on lit les `auditAdvisory`) |
| bun | `bun audit --json` | `bun.lock` **ou** `bun.lockb` | JSON (objet par package ; bandeau possible → on part du 1er `{`) |

- **cwd** = cible d'audit résolue (`audit_path` si renseigné, sinon racine git ; `~` expansé).
- `--locked` (composer) : audite directement `composer.lock` sans exiger `vendor/`.
- stdout, stderr et code de sortie **capturés**. Chaque exécution diffusée en direct (début/fin, commande, cwd, code, durée) sur le flux console.
- Après parsing : vulnérabilités **dédupliquées** puis triées par sévérité (critique en premier). Sévérités normalisées `critical · high · moderate · low · info · unknown` ; composer `abandoned` → `info`.
- **Aucun appel réseau** (GitHub) pendant l'audit.

## Déduplication + fraîcheur
Avant tout lancement, relire l'état git : `sha` du HEAD et `dirty`.

**Réutiliser le dernier rapport** (aucun nouveau run, `deduped: true`) si **toutes** ces conditions sont réunies :
1. pas de forçage (`?force=1` absent), 2. arbre **propre** (`dirty = false`), 3. un SHA HEAD disponible, 4. dernier run non-`error`, 5. `commit_sha` identique au HEAD courant, 6. dernier run encore **frais** (`isFresh`).

**Fraîcheur (`isFresh`)** — réglage `audit_max_age_hours` (table `settings`, défaut `AUDIT_MAX_AGE_HOURS` ou 24) :
- **> 0** : frais si le dernier run date de moins de N heures ; au-delà, réaudité même à commit inchangé (une CVE peut sortir sans changement de code).
- **= 0** : jamais périmé → dédup par commit seul.
- **< 0** : jamais frais → toujours réaudité.
- Valeur non numérique / date illisible → considéré frais (sécurité).

**Relance systématique** (dédup court-circuitée) si : `?force=1`, arbre **dirty**, ou absence de SHA. S'applique à l'audit unitaire comme à « Tout auditer ».

## Diff des nouvelles CVE (`newCves`)
À chaque run réellement exécuté (non dédupliqué), comparaison à la liste du **run précédent** (ignoré s'il était en erreur) :
- clé = `package::cve` (repli sur `package::title` si CVE absente),
- `newCves` = vulnérabilités du nouveau run dont la clé était absente du précédent,
- chaque entrée : `{ ref (cve sinon package), package, severity }`.

Joint à la réponse de l'audit ; alimente le compte-rendu de « Tout auditer » ; **non persisté** (recalculé à chaque run). Premier audit ou run précédent en erreur → tout est nouveau.

## Sortie et erreurs
- **Succès** : run `status = vulnerable` si ≥ 1 vuln, sinon `ok` ; stocke `total`, `counts`, `vulnerabilities`, `command`, `commit_sha`, `duration_ms`, `ran_at`.
- **Échec** : run `status = error` (total 0, compteurs à zéro, aucune vuln), **toujours persisté**. Champ `error` **multi-ligne** : (1) raison, (2) `cwd: <chemin>`, (3) `exit: <code>`, (4) puis `stderr` puis `stdout` bruts s'ils apportent une info au-delà de l'en-tête. `command` conserve la commande exacte tentée.

## Cas limites
- **Chemin d'audit introuvable** : vérifié avant lancement → erreur « Chemin introuvable: … » sans exécuter.
- **Lockfile manquant** : vérifié avant lancement → erreur « Lockfile manquant: … (cherché dans <cwd>) ». Pour bun, `bun.lock` **ou** `bun.lockb` suffit.
- **Aucune sortie standard** : erreur = stderr sinon « <outil>: aucune sortie (exit N) ».
- **JSON illisible** : erreur « Sortie JSON illisible (<raison>) » avec code + stdout + stderr bruts.
- **Projet hors git / SHA indisponible** : audit exécuté (pas de dédup), run avec `commit_sha = null`.
- **yarn** : v1 classic (NDJSON) uniquement ; berry non supporté.

## Mode « Tout auditer »
Orchestré **côté client** (aucun endpoint batch). Un appel d'audit par projet, sur l'ensemble des projets **visibles** (filtres tags/sévérité appliqués). **Parallèle borné** à une concurrence max de **4**. Mêmes règles dédup/fraîcheur/force que l'unitaire. Résultats agrégés dans un compte-rendu, triés erreurs d'abord puis projets avec le plus de nouvelles CVE.

---

# 3. Parsing & normalisation des rapports

## Objectif
Transformer la sortie brute (JSON / NDJSON) de chaque outil en une **liste unifiée** `Vulnerability[]`, puis produire `counts` (par sévérité) + `total`. Résultat = `{ vulnerabilities, counts, total, command }`. Pipeline : parsing spécifique → déduplication → tri pire-sévérité d'abord → comptage. Aucun enrichissement réseau ici.

## Modèle `Vulnerability`

| Champ | Type | Sens | Présent |
|-------|------|------|---------|
| `package` | string | Package affecté | Toujours |
| `severity` | Severity | Sévérité normalisée | Toujours |
| `title` | string | Libellé de l'avis (défaut `"Advisory"`) | Toujours |
| `cve` | string \| null | CVE, ou à défaut CWE joint(s) selon l'outil | Toujours (peut être null) |
| `link` | string \| null | URL de l'avis | Toujours (peut être null) |
| `versionRange` | string \| null | Plage de versions vulnérables | Toujours (peut être null) |
| `fixedIn` | string \| null (opt) | Version cible de correction | npm, yarn |
| `abandoned` | boolean (opt) | Package composer abandonné (pas une vraie faille) | composer |

`Severity` = `critical | high | moderate | low | info | unknown`.

## Extraction par outil

**composer** — objet JSON à deux sections : `advisories` (indexé par package → tableau d'avis) et `abandoned` (package → remplacement suggéré). Par avis : `package`←`packageName`/clé, `severity`←`normSeverity(severity)`, `title`←`title`/`"Advisory"`, `cve`←`cve`, `link`←`link`, `versionRange`←`affectedVersions`. Par abandonné : entrée synthétique `severity = info` (forcée), `abandoned = true`, `title` = `"Remplacer par <x>"` ou `"Aucun remplacement suggéré"`. Valeur non-tableau ignorée.

**npm** — objet `vulnerabilities` indexé par package (`name`, `severity`, `range`, `fixAvailable`, `via[]`). `via` mixte : chaînes = deps transitives ; objets = advisories. `fixedIn` extrait seulement si `fixAvailable` est un **objet** → `.version`. Cas A (aucun objet advisory) : 1 entrée, `title = "Dépendance vulnérable via <via joints>"` (ou `"…via transitive"`), `cve`/`link` null, `versionRange`←`range`. Cas B (≥ 1 objet advisory) : 1 entrée par advisory, `cve`←CWE joints par `', '` sinon null, `link`←`url`, `versionRange`←`a.range`/`v.range`.

**yarn classic v1** — NDJSON ; on retient les objets `type === "auditAdvisory"` avec `data.advisory`. Lignes vides / non-JSON ignorées silencieusement. `package`←`module_name`/`"?"`, `cve`←`cves` joints par `', '` sinon null, `link`←`url`, `versionRange`←`vulnerable_versions`, `fixedIn`←`patched_versions`. berry non géré.

**bun** — objet JSON indexé par package → tableau d'avis. Un bandeau texte peut précéder → repositionner sur le 1er `{` (sinon parser le texte tel quel). `cve`←CWE joints sinon null, `link`←`url`, `versionRange`←`vulnerable_versions`. Pas de `fixedIn`. Valeur non-tableau ignorée.

## Normalisation des sévérités (`normSeverity`)
Minuscules (null → ""), puis : `critical`→`critical`, `high`→`high`, `moderate`/`medium`→`moderate`, `low`→`low`, `info`/`informational`→`info`, **toute autre / vide / null → `unknown`**. (composer `abandoned`→`info` forcé hors de cette fonction.)

## Déduplication (`dedupe`)
Ordre d'apparition conservé (1re occurrence gardée). Clé = `` `${package}|${title}|${cve ?? ""}` ``. Deux vulns identiques sur ces 3 champs = doublon, même si `link`/`versionRange`/`fixedIn`/`severity` diffèrent.

## Tri
`SEV_ORDER` : critical=0, high=1, moderate=2, low=3, info=4, unknown=5. Appliqué **après** dédup. Tri **stable** (pas de critère secondaire).

## Comptage
`emptyCounts()` = 6 sévérités à zéro. `tally` incrémente `counts[severity]`. `total` = `vulnerabilities.length` (après dédup) = somme des 6 compteurs.

## Cas limites
Sections vides/absentes → liste vide, counts à 0. Valeur non-tableau ignorée. Champs manquants → défauts. CWE utilisé comme `cve` pour npm/bun. NDJSON yarn tolérant au bruit. Bandeau bun → 1er `{`.

---

# 4. Historique des audits & évolution des CVE

## Objet
Chaque audit produit un **run** durable. L'accumulation donne : l'historique par projet, le dernier état connu, l'évolution globale dans le temps, et le calcul des nouvelles CVE.

## Table `runs`

| Champ | Type | Contenu |
|-------|------|---------|
| `id` | entier auto | identifiant |
| `project_id` | entier | FK, `ON DELETE CASCADE` |
| `status` | texte | `ok` / `vulnerable` / `error` |
| `total` | entier | nb total de vulns (0 si ok/error) |
| `counts` | JSON | `{critical, high, moderate, low, info, unknown}` |
| `vulnerabilities` | JSON | liste complète des vulns |
| `command` | texte / null | commande exacte lancée |
| `commit_sha` | texte / null | SHA HEAD au moment du run (dédup) |
| `error` | texte / null | message multi-ligne, seulement si `status = error` |
| `duration_ms` | entier | durée |
| `ran_at` | texte | horodatage `datetime('now')` UTC |

Append-only (jamais mis à jour ; seulement supprimable). Index `(project_id, ran_at DESC)`.

## Dernier run
Run de `ran_at` le plus récent (départage par `id` desc). Représente l'état courant, alimente tableau de bord / agrégation CVE / dédup. Toujours recalculé dynamiquement (pas de champ figé) : supprimer le dernier run fait remonter automatiquement le précédent.

## Historique par projet
`GET /api/projects/:id/history` → runs du projet, `ran_at DESC` puis `id DESC`, **limité aux 30 derniers**. Chaque run complet (`counts`/`vulnerabilities` désérialisés). Erreurs incluses.

## Diff « nouvelles CVE »
Voir §2 (`newCves`) : comparaison au run précédent (erreur → ensemble vide → tout nouveau), clé `package::cve` (repli `package::title`). Non calculé pour un run dédupliqué (`deduped: true`).

## Suppression d'un run
`DELETE /api/runs/:id` → 204. Le dernier run étant recalculé, supprimer le plus récent fait du précédent l'état courant ; supprimer le dernier restant → projet sans état. Unitaire, sans contrainte.

## Évolution globale (`GET /api/history-global`)
Reconstitue, par jour, le total agrégé de **tous les projets actifs**. Sortie : `{date: "YYYY-MM-DD", counts, total}[]`, chronologique croissant, un point par jour ayant ≥ 1 run exploitable.

**Entrée** : tous les runs des projets **non ignorés** (`ignored = 0`), triés `ran_at` croissant, réduits à `{project_id, ran_at, status, counts}`.

**Algorithme** : parcours chronologique en maintenant un **état par projet** (map `project_id → counts`) :
1. run `error` → **ignoré**, l'état connu du projet **n'est pas écrasé** (une erreur ne doit pas faire disparaître les vulns précédentes) ;
2. sinon → met à jour l'état du projet ;
3. après chaque run non-erreur → somme par sévérité des états courants de **tous** les projets de la map, affectée au jour `ran_at[0:10]` ;
4. plusieurs runs le même jour → **dernière écriture gagnante**.

**Portage** : l'état d'un projet reste dans la map et contribue aux jours suivants même sans réaudit. `total` d'un point = somme des 6 sévérités.

## Cas limites
Aucun run → vides. Projet ignoré → absent de la série globale (historique projet reste consultable). Runs uniquement en erreur → jamais dans la série globale. Erreur après runs valides → état conservé. Audit dédupliqué → pas de run, pas de `newCves`.

---

# 5. Intégration Git

## Vue d'ensemble
Chaque projet est associé à un dépôt git (racine = `path`, `~` expansé). L'app calcule un état git **live** et fournit trois actions réseau : fetch par projet, fetch global, pull par projet. Toutes les commandes via sous-processus sans shell, sortie capturée + diffusée sur la console. Env fixé :
- `GIT_OPTIONAL_LOCKS=0` — aucun lock disque sur les lectures (concurrence sûre).
- `GIT_TERMINAL_PROMPT=0` — jamais de prompt d'auth bloquant (échec propre).

Racine git = toujours `path`, jamais `audit_path`.

## État git par projet (`GitInfo`)

| Champ | Type | Signification |
|-------|------|---------------|
| `isRepo` | booléen | dépôt git exploitable |
| `branch` | string / null | branche courante (`HEAD` si detached) |
| `sha` | string / null | SHA complet HEAD (dédup audits) |
| `upstream` | string / null | branche de suivi (`origin/…`) |
| `ahead` | entier | commits locaux non poussés |
| `behind` | entier | commits remote absents en local (retard) |
| `dirty` | booléen | modifications non commitées |

**Séquence `gitInfo`** (chemin expansé ; inexistant → non-repo immédiat, aucune commande) :

| # | Commande | Rôle | Si échec |
|---|----------|------|----------|
| 1 | `git rev-parse --is-inside-work-tree` | est-ce un dépôt ? | code≠0 ou sortie≠`true` → non-repo, **stop** |
| 2 | `git rev-parse --abbrev-ref HEAD` | branche courante | `branch = null` |
| 3 | `git rev-parse HEAD` | SHA HEAD | `sha = null` |
| 4 | `git rev-parse --abbrev-ref --symbolic-full-name @{u}` | upstream | pas d'upstream → étape 5 **sautée** |
| 5 | `git rev-list --left-right --count @{u}...HEAD` | écart vs upstream → `<behind>\t<ahead>` | comptes = 0 |
| 6 | `git status --porcelain` | arbre sale si sortie non vide | `dirty = false` |

**behind** = « N de retard » (indicateur central « pas à jour »). **ahead** = commits locaux non poussés. **dirty** désactive la dédup d'audit (force réaudit). `gitInfo` **n'exécute aucun réseau** → `behind` obsolète tant qu'un fetch n'a pas rafraîchi les refs.

Appelé : à chaque `GET /api/projects` (parallèle, tous projets), avant chaque audit (fournit `sha`+`dirty`), en fin de chaque action réseau.

## MAJ par projet — fetch (`POST /api/projects/:id/git-fetch`)
Renvoie `{ git, log, ok }`. Chemin inexistant → non-repo, `ok:false`, log « chemin introuvable ». Sinon `git fetch --verbose` (réseau ; progression sur stderr → le log capture stderr puis stdout). Aucune sortie + succès → « Déjà à jour. ». Puis **recompute** `gitInfo`, et résumé au log si upstream (« → N commit(s) de retard sur `<upstream>` » ou « → à jour »). `ok` = (exit == 0). Ne modifie jamais l'arbre ni la branche ; `behind` peut passer 0 → N.

## MAJ globale — « Vérifier les MAJ »
Orchestrée **côté client** (pas d'endpoint batch), un `git-fetch` par projet. Cible = projets **non ignorés**. **Parallèle borné à 4.** Progression N/M. Chaque fetch isolé (échec → `isRepo:false, ok:false`, sans interrompre). Récap final trié par retard décroissant puis nom (« N pas à jour »).

## Pull par projet (`POST /api/projects/:id/git-pull`)
`git pull --ff-only` — intègre les commits distants **uniquement en fast-forward** (aucun merge, aucun conflit possible ; refus propre si historique divergé). Log = stdout puis stderr ; échec sans message → « échec du pull (non fast-forward ?) ». Puis recompute. `ok` = (exit == 0). Succès → `behind` retombe à 0. Échec → état inchangé, message inline (2 dernières lignes, tronqué 160 caractères).

## Cas limites
Chemin inexistant (détecté avant toute commande). Non-repo. Detached HEAD (`branch = "HEAD"`). Pas d'upstream (`behind`/`ahead` = 0). Auth réseau bloquante → échec immédiat `ok:false`. Pull non fast-forward → `ok:false`, état inchangé. Fetch sans changement → « Déjà à jour. ». Batch résilient (un échec ne stoppe pas les autres).

---

# 6. Connecteur GitHub Advisory Database

## But
Compléter à la demande deux infos que les outils ne donnent pas (ou mal) : (1) la **sévérité** manquante (`unknown`), (2) la **version corrigée** (`first_patched_version`, absente pour composer/bun). Service auxiliaire : ne lance jamais d'audit, ne modifie pas les runs ; alimente le champ `fixed_in` d'une annotation.

## Clé de résolution (`keyFrom(cve, link)`)

| Priorité | Source | Extraction | Résultat |
|----------|--------|------------|----------|
| 1 | GHSA dans le lien | `GHSA-xxxx-xxxx-xxxx` (insensible casse, majusculisé) | `{kind:"ghsa", id}` |
| 2 | CVE dans `cve` | `CVE-\d{4}-\d{4,}` (majusculisé) | `{kind:"cve", id}` |
| — | aucun | — | `null` (non résolvable) |

GHSA prime sur CVE. CWE jamais résolvable → `null`.

## Endpoints GitHub
Base `https://api.github.com`, un appel par résolution : GHSA → `GET /advisories/{ghsa}` (objet) ; CVE → `GET /advisories?cve_id={cve}` (tableau → `data[0]`). En-têtes : `accept: application/vnd.github+json`, `user-agent: audit-aggregator`, `x-github-api-version: 2022-11-28`. Chaque appel signalé sur le bus (label `github`, phase start/end, code HTTP, durée).

## Mapping sévérité (`mapSeverity`)
`critical`/`high`/`moderate`/`low` → identiques ; toute autre / absente → `unknown`.

## Version corrigée par (écosystème, package)
L'avis porte `vulnerabilities[]` (une entrée par package). Construire `fixes` : clé `` `${ecosystem}:${name}` ``, valeur = `first_patched_version` ou `null`. Rapprochement outil → écosystème : composer→`composer`, npm/yarn/bun→`npm`. Résolution d'une occurrence : chercher `fixes[${ECOSYSTEM[tool]}:${package}]` → sinon `null`.

## Cache SQLite (`advisory_cache`)
`id` (PK = GHSA/CVE), `severity`, `fixes` (JSON), `fetched_at`. `getCachedAdvisory(id)` → `{severity, fixes}` (fixes absent → `{}`) ou null. `putCachedAdvisory` upsert. `resolve(key)` : **cache d'abord** (jamais rate-limité), sinon `fetchAdvisory` + mise en cache si avis obtenu. Cache par identifiant → partagé entre projets/packages.

## Rate-limit
Détecté sur la réponse : **HTTP 429**, ou **HTTP 403 + `x-ratelimit-remaining: 0`** → `rateLimited = true`, **aucune écriture**, l'appelant doit **s'arrêter**. Un 403 pour autre raison ≠ rate-limit. Réponse non-OK hors rate-limit → `advisory: null`. Exception réseau / JSON invalide → `advisory: null`, `rateLimited: false`.

## Token
`GITHUB_TOKEN` optionnel → en-tête `authorization: Bearer <token>`. Sans : ≈ 60 req/h. Avec : ≈ 5000 req/h.

## Déclenchement : 100 % manuel, par CVE
Jamais pendant un audit. Seule porte : `resolveFixedVersion({tool, package, cve, link})` via `POST /api/annotations/fetch-fix`, une CVE à la fois.
1. `keyFrom` → `null` : `{fixedIn:null, rateLimited:false, resolvable:false}`.
2. `resolve` (cache puis réseau).
3. `rateLimited` : `{fixedIn:null, rateLimited:true, resolvable:true}`.
4. avis obtenu : `fixes[…]` → `{fixedIn, rateLimited:false, resolvable:true}`.

Route : body `{cve, projectId, package, tool, link?}` ; validation `cve`+`package` non vides + `tool` valide (sinon 400 « Paramètres manquants ») ; `rateLimited` → **429** `{rateLimited:true}` ; `fixedIn` trouvé → persistance via `setAnnotationFix(cve, projectId, fixedIn)` (met à jour seulement `fixed_in`, préserve `status`/`note`, crée l'annotation en `pending` si absente) + sauvegarde ; réponse `{fixedIn, resolvable}`. La version survit aux réaudits.

---

# 7. Agrégation des CVE & triage référent sécurité

## Objectif métier
Vue consolidée de toutes les CVE/avis détectés sur l'ensemble des projets, permettant au référent de **juger projet par projet si une vulnérabilité est un risque réel** (le code vulnérable est-il atteignable ?), de documenter sa décision et de renseigner la version corrigée. Décisions **persistantes**, survivent aux réaudits.

## Agrégation (`buildCveGroups`)
**Source** : le **dernier run de chaque projet**. Exclus : projets ignorés, projets sans run ou dont le dernier run est en **erreur**.

**Regroupement par référence** : clé = identifiant CVE (`v.cve` trimé non vide) → `ref` affichable ; sinon fallback clé = `"<package>: <title>"`, `ref = null`.

**`CveGroup`** : `{ cve (clé), ref (string|null), worst (Severity), occurrences[] }`. `worst` recalculée à chaque ajout (rang le plus grave ; ordre critical→…→unknown).

**`CveOccurrence`** (une par projet touché) : `projectId`, `projectName`, `tool`, `package`, `severity` (pour ce projet), `versionRange`, `fixedIn`, `title`, `link`, `status` (issu de l'annotation, `pending` défaut), `note` (`""` défaut).

**Dédup** : une seule occurrence par (référence, projet). Même référence touchant 2× le même projet → occurrence existante conservée, **seule la pire sévérité retenue** ; autres champs = 1re occurrence.

**Tri des groupes** : par `worst` décroissante en gravité ; à égalité, par nombre d'occurrences décroissant.

## Triage (annotation)
Unité = couple **(CVE, projet)**, `UNIQUE(cve, project_id)`. La « CVE » stockée = la clé du groupe (potentiellement libellé fallback).

**Table `annotations`** : `id`, `cve`, `project_id` (FK cascade), `status` (défaut `pending`), `note` (défaut `""`), `fixed_in` (nullable, migration ALTER), `updated_at`.

**Statuts** : `pending` (À évaluer), `confirmed` (Risque confirmé — exploitable), `not_affected` (Non affecté — non atteignable), `ignored` (Ignoré). Statut hors ensemble → `pending`.

## Version corrigée (`fixed_in`)
Deux voies : saisie manuelle (upsert annotation), ou résolution GitHub par CVE (§6). Persistée dans l'annotation, survit aux réaudits. **Override dans l'agrégation** : `fixedIn` occurrence = `annotation.fixed_in` en priorité, sinon `vuln.fixedIn` (outil), sinon `null`. La valeur du référent prime toujours.

## Endpoints
- `GET /api/cves` → `CveGroup[]`. Aucun paramètre. Reflète derniers runs + annotations.
- `POST /api/annotations` → upsert `{cve, projectId, status?, note?, fixedIn?}`. `cve` requis (400 « CVE requise ») ; `projectId` existant (404 « Projet introuvable ») ; `status` validé sinon `pending` ; `note` défaut `""` ; `fixedIn` trimé, vide → `null`. Upsert `(cve, project_id)` (écrase les 3 champs) + sauvegarde. Retourne l'annotation.
- `POST /api/annotations/fetch-fix` → voir §6.

## Cas limites
Projet ignoré / dernier run en erreur / aucun run → absent de l'agrégation (mais annotation subsiste en base). Réaudit ne touche pas les annotations. CVE disparue → occurrence disparaît, annotation persiste (réapparaît si la CVE revient — matching par clé). Groupe sans identifiant (`ref = null`) → triable, mais résolution GitHub échoue proprement (`resolvable:false`) ; saisie manuelle possible. `fixedIn` vide en upsert → `null`. Suppression projet → annotations cascade.

---

# 8. Tickets Jira (préparation de remédiation)

## Objet
Transformer les CVE agrégées en unités de travail prêtes pour Jira : un contenu markdown copiable par unité, et un lien Jira persistant avec détection des dérives. **Source** = agrégat CVE (`GET /api/cves`). **Unité de travail = (projet, package)** : toutes les CVE frappant ce package dans ce projet dans le même ticket.

## Constitution des tickets
Clé de regroupement = `projectId::package`. Chaque ticket porte : identité (`projectId`, `projectName`, `tool`, `pkg`), liste des CVE (ref, sévérité, statut de triage, note, lien, `versionRange`, `fixedIn`), et **pire sévérité** (`worst`).

**Tri** : pire sévérité d'abord, puis nom de projet, puis nom de package. **Classement en 2 groupes** : Prioritaires (`worst` ∈ {critical, high}) vs Moins importants (moderate/low/info/unknown).

## Version cible
= **première `fixedIn` non vide** parmi les CVE du package (ordre d'insertion) ; sinon `null`. Chaque CVE conserve sa propre `fixedIn` ; la version cible d'en-tête n'est qu'un raccourci.

## Atteignabilité (dérivée du statut de triage)

| Statut | Libellé |
|--------|---------|
| `confirmed` | Atteignable |
| `not_affected` | Non atteignable |
| `pending` | À évaluer |
| `ignored` | Ignoré |

## Filtre « Atteignables uniquement »
Actif → ne garde que les CVE `confirmed` ; tickets vides après filtrage disparaissent. Le compteur global reste celui de la liste non filtrée.

## Markdown généré (« Copier le ticket »), par unité (projet·package)
- **Titre** : `# [<projet>] Vulnérabilités <package>`.
- **Ligne méta** (`·` séparateurs) : `**Projet:**`, `**Outil:**`, `` **Package:** `<pkg>` ``, `**Pire sévérité:**`, et `` **Version cible:** `<v>` `` **seulement si** une version cible existe.
- Libellés sévérité (emoji + texte) : 🔴 Critique · 🟠 Élevé · 🟡 Modéré · 🔵 Faible · ⚪ Info · ⚫ Inconnu.
- **Tableau « Prioritaires »** (si ≥ 1 CVE critical/high) : colonnes `| CVE | Sévérité | Atteignable | Version cible | Note |`. CVE = `[ref](lien)` (ou `ref` seul, ou `[avis](lien)`, ou `—`). Version cible = `` `fixedIn` `` de **cette** CVE sinon `—`.
- **Tableau « Moins importants »** (si ≥ 1 CVE moderate/low/info/unknown) : colonnes réduites `| CVE | Sévérité | Note |`.
- **Répartition par sévérité de chaque CVE**, indépendamment du classement du ticket : un ticket prioritaire peut contenir **les deux** tableaux.
- **Échappement des cellules** : `|` → `\|`, retours ligne → espace, trim.

## Lien Jira persistant
Une URL par (projet, package). Table `tickets` : `project_id`, `package`, `url`, `cves` (baseline JSON), `updated_at`, **UNIQUE(project_id, package)**, `ON DELETE CASCADE`. `POST /api/tickets {projectId, package, url, cves}` → upsert (URL trimée), déclenche sauvegarde. `GET /api/tickets` → liste. Validation : projet existant (404), package non vide.

## Warning « nouvelles CVE depuis le lien » (baseline)
À l'enregistrement, stocker une **baseline** = références CVE actuelles du ticket. **Warning** (calculé seulement si une URL existe) = références actuelles absentes de la baseline → ticket « à mettre à jour » (N nouvelles CVE). Ré-enregistrer recapture la baseline → warning disparaît. Détecte les CVE **ajoutées**, pas les CVE disparues. Seules les références non nulles comptent.

## Cas limites
Aucune donnée d'audit → aucun ticket. Filtre atteignables sans CVE confirmée → aucun ticket (compteur total peut rester > 0). CVE sans référence n'entre jamais dans la baseline. Ticket entièrement mineur → pas de tableau prioritaire. Suppression du projet → tickets cascade. Lien non enregistré → pas de warning.

---

# 9. Tags (catalogue et filtrage)

## Modèle
**Table `tags`** : `id`, `name` (**UNIQUE**, non vide), `color` (palette, défaut `indigo`), `created_at`. **Palette fixe** (8 valeurs) : `indigo · sky · emerald · amber · rose · violet · teal · orange`. Couleur hors palette → `indigo`. Affectation aux projets = **liste de noms** (`projects.tags`, JSON), normalisée à chaque écriture (trim, exclusion vides, dédup, ordre préservé). Pas d'intégrité référentielle stricte (un projet peut porter un nom hors catalogue, ex. après import).

## Gestion du catalogue
- `GET /api/tags` → tous, **triés par nom**.
- `POST /api/tags {name, color}` : `name` trimé, vide → 400 « Nom requis » ; couleur absente/hors palette → `indigo` ; collision UNIQUE → 400 « Tag déjà existant » ; succès 201 + sauvegarde. Dédup **sensible casse/espaces internes** (« web » ≠ « Web »).
- `DELETE /api/tags/:id` : **cascade fonctionnelle** — retire le nom de **tous les projets** le référençant (lit le nom, supprime la ligne, réécrit chaque projet concerné). Id inexistant → no-op, aucun projet modifié, 204 (idempotent).
- **Pas d'endpoint de modification** (ni renommage ni changement couleur ; seul l'import peut réintroduire).

## Filtrage des projets (côté client)
Sélection `selectedTags`. Aucun tag → tous. Sinon **logique OU** : projet retenu s'il a **au moins un** tag sélectionné (`selectedTags.size===0 || p.tags.some(t => selectedTags.has(t))`). Projet sans tag exclu dès qu'un tag est sélectionné. Élargissant, jamais cumulatif ET. Cet ensemble « projets visibles » sert de périmètre à « Tout auditer ».

---

# 10. Bibliothèque de prompts IA

## But
Stocker et réutiliser des prompts IA (textes réutilisables), indépendants des projets et audits. Bibliothèque persistante, CRUD, transportable via export/import.

## Modèle (table `prompts`)
`id` (auto), `title` (**obligatoire**, non vide après trim), `body` (défaut `""`), `tags` (liste de noms libres, JSON, défaut `[]` ; non contrainte au catalogue projets), `created_at` (auto). Lecture hydrate `tags` (JSON → tableau ; absent → `[]`).

## Validation/normalisation (création et modification)
1. **Titre requis** (trim → vide → erreur `Titre requis`). 2. Body absent → `""`. 3. Tags normalisés (non-tableau → vide ; chaque élément stringifié + trimé ; vides retirés ; dédupliqués).

## CRUD & endpoints
- `GET /api/prompts` → tous, tri **création décroissante**.
- `POST /api/prompts {title, body?, tags?}` → 201 (400 « Titre requis »).
- `PUT /api/prompts/:id` → met à jour `title`/`body`/`tags` (pas `created_at`) ; 400 titre vide ; 404 « Prompt introuvable ».
- `DELETE /api/prompts/:id` → 204 ; id inexistant sans effet, sans erreur.
- Toute mutation → sauvegarde config différée.

## Export/Import
Export : `{title, body, tags}` uniquement (pas `id`/`created_at`). Import : **dédup par titre** (trimé ; vide ou déjà présent — préexistant ou déjà importé dans le lot — ignoré). Idempotent. Compteur `promptsAdded`.

---

# 11. Console live des commandes

## But
Diffuser en **temps réel** vers les navigateurs connectés la trace de **toutes les commandes externes** (audits, git, GitHub). Flux **purement volatile** (aucune persistance) : un client ne voit que les commandes émises **à partir** de sa connexion (pas de rejeu). La persistance des résultats d'audit relève de la table `runs`.

## Modèle d'événement (`CmdEvent`)
Chaque commande produit **deux** événements corrélés : `start` (avant lancement) et `end` (à la fin, succès **ou** échec).

| Champ | Présence | Rôle |
|-------|----------|------|
| `id` | toujours | entier de corrélation, **identique** start/end, séquence monotone partagée par toutes les sources |
| `phase` | toujours | `"start"` ou `"end"` |
| `cmd` | toujours | texte de la commande (`git rev-parse HEAD`, `npm audit --json`, `GET advisories CVE-…`) |
| `cwd` | toujours | répertoire d'exécution (git/audit) ou URL API (github) |
| `label` | toujours (sauf helper) | `"git"` / `"audit"` / `"github"` |
| `project` | si contexte projet | nom du projet à l'origine |
| `exitCode` | phase `end` | code de sortie process (git/audit) ou **code HTTP** (github) |
| `ms` | phase `end` | durée ms |

L'appariement par `id` permet de dériver l'état « en cours » (start reçu, end pas encore).

## Transport (SSE)
`GET /api/console`, `text/event-stream` (`no-cache`, `keep-alive`). **Broadcast** : chaque événement JSON poussé à tous les clients (`data: <json>\n\n`), aucun filtrage serveur. Multi-clients (ajout à l'ouverture, retrait à la fermeture). À la connexion : commentaire `: connected`. **Keepalive** `: ping` ~25 s. Aucune persistance ni rejeu.

## Tag projet automatique (contexte asynchrone)
Un stockage par contexte asynchrone porte `{project}`. Aux points d'entrée liés à un projet, l'exécution est **enveloppée** dans ce contexte (audit d'un projet, calcul git par projet lors du listing, fetch, pull). Les émetteurs lisent le projet courant et le placent dans `project`. **Résistant au parallélisme** : plusieurs audits/opérations concurrents taguent chacun correctement leurs commandes.

## Sources émettrices
1. **Audits** — chaque sous-processus d'outil (`label: "audit"`, cwd = dossier d'audit, `project` renseigné).
2. **Git** — chaque commande git (`gitInfo`, `gitFetch`, `gitPull`) (`label: "git"`, cwd = racine git).
3. **GitHub** — chaque requête HTTP réelle (`label: "github"`, `cmd = "GET advisories <id>"`, `exitCode` = code HTTP, 0 si exception ; `end` dans un `finally`). Un résultat servi depuis le cache **n'émet pas** d'événement.

## Cas limites
Client déconnecté → retiré + ping arrêté ; envoi échoué → retrait silencieux (un client mort ne bloque pas les autres). Hors contexte projet → événement sans `project`. Aucun client → événements produits, broadcast sans destinataire, rien mis en file. Commande en échec → `end` toujours émis (exitCode non nul). Rate-limit GitHub → start/end quand même (exitCode = 429/403).

---

# 12. Sauvegarde, restauration & réglages

## Vue d'ensemble : deux niveaux

| Niveau | Contenu | Format | Déclencheurs | Restauration |
|--------|---------|--------|--------------|--------------|
| 1. Config JSON | projets, tags, annotations, prompts, tickets — **sans runs** | `.json` | chaque mutation (debounce) + démarrage + intervalle | via import config (idempotent) |
| 2. Snapshot base | **base complète**, historique inclus | `.sqlite` (`VACUUM INTO`) | démarrage + intervalle | via restauration (remplace le fichier) |

Config JSON = rejouable/idempotente (migrer, reconstruire une base propre). Snapshot `.sqlite` = image fidèle (retour arrière complet incluant l'historique).

## Niveau 1 — Config JSON

**Contenu (`buildConfig`)** : `version: 1` + `tags` (`{name, color}`), `projects` (`{name, path, audit_path, type, tool, tags, ignored}`), `annotations` (`{path, cve, status, note, fixed_in}` — `project_id` remplacé par `path`, relink portable ; filtrées si `path` non résolvable), `prompts` (`{title, body, tags}`), `tickets` (`{path, package, url, cves}` — relink par `path`, filtrées si absent). **Jamais** de runs/historique/cache/settings.

**Écriture (`writeBackup`)** : crée `BACKUP_DIR` ; écrit `audit-config.latest.json` (toujours à jour) + `audit-config-YYYY-MM-DD.json` (un par jour). **Rotation** : garde les `BACKUP_KEEP` (défaut 30) datés les plus récents (tri lexicographique = chronologique) ; `latest` jamais soumis à rotation. Erreurs capturées/journalisées, sans interrompre l'app.

**Debounce mutation (`scheduleBackup`)** : appelé après chaque mutation ; **debounce 2 s** (une rafale d'imports → une seule écriture).

**Démarrage + périodique (`startPeriodicBackup`)** : au démarrage, `writeBackup()` + `writeDbSnapshot()` immédiats ; puis toutes les `BACKUP_INTERVAL_MIN` min (défaut 60). `≤ 0` désactive le périodique (le démarrage a quand même lieu).

## Niveau 2 — Snapshot `.sqlite` (`writeDbSnapshot`)
Crée `BACKUP_DIR/db` ; cible `audit-YYYY-MM-DD.sqlite`. **`VACUUM INTO` exige une cible absente** → supprimer le fichier du jour s'il existe. `snapshotTo(target)` = `VACUUM INTO '<chemin>'` (copie cohérente complète ; chemin **injecté en littéral** avec échappement `'` → `''` car `VACUUM INTO` **n'accepte pas de binding**). **Rotation** : garde `BACKUP_DB_KEEP` (défaut 14) snapshots.

**Liste (`listSnapshots`)** : fichiers `*.sqlite` de `BACKUP_DIR/db`, du plus récent au plus ancien. Par fichier : `file`, `size`, `mtime`, et `counts` (ouverture **lecture seule** + `COUNT(*)` sur projects/runs/tags/annotations/prompts). Fichier illisible → counts à 0 ; dossier absent → liste vide. Les `pre-restore-*.sqlite` apparaissent aussi.

## Restauration (`restoreSnapshot(file)`)
1. **Anti-traversal** : nom doit matcher `^[\w.\-]+\.sqlite$` et ne pas contenir `..` (sinon « Nom de snapshot invalide »).
2. Existence source (sinon « Snapshot introuvable »).
3. **Filet de sécurité** : snapshot de la base **actuelle** → `pre-restore-<timestamp>.sqlite` (échec toléré si base vide/illisible).
4. **Fermer la connexion** (`closeConnection`).
5. **Remplacer** : copier le snapshot par-dessus `DB_PATH`.
6. **Purger WAL/SHM** (`-wal`, `-shm`) obsolètes (sinon corruption).
7. **Reconnexion paresseuse** : pas de réouverture immédiate — la prochaine requête rouvre la nouvelle base.
8. Retourne `listSnapshots()`.

Endpoint `POST /api/snapshots/restore {file}` → `{ok:true, snapshots}` ; corps sans `file` → 400 « Fichier requis » ; erreur validation/introuvable → 400.

## Export / Import de config
- `GET /api/config/export` → `buildConfig()` en téléchargement (`audit-config.json`). **Sans runs.**
- `POST /api/config/import` (corps = format `buildConfig`, **idempotent**, dans l'ordre) :
  1. **tags** — par nom si absent ; couleur validée sinon `indigo` ; existant ignoré.
  2. **projects** — **dédup par cible d'audit résolue** ; `type`/`tool` normalisés ; nom+path obligatoires ; `ignored` réappliqué ; alimente la table `path → id`.
  3. **annotations** — **relink par `path`** → `project_id` ; path inconnu / CVE vide ignorés ; `status` validé ; upsert `(cve, project_id)`.
  4. **prompts** — dédup par titre ; tags nettoyés ; existant ignoré.
  5. **tickets** — relink par `path` ; upsert `(project_id, package)` ; path inconnu / package vide ignorés.
  Puis `scheduleBackup`. Réponse `{tagsAdded, projectsAdded, annotationsAdded, promptsAdded, ticketsAdded}`. Corps non-JSON → 400 « JSON invalide ».

## Réglages (`settings`)
Table `settings` (clé/valeur). `GET /api/settings` → `{auditMaxAgeHours, JIRA_BASE_URL, DISABLE_CONSOLE}`. `PUT` met à jour l'ensemble. 
- `auditMaxAgeHours` : validation nombre fini **et ≥ -1** (sinon 400 « Durée invalide »). Sémantique `> 0` / `0` / `-1` : voir §2 (`isFresh`).
- `JIRA_BASE_URL` : URL de base pour la génération des liens Jira des tickets (ex. `https://mon-jira.atlassian.net`).
- `DISABLE_CONSOLE` : `true`/`false`. Si `true`, le broadcast SSE de la console est désactivé côté serveur (le flux n'émet plus).

## Variables d'environnement

| Variable | Défaut | Rôle |
|----------|--------|------|
| `DB_PATH` | `audit.sqlite` | fichier de base (cible restauration + source snapshots) |
| `BACKUP_DIR` | `backups` | dossier racine des sauvegardes (config à la racine, snapshots dans `/db`) |
| `BACKUP_KEEP` | `30` | configs JSON datées conservées |
| `BACKUP_DB_KEEP` | `14` | snapshots `.sqlite` conservés |
| `BACKUP_INTERVAL_MIN` | `60` | intervalle périodique (min) ; **≤ 0 désactive** |
| `AUDIT_MAX_AGE_HOURS` | `24` | valeur par défaut de `audit_max_age_hours` |
| `GITHUB_TOKEN` | — | (optionnel) relève le quota GitHub 60→5000 req/h |
| `PORT` | `3000` | port du serveur |

`BACKUP_KEEP`/`BACKUP_DB_KEEP` : `Number(...) || défaut` → valeur non numérique **ou 0** retombe sur le défaut.

---

# Récapitulatif des endpoints API

| Méthode | Route | Rôle |
|---------|-------|------|
| GET | `/api/projects` | projets + dernier run + git live |
| POST | `/api/projects` | créer (409 si doublon de cible) |
| PUT | `/api/projects/:id` | modifier (409 si doublon) |
| DELETE | `/api/projects/:id` | supprimer (cascade runs/annotations/tickets) |
| POST | `/api/projects/:id/ignore` | ignorer / réactiver `{ignored}` |
| POST | `/api/projects/:id/audit` | auditer (dédup ; `?force=1`) → run + `newCves` + `deduped` |
| GET | `/api/projects/:id/history` | 30 derniers runs |
| POST | `/api/projects/:id/git-fetch` | `git fetch --verbose` + recompute |
| POST | `/api/projects/:id/git-pull` | `git pull --ff-only` + recompute |
| POST | `/api/detect` | auto-détection des lockfiles `{path, auditPath?}` |
| DELETE | `/api/runs/:id` | supprimer un run |
| GET | `/api/history-global` | série temporelle globale par jour |
| GET | `/api/stats` | aggrégation des statistiques globales (grade, risques, `pendingCves`) |
| GET | `/api/cves` | CVE agrégées par référence + annotation |
| POST | `/api/annotations` | upsert triage `{cve, projectId, status, note, fixedIn}` |
| POST | `/api/annotations/fetch-fix` | version corrigée d'UNE CVE via GitHub (429 si rate-limit) |
| GET / POST | `/api/tickets` | lister / upsert lien Jira |
| GET / POST | `/api/prompts` | lister / créer un prompt |
| PUT / DELETE | `/api/prompts/:id` | modifier / supprimer un prompt |
| GET / POST | `/api/tags` | lister / créer un tag |
| DELETE | `/api/tags/:id` | supprimer un tag (cascade projets) |
| GET / PUT | `/api/settings` | lire / modifier `{auditMaxAgeHours}` |
| GET | `/api/snapshots` | lister les snapshots `.sqlite` + compteurs |
| POST | `/api/snapshots/restore` | restaurer un snapshot `{file}` |
| GET | `/api/config/export` | exporter la config JSON (sans runs) |
| POST | `/api/config/import` | importer la config (idempotent) |
| GET | `/api/console` | flux SSE temps réel des commandes (non persisté) |
