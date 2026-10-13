import type { ConsoleEvent } from "@/components/organisms/console-types";

export type ConsoleMessage = ConsoleEvent | ": disabled";
export type ConsoleListener = (message: ConsoleMessage) => void;

/**
 * Client partagé pour le flux SSE `/api/console` (N17).
 *
 * Évite d'ouvrir plusieurs instances simultanées de `EventSource` (ex: `Console.tsx`
 * et `Projects.tsx`), réduisant la charge serveur et évitant les incohérences d'état.
 */
class ConsoleClient {
	private source: EventSource | null = null;
	private listeners = new Set<ConsoleListener>();

	/**
	 * Souscrit un listener aux événements de la console.
	 * Ouvre la connexion SSE au premier abonné et la ferme quand le dernier se désabonne.
	 */
	subscribe(listener: ConsoleListener): () => void {
		this.listeners.add(listener);
		if (!this.source) {
			this.connect();
		}
		return () => {
			this.listeners.delete(listener);
			if (this.listeners.size === 0 && this.source) {
				this.source.close();
				this.source = null;
			}
		};
	}

	private connect() {
		try {
			const evtSource = new EventSource("/api/console");
			this.source = evtSource;

			evtSource.onmessage = (event: { data: string }) => {
				if (event.data === ": disabled") {
					for (const l of this.listeners) l(": disabled");
					evtSource.close();
					this.source = null;
					return;
				}
				if (event.data === ": ping" || event.data === ": connected") return;
				try {
					const data = JSON.parse(event.data) as ConsoleEvent;
					for (const l of this.listeners) l(data);
				} catch (e) {
					console.error("SSE parse error", e);
				}
			};

			evtSource.onerror = () => {
				// Reconnexion gérée nativement par EventSource
			};
		} catch (e) {
			console.error("Échec de connexion EventSource console", e);
		}
	}

	/**
	 * Ferme la connexion et vide les écouteurs (utilisé notamment pour réinitialiser les tests).
	 */
	reset(): void {
		if (this.source) {
			this.source.close();
			this.source = null;
		}
		this.listeners.clear();
	}
}

export const consoleClient = new ConsoleClient();
