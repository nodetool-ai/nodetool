/**
 * `POST /api/applications/debug` — the Fastify-facing half of the app debug
 * service. The engine moved to `@nodetool-ai/execution/service`, so the agent
 * `debug_app` tool runs the same simulation in-process instead of over HTTP;
 * what stays here is the registry the server bootstraps and the translation of
 * the service's refusals into API errors.
 */

import { createLogger } from "@nodetool-ai/config";
import { createJsScriptAppRunner } from "@nodetool-ai/agents";
import { getSecret } from "@nodetool-ai/models";
import {
  AppServiceError,
  runApplicationDebug as runApplicationDebugService
} from "@nodetool-ai/execution/service";
import type {
  AppDebugDeps,
  AppDebugRequest
} from "@nodetool-ai/execution/service";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { ApiErrorCode } from "../error-codes.js";
import { getAssetAdapter } from "./storage.js";
import { throwApiError } from "../trpc/error-formatter.js";
import type { HttpApiOptions } from "../http-api.js";

const log = createLogger("nodetool.websocket.app-debug");

export type { AppDebugDeps, AppDebugRequest };

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
 * Debug an app. Resolves with the compacted report (plus the session id), or —
 * with `poll: true` — with the session id as soon as the run is under way.
 */
export async function runApplicationDebug(
  userId: string,
  body: AppDebugRequest,
  apiOptions: HttpApiOptions = {},
  deps: AppDebugDeps = {}
): Promise<Record<string, unknown>> {
  const registry =
    deps.registry ?? apiOptions.registry ?? (await getDefaultRegistry());
  try {
    return await runApplicationDebugService(userId, body, registry, {
      // A script operation runs the QuickJS sandbox, which lives above the
      // execution package — the server is where both are in reach.
      runScript: createJsScriptAppRunner(userId, { secretResolver: getSecret }),
      // Same store the workflow run path reads `asset://<id>` inputs through.
      assetStorage: getAssetAdapter(),
      ...deps
    });
  } catch (error) {
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
}
