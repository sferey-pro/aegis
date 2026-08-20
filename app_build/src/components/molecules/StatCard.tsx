import React from "react";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
	title: string;
	value: string | number | React.ReactNode;
	icon: LucideIcon;
	subtitle?: string;
	loading?: boolean;
}

export function StatCard({ title, value, icon: Icon, subtitle, loading }: StatCardProps) {
	return (
		<div className="bg-card border-border p-6 rounded-3xl flex flex-col gap-4 relative overflow-hidden">
			<div className="absolute inset-0 bg-primary/5 opacity-0"></div>
			<div className="flex items-center gap-3 relative z-10">
				<div className="w-12 h-12 rounded-2xl border flex items-center justify-center">
					<Icon className="w-6 h-6" />
				</div>
				<p className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
					{title}
				</p>
			</div>
			<div className="mt-auto relative z-10">
				<h3 className="text-5xl font-black font-heading text-foreground">
					{loading ? <span className="opacity-50 text-3xl">...</span> : value}
				</h3>
				{subtitle && (
					<p className="text-xs text-muted-foreground font-mono mt-2">
						{subtitle}
					</p>
				)}
			</div>
		</div>
	);
}
