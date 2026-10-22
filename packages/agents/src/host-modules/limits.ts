/**
 * Input caps every host module shares, and the loader its library comes from.
 *
 * The caps are here rather than in the sandbox because they belong to the
 * implementation, not to the import path: a guest that reaches papaparse
 * through `@nodetool-ai/sandbox-csv` gets the same refusal a bridge used to
 * give, and there is no second route around it.
 */

import { importOptionalModule } from "@nodetool-ai/config";
import {
  missingRuntimePackageError,
  type RuntimePackageId
} from "@nodetool-ai/protocol";
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

/** Total uncompressed size a host module inflates from one zip before refusing. */
export const MAX_UNZIP_TOTAL_BYTES = 50 * 1024 * 1024;

/** Entry count a host module accepts from one zip before refusing. */
export const MAX_UNZIP_ENTRIES = 10_000;

/**
 * An fflate `unzipSync` filter that refuses an archive before inflating it.
 * fflate calls the filter with each entry's declared size before inflating
 * that entry, and inflates into a buffer of that size, so the sum here bounds
 * host memory. Checking sizes after `unzipSync` returns bounds nothing.
 */
export function boundedUnzipFilter(
  where: string
): (file: { originalSize: number }) => boolean {
  let total = 0;
  let entries = 0;
  return (file) => {
    entries += 1;
    if (entries > MAX_UNZIP_ENTRIES) {
      throw new Error(`${where}: archive has more than ${MAX_UNZIP_ENTRIES} entries`);
    }
    total += file.originalSize;
    if (total > MAX_UNZIP_TOTAL_BYTES) {
      throw new Error(
        `${where}: archive inflates past the ${MAX_UNZIP_TOTAL_BYTES} byte limit`
      );
    }
    return true;
  };
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
 * The small libraries are NOT hidden from the bundler — esbuild inlines them
 * into the packaged backend's single-file `server.mjs`. The large ones come
 * through {@link importOptionalLibrary} and are installed on demand.
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
 * Import a library that is not guaranteed to be present.
 *
 * `importOptionalModule` hides the specifier from every bundler and falls back
 * to a user-managed `node_modules`, which is what the on-demand libraries need
 * — a native addon (better-sqlite3) that must not enter a browser graph, and
 * the document, PDF and model packages the desktop app installs only when a
 * run first needs them. With a `runtimePackage`, absence is a
 * `MissingRuntimePackageError` the editor turns into an install prompt;
 * without one it is restated in the caller's terms.
 */
export async function importOptionalLibrary<T>(
  where: string,
  specifier: string,
  runtimePackage?: RuntimePackageId
): Promise<T> {
  try {
    return await importOptionalModule<T>(specifier);
  } catch (cause) {
    if (runtimePackage !== undefined) {
      throw missingRuntimePackageError(specifier, runtimePackage, cause);
    }
    throw new Error(
      `${where}: the "${specifier}" library is not available in this runtime`
    );
  }
}
