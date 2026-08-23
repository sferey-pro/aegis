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

---

> [Index](../CONTEXT.md) · [← §10 — Bibliothèque de prompts](10-prompts.md) · [§12 — Sauvegarde, restauration & réglages →](12-sauvegarde.md)

Écarts observés entre cette section et le code : [`ISSUE.md`](../ISSUE.md). C'est la **liste unique** des défauts — consultez-la avant de conclure qu'un comportement surprenant est un bug neuf.
