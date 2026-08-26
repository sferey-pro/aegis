import { beforeEach, describe, expect, test } from "bun:test";

import { setSetting } from "@/db/settings";
import { useTempDb } from "@/test/db";
import {
	addConsoleClient,
	type ConsoleEvent,
	closeConsoleClients,
	consoleClientCount,
	emitConsoleEnd,
	emitConsoleStart,
	projectContext,
	removeConsoleClient,
} from "./console";

/**
 * Faux client SSE : un `ReadableStreamDefaultController` réduit à ce que
 * `broadcast` utilise. `enqueue` peut être configuré pour lever, afin de
 * reproduire un onglet fermé — le cas qui doit purger le client.
 */
function client(options: { throws?: boolean } = {}) {
	const recu: string[] = [];
	const controller = {
		enqueue(chunk: string) {
			if (options.throws) throw new Error("stream closed");
			recu.push(chunk);
		},
	} as unknown as ReadableStreamDefaultController<string>;

	return {
		controller,
		recu,
		/** Événements reçus, décodés depuis le cadrage SSE. */
		evenements(): ConsoleEvent[] {
			return recu
				.filter((c) => c.startsWith("data: "))
				.map((c) => JSON.parse(c.slice(6)) as ConsoleEvent);
		},
	};
}

const depart = {
	cmd: "npm audit --json",
	cwd: "/srv/api",
	label: "audit" as const,
};

