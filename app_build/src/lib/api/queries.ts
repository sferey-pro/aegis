import { useQuery } from "@tanstack/react-query";
import type { Report } from "@/db/reports";
import type { Tag } from "@/db/tags";
import type {
	ProjectDetailItem,
	ProjectHistoryItem,
	ProjectListItem,
} from "@/routes/projects";
import type { StatsResponse } from "@/routes/stats";
import { fetchJson } from "../api";

export const queryKeys = {
	projects: ["projects"] as const,
	project: (id: number) => ["project", id] as const,
	stats: ["stats"] as const,
	tags: ["tags"] as const,
	reports: ["reports"] as const,
	history: (days: number) => ["history", days] as const,
	settings: ["settings"] as const,
};

export function useProjects() {
	return useQuery({
		queryKey: queryKeys.projects,
		queryFn: () => fetchJson<ProjectListItem[]>("/api/projects"),
	});
}

export function useProject(id: number) {
	return useQuery({
		queryKey: queryKeys.project(id),
		queryFn: () => fetchJson<ProjectDetailItem>(`/api/projects/${id}`),
		enabled: !!id,
	});
}

export function useStats() {
	return useQuery({
		queryKey: queryKeys.stats,
		queryFn: () => fetchJson<StatsResponse>("/api/stats"),
	});
}

export function useTags() {
	return useQuery({
		queryKey: queryKeys.tags,
		queryFn: () => fetchJson<Tag[]>("/api/tags"),
	});
}

export function useSettings() {
	return useQuery({
		queryKey: queryKeys.settings,
		queryFn: () => fetchJson<Record<string, string>>("/api/settings"),
	});
}

export function useReports() {
	return useQuery({
		queryKey: queryKeys.reports,
		queryFn: () => fetchJson<Report[]>("/api/reports"),
	});
}

export function useProjectHistory(id: number | null) {
	return useQuery({
		queryKey: ["project-history", id],
		queryFn: () =>
			fetchJson<ProjectHistoryItem[]>(`/api/projects/${id}/history`),
		enabled: !!id,
	});
}

export interface AuditStatus {
	isRunning: boolean;
	currentProject: number | null;
	runningProjects: number[];
	progress: number;
	total: number;
	lastCompleted: number | null;
	lastTotal: number | null;
	lastFinishedAt: string | null;
}

export function useAuditStatus() {
	return useQuery({
		queryKey: ["audit-status"],
		queryFn: () => fetchJson<AuditStatus>("/api/audit/status"),
		refetchInterval: (query) => (query.state.data?.isRunning ? 2000 : 5000),
	});
}
