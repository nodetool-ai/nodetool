import type { FrontendToolManifestEntry } from "../lib/tools/frontendTools";
import { isRecord } from "../utils/typePredicates";

/**
 * Reading what `FrontendToolRegistry` publishes and returns, in tests.
 *
 * The registry is a `Map` keyed by name, so it erases every tool's declared
 * `Result` and publishes its parameters as a bare JSON-Schema dictionary. A
 * test that wants to read either has to say which shape it expects; these two
 * make that a check rather than a claim.
 */

/**
 * Reads a `ui_*` tool's return value. Naming the keys is what makes it a
 * check: a tool that stops returning `node_id` fails here saying so, instead
 * of surfacing as `expect(undefined).toBe("node-1")` further down.
 */
export function toolResult<T extends object>(
  value: unknown,
  ...keys: Array<Extract<keyof T, string>>
): T {
  if (!isRecord(value)) {
    throw new Error(`expected a tool result object, got ${JSON.stringify(value)}`);
  }
  const missing = keys.filter((key) => !(key in value));
  if (missing.length > 0) {
    throw new Error(
      `tool result is missing ${missing.join(", ")} — it has ${
        Object.keys(value).join(", ") || "no keys"
      }`
    );
  }
  // SAFETY: `value` is an object carrying every key the caller named, and `T`
  // is the shape the called tool declares for those keys.
  return value as T;
}

/** The JSON Schema a tool's parameters are published as in the manifest. */
export interface ToolParameterSchema {
  type?: string;
  description?: string;
  properties?: Record<string, ToolParameterSchema>;
  required?: string[];
  items?: ToolParameterSchema;
  enum?: unknown[];
}

/**
 * Reads the parameter schema `getManifest()` publishes for one tool, failing
 * with the name it looked for instead of `undefined` at the first expectation.
 */
export function toolSchema(
  manifest: readonly FrontendToolManifestEntry[],
  name: string
): ToolParameterSchema {
  const entry = manifest.find((tool) => tool.name === name);
  if (!entry) {
    throw new Error(
      `no tool named ${name} in the manifest of ${manifest.length}`
    );
  }
  // SAFETY: every manifest entry's `parameters` came from `zodToJsonSchema`,
  // which emits a JSON Schema object; `JsonSchema` is only declared as a bare
  // dictionary because it also carries keywords this reader does not name.
  return entry.parameters as ToolParameterSchema;
}