describe("lib/console", () => {
	useTempDb("console");

	test("un client reçoit un commentaire de connexion", () => {
		// Le commentaire ouvre le flux tout de suite : sans lui, certains proxies
		// gardent la réponse en tampon et l'`EventSource` reste en attente.
		const c = client();
		addConsoleClient(c.controller);
		expect(c.recu).toEqual([": connected\n\n"]);
		removeConsoleClient(c.controller);
	});

	test("emitConsoleStart diffuse un événement de phase start", () => {
		const c = client();
		addConsoleClient(c.controller);
		emitConsoleStart(depart);

		const [e] = c.evenements();
		expect(e?.phase).toBe("start");
		expect(e?.cmd).toBe("npm audit --json");
		expect(e?.cwd).toBe("/srv/api");
		expect(e?.label).toBe("audit");
		removeConsoleClient(c.controller);
	});

	test("le cadrage SSE est respecté : préfixe data et double saut de ligne", () => {
		const c = client();
		addConsoleClient(c.controller);
		emitConsoleStart(depart);

		const trame = c.recu.at(-1) as string;
		expect(trame.startsWith("data: ")).toBe(true);
		expect(trame.endsWith("\n\n")).toBe(true);
		removeConsoleClient(c.controller);
	});

	test("l'identifiant retourné permet d'apparier start et end", () => {
		const c = client();
		addConsoleClient(c.controller);
		const id = emitConsoleStart(depart);
		emitConsoleEnd(id, { exitCode: 0, ms: 120 });

		const [debut, fin] = c.evenements();
		expect(debut?.id).toBe(id);
		expect(fin?.id).toBe(id);
		expect(fin?.phase).toBe("end");
		expect(fin?.exitCode).toBe(0);
		expect(fin?.ms).toBe(120);
		removeConsoleClient(c.controller);
	});

	test("les identifiants sont strictement croissants", () => {
		const a = emitConsoleStart(depart);
		const b = emitConsoleStart(depart);
		expect(b).toBeGreaterThan(a);
	});

	test("un code de sortie non nul est transmis tel quel", () => {
		const c = client();
		addConsoleClient(c.controller);
		const id = emitConsoleStart(depart);
		emitConsoleEnd(id, { exitCode: 1, errorText: "npm ERR!" });

		const fin = c.evenements().at(-1);
		expect(fin?.exitCode).toBe(1);
		expect(fin?.errorText).toBe("npm ERR!");
		removeConsoleClient(c.controller);
	});

	test("une sortie de plus de 3000 caractères est tronquée", () => {
		// Sans troncature, un `npm audit` verbeux ferait passer des mégaoctets par
		// JSON.stringify à chaque événement et figerait l'affichage.
		const c = client();
		addConsoleClient(c.controller);
		const id = emitConsoleStart(depart);
		emitConsoleEnd(id, { outText: "x".repeat(5000) });

		const fin = c.evenements().at(-1);
		expect(fin?.outText).toHaveLength(3000 + "\n... [TRUNCATED]".length);
		expect(fin?.outText?.endsWith("... [TRUNCATED]")).toBe(true);
		removeConsoleClient(c.controller);
	});

	test("une sortie exactement à la limite n'est pas tronquée", () => {
		const c = client();
		addConsoleClient(c.controller);
		const id = emitConsoleStart(depart);
		emitConsoleEnd(id, { outText: "x".repeat(3000) });

		expect(c.evenements().at(-1)?.outText).toHaveLength(3000);
		removeConsoleClient(c.controller);
	});

	test("errorText est tronqué selon la même règle", () => {
		const c = client();
		addConsoleClient(c.controller);
		const id = emitConsoleStart(depart);
		emitConsoleEnd(id, { errorText: "e".repeat(4000) });

		expect(c.evenements().at(-1)?.errorText?.endsWith("... [TRUNCATED]")).toBe(
			true,
		);
		removeConsoleClient(c.controller);
	});

	test("le projet courant est attaché depuis le contexte asynchrone", () => {
		// Les commandes sont lancées dans un `projectContext.run` : c'est ce qui
		// permet à la console d'attribuer une ligne à un projet sans passer le nom
		// à travers toute la pile d'appels.
		const c = client();
		addConsoleClient(c.controller);
		projectContext.run({ project: "API" }, () => {
			const id = emitConsoleStart(depart);
			emitConsoleEnd(id, { exitCode: 0 });
		});

		const [debut, fin] = c.evenements();
		expect(debut?.project).toBe("API");
		expect(fin?.project).toBe("API");
		removeConsoleClient(c.controller);
	});

	test("hors contexte, project est absent", () => {
		const c = client();
		addConsoleClient(c.controller);
		emitConsoleStart(depart);
		expect(c.evenements()[0]?.project).toBeUndefined();
		removeConsoleClient(c.controller);
	});

	test("tous les clients connectés reçoivent le même événement", () => {
		const a = client();
		const b = client();
		addConsoleClient(a.controller);
		addConsoleClient(b.controller);
		emitConsoleStart(depart);

		expect(a.evenements()).toHaveLength(1);
		expect(b.evenements()).toHaveLength(1);
		removeConsoleClient(a.controller);
		removeConsoleClient(b.controller);
	});

	test("un client retiré ne reçoit plus rien", () => {
		const c = client();
		addConsoleClient(c.controller);
		removeConsoleClient(c.controller);
		emitConsoleStart(depart);
		expect(c.evenements()).toHaveLength(0);
	});

	test("un client dont le flux est fermé est purgé, sans bloquer les autres", () => {
		// C'est le nettoyage d'un onglet fermé : sans lui, chaque événement
		// relèverait la même exception et la liste grossirait sans fin.
		const mort = client({ throws: true });
		const vivant = client();
		addConsoleClient(mort.controller);
		addConsoleClient(vivant.controller);

		emitConsoleStart(depart);
		expect(vivant.evenements()).toHaveLength(1);

		// Deuxième diffusion : le client mort a été retiré au premier échec.
		emitConsoleStart(depart);
		expect(vivant.evenements()).toHaveLength(2);
		removeConsoleClient(vivant.controller);
	});

	test("DISABLE_CONSOLE à true coupe la diffusion", () => {
		const c = client();
		addConsoleClient(c.controller);
		setSetting("DISABLE_CONSOLE", "true");
		emitConsoleStart(depart);
		expect(c.evenements()).toHaveLength(0);

		setSetting("DISABLE_CONSOLE", "false");
		emitConsoleStart(depart);
		expect(c.evenements()).toHaveLength(1);
		removeConsoleClient(c.controller);
	});

	test("DISABLE_CONSOLE n'empêche pas la connexion — écart documenté", () => {
		// Le réglage filtre `broadcast`, pas `addConsoleClient` : le client est
		// tout de même enregistré et reçoit le commentaire d'ouverture, donc le
		// flux reste ouvert et le ping périodique continue.
		setSetting("DISABLE_CONSOLE", "true");
		const c = client();
		addConsoleClient(c.controller);
		expect(c.recu).toEqual([": connected\n\n"]);
		removeConsoleClient(c.controller);
	});

	test("le flux est volatil : un client tardif ne rejoue pas l'historique", () => {
		// CONTEXT.md §11 : aucun tampon, aucun rejeu. Un onglet ouvert après un
		// audit ne verra rien de cet audit.
		emitConsoleStart(depart);
		const tardif = client();
		addConsoleClient(tardif.controller);
		expect(tardif.evenements()).toHaveLength(0);
		removeConsoleClient(tardif.controller);
	});

	test("emitConsoleEnd sur un identifiant inconnu diffuse quand même", () => {
		// Aucun registre des starts en cours : la corrélation est laissée au
		// client, qui affiche donc une fin orpheline plutôt que de la perdre.
		const c = client();
		addConsoleClient(c.controller);
		emitConsoleEnd(999_999, { exitCode: 0 });
		expect(c.evenements()[0]?.id).toBe(999_999);
		removeConsoleClient(c.controller);
	});
});

