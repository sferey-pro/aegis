import { listTags, createTag, deleteTag } from "../db/tags";

export const tagsRoutes = {
  "/api/tags": {
    async GET() {
      return Response.json(listTags());
    },
    async POST(req: Request) {
      const body = await req.json();
      try {
        const tag = createTag(body.name, body.color);
        return Response.json(tag);
      } catch (e: any) {
        return Response.json({ error: e.message }, { status: 400 });
      }
    }
  },
  
  "/api/tags/:id": {
    async DELETE(req: any) {
      deleteTag(parseInt(req.params.id));
      return Response.json({ success: true });
    }
  }
};
