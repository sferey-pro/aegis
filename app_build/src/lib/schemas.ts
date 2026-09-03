import { z } from "zod";

/**
 * Schémas de validation des corps de requête.
 *
 * Les messages d'erreur sont ceux du contrat fonctionnel (`docs/CONTEXT.md`) :
 * ils sont renvoyés tels quels au client, ne les reformulez pas sans mettre le
 * contrat à jour. Un seul message est renvoyé par requête (le premier problème
 * rencontré), conformément au format `{ error: "<message>" }` des routes.
 */

// ---------------------------------------------------------------- helpers

/**
 * Normalise une liste de tags : conversion en texte, trim, retrait des vides,
 * déduplication, ordre d'apparition préservé (CONTEXT.md §1).
 * Une valeur non-tableau retombe sur une liste vide au lieu d'échouer.
 */
const tagNames = z
	.array(z.coerce.string())
	.catch([])
	.transform((tags) => {
		const seen = new Set<string>();
		const out: string[] = [];
		for (const raw of tags) {
			const name = raw.trim();
			if (!name || seen.has(name)) continue;
			seen.add(name);
			out.push(name);
		}
		return out;
	});

/**
 * Booléen tolérant sur la forme, **strict sur le sens** (défaut N33).
 *
 * `z.coerce.boolean()` appliquait la conversion JavaScript : toute chaîne non
 * vide est vraie, `"false"` comprise. Un client qui sérialise ses booléens en
 * texte — un formulaire HTML, un script `curl`, un pipeline CI — activait donc
 * « ignoré » en croyant le désactiver, et le projet disparaissait de
 * l'agrégation CVE sans message.
 *
 * Les formes usuelles sont acceptées, mais une valeur inattendue est **refusée**
 * et non ramenée à `false`. `CONTEXT.md` §1 donne `false` comme valeur par défaut
 * d'un champ **absent** ; il ne prévoit aucun repli pour une valeur invalide.
 * Inventer ce repli reviendrait à faire absorber au code une donnée non conforme,
 * et à enregistrer un état que l'appelant n'a pas demandé.
 */
const boolStrict = z.union(
	[
		z.boolean(),
		z
			.enum(["true", "false", "1", "0", "yes", "no", "on", "off"])
			.transform((v) => v === "true" || v === "1" || v === "yes" || v === "on"),
		z
			.number()
			.int()
			.min(0)
			.max(1)
			.transform((v) => v === 1),
	],
	{ message: "Valeur booléenne invalide" },
);

/**
 * Chaîne trimée dont la version vide devient `null` (CONTEXT.md §1). L'absence
 * devient `null` elle aussi — c'est ce qu'attend `audit_path`, dont la colonne
 * est nullable et n'a pas de notion de « ne pas toucher ».
 */
const emptyToNull = z
	.string()
	.trim()
	.transform((v) => (v === "" ? null : v))
	.nullish()
	.transform((v) => v ?? null);

/**
 * Même normalisation, mais **l'absence reste `undefined`**.
 *
 * La distinction est porteuse de sens pour les champs d'annotation : `undefined`
 * signifie « ne touche pas à ce champ », `null` ou `""` signifie « vide-le ».
 * `upsertAnnotation` est écrite pour préserver les champs non fournis, et c'est
 * `emptyToNull` — qui écrasait l'absence en `null` — qui rendait cette logique
 * inopérante (défaut N32).
 */
const emptyToNullOptional = z
	.string()
	.trim()
	.transform((v) => (v === "" ? null : v))
	.nullable()
	.optional();

// ---------------------------------------------------------------- projets

export const projectTypeSchema = z.enum(["node", "composer"], {
	message: "Type invalide (node|composer)",
});

// Le message du contrat n'énumère pas `bun`, alors que l'outil est valide.
// Reproduit tel quel pour ne pas dévier de CONTEXT.md §1.
export const projectToolSchema = z.enum(["npm", "yarn", "bun", "composer"], {
	message: "Outil invalide (npm|yarn|composer)",
});

export const projectBodySchema = z.object({
	name: z.string({ message: "Nom requis" }).trim().min(1, "Nom requis"),
	path: z.string({ message: "Chemin requis" }).trim().min(1, "Chemin requis"),
	audit_path: emptyToNull,
	type: projectTypeSchema,
	tool: projectToolSchema,
	tags: tagNames.default([]),
	ignored: boolStrict.default(false),
	is_remote: boolStrict.default(false),
});

export type ProjectBody = z.infer<typeof projectBodySchema>;

/** `POST /api/projects/detect` — seul `path` est requis (CONTEXT.md §1). */
export const detectBodySchema = z.object({
	path: z.string({ message: "Chemin requis" }).trim().min(1, "Chemin requis"),
	audit_path: emptyToNull,
});

// ---------------------------------------------------------------- triage

export const annotationStatusSchema = z.enum([
	"pending",
	"confirmed",
	"not_affected",
	"ignored",
]);

