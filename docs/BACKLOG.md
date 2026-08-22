# 🎯 Backlog & Priorisation des Évolutions

Ce document consolide l'analyse des propositions faites dans `ISSUE.md` et `UPGRADE.md`. Il sert de feuille de route pour les prochains développements d'Aegis, avec une note sur 10 reflétant la valeur ajoutée de chaque proposition par rapport à l'effort demandé et au contexte opérationnel (DevSecOps).

## 🐛 Correctifs (issus de ISSUE.md)

### 🔴 C1 & C2 : Sécurité de l'API et Fuite de secrets
* **Challenge :** Un outil de cybersécurité qui expose lui-même les jetons de l'entreprise (Github, Jira) en clair via `/api/config/export` et qui permet des requêtes non authentifiées est inacceptable en production. Restreindre l'écoute à `127.0.0.1` par défaut et obfusquer les secrets sont des mesures absolues.
* **Score : 10/10** *(Vital pour la crédibilité du projet)*

### 🔴 C12 : Le chronomètre `first_seen_at` se réinitialise tout seul
* **Challenge :** C'est un bug architectural majeur. Si un scan plante (ex: problème réseau), l'historique de la CVE est effacé. Créer une table dédiée `cve_occurrences` avec un `INSERT ON CONFLICT DO NOTHING` garantira l'immutabilité de la date de première détection.
* **Score : 9.5/10** *(Bloquant pour les SLAs)*

### 🟡 C7 & C8 : Gestion SQLite (WAL) et Concurrence d'audit
* **Challenge :** Le fichier WAL de SQLite qui grossit à l'infini est une fuite d'espace disque classique. Ne pas verrouiller les scans concurrents peut corrompre la base de données. Très pertinent pour la stabilité.
* **Score : 8.5/10**

### 🟡 C3, C5, C6 : Refactorisation de l'enrichissement et corruption de données
* **Challenge :** La duplication de code entre `runAudit` et `ingestAudit` crée des incohérences (ex: injection de `NaN` pour les sévérités inconnues dans SQLite). Un refactoring propre est nécessaire.
* **Score : 8/10**

### ✅ T1 à T4 : Couverture de tests — **fait**
* **Challenge initial :** Écrire des tests pour le front-end est coûteux et souvent fragile, mais tester le cœur de la logique (`TriageTable`) est pertinent. La couverture globale n'était pas jugée prioritaire face aux failles de sécurité.
* **Réalisé :** couverture complète et colocalisée — **1159 tests, 0 échec, 90 fichiers**. Le front-end s'est révélé moins fragile que craint en visant le contrat rendu plutôt que l'implémentation. L'étage fonctionnel n'est pas simulé : vrai `Bun.serve`, vraie base SQLite jetable, vrais dépôts git jetables, aucun accès réseau.
* **Effet de bord le plus utile :** l'écriture des tests a mis au jour 14 défauts qui n'étaient dans aucun backlog, dont un provoquant une perte de données à chaque enregistrement de statut de triage ([N32](./ISSUE.md#n32-post-apiannotations-efface-les-champs-omis)). Ils sont épinglés par des tests (« écart documenté ») mais **non corrigés**. Ils ont été fusionnés dans [`ISSUE.md`](./ISSUE.md), qui est désormais la liste unique des défauts — 25 de ses entrées sont épinglées par un test.
* **Score : 7/10** *(sous-évalué a posteriori : les écarts trouvés valaient à eux seuls l'effort)*

### ⚪ C10 & C11 : Doc & Composants monolithiques
* **Challenge :** Découper les composants React (ex: `Projects.tsx` de 900 lignes) est une bonne pratique, mais ne crée aucune valeur directe pour l'utilisateur. À faire de manière opportuniste lors de modifications futures.
* **Score : 5/10**

---

## 🚀 Évolutions (issues de UPGRADE.md)

### 1. Outillage, CI et garde-fous (Étape 0)
* **Challenge :** Ajouter un Linter (Biome), forcer TypeScript strict (`tsc --noEmit`) et mettre en place une CI Github Actions est la proposition la plus basique, mais la plus indispensable pour éviter que les évolutions futures n'introduisent des régressions.
* **Score : 10/10** *(Fondation obligatoire)*

### 2. Suivi des SLAs (Baseline et Démarrage à froid)
* **Challenge :** Dater le SLA depuis l'installation de l'outil pénalise injustement les équipes. Marquer le premier scan d'un vieux projet comme "Dette initiale" (Baseline non soumise au SLA courant) est exactement ce que font les outils d'entreprise leaders.
* **Score : 9.5/10** *(Transformation de l'outil vers l'entreprise)*

### 3. Notifications Push (Webhooks Slack/Teams)
* **Challenge :** Très demandé en entreprise, à condition d'éviter l'infobésité ("alert fatigue"). Ignorer la *Baseline* (les vieilles alertes existantes) pour les webhooks est la clé pour que cette feature soit une réussite.
* **Score : 9/10**

### 4. Évolution UI/UX (Import/Export, Dark Mode)
* **Challenge :** L'import/export JSON de la configuration est un vrai besoin opérationnel pour sauvegarder et restaurer l'état. Le Dark Mode est un "nice-to-have" attendu par la majorité des développeurs.
* **Score : 7.5/10**

### 5. Propriété et Routage (Owners)
* **Challenge :** Savoir à qui appartient un projet pour le ping sur Slack est utile. Cependant, ajouter un nouveau champ `owner` fait doublon. Transformer le système de `tags` actuel pour supporter le format clé-valeur (ex: `owner:bob@corp.com`) est une approche plus élégante.
* **Score : 7/10**

### 6. Communication de masse et Export CSV/PDF
* **Challenge :** Exporter des PDF ou CSV est une pratique dépassée. Aegis se veut être un tableau de bord dynamique et vivant. Partager une URL pré-filtrée est souvent beaucoup plus efficace qu'un PDF mort.
* **Score : 6.5/10**

### 7. Exploitation des Prompts IA (Génération de message)
* **Challenge :** L'IA pour générer un brouillon de message explicatif est intéressante, mais les développeurs attendent généralement un correctif concret (Pull Request) plutôt qu'un long texte. Une analyse de type "Reachability" (est-ce que la faille est vraiment exécutée par notre code ?) aurait plus de valeur métier.
* **Score : 6/10**
