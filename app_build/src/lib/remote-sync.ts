import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { saveGitState } from "../db/git-state";
import { type Project, updateProject } from "../db/projects";
import { emitConsoleEnd, emitConsoleStart } from "./console";

export async function syncRemoteProject(project: Project) {
	if (project.source_type !== "remote" || !project.remote_url) {
		throw new Error("Projet non distant ou URL manquante");
	}

	const baseDir = join(process.cwd(), process.cwd().endsWith("app_build") ? ".." : ".", ".aegis_remote_projects");
	const projectDir = join(baseDir, `project_${project.id}`);
	const { getSetting } = await import("../db/settings");
	const globalToken = getSetting(
		"REMOTE_TOKEN",
		process.env.REMOTE_TOKEN ?? "",
	);
	const token = project.remote_token || globalToken;

	let cmdString = `curl -H "Accept: application/vnd.github.v3.raw, */*"`;
	if (token) {
		cmdString += ` -H "Authorization: Bearer ***"`;
	}
	cmdString += ` ${project.remote_url}`;

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

		const res = await fetch(project.remote_url, { headers });
		if (!res.ok) {
			throw new Error(`Erreur réseau: ${res.status} ${res.statusText}`);
		}
		const content = await res.arrayBuffer();

		// Deduce filename from URL or project tool
		let filename = "package-lock.json";
		if (project.tool === "yarn") filename = "yarn.lock";
		if (project.tool === "bun") filename = "bun.lockb";
		if (project.tool === "composer") filename = "composer.lock";

		const filePath = join(projectDir, filename);
		await Bun.write(filePath, content);

		// Create dummy manifest files so that audit tools (like composer or npm) don't crash
		// complaining about missing composer.json or package.json
		const manifestName = project.tool === "composer" ? "composer.json" : "package.json";
		await Bun.write(join(projectDir, manifestName), "{}");

		// Update the project path to point to this new local directory
		if (project.path !== projectDir) {
			updateProject(project.id, { path: projectDir });
		}

		// Fake a git state update to reflect the "fetch" success
		const git = {
			isRepo: false,
			branch: null,
			sha: null,
			upstream: null,
			ahead: 0,
			behind: 0,
			dirty: false,
		};
		saveGitState(project.id, git);

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