describe("lib/console — arrêt propre", () => {
	useTempDb("console-arret");

	// Le registre de clients est un état de **module**, partagé par tous les
	// fichiers de test du run — `bun test` ne les isole pas. Partir d'un registre
	// vide, sinon le décompte inclut les flux ouverts ailleurs.
	beforeEach(closeConsoleClients);

	test("closeConsoleClients ferme les flux et vide le registre", () => {
		// Sans cela, quitter le process tranchait chaque connexion en plein chunk :
		// le navigateur journalisait `ERR_INCOMPLETE_CHUNKED_ENCODING` à chaque
		// redémarrage, ce qui masquait les vraies erreurs.
		const fermes: number[] = [];
		const client = (id: number) =>
			({
				enqueue() {},
				close() {
					fermes.push(id);
				},
			}) as unknown as ReadableStreamDefaultController<string>;

		addConsoleClient(client(1));
		addConsoleClient(client(2));
		expect(consoleClientCount()).toBe(2);

		closeConsoleClients();

		expect(fermes).toEqual([1, 2]);
		expect(consoleClientCount()).toBe(0);
	});

	test("un flux déjà fermé par le pair ne fait pas échouer l'arrêt", () => {
		// Cas normal : l'onglet a été fermé juste avant l'arrêt du serveur.
		const mort = {
			enqueue() {},
			close() {
				throw new TypeError("already closed");
			},
		} as unknown as ReadableStreamDefaultController<string>;
		addConsoleClient(mort);

		expect(() => closeConsoleClients()).not.toThrow();
		expect(consoleClientCount()).toBe(0);
	});

	test("après fermeture, plus rien n'est diffusé", () => {
		const recu: string[] = [];
		const client = {
			enqueue(c: string) {
				recu.push(c);
			},
			close() {},
		} as unknown as ReadableStreamDefaultController<string>;

		addConsoleClient(client);
		closeConsoleClients();
		recu.length = 0;

		emitConsoleStart({ cmd: "après arrêt", cwd: "/srv", label: "audit" });
		expect(recu).toHaveLength(0);
	});
});

