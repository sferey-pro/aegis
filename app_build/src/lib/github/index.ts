import {
	getAdvisoryDb,
	getGithubConfig,
	setGithubConfig,
} from "../../db/advisories";
import type { ProjectTool } from "../../db/projects";
import { emitConsoleEnd, emitConsoleStart } from "../console";
import type { Severity } from "../parsers/types";
import { normSeverity } from "../parsers/utils";
import { errorMessage } from "../utils";

const GHSA_REGEX = /(GHSA-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4})/i;
const CVE_REGEX = /(CVE-\d{4}-\d{4,})/i;

export interface AdvisoryKey {
	kind: "ghsa" | "cve";
	id: string;
}

export function keyFrom(
	cve?: string | null,
	link?: string | null,
): AdvisoryKey | null {
	if (link) {
		const match = link.match(GHSA_REGEX);
		if (match?.[1]) return { kind: "ghsa", id: match[1].toUpperCase() };
	}
	if (cve) {
		const matchGH = cve.match(GHSA_REGEX);
		if (matchGH?.[1]) return { kind: "ghsa", id: matchGH[1].toUpperCase() };

		const matchCVE = cve.match(CVE_REGEX);
		if (matchCVE?.[1]) return { kind: "cve", id: matchCVE[1].toUpperCase() };
	}
	return null;
}

export interface CachedAdvisory {
	severity: Severity;
	fixes: Record<
		string,
		Array<{ range: string; patched: string | null }> | string | null
	>;
	html_url?: string | null;
	cvss_vector?: string | null;
	published_at?: string | null;
}

/** Ligne `advisory_cache` brute : `fixes` est du JSON en chaîne. */
type AdvisoryCacheRow = {
	severity: string | null;
	fixes: string | null;
	html_url: string | null;
	cvss_vector: string | null;
	published_at: string | null;
};

export function getCachedAdvisory(id: string): CachedAdvisory | null {
	const db = getAdvisoryDb();
	const row = db
		.query(
			`SELECT severity, fixes, html_url, cvss_vector, published_at FROM advisory_cache WHERE id = ?`,
		)
		.get(id) as AdvisoryCacheRow | null;
	if (!row) return null;
	return {
		// Une ligne de cache corrompue ne doit pas propager une sévérité arbitraire.
		severity: normSeverity(row.severity),
		fixes:
			typeof row.fixes === "string" ? JSON.parse(row.fixes) : row.fixes || {},
		html_url: row.html_url,
		cvss_vector: row.cvss_vector,
		published_at: row.published_at,
	};
}

/**
 * Tous les avis en cache, indexés par identifiant.
 *
 * **Une seule requête**, pas une par vulnérabilité : l'agrégateur superpose ces
 * données à chaque vulnérabilité de chaque run, et une lecture par ligne aurait
 * ajouté un N+1 au chemin le plus chaud de l'application.
 */
export function getAllCachedAdvisories(): Map<string, CachedAdvisory> {
	const rows = getAdvisoryDb()
		.query(
			`SELECT id, severity, fixes, html_url, cvss_vector, published_at FROM advisory_cache`,
		)
		.all() as (AdvisoryCacheRow & { id: string })[];

	const map = new Map<string, CachedAdvisory>();
	for (const row of rows) {
		map.set(row.id, {
			severity: normSeverity(row.severity),
			fixes:
				typeof row.fixes === "string" ? JSON.parse(row.fixes) : row.fixes || {},
			html_url: row.html_url,
			cvss_vector: row.cvss_vector,
			published_at: row.published_at,
		});
	}
	return map;
}

