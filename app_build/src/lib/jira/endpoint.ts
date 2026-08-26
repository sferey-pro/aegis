/**
 * Construction des URL de l'API Jira, selon le **type de jeton déclaré**.
 *
 * Atlassian propose deux sortes de jetons, et elles ne s'authentifient pas au
 * même endroit :
 *
 * | Type déclaré | Point d'entrée de l'API | Qui authentifie |
 * |---|---|---|
 * | `classic` (jeton d'API simple) | `https://<site>.atlassian.net/rest/api/3/…` | le site lui-même |
 * | `scoped` (jeton à périmètre) | `https://api.atlassian.com/ex/jira/<cloudId>/rest/api/3/…` | la passerelle d'identité |
 *
 * Un jeton à périmètre appelé sur le domaine du site est rejeté par un **401
 * « Client must be authenticated to access this resource »** : refus
 * d'**identification**, pas de permission — le site ne sait pas consommer ce
 * jeton. Le message n'évoque aucun droit, ce qui en fait un symptôme trompeur.
 *
 * ⚠️ **Le type est déclaré, jamais déduit.** Une première version l'inférait du
 * nom d'hôte de `JIRA_BASE_URL`, ce qui obligeait à y mettre `api.atlassian.com`
 * — or cette valeur sert **aussi** à construire les liens `/browse/<clé>` des
 * tickets dans l'interface. Ces liens pointaient alors vers la passerelle, qui ne
 * sert pas d'interface web : ils étaient morts. `JIRA_BASE_URL` reste donc
 * **toujours l'adresse du site**, et le type de jeton décide seul du point
 * d'entrée de l'API.
 *
 * Le `cloudId` est obligatoire pour un jeton à périmètre : la passerelle sert
 * tous les tenants, et rien dans l'URL ni dans le jeton ne dit lequel viser. Il
 * se lit sans authentification sur
 * `https://<site>.atlassian.net/_edge/tenant_info`.
 */

/** Segment que la passerelle exige devant le chemin de l'API. */
const PREFIXE_PASSERELLE = "/ex/jira/";

/** Hôte de la passerelle d'identité d'Atlassian. */
export const HOTE_PASSERELLE = "api.atlassian.com";

/** Type de jeton d'API Jira, déclaré dans les réglages. */
export type JiraTokenKind = "classic" | "scoped";

/** Valeur par défaut : le jeton simple, historiquement le seul géré. */
export const JIRA_TOKEN_KIND_DEFAUT: JiraTokenKind = "classic";

/** Normalise la valeur lue en base : tout ce qui n'est pas connu retombe au défaut. */
export function normaliseTokenKind(brut: string | undefined): JiraTokenKind {
	return brut === "scoped" ? "scoped" : JIRA_TOKEN_KIND_DEFAUT;
}

export interface JiraAuthConfig {
	kind: JiraTokenKind;
	cloudId: string;
}

/** L'URL désigne-t-elle la passerelle ? Utilisé pour signaler une saisie incohérente. */
export function estPasserelle(baseUrl: string): boolean {
	try {
		return new URL(baseUrl).hostname === HOTE_PASSERELLE;
	} catch {
		return false;
	}
}

/**
 * Construit une URL absolue de l'API Jira, ou `null` si la configuration ne le
 * permet pas.
 *
 * Garde-fou du point d'utilisation contre la SSRF (N4) : la validation à
 * l'écriture couvre le formulaire, celle-ci couvre aussi ce qui a pu entrer par
 * un import de configuration ou une version antérieure.
 *
 * @param chemin chemin absolu de l'API, tel que le swagger le nomme —
 *   `/rest/api/3/myself`.
 */
export function jiraEndpoint(
	baseUrl: string,
	chemin: string,
	auth: JiraAuthConfig = { kind: JIRA_TOKEN_KIND_DEFAUT, cloudId: "" },
): string | null {
	let base: URL;
	try {
		base = new URL(baseUrl);
	} catch {
		return null;
	}
	if (base.protocol !== "https:") return null;

	if (auth.kind === "classic") {
		// Le site consomme le jeton : le chemin de l'API vit à sa racine.
		return new URL(chemin, base).toString();
	}

	const id = auth.cloudId.trim();
	if (!id) return null;
	return new URL(
		`${PREFIXE_PASSERELLE}${id}${chemin}`,
		`https://${HOTE_PASSERELLE}`,
	).toString();
}

/**
 * Ce qui manque pour appeler Jira, en une phrase, ou `null` si tout est là.
 *
 * Rendu à l'appelant plutôt que jeté : une configuration incomplète est une
 * consigne à l'utilisateur, pas une erreur du serveur.
 */
export function diagnostiqueConfiguration(
	baseUrl: string,
	auth: JiraAuthConfig,
): string | null {
	if (!baseUrl) return "URL Jira absente.";
	let base: URL;
	try {
		base = new URL(baseUrl);
	} catch {
		return "URL Jira invalide (https requis)";
	}
	// Message repris **mot pour mot** du contrat : `CONTEXT.md` le fixe, et un
	// point final ajouté suffit à faire échouer le test qui le verrouille.
	if (base.protocol !== "https:") return "URL Jira invalide (https requis)";

	// L'adresse du site, jamais celle de la passerelle : c'est aussi elle qui
	// construit les liens /browse/<clé> de l'interface.
	if (estPasserelle(base.href)) {
		return "URL Jira : indiquez l'adresse de votre site (https://votre-site.atlassian.net), pas celle de la passerelle. Le type de jeton suffit à choisir le point d'entrée de l'API.";
	}

	if (auth.kind === "scoped" && !auth.cloudId.trim()) {
		// Dire *pourquoi* et *où le trouver* : sans cela l'utilisateur découvre le
		// problème au premier appel, sur un 404 de la passerelle.
		return "Cloud ID requis pour un jeton à périmètre : relevez-le sur https://<votre-site>.atlassian.net/_edge/tenant_info";
	}
	return null;
}
