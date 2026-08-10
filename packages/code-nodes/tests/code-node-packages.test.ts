/**
 * Code node `packages`: declared sandbox modules, resolved through the host's
 * catalog and mounted in the guest.
 *
 * The catalog is the only door — a node that declares nothing imports nothing,
 * a declaration a catalog cannot serve fails the node before the guest starts,
 * and version drift only warns, because resolution uses what is installed.
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { SANDBOX_MODULES_V1_FLAG } from "@nodetool-ai/config";
import { CodeNode, setCodeNodeTools } from "@nodetool-ai/code-nodes";
import type {
  ResolvedSandboxModule,
  SandboxModuleDeclaration,
  SandboxModuleStatus
} from "@nodetool-ai/protocol";
import { refuseSandboxDelivery } from "@nodetool-ai/runtime";
import type { ProcessingContext, SandboxModuleCatalog } from "@nodetool-ai/runtime";

const DIGEST = "b".repeat(64);

const GEO: ResolvedSandboxModule = {
  specifier: "@acme/geo",
  packName: "@acme/nodetool-geo",
  packVersion: "2.0.0",
  contentDigest: DIGEST,
  moduleId: "sandbox/geo.js",
  kind: "js",
  source: "export const label = (n) => `geo:${n}`;",
  graph: [
    {
      id: "sandbox/geo.js",
      kind: "js",
      source: "export const label = (n) => `geo:${n}`;",
      dependencies: [],
      internal: false
    }
  ]
};

/**
 * A catalog serving `@acme/geo`, warning when a declaration pins an older pack
 * version, and refusing everything else.
 */
function catalog(): SandboxModuleCatalog {
  return {
    summaries: () => [],
    diagnostics: () => [],
    authorizeDelivery: (moduleId) =>
      Promise.resolve(refuseSandboxDelivery(moduleId)),
    resolveForExecution: (declarations) => {
      const modules: ResolvedSandboxModule[] = [];
      const statuses: SandboxModuleStatus[] = [];
      for (const declaration of declarations) {
        if (declaration.specifier !== GEO.specifier) {
          statuses.push({
            packName: "@acme/nodetool-missing",
            specifier: declaration.specifier,
            status: "error",
            code: "module-not-found",
            message: `Sandbox module ${declaration.specifier} is not installed.`
          });
          continue;
        }
        if (
          declaration.resolvedPackVersion !== undefined &&
          declaration.resolvedPackVersion !== GEO.packVersion
        ) {
          statuses.push({
            packName: GEO.packName,
            specifier: GEO.specifier,
            status: "warning",
            code: "version-mismatch",
            message: `Sandbox module ${GEO.specifier} was saved with pack version ${declaration.resolvedPackVersion}.`
          });
        }
        modules.push(GEO);
      }
      return { modules, statuses };
    }
  };
}

interface Posted {
  type?: string;
  severity?: string;
  content?: string;
}

/** A context carrying only what the Code node reads from one. */
function contextWith(
  sandboxModuleCatalog: SandboxModuleCatalog | null,
  posted: Posted[] = []
): ProcessingContext {
  return {
    sandboxModuleCatalog,
    workflowId: "wf_1",
    postMessage: (message: Posted) => posted.push(message)
  } as unknown as ProcessingContext;
}

function node(
  code: string,
  packages: (string | SandboxModuleDeclaration)[]
): CodeNode {
  const instance = new CodeNode({ code, packages });
  instance.__node_id = "code_1";
  return instance;
}

setCodeNodeTools([]);
// Imports are a flagged path; these cases are about what happens once a host
// has opted in. The refusal while it is off has its own case below.
beforeEach(() => {
  process.env[SANDBOX_MODULES_V1_FLAG] = "1";
});
afterEach(() => {
  setCodeNodeTools([]);
  delete process.env[SANDBOX_MODULES_V1_FLAG];
});

describe("CodeNode — sandbox packages", () => {
  it("imports a declared module and returns its result", async () => {
    const result = await node(
      'import { label } from "@acme/geo";\nreturn { out: label(7) };',
      ["@acme/geo"]
    ).process(contextWith(catalog()));
    expect(result).toEqual({ out: "geo:7" });
  });

  it("mounts nothing when the node declares nothing", async () => {
    const result = await node(
      'try { await import("@acme/geo"); return { out: "loaded" }; }' +
        ' catch (e) { return { out: "denied" }; }',
      []
    ).process(contextWith(catalog()));
    expect(result).toEqual({ out: "denied" });
  });

  it("fails the node when this process has no catalog", async () => {
    await expect(
      node('import { label } from "@acme/geo";\nreturn { out: label(1) };', [
        "@acme/geo"
      ]).process(contextWith(null))
    ).rejects.toThrow(/not available in this process/);
  });

  it("fails the node when no context reaches it at all", async () => {
    await expect(
      node('import { label } from "@acme/geo";\nreturn { out: label(1) };', [
        "@acme/geo"
      ]).process()
    ).rejects.toThrow(/not available in this process/);
  });

  it("fails the node naming an unknown specifier and its pack", async () => {
    await expect(
      node('import { x } from "@nope/pack";\nreturn { out: x };', [
        "@nope/pack"
      ]).process(contextWith(catalog()))
    ).rejects.toThrow(/@nope\/pack is not installed.*@acme\/nodetool-missing/);
  });

  it("rejects a `packages` entry that is not a declaration", async () => {
    const instance = new CodeNode({
      code: "return { out: 1 };",
      packages: [{ nope: true }]
    });
    await expect(instance.process(contextWith(catalog()))).rejects.toThrow(
      /Invalid `packages` declaration/
    );
  });

  it("warns on version drift on the node log without failing the run", async () => {
    const posted: Posted[] = [];
    const result = await node(
      'import { label } from "@acme/geo";\nreturn { out: label(1) };',
      [{ specifier: "@acme/geo", resolvedPackVersion: "1.0.0" }]
    ).process(contextWith(catalog(), posted));
    expect(result).toEqual({ out: "geo:1" });
    const warning = posted.find((message) => message.type === "log_update");
    expect(warning?.severity).toBe("warning");
    expect(warning?.content).toContain("@acme/nodetool-geo");
  });

  it("streams from a body that imports a declared module", async () => {
    const streaming = node(
      'import { label } from "@acme/geo";\nfor (const n of [1, 2]) yield({ out: label(n) });',
      ["@acme/geo"]
    );
    const chunks: Record<string, unknown>[] = [];
    for await (const chunk of streaming.genProcess(contextWith(catalog()))) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual([{ out: "geo:1" }, { out: "geo:2" }]);
  });

  it("refuses a declaration while the parity flag is off", async () => {
    delete process.env[SANDBOX_MODULES_V1_FLAG];
    await expect(
      node('import { label } from "@acme/geo";\nreturn { out: label(1) };', [
        "@acme/geo"
      ]).process(contextWith(catalog()))
    ).rejects.toThrow(/NODETOOL_SANDBOX_MODULES_V1=1/);
  });

  it("runs an import-free body with the flag off", async () => {
    delete process.env[SANDBOX_MODULES_V1_FLAG];
    const result = await node("return { out: 1 };", []).process(
      contextWith(catalog())
    );
    expect(result).toEqual({ out: 1 });
  });
});
