# Guide de Style et Bonnes Pratiques

Ce projet utilise la stack technique suivante : **Bun, React 19, TailwindCSS, et Shadcn UI**.
Lors de vos revues de code, assurez-vous que les modifications respectent ces principes :

## 1. React 19
- **Hooks et Concurrence** : Vérifier la bonne utilisation des nouveautés de React 19 (ex: `use`, `useActionState`, `useFormStatus`, `useOptimistic`).
- **Server Components (RSC) vs Client Components** : S'assurer que la directive `"use client"` n'est utilisée que lorsque c'est strictement nécessaire (interactivité, hooks d'état, écouteurs d'événements).
- **Fonctions asynchrones** : Favoriser les Server Actions et les fonctions asynchrones natives plutôt que des solutions externes lourdes.

## 2. TailwindCSS
- **Classes utilitaires** : Vérifier que les classes Tailwind sont privilégiées par rapport au CSS personnalisé.
- **Lisibilité** : Suggérer l'utilisation de `cn()` (clsx/tailwind-merge) fourni par Shadcn pour la fusion conditionnelle de classes.
- **Design System** : Utiliser les variables CSS définies dans le projet (ex: `bg-primary`, `text-muted-foreground`) plutôt que des valeurs arbitraires comme `bg-[#ff0000]`.

## 3. Shadcn UI
- **Réutilisation** : S'assurer que les composants Shadcn existants sont réutilisés plutôt que recréés de zéro.
- **Accessibilité (a11y)** : Shadcn est basé sur Radix. Vérifier que l'accessibilité n'est pas altérée par des modifications HTML brutales (ex: suppression des attributs `aria-` ou `role`).

## 4. Bun
- **Scripts et Exécution** : Les scripts doivent être lancés avec `bun run` ou `bun test` au lieu de `npm` ou `yarn`.
- **Gestion des dépendances** : S'assurer que le fichier de lock est `bun.lockb` ou `bun.lock`, et non `package-lock.json`.
