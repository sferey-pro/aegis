<div align="center">
  <h1>🛡️ Aegis</h1>
  <p><b>Plateforme moderne et unifiée pour le scan, le triage et la gestion des vulnérabilités de dépendances.</b></p>
</div>

<br />

## 🚀 À propos

**Aegis** est un scanner de vulnérabilités pensé pour les développeurs et les référents sécurité (AppSec). Conçu avec un design system ultra-premium *(Glassmorphism, animations fluides, support Light / Dark mode natif)*, Aegis consolide les résultats de multiples outils d'audit (`npm audit`, `yarn audit`, `bun audit`, `composer audit`) au sein d'une seule interface centralisée et agréable à utiliser.

Finies les lignes de terminal illisibles ! Avec Aegis, repérez instantanément les failles critiques et prenez des décisions rapides grâce au module de triage.

---

## ✨ Fonctionnalités Phares

- **🌐 Ingénierie Glocale** : Scannez vos projets locaux (par chemin de dossier) ou ingérez les rapports de vulnérabilité distants poussés par vos pipelines CI/CD.
- **🔍 Module de Triage Centralisé** : Passez en revue toutes vos CVEs dans une boîte de réception type "Inbox Zero". Marquez les failles comme `En attente`, `Confirmées` (Urgent), `Non affectées` (Faux positif) ou `Ignorées`.
- **📊 Tableaux de Bord & Rapports** : Suivez l'historique de votre écosystème avec des graphiques évolutifs temporels (vue 1h, 1j, 7j, 30j...) et générez des rapports d'audit globaux sur tous vos projets en un clic.
- **🎨 Design UI/UX Premium** : Interface construite en React + TailwindCSS (via l'écosystème Shadcn UI et Radix). Le système intègre des animations de layout fluides, une typographie soignée et un système de thèmes.
- **🤖 Bibliothèque de Prompts** : Espace dédié pour stocker vos prompts IA d'aide à la remédiation de sécurité.
- **🔌 Intégration Jira & Ticketing** : Support natif pour la génération automatisée de tickets Atlassian Jira. Protection anti-doublon via hachage SHA-256 (`content_hash`).
- **🔗 GitHub Advisory Data** : Enrichissement automatique des données de failles via l'API GitHub Advisory.
- **⚙️ Paramètres & Export/Import** : Configurez facilement les tags de vos projets et exportez/importez votre configuration.

---

## 🏗️ Architecture Frontend (Atomic Design)

Le code frontend de l'application est structuré selon les principes de l'**Atomic Design** pour maximiser la réutilisabilité et la maintenabilité du code. La navigation est intégralement gérée par `react-router-dom` (v7).

Le dossier `src/` est organisé comme suit :
- 📁 **`pages/`** : Les composants racines de chaque route (ex: `Overview.tsx`, `Projects.tsx`, `Triage.tsx`, `Settings.tsx`).
- 📁 **`components/`** : Les briques de l'interface graphique :
  - 🧩 **`ui/` (Atomes)** : Les composants de base purs Shadcn/Radix (Boutons, Inputs, Select, Dialogs...).
  - 🧬 **`molecules/`** : L'assemblage d'atomes pour créer des éléments simples (ex: `StatCard`, `ActionBadge`, `LabelInput`).
  - 🧱 **`organisms/`** : Les grands blocs fonctionnels autonomes (ex: `Header`, `TriageTable`, `CveDetailsModal`, `ProjectCard`).
  - 📐 **`templates/`** : Les gabarits de mise en page (ex: `MainLayout` avec Header et padding, `BlankLayout` pour la page Debug).
- 📁 **`lib/`** : Logique métier, utilitaires et constantes (ex: `triage-constants.tsx`, `cvss.ts`).

---

## 🛠️ Stack Technique

- **Moteur Backend** : [Bun](https://bun.com/) (Hautes performances, APIs natives)
- **Base de Données** : SQLite (via `bun:sqlite` - léger et performant)
- **Frontend** : React 19, React Router v7, Recharts
- **Style** : TailwindCSS v4, Lucide React pour l'iconographie

---

## ⚙️ Installation & Démarrage

### 1. Cloner le projet
```bash
git clone https://github.com/votre-org/aegis.git
cd aegis
```

### 2. Configuration de l'environnement
Copiez le fichier d'exemple :
```bash
cp .env.example .env
```
*(Vous pourrez y configurer `AEGIS_PORT`, `AEGIS_INGEST_TOKEN` et `AEGIS_ALLOWED_ROOTS`)*

> ⚠️ **`AEGIS_ALLOWED_ROOTS` est obligatoire.** Le contrôle est en **défaut
> fermé** : sans cette variable, aucun chemin n'est accepté et toute création de
> projet, opération git ou audit est refusée en 403. Git exécute les hooks du
> dépôt qu'il visite — une liste vide signifiait auparavant que n'importe quel
> chemin de l'hôte était exécutable. Pour ouvrir délibérément tout le système de
> fichiers : `AEGIS_ALLOWED_ROOTS=/`

### 3. Lancer l'environnement de développement
L'outil principal utilise un `Makefile` pour simplifier les commandes :
```bash
# Lance le serveur backend et le build frontend en mode watch (hot reload)
make dev
```

L'application sera accessible sur `http://localhost:3001`.

### Commandes Utiles (via Bun & Make)
- `make build` : Construit le bundle frontend de production dans `dist/`.
- `bun run check` (dans `app_build`) : Typage (`tsc --noEmit`) + l'intégralité de la suite de tests.

---

## 🧪 Tests

**1116 tests, 0 échec.** Chaque fichier de code porte son test à côté de lui
(colocation), et la politique **zéro warning** s'applique aux tests comme au
code de production.

La suite est coupée en deux étages, avec deux commandes distinctes — parce que
happy-dom remplace la classe globale `Response`, ce qui empêche `Bun.serve` de
démarrer :

```bash
cd app_build

bun run test        # les deux étages (1116 tests)
bun run test:ui     # 347 tests composants — happy-dom, React, fetch simulé
bun run test:api    # 769 tests fonctionnels — vrai serveur, vraie base, vrai git
bun test --watch src/db/runs.test.ts   # un fichier, en surveillance
```

L'étage fonctionnel n'est pas simulé : il démarre un vrai `Bun.serve` sur un port
éphémère, adossé à une base SQLite jetable, et exerce les 33 routes d'API par de vraies
requêtes HTTP. Les tests git travaillent sur de vrais dépôts jetables avec un
dépôt nu local comme amont. **Aucun accès réseau**, aucun fichier résiduel après
un run.

- 📄 [`docs/TESTING.md`](./docs/TESTING.md) — comment on teste : les deux étages,
  le harnais, les conventions, les pièges rencontrés et leur parade.
- 📄 [`docs/TESTS.md`](./docs/TESTS.md) — ce qui est couvert, module par module,
  et la correspondance vers les défauts de [`docs/ISSUE.md`](./docs/ISSUE.md)
  que la suite épingle.

---

## 📡 Intégration CI (Ingest API)

Aegis permet de stocker les rapports de vulnérabilités générés par vos pipelines CI/CD (GitHub Actions, GitLab CI, Jenkins, etc.) pour les centraliser sur le dashboard. 

**Exemple d'appel cURL :**
```bash
curl -X POST "http://localhost:3001/api/ingest/mon-projet-slug?sha=VOTRE_HASH_DE_COMMIT" \
     -H "X-Aegis-Token: VOTRE_TOKEN_SECRET" \
     -H "Content-Type: text/plain" \
     --data-binary @rapport-audit.json
```
*Note : Le paramètre `sha` est primordial pour que les développeurs retrouvent la révision exacte du code liée aux vulnérabilités identifiées.*

---

## 🔐 Philosophie

Aegis a été créé pour transformer l'analyse des dépendances — souvent vue comme une corvée génératrice de bruit — en une expérience visuelle, centralisée, performante et engageante. Notre but : réduire la charge cognitive des ingénieurs sécurité.
