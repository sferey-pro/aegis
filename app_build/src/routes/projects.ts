import nodePath from "node:path";
import type { BunRequest } from "bun";
import { errorMessage } from "@/lib/utils";
import {
	createProject,
	deleteProject,
	getProjectById,
	listProjects,
	type Project,
	updateProject,
} from "../db/projects";
import { getLatestRun, type Run } from "../db/runs";
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
 * stockée, enrichie de l'état git live et du dernier run. Déclarée ici, dans la
 * route qui produit cet enrichissement — le handler ci-dessous la satisfait, donc
 * un changement de forme casse la compilation au lieu de dériver en silence.
 */
export type ProjectListItem = Project & {
	git: ProjectGitState;
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
 * Contrôle de chemin réutilisable, pour les appelants hors de ce module —
 * aujourd'hui `/api/config/import`, qui doit refuser un projet hors périmètre
 * plutôt que de l'enregistrer (N3).
 */
export function isPathAllowedForImport(
	path: string,
	auditPath?: string | null,
): boolean {
	return pathGuard(path, auditPath ?? null) === null;
}

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

			let tool = null;
			try {
				if (fs.existsSync(nodePath.join(fullPath, "composer.lock")))
					tool = "composer";
				else if (fs.existsSync(nodePath.join(fullPath, "bun.lockb")))
					tool = "bun";
				else if (fs.existsSync(nodePath.join(fullPath, "yarn.lock")))
					tool = "yarn";
				else if (fs.existsSync(nodePath.join(fullPath, "package-lock.json")))
					tool = "npm";
				else if (fs.existsSync(nodePath.join(fullPath, "composer.json")))
					tool = "composer";
				else if (fs.existsSync(nodePath.join(fullPath, "package.json")))
					tool = "npm";
			} catch (_e) {}

			return Response.json({ tool });
		},
	},

	"/api/projects": {
		async GET() {
			const projects = listProjects();
			const { getLatestRunsByProjectIds } = await import("../db/runs");
			const latestRuns = getLatestRunsByProjectIds(projects.map((p) => p.id));

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
			const res = await projectContext.run({ project: project.name }, () =>
				gitFetch(project.path),
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
			const res = await projectContext.run({ project: project.name }, () =>
				gitPull(project.path),
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
				return Response.json(
					{ success: false, error: errorMessage(e) },
					{ status: 500 },
				);
			}
		},
	},
};
