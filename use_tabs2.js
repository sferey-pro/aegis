const fs = require('fs');
let content = fs.readFileSync('app_build/src/components/organisms/ProjectEditDialog.tsx', 'utf8');

const oldTool = `<Select
									value={formData.tool}
									onValueChange={(val) =>
										setFormData({
											...formData,
											tool: val as ProjectTool,
											type: val === "composer" ? "composer" : "node",
										})
									}
								>
									<SelectTrigger id="edit-tool" className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="npm">NPM</SelectItem>
										<SelectItem value="yarn">Yarn</SelectItem>
										<SelectItem value="bun">Bun</SelectItem>
										<SelectItem value="composer">Composer</SelectItem>
									</SelectContent>
								</Select>`;

const newTool = `<Tabs
									value={formData.tool}
									onValueChange={(val) =>
										setFormData({
											...formData,
											tool: val as ProjectTool,
											type: val === "composer" ? "composer" : "node",
										})
									}
									className="w-full"
								>
									<TabsList className="w-full h-10">
										<TabsTrigger value="npm" className="flex-1">NPM</TabsTrigger>
										<TabsTrigger value="yarn" className="flex-1">Yarn</TabsTrigger>
										<TabsTrigger value="bun" className="flex-1">Bun</TabsTrigger>
										<TabsTrigger value="composer" className="flex-1">Composer</TabsTrigger>
									</TabsList>
								</Tabs>`;

if (content.includes(oldTool)) {
  content = content.replace(oldTool, newTool);
  fs.writeFileSync('app_build/src/components/organisms/ProjectEditDialog.tsx', content);
}
