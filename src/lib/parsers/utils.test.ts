import { expect, test, describe } from "bun:test";
import { normSeverity, dedupe, sortVulnerabilities, buildParseResult } from "./utils";
import type { Vulnerability } from "./types";

describe("Parser Utils", () => {
  test("normSeverity handles known and unknown values", () => {
    expect(normSeverity("critical")).toBe("critical");
    expect(normSeverity("high")).toBe("high");
    expect(normSeverity("MEDIUM")).toBe("moderate");
    expect(normSeverity("informational")).toBe("info");
    expect(normSeverity("random")).toBe("unknown");
    expect(normSeverity(null)).toBe("unknown");
    expect(normSeverity("")).toBe("unknown");
  });

  test("dedupe removes duplicates based on package|title|cve", () => {
    const vulns: Vulnerability[] = [
      { package: "A", title: "Bug", cve: "CVE-1", severity: "high", link: null, versionRange: null },
      { package: "A", title: "Bug", cve: "CVE-1", severity: "low", link: "different", versionRange: null }, // Duplicate
      { package: "A", title: "Bug", cve: "CVE-2", severity: "high", link: null, versionRange: null }, // Different CVE
    ];
    
    const res = dedupe(vulns);
    expect(res.length).toBe(2);
    expect(res[0]!.cve).toBe("CVE-1");
    expect(res[0]!.severity).toBe("high"); // Kept first occurrence
    expect(res[1]!.cve).toBe("CVE-2");
  });

  test("sortVulnerabilities sorts by severity correctly", () => {
    const vulns: Vulnerability[] = [
      { package: "1", title: "", cve: null, severity: "unknown", link: null, versionRange: null },
      { package: "2", title: "", cve: null, severity: "critical", link: null, versionRange: null },
      { package: "3", title: "", cve: null, severity: "moderate", link: null, versionRange: null },
    ];
    
    const sorted = sortVulnerabilities(vulns);
    expect(sorted[0]!.severity).toBe("critical");
    expect(sorted[1]!.severity).toBe("moderate");
    expect(sorted[2]!.severity).toBe("unknown");
  });

  test("buildParseResult composes dedupe, sort, and count", () => {
    const vulns: Vulnerability[] = [
      { package: "A", title: "T1", cve: null, severity: "high", link: null, versionRange: null },
      { package: "B", title: "T2", cve: null, severity: "low", link: null, versionRange: null },
      { package: "A", title: "T1", cve: null, severity: "high", link: null, versionRange: null }, // dup
    ];
    
    const res = buildParseResult(vulns);
    expect(res.total).toBe(2);
    expect(res.counts.high).toBe(1);
    expect(res.counts.low).toBe(1);
    expect(res.counts.critical).toBe(0);
    expect(res.vulnerabilities[0]!.package).toBe("A"); // high comes before low
  });
});
