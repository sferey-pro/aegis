import React from "react";
import type { ProjectListItem } from "@/routes/projects";
import { LocalProjectRow } from "./LocalProjectRow";
import { RemoteProjectRow } from "./RemoteProjectRow";
import { IngestProjectRow } from "./IngestProjectRow";

export interface ProjectRowProps {
	p: ProjectListItem;
	auditState: Record<number, string>;
	navigate: (path: string) => void;
	tagColors: Record<string, string>;
	detectingId: number | null;
	handleDetectGit: (id: number, e: React.MouseEvent) => void;
	handleFetch: (id: number, e: React.MouseEvent) => void;
	handlePull: (id: number, e: React.MouseEvent) => void;
	handleForceAudit: (id: number, e: React.MouseEvent) => void;
	handleEdit: (p: ProjectListItem, e: React.MouseEvent) => void;
	handleDelete: (id: number, e: React.MouseEvent) => void;
}

export const ProjectRow = React.memo(function ProjectRow(props: ProjectRowProps) {
	if (props.p.source_type === "local") {
		return <LocalProjectRow {...props} />;
	}
	if (props.p.source_type === "remote") {
		return <RemoteProjectRow {...props} />;
	}
	return <IngestProjectRow {...props} />;
});
