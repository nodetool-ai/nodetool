/**
 * The scalar call contract for sandbox WASM modules, and the facade generator
 * that expresses it as guest JavaScript.
 *
 * Everything here is pure and browser-safe. It sits in `protocol` because the
 * same answers are needed in three places that must not disagree: `node-sdk`
 * validates a pack's binary and folds the facade into the module digest,
 * `agents` mounts the facade and validates every call, and any host that
 * reports a skipped export quotes the reason from here.
 */

import type { SandboxWasmContract } from "./sandbox-package.js";
import {
  WASM_EXPORT_KIND,
  WASM_VALUE_TYPE,
  wasmExportKindName,
  wasmValueTypeName,
  type WasmExportEntry,
  type WasmSignature
} from "./wasm-binary.js";

/**
 * Budget ceilings for host WASM execution.
 *
 * Each number is both the default and the maximum: a pack manifest may lower
 * any of them, never raise one. `workerPoolSize` is process-wide and is not
 * manifest-configurable at all — it is a property of the host, not of a pack.
 */
export const SANDBOX_WASM_BUDGETS = {
  /** Workers shared by every invocation in the process. */
  workerPoolSize: 4,
  /** Calls one invocation may have in flight at once. */
  callConcurrency: 2,
  /** Calls one invocation may make in total. */
  callsPerInvocation: 256,
  /** Aggregate WASM wall clock one invocation may spend, in milliseconds. */
  wallClockMs: 30_000,
  /** Wall clock one call may spend before its worker is killed, in milliseconds. */
  callTimeoutMs: 5_000
} as const;

/** Longest parameter list the scalar contract accepts. */
export const SANDBOX_WASM_MAX_ARITY = 8;

/** Value types the scalar contract accepts, in argument and result position. */
export const SANDBOX_WASM_VALUE_TYPES: readonly number[] = [
  WASM_VALUE_TYPE.I32,
  WASM_VALUE_TYPE.F32,
  WASM_VALUE_TYPE.F64
];

/**
 * Why an export falls outside the scalar contract, or `undefined` when it does
 * not. The text completes the sentence "export `foo` …", so a caller reads
 * `${specifier}: export ${name} ${reason}`.
 */
export function wasmExportContractViolation(
  entry: WasmExportEntry | undefined,
  signature: WasmSignature | undefined
): string | undefined {
  if (entry === undefined) return "is missing from the binary";
  if (entry.kind !== WASM_EXPORT_KIND.FUNCTION) {
    return `is a ${wasmExportKindName(entry.kind)}, not a function`;
  }
  if (signature === undefined) return "has no signature in the binary";
  if (signature.parameters.length > SANDBOX_WASM_MAX_ARITY) {
    return `takes ${signature.parameters.length} parameters, above the ${SANDBOX_WASM_MAX_ARITY} the scalar contract allows`;
  }
  if (signature.results.length > 1) {
    return `returns ${signature.results.length} values (multi-value), and the scalar contract allows at most one`;
  }
  for (const [position, type] of signature.parameters.entries()) {
    const reason = valueTypeViolation(type);
    if (reason !== undefined) return `takes parameter ${position} that ${reason}`;
  }
  for (const type of signature.results) {
    const reason = valueTypeViolation(type);
    if (reason !== undefined) return `returns a value that ${reason}`;
  }
  return undefined;
}

function valueTypeViolation(type: number): string | undefined {
  if (SANDBOX_WASM_VALUE_TYPES.includes(type)) return undefined;
  if (type === WASM_VALUE_TYPE.I64) {
    return "uses i64, which maps to bigint rather than number";
  }
  if (type === WASM_VALUE_TYPE.V128) return "uses v128, a vector type";
  if (type === WASM_VALUE_TYPE.FUNCREF || type === WASM_VALUE_TYPE.EXTERNREF) {
    return `uses the reference type ${wasmValueTypeName(type)}`;
  }
  return `uses ${wasmValueTypeName(type)}, which is not i32, f32, or f64`;
}

/**
 * The facade generator's version.
 *
 * It joins a WASM module's content digest, so a change to the generated guest
 * surface invalidates a workflow's pinned digest the same way a change to the
 * binary does. Bump it whenever {@link generateSandboxWasmFacade} or
 * {@link SANDBOX_WASM_BRIDGE_SOURCE} changes what the guest sees.
 */
export const SANDBOX_WASM_FACADE_VERSION = 1;

/**
 * The guest-visible name the host parks the dispatcher on.
 *
 * It exists only between the init prelude and the entry module's first
 * statement — long enough for the bridge module to capture it while the static
 * graph evaluates, then deleted. The hiding is convenience; the dispatcher's
 * own checks are the boundary.
 */
export const SANDBOX_WASM_DISPATCH_GLOBAL = "__nodetoolWasmDispatch";

/**
 * The private bridge module every facade imports.
 *
 * Guest code cannot import it: the loader refuses the specifier from any
 * module that is not a generated facade, and the static analyzer refuses it in
 * authored source.
 */
export const SANDBOX_WASM_BRIDGE_SPECIFIER = "nodetool:wasm-bridge";

/**
 * The bridge module's source.
 *
 * It reads the dispatcher once, at module-evaluation time — which happens
 * while the entry module's static graph links, before the entry body deletes
 * the binding.
 */
export const SANDBOX_WASM_BRIDGE_SOURCE = `const __dispatch = globalThis.${SANDBOX_WASM_DISPATCH_GLOBAL};
export const __call = (moduleKey, exportName, args) => {
  if (typeof __dispatch !== "function") {
    throw new Error("the sandbox WASM bridge is unavailable in this run");
  }
  return __dispatch(moduleKey, exportName, args);
};
`;

/**
 * Generate the ESM facade for one WASM module.
 *
 * One named async export per manifest export, under the export's JavaScript
 * alias. Nothing else is exposed: no instance, no memory, no way to name a
 * module other than this one.
 */
export function generateSandboxWasmFacade(
  moduleKey: string,
  contract: SandboxWasmContract
): string {
  const body = contract.exports
    .map(
      (exported) =>
        `export async function ${exported.as}(...args) {\n  return __call(${JSON.stringify(moduleKey)}, ${JSON.stringify(exported.as)}, args);\n}`
    )
    .join("\n");
  return `import { __call } from ${JSON.stringify(SANDBOX_WASM_BRIDGE_SPECIFIER)};
${body}
`;
}
