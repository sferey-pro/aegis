> [Index](../CONTEXT.md) · [← §11 — Console live](11-console.md) · [§13 — Ingestion CI →](13-ingestion-ci.md)

# 💾 12. Sauvegarde, restauration & réglages

## Deux niveaux, dont un seul implémenté

| Niveau | Contenu | Format | État |
|--------|---------|--------|------|
| 1. Config JSON | projets, tags, annotations, prompts, tickets — sans runs | `.json` | ⛔ **non implémenté** : aucune sauvegarde automatique, aucun historique daté, aucune rotation |
| 2. Snapshot base | base complète, historique inclus | `.sqlite` (`VACUUM INTO`) | ✅ implémenté |

L'export et l'import de configuration existent, mais **manuellement déclenchés** ; il n'y a pas de sauvegarde périodique.

## Niveau 2 — instantanés

Dossier `BACKUP_DIR/db` (défaut `backups/db`). Cible du jour `audit-YYYY-MM-DD.sqlite` ; `VACUUM INTO` exigeant une cible absente, le fichier du jour est retiré d'abord. **Rotation** : `BACKUP_DB_KEEP` (défaut 14) instantanés conservés — les filets `pre-restore-*` en sont **exclus**, ce sont des recours et non des sauvegardes périodiques.

Le chemin est injecté en littéral dans le SQL, apostrophes doublées : `VACUUM INTO` n'accepte pas de paramètre lié. La commande passe par `exec` et non `query` — le texte SQL contient le chemin, donc chaque instantané laisserait une instruction préparée vivante de plus sur la connexion.

**Inventaire** (`listSnapshots`) : fichiers `*.sqlite` du dossier, du plus récent au plus ancien. Par fichier : `file`, `size`, `mtime`, et `counts` lus en **lecture seule** sur projects/runs/tags/annotations/prompts. Un fichier illisible garde des compteurs à zéro et **reste listé** — c'est précisément le moment où l'exploitant a besoin de voir la liste.

## Restauration — sept étapes dont l'ordre est la garantie

1. **Anti-traversal** : le nom doit correspondre à `^[\w.\-]+\.sqlite$` et ne pas contenir `..`, sinon « Nom de snapshot invalide ».
2. Existence de la source, sinon « Snapshot introuvable : `<nom>` ».
3. **Filet** : instantané de la base actuelle vers `pre-restore-<timestamp>.sqlite`. Échec toléré — une base vide ou illisible ne doit pas empêcher de restaurer, c'est justement le cas où l'on en a besoin.
4. **Fermer** la connexion.
5. **Remplacer** le fichier que `DB_PATH` désigne.
6. **Purger** `-wal` et `-shm`. Sans cette étape, l'ancien journal se rejoue par-dessus la base restaurée : ni l'ancien état, ni le nouveau.
7. **Reconnexion paresseuse** — aucune réouverture immédiate, la requête suivante ouvre la base restaurée.

Retourne `{ ok: true, preRestore, snapshots }`. Refusée en **409** si un audit tourne : remplacer le fichier sous un audit laisserait le run à moitié écrit dans une base disparue.

⚠️ Le chemin de restauration doit dériver de `DB_PATH` par la **même** résolution que l'ouverture de la base. Résolu depuis le répertoire de travail, il visait un fichier que personne n'ouvre : l'API répondait « Restauration effectuée » et la base restait identique.

## Export / import de configuration

- `GET /api/config/export` → projets, réglages **secrets masqués** par `"***"`, annotations portant le **chemin** de leur projet en plus de son identifiant.
- `POST /api/config/import` → corps au format de l'export, **idempotent**, dans **une seule transaction**.

Ordre : réglages (une valeur `"***"` est ignorée, sinon elle écraserait le vrai secret), puis projets, puis annotations. Le relink des annotations se fait par **`path`** ; les identifiants viennent d'un auto-incrément, donc un export porteur du seul `project_id` n'est rejouable que sur la base qui l'a produit. Une cible non résolvable est **ignorée**, pas fatale.

Le contrôle de chemin (§15) s'applique **avant** toute écriture. Réponse : `{ success, projectsAdded, annotationsAdded, annotationsSkipped }`. Corps non-JSON → 400 « JSON invalide ».

⚠️ **Manques connus** : la fusion des projets se fait par `slug` et non par cible d'audit résolue, et trois sections sur cinq sont absentes — `tags`, `prompts` et `tickets` ne sont ni exportés ni importés.

## Remise à zéro (`POST /api/config/reset`)

**Suppression du fichier de base principal**, pas une énumération de tables à vider : il n'y a plus de liste à tenir à jour, donc plus rien à oublier quand une table est ajoutée. Séquence : fermer → retirer `<base>`, `-wal` et `-shm` → réouvrir, ce qui recrée le fichier et réapplique le schéma. C'est le chemin d'un premier démarrage.

Ne touche **jamais** aux projets sur le disque : seul le fichier SQLite d'Aegis est supprimé. Ce qui vit dans la base d'avis — cache et clé GHSA — **survit**, et c'est la raison du découpage en deux fichiers. Refusée en 409 si un audit tourne.

## Réglages

