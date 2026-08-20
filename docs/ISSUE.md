# 🐛 Problèmes identifiés

Défauts relevés sur l'existant — les nouvelles fonctionnalités sont listées dans [UPGRADE.md](UPGRADE.md).

Deux vagues d'analyse cohabitent dans ce fichier :

- **Vague 1 (juillet 2026)** — identifiants `C1`…`C12`, `T1`…`T4`. Leur état de traitement a été revérifié dans le code en août 2026 (§ « État de la vague 1 »). Les entrées closes ne sont plus détaillées ; celles encore ouvertes le restent, avec la mention de ce qui a été livré.
- **Vague 2 (août 2026)** — identifiants `N1`…`N30`. Issue d'une étude croisée par quatre analyses indépendantes (UX/UI, backend Bun/SQLite, React 19, conformité fonctionnelle), chaque défaut ayant été revérifié dans le code avant inscription ici. Le marqueur **⊕N** indique le nombre d'analyses indépendantes ayant relevé le même défaut.

Chaque entrée porte un identifiant stable, le point d'entrée dans le code et le correctif proposé. Classement par priorité décroissante.

| Priorité | Sujet | Entrées |
|---|---|---|
| 🔴 1 | Sécurité | N3, N4, N5 |
| 🟠 2 | Bugs fonctionnels & intégrité des données | N1, N2, N6, N7, N10, N11, N12, N13, N18, N20, C4 |
| 🟡 3 | Robustesse & performance | N8, N16, N17, N19, N21, N22, N26, N29, N30, C9 |
| 🔵 4 | UX & accessibilité | N9, N14, N15, N23, N24, N25, N27 |
| ⚪ 5 | Couverture de tests | N28, T1–T4 |
| ⚫ 6 | Écarts au contrat CONTEXT.md | N31, C11 |

---

## 📋 État de la vague 1 (vérifié en août 2026)

**5 traités · 5 partiels · 6 non traités ou régressés.** Les deux tests de non-régression explicitement exigés par la vague 1 (C3 et C12) n'ont jamais été écrits : les correctifs les plus critiques ne sont pas verrouillés.

