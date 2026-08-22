import { listProjects } from "../db/projects";
import { getLatestRun } from "../db/runs";
import {
	type AdvisoryKey,
	fetchAdvisory,
	getAllCachedAdvisories,
	keyFrom,
	putCachedAdvisory,
} from "./github";

/**
 * Enrichissement GHSA en masse.
 *
 * Le cache d'avis ne se remplissait que par le bouton de rafraîchissement d'une
 * CVE : sur une base neuve — après un reset, par exemple — il restait vide, et
 * l'écran de triage affichait la sévérité brute de l'outil d'audit, sans lien
 * GitHub, sans vecteur CVSS ni date de publication. Cette passe parcourt une
 * fois toutes les vulnérabilités connues et va chercher ce qui manque.
 *
 * Deux règles portent la boucle :
 *
 *  - **Ne pas redemander ce qu'on a déjà.** Le quota GitHub est la ressource
 *    rare, pas le temps ; une clé en cache est sautée sans appel réseau, sauf
 *    `force`.
 *  - **S'arrêter au premier 429.** Une fois le quota épuisé, les appels suivants
 *    échouent tous : continuer ne remplirait rien et masquerait la cause
 *    derrière une pile d'échecs. La boucle rend la main en annonçant combien de
 *    clés restent à traiter, pour que l'appel suivant reprenne là où il s'est
 *    arrêté.
 */

export interface BulkSyncResult {
	/** Clés d'avis distinctes trouvées dans les derniers runs. */
	total: number;
	/** Déjà en cache, donc non interrogées. */
	alreadyCached: number;
	/** Récupérées auprès de GitHub et mises en cache. */
	fetched: number;
	/** Interrogées, mais GitHub ne connaît aucun avis. */
	notFound: number;
	/** Le quota a été atteint : la passe s'est arrêtée avant la fin. */
	rateLimited: boolean;
	/** Clés laissées de côté par l'arrêt sur quota. */
	remaining: number;
}

/**
 * Clés d'avis distinctes présentes dans le dernier run de chaque projet.
 *
 * On lit les derniers runs plutôt que le cache d'occurrences : c'est la même
 * source que l'écran de triage, donc la passe couvre exactement ce que
 * l'utilisateur voit — ni plus, ni moins.
 */
export function collectAdvisoryKeys(): AdvisoryKey[] {
	const parId = new Map<string, AdvisoryKey>();

	for (const projet of listProjects()) {
		const run = getLatestRun(projet.id);
		if (!run) continue;

		for (const vuln of run.vulnerabilities) {
			const cle = keyFrom(vuln.cve, vuln.link);
			// Une vulnérabilité sans CVE ni lien GHSA n'a pas d'avis à aller
			// chercher : le titre seul ne s'interroge pas.
			if (cle && !parId.has(cle.id)) parId.set(cle.id, cle);
		}
	}

	return [...parId.values()];
}

export async function syncAllAdvisories(
	options: {
		force?: boolean;
		/** Appelé après chaque clé traitée, pour le flux de progression. */
		onProgress?: (done: number, total: number, id: string) => void;
	} = {},
): Promise<BulkSyncResult> {
	const cles = collectAdvisoryKeys();
	const cache = options.force ? new Map() : getAllCachedAdvisories();

	const aTraiter = cles.filter((c) => !cache.has(c.id));
	const resultat: BulkSyncResult = {
		total: cles.length,
		alreadyCached: cles.length - aTraiter.length,
		fetched: 0,
		notFound: 0,
		rateLimited: false,
		remaining: 0,
	};

	for (let i = 0; i < aTraiter.length; i++) {
		const cle = aTraiter[i];
		if (!cle) continue;

		const { advisory, rateLimited } = await fetchAdvisory(cle);

		if (rateLimited) {
			resultat.rateLimited = true;
			resultat.remaining = aTraiter.length - i;
			break;
		}

		if (advisory) {
			putCachedAdvisory(
				cle.id,
				advisory.severity,
				advisory.fixes,
				advisory.html_url,
				advisory.cvss_vector,
				advisory.published_at,
			);
			resultat.fetched++;
		} else {
			resultat.notFound++;
		}

		options.onProgress?.(i + 1, aTraiter.length, cle.id);
	}

	return resultat;
}
