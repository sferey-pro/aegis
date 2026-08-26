import nodePath from "node:path";
import type { BunRequest } from "bun";
import { errorMessage } from "@/lib/utils";
import { getGitStates, saveGitState } from "../db/git-state";
import {
	createProject,
	deleteProject,
	getProjectById,
	listProjects,
	type Project,
	type ProjectTool,
	updateProject,
} from "../db/projects";
import { getLatestRun, getRunsForProject, type Run } from "../db/runs";
import { auditTargetKey, resolveAuditTarget } from "../lib/audit";
import { runSingleAudit } from "../lib/audit/queue";
import {
	expandPath,
	type GitInfo,
	getGitInfo,
	gitFetch,
	gitPull,
} from "../lib/git";
import { detectBodySchema, projectBodySchema } from "../lib/schemas";
import { parseBody } from "../lib/validate";

/** L'état git est absent ou partiel si le chemin n'est pas un dépôt exploitable. */
export type ProjectGitState = GitInfo | { isRepo: false };

/**
 * Forme renvoyée par `GET /api/projects` et `GET /api/projects/:id` : l'entité
 * stockée, enrichie du dernier run et — **si on l'a demandé** — de l'état git
 * live. Déclarée ici, dans la route qui produit cet enrichissement — le handler
 * ci-dessous la satisfait, donc un changement de forme casse la compilation au
 * lieu de dériver en silence.
 *
 * `git: null` signifie « non chargé », et jamais « pas un dépôt » : la liste ne
 * lit plus l'état git au chargement (cinq sous-processus par projet), il se
 * demande.
 */
export type ProjectListItem = Project & {
	/**
	 * Dernier état git connu, `null` s'il n'a **jamais** été lu. `checkedAt` dit
	 * quand la mesure a été prise : sans cette date, un `dirty` vieux de trois
	 * jours se lirait comme la situation actuelle.
	 */
	git: (ProjectGitState & { checkedAt?: string }) | null;
	lastRun: Run | null;
};

/**
 * Un chemin n'est autorisé que s'il est sous une racine de `AEGIS_ALLOWED_ROOTS`.
 *
 * **Défaut fermé** (N3) : sans la variable, rien n'est autorisé. L'ancien défaut
 * ouvert faisait qu'une instance déployée sans la poser acceptait n'importe quel
 * chemin de l'hôte — et git exécute les hooks du dépôt qu'il visite. Pour ouvrir
 * explicitement, poser `AEGIS_ALLOWED_ROOTS=/`.
 */
function isPathAllowed(targetPath: string) {
	const allowedRootsStr = process.env.AEGIS_ALLOWED_ROOTS;
	if (!allowedRootsStr) return false;
	const allowedRoots = allowedRootsStr
		.split(",")
		.map((r) => nodePath.resolve(r.trim()));
	const absolutePath = nodePath.resolve(targetPath);
	return allowedRoots.some((root) => {
		if (absolutePath === root) return true;
		// La comparaison se fait au séparateur, pour que `/srv/autorise-bis` ne
		// passe pas pour un descendant de `/srv/autorise`. Cas particulier de la
		// racine du système : `"/" + sep` donne `"//"`, qui ne préfixe rien —
		// `AEGIS_ALLOWED_ROOTS=/` n'autorisait donc que `/` lui-même.
		const prefixe = root.endsWith(nodePath.sep) ? root : root + nodePath.sep;
		return absolutePath.startsWith(prefixe);
	});
}

/**
 * Refuse la requête si la racine git ou la cible d'audit sortent de
 * `AEGIS_ALLOWED_ROOTS`. Les deux sont contrôlées : la racine sert aux commandes
 * git (qui exécutent les hooks du dépôt), la cible sert au lancement de l'outil
 * d'audit. Contrôler la cible telle qu'elle sera réellement exécutée.
 */
function pathGuard(path: string, auditPath: string | null): Response | null {
	const root = expandPath(path);
	const target = resolveAuditTarget(path, auditPath);
	if (isPathAllowed(root) && isPathAllowed(target)) return null;

	// Deux situations très différentes, et un message qui les confondait : « chemin
	// non autorisé par AEGIS_ALLOWED_ROOTS » envoyait chercher un périmètre trop
	// étroit alors que la variable n'était pas définie du tout. Sur une instance
	// fraîche, tous les projets échouent alors pour cette raison, et l'outil passe
	// pour cassé.
	if (!process.env.AEGIS_ALLOWED_ROOTS) {
		return Response.json(
			{
				error:
					"AEGIS_ALLOWED_ROOTS n'est pas défini : aucun chemin n'est autorisé. " +
					"Renseignez les racines auditables, ou AEGIS_ALLOWED_ROOTS=/ pour tout autoriser.",
			},
			{ status: 403 },
		);
	}

	return Response.json(
		{ error: "Chemin non autorisé par AEGIS_ALLOWED_ROOTS" },
		{ status: 403 },
	);
}

