> [Index](../CONTEXT.md) · [← §3 — Parsing & normalisation](03-parsing.md) · [§5 — Intégration Git →](05-git.md)

# 📈 4. Historique des audits & évolution des CVE

## Runs

Table `runs` : `project_id`, `status` (`ok` \| `vulnerable` \| `error`), `total`, `counts` (JSON), `vulnerabilities` (JSON), `command`, `commit_sha`, `error`, `duration_ms`, `ran_at`.

## Définition du « dernier run »

**Une seule, partout** : `ORDER BY ran_at DESC, id DESC`. Le `id DESC` tranche deux audits de la même seconde. La variante par lot (`getLatestRunsByProjectIds`, employée par le listing) applique la même règle via `ROW_NUMBER()`.

Deux définitions concurrentes coexistaient — l'une par `ran_at`, l'autre par `MAX(id)`. Elles coïncident tant que les identifiants suivent le temps, et divergent **silencieusement** après une restauration de snapshot ou un import de runs hors ordre chronologique : la carte projet affichait un run, l'agrégation CVE en utilisait un autre.

## Suppression d'un run (`DELETE /api/runs/:id`)

Succès → **204**. Identifiant inconnu → **404** « Run introuvable » ; identifiant non numérique → **400** « Identifiant de run invalide ».

**Unitaire, sans contrainte.** Le dernier run étant *recalculé* à chaque lecture, supprimer le plus récent fait du précédent l'état courant, et supprimer le dernier restant laisse le projet sans état. Ni l'une ni l'autre n'est une erreur : ce sont les issues normales de l'opération, déjà gérées en aval — un projet sans run est simplement absent des agrégations.

Le 404 sur un identifiant inconnu est délibéré, contre l'ancienne spécification qui annonçait un 204 idempotent : l'interface doit distinguer « supprimé » de « n'existait pas », sinon elle masque une désynchronisation entre la liste affichée et l'état réel (motif établi par N37).

## Historique par projet (`GET /api/projects/:id/history`)

Les runs du projet, `ran_at DESC` puis `id DESC` — la définition unique ci-dessus —, **limités aux 30 derniers**, chaque run **complet** (`counts` et `vulnerabilities` désérialisés). **Erreurs incluses** : c'est le signal que cette route apporte et qu'un audit unitaire ne donne pas. Un run en erreur affiche son message, mais rien ne dit que c'est le cinquième d'affilée.

Projet inconnu → **404** « Projet introuvable », jamais une liste vide : « aucun historique » et « ce projet n'existe pas » ne se lisent pas de la même façon, et les confondre est le mode de défaillance que N6 a fermé partout ailleurs.

Aucun paramètre de pagination : la limite de 30 est fixée par le contrat, et en inventer un ajouterait de la surface non spécifiée.

## Évolution globale (`GET /api/history-global`)

Reconstitue, par jour, le total agrégé de **tous les projets actifs**. Sortie : `{date, label, counts, total}[]`, chronologique croissant.

- `date` : clé du bucket, `YYYY-MM-DD` — ou `YYYY-MM-DD HH` en vue horaire (`?days=1`, 24 buckets).
- `label` : libellé d'affichage, « JJ/MM » ou « NNh ».
- `counts` : les **six** sévérités. `total` : leur somme.

**Algorithme** — parcours chronologique en maintenant un **état par projet** :

1. un run `error` est **ignoré**, l'état connu du projet **n'est pas écrasé** — une erreur ne doit pas faire disparaître les vulnérabilités précédentes ;
2. sinon l'état du projet est mis à jour ;
3. après chaque bucket, somme par sévérité des états courants de **tous** les projets ;
4. plusieurs runs dans le même bucket → **dernière écriture gagnante**.

**La clé de bucket se découpe dans la chaîne `ran_at`** (`slice(0, 10)`), jamais via un objet `Date`. Toute conversion réintroduit un décalage de fuseau : `ran_at` est stocké en UTC, et un run de 23 h 30 se retrouvait rangé au lendemain dans tout fuseau positif.

**Amorçage** : la requête est bornée à la fenêtre demandée, plus le dernier run non-erreur de chaque projet **avant** elle. Sans cet amorçage, un projet audité une seule fois il y a six mois disparaîtrait de la série — ce qui se lirait comme une remédiation.

**`?days`** doit être un entier dans `[1, 365]`, sinon 400 « Fenêtre invalide : days doit être un entier entre 1 et 365 ». Non borné, il construisait cent mille buckets et bloquait le process ; non validé, `?days=abc` renvoyait `[]` en 200 — un graphique vide sans message, indistinguable d'un parc sans historique.

## Cas limites

Aucun run → série de buckets à zéro. Projet ignoré → absent de la série globale, historique projet inchangé. Runs uniquement en erreur → jamais dans la série. Erreur après des runs valides → état conservé. Audit dédupliqué → pas de run, pas de `newCves`.

---

> [Index](../CONTEXT.md) · [← §3 — Parsing & normalisation](03-parsing.md) · [§5 — Intégration Git →](05-git.md)

Écarts observés entre cette section et le code : [`ISSUE.md`](../ISSUE.md). C'est la **liste unique** des défauts — consultez-la avant de conclure qu'un comportement surprenant est un bug neuf.
