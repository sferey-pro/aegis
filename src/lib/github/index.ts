import { getDb } from "../../db";
import type { ProjectTool } from "../../db/projects";
import { normSeverity } from "../parsers/utils";

const GHSA_REGEX = /(GHSA-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4})/i;
const CVE_REGEX = /(CVE-\d{4}-\d{4,})/i;

export interface AdvisoryKey {
  kind: "ghsa" | "cve";
  id: string;
}

export function keyFrom(cve?: string | null, link?: string | null): AdvisoryKey | null {
  if (link) {
    const match = link.match(GHSA_REGEX);
    if (match) return { kind: "ghsa", id: match[1].toUpperCase() };
  }
  if (cve) {
    const matchGH = cve.match(GHSA_REGEX);
    if (matchGH) return { kind: "ghsa", id: matchGH[1].toUpperCase() };
    
    const matchCVE = cve.match(CVE_REGEX);
    if (matchCVE) return { kind: "cve", id: matchCVE[1].toUpperCase() };
  }
  return null;
}

export interface CachedAdvisory {
  severity: string;
  fixes: Record<string, string | null>;
}

export function getCachedAdvisory(id: string): CachedAdvisory | null {
  const db = getDb();
  const row = db.query(`SELECT severity, fixes FROM advisory_cache WHERE id = ?`).get(id) as any;
  if (!row) return null;
  return {
    severity: row.severity,
    fixes: typeof row.fixes === 'string' ? JSON.parse(row.fixes) : (row.fixes || {})
  };
}

export function putCachedAdvisory(id: string, severity: string, fixes: Record<string, string | null>) {
  const db = getDb();
  db.query(`
    INSERT INTO advisory_cache (id, severity, fixes, fetched_at)
    VALUES ($id, $severity, $fixes, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      severity = excluded.severity,
      fixes = excluded.fixes,
      fetched_at = CURRENT_TIMESTAMP
  `).run({
    $id: id,
    $severity: severity,
    $fixes: JSON.stringify(fixes)
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

  if (process.env.GITHUB_TOKEN) {
    headers["authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  try {
    const res = await fetch(url, { headers });
    
    if (res.status === 429 || (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0")) {
      return { advisory: null, rateLimited: true };
    }
    
    if (!res.ok) {
      return { advisory: null, rateLimited: false };
    }

    let data = await res.json();
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

    return { advisory: { severity, fixes }, rateLimited: false };
  } catch (e) {
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
      severity: cached.severity
    };
  }

  const { advisory, rateLimited } = await fetchAdvisory(key);
  
  if (rateLimited) {
    return { fixedIn: null, rateLimited: true, resolvable: true, severity: "unknown" };
  }

  if (advisory) {
    putCachedAdvisory(key.id, advisory.severity, advisory.fixes);
    const ecoKey = `${mapEcosystem(params.tool)}:${params.package}`;
    return {
      fixedIn: advisory.fixes[ecoKey] || null,
      rateLimited: false,
      resolvable: true,
      severity: advisory.severity
    };
  }

  return { fixedIn: null, rateLimited: false, resolvable: true, severity: "unknown" };
}
