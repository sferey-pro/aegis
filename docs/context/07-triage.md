> [Index](../CONTEXT.md) · [← §6 — GitHub Advisory Database](06-advisories.md) · [§8 — Tickets Jira →](08-jira.md)

# 🛡️ 7. Agrégation des CVE & triage référent sécurité

## Objectif

Donner une vue par CVE sur tout le parc, et permettre au référent de statuer par couple **(CVE, projet)**.

## Construction de l'agrégat (`buildCveGroups`)

Source : le **dernier run** de chaque projet **non ignoré**. Un projet sans run, ou dont le dernier run est en erreur, est absent — son annotation subsiste en base.

1. Déduplication **intra-projet** sur la clé de groupe, en gardant la **pire** sévérité.
2. Regroupement **entre projets** par référence CVE.
3. Fusion des annotations de triage ; le `fixed_in` d'une annotation **écrase** la valeur du scanner.
4. Superposition des avis connus (§6) : sévérité, lien, vecteur CVSS, date de publication, version corrigée.

## Superposition des avis, et pourquoi elle est à la lecture

Un run enregistre ce que l'outil d'audit a rapporté. Les métadonnées d'avis viennent d'une source distincte qui évolue indépendamment. Les superposer à la lecture — et non en réécrivant les runs — a deux effets : le run reste le compte rendu brut de l'outil, et un enrichissement devient **immédiatement visible** sans réauditer.

Chargées en **une** requête : une lecture par vulnérabilité ajouterait un N+1 sur le chemin le plus chaud de l'application.

La sévérité de l'avis fait autorité quand elle est connue — c'est elle qui corrige les `unknown` de `yarn audit`. **Une seule fonction** sert le tri, le dédoublonnage et l'affichage : les trois avaient divergé, et un groupe pouvait s'annoncer « low » en contenant une occurrence « critical ».

## Les trois clés d'identité — délibérément distinctes

| Usage | Clé | Granularité |
|-------|-----|-------------|
| déduplication du parsing (§3) | `` `${package}\|${title}\|${cve ?? ""}` `` | la plus fine |
| diff `newCves` (§2) et suivi d'ancienneté | `package::cve`, repli `package::title` | une vulnérabilité, dans un projet |
| regroupement du triage (§7) | `cve`, repli `` `${package}: ${title}` `` | entre projets |

**Ne les unifiez pas.** Les aligner casse la conformité à §3 : deux avis de même CVE mais de titres différents fusionneraient au dédoublonnage. Une **quatrième** clé non spécifiée (`cve || package`, seule à laisser tomber le titre) a existé dans la table d'occurrences : deux avis sans CVE d'un même paquet partageaient alors leur date de première détection, et un avis découvert le matin s'affichait avec l'âge d'une faille vue six mois plus tôt.

## Annotations

Table `annotations` : `cve` (la clé de groupe de §7), `project_id` (clé étrangère, cascade), `status` ∈ `pending` \| `confirmed` \| `not_affected` \| `ignored`, `note`, `fixed_in`, `updated_at`. Upsert sur `(cve, project_id)`.

L'unité de triage est le couple **(CVE, projet)**. Il n'existe **aucune** portée globale : la convention `project_id = -1` a existé, était inatteignable — clé étrangère plus `PRAGMA foreign_keys` actif — et a été retirée le 23/08/2026.

⚠️ **Défaut connu** : `POST /api/annotations` efface `note` et `fixedIn` quand ils sont omis. Le schéma de la route applique ses valeurs par défaut avant que la logique « préserver les champs non fournis » ne puisse agir. Enregistrer un statut détruit la note saisie à la main.

Validation : « CVE requise ». Un `fixedIn` vide devient `null`.

## Ancienneté et SLA

Table `cve_occurrences`, clé `(project_id, package, cve)` où `cve` est la référence de §2 : elle **gèle** `first_seen_at` à la première rencontre et marque le tout premier run d'un projet comme `is_baseline`.

Deux compteurs d'âge distincts, et c'est structurant :

- une faille **de baseline** est datée de sa **publication d'avis** — sinon une faille de 2019 découverte aujourd'hui s'afficherait « 0 jour » ;
- une **découverte nette** est datée de sa **première détection** par Aegis.

Les deux dates sont exposées séparément, chacune nommée par sa source. Une seule affichée avec repli de l'une sur l'autre ne permet pas de savoir laquelle on lit — et l'écart entre les deux est l'information utile : une CVE publiée il y a deux ans et découverte hier signale une dépendance qui vient d'être ajoutée, ou un parc qui n'était pas audité.

## Cas limites

CVE disparue → occurrence disparue, annotation persistée, réapparaît si la CVE revient. Groupe sans référence (`ref = null`) → triable, mais la résolution GitHub échoue proprement. Réaudit ne touche jamais les annotations.

---

> [Index](../CONTEXT.md) · [← §6 — GitHub Advisory Database](06-advisories.md) · [§8 — Tickets Jira →](08-jira.md)

Écarts observés entre cette section et le code : [`ISSUE.md`](../ISSUE.md). C'est la **liste unique** des défauts — consultez-la avant de conclure qu'un comportement surprenant est un bug neuf.
