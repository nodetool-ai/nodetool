/**
 * Input caps every host module shares, and the loader its library comes from.
 *
 * The caps are here rather than in the sandbox because they belong to the
 * implementation, not to the import path: a guest that reaches papaparse
 * through `@nodetool-ai/sandbox-csv` gets the same refusal a bridge used to
 * give, and there is no second route around it.
 */

import { importOptionalModule } from "@nodetool-ai/config";
import { isRecord, isString } from "../utils/type-guards.js";

/** Largest text payload a host module accepts, in characters. */
export const MAX_HOST_INPUT_CHARS = 5 * 1024 * 1024;

/** Largest binary payload a host module accepts, in bytes. */
export const MAX_HOST_INPUT_BYTES = 10 * 1024 * 1024;

/** Check a positional text argument, or throw the guest a named error. */
export function requireText(
  where: string,
  value: unknown,
  label = "text"
): string {
  if (!isString(value)) {
    throw new Error(`${where}: ${label} must be a string`);
  }
  if (value.length > MAX_HOST_INPUT_CHARS) {
    throw new Error(
      `${where}: input exceeds the ${MAX_HOST_INPUT_CHARS} character limit`
    );
  }
  return value;
}

/** Check a positional byte argument, or throw the guest a named error. */
export function requireBytes(
  where: string,
  value: unknown,
  label = "bytes"
): Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw new Error(
      `${where}: ${label} must be a Uint8Array (e.g. from workspace.readBytes or response.bytes())`
    );
  }
  if (value.length > MAX_HOST_INPUT_BYTES) {
    throw new Error(
      `${where}: input exceeds the ${MAX_HOST_INPUT_BYTES} byte limit`
    );
  }
  return value;
}

/** An options bag argument, defaulted and type-checked in one place. */
export function optionsOf(value: unknown): Record<string, unknown> {
  return isRecord(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Resolve the module object a host implementation needs from a lazily imported
 * package, unwrapping a CJS `default` interop wrapper.
 *
 * Every import below is dynamic and inside the implementation: nothing loads
 * until guest code calls one, and no library reaches a bundle's entry graph.
 * They are NOT hidden from the bundler — esbuild inlines them into the packaged
 * backend's single-file `server.mjs`, and Vite resolves the browser build for
 * the in-browser runner, where the "host" is the page.
 */
export function unwrapLibrary<T>(
  mod: unknown,
  where: string,
  specifier: string,
  isModule: (value: unknown) => boolean
): T {
  const candidate =
    mod && !isModule(mod) ? (mod as { default?: unknown }).default : mod;
  if (!isModule(candidate)) {
    throw new Error(
      `${where}: the "${specifier}" library is not available in this runtime`
    );
  }
  return candidate as T;
}

/**
 * Import a library that is not guaranteed to be present, and report its absence
 * the way {@link unwrapLibrary} reports a wrong shape.
 *
 * `importOptionalModule` hides the specifier from every bundler and falls back
 * to a user-managed `node_modules`, which is what the on-demand libraries need
 * — a native addon (better-sqlite3) that must not enter a browser graph, and
 * the model packages a slim server image does not ship. Its failure is a
 * resolver error naming a path, so it is restated here in the caller's terms.
 */
export async function importOptionalLibrary<T>(
  where: string,
  specifier: string
): Promise<T> {
  try {
    return await importOptionalModule<T>(specifier);
  } catch {
    throw new Error(
      `${where}: the "${specifier}" library is not available in this runtime`
    );
  }
}
