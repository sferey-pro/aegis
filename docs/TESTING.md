# 🧪 Stratégie de test — Aegis

Ce document décrit **comment** on teste. Pour savoir **ce qui est couvert
aujourd'hui**, voir [`TESTS.md`](./TESTS.md).

## 👑 Règle d'or

> Chaque fichier de code porte, à côté de lui, un test qui vérifie son
> fonctionnement. Toute fonctionnalité ajoutée ou modifiée est couverte avant
> d'être considérée comme terminée.

Deux corollaires, appliqués sans exception :

- **Colocation.** `src/db/runs.ts` → `src/db/runs.test.ts`. Pas de dossier
  `__tests__`, pas de miroir `tests/`. Un test qu'on ne voit pas en ouvrant le
  fichier qu'il protège est un test qu'on oublie de mettre à jour.
- **Politique zéro warning.** `biome check --error-on-warnings` et
  `tsc --noEmit` doivent sortir en 0 sur les tests comme sur le code de
  production. Un fichier de test n'est pas une zone de non-droit.

## 🧰 Outil

`bun test` — exécuteur natif de Bun, compatible Jest (`describe`, `test`,
`expect`, `beforeEach`…), TypeScript sans transpilation préalable, mode
surveillance intégré.

## 🏗️ Deux étages, et pourquoi

La suite est **coupée en deux**, avec deux commandes distinctes :

| Étage | Commande | DOM | Ce qu'il exerce |
|---|---|---|---|
| Composants | `bun run test:ui` | oui (happy-dom) | React, Testing Library, `fetch` simulé |
| Fonctionnel | `bun run test:api` | **non** | vrai `Bun.serve`, vraie base SQLite, vrai `git` |

Cette séparation n'est pas une préférence de style, c'est une contrainte
technique mesurée : **happy-dom remplace la classe globale `Response`**. Les
handlers de `Bun.serve` construisent leurs réponses avec cette classe, et le
serveur refuse alors de démarrer — « Expected a Response object, but received
'Response {…}' ». Le second étage désactive donc le DOM via
`AEGIS_TEST_NO_DOM=1`.

```bash
bun run test        # les deux étages, dans l'ordre
bun run test:ui     # composants seulement
bun run test:api    # fonctionnel seulement
bun run coverage    # couverture, étage par étage
bun run check       # typecheck + les deux étages
bun test --watch src/db/runs.test.ts   # un fichier, en surveillance
```

⚠️ Ne lancez pas `bun test` nu depuis `app_build/` : les deux étages se retrouvent
dans un même process et chaque test d'API échoue sur « Expected a Response
object ». La couverture est mesurée pour la même raison **étage par étage**,
via `coverage:ui` et `coverage:api`.

## 🔌 Le harnais : `setupTests.ts`

Préchargé par `bunfig.toml`. Quatre étapes, dans un ordre qui n'est pas
négociable :

1. **Conserver le `fetch` natif de Bun** dans `globalThis.__nativeFetch`, *avant*
   toute installation du DOM. Le `fetch` de happy-dom applique la politique de
   même origine : le document de test étant sur `localhost:3001`, une requête
   vers un serveur de test sur un autre port est refusée. Les tests fonctionnels
   utilisent la référence conservée.
2. **Installer le DOM** (`GlobalRegistrator.register`), sauf si
   `AEGIS_TEST_NO_DOM` est posé.
3. **Charger Testing Library — en `await import()`, jamais en import statique.**
   Les imports statiques sont hoistés : ils s'évaluent avant la première
   instruction du module, donc avant `register()`, quelle que soit leur position
   dans le fichier. Or `@testing-library/dom` construit son objet `screen` au
   moment de son évaluation, en capturant `document.body`. Évalué trop tôt,
   `screen` est peuplé de fonctions qui lèvent « For queries bound to
   document.body a global document has to be available » — alors que
   `typeof document` vaut bien `"object"` dans le corps du test. Symptôme très
   trompeur, cause unique.
4. **Brancher les matchers jest-dom** sur l'`expect` de Bun, via le sous-chemin
   `/matchers` (l'entrée principale du paquet n'expose que des références
   triple-slash, que `tsc` rejette). Leur rattachement au typage de `expect` est
   déclaré dans `src/matchers.d.ts` — sans ce fichier, les tests passent mais
   `tsc` refuse `toBeInTheDocument`.

