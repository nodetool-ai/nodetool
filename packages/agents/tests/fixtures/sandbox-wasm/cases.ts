/**
 * The sandbox WASM contract fixtures, as data.
 *
 * They are a list rather than a set of `it()` bodies on purpose: the same
 * cases have to run in a real browser, and the shared fixture harness that
 * will replay them there is M2's, not this milestone's. Keeping the guest
 * source and the expected outcome as plain values lets that harness consume
 * this module unchanged — it needs `referenceWasmResolution()` and
 * `WASM_CONTRACT_CASES`, nothing else. The Node suites in
 * `packages/agents/tests/js-sandbox-wasm*.test.ts` drive the same list today.
 *
 * See README.md for the reference module's exports and its build script.
 */

import type {
  ResolvedSandboxModule,
  SandboxModuleResolution,
  SandboxWasmLimits
} from "@nodetool-ai/protocol";

import { referenceWasmBytes } from "./reference-bytes.js";

export const REFERENCE_SPECIFIER = "@acme/nodetool-ref/scalar";
export const REFERENCE_PACK = "@acme/nodetool-ref";
export const REFERENCE_MODULE_ID = "sandbox/reference.wasm";

const DIGEST = "b".repeat(64);

/** The reference module's manifest exports, `sum-f32` mapped to an identifier. */
export const REFERENCE_EXPORTS = [
  { wasm: "add", as: "add" },
  { wasm: "scale", as: "scale" },
  { wasm: "noop", as: "noop" },
  { wasm: "bump", as: "bump" },
  { wasm: "spin", as: "spin" },
  { wasm: "sum-f32", as: "sumF32" }
] as const;

/** The reference module as the catalog would resolve it for one run. */
export function referenceWasmModule(
  options: {
    specifier?: string;
    packName?: string;
    limits?: SandboxWasmLimits;
    contentDigest?: string;
  } = {}
): ResolvedSandboxModule {
  const bytes = referenceWasmBytes();
  return {
    specifier: options.specifier ?? REFERENCE_SPECIFIER,
    packName: options.packName ?? REFERENCE_PACK,
    contentDigest: options.contentDigest ?? DIGEST,
    moduleId: REFERENCE_MODULE_ID,
    kind: "wasm",
    bytes,
    wasm: {
      memoryPagesMax: 2,
      exports: REFERENCE_EXPORTS.map((exported) => ({ ...exported })),
      ...(options.limits === undefined ? {} : { limits: options.limits })
    },
    graph: [
      {
        id: REFERENCE_MODULE_ID,
        kind: "wasm",
        bytes,
        dependencies: [],
        internal: false
      }
    ]
  };
}

/** A one-module resolution around the reference module. */
export function referenceWasmResolution(
  options: Parameters<typeof referenceWasmModule>[0] = {}
): SandboxModuleResolution {
  return { modules: [referenceWasmModule(options)], statuses: [] };
}

/**
 * One contract case: guest source shaped like a Code node body, and what the
 * run must produce. `result` pins a successful run's value; `errorIncludes`
 * pins the substring a rejection's message must carry.
 */
interface SandboxWasmCase {
  readonly name: string;
  readonly code: string;
  readonly result?: unknown;
  readonly errorIncludes?: string;
}

const IMPORT = `import { add, scale, noop, bump, sumF32 } from "${REFERENCE_SPECIFIER}";`;

export const WASM_CONTRACT_CASES: readonly SandboxWasmCase[] = [
  {
    name: "i32 round trip through the facade",
    code: `${IMPORT}\nreturn await add(2, 40);`,
    result: 42
  },
  {
    name: "f64 round trip",
    code: `${IMPORT}\nreturn await scale(4);`,
    result: 10
  },
  {
    name: "f32 rounds by WebAssembly's rules",
    code: `${IMPORT}\nreturn await sumF32(0.5, 0.25);`,
    result: 0.75
  },
  {
    name: "a void export resolves undefined",
    code: `${IMPORT}\nreturn (await noop()) === undefined ? "undefined" : "something";`,
    result: "undefined"
  },
  {
    name: "an as-mapped name is callable and its wasm name is not",
    code: `${IMPORT}\nreturn typeof sumF32;`,
    result: "function"
  },
  {
    name: "instance per call: a mutable global never carries over",
    code: `${IMPORT}\nreturn [await bump(), await bump(), await bump()].join(",");`,
    result: "1,1,1"
  },
  {
    name: "a negative i32 argument round trips",
    code: `${IMPORT}\nreturn await add(-5, 3);`,
    result: -2
  },
  {
    name: "an out-of-range i32 rejects instead of wrapping",
    code: `${IMPORT}\ntry { await add(2147483648, 0); return "no error"; } catch (e) { return e.message; }`,
    errorIncludes: "expects i32"
  },
  {
    name: "a non-integer i32 rejects",
    code: `${IMPORT}\ntry { await add(1.5, 0); return "no error"; } catch (e) { return e.message; }`,
    errorIncludes: "expects i32"
  },
  {
    name: "a non-number argument rejects",
    code: `${IMPORT}\ntry { await add("2", 3); return "no error"; } catch (e) { return e.message; }`,
    errorIncludes: "expects i32"
  },
  {
    name: "the wrong argument count rejects",
    code: `${IMPORT}\ntry { await add(1); return "no error"; } catch (e) { return e.message; }`,
    errorIncludes: "takes 2 arguments, received 1"
  },
  {
    name: "the private bridge module cannot be imported",
    code: `import { __call } from "nodetool:wasm-bridge";\nreturn typeof __call;`,
    errorIncludes: "private to the sandbox's generated WASM facades"
  },
  {
    name: "the dispatcher binding is gone before user code runs",
    code: `${IMPORT}\nreturn typeof globalThis.__nodetoolWasmDispatch;`,
    result: "undefined"
  },
  {
    name: "an undeclared WASM specifier does not resolve",
    code: `import { add } from "@other/nodetool-pack/scalar";\nreturn typeof add;`,
    errorIncludes: "is not a sandbox package declared by this node"
  }
];
