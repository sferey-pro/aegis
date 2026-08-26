/**
 * Construction des URL de l'API Jira, pour les **deux** familles de jetons.
 *
 * Atlassian en propose deux, et elles n'empruntent pas le même chemin :
 *
 * | Jeton | Point d'entrée | Qui authentifie |
 * |---|---|---|
 * | **classique** (sans portées) | `https://<site>.atlassian.net/rest/api/3/…` | le site lui-même |
 * | **à portées** (`read:jira-user`, …) | `https://api.atlassian.com/ex/jira/<cloudId>/rest/api/3/…` | la passerelle d'identité |
 *
 * Un jeton à portées appelé sur le domaine du site est rejeté par un 401
 * « Client must be authenticated to access this resource » — un refus
 * d'**identification**, pas de permission : le site ne sait pas consommer ce
 * jeton. Symptôme constaté à l'usage, et parfaitement trompeur.
 *
 * ⚠️ Le `cloudId` est **obligatoire** sur la passerelle : `api.atlassian.com`
 * sert tous les tenants, et rien dans l'URL ni dans le jeton ne dit lequel viser.
 * Sur le domaine du site, l'information était implicite dans le nom d'hôte.
 *
 * Il se lit sans authentification sur `https://<site>.atlassian.net/_edge/tenant_info`.
 */

/** Segment que la passerelle exige devant le chemin de l'API. */
const PREFIXE_PASSERELLE = "/ex/jira/";

/** Hôte de la passerelle d'identité d'Atlassian. */
export const HOTE_PASSERELLE = "api.atlassian.com";

/**
 * Une URL de base désigne-t-elle la passerelle ?
 *
 * Sur le seul nom d'hôte : c'est lui qui décide du modèle d'authentification.
 */
export function estPasserelle(baseUrl: string): boolean {
	try {
		return new URL(baseUrl).hostname === HOTE_PASSERELLE;
	} catch {
		return false;
	}
}

/**
 * Construit une URL absolue de l'API Jira, ou `null` si la base est inexploitable.
 *
 * Garde-fou du point d'utilisation contre la SSRF (N4) : la validation à
 * l'écriture couvre le formulaire, celle-ci couvre aussi ce qui a pu entrer par
 * un import de configuration ou une version antérieure.
 *
 * **Le préfixe de la passerelle est conservé.** La version précédente résolvait
 * le chemin depuis la **racine** du domaine (`new URL("/rest/api/3/myself",
 * base)`), ce qui effaçait `/ex/jira/<cloudId>` sans rien signaler : l'appel
 * partait vers `https://api.atlassian.com/rest/api/3/myself`, qui n'existe pas.
 *
 * @param chemin chemin absolu de l'API, tel que le swagger le nomme —
 *   `/rest/api/3/myself`.
 * @param cloudId identifiant du site, requis **et seulement utilisé** sur la
 *   passerelle.
 */
export function jiraEndpoint(
	baseUrl: string,
	chemin: string,
	cloudId = "",
): string | null {
	let base: URL;
	try {
		base = new URL(baseUrl);
	} catch {
		return null;
	}
	if (base.protocol !== "https:") return null;

	if (!estPasserelle(base.href)) {
		// Site classique : le chemin de l'API vit à la racine du domaine.
		return new URL(chemin, base).toString();
	}

	// Passerelle : le cloudId peut venir du réglage dédié, ou déjà figurer dans
	// l'URL de base — les deux écritures existent dans la nature, et les refuser
	// obligerait à deviner laquelle l'utilisateur a sous les yeux.
	const idDansBase = base.pathname.startsWith(PREFIXE_PASSERELLE)
		? base.pathname.slice(PREFIXE_PASSERELLE.length).split("/")[0]
		: "";
	const id = (cloudId || idDansBase || "").trim();
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
	cloudId: string,
): string | null {
	if (!baseUrl) return "URL Jira absente.";
	let base: URL;
	try {
		base = new URL(baseUrl);
	} catch {
		return "URL Jira invalide (https requis)";
	}
	// Message repris **mot pour mot** du contrat : `CONTEXT.md` le fixe, et un
	// point final suffit à faire échouer le test qui le verrouille.
	if (base.protocol !== "https:") return "URL Jira invalide (https requis)";

	if (estPasserelle(base.href)) {
		const idDansBase = base.pathname.startsWith(PREFIXE_PASSERELLE)
			? base.pathname.slice(PREFIXE_PASSERELLE.length).split("/")[0]
			: "";
		if (!cloudId.trim() && !idDansBase) {
			// Dire *pourquoi* et *où le trouver* : sans cela l'utilisateur découvre le
			// problème au premier ticket, sur un 404 de la passerelle.
			return "Cloud ID requis avec api.atlassian.com : relevez-le sur https://<votre-site>.atlassian.net/_edge/tenant_info";
		}
	}
	return null;
}
