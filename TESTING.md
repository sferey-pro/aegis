# 🧪 Stratégie de Test - Aegis (Audit Aggregator)

## 👑 Règle d'Or
> **Chaque fonctionnalité ajoutée ou modifiée DOIT être couverte par un test automatisé.**

## 🧰 Outils Utilisés
Nous utilisons le runner de tests natif de **Bun** (`bun test`). Il est extrêmement rapide, compatible avec l'API Jest (`describe`, `test`, `expect`), et permet de tester aussi bien le code backend (API, SQLite, interactions Git) que le code frontend (React).

### 🚀 Exécution des tests
Pour lancer l'ensemble des tests du projet :
```bash
bun test
```
Pour un rechargement à chaud pendant le développement (mode watch) :
```bash
bun test --watch
```

## 🎯 Couverture Attendue
1. **Logique Métier (Backend)** :
   - Algorithmes de tri et de déduplication des CVE.
   - Parsing des rapports d'audit (`npm audit`, `composer audit`, etc.).
   - Interactions avec la base de données SQLite (écriture, lecture, migrations).
   - Règles métier du triage et de l'historique.

2. **Endpoints API** :
   - Tester la validation des requêtes HTTP (codes 400, 404, etc.).
   - Tester les réponses formatées en JSON (codes 200, 201, 204).

3. **Composants Frontend (React)** :
   - Tests de rendu conditionnel (ex: afficher le badge Critique en rouge).
   - Validation des interactions utilisateurs (pagination, changement du nombre d'éléments par page, tri).
   - Vérification de l'ergonomie et du comportement responsive des tableaux (overflow horizontal, colonnes sticky).

## 💡 Bonnes Pratiques
- Les fichiers de tests doivent se trouver à côté des fichiers testés ou dans un dossier `__tests__`.
- Leurs noms doivent se terminer par `.test.ts` ou `.test.tsx`.
- Toute Pull Request ou modification doit valider la suite de tests existante ET inclure les nouveaux tests de la fonctionnalité associée.
