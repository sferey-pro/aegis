# CLAUDE.md

Ce fichier fournit des instructions à Claude Code (claude.ai/code) pour travailler sur ce dépôt.

## Commandes

Tout le code se trouve dans `app_build/`. Le `Makefile` à la racine n'est qu'un wrapper : pour le reste, lancez `bun` directement depuis `app_build/`.

```bash
make dev            # bun --hot src/index.ts  → http://localhost:3001 (HMR, backend + frontend)
make build          # bun run build.ts → dist/ (Bun.build + bun-plugin-tailwind, minifié)
make lint           # biome check src/
make test           # bun test
make coverage       # bun test --coverage

cd app_build
bun run typecheck   # tsc --noEmit
bun run check       # typecheck + suite de tests complète (le garde-fou avant commit)
bun test src/lib/parsers/npm.test.ts          # un seul fichier
bun test --test-name-pattern "dedup"          # un seul test, par nom
bun test --watch
bun add <pkg>       # jamais npm install — Bun est le gestionnaire de paquets
```

La CI (`.github/workflows/ci.yml`) exécute `bunx biome ci .`, `bun run typecheck`, `bun test`. Biome impose les **tabulations** et les **guillemets doubles** ; il gère aussi l'organisation des imports.

### Environnement de test

- `bunfig.toml` précharge `setupTests.ts`, qui enregistre `@happy-dom/global-registrator` globalement + `@testing-library/jest-dom`. Aucun import de jest nécessaire ; pas de `cleanup()` manuel.
- Les tests qui touchent la base fixent `process.env.DB_PATH = "test_x.sqlite"` dans `beforeEach`, puis `closeDb()` + `unlinkSync` dans `afterEach`. Réutilisez ce motif : `getDb()` met en cache un singleton au niveau du module, donc un test qui oublie `closeDb()` propage sa base au fichier suivant.
- Les tests d'API (`test/functional/api.test.ts`) importent directement les objets de routes et fabriquent un faux `req` (`{ params, url, json() }`) — aucun serveur HTTP n'est démarré. Ajouter une route dynamique implique d'apprendre au helper `request()` de ce fichier comment la matcher.
- `src/lib/git/*.test.ts` invoque le vrai `git` sur ce dépôt, y compris `git fetch` (réseau). Un échec là peut venir de l'environnement, pas du code.

## Architecture

Un seul process Bun sert à la fois l'API et la SPA React. SQLite est le seul stockage — aucun service externe (contrainte explicite, voir `.agents/rules/domain_context.md`).

**Flux d'une requête :** `src/index.ts` appelle `getDb()` immédiatement, puis étale chaque export de `src/routes/*.ts` dans une unique map `Bun.serve({ routes })`. Chaque module de route exporte un objet simple indexé par chemin (`"/api/projects/:id": { GET, POST }`) — cette forme constitue toute la convention de routage. `"/*"` retombe sur `src/index.html`, ce qui rend les routes client accessibles en lien direct.

**Pipeline d'audit** (`src/lib/audit/index.ts` — le cœur de l'application) :

1. `getAuditTarget(project)` résout le cwd : `path` est la **racine git**, `audit_path` est le **dossier du lockfile** (absolu, ou relatif à la racine git ; `~` expansé via `expandPath`). Les opérations git utilisent la racine ; l'outil d'audit tourne dans la cible.
2. Barrière de déduplication — on saute le run et on renvoie `{ deduped: true }` seulement si *toutes* ces conditions tiennent : pas de forçage, arbre propre, SHA du HEAD connu, dernier run non-erreur avec le même `commit_sha`, et dernier run encore frais selon le réglage `AUDIT_MAX_AGE_HOURS` (>0 = N heures ; 0 = jamais périmé ; <0 = toujours périmé ; valeur illisible = considéré frais).
3. `spawn([...args])` — **tableaux d'arguments, jamais de shell**, avec `NO_COLOR=1`. Règle appliquée partout : audit, git, tout sous-processus.
4. `parseAuditOutput(tool, stdout)` dispatche vers `src/lib/parsers/{npm,yarn,bun,composer}.ts`, chacun normalisant un format différent (JSON npm/bun/composer, NDJSON yarn) vers `ParseResult { vulnerabilities, counts, total }`, avec sévérités normalisées en `critical|high|moderate|low|info|unknown`.
5. `enhanceVulnerabilities` appelle `ensureOccurrences` (gèle `first_seen_at` par `(project, package, cve)`, en marquant le tout premier run comme `is_baseline`) puis `resolveFixedVersion` de `src/lib/github` (GitHub Advisory Database, mise en cache dans `advisory_cache`, gestion du rate-limit) pour compléter `fixedIn`/sévérité/CVSS.
6. Chaque issue persiste un run — les échecs deviennent des lignes `status: "error"` avec un champ `error` multi-ligne (raison, `cwd:`, `exit:`, stderr brut, stdout brut). Ne jamais avaler un échec d'audit.
7. `newCves` diffe le nouveau run contre le précédent non-erreur sur la clé `package::cve` (repli sur `package::title`). Calculé à chaque réponse, **jamais persisté**.

