> [Index](../CONTEXT.md) · [← §14 — Comptes-rendus d'audit](14-rapports.md) · [Index →](../CONTEXT.md)

# 🔐 15. Invariants de sécurité

Ce sont des garde-fous du projet, pas des conseils génériques. En casser un est une régression.

## Pas de shell

Les sous-processus prennent **uniquement** des tableaux d'arguments. Aucune interpolation, aucune commande composée.

## `AEGIS_ALLOWED_ROOTS`

Confine les chemins auditables. **Défaut fermé** : sans la variable, rien n'est autorisé ; `AEGIS_ALLOWED_ROOTS=/` ouvre explicitement. Quatre propriétés à préserver :

1. le contrôle porte sur la **racine git *et* la cible d'audit résolue** — la racine sert aux commandes git, qui exécutent les hooks du dépôt ; la cible sert au lancement de l'outil ;
2. il s'applique aux **huit** points d'entrée qui touchent un chemin : `POST` et `PUT /api/projects`, `POST /api/projects/detect`, `git-fetch`, `git-pull`, l'audit unitaire, `POST /api/config/import`, et le **lot serveur** `POST /api/audit/run`. Un projet enregistré avant que la variable ne soit posée ne doit pas rester exécutable, d'où le contrôle **juste avant** chaque sous-processus et pas seulement à l'enregistrement ;
3. la comparaison se fait **au séparateur** : `/srv/autorise-bis` n'est pas sous `/srv/autorise`. Attention au cas de la racine du système, où `root + sep` donne `"//"` et ne préfixe rien ;
4. le contrôle passe **avant** la détection de doublon.

Tout nouvel endpoint acceptant un chemin doit appeler cette garde.

## Les secrets ne sortent jamais de l'API

Liste blanche en lecture (§12), booléen `<CLÉ>_CONFIGURED` à la place de la valeur. Un secret vide en écriture est ignoré.

## `JIRA_BASE_URL` est validée deux fois

En https à l'écriture, **et re-validée au point d'utilisation**. Cette valeur est appelée par le serveur avec un en-tête `Authorization: Basic` : une valeur libre en ferait un proxy sortant authentifié. C'est aussi pourquoi `/api/tickets/test-connection` ignore son corps de requête.

## Aucun appel réseau pendant un audit

Pendant un audit de lockfile, **aucun** appel sortant : le chemin d'audit lit le cache local et n'émet rien. C'est ce qui rend un run déterministe, indépendant du réseau et du quota d'un tiers.

> **Amendé le 23/08/2026.** Cette règle disait auparavant « GitHub est interrogé à la demande, **jamais en tâche de fond** ». Un rafraîchissement périodique des avis existe désormais ([§6](06-advisories.md)) : pour un projet dont le lockfile ne bouge plus, la nouvelle faille arrive par un nouvel avis et non par un commit, et attendre un clic humain laissait un angle mort.
>
> L'intention d'origine est préservée par quatre propriétés : la passe est **indépendante** de tout audit et ne peut pas le retarder ; elle est **bornée par le quota** — elle saute ce qui est en cache et s'arrête au premier 429 ; elle est **visible**, par les événements de console et par un bilan persisté que l'API expose ; et elle est **désactivable** par `ADVISORY_SYNC_INTERVAL_MIN=0`.
>
> Ce que l'ancienne formulation interdisait vraiment, c'est une tâche de fond **cachée**. Celle-ci ne l'est pas.

---

> [Index](../CONTEXT.md) · [← §14 — Comptes-rendus d'audit](14-rapports.md) · [Index →](../CONTEXT.md)

Écarts observés entre cette section et le code : [`ISSUE.md`](../ISSUE.md). C'est la **liste unique** des défauts — consultez-la avant de conclure qu'un comportement surprenant est un bug neuf.
