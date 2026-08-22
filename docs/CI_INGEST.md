# Ingestion depuis une CI GitHub Actions

Ce guide explique comment faire remonter les vulnérabilités d'un projet vers Aegis
depuis un workflow GitHub Actions, sans qu'Aegis ait besoin d'accéder au dépôt.

## Pourquoi passer par l'ingestion

Aegis sait auditer un projet lui-même : il lance `npm audit` dans un dossier local
et enregistre le résultat. Ce mode suppose deux choses — que le code soit **sur la
machine** qui héberge Aegis, et que le dossier soit **autorisé** par
`AEGIS_ALLOWED_ROOTS`.

L'ingestion inverse le sens du flux. C'est la CI qui exécute l'audit, dans le même
environnement que le build, et qui **pousse** son rapport à Aegis. Trois
conséquences pratiques :

- **Aucun clone côté Aegis.** Rien à cloner, rien à mettre à jour, aucun accès en
  lecture à donner sur vos dépôts privés.
- **Le lockfile est exactement celui du build.** Un audit local dépend de l'état de
  la copie de travail ; un audit en CI porte sur la révision qui vient d'être
  construite.
- **Une mesure par commit.** Le paramètre `sha` rattache le rapport à une révision
  précise, ce qui rend l'historique d'Aegis lisible et permet à un développeur de
  retrouver le code exact d'où la faille venait.

Les deux modes cohabitent : rien n'empêche d'auditer certains projets localement et
d'en faire ingérer d'autres par leur CI.

## Vue d'ensemble

```
GitHub Actions                                   Aegis
──────────────                                   ─────
npm audit --json  ──►  rapport.json
                            │
                            ▼
              POST /api/ingest/<slug>?sha=<commit>
              X-Aegis-Token: <jeton>
                            │
                            ▼
                                        parsing → enrichissement
                                        → run persisté → diff des
                                          nouvelles CVE
```

Aegis ne rappelle jamais la CI. L'appel est unidirectionnel et synchrone : la
réponse contient le run créé et le nombre de CVE nouvelles par rapport au dernier
run non-erreur du projet.

## Prérequis

### 1. Aegis doit être joignable depuis les runners

Un runner GitHub hébergé sort d'Internet : l'instance Aegis doit donc avoir une URL
publique, en **HTTPS**. Le jeton d'ingestion voyage dans un en-tête ; en HTTP il
circulerait en clair.

Si Aegis tourne sur un réseau privé, deux options :

- un **runner auto-hébergé** sur ce même réseau (`runs-on: self-hosted`) ;
- un tunnel ou un reverse proxy exposant uniquement `/api/ingest/`.

### 2. Définir `AEGIS_INGEST_TOKEN` côté Aegis

```bash
# .env de l'instance Aegis
AEGIS_INGEST_TOKEN=<chaîne aléatoire longue>
```

Pour la générer :

```bash
openssl rand -hex 32
```

Sans cette variable, la route répond **500 `Configuration manquante:
AEGIS_INGEST_TOKEN`** — jamais 401. Le refus ne dit pas « mauvais jeton » pour une
instance qui n'en a simplement pas.

Le jeton est **global**, partagé par tous les projets ingérés. Il autorise à écrire
un run sur n'importe quel slug de l'instance ; traitez-le comme un secret de
déploiement, pas comme une clé par projet.

### 3. Créer le projet dans Aegis, et récupérer son slug

L'ingestion **n'auto-crée rien**. Le projet doit exister dans Aegis, sans quoi la
route répond 404. Créez-le depuis l'écran *Projets* → *Ajouter un Projet* :

| Champ | Ce qu'il faut mettre |
|---|---|
| **Nom** | libre — il dérive le slug |
| **Outil** | `npm`, `yarn`, `bun` ou `composer`. **Il décide du parseur** : un rapport `npm` envoyé sur un projet déclaré `composer` échouera en 400. |
| **Chemin** | requis par le formulaire, mais **jamais utilisé** par l'ingestion. Mettez le chemin réel si le projet est aussi audité localement, sinon un chemin symbolique suffit. |

