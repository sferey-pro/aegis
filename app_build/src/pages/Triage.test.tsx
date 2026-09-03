import { afterEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import type { CveGroup, CveOccurrence } from "@/lib/aggregator";
import { fetchCalls, mockFetch, restoreFetch } from "@/test/http";
import { Triage } from "./Triage";

/** ⚠️ Assertions négatives : `toHaveLength(0)`, pas `not.toBeInTheDocument()`. */

function occ(over: Partial<CveOccurrence> = {}): CveOccurrence {
	return {
		projectId: 7,
		projectName: "Mon API",
		tool: "npm",
		package: "lodash",
		severity: "high",
		versionRange: null,
		fixedIn: null,
		title: "Prototype pollution",
		link: null,
		status: "pending",
		note: "",
		cvssVector: null,
		ageInDays: 5,
		firstSeenAt: null,
		publishedAt: null,
		isBaseline: false,
		...over,
	};
}

function groupe(over: Partial<CveGroup> = {}): CveGroup {
	return {
		cve: "CVE-2024-1",
		ref: "CVE-2024-1",
		worst: "high",
		occurrences: [occ()],
		cvssVector: null,
		maxBaselineAgeInDays: 0,
		maxSlaAgeInDays: 5,
		hasBaseline: false,
		hasNetDiscovery: true,
		...over,
	};
}

/** N groupes sur N packages distincts, pour dépasser une page. */
function beaucoup(n: number): CveGroup[] {
	return Array.from({ length: n }, (_, i) =>
		groupe({
			cve: `CVE-2024-${i}`,
			ref: `CVE-2024-${i}`,
			occurrences: [occ({ package: `pkg-${i}` })],
		}),
	);
}

const base = {
	"GET /api/cves": [] as CveGroup[],
	"GET /api/tickets/list": [] as unknown[],
	"GET /api/settings": { JIRA_BASE_URL: "https://jira.example" },
};

function monte(route = "/triage") {
	return render(
		<MemoryRouter initialEntries={[route]}>
			<Triage />
		</MemoryRouter>,
	);
}

const gets = () => fetchCalls().filter((c) => c.url === "/api/cves");
const posts = () => fetchCalls().filter((c) => c.method === "POST");

describe("Triage", () => {
	afterEach(restoreFetch);

	test("le bouton Ticket mène à la page de création, projet et paquet dans l'URL", async () => {
		// Le ticket se prépare sur sa propre page (§8), où l'on choisit les CVE.
		const g = groupe({ occurrences: [occ({ package: "lodash" })] });
		const attendu = g.occurrences[0]?.projectId;
		mockFetch({ ...base, "GET /api/cves": [g] });
		function EspionRoute() {
			const { pathname, search } = useLocation();
			return <span data-testid="route">{pathname + search}</span>;
		}
		render(
			<MemoryRouter initialEntries={["/triage"]}>
				<Routes>
					<Route path="/triage" element={<Triage />} />
					<Route path="/tickets/new" element={<EspionRoute />} />
				</Routes>
			</MemoryRouter>,
		);
		fireEvent.click(await screen.findByRole("button", { name: /Ticket/ }));
		expect(screen.getByTestId("route")).toHaveTextContent(
			`/tickets/new?project=${attendu}&package=lodash`,
		);
	});

	test("interroge les trois sources au montage", async () => {
		mockFetch(base);
		monte();
		await waitFor(() => {
			expect(fetchCalls().length).toBeGreaterThanOrEqual(3);
		});
		const urls = fetchCalls().map((c) => c.url);
		expect(urls).toContain("/api/cves");
		expect(urls).toContain("/api/tickets/list");
		expect(urls).toContain("/api/settings");
	});

	describe("recherche", () => {
		/** Deux paquets, deux CVE : de quoi vérifier qu'on filtre et non qu'on trie. */
		const deux = [
			groupe({
				cve: "CVE-2024-1",
				ref: "CVE-2024-1",
				occurrences: [occ({ package: "lodash", title: "Prototype pollution" })],
			}),
			groupe({
				cve: "GHSA-aaaa-bbbb-cccc",
				ref: "GHSA-aaaa-bbbb-cccc",
				occurrences: [
					occ({ package: "hono", title: "CORS reflète l'origine" }),
				],
			}),
		];

		test("une référence de CVE filtre la liste", async () => {
			mockFetch({ ...base, "GET /api/cves": deux });
			monte();
			await screen.findByText("lodash");

			fireEvent.change(screen.getByLabelText(/Chercher une CVE/), {
				target: { value: "GHSA-aaaa" },
			});

			expect(await screen.findByText("hono")).toBeInTheDocument();
			expect(screen.queryAllByText("lodash")).toHaveLength(0);
		});

		test("la recherche ne dépend pas de la casse", async () => {
			mockFetch({ ...base, "GET /api/cves": deux });
			monte();
			await screen.findByText("lodash");

			fireEvent.change(screen.getByLabelText(/Chercher une CVE/), {
				target: { value: "cve-2024-1" },
			});

			expect(await screen.findByText("lodash")).toBeInTheDocument();
			expect(screen.queryAllByText("hono")).toHaveLength(0);
		});

		test("un nom de paquet filtre aussi", async () => {
			// On cherche « une CVE en particulier », mais on la connaît souvent par
			// son paquet : refuser ce cas obligerait à connaître la référence par
			// cœur.
			mockFetch({ ...base, "GET /api/cves": deux });
			monte();
			await screen.findByText("lodash");

			fireEvent.change(screen.getByLabelText(/Chercher une CVE/), {
				target: { value: "hono" },
			});

			expect(await screen.findByText("hono")).toBeInTheDocument();
			expect(screen.queryAllByText("lodash")).toHaveLength(0);
		});

		test("un titre filtre aussi", async () => {
			mockFetch({ ...base, "GET /api/cves": deux });
			monte();
			await screen.findByText("lodash");

			fireEvent.change(screen.getByLabelText(/Chercher une CVE/), {
				target: { value: "prototype" },
			});

			expect(await screen.findByText("lodash")).toBeInTheDocument();
			expect(screen.queryAllByText("hono")).toHaveLength(0);
		});

		test("la recherche est portée par l'URL", async () => {
			// Elle se partage par lien et survit à un rechargement — on cherche une
			// CVE précise pour la montrer à quelqu'un.
			mockFetch({ ...base, "GET /api/cves": deux });
			monte("/triage?q=hono");

			expect(await screen.findByText("hono")).toBeInTheDocument();
			expect(screen.queryAllByText("lodash")).toHaveLength(0);
			expect(screen.getByLabelText(/Chercher une CVE/)).toHaveValue("hono");
		});

		test("une recherche sans résultat ne laisse aucune ligne", async () => {
			mockFetch({ ...base, "GET /api/cves": deux });
			monte();
			await screen.findByText("lodash");

			fireEvent.change(screen.getByLabelText(/Chercher une CVE/), {
				target: { value: "introuvable-xyz" },
			});

			await waitFor(() => {
				expect(screen.queryAllByText("lodash")).toHaveLength(0);
			});
			expect(screen.queryAllByText("hono")).toHaveLength(0);
		});

		test("vider la recherche rend toute la liste", async () => {
			mockFetch({ ...base, "GET /api/cves": deux });
			monte("/triage?q=hono");
			await screen.findByText("hono");

			fireEvent.change(screen.getByLabelText(/Chercher une CVE/), {
				target: { value: "" },
			});

			expect(await screen.findByText("lodash")).toBeInTheDocument();
			expect(screen.getByText("hono")).toBeInTheDocument();
		});

		test("la recherche renvoie à la première page", async () => {
			// Sans cela, chercher depuis la page 3 affiche une liste vide — ce qui se
			// lit « aucun résultat » alors qu'il y en a.
			mockFetch({ ...base, "GET /api/cves": beaucoup(30) });
			monte();
			await screen.findByText("pkg-0");

			fireEvent.click(screen.getByRole("button", { name: "Page suivante" }));
			fireEvent.change(screen.getByLabelText(/Chercher une CVE/), {
				target: { value: "pkg-1" },
			});

			expect(await screen.findByText("pkg-1")).toBeInTheDocument();
		});
	});

	describe("dates GHSA et Aegis", () => {
		const jour = (iso: string) => new Date(iso).toLocaleDateString();

		test("les deux dates de l'occurrence remontent dans la ligne", () => {
			mockFetch({
				...base,
				"GET /api/cves": [
					groupe({
						occurrences: [
							occ({
								publishedAt: "2020-07-15T00:00:00Z",
								firstSeenAt: "2026-08-01T09:00:00Z",
							}),
						],
					}),
				],
			});
			monte();

			return waitFor(() => {
				expect(screen.getByText(jour("2020-07-15T00:00:00Z"))).toBeDefined();
				expect(screen.getByText(jour("2026-08-01T09:00:00Z"))).toBeDefined();
			});
		});

		test("la plus ancienne date du groupe est retenue", async () => {
			// Un package peut porter plusieurs CVE : afficher la plus récente ferait
			// paraître le groupe plus jeune qu'il ne l'est, alors que c'est la plus
			// ancienne qui porte le SLA.
			mockFetch({
				...base,
				"GET /api/cves": [
					groupe({
						cve: "CVE-2024-1",
						ref: "CVE-2024-1",
						occurrences: [occ({ firstSeenAt: "2026-08-10T00:00:00Z" })],
					}),
					groupe({
						cve: "CVE-2024-2",
						ref: "CVE-2024-2",
						occurrences: [occ({ firstSeenAt: "2026-01-05T00:00:00Z" })],
					}),
				],
			});
			monte();

			await waitFor(() =>
				expect(screen.getByText(jour("2026-01-05T00:00:00Z"))).toBeDefined(),
			);
			expect(screen.queryAllByText(jour("2026-08-10T00:00:00Z"))).toHaveLength(
				0,
			);
		});

		test("une date illisible est ignorée, pas propagée", async () => {
			mockFetch({
				...base,
				"GET /api/cves": [
					groupe({
						occurrences: [
							occ({ publishedAt: "n'importe quoi", firstSeenAt: null }),
						],
					}),
				],
			});
			monte();

			// Une date invalide retenue comme minimum afficherait « Invalid Date » sur
			// toute la ligne.
			await waitFor(() => expect(screen.getAllByText("—")).toHaveLength(2));
			expect(screen.queryAllByText(/Invalid/)).toHaveLength(0);
		});
	});

	describe("mise à jour des avis GHSA", () => {
		const bilan = {
			success: true,
			total: 3,
			alreadyCached: 1,
			fetched: 2,
			notFound: 0,
			rateLimited: false,
			remaining: 0,
		};

		const bouton = () =>
			screen.getByRole("button", { name: /Mettre à jour les avis GHSA/ });

		test("sans CVE affichée, le bouton est désactivé", async () => {
			mockFetch(base);
			monte();
			await screen.findByText("Votre écosystème est sain !");
			// Rien à enrichir : le clic ne ferait qu'un aller-retour inutile.
			expect(bouton()).toBeDisabled();
		});

		test("un clic lance la passe et recharge les CVE", async () => {
			mockFetch({
				...base,
				"GET /api/cves": [groupe()],
				"POST /api/advisories/sync-all": bilan,
			});
			monte();
			await waitFor(() => expect(gets()).toHaveLength(1));

			fireEvent.click(bouton());

			await waitFor(() =>
				expect(
					posts().filter((c) => c.url === "/api/advisories/sync-all"),
				).toHaveLength(1),
			);
			// Le rechargement est indispensable : l'agrégateur superpose le cache aux
			// runs à la lecture, donc rien ne change à l'écran sans un second GET.
			await waitFor(() => expect(gets()).toHaveLength(2));
		});

		test("le bilan est rapporté à l'utilisateur", async () => {
			mockFetch({
				...base,
				"GET /api/cves": [groupe()],
				"POST /api/advisories/sync-all": bilan,
			});
			monte();
			await waitFor(() => expect(gets()).toHaveLength(1));

			fireEvent.click(bouton());

			expect(await screen.findByText("Avis GHSA à jour")).toBeInTheDocument();
			expect(
				await screen.findByText(/3 CVE examinées : 2 avis récupérés/),
			).toBeInTheDocument();
		});

		test("un quota atteint est annoncé sans être traité comme un échec", async () => {
			mockFetch({
				...base,
				"GET /api/cves": [groupe()],
				"POST /api/advisories/sync-all": {
					...bilan,
					fetched: 1,
					rateLimited: true,
					remaining: 2,
				},
			});
			monte();
			await waitFor(() => expect(gets()).toHaveLength(1));

			fireEvent.click(bouton());

			// Ce qui a été récupéré est conservé : c'est une fin de passe, pas une
			// erreur, et un second clic reprendra le reste.
			expect(
				await screen.findByText("Quota GitHub atteint"),
			).toBeInTheDocument();
			expect(await screen.findByText(/2 restants/)).toBeInTheDocument();
		});

		test("un échec est signalé, pas avalé", async () => {
			mockFetch({
				...base,
				"GET /api/cves": [groupe()],
				"POST /api/advisories/sync-all": { networkError: "ECONNREFUSED" },
			});
			monte();
			await waitFor(() => expect(gets()).toHaveLength(1));

			fireEvent.click(bouton());

			expect(await screen.findByText("Échec")).toBeInTheDocument();
			expect(
				await screen.findByText(/Enrichissement GHSA impossible/),
			).toBeInTheDocument();
		});

		test("le bouton redevient actif après un échec", async () => {
			mockFetch({
				...base,
				"GET /api/cves": [groupe()],
				"POST /api/advisories/sync-all": { networkError: "ECONNREFUSED" },
			});
			monte();
			await waitFor(() => expect(gets()).toHaveLength(1));

			fireEvent.click(bouton());
			await screen.findByText("Échec");

			// Un bouton resté grisé après une coupure réseau condamne l'écran jusqu'au
			// rechargement de la page.
			expect(bouton()).not.toBeDisabled();
		});
	});

	test("sans CVE, l'écran annonce un écosystème sain", async () => {
		mockFetch(base);
		monte();
		expect(
			await screen.findByText("Votre écosystème est sain !"),
		).toBeInTheDocument();
	});

	test("un chargement en échec a son propre état, distinct du parc sain (N6)", async () => {
		// C'était le pire mode de défaillance de l'outil : `fetchCves` avalait
		// l'erreur, `cves` restait vide, et l'écran annonçait « Votre écosystème est
		// sain ! » alors que l'API était tombée.
		mockFetch({ ...base, "GET /api/cves": { networkError: "ECONNREFUSED" } });
		monte();

		expect(
			await screen.findByText("Impossible de charger les vulnérabilités"),
		).toBeInTheDocument();
		expect(screen.queryAllByText("Votre écosystème est sain !")).toHaveLength(
			0,
		);
		expect(screen.getByRole("alert")).toBeInTheDocument();
	});

	test("le message d'échec porte la cause et le bouton de reprise (N6)", async () => {
		mockFetch({
			...base,
			"GET /api/cves": { status: 500, body: { error: "base verrouillée" } },
		});
		monte();

		expect(await screen.findByText("base verrouillée")).toBeInTheDocument();
		expect(
			screen.getByText(/ne reflète pas l'état de votre parc/),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /Réessayer/ }),
		).toBeInTheDocument();
	});

	test("un parc réellement sain garde son message rassurant", async () => {
		// Le nouvel état ne doit pas dévorer le cas légitime.
		mockFetch({ ...base, "GET /api/cves": [] });
		monte();
		expect(
			await screen.findByText("Votre écosystème est sain !"),
		).toBeInTheDocument();
		expect(screen.queryAllByRole("alert")).toHaveLength(0);
	});

	test("les groupes sont réagrégés par projet et package", async () => {
		mockFetch({
			...base,
			"GET /api/cves": [
				groupe({ cve: "CVE-1", ref: "CVE-1" }),
				// Même package, même projet : doit se fondre dans le même groupe.
				groupe({ cve: "CVE-2", ref: "CVE-2" }),
			],
		});
		monte();
		await waitFor(() => {
			expect(screen.getAllByText("lodash")).toHaveLength(1);
		});
	});

	test("le filtre projet de l'URL restreint la liste", async () => {
		mockFetch({
			...base,
			"GET /api/cves": [
				groupe({ occurrences: [occ({ projectId: 7, package: "lodash" })] }),
				groupe({
					cve: "CVE-9",
					ref: "CVE-9",
					occurrences: [
						occ({ projectId: 8, projectName: "Front", package: "axios" }),
					],
				}),
			],
		});
		monte("/triage?project=7");
		await waitFor(() => {
			expect(screen.getByText("lodash")).toBeInTheDocument();
		});
		expect(screen.queryAllByText("axios")).toHaveLength(0);
		expect(screen.getByText("Filtré par projet")).toBeInTheDocument();
	});

	test("le filtre CVE de l'URL est annoncé et appliqué", async () => {
		mockFetch({
			...base,
			"GET /api/cves": [
				groupe({ cve: "CVE-2024-1", ref: "CVE-2024-1" }),
				groupe({
					cve: "CVE-2024-9",
					ref: "CVE-2024-9",
					occurrences: [occ({ package: "axios" })],
				}),
			],
		});
		monte("/triage?cve=CVE-2024-1");
		await waitFor(() => {
			expect(screen.getByText("lodash")).toBeInTheDocument();
		});
		expect(screen.queryAllByText("axios")).toHaveLength(0);
		expect(screen.getByText(/Filtré par CVE/)).toBeInTheDocument();
	});

	test("Zero-Inbox masque les CVE déjà traitées", async () => {
		mockFetch({
			...base,
			"GET /api/cves": [groupe({ occurrences: [occ({ status: "ignored" })] })],
		});
		monte();
		await waitFor(() => {
			expect(screen.getByText("lodash")).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole("button", { name: /Zero-Inbox/ }));
		await waitFor(() => {
			expect(
				screen.getByText("Votre écosystème est sain !"),
			).toBeInTheDocument();
		});
	});

	test("annoter envoie le statut et la note au serveur", async () => {
		mockFetch({
			...base,
			"GET /api/cves": [groupe()],
			"POST /api/annotations": { body: {} },
		});
		monte();
		await waitFor(() => {
			expect(screen.getByText("lodash")).toBeInTheDocument();
		});

		// Ouvrir le détail puis marquer « Faux positif ».
		fireEvent.click(screen.getByText("lodash"));
		fireEvent.click(
			await screen.findByRole("button", { name: /Faux positif/ }),
		);

		await waitFor(() => {
			expect(posts()).toHaveLength(1);
		});
		expect(posts()[0]?.url).toBe("/api/annotations");
		// N32 : un changement de statut n'envoie que le statut. La note absente du
		// corps est préservée en base par `upsertAnnotation` ; l'envoyer à `""`
		// détruisait l'analyse du référent à chaque passage en « faux positif ».
		expect(posts()[0]?.body).toEqual({
			cve: "CVE-2024-1",
			projectId: 7,
			status: "ignored",
		});
	});

	test("après annotation, la liste des CVE est rechargée", async () => {
		mockFetch({
			...base,
			"GET /api/cves": [groupe()],
			"POST /api/annotations": { body: {} },
		});
		monte();
		await waitFor(() => {
			expect(screen.getByText("lodash")).toBeInTheDocument();
		});
		const avant = gets().length;

		fireEvent.click(screen.getByText("lodash"));
		fireEvent.click(
			await screen.findByRole("button", { name: /Faux positif/ }),
		);

		await waitFor(() => {
			expect(gets().length).toBe(avant + 1);
		});
	});

	test("la pagination ne retombe pas page 1 après une annotation", async () => {
		// N9, seconde moitié : `cves` figurait dans les dépendances de
		// `useEffect(() => setPage(1), …)`, et c'est un tableau **neuf** à chaque
		// refetch — donc après *toute* annotation. Il n'y est plus : seuls les
		// critères de filtrage remettent la pagination à la première page.
		mockFetch({
			...base,
			"GET /api/cves": beaucoup(15),
			"POST /api/annotations": { body: {} },
		});
		monte();
		await waitFor(() => {
			expect(screen.getByText(/Affichage de/)).toBeInTheDocument();
		});
		// 15 groupes, 10 par page.
		expect(screen.getByText(/Affichage de/).textContent).toContain("1");

		// Aller page 2. Les boutons de pagination n'ont que des icônes ; le
		// « suivant » est le seul bouton sans texte encore actif en page 1.
		const suivant = screen
			.getAllByRole("button")
			.filter((b) => b.textContent === "" && !b.hasAttribute("disabled"));
		fireEvent.click(suivant[suivant.length - 1] as HTMLElement);

		await waitFor(() => {
			expect(screen.getByText(/Affichage de/).textContent).toContain("11");
		});

		// Annoter depuis la page 2.
		const paquets = screen.getAllByText(/^pkg-1[0-4]$/);
		fireEvent.click(paquets[0] as HTMLElement);
		fireEvent.click(
			(
				await screen.findAllByRole("button", { name: /Faux positif/ })
			)[0] as HTMLElement,
		);

		// Assertion **exacte**, et non `toContain("Affichage de 1")` : ce préfixe
		// est aussi celui de « Affichage de 11 à 15 », donc l'ancienne assertion ne
		// distinguait pas les deux pages et validait le défaut à tort.
		await new Promise((r) => setTimeout(r, 300));
		expect(screen.getByText(/Affichage de/).textContent).toBe(
			"Affichage de 11 à 15 sur 15 packages",
		);
	});
});

describe("enchaînement des décisions (N9, corrigé)", () => {
	// L'état retient la **clé** du groupe et le groupe affiché est dérivé de
	// `packageGroups` : la modale reste ouverte et à jour, au lieu d'afficher un
	// instantané figé qu'il fallait fermer pour rafraîchir.
	test("la modale reste ouverte après une décision", async () => {
		mockFetch({
			...base,
			"GET /api/cves": [
				groupe({ cve: "CVE-1", ref: "CVE-1" }),
				groupe({ cve: "CVE-2", ref: "CVE-2" }),
			],
			"POST /api/annotations": { body: {} },
		});
		monte();
		await waitFor(() => {
			expect(screen.getByText("lodash")).toBeInTheDocument();
		});

		fireEvent.click(screen.getByText("lodash"));
		expect(await screen.findByRole("dialog")).toBeInTheDocument();

		fireEvent.click(
			(
				await screen.findAllByRole("button", { name: /Faux positif/ })
			)[0] as HTMLElement,
		);

		// La modale doit toujours être là, pour enchaîner la CVE suivante.
		await new Promise((r) => setTimeout(r, 200));
		expect(screen.queryAllByRole("dialog")).toHaveLength(1);
	});

	test("la modale reflète le nouveau statut sans être rouverte", async () => {
		// La modale retenait un instantané figé : même laissée ouverte, elle aurait
		// continué d'afficher l'ancien statut. C'est la dérivation depuis
		// `packageGroups` qui règle les deux moitiés du défaut d'un coup.
		mockFetch({
			...base,
			"GET /api/cves": [groupe({ occurrences: [occ({ status: "ignored" })] })],
			"POST /api/annotations": { body: {} },
		});
		monte();
		await waitFor(() => expect(screen.getByText("lodash")).toBeDefined());

		fireEvent.click(screen.getByText("lodash"));
		const bouton = (
			await screen.findAllByRole("button", { name: /Faux positif/ })
		)[0] as HTMLElement;

		await waitFor(() => expect(bouton.className).toContain("bg-orange-500/20"));
	});

	test("la décision est visible avant la fin du rechargement", async () => {
		// Le refetch reconstruit tout l'agrégat serveur. Sans application locale
		// immédiate, le badge restait sur son ancien statut pendant l'aller-retour,
		// et le référent ne savait pas si son clic avait porté.
		mockFetch({
			...base,
			// Le rechargement traîne **et** renvoie encore l'ancien statut : seule la
			// mise à jour optimiste peut expliquer un changement à l'écran.
			"GET /api/cves": { body: [groupe()], delayMs: 300 },
			"POST /api/annotations": { body: {} },
		});
		monte();
		await waitFor(() => expect(screen.getByText("lodash")).toBeDefined(), {
			timeout: 2000,
		});

		fireEvent.click(screen.getByText("lodash"));
		const bouton = (
			await screen.findAllByRole("button", { name: /Faux positif/ })
		)[0] as HTMLElement;
		fireEvent.click(bouton);

		await waitFor(() => expect(bouton.className).toContain("bg-orange-500/20"));
	});

	test("la page se recadre quand la liste rétrécit", async () => {
		// Corollaire du retrait de `cves` des dépendances de la remise à zéro : la
		// pagination ne bouge plus toute seule, donc rien ne la ramenait dans les
		// bornes si la liste raccourcissait. La page s'affichait alors vide, ce qui
		// se lit comme « plus rien à traiter » — la conclusion la plus dangereuse
		// qu'un écran de triage puisse donner.
		//
		// 25 groupes, 10 par page : trois pages. On se place sur la troisième.
		mockFetch({ ...base, "GET /api/cves": beaucoup(25) });
		monte();
		await waitFor(() => expect(screen.getByText(/Affichage de/)).toBeDefined());

		const suivant = () =>
			screen
				.getAllByRole("button")
				.filter((b) => b.textContent === "" && !b.hasAttribute("disabled"))
				.at(-1) as HTMLElement;
		fireEvent.click(suivant());
		fireEvent.click(suivant());
		await waitFor(() =>
			expect(screen.getByText(/Affichage de/).textContent).toContain("21"),
		);

		// Le rechargement suivant n'en renvoie plus que 11 : deux pages. La
		// troisième n'existe plus.
		mockFetch({
			...base,
			"GET /api/cves": beaucoup(11),
			"POST /api/annotations": { body: {} },
		});
		fireEvent.click(screen.getAllByText(/^pkg-2[0-4]$/)[0] as HTMLElement);
		fireEvent.click(
			(
				await screen.findAllByRole("button", { name: /Faux positif/ })
			)[0] as HTMLElement,
		);

		// Sans recadrage, la tranche `slice(20, 30)` de 11 éléments est **vide** :
		// aucune ligne rendue, alors que le pied annonce toujours « 11 sur 11 » —
		// les deux se contredisent. On assert donc sur les lignes, pas sur le pied.
		await waitFor(() => expect(screen.getByText("pkg-10")).toBeDefined());
	});
});
