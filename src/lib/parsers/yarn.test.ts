import { expect, test, describe } from "bun:test";
import { parseYarn } from "./yarn";

describe("Parser: Yarn", () => {
  test("ignores invalid json lines silently", () => {
    const res = parseYarn("yarn audit v1.22.19\nnot json\n{}");
    expect(res.total).toBe(0);
  });

  test("parses a valid auditAdvisory", () => {
    const input = [
      JSON.stringify({ type: "info", data: "something" }), // ignored
      JSON.stringify({
        type: "auditAdvisory",
        data: {
          advisory: {
            module_name: "lodash",
            severity: "high",
            title: "Prototype Pollution",
            cves: ["CVE-2019-10744"],
            url: "https://github.com/advisories/GHSA-123",
            vulnerable_versions: "<4.17.12",
            patched_versions: ">=4.17.12"
          }
        }
      })
    ].join("\n");

    const res = parseYarn(input);
    expect(res.total).toBe(1);
    
    const vuln = res.vulnerabilities[0]!;
    expect(vuln.package).toBe("lodash");
    expect(vuln.severity).toBe("high");
    expect(vuln.title).toBe("Prototype Pollution");
    expect(vuln.cve).toBe("CVE-2019-10744");
    expect(vuln.link).toBe("https://github.com/advisories/GHSA-123");
    expect(vuln.versionRange).toBe("<4.17.12");
    expect(vuln.fixedIn).toBe(">=4.17.12");
  });
});
