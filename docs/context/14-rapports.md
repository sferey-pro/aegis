> [Index](../CONTEXT.md) · [← §13 — Ingestion CI](13-ingestion-ci.md) · [§15 — Invariants de sécurité →](15-securite.md)

# 📊 14. Comptes-rendus d'audit global

Table `reports` : `projects_audited`, `total_vulnerabilities`, `counts` (JSON), `details` (JSON), `created_at`.

Écrite à la fin d'un « Tout auditer » (§2). **Seuls les projets réellement audités sont comptés** — un projet en échec ou annulé n'entre ni dans `projects_audited` ni dans les compteurs, sinon le compte-rendu décrirait « 20 projets, 0 vulnérabilité » quand les vingt ont échoué.

Un lot **entièrement** annulé n'est pas archivé : il n'a rien mesuré.

Listés par `created_at DESC` puis `id DESC` — deux audits lancés dans la même seconde remontaient sinon dans un ordre indéfini, or c'est cet ordre qui détermine quel compte-rendu est comparé au précédent. `DELETE /api/reports/:id` renvoie 404 sur un identifiant inconnu, pour que l'interface distingue « supprimé » de « n'existait pas ».

---

> [Index](../CONTEXT.md) · [← §13 — Ingestion CI](13-ingestion-ci.md) · [§15 — Invariants de sécurité →](15-securite.md)

Écarts observés entre cette section et le code : [`ISSUE.md`](../ISSUE.md). C'est la **liste unique** des défauts — consultez-la avant de conclure qu'un comportement surprenant est un bug neuf.
