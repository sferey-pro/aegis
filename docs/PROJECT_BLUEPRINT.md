# Architecture & Blueprint du Projet (Modèle de Référence)

Il sert de **Blueprint** (modèle) pour reproduire cette architecture et ses standards de qualité sur d'autres projets.

---

## 1. Les 4 Règles d'Or d'un Bon Projet

Ces règles sont incompressibles et définissent le socle qualitatif du projet :

1. **Zéro Warning & Typage Strict :** Le compilateur TypeScript et le linter (Biome) doivent toujours passer à 100%. L'utilisation de `any` est strictement interdite. Les exceptions ne sont tolérées que si elles sont documentées (ex: contraintes d'une librairie externe), ou gérées intelligemment dans les fichiers de tests.
2. **Validation à l'Exécution (Runtime Safety) :** Ne jamais faire confiance aux données entrantes (APIs, Base de données). Chaque donnée entrante ou sortante doit être validée dynamiquement (ex: via Zod) pour garantir un typage sûr de bout-en-bout.
3. **Vitesse, Performance & Simplicité :** Privilégier des outils modernes et performants (Bun, Biome, SQLite) pour réduire le temps de build, de test et d'exécution. Éviter l'empilement de technologies lourdes si des solutions natives ou intégrées suffisent.
4. **Documentation Contextualisée & Continue :** Maintenir des documents vivants (`CONTEXT.md`, `CHANGELOG.md`, `ISSUES.md`) et des directives pour l'IA (`.agents/`) afin que tout développeur ou agent IA puisse s'immerger immédiatement dans le contexte, la roadmap et les décisions architecturales.

---

## 2. Structure du Projet

L'architecture est pensée comme un monorepo léger, séparant les préoccupations métier, d'infrastructure et d'IA :

```text
/
├── app_build/                # Application principale (Fullstack Bun/React)
│   ├── src/
│   │   ├── client/           # Code Frontend (React, Shadcn UI, Tailwind)
│   │   ├── server/           # Code Backend (Bun HTTP, Base de données)
│   │   └── shared/           # Code partagé (Schemas Zod, Types)
│   ├── biome.json            # Configuration du linter/formateur ultra-rapide
│   ├── package.json          # Dépendances gérées par Bun
│   └── tsconfig.json         # Configuration stricte de TypeScript
│
├── demo_server/              # Micro-services / APIs factices pour les tests
│   └── server.ts             # Serveur mock (ElysiaJS)
│
├── .agents/                  # Cerveau IA et workflows automatisés
│   ├── rules/                # Règles comportementales des agents (Zéro Warning, UI)
│   └── workflows/            # Séquences étape-par-étape (Startcycle)
│
└── docs/                     # Documentation continue
    ├── CONTEXT.md            # Vision métier, architecture, objectifs
    ├── ISSUES.md             # Problèmes connus, tickets ouverts
    └── BLUEPRINT.md          # Ce fichier (modèle de référence)
```

---

## 3. Outils Utilisés et Configuration

### Cœur & Runtime
*   **Bun** : Utilisé comme runtime ultra-rapide (remplaçant Node.js), gestionnaire de paquets (remplaçant npm/yarn) et bundler natif pour React.
*   **TypeScript** : Configuré en mode `strict: true` (aucune concession).

### Backend
*   **Base de données** : SQLite (via le module natif ultra-performant `bun:sqlite`).
*   **Proxy / Serveur HTTP** : Serveur natif Bun (`Bun.serve`), optimisé pour les WebSockets et le proxying de requêtes.
*   **Zod** : Schémas partagés dans `src/shared/schemas.ts` pour parser les payloads HTTP et les retours de la base de données.

### Frontend
*   **React 19** : Interface utilisateur moderne.
*   **Tailwind CSS 4** : Framework utilitaire pour le design (configuré avec `bun-plugin-tailwind`).
*   **Shadcn UI & Radix UI** : Composants non-stylés et accessibles de base, offrant un design moderne, plat et épuré.
*   **Zustand** : Gestion d'état global minimaliste.
*   **Monaco Editor** : Intégration avancée d'éditeurs de code côté client, configuré en thème sombre.

### Outillage Qualité (Tooling)
*   **Biome** : Remplace à la fois ESLint et Prettier.
    *   *Configuration clé (`biome.json`)* : Règle `suspicious/noExplicitAny` activée globalement, avec une surcharge intelligente (`overrides`) pour la désactiver uniquement dans les fichiers de test `**/*.test.*`.
*   **Lefthook** : Gestionnaire de hooks Git (assure l'exécution de Biome avant chaque commit via un fichier `lefthook.yml`).
*   **Happy-DOM / React Testing Library** : Suite de tests unitaire intégrée directement avec `bun test`.

---

## 4. Bonnes Pratiques Appliquées au Code

1. **Typage Strict et Inférence Zod**
   - Éradiquer l'usage de `any`.
   - Utiliser `unknown` dans les blocs `catch (err: unknown)` et effectuer un narrowing (`if (err instanceof Error)`).
   - Dériver les types TypeScript directement des schémas Zod (ex: `type Scenario = z.infer<typeof ScenarioSchema>`) pour éviter la duplication et la désynchronisation.

2. **UI et Ergonomie (Design System)**
   - Privilégier une interface d'application "plate" (flat design) et non encombrée.
   - Les listes et la navigation doivent être denses et professionnelles (pas de styles surchargés).
   - Utiliser les classes Tailwind centralisées et réutilisables (Shadcn) pour maintenir une cohérence.

3. **Gestion des Exceptions**
   - Règle de suppression des commentaires (`// biome-ignore`, `// eslint-disable...`).
   - S'il faut ignorer une règle (ex: contrainte interne à React ou librairie tierce), elle **doit obligatoirement comporter un commentaire d'explication** (ex: `// biome-ignore lint/a11y/useKeyWithClickEvents: Exception (Design) - UI component library constraint`).

4. **Isomorphisme (Shared Folder)**
   - Le typage et les règles métier doivent résider dans le dossier `shared/` afin que le client (React) et le serveur (Bun) parlent exactement le même langage.

---

## 5. Le Processus de Développement (La Recette)

Voici les étapes chronologiques pour initialiser ou itérer sur ce type de projet :

1. **Initialisation (Bootstrapping) :**
   - Générer le projet avec Bun (`bun init`).
   - Configurer Biome et Lefthook pour asseoir la politique qualité dès la première ligne de code.
2. **Définition des Données (Fondations) :**
   - Coder les schémas Zod (`shared/schemas.ts`).
   - Coder l'initialisation SQLite et tester l'insertion des modèles de base (`server/db/`).
3. **Logique Backend & APIs :**
   - Construire les routes HTTP (`server/routes/`).
   - Mettre en place le parsing strict : tout `request.json()` doit passer par `.parse()` ou `.safeParse()`.
4. **Développement Frontend :**
   - Intégrer Tailwind CSS et importer les composants Shadcn nécessaires.
   - Connecter l'UI aux APIs locales via des hooks et stocker l'état global avec Zustand.
5. **Phase de Rafinage (Le "Zéro Warning") :**
   - Exécuter `bun run typecheck` et `bun run lint`.
   - Résoudre le moindre avertissement avant de commiter. Refactoriser les types imparfaits au lieu d'ignorer les règles.
6. **Documentation & Validation :**
   - Remplir et mettre à jour `CHANGELOG.md`.
   - Mettre à jour `CONTEXT.md` avec les nouvelles décisions d'architecture.
   - Lancer la suite de tests (`bun test`) pour s'assurer d'aucune régression.
