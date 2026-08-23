import { getDernierePasse, syncAllAdvisories } from "./advisory-sync";

/**
 * Rafraîchissement périodique des avis GHSA.
 *
 * ## Pourquoi c'est nécessaire
 *
 * Le cache d'avis ne se remplissait que sur action humaine — le bouton « Mettre
 * à jour les avis GHSA » de l'écran Triage. Or pour un projet en fin de vie, dont
 * le lockfile ne bouge plus, **la nouvelle faille arrive par un nouvel avis, pas
 * par un commit**. Un audit quotidien sur un dépôt figé réenregistrait donc chaque
 * jour la connaissance de la veille, avec l'apparence d'une surveillance active.
 * C'est exactement le cas que cette application doit couvrir, et c'était son angle
 * mort.
 *
 * ## Ce que cela change au contrat
 *
 * `CONTEXT.md` §6 réservait l'interrogation de GitHub à « la porte manuelle par
 * CVE », et §15 affirmait « GitHub est interrogé à la demande, **jamais en tâche
 * de fond** ». Cet invariant est **amendé** : le rafraîchissement est désormais une
 * tâche de fond assumée, à quatre conditions qui préservent l'intention d'origine.
 *
 *  1. **Aucun appel réseau pendant un audit.** L'invariant qui compte vraiment est
 *     intact : le chemin d'audit lit le cache et n'émet rien. Cette passe est
 *     indépendante, et elle ne peut pas retarder un audit.
 *  2. **Bornée par le quota.** `syncAllAdvisories` saute ce qui est déjà en cache
 *     et s'arrête au premier 429 en annonçant ce qui reste. Sans jeton GitHub le
 *     quota est de 60 requêtes par heure : la passe s'autolimite au lieu de le
 *     brûler.
 *  3. **Visible.** Chaque appel émet ses événements de console (§11), et le bilan
 *     de la dernière passe est lisible par l'API. Rien ne se produit en silence —
 *     c'est ce que « jamais en tâche de fond **cachée** » demandait réellement.
 *  4. **Désactivable.** `ADVISORY_SYNC_INTERVAL_MIN=0` la coupe entièrement.
 *
 * ## Pourquoi la première passe est différée
 *
 * Lancer au démarrage ferait partir une passe réseau à **chaque** rechargement à
 * chaud de `bun --hot`. Le délai initial laisse le serveur se poser, et un
 * rechargement survenu avant son échéance annule le minuteur au lieu d'empiler les
 * passes (défaut N26, même parade que le keepalive de la console).
 */

/** Intervalle par défaut, en minutes. Six heures : quatre passes par jour. */
const INTERVALLE_DEFAUT_MIN = 360;

/** Délai avant la première passe. Assez long pour absorber un `bun --hot`. */
const DELAI_INITIAL_MS = 60_000;

let minuteur: ReturnType<typeof setInterval> | null = null;
let premierePasse: ReturnType<typeof setTimeout> | null = null;

/**
 * Intervalle demandé, en minutes. `0` ou négatif désactive ; une valeur illisible
 * retombe sur le défaut plutôt que de désactiver en silence — un réglage mal
 * orthographié ne doit pas couper la surveillance sans le dire.
 */
export function intervalleMinutes(): number {
	const brut = process.env.ADVISORY_SYNC_INTERVAL_MIN;
	if (brut === undefined) return INTERVALLE_DEFAUT_MIN;
	const n = Number(brut);
	if (!Number.isFinite(n)) return INTERVALLE_DEFAUT_MIN;
	return Math.floor(n);
}

/**
 * Une passe, dont les échecs ne remontent jamais.
 *
 * Un réseau coupé ou un quota épuisé ne doivent pas produire de rejet non capturé
 * qui ferait tomber le process : ce sont des conditions normales pour ce
 * connecteur, et la passe suivante reprendra.
 */
async function passeSilencieuse(): Promise<void> {
	try {
		const r = await syncAllAdvisories();
		if (r.fetched > 0 || r.rateLimited) {
			console.log(
				`[advisories] ${r.fetched} avis récupérés, ${r.alreadyCached} déjà connus` +
					(r.rateLimited ? `, quota atteint (${r.remaining} restants)` : ""),
			);
		}
	} catch (e) {
		// Inclut le refus de concurrence : une passe manuelle en cours a la
		// priorité, et il n'y a rien à signaler de plus.
		console.error("[advisories] passe de rafraîchissement échouée", e);
	}
}

/**
 * Démarre le planificateur. Idempotent : un second appel ne crée pas de second
 * minuteur, ce qui protège du rechargement à chaud.
 */
export function startAdvisoryScheduler(): void {
	stopAdvisoryScheduler();

	const minutes = intervalleMinutes();
	if (minutes <= 0) {
		console.log("[advisories] rafraîchissement automatique désactivé");
		return;
	}

	const periodeMs = minutes * 60_000;
	premierePasse = setTimeout(() => {
		premierePasse = null;
		void passeSilencieuse();
		minuteur = setInterval(() => void passeSilencieuse(), periodeMs);
		// `unref` : ce minuteur ne doit pas maintenir le process en vie à lui seul.
		minuteur.unref?.();
	}, DELAI_INITIAL_MS);
	premierePasse.unref?.();

	console.log(
		`[advisories] rafraîchissement automatique toutes les ${minutes} min`,
	);
}

/** Arrête le planificateur. Appelé à l'arrêt propre du serveur. */
export function stopAdvisoryScheduler(): void {
	if (premierePasse) {
		clearTimeout(premierePasse);
		premierePasse = null;
	}
	if (minuteur) {
		clearInterval(minuteur);
		minuteur = null;
	}
}

/** Le planificateur est-il armé ? Utile aux tests et au diagnostic. */
export function schedulerActif(): boolean {
	return minuteur !== null || premierePasse !== null;
}

/** Bilan de la dernière passe, planifiée ou manuelle. */
export { getDernierePasse };