Le slug est dérivé du nom (minuscules, non-alphanumériques → tirets, suffixe
numérique en cas de collision). Pour le récupérer sans le deviner : sur la carte du
projet, le bouton **copier** met l'URL d'ingestion complète dans le presse-papier.

### 4. Enregistrer les secrets côté GitHub

Dans le dépôt du projet à surveiller : *Settings* → *Secrets and variables* →
*Actions*.

| Nom | Type | Valeur |
|---|---|---|
| `AEGIS_URL` | Variable | `https://aegis.exemple.fr` |
| `AEGIS_INGEST_TOKEN` | Secret | le jeton généré plus haut |

L'URL n'est pas un secret : la mettre en *Variable* la rend lisible dans les logs,
ce qui aide au diagnostic. Le jeton, lui, doit être un *Secret* — GitHub le masque
dans les logs.

Pour plusieurs dépôts, déclarez-les à l'échelle de l'organisation plutôt que de les
recopier.

## Le workflow

### Node — npm

```yaml
name: Audit de sécurité

on:
  push:
    branches: [main]
  schedule:
    # Un audit quotidien : une CVE peut être publiée sans qu'une ligne de code
    # change, donc un audit déclenché uniquement par les push finit par mentir.
    - cron: "0 6 * * *"
  workflow_dispatch:

# Deux audits simultanés sur la même branche n'apportent rien, et le second
# écraserait le premier dans l'historique d'Aegis.
concurrency:
  group: audit-${{ github.ref }}
  cancel-in-progress: true

jobs:
  audit:
    runs-on: ubuntu-latest
    permissions:
      contents: read

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      # `npm audit` lit le lockfile : pas besoin d'installer les dépendances.
      # `--json` est obligatoire — c'est ce format que le parseur attend.
      #
      # `|| true` est indispensable : `npm audit` sort en code 1 dès qu'il trouve
      # une vulnérabilité. Sans lui, l'étape échoue et le rapport n'est jamais
      # envoyé — précisément dans le cas où il est utile.
      - name: Auditer les dépendances
        run: npm audit --json > rapport.json || true

      - name: Envoyer le rapport à Aegis
        env:
          AEGIS_URL: ${{ vars.AEGIS_URL }}
          AEGIS_TOKEN: ${{ secrets.AEGIS_INGEST_TOKEN }}
        run: |
          # --fail-with-body : un 4xx/5xx fait échouer l'étape *et* affiche le
          # corps de la réponse, qui porte le message d'erreur d'Aegis. Sans lui,
          # curl sort en 0 sur un 401 et le workflow passe au vert sans rien avoir
          # ingéré.
          curl --silent --show-error --fail-with-body \
               --retry 3 --retry-connrefused --max-time 30 \
               -X POST "$AEGIS_URL/api/ingest/mon-projet?sha=$GITHUB_SHA" \
               -H "X-Aegis-Token: $AEGIS_TOKEN" \
               -H "Content-Type: text/plain" \
               --data-binary @rapport.json
```

Remplacez `mon-projet` par le slug relevé à l'étape 3.

### Les autres outils

Seule l'étape d'audit change. Utilisez **exactement** la commande de la colonne de
droite : le parseur d'Aegis attend le format de sortie de cette invocation précise.

| Outil déclaré | Commande d'audit | Format attendu |
|---|---|---|
| `npm` | `npm audit --json` | JSON, un seul objet |
| `yarn` | `yarn audit --json` | **NDJSON** — un objet JSON par ligne (Yarn 1 *classic*) |
| `bun` | `bun audit --json` | JSON |
| `composer` | `composer audit --format=json --locked --no-interaction` | JSON |

Yarn est le cas particulier : sa sortie n'est pas un document JSON mais une suite de
lignes. Ne la reformatez pas, n'y passez pas `jq` — le parseur lit le NDJSON tel
quel et ignore les lignes non-JSON.

