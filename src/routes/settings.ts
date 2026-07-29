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
				setAllSettings(newSettings);
			}
			return Response.json({
				success: true,
				message: "Paramètres importés avec succès.",
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
			} catch (e: any) {
				return Response.json({ error: e.message }, { status: 400 });
			}
		},
	},
};
