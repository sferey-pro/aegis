# 🐛 Problèmes identifiés

Défauts relevés sur l'existant — les nouvelles fonctionnalités sont listées dans [UPGRADE.md](UPGRADE.md).

**Liste unique, groupée par priorité.** Ce fichier fusionne les trois sources qui coexistaient : la vague 1 (juillet 2026, `C1`…`C12` / `T1`…`T4`), la vague 2 (août 2026, `N1`…`N31`) et les écarts relevés par la suite de tests (`N32`…`N45`, auparavant numérotés 1–22 dans une seconde liste au sein de [TESTS.md](TESTS.md)). Cette seconde numérotation est supprimée : `TESTS.md` renvoie désormais aux identifiants ci-dessous.

**Tout a été revérifié dans le code le 21/08/2026**, entrée par entrée. Plusieurs défauts ont été fermés depuis la rédaction de la vague 2 ; ils restent listés avec leur constat de vérification, car savoir *ce qui a été refermé et comment* est ce qui empêche de le re-casser.

### Légende

| Marqueur | Sens |
|---|---|
| 🔴 | ouvert — reproduit dans le code au 21/08/2026 |
| 🟡 | partiellement corrigé — le résiduel est décrit dans l'entrée |
| 🟢 | corrigé et vérifié |
| 🧪 | **épinglé par deux tests** : l'un affirme le comportement réel actuel, l'autre — marqué `test.failing` — énonce le contrat attendu et **basculera en rouge le jour du correctif**. Voir « Comment corriger un défaut épinglé ». |
| ⊕N | nombre d'analyses indépendantes ayant relevé le défaut (vague 2) |

Un défaut 🧪 n'est pas un défaut corrigé — c'est un défaut qui ne peut plus s'aggraver en silence, **et dont la cible est déjà écrite**.

---

## 📊 Table de bord

**40 entrées ouvertes (34 🔴) ou partielles (6 🟡) · 24 fermées · 22 épinglées par un test.**

### Priorité 1 — Sécurité

| ID | Sujet | État | Test |
|---|---|:-:|:-:|

### Priorité 2 — Bugs fonctionnels & intégrité des données