Exemple pour Composer :

```yaml
      - uses: shivammathur/setup-php@v2
        with:
          php-version: "8.3"
          tools: composer

      # `--locked` audite le lockfile, donc pas besoin de `composer install`.
      - name: Auditer les dépendances
        run: composer audit --format=json --locked --no-interaction > rapport.json || true
```

### Monorepo : plusieurs projets, un dépôt

Un projet Aegis = un lockfile. Pour un dépôt qui en contient plusieurs, déclarez
autant de projets dans Aegis et faites une matrice :

```yaml
jobs:
  audit:
    runs-on: ubuntu-latest
    strategy:
      # Un paquet en échec ne doit pas empêcher les autres de remonter.
      fail-fast: false
      matrix:
        include:
          - dossier: packages/api
            slug: monorepo-api
          - dossier: packages/web
            slug: monorepo-web

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Auditer ${{ matrix.dossier }}
        working-directory: ${{ matrix.dossier }}
        run: npm audit --json > rapport.json || true

      - name: Envoyer le rapport à Aegis
        working-directory: ${{ matrix.dossier }}
        env:
          AEGIS_URL: ${{ vars.AEGIS_URL }}
          AEGIS_TOKEN: ${{ secrets.AEGIS_INGEST_TOKEN }}
        run: |
          curl --silent --show-error --fail-with-body \
               --retry 3 --retry-connrefused --max-time 30 \
               -X POST "$AEGIS_URL/api/ingest/${{ matrix.slug }}?sha=$GITHUB_SHA" \
               -H "X-Aegis-Token: $AEGIS_TOKEN" \
               -H "Content-Type: text/plain" \
               --data-binary @rapport.json
```

## Le contrat de la route

`POST /api/ingest/:slug`

| Élément | Valeur |
|---|---|
| En-tête d'authentification | `X-Aegis-Token: <AEGIS_INGEST_TOKEN>` |
| Paramètre de requête | `sha` — révision auditée. Optionnel, mais sans lui le run n'est rattaché à aucun commit. |
| Corps | La sortie brute de l'outil d'audit, **telle quelle**. `Content-Type: text/plain`. |

Réponse en cas de succès :

```json
{
  "success": true,
  "run": { "id": 42, "status": "vulnerable", "total": 7, "...": "..." },
  "newCvesCount": 2
}
```

`newCvesCount` est le nombre de CVE absentes du dernier run non-erreur du projet.
C'est la valeur à surveiller si vous voulez faire échouer un build sur une
régression :

```yaml
      - name: Échouer si de nouvelles CVE apparaissent
        env:
          AEGIS_URL: ${{ vars.AEGIS_URL }}
          AEGIS_TOKEN: ${{ secrets.AEGIS_INGEST_TOKEN }}
        run: |
          reponse=$(curl --silent --show-error --fail-with-body \
               -X POST "$AEGIS_URL/api/ingest/mon-projet?sha=$GITHUB_SHA" \
               -H "X-Aegis-Token: $AEGIS_TOKEN" \
               -H "Content-Type: text/plain" \
               --data-binary @rapport.json)
          echo "$reponse"
          nouvelles=$(echo "$reponse" | jq -r '.newCvesCount')
          if [ "$nouvelles" -gt 0 ]; then
            echo "::error::$nouvelles nouvelle(s) CVE par rapport au dernier audit"
            exit 1
          fi
```

⚠️ Le tout premier envoi d'un projet est un **baseline** : les vulnérabilités
existantes n'y sont pas comptées comme nouvelles, et `newCvesCount` vaut 0. Ne
concluez pas d'un premier passage vert que le projet est sain — regardez
`run.total`.

### Codes de réponse

