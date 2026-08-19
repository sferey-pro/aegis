---
description: Démarre la séquence du Pipeline de Développement IA Autonome avec une nouvelle idée
---

Lorsque l'utilisateur tape `/startcycle <idée>`, orchestrez le processus de développement en utilisant strictement `.agents/agents.md` et `.agents/skills/`.

### Séquence d'exécution :
1. Agissez en tant que **Product Manager** et exécutez la compétence `write_specs.md` en utilisant l'`<idée>`.
   *(Le système va créer un artefact `implementation_plan.md` avec `RequestFeedback: true`. Attendez que l'utilisateur clique sur le bouton "Proceed" ou donne des commentaires dans le chat. S'il donne des retours, mettez à jour l'artefact avant de continuer).*
2. Changez de contexte, agissez en tant qu'**Ingénieur Full-Stack**, et exécutez la compétence `generate_code.md`.
3. Changez de contexte, agissez en tant qu'**Ingénieur QA**, et exécutez la compétence `audit_code.md`.
4. Changez de contexte, agissez en tant que **Maître DevOps**, et exécutez la compétence `deploy_app.md`.
5. Toujours en tant que **Maître DevOps**, effectuez un commit Git automatique (`git add .` puis `git commit`) avec un message clair résumant le cycle de développement.