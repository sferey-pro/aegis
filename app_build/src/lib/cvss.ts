export interface CvssMetric {
	group: string;
	name: string;
	value: string;
}

const METRICS: Record<
	string,
	{ name: string; values: Record<string, string>; group: string }
> = {
	// Exploitability Metrics
	AV: {
		name: "Attack Vector",
		values: { N: "Network", A: "Adjacent", L: "Local", P: "Physical" },
		group: "Exploitability Metrics",
	},
	AC: {
		name: "Attack Complexity",
		values: { L: "Low", H: "High" },
		group: "Exploitability Metrics",
	},
	AT: {
		name: "Attack Requirements",
		values: { N: "None", P: "Present" },
		group: "Exploitability Metrics",
	},
	PR: {
		name: "Privileges Required",
		values: { N: "None", L: "Low", H: "High" },
		group: "Exploitability Metrics",
	},
	UI: {
		name: "User Interaction",
		values: { N: "None", R: "Required", P: "Passive", A: "Active" },
		group: "Exploitability Metrics",
	},

	// Scope (v3)
	S: {
		name: "Scope",
		values: { U: "Unchanged", C: "Changed" },
		group: "Scope Metrics",
	},

	// Vulnerable System Impact Metrics (v3/v4)
	C: {
		name: "Confidentiality",
		values: { N: "None", L: "Low", H: "High" },
		group: "Vulnerable System Impact",
	},
	I: {
		name: "Integrity",
		values: { N: "None", L: "Low", H: "High" },
		group: "Vulnerable System Impact",
	},
	A: {
		name: "Availability",
		values: { N: "None", L: "Low", H: "High" },
		group: "Vulnerable System Impact",
	},

	VC: {
		name: "Confidentiality (Vuln)",
		values: { N: "None", L: "Low", H: "High" },
		group: "Vulnerable System Impact",
	},
	VI: {
		name: "Integrity (Vuln)",
		values: { N: "None", L: "Low", H: "High" },
		group: "Vulnerable System Impact",
	},
	VA: {
		name: "Availability (Vuln)",
		values: { N: "None", L: "Low", H: "High" },
		group: "Vulnerable System Impact",
	},

	// Subsequent System Impact Metrics (v4)
	SC: {
		name: "Confidentiality (Subsequent)",
		values: { N: "None", L: "Low", H: "High", S: "Safety" },
		group: "Subsequent System Impact",
	},
	SI: {
		name: "Integrity (Subsequent)",
		values: { N: "None", L: "Low", H: "High", S: "Safety" },
		group: "Subsequent System Impact",
	},
	SA: {
		name: "Availability (Subsequent)",
		values: { N: "None", L: "Low", H: "High", S: "Safety" },
		group: "Subsequent System Impact",
	},
};

export function parseCvssVector(vector: string): Record<string, CvssMetric[]> {
	const parts = vector.split("/");

	const metrics = parts.slice(1);

	const groups: Record<string, CvssMetric[]> = {};

	for (const part of metrics) {
		const [key, val] = part.split(":");
		if (!key || !val) continue;

		const metricDef = METRICS[key];
		if (metricDef) {
			const g = metricDef.group;
			if (!groups[g]) groups[g] = [];
			groups[g].push({
				group: g,
				name: metricDef.name,
				value: metricDef.values[val] || val,
			});
		}
	}

	return groups;
}

export function buildCvssTooltip(vector: string): string {
	const groups = parseCvssVector(vector);
	let result = "";
	for (const [groupName, metrics] of Object.entries(groups)) {
		result += `\n[ ${groupName} ]\n`;
		for (const m of metrics) {
			result += `- ${m.name}: ${m.value}\n`;
		}
	}
	return result.trim();
}
