import { errorMessage } from "@/lib/utils";
import { getDb } from "../db";
import { buildCveGroups } from "../lib/aggregator";

export const cvesRoutes = {
	"/api/cves": {
		async GET() {
			return Response.json(buildCveGroups());
		},
	},
	"/api/advisories/sync": {
		async POST(req: Request) {
			try {
				const { cve, link } = await req.json();
				const { syncAdvisory } = await import("../lib/github");
				const advisory = await syncAdvisory(cve, link);
				return Response.json({ success: !!advisory, advisory });
			} catch (e: unknown) {
				return Response.json(
					{ success: false, error: errorMessage(e) },
					{ status: 500 },
				);
			}
		},
	},

	"/api/advisories/cache": {
		async DELETE() {
			try {
				getDb().query("DELETE FROM advisory_cache").run();
				return Response.json({ success: true });
			} catch (e: unknown) {
				return Response.json(
					{ success: false, error: errorMessage(e) },
					{ status: 500 },
				);
			}
		},
	},
};