export function putCachedAdvisory(
	id: string,
	severity: Severity,
	fixes: Record<string, unknown>,
	html_url?: string | null,
	cvss_vector?: string | null,
	published_at?: string | null,
) {
	const db = getAdvisoryDb();
	db.query(`
    INSERT INTO advisory_cache (id, severity, fixes, html_url, cvss_vector, published_at, fetched_at)
    VALUES ($id, $severity, $fixes, $html_url, $cvss_vector, $published_at, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      severity = excluded.severity,
      fixes = excluded.fixes,
      html_url = excluded.html_url,
      cvss_vector = excluded.cvss_vector,
      published_at = excluded.published_at,
      fetched_at = CURRENT_TIMESTAMP
  `).run({
		$id: id,
		$severity: severity,
		$fixes: JSON.stringify(fixes),
		$html_url: html_url || null,
		$cvss_vector: cvss_vector || null,
		$published_at: published_at || null,
	});
}

function mapEcosystem(tool: ProjectTool): string {
	return tool === "composer" ? "composer" : "npm";
}

export interface ResolveResult {
	fixedIn: string | null;
	rateLimited: boolean;
	resolvable: boolean;
	severity: Severity;
	html_url?: string | null;
	cvss_vector?: string | null;
	published_at?: string | null;
}

/**
 * Un appel réseau, un avis. Exporté pour l'enrichissement en masse, qui a besoin
 * de distinguer « aucun avis chez GitHub » de « quota épuisé » : la première
 * réponse est définitive, la seconde doit interrompre la boucle au lieu de
 * brûler le reste des clés en 403.
 */
export async function fetchAdvisory(
	key: AdvisoryKey,
): Promise<{ advisory: CachedAdvisory | null; rateLimited: boolean }> {
	let url = `https://api.github.com/advisories/${key.id}`;
	if (key.kind === "cve") {
		url = `https://api.github.com/advisories?cve_id=${key.id}`;
	}

	const headers: Record<string, string> = {
		accept: "application/vnd.github+json",
		"user-agent": "audit-aggregator",
		"x-github-api-version": "2022-11-28",
	};

	const token = getGithubConfig("GITHUB_TOKEN", process.env.GITHUB_TOKEN ?? "");
	if (token) {
		headers.authorization = `Bearer ${token}`;
	}

	const startTime = Date.now();
	const eventId = emitConsoleStart({
		cmd: `GET advisories ${key.id}`,
		cwd: url,
		label: "github",
	});

	try {
		const res = await fetch(url, { headers });
		const exitCode = res.status;
		const limit = res.headers.get("x-ratelimit-limit");
		const remaining = res.headers.get("x-ratelimit-remaining");
		const reset = res.headers.get("x-ratelimit-reset");

		if (limit) {
			setGithubConfig("GITHUB_RL_LIMIT", limit);
			setGithubConfig("GITHUB_RL_REMAINING", remaining || "0");
			setGithubConfig("GITHUB_RL_RESET", reset || "0");
		}

		if (res.status === 429 || (res.status === 403 && remaining === "0")) {
			emitConsoleEnd(eventId, {
				exitCode,
				ok: false,
				ms: Date.now() - startTime,
			});
			return { advisory: null, rateLimited: true };
		}

		if (!res.ok) {
			emitConsoleEnd(eventId, {
				exitCode,
				ok: false,
				ms: Date.now() - startTime,
			});
			return { advisory: null, rateLimited: false };
		}

		let data = await res.json();
		emitConsoleEnd(eventId, {
			exitCode,
			ok: true,
			ms: Date.now() - startTime,
		});

		if (key.kind === "cve" && Array.isArray(data)) {
			if (data.length === 0) return { advisory: null, rateLimited: false };
			data = data[0];
		}

		const severity = normSeverity(data.severity);
		const fixes: Record<
			string,
			Array<{ range: string; patched: string | null }>
		> = {};

		if (Array.isArray(data.vulnerabilities)) {
			for (const v of data.vulnerabilities) {
				if (v.package?.ecosystem && v.package.name) {
					// GitHub API returns "npm" or "Packagist". We map Composer to composer/packagist logic if needed
					let eco = v.package.ecosystem.toLowerCase();
					if (eco === "packagist") eco = "composer"; // normalization to match our mapEcosystem

					const k = `${eco}:${v.package.name}`;
					if (!fixes[k]) fixes[k] = [];
					fixes[k].push({
						range: v.vulnerable_version_range || "",
						patched: v.first_patched_version
							? v.first_patched_version.trim()
							: null,
					});
				}
			}
		}

		const html_url = data.html_url || null;
		const cvss_vector = data.cvss?.vector_string || null;
		const published_at = data.published_at || null;

		return {
			advisory: { severity, fixes, html_url, cvss_vector, published_at },
			rateLimited: false,
		};
	} catch (e) {
		// L'échec réseau annonçait `exitCode: 0`, donc une **coche verte** : la
		// coupure la plus franche s'affichait comme un succès. Le message est
		// remonté, sinon la ligne n'explique rien.
		emitConsoleEnd(eventId, {
			ok: false,
			errorText: errorMessage(e),
			ms: Date.now() - startTime,
		});
		return { advisory: null, rateLimited: false };
	}
}