export const annotationBodySchema = z.object({
	cve: z.string({ message: "CVE requise" }).trim().min(1, "CVE requise"),
	projectId: z.coerce.number({ message: "Projet introuvable" }).int(),
	// Un statut hors énumération retombe sur `pending` (CONTEXT.md §7).
	status: annotationStatusSchema.catch("pending").default("pending"),
	// `note` et `fixedIn` sont **facultatifs sans valeur par défaut** : le panneau
	// de triage n'envoie qu'un champ à la fois, et l'absence doit traverser
	// jusqu'à `upsertAnnotation` pour que celle-ci préserve la valeur en base.
	// Leur donner un défaut effaçait la note et la version corrigée saisies à la
	// main dès qu'on enregistrait un statut (N32).
	note: z.string().optional(),
	fixedIn: emptyToNullOptional,
});

/** Forme reçue par la route, après application des valeurs par défaut. */
export type AnnotationBody = z.infer<typeof annotationBodySchema>;

/**
 * Forme envoyée par le client, avant valeurs par défaut : `note` et `fixedIn`
 * sont facultatifs. `z.input` et `z.infer` décrivent les deux côtés du même
 * schéma, ce qui évite d'entretenir un type de requête séparé.
 */
export type AnnotationInput = z.input<typeof annotationBodySchema>;

/**
 * `POST /api/advisories/sync` — porte manuelle d'interrogation de GitHub.
 * Les deux champs sont facultatifs : `keyFrom` sait n'en exploiter qu'un, et une
 * requête sans identifiant exploitable répond `{ success: false }`.
 */
export const advisorySyncBodySchema = z.object({
	cve: z.string().trim().nullish(),
	link: z.string().trim().nullish(),
});

// ---------------------------------------------------------------- tags

/** Palette fixe de 8 valeurs ; toute autre couleur retombe sur `indigo`. */
export const TAG_COLORS = [
	"indigo",
	"sky",
	"emerald",
	"amber",
	"rose",
	"violet",
	"teal",
	"orange",
] as const;

export const tagBodySchema = z.object({
	name: z.string({ message: "Nom requis" }).trim().min(1, "Nom requis"),
	color: z.enum(TAG_COLORS).catch("indigo").default("indigo"),
});

export type TagBody = z.infer<typeof tagBodySchema>;

// ---------------------------------------------------------------- prompts

export const promptBodySchema = z.object({
	title: z.string({ message: "Titre requis" }).trim().min(1, "Titre requis"),
	body: z.string().default(""),
	tags: tagNames.default([]),
});

export type PromptBody = z.infer<typeof promptBodySchema>;

// ---------------------------------------------------------------- réglages

/**
 * `auditMaxAgeHours` : nombre fini et ≥ -1 (CONTEXT.md §12).
 * Sémantique : `> 0` = fenêtre en heures, `0` = jamais périmé, `-1` = toujours
 * réauditer.
 */
export const auditMaxAgeHoursSchema = z.coerce
	.number({ message: "Durée invalide" })
	.finite("Durée invalide")
	.min(-1, "Durée invalide");

/**
 * La table `settings` est un simple couple clé/valeur textuel : le schéma valide
 * la contrainte sur `AUDIT_MAX_AGE_HOURS` mais conserve toutes les valeurs en
 * chaîne, forme sous laquelle elles sont stockées.
 */
/**
 * `JIRA_BASE_URL` : URL absolue en **https**.
 *
 * Contrainte de sécurité, pas de confort. Cette valeur est concaténée puis
 * appelée par le serveur avec un en-tête `Authorization: Basic` contenant les
 * identifiants Jira. Une valeur libre en fait un proxy sortant authentifié :
 * `http://169.254.169.254` sonde le service de métadonnées de l'hôte, et
 * `http://attaquant/` reçoit directement les identifiants (N4). Le schéma est
 * imposé pour que les identifiants ne partent jamais en clair.
 */
export const jiraBaseUrlSchema = z
	.string()
	.trim()
	.refine(
		(v) => {
			if (v === "") return true; // effacer la configuration reste permis
			try {
				return new URL(v).protocol === "https:";
			} catch {
				return false;
			}
		},
		{ message: "URL Jira invalide (https requis)" },
	);

export const settingsBodySchema = z
	.record(z.string(), z.coerce.string())
	.superRefine((values, ctx) => {
		const duree = values.AUDIT_MAX_AGE_HOURS;
		if (
			duree !== undefined &&
			!auditMaxAgeHoursSchema.safeParse(duree).success
		) {
			ctx.addIssue({
				code: "custom",
				message: "Durée invalide",
				path: ["AUDIT_MAX_AGE_HOURS"],
			});
		}

		const jira = values.JIRA_BASE_URL;
		if (jira !== undefined && !jiraBaseUrlSchema.safeParse(jira).success) {
			ctx.addIssue({
				code: "custom",
				message: "URL Jira invalide (https requis)",
				path: ["JIRA_BASE_URL"],
			});
		}
	});

export type SettingsBody = z.infer<typeof settingsBodySchema>;

