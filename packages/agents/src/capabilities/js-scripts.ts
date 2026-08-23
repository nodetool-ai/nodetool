/**
 * The `js-scripts` capability module — a JS script document as an agent
 * surface.
 *
 * A JS script is a named, versioned script with declared ports, sandbox
 * secrets, a timeout, and saved test cases
 * (docs/js-script-document-design.md). These six capabilities are how an agent
 * — or a Code node body, or a CodeAct action, through the same belt — finds
 * one, reads it, saves it, checks it, runs it, and regression-tests it:
 *
 *   list_js_scripts    — id, name, description, ports, palette (discovery)
 *   get_js_script      — the full document
 *   save_js_script     — create or update, validated first, CAS on update
 *   validate_js_script — the static check, inline or by id
 *   run_js_script      — execute with inputs
 *   test_js_script     — run the document's own saved cases
 *
 * Execution goes through `runCodeBody`, the same core `run_code` and
 * `test_code` already share, so a script run, a Code-node run, and the
 * `POST /api/js-scripts/:id/run` endpoint are one execution path. What the
 * guest gets is the script's own envelope plus the Code-node toolbelt:
 * every installed pack and platform module by import, its declared secrets
 * narrowed by whatever allowance the invoking context carries, its own
 * timeout, the importable belt, and `nodetool.*`.
 * Grading is `gradeCodeCases`, shared with `test_code` rather than copied.
 *
 * Composition is bounded the way sub-agents are: the context carries a depth
 * counter and the chain of script ids, and a script already on the chain fails
 * the call with the cycle named.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import type {
  JsScriptDocument,
  JsScriptTestCase
} from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import type { JsScript, JsScriptVersion } from "@nodetool-ai/models";
import type { JsScriptValidation } from "@nodetool-ai/execution/js-script-debug";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
import { gradeCodeCases, type GradedCase } from "./code-grading.js";
import { runCodeBody } from "./code.js";
import {
  listJsScriptsSpec,
  getJsScriptSpec,
  saveJsScriptSpec,
  validateJsScriptSpec,
  runJsScriptSpec,
  testJsScriptSpec,
  listJsScriptVersionsSpec,
  getJsScriptVersionSpec,
  createJsScriptVersionSpec,
  restoreJsScriptVersionSpec,
  deleteJsScriptVersionSpec,
  DEFAULT_VERSION_LIMIT,
  MAX_VERSION_LIMIT,
  MAX_JS_SCRIPT_DEPTH,
  MAX_JS_SCRIPT_TIMEOUT_SECONDS,
  deleteJsScriptSpec
} from "./js-scripts.specs.js";
import { isNonBlankString, isRecord } from "../utils/type-guards.js";

export {
  DEFAULT_VERSION_LIMIT,
  MAX_VERSION_LIMIT,
  MAX_JS_SCRIPT_DEPTH,
  MAX_JS_SCRIPT_TIMEOUT_SECONDS
} from "./js-scripts.specs.js";

/** Context variable carrying how many script invocations deep this run is. */
export const JS_SCRIPT_DEPTH_KEY = "__js_script_depth";

/** Context variable carrying the script ids already on the call chain. */
export const JS_SCRIPT_CHAIN_KEY = "__js_script_chain";

/**
 * Context variable a host sets to narrow what secrets a script may read. A run
 * gets the intersection of this list and the script's own declared secrets;
 * absent, the script's declaration stands on its own. A caller can only ever
 * narrow the envelope, never widen it.
 */
export const JS_SCRIPT_SECRET_ALLOWANCE_KEY = "__js_script_secret_allowance";

type ToolError = { error: string };

const isError = (value: unknown): value is ToolError =>
  !!value &&
  typeof value === "object" &&
  typeof (value as ToolError).error === "string";

const stringParam = (value: unknown): string | undefined =>
  isNonBlankString(value) ? value.trim() : undefined;