function matchBestFix(
	fixesList: CachedAdvisory["fixes"][string] | undefined,
	versionRange?: string | null,
	originalFixedIn?: string | null,
): string | null {
	if (!fixesList) return originalFixedIn || null;
	if (typeof fixesList === "string") return fixesList;
	if (!Array.isArray(fixesList) || fixesList.length === 0)
		return originalFixedIn || null;

	const [only] = fixesList;
	if (fixesList.length === 1 && only)
		return only.patched || originalFixedIn || null;

	if (versionRange) {
		const exact = fixesList.find((f) => f.range === versionRange);
		if (exact?.patched) return exact.patched;

		const majors = new Set(
			Array.from(versionRange.matchAll(/\b(\d+)\./g)).map((m) => m[1]),
		);
		for (const f of fixesList) {
			if (f.patched) {
				const patchMajor = f.patched.split(".")[0];
				if (majors.has(patchMajor)) return f.patched;
			}
		}
	}

	// Fallback: pick the first one or original
	return only?.patched || originalFixedIn || null;
}

/**
 * Résolution **hors ligne** : lit le cache d'avis, n'émet aucune requête.
 *
 * C'est ce que le chemin d'audit utilise (N1). CONTEXT.md §2 impose « aucun
 * appel réseau (GitHub) pendant l'audit » et §6 réserve l'interrogation de
 * l'API à la porte manuelle par CVE. Une requête par vulnérabilité sur le
 * chemin d'audit épuisait le quota au premier « Tout auditer », rendait la durée
 * d'un audit dépendante du réseau — verrou global tenu pendant ce temps — et
 * faisait dépendre le contenu d'un run de la disponibilité d'un tiers.
 *
 * En cas d'absence dans le cache, `originalFixedIn` est préservé : c'est la
 * valeur que `npm`/`yarn` avaient fournie, et l'écraser par `null` faisait lire
 * « aucune correction disponible » à tort (N18).
 */
/**
 * Version corrigée déduite d'un avis **déjà chargé**.
 *
 * Séparé de `resolveFixedVersionFromCache`, qui interroge le cache : l'agrégateur
 * a besoin de la même résolution pour chaque vulnérabilité de chaque run, et une
 * requête par ligne aurait ajouté un N+1 sur le chemin le plus chaud. Il charge
 * donc tous les avis d'un coup et appelle cette fonction.
 *
 * `originalFixedIn` est préservé quand l'avis ne couvre pas ce paquet : c'est la
 * valeur que `npm`/`yarn` avaient fournie, et l'écraser par `null` faisait lire
 * « aucune correction disponible » à tort (N18).
 */
export function fixedVersionFromAdvisory(params: {
	advisory: CachedAdvisory;
	tool: ProjectTool;
	package: string;
	versionRange?: string | null;
	originalFixedIn?: string | null;
}): string | null {
	const ecoKey = `${mapEcosystem(params.tool)}:${params.package}`;
	return matchBestFix(
		params.advisory.fixes[ecoKey],
		params.versionRange,
		params.originalFixedIn,
	);
}

