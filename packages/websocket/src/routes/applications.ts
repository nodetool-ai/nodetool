/**
 * Applications REST routes — the non-tRPC door onto the same service.
 *
 * The web app uses `/trpc/applications.*`; mobile, the CLI, and third-party
 * clients use these. Both call `lib/applications-service.ts`, so a given app
 * serializes identically on either transport.
 *
 *   GET    /api/applications                        → ApplicationListItem[]
 *   POST   /api/applications                        → ApplicationResponse
 *   GET    /api/applications/:id                    → ApplicationResponse
 *   PUT    /api/applications/:id                    → ApplicationResponse
 *   PATCH  /api/applications/:id                    → ApplicationResponse
 *   DELETE /api/applications/:id                    → { ok: true }
 *   GET    /api/applications/:id/released-document  → ApplicationReleaseResponse | null
 */

import type { FastifyPluginAsync } from "fastify";
import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { ZodError } from "zod";
import { createApplicationInput } from "@nodetool-ai/protocol/api-schemas/applications.js";
import { bridge } from "../lib/bridge.js";
import { getUserId, type HttpApiOptions } from "../http-api.js";
import {
  createApplication,
  deleteApplication,
  getApplication,
  listApplications,
  releasedApplicationDocument,
  updateApplication,
  updateApplicationInput
} from "../lib/applications-service.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data ?? null), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function errorResponse(status: number, detail: string): Response {
  return jsonResponse({ detail }, status);
}

async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return {};
  try {
    return await request.json();
  } catch {
    return {};
  }
}

/**
 * Run a service call and shape whatever comes back into an HTTP response. The
 * service raises tRPC errors (`throwApiError`); tRPC's own status mapping keeps
 * the two transports agreeing on what a not-found or a conflict is.
 */
async function respond(produce: () => Promise<unknown>): Promise<Response> {
  try {
    return jsonResponse(await produce());
  } catch (error) {
    if (error instanceof TRPCError) {
      return errorResponse(getHTTPStatusCodeFromError(error), error.message);
    }
    if (error instanceof ZodError) {
      return errorResponse(400, error.issues[0]?.message ?? "Invalid input");
    }
    throw error;
  }
}

const applicationsRoutes: FastifyPluginAsync<RouteOptions> = async (
  app,
  opts
) => {
  const { apiOptions } = opts;
  const userIdOf = (request: Request): string =>
    getUserId(request, apiOptions.userIdHeader ?? "x-user-id");

  app.route({
    method: ["GET", "POST"],
    url: "/api/applications",
    handler: async (req, reply) => {
      await bridge(req, reply, (request) =>
        respond(async () => {
          const userId = userIdOf(request);
          if (request.method === "POST") {
            const input = createApplicationInput.parse(
              await readJsonBody(request)
            );
            return createApplication(userId, input);
          }
          const params = new URL(request.url).searchParams;
          const projectId =
            params.get("project_id") ?? params.get("projectId") ?? undefined;
          return listApplications(userId, projectId || undefined);
        })
      );
    }
  });

  app.get("/api/applications/:id/released-document", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      respond(() => releasedApplicationDocument(userIdOf(request), id))
    );
  });

  app.route({
    method: ["GET", "PUT", "PATCH", "DELETE"],
    url: "/api/applications/:id",
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      await bridge(req, reply, (request) =>
        respond(async () => {
          const userId = userIdOf(request);
          if (request.method === "GET") return getApplication(userId, id);
          if (request.method === "DELETE") return deleteApplication(userId, id);
          const body = await readJsonBody(request);
          const input = updateApplicationInput.parse({
            ...(body as Record<string, unknown>),
            id
          });
          return updateApplication(userId, input);
        })
      );
    }
  });
};

export default applicationsRoutes;
