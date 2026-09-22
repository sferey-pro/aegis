const fs = require('fs');

// 1. Update app_build/src/routes/projects.ts
let p = fs.readFileSync('app_build/src/routes/projects.ts', 'utf8');

// Update isPathAllowed
const oldIsPathAllowed = `function isPathAllowed(targetPath: string) {
	const allowedRootsStr = process.env.AEGIS_ALLOWED_ROOTS;
	if (!allowedRootsStr) return false;
	const allowedRoots = allowedRootsStr
		.split(",")
		.map((r) => nodePath.resolve(r.trim()));
	const absolutePath = nodePath.resolve(targetPath);
	return allowedRoots.some((root) => {
		if (absolutePath === root) return true;
		// La comparaison se fait au séparateur, pour que \`/srv/autorise-bis\` ne
		// passe pas pour un descendant de \`/srv/autorise\`. Cas particulier de la
		// racine du système : \`"/" + sep\` donne \`"//"\`, qui ne préfixe rien —
		// \`AEGIS_ALLOWED_ROOTS=/\` n'autorisait donc que \`/\` lui-même.
		const prefixe = root.endsWith(nodePath.sep) ? root : root + nodePath.sep;
		return absolutePath.startsWith(prefixe);
	});
}`;

const newIsPathAllowed = `function isPathAllowed(targetPath: string) {
	const absolutePath = nodePath.resolve(targetPath);
	
	// Autoriser explicitement le dossier des projets distants gérés par l'application
	const remoteProjectsDir = nodePath.join(process.cwd(), ".aegis_remote_projects");
	if (absolutePath === remoteProjectsDir || absolutePath.startsWith(remoteProjectsDir + nodePath.sep)) {
		return true;
	}

	const allowedRootsStr = process.env.AEGIS_ALLOWED_ROOTS;
	if (!allowedRootsStr) return false;
	const allowedRoots = allowedRootsStr
		.split(",")
		.map((r) => nodePath.resolve(r.trim()));
	return allowedRoots.some((root) => {
		if (absolutePath === root) return true;
		// La comparaison se fait au séparateur, pour que \`/srv/autorise-bis\` ne
		// passe pas pour un descendant de \`/srv/autorise\`. Cas particulier de la
		// racine du système : \`"/" + sep\` donne \`"//"\`, qui ne préfixe rien —
		// \`AEGIS_ALLOWED_ROOTS=/\` n'autorisait donc que \`/\` lui-même.
		const prefixe = root.endsWith(nodePath.sep) ? root : root + nodePath.sep;
		return absolutePath.startsWith(prefixe);
	});
}`;

p = p.replace(oldIsPathAllowed, newIsPathAllowed);

// Update POST
const oldPostRemote = `const allowedRootsStr = process.env.AEGIS_ALLOWED_ROOTS;
				if (!allowedRootsStr) {
					// Need to rollback creation? Not really, but it will fail.
					return Response.json(
						{
							error:
								"AEGIS_ALLOWED_ROOTS n'est pas défini, impossible de créer un projet distant.",
						},
						{ status: 403 },
					);
				}
				const firstRoot = allowedRootsStr.split(",")[0]?.trim() || "";
				const baseDir = nodePath.join(firstRoot, ".aegis_remote_projects");`;

const newPostRemote = `const baseDir = nodePath.join(process.cwd(), ".aegis_remote_projects");`;

p = p.replace(oldPostRemote, newPostRemote);

// Update PUT
const oldPutRemote = `const allowedRootsStr = process.env.AEGIS_ALLOWED_ROOTS;
				if (!allowedRootsStr) {
					return Response.json(
						{
							error:
								"AEGIS_ALLOWED_ROOTS n'est pas défini, impossible de créer un projet distant.",
						},
						{ status: 403 },
					);
				}
				const firstRoot = allowedRootsStr.split(",")[0]?.trim() || "";
				const baseDir = nodePath.join(firstRoot, ".aegis_remote_projects");`;

const newPutRemote = `const baseDir = nodePath.join(process.cwd(), ".aegis_remote_projects");`;

p = p.replace(oldPutRemote, newPutRemote);

fs.writeFileSync('app_build/src/routes/projects.ts', p);

// 2. Update app_build/src/lib/remote-sync.ts
let r = fs.readFileSync('app_build/src/lib/remote-sync.ts', 'utf8');

const oldSync = `const allowedRootsStr = process.env.AEGIS_ALLOWED_ROOTS;
	if (!allowedRootsStr) {
		throw new Error(
			"AEGIS_ALLOWED_ROOTS n'est pas défini. Impossible de déterminer où stocker les fichiers distants.",
		);
	}
	const firstRoot = allowedRootsStr.split(",")[0]?.trim() || "";
	const baseDir = join(firstRoot, ".aegis_remote_projects");`;

const newSync = `const baseDir = join(process.cwd(), ".aegis_remote_projects");`;

r = r.replace(oldSync, newSync);

fs.writeFileSync('app_build/src/lib/remote-sync.ts', r);