function inputBag(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/**
 * Find the script a call names: by id, else by name among the caller's own
 * scripts. Another user's script reads as missing — the rule the tRPC router's
 * ownership check applies.
 */
async function loadScript(
  run: CapabilityRun,
  params: Record<string, unknown>
): Promise<JsScript | ToolError> {
  const userId = run.context.userId;
  if (!userId) return { error: "No user is bound to this session." };
  const { JsScript } = await import("@nodetool-ai/models");

  const id = stringParam(params["js_script_id"]);
  if (id) {
    const script = await JsScript.findById(id);
    if (!script || script.user_id !== userId) {
      return { error: `JS script ${id} was not found.` };
    }
    return script;
  }

  const name = stringParam(params["name"]);
  if (!name) {
    return {
      error:
        "js_script_id or name is required (use list_js_scripts to find one)."
    };
  }
  const rows = await JsScript.listByUser(userId, 200);
  const matching = rows.filter(
    (row) => row.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (matching.length === 0) {
    return { error: `No JS script is named "${name}".` };
  }
  if (matching.length > 1) {
    return {
      error:
        `${matching.length} JS scripts are named "${name}" ` +
        `(${matching.map((row) => row.id).join(", ")}). Pass js_script_id.`
    };
  }
  return matching[0];
}

/** The secret names this install carries, for the missing-secret warning. */
async function knownSecretNames(userId: string): Promise<string[]> {
  const { Secret } = await import("@nodetool-ai/models");
  const [items] = await Secret.listForUser(userId, 500);
  return items.map((secret) => secret.key);
}

async function validateDocument(
  run: CapabilityRun,
  document: unknown
): Promise<JsScriptValidation> {
  const { validateJsScriptDoc } =
    await import("@nodetool-ai/execution/js-script-debug");
  const userId = run.context.userId;
  const options: NonNullable<Parameters<typeof validateJsScriptDoc>[1]> = {
    sandboxModuleCatalog: run.context.sandboxModuleCatalog ?? null
  };
  if (userId) options.knownSecrets = await knownSecretNames(userId);
  return validateJsScriptDoc(document, options);
}

// ---------------------------------------------------------------------------
// Recursion accounting
// ---------------------------------------------------------------------------

interface ScriptDepthGate {
  ok: boolean;
  refusal?: Record<string, unknown>;
  childContext?: ProcessingContext;
}

/**
 * Enter one script invocation: refuse past the depth cap or on a cycle, else
 * return a context copy carrying the deeper chain. Mirrors
 * `enterSubAgentDepth` — the same gate, over this feature's own two keys.
 */
export function enterJsScript(
  context: ProcessingContext,
  scriptId: string,
  maxDepth: number = MAX_JS_SCRIPT_DEPTH
): ScriptDepthGate {
  const depth = context.get<number>(JS_SCRIPT_DEPTH_KEY) ?? 0;
  const chain = context.get<string[]>(JS_SCRIPT_CHAIN_KEY) ?? [];

  if (chain.includes(scriptId)) {
    return {
      ok: false,
      refusal: {
        error: "js_script_cycle",
        chain: [...chain, scriptId],
        message:
          `JS script ${scriptId} is already running in this call chain ` +
          `(${[...chain, scriptId].join(" → ")}). A script cannot invoke ` +
          "itself, directly or through another script."
      }
    };
  }
  if (depth >= maxDepth) {
    return {
      ok: false,
      refusal: {
        error: "max_js_script_depth_reached",
        depth,
        max_depth: maxDepth,
        chain: [...chain],
        message:
          `Cannot run another JS script — the depth limit of ${maxDepth} is ` +
          "reached. Finish the work at this level instead."
      }
    };
  }

  const childContext = context.copy();
  childContext.set(JS_SCRIPT_DEPTH_KEY, depth + 1);
  childContext.set(JS_SCRIPT_CHAIN_KEY, [...chain, scriptId]);
  return { ok: true, childContext };
}

/**
 * The secrets a run may read: what the document declares, intersected with the
 * invoking context's allowance when it carries one.
 */
export function resolveSecretScope(
  context: ProcessingContext,
  declared: readonly string[]
): string[] {
  const allowance = context.get<string[]>(JS_SCRIPT_SECRET_ALLOWANCE_KEY);
  if (!Array.isArray(allowance)) return [...declared];
  const allowed = new Set(allowance);
  return declared.filter((name) => allowed.has(name));
}

/**
 * `{handle: [items]}` staged for a body that reads `stream`, or undefined when
 * the caller passed nothing usable. Entries that are not arrays are dropped.
 */
function inputStreamBag(value: unknown): Record<string, unknown[]> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const staged: Record<string, unknown[]> = {};
  for (const [handle, items] of Object.entries(
    value as Record<string, unknown>
  )) {
    if (Array.isArray(items)) staged[handle] = [...items];
  }
  return Object.keys(staged).length > 0 ? staged : undefined;
}

/**
 * Staged handles the script does not declare. A stream nothing declares yields
 * nothing, so feeding one is a mistake worth naming rather than a silent no-op.
 */
export function undeclaredStreamHandles(
  document: JsScriptDocument,
  staged: Record<string, unknown[]>
): string[] {
  const declared = new Set(document.inputs.map((port) => port.name));
  return Object.keys(staged).filter((handle) => !declared.has(handle));
}

/** Run one script document's body. Shared by run_js_script and test_js_script. */
async function runDocument(
  context: ProcessingContext,
  document: JsScriptDocument,
  inputs: Record<string, unknown>,
  inputStreams?: Record<string, unknown[]>
) {
  const params: Parameters<typeof runCodeBody>[1] = {
    code: document.code,
    inputs,
    secrets: resolveSecretScope(context, document.secrets),
    timeoutSeconds: Math.min(
      document.timeoutSeconds,
      MAX_JS_SCRIPT_TIMEOUT_SECONDS
    ),
    withToolbelt: true
  };
  if (inputStreams) params.inputStreams = inputStreams;
  return runCodeBody(context, params);
}

/** A saved case in the shape the shared grader reads. */
function toGradedCase(testCase: JsScriptTestCase, index: number): GradedCase {
  const graded: GradedCase = {
    name: testCase.name.trim() !== "" ? testCase.name : `case ${index + 1}`,
    inputs: testCase.inputs ?? {}
  };
  if (testCase.inputStreams) graded.inputStreams = testCase.inputStreams;
  if (testCase.expect) graded.expect = testCase.expect;
  if (testCase.expectedStreamed) {
    graded.expectedStreamed = testCase.expectedStreamed;
  }
  return graded;
}

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

const listJsScripts: CapabilityExport = {
  spec: listJsScriptsSpec,
  impl: async (run, params) => {
    const userId = run.context.userId;
    if (!userId) return { error: "No user is bound to this session." };
    const { JsScript } = await import("@nodetool-ai/models");

    const limit = Math.max(1, Math.min(Number(params["limit"]) || 20, 100));
    const query = (stringParam(params["query"]) ?? "").toLowerCase();
    const rows = await JsScript.listByUser(userId, 200);

    const items = rows.map((row) => {
      const doc = row.toDocument();
      return {
        id: row.id,
        name: row.name,
        description: doc.description,
        inputs: doc.inputs,
        outputs: doc.outputs,
        palette: doc.palette ?? null,
        updated_at: row.updated_at
      };
    });
    // Filter after the read: neither name nor description is indexed, and the
    // per-user limit is what bounds the scan.
    const matching = query
      ? items.filter(
          (item) =>
            item.name.toLowerCase().includes(query) ||
            item.description.toLowerCase().includes(query)
        )
      : items;

    return { js_scripts: matching.slice(0, limit) };
  }
};

const getJsScript: CapabilityExport = {
  spec: getJsScriptSpec,
  impl: async (run, params) => {
    const script = await loadScript(run, params);
    if (isError(script)) return script;
    return {
      id: script.id,
      name: script.name,
      project_id: script.project_id,
      updated_at: script.updated_at,
      document: script.toDocument()
    };
  }
};

/** The row a create writes; `id` only when the caller pinned one. */
type NewJsScriptFields = {
  id?: string;
  user_id: string;
  name: string;
  document: string;
};

/** The columns an update writes; `name` only when the caller sent one. */
type JsScriptChanges = {
  document: string;
  name?: string;
};

const saveJsScript: CapabilityExport = {
  spec: saveJsScriptSpec,
  impl: async (run, params) => {
    const userId = run.context.userId;
    if (!userId) return { error: "No user is bound to this session." };

    const document = params["document"];
    if (!isRecord(document)) {
      return { error: "document is required and must be an object." };
    }

    const validation = await validateDocument(run, document);
    if (!validation.ok) {
      return {
        ok: false,
        saved: false,
        error:
          "The document has validation errors, so it was not saved: " +
          validation.errors.map((issue) => issue.message).join("; "),
        validation
      };
    }

    const { JsScript } = await import("@nodetool-ai/models");
    const id = stringParam(params["js_script_id"]);
    const name = stringParam(params["name"]);
    const serialized = JSON.stringify(document);

    const existing = id ? await JsScript.findById(id) : null;
    if (existing && existing.user_id !== userId) {
      return { error: `JS script ${String(id)} was not found.` };
    }

    if (!existing) {
      if (!name) {
        return { error: "name is required when creating a JS script." };
      }
      const fields: NewJsScriptFields = {
        user_id: userId,
        name,
        document: serialized
      };
      if (id) fields.id = id;
      const created = new JsScript(fields);
      await created.save();
      return {
        ok: true,
        saved: true,
        created: true,
        id: created.id,
        name: created.name,
        updated_at: created.updated_at,
        validation
      };
    }

    const expected = stringParam(params["base_updated_at"]);
    if (expected && expected !== existing.updated_at) {
      return {
        error:
          `JS script ${existing.id} was modified since it was read ` +
          "(optimistic concurrency conflict); nothing was saved. Re-read it " +
          "with get_js_script and retry."
      };
    }
    const changes: JsScriptChanges = { document: serialized };
    if (name) changes.name = name;
    const updated = await JsScript.updateFieldsIfUnchanged(
      existing.id,
      expected ?? existing.updated_at,
      changes
    );
    if (!updated) {
      return {
        error:
          `JS script ${existing.id} was modified since it was read ` +
          "(optimistic concurrency conflict); nothing was saved. Re-read it " +
          "with get_js_script and retry."
      };
    }
    return {
      ok: true,
      saved: true,
      created: false,
      id: updated.id,
      name: updated.name,
      updated_at: updated.updated_at,
      validation
    };
  }
};

const validateJsScript: CapabilityExport = {
  spec: validateJsScriptSpec,
  impl: async (run, params) => {
    const inline = params["document"];
    let document = inline;
    let scriptId: string | undefined;
    let name: string | undefined;

    if (document === undefined && params["js_script_id"] !== undefined) {
      const script = await loadScript(run, params);
      if (isError(script)) return script;
      document = script.toDocument();
      scriptId = script.id;
      name = script.name;
    }

    if (document === undefined || document === null) {
      return {
        error:
          "No script to validate — pass an inline `document` or a valid " +
          "`js_script_id`."
      };
    }

    const validation = await validateDocument(run, document);
    const report: JsScriptValidation & {
      js_script_id?: string;
      name?: string;
      summary: string;
    } = {
      ...validation,
      summary:
        validation.errors.length === 0 && validation.warnings.length === 0
          ? "No issues found."
          : `${validation.errors.length} error(s), ${validation.warnings.length} warning(s)`
    };
    if (scriptId) report.js_script_id = scriptId;
    if (name) report.name = name;
    return report;
  }
};

const runJsScript: CapabilityExport = {
  spec: runJsScriptSpec,
  impl: async (run, params) => {
    const script = await loadScript(run, params);
    if (isError(script)) return script;

    const document = script.toDocument();
    const staged = inputStreamBag(params["input_streams"]);
    if (staged) {
      const undeclared = undeclaredStreamHandles(document, staged);
      if (undeclared.length > 0) {
        return {
          error:
            `input_streams names ${undeclared.map((name) => `"${name}"`).join(", ")}, ` +
            `which ${undeclared.length > 1 ? "are not inputs" : "is not an input"} of ` +
            `JS script "${script.name}". Declared inputs: ` +
            `${document.inputs.map((port) => port.name).join(", ") || "(none)"}.`
        };
      }
    }

    const gate = enterJsScript(run.context, script.id);
    if (!gate.ok || !gate.childContext) return gate.refusal ?? { error: "" };

    const result = await runDocument(
      gate.childContext,
      document,
      inputBag(params["inputs"]),
      staged
    );
    return { js_script_id: script.id, name: script.name, ...result };
  }
};

const testJsScript: CapabilityExport = {
  spec: testJsScriptSpec,
  impl: async (run, params) => {
    const script = await loadScript(run, params);
    if (isError(script)) return script;

    const document = script.toDocument();
    if (document.tests.length === 0) {
      return {
        error:
          `JS script ${script.id} has no saved test cases. Add some with ` +
          "save_js_script before testing it."
      };
    }

    const gate = enterJsScript(run.context, script.id);
    if (!gate.ok || !gate.childContext) return gate.refusal ?? { error: "" };
    const context = gate.childContext;

    const report = await gradeCodeCases(
      document.tests.map(toGradedCase),
      (testCase) =>
        runDocument(context, document, testCase.inputs, testCase.inputStreams)
    );
    return { js_script_id: script.id, name: script.name, ...report };
  }
};

/**
 * Delete a JS script the caller owns.
 *
 * The ownership check and the version cascade are `JsScript.deleteOwned`, the
 * same function the tRPC route calls — a delete is not a place for two copies
 * of one rule, and version rows outliving their document would be unreachable
 * garbage. Missing and not-yours are one answer.
 */
const deleteJsScript: CapabilityExport = {
  spec: deleteJsScriptSpec,
  impl: async (run, params) => {
    const userId = run.context.userId;
    if (!userId) return { error: "No user is bound to this session." };
    const { JsScript } = await import("@nodetool-ai/models");
    const id = String(params["script_id"]);
    const deleted = await JsScript.deleteOwned(userId, id);
    return deleted
      ? { script_id: id, deleted: true }
      : { error: `JS script ${id} was not found, or it is not yours.` };
  }
};

// ---------------------------------------------------------------------------
// Version history
// ---------------------------------------------------------------------------

/** The list-item shape the tRPC router returns for a snapshot. */
function toVersionListItem(version: JsScriptVersion) {
  return {
    id: version.id,
    version: version.version,
    name: version.name,
    saveType: version.save_type,
    createdAt: version.created_at
  };
}

/**
 * A snapshot's document is JSON text on SQLite and an object on Postgres, so
 * parse only when it is a string. A row that is neither is corrupt, and saying
 * so beats handing back a string the caller will treat as a document.
 */
function parseVersionDocument(raw: unknown): unknown | ToolError {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { error: "The stored version document is not valid JSON." };
  }
}

