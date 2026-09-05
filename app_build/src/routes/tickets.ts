import { PanelType } from "@atlaskit/adf-schema";
import {
	doc,
	heading,
	link,
	panel,
	paragraph,
	strong,
	table,
	tableCell,
	tableHeader,
	tableRow,
	text,
} from "@atlaskit/adf-utils/builders";
import {
	diagnoseConfiguration,
	jiraEndpoint,
	normalizeTokenKind,
} from "@/lib/jira/endpoint";
import {
	formatJiraError,
	ISSUE_TYPE_HINT,
	isIssueTypeRefusal,
} from "@/lib/jira/errors";
import type {
	JiraCreatedIssue,
	JiraCreateMeta,
	JiraCurrentUser,
	JiraIssueCreate,
} from "@/lib/jira/types";
import {
	ticketCreateBodySchema,
	ticketDraftBodySchema,
	ticketLinkBodySchema,
	ticketTargetSchema,
} from "@/lib/schemas";
import { errorMessage } from "@/lib/utils";
import { parseBody } from "@/lib/validate";
import { buildCveGroups } from "../lib/aggregator";

export const ticketsRoutes = {
	"/api/tickets": {
		async POST(req: Request) {
			const parsed = await parseBody(req, ticketDraftBodySchema);
			if (parsed.response) return parsed.response;
			const { projectId, packageName, cves } = parsed.data;
			const groups = buildCveGroups();

			const occurrences = [];
			for (const g of groups) {
				// `cves` fourni : l'aperçu ne décrit que les CVE choisies (§8).
				if (cves && !cves.includes(g.cve)) continue;
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

			const [first] = occurrences;
			if (!first)
				return Response.json({ error: "Non trouvé" }, { status: 404 });

			const projectName = first.projectName;
			const title = `[Aegis] Remédiation ${packageName} - ${projectName}`;

			let md = `# ${title}\n\n`;
			md += `**Projet:** ${projectName} (${first.tool})\n`;
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
			const parsed = await parseBody(req, ticketLinkBodySchema);
			if (parsed.response) return parsed.response;
			const { projectId, packageName, ref, cves } = parsed.data;
			const { saveTicket } = await import("../db/tickets");
			saveTicket(projectId, packageName, ref, cves, null);
			return Response.json({ success: true });
		},
	},
	"/api/tickets/unlink": {
		async POST(req: Request) {
			const parsed = await parseBody(req, ticketTargetSchema);
			if (parsed.response) return parsed.response;
			const { projectId, packageName } = parsed.data;
			const { deleteTicket } = await import("../db/tickets");
			deleteTicket(projectId, packageName);
			return Response.json({ success: true });
		},
	},
	"/api/tickets/create": {
		async POST(req: Request) {
			const parsed = await parseBody(req, ticketCreateBodySchema);
			if (parsed.response) return parsed.response;
			const { projectId, packageName, cves, notes, issueType } = parsed.data;
			const { getSetting } = await import("../db/settings");
			const { saveTicket } = await import("../db/tickets");

			const baseUrl = getSetting("JIRA_BASE_URL", "");
			// Le type de jeton **déclaré** décide du point d'entrée de l'API (§8) ;
			// `JIRA_BASE_URL` reste l'adresse du site, qui sert aussi aux liens
			// /browse/<clé> de l'interface.
			const jiraAuth = {
				kind: normalizeTokenKind(getSetting("JIRA_TOKEN_KIND", "")),
				cloudId: getSetting("JIRA_CLOUD_ID", ""),
			};
			const user = getSetting("JIRA_USER", "");
			// Repli sur l'environnement, comme `GITHUB_TOKEN` : le secret peut être
			// fourni par le déploiement plutôt que collé dans l'interface. Le reste de
			// la configuration Jira — URL, utilisateur, projet — n'est pas secret et
			// reste dans les réglages.
			const apiKey = getSetting("JIRA_API_KEY", process.env.JIRA_API_KEY ?? "");
			const project = getSetting("JIRA_PROJECT", "");
			const component = getSetting("JIRA_COMPONENT", "");
			// **Aucun défaut.** `"Task"` était la valeur de repli, or les noms de
			// types d'issue sont **localisés par instance** : un projet français
			// expose « Tâche », « Bug », « Dette Technique »… et `"Task"` n'y existe
			// pas. Le repli produisait donc un 400 de Jira après une tentative
			// d'écriture, sur une configuration que l'écran présentait comme
			// facultative. Constaté sur une instance réelle.
			// Le type vient **du corps de la requête**, donc de la page de création, et de
			// nulle part ailleurs. Il n'y a plus de réglage global : les noms étant
			// localisés par instance, une valeur enregistrée une fois pour toutes se
			// périmait au premier changement de projet, et la saisie libre qu'elle
			// supposait produisait un « Spécifiez un type de ticket valide » après
			// une tentative d'écriture. La page lit la liste chez Jira (§8).
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

			if (!issueType) {
				// Refus **avant** l'appel : Jira répondrait « Spécifiez un type de
				// ticket valide », un message que l'utilisateur ne peut pas relier au
				// champ de la page de création.
				return Response.json(
					{ error: "Choisissez un type de ticket avant de créer le ticket." },
					{ status: 400 },
				);
			}

			// Gather occurrences
			const groups = buildCveGroups();
			const occurrences = [];
			for (const g of groups) {
				for (const occ of g.occurrences) {
					if (
						occ.projectId === projectId &&
						occ.package === packageName &&
						cves.includes(g.cve)
					) {
						occurrences.push({
							cve: g.cve,
							ref: g.ref,
							worst: g.worst,
							...occ,
						});
					}
				}
			}

			const [first] = occurrences;
			if (!first) {
				return Response.json(
					{ error: "Aucune vulnérabilité trouvée pour ce package." },
					{ status: 404 },
				);
			}
			const projectName = first.projectName;
			const tool = first.tool;

			// Build the ADF Document
			const adfDoc = doc(
				heading({ level: 2 })(text(`Package : ${packageName}`)),
				paragraph(
					text("Projet affecté : "),
					strong(projectName),
					text(` (${tool})`),
				),
				heading({ level: 3 })(text(`Vulnérabilités (${occurrences.length})`)),
				table(
					tableRow([
						tableHeader({})(paragraph(strong("Sévérité"))),
						tableHeader({})(paragraph(strong("CVE / Référence"))),
						tableHeader({})(paragraph(strong("Titre"))),
						tableHeader({})(paragraph(strong("Correction"))),
					]),
					...occurrences.map((occ) =>
						tableRow([
							tableCell({})(paragraph(text(occ.severity.toUpperCase()))),
							tableCell({})(
								paragraph(
									occ.link
										? link({ href: occ.link })(text(occ.ref || "N/A"))
										: text(occ.ref || "N/A"),
								),
							),
							tableCell({})(paragraph(text(occ.title || "N/A"))),
							tableCell({})(paragraph(text(occ.fixedIn ? occ.fixedIn : "N/A"))),
						]),
					),
				),
			);

			// Append notes if provided
			if (notes.trim().length > 0) {
				adfDoc.content.push(
					// `panelType` est un enum ADF, pas une chaîne libre : on l'emploie
					// tel quel plutôt que de caster "info".
					panel({ panelType: PanelType.INFO })(
						paragraph(strong("Notes additionnelles / Recommandations :")),
						paragraph(text(notes)),
					),
				);
			}

			/**
			 * Charge d'une création d'issue Jira (API v3). Seuls les champs
			 * réellement envoyés sont décrits ; `parent` et `components` sont
			 * ajoutés plus bas quand la configuration les fournit.
			 */
			const issueData: JiraIssueCreate = {
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

			const crypto = await import("node:crypto");
			// `projectId` entre dans l'empreinte (N41). Deux projets partageant le
			// même paquet et les mêmes CVE produisaient sinon le **même** hash, et
			// `getTicketByHash` en renvoyait un arbitrairement : le refus 409 citait
			// alors la référence d'un ticket appartenant à un autre projet, sur lequel
			// le référent n'a aucune prise.
			const contentHash = crypto
				.createHash("sha256")
				.update(JSON.stringify({ projectId, issueData }))
				.digest("hex");

			const { getTicketByHash } = await import("../db/tickets");
			// Recherche bornée au projet, en plus du hash : ceinture et bretelles,
			// pour que la garde reste juste même si l'empreinte venait à collisionner.
			const existingTicket = getTicketByHash(contentHash, projectId);

			if (existingTicket) {
				return Response.json(
					{
						error: `Un ticket identique existe déjà pour cette vulnérabilité (Réf: ${existingTicket.url}).`,
					},
					{ status: 409 },
				);
			}

			const target = jiraEndpoint(baseUrl, "/rest/api/3/issue", jiraAuth);
			if (!target) {
				// Le diagnostic dit *ce qui* manque — un Cloud ID absent sur la
				// passerelle n'est pas une URL invalide, et l'annoncer comme telle
				// envoyait l'utilisateur corriger le bon champ.
				const reason =
					diagnoseConfiguration(baseUrl, jiraAuth) ??
					"URL Jira invalide (https requis)";
				return Response.json({ error: reason }, { status: 400 });
			}

			const auth = Buffer.from(`${user}:${apiKey}`).toString("base64");
			const payload = JSON.stringify(issueData);

			// C'est le seul endroit où Aegis **écrit** chez un tiers : la charge part
			// donc dans la console (§11), pour être relue avant et après. Le jeton n'y
			// figure jamais — le flux SSE est diffusé à tout abonné.
			const { emitConsoleEnd, emitConsoleStart } = await import(
				"../lib/console"
			);
			const startedAt = Date.now();
			const eventId = emitConsoleStart({
				cmd: `POST /rest/api/3/issue (${project}/${issueType})`,
				cwd: target,
				label: "jira",
				outText: payload,
			});

			let response: Response;
			try {
				response = await fetch(target, {
					method: "POST",
					headers: {
						Authorization: `Basic ${auth}`,
						"Content-Type": "application/json",
					},
					body: payload,
				});
			} catch (e: unknown) {
				// Une coupure réseau ne doit pas passer pour un succès : le `fetch` n'était
				// pas gardé, l'exception remontait au gestionnaire global et sortait en 500.
				emitConsoleEnd(eventId, {
					exitCode: 0,
					ok: false,
					ms: Date.now() - startedAt,
					errorText: errorMessage(e),
				});
				return Response.json(
					{ error: `Erreur Jira: ${errorMessage(e)}` },
					{ status: 502 },
				);
			}

			if (!response.ok) {
				const errorText = await response.text();
				emitConsoleEnd(eventId, {
					exitCode: response.status,
					ok: false,
					ms: Date.now() - startedAt,
					// La console garde le corps **brut** : c'est la trace technique.
					errorText,
				});
				// L'interface, elle, reçoit une phrase. Le corps d'erreur de Jira est un
				// `ErrorCollection` qui nomme le champ fautif ; le recopier tel quel
				// affichait du JSON à l'utilisateur, avec le message utile noyé dedans.
				let message = formatJiraError(response.status, errorText);
				if (isIssueTypeRefusal(errorText)) {
					message = `${message}. ${ISSUE_TYPE_HINT}`;
				}
				return Response.json({ error: message }, { status: response.status });
			}

			const data = (await response.json()) as JiraCreatedIssue;

			// `key` est **optionnel** dans le schéma `CreatedIssue`, et c'est la seule
			// valeur qu'Aegis conserve : sans elle, il n'y a rien à enregistrer ni à
			// afficher. Le typage a révélé que la valeur partait telle quelle dans
			// `saveTicket`, qui l'aurait écrite en base sous la forme « undefined » —
			// un lien de ticket qui ne mène nulle part, indistinguable d'un vrai.
			if (!data.key) {
				emitConsoleEnd(eventId, {
					exitCode: response.status,
					ok: false,
					ms: Date.now() - startedAt,
					errorText: "réponse Jira sans clé d'issue",
				});
				return Response.json(
					{ error: "Jira a répondu sans clé d'issue : ticket non enregistré." },
					{ status: 502 },
				);
			}

			emitConsoleEnd(eventId, {
				exitCode: response.status,
				ok: true,
				ms: Date.now() - startedAt,
				outText: `ticket ${data.key} créé`,
			});
			saveTicket(projectId, packageName, data.key, cves, contentHash);

			return Response.json({ success: true, ticketRef: data.key });
		},
	},

	"/api/tickets/issue-types": {
		/**
		 * Types de ticket **du projet configuré**, lus dans Jira.
		 *
		 * Les noms sont localisés par instance : un projet français expose « Tâche »,
		 * « Dette Technique », « Bug »… Une liste codée en dur serait donc fausse
		 * partout ailleurs, et une saisie libre expose à un 400 après une tentative
		 * d'écriture. On demande la vérité à Jira.
		 *
		 * `GET /rest/api/3/issue/createmeta` — **lecture seule**, portée
		 * `read:jira-work`, ne crée rien.
		 *
		 * Les **sous-tâches sont écartées** : elles exigent un parent qui soit une
		 * tâche, alors que les tickets d'Aegis se rattachent à une epic. Les proposer
		 * mènerait à un refus garanti.
		 *
		 * Échec — configuration incomplète, portée manquante, réseau — : **200 avec
		 * une liste vide** et le motif. L'écran retombe alors sur la saisie libre au
		 * lieu de bloquer la création : le nom tapé à la main part tel quel.
		 */
		async GET() {
			const { getSetting } = await import("../db/settings");
			const baseUrl = getSetting("JIRA_BASE_URL", "");
			const user = getSetting("JIRA_USER", "");
			const apiKey = getSetting("JIRA_API_KEY", process.env.JIRA_API_KEY ?? "");
			const project = getSetting("JIRA_PROJECT", "");
			const jiraAuth = {
				kind: normalizeTokenKind(getSetting("JIRA_TOKEN_KIND", "")),
				cloudId: getSetting("JIRA_CLOUD_ID", ""),
			};

			if (!user || !apiKey || !project) {
				return Response.json({
					types: [],
					reason: "Configuration Jira incomplète.",
				});
			}
			const target = jiraEndpoint(
				baseUrl,
				`/rest/api/3/issue/createmeta?projectKeys=${encodeURIComponent(project)}&expand=projects.issuetypes.fields`,
				jiraAuth,
			);
			if (!target) {
				return Response.json({
					types: [],
					reason:
						diagnoseConfiguration(baseUrl, jiraAuth) ??
						"URL Jira invalide (https requis)",
				});
			}

			const auth = Buffer.from(`${user}:${apiKey}`).toString("base64");
			const { emitConsoleEnd, emitConsoleStart } = await import(
				"../lib/console"
			);
			const startedAt = Date.now();
			const eventId = emitConsoleStart({
				cmd: `GET /rest/api/3/issue/createmeta (${project})`,
				cwd: target,
				label: "jira",
			});
			try {
				const response = await fetch(target, {
					headers: {
						Authorization: `Basic ${auth}`,
						Accept: "application/json",
					},
				});
				if (!response.ok) {
					const body = await response.text();
					emitConsoleEnd(eventId, {
						exitCode: response.status,
						ok: false,
						ms: Date.now() - startedAt,
						errorText: body,
					});
					return Response.json({
						types: [],
						reason: formatJiraError(response.status, body),
					});
				}

				const meta = (await response.json()) as JiraCreateMeta;
				const types = (meta.projects?.[0]?.issuetypes ?? [])
					.filter((t) => t.subtask !== true && typeof t.name === "string")
					.map((t) => t.name as string);
				emitConsoleEnd(eventId, {
					exitCode: response.status,
					ok: true,
					ms: Date.now() - startedAt,
					outText: types.join(", "),
				});
				return Response.json({ types });
			} catch (e: unknown) {
				emitConsoleEnd(eventId, {
					exitCode: 0,
					ok: false,
					ms: Date.now() - startedAt,
					errorText: errorMessage(e),
				});
				return Response.json({ types: [], reason: errorMessage(e) });
			}
		},
	},

	"/api/tickets/test-connection": {
		/**
		 * Vérifie la configuration Jira **enregistrée**.
		 *
		 * Les identifiants et l'URL ne sont plus lus dans le corps de la requête
		 * (N4) : le serveur y ajoutait un en-tête `Authorization: Basic` et
		 * appelait l'hôte demandé, ce qui en faisait un proxy sortant authentifié —
		 * de quoi sonder le service de métadonnées de l'hôte, ou envoyer les
		 * identifiants Jira à un tiers. Ils viennent désormais de la table
		 * `settings`, dont l'écriture valide déjà le schéma https.
		 *
		 * Conséquence d'usage : il faut enregistrer avant de tester.
		 */
		async POST() {
			const { getSetting } = await import("../db/settings");
			const baseUrl = getSetting("JIRA_BASE_URL", "");
			// Le type de jeton **déclaré** décide du point d'entrée de l'API (§8) ;
			// `JIRA_BASE_URL` reste l'adresse du site, qui sert aussi aux liens
			// /browse/<clé> de l'interface.
			const jiraAuth = {
				kind: normalizeTokenKind(getSetting("JIRA_TOKEN_KIND", "")),
				cloudId: getSetting("JIRA_CLOUD_ID", ""),
			};
			const user = getSetting("JIRA_USER", "");
			// Repli sur l'environnement, comme `GITHUB_TOKEN` : le secret peut être
			// fourni par le déploiement plutôt que collé dans l'interface. Le reste de
			// la configuration Jira — URL, utilisateur, projet — n'est pas secret et
			// reste dans les réglages.
			const apiKey = getSetting("JIRA_API_KEY", process.env.JIRA_API_KEY ?? "");

			if (!baseUrl || !user || !apiKey) {
				return Response.json(
					{
						error:
							"Configuration Jira incomplète : enregistrez l'URL, l'utilisateur et la clé d'API avant de tester.",
					},
					{ status: 400 },
				);
			}

			// Second contrôle, au point d'utilisation : une valeur écrite avant
			// l'ajout de la validation, ou par un import de configuration, ne doit
			// pas devenir un appel sortant en clair.
			const target = jiraEndpoint(baseUrl, "/rest/api/3/myself", jiraAuth);
			if (!target) {
				const reason =
					diagnoseConfiguration(baseUrl, jiraAuth) ??
					"URL Jira invalide (https requis)";
				return Response.json(
					{ success: false, error: reason },
					{ status: 400 },
				);
			}

			const auth = Buffer.from(`${user}:${apiKey}`).toString("base64");
			const { emitConsoleEnd, emitConsoleStart } = await import(
				"../lib/console"
			);
			// L'URL complète et l'utilisateur, jamais le jeton : la console est
			// diffusée à tout client abonné au flux SSE.
			const startedAt = Date.now();
			const eventId = emitConsoleStart({
				cmd: `GET /rest/api/3/myself (${user})`,
				cwd: target,
				label: "jira",
			});
			try {
				const response = await fetch(target, {
					headers: {
						Authorization: `Basic ${auth}`,
						"Content-Type": "application/json",
					},
				});

				if (!response.ok) {
					const body = await response.text();
					// `ok` explicite : `exitCode` porte ici un statut HTTP, et la
					// convention shell « zéro vaut succès » afficherait une croix sur un
					// 200 et une coche sur une coupure réseau.
					emitConsoleEnd(eventId, {
						exitCode: response.status,
						ok: false,
						ms: Date.now() - startedAt,
						// La console garde le corps **brut** : c'est la trace technique.
						errorText: body,
					});
					// Même mise en forme que la création : « Statut HTTP 401 » taisait le
					// « Client must be authenticated » qui distingue un jeton à périmètre
					// appelé sur le site (§8) d'un mot de passe faux.
					return Response.json(
						{ success: false, error: formatJiraError(response.status, body) },
						{ status: 400 },
					);
				}

				const data = (await response.json()) as JiraCurrentUser;
				emitConsoleEnd(eventId, {
					exitCode: response.status,
					ok: true,
					ms: Date.now() - startedAt,
					outText: `connecté en tant que ${data.displayName ?? "?"}`,
				});
				return Response.json({ success: true, user: data.displayName });
			} catch (e: unknown) {
				emitConsoleEnd(eventId, {
					exitCode: 0,
					ok: false,
					ms: Date.now() - startedAt,
					errorText: errorMessage(e),
				});
				return Response.json(
					{ success: false, error: errorMessage(e) },
					{ status: 400 },
				);
			}
		},
	},
};
