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
import { isString } from "../utils/type-guards.js";

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
      isString(target) && target.trim() ? ` ${target}` : " draft";
    return params["run"] === false
      ? `Checking app${label} wiring`
      : `Debugging app${label}`;
  }
};

export const listAppsSpec: CapabilitySpec = {
  name: "list_apps",
  description:
    "List the mini apps in this account, newest first, with each app's " +
    "operations and when it was last changed.",
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "How many apps to return (1-100).",
        default: 50
      }
    },
    required: []
  },
  category: "read",
  userMessage: () => "Listing apps"
};

export const getAppSpec: CapabilitySpec = {
  name: "get_app",
  description:
    "Read one of your mini apps: its document — operations, variables and " +
    "the widget tree — the same document debug_app simulates.",
  inputSchema: {
    type: "object",
    properties: {
      application_id: { type: "string", description: "The app to read" }
    },
    required: ["application_id"]
  },
  category: "read",
  userMessage: (params) => `Reading app ${params["application_id"]}`
};

export const deleteAppSpec: CapabilitySpec = {
  name: "delete_app",
  description:
    "Delete a mini app you own. The workflows its operations bind are left " +
    "alone — only the app record goes. An app belonging to another user is " +
    "reported as missing.",
  inputSchema: {
    type: "object",
    properties: {
      application_id: { type: "string", description: "The app to delete" }
    },
    required: ["application_id"]
  },
  category: "write",
  userMessage: (params) => `Deleting app ${params["application_id"]}`
};

export const CREATE_APP_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "What the app is called" },
    description: {
      type: "string",
      description: "One line on what the app does"
    },
    project_id: {
      type: "string",
      description: "Project to file the app under (default `default`)"
    },
    from_workflow_id: {
      type: "string",
      description:
        "Start with one operation already bound to this workflow, so the " +
        "app has something to run the moment a widget is placed."
    },
    document: {
      type: "object",
      description:
        "A complete application document to start from. Omit it for an " +
        "empty app and build it up with edit_app."
    }
  },
  required: ["name"]
};

export const createAppSpec: CapabilitySpec = {
  name: "create_app",
  description:
    "Create an empty mini APP (not a workflow) and return its id. This is " +
    "the first step of building one: create it, place and wire the widgets " +
    "with edit_app, then grade it with debug_app. Pass `from_workflow_id` " +
    "to bind its first operation to a workflow you already built.",
  inputSchema: CREATE_APP_SCHEMA,
  category: "write",
  userMessage: (params) => {
    const name = params["name"];
    return isString(name) && name.trim()
      ? `Creating app ${name}`
      : "Creating app";
  }
};

export const EDIT_APP_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    application_id: { type: "string", description: "The app to edit" },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tool: {
            type: "string",
            description:
              "An App Builder tool name, with or without the `ui_app_` " +
              "prefix — e.g. `add_component`, `ui_app_add_operation`. Call " +
              "with an empty `steps` list to see every tool and its schema."
          },
          input: {
            type: "object",
            description: "That tool's arguments"
          }
        },
        required: ["tool"]
      },
      description:
        "The edits to apply, in order. They run against the saved " +
        "document and the result is saved once, at the end."
    },
    name: { type: "string", description: "Rename the app" },
    description: { type: "string", description: "Re-describe the app" },
    workflow_ids: {
      type: "array",
      items: { type: "string" },
      description:
        "Workflows to load the bindable surface of, on top of the ones the " +
        "app's operations already name. Bind a widget to a workflow this " +
        "app does not use yet by naming it here."
    },
    base_updated_at: {
      type: "string",
      description:
        "The `updated_at` this edit was written against. Given, the save " +
        "is refused when the app changed since — nothing is written."
    }
  },
  required: ["application_id"]
};

export const editAppSpec: CapabilitySpec = {
  name: "edit_app",
  description:
    "Edit a mini APP by driving the App Builder tools headlessly: place " +
    "and wire widgets, declare operations, variables and resources. Each " +
    "step names one `ui_app_*` tool and its arguments; they apply in order " +
    "to the saved document, which is written back once at the end. Call it " +
    "with no steps to read the tool catalog and the app's current state. " +
    "Check the result with debug_app({run: false}) — free and instant — " +
    "before running the app for real.",
  inputSchema: EDIT_APP_SCHEMA,
  category: "write",
  userMessage: (params) => {
    const steps = params["steps"];
    const count = Array.isArray(steps) ? steps.length : 0;
    return count === 0
      ? `Reading app ${params["application_id"]} editor`
      : `Editing app ${params["application_id"]} (${count} steps)`;
  }
};

/** Every spec this module declares, in declaration order. */
export const appsSpecs: readonly CapabilitySpec[] = [
  debugAppSpec,
  listAppsSpec,
  getAppSpec,
  createAppSpec,
  editAppSpec,
  deleteAppSpec
];
