/**
 * JS script documents — the wire schema and the document-level check.
 *
 * A JS script is a named, versioned script with declared ports, secrets, a
 * timeout, and saved test cases. It declares no packages: the body's imports
 * are resolved against whatever packs this install has. The document is stored
 * whole and validated here at every boundary: the model's `beforeSave`, the
 * tRPC router, and the run endpoint.
 *
 * What this file deliberately does NOT check: anything that needs to parse the
 * body. Syntax, imports, undefined names and unreachable output handles come
 * from `validateCodeNodeBody` in `@nodetool-ai/node-sdk`, which the capability
 * layer wraps. Keeping the body analysis out of here is what lets the model
 * layer validate a document without depending on the node SDK.
 */

import { z } from "zod";
import { isNumber, isRecord, isString } from "../predicates.js";

/** The only document version that exists. */
export const JS_SCRIPT_SCHEMA_VERSION = 1;

export const JS_SCRIPT_DEFAULT_TIMEOUT_SECONDS = 30;

/** Matches the sandbox harness ceiling (`MAX_TIMEOUT_SECONDS`). */
export const JS_SCRIPT_MAX_TIMEOUT_SECONDS = 120;

/** A port name has to be readable as `inputs.<name>` inside the body. */
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

// ── Document ────────────────────────────────────────────────────────────────

/** One declared port: the name the body reads or writes, and its NodeTool type. */
export const jsScriptPort = z.object({
  name: z.string().min(1),
  /** A TypeMetadata type name ("str", "int", "list[str]", "ImageRef", …). */
  type: z.string().min(1)
});
export type JsScriptPort = z.infer<typeof jsScriptPort>;

/** One saved case, the shape `test_code` grades. */
export const jsScriptTestCase = z.object({
  name: z.string().min(1),
  inputs: z.record(z.string(), z.unknown()).default({}),
  /**
   * Items staged per input handle for a body that reads its inputs with
   * `stream`. The body runs once and pulls them; a buffered body uses `inputs`
   * instead.
   */
  inputStreams: z.record(z.string(), z.array(z.unknown())).optional(),
  /** Per-handle structural compare against the run's final outputs. */
  expect: z.record(z.string(), z.unknown()).optional(),
  /** The `emit` calls the run must make, in order. */
  expectedStreamed: z
    .array(z.object({ name: z.string(), value: z.unknown() }))
    .optional()
});
export type JsScriptTestCase = z.infer<typeof jsScriptTestCase>;

/**
 * Menu placement for a script its owner exposed as a custom node. Absent means
 * the script stays a library script; the node's title, description and ports
 * come from the document itself, so `category` is the only knob here.
 */
export const jsScriptPalette = z.object({
  /** Free-text grouping under the `user` namespace, e.g. "Text", "My API". */
  category: z.string()
});
export type JsScriptPalette = z.infer<typeof jsScriptPalette>;

export const jsScriptDocument = z.object({
  schemaVersion: z.literal(JS_SCRIPT_SCHEMA_VERSION),
  /** What the script does — how an agent picks one out of a list. */
  description: z.string().default(""),
  /** The body. Outputs leave through `emit`/`output`, never through `return`. */
  code: z.string().default(""),
  inputs: z.array(jsScriptPort).default([]),
  outputs: z.array(jsScriptPort).default([]),
  /** Secret names the body may read. `[]` means none. */
  secrets: z.array(z.string()).default([]),
  timeoutSeconds: z
    .number()
    .positive()
    .max(JS_SCRIPT_MAX_TIMEOUT_SECONDS)
    .default(JS_SCRIPT_DEFAULT_TIMEOUT_SECONDS),
  tests: z.array(jsScriptTestCase).default([]),
  /** Set to expose the script in the node menu as a custom node. */
  palette: jsScriptPalette.optional()
});
export type JsScriptDocument = z.infer<typeof jsScriptDocument>;

export function emptyJsScriptDocument(): JsScriptDocument {
  return {
    schemaVersion: JS_SCRIPT_SCHEMA_VERSION,
    description: "",
    code: "",
    inputs: [],
    outputs: [],
    secrets: [],
    timeoutSeconds: JS_SCRIPT_DEFAULT_TIMEOUT_SECONDS,
    tests: []
  };
}

// ── Document-level validation ───────────────────────────────────────────────

interface JsScriptDocumentIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
}

function checkPorts(
  ports: readonly JsScriptPort[],
  kind: "input" | "output",
  issues: JsScriptDocumentIssue[]
): void {
  const seen = new Set<string>();
  for (const port of ports) {
    if (!IDENTIFIER.test(port.name)) {
      issues.push({
        severity: "error",
        code: "js_script_port_name",
        message: `${kind} "${port.name}" is not a valid identifier`
      });
    }
    if (seen.has(port.name)) {
      issues.push({
        severity: "error",
        code: "js_script_duplicate_port",
        message: `duplicate ${kind} port "${port.name}"`
      });
    }
    seen.add(port.name);
  }
}

