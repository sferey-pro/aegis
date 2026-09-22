import { rm } from "node:fs/promises";
import { join } from "node:path";
import type {
	IngestProject,
	LocalProject,
	Project,
	RemoteProject,
} from "../../db/projects";
import { resolveAuditTarget } from "../audit/index";
import { type GitInfo, getGitInfo as realGetGitInfo } from "../git";
import { syncRemoteProject } from "../remote-sync";

export interface ProjectAdapter {
	prepare(): Promise<void>;
	getAuditCwd(): string;
	getGitInfo(): Promise<GitInfo>;
	destroy(): Promise<void>;
}

const mockGitInfo: GitInfo = {
	isRepo: false,
	branch: null,
	sha: null,
	upstream: null,
	ahead: 0,
	behind: 0,
	dirty: false,
};

class LocalAdapter implements ProjectAdapter {
	constructor(private project: LocalProject) {}

	async prepare(): Promise<void> {
		// Nothing to fetch
	}

	getAuditCwd(): string {
		return resolveAuditTarget(this.project.path, this.project.audit_path);
	}

	async getGitInfo(): Promise<GitInfo> {
		return realGetGitInfo(this.project.path);
	}

	async destroy(): Promise<void> {
		// Aegis does not delete user's local code.
	}
}

class RemoteAdapter implements ProjectAdapter {
	constructor(private project: RemoteProject) {}

	async prepare(): Promise<void> {
		await syncRemoteProject(this.project);
	}

	getAuditCwd(): string {
		return this.project.path;
	}

	async getGitInfo(): Promise<GitInfo> {
		return mockGitInfo;
	}

	async destroy(): Promise<void> {
		// The base cache directory
		const targetDir = join(
			process.cwd(),
			process.cwd().endsWith("app_build") ? ".." : ".",
			".aegis_remote_projects",
			`project_${this.project.id}`,
		);
		try {
			await rm(targetDir, { recursive: true, force: true });
		} catch (err) {
			console.error(
				`Failed to delete cache for remote project ${this.project.id}`,
				err,
			);
		}
	}
}

class IngestAdapter implements ProjectAdapter {
	constructor(_project: IngestProject) {}

	async prepare(): Promise<void> {
		throw new Error(
			"Les projets Ingest ne peuvent pas être audités activement. Attente d'un webhook CI.",
		);
	}

	getAuditCwd(): string {
		throw new Error("Les projets Ingest n'ont pas de répertoire de travail.");
	}

	async getGitInfo(): Promise<GitInfo> {
		return mockGitInfo;
	}

	async destroy(): Promise<void> {
		// Nothing to clean on disk
	}
}

export function getAdapter(project: Project): ProjectAdapter {
	if (project.source_type === "local")
		return new LocalAdapter(project as LocalProject);
	if (project.source_type === "remote")
		return new RemoteAdapter(project as RemoteProject);
	if (project.source_type === "ingest")
		return new IngestAdapter(project as IngestProject);
	throw new Error(`Unknown source_type for project ${(project as any).id}`);
}
