# 🚀 Suggestions d'Évolution (Expert Sécurité)

Ce document liste les améliorations fonctionnelles identifiées pour pallier les manques de la version 1, en particulier sur l'axe de la **rapidité de communication avec les autres équipes (Dev/Ops/Produit)** et le suivi des SLAs.

> Les défauts constatés sur l'existant (bugs, sécurité, dette) sont recensés séparément dans [ISSUE.md](ISSUE.md). Certains sont des prérequis bloquants aux évolutions ci-dessous — voir la [feuille de route](#-8-feuille-de-route).

## ⏳ 1. Suivi des SLAs (Time to Remediate)

Dans la V1, l'outil se concentre sur l'état instantané (le dernier run).

- **Le besoin :** En sécurité, il est crucial de savoir *depuis quand* une vulnérabilité est présente pour faire appliquer les délais de correction (ex: 48h pour Critique, 7j pour Élevée).

Un **SLA** (*Service Level Agreement*) est ici un engagement chiffré sur le délai maximum de remédiation, indexé sur la sévérité :

| Sévérité | Délai de remédiation |
|---|---|
| Critique | 48 h |
| Élevée | 7 j |
| Modérée | 30 j |
| Faible | 90 j |

### ⚠️ Le problème du démarrage à froid

Un SLA naïf, calé sur la date à laquelle Aegis a vu la faille pour la première fois, ne fonctionne pas dans le contexte réel de déploiement : **les projets sont anciens, Aegis vient d'arriver**. Une CVE publiée il y a trois ans, présente depuis toujours dans un `package-lock.json`, apparaîtrait comme « détectée aujourd'hui, 0 jour d'ancienneté, dans les délais ».

L'indicateur serait donc faux dans les deux sens : il masquerait une exposition ancienne, et il afficherait 100 % de conformité le jour de l'installation.

La date de première détection par l'outil ne mesure rien d'autre que **la date d'installation de l'outil**. Elle ne peut pas, seule, porter un SLA.

### Trois dates, pas deux

