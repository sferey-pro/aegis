import { buildCveGroups } from "../lib/aggregator";
import { getDb } from "../db";

export const cvesRoutes = {
  "/api/cves": {
    async GET() {
      return Response.json(buildCveGroups());
    }
  },
  "/api/advisories/sync": {
    async POST(req: Request) {
      try {
        const { cve, link } = await req.json();
        const { syncAdvisory } = await import("../lib/github");
        const advisory = await syncAdvisory(cve, link);
        return Response.json({ success: !!advisory, advisory });
      } catch (e: any) {
        return Response.json({ success: false, error: e.message }, { status: 500 });
      }
    }
  },

  "/api/advisories/cache": {
    async DELETE() {
      try {
        getDb().query("DELETE FROM advisory_cache").run();
        return Response.json({ success: true });
      } catch (e: any) {
        return Response.json({ success: false, error: e.message }, { status: 500 });
      }
    }
  }
};
