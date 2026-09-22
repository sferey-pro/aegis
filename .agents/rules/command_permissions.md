<RULE[aegis_command_permissions]>
# Permissions des commandes (Liste blanche spécifique à Aegis)

L'agent est strictement limité à l'utilisation des commandes de la liste suivante dans le cadre du projet Aegis. Il a l'interdiction formelle d'exécuter toute autre commande sur le système (comme rm, curl, wget, etc.). Si une tâche nécessite une commande non listée, l'agent doit demander l'autorisation à l'utilisateur.

**Commandes autorisées :**
- **Utilitaires Unix :** ls, grep, head, cat, mkdir, tail, find, wc, awk
- **Environnement JS/TS :** bun, bunx
- **Gestion de version (Git) :** git diff, git checkout, git status, git add, git log, git commit, git show, git pull, git stash, git rebase, git merge, git branch, git push
</RULE[aegis_command_permissions]>
