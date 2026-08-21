import { errorMessage } from "@/lib/utils";
import { getAllAnnotations } from "../db/annotations";
import { createSnapshot, restoreSnapshot } from "../db/backup";
import { listProjects } from "../db/projects";
import {
	getAllSettings,
	getPublicSettings,
	SECRET_SETTING_KEYS,
	setAllSettings,
} from "../db/settings";
import {
	configImportBodySchema,
	restoreBodySchema,
	settingsBodySchema,
} from "../lib/schemas";
import { parseBody } from "../lib/validate";

export const settingsRoutes = {
	"/api/settings": {
		async GET() {
			// Liste blanche : les secrets ne sortent pas, seul un booléen
			// `<CLÉ>_CONFIGURED` indique s'ils sont renseignés (N5).
			return Response.json(getPublicSettings());
		},
		async PUT(req: Request) {
			// Seule `AUDIT_MAX_AGE_HOURS` est contrainte (nombre fini ≥ -1) ; les
			// autres clés passent telles quelles (CONTEXT.md §12).
			const { data, response } = await parseBody(req, settingsBodySchema);
			if (!data) return response;

			// Les secrets sont en écriture seule : le formulaire ne connaît pas leur
			// valeur et renvoie une chaîne vide quand l'utilisateur n'y touche pas.
			// L'appliquer effacerait le jeton à chaque enregistrement.
			const aEcrire = { ...data };
			for (const cle of SECRET_SETTING_KEYS) {
				if (typeof aEcrire[cle] === "string" && aEcrire[cle].trim() === "") {
					delete aEcrire[cle];
				}
			}

			setAllSettings(aEcrire);
			return Response.json({ success: true });
		},
	},

	"/api/config/export": {
		async GET() {
			const settings = getAllSettings();
			const safeSettings = { ...settings };
			if (safeSettings.GITHUB_TOKEN) safeSettings.GITHUB_TOKEN = "***";
			if (safeSettings.JIRA_API_KEY) safeSettings.JIRA_API_KEY = "***";

			return Response.json({
				projects: listProjects(),
				settings: safeSettings,
				annotations: getAllAnnotations(),
			});
		},
	},

	"/api/config/import": {
		async POST(req: Request) {
			// N35 : un fichier tronqué ou collé de travers sortait en 500. Le schéma
			// reste permissif sur le contenu des sections — un export d'une version
			// antérieure doit rester importable — et ne garantit que la lisibilité.
			const { data: body, response } = await parseBody(
				req,
				configImportBodySchema,
			);
			if (!body) return response;

			if (body.settings) {
				const newSettings = { ...body.settings };
				for (const key of Object.keys(newSettings)) {
					if (newSettings[key] === "***") {
						delete newSettings[key];
					}
				}
				const { setAllSettings } = await import("../db/settings");
				setAllSettings(newSettings);
			}

			const projectIdMap = new Map<number, number>(); // old -> new
			if (body.projects && Array.isArray(body.projects)) {
				const { createProject, getProjectBySlug, updateProject } = await import(
					"../db/projects"
				);
				const { isPathAllowedForImport } = await import("./projects");
				for (const p of body.projects) {
					// N3 : l'import contournait entièrement la garde de chemin, ce qui en
					// faisait la voie la plus simple pour enregistrer un projet hors
					// périmètre — puis l'auditer.
					if (!isPathAllowedForImport(p.path, p.audit_path)) {
						return Response.json(
							{ error: "Chemin non autorisé par AEGIS_ALLOWED_ROOTS" },
							{ status: 403 },
						);
					}
					// `slug` et `id` sont facultatifs dans un export : un fichier
					// bricolé à la main peut ne pas les porter. Sans slug on crée
					// toujours, sans id on ne peut relier aucune annotation — mais
					// l'import du projet reste valide.
					const existing = p.slug ? getProjectBySlug(p.slug) : null;
					let cibleId: number;
					if (existing) {
						updateProject(existing.id, p);
						cibleId = existing.id;
					} else {
						cibleId = createProject(p).id;
					}
					if (p.id !== undefined) projectIdMap.set(p.id, cibleId);
				}
			}

			if (body.annotations && Array.isArray(body.annotations)) {
				const { upsertAnnotation } = await import("../db/annotations");
				for (const a of body.annotations) {
					const mappedId = projectIdMap.get(a.project_id);
					const targetId = a.project_id === -1 ? -1 : mappedId;
					if (targetId !== undefined) {
						upsertAnnotation(a.cve, targetId, {
							status: a.status,
							note: a.note,
							fixedIn: a.fixed_in,
						});
					}
				}
			}

			return Response.json({
				success: true,
				message: "Paramètres, projets et annotations importés avec succès.",
			});
		},
	},

	"/api/snapshots/create": {
		async POST() {
			return Response.json(createSnapshot());
		},
	},

	"/api/snapshots/restore": {
		async POST(req: Request) {
			const { data, response } = await parseBody(req, restoreBodySchema);
			if (!data) return response;

			try {
				return Response.json(restoreSnapshot());
			} catch (e: unknown) {
				return Response.json({ error: errorMessage(e) }, { status: 400 });
			}
		},
	},
};
