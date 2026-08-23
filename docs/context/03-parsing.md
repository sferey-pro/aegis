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
| `cve` | string \| null | toujours, peut être null |
| `link` | string \| null | toujours, peut être null |
| `versionRange` | string \| null | toujours, peut être null |
| `fixedIn` | string \| null | npm, yarn |
| `abandoned` | boolean | composer — paquet abandonné, pas une faille |
| `cvssVector`, `publishedAt` | string \| null | ajoutés par l'enrichissement (§6) |
| `firstSeenAt`, `isBaseline`, `ageInDays` | — | ajoutés par le suivi d'ancienneté (§7) |

## Sévérités

Normalisées en `critical` \| `high` \| `moderate` \| `low` \| `info` \| `unknown`. Toute valeur hors énumération devient `unknown`. La normalisation a lieu **à chaque point d'entrée** — les quatre parseurs et la relecture du cache d'avis — ce qui rend inatteignable toute garde en aval.

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
