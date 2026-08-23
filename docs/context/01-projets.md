> [Index](../CONTEXT.md) · [← Index](../CONTEXT.md) · [§2 — Exécution des audits →](02-audits.md)

# 📁 1. Gestion des projets

## Modèle

| Champ | Type | Sens |
|-------|------|------|
| `id` | INTEGER | clé primaire auto-incrémentée |
| `name` | TEXT | libellé, non vide après trim |
| `path` | TEXT | **racine git**, non vide après trim |
| `audit_path` | TEXT \| null | sous-dossier du lockfile ; vide → `null` |
| `slug` | TEXT | dérivé du nom, unique ; sert d'adresse d'ingestion (§13) |
| `type` | `node` \| `composer` | famille du projet |
| `tool` | `npm` \| `yarn` \| `bun` \| `composer` | outil d'audit |
| `tags` | JSON | tableau de **noms** référençant le catalogue (§9) |
| `ignored` | BOOLEAN | projet EOL, exclu des audits et agrégations |
| `is_remote` | BOOLEAN | projet sans copie locale |
| `created_at` | DATETIME | horodatage d'insertion |

## Cible d'audit résolue

`resolveAuditTarget(path, auditPath)` est la **source de vérité unique**. `path` est la racine git, `audit_path` le dossier du lockfile : relatif à la racine, ou bien **absolu, auquel cas il la remplace** — un `audit_path` commençant par `/` ou `~` n'est jamais concaténé.

Les opérations git utilisent la racine ; l'outil d'audit tourne dans la cible. Le contrôle d'autorisation de chemin (§15) et la détection de doublon **doivent appeler cette fonction**, jamais recomposer le chemin de leur côté : les deux calculs avaient divergé, si bien qu'un `audit_path` absolu était validé comme relatif puis exécuté comme absolu.

## Détection de doublon (unicité par cible d'audit)

Deux projets sont doublons s'ils ont la **même clé de cible d'audit résolue**. À la création : refus si un projet existant a la même cible. À la modification : même contrôle en **excluant** le projet édité. Comparaison sur chemin résolu — `~/app` ≡ `/home/user/app` ≡ `/home/user/app/`.

Le contrôle d'autorisation de chemin passe **avant** la détection de doublon : un 409 sur un chemin interdit révélerait l'existence du projet.

## Projet ignoré (EOL)

`ignored = true` → exclu des audits (individuels et « Tout auditer »), du résumé du tableau de bord, de la bannière de retard git, de l'agrégation CVE et de l'historique global. Reste stocké, **réactivable** à tout moment ; la (dé)marque n'efface aucune donnée ni run.

⚠️ **Une exception délibérée** : l'ingestion CI (§13) remonte les nouvelles CVE d'un projet ignoré. Le drapeau a une finalité d'affichage ; il ne décide pas du résultat d'une porte CI.

## Validations (corps de requête projet)

| Règle | Erreur |
|-------|--------|
| Corps JSON lisible | « JSON invalide » |
| `name` non vide (trim) | « Nom requis » |
| `path` non vide (trim) | « Chemin requis » |
| `type` ∈ {node, composer} | « Type invalide (node\|composer) » |
| `tool` ∈ {npm, yarn, bun, composer} | « Outil invalide (npm\|yarn\|composer) » |
| Doublon de cible | « Un projet vise déjà cette cible d'audit : `<nom>` » (409) |
| Chemin hors périmètre | « Chemin non autorisé par AEGIS_ALLOWED_ROOTS » (403) |

Validation par **Zod**, consommée via `parseBody(req, schema)`, qui **retourne** l'échec au lieu de le lever — un seul message par requête, en 400. Le message de `tool` n'énumère pas `bun` alors que la valeur est acceptée : écart de libellé assumé, conservé pour ne pas casser les tests qui le citent.

Autres règles : `audit_path` trimé, chaîne vide → `null`. `tags` accepté seulement si tableau, puis normalisé (§9). Aucune validation de cohérence `type`/`tool` — `composer` + `npm` passe le parsing. Aucune vérification d'existence du chemin à la création ou à l'édition.

## Opérations

- **Lister** : tous les projets, `created_at` décroissant, enrichis de leur **dernier run** (§4) et de leur **état git live** (§5), calculé en parallèle avec une concurrence bornée.
- **Créer / Modifier** : valident, contrôlent le chemin, refusent le doublon. Le `PUT` réécrit **tous** les champs éditables : basculer `ignored` par cette route réécrit aussi nom, chemin, type, outil et tags.
- **Supprimer** : cascade sur runs, annotations, tickets. Idempotent — un id inexistant ne lève pas.
- **Détecter l'outil** (`POST /api/projects/detect`) : cherche dans le dossier, **dans cet ordre**, `composer.lock`, `bun.lockb`, `yarn.lock`, `package-lock.json`, puis en repli `composer.json` et `package.json`. Renvoie `{tool}` ou rien.

  ⚠️ Trois limites connues : `bun.lock` (format texte récent) n'est **pas** testé, seul `bun.lockb` l'est ; l'ordre fait primer `bun` sur `yarn` et `npm`, donc un projet Yarn portant un `bun.lockb` résiduel est classé `bun` ; et le repli sur les manifestes propose un outil pour un projet **sans lockfile**, ce qui garantit un run en erreur. La détection ne parcourt pas les sous-dossiers : le lockfile d'un monorepo doit être déclaré à la main via `audit_path`.

---

> [Index](../CONTEXT.md) · [← Index](../CONTEXT.md) · [§2 — Exécution des audits →](02-audits.md)

Écarts observés entre cette section et le code : [`ISSUE.md`](../ISSUE.md). C'est la **liste unique** des défauts — consultez-la avant de conclure qu'un comportement surprenant est un bug neuf.
