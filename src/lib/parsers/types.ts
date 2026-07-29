export type Severity =
	| "critical"
	| "high"
	| "moderate"
	| "low"
	| "info"
	| "unknown";

export interface Vulnerability {
	package: string;
	severity: Severity;
	title: string;
	cve: string | null;
	link: string | null;
	versionRange: string | null;
	fixedIn?: string | null;
	abandoned?: boolean;
	cvssVector?: string | null;
	firstSeenAt?: string | null;
	publishedAt?: string;
	ageInDays?: number;
}

export interface ParseResult {
	vulnerabilities: Vulnerability[];
	counts: Record<Severity, number>;
	total: number;
}
