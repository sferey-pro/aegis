> [Index](../CONTEXT.md) · [← §12 — Sauvegarde, restauration & réglages](12-sauvegarde.md) · [§14 — Comptes-rendus d'audit →](14-rapports.md)

# 📡 13. Ingestion CI

## Objectif

Accepter un rapport d'audit produit **ailleurs** — une CI, un runner — et le persister comme un run. Inverse le sens du flux : la CI exécute l'audit dans l'environnement du build et pousse son résultat, ce qui évite toute copie du code côté Aegis.

## `POST /api/ingest/:slug`

- **Authentification** : en-tête `X-Aegis-Token`, comparé à `AEGIS_INGEST_TOKEN` par contrôle de **longueur puis** `timingSafeEqual`. La comparaison à temps constant lève sur des tampons de tailles différentes, d'où le contrôle de longueur devant.
- **L'authentification passe avant la recherche du slug** : un 404 sur un slug inconnu sans jeton révélerait quels projets existent.
- Sans `AEGIS_INGEST_TOKEN` configuré → **500** « Configuration manquante: AEGIS_INGEST_TOKEN », jamais 401.
- Paramètre `?sha=` : révision auditée. Optionnel, mais sans lui le run n'est rattaché à aucun commit.
- Corps : la sortie brute de l'outil, telle quelle. Corps vide → 400 « Payload vide ».

## Traitement

Parse selon l'outil **déclaré sur le projet**, pas selon le contenu. Fige la date de première détection (§7), complète depuis le cache d'avis local, calcule `newCves` selon §2 — sur le run précédent du projet, **sans** passer par l'agrégat global dont le filtre « ignoré » a une finalité d'affichage.

Réponse : `{ success: true, run, newCvesCount }`.

## Ce que l'ingestion ne fait pas

- **Aucun appel réseau vers GitHub** : le cache est lu, pas alimenté.
- **Aucune déduplication par commit**, contrairement à l'audit local : dix envois sur le même `sha` créent dix runs.
- **Aucune opération git.**

---

> [Index](../CONTEXT.md) · [← §12 — Sauvegarde, restauration & réglages](12-sauvegarde.md) · [§14 — Comptes-rendus d'audit →](14-rapports.md)

Écarts observés entre cette section et le code : [`ISSUE.md`](../ISSUE.md). C'est la **liste unique** des défauts — consultez-la avant de conclure qu'un comportement surprenant est un bug neuf.
