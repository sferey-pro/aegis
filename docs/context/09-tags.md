> [Index](../CONTEXT.md) · [← §8 — Tickets Jira](08-jira.md) · [§10 — Bibliothèque de prompts →](10-prompts.md)

# 🏷️ 9. Tags

## Catalogue

Table `tags` : `name` (unique, **sensible à la casse**), `color` (validée, sinon `indigo`), `created_at`. Les tags stockés sur un projet sont de simples **noms** référençant ce catalogue.

## Normalisation à la saisie

Convertis en texte, trimés, chaînes vides retirées, dédupliqués.

## Cascade fonctionnelle à la suppression

`DELETE /api/tags/:id` **retire le nom de tous les projets qui le référencent** : lit le nom, supprime la ligne, réécrit chaque projet concerné, le tout dans une transaction. Aucune clé étrangère ne peut porter cette cascade — les tags d'un projet sont un tableau JSON, pas une table de jonction.

Sans elle, le nom restait collé aux projets, continuait de s'afficher, mais disparaissait de la liste des filtres : un tag inexistant et non filtrable, irrécupérable sans éditer chaque projet à la main.

Id inexistant → no-op, aucun projet modifié, 204 (idempotent). Nom déjà pris → « Un tag avec ce nom existe déjà ».

## Filtrage et périmètre d'audit

Le filtre courant est porté par l'**URL** (`?tag=`), ce qui le rend lisible par l'orchestrateur d'audit : c'est ce qui définit les projets « visibles » de §2. Il est aujourd'hui **mono-sélection** — choisir un tag remplace le précédent.

⚠️ Aucun mécanisme de renommage : corriger une faute de frappe impose de supprimer le tag, ce qui le retire de tous les projets, puis de le recréer et de le réaffecter un par un.

---

> [Index](../CONTEXT.md) · [← §8 — Tickets Jira](08-jira.md) · [§10 — Bibliothèque de prompts →](10-prompts.md)

Écarts observés entre cette section et le code : [`ISSUE.md`](../ISSUE.md). C'est la **liste unique** des défauts — consultez-la avant de conclure qu'un comportement surprenant est un bug neuf.
