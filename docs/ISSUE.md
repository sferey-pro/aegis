# 🐛 Problèmes identifiés

Défauts relevés sur l'existant — les nouvelles fonctionnalités sont listées dans [UPGRADE.md](UPGRADE.md).

**Liste unique, groupée par priorité.** Ce fichier fusionne les trois sources qui coexistaient : la vague 1 (juillet 2026, `C1`…`C12` / `T1`…`T4`), la vague 2 (août 2026, `N1`…`N31`) et les écarts relevés par la suite de tests (`N32`…`N45`, auparavant numérotés 1–22 dans une seconde liste au sein de [TESTS.md](TESTS.md)). Cette seconde numérotation est supprimée : `TESTS.md` renvoie désormais aux identifiants ci-dessous.

**Tout a été revérifié dans le code le 21/08/2026**, puis à nouveau le **23/08/2026** pour les entrées restées ouvertes. Les défauts fermés restent listés avec leur constat de vérification : savoir *ce qui a été refermé et comment* est ce qui empêche de le re-casser.

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

**61 entrées distinctes · 45 fermées · 15 ouvertes — 8 🔴, 6 🟡, plus [N31](#n31-écarts-au-contrat-contextmd--arbitrage-à-trancher) en arbitrage · 1 ⚫ ([N40](#n40-la-casse-des-noms-de-tags), question produit et non défaut) · aucune épinglée par un test.**

> **Les compteurs sont dédoublonnés.** Les versions précédentes additionnaient le tableau « Fermé en bloc » et les entrées détaillées, qui se recoupent — `N28` y figurait même deux fois. D'où une dérive sur *tous* les chiffres : le 23/08/2026 le tableau de bord annonçait « 17 ouvertes (13 🔴) · 47 fermées » là où le décompte réel donnait 16 ouvertes (9 🔴) et 44 fermées. Le chiffre juste est l'union des identifiants, pas la somme des lignes.

> **Plus aucun `test.failing` dans le dépôt.** Chaque défaut restant est ouvert *sans* verrou : la régression n'y est plus bloquée, contrairement à ce qui prévalait depuis le 21/08/2026. Les prochaines entrées corrigées devront écrire leur propre contrat — et se souvenir que trois contrats épinglés se sont révélés **faux** ([N40](#n40-la-casse-des-noms-de-tags), [N41](#n41-content_hash-nest-pas-unique-en-base), [N45](#n45-la-porte-ci-dun-projet-ignoré-est-toujours-verte)).

### Priorité 1 — Sécurité

| ID | Sujet | État | Test |
|---|---|:-:|:-:|

### Priorité 2 — Bugs fonctionnels & intégrité des données

| ID | Sujet | État | Test |
|---|---|:-:|:-:|
| [N2](#n2-la-restauration-de-snapshot-ne-restaure-rien) | La restauration de snapshot ne restaure rien | 🟢 | ✅ |
| [N7](#n7-les-annotations-globales-sont-impossibles-et-limport-de-config-meurt-à-mi-parcours) | Annotations globales impossibles, import de config non transactionnel | 🟢 | ✅ |
| [N12](#n12-la-suppression-dun-tag-laisse-des-tags-fantômes-définitifs) | La suppression d'un tag laisse des tags fantômes | 🟢 | ✅ |
| [N13](#n13-apihistory-global--deux-sévérités-perdues-pas-de-total-fuseau-local-days-non-validé) | `/api/history-global` : sévérités perdues, `days` non validé | 🟢 | ✅ |
| [N18](#n18-rate-limit-ignoré-et-perte-du-fixedin-fourni-par-loutil) | Rate-limit ignoré, perte du `fixedIn` de l'outil | 🟢 | ✅ |
| [N20](#n20-aucune-vérification-préalable-du-chemin-daudit-ni-du-lockfile) | Aucune vérification préalable du chemin d'audit ni du lockfile | 🔴 | — |
| [N44](#n44-syncadvisory-vide-le-cache-avant-de-refetcher) | `syncAdvisory` vide le cache avant de refetcher | 🟢 | ✅ |
| [N45](#n45-la-porte-ci-dun-projet-ignoré-est-toujours-verte) | La porte CI d'un projet ignoré est toujours verte | 🟢 | ✅ |
| [C4](#c4-apiconfigimport-ne-restaure-que-trois-sections-sur-cinq) | `/api/config/import` ne restaure que trois sections sur cinq | 🟡 | — |

### Priorité 3 — Robustesse & performance

| ID | Sujet | État | Test |
|---|---|:-:|:-:|
| [N8](#n8--tout-auditer---séquentiel-périmètre-faux-non-annulable-et-verrou-serveur-contradictoire) | « Tout auditer » : séquentiel, périmètre faux, verrou contradictoire | 🟢 | ✅ |
| [N16](#n16-le-reactmemo-de-projectcard-est-neutralisé-par-construction) | Le `React.memo` de `ProjectCard` est neutralisé | 🟡 | — |
| [N17](#n17-double-flux-sse-et-console-perdue-au-passage-sur-debug) | Double flux SSE, console perdue au passage sur `/debug` | 🔴 | — |
| [N19](#n19-létat-serveur-nest-jamais-invalidé-après-une-mutation) | L'état serveur n'est jamais invalidé après une mutation | 🔴 | — |
| [N21](#n21-n1-systématiques-et-double-désérialisation-des-blobs) | N+1 systématiques, double désérialisation des blobs | 🟡 | — |
| [N22](#n22-race-condition-sur-le-graphique-dhistorique) | Race condition sur le graphique d'historique | 🔴 | — |
| [N26](#n26-setinterval-jamais-nettoyé-état-de-module-perdu-sous-bun---hot) | `setInterval` jamais nettoyé, état de module perdu sous `bun --hot` | 🟡 | — |
| [N29](#n29-deux-définitions-du--dernier-run--coexistent) | Deux définitions du « dernier run » coexistent | 🟢 | ✅ |
| [N30](#n30-le-contexte-projet-nenveloppe-pas-les-commandes-git-du-listing) | Le contexte projet n'enveloppe pas les commandes git du listing | 🔴 | — |
| [N39](#n39-la-progression-du-lot-daudit-nest-pas-observable-après-coup) | La progression du lot d'audit n'est pas observable après coup | 🟢 | ✅ |
| [N41](#n41-content_hash-nest-pas-unique-en-base) | `content_hash` n'est pas unique en base | 🟢 | ✅ |
| [C9](#c9-initdb-ignore-son-paramètre) | `initDb` ignore son paramètre | 🟢 | ✅ |

### Priorité 4 — UX & accessibilité

| ID | Sujet | État | Test |
|---|---|:-:|:-:|
| [N9](#n9-le-triage-est-impraticable-au-delà-de-quelques-cve) | Le triage est impraticable au-delà de quelques CVE | 🟢 | ✅ |
| [N14](#n14-sévérité-illisible--palette-sans-couleur-de-texte-et-préfixes-dark-amputés) | Sévérité illisible, préfixes `dark:` amputés | 🟢 | ✅ |
| [N15](#n15-aucune-navigation-clavier) | Navigation clavier | 🟡 | — |
| [N23](#n23-les-aides-à-la-décision-de-8-sont-absentes-alors-que-la-donnée-existe) | Les aides à la décision de §8 sont absentes | 🔴 | — |
| [N24](#n24-filtres-et-pagination-hors-de-lurl) | Filtres et pagination hors de l'URL | 🟡 | — |
| [N25](#n25-ticketmodal--les-notes-fuient-dun-ticket-à-lautre) | `TicketModal` : les notes fuient d'un ticket à l'autre | 🟢 | — |
| [N27](#n27-design-system-contourné) | Design system contourné | 🟡 | — |

### Priorité 5 — Écart de contrat à arbitrer

| ID | Sujet | État | Test |
|---|---|:-:|:-:|
| [N31](#n31-écarts-au-contrat-contextmd--arbitrage-à-trancher) | `CONTEXT.md` n'est plus la spécification du produit | 🟡 | partiel |
| [N40](#n40-les-noms-de-tags-sont-sensibles-à-la-casse) | Casse des noms de tags — **conforme au contrat**, question produit | ⚫ | — |
| [C11](#c11-composants-monolithiques) | Composants monolithiques (**1125** lignes pour `Projects.tsx`) | 🔴 | — |

### 🟢 Fermé, vérifié le 21/08/2026

| ID | Sujet | Constat de vérification |
|---|---|---|
| T1 | Front quasi non couvert | **363 tests** sur 46 fichiers `.test.tsx`, colocalisés sur toute l'arborescence Atomic Design |
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
| N11 | `?force=1` est inopérant | 🟢 **corrigé le 22/08/2026.** `1` et `true` sont acceptés. Un forçage silencieusement ignoré était plus dangereux qu'un forçage absent : l'appelant recevait un rapport dédupliqué en croyant avoir réaudité. |
| N33 | `z.coerce.boolean` rend `"false"` vraie | 🟢 **corrigé le 22/08/2026.** Union explicite (`true`/`false`, `1`/`0`, `yes`/`no`, `on`/`off`, booléen, 0/1) avec repli sur `false`. Le champ est un réglage d'affichage : une valeur inattendue ne doit pas faire échouer la création du projet. |
| N34 | `parseCvssVector` écarte le premier segment | 🟢 **corrigé le 22/08/2026.** Le segment n'est écarté que s'il correspond à `/^CVSS:\d/`. |
| N35 | 500 au lieu de 400 sur les routes lisant `req.json()` | 🟢 **corrigé le 22/08/2026.** `parseBody` branché sur `reports` (avec `reportBodySchema`, qui existait sans être utilisé), `advisories/sync` et `config/import`. **Effet de bord utile :** le typage a révélé que l'import passait des données non validées à `createProject` — les sections sont désormais typées, ce qui referme au passage une partie de l'écart §1 relevé par [N31](#n31-écarts-au-contrat-contextmd--arbitrage-à-trancher). |
| N36 | Une méthode non déclarée renvoie du HTML en 200 | 🟢 **corrigé le 22/08/2026.** Route `"/api/*"` répondant 404 en JSON, placée **avant** le fourre-tout `"/*"` — l'ordre de déclaration décide. |
| N37 | `DELETE` sur un identifiant inconnu répond succès | 🟢 **corrigé le 22/08/2026.** Les quatre fonctions de suppression retournent `changes > 0`, et les quatre routes répondent 404 sinon. |
| N38 | `getReports` trie par `created_at` seul | 🟢 **corrigé le 22/08/2026.** `ORDER BY created_at DESC, id DESC`, même règle que `getLatestRun`. |
| N42 | `commit_sha` peut valoir `"HEAD"` | 🟢 **corrigé le 22/08/2026.** `runGit` retourne son code de sortie, et `getGitInfo` s'y fie au lieu de chercher `fatal:` dans stdout. Le SHA est en outre validé sur la forme `/^[0-9a-f]{40}$/` — une valeur non hexadécimale satisfaisait la déduplication d'un run au suivant. |
| N43 | Repli « Déjà à jour. » inatteignable | 🟢 **corrigé le 22/08/2026.** Trois situations distinguées : pas de remote (« Aucun dépôt distant configuré »), à jour, mis à jour. Le repli se déclenchait au contraire sur un dépôt **sans** remote, où rien n'avait été tenté. |
| N10 | Clé d'identité de la table d'occurrences | 🟢 **corrigé le 21/08/2026.** `src/lib/vuln-identity.ts` porte les fonctions partagées, et la colonne `cve` de `cve_occurrences` stocke désormais `occurrenceRef` — la CVE, **repli sur le titre**, conformément à la clé de `newCves` (§2). Une migration purge les lignes de l'ancienne convention (`cve = package`), ambiguës par construction. **Correction de cadrage :** le correctif annoncé (« une clé unique pour parsing, table et agrégation ») allait trop loin — `CONTEXT.md` §3 et §2 **spécifient** les clés du dédoublonnage et du diff, volontairement plus fines. Le défaut n'était pas d'avoir trois clés mais d'en avoir une quatrième, non spécifiée. |
| N28 | Verrou de non-régression de C3 | 🟢 **écrit le 21/08/2026** — et il a appris quelque chose. En cassant la garde de `enhanceVulnerabilities` pour vérifier que le verrou rougissait, **rien n'a rougi** : la garde est inatteignable, les quatre parseurs et `getCachedAdvisory` normalisant tous la sévérité en amont. Le verrou porte donc sur l'**invariant** — compteurs finis, somme égale au total, quelle que soit la charge — plutôt que sur une garde redondante qui pourrait rester verte en laissant entrer le défaut par une autre porte. Le cas de N10 y est ajouté de bout en bout, comme la vague 1 le demandait. |
| N1 | GitHub est appelé pendant chaque audit | 🟢 **corrigé le 21/08/2026.** Le chemin d'audit passe par `resolveFixedVersionFromCache`, qui lit le cache d'avis local et **n'émet aucune requête** — vérifié par un compteur d'appels sortants, pas seulement par un audit qui aboutit hors ligne. Un audit est donc hors ligne, déterministe et borné par le disque. L'enrichissement n'est pas supprimé : ce qui est déjà connu est appliqué, le reste attend `/api/advisories/sync`. Au passage, la liste persistée est **retriée** après enrichissement — une sévérité relevée invalidait l'ordre du parseur (§3). |
| N6 | Les erreurs HTTP sont consommées comme des succès | 🟢 **corrigé le 21/08/2026.** Point de passage unique `src/lib/api.ts` (`fetchJson`, `fetchVoid`, `apiErrorMessage`), appliqué aux **43** appels : il ne reste aucun `fetch` brut dans `pages/`, `components/` ni `App.tsx`. Les trois conséquences nommées sont fermées — le triage a un état d'échec distinct de « écosystème sain », un audit en échec n'est plus compté zéro vulnérabilité ni archivé comme tel, et la page Réglages sort de son chargement. Les suppressions en lot passent par `Promise.allSettled` et annoncent les échecs partiels. **Résiduel refermé le 23/08/2026** avec [N8](#n8--tout-auditer---séquentiel-périmètre-faux-non-annulable-et-verrou-serveur-contradictoire) : `useGlobalAudit` expose un `AbortController`. |
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
🟢 **Corrigé le 22/08/2026** — relevé par la suite de tests — `src/lib/schemas.ts` (`projectBodySchema`, champs `ignored` et `is_remote`)

`z.coerce.boolean()` applique la conversion JavaScript : toute chaîne non vide est vraie, `"false"` comprise. Un client qui sérialise ses booléens en texte — un formulaire HTML, un script `curl`, un pipeline CI — active donc « ignoré » en croyant le désactiver, et le projet **disparaît de l'agrégation CVE** sans message.

🧪 Épinglé dans `src/lib/schemas.test.ts` : « `z.coerce.boolean` rend toute chaîne non vide vraie — écart documenté ».

**Correctif :** remplacer par un préprocesseur explicite acceptant `true`/`false`, `1`/`0`, `"true"`/`"false"`, et rejetant le reste.

### N44. `syncAdvisory` vide le cache avant de refetcher
🟢 **Corrigé le 23/08/2026.** ✅ Trois tests dans `src/lib/github/index.test.ts` — échec réseau, quota dépassé, avis introuvable.

La suppression de la ligne précédait l'appel réseau. Hors ligne, en quota dépassé ou sur un 5xx GitHub, l'avis déjà connu — sévérité, correctifs par branche, vecteur CVSS, date de publication — était **définitivement perdu**, et l'enrichissement repartait de zéro au prochain audit. L'action « rafraîchir » dégradait donc l'état quand elle échouait, c'est-à-dire précisément quand il ne faut rien casser.

**Correctif :** le `DELETE` est retiré, sans remplacement. Il était de surcroît superflu — `putCachedAdvisory` écrit avec un `ON CONFLICT` qui remplace la ligne existante.


### N45. La porte CI d'un projet ignoré est toujours verte
🟢 **Corrigé le 23/08/2026.** ✅ Six tests dans `src/lib/audit/index.test.ts`.

`ingestAudit` calculait ses `newCves` en appelant `buildCveGroups()`, l'agrégat global, qui **exclut les projets ignorés** — un filtre dont la finalité est l'affichage. Un projet marqué « ignoré » qui ingérait un rapport obtenait donc toujours `newCvesCount: 0`, quelle que soit la charge : le run était bien enregistré avec ses vulnérabilités, mais la porte CI restait verte pour de bon. Combiné à N33, le scénario était atteignable sans intention — un `ignored: "false"` sérialisé en chaîne marquait le projet ignoré.

**Correctif :** le diff est calculé sur le run précédent **de ce projet**, via un `diffNewCves` partagé avec `runAudit`. Une seule implémentation pour les deux portes d'entrée, puisqu'elles répondent à la même question.

Le passage par l'agrégat cachait deux écarts supplémentaires au contrat, refermés du même coup. `newCves` comptait les CVE **non triées** (`status === "pending"`) et non les **nouvelles**, alors que §2 définit le diff par rapport au run précédent, sans mention du triage : une décision de triage suffisait à faire taire la porte. Et la **forme retournée divergeait** — des `CveGroup` là où l'audit renvoie `{ref, package, severity}` sous le même nom de champ. Au passage, l'ingestion ne reconstruit plus tout l'agrégat du parc à chaque appel.

> Conséquence à connaître : au **premier** envoi d'un projet, §2 impose de considérer tout comme nouveau — sans run précédent, on ne peut pas affirmer qu'une faille était déjà là. Une porte CI stricte échouera donc sur ce premier passage. `docs/CI_INGEST.md` le dit désormais explicitement ; il annonçait l'inverse.


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
🟢 **Corrigé le 23/08/2026.** ✅ Verrouillé par 26 tests dans `src/db/backup.test.ts` et 9 dans `src/routes/settings.test.ts`.

**⊕2** — `src/db/backup.ts`, `src/routes/settings.ts`, `src/pages/Settings.tsx`

`createSnapshot` écrivait dans `resolve(process.cwd(), "backup.sqlite")` et `restoreSnapshot` copiait par-dessus `resolve(process.cwd(), "aegis.db")`, alors que la base réellement ouverte est `DB_PATH` (défaut `audit.sqlite`). La restauration écrasait donc un fichier **que personne n'ouvre jamais**, répondait « Restauration effectuée, redémarrage du serveur… », redémarrait — et la base était identique à avant. L'application affirmait avoir fait ce qu'elle n'avait pas fait.

Trois défauts aggravants tenaient dans les huit lignes suivantes : aucune purge du `-wal` (l'ancien journal se rejouait par-dessus la base restaurée, donnant ni l'ancien état ni le nouveau) ; `process.exit(0)`, qui tuait le process sans attendre les réponses HTTP en vol ; et aucun filet, donc une restauration réussie irréversible. Le champ `file` exigé par le schéma de la route n'était par ailleurs jamais transmis.

**Correctif** — `src/db/backup.ts` est réécrit sur `CONTEXT.md` §12 : dossier `BACKUP_DIR/db`, instantanés datés, rotation `BACKUP_DB_KEEP` (les `pre-restore-*` en sont exclus — ce sont des recours, pas des sauvegardes périodiques), inventaire avec compteurs lus en lecture seule, et une restauration nommée en sept étapes dont **l'ordre est la garantie** : valider le nom avant de toucher au disque, prendre le filet avant de fermer, fermer avant de copier, purger le journal avant de laisser rouvrir. `GET /api/snapshots` est ajouté, et `POST /api/snapshots/restore` reçoit enfin son `{file}`, avec la garde anti-traversal de §12 et un 409 si un audit tourne.

Côté interface, le bouton « Restaurer » postait un corps **vide** : la route exige `file`, elle répondait 400 « Fichier requis ». Il était donc mort depuis l'écran Réglages. Une liste déroulante affiche l'inventaire avec ses compteurs — restaurer sans savoir ce que contient le fichier est un pari — et le nom du filet est annoncé après l'opération.

> **Le correctif a mis au jour quatre fuites d'instructions préparées**, toutes du même mécanisme et toutes invisibles jusque-là.
>
> `bun:sqlite` distingue `db.query()`, qui met l'instruction en cache sur la connexion, de `db.prepare()`, qui en crée une nouvelle à chaque appel et laisse à l'appelant le soin de la finaliser. Quatre sites utilisaient `prepare` sans finaliser (`db/reports.ts` × 3, `db/occurrences.ts`), un cinquième utilisait `query` avec un **chemin interpolé dans le SQL** — donc une clé de cache différente par instantané, ce qui revient au même.
>
> Or une instruction vivante empêche la fermeture de la base : `close()` diffère silencieusement. Le descripteur restait ouvert, le fichier verrouillé, et la connexion suivante échouait en `SQLITE_BUSY` **dès son `PRAGMA journal_mode`**. Symptôme : la restauration échouait sur son propre `closeDb()`, une dizaine de requêtes après le démarrage. Diagnostiqué en passant temporairement à `close(true)`, qui lève au lieu de différer.
>
> Deux corollaires : `PRAGMA busy_timeout` est désormais posé **en premier**, avant `journal_mode`, sinon ce tout premier PRAGMA n'a aucun délai de grâce ; et `runInTransaction` (`src/db/index.ts`) mémorise le wrapper de transaction **par instance de base**, parce que `db.transaction(fn)` recompile son jeu d'instructions à chaque construction — construit par requête, il fuyait un jeu par appel.


### N6. Les erreurs HTTP sont consommées comme des succès
🟢 **Corrigé le 21/08/2026.** Les 43 appels passent par `src/lib/api.ts` ; il ne reste aucun `fetch` brut dans `pages/`, `components/` ni `App.tsx`. 🧪 Épinglé par dix tests, dont ceux qui affirment qu'un chargement échoué n'affiche **pas** de chiffre de sécurité — « — » et non « 0 ».

> **Deux défauts trouvés en appliquant le wrapper.** D'abord `fetchJson` renvoyait `undefined` sur un corps illisible en 2xx, alors que son type promet `T` : `HistoryChart` écrivait cet `undefined` dans un état typé et tombait sur `data.length`. Un corps illisible est désormais une erreur. Ensuite le typage a révélé que `data.tool` de la détection d'outil n'était pas rétréci à travers une fermeture — invisible tant que `res.json()` renvoyait `any`.

> **Résiduel refermé le 23/08/2026** avec [N8](#n8--tout-auditer---séquentiel-périmètre-faux-non-annulable-et-verrou-serveur-contradictoire) : `useGlobalAudit` expose un `AbortController`, et la barre de progression porte un bouton Annuler.

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
🟢 **Corrigé le 23/08/2026.** ✅ Verrouillé par `src/db/annotations.test.ts` et six tests d'import dans `src/routes/settings.test.ts`.

**⊕1** — `src/db/annotations.ts`, `src/routes/settings.ts`, `src/lib/aggregator/index.ts`

**La convention `project_id = -1` était inatteignable.** La table `annotations` déclare `FOREIGN KEY (project_id) REFERENCES projects(id)` et la connexion active `PRAGMA foreign_keys = ON` : aucune ligne `-1` ne peut exister. Elle était pourtant employée à trois endroits — l'import la réinjectait, l'agrégateur la lisait (`OR project_id = -1`), et un champ `isGlobal` était exposé au client. La fonctionnalité entière était morte, et `isGlobal` valait toujours `false`.

**Correctif : la notion est retirée, pas matérialisée.** `CONTEXT.md` §7 fixe l'unité de triage au couple **(CVE, projet)** et ne prévoit aucune portée globale ; inventer un projet fictif pour porter des annotations transverses aurait ajouté une entité que le contrat ne connaît pas. La lecture `OR project_id = -1`, le champ `isGlobal` et sa propagation jusqu'à `CveCard` disparaissent.

**L'import n'était pas transactionnel.** L'exception remontait au handler générique, qui répondait 500 — **après** avoir créé ou modifié les projets. L'utilisateur relançait, et faute de déduplication par cible d'audit ([N31](#n31-écarts-au-contrat-contextmd--arbitrage-à-trancher)), les projets étaient recréés en doublon tandis que les annotations restantes n'arrivaient jamais.

**Correctif :** l'import complet passe par `runInTransaction`, la garde de chemin (N3) s'exécute **avant** toute écriture, et la réponse porte les compteurs `{projectsAdded, annotationsAdded, annotationsSkipped}` prévus par §12 — sans quoi un import silencieux ne se distingue pas d'un import qui n'a rien trouvé à faire.

**Le relink passe au chemin de projet.** §12 spécifie `{path, cve, status, note, fixed_in}` : les identifiants sont attribués par auto-incrément, donc un export porteur du seul `project_id` n'était rejouable que sur la base qui l'avait produit. L'export émet désormais les deux — `path` pour la portabilité, `project_id` pour que les versions antérieures relisent le fichier — et l'import préfère le premier.

> **Le contrat épinglé pour ce défaut était faux, et il a fallu le corriger plutôt que le satisfaire.** Il affirmait qu'un import contenant une annotation globale devait **échouer et tout annuler** (`expect(listProjects()).toHaveLength(0)`). Or §12, étape 3, dit l'inverse : « path inconnu / CVE vide **ignorés** ». Une annotation orpheline ne doit pas faire perdre le reste de l'import. Le test a donc été réécrit sur le contrat, et le « rien derrière lui » est vérifié sur le cas où l'échec est réel — un refus de périmètre.
>
> Même leçon que N40 : une entrée d'`ISSUE.md` établit qu'un comportement a été **observé**, pas que la cible qu'elle propose est la bonne. `CONTEXT.md` tranche.


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
🟢 **Corrigé le 22/08/2026.** Les deux formes sont acceptées. 🧪 Le test isole bien le forçage : il vérifie d'abord qu'un appel **sans** forçage est dédupliqué — sinon `deduped: false` ne prouverait rien, un run en erreur n'étant jamais dédupliqué. C'est l'erreur commise à la première écriture de ce test.

**⊕3** — `src/routes/projects.ts:178`

```ts
const force = url.searchParams.get("force") === "true";
```

CONTEXT.md §2 et le récapitulatif d'endpoints spécifient `?force=1`. Le frontend s'est aligné sur le code (`src/pages/Projects.tsx:345` : `?force=true`), ce qui masque le défaut en usage interne — mais tout client conforme au contrat (script CI, appel manuel, documentation) voit son forçage **silencieusement ignoré** et reçoit un rapport dédupliqué en croyant avoir réaudité.

**Correctif :** accepter `1` et `true`, et le documenter. Le forçage est le seul recours quand la fenêtre de fraîcheur masque une CVE nouvellement publiée : un forçage qui échoue en silence est plus dangereux qu'un forçage absent.

### N12. La suppression d'un tag laisse des tags fantômes définitifs
🟢 **Corrigé le 23/08/2026.** ✅ Cinq tests dans `src/db/tags.test.ts`.

`deleteTag` ne supprimait que la ligne du catalogue. Or `CONTEXT.md` §9 spécifie une **cascade fonctionnelle** — « retire le nom de tous les projets le référençant (lit le nom, supprime la ligne, réécrit chaque projet concerné) ». Le nom restait donc dans le JSON `projects.tags`, continuait de s'afficher sur les cartes, mais disparaissait de la liste des filtres, qui vient de `/api/tags` : des projets étiquetés d'un tag inexistant, sur lequel plus aucun filtre ne pouvait porter. État irrécupérable sans éditer chaque projet à la main.

**Correctif :** la cascade est applicative — les tags d'un projet sont un tableau JSON, pas une table de jonction, donc aucune clé étrangère n'est possible. Elle est **transactionnelle** : une suppression appliquée sans les réécritures recrée exactement le défaut. Le filtrage des projets concernés se fait en SQL (`json_each`) plutôt qu'en chargeant tout le parc.

Le rapprochement reste **sensible à la casse**, conformément à §9 : supprimer « legacy » n'emporte pas « Legacy ». Un test le fixe explicitement — l'arbitrage inverse a déjà été tenté à tort une fois (voir N40 et N31).


### N13. `/api/history-global` : deux sévérités perdues, pas de `total`, fuseau local, `days` non validé
🟢 **Corrigé le 23/08/2026.** ✅ Neuf tests dans `src/db/runs.test.ts` et sept dans `src/routes/stats.test.ts`.

**⊕2** — `src/db/runs.ts`, `src/routes/stats.ts`, `src/components/organisms/HistoryChart.tsx`

**Deux sévérités définitivement absentes.** L'agrégation ne cumulait que `critical`, `high`, `moderate` et `low` : `info` et `unknown` n'entraient jamais dans la série, et il n'y avait pas de `total` — alors que §4 le définit comme la somme des **six**. La sortie porte désormais `{date, label, counts, total}`, la forme du contrat.

**`date` n'était pas une date.** Elle portait un libellé d'affichage « JJ/MM » ; la donnée métier vivait dans un champ additionnel `rawDate`. §4 demande `date: "YYYY-MM-DD"`. Les deux sont maintenant nommés pour ce qu'ils sont — `date` et `label`.

**Fuseau.** Les buckets étaient calculés en heure locale (`getFullYear`/`getMonth`) alors que `ran_at` est stocké en UTC : en fin de journée dans un fuseau positif, un run était rangé dans le bucket du lendemain. §4 dit `ran_at[0:10]` — la clé se **découpe dans la chaîne**, sans conversion, ce qui rend le décalage impossible par construction.

> Le test de non-régression a été confronté à l'ancien calcul : il échoue sous `TZ=Asia/Tokyo` et passe sous `TZ=UTC`. Un test de fuseau qui ne tourne qu'en UTC ne prouve rien, et c'est exactement le piège dans lequel l'environnement de CI place ce genre de défaut.

**`days` non validé ni borné.** `parseInt(… || "30", 10)` sans garde : `?days=abc` donnait `NaN`, la boucle de buckets ne tournait pas, et la réponse était `[]` en **200** — un graphique vide sans message, indistinguable d'un parc sans historique. `?days=100000` construisait cent mille buckets, chacun parcourant la map d'état de tous les projets, sur un process unique. La route valide désormais un entier dans `[1, 365]` et refuse en 400. Un `?days=7.5`, que `parseInt` ramenait silencieusement à 7, est également refusé.

**Requête non bornée.** Le `SELECT` chargeait **tous** les runs de tous les projets actifs, quelle que soit la fenêtre. Deux requêtes le remplacent : les runs de la fenêtre, et l'**état d'entrée** — le dernier run non-erreur de chaque projet avant la fenêtre. Sans cet amorçage, un projet audité une seule fois il y a six mois disparaîtrait de la série, ce qui se lirait comme une remédiation. L'amorçage utilise la même définition du « dernier run » que partout ailleurs (§4, voir [N29](#n29-deux-définitions-du--dernier-run--coexistent)).

*Conforme et conservé : un run `error` est ignoré sans écraser l'état connu, l'état est porté dans le temps, la dernière écriture du jour gagne, seuls les projets non ignorés comptent.*

> Le graphique aplatit les points pour recharts, dont le `dataKey` doit désigner la clé du `chartConfig` pour résoudre libellé et couleur. La réponse d'API garde la forme du contrat ; c'est la vue qui s'adapte, pas l'inverse.

### N18. Rate-limit ignoré, et perte du `fixedIn` fourni par l'outil
🟢 **Corrigé le 23/08/2026.** ✅ Quatre tests dans `src/lib/github/index.test.ts`.

**⊕1** — `src/lib/github/index.ts`

La branche « clé non résolvable » préservait correctement `params.originalFixedIn`. Les branches **« quota dépassé »** et **« avis introuvable »** — cette dernière couvrant aussi la panne réseau absorbée par `fetchAdvisory` — renvoyaient `fixedIn: null` sans le répercuter. L'appelant écrivant `fixedIn: res.fixedIn`, la version corrigée que `npm`/`yarn` avaient pourtant fournie était **effacée du run**.

Audit npm de 100 paquets sans jeton : après ~60 appels, GitHub répond 403 avec `x-ratelimit-remaining: 0`. Les 40 vulnérabilités suivantes étaient persistées avec `fixedIn = null` alors que `npm audit` indiquait `fixAvailable.version`. Le référent lisait « aucune correction disponible » à tort, et l'écran Tickets proposait « Version cible : N/A ».

**Correctif :** `originalFixedIn` est le repli dans **toutes** les branches d'échec. Ne rien savoir n'est pas savoir qu'il n'y a rien. Un test vérifie l'inverse aussi : sans version fournie par l'outil, l'échec reste un `null` honnête — le repli n'invente rien.

Le drapeau `rateLimited` reste levé, et il est désormais **effectivement honoré** : `syncAllAdvisories` interrompt sa passe au premier 429 et annonce ce qui reste (livré avec l'enrichissement en masse). La boucle qui l'ignorait — l'enrichissement sur le chemin d'audit — n'existe plus depuis [N1](#n1-github-est-appelé-pendant-chaque-audit).

> ⚠️ **`resolveFixedVersion` n'a plus aucun appelant en production.** Depuis N1, le chemin d'audit passe par `resolveFixedVersionFromCache` (hors ligne) et l'enrichissement en masse par `fetchAdvisory`. Le correctif ci-dessus ferme donc un défaut **latent** : réel, testé, mais qu'aucun écran ne déclenche aujourd'hui. La suppression de cette fonction relève d'un arbitrage de surface non spécifiée — voir [N31](#n31-écarts-au-contrat-contextmd--arbitrage-à-trancher) — et n'a pas été décidée ici.

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
🟡 **Résiduel réduit — revérifié le 23/08/2026.** La transaction unique et les compteurs de réponse ont été livrés avec [N7](#n7-les-annotations-globales-sont-impossibles-et-limport-de-config-meurt-à-mi-parcours), et le relink des annotations passe désormais par `path` comme §12 l'exige.

**Deux écarts subsistent :** la fusion des projets se fait toujours par `slug` au lieu de la **cible d'audit résolue** de §12.2 — deux instances au même chemin sous un nom différent produisent des doublons — et **trois des cinq sections manquent** : `tags`, `prompts` et `tickets`. Un export/import perd donc le catalogue de tags, toute la bibliothèque de prompts et tous les liens de tickets.

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
🟢 **Corrigé le 23/08/2026.** ✅ Verrouillé par `src/lib/audit/queue.test.ts` (23 tests), `src/routes/audit.test.ts`, `src/lib/useGlobalAudit.test.ts`, `src/components/molecules/AuditProgressBar.test.tsx` et cinq tests d'orchestration dans `src/App.test.tsx`.

**⊕4** *(le défaut le plus largement relevé)* — `src/App.tsx`, `src/lib/audit/queue.ts`, `src/routes/audit.ts`, `src/routes/projects.ts`

`CONTEXT.md` §2 : orchestration **côté client** (aucun endpoint batch), **parallèle borné à 4**, sur les projets **visibles**, résultats « triés erreurs d'abord puis projets avec le plus de nouvelles CVE ». Cinq écarts cumulés, tous refermés.

**1. Le verrou serveur interdisait l'orchestration que la spécification prescrit.** Un drapeau de module autorisait un audit à la fois **quel que soit le projet** : un client conforme à §2 voyait trois audits sur quatre échouer systématiquement. C'était le résiduel de C8 — un verrou posé pour protéger un endpoint batch que le contrat interdit, bloquant le mode qu'il demande.

Le verrou est désormais **par projet** (deux audits du même dépôt écriraient deux runs pour un seul état du lockfile), avec un plafond de 4 tous projets confondus : la borne de §2 est ainsi *appliquée* et non seulement demandée. Le refus est un `AuditEnCoursError` typé, que les routes traduisent en **409** — les routes ne font aucune correspondance sur le message, destiné à l'utilisateur.

**2. Deux codes pour un même refus.** `/api/audit/run` répondait 429, `/api/projects/:id/audit` laissait l'exception tomber dans son `catch` générique et sortait en **500** — indistinguable d'un plantage. Les deux répondent 409 : une ressource occupée est un conflit, pas une limite de débit.

**3. Séquentiel.** `for (const p of projets) { await fetch(…) }`. Quinze projets à ~8 s : deux minutes au lieu de trente secondes. L'orchestration est extraite dans `useGlobalAudit`, un pool de quatre travailleurs se servant dans une file partagée — un projet lent n'immobilise pas un créneau pour les suivants. Le lot serveur emprunte le même pool.

**4. Périmètre faux.** `allProjects.filter(p => !p.ignored)` : le `filterTag` de la page Projets vivait dans l'état local d'un composant enfant auquel `App` n'a pas accès, donc filtrer sur « Prod » pour n'auditer que trois projets en auditait quinze. Le filtre est porté par l'**URL** (`?tag=`) : lisible par l'orchestrateur, partageable, et survivant à un rechargement. Premier pas sur [N24](#n24-filtres-et-pagination-hors-de-lurl) ; la mono-sélection reste un écart au OU de §9.

**5. Ni annulation ni délai.** Aucun `AbortController` dans tout le frontend : un `npm audit` qui pend bloquait l'application, et le seul recours était de recharger la page. Le hook en expose un, et la barre de progression porte un bouton **Annuler**. L'annulation n'arrête pas le sous-processus côté serveur — il n'y a pas d'endpoint pour cela — mais elle rend l'interface, ce qui était le vrai blocage. Les projets non lancés figurent au compte-rendu comme *annulés* : un projet absent se lirait comme un projet sain.

**6. UI gelée, console incluse.** `loading || auditing` appliquait `opacity-50 pointer-events-none blur-sm` sur le conteneur englobant `<Routes>`. Or `<Console />` est rendue **dans** `MainLayout`, donc dans ce conteneur : pendant plusieurs minutes, la console live SSE — seul endroit où l'on voit `npm audit` tourner et échouer — était floutée et non cliquable. Le voile ne couvre plus que le chargement initial ; l'audit a sa propre barre non modale.

Le voile annonçait par ailleurs des étapes tirées d'un tableau tournant toutes les 800 ms — « Recherche GHSA », « Calcul de la criticité » — qui ne correspondaient à **aucun travail réel**, §2 interdisant tout appel GitHub pendant un audit. La barre n'annonce que ce qui se passe : combien de projets sont faits, lesquels tournent.

**7. Compte-rendu non trié.** `newCves` est calculé par le serveur et n'était jamais lu, alors que c'est le critère de tri de §2. `trierResultats` applique la règle — erreurs d'abord, puis nouvelles CVE décroissantes, départage stable par nom pour que deux lots identiques rendent le même ordre.

> **Un huitième point d'entrée sans garde de chemin, trouvé en chemin.** `POST /api/audit/run` n'appelait pas `pathGuard` : il lançait l'outil d'audit dans chaque projet — et des commandes git à leur racine, donc les hooks des dépôts — sans vérifier `AEGIS_ALLOWED_ROOTS`. Un projet enregistré avant que la variable ne soit posée restait exécutable par ce chemin, ce qui contredit l'invariant de [N3](#n3-aegis_allowed_roots-nest-pas-appliqué-aux-sous-processus). Les projets hors périmètre sont désormais **écartés du lot** — un seul projet mal placé ne doit pas empêcher d'auditer les autres — et leur nombre est rendu dans `skipped`, sans quoi le lot mentirait sur sa couverture.


### N16. Le `React.memo` de `ProjectCard` est neutralisé par construction
🟡 **Inchangé en substance — revérifié le 23/08/2026.** `src/pages/Projects.tsx` compte 4 `useCallback` (contre 0 à l'origine), mais les autres handlers et le passage de la **map complète** `auditState` sont intacts : la comparaison superficielle de `memo` échoue toujours à chaque événement SSE.

> La prop `tagColors` ajoutée avec [N12](#n12-la-suppression-dun-tag-laisse-des-tags-fantômes-définitifs) est mémoïsée (`useMemo` sur `availableTags`) : elle n'aggrave pas le défaut. C'était le risque, et il a été écarté.

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
🟡 **Résiduel réduit — revérifié le 23/08/2026.** Deux points fermés depuis : l'index `tickets(content_hash)` a été ajouté avec [N41](#n41-content_hash-nest-pas-unique-en-base), et le N+1 sur le cache d'avis a disparu — `buildCveGroups` charge tous les avis en **une** requête (`getAllCachedAdvisories`) au lieu d'une lecture par vulnérabilité, sur le chemin le plus chaud de l'application.

**Résiduel :** l'index `annotations(project_id)` manque toujours ; `buildCveGroups` appelle `getLatestRun` et `getAnnotationsForProject` **par projet** (deux N+1, alors que `getLatestRunsByProjectIds` existe et est corrigé) ; `/api/stats` refait un `getLatestRun` par projet en plus de `buildCveGroups` ; et `broadcast()` lit `DISABLE_CONSOLE` en base à chaque événement.

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
🟡 **Partiellement corrigé le 22/08/2026, revérifié le 23/08/2026.** Le keepalive est retenu dans un handle, annulé par `closeConsoleClients()` et marqué `unref()` — il ne maintient plus le process en vie à lui seul. Les flux SSE sont fermés proprement sur `SIGINT`/`SIGTERM`, ce qui supprime l'`ERR_INCOMPLETE_CHUNKED_ENCODING` que le navigateur journalisait à chaque redémarrage. L'intervalle de messages de chargement de `App.tsx` a bien son `clearInterval` de nettoyage — l'affirmation « aucun `clearInterval` dans `src/` » de la vague 2 n'est plus vraie.

**Résiduel :** sous `bun --hot`, un rechargement à chaud ré-évalue le module sans passer par les gestionnaires de signaux. Un nouvel intervalle s'ajoute donc aux précédents à chaque sauvegarde de fichier, et l'erreur de chunk réapparaît côté navigateur — l'`EventSource` se reconnecte, mais le bruit revient. La partie « état de la file d'audit perdu sous `bun --hot` » reste entière : `isRunning` est réinitialisé alors qu'un lot fire-and-forget continue de tourner sur l'ancienne copie du module.

**⊕1** — `src/lib/console.ts:93-101`, `src/lib/audit/queue.ts:3-6`

Le `setInterval` de keepalive est créé au premier import et jamais annulé — aucun `clearInterval` dans `src/`. Le script de développement étant `bun --hot src/index.ts`, chaque rechargement à chaud ajoute un intervalle aux précédents et réinitialise le `Set clients`, tandis que les contrôleurs SSE précédents restent référencés par les anciens intervalles. Dix sauvegardes de fichier = onze boucles de ping actives.

Le même mécanisme réinitialise `isProcessing`/`completedInBatch` alors qu'un batch lancé en fire-and-forget (`queue.ts:26-40`) continue de tourner sur l'ancienne copie du module : `GET /api/audit/status` renvoie `isRunning:false` pendant qu'un batch est en cours, et un second `POST /api/audit/run` démarre un batch concurrent sur les mêmes projets — deux runs par projet, écritures non sérialisées.

**Correctif :** enregistrer l'intervalle dans un singleton idempotent, l'annuler quand le `Set` de clients est vide, et externaliser l'état de la file hors du module rechargeable.

### N29. Deux définitions du « dernier run » coexistent
🟢 **Corrigé le 23/08/2026.** ✅ Six tests dans `src/db/runs.test.ts`.

`getLatestRun` respectait §4 (`ORDER BY ran_at DESC, id DESC`) ; la variante batch employée par `GET /api/projects` retenait `MAX(id)`. Les deux coïncident tant que les identifiants sont monotones avec le temps, mais divergent après une restauration de snapshot ou un import de runs hors ordre chronologique — **et silencieusement** : la carte projet affichait un run, l'agrégation CVE et la déduplication d'audit en utilisaient un autre.

**Correctif :** la variante batch passe par `ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY ran_at DESC, id DESC)`, seul moyen de trier sur deux colonnes dans l'agrégat. Une seule définition, écrite une seule fois.

Défaut connexe refermé dans le même mouvement : `IN (${ids})` était construit par concaténation de chaîne. Les valeurs venaient d'un `SELECT id FROM projects`, donc rien n'était exploitable en l'état, mais un appelant passant un `parseInt` non gardé produisait `IN (NaN)`, soit un 500 « no such column: NaN ». Les identifiants passent en bindings, et un test le vérifie avec `Number.NaN`.


### N30. Le contexte projet n'enveloppe pas les commandes git du listing
🔴 **Ouvert — vérifié le 21/08/2026.** 0 occurrence de `projectContext` dans le handler `GET /api/projects`.

**⊕1** — `src/routes/projects.ts:74-91` et `:122`

CONTEXT.md §11 : « Aux points d'entrée liés à un projet, l'exécution est **enveloppée** dans ce contexte (audit d'un projet, **calcul git par projet lors du listing**, fetch, pull). » `git-fetch` (`:150`), `git-pull` (`:166`) et l'audit (`:189`) le font ; le listing et `GET /api/projects/:id` ne le font pas.

À chaque rafraîchissement de la liste, jusqu'à 6 commandes git **par projet** défilent dans la console sans champ `project` — le flux devient illisible, exactement le cas que le contexte asynchrone doit couvrir.

**Correctif :** envelopper `getGitInfo` dans `projectContext.run({ project: p.name }, …)` dans les deux handlers.

### N34. `parseCvssVector` écarte toujours le premier segment
🟢 **Corrigé le 22/08/2026** — relevé par la suite de tests — `src/lib/cvss.ts`

```ts
const parts = vector.split("/");
const metrics = parts.slice(1);   // suppose le préfixe « CVSS:3.1 »
```

Le `slice(1)` suppose que le premier segment est toujours le préfixe de version. Un vecteur transmis sans préfixe — ce que produisent certaines sources d'avis, et ce que peut saisir un humain — perd donc sa **première métrique**, silencieusement : `AV:N/AC:L` ne remonte que `AC:L`, et l'infobulle affiche un vecteur amputé sans signaler quoi que ce soit.

🧪 Épinglé dans `src/lib/cvss.test.ts` : « le premier segment est toujours écarté — écart documenté ».

**Correctif :** n'écarter le premier segment que s'il correspond à `/^CVSS:\d/`.

### N35. 500 au lieu de 400 sur les routes qui lisent `req.json()` directement
🟢 **Corrigé le 22/08/2026** — relevé par la suite de tests — `src/routes/reports.ts`, `src/routes/cves.ts` (`/api/advisories/sync`), `src/routes/settings.ts` (`/api/config/import`), `src/routes/tickets.ts`

Trois routes n'utilisent pas `parseBody` et appellent `await req.json()` à nu. Sur un corps malformé, l'exception remonte au gestionnaire d'erreur global de `Bun.serve`, qui répond **500 « Internal Server Error »** — là où toutes les routes validées répondent 400 `{ error: "JSON invalide" }`.

Le contrat d'erreur de l'API n'est donc pas uniforme, et un client ne peut pas distinguer « ma requête est mal formée » de « le serveur est en panne ». Aggravant : `reportBodySchema` **existe déjà** dans `src/lib/schemas.ts` et n'est branché nulle part, si bien qu'un corps incomplet casse au moment du `JSON.stringify` en base.

🧪 Épinglé dans `src/routes/reports.test.ts`, `src/routes/cves.test.ts` et `src/routes/settings.test.ts`.

**Correctif :** brancher `parseBody` sur ces routes, en commençant par `reportBodySchema`, déjà écrit.

### N36. Une méthode non déclarée renvoie du HTML en 200
🟢 **Corrigé le 22/08/2026** — relevé par la suite de tests — `src/index.ts` (fourre-tout `"/*"`)

Un chemin `/api/…` inconnu, ou une route déclarée atteinte avec une méthode qu'elle n'expose pas (`GET /api/annotations`, qui n'existe qu'en `POST`), ne reçoit ni 404 ni 405 : la requête tombe dans le fourre-tout `"/*"` et récupère `index.html`. Le client obtient **200 avec du `text/html`**, échoue à son `res.json()` sur une `SyntaxError` — « Unexpected token < » — et n'a aucun indice sur la cause réelle.

🧪 Épinglé dans `src/index.test.ts`, sous deux angles : chemin inconnu et méthode non déclarée.

**Correctif :** placer avant le fourre-tout une route `"/api/*"` répondant 404 en JSON, afin que le fallback SPA ne capte que la navigation client.

### N37. `DELETE` sur un identifiant inconnu répond succès
🟢 **Corrigé le 22/08/2026** — relevé par la suite de tests — `src/routes/projects.ts`, `src/routes/tags.ts`, `src/routes/prompts.ts`, `src/routes/reports.ts`

Aucune des quatre routes de suppression ne vérifie l'existence de la ligne : `DELETE FROM … WHERE id = ?` est idempotent côté SQL, et le handler répond `{success:true}` ou 204 dans tous les cas. L'interface ne peut donc pas distinguer « supprimé » de « n'existait pas », ce qui masque une désynchronisation entre la liste affichée et l'état réel — précisément le symptôme de [N19](#n19-létat-serveur-nest-jamais-invalidé-après-une-mutation).

🧪 Épinglé dans les quatre fichiers de test de routes correspondants.

**Correctif :** renvoyer 404 quand aucune ligne n'est affectée (`changes === 0`).

### N38. `getReports` trie par `created_at` seul
🟢 **Corrigé le 22/08/2026** — relevé par la suite de tests — `src/db/reports.ts`

`ORDER BY created_at DESC` sans départage par `id`, sur un horodatage à la seconde. Deux « Tout auditer » lancés dans la même seconde remontent dans un ordre **indéfini** — et c'est l'ordre qui détermine quel compte-rendu l'écran Rapports compare au précédent. Le même défaut a déjà été traité sur les runs (`getLatestRun` départage par `ran_at DESC, id DESC`).

🧪 Épinglé dans `src/db/reports.test.ts` : « à `created_at` égal, l'ordre n'est pas garanti — écart documenté ».

**Correctif :** `ORDER BY created_at DESC, id DESC`.

### N39. La progression du lot d'audit n'est pas observable après coup
🟢 **Corrigé le 23/08/2026.** ✅ Cinq tests dans `src/lib/audit/queue.test.ts`.

À la fin du lot, `enqueueGlobalAudit` remettait `completedInBatch` et `totalInBatch` à zéro. Un client qui sondait `/api/audit/status` après le dernier projet lisait `progress: 0, total: 1` — indistinguable d'un état au repos. Impossible de savoir, depuis l'API, si un lot venait de se terminer ou n'avait jamais eu lieu, donc impossible d'afficher un compte-rendu final sans sonder assez vite pour attraper le lot en vol.

**Correctif :** `lastCompleted`, `lastTotal` et `lastFinishedAt` conservent le bilan du dernier lot terminé. Trois `null` avant tout lot, et non des zéros : un bilan à zéro se lirait « un lot a tourné et n'a rien trouvé », soit précisément la confusion que le correctif lève. `progress`/`total` gardent leur sémantique « en cours ».

`resetAuditHistory()` est appelé par `POST /api/config/reset` : un bilan qui survit à la suppression des projets qu'il décomptait n'a plus de sens.


### N41. `content_hash` n'est pas unique en base
🟢 **Corrigé le 23/08/2026.** ✅ Trois tests dans `src/db/tickets.test.ts` et un test de route dans `src/routes/tickets.test.ts`.

`content_hash` est le garde-fou anti-doublon de la création de tickets Jira : `POST /api/tickets/create` hache la charge et refuse en 409 si `getTicketByHash` trouve une correspondance. Mais le hash portait sur la seule charge Jira, donc **deux projets partageant paquet et CVE produisaient la même empreinte**. `getTicketByHash` en renvoyait un arbitrairement : le second projet recevait un 409 citant la référence d'un ticket appartenant au premier, sur lequel son référent n'a aucune prise.

**Correctif :** `projectId` entre dans l'empreinte — deux projets ne peuvent plus collisionner — et `getTicketByHash` accepte une portée projet, en ceinture et bretelles. Un index couvre la colonne, interrogée par égalité (défaut connexe noté en N21).

> **Le contrat épinglé proposait autre chose : une contrainte `UNIQUE` sur la colonne, qui aurait levé sur collision.** Écarté pour deux raisons. D'abord la contrainte traite le symptôme et non la cause : avec le projet dans l'empreinte, la collision n'existe plus. Ensuite l'ajout est un danger de migration — `CREATE UNIQUE INDEX` échoue sur une base portant déjà des doublons produits par la version fautive, et l'échec se produirait dans `initDb`, donc au démarrage. Le correctif de l'entrée prescrivait déjà la voie retenue.


### N42. `commit_sha` peut valoir la chaîne `"HEAD"`
🟢 **Corrigé le 22/08/2026** — relevé par la suite de tests — `src/lib/git/index.ts` (`getGitInfo`)

Sur une branche non née — dépôt fraîchement `git init`, sans commit — `git rev-parse HEAD` écrit « fatal: ambiguous argument 'HEAD' » sur **stderr** mais renvoie la chaîne littérale `HEAD` sur **stdout**. Le filtre ne cherche `fatal:` que dans stdout :

```ts
const sha = await runGit(["rev-parse", "HEAD"], cwd, true);
if (sha && !sha.includes("fatal:")) info.sha = sha;   // ← accepte « HEAD »
```

`commit_sha` peut donc être persisté à `"HEAD"`, valeur qui **satisfait la condition de déduplication** `lastRun.commit_sha === gitInfo.sha` : deux audits successifs sur un dépôt sans commit se dédupliquent l'un contre l'autre. Même cause pour `info.branch`.

🧪 Épinglé dans `src/lib/git/index.test.ts` : « un dépôt sans commit expose « HEAD » comme SHA — écart documenté ».

**Correctif :** tester le code de sortie de `git rev-parse` plutôt que d'inspecter stdout, ou valider la forme `/^[0-9a-f]{40}$/`.

### N43. Le repli « Déjà à jour. » de `gitFetch` est inatteignable
🟢 **Corrigé le 22/08/2026** — relevé par la suite de tests — `src/lib/git/index.ts` (`gitFetch`)

Le repli existe pour éviter d'afficher un journal vide, qui se lit comme un échec. Mais la commande est lancée avec `--verbose`, ce qui fait écrire à git `= [up to date]  main -> origin/main` même quand rien ne change : `log.trim() === ""` n'est donc jamais vrai dès qu'un amont existe. Le seul cas où le repli s'applique est un dépôt **sans remote configuré** — où il affiche « Déjà à jour. » alors que rien n'a été tenté, ce qui est le message le plus trompeur possible.

🧪 Épinglé dans `src/lib/git/index.test.ts`, sous les deux angles.

**Correctif :** distinguer les trois cas — pas de remote (message explicite), à jour, mis à jour — depuis le code de sortie et la sortie de git, plutôt que depuis la vacuité du journal.

### C9. `initDb` ignore son paramètre
🟢 **Corrigé le 23/08/2026.** ✅ Couvert par les tests de `db/index` et, indirectement, par tout le chemin de restauration.

**⊕1** — `src/db/index.ts`

La fonction recevait `database: Database` et l'utilisait correctement jusqu'aux migrations tardives, puis retombait sur la variable globale `db!`. Le code fonctionnait parce que les deux références coïncidaient au démarrage normal.

Le point sous-estimé : la forme employée était `db?.query(...)`. Sur une autre instance, elle **n'échouait pas** — elle ne faisait rien du tout. La migration était donc silencieusement sautée, et l'application continuait sur un schéma qu'elle croyait à jour. C'est le mode de défaillance le plus difficile à diagnostiquer, et il visait précisément le scénario de la restauration.

**Correctif :** `database` partout. Dans le même mouvement, `dbPath()` devient la **source de vérité unique** du chemin de base : trois modules le recomposaient de leur côté (`reset.ts`, `advisories.ts`, et la sauvegarde, qui visait un fichier différent — voir [N2](#n2-la-restauration-de-snapshot-ne-restaure-rien)).

---

## 🔵 Priorité 4 — UX & accessibilité

### N9. Le triage est impraticable au-delà de quelques CVE
🟢 **Corrigé le 23/08/2026.** ✅ Verrouillé par `describe("enchaînement des décisions (N9, corrigé)")` dans `src/pages/Triage.test.tsx`.

**⊕3** — `src/components/organisms/CveCard.tsx`, `src/components/organisms/CveDetailsModal.tsx`, `src/pages/Triage.tsx`

La page annonçait un workflow « Zero-Inbox » que deux mécanismes rendaient inutilisable.

**1. La modale se fermait après chaque décision.** Chaque bouton de statut appelait `updateStatus(...)` **puis** `onActionComplete()`, câblé sur `setSelectedGroup(null)`. La cause profonde n'était pas la fermeture mais ce qu'elle masquait : `selectedGroup` était un **instantané figé** issu du `useMemo` `packageGroups` — après `fetchCves()` le memo était recalculé, mais l'objet retenu restait l'ancien, avec l'ancien `status`. Fermer la modale cachait la désynchronisation au lieu de la corriger.

Un package `lodash` à 8 CVE coûtait donc 8 cycles ouvrir/statuer/rouvrir et 8 reconstructions complètes de l'agrégat serveur. Le chemin « Confirmé » coûtait plus encore : clic → fermeture → ouverture de `ConfirmReasonModal` → saisie → validation, soit 4 interactions et deux changements de contexte pour une seule CVE.

**Correctif :** l'état retient la **clé** du groupe (`selectedKey`), et le groupe affiché est **dérivé** de `packageGroups` à chaque rendu. Les deux moitiés tombent d'un coup — la modale reste ouverte *et* à jour. `onActionComplete` est supprimé de `CveCard` : une carte n'a pas à fermer le conteneur qui l'affiche. `CveDetailsModal.setSelectedGroup`, qui n'était jamais appelée qu'avec `null`, devient `onClose`.

La décision est en outre **appliquée localement avant le refetch** (`appliquerStatut`). Le rechargement reconstruit tout l'agrégat serveur ; sans cette étape le badge restait sur son ancien statut le temps de l'aller-retour, et le référent ne savait pas si son clic avait porté. Réalisé en `setState` plutôt qu'en `useOptimistic` : la valeur locale doit **survivre** au refetch, pas être annulée à la fin de la transition.

**2. La pagination retombait page 1.** `useEffect(() => setPage(1), [cves, …])`, et `cves` est un tableau **neuf** à chaque refetch, donc après **toute** annotation. `cves` est retiré des dépendances : seuls les critères de filtrage remettent la pagination à la première page.

Ce retrait crée un corollaire qu'il fallait traiter dans le même mouvement : plus rien ne ramenait `page` dans les bornes si la liste raccourcissait. La page s'affichait alors vide — ce qui, sur un écran de triage, se lit comme « plus rien à traiter ». Un second effet borne `page` à `totalPages`. Son test le vérifie sur les **lignes rendues**, pas sur le pied de pagination : à 11 éléments, `Math.min` fait afficher « 11 à 11 sur 11 » que la page soit 2 ou 3, si bien qu'une assertion sur ce texte aurait été vide de sens.

> **Sur la moitié « non reproductible » du 21/08/2026.** L'entrée précédente concluait que la pagination ne retombait pas page 1, sur la base d'une mesure. Le test qui « prouvait » d'abord le défaut était faux — `toContain("Affichage de 1")` passe sur `"Affichage de 11 à 15"`, dont il est un préfixe — et sa correction en assertion exacte a montré l'inverse. Le mécanisme décrit était pourtant bien présent dans le code ; le harnais masquait son effet. La dépendance a été retirée quand même : un effet qui remet la pagination à zéro sur chaque refetch est faux indépendamment de ce qu'un test arrive à observer.

### N14. Sévérité illisible : palette sans couleur de texte, et préfixes `dark:` amputés
🟢 **Corrigé le 23/08/2026.** ✅ Verrouillé par `src/lib/triage-constants.test.tsx` (palette) et `src/lib/tailwind-classes.test.ts` (intégrité des classes sur tout l'arbre).

**⊕1** — `src/lib/triage-constants.tsx`, les atomes de `src/components/ui/`, `styles/globals.css`

**(a) L'information de gravité n'était portée par rien de lisible.** `SEVERITY_COLORS` ne contenait qu'un fond translucide (`"bg-red-500/10  "` — les doubles espaces marquaient l'endroit où texte et bordure avaient disparu) : aucune couleur de texte, aucune bordure. `SEVERITY_ICONS` n'avait aucune classe de couleur, et `low` et `info` partageaient `Info`, donc deux niveaux différents rendus par le même pictogramme. Sur carte blanche, `critical` et `moderate` ne se distinguaient que par une nuance très pâle — information portée par la seule couleur (WCAG 1.4.1), sur une teinte frôlant le seuil non-textuel (WCAG 1.4.11).

**Correctif :** fond + texte + bordure par niveau, teinte 700 en clair et 300 en sombre (la 500 ne tient le ratio 4,5:1 sur aucun des deux fonds), six formes distinctes, et les icônes héritent de `currentColor`. Un `SEVERITY_LABELS` est ajouté : les écrans écrivaient les libellés en dur, un `&&` par niveau, si bien que `low`, `info` et `unknown` n'affichaient **rien** dans la modale de rapport — une faille basse y apparaissait sans aucun indicateur de gravité. Même défaut refermé sur la note de santé globale (`GRADE_COLORS` dans `Overview.tsx`) et sur le badge de SLA de `CveCard`.

**(b) Des préfixes de variante avaient été amputés.** Onze occurrences, dont neuf dans les atomes Shadcn — donc propagées à toute l'application : `button.tsx` (4), `select.tsx`, `textarea.tsx`, `badge.tsx` (2), `input.tsx`, `tabs.tsx`, plus `TriageTable.tsx`. Une classe commençant par `:` ne résout rien, et **rien ne la signalait** : Tailwind ignore silencieusement ce qu'il ne reconnaît pas, Biome ne lit pas le contenu des chaînes, `tsc` non plus.

Le `grep` a débordé du périmètre annoncé et trouvé deux familles voisines : des **valeurs arbitraires tronquées** (`(var(--primary),0.2)]` dans `Header.tsx`, `(255,255,255,0.1)]` dans `Reports.tsx`) et quatre **voiles morts** dans `Overview.tsx` — `absolute inset-0 /5 opacity-0`, dont le fond avait disparu et qu'aucun `group-hover` ne révélait, donc quatre nœuds invisibles en permanence.

**Correctif :** les onze préfixes restaurés, les fragments tronqués retirés, les voiles morts supprimés. Le garde-fou de test balaie désormais **tout** `src/` sur trois motifs, là où la version précédente ne couvrait que `button.tsx` alors que le défaut touchait huit fichiers.

**(c) Le thème sombre était à moitié câblé.** `styles/globals.css` ne déclarait **aucun** token sombre. Or en Tailwind v4 la variante `dark:` est adossée par défaut à `prefers-color-scheme` : sur un système en thème sombre, **les utilitaires basculaient et les variables CSS non**. Fond clair, texte clair par-dessus, et des composants calibrés pour le sombre posés sur des cartes blanches. Le README annonçait un « support Light / Dark mode natif ».

**Correctif :** jeu de tokens sombre complet, sous `@media (prefers-color-scheme: dark)` pour suivre le système et sous `.dark` pour forcer — ce dernier étant le sélecteur que `ui/chart.tsx` attendait déjà. Les couleurs calibrées pour le sombre et appliquées sans condition sont recalibrées sur les deux thèmes (13 sites : liens Jira, retards git, quotas, `bg-white/5`, `scrollbar-color`). `ConsoleLogItem` servait de référence — c'était le seul fichier à gérer correctement les deux thèmes.

> ⚠️ Conséquence visible : un utilisateur dont le système est en thème sombre verra désormais Aegis en sombre. Ce n'est pas un changement de comportement mais la fin d'une incohérence — les utilitaires `dark:` basculaient déjà pour lui.

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
🟡 **Partiellement corrigé — revérifié le 23/08/2026.** Le filtre par tag de la page Projets est passé dans l'URL (`?tag=`) avec [N8](#n8--tout-auditer---séquentiel-périmètre-faux-non-annulable-et-verrou-serveur-contradictoire) : c'était la condition pour que l'orchestrateur connaisse le périmètre d'audit (§2 le fixe aux projets *visibles*). Il survit donc à un rechargement et se partage par lien.

**Résiduel :** la **pagination** du triage reste hors de l'URL, et le filtre par tag est **mono-sélection** alors que §9 décrit un ensemble avec logique OU — choisir « backend » remplace « prod » au lieu de cumuler.

**⊕3** — `src/pages/Projects.tsx:47,58,780,817`, `src/pages/Triage.tsx:37-38,58`

Seuls `project` et `cve` transitent par l'URL (`Triage.tsx:19-21`). `filterTag`, `viewMode`, `page`, `itemsPerPage` et `hideProcessed` sont de l'état local. Comme les pages sont des `element` de route (`App.tsx:218-222`), quitter la page les **détruit**.

- Le référent filtre les projets sur « Prod » en vue Tableau, ouvre une CVE, revient : filtre perdu, vue revenue en Grille.
- Il ne peut pas envoyer à son équipe un lien vers « les CVE non traitées du projet 12, page 3 » — alors que §7 désigne ce partage comme un usage central du référent sécurité.

Défaut de fond associé : `filterTag` est une valeur **unique** (`string | null`) — cliquer « Prod » remplace « Backend ». §9 spécifie un ensemble `selectedTags` avec **logique OU** (`selectedTags.size === 0 || p.tags.some(t => selectedTags.has(t))`) : « Prod OU Backend » est impossible. Et comme cet état n'est pas remonté, il n'est pas le périmètre de « Tout auditer » ([N8](#n8--tout-auditer---séquentiel-périmètre-faux-non-annulable-et-verrou-serveur-contradictoire)), contrairement à §2 et §9.

Défaut d'affichage associé : l'état vide de la page Projets (`:767-776`) est conditionné à `projects.length === 0`. Si un tag ne matche aucun projet, la grille rend **zéro carte sous les boutons de filtre**, sans un mot d'explication — l'utilisateur croit avoir perdu ses projets.

**Correctifs :** porter ces états dans les `searchParams` (`useSearchParams` est déjà utilisé dans `Triage`), valeurs par défaut absentes de l'URL pour garder les liens propres ; passer le filtre tags en multi-sélection (Set + OU) ; ajouter un état « Aucun projet pour ce filtre » avec réinitialisation.

### N25. `TicketModal` : les notes fuient d'un ticket à l'autre
🟢 **Corrigé le 23/08/2026.** ✅ Quatre tests dans `src/components/organisms/TicketModal.test.tsx`.

**⊕1** — `src/components/organisms/TicketModal.tsx`

`const [notes, setNotes] = useState("")` dans un composant rendu **inconditionnellement** par la page Triage : seul le `DialogContent` de Radix est démonté à la fermeture, jamais son parent. La note n'était donc réinitialisée nulle part — ni à l'annulation, ni après une création réussie.

Le référent rédigeait une recommandation pour `lodash`, annulait, ouvrait le ticket d'`axios` : le champ contenait encore celle de `lodash`, et elle partait dans le ticket Jira si personne ne la repérait.

**Correctif — structurel plutôt que ponctuel.** L'entrée proposait de réinitialiser à l'ouverture, ou de poser une `key`. L'état de saisie est descendu **sous** le `DialogContent`, dans un `FormulaireTicket` que Radix démonte à chaque fermeture : l'oubli n'est plus possible, et tout état ajouté là plus tard bénéficie de la même garantie. Une `key` dérivée du paquet couvre en plus le changement de cible **sans** fermeture — cas non atteignable par l'interface, le dialogue étant modal, mais qui coûte un attribut à fermer.

Conséquence assumée : un brouillon abandonné est perdu, y compris en réouvrant le même paquet. « Annuler » annule.

> **Le test existant validait le défaut sous un nom qui promettait l'inverse.** Il s'appelait « les notes ne fuient pas d'un ticket au suivant » et affirmait `toHaveValue("note pour lodash")` — donc la fuite. Il **passait encore après le correctif structurel**, parce qu'il ne fermait jamais le dialogue : il n'exerçait que le cas non atteignable. Les quatre tests qui le remplacent ont été confrontés au défaut d'origine, état remonté dans la coquille : ils rougissent tous les quatre. Un nom de test n'est pas une assertion.

### N40. Les noms de tags sont sensibles à la casse
⚫ **Ce n'est pas un défaut — reclassé le 22/08/2026 en écart de contrat à arbitrer ([N31](#n31-écarts-au-contrat-contextmd--arbitrage-à-trancher)).**

`CONTEXT.md` §9 le spécifie explicitement : « Dédup **sensible casse/espaces internes** (« web » ≠ « Web ») ». La sensibilité à la casse est donc la règle métier, pas un oubli.

> ⚠️ **J'ai corrigé cette entrée à tort le 22/08/2026**, en posant un index unique `COLLATE NOCASE` et une migration qui **fusionnait les tags** dont les noms ne différaient que par la casse. Le code contredisait le contrat, et la migration a détruit des données sur les instances où elle a tourné. Les deux ont été annulés le même jour ; les tags fusionnés sont perdus et doivent être recréés à la main.
>
> La leçon : une entrée d'`ISSUE.md` marquée « écart documenté » n'établit pas que le comportement est fautif. Elle établit qu'il a été **observé**. Confronter au contrat **avant** de corriger — ce qui n'avait pas été fait ici.

L'argument d'origine reste valable comme **question produit** : deux filtres visuellement identiques dans la page Projets, chacun ne correspondant qu'à une partie des projets, sont une source d'erreur réelle. Mais y répondre demande de modifier `CONTEXT.md`, pas le code — et cela relève de l'arbitrage de N31, avec les autres écarts de contrat.

Défaut annexe relevé au passage, celui-là bien réel : le message de collision est « Un tag avec ce nom existe déjà » là où §9 spécifie « Tag déjà existant ». — `src/db/index.ts` (table `tags`), `src/db/tags.ts`

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
🔴 **Aggravé — remesuré le 23/08/2026** — entrée conservée depuis la vague 1

| Fichier | Lignes (21/08) | Lignes (23/08) |
|---|---:|---:|
| `src/pages/Projects.tsx` | 1168 | **1125** |
| `src/pages/Settings.tsx` | 653 | **890** |
| `src/pages/Reports.tsx` | 662 | **632** |
| `src/pages/Triage.tsx` | 403 | **588** |

**Le bilan de la session du 23/08 est mitigé, et il faut le dire :** `Projects.tsx` a perdu 43 lignes (extraction de `TagBadge`, `FullScreenOverlay`), `Reports.tsx` 30 (extraction de `VulnDiffRow`), mais `Settings.tsx` a pris **237 lignes** avec le sélecteur d'instantanés de [N2](#n2-la-restauration-de-snapshot-ne-restaure-rien) et `Triage.tsx` **185** avec l'enrichissement GHSA et les dates. Le total des quatre pages est passé de 2886 à 3235 lignes.

Ce qui a été extrait l'a été correctement — `useGlobalAudit` a sorti l'orchestration de `App.tsx`, qui perd 60 lignes — mais chaque fonctionnalité ajoutée atterrit encore dans la page. Les pages portent l'état, les appels réseau, l'orchestration et le markup : c'est la racine commune de [N16](#n16-le-reactmemo-de-projectcard-est-neutralisé-par-construction) (handlers non mémoïsés), [N19](#n19-létat-serveur-nest-jamais-invalidé-après-une-mutation) (état serveur local) et [N24](#n24-filtres-et-pagination-hors-de-lurl) (filtres non partagés).

À traiter de façon opportuniste, à l'occasion de ces correctifs, plutôt qu'en refactor dédié — la valeur utilisateur est nulle et le risque de régression réel. La contrepartie tient : les 434 tests de composants couvrent ces pages, donc un découpage est vérifiable.

### N31. Écarts au contrat CONTEXT.md — arbitrage à trancher
🟡 **Arbitré le 23/08/2026 sur le principe ; l'application reste à finir.**

## La décision rendue

**`CONTEXT.md` était obsolète et a été supprimé.** C'était un prompt de reconstruction, écrit *avant* l'application pour la faire naître ; le produit a dépassé son niveau de détail. Un nouveau document le remplace, découpé en quinze fichiers (`docs/context/NN-*.md`) décrivant le produit **tel qu'il est construit**. L'ancienne version reste dans l'historique git (`git show 92ffb14:docs/CONTEXT.md`).

Le sens de la marche était le point à décider, et il est tranché : **on réaligne le document sur le produit**, pas l'inverse. Ramener le produit au contrat aurait coûté la suppression de l'intégration Jira, de l'ingestion CI et des SLA — indéfendable.

La numérotation `§1`–`§12` est conservée, les 124 renvois du code restent donc valides. `§13`–`§15` couvrent ce qui existait sans être décrit : ingestion CI, comptes-rendus d'audit, invariants de sécurité.

## Ce que la réécriture a réglé

Les quatorze fonctionnalités « implémentées, non spécifiées » sont désormais **décrites** : Jira réel, ingestion CI, comptes-rendus, `cve_occurrences` et les deux compteurs d'âge, CVSS, base d'avis séparée, remise à zéro, enrichissement GHSA en masse, instantanés, `AEGIS_ALLOWED_ROOTS`/`AEGIS_INGEST_TOKEN`/`HOST`, colonnes `slug`/`is_remote`, `?days=` borné, `?tag=`, champs de statut du lot. Elles ne sont plus des écarts.

Les dix écarts « spécifié, absent ou divergent » sont conservés **en tant que défauts nommés** dans le nouveau document, avec un ⚠️ à l'endroit concerné plutôt qu'en liste séparée — un lecteur qui ouvre `context/01-projets.md` voit sur place que la détection d'outil ne teste pas `bun.lock`.

## Ce qui reste à faire

**Trois manques du contrat, à implémenter — le document a raison, le code est en retard :**

| Manquant | Ce que ça coûte | Où |
|---|---|---|
| `GET /api/projects/:id/history` | impossible de voir l'historique d'un projet, donc de repérer des erreurs répétées. `getRunsForProject` existe et est testée | [§4](context/04-historique.md) |
| `DELETE /api/runs/:id` | un run pollué reste l'état courant jusqu'au prochain audit. `deleteRun` existe et est testée | [§4](context/04-historique.md) |
| §12 niveau 1 — sauvegarde config JSON automatique | aucune sauvegarde périodique, aucun historique daté. C'était le mensonge le plus large de l'ancien contrat : les « + sauvegarde » de cinq sections étaient inopérants | [§12](context/12-sauvegarde.md) |

**Deux remplacements par moins bien, à corriger :**

1. **`/api/advisories/sync` ne persiste aucune annotation**, là où `/api/annotations/fetch-fix` le prévoyait. `setAnnotationFix` n'est appelée que par son test. Perte fonctionnelle réelle, pas un renommage.
2. **Basculer `ignored` passe par le `PUT`**, qui réécrit nom, chemin, type, outil et tags à chaque fois. Un endpoint dédié serait plus sûr.

**Trois divergences de détail, dont une bloque un déploiement :**

- `AEGIS_PORT` défaut **3001** là où l'ancien contrat annonçait `PORT` défaut 3000 : un déploiement suivant la doc démarrait sur le mauvais port. **Le nouveau document dit `AEGIS_PORT`** — écart fermé par la réécriture.
- `AUDIT_MAX_AGE_HOURS` n'est **jamais lu depuis l'environnement**, uniquement dans la table `settings`. Documenté comme tel, à décider s'il faut l'ajouter.
- Les prompts sont triés par `title ASC` et non par création décroissante. Documenté comme tel.

**Un endpoint dont l'usage est établi, et une migration à instruire :**

> `POST /api/audit/run` est appelé par un **cron sur la machine Aegis**, qui audite périodiquement tous les projets présents en local. Aucun écran ne l'appelle — le bouton « Lancer l'audit global » orchestre côté client, conformément à [§2](context/02-audits.md) — mais l'endpoint a bien un appelant, et il est **conservé et documenté** comme mode de déclenchement sans navigateur.
>
> La question ouverte est ailleurs : **faut-il le remplacer par un cron d'ingestion par projet** ([§13](context/13-ingestion-ci.md)) ? Le gain serait réel — plus aucun code à garder en local sur la machine Aegis, plus aucun outil d'audit à y installer, et le lockfile audité devient celui du build. Trois choses se perdraient en revanche : la **déduplication par commit**, l'**état git** (`ahead`/`behind`, `dirty`, bannière de retard), et la configuration en un seul endroit.
>
> ⚠️ **Prérequis à cette migration : doter l'ingestion d'une déduplication.** Son absence est délibérée et convient à une CI — un push, un build, un run qui a du sens — mais un cron horaire produirait vingt-quatre runs identiques par jour et par projet. L'historique et la série globale en seraient noyés. C'est le seul point bloquant, et il est petit : la barrière de §2 existe déjà, il s'agit de l'appliquer au chemin d'ingestion quand un `?sha=` est fourni.

## Leçon consignée

**Deux arbitrages avaient déjà été rendus en chemin, tous deux en faveur du contrat** quand il était explicite : les annotations globales (retirées, §7 fixe l'unité au couple CVE/projet) et la casse des noms de tags (rétablie après avoir été « corrigée » à tort, avec une migration destructive à la clé — §9 la spécifie).

Le précédent tient : **quand le document est explicite, il gagne.** Les écarts qui ont demandé un arbitrage étaient ceux où il était **muet** — et c'est exactement ce que la réécriture supprime, en décrivant ce qui existe au lieu de ce qui était imaginé.


---

## 🎯 Ordre de traitement recommandé

Révisé le **23/08/2026**. Les dix premiers points sont faits ; ce qui reste tient en un arbitrage et trois familles.

**Ce qui a été appris en les traitant, et qui vaut pour la suite :** sept correctifs sur dix ont débordé de leur périmètre annoncé, et à chaque fois pour la même raison — l'entrée décrivait le symptôme, pas la cause. N14 devait toucher une palette et a révélé onze classes amputées plus l'absence de tokens sombres ; N2 devait corriger un chemin et a révélé quatre fuites d'instructions préparées qui empêchaient la base de se fermer ; N8 devait paralléliser une boucle et a révélé un point d'entrée sans garde de chemin. Prévoir un correctif « bon marché » sur cette liste est un pari perdant.

1. ~~**N32**~~ — ✅ **fait le 21/08/2026.** Le seul défaut de cette liste qui détruisait du travail humain à chaque clic.
2. **[N5](#n5-get-apisettings-expose-les-secrets-en-clair), [N4](#n4-ssrf-authentifié-via-apiticketstest-connection), résiduel de [N3](#n3-put-apiprojectsid--aucune-validation-aucune-garde-de-chemin)** — surface d'attaque. Le résiduel de N3 se limite désormais à trois points : `pathGuard` sur `git-fetch`/`git-pull`, garde sur `/api/config/import`, et `isPathAllowed` en défaut **fermé**.
3. **[N6](#n6-les-erreurs-http-sont-consommées-comme-des-succès)** — un wrapper `fetchJson` unique couvre les 43 appels et supprime d'un coup le faux négatif « écosystème sain » et les rapports d'audit faux persistés en base.
4. **[N1](#n1-github-est-appelé-pendant-chaque-audit)** — sortir l'enrichissement du chemin d'audit. Débloque mécaniquement [N18](#n18-rate-limit-ignoré-et-perte-du-fixedin-fourni-par-loutil), [N44](#n44-syncadvisory-vide-le-cache-avant-de-refetcher) et une bonne part de [N8](#n8--tout-auditer---séquentiel-périmètre-faux-non-annulable-et-verrou-serveur-contradictoire).
5. ~~**N10** puis **N28**~~ — ✅ **faits le 21/08/2026.** La table d'occurrences porte la clé de §2, les lignes ambiguës sont purgées, et l'invariant des compteurs est verrouillé.
6. ~~**C9** puis **N2** et **N7**~~ — ✅ **faits le 23/08/2026.** L'outil affichait « restauration effectuée » sans rien restaurer. Le correctif a débordé : quatre fuites d'instructions préparées, invisibles jusque-là, empêchaient la base de se fermer — voir l'encadré de N2.
7. ~~**Le lot bon marché**~~ — ✅ **neuf sur dix faits le 22/08/2026.** N35 a dépassé son périmètre en révélant que l'import de configuration passait des données non validées à `createProject`. **N40 a été annulé** : le contrat spécifie la sensibilité à la casse, ce n'était pas un défaut — voir son entrée.
8. ~~**N9** et **N14**~~ — ✅ **faits le 23/08/2026.** Les deux défauts qui rendaient l'écran de triage inutilisable en pratique. N14 a dépassé son périmètre : le `grep` sur les préfixes amputés a aussi révélé des valeurs arbitraires tronquées et quatre voiles morts, et l'absence de tokens sombres rendait l'application à moitié illisible sur un système en thème sombre.
9. ~~**Le lot des petits épinglés**~~ — ✅ **fait le 23/08/2026** : N12, N29, N39, N41, N44, N45. Trois d'entre eux ont débordé de leur périmètre annoncé — N29 emportait une concaténation SQL, N41 un index manquant, N45 deux écarts de sémantique et de forme sur `newCves`. Deux contrats épinglés ont dû être **réécrits plutôt que satisfaits** : celui de N41 exigeait une contrainte `UNIQUE` dangereuse en migration, celui de N45 supposait une porte CI sensible au triage que §2 ne prévoit pas.
10. ~~**N8**~~ — ✅ **fait le 23/08/2026.** Sept écarts à §2 dans une seule fonctionnalité. A débordé sur un huitième point d'entrée sans garde de chemin (`POST /api/audit/run`), et sur le résiduel d'annulation que [N6](#n6-les-erreurs-http-sont-consommées-comme-des-succès) avait laissé ouvert.
11. ~~**N13** et **N18**~~ — ✅ **faits le 23/08/2026.** Les deux derniers défauts épinglés. Plus aucun `test.failing` dans le dépôt.
12. **[N31](#n31-écarts-au-contrat-contextmd--arbitrage-à-trancher)** — **arbitrage du contrat, désormais le point bloquant.** Quatorze fonctionnalités implémentées hors contrat, dix spécifiées et absentes ou divergentes. Deux points ont été tranchés en faveur du contrat quand il était explicite ; les autres attendent une décision produit. Chaque correctif suivant ajoutera de la surface non spécifiée, donc l'arbitrage se paie de plus en plus cher.
13. **[N20](#n20-aucune-vérification-préalable-du-chemin-daudit-ni-du-lockfile)** — dernier 🔴 de priorité 2, et le seul défaut restant qui produise un message trompeur : un dossier renommé donne « Erreur système: … » là où §2 exige « Chemin introuvable: … ». Indépendant de l'arbitrage.
14. **Le nœud du frontend : [C11](#c11-composants-monolithiques) → [N16](#n16-le-reactmemo-de-projectcard-est-neutralisé-par-construction), [N19](#n19-létat-serveur-nest-jamais-invalidé-après-une-mutation), [N24](#n24-filtres-et-pagination-hors-de-lurl), [N17](#n17-double-flux-sse-et-console-perdue-au-passage-sur-debug).** Les quatre ont la même racine — les pages portent l'état serveur, les appels réseau et l'orchestration — et se corrigent mieux ensemble que séparément. N19 est le plus visible pour l'utilisateur : le badge du header reste à 40 CVE après en avoir traité 25.
15. **Performance : [N21](#n21-n1-systématiques-et-double-désérialisation-des-blobs), [N22](#n22-race-condition-sur-le-graphique-dhistorique), [N26](#n26-setinterval-jamais-nettoyé-état-de-module-perdu-sous-bun---hot).** Trois résiduels partiels, sans urgence tant que le parc reste petit. `getLatestRunsByProjectIds` existe et est corrigé : le N+1 de l'agrégateur est à portée de main.
16. **Accessibilité et UX : [N15](#n15-navigation-clavier), [N23](#n23-les-aides-à-la-décision-de-8-sont-absentes), [N27](#n27-design-system-contourné).** ~~N25~~ en a été sorti et corrigé le 23/08/2026 : une note rédigée pour un paquet partait dans le ticket Jira d'un autre.

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
