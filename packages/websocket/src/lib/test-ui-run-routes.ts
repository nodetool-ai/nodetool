import type { IncomingMessage, ServerResponse } from "node:http";
import Fastify from "fastify";
import { z } from "zod";
import appRunsRoutes from "../routes/app-runs.js";
import runSpansRoutes from "../routes/run-spans.js";

const methodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

/** The local UI harness uses the production owner routes with its existing single-user fixture. */
export function createTestUiRunRoutes() {
  const app = Fastify();
  app.addHook("onRequest", async (request) => {
    request.userId = "1";
    if (request.headers.authorization?.startsWith("Bearer nda_")) {
      request.appSession = { applicationId: "visitor-session", version: 0 };
    }
  });
  const ready = app.register(appRunsRoutes).register(runSpansRoutes).ready();
  return {
    matches(pathname: string): boolean {
      return pathname === "/api/app-instances" || pathname.startsWith("/api/app-instances/") ||
        pathname.startsWith("/api/app-runs/") || /^\/api\/runs\/[^/]+\/(?:spans|browser-start)$/.test(pathname);
    },
    async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
      await ready;
      const method = methodSchema.safeParse(request.method);
      if (!method.success) { response.statusCode = 405; response.end(); return; }
      const result = await app.inject({ method: method.data, url: request.url ?? "/", headers: request.headers,
        payload: method.data !== "GET" && method.data !== "HEAD" ? request : undefined });
      response.statusCode = result.statusCode;
      for (const [name, value] of Object.entries(result.headers)) {
        if (value !== undefined) { response.setHeader(name, value); }
      }
      response.end(result.rawPayload);
    },
    async close(): Promise<void> { await app.close(); }
  };
}
