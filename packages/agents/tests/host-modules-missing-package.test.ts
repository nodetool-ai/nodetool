/**
 * A host module whose optional package is not installed.
 *
 * The guest receives only the error message, so the run result is how the
 * package id reaches the Code node, which turns it into the install prompt.
 */
import { describe, it, expect, vi } from "vitest";
import {
  SANDBOX_HOST_MODULES,
  type ResolvedSandboxModule,
  type SandboxModuleResolution
} from "@nodetool-ai/protocol";

import { runInSandbox } from "../src/js-sandbox.js";

vi.mock("@nodetool-ai/config", async (importOriginal) => {
  const original = await importOriginal<typeof import("@nodetool-ai/config")>();
  return {
    ...original,
    importOptionalModule: vi.fn(async (specifier: string) => {
      if (specifier === "exceljs") {
        throw new Error("Cannot find package 'exceljs'");
      }
      return original.importOptionalModule(specifier);
    })
  };
});

function resolution(id: string): SandboxModuleResolution {
  const spec = SANDBOX_HOST_MODULES[id];
  if (spec === undefined) throw new Error(`no host module ${id}`);
  const module: ResolvedSandboxModule = {
    specifier: spec.packName,
    packName: spec.packName,
    packVersion: "0.0.0-test",
    contentDigest: "b".repeat(64),
    moduleId: `host:${id}`,
    kind: "host",
    hostId: id,
    graph: []
  };
  return { modules: [module], statuses: [] };
}

describe("host module with a missing optional package", () => {
  it("fails the run and names the runtime package to install", async () => {
    const result = await runInSandbox({
      code: `import { parse } from "@nodetool-ai/sandbox-xlsx";
             return await parse(new Uint8Array([1, 2, 3]));`,
      modules: resolution("xlsx"),
      timeoutMs: 20000
    });

    expect(result.success).toBe(false);
    expect(result.missingRuntimePackage).toBe("office-documents");
    expect(result.error).toContain("Office Documents");
  });

  it("names nothing when the guest catches the failure and finishes", async () => {
    const result = await runInSandbox({
      code: `import { parse } from "@nodetool-ai/sandbox-xlsx";
             try { await parse(new Uint8Array([1, 2, 3])); }
             catch (e) { return "handled: " + e.message; }`,
      modules: resolution("xlsx"),
      timeoutMs: 20000
    });

    expect(result.success).toBe(true);
    expect(result.missingRuntimePackage).toBeUndefined();
    expect(String(result.result)).toContain("handled:");
  });
});
