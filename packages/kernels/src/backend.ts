/**
 * The one call shape that every kernel host implements: the WebAssembly
 * module in Node and the browser, and the graph runner's native `kernels`
 * capability. The typed API in `index.ts` builds these calls.
 */

/** A typed array a kernel reads. */
export interface KernelInput {
  readonly in: Uint8Array | Float32Array | Float64Array;
}

/** A typed array a kernel writes. Its prior contents are not read. */
export interface KernelOutput {
  readonly out: Uint8Array | Float32Array | Float64Array;
}

/** A typed array a kernel reads and writes, such as carried filter state. */
export interface KernelInOut {
  readonly inout: Uint8Array | Float32Array | Float64Array;
}

/**
 * One argument of a kernel call, in the order of the C declaration in
 * `native/kernels/include/nodetool/kernels.h`. A number passes a scalar and
 * `null` passes a null pointer.
 */
export type KernelArg = KernelInput | KernelOutput | KernelInOut | number | null;

/** A host that runs a kernel of `kernels.h` by name. */
export interface KernelBackend {
  /** Which host this is, for logs and benches. */
  readonly kind: "wasm" | "native";
  /** Runs the C function `name` and returns its integer result (0 for void). */
  call(name: string, args: readonly KernelArg[]): number;
}

/** NT_OK and NT_ERR_ARGS of kernels.h. */
export const NT_OK = 0;
export const NT_ERR_ARGS = -1;
