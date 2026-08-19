import { cp, mkdir, readFile, writeFile } from "fs/promises";
import { marked } from "marked";
import path from "path";

const TEMPLATE = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{TITLE}}</title>
  <style>
    :root {
      --bg: #0f172a;
      --text: #f8fafc;
      --accent: #38bdf8;
      --border: #334155;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      background-color: var(--bg);
      color: var(--text);
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem;
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    h1, h2, h3, h4, h5 { border-bottom: 1px solid var(--border); padding-bottom: 0.3em; margin-top: 1.5em; }
    code { background: #1e293b; padding: 0.2em 0.4em; border-radius: 4px; font-family: monospace; font-size: 0.9em; }
    pre { background: #1e293b; padding: 1rem; border-radius: 8px; overflow-x: auto; border: 1px solid var(--border); }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 4px solid var(--accent); margin: 0; padding-left: 1rem; color: #cbd5e1; }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th, td { border: 1px solid var(--border); padding: 0.5rem; text-align: left; }
    th { background: #1e293b; }
    .nav { margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 2px solid var(--border); }
    .nav a { margin-right: 1rem; font-weight: bold; }
  </style>
</head>
<body>
  <div class="nav">
    <a href="DOCUMENTATION.html">Documentation</a>
    <a href="CONTEXT.html">Spécifications</a>
    <a href="TESTING.html">Tests</a>
    <a href="UPGRADE.html">Évolutions</a>
    <a href="README.html">Accueil</a>
  </div>
  <div class="content">
    {{CONTENT}}
  </div>
</body>
</html>`;

async function buildDocs() {
	const docsDir = path.join(process.cwd(), "docs");
	await mkdir(docsDir, { recursive: true });

	const files = [
		"DOCUMENTATION.md",
		"CONTEXT.md",
		"README.md",
		"TESTING.md",
		"UPGRADE.md",
	];

	for (const file of files) {
		try {
			const content = await readFile(path.join(process.cwd(), file), "utf-8");
			const htmlContent = await marked.parse(content);
			const title = file.replace(".md", "");

			const finalHtml = TEMPLATE.replace(
				"{{TITLE}}",
				title + " - Aegis Docs",
			).replace("{{CONTENT}}", htmlContent);

			await writeFile(path.join(docsDir, title + ".html"), finalHtml);
			console.log(`✅ Generated docs/${title}.html`);
		} catch (e) {
			console.error(`Failed to generate ${file}:`, e);
		}
	}

	try {
		await cp(path.join(process.cwd(), "assets"), path.join(docsDir, "assets"), {
			recursive: true,
		});
		console.log("✅ Copied assets folder to docs/assets");
	} catch (e) {
		console.log("ℹ️ No assets folder found or failed to copy");
	}
}

buildDocs();
