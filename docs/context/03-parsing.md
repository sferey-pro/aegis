> [Index](../CONTEXT.md) · [← §2 — Exécution des audits](02-audits.md) · [§4 — Historique & évolution →](04-historique.md)

# 🧹 3. Parsing & normalisation des rapports

## Objectif

Transformer la sortie brute (JSON ou NDJSON) de chaque outil en une **liste unifiée** `Vulnerability[]`, puis produire `counts` par sévérité et `total`. Pipeline : parsing spécifique → déduplication → tri pire-sévérité d'abord → comptage. **Aucun enrichissement réseau ici.**

## Modèle `Vulnerability`

| Champ | Type | Présent |
|-------|------|---------|
| `package` | string | toujours |
| `severity` | Severity | toujours |
| `title` | string (défaut `"Advisory"`) | toujours |
| `cve` | string \| null | toujours, peut être null — **identifiant** de vulnérabilité (CVE ou GHSA), jamais une CWE |
| `link` | string \| null | toujours, peut être null |
| `versionRange` | string \| null | toujours, peut être null |
| `fixedIn` | string \| null | npm, yarn |
| `abandoned` | boolean | composer — paquet abandonné, pas une faille |
| `cvssVector`, `publishedAt` | string \| null | ajoutés par l'enrichissement (§6) |
| `firstSeenAt`, `isBaseline`, `ageInDays` | — | ajoutés par le suivi d'ancienneté (§7) |

## Sévérités

Normalisées en `critical` \| `high` \| `moderate` \| `low` \| `info` \| `unknown`. Toute valeur hors énumération devient `unknown`. La normalisation a lieu **à chaque point d'entrée** — les quatre parseurs et la relecture du cache d'avis — ce qui rend inatteignable toute garde en aval.

## L'identifiant, et ce qu'il n'est pas

`cve` désigne **une** vulnérabilité : une `CVE-…` ou un `GHSA-…`. Une **CWE** est une *classe de faiblesse* — « injection », « traversée de chemin » — partagée par des milliers de vulnérabilités : elle n'a pas sa place dans ce champ.

C'est structurant, parce que `cve` porte deux clés du produit : le regroupement du triage **entre projets** ([§7](07-triage.md)) et le diff `newCves` ([§2](02-audits.md)). Défaut mesuré : les parseurs npm et bun y mettaient la liste des CWE, si bien que deux failles distinctes — paquets différents, titres différents — partageant `CWE-200` se regroupaient en **une seule ligne de triage**, et l'annotation portant sur le couple (cve, projet), en annoter une annotait l'autre.

D'où vient l'identifiant, outil par outil :

| Outil | Champ source |
|---|---|
| composer | `cve` de l'avis |
| yarn | tableau `cves` |
| npm | **le GHSA de `url`** — l'outil ne rend aucun champ d'identifiant |
| bun | **le GHSA de `url`** — idem |

`refFromLink` (`lib/vuln-identity`) fait cette lecture, et reconnaît aussi une `CVE-…` dans l'URL. Aucune référence reconnaissable → `null`, jamais une valeur approchée : le repli sur le titre est assuré en aval par `occurrenceRef` (§2). `lib/github` partage ces deux motifs, donc un identifiant lu par un parseur est toujours consultable comme avis.

## Le vecteur CVSS quand l'outil le donne

npm et bun rendent un objet `cvss` porteur d'un `vectorString`. Il est conservé tel quel : l'enrichissement (§6) le complétera s'il trouve mieux dans le cache, mais son absence ne doit pas rendre un score indisponible — sans quoi l'affichage d'un CVSS dépendrait du réseau, ce que [§15](15-securite.md) refuse sur le chemin d'audit. Un `cvss` sans `vectorString` donne `null`, pas une chaîne vide.

## Formats d'entrée

| Outil | Format |
|-------|--------|
| npm | JSON, un seul objet ; `vulnerabilities` indexé par paquet, `via[]` porte les avis |
| yarn | **NDJSON** — un objet JSON par ligne. Les lignes non-JSON sont ignorées silencieusement |
| bun | JSON |
| composer | JSON ; `advisories` indexé par paquet ; les paquets abandonnés sont marqués |

## Déduplication (§3)

Ordre d'apparition conservé, première occurrence gardée. Clé = `` `${package}|${title}|${cve ?? ""}` `` — la **plus fine** des trois clés d'identité du produit (§7). Deux vulnérabilités identiques sur ces trois champs sont un doublon, même si `link`, `versionRange`, `fixedIn` ou `severity` diffèrent.

## Comptage

`counts` porte les **six** sévérités, `total` en est la somme. Un run en erreur a tous ses compteurs à zéro.

---

> [Index](../CONTEXT.md) · [← §2 — Exécution des audits](02-audits.md) · [§4 — Historique & évolution →](04-historique.md)

Écarts observés entre cette section et le code : [`ISSUE.md`](../ISSUE.md). C'est la **liste unique** des défauts — consultez-la avant de conclure qu'un comportement surprenant est un bug neuf.