export function resolveFixedVersionFromCache(params: {
	tool: ProjectTool;
	package: string;
	cve?: string | null;
	link?: string | null;
	versionRange?: string | null;
	originalFixedIn?: string | null;
}): ResolveResult {
	const repli: ResolveResult = {
		fixedIn: params.originalFixedIn || null,
		rateLimited: false,
		resolvable: false,
		severity: "unknown",
	};

	const key = keyFrom(params.cve, params.link);
	if (!key) return repli;

	const cached = getCachedAdvisory(key.id);
	// Avis inconnu du cache : résoluble en principe, mais pas ici et maintenant.
	if (!cached) return { ...repli, resolvable: true };

	return {
		fixedIn: fixedVersionFromAdvisory({ ...params, advisory: cached }),
		rateLimited: false,
		resolvable: true,
		severity: cached.severity,
		html_url: cached.html_url,
		cvss_vector: cached.cvss_vector,
		published_at: cached.published_at,
	};
}

export async function resolveFixedVersion(params: {
	tool: ProjectTool;
	package: string;
	cve?: string | null;
	link?: string | null;
	versionRange?: string | null;
	originalFixedIn?: string | null;
}): Promise<ResolveResult> {
	const key = keyFrom(params.cve, params.link);

	if (!key) {
		return {
			fixedIn: params.originalFixedIn || null,
			rateLimited: false,
			resolvable: false,
			severity: "unknown",
		};
	}

	const cached = getCachedAdvisory(key.id);
	if (cached) {
		const ecoKey = `${mapEcosystem(params.tool)}:${params.package}`;
		return {
			fixedIn: matchBestFix(
				cached.fixes[ecoKey],
				params.versionRange,
				params.originalFixedIn,
			),
			rateLimited: false,
			resolvable: true,
			severity: cached.severity,
			html_url: cached.html_url,
			cvss_vector: cached.cvss_vector,
			published_at: cached.published_at,
		};
	}

	const res = await fetchAdvisory(key);
	const ecoKey = `${mapEcosystem(params.tool)}:${params.package}`;

	if (res.rateLimited) {
		return {
			fixedIn: null,
			rateLimited: true,
			resolvable: true,
			severity: "unknown",
		};
	}

	if (res.advisory) {
		putCachedAdvisory(
			key.id,
			res.advisory.severity,
			res.advisory.fixes,
			res.advisory.html_url,
			res.advisory.cvss_vector,
			res.advisory.published_at,
		);

		return {
			fixedIn: matchBestFix(
				res.advisory.fixes[ecoKey],
				params.versionRange,
				params.originalFixedIn,
			),
			rateLimited: false,
			resolvable: true,
			severity: res.advisory.severity,
			html_url: res.advisory.html_url,
			cvss_vector: res.advisory.cvss_vector,
			published_at: res.advisory.published_at,
		};
	}

	return {
		fixedIn: null,
		rateLimited: false,
		resolvable: true,
		severity: "unknown",
	};
}

export async function syncAdvisory(
	cve?: string | null,
	link?: string | null,
): Promise<CachedAdvisory | null> {
	const key = keyFrom(cve, link);
	if (!key) return null;

	// **Aucune suppression préalable** (N44). La version précédente vidait la ligne
	// avant l'appel réseau : hors ligne, en quota dépassé ou sur un 5xx GitHub,
	// l'avis déjà connu — sévérité, correctifs par branche, vecteur CVSS, date de
	// publication — était définitivement perdu, et l'enrichissement repartait de
	// zéro au prochain audit. L'action « rafraîchir » dégradait donc l'état quand
	// elle échouait, c'est-à-dire précisément quand on ne le voulait pas.
	//
	// Le `DELETE` était de surcroît superflu : `putCachedAdvisory` écrit avec un
	// `ON CONFLICT` qui remplace la ligne existante.
	const { advisory } = await fetchAdvisory(key);
	if (advisory) {
		putCachedAdvisory(
			key.id,
			advisory.severity,
			advisory.fixes,
			advisory.html_url,
			advisory.cvss_vector,
			advisory.published_at,
		);
		return advisory;
	}
	return null;
}