| ID | Sujet | État | Test |
|---|---|:-:|:-:|
| [N2](#n2-la-restauration-de-snapshot-ne-restaure-rien) | La restauration de snapshot ne restaure rien | 🔴 | 🧪 |
| [N7](#n7-les-annotations-globales-sont-impossibles-et-limport-de-config-meurt-à-mi-parcours) | Annotations globales impossibles, import de config non transactionnel | 🔴 | 🧪 |
| [N11](#n11-force1-est-inopérant) | `?force=1` est inopérant | 🔴 | — |
| [N12](#n12-la-suppression-dun-tag-laisse-des-tags-fantômes-définitifs) | La suppression d'un tag laisse des tags fantômes | 🔴 | 🧪 |
| [N13](#n13-apihistory-global--deux-sévérités-perdues-pas-de-total-fuseau-local-days-non-validé) | `/api/history-global` : sévérités perdues, `days` non validé | 🔴 | 🧪 |
| [N18](#n18-rate-limit-ignoré-et-perte-du-fixedin-fourni-par-loutil) | Rate-limit ignoré, perte du `fixedIn` de l'outil | 🔴 | 🧪 |
| [N20](#n20-aucune-vérification-préalable-du-chemin-daudit-ni-du-lockfile) | Aucune vérification préalable du chemin d'audit ni du lockfile | 🔴 | — |
| [N33](#n33-zcoerceboolean-rend-la-chaîne-false-vraie) | `z.coerce.boolean` rend la chaîne `"false"` vraie | 🔴 | 🧪 |
| [N44](#n44-syncadvisory-vide-le-cache-avant-de-refetcher) | `syncAdvisory` vide le cache avant de refetcher | 🔴 | 🧪 |
| [N45](#n45-la-porte-ci-dun-projet-ignoré-est-toujours-verte) | La porte CI d'un projet ignoré est toujours verte | 🔴 | 🧪 |
| [C4](#c4-apiconfigimport-ne-restaure-que-trois-sections-sur-cinq) | `/api/config/import` ne restaure que trois sections sur cinq | 🟡 | — |

### Priorité 3 — Robustesse & performance

| ID | Sujet | État | Test |
|---|---|:-:|:-:|
| [N8](#n8--tout-auditer---séquentiel-périmètre-faux-non-annulable-et-verrou-serveur-contradictoire) | « Tout auditer » : séquentiel, périmètre faux, verrou contradictoire | 🔴 | 🧪 |
| [N16](#n16-le-reactmemo-de-projectcard-est-neutralisé-par-construction) | Le `React.memo` de `ProjectCard` est neutralisé | 🟡 | — |
| [N17](#n17-double-flux-sse-et-console-perdue-au-passage-sur-debug) | Double flux SSE, console perdue au passage sur `/debug` | 🔴 | — |
| [N19](#n19-létat-serveur-nest-jamais-invalidé-après-une-mutation) | L'état serveur n'est jamais invalidé après une mutation | 🔴 | — |
| [N21](#n21-n1-systématiques-et-double-désérialisation-des-blobs) | N+1 systématiques, double désérialisation des blobs | 🟡 | — |
| [N22](#n22-race-condition-sur-le-graphique-dhistorique) | Race condition sur le graphique d'historique | 🔴 | — |
| [N26](#n26-setinterval-jamais-nettoyé-état-de-module-perdu-sous-bun---hot) | `setInterval` jamais nettoyé, état de module perdu sous `bun --hot` | 🔴 | — |
| [N29](#n29-deux-définitions-du--dernier-run--coexistent) | Deux définitions du « dernier run » coexistent | 🔴 | 🧪 |
| [N30](#n30-le-contexte-projet-nenveloppe-pas-les-commandes-git-du-listing) | Le contexte projet n'enveloppe pas les commandes git du listing | 🔴 | — |
| [N34](#n34-parsecvssvector-écarte-toujours-le-premier-segment) | `parseCvssVector` écarte toujours le premier segment | 🔴 | 🧪 |
| [N35](#n35-500-au-lieu-de-400-sur-les-routes-qui-lisent-reqjson-directement) | 500 au lieu de 400 sur les routes lisant `req.json()` | 🔴 | 🧪 |
| [N36](#n36-une-méthode-non-déclarée-renvoie-du-html-en-200) | Une méthode non déclarée renvoie du HTML en 200 | 🔴 | 🧪 |
| [N37](#n37-delete-sur-un-identifiant-inconnu-répond-succès) | `DELETE` sur un identifiant inconnu répond succès | 🔴 | 🧪 |
| [N38](#n38-getreports-trie-par-created_at-seul) | `getReports` trie par `created_at` seul | 🔴 | 🧪 |
| [N39](#n39-la-progression-du-lot-daudit-nest-pas-observable-après-coup) | La progression du lot d'audit n'est pas observable après coup | 🔴 | 🧪 |
| [N41](#n41-content_hash-nest-pas-unique-en-base) | `content_hash` n'est pas unique en base | 🔴 | 🧪 |
| [N42](#n42-commit_sha-peut-valoir-la-chaîne-head) | `commit_sha` peut valoir la chaîne `"HEAD"` | 🔴 | 🧪 |
| [N43](#n43-le-repli--déjà-à-jour--de-gitfetch-est-inatteignable) | Le repli « Déjà à jour. » de `gitFetch` est inatteignable | 🔴 | 🧪 |
| [C9](#c9-initdb-ignore-son-paramètre) | `initDb` ignore son paramètre | 🔴 | — |

### Priorité 4 — UX & accessibilité

| ID | Sujet | État | Test |
|---|---|:-:|:-:|
| [N9](#n9-le-triage-est-impraticable-au-delà-de-quelques-cve) | Le triage est impraticable au-delà de quelques CVE | 🔴 | 🧪 |
| [N14](#n14-sévérité-illisible--palette-sans-couleur-de-texte-et-préfixes-dark-amputés) | Sévérité illisible, préfixes `dark:` amputés | 🔴 | 🧪 |
| [N15](#n15-aucune-navigation-clavier) | Navigation clavier | 🟡 | — |
| [N23](#n23-les-aides-à-la-décision-de-8-sont-absentes-alors-que-la-donnée-existe) | Les aides à la décision de §8 sont absentes | 🔴 | — |
| [N24](#n24-filtres-et-pagination-hors-de-lurl) | Filtres et pagination hors de l'URL | 🔴 | — |
| [N25](#n25-ticketmodal--les-notes-fuient-dun-ticket-à-lautre) | `TicketModal` : les notes fuient d'un ticket à l'autre | 🔴 | — |
| [N27](#n27-design-system-contourné) | Design system contourné | 🟡 | — |
| [N40](#n40-les-noms-de-tags-sont-sensibles-à-la-casse) | Les noms de tags sont sensibles à la casse | 🔴 | 🧪 |

### Priorité 5 — Écart de contrat à arbitrer

| ID | Sujet | État | Test |
|---|---|:-:|:-:|
| [N31](#n31-écarts-au-contrat-contextmd--arbitrage-à-trancher) | `CONTEXT.md` n'est plus la spécification du produit | 🟡 | partiel |
| [C11](#c11-composants-monolithiques) | Composants monolithiques (1057 lignes pour `Projects.tsx`) | 🔴 | — |

### 🟢 Fermé, vérifié le 21/08/2026

| ID | Sujet | Constat de vérification |
|---|---|---|
| T1 | Front quasi non couvert | **355 tests** sur 46 fichiers `.test.tsx`, colocalisés sur toute l'arborescence Atomic Design |
| T2 | Routes peu couvertes | **11 modules de routes sur 11**, en fonctionnel sur un vrai `Bun.serve` — 227 tests |
| T3 | Test git dépendant du réseau | dépôts jetables en `tmpdir()` avec un dépôt nu local comme amont ; **aucun accès réseau** dans toute la suite |
| T4 | Modules sans aucun test | `lib/cvss.ts` (14 tests), `lib/console.ts` (18), `db/backup.ts` (6) |
| N31 §1 | Validations de projet + 409 doublon de cible | `projectBodySchema` (Zod) + `findDuplicate` sur la cible **résolue**, appliqués à `POST` et `PUT` |
| N31 §7/§10/§12 | Validations d'annotation, de prompt, de réglage | `annotationBodySchema`, `promptBodySchema`, `settingsBodySchema` — messages conformes à `CONTEXT.md` |
| C3 | Compteurs de sévérité corrompus à l'ingestion | garde unique dans `enhanceVulnerabilities`, partagée par les deux chemins — **mais sans test de non-régression, cf. N28** |
| C5 | Duplication de la logique d'enrichissement | `enhanceVulnerabilities` extraite, appelée par `runAudit` et `ingestAudit` |
| C6 | Requête N+1 dans `ingestAudit` | `getLatestRun` hissé hors de la boucle |
| C7 | Le WAL SQLite n'est jamais checkpointé | `PRAGMA wal_autocheckpoint = 500` + `closeDb()` sur `SIGINT`/`SIGTERM` |
| C10 | Dérive entre documentation et code | README, `CLAUDE.md`, `DOCUMENTATION.md`, `VERIFICATION_REPORT.md` réalignés le 21/08/2026 |
| C12 | Le chronomètre `first_seen_at` se réinitialise | table `cve_occurrences` + `ON CONFLICT DO NOTHING`, **et le test de non-régression existe désormais**. Résiduel de clé → [N10](#n10-trois-clés-didentité-différentes-pour-la-même-vulnérabilité) |
| C1 | Aucune authentification sur l'API | résiduel → [N3](#n3-put-apiprojectsid--aucune-validation-aucune-garde-de-chemin) : la brèche `PUT` est fermée, celle de `git-fetch`/`git-pull` non |
| C2 | Fuite des secrets par `/api/config/export` | résiduel → [N5](#n5-get-apisettings-expose-les-secrets-en-clair) |
| C8 | `/api/audit/run` sans garde de concurrence | résiduel → [N8](#n8--tout-auditer---séquentiel-périmètre-faux-non-annulable-et-verrou-serveur-contradictoire) |
| N10 | Clé d'identité de la table d'occurrences | 🟢 **corrigé le 21/08/2026.** `src/lib/vuln-identity.ts` porte les fonctions partagées, et la colonne `cve` de `cve_occurrences` stocke désormais `occurrenceRef` — la CVE, **repli sur le titre**, conformément à la clé de `newCves` (§2). Une migration purge les lignes de l'ancienne convention (`cve = package`), ambiguës par construction. **Correction de cadrage :** le correctif annoncé (« une clé unique pour parsing, table et agrégation ») allait trop loin — `CONTEXT.md` §3 et §2 **spécifient** les clés du dédoublonnage et du diff, volontairement plus fines. Le défaut n'était pas d'avoir trois clés mais d'en avoir une quatrième, non spécifiée. |
| N28 | Verrou de non-régression de C3 | 🟢 **écrit le 21/08/2026** — et il a appris quelque chose. En cassant la garde de `enhanceVulnerabilities` pour vérifier que le verrou rougissait, **rien n'a rougi** : la garde est inatteignable, les quatre parseurs et `getCachedAdvisory` normalisant tous la sévérité en amont. Le verrou porte donc sur l'**invariant** — compteurs finis, somme égale au total, quelle que soit la charge — plutôt que sur une garde redondante qui pourrait rester verte en laissant entrer le défaut par une autre porte. Le cas de N10 y est ajouté de bout en bout, comme la vague 1 le demandait. |
| N1 | GitHub est appelé pendant chaque audit | 🟢 **corrigé le 21/08/2026.** Le chemin d'audit passe par `resolveFixedVersionFromCache`, qui lit le cache d'avis local et **n'émet aucune requête** — vérifié par un compteur d'appels sortants, pas seulement par un audit qui aboutit hors ligne. Un audit est donc hors ligne, déterministe et borné par le disque. L'enrichissement n'est pas supprimé : ce qui est déjà connu est appliqué, le reste attend `/api/advisories/sync`. Au passage, la liste persistée est **retriée** après enrichissement — une sévérité relevée invalidait l'ordre du parseur (§3). |
| N6 | Les erreurs HTTP sont consommées comme des succès | 🟢 **corrigé le 21/08/2026.** Point de passage unique `src/lib/api.ts` (`fetchJson`, `fetchVoid`, `apiErrorMessage`), appliqué aux **43** appels : il ne reste aucun `fetch` brut dans `pages/`, `components/` ni `App.tsx`. Les trois conséquences nommées sont fermées — le triage a un état d'échec distinct de « écosystème sain », un audit en échec n'est plus compté zéro vulnérabilité ni archivé comme tel, et la page Réglages sort de son chargement. Les suppressions en lot passent par `Promise.allSettled` et annoncent les échecs partiels. **Résiduel :** aucun `AbortController` — l'annulation relève de [N8](#n8--tout-auditer---séquentiel-périmètre-faux-non-annulable-et-verrou-serveur-contradictoire). |
| N3 | Garde de chemin incomplète, défaut ouvert | 🟢 **corrigé le 21/08/2026.** `pathGuard` couvre désormais les sept points d'entrée touchant un chemin — création, modification, détection, `git-fetch`, `git-pull`, audit et import de configuration — et le contrôle a lieu **juste avant** chaque sous-processus, pas seulement à l'enregistrement. `isPathAllowed` est passé en **défaut fermé** : sans `AEGIS_ALLOWED_ROOTS`, rien n'est autorisé (`AEGIS_ALLOWED_ROOTS=/` ouvre explicitement). Bug trouvé au passage : la racine du système n'autorisait rien, `root + sep` donnant `"//"`. |
| N4 | SSRF authentifié via `/api/tickets/test-connection` | 🟢 **corrigé le 21/08/2026.** La route ne lit plus l'URL ni les identifiants dans le corps : elle vérifie la configuration **enregistrée**. `JIRA_BASE_URL` est validée en https à l'écriture (`jiraBaseUrlSchema`) et re-validée au point d'utilisation par `jiraEndpoint`, sur les deux appels sortants Jira. Conséquence d'usage : il faut enregistrer avant de tester. |
| N5 | `GET /api/settings` expose les secrets en clair | 🟢 **corrigé le 21/08/2026.** Liste blanche `PUBLIC_SETTING_KEYS`, et un booléen `<CLÉ>_CONFIGURED` par secret. Liste blanche et non liste noire : c'était le défaut du correctif C2. En écriture, un secret vide est ignoré, sinon le formulaire — qui ne connaît plus la valeur — l'effacerait à chaque enregistrement. **Résiduel :** effacer un secret depuis l'interface n'est plus possible, il faudra une action explicite. |
| N32 | `POST /api/annotations` efface les champs omis | 🟢 **corrigé le 21/08/2026.** `note` et `fixedIn` n'ont plus de valeur par défaut dans `annotationBodySchema` : l'absence traverse jusqu'à `upsertAnnotation`, qui préserve alors la valeur en base. Côté client, `updateStatus` n'envoie plus `note: ""` pour les statuts autres que « confirmé » — c'était la seconde moitié du défaut, et elle laissait le symptôme intact sur deux des trois actions de triage. Le test « écart documenté » a été supprimé, son test de contrat activé. |
| N28 | Les deux tests de non-régression de la vague 1 | 🟡 **un sur deux** : le verrou C12 est écrit, celui de C3 non. Reste ouvert à ce titre → [N28](#n28-le-verrou-de-non-régression-de-c3) |

> *Leçon confirmée par cette seconde vérification : C3 et C12 avaient été « corrigés » une fois avant d'être re-cassés par la duplication C5. C12 est aujourd'hui verrouillé par un test, C3 ne l'est pas — il reste donc exactement aussi fragile qu'avant.*

---
## 🔴 Priorité 1 — Sécurité

### N3. `PUT /api/projects/:id` : aucune validation, aucune garde de chemin
🟢 **Corrigé le 21/08/2026.** Les deux brèches décrites ci-dessous sont fermées : `PUT` valide désormais son corps (Zod), répond 404 avant validation si l'id est inconnu, et appelle `pathGuard` ; et `pathGuard` contrôle la **cible d'audit résolue** par `resolveAuditTarget` — la recomposition ad hoc `replace(/^\/+/, "")` a disparu, donc la cible validée est bien la cible exécutée. 🧪 Les deux propriétés sont épinglées dans `src/routes/projects.test.ts`. **Résiduel ouvert :** `git-fetch` et `git-pull` n'appellent toujours pas `pathGuard` (0 occurrence), `/api/config/import` non plus, et `isPathAllowed` reste un **défaut ouvert** — `AEGIS_ALLOWED_ROOTS` non défini renvoie `true`.

**⊕3** — `src/routes/projects.ts:129-134`

Le handler fait six lignes : `parseInt(req.params.id)`, `await req.json()`, `updateProject(id, body)`. Ni validation de corps, ni contrôle d'existence, ni appel à `isPathAllowed` — alors que `POST` (`:100-108`) l'appelle.

Second chemin d'évasion, sur `POST` cette fois : la garde valide `nodePath.resolve(expanded, audit_path.replace(/^\/+/, ""))` — les `/` de tête sont **retirés** avant validation. Mais `getAuditTarget()` traite un `audit_path` commençant par `/` ou `~` comme **absolu** (`src/lib/audit/index.ts:97-102`). La cible validée n'est donc pas la cible exécutée.

```
AEGIS_ALLOWED_ROOTS=/srv/apps

POST /api/projects {path:"/srv/apps/x", audit_path:"/root", tool:"npm"}   → 200
  garde valide  : /srv/apps/x/root
  cwd du spawn  : /root

# ou, plus direct :
POST /api/projects {path:"/srv/apps/x", …}   → 200
PUT  /api/projects/1 {path:"/root"}          → 200, aucun contrôle
```

Git exécute les hooks du dépôt qu'il visite : combiné à `git-fetch`/`git-pull` (qui n'appellent pas non plus `isPathAllowed`), cela reste un chemin d'exécution de code sur l'hôte — le risque que C1 devait fermer.

**Correctifs :**
1. Appliquer la garde sur le **résultat de `getAuditTarget()`** et sur la racine git expansée, pas sur une recomposition ad hoc du chemin.
2. L'appliquer aux trois moments : création, modification, et juste avant tout lancement de sous-processus (audit, git).
3. Faire de `isPathAllowed` un défaut **fermé** plutôt qu'ouvert : `AEGIS_ALLOWED_ROOTS` non défini renvoie aujourd'hui `true` (`:13`).

### N4. SSRF authentifié via `/api/tickets/test-connection`
🟢 **Corrigé le 21/08/2026.** La route ne lit plus le corps : elle vérifie la configuration enregistrée. `JIRA_BASE_URL` est validée en https à l'écriture et re-validée au point d'utilisation, sur les **deux** appels sortants Jira (`test-connection` et `create`). 🧪 Épinglé par un test qui envoie `baseUrl: "http://169.254.169.254"` dans le corps et vérifie que l'appel part bien vers l'hôte configuré.

**⊕1** — `src/routes/tickets.ts:241-259`

`baseUrl`, `user` et `apiKey` sont lus **dans le corps de la requête**, puis :

```ts
const auth = Buffer.from(`${user}:${apiKey}`).toString("base64");
const response = await fetch(`${baseUrl}/rest/api/3/myself`, {
  headers: { Authorization: `Basic ${auth}`, … },
});
```

Aucune restriction de schéma ni d'hôte. Le serveur devient un proxy sortant authentifié.

- `baseUrl: "http://169.254.169.254"` → sonde le service de métadonnées interne depuis le serveur.
- `baseUrl: "http://attaquant/"` → l'en-tête `Basic` contenant les identifiants Jira est envoyé directement à l'attaquant.

**Correctif :** n'accepter comme `baseUrl` qu'une valeur validée — schéma `https` imposé, et hôte soit en liste blanche, soit celui déjà enregistré dans les réglages (auquel cas le paramètre devient inutile).

### N5. `GET /api/settings` expose les secrets en clair
🟢 **Corrigé le 21/08/2026.** Liste blanche `PUBLIC_SETTING_KEYS` + un booléen `<CLÉ>_CONFIGURED` par secret ; en écriture, un secret vide est ignoré. 🧪 Épinglé par trois tests, dont « une clé hors liste blanche n'est pas exposée » — la propriété qui manquait au correctif C2.

**⊕2** — `src/routes/settings.ts:8-10`

```ts
async GET() {
  return Response.json(getAllSettings());
}
```

Dump brut de la table `settings` : `JIRA_API_KEY`, `GITHUB_TOKEN`, `JIRA_USER`, `GITHUB_RL_*`. L'export voisin prend explicitement la peine de les masquer (`:21-23`) — l'exposition n'est donc pas voulue, elle a simplement été oubliée sur la route de lecture. CONTEXT.md §12 ne spécifie que trois clés en sortie : `{auditMaxAgeHours, JIRA_BASE_URL, DISABLE_CONSOLE}`.

**Correctifs :**
1. Allowlist des clés non sensibles en sortie de `GET /api/settings` — pas une denylist, sinon toute nouvelle clé secrète fuit par défaut (même défaut que le correctif C2 actuel).
2. Accepter les secrets en **écriture seule** ; renvoyer un booléen « configuré / non configuré » plutôt que la valeur.

---

## 🟠 Priorité 2 — Bugs fonctionnels & intégrité des données

### N32. `POST /api/annotations` efface les champs omis
🟢 **Corrigé le 21/08/2026** — relevé par la suite de tests — `src/lib/schemas.ts` (`annotationBodySchema`), `src/db/annotations.ts:19-57`

`upsertAnnotation` est écrite pour **préserver** les champs non fournis — c'est explicite dans son corps :

```ts
if (data.status  !== undefined) status  = data.status;
if (data.note    !== undefined) note    = data.note;
if (data.fixedIn !== undefined) fixed_in = data.fixedIn;
```

Mais le schéma de la route applique ses valeurs par défaut **avant** d'y arriver : `note: z.string().default("")` transforme un champ absent en `""`, et `fixedIn: emptyToNull` transforme un champ absent en `null`. Les trois `!== undefined` sont donc toujours vrais, et la logique de préservation est morte.

Conséquence : le panneau de triage envoyant un seul champ à la fois, **enregistrer un statut détruit la note et la version corrigée saisies à la main.** Le référent perd son analyse d'atteignabilité en cliquant « Confirmé », et la version cible qu'il avait relevée sur le dépôt amont.

🧪 Épinglé dans `src/routes/annotations.test.ts` : « un champ omis est effacé, pas conservé — écart documenté ». Le test de `src/db/annotations.test.ts` affirme l'inverse — et c'est correct : au niveau de la fonction, la préservation marche. Les deux tests ensemble localisent le défaut dans le schéma.

**Correctif appliqué le 21/08/2026, en deux moitiés.**

1. **Schéma** — `note: z.string().optional()` et un nouveau `emptyToNullOptional` pour `fixedIn`, qui garde le trim et la normalisation `""` → `null` mais laisse l'absence en `undefined`. `emptyToNull` est conservé tel quel pour `audit_path`, dont la colonne n'a pas de notion de « ne pas toucher ».
2. **Client** — `updateStatus` (`src/pages/Triage.tsx`) forçait `payload.note = ""` pour tout statut autre que « confirmé ». Le correctif du schéma seul aurait donc laissé le symptôme intact sur « en attente » et « faux positif », soit deux des trois actions de triage réellement atteignables. La clause est supprimée : un changement de statut n'envoie plus que le statut.

> **Décision de produit prise au passage.** La clause supprimée avait peut-être pour intention d'effacer une justification devenue obsolète quand on dé-confirme une CVE. Cette intention n'était documentée nulle part et contredit le contrat. Si l'effacement au dé-confirmement est souhaité, il doit être explicite et visible à l'écran, pas un effet de bord de l'enregistrement.

> ⚠️ **Piège évité.** Le correctif naïf — remplacer `emptyToNull` par `z.string().trim().nullish()` — faisait passer **trois** tests au rouge, pas deux : `emptyToNull` portait **aussi** la normalisation `"   "` → `null` exigée par §1. Le correctif retenu sépare les deux comportements, et le test « une version corrigée blanche est enregistrée à null » passe toujours.

### N33. `z.coerce.boolean` rend la chaîne `"false"` vraie
🔴 **Ouvert — relevé par la suite de tests** — `src/lib/schemas.ts` (`projectBodySchema`, champs `ignored` et `is_remote`)

`z.coerce.boolean()` applique la conversion JavaScript : toute chaîne non vide est vraie, `"false"` comprise. Un client qui sérialise ses booléens en texte — un formulaire HTML, un script `curl`, un pipeline CI — active donc « ignoré » en croyant le désactiver, et le projet **disparaît de l'agrégation CVE** sans message.

🧪 Épinglé dans `src/lib/schemas.test.ts` : « `z.coerce.boolean` rend toute chaîne non vide vraie — écart documenté ».

**Correctif :** remplacer par un préprocesseur explicite acceptant `true`/`false`, `1`/`0`, `"true"`/`"false"`, et rejetant le reste.

### N44. `syncAdvisory` vide le cache avant de refetcher
🔴 **Ouvert — relevé par la suite de tests** — `src/lib/github/index.ts` (fin de fichier)

```ts
db.query("DELETE FROM advisory_cache WHERE id = ?").run(key.id);
const { advisory } = await fetchAdvisory(key);   // ← peut échouer
```

La suppression précède l'appel réseau. Hors ligne, en quota dépassé ou sur un 5xx GitHub, l'avis déjà connu — sévérité, correctifs par branche, vecteur CVSS, date de publication — est **définitivement perdu**, et l'enrichissement repart de zéro au prochain audit. L'action « rafraîchir » dégrade donc l'état quand elle échoue.

🧪 Épinglé dans `src/lib/github/index.test.ts` : « un échec de rafraîchissement vide le cache — écart documenté ».

**Correctif :** ne supprimer qu'après un `fetchAdvisory` réussi, ou écrire par-dessus via le `ON CONFLICT` de `putCachedAdvisory` — qui fait déjà exactement cela, rendant le `DELETE` superflu.

### N45. La porte CI d'un projet ignoré est toujours verte
🔴 **Ouvert — relevé par la suite de tests** — `src/lib/audit/index.ts` (fin d'`ingestAudit`), via `buildCveGroups`

`ingestAudit` calcule ses `newCves` en appelant `buildCveGroups()`, qui **exclut les projets ignorés** (`if (project.ignored) continue`). Un projet marqué « ignoré » qui ingère un rapport par `POST /api/ingest/:slug` obtient donc toujours `newCvesCount: 0`, quelle que soit la charge — le run est bien enregistré avec ses vulnérabilités, mais la porte CI ne signale rien.

Combiné à [N33](#n33-zcoerceboolean-rend-la-chaîne-false-vraie), le scénario est atteignable sans intention : un client sérialisant `ignored: "false"` marque le projet ignoré, et sa CI passe au vert pour de bon.

🧪 Épinglé dans `src/lib/audit/index.test.ts` : « un projet ignoré ne remonte aucune nouvelle CVE — écart documenté », qui vérifie aussi que le run porte bien `total: 1`.

**Correctif :** calculer le diff d'ingestion sur le run précédent du projet — comme le fait `runAudit` — plutôt qu'en passant par l'agrégat global, dont le filtre « ignoré » a une finalité d'affichage.

### N1. GitHub est appelé pendant chaque audit
🟢 **Corrigé le 21/08/2026.** Le chemin d'audit appelle `resolveFixedVersionFromCache`, qui lit le cache et n'émet aucune requête. 🧪 Épinglé par un **compteur d'appels sortants** : il ne suffit pas qu'un audit aboutisse hors ligne, il faut qu'il n'ait rien tenté. Trois tests couvrent l'enrichissement depuis le cache, la préservation du `fixedIn` de l'outil en cas d'absence, et le retri par gravité.

**⊕2** — `src/lib/audit/index.ts:24-32` (via `enhanceVulnerabilities`, appelée en `:238` et `:342`)

CONTEXT.md §2 : « **Aucun appel réseau** (GitHub) pendant l'audit. » §6 : « Déclenchement : 100 % manuel, par CVE. […] Jamais pendant un audit. »

```ts
for (const v of parsedVulns) {
  const res = await resolveFixedVersion({ tool, package: v.package, cve: v.cve, … });
  …
}
```

Une requête HTTP sérialisée par vulnérabilité à chaque cache-miss, sur le chemin d'audit **et** sur celui d'ingestion CI. Conséquences mesurables :

1. **Quota** — 180 avis sans cache et sans `GITHUB_TOKEN` (≈60 req/h) : le quota est épuisé au premier audit, et « Tout auditer » le sature systématiquement.
2. **Disponibilité** — la requête `POST /api/projects/:id/audit` reste ouverte des dizaines de secondes **en tenant le verrou global d'audit** ([N8](#n8--tout-auditer---séquentiel-périmètre-faux-non-annulable-et-verrou-serveur-contradictoire)). La durée d'un audit devient dépendante du réseau.
3. **Rate-limit non respecté** — §6 impose que l'appelant « s'arrête ». La boucle ne teste jamais `res.rateLimited` et continue à taper l'API après un 429.
4. **Intégrité du run** — `severity` et `link` persistés sont écrasés par GitHub (`:46-47`) et `counts` est recalculé après enrichissement (`:52-64`). Le run ne reflète plus la sortie de l'outil, et la liste persistée **n'est plus triée par sévérité** puisque le tri (`src/lib/parsers/utils.ts:66`) a lieu avant la réécriture des sévérités.

**Correctifs :**
1. Persister le run à partir du **parsing seul**. L'audit redevient hors-ligne, déterministe et rapide.
2. Réserver GitHub à la porte manuelle par CVE ([N31](#n31-écarts-au-contrat-contextmd--arbitrage-à-trancher), `/api/annotations/fetch-fix`).
3. Solution intermédiaire acceptable si l'enrichissement automatique doit être conservé : ne consulter que le **cache local**, sans aucun accès réseau, et propager `rateLimited` pour interrompre la boucle.

### N2. La restauration de snapshot ne restaure rien
🔴 **Ouvert — vérifié le 21/08/2026.** `src/db/backup.ts` ne contient aucune occurrence de `DB_PATH`, `wal`, `shm` ni `pre-restore` : ni la cible, ni la purge, ni le filet de sécurité. 🧪 Épinglé sous trois angles : `src/db/backup.test.ts` (le chemin ignore `DB_PATH`) et `src/routes/settings.test.ts` (le nom de fichier demandé est ignoré ; une restauration sans instantané renvoie 400). Le chemin de restauration **réussie** n'est pas testable — `process.exit(0)` tuerait l'exécuteur.

**⊕2** — `src/db/backup.ts:5-6`, `:26`, `:30`

```ts
const MAIN_FILE = resolve(process.cwd(), "aegis.db");   // ligne 6
…
copyFileSync(BACKUP_FILE, MAIN_FILE);                   // ligne 26
setTimeout(() => process.exit(0), 100);                 // ligne 30
```

La base réellement ouverte est `process.env.DB_PATH || "audit.sqlite"` (`src/db/index.ts:11`). Le snapshot est donc copié sur `aegis.db`, fichier que personne n'ouvre jamais. L'API répond `{success:true, message:"Restauration effectuée, redémarrage du serveur..."}`, le serveur redémarre, et la base est **identique** à avant.

Deux défauts aggravants :
- **Aucune purge `-wal`/`-shm`** (CONTEXT.md §12, étape 6). Si l'exploitant a positionné `DB_PATH=aegis.db`, la copie a bien lieu mais l'ancien `-wal` est rejoué par-dessus le fichier restauré → base incohérente.
- `process.exit(0)` tue le process sans attendre les réponses HTTP en vol, là où §12 prévoit une simple reconnexion paresseuse.

**Correctifs :**
1. Dériver la cible de `DB_PATH` avec exactement la même résolution que `getDb()`.
2. Supprimer `<db>-wal` et `<db>-shm` après la copie.
3. Remplacer `process.exit` par `closeDb()` — la connexion paresseuse rouvrira la nouvelle base à la requête suivante.
4. Ajouter le filet de sécurité `pre-restore-<timestamp>.sqlite` prévu par §12 : aujourd'hui, une restauration réussie est irréversible.

### N6. Les erreurs HTTP sont consommées comme des succès
🟢 **Corrigé le 21/08/2026.** Les 43 appels passent par `src/lib/api.ts` ; il ne reste aucun `fetch` brut dans `pages/`, `components/` ni `App.tsx`. 🧪 Épinglé par dix tests, dont ceux qui affirment qu'un chargement échoué n'affiche **pas** de chiffre de sécurité — « — » et non « 0 ».

> **Deux défauts trouvés en appliquant le wrapper.** D'abord `fetchJson` renvoyait `undefined` sur un corps illisible en 2xx, alors que son type promet `T` : `HistoryChart` écrivait cet `undefined` dans un état typé et tombait sur `data.length`. Un corps illisible est désormais une erreur. Ensuite le typage a révélé que `data.tool` de la détection d'outil n'était pas rétréci à travers une fermeture — invisible tant que `res.json()` renvoyait `any`.

> **Résiduel :** aucun `AbortController`. L'annulation d'un audit en cours relève de [N8](#n8--tout-auditer---séquentiel-périmètre-faux-non-annulable-et-verrou-serveur-contradictoire), qui la traitera avec le pool de concurrence.

**⊕3** — mesure sur `src/pages`, `src/components`, `src/App.tsx` : **43 appels `fetch`, 3 vérifications `res.ok`, 0 `AbortController`, 0 timeout, 0 retry**

Les trois seules vérifications sont `TagsManager.tsx:44`, `Settings.tsx:109`, `Projects.tsx:301`. Trois conséquences de nature différente :

**(a) Faux négatif rassurant.** `src/pages/Triage.tsx:60-70` : `catch (e) { console.error(e) }` puis `finally { setLoading(false) }`. Si `/api/cves` tombe (500, base verrouillée, restauration en cours), `cves` reste `[]` → la page rend son état vide : « Aucune vulnérabilité — Votre écosystème est sain ! ». Même motif sur l'accueil (`src/App.tsx:93-97`) : `stats` reste `null` et la tuile affiche `stats?.criticalVulnerabilities ?? 0`, soit **« 0 » failles critiques**. Aucune distinction visuelle entre « rien à traiter » et « je n'ai pas pu lire les données ». Pour un outil de sécurité, c'est le pire mode de défaillance possible.

**(b) Rapport d'audit faux, et persisté.** `src/App.tsx:141-176` : `const auditData = await auditRes.json(); if (auditData.run && auditData.run.counts)`. La route renvoie `{success:false, error}` en 500 sur conflit de verrou et en 404 si le projet a été supprimé. Sans `run`, le projet est **silencieusement compté 0 vulnérabilité**, puis le total faux est archivé via `POST /api/reports`. Un run `status:"error"` a des compteurs à zéro : il est lui aussi compté comme un succès, et `auditData.newCves` — calculé par le serveur — n'est **jamais lu**. Si les 20 projets échouent, la modale affiche « Audit Terminé ! · 20 projets · 0 vulnérabilité ».

**(c) Page bloquée à vie.** `src/pages/Settings.tsx:59-82` : chaîne `.then()` sans `.catch`, et `setLoading(false)` est **dans** le `then`. Serveur indisponible → rejet non capturé → spinner permanent.

**Correctifs :**
1. Un wrapper `fetchJson` unique qui teste `res.ok`, lit le champ `error` du corps et lève. Il couvre les ~40 occurrences d'un seul geste.
2. Introduire un troisième état `error` dans les pages, **distinct de l'état vide** : bandeau + bouton « Réessayer ». Ne jamais afficher un chiffre de sécurité issu d'un chargement échoué — afficher `—`, pas `0`.
3. `Promise.allSettled` pour les lots (`src/pages/Reports.tsx:408-412` masque aujourd'hui les échecs partiels de suppression).
4. `.catch` systématique coupant l'état `loading`.

### N7. Les annotations globales sont impossibles, et l'import de config meurt à mi-parcours
🔴 **Ouvert — vérifié le 21/08/2026.** Aucune transaction dans `/api/config/import`, aucun compteur en réponse. 🧪 Épinglé deux fois : `src/db/annotations.test.ts` (l'insertion `project_id = -1` lève sur la clé étrangère) et `src/routes/settings.test.ts` (une annotation globale dans l'import produit un 500). Voir aussi [N45](#n45-la-porte-ci-dun-projet-ignoré-est-toujours-verte), même racine.

**⊕1** — `src/db/index.ts:105-115`, `src/routes/settings.ts:64-77`, `src/db/annotations.ts:68-75`

La table `annotations` déclare `FOREIGN KEY (project_id) REFERENCES projects(id)` et la connexion active `PRAGMA foreign_keys = ON` (`src/db/index.ts:21`). Vérifié expérimentalement en isolant le schéma sur `bun:sqlite` :

```
INSERT INTO annotations (cve, project_id) VALUES ('CVE-2024-1', -1)
  → FOREIGN KEY constraint failed
```

Or la convention `project_id = -1` est utilisée à trois endroits : l'import la réinjecte explicitement (`src/routes/settings.ts:67` : `a.project_id === -1 ? -1 : mappedId`), l'agrégateur lit `WHERE project_id = ? OR project_id = -1` (`src/db/annotations.ts:72`), et un champ `isGlobal` est exposé au client (`src/lib/aggregator/index.ts:107`). **La fonctionnalité entière est morte.**

Aggravant : l'import n'est pas encapsulé dans une transaction. L'exception remonte non capturée à la route, le handler global renvoie 500 — **après** avoir déjà créé ou modifié les projets. L'utilisateur relance l'import, et comme il n'y a pas de dédup par cible d'audit ([N31](#n31-écarts-au-contrat-contextmd--arbitrage-à-trancher)), les projets sont recréés en doublon tandis que les annotations restantes ne sont jamais importées.

**Correctifs :**
1. Trancher sur `project_id = -1` : soit supprimer la notion (elle est absente de CONTEXT.md §7, où l'unité de triage est le couple CVE/projet), soit la matérialiser par une ligne « projet global » réelle en base.
2. Envelopper l'import complet dans **une seule transaction**, et retourner les compteurs `{tagsAdded, projectsAdded, annotationsAdded, …}` prévus par §12.

### N10. Trois clés d'identité différentes pour la même vulnérabilité
🟢 **Corrigé le 21/08/2026.**

**Le cadrage initial de cette entrée était faux sur un point.** Elle présentait les trois clés comme une incohérence à unifier. Or `CONTEXT.md` **spécifie** deux d'entre elles : §3 fixe la clé de `dedupe` à `` `${package}|${title}|${cve ?? ""}` `` et §2 celle de `newCves` à `package::cve` avec repli `package::title`. Elles sont volontairement de granularités différentes — la première est la plus fine, la dernière regroupe entre projets. Les aligner aurait **cassé** la conformité à §3 : deux avis de même CVE mais de titres différents auraient fusionné au dédoublonnage. Trois tests l'ont montré immédiatement.

Le défaut réel était plus étroit : la table `cve_occurrences` employait une **quatrième** clé, non spécifiée, `cve || package` — la seule à laisser tomber le titre. Elle stocke désormais `occurrenceRef` (la CVE, repli sur le titre), c'est-à-dire la clé de §2, qui est exactement sa granularité : une vulnérabilité, dans un projet.

🧪 Épinglé par quatre tests, dont celui qui combine N10 et C12 : le premier avis est antidaté, puis un second avis sans CVE est ingéré, et l'on vérifie que le premier garde sa date **et** sa qualification de dette héritée tandis que le second est une découverte nette.

**Migration.** Les lignes de l'ancienne convention (`cve = package`) sont purgées à l'ouverture de la base. Elles sont ambiguës par construction : le titre qui les distinguait n'a jamais été stocké, on ne peut pas les réparer. Conséquence assumée — les vulnérabilités sans CVE repartent d'un `first_seen_at` à la date du prochain audit. C'est une perte réelle, mais la date conservée était fausse pour une partie d'entre elles, et c'est précisément la population que la baseline devait qualifier. Les lignes portant une vraie CVE ne sont pas touchées, et la migration est couverte par quatre tests dont un d'idempotence.

**⊕1** — `src/lib/parsers/utils.ts:29` · `src/db/occurrences.ts:20` + PK `src/db/index.ts:128-138` · `src/lib/aggregator/index.ts:72`

| Couche | Clé d'identité | Conforme ? |
|---|---|---|
| Parsing (`dedupe`) | `` `${package}\|${title}\|${cve ?? ""}` `` | ✓ §3 |
| Table `cve_occurrences` | PK `(project_id, package, cve)`, avec `cve = v.cve \|\| v.package` | le **titre disparaît** de l'identité |
| Agrégateur (`buildCveGroups`) | `cve` trimé, sinon `` `${package}: ${title}` `` | ✓ §7 |

Les trois espaces de nommage ne coïncident pas — alors que `firstSeenAt` et `isBaseline`, donc `ageInDays` et tous les indicateurs SLA de `CveGroup`, sont lus depuis la table par la clé `` `${package}::${cve || package}` `` (`src/lib/audit/index.ts:34`).

**Scénario reproductible.** `bun audit` remonte deux avis distincts sur `lodash` sans CVE — le parseur bun ne remplit `cve` que depuis les CWE (`src/lib/parsers/bun.ts:28-30`). Le parsing les conserve tous les deux, leurs titres différant. Mais une seule ligne `cve_occurrences ('lodash', 'lodash')` est créée : **les deux vulnérabilités héritent du même `first_seen_at`**, celui du premier avis vu, et du même `is_baseline`. Un avis découvert aujourd'hui s'affiche avec l'âge d'une faille détectée il y a six mois, et il est marqué dette héritée alors qu'il s'agit d'une découverte nette.

C'est le résiduel de [C12](#-fermé-vérifié-le-21082026) : la structure est bonne, la clé est fausse sur toutes les vulnérabilités sans CVE — précisément la population que la baseline devait qualifier. Un SLA construit là-dessus s'auto-valide, exactement comme le chronomètre que C12 devait réparer.

**Correctif :** une **fonction unique** de clé d'identité de vulnérabilité, incluant le titre en repli, utilisée par le parsing, la table d'occurrences et l'agrégation. À traiter avant d'accumuler davantage de données SLA fausses — les lignes déjà écrites devront être migrées ou purgées.

### N11. `?force=1` est inopérant
🔴 **Ouvert — vérifié le 21/08/2026.** `src/routes/projects.ts:250` teste toujours `=== "true"` exclusivement. Les tests de route utilisent `?force=true`, la forme que le code accepte : ils ne couvrent donc pas la forme contractuelle `?force=1`.

**⊕3** — `src/routes/projects.ts:178`

```ts
const force = url.searchParams.get("force") === "true";
```

CONTEXT.md §2 et le récapitulatif d'endpoints spécifient `?force=1`. Le frontend s'est aligné sur le code (`src/pages/Projects.tsx:345` : `?force=true`), ce qui masque le défaut en usage interne — mais tout client conforme au contrat (script CI, appel manuel, documentation) voit son forçage **silencieusement ignoré** et reçoit un rapport dédupliqué en croyant avoir réaudité.

**Correctif :** accepter `1` et `true`, et le documenter. Le forçage est le seul recours quand la fenêtre de fraîcheur masque une CVE nouvellement publiée : un forçage qui échoue en silence est plus dangereux qu'un forçage absent.

### N12. La suppression d'un tag laisse des tags fantômes définitifs
🔴 **Ouvert — vérifié le 21/08/2026.** `src/db/tags.ts` ne contient aucune écriture sur `projects` : la cascade fonctionnelle est absente. La route renvoie bien 204. 🧪 Épinglé dans `src/db/tags.test.ts` : après `deleteTag`, `listTags()` est vide mais `getProjectById(p.id).tags` vaut toujours `["legacy"]`.

**⊕1** — `src/db/tags.ts:31-34`, `src/routes/tags.ts:19-24`

```ts
export function deleteTag(id: number): void {
  const db = getDb();
  db.query(`DELETE FROM tags WHERE id = ?`).run(id);
}
```

CONTEXT.md §9 spécifie une **cascade fonctionnelle** : « retire le nom de tous les projets le référençant (lit le nom, supprime la ligne, réécrit chaque projet concerné) ». Rien de tout cela. §1 le redit : « La suppression d'un tag du catalogue le retire automatiquement de tous les projets. »

Conséquence : le nom reste dans le JSON `projects.tags`, continue de s'afficher sur les cartes projet (`src/pages/Projects.tsx:849`), mais disparaît de la liste des filtres — qui vient de `/api/tags` (`:155`). Des projets restent étiquetés d'un tag qui n'existe plus et sur lequel on ne peut plus filtrer. État irrécupérable sans édition manuelle de chaque projet.

**Correctif :** implémenter la cascade dans une transaction (lecture du nom, suppression, réécriture des projets concernés), et renvoyer 204 comme spécifié.

### N13. `/api/history-global` : deux sévérités perdues, pas de `total`, fuseau local, `days` non validé
🔴 **Ouvert — vérifié le 21/08/2026.** L'agrégation ne cumule toujours que quatre sévérités (`src/db/runs.ts:102-110`). 🧪 Épinglé deux fois, dans `src/db/runs.test.ts` et `src/routes/stats.test.ts` : `info`, `unknown` et `total` sont absents de chaque point, et `?days=abc` renvoie `[]` en 200. Le défaut de fuseau et l'absence de borne supérieure sur `days` ne sont **pas** couverts.

**⊕2** — `src/db/runs.ts:238-252`, `src/routes/stats.ts:87`

```ts
let critical = 0, high = 0, moderate = 0, low = 0;
for (const counts of latestCounts.values()) {
  critical += counts.critical || 0;
  high     += counts.high     || 0;
  moderate += counts.moderate || 0;
  low      += counts.low      || 0;
}
```

`info` et `unknown` ne sont jamais agrégés — ils sont **définitivement absents** de la série temporelle. §4 spécifie `{date, counts, total}` avec `total` = somme des **six** sévérités ; il n'y a ni `counts` ni `total`, et `date` est un libellé d'affichage `"JJ/MM"` (la donnée métier n'existe que dans un champ additionnel `rawDate`).

Deux défauts connexes :
- **Fuseau.** Les buckets sont calculés en heure locale (`getFullYear`/`getMonth`) alors que `ran_at` est UTC. En fin de journée dans un fuseau positif, un run est rangé dans le bucket du lendemain.
- **`days` non borné.** `parseInt(searchParams.get("days") || "30", 10)` sans garde. `?days=abc` → `NaN` → la boucle ne s'exécute pas → réponse `[]`, graphique vide **sans erreur**. `?days=100000` → 100 000 buckets × N itérations sur la map d'état, sur un process unique : l'API entière est bloquée. La requête SQL charge de toute façon **tous** les runs de tous les projets actifs, sans filtre de date.

*Conforme en revanche, et vérifié : les runs `error` sont ignorés sans écraser l'état connu (`:217,230`), l'état est porté dans le temps (`:191`), la dernière écriture du jour gagne (`:229-236`), seuls les projets non ignorés sont pris (`:140`).*

**Correctifs :** valider et borner `days` ; ajouter `info`, `unknown` et `total` ; exposer la date ISO ; calculer les buckets en UTC ; restreindre le `SELECT` à la fenêtre demandée plus un état initial.

### N18. Rate-limit ignoré, et perte du `fixedIn` fourni par l'outil
🔴 **Ouvert — vérifié le 21/08/2026.** 🧪 Épinglé dans `src/lib/github/index.test.ts` : « un échec réseau perd le `originalFixedIn` — écart documenté ». Le volet rate-limit est vérifié comme *détecté* (un 403 avec `x-ratelimit-remaining: 0` est bien classé quota dépassé) mais **jamais propagé** pour interrompre la boucle appelante.

**⊕1** — `src/lib/github/index.ts:274-281` et `:308-313`, boucle appelante `src/lib/audit/index.ts:24-49`

La branche « clé non résolvable » (`:244-251`) préserve correctement `params.originalFixedIn`. Les branches « rate-limited » (`:274-281`) et « avis introuvable » (`:308-313`) renvoient `fixedIn: null` **sans le répercuter**. Comme l'appelant écrit `fixedIn: res.fixedIn` (`src/lib/audit/index.ts:47`), la version corrigée que `npm`/`yarn` avaient pourtant fournie est **effacée du run**.

Audit npm de 100 paquets sans token : après ~60 appels, GitHub répond 403 avec `x-ratelimit-remaining: 0`. Les 40 vulnérabilités suivantes sont persistées avec `fixedIn = null` alors que `npm audit` indiquait `fixAvailable.version`. Le référent lit « aucune correction disponible » à tort, et l'écran Tickets propose « Version cible : N/A ».

**Correctifs :** propager `rateLimited` pour interrompre l'enrichissement (§6 : « l'appelant doit s'arrêter »), et faire de `originalFixedIn` la valeur de repli dans **toutes** les branches d'échec. Résolu de fait par [N1](#n1-github-est-appelé-pendant-chaque-audit) si l'enrichissement quitte le chemin d'audit.

### N20. Aucune vérification préalable du chemin d'audit ni du lockfile
🔴 **Ouvert — vérifié le 21/08/2026.** 0 occurrence de `existsSync`, « Chemin introuvable » ou « Lockfile manquant » dans `src/lib/audit/index.ts`. Les tests exercent le run en erreur produit par l'échec du `spawn`, ce qui **confirme** le défaut : le message est « Erreur système: … », pas celui du contrat.

**⊕2** — `src/lib/audit/index.ts:143-175`, `:196-199`

CONTEXT.md §2 « Cas limites » exige deux contrôles **avant** lancement :
- « Chemin introuvable: … » sans exécuter,
- « Lockfile manquant: … (cherché dans `<cwd>`) », le cas bun étant satisfait par `bun.lock` **ou** `bun.lockb`.

Aucun `existsSync` sur le chemin d'audit ; les deux chaînes sont absentes de tout le dépôt. Le code passe directement à `spawn` et reformate l'échec en « Erreur système: … » ou « `<outil>`: aucune sortie (exit N) ». Un dossier renommé produit un run `error` contenant le `ENOENT` brut de l'outil : au référent d'interpréter la sortie.

Défaut connexe : si `project.tool` n'est aucune des quatre valeurs — possible, puisqu'aucune validation n'existe à la création ([N31](#n31-écarts-au-contrat-contextmd--arbitrage-à-trancher)) — `args` reste `[]`, `spawn([])` lève, l'exception est capturée en `systemError`, mais `commandStr` est vide : le run est inexploitable pour le diagnostic.

**Correctifs :** ajouter les deux `existsSync` avec les messages exacts du contrat avant tout `spawn` ; rejeter en amont un `tool` hors énumération.

### N28. Le verrou de non-régression de C3
🟢 **Écrit le 21/08/2026** — `src/lib/audit/index.test.ts`

La vague 1 exigeait nommément deux tests de non-régression. Le second existe désormais ; le premier, non.

| Verrou exigé | État |
|---|---|
| Détection → run en erreur → redétection, `first_seen_at` inchangé (C12) | 🟢 **écrit** — `src/db/occurrences.test.ts`. Le test antidate la ligne stockée à `'2020-01-01 00:00:00'` avant le second appel, pour qu'une réécriture ne puisse pas se cacher derrière deux horodatages de la même seconde. |
| Sévérité hors énumération sur le chemin d'ingestion CI (C3) | 🔴 **absent** — `normSeverity` est couvert au niveau du parseur (`src/lib/parsers/utils.test.ts`, 7 assertions sur `unknown`), mais aucun test ne pousse une sévérité inconnue à travers `POST /api/ingest/:slug` jusqu'aux compteurs persistés. |

C3 est donc **corrigé sans être verrouillé** — exactement l'état dans lequel il se trouvait avant d'être re-cassé par la duplication C5. La leçon de la vague 1 s'applique telle quelle : sur ce périmètre, un correctif non couvert par un test est un correctif temporaire.

**Écrit, et il a appris quelque chose.** Trois tests d'ingestion ont été ajoutés : sévérité `"banana"` comptée en `unknown`, aucun `NaN` dans `counts` quelle que soit la charge, et le cas de [N10](#n10-trois-clés-didentité-différentes-pour-la-même-vulnérabilité) de bout en bout.

> ⚠️ **La garde qu'ils devaient verrouiller est inatteignable.** Vérification faite en retirant le `if (sev in counts)` de `enhanceVulnerabilities` : **aucun test n'a rougi**. La normalisation a lieu en amont, à chaque point d'entrée — les quatre parseurs appellent `normSeverity`, et `getCachedAdvisory` le fait aussi à la relecture du cache. Aucune sévérité non normalisée ne peut donc atteindre le comptage ; la garde est une ceinture par-dessus des bretelles.
>
> Les tests portent donc sur l'**invariant** que la garde protégeait — compteurs finis, somme égale au total — et non sur la garde elle-même. C'est plus solide : un test de la garde resterait vert si le défaut entrait par une autre porte, alors que l'invariant se casse quelle que soit la porte. C'est aussi la leçon générale de cet exercice : un verrou qu'on n'a pas vu échouer ne verrouille rien de démontré.

### C4. `/api/config/import` ne restaure que trois sections sur cinq
🟡 **Inchangé — vérifié le 21/08/2026.** Toujours trois sections (`settings`, `projects`, `annotations`), aucune transaction, aucun compteur en réponse. Les tests couvrent le comportement actuel — dont le fait qu'un import est rejouable par `slug` — sans affirmer la conformité à §12.

🟡 *Partiellement traité — entrée conservée depuis la vague 1* — `src/routes/settings.ts:33-84`

Progrès réel : `projects` et `annotations` sont désormais importés (`:47-77`), là où seul `body.settings` était traité. Trois écarts subsistent :

1. **Fusion par `slug`** (`:53`) au lieu de la cible d'audit résolue exigée par §12.2. `slug` est un identifiant dérivé du nom, absent de CONTEXT.md : deux instances au même chemin mais nom différent produisent des doublons, et le transport n'est pas portable.
2. **`tags`, `prompts` et `tickets` toujours ignorés** — trois des cinq étapes de §12 manquent. Un export/import perd le catalogue de tags, toute la bibliothèque de prompts et tous les liens de tickets.
3. **Aucun compteur en réponse** : `{success, message}` au lieu de `{tagsAdded, projectsAdded, annotationsAdded, promptsAdded, ticketsAdded}`. L'utilisateur ne sait pas ce qui a réellement été importé — ce qui compte double étant donné [N7](#n7-les-annotations-globales-sont-impossibles-et-limport-de-config-meurt-à-mi-parcours), où l'import peut mourir à mi-parcours en annonçant un succès partiel invisible.

Côté export, `/api/config/export` inclut les `settings` (interdits par §12), omet `tags`/`prompts`/`tickets`, exporte les `id`/`slug`/`created_at` bruts et ne pose aucun en-tête `Content-Disposition`.

**Correctif :** implémenter les cinq étapes de §12 dans l'ordre, relink par `path`, dédup par cible résolue, dans la transaction unique de [N7](#n7-les-annotations-globales-sont-impossibles-et-limport-de-config-meurt-à-mi-parcours).

---

## 🟡 Priorité 3 — Robustesse & performance

### N8. « Tout auditer » : séquentiel, périmètre faux, non annulable, et verrou serveur contradictoire
🔴 **Ouvert — vérifié le 21/08/2026.** `for (const p of projectsToAudit) { await … }` toujours en place (`src/App.tsx:124`), verrou toujours global, 0 `AbortController` dans le frontend. 🧪 Le volet serveur est épinglé dans `src/lib/audit/queue.test.ts` et `src/routes/audit.test.ts` : le verrou est global et non par projet, et le refus sort en **429** sur `/api/audit/run` mais en **500** sur `/api/projects/:id/audit`.

**⊕4** *(le défaut le plus largement relevé)* — `src/App.tsx:115-187`, `src/lib/audit/queue.ts:43-47`

CONTEXT.md §2 : « Orchestré **côté client** (aucun endpoint batch). […] **Parallèle borné** à une concurrence max de **4** », sur les projets **visibles** (filtres tags appliqués), résultats « triés erreurs d'abord puis projets avec le plus de nouvelles CVE ». Cinq écarts cumulés :

1. **Séquentiel** — `for (const p of projectsToAudit) { await fetch(…) }` (`:136`). Sur 15 projets à ~8 s, deux minutes au lieu de trente secondes.
2. **Périmètre faux** — `allProjects.filter(p => !p.ignored)` (`:121`). Le `filterTag` de la page Projets (`src/pages/Projects.tsx:47`) vit dans un composant enfant auquel `App` n'a pas accès : filtrer sur « Prod » pour n'auditer que 3 projets en audite quand même 15.
3. **Ni annulation ni timeout** — 0 `AbortController` dans tout le frontend. Un `npm audit` qui pend bloque l'application indéfiniment ; le seul recours est de recharger la page.
4. **UI gelée, console incluse** — `loading || auditing` applique `opacity-50 pointer-events-none blur-sm` sur le conteneur qui englobe `<Routes>` (`:213`). Or `<Console />` est rendue **dans** `MainLayout` (`src/components/templates/MainLayout.tsx:39`), donc dans ce conteneur : pendant plusieurs minutes, la console live SSE — seul endroit où l'on voit `npm audit` tourner et échouer — est floutée et non cliquable. Le `GlobalLoader` par-dessus affiche des messages tirés d'un tableau tournant toutes les 800 ms (« Recherche GHSA », « Calcul de la criticité ») qui **ne correspondent à aucune étape réelle** : §2 précise qu'aucun appel GitHub n'a lieu pendant l'audit — et [N1](#n1-github-est-appelé-pendant-chaque-audit) montre qu'il en a lieu, mais pas ceux-là.
5. **Contradiction serveur** — la concurrence 4 est de toute façon impossible : `runSingleAudit` pose un verrou **global** et rejette tout audit concurrent (`throw new Error("Un audit est déjà en cours, veuillez patienter.")`), converti en **500** par la route (`src/routes/projects.ts:189-197`). Un client conforme à §2 verrait 3 audits sur 4 échouer systématiquement. C'est le résiduel de [C8](#-fermé-vérifié-le-21082026) : le verrou a été ajouté pour un endpoint batch que la spec interdit, et il bloque le mode d'orchestration qu'elle prescrit.

**Correctifs :**
1. Remplacer le verrou global par un verrou **par projet** (map `projectId → promesse`), et renvoyer 409 avec un message explicite au lieu de 500.
2. Extraire l'orchestration dans un hook partagé avec un pool de 4, alimenté par le périmètre filtré remonté (contexte, ou état porté par l'URL — cf. [N24](#n24-filtres-et-pagination-hors-de-lurl)).
3. Exposer un `AbortController`.
4. Remplacer le blocage plein écran par une barre de progression non modale (N/M + nom du projet) laissant la console et la navigation accessibles, et refléter les commandes réellement lancées.
5. Faire du compte-rendu final un vrai triage post-audit : erreurs d'abord, puis nouvelles CVE (`newCves` est calculé par le serveur et aujourd'hui jamais lu), avec lien direct vers le triage.

### N16. Le `React.memo` de `ProjectCard` est neutralisé par construction
🟡 **Amélioré, non résolu — vérifié le 21/08/2026.** `src/pages/Projects.tsx` compte désormais 3 `useCallback` (contre 0). Les autres handlers et le passage de la **map complète** `auditState` restent inchangés : la comparaison superficielle échoue toujours.

**⊕1** — `src/pages/Projects.tsx:783-801`, `src/components/organisms/ProjectCard.tsx:42`

Le composant est bien mémoïsé, mais reçoit 13 props qui changent d'identité à chaque rendu :
- `onViewTriage={() => navigate(...)}` — fonction **inline** recréée à chaque rendu ;
- 11 handlers déclarés en `const` simples dans le corps du composant parent (`copyToClipboard`, `formatDate`, `handleEdit`, `handleDelete`, `toggleIgnore`, `handleDetectGit`, `handleFetch`, `handlePull`, `handleForceAudit`…) — **aucun `useCallback` dans tout le fichier** ;
- `auditState={auditState}` — la **map complète** des messages d'audit, remplacée par un objet neuf à chaque événement SSE (`:82-100`), alors que chaque carte n'a besoin que de `auditState[p.id]`.

La comparaison superficielle de `memo` échoue donc toujours. 30 projets affichés pendant un audit global : chaque projet émet ~10 commandes (6 pour `gitInfo` + l'outil), chacune produisant un `start` et un `end` → plusieurs centaines de `setAuditState` → plusieurs **milliers** de rendus de cartes, alors qu'une seule carte change d'état à la fois.

**Correctif :** `useCallback` sur les handlers, et passer à chaque carte la chaîne `auditState[p.id]` plutôt que la map entière.

### N17. Double flux SSE, et console perdue au passage sur `/debug`
🔴 **Ouvert — vérifié le 21/08/2026.** Deux `new EventSource` distincts subsistent (`Console.tsx`, `Projects.tsx`). 🧪 Effet de bord documenté : le faux `EventSource` des tests doit gérer **les deux API** (`onmessage` pour `Console`, `addEventListener` pour `Projects`) — la duplication est visible jusque dans le harnais.

**⊕1** — `src/components/organisms/Console.tsx:26`, `src/pages/Projects.tsx:67`, `src/App.tsx:224-226`

Deux `EventSource("/api/console")` distincts sont ouverts simultanément : celui de `Console` (montée en permanence via `MainLayout`) et celui de la page Projets. Le serveur diffuse à tous les clients (`src/lib/console.ts:66-78`) : chaque commande est sérialisée et poussée **deux fois** pour un seul onglet.

Par ailleurs `/debug` utilise `BlankLayout` : y naviguer **démonte `MainLayout`**, donc `Console`, ce qui ferme le flux et détruit les `logs`. Or §11 précise « aucune persistance ni rejeu » — un client ne voit que ce qui est émis après sa connexion. Faire Ctrl+Shift+D pendant un audit puis revenir vide donc la trace **définitivement**.

Détail annexe : les tests `event.data === ": ping"` / `": connected"` (`Console.tsx:35`) sont du code mort — le serveur les envoie en **commentaires SSE** (`src/lib/console.ts:83,96`), qui ne déclenchent jamais d'événement `message`.

**Correctif :** une seule source de vérité pour le flux, montée **au-dessus** des layouts pour survivre à la navigation, les consommateurs lisant les logs depuis ce contexte.

### N19. L'état serveur n'est jamais invalidé après une mutation
🔴 **Ouvert — vérifié le 21/08/2026.** 0 `createContext`/`useContext` dans `src/App.tsx`.

**⊕2** — `src/App.tsx:80-102` et `:180`, `src/components/organisms/Header.tsx:71-75`, `src/pages/Triage.tsx:202-207`

`stats` (donc `pendingCves`, `criticalVulnerabilities`, `healthGrade`, `topProjects`) est de l'état serveur stocké localement dans `App`, rafraîchi **uniquement** au montage et à la fin de l'audit global. Aucune mutation d'une page enfant ne peut le réconcilier.

- Le référent traite 25 CVE sur 40 : le badge rouge du header affiche toujours **40**. La Vue d'ensemble affiche une note de santé et un « Top projets à risque » périmés jusqu'au rechargement complet du navigateur.
- Symétriquement, la page Projets détient sa propre copie (`src/pages/Projects.tsx:43`) et n'est jamais notifiée : lancer l'audit global depuis le header alors qu'on est sur `/projets` laisse les cartes afficher les `lastRun.counts` d'avant, les pastilles « Sain »/« Critique » et les dates périmées — **sans aucun signal d'obsolescence**.

**Correctif :** exposer une fonction d'invalidation (contexte, ou clé de cache partagée) appelée après toute mutation d'annotation, de projet ou de run.

### N21. N+1 systématiques et double désérialisation des blobs
🟡 **Partiellement corrigé — vérifié le 21/08/2026.** Un index a été ajouté : `idx_runs_project_ran_at ON runs(project_id, ran_at DESC)`. Les index `annotations(project_id)` et `tickets(content_hash)` manquent toujours, `/api/stats` appelle encore `getLatestRun` en plus de `buildCveGroups` (2 occurrences), et `broadcast()` lit toujours `DISABLE_CONSOLE` en base à chaque événement.

**⊕1** — `src/lib/aggregator/index.ts:57,60` · `src/routes/stats.ts:9,31` · `src/lib/audit/index.ts:361-362` · index dans `src/db/index.ts:103-126` · `src/lib/console.ts:67`

- `buildCveGroups()` fait un `getLatestRun()` — donc un `SELECT *` ramenant le blob `vulnerabilities` complet — **et** un `getAnnotationsForProject()` par projet.
- `/api/stats` appelle `buildCveGroups()` **puis refait** un `getLatestRun()` par projet (`:31`) : les mêmes blobs sont lus et désérialisés deux fois par requête, alors que `getLatestRunsByProjectIds` existe déjà (`src/db/runs.ts:110`).
- `ingestAudit` appelle aussi `buildCveGroups()` à chaque ingestion CI.
- **Index manquants** : `annotations` n'a que `UNIQUE(cve, project_id)`, inutilisable pour `WHERE project_id = ? OR project_id = -1` → balayage complet par projet. `tickets.content_hash` est interrogé par égalité (`src/db/tickets.ts:44`) sans index.
- `broadcast()` exécute une requête SQLite `getSetting("DISABLE_CONSOLE")` pour **chaque** événement console, soit 2 requêtes par commande git ou audit.

40 projets × ~150 vulnérabilités : un chargement de dashboard (`/api/stats` + `/api/cves`) fait ~160 requêtes, désérialise ~12 000 objets **deux fois** et balaye 160 fois la table `annotations`, sur un process unique.

**Correctifs :** charger les derniers runs et toutes les annotations en une requête chacun ; mémoriser `buildCveGroups()` avec invalidation à l'écriture d'un run ou d'une annotation ; ajouter les index `annotations(project_id)` et `tickets(content_hash)` ; mettre `DISABLE_CONSOLE` en cache mémoire.

### N22. Race condition sur le graphique d'historique
🔴 **Ouvert — vérifié le 21/08/2026.** Aucun `cancelled`, `AbortController` ni nettoyage d'effet dans `HistoryChart.tsx`.

**⊕1** — `src/components/organisms/HistoryChart.tsx:50-62`

Effet dépendant de `days`, `fetch(...).then(d => { setData(d); setLoading(false) })`, sans `AbortController`, sans flag `cancelled`, sans nettoyage dans le `return`.

Passer la période de 7 → 90 → 1 jour rapidement : la requête « 90 jours » (la plus lourde côté SQL) répond **après** celle de « 1 jour » et écrase les données. Le graphe affiche 90 jours de données sous le libellé « derniers 1 jours » — le texte venant de `days`, pas des données. État incohérent durable, sans erreur.

**Correctif :** flag `cancelled` ou `AbortController` dans le cleanup, en ignorant toute réponse dont la clé ne correspond plus à l'état courant.

### N26. `setInterval` jamais nettoyé, état de module perdu sous `bun --hot`
🔴 **Ouvert — vérifié le 21/08/2026.** 0 `clearInterval` dans `src/lib/console.ts`. Conséquence mesurée sur les tests : l'intervalle de keepalive survit à la fin du fichier de test.

**⊕1** — `src/lib/console.ts:93-101`, `src/lib/audit/queue.ts:3-6`

Le `setInterval` de keepalive est créé au premier import et jamais annulé — aucun `clearInterval` dans `src/`. Le script de développement étant `bun --hot src/index.ts`, chaque rechargement à chaud ajoute un intervalle aux précédents et réinitialise le `Set clients`, tandis que les contrôleurs SSE précédents restent référencés par les anciens intervalles. Dix sauvegardes de fichier = onze boucles de ping actives.

Le même mécanisme réinitialise `isProcessing`/`completedInBatch` alors qu'un batch lancé en fire-and-forget (`queue.ts:26-40`) continue de tourner sur l'ancienne copie du module : `GET /api/audit/status` renvoie `isRunning:false` pendant qu'un batch est en cours, et un second `POST /api/audit/run` démarre un batch concurrent sur les mêmes projets — deux runs par projet, écritures non sérialisées.

**Correctif :** enregistrer l'intervalle dans un singleton idempotent, l'annuler quand le `Set` de clients est vide, et externaliser l'état de la file hors du module rechargeable.

### N29. Deux définitions du « dernier run » coexistent
🔴 **Ouvert — vérifié le 21/08/2026.** `MAX(id)` toujours présent dans la variante batch, et `IN (${ids})` toujours construit par concaténation (2 occurrences). 🧪 Les deux définitions sont épinglées séparément dans `src/db/runs.test.ts` : `getLatestRun` par `ran_at` puis `id`, `getLatestRunsByProjectIds` par projet — le test ne les met pas en contradiction, il fixe chacune.

**⊕1** — `src/db/runs.ts:96-108` vs `:110-123`

`getLatestRun` respecte §4 : `ORDER BY ran_at DESC, id DESC`. La variante batch employée par `GET /api/projects` retient `MAX(id)`. Les deux coïncident tant que les `id` sont monotones avec le temps — mais divergent après une restauration de snapshot ou un import de runs hors ordre chronologique, produisant une incohérence entre le run affiché sur la carte projet et celui utilisé par l'agrégation CVE et la déduplication d'audit.

Défaut connexe dans la même fonction : `IN (${ids})` est construit par concaténation de chaîne (`:113`). Les valeurs viennent aujourd'hui exclusivement d'un `SELECT id FROM projects`, donc non exploitable en l'état — mais un futur appelant passant un `parseInt` non gardé provoquerait un 500 (`IN (NaN)` → `no such column: NaN`).

**Correctif :** aligner la variante batch sur `ran_at DESC, id DESC`, et passer les identifiants en bindings.

### N30. Le contexte projet n'enveloppe pas les commandes git du listing
🔴 **Ouvert — vérifié le 21/08/2026.** 0 occurrence de `projectContext` dans le handler `GET /api/projects`.

**⊕1** — `src/routes/projects.ts:74-91` et `:122`

CONTEXT.md §11 : « Aux points d'entrée liés à un projet, l'exécution est **enveloppée** dans ce contexte (audit d'un projet, **calcul git par projet lors du listing**, fetch, pull). » `git-fetch` (`:150`), `git-pull` (`:166`) et l'audit (`:189`) le font ; le listing et `GET /api/projects/:id` ne le font pas.

À chaque rafraîchissement de la liste, jusqu'à 6 commandes git **par projet** défilent dans la console sans champ `project` — le flux devient illisible, exactement le cas que le contexte asynchrone doit couvrir.

**Correctif :** envelopper `getGitInfo` dans `projectContext.run({ project: p.name }, …)` dans les deux handlers.

### N34. `parseCvssVector` écarte toujours le premier segment
🔴 **Ouvert — relevé par la suite de tests** — `src/lib/cvss.ts`

```ts
const parts = vector.split("/");
const metrics = parts.slice(1);   // suppose le préfixe « CVSS:3.1 »
```

Le `slice(1)` suppose que le premier segment est toujours le préfixe de version. Un vecteur transmis sans préfixe — ce que produisent certaines sources d'avis, et ce que peut saisir un humain — perd donc sa **première métrique**, silencieusement : `AV:N/AC:L` ne remonte que `AC:L`, et l'infobulle affiche un vecteur amputé sans signaler quoi que ce soit.

🧪 Épinglé dans `src/lib/cvss.test.ts` : « le premier segment est toujours écarté — écart documenté ».

**Correctif :** n'écarter le premier segment que s'il correspond à `/^CVSS:\d/`.

### N35. 500 au lieu de 400 sur les routes qui lisent `req.json()` directement
🔴 **Ouvert — relevé par la suite de tests** — `src/routes/reports.ts`, `src/routes/cves.ts` (`/api/advisories/sync`), `src/routes/settings.ts` (`/api/config/import`), `src/routes/tickets.ts`

Trois routes n'utilisent pas `parseBody` et appellent `await req.json()` à nu. Sur un corps malformé, l'exception remonte au gestionnaire d'erreur global de `Bun.serve`, qui répond **500 « Internal Server Error »** — là où toutes les routes validées répondent 400 `{ error: "JSON invalide" }`.

Le contrat d'erreur de l'API n'est donc pas uniforme, et un client ne peut pas distinguer « ma requête est mal formée » de « le serveur est en panne ». Aggravant : `reportBodySchema` **existe déjà** dans `src/lib/schemas.ts` et n'est branché nulle part, si bien qu'un corps incomplet casse au moment du `JSON.stringify` en base.

🧪 Épinglé dans `src/routes/reports.test.ts`, `src/routes/cves.test.ts` et `src/routes/settings.test.ts`.

**Correctif :** brancher `parseBody` sur ces routes, en commençant par `reportBodySchema`, déjà écrit.

### N36. Une méthode non déclarée renvoie du HTML en 200
🔴 **Ouvert — relevé par la suite de tests** — `src/index.ts` (fourre-tout `"/*"`)

Un chemin `/api/…` inconnu, ou une route déclarée atteinte avec une méthode qu'elle n'expose pas (`GET /api/annotations`, qui n'existe qu'en `POST`), ne reçoit ni 404 ni 405 : la requête tombe dans le fourre-tout `"/*"` et récupère `index.html`. Le client obtient **200 avec du `text/html`**, échoue à son `res.json()` sur une `SyntaxError` — « Unexpected token < » — et n'a aucun indice sur la cause réelle.

🧪 Épinglé dans `src/index.test.ts`, sous deux angles : chemin inconnu et méthode non déclarée.

**Correctif :** placer avant le fourre-tout une route `"/api/*"` répondant 404 en JSON, afin que le fallback SPA ne capte que la navigation client.

### N37. `DELETE` sur un identifiant inconnu répond succès
🔴 **Ouvert — relevé par la suite de tests** — `src/routes/projects.ts`, `src/routes/tags.ts`, `src/routes/prompts.ts`, `src/routes/reports.ts`

Aucune des quatre routes de suppression ne vérifie l'existence de la ligne : `DELETE FROM … WHERE id = ?` est idempotent côté SQL, et le handler répond `{success:true}` ou 204 dans tous les cas. L'interface ne peut donc pas distinguer « supprimé » de « n'existait pas », ce qui masque une désynchronisation entre la liste affichée et l'état réel — précisément le symptôme de [N19](#n19-létat-serveur-nest-jamais-invalidé-après-une-mutation).

🧪 Épinglé dans les quatre fichiers de test de routes correspondants.

**Correctif :** renvoyer 404 quand aucune ligne n'est affectée (`changes === 0`).

### N38. `getReports` trie par `created_at` seul
🔴 **Ouvert — relevé par la suite de tests** — `src/db/reports.ts`

`ORDER BY created_at DESC` sans départage par `id`, sur un horodatage à la seconde. Deux « Tout auditer » lancés dans la même seconde remontent dans un ordre **indéfini** — et c'est l'ordre qui détermine quel compte-rendu l'écran Rapports compare au précédent. Le même défaut a déjà été traité sur les runs (`getLatestRun` départage par `ran_at DESC, id DESC`).

🧪 Épinglé dans `src/db/reports.test.ts` : « à `created_at` égal, l'ordre n'est pas garanti — écart documenté ».

**Correctif :** `ORDER BY created_at DESC, id DESC`.

### N39. La progression du lot d'audit n'est pas observable après coup
🔴 **Ouvert — relevé par la suite de tests** — `src/lib/audit/queue.ts`

À la fin du lot, `enqueueGlobalAudit` remet `completedInBatch` et `totalInBatch` à zéro. Un client qui sonde `/api/audit/status` après le dernier projet ne lit donc jamais « 2 / 2 » : il lit `progress: 0, total: 1`, indistinguable d'un état au repos. Impossible de savoir, depuis l'API, si un lot vient de se terminer ou n'a jamais eu lieu.

🧪 Épinglé dans `src/lib/audit/queue.test.ts` : « la progression n'est pas observable après coup — écart documenté ».

**Correctif :** conserver le dernier état terminé (`lastCompleted`, `lastTotal`, `finishedAt`) plutôt que de le remettre à zéro — à traiter avec [N8](#n8--tout-auditer---séquentiel-périmètre-faux-non-annulable-et-verrou-serveur-contradictoire), dont le compte-rendu final a le même besoin.

### N41. `content_hash` n'est pas unique en base
🔴 **Ouvert — relevé par la suite de tests** — `src/db/index.ts` (table `tickets`), `src/db/tickets.ts`

`content_hash` est le garde-fou anti-doublon de la création de tickets Jira : `POST /api/tickets/create` hache la charge et refuse en 409 si `getTicketByHash` trouve une correspondance. Mais la colonne ne porte **aucune contrainte `UNIQUE`**, et `getTicketByHash` fait un `SELECT … LIMIT`-implicite : deux projets peuvent stocker le même hash, et la fonction en renvoie un **arbitrairement**. Le message d'erreur cite alors la référence d'un ticket appartenant potentiellement à un autre projet.

Défaut connexe déjà noté en [N21](#n21-n1-systématiques-et-double-désérialisation-des-blobs) : la colonne n'a pas d'index non plus, alors qu'elle est interrogée par égalité.

🧪 Épinglé dans `src/db/tickets.test.ts` : « le hash n'est pas unique en base — écart documenté ».

**Correctif :** inclure `project_id` dans le hash — deux projets ne devant jamais produire la même empreinte — et ajouter un index sur la colonne.

### N42. `commit_sha` peut valoir la chaîne `"HEAD"`
🔴 **Ouvert — relevé par la suite de tests** — `src/lib/git/index.ts` (`getGitInfo`)

Sur une branche non née — dépôt fraîchement `git init`, sans commit — `git rev-parse HEAD` écrit « fatal: ambiguous argument 'HEAD' » sur **stderr** mais renvoie la chaîne littérale `HEAD` sur **stdout**. Le filtre ne cherche `fatal:` que dans stdout :

```ts
const sha = await runGit(["rev-parse", "HEAD"], cwd, true);
if (sha && !sha.includes("fatal:")) info.sha = sha;   // ← accepte « HEAD »
```

`commit_sha` peut donc être persisté à `"HEAD"`, valeur qui **satisfait la condition de déduplication** `lastRun.commit_sha === gitInfo.sha` : deux audits successifs sur un dépôt sans commit se dédupliquent l'un contre l'autre. Même cause pour `info.branch`.

🧪 Épinglé dans `src/lib/git/index.test.ts` : « un dépôt sans commit expose « HEAD » comme SHA — écart documenté ».

**Correctif :** tester le code de sortie de `git rev-parse` plutôt que d'inspecter stdout, ou valider la forme `/^[0-9a-f]{40}$/`.

### N43. Le repli « Déjà à jour. » de `gitFetch` est inatteignable
🔴 **Ouvert — relevé par la suite de tests** — `src/lib/git/index.ts` (`gitFetch`)

Le repli existe pour éviter d'afficher un journal vide, qui se lit comme un échec. Mais la commande est lancée avec `--verbose`, ce qui fait écrire à git `= [up to date]  main -> origin/main` même quand rien ne change : `log.trim() === ""` n'est donc jamais vrai dès qu'un amont existe. Le seul cas où le repli s'applique est un dépôt **sans remote configuré** — où il affiche « Déjà à jour. » alors que rien n'a été tenté, ce qui est le message le plus trompeur possible.

🧪 Épinglé dans `src/lib/git/index.test.ts`, sous les deux angles.

**Correctif :** distinguer les trois cas — pas de remote (message explicite), à jour, mis à jour — depuis le code de sortie et la sortie de git, plutôt que depuis la vacuité du journal.

### C9. `initDb` ignore son paramètre
🔴 **Ouvert — vérifié le 21/08/2026.** 5 occurrences de `db?.query` subsistent dans `initDb`. À faire avant [N2](#n2-la-restauration-de-snapshot-ne-restaure-rien) : la restauration est précisément le cas où l'instance diffère.

🔴 *Non traité — entrée conservée depuis la vague 1* — `src/db/index.ts:181, 188, 195, 198, 201`

La fonction reçoit `database: Database` (`:41`) et l'utilise correctement jusqu'à la ligne 87, puis retombe sur la variable globale `db!` pour les **cinq** migrations tardives (`ALTER TABLE reports`, `advisory_cache` × 3, `tickets`). Le code fonctionne parce que les deux références coïncident, mais casse dès que `initDb` est appelée sur une autre instance : tests, restauration de snapshot.

**Correctif :** utiliser `database` partout dans la fonction. Correctif d'une ligne × 5, à faire avant [N2](#n2-la-restauration-de-snapshot-ne-restaure-rien) — la restauration est précisément le cas où l'instance diffère.

---

## 🔵 Priorité 4 — UX & accessibilité

### N9. Le triage est impraticable au-delà de quelques CVE
🟡 **Une moitié confirmée, l'autre non reproductible — vérifié le 21/08/2026.**

- **La modale se ferme après chaque décision : confirmé.** `selectedGroup` reste un instantané figé, aucun `useOptimistic`. 🧪 Épinglé, avec un test retourné prêt à activer.
- **La pagination retombe page 1 : non reproductible.** Le refetch a bien lieu (deux `GET /api/cves` enregistrés) et l'effet a bien `cves` en dépendance, mais l'affichage **reste** sur la seconde page. Mesure : `"Affichage de 11 à 15 sur 15 packages"` après annotation depuis la page 2.

> Le test qui « prouvait » cette seconde moitié était faux : `toContain("Affichage de 1")` passe sur `"Affichage de 11 à 15"`, dont il est un préfixe. Il ne pouvait donc pas distinguer les deux pages et validait le défaut à tort. Corrigé en assertion exacte le 21/08/2026, il montre l'inverse de ce qui était annoncé. Reste à déterminer si l'effet ne se déclenche pas, ou si le harnais de test masque un comportement réel — d'ici là, ne pas compter cette moitié comme un défaut établi.

**⊕3** — `src/components/organisms/CveCard.tsx:233-258`, `src/components/organisms/CveDetailsModal.tsx:80`, `src/pages/Triage.tsx:178-180`

La page annonce un workflow « Zero-Inbox » (`Triage.tsx:298-304`). Deux mécanismes le rendent inutilisable :

1. **La modale se ferme après chaque décision.** Chaque bouton de statut appelle `updateStatus(...)` **puis** `onActionComplete()`, câblé sur `setSelectedGroup(null)`. La cause profonde : `selectedGroup` (`Triage.tsx:39`) est un **instantané figé** issu du `useMemo` `packageGroups` — après `fetchCves()` le memo est recalculé, mais l'objet retenu reste l'ancien, avec l'ancien `status`. Fermer la modale masque cette désynchronisation au lieu de la corriger.
2. **La pagination retombe page 1.** `useEffect(() => setPage(1), [cves, projectId, cveFilter, hideProcessed])`, et `cves` est un tableau **neuf** à chaque refetch, donc après **toute** annotation.

Un package `lodash` à 8 CVE = 8 cycles ouvrir/statuer/rouvrir, 8 reconstructions complètes de l'agrégat serveur, et si le référent travaillait page 4, retour au début de la liste après *chaque* décision. Le chemin « Confirmé » coûte encore plus : clic → fermeture → ouverture de `ConfirmReasonModal` → saisie → validation, soit 4 interactions et deux changements de contexte pour une seule CVE.

**Correctifs :**
1. Conserver la **clé** du groupe plutôt que l'objet, et dériver le groupe affiché depuis `packageGroups` — la modale reste alors ouverte et à jour.
2. Appliquer la décision en `useOptimistic` avant le refetch (0 usage de `useOptimistic`/`useTransition` dans le code aujourd'hui).
3. Ne réinitialiser la page que sur changement réel des critères de filtrage — retirer `cves` des dépendances — et borner `page` à `totalPages` si la liste rétrécit.

### N14. Sévérité illisible : palette sans couleur de texte, et préfixes `dark:` amputés
🔴 **Ouvert — vérifié le 21/08/2026.** Les classes amputées sont **toujours présentes** : `ui/button.tsx:16` (`"…hover:text-accent-foreground   :bg-input/50"`), `ui/button.tsx:19`, `TriageTable.tsx:76` (`"bg-red-500/5  :bg-red-950/40"`). `styles/globals.css` ne déclare toujours **aucun** token sombre. 🧪 Un test de `ActionBadge` documente un symptôme voisin : happy-dom perd l'attribut `style` quand un `var()` est imbriqué, ce qui a rendu la couleur non assertable — la vérification se fait donc sur la présence de l'élément, pas sur sa teinte.

**⊕1** — `src/lib/triage-constants.tsx:10-26`, `src/components/organisms/TriageTable.tsx:66,89`, `src/components/ui/button.tsx:8,14,16,20`, `app_build/styles/globals.css`

**(a) L'information de gravité n'est portée par rien de lisible.** `SEVERITY_COLORS` ne contient qu'un fond translucide (`"bg-red-500/10  "`, `"bg-orange-500/10  "` — noter les doubles espaces résiduels) : **aucune couleur de texte, aucune bordure**. `SEVERITY_ICONS` (`:19-26`) n'a aucune classe de couleur : les six icônes sont monochromes. Le badge de sévérité s'affiche donc en couleur de texte par défaut sur un fond à 10 % d'opacité, sur carte blanche : `critical` et `moderate` ne se distinguent que par une nuance très pâle. Information portée uniquement par la couleur (WCAG 1.4.1), sur une teinte qui frôle le seuil non-textuel (WCAG 1.4.11). Or repérer les criticals d'un coup d'œil est la fonction première de cet écran.

**(b) Des préfixes `dark:` ont été amputés et les classes sont restées invalides.** Vérifié :

```
TriageTable.tsx:66   "bg-red-500/5  :bg-red-950/40"
ui/button.tsx:8      "aria-invalid:ring-destructive/20 :ring-destructive/40 …"
ui/button.tsx:14     "… focus-visible:ring-destructive/20 :ring-destructive/40 "
ui/button.tsx:16     "… hover:text-accent-foreground   :bg-input/50"
ui/button.tsx:20     "hover:bg-accent hover:text-accent-foreground :bg-accent/50"
```

Le défaut est **dans l'atome Shadcn de base**, donc propagé à tous les boutons de l'application. Même symptôme ailleurs : `Header.tsx:87` (`(var(--primary),0.2)]`), `Overview.tsx:30,43,64,85` (`inset-0 /5`), `Reports.tsx:184` (`(255,255,255,0.1)]`).

**(c) Le thème sombre est à moitié câblé.** `styles/globals.css` (84 lignes) ne déclare **aucun** jeu de tokens sombre — ni `.dark`, ni `prefers-color-scheme` — alors que `src/index.css:7,96,100` utilise des utilitaires `dark:`. Les utilitaires basculent, les variables CSS (`--card`, `--background`) non. Le README annonce pourtant « support Light / Dark mode natif ». Plusieurs composants gardent des couleurs calibrées pour le sombre sur fond blanc : `text-blue-400` pour le lien Jira (`TriageTable.tsx:182`), `text-red-400` pour le retard git (`ProjectCard.tsx:232`), `bg-white/5` (`CveCard.tsx:84`, invisible sur carte blanche).

**Correctifs :**
1. Redéfinir `SEVERITY_COLORS` avec fond + texte + bordure sur des tokens sémantiques validés en contraste, et colorer les icônes — ou doubler la couleur par une forme ou un libellé.
2. Passer en revue les classes amputées avant de trancher sur l'existence d'un thème sombre : `ConsoleLogItem.tsx` est le seul fichier à gérer correctement les deux thèmes (`text-red-800 dark:text-red-200`), c'est la référence à généraliser.
3. Décider explicitement : soit déclarer les tokens sombres, soit assumer le light-only et purger les utilitaires `dark:` ainsi que les couleurs calibrées pour le sombre.

### N15. Aucune navigation clavier
🟡 **Partiellement amélioré — mesure refaite le 21/08/2026 : 2 `tabIndex`, 2 `role=`, 6 `aria-label`** hors `components/ui/` (contre 0, 0 et 2). Ces ajouts viennent des correctifs d'accessibilité imposés par Biome, pas d'une reprise d'ensemble. **`aria-live` reste à 0** : aucun toast n'est annoncé.

**⊕1** — `src/components/organisms/TriageTable.tsx:65-68`, `src/components/organisms/ProjectCard.tsx:69-78,120-126`, `src/pages/Overview.tsx:122-125,163-166`, `src/pages/Projects.tsx:828-831`, `src/components/organisms/CveCard.tsx:213-224`

Recherche sur `src/pages` et `src/components` hors `components/ui/` : **0 occurrence de `tabIndex`**, **0 de `role=`**, **2 `aria-label`** dans tout le code applicatif.

- Ouvrir une CVE passe par `<TableRow onClick={() => setSelectedGroup(group)}>` — un `<tr>` sans `tabIndex` ni `role="button"` : **inatteignable au clavier**. Idem les lignes de la vue liste Projets et les cartes « Top Projets à Risque » / « Vulnérabilités les plus fréquentes » de l'accueil (`<div onClick>`).
- Toute la barre d'actions d'une carte projet (Ignorer, Forcer un audit, Modifier, Supprimer) est en `opacity-0 group-hover:opacity-100` **sans `focus-within`** : au clavier, les boutons prennent le focus **en restant invisibles** ; au tactile, ils sont inaccessibles.
- Le menu « … » de la carte projet ne s'ouvre que via `group-hover/menu:visible`, son `<button>` déclencheur ne faisant que `e.stopPropagation()` : copier l'URL d'ingestion CI est impossible au clavier et sur tablette.
- `CveCard.tsx:220` : bouton d'édition de note en `opacity-0 … group-hover:opacity-100` alors que le conteneur de ligne (`:41`) **n'a pas la classe `group`** — ce bouton est actuellement invisible en permanence.
- Aucun tableau n'a de `<caption>` ni de `scope` sur les `<th>` — l'atome `TableCaption` existe (`ui/table.tsx:248`) et n'est utilisé nulle part. Les toasts (`Triage.tsx:363-389`) n'ont ni `role="status"` ni `aria-live` : une confirmation de mise à jour n'est jamais annoncée.

**Correctifs :** rendre lignes et cartes activables (bouton, ou `role="button"` + `tabIndex` + gestion `Enter`/`Space`) ; remplacer les révélations `hover` par une visibilité permanente ou un `focus-within` ; ajouter `aria-live` sur les toasts et `<caption>`/`scope` sur les tables.

### N23. Les aides à la décision de §8 sont absentes alors que la donnée existe
🔴 **Ouvert — vérifié le 21/08/2026.** Aucun code ne compare la baseline `cves` persistée aux références courantes ; l'atteignabilité n'est nulle part dans `src/`. 🧪 Le markdown généré est épinglé tel quel dans `src/routes/tickets.test.ts` — donc conforme au code, pas à §8.

**⊕3** — `src/db/tickets.ts:22-38`, `src/pages/Triage.tsx:107,129-134`, `src/routes/tickets.ts:40-58`

Quatre éléments spécifiés par CONTEXT.md §8, aucun présent à l'écran :

1. **Warning « N nouvelles CVE depuis le lien ».** La baseline `cves` **est bien persistée** en base à l'enregistrement du ticket, mais aucun code ne la compare aux références courantes du groupe. Un ticket Jira ouvert en janvier sur `symfony/http-kernel` peut avoir accumulé trois nouvelles CVE : rien ne le signale, le référent croit le sujet couvert. C'est précisément la dérive que §8 doit détecter.
2. **Filtre « Atteignables uniquement »** (ne garder que les CVE `confirmed`) : inexistant. Le seul bouton disponible, « Zero-Inbox », fait l'**inverse** (`hideProcessed` garde `status === "pending"`). Sans lui, impossible de produire la liste « ce qui est réellement exploitable » attendue par les équipes de dev.
3. **Libellés d'atteignabilité** (Atteignable / Non atteignable / À évaluer / Ignoré) : jamais affichés, l'UI montre les statuts bruts. Aucune occurrence de `atteignable`/`reachable` dans `src/`.
4. **Classement Prioritaires / Moins importants** et **markdown conforme** : le markdown généré (`routes/tickets.ts:40-58`) produit un titre différent, une ligne méta sans séparateurs `·`, sans pire sévérité ni version cible, puis une liste de sections `###` par CVE — aucun tableau, aucun emoji de sévérité, aucune colonne « Atteignable », aucun échappement de `|`. **Le statut de triage et la note du référent sont absents du markdown**, alors qu'ils sont la valeur ajoutée du ticket selon §8.

Défaut connexe : la version cible d'en-tête retient la version la **plus élevée** via `compareVersions` (`Triage.tsx:129-134`), là où §8 spécifie la **première `fixedIn` non vide** dans l'ordre d'insertion.

**Correctifs :** calculer le badge de dérive par différence avec la baseline déjà stockée ; dériver et afficher l'atteignabilité depuis le statut de triage, avec le filtre correspondant à côté de Zero-Inbox ; aligner le markdown sur §8, ou acter formellement le nouveau format dans le contrat (cf. [N31](#n31-écarts-au-contrat-contextmd--arbitrage-à-trancher)).

### N24. Filtres et pagination hors de l'URL
🔴 **Ouvert — vérifié le 21/08/2026.** `useSearchParams` n'est utilisé que par `Triage.tsx`, pour `project` et `cve` seulement.

**⊕3** — `src/pages/Projects.tsx:47,58,780,817`, `src/pages/Triage.tsx:37-38,58`

Seuls `project` et `cve` transitent par l'URL (`Triage.tsx:19-21`). `filterTag`, `viewMode`, `page`, `itemsPerPage` et `hideProcessed` sont de l'état local. Comme les pages sont des `element` de route (`App.tsx:218-222`), quitter la page les **détruit**.

- Le référent filtre les projets sur « Prod » en vue Tableau, ouvre une CVE, revient : filtre perdu, vue revenue en Grille.
- Il ne peut pas envoyer à son équipe un lien vers « les CVE non traitées du projet 12, page 3 » — alors que §7 désigne ce partage comme un usage central du référent sécurité.

Défaut de fond associé : `filterTag` est une valeur **unique** (`string | null`) — cliquer « Prod » remplace « Backend ». §9 spécifie un ensemble `selectedTags` avec **logique OU** (`selectedTags.size === 0 || p.tags.some(t => selectedTags.has(t))`) : « Prod OU Backend » est impossible. Et comme cet état n'est pas remonté, il n'est pas le périmètre de « Tout auditer » ([N8](#n8--tout-auditer---séquentiel-périmètre-faux-non-annulable-et-verrou-serveur-contradictoire)), contrairement à §2 et §9.

Défaut d'affichage associé : l'état vide de la page Projets (`:767-776`) est conditionné à `projects.length === 0`. Si un tag ne matche aucun projet, la grille rend **zéro carte sous les boutons de filtre**, sans un mot d'explication — l'utilisateur croit avoir perdu ses projets.

**Correctifs :** porter ces états dans les `searchParams` (`useSearchParams` est déjà utilisé dans `Triage`), valeurs par défaut absentes de l'URL pour garder les liens propres ; passer le filtre tags en multi-sélection (Set + OU) ; ajouter un état « Aucun projet pour ce filtre » avec réinitialisation.

### N25. `TicketModal` : les notes fuient d'un ticket à l'autre
🔴 **Ouvert — vérifié le 21/08/2026.** `const [notes, setNotes] = useState("")` sans aucune réinitialisation.

**⊕1** — `src/components/organisms/TicketModal.tsx:20`, `src/pages/Triage.tsx:349-355`

`const [notes, setNotes] = useState("")` dans un composant rendu **inconditionnellement** : seul le `DialogContent` de Radix est démonté à la fermeture, jamais `TicketModal`. `notes` n'est réinitialisé nulle part — ni dans le handler de fermeture, ni après création réussie.

Le référent rédige une recommandation pour `lodash`, annule, ouvre le ticket d'`axios` : le champ contient encore la recommandation de `lodash`, et elle partira dans le ticket Jira si elle n'est pas repérée.

**Correctif :** réinitialiser `notes` à l'ouverture, ou donner au dialogue une `key` dérivée de `group.key` pour forcer un état neuf par ticket.

### N40. Les noms de tags sont sensibles à la casse
🔴 **Ouvert — relevé par la suite de tests** — `src/db/index.ts` (table `tags`), `src/db/tags.ts`

`name TEXT NOT NULL UNIQUE` sans `COLLATE NOCASE` : « backend » et « Backend » coexistent, produisant **deux filtres visuellement identiques** dans la barre de la page Projets, chacun ne matchant qu'une partie des projets. L'erreur est invisible à la lecture, et le message « Un tag avec ce nom existe déjà » ne se déclenche pas.

Aggravé par [N12](#n12-la-suppression-dun-tag-laisse-des-tags-fantômes-définitifs) : `projects.tags` stockant des **noms**, corriger la casse d'un tag existant impose de réécrire chaque projet concerné à la main.

🧪 Épinglé dans `src/db/tags.test.ts` : « l'unicité est sensible à la casse — écart documenté ».

**Correctif :** `UNIQUE COLLATE NOCASE` sur la colonne, avec migration des doublons existants. À traiter avec la cascade de [N12](#n12-la-suppression-dun-tag-laisse-des-tags-fantômes-définitifs) : les deux touchent la même écriture.

### N27. Design system contourné
🟡 **Partiellement amélioré — vérifié le 21/08/2026.** `cn()` reste à **0 occurrence** hors `components/ui/`, et les molecules ne sont toujours consommées que par `/debug`. En revanche plusieurs `label` ont gagné leur `htmlFor`/`id` (dont `TicketModal`), effet de bord des correctifs d'accessibilité.

**⊕1** — molecules utilisées uniquement dans `src/pages/Debug.tsx:262-284` · `cn(` : **0 occurrence hors `components/ui/`** · `src/pages/Settings.tsx:217,316,323-335,374,390` · `src/components/organisms/TagsManager.tsx:97-105,161-182`

- **Les molecules n'existent que dans la vitrine `/debug`.** `LabelInput`, `StatCard`, `ActionBadge`, `FilterDropdown` ne sont consommées nulle part ailleurs : les pages réelles réimplémentent le markup à la main (trois tuiles statistiques recopiées dans `Overview.tsx:42-108`, badge de tag recopié dans `TagsManager.tsx:161-182`).
- **`cn()` n'est jamais appelé hors des atomes.** Les classes sont concaténées en template strings, ce qui laisse des conflits Tailwind non résolus : le toast de `Triage.tsx:365` applique `bg-card` **puis** `bg-green-500/10` dans le même attribut ; `TriageTable.tsx:72` empile `border` et une classe de fond issue de `SEVERITY_COLORS`.
- **Les indicateurs de chargement ne tournent pas.** `RefreshCw`/`Loader2` sans `animate-spin` dans `Triage.tsx:309`, `Projects.tsx:449,765`, `Settings.tsx:209`, `Reports.tsx:177`, `HistoryChart.tsx:261`, `TagsManager.tsx:153`, `Header.tsx:164` — icône figée, et sur Triage sans texte d'accompagnement : l'écran paraît planté. L'atome `Spinner` existe pourtant dans `ui/`.
- **Labels non liés** : `Settings.tsx:217,316,374,390` — `label` sans `htmlFor`, inputs sans `id`.
- **Deux écarts de réglages** : l'entrée `AUDIT_MAX_AGE_HOURS` est en `type="number" min="0"`, ce qui **interdit la saisie de `-1`** (« jamais frais → toujours réauditer ») pourtant explicitement prévue par §2 et §12 ; et la palette de couleurs de tags proposée (`indigo, red, orange, yellow, green, blue, purple, pink`) ne correspond pas à celle du contrat (`indigo, sky, emerald, amber, rose, violet, teal, orange`) — six valeurs sur huit diffèrent, et le serveur ne validant pas la couleur (`src/db/tags.ts:15-29`), elles seront stockées telles quelles sans résoudre aucune variable CSS.
- Enfin l'en-tête fixe (`Header.tsx:81-167`) n'a aucune variante responsive ; sous ~1100 px la barre déborde, et comme le conteneur racine est `overflow-x-hidden`, le contenu excédentaire est **coupé** plutôt que défilable. Côté triage, le `TableFooter` (compteur, sélecteur, précédent/suivant) est **à l'intérieur** du conteneur `overflow-x-auto` : sur écran étroit les contrôles de pagination défilent hors champ, et aucune colonne n'est sticky — package et version corrigée sortent de l'écran quand on va lire les actions.

**Correctifs :** consommer les molecules dans les pages ; passer toute composition de classes par `cn()` ; restaurer `animate-spin` ou utiliser l'atome `Spinner` ; lier chaque `label` à son `id` ; aligner l'input de fraîcheur (`min="-1"`) et la palette de tags sur le contrat, avec validation serveur ; rendre la nav responsive et sortir la pagination du conteneur défilant.

---

## ⚫ Priorité 5 — Écart de contrat à arbitrer

### C11. Composants monolithiques
🔴 **Aggravé — mesuré le 21/08/2026** — entrée conservée depuis la vague 1

| Fichier | Lignes |
|---|---:|
| `src/pages/Projects.tsx` | **1151** |
| `src/pages/Reports.tsx` | 662 |
| `src/pages/Settings.tsx` | 653 |
| `src/pages/Triage.tsx` | 403 |

`Projects.tsx` a franchi le millier de lignes depuis la vague 1. Le refactor Atomic Design a extrait les atomes et les organismes, mais les pages ont continué de grossir : elles portent l'état, les appels réseau, l'orchestration et le markup. C'est ce qui rend [N16](#n16-le-reactmemo-de-projectcard-est-neutralisé-par-construction) (handlers non mémoïsés), [N19](#n19-létat-serveur-nest-jamais-invalidé-après-une-mutation) (état serveur local) et [N24](#n24-filtres-et-pagination-hors-de-lurl) (filtres non partagés) difficiles à corriger séparément : les trois ont la même racine.

À traiter de façon opportuniste, à l'occasion des correctifs ci-dessus, plutôt qu'en refactor dédié — la valeur utilisateur est nulle et le risque de régression réel. La contrepartie est que les 355 tests de composants couvrent désormais ces pages : un découpage est vérifiable.

### N31. Écarts au contrat CONTEXT.md — arbitrage à trancher
**⊕2**

`CONTEXT.md` n'est plus la spécification de cette application. Le **noyau technique est fidèle**, et cela a été vérifié ligne à ligne : les quatre parseurs, `normSeverity`/`dedupe`/`SEV_ORDER`/`emptyCounts`, le pipeline dédup→tri→comptage, les six conditions de déduplication d'audit et la sémantique d'`isFresh`, le format multi-ligne des erreurs, le calcul de `newCves`, la séquence git en six commandes avec son env, `keyFrom` et la détection de rate-limit, `buildCveGroups` (source, clé, `worst`, dédup, tri, override `fixed_in`), le modèle d'événement de la console et le fait qu'un résultat servi depuis le cache n'émette rien, la connexion SQLite paresseuse, l'absence de shell. Ce socle est solide.

C'est la couche produit qui a divergé, **dans les deux sens**.

**Spécifié, absent :**

| Route / fonctionnalité spécifiée | État | Conséquence |
|---|---|---|
| `GET /api/projects/:id/history` (30 derniers runs) | **absent** — `getRunsForProject` existe (`src/db/runs.ts:82`), appelée par son seul test | Impossible de consulter l'historique d'un projet, donc de voir des erreurs répétées |
| `DELETE /api/runs/:id` | **absent** — `deleteRun` existe (`:132`), appelée par son seul test | Un run pollué reste l'état courant jusqu'au prochain audit |
| `POST /api/annotations/fetch-fix` | **absent** — remplacé par `POST /api/advisories/sync`, qui ne persiste **aucune** annotation et ne renvoie jamais 429 | La « seule porte manuelle » de §6 n'existe pas ; `setAnnotationFix` n'est appelé que par son test |
| `GET /api/snapshots` (liste + compteurs) | **absent** | L'utilisateur ne voit jamais quels snapshots existent |
| `POST /api/detect` (algorithme complet) | **divergent** — `/api/projects/detect` renvoie `{tool}` au lieu d'`entries[]` : pas de scan de profondeur 1, pas de `dir`, pas de dédup par outil ; **`bun.lock` n'est jamais testé**, `bun` prime sur `yarn`/`npm`, et `composer.json`/`package.json` (hors catalogue) servent de repli | Un monorepo dont le lockfile est dans `app/` n'est pas détecté ; un projet Yarn avec un `bun.lockb` résiduel est classé `bun` ; un projet sans lockfile est proposé en `npm`, ce qui garantit un run `error` |
| `POST /api/projects/:id/ignore` | **absent** — fait via `PUT` avec `{ignored}` | Le `PUT` réécrit `name`/`path`/`audit_path`/`type`/`tool`/`tags` à chaque bascule, sans validation ni contrôle d'existence — cf. [N3](#n3-put-apiprojectsid--aucune-validation-aucune-garde-de-chemin) |
| §12 niveau 1 — sauvegarde config JSON | **non implémenté** — aucune occurrence de `buildConfig`, `writeBackup`, `scheduleBackup`, `startPeriodicBackup`, `BACKUP_DIR`, `BACKUP_KEEP`, `BACKUP_DB_KEEP`, `BACKUP_INTERVAL_MIN` dans `src/` | Aucune sauvegarde automatique, aucun historique daté, aucune rotation. Les mentions « + sauvegarde » de §1, §7, §8, §9 et §10 sont **toutes inopérantes** |
| §9 cascade tags | **absent** | Voir [N12](#n12-la-suppression-dun-tag-laisse-des-tags-fantômes-définitifs) |
| §1 validations + 409 doublon de cible | **absent** — aucune des cinq chaînes de validation n'existe dans `src/` ; `createProject(body)` insère tel quel, `input.path` vide devenant la chaîne `"remote"` | `~/app`, `/home/user/app` et `/home/user/app/` créent trois projets distincts : les CVE du même dépôt sont comptées 3× partout. `POST /api/projects {}` → 500 au lieu de 400 |
| §7/§10/§12 validations d'annotation, de prompt, de réglage | **absent** | `status:"banana"` est persisté et casse l'affichage de triage et les compteurs de `/api/stats` ; un prompt sans titre est créable et devient invisible ; une durée `-99` est acceptée et rend la dédup par commit inopérante |
| §10 tri des prompts | **divergent** — `ORDER BY title ASC` (`src/db/prompts.ts:14`) au lieu de création décroissante | Bibliothèque triée alphabétiquement, pas par nouveauté |
| §12 variables d'environnement | **divergent** — seul `DB_PATH` est conforme. `PORT` n'est pas lu (c'est `AEGIS_PORT`, défaut **3001** et non 3000) ; `AUDIT_MAX_AGE_HOURS` n'est lu que dans la table `settings`, jamais dans l'environnement ; les quatre `BACKUP_*` sont absents | Un déploiement configuré selon le contrat démarre sur le mauvais port et ignore la fenêtre de fraîcheur par défaut |

**Implémenté, non spécifié** — c'est là qu'est passé l'essentiel de l'effort :

1. **Intégration Jira complète** (`src/routes/tickets.ts:85-277`) : création réelle d'issues via l'API v3, document ADF, anti-doublon par hash SHA-256 (`src/db/tickets.ts:41-51`), test de connexion. §8 se limite à « préparer » un markdown copiable et stocker une URL.
2. **Ingestion CI** (`POST /api/ingest/:slug`) authentifiée par token en comparaison à temps constant.
3. **Batch d'audit côté serveur** (`/api/audit/run`, `/api/audit/status`) alors que §2 stipule « aucun endpoint batch » — et ce batch n'est appelé par aucun écran (cf. [N8](#n8--tout-auditer---séquentiel-périmètre-faux-non-annulable-et-verrou-serveur-contradictoire)).
4. **Table `reports`** et page associée : persistance des comptes-rendus de « Tout auditer ».
5. **Table `cve_occurrences`** avec `is_baseline`/`exposure_start`/`resolved_at` et calcul d'ancienneté — socle des SLA d'[UPGRADE.md §1](UPGRADE.md).
6. **Enrichissement CVSS** (`src/lib/cvss.ts`, colonnes `cvss_vector`/`html_url`/`published_at`).
7. **Annotations globales** via `project_id = -1`, contraire à §7 où l'unité est le couple CVE/projet — et non fonctionnelles ([N7](#n7-les-annotations-globales-sont-impossibles-et-limport-de-config-meurt-à-mi-parcours)).
8. **Colonnes `slug` et `is_remote`** sur `projects`, absentes du modèle de §1.
9. **`AEGIS_ALLOWED_ROOTS`, `AEGIS_INGEST_TOKEN`, `HOST`** — durcissements utiles, issus de la vague 1, non spécifiés.

**Correctif — décision produit, à prendre avant tout correctif de conformité :** trancher si `CONTEXT.md` est réaligné sur le produit réel (Jira, ingestion CI, reports, SLA deviennent contractuels ; les endpoints jamais implémentés sont retirés ou déplacés vers [UPGRADE.md](UPGRADE.md)), ou si le produit revient au contrat. Corriger ces écarts un par un sans cet arbitrage produira des allers-retours : plusieurs entrées de cette liste sont des fonctionnalités délibérément remplacées, pas des oublis.

---

## 🎯 Ordre de traitement recommandé

Révisé le 21/08/2026 après vérification. L'ordre a changé sur deux points : la surface d'attaque s'est réduite (la brèche `PUT` de N3 est fermée), et un défaut de perte de données non trié est apparu en tête.

1. ~~**N32**~~ — ✅ **fait le 21/08/2026.** Le seul défaut de cette liste qui détruisait du travail humain à chaque clic.
2. **[N5](#n5-get-apisettings-expose-les-secrets-en-clair), [N4](#n4-ssrf-authentifié-via-apiticketstest-connection), résiduel de [N3](#n3-put-apiprojectsid--aucune-validation-aucune-garde-de-chemin)** — surface d'attaque. Le résiduel de N3 se limite désormais à trois points : `pathGuard` sur `git-fetch`/`git-pull`, garde sur `/api/config/import`, et `isPathAllowed` en défaut **fermé**.
3. **[N6](#n6-les-erreurs-http-sont-consommées-comme-des-succès)** — un wrapper `fetchJson` unique couvre les 43 appels et supprime d'un coup le faux négatif « écosystème sain » et les rapports d'audit faux persistés en base.
4. **[N1](#n1-github-est-appelé-pendant-chaque-audit)** — sortir l'enrichissement du chemin d'audit. Débloque mécaniquement [N18](#n18-rate-limit-ignoré-et-perte-du-fixedin-fourni-par-loutil), [N44](#n44-syncadvisory-vide-le-cache-avant-de-refetcher) et une bonne part de [N8](#n8--tout-auditer---séquentiel-périmètre-faux-non-annulable-et-verrou-serveur-contradictoire).
5. ~~**N10** puis **N28**~~ — ✅ **faits le 21/08/2026.** La table d'occurrences porte la clé de §2, les lignes ambiguës sont purgées, et l'invariant des compteurs est verrouillé.
6. **[C9](#c9-initdb-ignore-son-paramètre) puis [N2](#n2-la-restauration-de-snapshot-ne-restaure-rien) et [N7](#n7-les-annotations-globales-sont-impossibles-et-limport-de-config-meurt-à-mi-parcours)** — sauvegarde et restauration. Aujourd'hui l'outil affiche « restauration effectuée » sans rien restaurer : c'est le comportement le plus mensonger de l'application.
7. **Le lot bon marché** — [N33](#n33-zcoerceboolean-rend-la-chaîne-false-vraie), [N34](#n34-parsecvssvector-écarte-toujours-le-premier-segment), [N35](#n35-500-au-lieu-de-400-sur-les-routes-qui-lisent-reqjson-directement), [N36](#n36-une-méthode-non-déclarée-renvoie-du-html-en-200), [N37](#n37-delete-sur-un-identifiant-inconnu-répond-succès), [N38](#n38-getreports-trie-par-created_at-seul), [N40](#n40-les-noms-de-tags-sont-sensibles-à-la-casse), [N42](#n42-commit_sha-peut-valoir-la-chaîne-head), [N43](#n43-le-repli--déjà-à-jour--de-gitfetch-est-inatteignable), [N11](#n11-force1-est-inopérant). Dix correctifs de quelques lignes chacun, tous déjà épinglés par un test à retourner. Bon lot pour une passe unique.
8. **[N9](#n9-le-triage-est-impraticable-au-delà-de-quelques-cve) et [N14](#n14-sévérité-illisible--palette-sans-couleur-de-texte-et-préfixes-dark-amputés)** — les deux défauts qui rendent l'écran de triage inutilisable en pratique, alors qu'il est la raison d'être du produit. N14 commence par un `grep` sur les préfixes `dark:` amputés.
9. **[N31](#n31-écarts-au-contrat-contextmd--arbitrage-à-trancher)** — arbitrage du contrat. À trancher avant d'engager le reste : plusieurs entrées sont des fonctionnalités délibérément remplacées, pas des oublis.

### Comment corriger un défaut épinglé

Chaque défaut 🧪 porte **deux** tests, côte à côte dans le même fichier :

1. Le test **« écart documenté »**, qui affirme le comportement réel d'aujourd'hui. Il passe au rouge si le défaut change de forme — une régression involontaire est donc détectée.
2. Le test **`test.failing`**, dans un bloc `describe("contrats attendus — à activer au correctif")` en fin de fichier, qui énonce le comportement que `CONTEXT.md` demande. Bun exécute son corps et **attend son échec** : la suite reste verte tant que le défaut existe.

Le jour du correctif, le second se met à passer et Bun le signale :

```
(fail) contrats attendus … > un champ omis est conservé (N32)
  ^ this test is marked as failing but it passed.
    Remove `.failing` if tested behavior now works
```

Il est donc **impossible de corriger le code sans reprendre le test**. La marche à suivre :

1. Corriger le code.
2. Retirer `.failing` du test de contrat, qui doit désormais passer.
3. Supprimer le test « écart documenté » correspondant, devenu faux — c'est lui qui signale que l'ancien comportement a disparu.

Ne pas utiliser `test.skip` ni `test.todo` à cette fin : Bun n'exécute pas leur corps, l'assertion serait décorative et aucun signal ne se déclencherait au correctif.

**Un test retourné se vérifie.** Deux des 42 écrits le 21/08/2026 sont passés dès leur écriture, révélant que le test « écart documenté » correspondant était faux — voir [N11](#n11-force1-est-inopérant) (le montage ne isolait pas le forçage) et [N9](#n9-le-triage-est-impraticable-au-delà-de-quelques-cve) (une assertion `toContain` qui passait sur un préfixe). Un test de contrat qui passe du premier coup n'est pas une bonne nouvelle : c'est un défaut mal caractérisé.
