> [Index](../CONTEXT.md) · [← §4 — Historique & évolution](04-historique.md) · [§6 — GitHub Advisory Database →](06-advisories.md)

# 🌿 5. Intégration Git

## Objectif

Donner l'état live du dépôt de chaque projet, **sans réseau** et **sans modifier l'arbre**, plus deux actions explicites de synchronisation.

## `GitInfo`

`{ isRepo, branch, sha, upstream, ahead, behind, dirty }`.

Environnement imposé : `GIT_OPTIONAL_LOCKS=0` (aucune écriture de lock parasite) et `GIT_TERMINAL_PROMPT=0` (jamais d'invite bloquante). Toutes les commandes en tableau, sans shell.

## Séquence de lecture

1. `rev-parse --is-inside-work-tree` — sinon `isRepo: false`, et l'on s'arrête.
2. `rev-parse --abbrev-ref HEAD` → branche.
3. `rev-parse HEAD` → SHA.
4. `status --porcelain` → `dirty` si la sortie n'est pas vide.
5. `remote` → présence d'un amont.
6. `rev-list --left-right --count @{u}...HEAD` → **`<behind>` puis `<ahead>`**, dans cet ordre. L'inverser afficherait « 1 commit d'avance » pour un retard.

⚠️ Sur un dépôt sans commit, `git rev-parse HEAD` écrit « fatal: … » sur **stderr** mais renvoie la chaîne littérale `HEAD` sur stdout. Le filtre doit examiner les deux flux, sans quoi `commit_sha` vaut `"HEAD"` — valeur qui satisfait la condition de déduplication et fait se dédupliquer deux audits successifs l'un contre l'autre.

## Actions

- **`git fetch --verbose`** : réseau. La progression sort sur stderr, donc le journal capture stderr **puis** stdout. Aucune sortie et succès → « Déjà à jour. ». Puis recalcul de `GitInfo`. Ne modifie ni l'arbre ni la branche ; `behind` peut passer de 0 à N.
- **`git pull --ff-only`** : refuse une divergence et ne crée **aucun** commit de fusion.

Les deux renvoient `{ git, log, ok }`, `ok` valant `exit == 0`. Chemin inexistant → non-repo, `ok: false`, log « chemin introuvable ». Le `git` est **recalculé après** l'action : sans lui, l'appelant devait recharger toute la liste des projets pour savoir ce qui avait changé.

## Synchronisation groupée

Bouton « Vérifier les mises à jour Git ». **`git fetch` uniquement** : les deux actions restent explicites, et un `pull --ff-only` en masse modifierait toutes les copies de travail d'un clic. Le `pull` reste par projet.

**Orchestré côté client, par le même pool que « Tout auditer »** ([§2](02-audits.md)) — `lib/batch` — mais **un dépôt à la fois** :

| | Comportement |
|---|---|
| Périmètre | les projets **visibles** au sens de §2 — non ignorés, filtrés par le tag porté par l'URL — hors projets distants, et dont l'état git n'est pas déjà connu comme « pas un dépôt » |
| Parallélisme | **aucun, volontairement** : `concurrency: 1`. Les `git fetch` sortent tous par le même lien réseau et la même authentification, et la console ([§11](11-console.md)) — seul endroit où l'on suit l'opération — devient illisible quand quatre dépôts y écrivent ensemble. La borne de 4 vaut pour l'audit, où chaque projet lit son propre lockfile |
| Annulation | `AbortController`. Les dépôts déjà lancés voient leur requête avortée, les suivants ne partent pas, et ils figurent au compte-rendu comme **annulés** |
| Progression | barre **non modale**, comme pour l'audit : le voile plein écran masquait la console live ([§11](11-console.md)), seul endroit où l'on voit `git fetch` tourner |
| Compte-rendu | trié **échecs d'abord**, puis par nombre décroissant de commits de retard, départage stable par nom |
| Échecs | **affichés**, dépôt par dépôt, avec le journal de git : un dépôt sans amont, une authentification refusée ou un hôte injoignable ne doivent pas se lire comme un succès |

`behind` est ici ce que `newCves` est à l'audit : ce qui demande une action. Un `git fetch` peut sortir non nul sur une réponse HTTP 200 — c'est `ok` qui tranche, jamais le statut.

Compter en secondes : chaque `git fetch` ouvre une connexion et s'authentifie auprès du serveur distant, soit de l'ordre d'une seconde par dépôt. Un parc de dix-sept demande donc une vingtaine de secondes, et c'est du réseau, pas du calcul. La barre de progression est là pour ça.

## L'état git ne se lit pas au chargement

`GET /api/projects` **ne calcule pas** l'état git : cinq sous-processus par projet — 85 pour un parc de dix-sept — pour une information que l'écran n'a pas demandée. Trois façons de l'obtenir, toutes **volontaires** :

| Portée | Comment | Réseau |
|---|---|---|
| tout le parc visible | bouton « Vérifier les mises à jour Git » — chaque réponse porte son `git` recalculé | oui (`git fetch`) |
| un projet | bouton « Lire » / « Détecter » de la carte → `GET /api/projects/:id` | non |
| tout le parc | `GET /api/projects?git=1` | non |

`git: null` signifie **« non chargé »**, et jamais « pas un dépôt » — les deux états sont distincts à l'écran (« État Git non chargé » contre « Dépôt Non-Git »). Les confondre afficherait « non-git » sur tout le parc à chaque ouverture de la page, et rendrait le bouton de synchronisation inopérant faute de cible.

Corollaire : après une action git, l'état vient de **la réponse**, jamais d'un rechargement de la liste — celle-ci le remettrait à `null`.

---

> [Index](../CONTEXT.md) · [← §4 — Historique & évolution](04-historique.md) · [§6 — GitHub Advisory Database →](06-advisories.md)

Écarts observés entre cette section et le code : [`ISSUE.md`](../ISSUE.md). C'est la **liste unique** des défauts — consultez-la avant de conclure qu'un comportement surprenant est un bug neuf.
