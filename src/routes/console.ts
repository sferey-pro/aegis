import { addConsoleClient, removeConsoleClient } from "../lib/console";

export const consoleRoutes = {
  "/api/console": {
    async GET() {
      const { getSetting } = await import("../db/settings");
      if (getSetting('DISABLE_CONSOLE', 'false') === 'true') {
        return new Response(new ReadableStream({
          start(controller) {
            controller.enqueue(`data: : disabled\n\n`);
            controller.close();
          }
        }), {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
          }
        });
      }
      return new Response(new ReadableStream({
        start(controller) {
          addConsoleClient(controller as any);
        },
        cancel(controller) {
          removeConsoleClient(controller as any);
        }
      }), {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive"
        }
      });
    }
  }
};
