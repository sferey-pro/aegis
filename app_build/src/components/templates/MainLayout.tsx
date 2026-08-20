import React from "react";
import { Outlet } from "react-router-dom";
import { Header } from "../organisms/Header";
import { Console } from "../Console";

interface MainLayoutProps {
	handleRunAudit: () => Promise<void>;
	auditing: boolean;
	pendingCves?: number;
}

export function MainLayout({
	handleRunAudit,
	auditing,
	pendingCves,
}: MainLayoutProps) {
	return (
		<>
			<Header
				handleRunAudit={handleRunAudit}
				auditing={auditing}
				pendingCves={pendingCves}
			/>

			<div className="pt-[88px] flex-1 flex flex-col w-full">
				<Outlet />
			</div>

			<footer className="w-full text-center py-8 mt-12 border-t border-border/10 text-muted-foreground/60 text-sm animate-in fade-in duration-500">
				<p className="font-bold text-foreground/50 mb-1 tracking-wider uppercase text-xs">
					Aegis Security
				</p>
				<p>
					Parce que coder sans faille relève du mythe, mais les corriger avant
					le week-end est un art.
				</p>
			</footer>

			<Console />
		</>
	);
}
