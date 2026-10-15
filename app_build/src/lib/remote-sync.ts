import { existsSync } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { saveGitState } from "../db/git-state";
import { type Project, updateProject } from "../db/projects";
import { extractRepoRelativePath, extractToolDirectory } from "./audit";
import { emitConsoleEnd, emitConsoleStart } from "./console";
import { getAdapter } from "./project-adapters";

export async function syncRemoteProject(project: Project) {
	if (project.source_type !== "remote" || !project.remote_url) {
		throw new Error("Projet non distant ou URL manquante");
	}

	const baseDir = join(
		process.cwd(),
		process.cwd().endsWith("app_build") ? ".." : ".",
		".aegis_remote_projects",
	);
	const projectDir = join(baseDir, `project_${project.id}`);
	const { getSetting } = await import("../db/settings");
	const globalToken = getSetting(
		"REMOTE_TOKEN",
		process.env.REMOTE_TOKEN ?? "",
	);
	const token = project.remote_token || globalToken;

	const adapter = getAdapter(project);
	const gitInfo = await adapter.getGitInfo();

	let downloadUrl = project.remote_url;
	if (
		gitInfo.sha &&
		downloadUrl.startsWith("https://raw.githubusercontent.com/")
	) {
		const pathStr = downloadUrl.replace(
			"https://raw.githubusercontent.com/",
			"",
		);
		const parts = pathStr.split("/");

		let newParts: string[];
		if (parts.length > 4 && parts[2] === "refs" && parts[3] === "heads") {
			newParts = [
				parts[0] || "",
				parts[1] || "",
				gitInfo.sha || "",
				...parts.slice(5),
			];
		} else {
			newParts = [
				parts[0] || "",
				parts[1] || "",
				gitInfo.sha || "",
				...parts.slice(3),
			];
		}
		downloadUrl = `https://raw.githubusercontent.com/${newParts.join("/")}`;
	}

	let cmdString = `curl -H "Accept: application/vnd.github.v3.raw, */*"`;
	if (token) {
		cmdString += ` -H "Authorization: Bearer ***"`;
	}
	cmdString += ` ${downloadUrl}`;

	const consoleId = emitConsoleStart({
		cmd: cmdString,
		cwd: projectDir,
		label: "sync",
	});

	try {
		await mkdir(projectDir, { recursive: true });

		const headers: Record<string, string> = {
			// Demander explicitement le contenu brut si l'URL pointe vers l'API REST GitHub
			// (ex: https://api.github.com/repos/.../contents/package-lock.json)
			Accept:
				"application/vnd.github.raw+json, application/vnd.github.v3.raw, */*",
		};

		if (project.remote_url.includes("api.github.com")) {
			headers["X-GitHub-Api-Version"] = "2022-11-28";
		}

		if (token) {
			headers.Authorization = `Bearer ${token}`;
		}

		const toolsToSync =
			project.tools && project.tools.length > 0
				? project.tools
				: [project.tool];

		let baseUrl = downloadUrl;
		const matchEnding = baseUrl.match(
			/\/(bun\.lockb?|package-lock\.json|yarn\.lock|composer\.lock|composer\.json|package\.json)$/i,
		);
		if (matchEnding) {
			baseUrl = baseUrl.substring(0, baseUrl.lastIndexOf("/"));
		} else {
			baseUrl = baseUrl.replace(/\/+$/, "");
		}

		// Racine du dépôt GitHub (ex: https://raw.githubusercontent.com/owner/repo/sha-or-ref)
		let repoBaseUrl: string | null = null;
		if (downloadUrl.startsWith("https://raw.githubusercontent.com/")) {
			const afterPrefix = downloadUrl.replace(
				"https://raw.githubusercontent.com/",
				"",
			);
			const parts = afterPrefix.split("/");
			if (parts.length >= 3) {
				repoBaseUrl = `https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/${parts[2]}`;
			}
		}

		for (const currentTool of toolsToSync) {
			let filename = "package-lock.json";
			if (currentTool === "yarn") {
				filename = "yarn.lock";
			} else if (currentTool === "bun") {
				filename = downloadUrl.toLowerCase().includes("bun.lockb")
					? "bun.lockb"
					: "bun.lock";
			} else if (currentTool === "composer") {
				filename = "composer.lock";
			} else {
				filename = "package-lock.json";
			}

			const toolConfigPath = project.tool_paths?.[currentTool]?.trim();
			let currentLockUrl = downloadUrl;
			let subDir = "";

			if (toolConfigPath) {
				const repoRelative = extractRepoRelativePath(toolConfigPath);
				subDir = extractToolDirectory(toolConfigPath);

				if (
					toolConfigPath.startsWith("http://") ||
					toolConfigPath.startsWith("https://")
				) {
					let sameRepo = false;
					if (
						repoBaseUrl &&
						toolConfigPath.startsWith("https://raw.githubusercontent.com/")
					) {
						const currentParts = toolConfigPath
							.replace("https://raw.githubusercontent.com/", "")
							.split("/");
						const baseParts = repoBaseUrl
							.replace("https://raw.githubusercontent.com/", "")
							.split("/");
						if (
							currentParts[0] === baseParts[0] &&
							currentParts[1] === baseParts[1]
						) {
							sameRepo = true;
						}
					}

					if (sameRepo && repoBaseUrl && repoRelative) {
						currentLockUrl = `${repoBaseUrl}/${repoRelative}`;
					} else {
						currentLockUrl = toolConfigPath;
					}
				} else if (repoBaseUrl) {
					const cleanPath = toolConfigPath.replace(/^\/+/, "");
					if (
						cleanPath.endsWith(filename) ||
						cleanPath.endsWith(".lock") ||
						cleanPath.endsWith(".lockb") ||
						cleanPath.endsWith(".json")
					) {
						currentLockUrl = `${repoBaseUrl}/${cleanPath}`;
					} else {
						currentLockUrl = `${repoBaseUrl}/${cleanPath}/${filename}`;
					}
				} else {
					currentLockUrl = `${baseUrl}/${toolConfigPath.replace(/^\/+/, "")}`;
				}
			} else {
				if (
					currentTool !== project.tool ||
					!downloadUrl.toLowerCase().endsWith(filename.toLowerCase())
				) {
					currentLockUrl = `${baseUrl}/${filename}`;
				}
				subDir = extractToolDirectory(project.audit_path);
			}

			let res = await fetch(currentLockUrl, { headers });
			// Pour bun, si bun.lock échoue en 404, tenter bun.lockb (ou inversement)
			if (!res.ok && currentTool === "bun") {
				const fallbackFilename =
					filename === "bun.lock" ? "bun.lockb" : "bun.lock";
				const fallbackUrl = currentLockUrl.includes(filename)
					? currentLockUrl.replace(filename, fallbackFilename)
					: `${baseUrl}/${fallbackFilename}`;
				const fallbackRes = await fetch(fallbackUrl, { headers });
				if (fallbackRes.ok) {
					res = fallbackRes;
					filename = fallbackFilename;
					currentLockUrl = fallbackUrl;
				}
			}

			if (!res.ok) {
				throw new Error(`Erreur réseau: ${res.status} ${res.statusText}`);
			}
			const content = await res.arrayBuffer();

			const destDir = subDir ? join(projectDir, subDir) : projectDir;
			await mkdir(destDir, { recursive: true });

			const filePath = join(destDir, filename);
			await Bun.write(filePath, content);
			if (destDir !== projectDir) {
				const rootFilePath = join(projectDir, filename);
				if (!existsSync(rootFilePath)) {
					await Bun.write(rootFilePath, content);
				}
			}

			// Nettoyer l'autre lockfile Bun éventuel pour éviter les conflits dans le dossier
			if (currentTool === "bun") {
				const otherLockfile =
					filename === "bun.lock" ? "bun.lockb" : "bun.lock";
				try {
					await unlink(join(destDir, otherLockfile));
				} catch {}
				if (destDir !== projectDir) {
					try {
						await unlink(join(projectDir, otherLockfile));
					} catch {}
				}
			}

			// Fetch actual manifest instead of dummy
			const manifestName =
				currentTool === "composer" ? "composer.json" : "package.json";
			let manifestUrl = currentLockUrl;
			if (manifestUrl.includes(filename)) {
				manifestUrl = manifestUrl.replace(filename, manifestName);
			} else {
				manifestUrl = `${currentLockUrl.substring(0, currentLockUrl.lastIndexOf("/"))}/${manifestName}`;
			}

			try {
				if (manifestUrl !== currentLockUrl) {
					const mRes = await fetch(manifestUrl, { headers });
					if (mRes.ok) {
						const mContent = await mRes.arrayBuffer();
						await Bun.write(join(destDir, manifestName), mContent);
						if (
							destDir !== projectDir &&
							!existsSync(join(projectDir, manifestName))
						) {
							await Bun.write(join(projectDir, manifestName), mContent);
						}
					} else {
						await Bun.write(join(destDir, manifestName), "{}");
						if (
							destDir !== projectDir &&
							!existsSync(join(projectDir, manifestName))
						) {
							await Bun.write(join(projectDir, manifestName), "{}");
						}
					}
				} else {
					await Bun.write(join(destDir, manifestName), "{}");
					if (
						destDir !== projectDir &&
						!existsSync(join(projectDir, manifestName))
					) {
						await Bun.write(join(projectDir, manifestName), "{}");
					}
				}
			} catch (_e) {
				await Bun.write(join(destDir, manifestName), "{}");
				if (
					destDir !== projectDir &&
					!existsSync(join(projectDir, manifestName))
				) {
					await Bun.write(join(projectDir, manifestName), "{}");
				}
			}
		}

		// Update the project path to point to this new local directory
		if (project.path !== projectDir) {
			updateProject(project.id, { path: projectDir });
		}

		// Save the fetched git state (branch and active sha)
		saveGitState(project.id, gitInfo);

		emitConsoleEnd(consoleId, {
			ok: true,
			exitCode: 0,
			outText: "Fichier lock téléchargé avec succès.",
		});
		return { success: true, message: "Fichier lock téléchargé avec succès." };
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		emitConsoleEnd(consoleId, { ok: false, exitCode: 1, errorText: msg });
		throw error;
	}
}