/**
 * Le couple (racine git, cible d'audit) est-il dans le périmètre autorisé ?
 *
 * Prédicat réutilisable, pour les appelants hors de ce module. Deux usages :
 * `/api/config/import`, qui doit refuser un projet hors périmètre plutôt que de
 * l'enregistrer (N3), et `/api/audit/run`, qui doit l'écarter de son lot.
 *
 * **Toujours passer par ici, jamais recomposer le contrôle.** C'est la même
 * exigence que pour `resolveAuditTarget` : les deux calculs avaient divergé une
 * fois, et un `audit_path` absolu était validé comme relatif puis exécuté comme
 * absolu.
 */
export function isProjectPathAllowed(
	path: string,
	auditPath?: string | null,
): boolean {
	return pathGuard(path, auditPath ?? null) === null;
}

/** Ancien nom, conservé pour l'import de configuration. */
export const isPathAllowedForImport = isProjectPathAllowed;

/**
 * Doublon si un autre projet vise la même cible d'audit résolue (CONTEXT.md §1).
 * `excludeId` permet d'exclure le projet en cours de modification.
 */
function findDuplicate(
	path: string,
	auditPath: string | null,
	excludeId?: number,
) {
	const key = auditTargetKey(path, auditPath);
	return listProjects().find(
		(p) => p.id !== excludeId && auditTargetKey(p.path, p.audit_path) === key,
	);
}

