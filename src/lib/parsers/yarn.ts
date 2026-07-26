import { type Vulnerability, type ParseResult } from "./types";
import { normSeverity, buildParseResult } from "./utils";

export function parseYarn(output: string): ParseResult {
  const lines = output.split('\n');
  const rawVulns: Vulnerability[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    let parsed: any;
    try {
      parsed = JSON.parse(line);
    } catch (e) {
      // NDJSON yarns tolère le bruit (lignes non-json ignorées silencieusement)
      continue;
    }

    if (parsed.type === "auditAdvisory" && parsed.data && parsed.data.advisory) {
      const adv = parsed.data.advisory;
      
      let cve: string | null = null;
      if (Array.isArray(adv.cves) && adv.cves.length > 0) {
        cve = adv.cves.join(", ");
      }

      rawVulns.push({
        package: adv.module_name || "?",
        severity: normSeverity(adv.severity),
        title: adv.title || "Advisory",
        cve,
        link: adv.url || null,
        versionRange: adv.vulnerable_versions || null,
        fixedIn: adv.patched_versions || null
      });
    }
  }

  return buildParseResult(rawVulns);
}