| Code | Corps | Cause |
|---|---|---|
| 200 | `{ success: true, … }` | Rapport ingéré. |
| 401 | `{ "error": "Non autorisé" }` | Jeton absent, tronqué ou faux. |
| 404 | `{ "error": "Project introuvable" }` | Slug inconnu. Le projet doit être créé dans Aegis d'abord. |
| 400 | `{ "error": "Payload vide" }` | Corps vide — l'étape d'audit a échoué avant d'écrire quoi que ce soit. |
| 400 | `{ "error": "…" }` | Rapport illisible par le parseur de l'outil déclaré. |
| 500 | `{ "error": "Configuration manquante: AEGIS_INGEST_TOKEN" }` | Le jeton n'est pas défini sur l'instance Aegis. |

Un point d'ordre à connaître : l'authentification est vérifiée **avant** la
recherche du slug. Un slug inconnu renvoie 401 si le jeton est mauvais, jamais 404.
C'est délibéré — sinon la route dirait à un appelant non authentifié quels projets
existent.

## Ce que l'ingestion fait, et ne fait pas

**Fait :**

- parse le rapport selon l'outil **déclaré sur le projet**, pas selon le contenu ;
- fige la date de première détection de chaque vulnérabilité — c'est la date
  *Aegis* affichée dans le triage, et elle sert de base au SLA de découverte
  nette ;
- complète sévérité, vecteur CVSS et version corrigée depuis le cache d'avis GHSA
  **local** ;
- calcule le diff des nouvelles CVE contre le dernier run non-erreur ;
- persiste un run, visible immédiatement dans l'écran *Rapports*.

**Ne fait pas :**

- **aucun appel réseau vers GitHub.** L'enrichissement lit le cache, il ne
  l'alimente pas. Sur une base neuve la colonne GHSA restera vide : lancez
  *Mettre à jour les avis GHSA* depuis l'écran *Triage*, ou le rafraîchissement
  d'une CVE, pour remplir le cache.
- **aucune déduplication par commit.** L'audit local saute un run si le HEAD n'a
  pas changé ; l'ingestion, non. Un workflow qui tourne dix fois sur le même `sha`
  crée dix runs. Utilisez `concurrency` et un déclencheur sobre.
- **aucune opération git.** Ni `fetch`, ni `pull`, ni lecture de `path`.

## Diagnostic

| Symptôme | Piste |
|---|---|
| L'étape curl passe au vert mais rien n'apparaît dans Aegis | `--fail-with-body` manque : curl sort en 0 sur un 401. Ajoutez-le. |
| `401 Non autorisé` | Comparez les longueurs. La vérification impose une longueur identique avant la comparaison à temps constant ; un retour à la ligne collé dans le secret GitHub suffit à faire échouer. |
| `400 Payload vide` | L'audit n'a rien écrit. Retirez `> rapport.json` temporairement pour voir la sortie réelle dans les logs. |
| `400` avec un message de parseur | L'outil déclaré ne correspond pas au rapport envoyé. Vérifiez la colonne *Outil* du projet dans Aegis. |
| Le run apparaît mais sans lien GHSA ni patch | Normal : l'ingestion ne sort pas sur le réseau. Lancez *Mettre à jour les avis GHSA* depuis *Triage*. |
| Le run n'a pas de commit | Le paramètre `sha` est absent de l'URL. |
| Beaucoup de runs identiques | Pas de déduplication à l'ingestion. Resserrez les déclencheurs et ajoutez `concurrency`. |

Pour valider la chaîne sans passer par la CI :

```bash
npm audit --json > /tmp/rapport.json || true
curl --fail-with-body -X POST \
  "https://aegis.exemple.fr/api/ingest/mon-projet?sha=$(git rev-parse HEAD)" \
  -H "X-Aegis-Token: $AEGIS_INGEST_TOKEN" \
  -H "Content-Type: text/plain" \
  --data-binary @/tmp/rapport.json
```

## Voir aussi

- [`CONTEXT.md`](CONTEXT.md) — référence de comportement : règles de
  déduplication, messages de validation, cas limites.
- [`../.env.example`](../.env.example) — variables d'environnement de l'instance.
- [`ISSUE.md`](ISSUE.md) — défauts connus, à consulter avant de conclure qu'un
  comportement surprenant est un bug neuf.
