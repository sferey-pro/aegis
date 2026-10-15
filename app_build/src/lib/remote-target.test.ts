import { describe, expect, test } from "bun:test";
import { getRemoteTargetInfo } from "./remote-target";

describe("lib/remote-target — getRemoteTargetInfo", () => {
	test("identifie un déploiement à partir d'une URL contenant env:", () => {
		const info = getRemoteTargetInfo(
			"https://raw.githubusercontent.com/org/repo/env:production/package-lock.json",
			null,
		);
		expect(info.isDeployment).toBe(true);
		expect(info.targetName).toBe("production");
		expect(info.typeLabel).toBe("Déploiement");
	});

	test("identifie un déploiement avec refs/heads/env:", () => {
		const info = getRemoteTargetInfo(
			"https://raw.githubusercontent.com/org/repo/refs/heads/env:preprod/bun.lock",
			null,
		);
		expect(info.isDeployment).toBe(true);
		expect(info.targetName).toBe("preprod");
		expect(info.typeLabel).toBe("Déploiement");
	});

	test("identifie un déploiement à partir de gitBranch se terminant par (Active)", () => {
		const info = getRemoteTargetInfo(
			"https://raw.githubusercontent.com/org/repo/env:staging/bun.lock",
			"staging (Active)",
		);
		expect(info.isDeployment).toBe(true);
		expect(info.targetName).toBe("staging");
		expect(info.typeLabel).toBe("Déploiement");
	});

	test("identifie une branche standard à partir de l'URL", () => {
		const info = getRemoteTargetInfo(
			"https://raw.githubusercontent.com/org/repo/main/bun.lock",
			null,
		);
		expect(info.isDeployment).toBe(false);
		expect(info.targetName).toBe("main");
		expect(info.typeLabel).toBe("Branche");
	});

	test("identifie une branche standard avec refs/heads/", () => {
		const info = getRemoteTargetInfo(
			"https://raw.githubusercontent.com/org/repo/refs/heads/feature-1/package-lock.json",
			"feature-1",
		);
		expect(info.isDeployment).toBe(false);
		expect(info.targetName).toBe("feature-1");
		expect(info.typeLabel).toBe("Branche");
	});

	test("gère les cas sans URL ni branche sans planter", () => {
		const info = getRemoteTargetInfo(null, null);
		expect(info.isDeployment).toBe(false);
		expect(info.targetName).toBeNull();
		expect(info.typeLabel).toBe("Branche");
	});
});