export const projectsRoutes = {
	"/api/projects/detect": {
		async POST(req: Request) {
			const { data, response } = await parseBody(req, detectBodySchema);
			if (!data) return response;

			const denied = pathGuard(data.path, data.audit_path);
			if (denied) return denied;

			const fs = await import("node:fs");
			const fullPath = resolveAuditTarget(data.path, data.audit_path);

			// Lockfiles lus dans `AUDIT_TOOLS` (§2), **source de vérité unique** : la
			// liste était recopiée ici, et elle avait divergé — `bun.lock`, le format
			// texte de Bun, n'y figurait pas. Un projet qui n'a que ce fichier était
			// donc classé `npm` par le repli sur `package.json`, et son audit
			// échouait ensuite sur « Lockfile manquant: package-lock.json ».
			const { AUDIT_TOOLS } = await import("../lib/audit/preflight");

			// Ordre documenté en §1 : composer d'abord, puis bun, yarn, npm. Il fait
			// primer `bun` sur `yarn` et `npm` — un projet Yarn portant un lockfile
			// bun résiduel est donc classé `bun`.
			const ORDRE_DETECTION: ProjectTool[] = ["composer", "bun", "yarn", "npm"];

			let tool: ProjectTool | null = null;
			try {
				for (const candidat of ORDRE_DETECTION) {
					const trouve = AUDIT_TOOLS[candidat].lockfiles.some((nom) =>
						fs.existsSync(nodePath.join(fullPath, nom)),
					);
					if (trouve) {
						tool = candidat;
						break;
					}
				}

				// Repli sur les manifestes : propose un outil pour un projet **sans
				// lockfile**, ce qui garantit un run en erreur (§2). C'est délibéré —
				// l'erreur nomme le fichier attendu — mais ça reste un repli, donc en
				// dernier.
				if (!tool) {
					if (fs.existsSync(nodePath.join(fullPath, "composer.json")))
						tool = "composer";
					else if (fs.existsSync(nodePath.join(fullPath, "package.json")))
						tool = "npm";
				}
			} catch (_e) {}

			return Response.json({ tool });
		},
	},

	"/api/projects": {
		/**
		 * Liste des projets. **Aucun calcul git par défaut.**
		 *
		 * Calculer l'état git coûte cinq sous-processus par projet — 85 pour un parc
		 * de dix-sept — pour une valeur qui ne bouge qu'au `fetch` ou au commit
		 * local. La route rend donc le **dernier état connu**, lu en base et daté ;
		 * `?git=1` force le recalcul et met le cache à jour.
		 *
		 * `git: null` signifie **jamais lu**, et non « pas un dépôt » : confondre
		 * les deux ferait afficher « Dépôt non-git » sur tout le parc.
		 */
		async GET(req: Request) {
			const projects = listProjects();
			const { getLatestRunsByProjectIds } = await import("../db/runs");
			const latestRuns = getLatestRunsByProjectIds(projects.map((p) => p.id));

			if (new URL(req.url).searchParams.get("git") !== "1") {
				// Dernier état **connu**, sans relancer un seul sous-processus. Il n'est
				// pas live, et c'est pour cela qu'il porte sa date : l'interface montre
				// la mesure et son âge, au lieu de repartir de rien à chaque
				// rechargement.
				const etats = getGitStates(projects.map((p) => p.id));

				const depuisCache: ProjectListItem[] = projects.map((p) => {
					const connu = etats[p.id];
					return {
						...p,
						git: connu ? { ...connu.git, checkedAt: connu.checkedAt } : null,
						lastRun: latestRuns[p.id] || null,
					};
				});
				return Response.json(depuisCache);
			}

			const enriched: ProjectListItem[] = new Array(projects.length);
			let i = 0;
			// 4 concurrent workers for getGitInfo
			const concurrencyLimit = 4;
			const exec = async () => {
				while (i < projects.length) {
					const index = i++;
					const p = projects[index];
					if (!p) continue;
					let git: ProjectGitState = { isRepo: false };
					try {
						git = await getGitInfo(p.path);
					} catch (e) {
						console.error(`Git error on ${p.path}:`, e);
					}
					// Persisté : c'est ce qui évite de tout recalculer au prochain
					// affichage, et qui fait qu'une vérification laisse une trace.
					saveGitState(p.id, git);
					enriched[index] = { ...p, git, lastRun: latestRuns[p.id] || null };
				}
			};
			await Promise.all(
				Array.from({ length: Math.min(concurrencyLimit, projects.length) }).map(
					() => exec(),
				),
			);
			return Response.json(enriched);
		},
		async POST(req: Request) {
			const { data, response } = await parseBody(req, projectBodySchema);
			if (!data) return response;

			const denied = pathGuard(data.path, data.audit_path);
			if (denied) return denied;

			const duplicate = findDuplicate(data.path, data.audit_path);
			if (duplicate) {
				return Response.json(
					{
						error: `Un projet vise déjà cette cible d'audit : ${duplicate.name}`,
					},
					{ status: 409 },
				);
			}

			const project = createProject(data);
			return Response.json(project, { status: 201 });
		},
	},

	"/api/projects/:id": {
		async GET(req: BunRequest<"/api/projects/:id">) {
			const id = parseInt(req.params.id, 10);
			const p = listProjects().find((p) => p.id === id);
			if (!p) return Response.json({ error: "Not found" }, { status: 404 });
			let git: ProjectGitState = { isRepo: false };
			try {
				git = await getGitInfo(p.path);
			} catch (e) {
				console.error(`Git error on ${p.path}:`, e);
			}
			saveGitState(p.id, git);
			const run = getLatestRun(p.id);
			return Response.json({ ...p, git, lastRun: run });
		},
		async PUT(req: BunRequest<"/api/projects/:id">) {
			const id = parseInt(req.params.id, 10);
			if (!getProjectById(id)) {
				return Response.json({ error: "Projet introuvable" }, { status: 404 });
			}

			const { data, response } = await parseBody(req, projectBodySchema);
			if (!data) return response;

			const denied = pathGuard(data.path, data.audit_path);
			if (denied) return denied;

			const duplicate = findDuplicate(data.path, data.audit_path, id);
			if (duplicate) {
				return Response.json(
					{
						error: `Un projet vise déjà cette cible d'audit : ${duplicate.name}`,
					},
					{ status: 409 },
				);
			}

			const project = updateProject(id, data);
			return Response.json(project);
		},
		async DELETE(req: BunRequest<"/api/projects/:id">) {
			// N37 : 404 si rien n'a été supprimé.
			if (!deleteProject(parseInt(req.params.id, 10))) {
				return Response.json({ error: "Projet introuvable" }, { status: 404 });
			}
			return Response.json({ success: true });
		},
	},

	/**
	 * Historique des runs d'un projet.
	 *
	 * `getRunsForProject` existait, était testée, et **aucune route ne l'exposait**
	 * (écart de contrat relevé par N31). Conséquence pratique : impossible de voir
	 * qu'un projet échoue de façon répétée, alors que c'est exactement le signal
	 * qu'un audit unitaire ne donne pas — un run en erreur affiche son message, mais
	 * rien ne dit que c'est le cinquième d'affilée.
	 *
	 * `ran_at DESC` puis `id DESC` — la définition unique du §4 —, **limité aux 30
	 * derniers**, erreurs incluses. Pas de paramètre de pagination : la limite est
	 * fixée par le contrat, et en inventer un ajouterait de la surface non
	 * spécifiée.
	 */
	"/api/projects/:id/history": {
		async GET(req: BunRequest<"/api/projects/:id/history">) {
			const id = Number.parseInt(req.params.id, 10);

			// 404 sur un projet inconnu, jamais une liste vide : « aucun historique »
			// et « ce projet n'existe pas » ne se lisent pas de la même façon, et
			// confondre les deux est le mode de défaillance que N6 a fermé partout
			// ailleurs.
			if (!Number.isInteger(id) || !getProjectById(id)) {
				return Response.json({ error: "Projet introuvable" }, { status: 404 });
			}

			return Response.json(getRunsForProject(id));
		},
	},

	"/api/projects/:id/git-fetch": {
		async POST(req: BunRequest<"/api/projects/:id/git-fetch">) {
			const id = parseInt(req.params.id, 10);
			const project = listProjects().find((p) => p.id === id);
			if (!project)
				return Response.json({ error: "Not found" }, { status: 404 });

			// N3 : git exécute les hooks du dépôt qu'il visite. Le contrôle de chemin
			// doit donc précéder **tout** lancement de sous-processus, et pas
			// seulement l'enregistrement du projet — un projet créé avant que
			// `AEGIS_ALLOWED_ROOTS` ne soit posé resterait sinon exécutable.
			const denied = pathGuard(project.path, project.audit_path);
			if (denied) return denied;

			const { projectContext } = await import("../lib/console");
			// `git` recalculé après l'action, comme §5 le décrit : sans lui la réponse
			// ne dit pas ce que l'action a changé, et l'appelant devait recharger
			// toute la liste des projets pour l'apprendre. C'est cette information que
			// la synchronisation groupée trie (« combien de commits de retard »).
			const res = await projectContext.run(
				{ project: project.name },
				async () => {
					const action = await gitFetch(project.path);
					const git = await getGitInfo(project.path);
					saveGitState(project.id, git);
					return { ...action, git };
				},
			);

			return Response.json(res);
		},
	},

	"/api/projects/:id/git-pull": {
		async POST(req: BunRequest<"/api/projects/:id/git-pull">) {
			const id = parseInt(req.params.id, 10);
			const project = listProjects().find((p) => p.id === id);
			if (!project)
				return Response.json({ error: "Not found" }, { status: 404 });

			// N3 : git exécute les hooks du dépôt qu'il visite. Le contrôle de chemin
			// doit donc précéder **tout** lancement de sous-processus, et pas
			// seulement l'enregistrement du projet — un projet créé avant que
			// `AEGIS_ALLOWED_ROOTS` ne soit posé resterait sinon exécutable.
			const denied = pathGuard(project.path, project.audit_path);
			if (denied) return denied;

			const { projectContext } = await import("../lib/console");
			// `git` recalculé après l'action, comme §5 le décrit : sans lui la réponse
			// ne dit pas ce que l'action a changé, et l'appelant devait recharger
			// toute la liste des projets pour l'apprendre. C'est cette information que
			// la synchronisation groupée trie (« combien de commits de retard »).
			const res = await projectContext.run(
				{ project: project.name },
				async () => {
					const action = await gitPull(project.path);
					const git = await getGitInfo(project.path);
					saveGitState(project.id, git);
					return { ...action, git };
				},
			);

			return Response.json(res);
		},
	},

	"/api/projects/:id/audit": {
		async POST(req: BunRequest<"/api/projects/:id/audit">) {
			const id = parseInt(req.params.id, 10);
			const url = new URL(req.url);
			// N11 : CONTEXT.md §2 spécifie `?force=1`. Le front s'était aligné sur
			// `true`, ce qui masquait le défaut en usage interne — mais tout client
			// conforme au contrat voyait son forçage **silencieusement ignoré** et
			// recevait un rapport dédupliqué en croyant avoir réaudité. Les deux
			// formes sont acceptées.
			const forceParam = url.searchParams.get("force");
			const force = forceParam === "1" || forceParam === "true";
			try {
				const { getProjectById } = await import("../db/projects");
				const project = getProjectById(id);
				if (!project)
					return Response.json(
						{ success: false, error: "Not found" },
						{ status: 404 },
					);

				// N3 : contrôle du chemin juste avant le lancement de l'outil d'audit.
				const denied = pathGuard(project.path, project.audit_path);
				if (denied) return denied;

				const { projectContext } = await import("../lib/console");
				const res = await projectContext.run({ project: project.name }, () =>
					runSingleAudit(id, force),
				);
				return Response.json({ success: true, ...res });
			} catch (e: unknown) {
				// N8 : un refus de concurrence est un **conflit**, pas une panne. Il
				// tombait dans le `catch` générique et sortait en 500, ce qui le rendait
				// indistinguable d'un plantage — alors que le client orchestrateur doit
				// savoir qu'il peut réessayer.
				const { AuditEnCoursError } = await import("../lib/audit/queue");
				if (e instanceof AuditEnCoursError) {
					return Response.json(
						{ success: false, error: e.message },
						{ status: 409 },
					);
				}
				return Response.json(
					{ success: false, error: errorMessage(e) },
					{ status: 500 },
				);
			}
		},
	},
};
