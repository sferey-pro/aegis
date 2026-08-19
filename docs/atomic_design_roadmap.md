# Roadmap Atomic Design : Étapes Restantes

Nous avons terminé la **Phase 3** (intégration de tous les Atomes de base via Shadcn). Voici le plan pour finaliser la transition complète du projet Aegis vers l'architecture Atomic Design.

---

## 🏗️ Phase 4 : Finalisation du Design System (Page `/debug`)
**Objectif :** Avoir une page centralisée pour visualiser et tester tous nos composants.

- [ ] **Compléter la vue des Atomes :** Ajouter les exemples pour `Switch`, `Checkbox`, `Select`, `Textarea`, `Badge`.
- [ ] **Ajouter une section "Typographie" :** Titres (`h1` à `h4`), paragraphes, et couleurs sémantiques (`primary`, `muted`, `destructive`, etc.).
- [ ] **Valider l'accessibilité :** S'assurer que chaque Atome réagit correctement au survol, focus, et état désactivé.

---

## 🧬 Phase 5 : Création des Molécules
**Objectif :** Assembler 2 à 3 Atomes ensemble pour créer des composants d'interface simples et réutilisables.

**Exemples de Molécules à créer/extraire :**
- [ ] `LabelInput` : Un composant combinant un `Label` et un `Input` (avec gestion des messages d'erreur).
- [ ] `StatCard` : Les petites cartes statistiques que l'on retrouve dans l'Overview (combinaison d'une Icône, d'un Titre, et d'une Valeur).
- [ ] `ActionBadge` : Un badge combiné avec un bouton de suppression (utilisé dans `TagsManager`).
- [ ] `FilterDropdown` : Combinaison d'un `Select` et d'une icône de filtre.

---

## 🧱 Phase 6 : Création des Organismes
**Objectif :** Assembler des Molécules et des Atomes pour former des sections d'interface complexes et indépendantes.

**Exemples d'Organismes à restructurer :**
- [ ] `Header` : Le menu de navigation principal (contenant le logo, les onglets de navigation, et les actions globales).
- [ ] `TriageTable` : Le tableau interactif complet avec ses lignes (Molécules), ses boutons d'action (Atomes) et ses filtres.
- [ ] `CveDetailsModal` / `TicketModal` : Standardiser ces modales en tant qu'Organismes réutilisables.
- [ ] `ProjectCard` : La carte complexe affichant les détails d'un projet, ses tags et ses statistiques de vulnérabilités.

---

## 📐 Phase 7 : Templates et Pages
**Objectif :** Définir la structure globale de l'application.

- [ ] **Templates (`src/components/templates/`) :** Créer un `MainLayout` ou `DashboardLayout` qui gère la disposition de la page (Sidebar/Header fixe, zone de contenu scrollable).
- [ ] **Pages (`src/pages/`) :** Déplacer les composants de haut niveau (`Triage.tsx`, `Projects.tsx`, `Reports.tsx`, `Settings.tsx`) vers un dossier `pages` pour clarifier l'architecture. Actuellement, ils agissent comme des Pages mais sont stockés avec les autres composants.

---

## 🧹 Phase 8 : Nettoyage final et Documentation
- [ ] **Supprimer le code mort :** Retirer les anciens composants non utilisés.
- [ ] **Linter & Typage :** S'assurer que tous les nouveaux composants respectent des interfaces TypeScript strictes.
- [ ] **Mise à jour du README :** Documenter la nouvelle architecture Atomic Design pour les futurs développeurs.
