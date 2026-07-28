import { getAllSettings, setAllSettings } from "../db/settings";
import { getAllAnnotations } from "../db/annotations";
import { listProjects } from "../db/projects";
import { createSnapshot, restoreSnapshot } from "../db/backup";

export const settingsRoutes = {
  "/api/settings": {
    async GET() {
      return Response.json(getAllSettings());
    },
    async PUT(req: Request) {
      const body = await req.json();
      setAllSettings(body);
      return Response.json({ success: true });
    }
  },

  "/api/config/export": {
    async GET() {
      return Response.json({
        projects: listProjects(),
        settings: getAllSettings(),
        annotations: getAllAnnotations()
      });
    }
  },

  "/api/config/import": {
    async POST(req: Request) {
      const body = await req.json();
      if (body.settings) setAllSettings(body.settings);
      return Response.json({ success: true, message: "Paramètres importés avec succès." });
    }
  },

  "/api/snapshots/create": {
    async POST() {
      return Response.json(createSnapshot());
    }
  },

  "/api/snapshots/restore": {
    async POST() {
      try {
        return Response.json(restoreSnapshot());
      } catch (e: any) {
        return Response.json({ error: e.message }, { status: 400 });
      }
    }
  }
};