/**
 * `POST /api/config/import` — restauration d'un export.
 *
 * Volontairement permissif sur le contenu des sections : l'import doit accepter
 * un export produit par une version antérieure. Ce que le schéma garantit, c'est
 * que le corps est bien un objet lisible — assez pour rendre 400 au lieu de 500
 * sur un fichier tronqué ou collé de travers (N35).
 */
const importedProjectSchema = z
	.object({
		// Présents dans un export, utiles à la correspondance des identifiants.
		id: z.coerce.number().int().optional(),
		slug: z.string().optional(),
		name: z.string().trim().min(1, "Nom requis"),
		path: z.string().trim().min(1, "Chemin requis"),
		audit_path: emptyToNull,
		type: projectTypeSchema,
		tool: projectToolSchema,
		tags: tagNames.default([]),
		ignored: boolStrict.default(false),
		is_remote: boolStrict.default(false),
	})
	// `.loose()` : un export porte aussi `created_at` et d'autres colonnes que
	// l'import n'a pas à connaître. Les refuser rendrait tout export non
	// réimportable au premier ajout de colonne.
	.loose();

/**
 * Annotation dans un fichier d'import.
 *
 * `path` est la forme spécifiée (CONTEXT.md §12) : le relink se fait par chemin
 * de projet, ce qui rend l'export rejouable sur une autre base. `project_id`
 * reste accepté pour les fichiers produits par les versions antérieures, qui ne
 * portaient que lui — les refuser rendrait tout export existant inutilisable.
 *
 * Les deux sont donc optionnels ici, et c'est l'import qui écarte les lignes dont
 * aucun ne résout : le schéma garantit la lisibilité, pas la résolvabilité.
 */
const importedAnnotationSchema = z
	.object({
		cve: z.string().trim().min(1, "CVE requise"),
		path: z.string().trim().optional(),
		project_id: z.coerce.number().int().optional(),
		status: annotationStatusSchema.catch("pending").default("pending"),
		note: z.string().optional(),
		fixed_in: z.string().nullish(),
	})
	.loose();

export const configImportBodySchema = z.object({
	settings: z.record(z.string(), z.coerce.string()).optional(),
	projects: z.array(importedProjectSchema).optional(),
	annotations: z.array(importedAnnotationSchema).optional(),
});

// ---------------------------------------------------------------- tickets

/**
 * Cible d'un ticket : un paquet dans un projet (CONTEXT.md §8).
 *
 * Partagée par le brouillon Markdown, la liaison manuelle, la suppression du
 * lien et la création Jira. Les quatre routes lisaient le corps sans le
 * valider : un `cves` absent faisait lever `cves.includes` et sortait en 500.
 */
export const ticketTargetSchema = z.object({
	projectId: z.coerce.number({ message: "Projet requis" }).int("Projet requis"),
	packageName: z
		.string({ message: "Paquet requis" })
		.trim()
		.min(1, "Paquet requis"),
});

/** Références CVE/GHSA portées par le ticket ; une liste vide est acceptée. */
const ticketCves = z.array(z.string()).default([]);

/**
 * `POST /api/tickets` — brouillon Markdown. `cves` facultatif : la page de
 * création laisse **choisir** les CVE à traiter, et l'aperçu doit suivre le
 * choix. Absent, toutes les CVE du paquet.
 */
export const ticketDraftBodySchema = ticketTargetSchema.extend({
	cves: z.array(z.string()).optional(),
});

/** `POST /api/tickets/link` — référence saisie à la main. */
export const ticketLinkBodySchema = ticketTargetSchema.extend({
	ref: z
		.string({ message: "Référence requise" })
		.trim()
		.min(1, "Référence requise"),
	cves: ticketCves,
});

/**
 * `POST /api/tickets/create`.
 *
 * `issueType` est ramené à `""` quand il manque : c'est la route qui refuse,
 * avec un message qui nomme le champ de la modale, **après** avoir contrôlé la
 * configuration Jira — l'ordre des deux refus est fixé par les tests.
 */
export const ticketCreateBodySchema = ticketTargetSchema.extend({
	cves: ticketCves,
	notes: z.string().default(""),
	issueType: z.string().trim().default(""),
});

// ---------------------------------------------------------------- snapshots

export const restoreBodySchema = z.object({
	file: z.string({ message: "Fichier requis" }).trim().min(1, "Fichier requis"),
});

// ---------------------------------------------------------------- rapports

export const reportBodySchema = z.object({
	projects_audited: z.coerce.number().int().min(0),
	total_vulnerabilities: z.coerce.number().int().min(0),
	counts: z
		.object({
			critical: z.coerce.number().int().default(0),
			high: z.coerce.number().int().default(0),
			moderate: z.coerce.number().int().default(0),
			low: z.coerce.number().int().default(0),
			info: z.coerce.number().int().default(0),
			unknown: z.coerce.number().int().default(0),
		})
		.loose(),
	details: z.array(z.unknown()).default([]),
});
