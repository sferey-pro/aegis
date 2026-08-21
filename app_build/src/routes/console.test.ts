import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";

import { getDb } from "@/db";
import { setSetting } from "@/db/settings";
import { emitConsoleEnd, emitConsoleStart } from "@/lib/console";
import { startTestServer, type TestServer } from "@/test/server";

let srv: TestServer;

beforeAll(async () => {
	srv = await startTestServer("console");
});
afterAll(() => srv.stop());
beforeEach(() => {
	getDb().query("DELETE FROM settings").run();
});

/**
 * Lit le flux SSE jusqu'à obtenir `nb` trames, puis annule la lecture — ce qui
 * doit faire retirer le client du côté serveur.
 */
async function lire(
	res: Response,
	nb: number,
	limiteMs = 2000,
): Promise<string[]> {
	const reader = (res.body as ReadableStream<Uint8Array>).getReader();
	const decodeur = new TextDecoder();
	const trames: string[] = [];
	const debut = Date.now();

	try {
		while (trames.length < nb) {
			const restant = limiteMs - (Date.now() - debut);
			if (restant <= 0) break;
			// `read()` ne rend la main que sur une trame : sans cette course, un flux
			// silencieux ferait attendre le test jusqu'au délai de l'exécuteur.
			const lu = await Promise.race([
				reader.read(),
				new Promise<null>((r) => setTimeout(() => r(null), restant)),
			]);
			if (!lu) break;
			const { value, done } = lu;
			if (done) break;
			for (const t of decodeur
				.decode(value)
				.split("\n\n")
				.filter((t) => t.trim() !== "")) {
				trames.push(t);
			}
		}
	} finally {
		await reader.cancel();
	}
	return trames;
}

describe("GET /api/console", () => {
	test("le flux est annoncé comme un flux d'événements non mis en cache", async () => {
		// Sans `no-cache`, un intermédiaire peut mettre la réponse en tampon et le
		// client n'affiche rien jusqu'à la fermeture.
		const res = await srv.request("/api/console");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/event-stream");
		expect(res.headers.get("cache-control")).toBe("no-cache");
		await res.body?.cancel();
	});

	test("le flux s'ouvre sur un commentaire de connexion", async () => {
		const res = await srv.request("/api/console");
		const [premiere] = await lire(res, 1);
		expect(premiere).toBe(": connected");
	});

	test("un événement émis pendant l'écoute arrive au client", async () => {
		const res = await srv.request("/api/console");
		const lecture = lire(res, 2);
		// Laisser le temps au handler d'enregistrer le client avant d'émettre.
		await new Promise((r) => setTimeout(r, 50));
		const id = emitConsoleStart({
			cmd: "npm audit --json",
			cwd: "/srv/api",
			label: "audit",
		});

		const trames = await lecture;
		const evenement = trames.find((t) => t.startsWith("data: "));
		expect(evenement).toBeDefined();
		const charge = JSON.parse((evenement as string).slice(6)) as {
			id: number;
			phase: string;
			cmd: string;
		};
		expect(charge.id).toBe(id);
		expect(charge.phase).toBe("start");
		expect(charge.cmd).toBe("npm audit --json");
	});

	test("start et end arrivent dans l'ordre, appariés par identifiant", async () => {
		const res = await srv.request("/api/console");
		const lecture = lire(res, 3);
		await new Promise((r) => setTimeout(r, 50));
		const id = emitConsoleStart({
			cmd: "git status",
			cwd: "/srv",
			label: "git",
		});
		emitConsoleEnd(id, { exitCode: 0, ms: 12 });

		const charges = (await lecture)
			.filter((t) => t.startsWith("data: "))
			.map((t) => JSON.parse(t.slice(6)) as { id: number; phase: string });
		expect(charges.map((c) => c.phase)).toEqual(["start", "end"]);
		expect(charges.every((c) => c.id === id)).toBe(true);
	});

	test("un client tardif ne rejoue pas les événements passés", async () => {
		// Le flux est volatil (CONTEXT.md §11) : aucun tampon, aucun rejeu.
		emitConsoleStart({ cmd: "avant", cwd: "/srv", label: "audit" });
		const res = await srv.request("/api/console");
		const trames = await lire(res, 2, 300);
		expect(trames.filter((t) => t.includes("avant"))).toHaveLength(0);
	});

	test("DISABLE_CONSOLE renvoie un flux immédiatement clos", async () => {
		// Le flux reste un flux : le client garde le même code, il ne reçoit
		// simplement rien.
		setSetting("DISABLE_CONSOLE", "true");
		const res = await srv.request("/api/console");
		expect(res.headers.get("content-type")).toContain("text/event-stream");
		expect(await res.text()).toBe("data: : disabled\n\n");
	});

	test("le réglage remis à false rétablit le flux normal", async () => {
		setSetting("DISABLE_CONSOLE", "false");
		const res = await srv.request("/api/console");
		const [premiere] = await lire(res, 1);
		expect(premiere).toBe(": connected");
	});

	test("deux clients reçoivent le même événement", async () => {
		const a = await srv.request("/api/console");
		const b = await srv.request("/api/console");
		const lectureA = lire(a, 2);
		const lectureB = lire(b, 2);
		await new Promise((r) => setTimeout(r, 50));
		emitConsoleStart({ cmd: "diffusion", cwd: "/srv", label: "audit" });

		for (const trames of await Promise.all([lectureA, lectureB])) {
			expect(trames.some((t) => t.includes("diffusion"))).toBe(true);
		}
	});

	test("un client déconnecté n'empêche pas les suivants de recevoir", async () => {
		// C'est le nettoyage câblé sur `cancel` : sans lui, chaque onglet fermé
		// laisserait un contrôleur mort dans la liste de diffusion.
		const mort = await srv.request("/api/console");
		await lire(mort, 1);

		const vivant = await srv.request("/api/console");
		const lecture = lire(vivant, 2);
		await new Promise((r) => setTimeout(r, 50));
		emitConsoleStart({ cmd: "apres-fermeture", cwd: "/srv", label: "audit" });

		expect((await lecture).some((t) => t.includes("apres-fermeture"))).toBe(
			true,
		);
	});
});
