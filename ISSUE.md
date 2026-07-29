# 🐛 Problèmes identifiés

Défauts relevés lors de l'analyse du code (juillet 2026). Il s'agit de correctifs sur l'existant — les nouvelles fonctionnalités sont listées dans [UPGRADE.md](UPGRADE.md).

Chaque entrée porte un identifiant stable (`C1`…`C12`, `T1`…`T4`), le point d'entrée dans le code et le correctif proposé. Classement par priorité décroissante.

| Priorité | Sujet | Entrées |
|---|---|---|
| 🔴 1 | Sécurité | C1, C2 |
| 🟠 2 | Bugs fonctionnels | C3, C4, C12 |
| 🟡 3 | Robustesse & performance | C5, C6, C7, C8, C9 |
| 🔵 4 | Couverture de tests | T1–T4 |
| ⚪ 5 | Documentation & structure | C10, C11 |

---

## 🔴 Priorité 1 — Sécurité

### C1. Aucune authentification sur l'API
Aucune route de `src/routes/` ne vérifie d'identité, de jeton ou d'origine. Aucun contrôle CORS, aucun rate limiting. Le serveur écoute sur toutes les interfaces.

Conséquences directes :
- `POST /api/ingest/:slug` — n'importe quel client peut injecter un faux rapport d'audit et fausser les métriques.
- `POST /api/projects` — le corps de requête est passé tel quel à `createProject(body)` (`src/routes/projects.ts:52`), sans validation. Un `path` arbitraire est donc accepté.
- `POST /api/projects/:id/git-pull` — exécute `git pull` dans un dépôt arbitraire. Git exécute les hooks du dépôt : combiné au point précédent, cela constitue un chemin d'exécution de code sur la machine hôte.
- `POST /api/projects/detect` — permet de sonder l'arborescence du serveur via `fs.existsSync` sur un chemin libre.

**Correctifs :**
1. Écouter sur `127.0.0.1` par défaut (`hostname: process.env.HOST || "127.0.0.1"` dans `src/index.ts`). Neutralise l'essentiel du risque dans l'usage nominal.
2. Jeton partagé obligatoire sur `/api/ingest/:slug` — seule route destinée à un appel distant. Header `X-Aegis-Token` comparé à `AEGIS_INGEST_TOKEN` en temps constant. Permet d'exposer cette route sans exposer le reste.
3. Valider `path` et `audit_path` contre une liste de racines autorisées (`AEGIS_ALLOWED_ROOTS`), après résolution du chemin. Bloque le sondage du filesystem et les hooks git arbitraires.

> *Note : les sous-processus sont tous lancés via `spawn(args[])` sans shell — il n'y a pas d'injection de commande. Le risque porte sur les chemins et les hooks git, pas sur la construction des commandes.*

### C2. Fuite des secrets par `/api/config/export`
`src/routes/settings.ts:19` renvoie `getAllSettings()` intégralement, ce qui inclut `GITHUB_TOKEN` et les identifiants Jira, stockés en clair dans la table `settings`. Un simple `GET` non authentifié suffit à les récupérer.

**Correctif :** allowlist des clés non sensibles à l'export, valeur remplacée par `***` pour les secrets. À l'import, ignorer les valeurs égales à `***` afin de ne pas écraser un secret valide par le marqueur.

---

## 🟠 Priorité 2 — Bugs fonctionnels

### C12. Le chronomètre `first_seen_at` se réinitialise tout seul

