/**
 * Resolves a JS-script debug target into a document plus its name.
 *
 * A script is named two ways, and both end up in the same shape:
 *
 * - a **JSON file** — either a bare `JsScriptDocument` or a wrapper carrying
 *   one under `document`, as the `js_scripts` row and the `jsScripts.get`
 *   response do;
 * - a **`js_scripts` row id**, read through an injected loader so this module
 *   needs no database.
 *
 * A path that exists on disk wins over an id, so a file named like an id is
 * still readable.
 */
import { existsSync, readFileSync } from "node:fs";
import type { JsScriptDebugTarget } from "@nodetool-ai/execution/js-script-debug";

/** A decoded JSON document, before anything validates its shape. */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };


/** A `js_scripts` row as the harness needs it. */
export interface JsScriptRecord {
  id: string;
  name?: string | null;
  /** The stored document — a JSON string or an already-parsed object. */
  document: unknown;
}

export interface JsScriptTargetDeps {
  /** Load a script by DB id. */
  loadScript: (id: string) => Promise<JsScriptRecord | null>;
}

export interface ResolvedJsScriptTarget {
  target: JsScriptDebugTarget;
  /** The document exactly as loaded — validation's input, unrepaired. */
  raw: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The document a target carries, unwrapping a `document` field (string or
 * object) when there is one. Never throws — an unreadable document is a
 * validation finding, not a crash.
 */
function documentOf(raw: unknown): JsonValue {
  // SAFETY: a target is read from a JSON file or a json column, so every
  // branch below carries decoded JSON.
  if (!isRecord(raw)) return raw as JsonValue;
  const inner = raw.document;
  if (typeof inner === "string") {
    try {
      return JSON.parse(inner);
    } catch {
      return inner;
    }
  }
  // SAFETY: same JSON provenance as the branch above.
  if (inner !== undefined) return inner as JsonValue;
  return raw as JsonValue;
}

/** A document is anything carrying a `code` string and a `schemaVersion`. */
const looksLikeDocument = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.code === "string" &&
  value.schemaVersion !== undefined;

/** Resolve a JS-script target: a JSON file path or a `js_scripts` row id. */
export async function resolveJsScriptTarget(
  ref: string,
  deps: JsScriptTargetDeps
): Promise<ResolvedJsScriptTarget> {
  if (existsSync(ref)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(ref, "utf8"));
    } catch (e) {
      throw new Error(`${ref} is not valid JSON: ${(e as Error).message}`);
    }
    const raw = documentOf(parsed);
    if (!looksLikeDocument(raw)) {
      throw new Error(
        `${ref} is not a JS script document (no \`schemaVersion\`/\`code\`, and no \`document\` field carrying them).`
      );
    }
    const name =
      isRecord(parsed) && typeof parsed.name === "string"
        ? parsed.name
        : undefined;
    return { target: { kind: "file", ref, ...(name ? { name } : {}) }, raw };
  }

  const record = await deps.loadScript(ref);
  if (!record) {
    throw new Error(`JS script not found: ${ref}`);
  }
  return {
    target: { kind: "id", ref, ...(record.name ? { name: record.name } : {}) },
    raw: documentOf(record)
  };
}
