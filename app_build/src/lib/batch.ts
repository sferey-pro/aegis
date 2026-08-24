/**
 * Pool borné, partagé par les deux lots orchestrés côté client.
 *
 * `CONTEXT.md` §2 confie l'orchestration de « Tout auditer » au client — « aucun
 * endpoint batch » — en **parallèle borné à 4**, annulable, avec un compte-rendu
 * où les projets annulés figurent. La synchronisation Git groupée (§5) veut
 * exactement les mêmes propriétés : seuls l'appel et le tri diffèrent.
 *
 * Elles vivaient donc à deux endroits, et c'est ce qui a laissé la synchro Git
 * séquentielle, non annulable et muette sur ses échecs alors que l'audit avait
 * été corrigé (N8). Un seul mécanisme, deux appelants.
 *
 * Sans React : le pool est une règle de contrat, pas un détail de rendu, et il
 * se teste sans monter de composant.
 */

/** Concurrence maximale, fixée par CONTEXT.md §2. */
export const BATCH_CONCURRENCY = 4;

/** Projet minimal nécessaire à l'orchestration. */
export interface BatchTarget {
	id: number;
	name: string;
}

/** Ce qu'un projet a produit. Exactement une des trois formes. */
export interface BatchOutcome<T> {
	project: BatchTarget;
	/** Réponse du serveur, `null` si l'appel a échoué ou été annulé. */
	value: T | null;
	/** Message d'échec : appel en erreur, ou succès HTTP porteur d'un échec. */
	error: string | null;
	/** L'utilisateur a annulé avant que ce projet ne réponde. */
	cancelled: boolean;
}

export interface BatchProgress {
	/** Projets terminés, annulés compris. */
	done: number;
	total: number;
	/** Noms des projets en cours, au plus `BATCH_CONCURRENCY`. */
	running: string[];
}

export interface BatchOptions<T> {
	signal: AbortSignal;
	onProgress: (progress: BatchProgress) => void;
	/**
	 * Traduit un message d'erreur d'appel. Injecté plutôt que codé ici : le
	 * formatage des erreurs d'API appartient à `lib/api`, dont ce module n'a pas
	 * à dépendre pour être testable seul.
	 */
	describeError: (err: unknown) => string;
	/**
	 * Un 200 peut porter un échec : un run d'audit persisté en `status: "error"`,
	 * un `git fetch` sorti non nul. Rendre un message le classe en échec au
	 * compte-rendu ; rendre `null` le laisse en succès.
	 */
	failureOf?: (value: T) => string | null;
	concurrency?: number;
}

/**
 * Exécute `call` sur chaque cible, au plus `concurrency` à la fois.
 *
 * Le pool est un simple ensemble de travailleurs se servant dans une file
 * partagée : la charge se répartit d'elle-même, un projet lent n'immobilise pas
 * un créneau pour les suivants.
 *
 * L'annulation côté client n'arrête pas le sous-processus côté serveur — il n'y
 * a pas d'endpoint pour cela — mais elle rend l'interface à l'utilisateur, ce
 * qui était le vrai blocage.
 */
export async function runBatch<T>(
	targets: BatchTarget[],
	call: (target: BatchTarget, signal: AbortSignal) => Promise<T>,
	options: BatchOptions<T>,
): Promise<BatchOutcome<T>[]> {
	const { signal, onProgress, describeError, failureOf } = options;
	const concurrency = options.concurrency ?? BATCH_CONCURRENCY;

	const total = targets.length;
	const pending = [...targets];
	const running = new Set<string>();
	const outcomes: BatchOutcome<T>[] = [];
	let done = 0;

	const publish = () => onProgress({ done, total, running: [...running] });
	publish();

	const worker = async () => {
		for (;;) {
			const target = pending.shift();
			if (!target) return;

			// Annulé pendant l'attente : les projets restants ne partent pas, mais ils
			// figurent au compte-rendu comme annulés — un projet absent se lirait
			// comme un projet sain.
			if (signal.aborted) {
				outcomes.push({
					project: target,
					value: null,
					error: null,
					cancelled: true,
				});
				done++;
				publish();
				continue;
			}

			running.add(target.name);
			publish();
			try {
				const value = await call(target, signal);
				outcomes.push({
					project: target,
					value,
					error: failureOf?.(value) ?? null,
					cancelled: false,
				});
			} catch (err) {
				const aborted =
					signal.aborted || (err instanceof Error && err.name === "AbortError");
				outcomes.push({
					project: target,
					value: null,
					error: aborted ? null : describeError(err),
					cancelled: aborted,
				});
			} finally {
				running.delete(target.name);
				done++;
				publish();
			}
		}
	};

	await Promise.all(
		Array.from({ length: Math.min(concurrency, total) }).map(() => worker()),
	);
	return outcomes;
}
