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

---

> [Index](../CONTEXT.md) · [← §7 — Agrégation CVE & triage](07-triage.md) · [§9 — Tags →](09-tags.md)

Écarts observés entre cette section et le code : [`ISSUE.md`](../ISSUE.md). C'est la **liste unique** des défauts — consultez-la avant de conclure qu'un comportement surprenant est un bug neuf.
