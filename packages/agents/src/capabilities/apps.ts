/**
 * The `apps` capability module — building and debugging mini apps.
 *
 * Two capabilities that used to be two `Tool` subclasses in
 * `../tools/mcp-tools.ts`. The node registry each took as a constructor
 * argument is `run.nodeRegistry` now; without one they answer with the same
 * "no registry in this process" refusal they answered with before.
 *
 * The build harness (`../app-build/build-service.js`) and the app-debug service
 * are imported inside the implementation that needs them — both drag in the
 * execution service, and a host that never builds an app should never pay for
 * it.
 */

import {
  ACTIVE_MODEL_CONTEXT_KEY,
  type ActiveModelSelection,
  type JsonSchema
} from "@nodetool-ai/runtime";
import { noRegistryError, userIdOf } from "../tools/mcp-tool-support.js";
import type { CapabilityExport, CapabilityModule } from "./types.js";
import type { AppBuildRequest } from "../app-build/build-service.js";
import type { AppDebugRequest } from "@nodetool-ai/execution/service";

// ---------------------------------------------------------------------------
// build_app
// ---------------------------------------------------------------------------

const BUILD_APP_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    prompt: {
      type: "string",
      description: "What the app should do, in the user's own terms"
    },
    spec: {
      type: "object",
      description:
        "A pinned BuildSpec to build instead of writing one from the prompt"
    },
    provider: {
      type: "string",
      description:
        "Provider id for the build's own model calls. Defaults to the " +
        "provider of the agent making this call."
    },
    model: {
      type: "string",
      description:
        "Model id the build authors with. Defaults to the model of the " +
        "agent making this call."
    },
    workflow_ids: {
      type: "array",
      items: { type: "string" },
      description:
        "Existing workflow ids to pin, in the spec's operation order — " +
        "these are bound instead of planned"
    },
    max_repairs: {
      type: "number",
      description: "Repair rounds allowed after the first pass (default 3)"
    },
    cost_cap_usd: {
      type: "number",
      description: "Ceiling on what the build may spend (default 2)"
    },
    timeout_ms: {
      type: "number",
      description: "Wall clock for the whole build (default 600000)"
    },
    poll: {
      type: "boolean",
      description:
        "Return a session id as soon as the build starts instead of " +
        "waiting for it (default false)"
    }
  },
  required: [] as string[]
};

const buildApp: CapabilityExport = {
  spec: {
    name: "build_app",
    description:
      "Build a mini app from one sentence of intent and return the build " +
      "report: the pinned spec, what each stage did, the issues repair rounds " +
      "fixed, the simulated run of every interaction, a pass/fail verdict, and " +
      "— only behind a passing verdict — the ApplicationBundle. The bundle is " +
      "offered, not installed: show the user the verdict and install it with " +
      "POST /api/applications/import-bundle once they agree. The build's own " +
      "model calls default to the provider and model YOU are running on — omit " +
      "provider/model to inherit them; pass both only to build with a " +
      "different model. A build takes " +
      "minutes; pass poll=true to get a session id back immediately, then read " +
      "GET /api/debug/sessions/<id> until it settles or cancel it with POST " +
      "/api/debug/sessions/<id>/cancel.",
    inputSchema: BUILD_APP_SCHEMA,
    category: "execute",
    userMessage: (params) => {
      const prompt = params["prompt"];
      return typeof prompt === "string" && prompt.trim()
        ? `Building an app: ${prompt}`
        : "Building an app from the given spec";
    }
  },
  impl: async (run, params) => {
    const registry = run.nodeRegistry;
    if (!registry) return noRegistryError("build an app");
    const inherited = run.context.get<ActiveModelSelection | undefined>(
      ACTIVE_MODEL_CONTEXT_KEY
    );
    const body = { ...params } as AppBuildRequest;
    if (inherited) {
      body.provider ??= inherited.provider;
      body.model ??= inherited.model;
    }
    const { runApplicationBuild } = await import(
      "../app-build/build-service.js"
    );
    try {
      return await runApplicationBuild(userIdOf(run.context), body, registry);
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
};

// ---------------------------------------------------------------------------
// debug_app
// ---------------------------------------------------------------------------

const DEBUG_APP_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    application_id: {
      type: "string",
      description:
        "The ID of a saved application to debug. Give this or `document`, not both."
    },
    document: {
      type: "object",
      description:
        "An application document to debug inline, for an app that is not " +
        "saved (or whose draft differs from the saved row). Give this or " +
        "`application_id`, not both."
    },
    params: {
      type: "object",
      description: "Input values keyed by input name, seeded before the run"
    },
    interact: {
      type: "array",
      items: { type: "object" },
      description:
        "User actions to simulate, in order. Each step is one of " +
        "{set: {key, value, operationId?}}, {click: <widget>}, " +
        "{change: {…}}, {run: <operationId>}, {cancel: <operationId>}, " +
        "{seedResource: {id, items}}. Widgets are named by component id, " +
        "by a type only one widget has, or by a unique label. Omit this " +
        "to click the app's natural run trigger."
    },
    run: {
      type: "boolean",
      description:
        "Execute the app's operations (default true). false checks the " +
        "wiring only — free and instant."
    },
    timeout_ms: {
      type: "number",
      description: "Wall clock for the whole debug run"
    },
    poll: {
      type: "boolean",
      description:
        "Return a session id as soon as the run starts instead of waiting " +
        "for it (default false)"
    }
  },
  required: [] as string[]
};

const debugApp: CapabilityExport = {
  spec: {
    name: "debug_app",
    description:
      "Debug a mini APP (not a workflow): validate every widget binding, " +
      "simulate the app the way the web runtime does, execute its operations " +
      "on the kernel, and return each widget's final state plus a pass/fail " +
      "verdict with the issues behind it. Pass `application_id` for a saved " +
      "app or `document` for an unsaved one — exactly one of them. With " +
      "run=false this is a static wiring check that runs in milliseconds and " +
      "costs nothing; use it after every wiring change. A full run executes " +
      "the real workflows and spends real money, so run it to confirm the app " +
      "works, not to explore. Use `interact` to script the user actions to " +
      "simulate. A long run takes minutes; pass poll=true to get a session id " +
      "back immediately, then read GET /api/debug/sessions/<id> until it " +
      "settles.",
    inputSchema: DEBUG_APP_SCHEMA,
    category: "execute",
    userMessage: (params) => {
      const target = params["application_id"];
      const label =
        typeof target === "string" && target.trim() ? ` ${target}` : " draft";
      return params["run"] === false
        ? `Checking app${label} wiring`
        : `Debugging app${label}`;
    }
  },
  impl: async (run, params) => {
    const registry = run.nodeRegistry;
    if (!registry) return noRegistryError("debug an app");
    const { runApplicationDebug } = await import(
      "@nodetool-ai/execution/service"
    );
    try {
      return await runApplicationDebug(
        userIdOf(run.context),
        params as AppDebugRequest,
        registry
      );
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
};

/** Every app capability, in the order `getAllMcpTools` offered them. */
export const APP_CAPABILITIES: readonly CapabilityExport[] = [
  buildApp,
  debugApp
];

export const module: CapabilityModule = {
  module: "apps",
  exports: APP_CAPABILITIES
};

export { buildApp, debugApp };
