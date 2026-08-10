/**
 * The scalar contract's shared vocabulary: budget ceilings, skip reasons, and
 * the generated facade every host mounts.
 */

import { describe, expect, it } from "vitest";

import {
  generateSandboxWasmFacade,
  parseWasmBinary,
  SANDBOX_WASM_BRIDGE_SPECIFIER,
  SANDBOX_WASM_BUDGETS,
  SandboxWasmLimitsSchema,
  wasmExportContractViolation,
  WASM_EXPORT_KIND,
  WASM_VALUE_TYPE
} from "../src/index.js";

describe("sandbox WASM budgets", () => {
  it("treats every default as the ceiling a manifest may only lower", () => {
    expect(
      SandboxWasmLimitsSchema.parse({
        callTimeoutMs: 100,
        callConcurrency: 1,
        callsPerInvocation: 10,
        wallClockMs: 1000
      })
    ).toEqual({
      callTimeoutMs: 100,
      callConcurrency: 1,
      callsPerInvocation: 10,
      wallClockMs: 1000
    });
    for (const [key, value] of Object.entries(SANDBOX_WASM_BUDGETS)) {
      if (key === "workerPoolSize") continue;
      expect(() => SandboxWasmLimitsSchema.parse({ [key]: value + 1 })).toThrow();
      expect(() => SandboxWasmLimitsSchema.parse({ [key]: 0 })).toThrow();
    }
  });
});

describe("sandbox WASM skip reasons", () => {
  const signature = (parameters: number[], results: number[]) => ({ parameters, results });
  const fn = { kind: WASM_EXPORT_KIND.FUNCTION, index: 0 };

  it("names the offending rule rather than calling a signature unsupported", () => {
    expect(wasmExportContractViolation(undefined, undefined)).toBe(
      "is missing from the binary"
    );
    expect(
      wasmExportContractViolation({ kind: WASM_EXPORT_KIND.MEMORY, index: 0 }, undefined)
    ).toBe("is a memory, not a function");
    expect(
      wasmExportContractViolation({ kind: WASM_EXPORT_KIND.GLOBAL, index: 0 }, undefined)
    ).toBe("is a global, not a function");
    expect(
      wasmExportContractViolation(fn, signature([WASM_VALUE_TYPE.I64], []))
    ).toMatch(/uses i64, which maps to bigint/);
    expect(
      wasmExportContractViolation(fn, signature([WASM_VALUE_TYPE.V128], []))
    ).toMatch(/uses v128/);
    expect(
      wasmExportContractViolation(fn, signature([WASM_VALUE_TYPE.EXTERNREF], []))
    ).toMatch(/reference type externref/);
    expect(
      wasmExportContractViolation(
        fn,
        signature([], [WASM_VALUE_TYPE.I32, WASM_VALUE_TYPE.I32])
      )
    ).toMatch(/multi-value/);
    expect(
      wasmExportContractViolation(fn, signature(Array(9).fill(WASM_VALUE_TYPE.I32), []))
    ).toMatch(/takes 9 parameters/);
  });

  it("accepts the three scalar types in either position, and a void result", () => {
    expect(
      wasmExportContractViolation(
        fn,
        signature([WASM_VALUE_TYPE.I32, WASM_VALUE_TYPE.F32, WASM_VALUE_TYPE.F64], [])
      )
    ).toBeUndefined();
    expect(
      wasmExportContractViolation(fn, signature([], [WASM_VALUE_TYPE.F64]))
    ).toBeUndefined();
  });
});

describe("generated WASM facade", () => {
  it("exposes one async export per alias and nothing else", () => {
    const facade = generateSandboxWasmFacade("@acme/pack/scalar", {
      memoryPagesMax: 1,
      exports: [
        { wasm: "add", as: "add" },
        { wasm: "sum-f32", as: "sumF32" }
      ]
    });
    expect(facade).toContain(`import { __call } from "${SANDBOX_WASM_BRIDGE_SPECIFIER}"`);
    expect(facade).toContain("export async function add(...args)");
    expect(facade).toContain("export async function sumF32(...args)");
    // The binary's own name is never a guest-visible export.
    expect(facade).not.toContain("export async function sum-f32");
    expect(facade).toContain('"@acme/pack/scalar"');
  });
});

describe("WASM binary reader", () => {
  it("refuses a binary that is not WebAssembly", () => {
    expect(() => parseWasmBinary(new Uint8Array([1, 2, 3, 4]))).toThrow(
      /truncated|invalid WASM magic/
    );
  });
});
