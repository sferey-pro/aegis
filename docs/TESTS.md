# ✅ Couverture de test — état au 21/08/2026

Ce document est l'**inventaire** de ce qui est couvert. Pour les conventions et
le fonctionnement du harnais, voir [`TESTING.md`](./TESTING.md).

```
1057 tests · 0 échec · 87 fichiers
├── 343 composants (46 fichiers) — DOM, React, fetch simulé
└── 714 fonctionnels (41 fichiers) — vrai serveur, vraie base, vrai git
```

Vérifié avec `biome check --error-on-warnings` en 0 et `tsc --noEmit` en 0.
Aucun fichier résiduel dans le dépôt ni dans `/tmp` après un run complet.

---

## 1. Frontend — 343 tests

Colocation intégrale : chaque `.tsx` a son `.test.tsx` à côté, suivant
l'Atomic Design.

| Couche | Fichiers | Tests | Ce qui est vérifié |
|---|---:|---:|---|
| `components/ui/` (atomes) | 16 | 66 | rendu, variantes `cva`, transfert des props, `data-slot` |
| `components/molecules/` | 7 | 45 | composition d'atomes, états conditionnels |
| `components/organisms/` | 11 | 125 | blocs fonctionnels, modales, tableaux, interactions |
| `components/templates/` | 2 | 11 | gabarits de mise en page, `Outlet` |
| `components/layout/` | 2 | 12 | chargeur global, modale de rapport |
| `pages/` | 7 | 73 | écrans complets, chargement, erreurs réseau, pagination |
| `App.tsx` | 1 | 11 | routage `react-router-dom`, montage |

Le réseau est simulé (`mockFetch`) : les pages exercent le chargement, la
réponse vide, l'erreur réseau et le JSON invalide. Les composants qui consomment
le flux console utilisent le faux `EventSource`, qui gère **les deux API** —
`Console` pose un `onmessage`, `Projects` passe par
`addEventListener("message", …)`.

---

## 2. Base de données — 152 tests

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

## 3. Logique métier — 335 tests

| Module | Tests | Contrats notables |
|---|---:|---|
| `lib/schemas.ts` | 45 | **messages identiques à `CONTEXT.md`**, mot pour mot |
| `lib/audit/index.ts` | 43 | `resolveAuditTarget`, déduplication §12, run en erreur, `ingestAudit` |
| `lib/github/index.ts` | 39 | cache d'avis, quota, choix du correctif par branche majeure |
| `lib/aggregator/index.ts` | 31 | regroupement par CVE, clé de repli, âge baseline vs SLA |
| `lib/git/index.ts` | 26 | dépôts jetables réels, `ahead`/`behind`, `pull --ff-only` |
| `lib/parsers/` (6) | 62 | npm, bun, yarn, composer + utils, tolérance aux formes partielles |
| `lib/console.ts` | 18 | cadrage SSE, troncature à 3000, purge d'un client fermé |
| `lib/cvss.ts` | 14 | vecteurs 3.1 et 4.0, regroupement, infobulle |
| `lib/utils.ts` | 14 | `cn` (conflits Tailwind), `errorMessage` |
| `lib/validate.ts` | 14 | échec **retourné**, jamais levé ; toujours `{ error }` + 400 |
| `lib/audit/queue.ts` | 14 | mutex **global**, libéré dans un `finally` |

Points qui méritaient d'être épinglés :

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

---

## 4. API — 227 tests fonctionnels

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

Comportements réels qui s'écartent du contrat. Chacun est **épinglé par un
test** dont le libellé porte « écart documenté » : la régression involontaire est
bloquée, et le travail restant est visible. Voir [`ISSUE.md`](./ISSUE.md) pour la
priorisation.

### Perte de données

| # | Écart | Conséquence |
|---|---|---|
| 1 | `POST /api/annotations` efface `note` et `fixedIn` quand ils sont omis — le schéma applique ses défauts avant que la logique « préserver les champs non fournis » de `upsertAnnotation` puisse agir | enregistrer un statut détruit la note et la version corrigée saisies à la main |
| 2 | `syncAdvisory` supprime la ligne de cache **avant** de refetcher | un échec réseau perd l'avis connu |
| 3 | `resolveFixedVersion` abandonne `originalFixedIn` dès qu'une clé est trouvée mais que la requête échoue | une version que le parseur connaissait déjà est remplacée par `null` |

