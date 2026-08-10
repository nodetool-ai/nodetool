/**
 * The scalar WASM contract at discovery time (M4, Task 1).
 *
 * Two things are under test: that every rejection names the export and the
 * rule it broke rather than saying "unsupported", and that a validated module
 * carries its normalized call contract — exports, memory ceiling, lowered
 * budgets — into the catalog for the host to enforce at call time.
 */

import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

import { SandboxPackManifestSchema } from "@nodetool-ai/protocol";

import { discoverSandboxPack } from "../src/index.js";

const REFERENCE = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "agents",
    "tests",
    "fixtures",
    "sandbox-wasm",
    "reference.wasm"
  )
);

const REFERENCE_EXPORTS = [
  "add",
  "scale",
  "noop",
  "bump",
  "spin",
  { wasm: "sum-f32", as: "sumF32" }
];

function referencePack(module: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "sandbox-wasm-contract-"));
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "@acme/nodetool-ref",
      version: "1.0.0",
      nodetool: {
        apiVersion: 1,
        sandboxModules: [
          { name: "scalar", kind: "wasm", file: "sandbox/reference.wasm", ...module }
        ]
      }
    })
  );
  mkdirSync(join(dir, "sandbox"), { recursive: true });
  writeFileSync(join(dir, "sandbox", "reference.wasm"), REFERENCE);
  return dir;
}

describe("sandbox WASM scalar contract", () => {
  it("carries the normalized call contract into the discovered module", () => {
    const discovery = discoverSandboxPack(
      referencePack({ memoryPagesMax: 2, exports: REFERENCE_EXPORTS })
    );
    const module = discovery?.modules[0];
    expect(module?.kind).toBe("wasm");
    expect(module?.wasm?.memoryPagesMax).toBe(2);
    expect(module?.wasm?.exports).toEqual([
      { wasm: "add", as: "add" },
      { wasm: "scale", as: "scale" },
      { wasm: "noop", as: "noop" },
      { wasm: "bump", as: "bump" },
      { wasm: "spin", as: "spin" },
      { wasm: "sum-f32", as: "sumF32" }
    ]);
  });

  it("names the rule and the export in every skip reason", () => {
    const cases: [unknown[], RegExp][] = [
      [["mem"], /export mem is a memory, not a function/],
      [["missing"], /export missing is missing from the binary/],
      // A binary name that is not an identifier must use `{wasm, as}`; the
      // bare string form never reaches discovery.
      [["sum-f32"], /must be a valid JavaScript identifier/]
    ];
    for (const [exports, message] of cases) {
      expect(() =>
        discoverSandboxPack(referencePack({ memoryPagesMax: 2, exports }))
      ).toThrowError(message);
    }
  });

  it("rejects a manifest whose alias is not a usable identifier", () => {
    // The schema is the first gate; discovery re-checks so a caller that
    // bypassed it is still refused.
    expect(() =>
      SandboxPackManifestSchema.parse({
        apiVersion: 1,
        sandboxModules: [
          {
            name: "scalar",
            kind: "wasm",
            file: "x.wasm",
            memoryPagesMax: 1,
            exports: [{ wasm: "sum-f32", as: "sum-f32" }]
          }
        ]
      })
    ).toThrow();
  });

  it("lets a manifest lower a budget but never raise one", () => {
    const lowered = discoverSandboxPack(
      referencePack({
        memoryPagesMax: 2,
        exports: ["add"],
        limits: { callTimeoutMs: 250, callsPerInvocation: 4 }
      })
    );
    expect(lowered?.modules[0]?.wasm?.limits).toEqual({
      callTimeoutMs: 250,
      callsPerInvocation: 4
    });

    for (const limits of [
      { callTimeoutMs: 5001 },
      { callConcurrency: 3 },
      { callsPerInvocation: 257 },
      { wallClockMs: 30_001 }
    ]) {
      expect(() =>
        discoverSandboxPack(
          referencePack({ memoryPagesMax: 2, exports: ["add"], limits })
        )
      ).toThrowError(/invalid nodetool.sandboxModules manifest/);
    }
  });

  it("changes a WASM module's digest when its lowered budgets change", () => {
    const base = discoverSandboxPack(
      referencePack({ memoryPagesMax: 2, exports: ["add"] })
    );
    const tightened = discoverSandboxPack(
      referencePack({
        memoryPagesMax: 2,
        exports: ["add"],
        limits: { callsPerInvocation: 1 }
      })
    );
    expect(base?.modules[0]?.digest).not.toBe(tightened?.modules[0]?.digest);
  });
});