function versionNumber(value: unknown): number | ToolError {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    return {
      error:
        "version must be a positive integer (use list_js_script_versions to see the available ones)."
    };
  }
  return n;
}

const listJsScriptVersions: CapabilityExport = {
  spec: listJsScriptVersionsSpec,
  impl: async (run, params) => {
    const script = await loadScript(run, params);
    if (isError(script)) return script;

    const { JsScriptVersion } = await import("@nodetool-ai/models");
    const limit = Math.max(
      1,
      Math.min(Number(params["limit"]) || DEFAULT_VERSION_LIMIT, MAX_VERSION_LIMIT)
    );
    const saveType = stringParam(params["save_type"]);
    const options: { limit: number; saveType?: string } = { limit };
    if (saveType) options.saveType = saveType;
    const versions = await JsScriptVersion.listForScript(script.id, options);
    return {
      js_script_id: script.id,
      name: script.name,
      versions: versions.map(toVersionListItem)
    };
  }
};

const getJsScriptVersion: CapabilityExport = {
  spec: getJsScriptVersionSpec,
  impl: async (run, params) => {
    const script = await loadScript(run, params);
    if (isError(script)) return script;

    const number = versionNumber(params["version"]);
    if (isError(number)) return number;

    const { JsScriptVersion } = await import("@nodetool-ai/models");
    const version = await JsScriptVersion.findByVersion(script.id, number);
    if (!version) {
      return {
        error: `JS script ${script.id} has no version ${number}. Call list_js_script_versions to see the available ones.`
      };
    }

    const document = parseVersionDocument(version.document);
    if (isError(document)) return document;

    return {
      js_script_id: script.id,
      ...toVersionListItem(version),
      document
    };
  }
};

