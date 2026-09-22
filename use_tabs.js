const fs = require('fs');
let content = fs.readFileSync('app_build/src/components/organisms/ProjectEditDialog.tsx', 'utf8');

const oldDiv = `<div className="flex gap-2">
									<Button
										type="button"
										variant={
											formData.source_type === "local" ? "default" : "outline"
										}
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
										variant={
											formData.source_type === "remote" ? "default" : "outline"
										}
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
										variant={
											formData.source_type === "ingest" ? "default" : "outline"
										}
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

const newTabs = `<Tabs
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
									className="w-full"
								>
									<TabsList className="w-full h-10">
										<TabsTrigger value="local" title="Local" className="flex-1">
											<HardDrive className="w-5 h-5" />
										</TabsTrigger>
										<TabsTrigger value="remote" title="Distant (Direct)" className="flex-1">
											<Globe className="w-5 h-5" />
										</TabsTrigger>
										<TabsTrigger value="ingest" title="Ingestion CI" className="flex-1">
											<UploadCloud className="w-5 h-5" />
										</TabsTrigger>
									</TabsList>
								</Tabs>`;

if (content.includes(oldDiv)) {
  content = content.replace(oldDiv, newTabs);
  content = content.replace(
    'import { Check, CheckCircle2, Copy, Loader2, XCircle, HardDrive, Globe, UploadCloud } from "lucide-react";',
    'import { Check, CheckCircle2, Copy, Loader2, XCircle, HardDrive, Globe, UploadCloud } from "lucide-react";\nimport { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";'
  );
  fs.writeFileSync('app_build/src/components/organisms/ProjectEditDialog.tsx', content);
}
