# ✅ Couverture de test — état au 24/08/2026

Ce document est l'**inventaire** de ce qui est couvert. Pour les conventions et
le fonctionnement du harnais, voir [`TESTING.md`](./TESTING.md).

```
1431 tests · 0 échec · 102 fichiers
├── 444 composants (52 fichiers) — DOM, React, fetch simulé
└── 987 fonctionnels (50 fichiers) — vrai serveur, vraie base, vrai git
```

Les défauts que cette suite a mis au jour ne sont pas listés ici : ils sont inscrits
dans [`ISSUE.md`](./ISSUE.md), liste unique groupée par priorité. Le § 5 ci-dessous
n'en donne que la table de correspondance.

Vérifié avec `biome check --error-on-warnings` en 0 et `tsc --noEmit` en 0.
Aucun fichier résiduel dans le dépôt ni dans `/tmp` après un run complet.

Couverture de lignes, mesurée étage par étage (`bun run coverage`) :
**96,3 % sur le backend**, **94,1 % sur le frontend**.

---

## 1. Frontend — 440 tests

Colocation intégrale : chaque `.tsx` a son `.test.tsx` à côté, suivant
l'Atomic Design.

| Couche | Fichiers | Tests | Ce qui est vérifié |
|---|---:|---:|---|
| `components/ui/` (atomes) | 16 | 66 | rendu, variantes `cva`, transfert des props, `data-slot` |
| `components/molecules/` | 12 | 77 | composition d'atomes, états conditionnels, pastilles, dates, progression |
| `components/organisms/` | 11 | 136 | blocs fonctionnels, modales, tableaux, interactions |
| `components/templates/` | 2 | 11 | gabarits de mise en page, `Outlet` |
| `components/layout/` | 3 | 16 | chargeur global, voile en portail, modale de rapport |
| `pages/` | 7 | 108 | écrans complets, chargement, erreurs réseau, pagination, instantanés |
| `App.tsx` | 1 | 19 | routage, montage, **orchestration de l'audit global** |

Le réseau est simulé (`mockFetch`) : les pages exercent le chargement, la
réponse vide, l'erreur réseau et le JSON invalide. Les composants qui consomment
le flux console utilisent le faux `EventSource`, qui gère **les deux API** —
`Console` pose un `onmessage`, `Projects` passe par
`addEventListener("message", …)`.

---

## 2. Base de données — 192 tests

Tous sur une base SQLite jetable (`useTempDb`). Aucune simulation : le SQL, les
clés étrangères et les migrations sont réels.

| Module | Tests | Contrats notables |
|---|---:|---|
| `db/index.ts` | 12 | schéma, WAL, `PRAGMA foreign_keys`, migrations `ALTER TABLE` idempotentes |
| `db/projects.ts` | 17 | slug, tags JSON, bascule « ignoré », cascade de suppression |
| `db/occurrences.ts` | 11 | **gel de `first_seen_at`** (régression C12) |
| `db/runs.ts` | 20 | dernier run par `ran_at` puis `id`, fenêtre de 30, historique global |
| `db/annotations.ts` | 14 | un champ non fourni est **conservé**, pas réinitialisé |
| `db/tickets.ts` | 16 | l'unité est `(projet, paquet)`, hash remplacé à la mise à jour |
| `db/settings.ts` | 13 | `setAllSettings` **fusionne**, coerce, et est transactionnel |
| `db/backup.ts` | 26 | instantanés datés, rotation, anti-traversal, **restauration réelle** |
| `db/reports.ts` | 11 | le détail est un instantané, il survit à la suppression du projet |
| `db/tags.ts` | 10 | unicité, message d'erreur français |
| `db/prompts.ts` | 12 | tags JSON, remplacement (pas fusion) à la mise à jour |
| `db/backup.ts` | 6 | `VACUUM INTO` cohérent, refus de restauration sans instantané |

> **Régression C12, la plus importante de cette couche.** Le test force la date
> stockée à `'2020-01-01 00:00:00'` avant le second appel : sans cela, une
> réécriture se cacherait derrière deux horodatages de la même seconde. Séquence
> exercée : détection → run en erreur → nouvelle détection, et `first_seen_at`
> ne bouge pas.

