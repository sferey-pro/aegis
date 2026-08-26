> [Index](../CONTEXT.md) · [← §7 — Agrégation CVE & triage](07-triage.md) · [§9 — Tags →](09-tags.md)

# 🎫 8. Tickets Jira

## Objectif

Créer réellement l'issue de remédiation dans Jira, et conserver le lien.

## Création (`POST /api/tickets/create`)

Construit un document **ADF** et appelle l'API Jira v3 avec un en-tête `Authorization: Basic`. Champs envoyés : `project.key`, `summary` (`[Aegis] Remédiation <paquet>`), `description` (ADF), `issuetype.name`, plus `parent.key` et `components[]` s'ils sont configurés.

Réglages lus **en base** : `JIRA_BASE_URL`, `JIRA_USER`, `JIRA_PROJECT`, `JIRA_ISSUE_TYPE`, `JIRA_COMPONENT`, `JIRA_PARENT_EPIC`, et le secret `JIRA_API_KEY`.

## Garde anti-doublon

La charge est hachée en SHA-256, **`projectId` compris**. Deux projets partageant paquet et CVE produiraient sinon la même empreinte, et le refus citerait la référence d'un ticket appartenant à un autre projet. Une correspondance renvoie **409 sans rappeler Jira**, et rien n'est enregistré si Jira échoue.

## Lien conservé

Table `tickets`, unicité `(project_id, package)`, cascade à la suppression du projet. Le hash est remplacé à la mise à jour. Si de nouvelles CVE apparaissent sur le paquet ensuite, l'outil signale que le ticket n'est plus à jour.

## Test de connexion

`POST /api/tickets/test-connection` lit la configuration **enregistrée** et **ignore son corps de requête** : accepter une URL libre ferait de cette route un proxy sortant authentifié (§15).

## Types, et pourquoi seulement deux endpoints

Le swagger de l'API Jira Cloud est versionné dans `docs/references/swagger-v3.v3.json` (OpenAPI 3.0.1, **421 chemins, 971 schémas**). Aegis n'en appelle que deux : `getCurrentUser` pour le test de connexion, `createIssue` pour le ticket.

Le générer entièrement produit **64 369 lignes, 2,9 Mo**, et fait passer `tsc --noEmit` de 4,6 s à 5,6 s — mesuré. Pour deux endpoints, le rapport n'y est pas. Le dépôt ne versionne donc que la surface consommée, dans `src/lib/jira/types.ts`, et le fichier complet est régénérable :

```
bun run jira:types      # → src/lib/jira/schema.d.ts, ignoré par git
```

⚠️ **Aucune bibliothèque cliente.** Atlassian n'en publie pas pour appeler l'API depuis un serveur tiers — `@forge/*` ne tourne que sur leur plateforme, `atlassian-connect-express` vise les apps Connect. Les clients communautaires (`jira.js`) couvrent les 421 chemins et **construisent la requête à notre place** : or les invariants de §15 — re-validation https au point d'utilisation, refus de lire l'URL depuis le corps — et la traçabilité de §11 supposent qu'on possède l'appel. `fetch` est native sous Bun.

**Ce que le typage a immédiatement trouvé** : `key` est optionnel dans le schéma `CreatedIssue`, et la valeur partait telle quelle dans `saveTicket`. Une réponse sans clé aurait donc écrit « undefined » en base — un lien de ticket qui ne mène nulle part, indistinguable d'un vrai. La création répond désormais **502** dans ce cas, et n'enregistre rien.

---

> [Index](../CONTEXT.md) · [← §7 — Agrégation CVE & triage](07-triage.md) · [§9 — Tags →](09-tags.md)

Écarts observés entre cette section et le code : [`ISSUE.md`](../ISSUE.md). C'est la **liste unique** des défauts — consultez-la avant de conclure qu'un comportement surprenant est un bug neuf.