### Fonctionnalité inatteignable

| # | Écart | Conséquence |
|---|---|---|
| 4 | Les annotations globales (`project_id = -1`) ne peuvent pas exister : clé étrangère vers `projects` + `PRAGMA foreign_keys` actif | la branche qui les lit dans l'agrégateur est du code mort, `isGlobal` vaut toujours `false`, et « ignorer partout » n'est pas exprimable |
| 5 | `restoreSnapshot()` ne reçoit jamais le nom de fichier que son schéma exige | le champ `file` ne sert qu'à valider ; on restaure toujours `backup.sqlite` |
| 6 | Le repli « Déjà à jour. » de `gitFetch` est inatteignable dès qu'un amont existe, `--verbose` écrivant toujours « = [up to date] » | ne se déclenche que sur un dépôt sans remote |

### Angle mort de sécurité ou d'exactitude

| # | Écart | Conséquence |
|---|---|---|
| 7 | `ingestAudit` calcule son diff via `buildCveGroups`, qui exclut les projets ignorés | la porte CI d'un projet ignoré est toujours verte, même après ingestion d'une faille critique |
| 8 | Instantanés : `backup.sqlite` et `aegis.db` sont résolus depuis le répertoire de travail du process, sans tenir compte de `DB_PATH` | une instance configurée ailleurs sauvegarde et restaure le mauvais fichier |
| 9 | Sur une branche non née, `git rev-parse` écrit « fatal: » sur stderr mais « HEAD » sur stdout, et le filtre n'inspecte que stdout | `commit_sha` peut valoir la chaîne littérale `"HEAD"` |
| 10 | `z.coerce.boolean` rend vraie toute chaîne non vide | un client sérialisant ses booléens en texte activerait « ignoré » en croyant le désactiver |
| 11 | `parseCvssVector` écarte toujours le premier segment (`slice(1)`) | un vecteur transmis sans préfixe `CVSS:x.y` perd silencieusement une métrique |

### Contrat d'API incohérent

| # | Écart | Conséquence |
|---|---|---|
| 12 | Les routes lisant `req.json()` directement (`reports`, `advisories/sync`, `config/import`) répondent **500** sur du JSON malformé, là où les routes passant par `parseBody` répondent 400 « JSON invalide ». `reportBodySchema` existe mais n'est pas branché | contrat d'erreur non uniforme |
| 13 | Une méthode non déclarée sur une route d'API tombe dans le fourre-tout `/*` et renvoie du **HTML** en 200, ni 404 ni 405 | un client qui se trompe de verbe échoue au `res.json()` sans indice sur la cause |
| 14 | `DELETE` sur un projet, tag, prompt ou rapport inconnu répond succès | l'interface ne distingue pas « supprimé » de « n'existait pas » |
| 15 | `/api/history-global?days=abc` renvoie une série **vide** (`parseInt` → `NaN`, la boucle de buckets ne s'exécute pas) | le graphique se vide sans message d'erreur |
| 16 | `getGlobalHistory` n'agrège ni `info` ni `unknown` et n'expose aucun `total` (défaut N13) | deux sévérités du contrat sont absentes de la série |
| 17 | `getReports` trie par `created_at` seul, sans départage par `id` | deux audits d'une même seconde remontent dans un ordre indéfini |
| 18 | La file d'audit remet `progress` et `total` à zéro dès la fin du lot | un client qui sonde après le dernier projet voit `0/1`, jamais `2/2` |
| 19 | `deleteTag` ne retire pas le nom du tag de `projects.tags` (défaut N12) | le tag reste affiché sur les projets alors qu'il n'est plus filtrable |
| 20 | Les noms de tags sont sensibles à la casse (`UNIQUE` sans `COLLATE NOCASE`) | « backend » et « Backend » coexistent, deux filtres visuellement identiques |
| 21 | `content_hash` n'est pas `UNIQUE` en base | deux projets peuvent porter le même hash, `getTicketByHash` en renvoie un arbitrairement |
| 22 | `GET /api/settings` renvoie le jeton GitHub en clair (l'export, lui, le masque) | le secret circule en clair dès que l'interface est jointe sans TLS |

---

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
