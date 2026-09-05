import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { type Project, updateProject } from "../db/projects";
import { getGitInfo } from "./git";
import { saveGitState } from "../db/git-state";

export async function syncRemoteProject(project: Project) {
	if (project.source_type !== "remote" || !project.remote_url) {
		throw new Error("Projet non distant ou URL manquante");
	}

	const allowedRootsStr = process.env.AEGIS_ALLOWED_ROOTS;
	if (!allowedRootsStr) {
		throw new Error("AEGIS_ALLOWED_ROOTS n'est pas défini. Impossible de déterminer où stocker les fichiers distants.");
	}
	const firstRoot = allowedRootsStr.split(",")[0]?.trim() || "";
	const baseDir = join(firstRoot, ".aegis_remote_projects");
	const projectDir = join(baseDir, `project_${project.id}`);
	await mkdir(projectDir, { recursive: true });

	const res = await fetch(project.remote_url);
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

	// Update the project path to point to this new local directory
	if (project.path !== projectDir) {
		updateProject(project.id, { path: projectDir });
	}

	// Fake a git state update to reflect the "fetch" success
	const git = await getGitInfo(projectDir);
	saveGitState(project.id, git);

	return { success: true, message: "Fichier lock téléchargé avec succès." };
}