> **`db/backup.ts`** : le chemin de restauration réussie n'est **volontairement
> pas** exercé — `restoreSnapshot()` appelle `process.exit(0)` cent
> millisecondes après son retour, ce qui tuerait l'exécuteur. Seul son refus est
> testé.

---

## 3. Logique métier — 434 tests

| Module | Tests | Contrats notables |
|---|---:|---|
| `lib/schemas.ts` | 45 | **messages identiques à `CONTEXT.md`**, mot pour mot |
| `lib/audit/index.ts` | 59 | `resolveAuditTarget`, déduplication §12, contrôles préalables, run en erreur, `ingestAudit` |
| `lib/audit/preflight.ts` | 19 | catalogue des commandes, chemin et lockfile manquants, messages **mot pour mot** |
| `lib/github/index.ts` | 50 | cache d'avis, quota (en-têtes **et** `/rate_limit`), choix du correctif par branche majeure |
| `lib/aggregator/index.ts` | 38 | regroupement par CVE, clé de repli, âge baseline vs SLA, **superposition des avis** |
| `lib/advisory-sync.ts` | 19 | clés distinctes des derniers runs, arrêt sur quota, reprise, **verrou partagé** |
| `lib/advisory-scheduler.ts` | 12 | intervalle et ses replis, idempotence du démarrage, première passe différée |
| `lib/triage-constants.tsx` | 14 | palette contrastée, six formes distinctes, six libellés |
| `lib/tailwind-classes.ts` | 4 | garde-fou sur tout `src/` : variante amputée, valeur tronquée, opacité orpheline |
| `lib/git/index.ts` | 26 | dépôts jetables réels, `ahead`/`behind`, `pull --ff-only` |
| `lib/parsers/` (6) | 62 | npm, bun, yarn, composer + utils, tolérance aux formes partielles |
| `lib/console.ts` | 18 | cadrage SSE, troncature à 3000, purge d'un client fermé |
| `lib/cvss.ts` | 14 | vecteurs 3.1 et 4.0, regroupement, infobulle |
| `lib/utils.ts` | 14 | `cn` (conflits Tailwind), `errorMessage` |
| `lib/validate.ts` | 14 | échec **retourné**, jamais levé ; toujours `{ error }` + 400 |
| `lib/audit/queue.ts` | 14 | mutex **global**, libéré dans un `finally` |

Points qui méritaient d'être épinglés :

- **Le contrôle préalable a trouvé un défaut dans le contrôle préalable.** Écrit
  en `tool in AUDIT_TOOLS`, `isKnownTool` remontait la chaîne de prototype :
  `constructor` passait pour un outil d'audit valide. Le test énumérait quatre
  entrées invalides plutôt qu'une, dont ce nom-là — sans quoi le défaut passait.
  `Object.hasOwn` sur toute table de correspondance en objet littéral.
- **Les messages sont comparés en `toBe`, pas en `toContain`.** Ceux de §2 sont
  contractuels à la ponctuation près (`Lockfile manquant: bun.lock ou bun.lockb
  (cherché dans <cwd>)`) : un `toContain` laisserait passer une reformulation.
- **`resolveAuditTarget` est la source de vérité unique.** Un `audit_path`
  commençant par `/` ou `~` **remplace** la racine git au lieu d'y être
  concaténé. C'est la divergence qui permettait de valider un chemin absolu comme
  relatif puis de l'exécuter comme absolu.
- **Sens de `rev-list --left-right --count`** : « retard puis avance ». L'inverser
  afficherait « 1 commit d'avance » pour un retard.
- **`pull --ff-only` refuse une divergence** et ne crée aucun commit de fusion.
  Le test le vérifie en comptant les merges après l'échec.
- **Un 403 GitHub avec `x-ratelimit-remaining: 0`** compte comme quota dépassé,
  au même titre qu'un 429. Le confondre avec un refus d'accès ferait abandonner
  l'enrichissement.
- **Choix du correctif** : parmi plusieurs branches corrigées, celle de la
  majeure du projet passe avant la plus récente. Proposer `4.17.21` à un projet
  en `2.x` enverrait sur une montée de version majeure alors qu'un correctif
  existe sur sa branche.