| Date | Signification | Disponibilité |
|---|---|---|
| `published_at` | Publication de la CVE dans la base d'avis | ✅ **déjà en base** |
| `exposure_start` | Date où le projet a intégré la version vulnérable | ❌ à calculer (voir plus bas) |
| `first_seen_at` | Date où Aegis a observé la faille pour la première fois | ⚠️ existe, mais non fiable ([C12](ISSUE.md#c12-le-chronomètre-first_seen_at-se-réinitialise-tout-seul)) |

L'exposition réelle vaut `max(published_at, exposure_start)` — jamais `first_seen_at`.

**`published_at` est déjà exploitable sans travail de collecte :** la colonne `advisory_cache.published_at` existe (migration présente dans `src/db/index.ts`), `resolveFixedVersion` la retourne, et chaque vulnérabilité enrichie porte déjà un champ `publishedAt`.

### Deux âges à afficher côte à côte

C'est la distinction qui rend l'indicateur exploitable :

- **Âge d'exposition** = `now - max(published_at, exposure_start)` → mesure le **risque**. Honnête, non négociable. Sert à prioriser.
- **Âge de connaissance** = `now - first_seen_at` → mesure la **responsabilité**. Sert à tenir un engagement d'équipe.

Un SLA ne peut porter que sur le second : on ne reproche pas à une équipe un délai antérieur à la connaissance de la faille. Mais n'afficher que le second revient à mentir sur le risque. Les deux colonnes doivent coexister dans la vue de triage.

### La réponse au démarrage à froid : une baseline explicite

Pattern standard des déploiements AppSec.

**Le premier run réussi d'un projet est un run de référence.** Toutes les occurrences qu'il contient sont marquées `is_baseline = true` et basculent dans un bucket **« Dette initiale »** :

- exclues du calcul de conformité SLA — sinon 100 % de rouge au jour 1, indicateur inutilisable ;
- dotées d'une **échéance de campagne unique**, fixée manuellement par le référent (ex. « résorber la dette critique avant le 31/12 ») ;
- triées par **âge d'exposition** (`published_at`), et non par date de détection — c'est précisément là que la donnée réelle sert.

Toute occurrence apparaissant **après** le run de référence est une découverte nette : SLA classique, chronomètre à `first_seen_at`, et là il est légitime.

Le tableau de bord expose alors deux indicateurs séparés, tous deux honnêtes :

> **Dette initiale** : 47 CVE, dont 6 critiques exposées depuis plus de 2 ans — campagne T4
> **Flux courant** : 3 CVE ce mois, 100 % dans les délais

### Modèle de données

- Table dédiée `cve_occurrences`, clé `(project_id, package, cve)` :
  `first_seen_at`, `is_baseline`, `exposure_start` (nullable), `resolved_at` (nullable).
- Écriture en `INSERT … ON CONFLICT DO NOTHING` : **le premier insert fait foi, définitivement**. C'est ce qui corrige [C12](ISSUE.md).
- Seuils SLA par sévérité stockés dans `settings`, éditables depuis la page *Paramètres*.
- Date d'échéance de la campagne de dette initiale, par projet ou globale.

### Prérequis bloquant

[**C12**](ISSUE.md) — le chronomètre actuel se réinitialise tout seul (un audit en échec suffit à repartir de zéro sur tout le projet). Un SLA bâti sur l'implémentation existante s'auto-valide et ne mesure rien. **À corriger avant de développer cette section.**

### Option : dater l'exposition réelle

`published_at` n'est qu'une approximation de `exposure_start` : elle suppose que la dépendance vulnérable était déjà présente à la publication de l'avis. Aegis dispose déjà de l'intégration git pour faire mieux :

```bash
git log -S"<package>" --format=%aI -- package-lock.json | tail -1
```

Coûteux à l'échelle du parc. À réserver à une action manuelle « dater l'exposition » sur la fiche d'une CVE critique, plutôt qu'à un calcul systématique lors de chaque audit.

## 👥 2. Propriété et Routage (Owners)
Les "Tags" permettent d'identifier les équipes (ex: `team-core`), mais ne sont pas actionnables directement.
- **Le besoin :** Savoir immédiatement qui contacter sans avoir à chercher dans un annuaire d'entreprise externe.
- **L'évolution :** Ajouter un champ `owner` (email, nom d'équipe ou lien Slack) aux `projects`. Génération de liens de type `mailto:` ou raccourcis Slack directs depuis la vue d'une CVE.

## 📢 3. Communication de masse et Export
Le générateur Markdown pour Jira est parfait pour le grain fin (projet par package), mais devient fastidieux à l'échelle.
- **Le besoin :** Gérer la communication pour plusieurs projets d'un coup (ex: Bilan mensuel pour la Team Frontend).
- **L'évolution :** 
  - Bouton "Copier un résumé global" (filtré par Tag) regroupant les alertes de plusieurs projets.
  - Option d'export CSV/PDF du tableau de bord pour les reportings de conformité.

## 🔔 4. Notifications Push (Webhooks)
La V1 nécessite une démarche proactive (Pull) du référent sécurité pour constater les dérives ou les nouvelles CVE.
- **Le besoin :** Être alerté en temps réel sans avoir les yeux rivés sur l'outil.
- **L'évolution :** Ajouter une configuration de webhook (Slack/Teams). Lors d'un run "Tout auditer", l'outil pousse un message si de `newCves` critiques sont découvertes ou si la baseline d'un ticket Jira a dérivé.

> Une fois la baseline SLA en place (§1), le déclencheur doit ignorer les occurrences `is_baseline` — sinon le premier audit d'un projet ancien noie le canal Slack sous des dizaines d'alertes.

## 🤖 5. Exploitation des Prompts IA
L'application dispose d'une bibliothèque de prompts, mais ne l'intègre pas dans le flux de travail de communication.
- **Le besoin :** Rédiger très vite des conseils de remédiation précis et compréhensibles par un développeur junior.
- **L'évolution :** Bouton "Générer un message avec l'IA" sur la fiche d'une CVE. L'outil fusionnerait le contexte de la faille (nom du package, sévérité, `fixed_in`) avec un prompt sélectionné dans la bibliothèque pour recracher un brouillon prêt à être envoyé.

## 🎨 6. Évolution Continue de l'UI/UX
L'interface a récemment fait un bond qualitatif majeur (design *glassmorphism*, centralisation des largeurs de pages, densification des tableaux avec `tfoot` pour la pagination).
- **Le besoin :** Maintenir une interface premium qui s'adapte à tous les profils d'utilisateurs.
- **L'évolution :**
  - Mettre en place un système de thèmes clair/sombre basculable (Light/Dark mode) pour l'accessibilité.
  - Importer/Exporter la configuration depuis la page *Paramètres* sous forme de fichier JSON cliquable pour simplifier le partage de contexte entre différents référents.
  - Rendre les graphiques de la *Vue d'ensemble* cliquables pour atterrir directement sur les CVE concernées lors des pics de vulnérabilités.

## 🧰 7. Outillage, CI et garde-fous
Le projet ne dispose aujourd'hui d'**aucune automatisation** : pas de `.github/`, pas de linter, pas de formateur, pas de script de vérification des types, pas de `.env.example`.

- **Le besoin :** Empêcher les régressions silencieuses et rendre la configuration découvrable. Le point notable est que `tsc --noEmit` sur le code actuel ne remonte qu'une seule erreur (le module `marked`, absent de `node_modules`) : le code est déjà propre sous `strict` et `noUncheckedIndexedAccess`. Câbler la vérification coûte donc très peu et verrouille cet acquis.
- **L'évolution :**
  - **Scripts npm** — ajouter `"typecheck": "tsc --noEmit"` et `"check": "bun run typecheck && bun test"`. Renommer le paquet `bun-react-template` → `aegis`.
  - **Intégration continue** — `.github/workflows/ci.yml` : `bun install` → `typecheck` → `test`, déclenché sur pull request et sur `main`.
  - **`.env.example`** — documenter `PORT`, `HOST`, `DB_PATH`, `GITHUB_TOKEN`, `AEGIS_INGEST_TOKEN`, `AEGIS_ALLOWED_ROOTS`. Rien n'indique aujourd'hui ce qui est configurable.
  - **Formateur / linter** — Biome plutôt qu'ESLint + Prettier : une seule dépendance, lint et format réunis, intégration native avec Bun.
  - **Durcissement TypeScript** — activer `noUnusedLocals` et `noUnusedParameters`, explicitement désactivés dans `tsconfig.json`.

## 🗺️ 8. Feuille de route

Ordre de mise en œuvre conseillé. Les correctifs référencés (`C1`…) sont détaillés dans [ISSUE.md](ISSUE.md).

| Étape | Contenu | Nature | Effort |
|---|---|---|---|
| **0** | Outillage & CI (§7) | Évolution | ½ j |
| **1** | Sécurité : bind localhost, jeton d'ingestion, masquage des secrets, validation des chemins (C1, C2) | Correctif | 1 j |
| **2** | Refactor `enhanceVulnerabilities` (C3, C5, C6) | Correctif | 1 j |
| **3** | Exploitation : checkpoint WAL, verrou d'audit, `initDb` (C7, C8, C9) | Correctif | ½ j |
| **4** | Filet de tests (T1–T4) | Correctif | continu |
| **5** | **Table `cve_occurrences` — fiabiliser le chronomètre (C12)** | Correctif | S |
| **6** | Suivi des SLAs : deux âges + baseline « dette initiale » (§1) | Évolution | M |
| **7** | Owners (§2) | Évolution | S |
| **8** | Webhooks (§4) | Évolution | M |
| **9** | Import de configuration complet (C4) | Correctif | M |
| **10** | Résumé global & export CSV (§3) | Évolution | M |
| **11** | Génération IA de remédiation (§5) | Évolution | L |

**Justification de cet ordre :**

- L'**étape 0 précède tout le reste** : sans CI, les correctifs suivants régressent sans que personne ne le voie.
- Les **étapes 1 à 4** assainissent la base. Elles ne produisent aucune fonctionnalité visible, mais conditionnent la fiabilité de tout ce qui suit.
- L'**étape 5 (C12) est séparée de l'étape 6** volontairement : c'est un correctif de persistance, livrable et testable seul. Il faut aussi qu'il tourne quelques semaines pour accumuler des données fiables avant que le SLA affiché ait un sens.
- Le **SLA (§1) reste la première évolution fonctionnelle** : `published_at` est déjà collecté, la logique de report de `firstSeenAt` existe déjà dans le chemin d'audit. Le travail porte sur la persistance, les seuils et l'affichage — pas sur la collecte.
- Les **owners (§2) précèdent les webhooks (§4)** : ils fournissent la cible du routage des notifications.
- Les **webhooks (§4) consomment `newCves`**, déjà retourné par `runAudit`, et dépendent de `is_baseline` pour ne pas déclencher en masse au premier audit.
- L'**import complet (C4) est repoussé** volontairement : le schéma aura bougé (occurrences, SLA, owners). Autant écrire la logique de fusion une seule fois, sur le schéma définitif.
- La **découpe des composants monolithiques (C11)** n'apparaît pas comme une étape : à traiter de façon opportuniste, au moment où l'on touche `Projects.tsx`, `Reports.tsx` ou `Settings.tsx`.

> **Si une seule chose devait être faite :** l'étape 0, plus le `hostname: "127.0.0.1"` de l'étape 1. Une demi-journée, qui ferme le risque principal et empêche toute régression future.
