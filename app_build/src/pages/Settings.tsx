import { Settings as SettingsIcon } from "lucide-react";
import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TabAnalysis } from "./settings/TabAnalysis";
import { TabConnections } from "./settings/TabConnections";
import { TabMaintenance } from "./settings/TabMaintenance";

export const Settings = React.memo(function Settings({
	defaultTab = "connections",
}: {
	defaultTab?: string;
}) {
	return (
		<div className="flex flex-col gap-6 p-8 w-full max-w-[1200px] mx-auto animate-in fade-in duration-500">
			<div>
				<h1 className="text-3xl font-black tracking-tight text-primary flex items-center gap-3">
					<SettingsIcon className="w-8 h-8" />
					Configuration
				</h1>
				<p className="text-muted-foreground mt-2 text-lg">
					Paramétrez le comportement global d'Aegis, les accès externes et la
					base de données.
				</p>
			</div>

			<Tabs defaultValue={defaultTab} className="w-full flex flex-col gap-6">
				<TabsList>
					<TabsTrigger value="connections">Connexions & API</TabsTrigger>
					<TabsTrigger value="analysis">Analyse & Tags</TabsTrigger>
					<TabsTrigger value="maintenance">Données & Maintenance</TabsTrigger>
				</TabsList>

				<TabsContent
					value="connections"
					className="mt-0 outline-none w-full min-h-[calc(100vh-16rem)]"
				>
					<TabConnections />
				</TabsContent>

				<TabsContent
					value="analysis"
					className="mt-0 outline-none w-full min-h-[calc(100vh-16rem)]"
				>
					<TabAnalysis />
				</TabsContent>

				<TabsContent
					value="maintenance"
					className="mt-0 outline-none w-full min-h-[calc(100vh-16rem)]"
				>
					<TabMaintenance />
				</TabsContent>
			</Tabs>
		</div>
	);
});
