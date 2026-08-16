/**
 * The `apps` module's specs — data only, no implementation.
 *
 * Split out so a belt can be assembled synchronously: the registry's eager
 * spec table imports this file, never `apps.ts`, so nothing the
 * implementations pull in reaches the entry graph. `apps.ts` imports these
 * back and attaches each to its implementation, so there is one spec object
 * behind both halves.
 */

import type { CapabilitySpec } from "./types.js";
import { type JsonSchema } from "@nodetool-ai/runtime";

export const DEBUG_APP_SCHEMA: JsonSchema = {
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
  required: []
};

export const debugAppSpec: CapabilitySpec = {
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
};

/** Every spec this module declares, in declaration order. */
export const appsSpecs: readonly CapabilitySpec[] = [debugAppSpec];
