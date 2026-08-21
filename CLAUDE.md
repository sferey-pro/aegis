# CLAUDE.md

Ce fichier fournit des instructions à Claude Code (claude.ai/code) pour travailler sur ce dépôt.

## Commandes

Tout le code se trouve dans `app_build/`. Le `Makefile` à la racine n'est qu'un wrapper : pour le reste, lancez `bun` directement depuis `app_build/`.

```bash
make dev            # bun --hot src/index.ts  → http://localhost:3001 (HMR, backend + frontend)
make build          # bun run build.ts → dist/ (Bun.build + bun-plugin-tailwind, minifié)
make lint           # biome check src/ --error-on-warnings
make test           # bun run test → les deux étages, dans l'ordre
make coverage       # bun run coverage → couverture, étage par étage

cd app_build
bun run typecheck   # tsc --noEmit
bun run check       # typecheck + les deux étages (le garde-fou avant commit)
bun run test:ui     # 345 tests composants — happy-dom actif
bun run test:api    # 755 tests fonctionnels — AEGIS_TEST_NO_DOM=1
bun run coverage    # couverture, étage par étage (96,3 % backend / 94,1 % frontend)
bun test src/lib/parsers/npm.test.ts          # un seul fichier
bun test --test-name-pattern "dedup"          # un seul test, par nom
bun test --watch src/db/runs.test.ts
bun add <pkg>       # jamais npm install — Bun est le gestionnaire de paquets
```

⚠️ **Ne lancez jamais `bun test` nu depuis `app_build/`** — cela réunit les deux étages dans un même process, ce que l'étage fonctionnel ne supporte pas : chaque test d'API échoue alors sur « Expected a Response object » (voir ci-dessous). Passez toujours par un glob, ou par les scripts. C'est pour la même raison que la couverture est mesurée **étage par étage** (`coverage:ui`, `coverage:api`).

La CI (`.github/workflows/ci.yml`) exécute, depuis `app_build/` : `bun install`, `bunx biome ci . --error-on-warnings`, `bun run typecheck`, `bun run test`. Le drapeau `--error-on-warnings` n'est pas décoratif : `biome ci` seul sort en 0 sur des avertissements et laisserait réapparaître un `any` sans bruit. Biome impose les **tabulations** et les **guillemets doubles** ; il gère aussi l'organisation des imports.

### Environnement de test

**1100 tests, colocalisés** : chaque fichier de code porte son test à côté de lui, nommé `*.test.ts(x)`. Référence complète dans `docs/TESTING.md` (comment on teste) et `docs/TESTS.md` (ce qui est couvert).

**Deux étages, séparés par nécessité technique.** happy-dom remplace la classe globale `Response`, or les handlers de `Bun.serve` construisent leurs réponses avec elle : un serveur réel démarré sous DOM échoue avec « Expected a Response object ». L'étage fonctionnel désactive donc le DOM via `AEGIS_TEST_NO_DOM=1`. Ne réunissez pas les deux globs.

