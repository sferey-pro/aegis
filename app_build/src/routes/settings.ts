import { errorMessage } from "@/lib/utils";
import { getAllAnnotations } from "../db/annotations";
import { createSnapshot, restoreSnapshot } from "../db/backup";
import { listProjects } from "../db/projects";
import { getAllSettings, setAllSettings } from "../db/settings";

export const settingsRoutes = {
	"/api/settings": {
		async GET() {
			return Response.json(getAllSettings());
		},
		async PUT(req: Request) {
			const body = await req.json();
			setAllSettings(body);
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
			const body = await req.json();
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
				for (const p of body.projects) {
					const existing = getProjectBySlug(p.slug);
					if (existing) {
						updateProject(existing.id, p);
						projectIdMap.set(p.id, existing.id);
					} else {
						const newProj = createProject(p);
						projectIdMap.set(p.id, newProj.id);
					}
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
		async POST() {
			try {
				return Response.json(restoreSnapshot());
			} catch (e: unknown) {
				return Response.json({ error: errorMessage(e) }, { status: 400 });
			}
		},
	},
};
