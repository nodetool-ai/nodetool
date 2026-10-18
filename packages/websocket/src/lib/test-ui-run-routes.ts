import type { IncomingMessage, ServerResponse } from "node:http";
import Fastify from "fastify";
import { z } from "zod";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import { ClaudeAgentProvider } from "@nodetool-ai/runtime";
import applicationsRoutes from "../routes/applications.js";
import appRunsRoutes from "../routes/app-runs.js";
import runSpansRoutes from "../routes/run-spans.js";
import type { AppBuildDeps } from "./app-build-service.js";

const methodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

const APP_BUILD_PATHS = new Set(["/api/applications/spec", "/api/applications/build"]);
/** A green build's bundle is installed through this route. */
const APP_INSTALL_PATH = "/api/applications/import-bundle";

/**
 * `NODETOOL_STUDY_APP_MODEL=claude_agent_sdk/sonnet` writes and builds apps on
 * that model, whatever the request picked. The fakes cannot write a design
 * that follows what a person typed, so a UX study of the App flow sets it.
 * The planner and the judge see only that provider, so the app's own model
 * calls use it too. Set `NODETOOL_REAL_PROVIDERS=claude_agent_sdk` with it, or
 * the app's runs reach a fake and the judge fails every build. Only the Claude
 * Agent provider is supported: it needs no key.
 */
function studyAppModel(): { provider: string; model: string } | null {
  const value = process.env["NODETOOL_STUDY_APP_MODEL"];
  if (!value) {
    return null;
  }
  const [provider, model] = value.split("/", 2);
  if (provider !== PROVIDER_IDS.CLAUDE_AGENT_SDK || !model) {
    throw new Error(
      `NODETOOL_STUDY_APP_MODEL must be "${PROVIDER_IDS.CLAUDE_AGENT_SDK}/<model>", got "${value}".`
    );
  }
  return { provider, model };
}

/** The local UI harness uses the production owner routes with its existing single-user fixture. */
export function createTestUiRunRoutes() {
  const app = Fastify();
  const studyModel = studyAppModel();
  app.addHook("onRequest", async (request) => {
    request.userId = "1";
    if (request.headers.authorization?.startsWith("Bearer nda_")) {
      request.appSession = { applicationId: "visitor-session", version: 0 };
    }
  });
  app.addHook("preHandler", async (request) => {
    const body = request.body;
    if (studyModel && APP_BUILD_PATHS.has(request.url.split("?")[0] ?? "") &&
      typeof body === "object" && body !== null) {
      request.body = { ...body, provider: studyModel.provider, model: studyModel.model };
    }
  });
  const appBuild: AppBuildDeps = studyModel
    ? {
        createProvider: async () => new ClaudeAgentProvider(),
        loadProviders: async () => ({ [PROVIDER_IDS.CLAUDE_AGENT_SDK]: new ClaudeAgentProvider() })
      }
    : {};
  const ready = app
    .register(appRunsRoutes)
    .register(runSpansRoutes)
    .register(applicationsRoutes, { apiOptions: {}, appBuild })
    .ready();
  return {
    matches(pathname: string): boolean {
      return pathname === "/api/app-instances" || pathname.startsWith("/api/app-instances/") ||
        pathname.startsWith("/api/app-runs/") || /^\/api\/runs\/[^/]+\/(?:spans|browser-start)$/.test(pathname) ||
        APP_BUILD_PATHS.has(pathname) || pathname === APP_INSTALL_PATH;
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