- **Deux compteurs d'âge distincts** : une faille de baseline est datée de
  `published_at` (sinon une faille de 2019 s'afficherait « 0 jour »), une
  découverte nette de `first_seen_at`.
- **Les avis GHSA sont superposés à la lecture**, pas réécrits dans le run. Un
  enrichissement devient donc visible sans réauditer, et le run reste le compte
  rendu brut de l'outil. La sévérité de l'avis fait autorité — c'est elle qui
  corrige les `unknown` de `yarn audit` — et une seule fonction sert le tri, le
  dédoublonnage et l'affichage, sans quoi un groupe pouvait s'annoncer « low » en
  contenant une occurrence « critical ».
- **L'enrichissement en masse s'arrête au premier 429** et annonce ce qui reste.
  Ce qui a été récupéré avant l'arrêt est conservé : un second appel reprend là où
  le premier s'était arrêté.
- **Un nom de test n'est pas une assertion.** Celui de N25 s'appelait « les notes
  ne fuient pas d'un ticket au suivant » et affirmait l'inverse — il épinglait la
  fuite. Il passait encore après le correctif, parce qu'il n'exerçait que le cas
  non atteignable. Chaque test de non-régression écrit depuis est **confronté au
  défaut d'origine** : on le réintroduit, on vérifie que le test rougit, on le
  retire.
- **Le test de fuseau tourne sous plusieurs `TZ`.** Un test qui ne s'exécute
  qu'en UTC ne prouve rien sur un défaut de fuseau : celui de la série globale a
  été confronté à l'ancien calcul, qui échoue sous `TZ=Asia/Tokyo` et passe sous
  `TZ=UTC` (défaut N13). La parade est de découper la clé de bucket **dans la
  chaîne** `ran_at`, sans jamais construire de `Date` — le décalage devient
  impossible par construction.
- **Le pool d'audit est vérifié en mesurant *avant* la première réponse.** Une
  attente sur « au moins 4 appels partis » ne prouverait rien : une exécution
  séquentielle finit par y passer aussi. Le test mesure à 30 ms contre 120 ms de
  latence simulée, et il a été confronté à un pool réduit à 1 pour vérifier qu'il
  rougit.
- **Les classes Tailwind écrites en dur sont vérifiées à la source.** Ni Tailwind,
  ni Biome, ni `tsc` ne signalent un ` :bg-input/50` — Tailwind ignore ce qu'il ne
  reconnaît pas, et les deux autres ne lisent pas le contenu des chaînes. Onze
  occurrences avaient survécu dans les atomes Shadcn, donc dans toute
  l'application (défaut N14).

---

## 4. API — 263 tests fonctionnels

Vrai `Bun.serve` sur port éphémère, vraie base jetable, vraies requêtes HTTP.
Les 33 routes d'API déclarées sont exercées.

| Module | Tests | Contrats notables |
|---|---:|---|
| `routes/projects.ts` | 54 | `AEGIS_ALLOWED_ROOTS`, doublons, détection d'outil, actions git |
| `routes/tickets.ts` | 32 | brouillon Markdown, ADF Jira, anti-doublon par hash |
| `routes/settings.ts` | 30 | validation §12, export masqué, import rejouable, instantanés |
| `routes/stats.ts` | 24 | note de santé, score de risque pondéré, historique |
| `routes/audit.ts` | 19 | lot global, 429 si occupé, jeton d'ingestion CI |
| `routes/annotations.ts` | 13 | 404 avant la clé étrangère |
| `routes/prompts.ts` | 13 | 404 sur mise à jour d'un id inconnu |
| `routes/tags.ts` | 12 | 201 / 204, doublon en 400 |
| `routes/cves.ts` | 11 | agrégation, rafraîchissement d'avis, purge du cache |
| `routes/reports.ts` | 10 | colonnes JSON, instantané du détail |
| `routes/console.ts` | 9 | flux SSE réel, lu et annulé côté client |
| `index.ts` | 7 | fourre-tout SPA, asset statique, port éphémère |

Invariants de sécurité vérifiés de bout en bout :

- **`AEGIS_ALLOWED_ROOTS` est contrôlé sur la racine git *et* sur la cible
  d'audit résolue**, au séparateur (`/srv/autorise-bis` n'est pas sous
  `/srv/autorise`), et **avant** la détection de doublon — un 409 sur un chemin
  interdit révélerait l'existence du projet.