- `bunfig.toml` précharge `setupTests.ts`, dont les **quatre étapes sont ordonnées** : (1) conserver le `fetch` natif de Bun dans `globalThis.__nativeFetch` *avant* le DOM — celui de happy-dom applique la politique de même origine et refuserait les requêtes vers le serveur de test ; (2) enregistrer happy-dom, sauf si `AEGIS_TEST_NO_DOM` ; (3) charger Testing Library **en `await import()`** ; (4) brancher les matchers jest-dom via le sous-chemin `/matchers`.
- ⚠️ **Ne repassez jamais les imports de `setupTests.ts` en statique.** Ils sont hoistés : ils s'évaluent avant `register()`, quelle que soit leur position. `@testing-library/dom` construit `screen` à son évaluation en capturant `document.body` ; évalué trop tôt, chaque requête lève « a global document has to be available » — alors que `typeof document` vaut bien `"object"` dans le corps du test. Symptôme très trompeur, cause unique.
- Le typage des matchers passe par `src/matchers.d.ts`. Sans ce fichier les tests passent mais `tsc` refuse `toBeInTheDocument`.
- **Base de données** : `useTempDb("label")` depuis `src/test/db.ts`. Base neuve avant chaque test, supprimée après, chemin **absolu** et unique dans `tmpdir()`, purge des trois fichiers (`.sqlite`, `-wal`, `-shm`). N'écrivez pas `process.env.DB_PATH` à la main : l'ancienne convention utilisait un chemin relatif et ne supprimait que le fichier principal, d'où des `test_*.sqlite` semés à la racine et des `-wal` fuités par test. Ces couches ne sont **jamais** simulées — c'est le SQL réel, les clés étrangères et les migrations qu'on veut vérifier.
- **API** : `startTestServer("label")` depuis `src/test/server.ts` démarre le **vrai** `Bun.serve` sur un port éphémère (`AEGIS_PORT=0`), adossé à une base jetable ; on interroge ensuite `srv.json("/api/…", jsonBody({…}))`. Plus de faux objet `req` : ajouter une route ne demande plus d'apprendre à un helper comment la matcher.
- ⚠️ **`bun test` n'isole pas les modules par fichier.** Tous les fichiers d'un run partagent le cache, donc `src/index` — et `serve()` — ne s'évalue qu'une fois. `startTestServer` réutilise le serveur en écoute et **rebranche la connexion SQLite** ; `stop()` ne libère que la base. Ne tentez pas de démarrer un second serveur : symptôme observé, 12 tests verts en solo et rouges en groupe.
- **Composants** : `mockFetch({ "GET /api/projects": { body: […] } })` depuis `src/test/http.ts` — clés `"MÉTHODE /chemin"`, prend en charge `status`, `invalidJson`, `networkError`, et enregistre les appels. Une route non déclarée appelle `expect.unreachable()` en listant les routes connues. `src/test/sse.ts` fournit un faux `EventSource` gérant **les deux API** (`Console` pose un `onmessage`, `Projects` passe par `addEventListener`).
- **Aucun accès réseau.** GitHub et Jira sont simulés en remplaçant `globalThis.fetch` — ce qui n'affecte pas les requêtes du test, qui passent par `__nativeFetch`. `src/lib/git/*.test.ts` crée de **vrais dépôts jetables** avec un dépôt nu local comme amont, ce qui suffit à produire `upstream`, `ahead`/`behind`, `fetch` et `pull` réels. Un échec là vient du code, plus de l'environnement.
- Après un run complet, `ls /tmp/aegis-*` ne doit rien trouver et le dépôt doit être propre.
- Autres pièges consignés, avec leur parade, dans `docs/TESTING.md` : `not.toBeInTheDocument()` qui produit 143 Mo de sortie, Radix Tabs insensible à `click`, `bun test` sortant en 1 sur zéro test collecté.

## Architecture

Un seul process Bun sert à la fois l'API et la SPA React. SQLite est le seul stockage — aucun service externe (contrainte explicite, voir `.agents/rules/domain_context.md`).

**Flux d'une requête :** `src/index.ts` appelle `getDb()` immédiatement, puis étale chaque export de `src/routes/*.ts` dans une unique map `Bun.serve({ routes })`. Chaque module de route exporte un objet simple indexé par chemin (`"/api/projects/:id": { GET, POST }`) — cette forme constitue toute la convention de routage. `"/*"` retombe sur `src/index.html`, ce qui rend les routes client accessibles en lien direct.

**Pipeline d'audit** (`src/lib/audit/index.ts` — le cœur de l'application) :

