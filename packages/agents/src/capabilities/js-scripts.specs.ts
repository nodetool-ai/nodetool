/**
 * The `js-scripts` module's specs — data only, no implementation.
 *
 * Split out so a belt can be assembled synchronously: the registry's eager
 * spec table imports this file, never `js-scripts.ts`, so nothing the
 * implementations pull in reaches the entry graph. `js-scripts.ts` imports
 * these back and attaches each to its implementation, so there is one spec
 * object behind both halves.
 */

import type { CapabilitySpec } from "./types.js";
import type { JsonSchema } from "@nodetool-ai/runtime";

/** How deep a chain of script invocations may go before it is refused. */
export const MAX_JS_SCRIPT_DEPTH = 4;

/** Ceiling on a script's own timeout, matching the document schema's. */
export const MAX_JS_SCRIPT_TIMEOUT_SECONDS = 120;

const SCRIPT_REF_PROPERTIES = {
  js_script_id: {
    type: "string" as const,
    description: "The script's id (from list_js_scripts)."
  },
  name: {
    type: "string" as const,
    description:
      "The script's name, matched case-insensitively. Used only when " +
      "js_script_id is absent; an ambiguous name is an error, not a guess."
  }
};

const DOCUMENT_DESCRIPTION =
  "A JsScriptDocument: {schemaVersion: 1, description, code, inputs, " +
  "outputs, packages, secrets, timeoutSeconds, tests, palette?}. Ports are " +
  "{name, type}; a test is {name, inputs, expect?, expectedStreamed?}. " +
  "The body is top-level statements (no `export`, no `function run`). " +
  "Outputs leave through `await emit(name, value)` and " +
  "`await output(name, value)` — never through `return`. " +
  "`palette: {category}` exposes the script in the user's node menu as a " +
  "custom node under that category; omit it for a plain library script.";

const DOCUMENT_FIELD: JsonSchema = {
  type: "object",
  description: DOCUMENT_DESCRIPTION,
  additionalProperties: true
};

export const LIST_JS_SCRIPTS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description:
        "Only scripts whose name or description contains this text " +
        "(case-insensitive)."
    },
    limit: {
      type: "number",
      description: "Max scripts to return (default 20, max 100)."
    }
  }
};

export const GET_JS_SCRIPT_SCHEMA: JsonSchema = {
  type: "object",
  properties: { ...SCRIPT_REF_PROPERTIES }
};

export const SAVE_JS_SCRIPT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    js_script_id: {
      type: "string",
      description:
        "The script to update. Omit to create a new one; pass an id that " +
        "does not exist to create it under that id."
    },
    name: {
      type: "string",
      description: "The script's name. Required when creating."
    },
    document: DOCUMENT_FIELD,
    base_updated_at: {
      type: "string",
      description:
        "The `updated_at` the document was read at. When it no longer " +
        "matches, the save is refused instead of clobbering a concurrent " +
        "write. Omit to compare-and-swap against the row as just read."
    }
  },
  required: ["document"]
};

export const VALIDATE_JS_SCRIPT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    js_script_id: {
      type: "string",
      description: "The id of a saved script to validate."
    },
    document: {
      type: "object",
      description: `${DOCUMENT_DESCRIPTION} Takes precedence over js_script_id.`,
      additionalProperties: true
    }
  }
};

export const RUN_JS_SCRIPT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    ...SCRIPT_REF_PROPERTIES,
    inputs: {
      type: "object",
      description:
        "Values for the script's declared inputs, read inside the body off " +
        "the `inputs` object.",
      additionalProperties: true
    },
    input_streams: {
      type: "object",
      description:
        "Items to feed a body that reads its inputs with `stream`, as " +
        '{handle: [item, …]}, e.g. {"numbers": [1, 2, 3]}. Every handle must ' +
        "be a declared input. The body runs once and pulls them: " +
        "`stream(name)` yields one handle's items in order, `stream.any()` " +
        "yields [handle, value] round-robin by index across the handles in " +
        "declaration order. Omit it for a buffered body, whose values go in " +
        "`inputs` instead.",
      additionalProperties: { type: "array" }
    }
  }
};

export const TEST_JS_SCRIPT_SCHEMA: JsonSchema = {
  type: "object",
  properties: { ...SCRIPT_REF_PROPERTIES }
};

export const listJsScriptsSpec: CapabilitySpec = {
  name: "list_js_scripts",
  description:
    "List the caller's JS scripts, most recently updated first: id, name, " +
    "description, declared input/output ports, and `palette` — set when the " +
    "user saved the script as one of their custom nodes. The description " +
    "says what a script does — this is how you pick one to run. Start here " +
    "when the user names a script but not its id.",
  inputSchema: LIST_JS_SCRIPTS_SCHEMA,
  category: "read",
  userMessage: () => "Listing JS scripts"
};