- **`/api/ingest/:slug` vérifie le jeton avant de chercher le slug** (sinon un
  404 révélerait quels projets existent) et **compare les longueurs avant
  `timingSafeEqual`**, qui lève sur des tampons de tailles différentes.
- **`PUT /api/projects/:id` répond 404 avant de valider** : un corps invalide sur
  un id inexistant ne doit pas laisser croire que le projet existe.
- **`POST /api/tickets/create` hache la charge** et répond 409 **sans rappeler
  Jira**, et n'enregistre rien quand Jira échoue.
- **`/api/config/export` masque les secrets**, et une valeur `"***"` réimportée
  n'écrase pas le secret en place — c'est ce qui rend un export rejouable.

---

## 5. Écarts documentés

Les tests de cette suite ne valident pas seulement ce qui marche : quand le comportement réel s'écarte de `CONTEXT.md`, le test **affirme le comportement réel** et son libellé porte la mention « écart documenté ». La régression involontaire est bloquée, et l'écart reste visible.

**Ces écarts ne sont plus numérotés ici.** Ils sont inscrits dans [`ISSUE.md`](./ISSUE.md), qui est la liste unique des défauts, groupée par priorité — **aucune n'y porte plus le marqueur 🧪** et renvoient au fichier de test correspondant. Maintenir deux numérotations produisait des doublons : le même défaut portait un identifiant `N` et un numéro local, décrits différemment.

Les 14 écarts que cette suite a mis au jour et qui n'étaient dans aucun backlog y ont reçu un identifiant. **Dix sont corrigés à ce jour** (N32, N33, N34, N35, N36, N37, N38, N40, N42, N43) ; les autres restent épinglés :