1. `getAuditTarget(project)` résout le cwd, en déléguant à **`resolveAuditTarget(path, auditPath)` — source de vérité unique**. `path` est la **racine git**, `audit_path` le **dossier du lockfile** : relatif à la racine, ou bien **absolu, auquel cas il la remplace** (un `audit_path` commençant par `/` ou `~` n'est jamais concaténé). Les opérations git utilisent la racine ; l'outil d'audit tourne dans la cible. Le contrôle d'autorisation de chemin et la détection de doublon doivent appeler cette fonction, **jamais recomposer le chemin de leur côté** : les deux calculs avaient divergé, si bien qu'un `audit_path` absolu était validé comme relatif puis exécuté comme absolu.
2. Barrière de déduplication — on saute le run et on renvoie `{ deduped: true }` seulement si *toutes* ces conditions tiennent : pas de forçage, arbre propre, SHA du HEAD connu, dernier run non-erreur avec le même `commit_sha`, et dernier run encore frais selon le réglage `AUDIT_MAX_AGE_HOURS` (>0 = N heures ; 0 = jamais périmé ; <0 = toujours périmé ; **réglage illisible = repli sur 24 h**, tandis qu'une *date de run* illisible est considérée fraîche par sécurité — deux replis distincts, ne les confondez pas).
3. `spawn([...args])` — **tableaux d'arguments, jamais de shell**, avec `NO_COLOR=1`. Règle appliquée partout : audit, git, tout sous-processus.
4. `parseAuditOutput(tool, stdout)` dispatche vers `src/lib/parsers/{npm,yarn,bun,composer}.ts`, chacun normalisant un format différent (JSON npm/bun/composer, NDJSON yarn) vers `ParseResult { vulnerabilities, counts, total }`, avec sévérités normalisées en `critical|high|moderate|low|info|unknown`.
5. `enhanceVulnerabilities` appelle `ensureOccurrences` (gèle `first_seen_at` par `(project, package, cve)`, en marquant le tout premier run comme `is_baseline`) puis `resolveFixedVersion` de `src/lib/github` (GitHub Advisory Database, mise en cache dans `advisory_cache`, gestion du rate-limit) pour compléter `fixedIn`/sévérité/CVSS.
6. Chaque issue persiste un run — les échecs deviennent des lignes `status: "error"` avec un champ `error` multi-ligne (raison, `cwd:`, `exit:`, stderr brut, stdout brut). Ne jamais avaler un échec d'audit.
7. `newCves` diffe le nouveau run contre le précédent non-erreur sur la clé `package::cve` (repli sur `package::title`). Calculé à chaque réponse, **jamais persisté**.

**Agrégation** (`src/lib/aggregator/index.ts`) : `buildCveGroups()` ne lit que le *dernier* run de chaque projet non ignoré, déduplique à l'intérieur d'un projet en gardant la pire sévérité, puis regroupe entre projets par référence CVE — ou par `"${package}: ${title}"` en l'absence de CVE. Les annotations de triage sont fusionnées ici, et le `fixed_in` d'une annotation écrase la valeur du scanner. Cette clé de regroupement est structurante : `/api/cves`, le triage et les stats la lisent tous.

**Concurrence** (`src/lib/audit/queue.ts`) : un unique mutex `isProcessing` au niveau du module — un audit à la fois par process, **quel que soit le projet**. Le verrou est libéré dans un `finally`, sans quoi un audit qui lève bloquerait la file jusqu'au redémarrage. Le refus n'a pas le même code selon la porte d'entrée : `POST /api/audit/run` renvoie **429**, mais `POST /api/projects/:id/audit` attrape l'exception dans son `try/catch` générique et renvoie **500** — incohérence connue, épinglée par les tests. `enqueueGlobalAudit` est fire-and-forget, la progression étant sondée via `/api/audit/status` ; attention, `progress` et `total` sont remis à zéro dès la fin du lot, donc un client qui sonde trop tard voit `0/1` et jamais `2/2`. À noter : le `handleRunAudit` du frontend (`App.tsx`) contourne entièrement la file et boucle sur `POST /api/projects/:id/audit` depuis le navigateur.

**Console live** (`src/lib/console.ts`) : diffusion SSE vers des abonnés en mémoire, volatile — jamais persistée. Les wrappers de sous-processus encadrent chaque commande avec `emitConsoleStart`/`emitConsoleEnd` ; un `AsyncLocalStorage` (`projectContext`) étiquette les événements avec le nom du projet sans le faire passer par les signatures d'appel. Toute sortie au-delà de 3000 caractères est tronquée. Ctrl+Shift+D bascule vers la page `/debug` qui affiche le flux.

**Schéma** (`src/db/index.ts`) : uniquement des `CREATE TABLE IF NOT EXISTS` plus des migrations `ALTER TABLE` inline enveloppées dans des try/catch silencieux — c'est toute la stratégie de migration, ajoutez donc vos colonnes de la même façon. Mode WAL, clés étrangères ON, connexion paresseuse en singleton (importer un module db ne doit jamais créer le fichier).

**Frontend** en Atomic Design, imposé par l'arborescence : `components/ui/` (atomes Shadcn/Radix) → `molecules/` → `organisms/` → `templates/` (gabarits de route) → `pages/` (racines de route). Navigation avec `react-router-dom` v7 et `BrowserRouter` dans `frontend.tsx` ; `App.tsx` porte les stats globales, la boucle d'orchestration des audits et les modales loader/rapport. Les constantes métier et le style des sévérités vivent dans `src/lib/triage-constants.tsx`. Fusionnez toujours les classes Tailwind via `cn()` de `src/lib/utils.ts`.

## Conventions

- Commentaires, logs, textes affichés et messages d'erreur d'API sont en **français**. Restez cohérent.
- `tsconfig.json` est strict, avec `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `noUnusedLocals` et `noUnusedParameters` — un accès indexé exige une garde, et un argument non utilisé fait échouer le typecheck. **Préférez la garde (`if (!x) return`, déstructuration puis test) à l'assertion `!`** : les 13 assertions non-nulles du dépôt ont été remplacées par de vraies gardes, n'en réintroduisez pas.
- **Zéro `any` explicite, zéro warning Biome, tests compris.** Les fichiers de test ne sont pas une zone de non-droit : `biome.json` n'a *pas* de surcharge les exemptant de `noExplicitAny`, et c'est délibéré — un `any` dans un test désactive aussi la détection des vraies erreurs de type du bloc, précisément là où un test cassé se cache.
- Les types de réponse d'API sont **colocalisés avec la route qui les produit** (`ProjectListItem` dans `routes/projects.ts`, `StatsResponse` dans `routes/stats.ts`), et le handler est annoté pour les satisfaire : un changement de forme casse la compilation au lieu de dériver en silence.
- Validation des corps de requête par **Zod** (`src/lib/schemas.ts`), consommée via `parseBody(req, schema)` de `src/lib/validate.ts`, qui **retourne** l'échec au lieu de le lever — `{ error: "<message>" }` en 400, un seul message par requête. Les messages sont ceux de `CONTEXT.md`, mot pour mot : ne les reformulez pas sans mettre le contrat à jour.
- Alias d'import `@/*` → `./src/*`.
- Toute évolution fonctionnelle est livrée avec un test (`docs/TESTING.md`) ; les fichiers de test sont à côté du code testé, nommés `*.test.ts(x)`. Préférez `getByRole`/`getByLabelText` à `getByTestId`. Un test énonce un **contrat**, pas une implémentation ; quand le comportement réel s'écarte du contrat, on l'affirme tel quel avec la mention « écart documenté » et un commentaire expliquant la conséquence — jamais un test qui valide silencieusement un défaut.
- Variables d'environnement (`.env.example`) : `AEGIS_PORT`, `HOST`, `DB_PATH`, `AEGIS_INGEST_TOKEN`, `AEGIS_ALLOWED_ROOTS`, `GITHUB_TOKEN`.

## Invariants de sécurité

Ce sont des garde-fous du projet, pas des conseils génériques — en casser un est une régression :

- Pas de shell. Les sous-processus prennent uniquement des tableaux d'arguments (`spawn(["npm", "audit", "--json"])`).
- `POST /api/ingest/:slug` authentifie `X-Aegis-Token` via une vérification de longueur **puis** `timingSafeEqual`, et renvoie 500 si `AEGIS_INGEST_TOKEN` n'est pas défini. Gardez la comparaison à temps constant, et gardez le contrôle de longueur devant : `timingSafeEqual` lève sur des tampons de tailles différentes. L'authentification passe **avant** la recherche du slug — un 404 sur un slug inconnu sans jeton révélerait quels projets existent.
- `AEGIS_ALLOWED_ROOTS` (`pathGuard` dans `src/routes/projects.ts`) confine les chemins auditables sur `POST`/`PUT /api/projects` et `POST /api/projects/detect`. Trois propriétés à préserver : le contrôle porte sur la **racine git *et* la cible d'audit résolue** (la racine sert aux commandes git, qui exécutent les hooks du dépôt ; la cible sert au lancement de l'outil d'audit) ; la comparaison se fait **au séparateur**, donc `/srv/autorise-bis` n'est pas sous `/srv/autorise` ; et le contrôle passe **avant** la détection de doublon, sinon un 409 sur un chemin interdit révélerait l'existence du projet. Tout nouvel endpoint acceptant un chemin doit appeler `pathGuard`.
- Aucun appel réseau pendant un audit de lockfile, hormis la consultation d'advisory dans `enhanceVulnerabilities` ; GitHub est interrogé à la demande, jamais en tâche de fond cachée.

## Pièges connus

- `src/db/backup.ts` résout `backup.sqlite` et `aegis.db` depuis le **répertoire de travail du process**, sans tenir compte de `DB_PATH`, alors que `getDb()` cible par défaut `audit.sqlite`. La restauration ne vise donc pas le fichier réellement ouvert. Vérifiez le chemin avant de compter sur elle.
- `restoreSnapshot()` appelle volontairement `process.exit(0)` et s'appuie sur `bun --hot`/le gestionnaire de process pour redémarrer. **Conséquence pour les tests** : le chemin de restauration réussie n'est pas exerçable, il tuerait l'exécuteur. Seul son refus est testé.
- `restoreSnapshot()` ne reçoit jamais le nom de fichier que `restoreBodySchema` exige : le champ `file` ne sert qu'à valider, on restaure toujours `backup.sqlite`.
- Les annotations globales (`project_id = -1`) sont **inatteignables** : la colonne porte une clé étrangère vers `projects` et `PRAGMA foreign_keys` est actif. La branche qui les lit dans l'agrégateur est du code mort et `CveOccurrence.isGlobal` vaut toujours `false`.
- `POST /api/annotations` **efface** `note` et `fixedIn` quand ils sont omis : le schéma de la route applique ses valeurs par défaut avant que la logique « préserver les champs non fournis » de `upsertAnnotation` puisse agir. Enregistrer un statut détruit la note saisie à la main.
- Un chemin `/api/…` inconnu, ou une route atteinte avec une **méthode non déclarée**, tombe dans le fourre-tout `/*` et renvoie du HTML en 200 — ni 404 ni 405. À connaître pour déboguer un appel mal orthographié.
- Les routes qui lisent `req.json()` directement (`reports`, `advisories/sync`, `config/import`) répondent **500** sur du JSON malformé, là où les routes passant par `parseBody` répondent 400 « JSON invalide ». `reportBodySchema` existe mais n'est pas branché.
- **`docs/ISSUE.md` est la liste unique des défauts connus**, groupée par priorité et revérifiée dans le code le 21/08/2026. Ses 25 entrées marquées 🧪 sont **épinglées par un test** qui affirme le comportement défectueux : la régression involontaire est bloquée, mais le défaut n'est pas corrigé. Consultez cette liste avant de conclure qu'un comportement surprenant est un bug neuf. Chaque entrée 🧪 porte **deux** tests : celui qui affirme le comportement actuel (« écart documenté »), et un `test.failing` regroupé en fin de fichier sous `describe("contrats attendus — à activer au correctif")` qui énonce le contrat. Au correctif : corriger le code, retirer `.failing`, supprimer le test « écart documenté ». Bun refuse un `test.failing` qui passe, donc le correctif ne peut pas passer inaperçu. N'utilisez pas `test.skip` ni `test.todo` à cette fin : leur corps n'est pas exécuté.
- `docs/` contient la spécification fonctionnelle (`CONTEXT.md` est la référence de comportement autoritative — règles de déduplication, messages de validation, cas limites), plus `TESTING.md` (comment on teste), `TESTS.md` (ce qui est couvert), `ISSUE.md`, `VERIFICATION_REPORT.md`, `BACKLOG.md`, `PROJECT_BLUEPRINT.md` et `atomic_design_roadmap.md`. `.agents/` contient une configuration parallèle de personas d'agents (`agents.md`, `rules/`, `skills/`, `workflows/`) dont les fichiers `rules/` constituent les règles de code normatives de ce dépôt.
