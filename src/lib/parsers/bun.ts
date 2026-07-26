import { type Vulnerability, type ParseResult } from "./types";
import { normSeverity, buildParseResult } from "./utils";

export function parseBun(output: string): ParseResult {
  let jsonStr = output;
  const firstBrace = output.indexOf('{');
  if (firstBrace > 0) {
    jsonStr = output.substring(firstBrace);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Sortie JSON illisible (${(e as Error).message})`);
  }

  const rawVulns: Vulnerability[] = [];

  for (const pkgName of Object.keys(parsed)) {
    const advisories = parsed[pkgName];
    if (!Array.isArray(advisories)) continue;

    for (const adv of advisories) {
      if (!adv || typeof adv !== "object") continue;

      let cve: string | null = null;
      if (Array.isArray(adv.cwe) && adv.cwe.length > 0) {
        cve = adv.cwe.join(", ");
      }

      rawVulns.push({
        package: pkgName,
        severity: normSeverity(adv.severity),
        title: adv.title || "Advisory",
        cve,
        link: adv.url || null,
        versionRange: adv.vulnerable_versions || null
      });
    }
  }

  return buildParseResult(rawVulns);
}
