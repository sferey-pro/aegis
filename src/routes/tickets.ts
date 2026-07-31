import { buildCveGroups } from "../lib/aggregator";
import { doc, heading, paragraph, text, strong, table, tableRow, tableHeader, tableCell, panel, link } from "@atlaskit/adf-utils/builders";

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
			saveTicket(projectId, packageName, ref, cves, null);
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
			const { projectId, packageName, cves, notes } = await req.json();
			const { getSetting } = await import("../db/settings");
			const { saveTicket } = await import("../db/tickets");

			const baseUrl = getSetting("JIRA_BASE_URL", "");
			const user = getSetting("JIRA_USER", "");
			const apiKey = getSetting("JIRA_API_KEY", "");
			const project = getSetting("JIRA_PROJECT", "");
			const component = getSetting("JIRA_COMPONENT", "");
			const issueType = getSetting("JIRA_ISSUE_TYPE", "Task");
			const parentEpic = getSetting("JIRA_PARENT_EPIC", "");

			if (!user || !apiKey || !project) {
				return Response.json(
					{
						error:
							"Veuillez configurer l'utilisateur, la clé d'API et le projet Jira dans les Paramètres.",
					},
					{ status: 400 },
				);
			}

			// Gather occurrences
			const groups = buildCveGroups();
			const occurrences = [];
			for (const g of groups) {
				for (const occ of g.occurrences) {
					if (occ.projectId === projectId && occ.package === packageName && cves.includes(g.cve)) {
						occurrences.push({
							cve: g.cve,
							ref: g.ref,
							worst: g.worst,
							...occ,
						});
					}
				}
			}

			if (occurrences.length === 0) {
				return Response.json({ error: "Aucune vulnérabilité trouvée pour ce package." }, { status: 404 });
			}
			const projectName = occurrences[0]!.projectName;
			const tool = occurrences[0]!.tool;

			// Build the ADF Document
			const adfDoc = doc(
				heading({ level: 2 })(text(`Package : ${packageName}`)),
				paragraph(
					text("Projet affecté : "), strong(projectName), text(` (${tool})`)
				),
				heading({ level: 3 })(text(`Vulnérabilités (${occurrences.length})`)),
				table(
					tableRow([
						tableHeader({})(paragraph(strong("Sévérité"))),
						tableHeader({})(paragraph(strong("CVE / Référence"))),
						tableHeader({})(paragraph(strong("Titre"))),
						tableHeader({})(paragraph(strong("Correction"))),
					]),
					...occurrences.map(occ => 
						tableRow([
							tableCell({})(paragraph(text(occ.severity.toUpperCase()))),
							tableCell({})(paragraph(occ.link ? link({ href: occ.link })(text(occ.ref || "N/A")) : text(occ.ref || "N/A"))),
							tableCell({})(paragraph(text(occ.title || "N/A"))),
							tableCell({})(paragraph(text(occ.fixedIn ? occ.fixedIn : "N/A"))),
						])
					)
				)
			);

			// Append notes if provided
			if (notes && notes.trim().length > 0) {
				adfDoc.content.push(
					panel({ panelType: "info" as any })(
						paragraph(strong("Notes additionnelles / Recommandations :")),
						paragraph(text(notes))
					)
				);
			}

			const issueData: any = {
				fields: {
					project: { key: project },
					summary: `[Aegis] Remédiation ${packageName}`,
					description: adfDoc,
					issuetype: { name: issueType },
				},
			};

			if (parentEpic) {
				issueData.fields.parent = { key: parentEpic };
			}

			if (component) {
				issueData.fields.components = [{ id: component }];
			}

			const crypto = await import("crypto");
			const contentHash = crypto.createHash("sha256").update(JSON.stringify(issueData)).digest("hex");

			const { getTicketByHash } = await import("../db/tickets");
			const existingTicket = getTicketByHash(contentHash);
			
			if (existingTicket) {
				return Response.json(
					{ error: `Un ticket identique existe déjà pour cette vulnérabilité (Réf: ${existingTicket.url}).` },
					{ status: 409 }
				);
			}

			const auth = Buffer.from(`${user}:${apiKey}`).toString("base64");
			const response = await fetch(`${baseUrl}/rest/api/3/issue`, {
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
			saveTicket(projectId, packageName, data.key, cves, contentHash);

			return Response.json({ success: true, ticketRef: data.key });
		},
	},

	"/api/tickets/test-connection": {
		async POST(req: Request) {
			const { baseUrl, user, apiKey } = await req.json();

			if (!baseUrl || !user || !apiKey) {
				return Response.json({ error: "Paramètres manquants." }, { status: 400 });
			}

			const auth = Buffer.from(`${user}:${apiKey}`).toString("base64");
			try {
				const response = await fetch(`${baseUrl}/rest/api/3/myself`, {
					headers: {
						Authorization: `Basic ${auth}`,
						"Content-Type": "application/json",
					}
				});

				if (!response.ok) {
					return Response.json({ success: false, error: `Statut HTTP ${response.status}` }, { status: 400 });
				}
				
				const data = await response.json();
				return Response.json({ success: true, user: data.displayName });
			} catch (e: any) {
				return Response.json({ success: false, error: e.message }, { status: 400 });
			}
		}
	}
};
