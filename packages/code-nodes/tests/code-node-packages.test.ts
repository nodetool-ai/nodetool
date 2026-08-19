/**
 * Code node sandbox packages: the body's own imports, resolved through the
 * host's catalog and mounted in the guest.
 *
 * The catalog is the only door — a body that imports nothing gets no loader, an
 * import a catalog cannot serve fails the node before the guest starts, and
 * version drift only warns, because resolution uses what is installed.
 */
import { describe, it, expect, afterEach } from "vitest";
import { CodeNode, setCodeNodeTools } from "@nodetool-ai/code-nodes";
import type {
  ResolvedSandboxModule,
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
 * A catalog serving `@acme/geo` — with `versionMoved`, serving it with a drift
 * warning — and refusing every other specifier.
 */
function catalog(options: { versionMoved?: boolean } = {}): SandboxModuleCatalog {
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
        if (options.versionMoved === true) {
          statuses.push({
            packName: GEO.packName,
            specifier: GEO.specifier,
            status: "warning",
            code: "version-mismatch",
            message: `Sandbox module ${GEO.specifier} was saved with an older pack version.`
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

function node(code: string): CodeNode {
  const instance = new CodeNode({ code });
  instance.__node_id = "code_1";
  return instance;
}

setCodeNodeTools([]);
afterEach(() => {
  setCodeNodeTools([]);
});

describe("CodeNode — sandbox packages", () => {
  it("imports a module the body names and returns its result", async () => {
    const result = await node(
      'import { label } from "@acme/geo";\nreturn { out: label(7) };'
    ).process(contextWith(catalog()));
    expect(result).toEqual({ out: "geo:7" });
  });

  it("mounts nothing when the body imports nothing", async () => {
    const result = await node(
      'try { await import("@acme/geo"); return { out: "loaded" }; }' +
        ' catch (e) { return { out: "denied" }; }'
    ).process(contextWith(catalog()));
    expect(result).toEqual({ out: "denied" });
  });

  it("ignores a leftover `packages` property from a saved graph", async () => {
    const instance = new CodeNode({
      code: 'import { label } from "@acme/geo";\nreturn { out: label(7) };',
      packages: [{ specifier: "@stale/pack" }]
    });
    instance.__node_id = "code_1";
    expect(await instance.process(contextWith(catalog()))).toEqual({
      out: "geo:7"
    });
  });

  it("fails the node when this process has no catalog", async () => {
    await expect(
      node(
        'import { label } from "@acme/geo";\nreturn { out: label(1) };'
      ).process(contextWith(null))
    ).rejects.toThrow(/not available in this process/);
  });

  it("fails the node when no context reaches it at all", async () => {
    await expect(
      node(
        'import { label } from "@acme/geo";\nreturn { out: label(1) };'
      ).process()
    ).rejects.toThrow(/not available in this process/);
  });

  it("fails the node naming an unknown specifier and its pack", async () => {
    await expect(
      node('import { x } from "@nope/pack";\nreturn { out: x };').process(
        contextWith(catalog())
      )
    ).rejects.toThrow(/@nope\/pack is not installed.*@acme\/nodetool-missing/);
  });

  it("warns on version drift on the node log without failing the run", async () => {
    const posted: Posted[] = [];
    const result = await node(
      'import { label } from "@acme/geo";\nreturn { out: label(1) };'
    ).process(contextWith(catalog({ versionMoved: true }), posted));
    expect(result).toEqual({ out: "geo:1" });
    const warning = posted.find(
      (message) =>
        message.type === "log_update" &&
        String(message.content).includes("@acme/nodetool-geo")
    );
    expect(warning?.severity).toBe("warning");
  });

  it("streams from a body that imports a module", async () => {
    const streaming = node(
      'import { label } from "@acme/geo";\nfor (const n of [1, 2]) yield({ out: label(n) });'
    );
    const chunks: Record<string, unknown>[] = [];
    for await (const chunk of streaming.genProcess(contextWith(catalog()))) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual([{ out: "geo:1" }, { out: "geo:2" }]);
  });

  it("runs an import-free body without touching the catalog", async () => {
    const result = await node("return { out: 1 };").process(contextWith(null));
    expect(result).toEqual({ out: 1 });
  });
});
