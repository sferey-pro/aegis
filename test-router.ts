import { serve } from "bun";

const server = serve({
	port: 3005,
	routes: {
		"/api/hello": {
			GET() {
				return Response.json({ hello: "world" });
			},
		},
		"/*": {
			GET() {
				return new Response("html fallback");
			},
		},
	},
});
console.log(server.url);
