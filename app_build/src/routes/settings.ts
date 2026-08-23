import { errorMessage } from "@/lib/utils";
import { getAllAnnotations } from "../db/annotations";
import { createSnapshot, listSnapshots, restoreSnapshot } from "../db/backup";
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

			// La configuration GitHub vit dans la base d'avis, pour survivre à une
			// remise à zéro. L'écran Réglages poste un seul objet ; le tri se fait
			// ici, pas côté client.
			const { GITHUB_CONFIG_KEYS, setGithubConfig } = await import(
				"../db/advisories"
			);
			for (const cle of GITHUB_CONFIG_KEYS) {
				const valeur = aEcrire[cle];
				if (typeof valeur === "string") {
					setGithubConfig(cle, valeur);
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
			const cheminParProjet = new Map(
				listProjects().map((p) => [p.id, p.path]),
			);
			if (safeSettings.GITHUB_TOKEN) safeSettings.GITHUB_TOKEN = "***";
			if (safeSettings.JIRA_API_KEY) safeSettings.JIRA_API_KEY = "***";

			return Response.json({
				projects: listProjects(),
				settings: safeSettings,
				// Chaque annotation porte le **chemin** de son projet (§12), pas
				// seulement son identifiant : les `id` sont attribués par
				// auto-incrément, donc un export porteur du seul `project_id` n'était
				// rejouable que sur la base qui l'avait produit. `project_id` reste
				// émis pour que les versions antérieures puissent relire ce fichier.
				annotations: getAllAnnotations().map((a) => ({
					...a,
					path: cheminParProjet.get(a.project_id) ?? null,
				})),
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

			// Tous les modules sont résolus **avant** d'ouvrir la transaction : le
			// rappel de `db.transaction()` doit être synchrone, un `await` à
			// l'intérieur la refermerait avant la fin du travail.
			const { runInTransaction } = await import("../db");
			const { createProject, getProjectBySlug, updateProject } = await import(
				"../db/projects"
			);
			const { upsertAnnotation } = await import("../db/annotations");
			const { setAllSettings } = await import("../db/settings");
			const { isPathAllowedForImport } = await import("./projects");

			// N3 : la garde de chemin passe **avant** toute écriture. L'import était
			// la voie la plus simple pour enregistrer un projet hors périmètre, puis
			// l'auditer. Contrôlé ici plutôt que dans la boucle, pour que le refus
			// n'ait aucun effet de bord à annuler.
			for (const p of body.projects ?? []) {
				if (!isPathAllowedForImport(p.path, p.audit_path)) {
					return Response.json(
						{ error: "Chemin non autorisé par AEGIS_ALLOWED_ROOTS" },
						{ status: 403 },
					);
				}
			}

			const compteurs = {
				projectsAdded: 0,
				annotationsAdded: 0,
				annotationsSkipped: 0,
			};

			/**
			 * Import en **une seule transaction**.
			 *
			 * Sans elle, une section en échec laissait derrière elle ce que les
			 * précédentes avaient écrit : l'utilisateur relançait l'import et, faute
			 * de déduplication par cible d'audit, les projets étaient recréés en
			 * doublon tandis que les annotations restantes n'arrivaient jamais
			 * (défaut N7). Un échec annule maintenant l'ensemble.
			 */
			const importer = () => {
				if (body.settings) {
					const aEcrire = { ...body.settings };
					// Un secret exporté vaut « *** » : le réimporter écraserait la vraie
					// valeur par ce littéral.
					for (const cle of Object.keys(aEcrire)) {
						if (aEcrire[cle] === "***") delete aEcrire[cle];
					}
					setAllSettings(aEcrire);
				}

				// Deux tables de correspondance vers les identifiants créés : par
				// chemin, forme spécifiée par §12 et portable d'une base à l'autre, et
				// par ancien identifiant, pour les exports des versions antérieures.
				const parChemin = new Map<string, number>();
				const parAncienId = new Map<number, number>();

				for (const p of body.projects ?? []) {
					// `slug` et `id` sont facultatifs dans un export : un fichier bricolé
					// à la main peut ne pas les porter. Sans slug on crée toujours, sans
					// id on ne peut relier aucune annotation par identifiant — mais
					// l'import du projet reste valide, et le relink par chemin marche.
					const existing = p.slug ? getProjectBySlug(p.slug) : null;
					let cibleId: number;
					if (existing) {
						updateProject(existing.id, p);
						cibleId = existing.id;
					} else {
						cibleId = createProject(p).id;
						compteurs.projectsAdded++;
					}
					parChemin.set(p.path, cibleId);
					if (p.id !== undefined) parAncienId.set(p.id, cibleId);
				}

				for (const a of body.annotations ?? []) {
					// Le chemin d'abord : c'est la forme portable. L'ancien identifiant
					// ne sert que de repli pour les fichiers qui ne portent que lui.
					const cible =
						(a.path !== undefined ? parChemin.get(a.path) : undefined) ??
						(a.project_id !== undefined
							? parAncienId.get(a.project_id)
							: undefined);

					// Cible non résolvable — projet absent du fichier, ou ancienne
					// convention `project_id = -1` d'annotation « globale », qui n'a
					// jamais pu exister en base : la colonne porte une clé étrangère
					// vers `projects`. §12 impose d'ignorer, pas d'échouer : une
					// annotation orpheline ne doit pas faire perdre tout l'import.
					if (cible === undefined) {
						compteurs.annotationsSkipped++;
						continue;
					}

					upsertAnnotation(a.cve, cible, {
						status: a.status,
						note: a.note,
						fixedIn: a.fixed_in,
					});
					compteurs.annotationsAdded++;
				}
			};

			try {
				runInTransaction(importer);
			} catch (e: unknown) {
				// La transaction est déjà annulée : la base est dans l'état d'avant.
				return Response.json(
					{
						error: `Import interrompu, rien n'a été appliqué : ${errorMessage(e)}`,
					},
					{ status: 400 },
				);
			}

			return Response.json({
				success: true,
				...compteurs,
				message: "Paramètres, projets et annotations importés avec succès.",
			});
		},
	},

	/**
	 * Remise à zéro de la configuration, pour repartir d'un import propre.
	 *
	 * Destructif et sans confirmation côté serveur : c'est l'interface qui porte la
	 * demande de confirmation. L'API d'Aegis n'a pas d'authentification (elle
	 * n'écoute que sur `127.0.0.1` par défaut), donc cette route n'ouvre aucune
	 * capacité nouvelle — supprimer les projets un par un était déjà possible — mais
	 * elle en concentre l'effet. À protéger le jour où une authentification est
	 * ajoutée.
	 */
	"/api/config/reset": {
		async POST() {
			// Un audit en cours écrit dans la base : la supprimer sous ses pieds le
			// ferait échouer sur un fichier disparu, et le run resterait à moitié
			// enregistré. La file est un mutex de portée processus, donc la question
			// se pose en un seul test.
			const { getAuditStatus } = await import("../lib/audit/queue");
			if (getAuditStatus().isRunning) {
				return Response.json(
					{
						error:
							"Un audit est en cours : attendez qu'il se termine avant de remettre la configuration à zéro.",
					},
					{ status: 409 },
				);
			}

			const { resetConfiguration } = await import("../db/reset");
			const { GITHUB_CONFIG_KEYS } = await import("../db/advisories");
			return Response.json({
				success: true,
				reset: resetConfiguration(),
				// Ce qui vit dans l'autre fichier, donc hors d'atteinte du reset.
				preserved: ["advisory_cache", ...GITHUB_CONFIG_KEYS],
			});
		},
	},

	"/api/snapshots": {
		async GET() {
			return Response.json({ snapshots: listSnapshots() });
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

			// Un audit en cours écrit dans la base qu'on s'apprête à remplacer : le
			// run finirait à moitié enregistré dans un fichier qui n'existe plus.
			// Même garde que la remise à zéro, même raison.
			const { getAuditStatus } = await import("../lib/audit/queue");
			if (getAuditStatus().isRunning) {
				return Response.json(
					{
						error:
							"Un audit est en cours : attendez qu'il se termine avant de restaurer.",
					},
					{ status: 409 },
				);
			}

			try {
				// Le nom est enfin **transmis**. Il était exigé par le schéma puis
				// ignoré : le champ ne servait qu'à valider, et l'on restaurait
				// toujours le même fichier.
				return Response.json(restoreSnapshot(data.file));
			} catch (e: unknown) {
				return Response.json({ error: errorMessage(e) }, { status: 400 });
			}
		},
	},
};
