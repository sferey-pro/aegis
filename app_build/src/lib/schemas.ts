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
	ignored: z.coerce.boolean().default(false),
	is_remote: z.coerce.boolean().default(false),
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
