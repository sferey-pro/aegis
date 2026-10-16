export interface RemoteTargetInfo {
	isDeployment: boolean;
	targetName: string | null;
	typeLabel: "Déploiement" | "Branche";
}

/**
 * Détermine si un projet distant cible un environnement de déploiement GitHub (env:...)
 * ou une branche Git classique.
 */
export function getRemoteTargetInfo(
	remoteUrl?: string | null,
	gitBranch?: string | null,
): RemoteTargetInfo {
	if (typeof gitBranch === "string") {
		if (gitBranch.endsWith(" (Active)")) {
			const envName = gitBranch.replace(" (Active)", "").trim();
			return {
				isDeployment: true,
				targetName: envName,
				typeLabel: "Déploiement",
			};
		}
		if (gitBranch.startsWith("env:")) {
			const envName = gitBranch.replace("env:", "").trim();
			return {
				isDeployment: true,
				targetName: envName,
				typeLabel: "Déploiement",
			};
		}
	}

	if (remoteUrl) {
		try {
			if (remoteUrl.includes("/env:")) {
				const match = remoteUrl.match(/\/env:([^/?#]+)/);
				if (match?.[1]) {
					return {
						isDeployment: true,
						targetName: match[1],
						typeLabel: "Déploiement",
					};
				}
			}

			if (remoteUrl.startsWith("https://raw.githubusercontent.com/")) {
				const pathStr = remoteUrl.replace(
					"https://raw.githubusercontent.com/",
					"",
				);
				const parts = pathStr.split("/");
				const rest = parts.slice(2);
				let branchOrEnv = rest[0] || null;
				if (rest[0] === "refs" && rest[1] === "heads") {
					branchOrEnv = rest[2] || null;
				}

				if (branchOrEnv?.startsWith("env:")) {
					return {
						isDeployment: true,
						targetName: branchOrEnv.replace("env:", ""),
						typeLabel: "Déploiement",
					};
				}

				return {
					isDeployment: false,
					targetName:
						(typeof gitBranch === "string"
							? gitBranch.replace(" (Active)", "")
							: null) || branchOrEnv,
					typeLabel: "Branche",
				};
			}
		} catch {}
	}

	const cleanBranch =
		typeof gitBranch === "string" ? gitBranch.replace(" (Active)", "") : null;

	return {
		isDeployment: false,
		targetName: cleanBranch,
		typeLabel: "Branche",
	};
}