const createJsScriptVersion: CapabilityExport = {
  spec: createJsScriptVersionSpec,
  impl: async (run, params) => {
    const script = await loadScript(run, params);
    if (isError(script)) return script;

    const { JsScriptVersion } = await import("@nodetool-ai/models");
    const version = await JsScriptVersion.snapshot(script, {
      saveType: "manual",
      name: stringParam(params["name"]) ?? null
    });
    return {
      ok: true,
      js_script_id: script.id,
      ...toVersionListItem(version)
    };
  }
};

const restoreJsScriptVersion: CapabilityExport = {
  spec: restoreJsScriptVersionSpec,
  impl: async (run, params) => {
    const script = await loadScript(run, params);
    if (isError(script)) return script;

    const number = versionNumber(params["version"]);
    if (isError(number)) return number;

    const { JsScript, JsScriptVersion } = await import("@nodetool-ai/models");
    const version = await JsScriptVersion.findByVersion(script.id, number);
    if (!version) {
      return {
        error: `JS script ${script.id} has no version ${number}. Call list_js_script_versions to see the available ones.`
      };
    }

    const document = parseVersionDocument(version.document);
    if (isError(document)) return document;

    // An old document is restored against today's schema, so what it used to
    // pass is not what it passes now. Errors refuse the restore; warnings ride
    // back with the restored script.
    const validation = await validateDocument(run, document);
    if (!validation.ok) {
      return {
        ok: false,
        restored: false,
        error:
          `Version ${number} does not validate against today's schema, so it ` +
          "was not restored: " +
          validation.errors.map((issue) => issue.message).join("; "),
        validation
      };
    }

    // Snapshot what is about to be overwritten first, so a restore is itself
    // undoable.
    const undo = await JsScriptVersion.snapshot(script, {
      saveType: "restore",
      name: `Before restore to v${number}`
    });

    const updated = await JsScript.updateFieldsIfUnchanged(
      script.id,
      script.updated_at,
      { document: JSON.stringify(document) }
    );
    if (!updated) {
      return {
        error:
          `JS script ${script.id} was modified while restoring version ` +
          `${number}; nothing was written. Retry the restore.`
      };
    }

    return {
      ok: true,
      restored: true,
      js_script_id: script.id,
      version: number,
      undo_version: undo.version,
      updated_at: updated.updated_at,
      validation
    };
  }
};

