const fs = require('fs');
let content = fs.readFileSync('app_build/src/components/organisms/ProjectEditDialog.tsx', 'utf8');

content = content.replace(
	'import type { ProjectListItem } from "@/pages/Projects";',
	'import type { ProjectListItem } from "@/routes/projects";'
);

fs.writeFileSync('app_build/src/components/organisms/ProjectEditDialog.tsx', content);