Table `settings`, clé/valeur. `GET /api/settings` applique une **liste blanche** et remplace chaque secret par un booléen `<CLÉ>_CONFIGURED` — liste blanche et non liste noire, sans quoi tout secret ajouté ensuite fuirait par défaut.

Clés publiques : `AUDIT_MAX_AGE_HOURS`, `CRITICAL_ONLY`, `DISABLE_CONSOLE`, `JIRA_BASE_URL`, `JIRA_TOKEN_KIND`, `JIRA_CLOUD_ID`, `JIRA_USER`, `JIRA_PROJECT`, `JIRA_COMPONENT`, `JIRA_PARENT_EPIC`, `GITHUB_RL_LIMIT`, `GITHUB_RL_REMAINING`, `GITHUB_RL_RESET`, plus `ADVISORY_SYNC_LAST_AT` et `ADVISORY_SYNC_LAST_FETCHED` en **lecture seule**. Secrets : `GITHUB_TOKEN`, `JIRA_API_KEY`.

En écriture, un secret dont la valeur est **vide est ignoré** : le formulaire ne connaît pas la valeur et l'effacerait à chaque enregistrement. Les clés `GITHUB_*` sont **routées vers la base d'avis** ; `getPublicSettings` recompose la vue depuis les deux fichiers.

Validations : `AUDIT_MAX_AGE_HOURS` nombre fini **et ≥ -1**, sinon « Durée invalide ». `JIRA_BASE_URL` validée en **https** à l'écriture, et **re-validée au point d'utilisation** (§15). Booléens stricts, sinon « Valeur booléenne invalide ».

## Variables d'environnement

| Variable | Défaut | Rôle |
|----------|--------|------|
| `AEGIS_PORT` | `3001` | port d'écoute |
| `HOST` | — | interface d'écoute |
| `DB_PATH` | `audit.sqlite` | base principale ; cible de la restauration |
| `ADVISORY_DB_PATH` | `<base>-advisories.sqlite` | base d'avis |
| `AEGIS_ALLOWED_ROOTS` | — | racines auditables. **Défaut fermé** : sans la variable, rien n'est autorisé |
| `AEGIS_INGEST_TOKEN` | — | jeton d'ingestion CI (§13) |
| `GITHUB_TOKEN` | — | relève le quota GitHub de 60 à 5000 req/h |
| `BACKUP_DIR` | `backups` | dossier racine des sauvegardes |
| `BACKUP_DB_KEEP` | `14` | instantanés `.sqlite` conservés |
| `ADVISORY_SYNC_INTERVAL_MIN` | `360` | intervalle du rafraîchissement d'avis ([§6](06-advisories.md)) ; `0` désactive |

⚠️ `AUDIT_MAX_AGE_HOURS` n'est **jamais lu depuis l'environnement** — uniquement dans la table `settings`.

## Écran Réglages : une section, un enregistrement

L'écran était **une seule carte** — jeton GitHub, fenêtre d'audit, options globales, Jira, zone de danger — suivie d'un unique bouton placé après quatre cent soixante lignes de formulaire, **sous la zone de danger**. Conséquence observée à l'usage : l'utilisateur remplit Jira, ne voit pas le bouton, clique « Tester la connexion » et lit un refus qui lui reproche de ne pas avoir renseigné ce qu'il vient de saisir.

Trois sections, chacune avec **son** bouton :

| Section | Clés |
|---|---|
| jeton GitHub | `GITHUB_TOKEN` |
| paramètres d'audit | `AUDIT_MAX_AGE_HOURS`, `CRITICAL_ONLY`, `DISABLE_CONSOLE` |
| intégration Jira | les sept `JIRA_*` |

`PUT /api/settings` accepte un objet partiel et `setAllSettings` n'écrit que ce qu'on lui donne : une section n'envoie donc **que ses clés**. Une URL Jira invalide ne fait plus échouer l'enregistrement de la fenêtre d'audit, et un secret n'est plus posté à vide par la section d'une autre — ce filtrage reposait sur le serveur, et un oubli y effaçait le jeton (N5).

Trois propriétés à préserver :

1. **le bouton est inactif tant que rien n'a bougé** — il devient l'indicateur « il n'y a rien à enregistrer ici ». La référence est l'**état initial du formulaire**, valeurs par défaut comprises : comparer aux valeurs brutes du serveur marquait une section comme modifiée dès qu'une clé manquait à la réponse ;
2. **un secret est toujours « modifié » dès qu'il est saisi** — le formulaire ne connaît jamais sa valeur courante ;
3. **le bouton porte un nom accessible propre à la section** (« Enregistrer les paramètres d'audit »). Avec trois boutons nommés « Enregistrer », ni un lecteur d'écran ni un test ne peut désigner le bon.

Le test de connexion Jira, lui, porte sur la configuration **enregistrée** ([§15](15-securite.md)) : la section le dit explicitement quand le formulaire diverge.

---

> [Index](../CONTEXT.md) · [← §11 — Console live](11-console.md) · [§13 — Ingestion CI →](13-ingestion-ci.md)

Écarts observés entre cette section et le code : [`ISSUE.md`](../ISSUE.md). C'est la **liste unique** des défauts — consultez-la avant de conclure qu'un comportement surprenant est un bug neuf.
