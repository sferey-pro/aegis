import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "../api";
import type { ProjectListItem, ProjectDetailItem } from "@/routes/projects";
import type { StatsResponse } from "@/routes/stats";
import type { Tag } from "@/db/tags";
import type { Report } from "@/db/reports";

export const queryKeys = {
	projects: ["projects"] as const,
	project: (id: number) => ["project", id] as const,
	stats: ["stats"] as const,
	tags: ["tags"] as const,
	reports: ["reports"] as const,
	history: (days: number) => ["history", days] as const,
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