export const getJsScriptSpec: CapabilitySpec = {
  name: "get_js_script",
  description:
    "Read one JS script's full document: the body, its declared ports, the " +
    "sandbox packages it imports, the secrets it may read, its timeout, and " +
    "its saved test cases. Address it by id, or by name when the name is " +
    "unambiguous.",
  inputSchema: GET_JS_SCRIPT_SCHEMA,
  category: "read",
  userMessage: (params) =>
    `Reading JS script ${String(params["js_script_id"] ?? params["name"] ?? "")}`
};

export const saveJsScriptSpec: CapabilitySpec = {
  name: "save_js_script",
  description:
    "Create a JS script or update an existing one. The document is validated " +
    "first — a document carrying errors is refused and the issues are " +
    "returned instead. An update is a compare-and-swap on the row's " +
    "`updated_at`, so a concurrent edit is reported rather than clobbered. " +
    "Warnings (no saved tests, a secret this install lacks) do not block the " +
    "save; they come back with the result.",
  inputSchema: SAVE_JS_SCRIPT_SCHEMA,
  category: "write",
  userMessage: (params) =>
    params["js_script_id"]
      ? `Saving JS script ${String(params["js_script_id"])}`
      : `Creating JS script ${String(params["name"] ?? "")}`
};

export const validateJsScriptSpec: CapabilitySpec = {
  name: "validate_js_script",
  description:
    "Statically check a JS script WITHOUT running it: the body's syntax, its " +
    "imports against the installed sandbox packs, undefined names, " +
    "undeclared `inputs.*` reads, and outputs no `emit`/`output` call " +
    "reaches; plus the document's own rules — duplicate or non-identifier " +
    "port names, a test naming a port the script does not declare, a body " +
    "that declares outputs but returns them instead of emitting them " +
    "(an error), no saved tests (a warning), and a declared secret this " +
    "install lacks (a warning). Pass an inline `document` to check one you " +
    "are building, or `js_script_id` to check a saved script. Run it after " +
    "every edit — it is far cheaper than run_js_script.",
  inputSchema: VALIDATE_JS_SCRIPT_SCHEMA,
  category: "read",
  userMessage: (params) =>
    params["js_script_id"]
      ? `Validating JS script ${String(params["js_script_id"])}`
      : "Validating JS script document"
};

export const runJsScriptSpec: CapabilitySpec = {
  name: "run_js_script",
  description:
    "Run a saved JS script in the QuickJS sandbox with the given `inputs` " +
    "and report its outputs, streamed emits, console logs and error. The " +
    "script runs inside its own envelope: the packs its body imports, only " +
    "the secrets it declares, and its own timeout. The guest has the " +
    "same `tools.*` / `nodetool.*` belt a Code node has — tool-backed calls " +
    "can spend money. Address the script by id, or by name when the name is " +
    "unambiguous.",
  inputSchema: RUN_JS_SCRIPT_SCHEMA,
  category: "execute",
  userMessage: (params) =>
    `Running JS script ${String(params["js_script_id"] ?? params["name"] ?? "")}`
};

export const testJsScriptSpec: CapabilitySpec = {
  name: "test_js_script",
  description:
    "Run a JS script's saved test cases and grade each one, exactly the way " +
    "test_code grades an ad-hoc case list: a case's `expect` is compared " +
    "structurally per output handle, and its `expectedStreamed` is compared " +
    "whole and in order. Use it as the regression check after editing a " +
    "script's body or ports.",
  inputSchema: TEST_JS_SCRIPT_SCHEMA,
  category: "execute",
  userMessage: (params) =>
    `Testing JS script ${String(params["js_script_id"] ?? params["name"] ?? "")}`
};

export const deleteJsScriptSpec: CapabilitySpec = {
  name: "delete_js_script",
  description:
    "Delete a JS script you own, together with its saved version history. " +
    "This cannot be undone. A JS script belonging to another user is reported " +
    "as missing.",
  inputSchema: {
    type: "object",
    properties: {
      script_id: {
        type: "string",
        description: "The JS script to delete. You must own it."
      }
    },
    required: ["script_id"]
  },
  category: "write",
  userMessage: (params) => `Deleting JS script ${params["script_id"]}`
};

/** Every spec this module declares, in declaration order. */
export const jsScriptsSpecs: readonly CapabilitySpec[] = [
  listJsScriptsSpec,
  getJsScriptSpec,
  saveJsScriptSpec,
  validateJsScriptSpec,
  runJsScriptSpec,
  testJsScriptSpec,
  deleteJsScriptSpec
];