**Agrégation** (`src/lib/aggregator/index.ts`) : `buildCveGroups()` ne lit que le *dernier* run de chaque projet non ignoré, déduplique à l'intérieur d'un projet en gardant la pire sévérité, puis regroupe entre projets par référence CVE — ou par `"${package}: ${title}"` en l'absence de CVE. Les annotations de triage sont fusionnées ici, et le `fixed_in` d'une annotation écrase la valeur du scanner. Cette clé de regroupement est structurante : `/api/cves`, le triage et les stats la lisent tous.

**Concurrence** (`src/lib/audit/queue.ts`) : un unique mutex `isProcessing` au niveau du module — un audit à la fois par process, le second appelant reçoit un 429. `enqueueGlobalAudit` est fire-and-forget, la progression étant sondée via `/api/audit/status`. À noter : le `handleRunAudit` du frontend (`App.tsx`) contourne entièrement la file et boucle sur `POST /api/projects/:id/audit` depuis le navigateur.

**Console live** (`src/lib/console.ts`) : diffusion SSE vers des abonnés en mémoire, volatile — jamais persistée. Les wrappers de sous-processus encadrent chaque commande avec `emitConsoleStart`/`emitConsoleEnd` ; un `AsyncLocalStorage` (`projectContext`) étiquette les événements avec le nom du projet sans le faire passer par les signatures d'appel. Toute sortie au-delà de 3000 caractères est tronquée. Ctrl+Shift+D bascule vers la page `/debug` qui affiche le flux.

**Schéma** (`src/db/index.ts`) : uniquement des `CREATE TABLE IF NOT EXISTS` plus des migrations `ALTER TABLE` inline enveloppées dans des try/catch silencieux — c'est toute la stratégie de migration, ajoutez donc vos colonnes de la même façon. Mode WAL, clés étrangères ON, connexion paresseuse en singleton (importer un module db ne doit jamais créer le fichier).

**Frontend** en Atomic Design, imposé par l'arborescence : `components/ui/` (atomes Shadcn/Radix) → `molecules/` → `organisms/` → `templates/` (gabarits de route) → `pages/` (racines de route). Navigation avec `react-router-dom` v7 et `BrowserRouter` dans `frontend.tsx` ; `App.tsx` porte les stats globales, la boucle d'orchestration des audits et les modales loader/rapport. Les constantes métier et le style des sévérités vivent dans `src/lib/triage-constants.tsx`. Fusionnez toujours les classes Tailwind via `cn()` de `src/lib/utils.ts`.

## Conventions

- Commentaires, logs, textes affichés et messages d'erreur d'API sont en **français**. Restez cohérent.
- `tsconfig.json` est strict, avec `noUncheckedIndexedAccess`, `noUnusedLocals` et `noUnusedParameters` — un accès indexé exige un `!` ou une garde, et un argument non utilisé fait échouer le typecheck.
- Alias d'import `@/*` → `./src/*`.
- Toute évolution fonctionnelle est livrée avec un test (`docs/TESTING.md`) ; les fichiers de test sont à côté du code testé, nommés `*.test.ts(x)`. Préférez `getByRole`/`getByLabelText` à `getByTestId`.
- Variables d'environnement (`.env.example`) : `AEGIS_PORT`, `HOST`, `DB_PATH`, `AEGIS_INGEST_TOKEN`, `AEGIS_ALLOWED_ROOTS`, `GITHUB_TOKEN`.

## Invariants de sécurité

Ce sont des garde-fous du projet, pas des conseils génériques — en casser un est une régression :

- Pas de shell. Les sous-processus prennent uniquement des tableaux d'arguments (`spawn(["npm", "audit", "--json"])`).
- `POST /api/ingest/:slug` authentifie `X-Aegis-Token` via une vérification de longueur puis `timingSafeEqual`, et renvoie 500 si `AEGIS_INGEST_TOKEN` n'est pas défini. Gardez la comparaison à temps constant.
- `AEGIS_ALLOWED_ROOTS` (vérifié dans `src/routes/projects.ts`) confine les chemins auditables à la création/modification d'un projet. Tout nouvel endpoint acceptant un chemin doit faire la même vérification.
- Aucun appel réseau pendant un audit de lockfile, hormis la consultation d'advisory dans `enhanceVulnerabilities` ; GitHub est interrogé à la demande, jamais en tâche de fond cachée.

## Pièges connus

- `src/db/backup.ts` restaure vers `aegis.db` alors que `getDb()` cible par défaut `audit.sqlite` — la restauration de snapshot ne vise donc pas le fichier de base réellement utilisé. Vérifiez le chemin avant de compter sur la restauration.
- `restoreSnapshot()` appelle volontairement `process.exit(0)` et s'appuie sur `bun --hot`/le gestionnaire de process pour redémarrer.
- Les fichiers `test_*.sqlite` à la racine du dépôt sont des résidus de tests lancés depuis un autre cwd ; ce ne sont pas des fixtures.
- `docs/` contient la spécification fonctionnelle (`CONTEXT.md` est la référence de comportement autoritative — règles de déduplication, messages de validation, cas limites), plus `PROJECT_BLUEPRINT.md`, `TESTING.md` et `atomic_design_roadmap.md`. `.agents/` contient une configuration parallèle de personas d'agents (`agents.md`, `rules/`, `skills/`, `workflows/`) dont les fichiers `rules/` constituent les règles de code normatives de ce dépôt.
