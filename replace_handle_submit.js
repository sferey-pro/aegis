const fs = require('fs');
let content = fs.readFileSync('app_build/src/pages/Projects.tsx', 'utf8');

const oldHandleSubmit = `	const handleSubmit = async (
		e: React.FormEvent | React.MouseEvent,
		shouldAudit = false,
	) => {
		e.preventDefault();
		setSubmitError(null);
		try {
			const payload = { ...formData };
			let createdProjectId = null;

			if (editingId) {
				await fetchVoid(\`/api/projects/\${editingId}\`, {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});
			} else {
				const nouveau = await fetchJson<Project>("/api/projects", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				createdProjectId = nouveau.id;
			}

			resetForm();
			await fetchProjects();

			if (createdProjectId && !payload.is_remote) {
				// Déclencher un git fetch en arrière-plan pour vérifier les mises à jour (behind/ahead)
				fetchVoid(\`/api/projects/\${createdProjectId}/git-fetch\`, {
					method: "POST",
				})
					.then(() => fetchProjects())
					.catch(console.error);
			}

			if (shouldAudit && createdProjectId) {
				setAuditState((prev) => ({
					...prev,
					[createdProjectId]: "Démarrage...",
				}));
				fetchVoid(\`/api/projects/\${createdProjectId}/audit\`, { method: "POST" })
					.then(() => fetchProjects())
					.catch(console.error)
					.finally(() => {
						setAuditState((prev) => {
							const newState = { ...prev };
							delete newState[createdProjectId];
							return newState;
						});
					});
			}
		} catch (err) {
			setSubmitError(apiErrorMessage(err));
		}
	};`;

const newHandleSubmit = `	const handleSubmit = async (
		e: React.FormEvent | React.MouseEvent,
		shouldAudit = false,
	) => {
		e.preventDefault();
		setSubmitError(null);
		try {
			const payload = { ...formData };
			
			const nouveau = await fetchJson<Project>("/api/projects", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			const createdProjectId = nouveau.id;

			resetForm();
			await fetchProjects();

			if (createdProjectId && !payload.is_remote) {
				// Déclencher un git fetch en arrière-plan pour vérifier les mises à jour (behind/ahead)
				fetchVoid(\`/api/projects/\${createdProjectId}/git-fetch\`, {
					method: "POST",
				})
					.then(() => fetchProjects())
					.catch(console.error);
			}

			if (shouldAudit && createdProjectId) {
				setAuditState((prev) => ({
					...prev,
					[createdProjectId]: "Démarrage...",
				}));
				fetchVoid(\`/api/projects/\${createdProjectId}/audit\`, { method: "POST" })
					.then(() => fetchProjects())
					.catch(console.error)
					.finally(() => {
						setAuditState((prev) => {
							const newState = { ...prev };
							delete newState[createdProjectId];
							return newState;
						});
					});
			}
		} catch (err) {
			setSubmitError(apiErrorMessage(err));
		}
	};`;

if (!content.includes(oldHandleSubmit)) {
  console.log("Could not find old handleSubmit to replace");
} else {
  content = content.replace(oldHandleSubmit, newHandleSubmit);
  fs.writeFileSync('app_build/src/pages/Projects.tsx', content);
}