/**
 * Check a document's shape and internal consistency. Returns issues rather
 * than throwing: the router and the editor render them, and `assertValid…`
 * below is what turns errors into a refusal.
 */
export function validateJsScriptDocument(
  document: unknown
): JsScriptDocumentIssue[] {
  const parsed = jsScriptDocument.safeParse(document);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => ({
      severity: "error" as const,
      code: "js_script_schema",
      message: `${issue.path.join(".") || "document"}: ${issue.message}`
    }));
  }
  const doc = parsed.data;
  const issues: JsScriptDocumentIssue[] = [];

  checkPorts(doc.inputs, "input", issues);
  checkPorts(doc.outputs, "output", issues);

  for (const name of doc.secrets) {
    if (name.trim() === "") {
      issues.push({
        severity: "error",
        code: "js_script_secret_name",
        message: "a declared secret name is empty"
      });
    }
  }

  const inputNames = new Set(doc.inputs.map((port) => port.name));
  const outputNames = new Set(doc.outputs.map((port) => port.name));
  const testNames = new Set<string>();
  for (const testCase of doc.tests) {
    if (testNames.has(testCase.name)) {
      issues.push({
        severity: "error",
        code: "js_script_duplicate_test",
        message: `duplicate test case name "${testCase.name}"`
      });
    }
    testNames.add(testCase.name);

    for (const key of Object.keys(testCase.inputs)) {
      if (!inputNames.has(key)) {
        issues.push({
          severity: "error",
          code: "js_script_test_input",
          message: `test "${testCase.name}" sets undeclared input "${key}"`
        });
      }
    }
    for (const key of Object.keys(testCase.inputStreams ?? {})) {
      if (!inputNames.has(key)) {
        issues.push({
          severity: "error",
          code: "js_script_test_input",
          message: `test "${testCase.name}" stages a stream for undeclared input "${key}"`
        });
      }
    }
    for (const key of Object.keys(testCase.expect ?? {})) {
      if (!outputNames.has(key)) {
        issues.push({
          severity: "error",
          code: "js_script_test_output",
          message: `test "${testCase.name}" expects undeclared output "${key}"`
        });
      }
    }
    for (const entry of testCase.expectedStreamed ?? []) {
      if (!outputNames.has(entry.name)) {
        issues.push({
          severity: "error",
          code: "js_script_test_output",
          message: `test "${testCase.name}" expects a stream from undeclared output "${entry.name}"`
        });
      }
    }
  }

  if (doc.palette) {
    if (doc.palette.category.trim() === "") {
      issues.push({
        severity: "error",
        code: "js_script_palette_category",
        message: "the palette category is empty"
      });
    }
    if (doc.outputs.length === 0) {
      issues.push({
        severity: "warning",
        code: "js_script_palette_no_outputs",
        message:
          "the script is exposed in the node menu but declares no outputs, " +
          "so the node has no handles to connect"
      });
    }
  }

  if (doc.tests.length === 0) {
    issues.push({
      severity: "warning",
      code: "js_script_no_tests",
      message: "the script has no saved test cases"
    });
  }

  return issues;
}

/** Throw when a document carries any error-severity issue. */
export function assertValidJsScriptDocument(document: unknown): void {
  const errors = validateJsScriptDocument(document).filter(
    (issue) => issue.severity === "error"
  );
  if (errors.length > 0) {
    throw new Error(
      `invalid js script document: ${errors
        .map((issue) => issue.message)
        .join("; ")}`
    );
  }
}

// ── Linking a pinned version ────────────────────────────────────────────────

/**
 * A pinned reference to one script version. A Code node stores this in its
 * `script` property and a mini-app operation stores it in its target: both pin
 * the version, because a graph whose behavior changes when someone edits a
 * shared script is a debugging trap.
 */
export interface JsScriptLink {
  id: string;
  version: number;
}

/** What a resolver answers with: the pinned version's document plus identity. */
export interface ResolvedJsScript {
  id: string;
  name: string;
  version: number;
  document: JsScriptDocument;
}

/**
 * Resolve a pinned link to its document. Implemented by the models layer over
 * `js_script_versions` and installed process-wide by the host; a process with
 * no database (the browser runner) has none, and every consumer must handle
 * that rather than guess.
 */
export interface JsScriptResolver {
  resolve(
    link: JsScriptLink,
    userId?: string
  ): Promise<ResolvedJsScript | null>;
}

