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

Les deux renvoient `{ git, log, ok }`, `ok` valant `exit == 0`. Chemin inexistant → non-repo, `ok: false`, log « chemin introuvable ».

---

> [Index](../CONTEXT.md) · [← §4 — Historique & évolution](04-historique.md) · [§6 — GitHub Advisory Database →](06-advisories.md)

Écarts observés entre cette section et le code : [`ISSUE.md`](../ISSUE.md). C'est la **liste unique** des défauts — consultez-la avant de conclure qu'un comportement surprenant est un bug neuf.
