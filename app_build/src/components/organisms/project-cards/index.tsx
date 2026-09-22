import React from "react";
import type { ProjectListItem } from "@/routes/projects";
import { LocalProjectCard } from "./LocalProjectCard";
import { RemoteProjectCard } from "./RemoteProjectCard";
import { IngestProjectCard } from "./IngestProjectCard";

export interface ProjectCardProps {
	p: ProjectListItem;
	index: number;
	auditState: Record<number, string>;
	onOpen?: (id: number) => void;
	copiedSlug: number | null;
	setCopiedSlug: (id: number | null) => void;
	copyToClipboard: (text: string) => void;
	detectingId: number | null;
	handleDetectGit: (id: number, e: React.MouseEvent) => void;
	handleFetch: (id: number, e: React.MouseEvent) => void;
	handlePull: (id: number, e: React.MouseEvent) => void;
	toggleIgnore: (p: ProjectListItem, e: React.MouseEvent) => void;
	handleForceAudit: (id: number, e: React.MouseEvent) => void;
	handleEdit: (p: ProjectListItem, e: React.MouseEvent) => void;
	handleDelete: (id: number, e: React.MouseEvent) => void;
	formatDate: (dateStr: string) => string;
	tagColors?: Record<string, string>;
}

export const ProjectCard = React.memo(function ProjectCard(props: ProjectCardProps) {
	if (props.p.source_type === "local") {
		return <LocalProjectCard {...props} />;
	}
	if (props.p.source_type === "remote") {
		return <RemoteProjectCard {...props} />;
	}
	return <IngestProjectCard {...props} />;
});
