import { listProjects } from "../db/projects";
import { buildCveGroups } from "../lib/aggregator";
import { getLatestRun, getGlobalHistory } from "../db/runs";

export const statsRoutes = {
  "/api/stats": {
    async GET() {
      const projects = listProjects().filter(p => !p.ignored);
      const groups = buildCveGroups();
      
      let criticalCount = 0;
      let highCount = 0;
      let moderateCount = 0;
      let pendingCves = 0;

      for (const g of groups) {
        if (g.worst === 'critical') criticalCount++;
        else if (g.worst === 'high') highCount++;
        else if (g.worst === 'moderate') moderateCount++;
        
        pendingCves += g.occurrences.filter(o => o.status === 'pending').length;
      }

      let lastSync: string | null = null;
      
      const projectRisks = [];

      for (const p of projects) {
        const run = getLatestRun(p.id);
        if (run) {
          if (!lastSync || new Date(run.ran_at) > new Date(lastSync)) {
            lastSync = run.ran_at;
          }
          const c = run.counts;
          const risk = (c.critical * 20) + (c.high * 10) + (c.moderate * 2);
          if (risk > 0) {
            projectRisks.push({
              id: p.id,
              name: p.name,
              critical: c.critical,
              high: c.high,
              risk
            });
          }
        }
      }

      const scoreValue = 100 - (criticalCount * 20) - (highCount * 10) - (moderateCount * 2);
      let healthGrade = 'F';
      if (scoreValue >= 90) healthGrade = 'A';
      else if (scoreValue >= 80) healthGrade = 'B';
      else if (scoreValue >= 60) healthGrade = 'C';
      else if (scoreValue >= 40) healthGrade = 'D';
      else if (scoreValue >= 20) healthGrade = 'E';

      const topProjects = projectRisks.sort((a, b) => b.risk - a.risk).slice(0, 3);
      const topCves = groups.sort((a, b) => b.occurrences.length - a.occurrences.length).slice(0, 3).map(g => ({
        cve: g.cve,
        title: g.occurrences[0]?.title || g.cve,
        worst: g.worst,
        count: g.occurrences.length
      }));

      return Response.json({
        monitoredProjects: projects.length,
        criticalVulnerabilities: criticalCount,
        pendingCves,
        lastSync,
        healthGrade,
        topProjects,
        topCves
      });
    }
  },

  "/api/history-global": {
    async GET(req: Request) {
      const url = new URL(req.url);
      const days = parseInt(url.searchParams.get("days") || "30", 10);
      return Response.json(getGlobalHistory(days));
    }
  }
};
