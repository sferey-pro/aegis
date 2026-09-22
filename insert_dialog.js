const fs = require('fs');
let content = fs.readFileSync('app_build/src/pages/Projects.tsx', 'utf8');

const dialogCode = `
			{projectToEdit && (
				<ProjectEditDialog
					project={projectToEdit}
					isOpen={true}
					onOpenChange={(isOpen) => {
						if (!isOpen) setProjectToEdit(null);
					}}
					onSaved={fetchProjects}
					showIgnoreToggle={false}
				/>
			)}

			<ConfirmDialog`;

content = content.replace('<ConfirmDialog', dialogCode);
fs.writeFileSync('app_build/src/pages/Projects.tsx', content);
