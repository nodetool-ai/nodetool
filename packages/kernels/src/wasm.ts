/**
 * The WebAssembly backend: instantiates the embedded module and runs a kernel
 * call by copying each buffer argument into the module's linear memory.
 */
import type { KernelArg, KernelBackend } from "./backend.js";

interface KernelExports {
  memory: WebAssembly.Memory;
  malloc(size: number): number;
  free(ptr: number): void;
  _initialize?: () => void;
  [name: string]: unknown;
}

/** errno ENOSYS: the module's abort path may try to print, and cannot. */
const ENOSYS = 52;

/**
 * The imports the standalone module declares. They serve only libc++'s abort
 * path, which a kernel never takes for valid arguments.
 */
const IMPORTS: WebAssembly.Imports = {
  env: {
    emscripten_notify_memory_growth: () => undefined
  },
  wasi_snapshot_preview1: {
    fd_close: () => ENOSYS,
    fd_write: () => ENOSYS,
    fd_seek: () => ENOSYS
  }
};

const BASE64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Decodes standard base64, without depending on atob or Buffer. */
export function decodeBase64(text: string): Uint8Array<ArrayBuffer> {
  const table = new Uint8Array(128);
  for (let i = 0; i < BASE64.length; i++) table[BASE64.charCodeAt(i)] = i;
  const clean = text.replace(/=+$/, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i++) {
    value = (value << 6) | table[clean.charCodeAt(i)];
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (value >> bits) & 0xff;
    }
  }
  return out;
}

function bytesOf(array: Uint8Array | Float32Array | Float64Array): Uint8Array {
  return new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
}

/** Instantiates the kernel module from its bytes. */
export async function instantiateWasmKernels(
  bytes: Uint8Array<ArrayBuffer>
): Promise<KernelBackend> {
  const module = await WebAssembly.compile(bytes);
  const instance = await WebAssembly.instantiate(module, IMPORTS);
  const exports = instance.exports as unknown as KernelExports;
  exports._initialize?.();

  return {
    kind: "wasm",
    call(name: string, args: readonly KernelArg[]): number {
      const fn = exports[name];
      if (typeof fn !== "function") {
        throw new Error(`The kernel module has no function ${name}`);
      }
      const allocations: number[] = [];
      try {
        const params: number[] = [];
        const buffers: { ptr: number; arg: Exclude<KernelArg, number | null> }[] = [];
        for (const arg of args) {
          if (typeof arg === "number") {
            params.push(arg);
          } else if (arg === null) {
            params.push(0);
          } else {
            const array = "in" in arg ? arg.in : "out" in arg ? arg.out : arg.inout;
            const ptr = exports.malloc(Math.max(1, array.byteLength));
            if (ptr === 0) {
              throw new Error(`The kernel module is out of memory (${array.byteLength} bytes)`);
            }
            allocations.push(ptr);
            params.push(ptr);
            buffers.push({ ptr, arg });
          }
        }
        // malloc may grow the memory, which replaces its buffer, so the
        // view is taken after the last allocation.
        const heap = new Uint8Array(exports.memory.buffer);
        for (const { ptr, arg } of buffers) {
          if ("in" in arg) heap.set(bytesOf(arg.in), ptr);
          else if ("inout" in arg) heap.set(bytesOf(arg.inout), ptr);
        }
        const result = (fn as (...p: number[]) => number | undefined)(...params);
        const after = new Uint8Array(exports.memory.buffer);
        for (const { ptr, arg } of buffers) {
          const target = "out" in arg ? arg.out : "inout" in arg ? arg.inout : null;
          if (target) bytesOf(target).set(after.subarray(ptr, ptr + target.byteLength));
        }
        return result ?? 0;
      } finally {
        for (const ptr of allocations) exports.free(ptr);
      }
    }
  };
}
