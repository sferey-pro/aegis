> [Index](../CONTEXT.md) · [← §5 — Intégration Git](05-git.md) · [§7 — Agrégation CVE & triage →](07-triage.md)

# 🐙 6. Connecteur GitHub Advisory Database

## Objectif

Compléter ce que les outils d'audit ne fournissent pas : version corrigée par branche, sévérité GitHub, vecteur CVSS, date de publication, lien d'avis.

## Identification d'un avis

`keyFrom(cve, link)` cherche d'abord un GHSA dans le lien, puis dans le champ `cve`, puis une référence CVE. Regex : `GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}` et `CVE-\d{4}-\d{4,}`. Sans clé exploitable, rien n'est résoluble — un titre seul ne s'interroge pas.

## Cache

Table `advisory_cache`, dans la **base d'avis séparée**. Un parc de vingt projets partageant les mêmes CVE ne doit pas consommer vingt fois le quota. L'état du quota (`GITHUB_RL_LIMIT`, `GITHUB_RL_REMAINING`, `GITHUB_RL_RESET`) et la clé `GITHUB_TOKEN` y vivent aussi.

## Détection de quota dépassé

Un **429**, ou un **403 avec `x-ratelimit-remaining: 0`**. Un 403 avec du quota restant est un refus d'accès, pas un quota — les confondre ferait abandonner l'enrichissement à tort.

## Trois modes d'interrogation, et un seul interdit

| Mode | Réseau | Quand |
|------|--------|-------|
| `resolveFixedVersionFromCache` | **non** | chemin d'audit (§2) et agrégation (§7) |
| `syncAdvisory(cve, link)` | oui | rafraîchissement manuel d'**une** CVE |
| `syncAllAdvisories()` | oui | passe sur tout le parc — bouton de l'écran Triage **ou planificateur périodique** |

**Interdit** : appeler le réseau depuis le chemin d'audit.

## Rafraîchissement périodique

Une passe automatique toutes les `ADVISORY_SYNC_INTERVAL_MIN` minutes (défaut **360**, soit six heures ; `0` désactive). La première est différée d'une minute après le démarrage — la lancer immédiatement ferait partir une passe réseau à chaque rechargement à chaud en développement.

**Pourquoi elle existe.** Le cache ne se remplissait que sur action humaine. Or pour un projet dont le lockfile ne bouge plus — un projet en fin de vie — **la nouvelle faille arrive par un nouvel avis, pas par un commit**. Un audit quotidien sur un dépôt figé réenregistrait donc chaque jour la connaissance de la veille, avec l'apparence d'une surveillance active. C'était l'angle mort du produit.

**Une seule passe à la fois**, quelle que soit la porte d'entrée : le verrou vit avec la fonction, pas dans la route. Un clic pendant une passe planifiée doublerait sinon les appels sur la ressource la plus rare du connecteur. Le refus est un `SyncEnCoursError`, traduit en **409**.

Le bilan de la dernière passe (`ADVISORY_SYNC_LAST_AT`, `ADVISORY_SYNC_LAST_FETCHED`) est **persisté** dans la base d'avis et lisible par `GET /api/settings` : sans trace visible, une tâche de fond est indistinguable d'une tâche absente. Ces deux clés sont en **lecture seule** — les reposter réécrirait l'horodatage par la valeur affichée.

Un réglage illisible retombe sur le défaut, **jamais sur zéro** : un `ADVISORY_SYNC_INTERVAL_MIN` mal orthographié ne doit pas couper la surveillance en silence.

Voir aussi l'amendement de l'invariant correspondant dans [§15](15-securite.md).

`syncAdvisory` **ne supprime pas** la ligne avant de la redemander : hors ligne, en quota dépassé ou sur un 5xx, l'avis déjà connu serait définitivement perdu. L'écriture passe par un `ON CONFLICT` qui remplace.

`syncAllAdvisories` parcourt les clés distinctes des derniers runs, saute celles déjà en cache, et **s'arrête au premier 429** en annonçant combien de clés restent — une fois le quota épuisé, continuer ne remplirait rien et noierait la cause sous une pile d'échecs. Ce qui a été récupéré avant l'arrêt est conservé.

## Repli sur la valeur de l'outil

Dans **toutes** les branches d'échec — clé non résolvable, quota dépassé, avis introuvable, panne réseau — la version corrigée retombe sur celle que l'outil d'audit avait fournie. Ne rien savoir n'est pas savoir qu'il n'y a rien : effacer un `fixAvailable.version` par `null` fait lire « aucune correction disponible » à tort. Sans valeur de l'outil, l'échec reste un `null` honnête.

## Choix du correctif (`matchBestFix`)

Parmi les branches corrigées d'un avis : plage exacte d'abord, puis la branche de la **majeure du projet**, puis la première. Proposer `4.17.21` à un projet en `2.x` enverrait sur une montée de version majeure alors qu'un correctif existe sur sa branche.

---

> [Index](../CONTEXT.md) · [← §5 — Intégration Git](05-git.md) · [§7 — Agrégation CVE & triage →](07-triage.md)

Écarts observés entre cette section et le code : [`ISSUE.md`](../ISSUE.md). C'est la **liste unique** des défauts — consultez-la avant de conclure qu'un comportement surprenant est un bug neuf.
