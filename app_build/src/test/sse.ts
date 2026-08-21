import { afterEach } from "bun:test";

/**
 * Faux `EventSource`, pour les composants qui consomment le flux console.
 *
 * happy-dom ne fournit pas `EventSource`. Et même s'il le fournissait, on ne
 * voudrait pas d'une vraie connexion : le flux est volatile et sans rejeu
 * (CONTEXT.md §11), donc un test doit pouvoir **choisir** quels événements
 * arrivent et quand.
 *
 * L'instance retenue expose `emit()` pour pousser un événement dans le
 * composant, et enregistre `closed` afin de vérifier le nettoyage — un flux non
 * fermé au démontage fait fuiter une connexion par montage.
 */

export interface FakeEventSource {
	readonly url: string;
	onmessage: ((event: { data: string }) => void) | null;
	onerror: ((event: unknown) => void) | null;
	closed: boolean;
	close(): void;
	/** Pousse un événement brut (déjà sérialisé) vers le consommateur. */
	emit(data: string): void;
	/** Pousse un événement JSON. */
	emitJson(payload: unknown): void;
}

const instances: FakeEventSource[] = [];
let original: unknown;

/**
 * Installe le faux `EventSource`. Retourne l'accès aux instances créées : un
 * composant qui en ouvre deux est un défaut, et le test peut le voir.
 */
export function mockEventSource() {
	original ??= (globalThis as { EventSource?: unknown }).EventSource;
	instances.length = 0;

	class Fake implements FakeEventSource {
		onmessage: ((event: { data: string }) => void) | null = null;
		onerror: ((event: unknown) => void) | null = null;
		closed = false;

		constructor(readonly url: string) {
			instances.push(this);
		}

		close() {
			this.closed = true;
		}

		emit(data: string) {
			this.onmessage?.({ data });
		}

		emitJson(payload: unknown) {
			this.emit(JSON.stringify(payload));
		}
	}

	(globalThis as { EventSource?: unknown }).EventSource = Fake;

	return {
		/** Toutes les instances ouvertes depuis l'installation. */
		instances: instances as readonly FakeEventSource[],
		/** La dernière instance ouverte, celle que le composant utilise. */
		last(): FakeEventSource {
			const derniere = instances[instances.length - 1];
			if (!derniere) {
				throw new Error(
					"Aucun EventSource ouvert : le composant n'a pas souscrit au flux.",
				);
			}
			return derniere;
		},
	};
}

/** Restaure l'`EventSource` d'origine. Câblé sur `afterEach` par défaut. */
export function restoreEventSource() {
	(globalThis as { EventSource?: unknown }).EventSource = original;
	instances.length = 0;
}

/** Installe le faux flux et le restaure automatiquement après chaque test. */
export function useMockEventSource() {
	const controle = mockEventSource();
	afterEach(restoreEventSource);
	return controle;
}
