import { type Vulnerability, type ParseResult } from "./types";
import { normSeverity, buildParseResult } from "./utils";

export function parseNpm(output: string): ParseResult {
  let parsed: any;
  try {
    parsed = JSON.parse(output);
  } catch (e) {
    throw new Error(`Sortie JSON illisible (${(e as Error).message})`);
  }

  const rawVulns: Vulnerability[] = [];
  const vulnsMap = parsed?.vulnerabilities || {};

  for (const pkgName of Object.keys(vulnsMap)) {
    const v = vulnsMap[pkgName];
    if (!v || typeof v !== "object") continue;

    const severity = normSeverity(v.severity);
    const range = v.range || null;
    let fixedIn = null;
    
    if (v.fixAvailable && typeof v.fixAvailable === "object" && typeof v.fixAvailable.version === "string") {
      fixedIn = v.fixAvailable.version;
    }

    const via = Array.isArray(v.via) ? v.via : [];
    const advisories = via.filter((item: any) => typeof item === "object" && item !== null);
    const stringVias = via.filter((item: any) => typeof item === "string");

    if (advisories.length === 0) {
      // Cas A : Aucune advisory, juste une ou des dépendances parentes (transitives)
      const viaStr = stringVias.length > 0 ? stringVias.join(", ") : "dépendance transitive";
      rawVulns.push({
        package: v.name || pkgName,
        severity,
        title: `Dépendance vulnérable via ${viaStr}`,
        cve: null,
        link: null,
        versionRange: range,
        fixedIn
      });
    } else {
      // Cas B : Au moins une advisory présente dans `via`
      for (const a of advisories) {
        let cve: string | null = null;
        if (Array.isArray(a.cwe) && a.cwe.length > 0) {
          cve = a.cwe.join(", ");
        }

        rawVulns.push({
          package: v.name || pkgName,
          severity: normSeverity(a.severity || v.severity),
          title: a.title || "Advisory",
          cve,
          link: a.url || null,
          versionRange: a.range || range,
          fixedIn
        });
      }
    }
  }

  return buildParseResult(rawVulns);
}
