import { runAudit } from "./index";

let isProcessing = false;
let currentProject: number | null = null;
let totalInBatch = 0;
let completedInBatch = 0;

export function getAuditStatus() {
	return {
		isRunning: isProcessing,
		currentProject,
		progress: completedInBatch,
		total: totalInBatch || 1,
	};
}

export function enqueueGlobalAudit(projectIds: number[]) {
	if (isProcessing) {
		throw new Error("Un audit est déjà en cours");
	}
	isProcessing = true;
	totalInBatch = projectIds.length;
	completedInBatch = 0;

	// Fire and forget pour le batch
	(async () => {
		for (const id of projectIds) {
			currentProject = id;
			try {
				await runAudit(id, false);
			} catch (e) {
				console.error(`Global audit error on project ${id}`, e);
			}
			completedInBatch++;
		}
		isProcessing = false;
		currentProject = null;
		totalInBatch = 0;
		completedInBatch = 0;
	})().catch(console.error);
}

export async function runSingleAudit(projectId: number, force = false) {
	if (isProcessing) {
		throw new Error("Un audit est déjà en cours, veuillez patienter.");
	}
	isProcessing = true;
	currentProject = projectId;

	try {
		return await runAudit(projectId, force);
	} finally {
		isProcessing = false;
		currentProject = null;
	}
}
