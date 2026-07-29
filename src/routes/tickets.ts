import { buildCveGroups } from "../lib/aggregator";

export const ticketsRoutes = {
	"/api/tickets": {
		async POST(req: Request) {
			const { projectId, packageName } = await req.json();
			const groups = buildCveGroups();

			const occurrences = [];
			for (const g of groups) {
				for (const occ of g.occurrences) {
					if (occ.projectId === projectId && occ.package === packageName) {
						occurrences.push({
							cve: g.cve,
							ref: g.ref,
							worst: g.worst,
							...occ,
						});
					}
				}
			}

			if (occurrences.length === 0)
				return Response.json({ error: "Non trouvé" }, { status: 404 });

			const projectName = occurrences[0]!.projectName;
			const title = `[Aegis] Remédiation ${packageName} - ${projectName}`;

			let md = `# ${title}\n\n`;
			md += `**Projet:** ${projectName} (${occurrences[0]!.tool})\n`;
			md += `**Package:** \`${packageName}\`\n\n`;
			md += `## Vulnérabilités (${occurrences.length})\n\n`;

			for (const occ of occurrences) {
				md += `### ${occ.ref} - ${occ.severity.toUpperCase()}\n`;
				md += `**Description:** ${occ.title || "Aucune description"}\n`;
				md += `**Version affectée:** \`${occ.versionRange || "N/A"}\`\n`;
				md += `**Correction disponible:** \`${occ.fixedIn || "Aucune (mise à jour majeure requise)"}\`\n`;
				if (occ.link) md += `**Lien:** ${occ.link}\n`;
				md += `\n`;
			}

			md += `## Recommandation / Raison du risque\n\n`;
			md += `> À compléter par le référent sécurité...\n`;

			return Response.json({ markdown: md });
		},
	},

	"/api/tickets/list": {
		async GET() {
			const { getTickets } = await import("../db/tickets");
			return Response.json(getTickets());
		},
	},
	"/api/tickets/link": {
		async POST(req: Request) {
			const { projectId, packageName, ref, cves } = await req.json();
			const { saveTicket } = await import("../db/tickets");
			saveTicket(projectId, packageName, ref, cves);
			return Response.json({ success: true });
		},
	},
	"/api/tickets/unlink": {
		async POST(req: Request) {
			const { projectId, packageName } = await req.json();
			const { deleteTicket } = await import("../db/tickets");
			deleteTicket(projectId, packageName);
			return Response.json({ success: true });
		},
	},
	"/api/tickets/create": {
		async POST(req: Request) {
			const { projectId, packageName, cves, description } = await req.json();
			const { getSetting } = await import("../db/settings");
			const { saveTicket } = await import("../db/tickets");

			const baseUrl = getSetting("JIRA_BASE_URL", "");
			const user = getSetting("JIRA_USER", "");
			const apiKey = getSetting("JIRA_API_KEY", "");
			const project = getSetting("JIRA_PROJECT", "");
			const component = getSetting("JIRA_COMPONENT", "");

			if (!user || !apiKey || !project) {
				return Response.json(
					{
						error:
							"Veuillez configurer l'utilisateur, la clé d'API et le projet Jira dans les Paramètres.",
					},
					{ status: 400 },
				);
			}

			const issueData: any = {
				fields: {
					project: { key: project },
					summary: `[Aegis] Remédiation ${packageName}`,
					description: description,
					issuetype: { name: "Task" },
				},
			};

			if (component) {
				issueData.fields.components = [{ id: component }];
			}

			const auth = Buffer.from(`${user}:${apiKey}`).toString("base64");
			const response = await fetch(`${baseUrl}/rest/api/2/issue`, {
				method: "POST",
				headers: {
					Authorization: `Basic ${auth}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(issueData),
			});

			if (!response.ok) {
				const errorText = await response.text();
				return Response.json(
					{ error: `Erreur Jira: ${response.status} ${errorText}` },
					{ status: response.status },
				);
			}

			const data = await response.json();
			saveTicket(projectId, packageName, data.key, cves);

			return Response.json({ success: true, ticketRef: data.key });
		},
	},
};
