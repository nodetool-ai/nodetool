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
 *   GET    /api/applications/:id/export-bundle      → ApplicationBundle (download)
 *   POST   /api/applications/import-bundle          → ApplicationResponse
 *   POST   /api/applications/build                  → BuildReport | {session_id}
 *   POST   /api/applications/debug                  → AppDebugSummary | {session_id}
 *   GET    /api/applications/examples               → ExampleAppSummary[]
 *   GET    /api/applications/examples/:slug         → ApplicationBundle
 *   POST   /api/applications/examples/:slug/install → ApplicationResponse
 */

import type { FastifyPluginAsync } from "fastify";
import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { ZodError } from "zod";
import {
  createApplicationInput,
  importApplicationBundleInput
} from "@nodetool-ai/protocol/api-schemas/applications.js";
import { bridge } from "../lib/bridge.js";
import { ApiErrorCode } from "../error-codes.js";
import { throwApiError } from "../trpc/error-formatter.js";
import {
  getExampleAppBundle,
  installExampleApp,
  listExampleApps
} from "../lib/example-apps.js";
import { getUserId, type HttpApiOptions } from "../http-api.js";
import {
  createApplication,
  deleteApplication,
  exportApplicationBundle,
  getApplication,
  importApplicationBundle,
  listApplications,
  releasedApplicationDocument,
  updateApplication,
  updateApplicationInput
} from "../lib/applications-service.js";
import {
  runApplicationBuild,
  type AppBuildDeps,
  type AppBuildRequest
} from "../lib/app-build-service.js";
import {
  runApplicationDebug,
  type AppDebugDeps,
  type AppDebugRequest
} from "../lib/app-debug-service.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
  /** Build dependencies — overridden only by tests. */
  appBuild?: AppBuildDeps;
  /** Debug dependencies — overridden only by tests. */
  appDebug?: AppDebugDeps;
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

/** A decoded JSON request body, before a schema validates its shape. */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

async function readJsonBody(request: Request): Promise<JsonValue> {
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
async function respond<TResult>(
  produce: () => Promise<TResult>
): Promise<Response> {
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

  // Static routes before the parametric ones so `import-bundle` is never read
  // as an application id.
  app.post("/api/applications/import-bundle", async (req, reply) => {
    await bridge(req, reply, (request) =>
      respond(async () => {
        const input = importApplicationBundleInput.parse(
          await readJsonBody(request)
        );
        return importApplicationBundle(userIdOf(request), input);
      })
    );
  });

  // Build an app from a prompt or a spec. The response is the BuildReport —
  // the bundle it carries is offered, never installed: turning a green build
  // into an application is a separate call to `import-bundle` above.
  app.post("/api/applications/build", async (req, reply) => {
    await bridge(req, reply, (request) =>
      respond(async () => {
        const body = (await readJsonBody(request)) as AppBuildRequest;
        return runApplicationBuild(
          userIdOf(request),
          body,
          apiOptions,
          opts.appBuild ?? {}
        );
      })
    );
  });

  // Debug an app: a saved one by id, or the live draft posted inline. The
  // response is the compacted report — the verdict, what each widget ended up
  // showing, and how each invocation went.
  app.post("/api/applications/debug", async (req, reply) => {
    await bridge(req, reply, (request) =>
      respond(async () => {
        const body = (await readJsonBody(request)) as AppDebugRequest;
        return runApplicationDebug(
          userIdOf(request),
          body,
          apiOptions,
          opts.appDebug ?? {}
        );
      })
    );
  });

  // Shipped example apps. Listing and reading one needs no user — they are
  // files on disk; installing one goes through the normal bundle import.
  app.get("/api/applications/examples", async (req, reply) => {
    await bridge(req, reply, () =>
      respond(async () => listExampleApps(apiOptions))
    );
  });

  app.get("/api/applications/examples/:slug", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    await bridge(req, reply, () =>
      respond(async () => {
        const bundle = getExampleAppBundle(apiOptions, slug);
        if (!bundle) {
          throwApiError(ApiErrorCode.NOT_FOUND, `No example app named "${slug}"`);
        }
        return bundle;
      })
    );
  });

  app.post("/api/applications/examples/:slug/install", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    await bridge(req, reply, (request) =>
      respond(async () => {
        const body = (await readJsonBody(request)) as { projectId?: string };
        return installExampleApp(
          userIdOf(request),
          apiOptions,
          slug,
          body.projectId
        );
      })
    );
  });

  app.get("/api/applications/:id/export-bundle", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, async (request) => {
      const params = new URL(request.url).searchParams;
      const released =
        params.get("released") === "1" || params.get("released") === "true";
      const response = await respond(() =>
        exportApplicationBundle(userIdOf(request), id, { released })
      );
      if (!response.ok) return response;
      const bundle = (await response.clone().json()) as { name?: string };
      const fileName =
        (bundle.name ?? "application").replace(/[^A-Za-z0-9._-]+/g, "_") ||
        "application";
      const headers = new Headers(response.headers);
      headers.set(
        "content-disposition",
        `attachment; filename="${fileName}.app.json"`
      );
      return new Response(response.body, { status: response.status, headers });
    });
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