describe("lib/console — sortie serveur", () => {
	/**
	 * Le flux SSE ne va qu'au navigateur : en développement, le terminal du
	 * serveur ne montrait rien des appels sortants. Or c'est là qu'on travaille.
	 */
	function capturerStdout() {
		const lignes: string[] = [];
		const natif = console.log;
		console.log = (...args: unknown[]) => {
			lignes.push(args.map(String).join(" "));
		};
		return {
			lignes,
			arret: () => {
				console.log = natif;
			},
		};
	}

	function avecStdout<T>(fn: () => T): { lignes: string[]; valeur: T } {
		const initial = process.env.AEGIS_CONSOLE_STDOUT;
		process.env.AEGIS_CONSOLE_STDOUT = "1";
		const { lignes, arret } = capturerStdout();
		try {
			return { lignes, valeur: fn() };
		} finally {
			arret();
			if (initial === undefined) delete process.env.AEGIS_CONSOLE_STDOUT;
			else process.env.AEGIS_CONSOLE_STDOUT = initial;
		}
	}

	test("le départ porte le label, la commande et la cible", () => {
		const { lignes } = avecStdout(() =>
			emitConsoleStart({
				cmd: "GET /rest/api/3/myself",
				cwd: "https://jira.example/rest/api/3/myself",
				label: "jira",
			}),
		);
		expect(lignes[0]).toContain("[jira]");
		expect(lignes[0]).toContain("GET /rest/api/3/myself");
		expect(lignes[0]).toContain("https://jira.example");
	});

	test("la fin retrouve le label du départ", () => {
		// L'événement de fin ne porte ni `cmd`, ni `cwd`, ni `label` : il se corrèle
		// par son `id`. Sans table de correspondance, la sortie affichait
		// `[undefined]` une ligne sur deux.
		const { lignes } = avecStdout(() => {
			const id = emitConsoleStart({ cmd: "x", cwd: "y", label: "github" });
			emitConsoleEnd(id, { exitCode: 200, ok: true, ms: 12 });
		});
		expect(lignes[1]).toContain("[github]");
		expect(lignes[1]).toContain("✓");
		expect(lignes[1]).toContain("12ms");
	});

	test("le succès se lit dans `ok`, pas dans le code", () => {
		// Un appel HTTP réussi rend 200 : la convention shell afficherait une croix.
		const { lignes } = avecStdout(() => {
			const id = emitConsoleStart({ cmd: "x", cwd: "y", label: "jira" });
			emitConsoleEnd(id, { exitCode: 200, ok: true });
		});
		expect(lignes[1]).toContain("✓");
		expect(lignes[1]).not.toContain("✗");
	});

	test("un échec est marqué, avec sa sortie d'erreur", () => {
		const { lignes } = avecStdout(() => {
			const id = emitConsoleStart({ cmd: "x", cwd: "y", label: "audit" });
			emitConsoleEnd(id, { exitCode: 1, errorText: "npm ERR! ENOTFOUND" });
		});
		expect(lignes[1]).toContain("✗");
		expect(lignes.join("\n")).toContain("npm ERR! ENOTFOUND");
	});

	test("le nom du projet accompagne la ligne", () => {
		const { lignes } = avecStdout(() =>
			projectContext.run({ project: "mon-api" }, () =>
				emitConsoleStart({ cmd: "x", cwd: "y", label: "git" }),
			),
		);
		expect(lignes[0]).toContain("(mon-api)");
	});

	test("`AEGIS_CONSOLE_STDOUT=0` rend le serveur muet", () => {
		const initial = process.env.AEGIS_CONSOLE_STDOUT;
		process.env.AEGIS_CONSOLE_STDOUT = "0";
		const { lignes, arret } = capturerStdout();
		try {
			emitConsoleStart({ cmd: "x", cwd: "y", label: "git" });
		} finally {
			arret();
			if (initial === undefined) delete process.env.AEGIS_CONSOLE_STDOUT;
			else process.env.AEGIS_CONSOLE_STDOUT = initial;
		}
		expect(lignes).toHaveLength(0);
	});

	test("sous test, la sortie serveur est muette par défaut", () => {
		// Un test qui écrit sur stdout noie sa propre sortie. `AEGIS_TEST_NO_DOM`
		// est posé par l'étage fonctionnel, `NODE_ENV=test` par bun.
		const { lignes, arret } = capturerStdout();
		try {
			emitConsoleStart({ cmd: "x", cwd: "y", label: "git" });
		} finally {
			arret();
		}
		expect(lignes).toHaveLength(0);
	});
});
