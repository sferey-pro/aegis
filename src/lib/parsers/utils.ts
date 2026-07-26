import type { Severity, Vulnerability, ParseResult } from "./types";

export function normSeverity(sev: string | null | undefined): Severity {
  if (!sev) return "unknown";
  const s = sev.toLowerCase().trim();
  switch (s) {
    case "critical": return "critical";
    case "high": return "high";
    case "moderate":
    case "medium": return "moderate";
    case "low": return "low";
    case "info":
    case "informational": return "info";
    default: return "unknown";
  }
}

export function dedupe(vulns: Vulnerability[]): Vulnerability[] {
  const seen = new Set<string>();
  const result: Vulnerability[] = [];
  
  for (const v of vulns) {
    const key = `${v.package}|${v.title}|${v.cve ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(v);
    }
  }
  return result;
}

const SEV_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  moderate: 2,
  low: 3,
  info: 4,
  unknown: 5
};

export function sortVulnerabilities(vulns: Vulnerability[]): Vulnerability[] {
  return [...vulns].sort((a, b) => {
    return SEV_ORDER[a.severity] - SEV_ORDER[b.severity];
  });
}

export function emptyCounts(): Record<Severity, number> {
  return {
    critical: 0,
    high: 0,
    moderate: 0,
    low: 0,
    info: 0,
    unknown: 0
  };
}

export function buildParseResult(rawVulns: Vulnerability[]): ParseResult {
  const deduped = dedupe(rawVulns);
  const sorted = sortVulnerabilities(deduped);
  
  const counts = emptyCounts();
  for (const v of sorted) {
    counts[v.severity]++;
  }
  
  return {
    vulnerabilities: sorted,
    counts,
    total: sorted.length
  };
}
