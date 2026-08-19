# Règles et Bonnes Pratiques : React 19 & Bun

Ces règles doivent être appliquées par tous les agents (Ingénieur, QA, Code Reviewer) lorsqu'ils génèrent, modifient ou revoient du code dans l'application.

## 1. L'Écosystème Bun
- **Test Runner** : L'environnement de test utilise l'exécuteur natif de Bun (`bun test`). Le DOM est pré-configuré via `happy-dom`. Il n'est pas nécessaire d'importer `jest`.
- **Gestion des paquets** : L'ajout de bibliothèques se fait **strictement** avec `bun add` (jamais `npm install`).
- **Scripts** : Privilégiez les commandes `bun run <script>` ou l'exécution directe `bun <fichier.ts>`.

## 2. React 19 : Philosophie
- **Client vs Server** : Si le projet le permet (Next.js, Waku, ou frameworks supportant les RSC), minimisez le code côté client. N'utilisez `"use client"` que si le composant a besoin de :
  - Interactivité (onClick, onChange...)
  - Gestion d'état (useState, useReducer)
  - Effets de cycle de vie (useEffect)
- **Hooks modernes** : Tirez parti de `use()`, `useTransition`, `useActionState`, et `useOptimistic` pour une meilleure gestion des chargements et des formulaires concurrents.

## 3. Tests (@testing-library/react)
- **Tests Orientés Utilisateur** : Interagissez avec l'application comme le ferait un utilisateur. Ne testez pas l'implémentation interne (les states privés) mais plutôt ce qui est rendu à l'écran.
- **Sélecteurs (Queries)** : 
  1. `getByRole`, `getByLabelText` (Les plus robustes, garantissent l'accessibilité)
  2. `getByText`, `getByPlaceholderText`
  3. `getByTestId` (Seulement en dernier recours si le ciblage par rôle est impossible)
- **Propreté** : `@testing-library/react` s'occupe de nettoyer le DOM après chaque test grâce à la configuration existante, inutile d'appeler `cleanup()` manuellement.

## 4. UI avec TailwindCSS et Shadcn
- Utilisez toujours l'utilitaire `cn()` fourni (qui combine `clsx` et `tailwind-merge`) pour la fusion conditionnelle des classes Tailwind. Cela évite les conflits et écrasements inattendus.
- L'accessibilité est reine. Ne supprimez pas les propriétés sémantiques ou `aria-*` générées par les composants Shadcn/Radix.