| ID | Écart | Priorité |
|---|---|---|
| [N32](./ISSUE.md#n32-post-apiannotations-efface-les-champs-omis) | `POST /api/annotations` efface la note et la version corrigée saisies | 🟠 2 |
| [N33](./ISSUE.md#n33-zcoerceboolean-rend-la-chaîne-false-vraie) | `z.coerce.boolean` rend la chaîne `"false"` vraie | 🟠 2 |
| [N44](./ISSUE.md#n44-syncadvisory-vide-le-cache-avant-de-refetcher) | `syncAdvisory` vide le cache avant de refetcher | 🟠 2 |
| [N45](./ISSUE.md#n45-la-porte-ci-dun-projet-ignoré-est-toujours-verte) | La porte CI d'un projet ignoré est toujours verte | 🟠 2 |
| [N34](./ISSUE.md#n34-parsecvssvector-écarte-toujours-le-premier-segment) | `parseCvssVector` écarte toujours le premier segment | 🟡 3 |
| [N35](./ISSUE.md#n35-500-au-lieu-de-400-sur-les-routes-qui-lisent-reqjson-directement) | 500 au lieu de 400 sur les routes lisant `req.json()` | 🟡 3 |
| [N36](./ISSUE.md#n36-une-méthode-non-déclarée-renvoie-du-html-en-200) | Une méthode non déclarée renvoie du HTML en 200 | 🟡 3 |
| [N37](./ISSUE.md#n37-delete-sur-un-identifiant-inconnu-répond-succès) | `DELETE` sur un identifiant inconnu répond succès | 🟡 3 |
| [N38](./ISSUE.md#n38-getreports-trie-par-created_at-seul) | `getReports` trie par `created_at` seul | 🟡 3 |
| [N39](./ISSUE.md#n39-la-progression-du-lot-daudit-nest-pas-observable-après-coup) | La progression du lot d'audit n'est pas observable après coup | 🟡 3 |
| [N41](./ISSUE.md#n41-content_hash-nest-pas-unique-en-base) | `content_hash` n'est pas unique en base | 🟡 3 |
| [N42](./ISSUE.md#n42-commit_sha-peut-valoir-la-chaîne-head) | `commit_sha` peut valoir la chaîne `"HEAD"` | 🟡 3 |
| [N43](./ISSUE.md#n43-le-repli--déjà-à-jour--de-gitfetch-est-inatteignable) | Le repli « Déjà à jour. » de `gitFetch` est inatteignable | 🟡 3 |
| [N40](./ISSUE.md#n40-les-noms-de-tags-sont-sensibles-à-la-casse) | Les noms de tags sont sensibles à la casse | 🔵 4 |

Les huit autres écarts relevés par les tests confirmaient un défaut déjà inscrit : `N2` (snapshot, deux angles), `N5` (secrets en clair), `N7` (annotations globales), `N12` (cascade de tags), `N13` (`history-global`, deux angles) et `N18` (perte du `fixedIn`).

**Onze contrats sont passés du rouge au vert le 23/08/2026** : `N9`, `N14`, `C9`, `N2`, `N7`, puis le lot des petits épinglés — `N12` (cascade de tags), `N29` (une seule définition du dernier run), `N39` (bilan du lot observable), `N41` (empreinte de ticket par projet), `N44` (le cache survit à un rafraîchissement échoué) et `N45` (la porte CI d'un projet ignoré remonte ses CVE).

**Deux d'entre eux ont été réécrits plutôt que satisfaits.** Le contrat de `N41` exigeait une contrainte `UNIQUE` sur `content_hash` — dangereuse en migration, et traitant le symptôme plutôt que la cause. Celui de `N45` supposait une porte CI sensible à l'état de triage, que `CONTEXT.md` §2 ne prévoit pas : le diff porte sur le run précédent, pas sur les décisions du référent. Un contrat épinglé dit ce qui a été **observé**, pas ce qui doit être. Leurs `describe` sont renommés « (corrigé) » et le test « écart documenté » correspondant a été supprimé, conformément à la marche à suivre ci-dessous.

### Corriger un écart épinglé

**La cible est déjà écrite.** Chaque défaut épinglé porte deux tests dans le même fichier : le test « écart documenté » qui affirme le comportement actuel, et un `test.failing` — regroupé en fin de fichier sous `describe("contrats attendus — à activer au correctif")` — qui énonce le contrat. **41 tests retournés** couvrent 26 défauts.

`test.failing` exécute son corps et attend son échec : la suite reste verte tant que le défaut existe. Au correctif, le test se met à passer et Bun le refuse — « this test is marked as failing but it passed. Remove `.failing` if tested behavior now works ». Le correctif ne peut donc pas passer inaperçu.

Marche à suivre :

1. Corriger le code.
2. Retirer `.failing` du test de contrat.
3. Supprimer le test « écart documenté », devenu faux.

`test.skip` et `test.todo` ne conviennent pas : Bun n'exécute pas leur corps, l'assertion serait décorative et aucun signal ne se déclencherait.

## 6. Deux bugs trouvés en écrivant ces tests

Consignés parce que le symptôme était trompeur dans les deux cas.

### `cancel` reçoit une raison, pas un contrôleur

`routes/console.ts` retirait le client de la liste de diffusion en lisant le
premier argument de `cancel` comme un `ReadableStreamDefaultController`. C'en est
la *raison d'annulation*. Chaque onglet fermé laissait donc un contrôleur mort
dans le `Set`, et la fuite grossissait à chaque montage. Le contrôleur est
désormais retenu depuis `start`.

### `test:ui` ne lançait pas les tests de `App.tsx`

Le glob était `src/App.tsx` — qui ne correspond à aucun fichier de test.
`App.test.tsx` et ses 11 tests n'étaient **jamais exécutés**, sans aucun message :
`bun test` compte simplement 45 fichiers au lieu de 46. Repéré en recoupant la
somme des comptes par dossier avec le total du run pour rédiger ce document.
Corrigé en `src/App.test.tsx`.

Le troisième — `bun test` sortant en 1 quand aucun test n'est collecté — n'était
pas un bug du projet, mais explique pourquoi une suite vide fait rougir la CI.
