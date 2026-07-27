import { getDb } from "../../db";
import { getSetting } from "../../db/settings";
import type { ProjectTool } from "../../db/projects";
import { normSeverity } from "../parsers/utils";
import { emitConsoleStart, emitConsoleEnd } from "../console";

const GHSA_REGEX = /(GHSA-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4})/i;
const CVE_REGEX = /(CVE-\d{4}-\d{4,})/i;

export interface AdvisoryKey {
  kind: "ghsa" | "cve";
  id: string;
}

export function keyFrom(cve?: string | null, link?: string | null): AdvisoryKey | null {
  if (link) {
    const match = link.match(GHSA_REGEX);
    if (match) return { kind: "ghsa", id: match[1]!.toUpperCase() };
  }
  if (cve) {
    const matchGH = cve.match(GHSA_REGEX);
    if (matchGH) return { kind: "ghsa", id: matchGH[1]!.toUpperCase() };
    
    const matchCVE = cve.match(CVE_REGEX);
    if (matchCVE) return { kind: "cve", id: matchCVE[1]!.toUpperCase() };
  }
  return null;
}

export interface CachedAdvisory {
  severity: string;
  fixes: Record<string, string | null>;
  html_url?: string | null;
  cvss_vector?: string | null;
}

export function getCachedAdvisory(id: string): CachedAdvisory | null {
  const db = getDb();
  const row = db.query(`SELECT severity, fixes, html_url, cvss_vector FROM advisory_cache WHERE id = ?`).get(id) as any;
  if (!row) return null;
  return {
    severity: row.severity,
    fixes: typeof row.fixes === 'string' ? JSON.parse(row.fixes) : (row.fixes || {}),
    html_url: row.html_url,
    cvss_vector: row.cvss_vector
  };
}

export function putCachedAdvisory(id: string, severity: string, fixes: Record<string, string | null>, html_url?: string | null, cvss_vector?: string | null) {
  const db = getDb();
  db.query(`
    INSERT INTO advisory_cache (id, severity, fixes, html_url, cvss_vector, fetched_at)
    VALUES ($id, $severity, $fixes, $html_url, $cvss_vector, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      severity = excluded.severity,
      fixes = excluded.fixes,
      html_url = excluded.html_url,
      cvss_vector = excluded.cvss_vector,
      fetched_at = CURRENT_TIMESTAMP
  `).run({
    $id: id,
    $severity: severity,
    $fixes: JSON.stringify(fixes),
    $html_url: html_url || null,
    $cvss_vector: cvss_vector || null
  });
}

function mapEcosystem(tool: ProjectTool): string {
  return tool === "composer" ? "composer" : "npm";
}

export interface ResolveResult {
  fixedIn: string | null;
  rateLimited: boolean;
  resolvable: boolean;
  severity: string;
  html_url?: string | null;
  cvss_vector?: string | null;
}

async function fetchAdvisory(key: AdvisoryKey): Promise<{ advisory: CachedAdvisory | null, rateLimited: boolean }> {
  let url = `https://api.github.com/advisories/${key.id}`;
  if (key.kind === "cve") {
    url = `https://api.github.com/advisories?cve_id=${key.id}`;
  }

  const headers: Record<string, string> = {
    "accept": "application/vnd.github+json",
    "user-agent": "audit-aggregator",
    "x-github-api-version": "2022-11-28"
  };

  const token = getSetting("GITHUB_TOKEN", process.env.GITHUB_TOKEN);
  if (token) {
    headers["authorization"] = `Bearer ${token}`;
  }

  const startTime = Date.now();
  const eventId = emitConsoleStart({ cmd: `GET advisories ${key.id}`, cwd: url, label: "github" });

  try {
    const res = await fetch(url, { headers });
    const exitCode = res.status;
    
    if (res.status === 429 || (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0")) {
      emitConsoleEnd(eventId, { exitCode, ms: Date.now() - startTime });
      return { advisory: null, rateLimited: true };
    }
    
    if (!res.ok) {
      emitConsoleEnd(eventId, { exitCode, ms: Date.now() - startTime });
      return { advisory: null, rateLimited: false };
    }

    let data = await res.json();
    emitConsoleEnd(eventId, { exitCode, ms: Date.now() - startTime });

    if (key.kind === "cve" && Array.isArray(data)) {
      if (data.length === 0) return { advisory: null, rateLimited: false };
      data = data[0];
    }

    const severity = normSeverity(data.severity);
    const fixes: Record<string, string | null> = {};

    if (Array.isArray(data.vulnerabilities)) {
      for (const v of data.vulnerabilities) {
        if (v.package && v.package.ecosystem && v.package.name) {
          // GitHub API returns "npm" or "Packagist". We map Composer to composer/packagist logic if needed
          let eco = v.package.ecosystem.toLowerCase();
          if (eco === "packagist") eco = "composer"; // normalization to match our mapEcosystem
          
          const k = `${eco}:${v.package.name}`;
          fixes[k] = v.first_patched_version ? v.first_patched_version.trim() : null;
        }
      }
    }

    const html_url = data.html_url || null;
    const cvss_vector = data.cvss?.vector_string || null;

    return { advisory: { severity, fixes, html_url, cvss_vector }, rateLimited: false };
  } catch (e) {
    emitConsoleEnd(eventId, { exitCode: 0, ms: Date.now() - startTime });
    return { advisory: null, rateLimited: false };
  }
}

export async function resolveFixedVersion(params: { tool: ProjectTool, package: string, cve?: string | null, link?: string | null }): Promise<ResolveResult> {
  const key = keyFrom(params.cve, params.link);
  
  if (!key) {
    return { fixedIn: null, rateLimited: false, resolvable: false, severity: "unknown" };
  }

  const cached = getCachedAdvisory(key.id);
  if (cached) {
    const ecoKey = `${mapEcosystem(params.tool)}:${params.package}`;
    return {
      fixedIn: cached.fixes[ecoKey] || null,
      rateLimited: false,
      resolvable: true,
      severity: cached.severity,
      html_url: cached.html_url,
      cvss_vector: cached.cvss_vector
    };
  }

  const res = await fetchAdvisory(key);
  const ecoKey = `${mapEcosystem(params.tool)}:${params.package}`;
  
  if (res.rateLimited) {
    return { fixedIn: null, rateLimited: true, resolvable: true, severity: "unknown" };
  }

  if (res.advisory) {
    putCachedAdvisory(key.id, res.advisory.severity, res.advisory.fixes, res.advisory.html_url, res.advisory.cvss_vector);
    
    return {
      fixedIn: res.advisory.fixes[ecoKey] || null,
      rateLimited: false,
      resolvable: true,
      severity: res.advisory.severity,
      html_url: res.advisory.html_url,
      cvss_vector: res.advisory.cvss_vector
    };
  }

  return { fixedIn: null, rateLimited: false, resolvable: true, severity: "unknown" };
}
