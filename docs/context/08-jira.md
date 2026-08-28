> [Index](../CONTEXT.md) · [← §7 — Agrégation CVE & triage](07-triage.md) · [§9 — Tags →](09-tags.md)

# 🎫 8. Tickets Jira

## Objectif

Créer réellement l'issue de remédiation dans Jira, et conserver le lien.

## Deux types de jetons, déclarés et non déduits

Réglage **`JIRA_TOKEN_KIND`**, `classic` par défaut :

| Type déclaré | Point d'entrée de l'API | Qui authentifie |
|---|---|---|
| `classic` — jeton d'API simple | `https://<site>.atlassian.net/rest/api/3/…` | le site lui-même |
| `scoped` — jeton à périmètre | `https://api.atlassian.com/ex/jira/<cloudId>/rest/api/3/…` | la passerelle d'identité |

⚠️ Un jeton à périmètre appelé sur le domaine du site est rejeté par un **401 « Client must be authenticated to access this resource »**. C'est un refus d'**identification**, pas de permission : le site ne sait pas consommer ce jeton. Le message n'évoque aucun droit, ce qui en fait un symptôme trompeur — constaté à l'usage.

⚠️ **`JIRA_BASE_URL` reste toujours l'adresse du site**, y compris avec un jeton à périmètre. Une première version déduisait le point d'entrée du **nom d'hôte** de cette URL, ce qui obligeait à y mettre `api.atlassian.com` — or elle construit aussi les liens `/browse/<clé>` des tickets dans l'interface. Ces liens pointaient alors vers la passerelle, qui n'est pas une interface web : **ils étaient morts**. Le diagnostic refuse désormais explicitement une URL de passerelle en base.

Le `cloudId` est **obligatoire** pour un jeton à périmètre : la passerelle sert tous les tenants, et rien dans l'URL ni dans le jeton ne dit lequel viser. Réglage `JIRA_CLOUD_ID`, dont le champ n'apparaît dans l'écran Réglages **que** si le type `scoped` est choisi. Il se lit sans authentification sur `https://<site>.atlassian.net/_edge/tenant_info`.

Sans `cloudId`, la construction d'URL rend `null` et **aucun appel ne part** — mieux vaut refuser qu'interroger une URL qu'on sait fausse. Une valeur de `JIRA_TOKEN_KIND` inattendue retombe sur `classic` plutôt que de router au hasard.

**Conséquence sur les portées.** Avec un jeton classique, le plafond de droits est celui du compte. Avec un jeton à portées, c'est l'intersection des droits du compte et des portées déclarées :

| Appel d'Aegis | Portée nécessaire |
|---|---|
| `GET /rest/api/3/myself` | `read:jira-user` |
| `POST /rest/api/3/issue` | `write:jira-work` |

Un jeton portant seulement `read:jira-user` passe donc le test de connexion et échoue la création, cette fois sur un refus de permission.

## Création (`POST /api/tickets/create`)

Construit un document **ADF** et appelle l'API Jira v3 avec un en-tête `Authorization: Basic`. Champs envoyés : `project.key`, `summary` (`[Aegis] Remédiation <paquet>`), `description` (ADF), `issuetype.name`, plus `parent.key` et `components[]` s'ils sont configurés.

⚠️ **Le nom du type d'issue n'a pas de valeur par défaut**, et c'est délibéré : ces noms sont **localisés par instance**. Un projet français expose « Tâche », « Dette Technique », « Bug », « Story » — et « Task » n'y existe pas. Le repli silencieux sur `"Task"` produisait donc un **400 de Jira après une tentative d'écriture**, sur un champ que l'écran présentait comme facultatif. La configuration est refusée avant l'appel, en nommant le champ manquant.

Corollaire : la liste des types valides d'un projet se lit sans rien créer, par `GET /rest/api/3/issue/createmeta?projectKeys=<clé>&expand=projects.issuetypes.fields`. Elle donne aussi les champs **obligatoires** de chaque type — dont `parent`, requis pour les sous-tâches et optionnel pour les autres.

Réglages lus **en base** : `JIRA_BASE_URL`, `JIRA_USER`, `JIRA_PROJECT`, `JIRA_ISSUE_TYPE`, `JIRA_COMPONENT`, `JIRA_PARENT_EPIC`, et le secret `JIRA_API_KEY`.

## Refus de Jira, rendus lisibles

Le corps d'erreur de l'API est un `ErrorCollection` : une liste de messages généraux, et une **liste indexée par champ**. C'est la seconde qui compte — elle nomme exactement le champ à corriger.

Aegis le recopiait brut dans l'interface :

```
Erreur Jira: 400 {"errorMessages":[],"errors":{"issuetype":"Spécifiez un type de ticket valide"}}
```

Il rend désormais une phrase, et ajoute l'aide que Jira ne donne pas :

```
Jira a refusé la demande (400) — issuetype : Spécifiez un type de ticket valide.
Le nom du type est localisé : vérifiez celui que votre projet expose
(par exemple « Tâche » plutôt que « Task ») dans les Paramètres.
```

La **console** (§11), elle, garde le corps brut : c'est la trace technique, et elle ne doit pas être reformulée. Un corps non-JSON — page d'erreur d'un proxy — est conservé tronqué à 200 caractères : mieux qu'un message vide, pas une page entière dans une notification.

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
