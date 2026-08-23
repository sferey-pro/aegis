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
| `syncAllAdvisories()` | oui | passe d'enrichissement sur tout le parc |

**Interdit** : appeler le réseau depuis le chemin d'audit.

`syncAdvisory` **ne supprime pas** la ligne avant de la redemander : hors ligne, en quota dépassé ou sur un 5xx, l'avis déjà connu serait définitivement perdu. L'écriture passe par un `ON CONFLICT` qui remplace.

`syncAllAdvisories` parcourt les clés distinctes des derniers runs, saute celles déjà en cache, et **s'arrête au premier 429** en annonçant combien de clés restent — une fois le quota épuisé, continuer ne remplirait rien et noierait la cause sous une pile d'échecs. Ce qui a été récupéré avant l'arrêt est conservé.

## Repli sur la valeur de l'outil

Dans **toutes** les branches d'échec — clé non résolvable, quota dépassé, avis introuvable, panne réseau — la version corrigée retombe sur celle que l'outil d'audit avait fournie. Ne rien savoir n'est pas savoir qu'il n'y a rien : effacer un `fixAvailable.version` par `null` fait lire « aucune correction disponible » à tort. Sans valeur de l'outil, l'échec reste un `null` honnête.

## Choix du correctif (`matchBestFix`)

Parmi les branches corrigées d'un avis : plage exacte d'abord, puis la branche de la **majeure du projet**, puis la première. Proposer `4.17.21` à un projet en `2.x` enverrait sur une montée de version majeure alors qu'un correctif existe sur sa branche.

---

> [Index](../CONTEXT.md) · [← §5 — Intégration Git](05-git.md) · [§7 — Agrégation CVE & triage →](07-triage.md)

Écarts observés entre cette section et le code : [`ISSUE.md`](../ISSUE.md). C'est la **liste unique** des défauts — consultez-la avant de conclure qu'un comportement surprenant est un bug neuf.
