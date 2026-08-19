/**
 * WASM sandbox modules end to end: a Code-node-shaped `runInSandbox` call with
 * a declared WASM module, reaching the reference binary through its generated
 * facade, on a real worker.
 *
 * The happy-path and rejection cases come from
 * `fixtures/sandbox-wasm/cases.ts` as data, so the shared browser harness M2
 * builds can replay the same list without copying assertions.
 */

import { afterAll, describe, expect, it } from "vitest";
import type { SandboxModuleResolution } from "@nodetool-ai/protocol";

import { runInSandbox } from "../src/js-sandbox.js";
import { resetSandboxWasmWorkerPool } from "../src/wasm-sandbox/host.js";
import {
  referenceWasmModule,
  referenceWasmResolution,
  REFERENCE_SPECIFIER,
  WASM_CONTRACT_CASES
} from "./fixtures/sandbox-wasm/cases.js";

const TIMEOUT_MS = 30_000;

afterAll(() => {
  resetSandboxWasmWorkerPool();
});

async function run(code: string, modules: SandboxModuleResolution) {
  return runInSandbox({ code, modules, timeoutMs: TIMEOUT_MS });
}

describe("sandbox WASM contract cases", () => {
  const modules = referenceWasmResolution();
  for (const testCase of WASM_CONTRACT_CASES) {
    it(
      testCase.name,
      async () => {
        const result = await run(testCase.code, modules);
        if (testCase.errorIncludes !== undefined) {
          // A rejection either unwinds the run (an import denial) or is caught
          // by the guest and returned as a message; both must name the rule.
          const text = result.success ? String(result.result) : String(result.error);
          expect(text).toContain(testCase.errorIncludes);
          return;
        }
        expect(result.error).toBeUndefined();
        expect(result.result).toEqual(testCase.result);
      },
      TIMEOUT_MS
    );
  }
});

describe("sandbox WASM boundary", () => {
  it(
    "denies a facade for a pack the run did not declare",
    async () => {
      const result = await run(
        `import { add } from "@acme/nodetool-ref/scalar";\nreturn await add(1, 2);`,
        {
          modules: [
            referenceWasmModule({
              specifier: "@other/nodetool-pack/scalar",
              packName: "@other/nodetool-pack"
            })
          ],
          statuses: []
        }
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("is not a sandbox package this run serves");
    },
    TIMEOUT_MS
  );

  it(
    "gives a pack module that grabs the dispatcher nothing beyond the run's surface",
    async () => {
      // Authored pack JavaScript evaluates while the entry's static graph
      // links — before the binding is deleted — so it can capture the
      // dispatcher. The dispatcher's own checks are what stop it.
      const probeSource = `const grabbed = globalThis.__nodetoolWasmDispatch;
export const reach = async (key, name, args) => {
  if (typeof grabbed !== "function") return "no dispatcher";
  try { return String(await grabbed(key, name, args)); } catch (e) { return e.message; }
};`;
      const modules: SandboxModuleResolution = {
        modules: [
          referenceWasmModule(),
          {
            specifier: "@acme/nodetool-ref/probe",
            packName: "@acme/nodetool-ref",
            contentDigest: "c".repeat(64),
            moduleId: "sandbox/probe.js",
            kind: "js",
            source: probeSource,
            graph: [
              {
                id: "sandbox/probe.js",
                kind: "js",
                source: probeSource,
                dependencies: [],
                internal: false
              }
            ]
          }
        ],
        statuses: []
      };
      const result = await run(
        `import { reach } from "@acme/nodetool-ref/probe";
return [
  await reach("@evil/pack/x", "add", [1, 2]),
  await reach(${JSON.stringify(REFERENCE_SPECIFIER)}, "spin", []),
  await reach(${JSON.stringify(REFERENCE_SPECIFIER)}, "add", [1, 2])
].join(" | ");`,
        modules
      );
      expect(result.success).toBe(true);
      const text = String(result.result);
      expect(text).toContain("is not a WASM sandbox module this run serves");
      // `spin` is declared, so reaching it is allowed — and bounded.
      expect(text).toContain("per-call timeout");
      // Nothing beyond the run's declared surface: the declared call still works.
      expect(text.endsWith("3")).toBe(true);
    },
    TIMEOUT_MS
  );

  it(
    "kills and replaces the worker when a declared export never returns",
    async () => {
      const result = await run(
        `import { spin, add } from "${REFERENCE_SPECIFIER}";
let first;
try { await spin(); first = "no error"; } catch (e) { first = e.message; }
return first + " | " + (await add(20, 22));`,
        referenceWasmResolution({ limits: { callTimeoutMs: 2_000 } })
      );
      expect(result.success).toBe(true);
      expect(String(result.result)).toContain("terminated and replaced");
      // The replacement worker serves the next call, so the run continues.
      expect(String(result.result).endsWith("42")).toBe(true);
    },
    TIMEOUT_MS
  );

  it(
    "stops a run that exhausts its call budget, naming the budget and module",
    async () => {
      const result = await run(
        `import { bump } from "${REFERENCE_SPECIFIER}";
await bump();
await bump();
try { await bump(); return "no error"; } catch (e) { return e.message; }`,
        referenceWasmResolution({ limits: { callsPerInvocation: 2 } })
      );
      expect(result.success).toBe(true);
      expect(String(result.result)).toContain(REFERENCE_SPECIFIER);
      expect(String(result.result)).toContain("budget of 2 WASM calls per invocation");
    },
    TIMEOUT_MS
  );
});