`IS_REACT_ACT_ENVIRONMENT = true` est également posé, sans quoi chaque
interaction avec un composant Radix produit un avertissement « An update was not
wrapped in act(...) » qui noie la sortie.

## 🧱 Les trois helpers

Dans `src/test/`, chacun avec son propre test.

### `db.ts` — base SQLite jetable

```ts
describe("db/runs", () => {
  useTempDb("runs");   // base neuve avant chaque test, supprimée après
  // …
});
```

Chemin **absolu** et unique dans le dossier temporaire du système, et purge des
trois fichiers (`.sqlite`, `-wal`, `-shm`). La convention précédente utilisait un
chemin relatif et ne supprimait que le fichier principal : d'où les
`test_*.sqlite` qui traînaient à la racine du dépôt, et des dizaines de Ko de
`-wal` fuités par test.

**Ces couches ne sont jamais simulées.** C'est justement le SQL réel, les clés
étrangères et les migrations qu'on veut vérifier.

### `server.ts` — serveur réel sur port éphémère

```ts
beforeAll(async () => { srv = await startTestServer("projects"); });
afterAll(() => srv.stop());

const { status, data } = await srv.json("/api/projects", jsonBody({ … }));
```

Le serveur démarre **dans le process de test** (~90 ms), sur un port choisi par
le système (`AEGIS_PORT=0`), adossé à une base jetable. Le patron « lancer le
projet puis lancer les tests » n'apporterait ici qu'un processus à surveiller, un
port à réserver et du scripting en CI.

> ⚠️ **`bun test` n'isole pas les modules par fichier.** Tous les fichiers d'un
> même run partagent le cache de modules, donc `src/index` — et donc `serve()` —
> n'est évalué qu'une seule fois. Un second fichier ne peut pas démarrer son
> propre serveur. `startTestServer` réutilise celui en écoute et **rebranche la
> connexion SQLite** sur une base neuve ; `stop()` ne libère que la base, jamais
> le serveur. Sans cela, le premier fichier terminé coupait le serveur des
> suivants — 12 tests verts en solo, rouges en groupe.

### `lib/api.ts` — point de passage des appels client

Ce n'est pas un helper de test, mais il change la façon de tester les pages :
tous les appels client passent par `fetchJson` / `fetchVoid`, qui **lèvent** sur
un statut non-2xx en reprenant le champ `error` du corps. Un test n'a donc qu'un
seul chemin d'échec à simuler, et une page a trois états à couvrir — chargement,
échec, contenu — au lieu de deux.

Conséquence pour les mocks : un `{ status: 500, body: { error: "…" } }` produit
une exception dans le composant, pas une valeur. C'est ce qui rend testable la
distinction entre « aucune vulnérabilité » et « je n'ai pas pu lire les
données ».

### `http.ts` — `fetch` simulé pour les composants

```ts
mockFetch({
  "GET /api/projects": { body: [ … ] },
  "POST /api/projects": { status: 201, body: { … } },
  "GET /api/stats": { networkError: true },
});
```

Clés `"MÉTHODE /chemin"`. Prend en charge `status`, `invalidJson`,
`networkError`, et enregistre les appels (`fetchCalls`, `lastFetchCall`) pour
vérifier ce que le composant a réellement envoyé. Une requête non déclarée
appelle `expect.unreachable()` en listant les routes connues : un composant qui
appelle une route inattendue échoue avec un message utile, il ne reçoit pas un
`undefined` silencieux.

`sse.ts` complète l'ensemble avec un faux `EventSource` — happy-dom n'en fournit
pas, et le flux console est volatil et sans rejeu, donc un test doit **choisir**
quels événements arrivent et quand.

## ✍️ Conventions d'écriture

- **Français pour les libellés et les commentaires**, anglais pour les
  identifiants et les noms de fichiers. Comme le reste du code.
- **Un test énonce un contrat, pas une implémentation.** Le libellé dit ce qui
  doit être vrai (« un champ omis est conservé, pas réinitialisé »), pas ce que
  le code fait.
- **Le commentaire explique la conséquence, pas le mécanisme.** « Le panneau de
  triage envoie un seul champ à la fois ; écraser les deux autres perdrait la
  note à chaque clic » vaut mieux que « teste upsertAnnotation ».
