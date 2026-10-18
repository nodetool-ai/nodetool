/**
 * `POST /api/applications/build` — the Fastify-facing half of the app build
 * service. The engine moved to `@nodetool-ai/agents`
 * (`src/app-build/build-service.ts`), because `buildApp` lives there. What
 * stays here is the registry the server bootstraps and the translation of the
 * service's refusals into API errors.
 */

import { createLogger } from "@nodetool-ai/config";
import {
  runApplicationBuild as runApplicationBuildService,
  runApplicationSpec as runApplicationSpecService,
  type AppBuildDeps,
  type AppBuildRequest,
  type AppSpecRequest
} from "@nodetool-ai/agents";
import { AppServiceError } from "@nodetool-ai/execution/service";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { ApiErrorCode } from "../error-codes.js";
import { throwApiError } from "../trpc/error-formatter.js";
import type { HttpApiOptions } from "../http-api.js";

const log = createLogger("nodetool.websocket.app-build");

export type { AppBuildDeps, AppBuildRequest, AppSpecRequest };

let defaultRegistryPromise: Promise<NodeRegistry> | null = null;

async function getDefaultRegistry(): Promise<NodeRegistry> {
  if (!defaultRegistryPromise) {
    defaultRegistryPromise = import("../node-registry-setup.js").then((m) =>
      m.bootstrapNodeRegistry({ log })
    );
  }
  return defaultRegistryPromise;
}

/**
 * Start a build. Resolves with the `BuildReport` (plus the session id), or —
 * with `poll: true` — with the session id as soon as the build is under way.
 */
export async function runApplicationBuild(
  userId: string,
  body: AppBuildRequest,
  apiOptions: HttpApiOptions = {},
  deps: AppBuildDeps = {}
): Promise<Record<string, unknown>> {
  const registry =
    deps.registry ?? apiOptions.registry ?? (await getDefaultRegistry());
  try {
    return await runApplicationBuildService(userId, body, registry, deps);
  } catch (error) {
    rethrowServiceError(error);
  }
}

/** Write the spec for a prompt, as the first half of a build would. */
export async function runApplicationSpec(
  userId: string,
  body: AppSpecRequest,
  deps: AppBuildDeps = {}
): Promise<Record<string, unknown>> {
  try {
    return await runApplicationSpecService(userId, body, deps);
  } catch (error) {
    rethrowServiceError(error);
  }
}

function rethrowServiceError(error: unknown): never {
  if (error instanceof AppServiceError) {
    throwApiError(
      error.code === "not_found"
        ? ApiErrorCode.NOT_FOUND
        : ApiErrorCode.INVALID_INPUT,
      error.message
    );
  }
  throw error;
}
