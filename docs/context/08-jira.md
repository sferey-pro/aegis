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

Réglages lus **en base** : `JIRA_BASE_URL`, `JIRA_TOKEN_KIND`, `JIRA_CLOUD_ID`, `JIRA_USER`, `JIRA_PROJECT`, `JIRA_COMPONENT`, `JIRA_PARENT_EPIC`, et le secret `JIRA_API_KEY`. Le type de ticket vient du corps de la requête (voir ci-dessous).

### Validation des corps

Les quatre routes qui prennent un corps — brouillon (`POST /api/tickets`), liaison (`/link`), suppression du lien (`/unlink`), création (`/create`) — passent par Zod (`src/lib/schemas.ts`), en 400 avec un seul message, comme §1 :

| Contrôle | Message |
|---|---|
| Corps JSON lisible | « JSON invalide » |
| `projectId` entier | « Projet requis » |
| `packageName` non vide (trim) | « Paquet requis » |
| `ref` non vide (trim), liaison seulement | « Référence requise » |
| `issueType` non vide, création seulement | « Choisissez un type de ticket avant de créer le ticket. » |

`cves` est facultatif et vaut `[]` par défaut ; `notes` vaut `""`. Un `cves` absent faisait auparavant lever `cves.includes` et sortait en **500**. Le refus sur `issueType` est rendu par la route, **après** le contrôle de configuration Jira : sans configuration, c'est la consigne « configurez… dans les Paramètres » qui prime.

## Page de création (`/tickets/new`)

Le ticket se prépare sur **sa propre page**, portée par l'URL — `?project=<id>&package=<nom>` — comme les filtres du triage : partageable, et le retour ramène au triage du projet. On y arrive par le bouton « Ticket » d'un paquet du triage.

Trois choix y sont faits, et nulle part ailleurs :

1. **le paquet**, parmi ceux du projet qui portent des vulnérabilités — l'unicité de la table `tickets` est `(project_id, package)`, un ticket vaut pour un paquet ;
2. **les CVE à traiter**, par cases à cocher, toutes cochées au départ : le cas courant reste « tout le paquet », décocher est l'exception qu'on rend possible. Un paquet à huit CVE ne se traite pas toujours d'un bloc, et une dette technique et un bug ne se rangent pas au même endroit ;
3. **le type de ticket**, ci-dessous.

L'aperçu Markdown suit la sélection : `POST /api/tickets` accepte un `cves` facultatif et ne décrit que ces CVE — absent, tout le paquet ; rien qui corresponde, **404**. La création (`POST /api/tickets/create`) part avec la même liste. Sans CVE cochée ni type choisi, le bouton reste inactif : le serveur refuserait, autant le dire avant.

Un ticket déjà lié au paquet est **signalé** sur la page, avec son lien ; la garde anti-doublon (ci-dessous) reste celle du serveur.

Cette page remplace une modale ouverte depuis le triage, qui embarquait toutes les CVE du paquet sans choix possible. L'état réseau vit dans `lib/useTicketDraft.ts` ; les organismes `CveSelectionList` et `TicketForm` composent la page.

## Choix du type de ticket (`GET /api/tickets/issue-types`)

Le type se choisit **sur la page de création**, par une liste déroulante, et **nulle part ailleurs** : le réglage `JIRA_ISSUE_TYPE` a été retiré. Une valeur enregistrée une fois pour toutes se périmait au premier changement de projet, et la saisie libre qu'elle supposait produisait « Spécifiez un type de ticket valide » **après** une tentative d'écriture. Une dette technique et un bug ne se rangent pas au même endroit : c'est une décision par ticket.

Le type est donc **requis dans le corps de la requête**. Sans lui, refus en 400 avant tout appel — et le bouton de création reste inactif tant que rien n'est choisi, ce qui dit « il manque quelque chose ici » plutôt que de laisser partir un appel voué au refus.

La liste déroulante est l'atome `Select` du dépôt (Radix), pas un `<select>` natif : c'est lui qui porte les tokens de thème et le comportement clavier (défaut N27, « design system contourné »).

La liste est **lue dans Jira**, jamais codée en dur : `GET /rest/api/3/issue/createmeta?projectKeys=<clé>` — lecture seule, portée `read:jira-work`, ne crée rien. Une liste en dur serait fausse sur toute instance dont la langue diffère.

Deux règles :

1. **Les sous-tâches sont écartées.** Elles exigent un parent qui soit une tâche, alors que les tickets d'Aegis se rattachent à une epic (`JIRA_PARENT_EPIC`) : les proposer mènerait à un refus garanti.
2. **Un échec rend `200` avec une liste vide et le motif.** L'écran retombe alors sur une saisie libre, et la création reste possible avec le nom tapé à la main — la liste est un confort, pas une dépendance.

## Refus de Jira, rendus lisibles

Le corps d'erreur de l'API est un `ErrorCollection` : une liste de messages généraux, et une **liste indexée par champ**. C'est la seconde qui compte — elle nomme exactement le champ à corriger.

Aegis le recopiait brut dans l'interface :

```
Erreur Jira: 400 {"errorMessages":[],"errors":{"issuetype":"Spécifiez un type de ticket valide"}}
```

Il rend désormais une phrase, et ajoute l'aide que Jira ne donne pas :

```
Jira a refusé la demande (400) — issuetype : Spécifiez un type de ticket valide.
Le nom du type est localisé : choisissez-le dans la liste de la page de création,
ou saisissez celui que votre projet expose (par exemple « Tâche » plutôt que « Task »).
```

La **console** (§11), elle, garde le corps brut : c'est la trace technique, et elle ne doit pas être reformulée. Un corps non-JSON — page d'erreur d'un proxy — est conservé tronqué à 200 caractères : mieux qu'un message vide, pas une page entière dans une notification.

## Garde anti-doublon

La charge est hachée en SHA-256, **`projectId` compris**. Deux projets partageant paquet et CVE produiraient sinon la même empreinte, et le refus citerait la référence d'un ticket appartenant à un autre projet. Une correspondance renvoie **409 sans rappeler Jira**, et rien n'est enregistré si Jira échoue.

## Lien conservé

Table `tickets`, unicité `(project_id, package)`, cascade à la suppression du projet. Le hash est remplacé à la mise à jour. Si de nouvelles CVE apparaissent sur le paquet ensuite, l'outil signale que le ticket n'est plus à jour.

## Test de connexion

`POST /api/tickets/test-connection` lit la configuration **enregistrée** et **ignore son corps de requête** : accepter une URL libre ferait de cette route un proxy sortant authentifié (§15).

Un refus de Jira y passe par la même mise en forme que la création (ci-dessus) : « Statut HTTP 401 » taisait le « Client must be authenticated » qui signale un jeton à périmètre appelé sur le site, et le rendait indistinguable d'un mot de passe faux.

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
