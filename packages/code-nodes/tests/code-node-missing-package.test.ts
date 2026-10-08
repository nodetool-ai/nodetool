/**
 * A Code node whose host module cannot load its optional package.
 *
 * The guest sees only the message. The node must still fail with the runtime
 * package id, because that id is what makes the editor offer the install.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { CodeNode, setCodeNodeTools } from "@nodetool-ai/code-nodes";
import {
  SANDBOX_HOST_MODULES,
  missingRuntimePackageOf,
  type ResolvedSandboxModule
} from "@nodetool-ai/protocol";
import { refuseSandboxDelivery } from "@nodetool-ai/runtime";
import type { ProcessingContext, SandboxModuleCatalog } from "@nodetool-ai/runtime";

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

const XLSX = SANDBOX_HOST_MODULES["xlsx"];
if (XLSX === undefined) throw new Error("no xlsx host module");

const XLSX_MODULE: ResolvedSandboxModule = {
  specifier: XLSX.packName,
  packName: XLSX.packName,
  packVersion: "0.0.0-test",
  contentDigest: "b".repeat(64),
  moduleId: "host:xlsx",
  kind: "host",
  hostId: "xlsx",
  graph: []
};

const catalog: SandboxModuleCatalog = {
  summaries: () => [],
  diagnostics: () => [],
  authorizeDelivery: (moduleId) =>
    Promise.resolve(refuseSandboxDelivery(moduleId)),
  resolveForExecution: () => ({ modules: [XLSX_MODULE], statuses: [] })
};

function context(): ProcessingContext {
  return {
    sandboxModuleCatalog: catalog,
    workflowId: "wf_1",
    postMessage: () => {}
  } as unknown as ProcessingContext;
}

setCodeNodeTools([]);
afterEach(() => {
  setCodeNodeTools([]);
});

describe("CodeNode — missing optional package", () => {
  it("fails with the runtime package the host module needs", async () => {
    const node = new CodeNode({
      code: `import { parse } from "${XLSX.packName}";
             return { out: await parse(new Uint8Array([1, 2, 3])) };`
    });
    node.__node_id = "code_1";

    const error = await node.process(context()).then(
      () => null,
      (cause: unknown) => cause
    );

    expect(error).toBeInstanceOf(Error);
    expect(missingRuntimePackageOf(error)).toBe("office-documents");
    expect((error as Error).message).toContain("Office Documents");
  });
});
