> [Index](../CONTEXT.md) · [← §10 — Bibliothèque de prompts](10-prompts.md) · [§12 — Sauvegarde, restauration & réglages →](12-sauvegarde.md)

# 📟 11. Console live des commandes

## Nature

Diffusion **SSE** vers des abonnés en mémoire. **Volatile** : jamais persistée, aucun rejeu — un client ne voit que ce qui est émis après sa connexion.

## Modèle d'événement

`{ id, phase: "start" | "end", cmd, cwd, label: "git" | "audit" | "github", project?, exitCode?, ok?, ms?, outText?, errorText? }`.

Chaque commande est encadrée par un `start` et un `end` portant le même `id`. Un `AsyncLocalStorage` (`projectContext`) étiquette les événements avec le nom du projet sans le faire passer par les signatures d'appel.

## Le succès se déclare par `ok`, pas par `exitCode`

`exitCode` porte un vrai code de sortie de processus pour `git` et les outils d'audit, mais un **statut HTTP** pour les appels à l'API GitHub. La convention shell « zéro vaut succès » affichait donc une croix rouge sur un avis trouvé en 200, et une coche verte sur une coupure réseau qui émettait `exitCode: 0`. Le producteur qui connaît son résultat pose `ok` ; les autres gardent la sémantique du code de sortie.

## Autres règles

Toute sortie au-delà de **3000 caractères** est tronquée, avec la mention `[TRUNCATED]`. Un résultat servi depuis le cache d'avis n'émet **rien**. Le réglage `DISABLE_CONSOLE` coupe la diffusion côté serveur ; le flux annonce alors `: disabled` et le client ferme.

Un battement de cœur toutes les 25 s empêche un intermédiaire de fermer une connexion inactive. Le handle est retenu pour être annulé à l'arrêt, et `unref()` l'empêche de maintenir le process en vie à lui seul.

⚠️ **Défauts connus** : deux `EventSource` distincts sont ouverts simultanément par l'application, donc chaque commande est poussée deux fois pour un seul onglet. Et naviguer vers `/debug` démonte le composant console, ce qui ferme le flux et détruit la trace — définitivement, puisqu'il n'y a pas de rejeu.

## Sortie serveur (développement)

Le flux SSE ne va qu'au **navigateur**. En développement, le terminal du serveur ne montrait donc rien des appels sortants — ni Jira, ni GitHub, ni les sous-processus — alors que c'est là qu'on travaille.

Chaque événement est aussi écrit sur la sortie standard, une ligne par étape :

```
[jira] (mon-api) → POST /rest/api/3/issue (SEC/Task)  https://…/rest/api/3/issue
    {"fields":{"project":{"key":"SEC"},"summary":"[Aegis] lodash"}}
[jira] (mon-api) ✓ 201 340ms
    ticket SEC-7 créé
[audit] (mon-api) → npm audit --json  /srv/api
[audit] (mon-api) ✗ 1 1200ms
    npm ERR! code ENOTFOUND
```

Quatre points de contrat :

1. **Actif hors production, muet sous test.** `AEGIS_CONSOLE_STDOUT=0` coupe, `=1` force. Un test qui écrit sur stdout noie sa propre sortie.
2. **Indépendant de `DISABLE_CONSOLE`**, qui coupe la diffusion SSE vers le navigateur : rendre le terminal muet n'est pas son objet.
3. **Le label de la ligne de fin est retrouvé par `id`.** L'événement de fin ne porte ni `cmd`, ni `cwd`, ni `label` — sans table de correspondance, une ligne sur deux affichait `[undefined]`.
4. **Le succès se lit dans `ok`**, jamais dans `exitCode` : pour un appel HTTP, 200 est un succès, et la convention shell y afficherait une croix.

---

> [Index](../CONTEXT.md) · [← §10 — Bibliothèque de prompts](10-prompts.md) · [§12 — Sauvegarde, restauration & réglages →](12-sauvegarde.md)

Écarts observés entre cette section et le code : [`ISSUE.md`](../ISSUE.md). C'est la **liste unique** des défauts — consultez-la avant de conclure qu'un comportement surprenant est un bug neuf.
