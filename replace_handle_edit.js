const fs = require('fs');
let content = fs.readFileSync('app_build/src/pages/Projects.tsx', 'utf8');

const oldHandleEdit = `	const handleEdit = (p: ProjectListItem, e?: React.MouseEvent) => {
		if (e) e.stopPropagation();
		let st = p.source_type;
		if (!st) st = p.is_remote ? "ingest" : "local";
		setFormData({
			name: p.name,
			path: p.path,
			audit_path: p.audit_path || "",
			type: p.type,
			tool: p.tool,
			tags: p.tags || [],
			is_remote: !!p.is_remote,
			source_type: st as "local" | "ingest" | "remote",
			remote_url: p.remote_url || "",
			remote_token: p.remote_token || "",
		});
		setEditingId(p.id);
		setIsAdding(true);
		setIsFormVisible(true);
	};`;

const newHandleEdit = `	const handleEdit = (p: ProjectListItem, e?: React.MouseEvent) => {
		if (e) e.stopPropagation();
		setProjectToEdit(p);
	};`;

content = content.replace(oldHandleEdit, newHandleEdit);
fs.writeFileSync('app_build/src/pages/Projects.tsx', content);
