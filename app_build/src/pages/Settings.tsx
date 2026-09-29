
import React from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TabConnections } from "./settings/TabConnections";
import { TabAnalysis } from "./settings/TabAnalysis";
import { TabMaintenance } from "./settings/TabMaintenance";

export const Settings = React.memo(function Settings() {
    return (
        <div className="flex flex-col gap-6 p-8 max-w-[1200px] mx-auto animate-in fade-in duration-500">
            <div>
                <h1 className="text-3xl font-black tracking-tight text-primary flex items-center gap-3">
                    <SettingsIcon className="w-8 h-8" />
                    Configuration
                </h1>
                <p className="text-muted-foreground mt-2 text-lg">
                    Paramétrez le comportement global d'Aegis, les accès externes et la base de données.
                </p>
            </div>

            <Tabs defaultValue="connections" className="w-full flex flex-col gap-6">
                <TabsList className="w-fit h-auto p-1 bg-muted rounded-xl">
                    <TabsTrigger value="connections" className="rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm">Connexions & API</TabsTrigger>
                    <TabsTrigger value="analysis" className="rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm">Analyse & Tags</TabsTrigger>
                    <TabsTrigger value="maintenance" className="rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm">Données & Maintenance</TabsTrigger>
                </TabsList>

                <TabsContent value="connections" className="mt-0 outline-none min-h-[calc(100vh-16rem)]">
                    <TabConnections />
                </TabsContent>

                <TabsContent value="analysis" className="mt-0 outline-none min-h-[calc(100vh-16rem)]">
                    <TabAnalysis />
                </TabsContent>

                <TabsContent value="maintenance" className="mt-0 outline-none min-h-[calc(100vh-16rem)]">
                    <TabMaintenance />
                </TabsContent>
            </Tabs>
        </div>
    );
});