/**
 * Read a stored `{id, version}` link, or null when the value is absent or does
 * not carry both. An empty object is how an unlinked node stores "no script".
 */
export function parseJsScriptLink(value: unknown): JsScriptLink | null {
  if (!isRecord(value)) {
    return null;
  }
  const record = value;
  const id = record.id;
  const version = record.version;
  if (!isString(id) || id.trim() === "") return null;
  if (!isNumber(version) || !Number.isInteger(version)) return null;
  return { id: id.trim(), version };
}

// ── API shapes ──────────────────────────────────────────────────────────────

export const jsScriptResponse = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  document: jsScriptDocument,
  createdAt: z.string(),
  updatedAt: z.string()
});
export type JsScriptResponse = z.infer<typeof jsScriptResponse>;

export const jsScriptListItem = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  description: z.string(),
  inputs: z.array(jsScriptPort),
  outputs: z.array(jsScriptPort),
  updatedAt: z.string()
});
export type JsScriptListItem = z.infer<typeof jsScriptListItem>;

export const createJsScriptInput = z.object({
  /** Client-minted id: the create is then idempotent and the tab addressable. */
  id: z.string().optional(),
  name: z.string().min(1).default("Untitled script"),
  projectId: z.string().default("default"),
  document: jsScriptDocument.optional()
});
export type CreateJsScriptInput = z.infer<typeof createJsScriptInput>;

export const patchJsScriptInput = z
  .object({
    name: z.string().min(1).optional(),
    document: jsScriptDocument.optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });
export type PatchJsScriptInput = z.infer<typeof patchJsScriptInput>;

// ── Version history ─────────────────────────────────────────────────────────

export const jsScriptVersionSaveType = z.enum([
  "manual",
  "autosave",
  "restore"
]);
export type JsScriptVersionSaveType = z.infer<typeof jsScriptVersionSaveType>;

export const jsScriptVersionListItem = z.object({
  id: z.string(),
  version: z.number().int(),
  name: z.string().nullable().optional(),
  saveType: jsScriptVersionSaveType,
  createdAt: z.string()
});
export type JsScriptVersionListItem = z.infer<typeof jsScriptVersionListItem>;

export const jsScriptVersionResponse = jsScriptVersionListItem.extend({
  document: z.unknown()
});
export type JsScriptVersionResponse = z.infer<typeof jsScriptVersionResponse>;

export const listJsScriptVersionsInput = z.object({
  id: z.string(),
  limit: z.number().int().positive().max(500).optional(),
  saveType: jsScriptVersionSaveType.optional()
});
export type ListJsScriptVersionsInput = z.infer<
  typeof listJsScriptVersionsInput
>;

export const getJsScriptVersionInput = z.object({
  id: z.string(),
  version: z.number().int()
});
export type GetJsScriptVersionInput = z.infer<typeof getJsScriptVersionInput>;

export const createJsScriptVersionInput = z.object({
  id: z.string(),
  name: z.string().max(200).optional()
});
export type CreateJsScriptVersionInput = z.infer<
  typeof createJsScriptVersionInput
>;

export const restoreJsScriptVersionInput = z.object({
  id: z.string(),
  version: z.number().int()
});
export type RestoreJsScriptVersionInput = z.infer<
  typeof restoreJsScriptVersionInput
>;

export const deleteJsScriptVersionInput = z.object({
  id: z.string(),
  version: z.number().int()
});
export type DeleteJsScriptVersionInput = z.infer<
  typeof deleteJsScriptVersionInput
>;

/** What `restore` answers with: the document plus what re-validating it found. */
export const restoreJsScriptVersionResponse = z.object({
  script: jsScriptResponse,
  issues: z.array(
    z.object({
      severity: z.enum(["error", "warning"]),
      code: z.string(),
      message: z.string()
    })
  )
});
export type RestoreJsScriptVersionResponse = z.infer<
  typeof restoreJsScriptVersionResponse
>;

// ── Run endpoint (POST /api/js-scripts/:id/run) ─────────────────────────────

export const runJsScriptRequest = z.object({
  inputs: z.record(z.string(), z.unknown()).default({}),
  /**
   * Items staged per input handle for a body that reads `stream`. Wire names
   * in this surface are snake_case, matching `run_code`'s own field.
   */
  input_streams: z.record(z.string(), z.array(z.unknown())).optional()
});
export type RunJsScriptRequest = z.infer<typeof runJsScriptRequest>;

export const runJsScriptResponse = z.object({
  ok: z.boolean(),
  outputs: z.record(z.string(), z.unknown()).optional(),
  streamed: z.array(z.unknown()).optional(),
  logs: z.array(z.string()),
  error: z.string().optional(),
  duration_ms: z.number()
});
export type RunJsScriptResponse = z.infer<typeof runJsScriptResponse>;