- **Les défauts sont documentés, pas validés — et leur cible est écrite.** Quand
  le comportement réel s'écarte du contrat, deux tests coexistent dans le même
  fichier :

  1. le test **« écart documenté »**, qui affirme le comportement d'aujourd'hui,
     avec un commentaire expliquant l'écart et sa conséquence. Il protège contre
     une dérive *involontaire* du défaut ;
  2. le test **`test.failing`**, regroupé dans un bloc
     `describe("contrats attendus — à activer au correctif")` en fin de fichier,
     qui énonce le comportement attendu.

  La liste est dans [`ISSUE.md`](./ISSUE.md) — entrées marquées 🧪 — et
  [`TESTS.md`](./TESTS.md) § 5 en donne la table de correspondance.

### `test.failing` plutôt que `skip` ou `todo`

Vérifié sur Bun 1.3.14 :

| Primitive | Corps exécuté | Suite verte aujourd'hui | Signal au correctif |
|---|:-:|:-:|---|
| `test.skip` | non | oui | **aucun** |
| `test.todo` | non, même avec un corps | oui | **aucun** |
| `test.failing` | **oui** | oui — l'échec attendu compte comme `pass` | **rouge automatique** |

`test.failing` exécute le corps et attend son échec. Le jour où le défaut est
corrigé, le test se met à passer et Bun le refuse :

```
(fail) contrats attendus … > un champ omis est conservé (N32)
  ^ this test is marked as failing but it passed.
    Remove `.failing` if tested behavior now works
```

Impossible donc de corriger le code et d'oublier le test. `skip` et `todo`
n'exécutent pas le corps : l'assertion y serait décorative, et le correctif
passerait inaperçu.

**Un test retourné se vérifie comme un autre.** S'il passe dès son écriture, ce
n'est pas une bonne nouvelle : le défaut est mal caractérisé, ou le test
« écart documenté » qui le décrivait était faux. Les deux cas se sont produits
le 21/08/2026 (voir `ISSUE.md`, N9 et N11).
- **Aucun accès réseau.** L'API GitHub et Jira sont simulées en remplaçant
  `globalThis.fetch`. Les tests git utilisent de vrais dépôts jetables avec un
  dépôt **nu local** comme amont, ce qui suffit à produire un `upstream`, un
  décalage `ahead`/`behind`, un `fetch` et un `pull` réels.
- **Aucun résidu.** Pas de fichier laissé dans le dépôt ni dans `/tmp` après un
  run. C'est vérifiable : `ls /tmp/aegis-*` doit ne rien trouver.

## ⚠️ Pièges rencontrés, et leur parade

Chacun a coûté du temps ; ils sont consignés pour ne pas le payer deux fois.

| Symptôme | Cause | Parade |
|---|---|---|
| `screen` lève « a global document has to be available » | import statique hoisté avant `register()` | `await import()` dans `setupTests.ts` |
| `Bun.serve` : « Expected a Response object » | happy-dom remplace `Response` | `AEGIS_TEST_NO_DOM=1` sur l'étage fonctionnel |
| « Cross-Origin Request Blocked » vers le serveur de test | `fetch` du DOM, même origine | `__nativeFetch` conservé avant le DOM |
| Tests verts en solo, rouges en groupe | serveur partagé entre fichiers | `startTestServer` réutilise + rebranche la base |
| `not.toBeInTheDocument()` en échec : 143 Mo, 121 s | sérialisation de l'arbre par happy-dom | `expect(queryAllByText(x)).toHaveLength(0)` |
| Radix Tabs ne change pas d'onglet sur `click` | mode d'activation automatique | `fireEvent.mouseDown` ou `.focus` |
| Couleur d'un badge absente du DOM | happy-dom perd `style` avec `var()` imbriqué | assertion sur la présence de l'élément |
| `bun test` sort en 1 sans aucune erreur | zéro test collecté | vérifier le glob de `test:ui` / `test:api` |
| `toBeInTheDocument` refusé par `tsc` | matchers non déclarés | `src/matchers.d.ts` |

## 🚦 CI

`.github/workflows/ci.yml`, sur `push` et `pull_request` vers `main`, depuis
`app_build/` :

1. `bun install`
2. `bunx biome ci . --error-on-warnings` — `biome ci` seul sort en 0 sur des
   warnings et laisserait réapparaître un `any` sans bruit.
3. `bun run typecheck`
4. `bun run test` — les deux étages.

Les quatre étapes doivent être vertes pour fusionner.
