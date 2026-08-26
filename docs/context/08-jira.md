> [Index](../CONTEXT.md) · [← §7 — Agrégation CVE & triage](07-triage.md) · [§9 — Tags →](09-tags.md)

# 🎫 8. Tickets Jira

## Objectif

Créer réellement l'issue de remédiation dans Jira, et conserver le lien.

## Deux familles de jetons, deux chemins

Atlassian propose deux sortes de jetons d'API, et elles ne s'authentifient pas au même endroit :

| Jeton | Point d'entrée | Qui authentifie |
|---|---|---|
| **classique** (sans portées) | `https://<site>.atlassian.net/rest/api/3/…` | le site lui-même |
| **à portées** (`read:jira-user`…) | `https://api.atlassian.com/ex/jira/<cloudId>/rest/api/3/…` | la passerelle d'identité |

⚠️ Un jeton à portées appelé sur le domaine du site est rejeté par un **401 « Client must be authenticated to access this resource »**. C'est un refus d'**identification**, pas de permission : le site ne sait pas consommer ce jeton. Le message n'évoque aucun droit, ce qui en fait un symptôme trompeur — constaté à l'usage.

Le `cloudId` est **obligatoire** sur la passerelle, qui sert tous les tenants : rien dans l'URL ni dans le jeton ne dit lequel viser. Il se lit sans authentification sur `https://<site>.atlassian.net/_edge/tenant_info`.

Réglage `JIRA_CLOUD_ID`, et le champ n'apparaît dans l'écran Réglages **que** si l'URL désigne `api.atlassian.com` — l'afficher toujours ferait croire à une configuration obligatoire pour tout le monde. Il est accepté aussi directement dans l'URL de base (`…/ex/jira/<cloudId>`), les deux écritures existant dans la nature ; le réglage l'emporte, sinon on ne pourrait plus changer de site sans réécrire l'URL.

⚠️ **Le préfixe de la passerelle doit être conservé.** `jiraEndpoint` résolvait le chemin depuis la **racine** du domaine, ce qui effaçait `/ex/jira/<cloudId>` sans rien signaler : l'appel partait vers `https://api.atlassian.com/rest/api/3/myself`, qui n'existe pas. Sans `cloudId` exploitable, la construction rend `null` et **aucun appel ne part** — mieux vaut refuser qu'interroger une URL qu'on sait fausse.

**Conséquence sur les portées.** Avec un jeton classique, le plafond de droits est celui du compte. Avec un jeton à portées, c'est l'intersection des droits du compte et des portées déclarées :

| Appel d'Aegis | Portée nécessaire |
|---|---|
| `GET /rest/api/3/myself` | `read:jira-user` |
| `POST /rest/api/3/issue` | `write:jira-work` |

Un jeton portant seulement `read:jira-user` passe donc le test de connexion et échoue la création, cette fois sur un refus de permission.

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
