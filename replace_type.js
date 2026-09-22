const fs = require('fs');
let content = fs.readFileSync('app_build/src/components/organisms/ProjectEditDialog.tsx', 'utf8');

content = content.replace(
	'import { Check, CheckCircle2, Copy, Loader2, XCircle } from "lucide-react";',
	'import { Check, CheckCircle2, Copy, Loader2, XCircle, HardDrive, Globe, UploadCloud } from "lucide-react";'
);

const oldSelect = `<Select
									value={formData.source_type}
									onValueChange={(val) => {
										const st = val as "local" | "ingest" | "remote";
										setFormData({
											...formData,
											source_type: st,
											is_remote: st !== "local",
											path: st === "remote" || st === "ingest" ? "" : formData.path,
										});
									}}
								>
									<SelectTrigger id="edit-source-type" className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="local">Local</SelectItem>
										<SelectItem value="remote">Distant</SelectItem>
										<SelectItem value="ingest">Ingestion CI</SelectItem>
									</SelectContent>
								</Select>`;

const newButtons = `<div className="flex gap-2">
									<Button
										type="button"
										variant={formData.source_type === "local" ? "default" : "outline"}
										onClick={() => {
											setFormData({
												...formData,
												source_type: "local",
												is_remote: false,
											});
										}}
										title="Local"
										className="w-full flex justify-center items-center px-0"
									>
										<HardDrive className="w-5 h-5" />
									</Button>
									<Button
										type="button"
										variant={formData.source_type === "remote" ? "default" : "outline"}
										onClick={() => {
											setFormData({
												...formData,
												source_type: "remote",
												is_remote: true,
												path: "",
											});
										}}
										title="Distant (Direct)"
										className="w-full flex justify-center items-center px-0"
									>
										<Globe className="w-5 h-5" />
									</Button>
									<Button
										type="button"
										variant={formData.source_type === "ingest" ? "default" : "outline"}
										onClick={() => {
											setFormData({
												...formData,
												source_type: "ingest",
												is_remote: true,
												path: "",
											});
										}}
										title="Ingestion CI"
										className="w-full flex justify-center items-center px-0"
									>
										<UploadCloud className="w-5 h-5" />
									</Button>
								</div>`;

if (!content.includes(oldSelect)) {
    console.log("Could not find the Select block.");
} else {
    content = content.replace(oldSelect, newButtons);
    fs.writeFileSync('app_build/src/components/organisms/ProjectEditDialog.tsx', content);
}