| ID | Sujet | État | Constat de vérification |
|---|---|---|---|
| C1 | Aucune authentification sur l'API | 🟡 partiel | Écoute sur `127.0.0.1` par défaut ✓ (`src/index.ts:20`), jeton `X-Aegis-Token` en temps constant ✓ (`src/routes/audit.ts:30-42`), `isPathAllowed` ✓ (`src/routes/projects.ts:11`). Mais garde absente sur `git-fetch`/`git-pull` et sur `PUT`, et contournée par `/api/config/import`. **Résiduel → [N3](#n3-put-apiprojectsid--aucune-validation-aucune-garde-de-chemin)** |
| C2 | Fuite des secrets par `/api/config/export` | 🟡 partiel | Masquage `GITHUB_TOKEN`/`JIRA_API_KEY` sur l'export ✓ (`src/routes/settings.ts:21-23`), mais denylist et non allowlist, et `GET /api/settings` renvoie toujours le dump brut. **Résiduel → [N5](#n5-get-apisettings-expose-les-secrets-en-clair)** |
| C3 | Compteurs de sévérité corrompus à l'ingestion CI | 🟢 traité | Garde unique dans `enhanceVulnerabilities` (`src/lib/audit/index.ts:53-56`), partagée par les deux chemins. **Test de non-régression exigé : absent → [N28](#n28-les-deux-tests-de-non-régression-exigés-par-la-vague-1-nexistent-pas)** |
| C4 | `/api/config/import` ne restaure que les paramètres | 🟡 partiel | Voir l'entrée conservée ci-dessous |
| C5 | Duplication de la logique d'enrichissement | 🟢 traité | `enhanceVulnerabilities` extraite (`src/lib/audit/index.ts:13`), appelée par `runAudit` et `ingestAudit` |
| C6 | Requête N+1 dans `ingestAudit` | 🟢 traité | `getLatestRun` hissé hors de la boucle (`src/lib/audit/index.ts:326`) |
| C7 | Le WAL SQLite n'est jamais checkpointé | 🟢 traité | `PRAGMA wal_autocheckpoint = 500` (`src/db/index.ts:18`) + `closeDb()` sur `SIGINT`/`SIGTERM` (`src/index.ts:63-73`). Constat disque : `audit.sqlite-wal` = **0 octet** contre 4 Mo avant |
| C8 | `/api/audit/run` sans garde de concurrence | 🟡 partiel | Verrou `isProcessing` + `GET /api/audit/status` créés (`src/lib/audit/queue.ts`), mais **aucun code frontend ne les appelle** et le verrou empêche la concurrence 4 spécifiée. **Résiduel → [N8](#n8--tout-auditer--séquentiel-périmètre-faux-non-annulable-et-verrou-serveur-contradictoire)** |
| C9 | `initDb` ignore son paramètre | 🔴 non traité | Voir l'entrée conservée ci-dessous |
| C10 | Dérive entre la documentation et le code | 🟢 traité | README : port 3001 ✓, React 19 ✓, React Router v7 ✓ ; `package.json` renommé `aegis` ✓ |
| C11 | Composants monolithiques | 🔴 aggravé | Voir l'entrée conservée ci-dessous |
| C12 | Le chronomètre `first_seen_at` se réinitialise | 🟢 traité (structure) | Table `cve_occurrences` conforme (`src/db/index.ts:119`), `INSERT … ON CONFLICT DO NOTHING` ✓ (`src/db/occurrences.ts:9-13`), `is_baseline` ✓. **Deux résiduels → [N10](#n10-trois-clés-didentité-différentes-pour-la-même-vulnérabilité) (clé faussée sur les vulns sans CVE) et [N28](#n28-les-deux-tests-de-non-régression-exigés-par-la-vague-1-nexistent-pas)** |
| T1 | Front quasi non couvert | 🔴 régressé | **0 fichier `.test.tsx`** — le seul existant (`DashboardLayout.test.tsx`) a disparu au refactor Atomic Design |
| T2 | Routes peu couvertes | 🟡 partiel | `test/functional/api.test.ts` couvre 4 modules de routes sur 11. Non couverts : `ingest`, `annotations`, `tickets`, `tags`, `prompts`, `reports`, `console`, `audit` |
| T3 | Test git dépendant du réseau | 🔴 non traité | `bun test` exécute toujours un vrai `git fetch` vers le remote |
| T4 | Modules sans aucun test | 🔴 non traité | Aucun test pour `src/lib/cvss.ts`, `src/lib/console.ts`, `src/db/backup.ts` |

> *Leçon de cette vérification : C3 et C12 avaient déjà été « corrigés » une fois avant d'être re-cassés par la duplication C5. Sur ce périmètre, un correctif non couvert par un test est un correctif temporaire.*

---

## 🔴 Priorité 1 — Sécurité

### N3. `PUT /api/projects/:id` : aucune validation, aucune garde de chemin
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

### N1. GitHub est appelé pendant chaque audit
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
2. **Disponibilité** — la requête `POST /api/projects/:id/audit` reste ouverte des dizaines de secondes **en tenant le verrou global d'audit** ([N8](#n8--tout-auditer--séquentiel-périmètre-faux-non-annulable-et-verrou-serveur-contradictoire)). La durée d'un audit devient dépendante du réseau.
3. **Rate-limit non respecté** — §6 impose que l'appelant « s'arrête ». La boucle ne teste jamais `res.rateLimited` et continue à taper l'API après un 429.
4. **Intégrité du run** — `severity` et `link` persistés sont écrasés par GitHub (`:46-47`) et `counts` est recalculé après enrichissement (`:52-64`). Le run ne reflète plus la sortie de l'outil, et la liste persistée **n'est plus triée par sévérité** puisque le tri (`src/lib/parsers/utils.ts:66`) a lieu avant la réécriture des sévérités.

**Correctifs :**
1. Persister le run à partir du **parsing seul**. L'audit redevient hors-ligne, déterministe et rapide.
2. Réserver GitHub à la porte manuelle par CVE ([N31](#n31-écarts-au-contrat-contextmd--arbitrage-à-trancher), `/api/annotations/fetch-fix`).
3. Solution intermédiaire acceptable si l'enrichissement automatique doit être conservé : ne consulter que le **cache local**, sans aucun accès réseau, et propager `rateLimited` pour interrompre la boucle.

### N2. La restauration de snapshot ne restaure rien
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
**⊕1** — `src/lib/parsers/utils.ts:29` · `src/db/occurrences.ts:20` + PK `src/db/index.ts:128-138` · `src/lib/aggregator/index.ts:72`

| Couche | Clé d'identité | Conforme ? |
|---|---|---|
| Parsing (`dedupe`) | `` `${package}\|${title}\|${cve ?? ""}` `` | ✓ §3 |
| Table `cve_occurrences` | PK `(project_id, package, cve)`, avec `cve = v.cve \|\| v.package` | le **titre disparaît** de l'identité |
| Agrégateur (`buildCveGroups`) | `cve` trimé, sinon `` `${package}: ${title}` `` | ✓ §7 |

Les trois espaces de nommage ne coïncident pas — alors que `firstSeenAt` et `isBaseline`, donc `ageInDays` et tous les indicateurs SLA de `CveGroup`, sont lus depuis la table par la clé `` `${package}::${cve || package}` `` (`src/lib/audit/index.ts:34`).

**Scénario reproductible.** `bun audit` remonte deux avis distincts sur `lodash` sans CVE — le parseur bun ne remplit `cve` que depuis les CWE (`src/lib/parsers/bun.ts:28-30`). Le parsing les conserve tous les deux, leurs titres différant. Mais une seule ligne `cve_occurrences ('lodash', 'lodash')` est créée : **les deux vulnérabilités héritent du même `first_seen_at`**, celui du premier avis vu, et du même `is_baseline`. Un avis découvert aujourd'hui s'affiche avec l'âge d'une faille détectée il y a six mois, et il est marqué dette héritée alors qu'il s'agit d'une découverte nette.

C'est le résiduel de [C12](#-état-de-la-vague-1-vérifié-en-août-2026) : la structure est bonne, la clé est fausse sur toutes les vulnérabilités sans CVE — précisément la population que la baseline devait qualifier. Un SLA construit là-dessus s'auto-valide, exactement comme le chronomètre que C12 devait réparer.

**Correctif :** une **fonction unique** de clé d'identité de vulnérabilité, incluant le titre en repli, utilisée par le parsing, la table d'occurrences et l'agrégation. À traiter avant d'accumuler davantage de données SLA fausses — les lignes déjà écrites devront être migrées ou purgées.

### N11. `?force=1` est inopérant
**⊕3** — `src/routes/projects.ts:178`

```ts
const force = url.searchParams.get("force") === "true";
```

CONTEXT.md §2 et le récapitulatif d'endpoints spécifient `?force=1`. Le frontend s'est aligné sur le code (`src/pages/Projects.tsx:345` : `?force=true`), ce qui masque le défaut en usage interne — mais tout client conforme au contrat (script CI, appel manuel, documentation) voit son forçage **silencieusement ignoré** et reçoit un rapport dédupliqué en croyant avoir réaudité.

**Correctif :** accepter `1` et `true`, et le documenter. Le forçage est le seul recours quand la fenêtre de fraîcheur masque une CVE nouvellement publiée : un forçage qui échoue en silence est plus dangereux qu'un forçage absent.

### N12. La suppression d'un tag laisse des tags fantômes définitifs
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
**⊕1** — `src/lib/github/index.ts:274-281` et `:308-313`, boucle appelante `src/lib/audit/index.ts:24-49`

La branche « clé non résolvable » (`:244-251`) préserve correctement `params.originalFixedIn`. Les branches « rate-limited » (`:274-281`) et « avis introuvable » (`:308-313`) renvoient `fixedIn: null` **sans le répercuter**. Comme l'appelant écrit `fixedIn: res.fixedIn` (`src/lib/audit/index.ts:47`), la version corrigée que `npm`/`yarn` avaient pourtant fournie est **effacée du run**.

Audit npm de 100 paquets sans token : après ~60 appels, GitHub répond 403 avec `x-ratelimit-remaining: 0`. Les 40 vulnérabilités suivantes sont persistées avec `fixedIn = null` alors que `npm audit` indiquait `fixAvailable.version`. Le référent lit « aucune correction disponible » à tort, et l'écran Tickets propose « Version cible : N/A ».

**Correctifs :** propager `rateLimited` pour interrompre l'enrichissement (§6 : « l'appelant doit s'arrêter »), et faire de `originalFixedIn` la valeur de repli dans **toutes** les branches d'échec. Résolu de fait par [N1](#n1-github-est-appelé-pendant-chaque-audit) si l'enrichissement quitte le chemin d'audit.

### N20. Aucune vérification préalable du chemin d'audit ni du lockfile
**⊕2** — `src/lib/audit/index.ts:143-175`, `:196-199`

CONTEXT.md §2 « Cas limites » exige deux contrôles **avant** lancement :
- « Chemin introuvable: … » sans exécuter,
- « Lockfile manquant: … (cherché dans `<cwd>`) », le cas bun étant satisfait par `bun.lock` **ou** `bun.lockb`.

Aucun `existsSync` sur le chemin d'audit ; les deux chaînes sont absentes de tout le dépôt. Le code passe directement à `spawn` et reformate l'échec en « Erreur système: … » ou « `<outil>`: aucune sortie (exit N) ». Un dossier renommé produit un run `error` contenant le `ENOENT` brut de l'outil : au référent d'interpréter la sortie.

Défaut connexe : si `project.tool` n'est aucune des quatre valeurs — possible, puisqu'aucune validation n'existe à la création ([N31](#n31-écarts-au-contrat-contextmd--arbitrage-à-trancher)) — `args` reste `[]`, `spawn([])` lève, l'exception est capturée en `systemError`, mais `commandStr` est vide : le run est inexploitable pour le diagnostic.

**Correctifs :** ajouter les deux `existsSync` avec les messages exacts du contrat avant tout `spawn` ; rejeter en amont un `tool` hors énumération.

### C4. `/api/config/import` ne restaure que trois sections sur cinq
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
**⊕4** *(le défaut le plus largement relevé)* — `src/App.tsx:115-187`, `src/lib/audit/queue.ts:43-47`

CONTEXT.md §2 : « Orchestré **côté client** (aucun endpoint batch). […] **Parallèle borné** à une concurrence max de **4** », sur les projets **visibles** (filtres tags appliqués), résultats « triés erreurs d'abord puis projets avec le plus de nouvelles CVE ». Cinq écarts cumulés :

1. **Séquentiel** — `for (const p of projectsToAudit) { await fetch(…) }` (`:136`). Sur 15 projets à ~8 s, deux minutes au lieu de trente secondes.
2. **Périmètre faux** — `allProjects.filter(p => !p.ignored)` (`:121`). Le `filterTag` de la page Projets (`src/pages/Projects.tsx:47`) vit dans un composant enfant auquel `App` n'a pas accès : filtrer sur « Prod » pour n'auditer que 3 projets en audite quand même 15.
3. **Ni annulation ni timeout** — 0 `AbortController` dans tout le frontend. Un `npm audit` qui pend bloque l'application indéfiniment ; le seul recours est de recharger la page.
4. **UI gelée, console incluse** — `loading || auditing` applique `opacity-50 pointer-events-none blur-sm` sur le conteneur qui englobe `<Routes>` (`:213`). Or `<Console />` est rendue **dans** `MainLayout` (`src/components/templates/MainLayout.tsx:39`), donc dans ce conteneur : pendant plusieurs minutes, la console live SSE — seul endroit où l'on voit `npm audit` tourner et échouer — est floutée et non cliquable. Le `GlobalLoader` par-dessus affiche des messages tirés d'un tableau tournant toutes les 800 ms (« Recherche GHSA », « Calcul de la criticité ») qui **ne correspondent à aucune étape réelle** : §2 précise qu'aucun appel GitHub n'a lieu pendant l'audit — et [N1](#n1-github-est-appelé-pendant-chaque-audit) montre qu'il en a lieu, mais pas ceux-là.
5. **Contradiction serveur** — la concurrence 4 est de toute façon impossible : `runSingleAudit` pose un verrou **global** et rejette tout audit concurrent (`throw new Error("Un audit est déjà en cours, veuillez patienter.")`), converti en **500** par la route (`src/routes/projects.ts:189-197`). Un client conforme à §2 verrait 3 audits sur 4 échouer systématiquement. C'est le résiduel de [C8](#-état-de-la-vague-1-vérifié-en-août-2026) : le verrou a été ajouté pour un endpoint batch que la spec interdit, et il bloque le mode d'orchestration qu'elle prescrit.

**Correctifs :**
1. Remplacer le verrou global par un verrou **par projet** (map `projectId → promesse`), et renvoyer 409 avec un message explicite au lieu de 500.
2. Extraire l'orchestration dans un hook partagé avec un pool de 4, alimenté par le périmètre filtré remonté (contexte, ou état porté par l'URL — cf. [N24](#n24-filtres-et-pagination-hors-de-lurl)).
3. Exposer un `AbortController`.
4. Remplacer le blocage plein écran par une barre de progression non modale (N/M + nom du projet) laissant la console et la navigation accessibles, et refléter les commandes réellement lancées.
5. Faire du compte-rendu final un vrai triage post-audit : erreurs d'abord, puis nouvelles CVE (`newCves` est calculé par le serveur et aujourd'hui jamais lu), avec lien direct vers le triage.

### N16. Le `React.memo` de `ProjectCard` est neutralisé par construction
**⊕1** — `src/pages/Projects.tsx:783-801`, `src/components/organisms/ProjectCard.tsx:42`

Le composant est bien mémoïsé, mais reçoit 13 props qui changent d'identité à chaque rendu :
- `onViewTriage={() => navigate(...)}` — fonction **inline** recréée à chaque rendu ;
- 11 handlers déclarés en `const` simples dans le corps du composant parent (`copyToClipboard`, `formatDate`, `handleEdit`, `handleDelete`, `toggleIgnore`, `handleDetectGit`, `handleFetch`, `handlePull`, `handleForceAudit`…) — **aucun `useCallback` dans tout le fichier** ;
- `auditState={auditState}` — la **map complète** des messages d'audit, remplacée par un objet neuf à chaque événement SSE (`:82-100`), alors que chaque carte n'a besoin que de `auditState[p.id]`.

La comparaison superficielle de `memo` échoue donc toujours. 30 projets affichés pendant un audit global : chaque projet émet ~10 commandes (6 pour `gitInfo` + l'outil), chacune produisant un `start` et un `end` → plusieurs centaines de `setAuditState` → plusieurs **milliers** de rendus de cartes, alors qu'une seule carte change d'état à la fois.

**Correctif :** `useCallback` sur les handlers, et passer à chaque carte la chaîne `auditState[p.id]` plutôt que la map entière.

### N17. Double flux SSE, et console perdue au passage sur `/debug`
**⊕1** — `src/components/organisms/Console.tsx:26`, `src/pages/Projects.tsx:67`, `src/App.tsx:224-226`

Deux `EventSource("/api/console")` distincts sont ouverts simultanément : celui de `Console` (montée en permanence via `MainLayout`) et celui de la page Projets. Le serveur diffuse à tous les clients (`src/lib/console.ts:66-78`) : chaque commande est sérialisée et poussée **deux fois** pour un seul onglet.

Par ailleurs `/debug` utilise `BlankLayout` : y naviguer **démonte `MainLayout`**, donc `Console`, ce qui ferme le flux et détruit les `logs`. Or §11 précise « aucune persistance ni rejeu » — un client ne voit que ce qui est émis après sa connexion. Faire Ctrl+Shift+D pendant un audit puis revenir vide donc la trace **définitivement**.

Détail annexe : les tests `event.data === ": ping"` / `": connected"` (`Console.tsx:35`) sont du code mort — le serveur les envoie en **commentaires SSE** (`src/lib/console.ts:83,96`), qui ne déclenchent jamais d'événement `message`.

**Correctif :** une seule source de vérité pour le flux, montée **au-dessus** des layouts pour survivre à la navigation, les consommateurs lisant les logs depuis ce contexte.

### N19. L'état serveur n'est jamais invalidé après une mutation
**⊕2** — `src/App.tsx:80-102` et `:180`, `src/components/organisms/Header.tsx:71-75`, `src/pages/Triage.tsx:202-207`

`stats` (donc `pendingCves`, `criticalVulnerabilities`, `healthGrade`, `topProjects`) est de l'état serveur stocké localement dans `App`, rafraîchi **uniquement** au montage et à la fin de l'audit global. Aucune mutation d'une page enfant ne peut le réconcilier.

- Le référent traite 25 CVE sur 40 : le badge rouge du header affiche toujours **40**. La Vue d'ensemble affiche une note de santé et un « Top projets à risque » périmés jusqu'au rechargement complet du navigateur.
- Symétriquement, la page Projets détient sa propre copie (`src/pages/Projects.tsx:43`) et n'est jamais notifiée : lancer l'audit global depuis le header alors qu'on est sur `/projets` laisse les cartes afficher les `lastRun.counts` d'avant, les pastilles « Sain »/« Critique » et les dates périmées — **sans aucun signal d'obsolescence**.

**Correctif :** exposer une fonction d'invalidation (contexte, ou clé de cache partagée) appelée après toute mutation d'annotation, de projet ou de run.

### N21. N+1 systématiques et double désérialisation des blobs
**⊕1** — `src/lib/aggregator/index.ts:57,60` · `src/routes/stats.ts:9,31` · `src/lib/audit/index.ts:361-362` · index dans `src/db/index.ts:103-126` · `src/lib/console.ts:67`

- `buildCveGroups()` fait un `getLatestRun()` — donc un `SELECT *` ramenant le blob `vulnerabilities` complet — **et** un `getAnnotationsForProject()` par projet.
- `/api/stats` appelle `buildCveGroups()` **puis refait** un `getLatestRun()` par projet (`:31`) : les mêmes blobs sont lus et désérialisés deux fois par requête, alors que `getLatestRunsByProjectIds` existe déjà (`src/db/runs.ts:110`).
- `ingestAudit` appelle aussi `buildCveGroups()` à chaque ingestion CI.
- **Index manquants** : `annotations` n'a que `UNIQUE(cve, project_id)`, inutilisable pour `WHERE project_id = ? OR project_id = -1` → balayage complet par projet. `tickets.content_hash` est interrogé par égalité (`src/db/tickets.ts:44`) sans index.
- `broadcast()` exécute une requête SQLite `getSetting("DISABLE_CONSOLE")` pour **chaque** événement console, soit 2 requêtes par commande git ou audit.

40 projets × ~150 vulnérabilités : un chargement de dashboard (`/api/stats` + `/api/cves`) fait ~160 requêtes, désérialise ~12 000 objets **deux fois** et balaye 160 fois la table `annotations`, sur un process unique.

**Correctifs :** charger les derniers runs et toutes les annotations en une requête chacun ; mémoriser `buildCveGroups()` avec invalidation à l'écriture d'un run ou d'une annotation ; ajouter les index `annotations(project_id)` et `tickets(content_hash)` ; mettre `DISABLE_CONSOLE` en cache mémoire.

### N22. Race condition sur le graphique d'historique
**⊕1** — `src/components/organisms/HistoryChart.tsx:50-62`

Effet dépendant de `days`, `fetch(...).then(d => { setData(d); setLoading(false) })`, sans `AbortController`, sans flag `cancelled`, sans nettoyage dans le `return`.

Passer la période de 7 → 90 → 1 jour rapidement : la requête « 90 jours » (la plus lourde côté SQL) répond **après** celle de « 1 jour » et écrase les données. Le graphe affiche 90 jours de données sous le libellé « derniers 1 jours » — le texte venant de `days`, pas des données. État incohérent durable, sans erreur.

**Correctif :** flag `cancelled` ou `AbortController` dans le cleanup, en ignorant toute réponse dont la clé ne correspond plus à l'état courant.

### N26. `setInterval` jamais nettoyé, état de module perdu sous `bun --hot`
**⊕1** — `src/lib/console.ts:93-101`, `src/lib/audit/queue.ts:3-6`

Le `setInterval` de keepalive est créé au premier import et jamais annulé — aucun `clearInterval` dans `src/`. Le script de développement étant `bun --hot src/index.ts`, chaque rechargement à chaud ajoute un intervalle aux précédents et réinitialise le `Set clients`, tandis que les contrôleurs SSE précédents restent référencés par les anciens intervalles. Dix sauvegardes de fichier = onze boucles de ping actives.

Le même mécanisme réinitialise `isProcessing`/`completedInBatch` alors qu'un batch lancé en fire-and-forget (`queue.ts:26-40`) continue de tourner sur l'ancienne copie du module : `GET /api/audit/status` renvoie `isRunning:false` pendant qu'un batch est en cours, et un second `POST /api/audit/run` démarre un batch concurrent sur les mêmes projets — deux runs par projet, écritures non sérialisées.

**Correctif :** enregistrer l'intervalle dans un singleton idempotent, l'annuler quand le `Set` de clients est vide, et externaliser l'état de la file hors du module rechargeable.

### N29. Deux définitions du « dernier run » coexistent
**⊕1** — `src/db/runs.ts:96-108` vs `:110-123`

`getLatestRun` respecte §4 : `ORDER BY ran_at DESC, id DESC`. La variante batch employée par `GET /api/projects` retient `MAX(id)`. Les deux coïncident tant que les `id` sont monotones avec le temps — mais divergent après une restauration de snapshot ou un import de runs hors ordre chronologique, produisant une incohérence entre le run affiché sur la carte projet et celui utilisé par l'agrégation CVE et la déduplication d'audit.

Défaut connexe dans la même fonction : `IN (${ids})` est construit par concaténation de chaîne (`:113`). Les valeurs viennent aujourd'hui exclusivement d'un `SELECT id FROM projects`, donc non exploitable en l'état — mais un futur appelant passant un `parseInt` non gardé provoquerait un 500 (`IN (NaN)` → `no such column: NaN`).

**Correctif :** aligner la variante batch sur `ran_at DESC, id DESC`, et passer les identifiants en bindings.

### N30. Le contexte projet n'enveloppe pas les commandes git du listing
**⊕1** — `src/routes/projects.ts:74-91` et `:122`

CONTEXT.md §11 : « Aux points d'entrée liés à un projet, l'exécution est **enveloppée** dans ce contexte (audit d'un projet, **calcul git par projet lors du listing**, fetch, pull). » `git-fetch` (`:150`), `git-pull` (`:166`) et l'audit (`:189`) le font ; le listing et `GET /api/projects/:id` ne le font pas.

À chaque rafraîchissement de la liste, jusqu'à 6 commandes git **par projet** défilent dans la console sans champ `project` — le flux devient illisible, exactement le cas que le contexte asynchrone doit couvrir.

**Correctif :** envelopper `getGitInfo` dans `projectContext.run({ project: p.name }, …)` dans les deux handlers.

### C9. `initDb` ignore son paramètre
🔴 *Non traité — entrée conservée depuis la vague 1* — `src/db/index.ts:181, 188, 195, 198, 201`

La fonction reçoit `database: Database` (`:41`) et l'utilise correctement jusqu'à la ligne 87, puis retombe sur la variable globale `db!` pour les **cinq** migrations tardives (`ALTER TABLE reports`, `advisory_cache` × 3, `tickets`). Le code fonctionne parce que les deux références coïncident, mais casse dès que `initDb` est appelée sur une autre instance : tests, restauration de snapshot.

**Correctif :** utiliser `database` partout dans la fonction. Correctif d'une ligne × 5, à faire avant [N2](#n2-la-restauration-de-snapshot-ne-restaure-rien) — la restauration est précisément le cas où l'instance diffère.

---

## 🔵 Priorité 4 — UX & accessibilité

### N9. Le triage est impraticable au-delà de quelques CVE
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
**⊕1** — `src/components/organisms/TriageTable.tsx:65-68`, `src/components/organisms/ProjectCard.tsx:69-78,120-126`, `src/pages/Overview.tsx:122-125,163-166`, `src/pages/Projects.tsx:828-831`, `src/components/organisms/CveCard.tsx:213-224`

Recherche sur `src/pages` et `src/components` hors `components/ui/` : **0 occurrence de `tabIndex`**, **0 de `role=`**, **2 `aria-label`** dans tout le code applicatif.

- Ouvrir une CVE passe par `<TableRow onClick={() => setSelectedGroup(group)}>` — un `<tr>` sans `tabIndex` ni `role="button"` : **inatteignable au clavier**. Idem les lignes de la vue liste Projets et les cartes « Top Projets à Risque » / « Vulnérabilités les plus fréquentes » de l'accueil (`<div onClick>`).
- Toute la barre d'actions d'une carte projet (Ignorer, Forcer un audit, Modifier, Supprimer) est en `opacity-0 group-hover:opacity-100` **sans `focus-within`** : au clavier, les boutons prennent le focus **en restant invisibles** ; au tactile, ils sont inaccessibles.
- Le menu « … » de la carte projet ne s'ouvre que via `group-hover/menu:visible`, son `<button>` déclencheur ne faisant que `e.stopPropagation()` : copier l'URL d'ingestion CI est impossible au clavier et sur tablette.
- `CveCard.tsx:220` : bouton d'édition de note en `opacity-0 … group-hover:opacity-100` alors que le conteneur de ligne (`:41`) **n'a pas la classe `group`** — ce bouton est actuellement invisible en permanence.
- Aucun tableau n'a de `<caption>` ni de `scope` sur les `<th>` — l'atome `TableCaption` existe (`ui/table.tsx:248`) et n'est utilisé nulle part. Les toasts (`Triage.tsx:363-389`) n'ont ni `role="status"` ni `aria-live` : une confirmation de mise à jour n'est jamais annoncée.

**Correctifs :** rendre lignes et cartes activables (bouton, ou `role="button"` + `tabIndex` + gestion `Enter`/`Space`) ; remplacer les révélations `hover` par une visibilité permanente ou un `focus-within` ; ajouter `aria-live` sur les toasts et `<caption>`/`scope` sur les tables.

### N23. Les aides à la décision de §8 sont absentes alors que la donnée existe
**⊕3** — `src/db/tickets.ts:22-38`, `src/pages/Triage.tsx:107,129-134`, `src/routes/tickets.ts:40-58`

Quatre éléments spécifiés par CONTEXT.md §8, aucun présent à l'écran :

1. **Warning « N nouvelles CVE depuis le lien ».** La baseline `cves` **est bien persistée** en base à l'enregistrement du ticket, mais aucun code ne la compare aux références courantes du groupe. Un ticket Jira ouvert en janvier sur `symfony/http-kernel` peut avoir accumulé trois nouvelles CVE : rien ne le signale, le référent croit le sujet couvert. C'est précisément la dérive que §8 doit détecter.
2. **Filtre « Atteignables uniquement »** (ne garder que les CVE `confirmed`) : inexistant. Le seul bouton disponible, « Zero-Inbox », fait l'**inverse** (`hideProcessed` garde `status === "pending"`). Sans lui, impossible de produire la liste « ce qui est réellement exploitable » attendue par les équipes de dev.
3. **Libellés d'atteignabilité** (Atteignable / Non atteignable / À évaluer / Ignoré) : jamais affichés, l'UI montre les statuts bruts. Aucune occurrence de `atteignable`/`reachable` dans `src/`.
4. **Classement Prioritaires / Moins importants** et **markdown conforme** : le markdown généré (`routes/tickets.ts:40-58`) produit un titre différent, une ligne méta sans séparateurs `·`, sans pire sévérité ni version cible, puis une liste de sections `###` par CVE — aucun tableau, aucun emoji de sévérité, aucune colonne « Atteignable », aucun échappement de `|`. **Le statut de triage et la note du référent sont absents du markdown**, alors qu'ils sont la valeur ajoutée du ticket selon §8.

Défaut connexe : la version cible d'en-tête retient la version la **plus élevée** via `compareVersions` (`Triage.tsx:129-134`), là où §8 spécifie la **première `fixedIn` non vide** dans l'ordre d'insertion.

**Correctifs :** calculer le badge de dérive par différence avec la baseline déjà stockée ; dériver et afficher l'atteignabilité depuis le statut de triage, avec le filtre correspondant à côté de Zero-Inbox ; aligner le markdown sur §8, ou acter formellement le nouveau format dans le contrat (cf. [N31](#n31-écarts-au-contrat-contextmd--arbitrage-à-trancher)).

### N24. Filtres et pagination hors de l'URL
**⊕3** — `src/pages/Projects.tsx:47,58,780,817`, `src/pages/Triage.tsx:37-38,58`

Seuls `project` et `cve` transitent par l'URL (`Triage.tsx:19-21`). `filterTag`, `viewMode`, `page`, `itemsPerPage` et `hideProcessed` sont de l'état local. Comme les pages sont des `element` de route (`App.tsx:218-222`), quitter la page les **détruit**.

- Le référent filtre les projets sur « Prod » en vue Tableau, ouvre une CVE, revient : filtre perdu, vue revenue en Grille.
- Il ne peut pas envoyer à son équipe un lien vers « les CVE non traitées du projet 12, page 3 » — alors que §7 désigne ce partage comme un usage central du référent sécurité.

Défaut de fond associé : `filterTag` est une valeur **unique** (`string | null`) — cliquer « Prod » remplace « Backend ». §9 spécifie un ensemble `selectedTags` avec **logique OU** (`selectedTags.size === 0 || p.tags.some(t => selectedTags.has(t))`) : « Prod OU Backend » est impossible. Et comme cet état n'est pas remonté, il n'est pas le périmètre de « Tout auditer » ([N8](#n8--tout-auditer--séquentiel-périmètre-faux-non-annulable-et-verrou-serveur-contradictoire)), contrairement à §2 et §9.

Défaut d'affichage associé : l'état vide de la page Projets (`:767-776`) est conditionné à `projects.length === 0`. Si un tag ne matche aucun projet, la grille rend **zéro carte sous les boutons de filtre**, sans un mot d'explication — l'utilisateur croit avoir perdu ses projets.

**Correctifs :** porter ces états dans les `searchParams` (`useSearchParams` est déjà utilisé dans `Triage`), valeurs par défaut absentes de l'URL pour garder les liens propres ; passer le filtre tags en multi-sélection (Set + OU) ; ajouter un état « Aucun projet pour ce filtre » avec réinitialisation.

### N25. `TicketModal` : les notes fuient d'un ticket à l'autre
**⊕1** — `src/components/organisms/TicketModal.tsx:20`, `src/pages/Triage.tsx:349-355`

`const [notes, setNotes] = useState("")` dans un composant rendu **inconditionnellement** : seul le `DialogContent` de Radix est démonté à la fermeture, jamais `TicketModal`. `notes` n'est réinitialisé nulle part — ni dans le handler de fermeture, ni après création réussie.

Le référent rédige une recommandation pour `lodash`, annule, ouvre le ticket d'`axios` : le champ contient encore la recommandation de `lodash`, et elle partira dans le ticket Jira si elle n'est pas repérée.

**Correctif :** réinitialiser `notes` à l'ouverture, ou donner au dialogue une `key` dérivée de `group.key` pour forcer un état neuf par ticket.

### N27. Design system contourné
**⊕1** — molecules utilisées uniquement dans `src/pages/Debug.tsx:262-284` · `cn(` : **0 occurrence hors `components/ui/`** · `src/pages/Settings.tsx:217,316,323-335,374,390` · `src/components/organisms/TagsManager.tsx:97-105,161-182`

- **Les molecules n'existent que dans la vitrine `/debug`.** `LabelInput`, `StatCard`, `ActionBadge`, `FilterDropdown` ne sont consommées nulle part ailleurs : les pages réelles réimplémentent le markup à la main (trois tuiles statistiques recopiées dans `Overview.tsx:42-108`, badge de tag recopié dans `TagsManager.tsx:161-182`).
- **`cn()` n'est jamais appelé hors des atomes.** Les classes sont concaténées en template strings, ce qui laisse des conflits Tailwind non résolus : le toast de `Triage.tsx:365` applique `bg-card` **puis** `bg-green-500/10` dans le même attribut ; `TriageTable.tsx:72` empile `border` et une classe de fond issue de `SEVERITY_COLORS`.
- **Les indicateurs de chargement ne tournent pas.** `RefreshCw`/`Loader2` sans `animate-spin` dans `Triage.tsx:309`, `Projects.tsx:449,765`, `Settings.tsx:209`, `Reports.tsx:177`, `HistoryChart.tsx:261`, `TagsManager.tsx:153`, `Header.tsx:164` — icône figée, et sur Triage sans texte d'accompagnement : l'écran paraît planté. L'atome `Spinner` existe pourtant dans `ui/`.
- **Labels non liés** : `Settings.tsx:217,316,374,390` — `label` sans `htmlFor`, inputs sans `id`.
- **Deux écarts de réglages** : l'entrée `AUDIT_MAX_AGE_HOURS` est en `type="number" min="0"`, ce qui **interdit la saisie de `-1`** (« jamais frais → toujours réauditer ») pourtant explicitement prévue par §2 et §12 ; et la palette de couleurs de tags proposée (`indigo, red, orange, yellow, green, blue, purple, pink`) ne correspond pas à celle du contrat (`indigo, sky, emerald, amber, rose, violet, teal, orange`) — six valeurs sur huit diffèrent, et le serveur ne validant pas la couleur (`src/db/tags.ts:15-29`), elles seront stockées telles quelles sans résoudre aucune variable CSS.
- Enfin l'en-tête fixe (`Header.tsx:81-167`) n'a aucune variante responsive ; sous ~1100 px la barre déborde, et comme le conteneur racine est `overflow-x-hidden`, le contenu excédentaire est **coupé** plutôt que défilable. Côté triage, le `TableFooter` (compteur, sélecteur, précédent/suivant) est **à l'intérieur** du conteneur `overflow-x-auto` : sur écran étroit les contrôles de pagination défilent hors champ, et aucune colonne n'est sticky — package et version corrigée sortent de l'écran quand on va lire les actions.

**Correctifs :** consommer les molecules dans les pages ; passer toute composition de classes par `cn()` ; restaurer `animate-spin` ou utiliser l'atome `Spinner` ; lier chaque `label` à son `id` ; aligner l'input de fraîcheur (`min="-1"`) et la palette de tags sur le contrat, avec validation serveur ; rendre la nav responsive et sortir la pagination du conteneur défilant.

---

## ⚪ Priorité 5 — Couverture de tests

Référence : [TESTING.md](TESTING.md) — « chaque fonctionnalité ajoutée ou modifiée DOIT être couverte par un test automatisé ». **État actuel : 62 tests / 16 fichiers, 230 assertions, 0 fail** — mais toujours exclusivement backend.

### N28. Les deux tests de non-régression exigés par la vague 1 n'existent pas
La vague 1 les nommait explicitement. Vérifié : aucun des deux n'a été écrit.

1. **Sévérité inconnue à l'ingestion CI** (verrou de [C3](#-état-de-la-vague-1-vérifié-en-août-2026)) — `src/lib/audit/index.test.ts` contient un test `ingestAudit` (`:113`), mais avec un payload npm normal ; aucun cas de sévérité hors énumération.
2. **Détection → run en erreur → redétection, `first_seen_at` inchangé** (verrou de [C12](#-état-de-la-vague-1-vérifié-en-août-2026)) — absent. Les tests d'audit couvrent le dossier inexistant (`:49`), la déduplication (`:69`) et l'ingestion (`:113`), jamais la chaîne d'ancienneté.

C'est le point le plus rentable de cette vague : C3 et C12 avaient déjà été corrigés une fois avant d'être re-cassés. Ajouter le cas de [N10](#n10-trois-clés-didentité-différentes-pour-la-même-vulnérabilité) au second test (deux avis sans CVE sur le même package doivent porter des `first_seen_at` distincts).

### T1. Front quasi non couvert
🔴 *Régressé depuis la vague 1.* **0 fichier `.test.tsx`** dans tout le dépôt — le seul existant (`DashboardLayout.test.tsx`) a disparu lors du refactor Atomic Design, sans remplacement. TESTING.md exige rendu conditionnel, interactions de pagination et comportement responsive des tableaux.

Priorité au composant le plus chargé en logique : `TriageTable` (tri, pagination) — et [N9](#n9-le-triage-est-impraticable-au-delà-de-quelques-cve) fournit deux cas de test directement exploitables (la page ne doit pas retomber page 1 après une annotation ; la modale doit rester ouverte et refléter le nouveau statut).

### T2. Routes peu couvertes
🟡 *Partiel.* `test/functional/api.test.ts` couvre 4 modules de routes sur 11 (`stats`, `projects`, `cves`, `settings`). Non couverts : `ingest`, `annotations`, `tickets`, `tags`, `prompts`, `reports`, `console`, `audit`.

Le harnais de test appelle les objets de routes directement avec un faux `req` — ajouter une route dynamique implique d'apprendre au helper `request()` de ce fichier comment la matcher.

### T3. Test git dépendant du réseau
🔴 *Non traité.* `src/lib/git/index.test.ts` exécute toujours un vrai `git fetch` vers le remote du dépôt : lent, instable hors connexion, et échoue en CI sans accès sortant. À remplacer par un dépôt jetable créé dans un `tmpdir`.

### T4. Modules sans aucun test
🔴 *Non traité.* `src/lib/cvss.ts`, `src/lib/console.ts`, `src/db/backup.ts`. Ce dernier est particulièrement critique au vu de [N2](#n2-la-restauration-de-snapshot-ne-restaure-rien) : un test vérifiant que la restauration écrit bien dans `DB_PATH` aurait détecté le défaut immédiatement.

---

## ⚫ Priorité 6 — Écarts au contrat CONTEXT.md

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
3. **Batch d'audit côté serveur** (`/api/audit/run`, `/api/audit/status`) alors que §2 stipule « aucun endpoint batch » — et ce batch n'est appelé par aucun écran (cf. [N8](#n8--tout-auditer--séquentiel-périmètre-faux-non-annulable-et-verrou-serveur-contradictoire)).
4. **Table `reports`** et page associée : persistance des comptes-rendus de « Tout auditer ».
5. **Table `cve_occurrences`** avec `is_baseline`/`exposure_start`/`resolved_at` et calcul d'ancienneté — socle des SLA d'[UPGRADE.md §1](UPGRADE.md).
6. **Enrichissement CVSS** (`src/lib/cvss.ts`, colonnes `cvss_vector`/`html_url`/`published_at`).
7. **Annotations globales** via `project_id = -1`, contraire à §7 où l'unité est le couple CVE/projet — et non fonctionnelles ([N7](#n7-les-annotations-globales-sont-impossibles-et-limport-de-config-meurt-à-mi-parcours)).
8. **Colonnes `slug` et `is_remote`** sur `projects`, absentes du modèle de §1.
9. **`AEGIS_ALLOWED_ROOTS`, `AEGIS_INGEST_TOKEN`, `HOST`** — durcissements utiles, issus de la vague 1, non spécifiés.

**Correctif — décision produit, à prendre avant tout correctif de conformité :** trancher si `CONTEXT.md` est réaligné sur le produit réel (Jira, ingestion CI, reports, SLA deviennent contractuels ; les endpoints jamais implémentés sont retirés ou déplacés vers [UPGRADE.md](UPGRADE.md)), ou si le produit revient au contrat. Corriger ces écarts un par un sans cet arbitrage produira des allers-retours : plusieurs entrées de cette liste sont des fonctionnalités délibérément remplacées, pas des oublis.

---

## 🎯 Ordre de traitement recommandé

1. **[N5](#n5-get-apisettings-expose-les-secrets-en-clair), [N4](#n4-ssrf-authentifié-via-apiticketstest-connection), [N3](#n3-put-apiprojectsid--aucune-validation-aucune-garde-de-chemin)** — surface d'attaque. Trois correctifs courts et indépendants, qui ferment ce que C1 et C2 avaient laissé ouvert.
2. **[N6](#n6-les-erreurs-http-sont-consommées-comme-des-succès)** — un wrapper `fetchJson` unique couvre ~40 occurrences et supprime d'un coup le faux négatif « écosystème sain » et les rapports d'audit faux persistés en base.
3. **[N1](#n1-github-est-appelé-pendant-chaque-audit)** — sortir l'enrichissement du chemin d'audit. Débloque mécaniquement [N18](#n18-rate-limit-ignoré-et-perte-du-fixedin-fourni-par-loutil) et une bonne part de [N8](#n8--tout-auditer--séquentiel-périmètre-faux-non-annulable-et-verrou-serveur-contradictoire).
4. **[N10](#n10-trois-clés-didentité-différentes-pour-la-même-vulnérabilité)** — une fonction unique de clé d'identité, **avant** d'accumuler davantage de données SLA fausses. Les lignes déjà écrites devront être migrées.
5. **[N28](#n28-les-deux-tests-de-non-régression-exigés-par-la-vague-1-nexistent-pas)** — les deux tests manquants, en y ajoutant le cas de N10. Sans eux, les points 3 et 4 se re-casseront comme C3 et C12.
6. **[C9](#c9-initdb-ignore-son-paramètre) puis [N2](#n2-la-restauration-de-snapshot-ne-restaure-rien) et [N7](#n7-les-annotations-globales-sont-impossibles-et-limport-de-config-meurt-à-mi-parcours)** — sauvegarde et restauration. Aujourd'hui l'outil affiche « restauration effectuée » sans rien restaurer : c'est le comportement le plus mensonger de l'application.
7. **[N9](#n9-le-triage-est-impraticable-au-delà-de-quelques-cve) et [N14](#n14-sévérité-illisible--palette-sans-couleur-de-texte-et-préfixes-dark-amputés)** — les deux défauts qui rendent l'écran de triage inutilisable en pratique, alors qu'il est la raison d'être du produit.
8. **[N31](#n31-écarts-au-contrat-contextmd--arbitrage-à-trancher)** — arbitrage du contrat, avant d'engager le reste de la priorité 6.