**Bloquant pour le suivi des SLAs ([UPGRADE.md §1](UPGRADE.md#-1-suivi-des-slas-time-to-remediate)).**

Dans `src/lib/audit/index.ts`, la date de première détection n'est pas persistée : elle est portée par le blob JSON `runs.vulnerabilities` et recopiée d'un run au suivant.

```ts
let firstSeenAt = new Date().toISOString();
if (lastRun && lastRun.status !== "error") {
  const key = `${v.package}::${v.cve || v.title}`;
  const oldVuln = lastRun.vulnerabilities.find((ov: any) => `${ov.package}::${ov.cve || ov.title}` === key);
  if (oldVuln && oldVuln.firstSeenAt) {
    firstSeenAt = oldVuln.firstSeenAt;
  }
}
```

Deux ruptures de chaîne :

1. **Un seul audit en échec réinitialise tous les compteurs du projet.** La condition `lastRun.status !== "error"` fait que le run suivant repart de `new Date()` pour chaque CVE, puisque `getLatestRun` renvoie le run en erreur. Un réseau coupé, un lockfile temporairement absent, et l'historique d'ancienneté est perdu.
2. **Une CVE qui disparaît puis réapparaît repart à zéro** : dépendance retirée puis remise, hoquet de l'outil d'audit, changement de branche. La recherche ne porte que sur le run immédiatement précédent, jamais sur l'historique complet.

Autrement dit, le chronomètre se remet à neuf tout seul. Un SLA construit sur cette donnée s'auto-valide : il affichera de la conformité précisément dans les cas où l'outil a perdu l'information.

Le problème est aggravé par la duplication [C5](#c5-duplication-de-la-logique-denrichissement-des-vulnérabilités) : la même logique existe en double dans `runAudit` et `ingestAudit`.

**Correctif :** sortir la date du blob JSON vers une table dédiée.

```sql
CREATE TABLE IF NOT EXISTS cve_occurrences (
  project_id    INTEGER NOT NULL,
  package       TEXT NOT NULL,
  cve           TEXT NOT NULL,
  first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_baseline   BOOLEAN DEFAULT 0,
  exposure_start DATETIME,
  resolved_at   DATETIME,
  PRIMARY KEY (project_id, package, cve),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

Écriture en `INSERT … ON CONFLICT DO NOTHING` : **le premier insert fait foi, définitivement**. Ni un run en erreur, ni une disparition temporaire ne peuvent alors réécrire la date.

Marquer `is_baseline = 1` pour les occurrences issues du premier run réussi d'un projet — c'est ce qui permet de distinguer la dette héritée du flux courant (voir [UPGRADE.md §1](UPGRADE.md)).

**Test de non-régression associé :** run 1 détecte une CVE → run 2 en erreur → run 3 la redétecte → `first_seen_at` doit être inchangé.

### C3. Compteurs de sévérité corrompus à l'ingestion CI
`src/lib/audit/index.ts`, dans `ingestAudit` :
```ts
finalCounts[v.severity as Severity]++;   // undefined++ → NaN
```
Aucun repli si la sévérité est absente de l'énumération. `runAudit` gère pourtant le cas (`if (sev in counts) … else counts.unknown++`). Un payload CI contenant une sévérité inconnue écrit donc des compteurs `NaN` en base.

**Correctif :** appliquer la même garde que `runAudit` — résolu de fait par C5.

### C4. `/api/config/import` ne restaure que les paramètres
`src/routes/settings.ts:29` ne traite que `body.settings`. Les clés `projects` et `annotations` produites par l'export sont ignorées, alors que `DOCUMENTATION.md` annonce « la portabilité complète de la base de connaissances ». La restauration échoue silencieusement, sans avertissement.

**Correctif :** importer réellement projets et annotations, avec une stratégie de fusion sur `slug` et sur `(cve, project_id)`. À défaut, aligner la documentation et signaler explicitement le périmètre partiel dans la réponse HTTP.

---

## 🟡 Priorité 3 — Robustesse & performance

### C5. Duplication de la logique d'enrichissement des vulnérabilités
Environ 60 lignes identiques entre `runAudit` et `ingestAudit` (`src/lib/audit/index.ts`) : appel `resolveFixedVersion`, report de `firstSeenAt`, écrasement de sévérité, calcul des compteurs.

C3 est la conséquence directe de cette duplication — la garde n'avait été ajoutée que d'un seul côté. C12 devra être corrigé simultanément aux deux endroits tant que la duplication subsiste.

**Correctif :** extraire une fonction partagée, appelée par les deux chemins.
```ts
async function enhanceVulnerabilities(
  project: Project,
  vulns: RawVuln[],
  lastRun: Run | null
): Promise<{ vulns: EnhancedVuln[]; counts: Counts }>
```
Ce seul refactor résout C3, C5 et C6, et fournit le point d'ancrage unique pour C12.

### C6. Requête N+1 dans `ingestAudit`
`getLatestRun(projectId)` est appelé **à l'intérieur** du `.map()` sur les vulnérabilités : une requête SQL par CVE, pour une valeur constante sur tout l'appel.

**Correctif :** hisser l'appel hors de la boucle — résolu par C5.

### C7. Le WAL SQLite n'est jamais checkpointé
Aucune occurrence de `wal_checkpoint` dans le code, et `closeDb()` n'est jamais appelé en production. Constat sur l'environnement courant : `audit.sqlite` = 4 Ko contre `audit.sqlite-wal` = **4 Mo**. Le fichier croît sans limite.

**Correctif :** `PRAGMA wal_autocheckpoint` dans `getDb()`, ou checkpoint après chaque run d'audit, plus un `closeDb()` sur `SIGINT` / `SIGTERM`.

### C8. `/api/audit/run` sans garde de concurrence
`src/routes/audit.ts` lance une boucle `setTimeout` fire-and-forget, sans état de job persisté ni verrou. Deux appels rapprochés déclenchent deux audits complets de l'écosystème en parallèle, avec écritures concurrentes sur les mêmes projets.

**Correctif :** verrou global (ou par projet) et endpoint `GET /api/audit/status` interrogeable, que l'UI utilise pour désactiver le bouton pendant l'exécution.

### C9. `initDb` ignore son paramètre
`src/db/index.ts` — la fonction reçoit `database` mais utilise la variable globale `db!` pour les migrations tardives (`ALTER TABLE reports`, `advisory_cache`). Le code fonctionne parce que les deux références coïncident, mais casse dès que `initDb` est appelée sur une autre instance : tests, restauration de snapshot.

**Correctif :** utiliser `database` partout dans la fonction.

---

## 🔵 Priorité 4 — Couverture de tests

Référence : `TESTING.md` — « chaque fonctionnalité ajoutée ou modifiée DOIT être couverte par un test automatisé ». État actuel : **56 tests / 16 fichiers**, très majoritairement backend.

### T1. Front quasi non couvert
Un seul fichier `.test.tsx` (`src/components/DashboardLayout.test.tsx`), alors que `TESTING.md` exige rendu conditionnel, interactions de pagination et comportement responsive des tableaux. Priorité au composant le plus chargé en logique : `TriageTable` (tri, pagination).

### T2. Routes peu couvertes
`test/functional/api.test.ts` teste 6 endpoints sur environ 25. Non couverts : `ingest`, `annotations`, `tickets`, `settings`, `snapshots`, `tags`, `prompts`.

### T3. Test git dépendant du réseau
`src/lib/git/index.test.ts` exécute un vrai `git fetch` : lent et instable hors connexion. À remplacer par un dépôt jetable créé dans un `tmpdir`.

### T4. Modules sans aucun test
`src/lib/cvss.ts`, `src/lib/console.ts`, `src/db/backup.ts`.

> **Tests de non-régression prioritaires :**
> - un payload d'ingestion à sévérité inconnue, pour verrouiller C3 ;
> - une séquence détection → run en erreur → redétection, pour verrouiller C12.

---

## ⚪ Priorité 5 — Documentation & structure

### C10. Dérive entre la documentation et le code

| Documenté | Réel |
|---|---|
| README : port `3000` | `3001` (`src/index.ts`) |
| README : base `aegis.db` | `audit.sqlite` (`DB_PATH`) |
| README : React 18 | React 19 |
| README : React Router | aucune dépendance de routage, navigation maison |
| `package.json` : `"name": "bun-react-template"` | à renommer `aegis` |

### C11. Composants monolithiques
`Projects.tsx` (898 lignes), `Reports.tsx` (452), `Settings.tsx` (359).

`Triage.tsx` a déjà été correctement éclaté en un sous-dossier `triage/` — appliquer la même découpe aux trois autres. À traiter de façon opportuniste, au moment où l'on touche le fichier, plutôt qu'en refactor sec.