const deleteJsScriptVersion: CapabilityExport = {
  spec: deleteJsScriptVersionSpec,
  impl: async (run, params) => {
    const script = await loadScript(run, params);
    if (isError(script)) return script;

    const number = versionNumber(params["version"]);
    if (isError(number)) return number;

    const { JsScriptVersion } = await import("@nodetool-ai/models");
    const version = await JsScriptVersion.findByVersion(script.id, number);
    if (!version) {
      return {
        error: `JS script ${script.id} has no version ${number}. Call list_js_script_versions to see the available ones.`
      };
    }
    await version.delete();
    return { ok: true, js_script_id: script.id, version: number, deleted: true };
  }
};

export const JS_SCRIPT_CAPABILITIES: readonly CapabilityExport[] = [
  listJsScripts,
  getJsScript,
  saveJsScript,
  validateJsScript,
  runJsScript,
  testJsScript,
  listJsScriptVersions,
  getJsScriptVersion,
  createJsScriptVersion,
  restoreJsScriptVersion,
  deleteJsScriptVersion,
  deleteJsScript
];

export const module: CapabilityModule = {
  module: "js-scripts",
  exports: JS_SCRIPT_CAPABILITIES
};

export {
  listJsScripts,
  getJsScript,
  saveJsScript,
  validateJsScript,
  runJsScript,
  testJsScript,
  listJsScriptVersions,
  getJsScriptVersion,
  createJsScriptVersion,
  restoreJsScriptVersion,
  deleteJsScriptVersion,
  deleteJsScript
};
