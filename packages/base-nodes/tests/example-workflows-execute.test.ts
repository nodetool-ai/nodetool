/**
 * Executes every workflow example end-to-end with fully faked dependencies.
 *
 * Each workflow JSON under `nodetool/examples/nodetool-base/*.json` is:
 *   1. Prepared the way the editor prepares it before Run: empty model
 *      fields get the fake provider's model, and empty media inputs get a
 *      shipped sample. `support/example-run-preparation.ts` does this, and
 *      the native graph-runner harness uses the same file.
 *   2. Hydrated through `Graph.loadFromDict` against the live registry so
 *      unregistered nodes (Python-only, sibling packages) are dropped.
 *   3. Handed to a `WorkflowRunner` whose execution context is a
 *      {@link createFakeContext} — every provider call returns canned bytes
 *      from {@link FakeProvider}, storage is `InMemoryStorageAdapter`,
 *      `fetch` is a stub, secrets are stub strings, the workspace dir is a
 *      throwaway tmp directory.
 *   4. Run with a 30 s timeout.
 *
 * Every example must complete, except the few in {@link CANNOT_COMPLETE},
 * which must still fail so the list cannot go stale.
 *
 * No real provider is reachable: tests would fail loudly with a network
 * error if a fake leaked through.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WorkflowRunner, Graph } from "@nodetool-ai/kernel";
import {
  NodeRegistry,
  createGraphNodeTypeResolver,
  createSandboxModuleCatalog,
  discoverSandboxPack
} from "@nodetool-ai/node-sdk";
import {
  createFakeContext,
  loadMediaRefBytes,
  setProcessSandboxModuleCatalog,
  stubGlobalFetch
} from "@nodetool-ai/runtime";
import {
  resetDefaultStore,
  resetDefaultVectorProvider
} from "@nodetool-ai/vectorstore";
import { registerBaseNodes } from "../src/index.js";
import { collapseComfyGraph } from "@nodetool-ai/protocol";
import {
  CANNOT_COMPLETE,
  prepareForFakeRun,
  unrunnableNodeTypes
} from "./support/example-run-preparation.js";

// Nodes that bypass the ProcessingContext fetch indirection (e.g. SerpAPI
// search nodes) call `fetch` directly. Replace `globalThis.fetch` for the
// duration of the suite so no real outbound HTTP happens even when those
// nodes execute. Restored in afterAll.
let restoreFetch: (() => void) | null = null;
const originalVectorstoreDbPath = process.env.VECTORSTORE_DB_PATH;
const vectorstoreTempDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "nodetool-example-vectorstore-")
);
process.env.VECTORSTORE_DB_PATH = path.join(
  vectorstoreTempDir,
  "vectorstore.db"
);

// Shipped sample media (`package://nodetool-base/...`) resolves from this
// directory, the same files an install serves from its package-asset route.
const originalPackageAssetsDir = process.env.NODETOOL_PACKAGE_ASSETS_DIR;

/**
 * The host sandbox packs that example Code nodes import. The server builds
 * this catalog at startup; without it the import fails before the code runs.
 */
const SANDBOX_PACKS = ["sandbox-tokens"];

beforeAll(() => {
  restoreFetch = stubGlobalFetch();
  const packsRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../sandbox-packs"
  );
  setProcessSandboxModuleCatalog(
    createSandboxModuleCatalog(
      SANDBOX_PACKS.map((dir) => {
        const discovery = discoverSandboxPack(path.join(packsRoot, dir));
        if (discovery === undefined) {
          throw new Error(`${dir} is not a sandbox pack`);
        }
        return discovery;
      })
    )
  );
  process.env.NODETOOL_PACKAGE_ASSETS_DIR = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../nodetool/assets"
  );
});
afterAll(() => {
  restoreFetch?.();
  restoreFetch = null;
  setProcessSandboxModuleCatalog(null);
  resetDefaultVectorProvider();
  resetDefaultStore();
  if (originalPackageAssetsDir === undefined) {
    delete process.env.NODETOOL_PACKAGE_ASSETS_DIR;
  } else {
    process.env.NODETOOL_PACKAGE_ASSETS_DIR = originalPackageAssetsDir;
  }
  if (originalVectorstoreDbPath === undefined) {
    delete process.env.VECTORSTORE_DB_PATH;
  } else {
    process.env.VECTORSTORE_DB_PATH = originalVectorstoreDbPath;
  }
  fs.rmSync(vectorstoreTempDir, { recursive: true, force: true });
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = path.resolve(
  __dirname,
  "../nodetool/examples/nodetool-base"
);

const PER_WORKFLOW_TIMEOUT_MS = 30_000;

/**
 * Examples whose real media work outlasts the default timeout: reframing the
 * 8 s sample clip, rendering a timeline to video, and compositing two
 * full-size campaign artboards in the sandbox. Alone on one machine they take
 * 8–80 s. The CI nodes shard runs them beside the other package suites on
 * four cores, where the 30 s and 120 s limits expired, so each gets several
 * times its solo duration.
 */
const SLOW_WORKFLOW_TIMEOUT_MS: Record<string, number> = {
  "Compose Directed Campaign Formats.json": 120_000,
  "Cut a Landscape Clip for Vertical.json": 120_000,
  "Direct a Short Film.json": 300_000,
  "Directed Film to Timeline.json": 300_000
};

function timeoutFor(fileName: string): number {
  return SLOW_WORKFLOW_TIMEOUT_MS[fileName] ?? PER_WORKFLOW_TIMEOUT_MS;
}

interface WorkflowFile {
  fileName: string;
  data: {
    name?: string;
    graph: {
      nodes: Array<Record<string, unknown>>;
      edges: Array<Record<string, unknown>>;
    };
  };
}

function loadWorkflows(): WorkflowFile[] {
  return fs
    .readdirSync(EXAMPLES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((fileName) => {
      const raw = fs.readFileSync(path.join(EXAMPLES_DIR, fileName), "utf8");
      return { fileName, data: JSON.parse(raw) as WorkflowFile["data"] };
    });
}

/**
 * Examples containing a node that cannot finish under fakes. The node-type
 * sets and the reasons live in `support/example-run-preparation.ts`, shared
 * with the native graph-runner harness. Native Comfy graphs are classified
 * after `collapseComfyGraph`.
 */
function workflowIsUnrunnable(w: WorkflowFile): boolean {
  return unrunnableNodeTypes(collapseComfyGraph(w.data.graph)).length > 0;
}

const allWorkflows = loadWorkflows();
const workflows = allWorkflows.filter((w) => !workflowIsUnrunnable(w));
const skippedWorkflows = allWorkflows.filter(workflowIsUnrunnable);

const registry = new NodeRegistry();
registerBaseNodes(registry);
const resolver = createGraphNodeTypeResolver(registry);

interface ExecutionResult {
  status: "completed" | "failed" | "cancelled" | "errored";
  error?: string;
  outputs?: Record<string, unknown[]>;
  durationMs: number;
  nodesExecuted: number;
}

async function executeWorkflow(
  workflow: WorkflowFile
): Promise<ExecutionResult> {
  const fake = createFakeContext({
    jobId: `fake-${workflow.fileName}`
  });
  const prepared = prepareForFakeRun(workflow.data.graph);
  // Persist sample images so entity nodes and sandbox media readers receive
  // the same asset references as generated media, without embedded buffers.
  for (const [index, node] of prepared.nodes.entries()) {
    if (node.type !== "nodetool.input.ImageInput") {
      continue;
    }
    const data = node.data as Record<string, unknown>;
    const value = data.value as {
      type?: string;
      uri?: string;
      asset_id?: string | null;
      data?: unknown;
    };
    const bytes = await loadMediaRefBytes(value, fake.context);
    if (!bytes) {
      throw new Error(`Cannot load sample image for ${String(node.id)}`);
    }
    const extension = path.extname(value.uri ?? "") || ".png";
    const samplePath = path.join(fake.workspaceDir, `sample-image-${index}${extension}`);
    fs.writeFileSync(samplePath, bytes);
    const asset = await fake.context.sandboxToAsset(samplePath);
    data.value = { ...asset, uri: `${asset.uri}${extension}` };
  }
  const graph = await Graph.loadFromDict(prepared, {
    resolver,
    skipErrors: true,
    allowUndefinedProperties: true
  });

  const runner = new WorkflowRunner(`fake-${workflow.fileName}`, {
    resolveExecutor: (node) => {
      if (!registry.has(node.type)) {
        // Unknown node — pass-through stub so the run can still finish.
        return {
          async process(inputs: Record<string, unknown>) {
            return inputs;
          }
        };
      }
      return registry.resolve(node);
    },
    executionContext: fake.context
  });

  const start = Date.now();
  // Some nodes (e.g. SaveTextNode) write to `process.cwd()` instead of
  // resolving against the workspace dir. Chdir into the throwaway workspace
  // so any leaked writes land inside the temp folder that `fake.cleanup()`
  // tears down — without this the test pollutes the package root.
  // Because cwd is process-global, this test must run serially (no
  // `describe.concurrent`).
  const originalCwd = process.cwd();
  process.chdir(fake.workspaceDir);
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(`workflow exceeded ${timeoutFor(workflow.fileName)} ms`)
          ),
        timeoutFor(workflow.fileName)
      ).unref()
    );
    const runPromise = runner.run(
      { job_id: `fake-${workflow.fileName}` },
      { nodes: [...graph.nodes], edges: [...graph.edges] }
    );
    const result = await Promise.race([runPromise, timeoutPromise]);
    return {
      status: result.status,
      error: result.error,
      outputs: result.outputs,
      durationMs: Date.now() - start,
      nodesExecuted: graph.nodes.length
    };
  } catch (err) {
    return {
      status: "errored",
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
      nodesExecuted: graph.nodes.length
    };
  } finally {
    process.chdir(originalCwd);
    fake.cleanup();
  }
}

describe("example workflows execute end-to-end with fakes", () => {
  it("has workflows to execute", () => {
    expect(workflows.length).toBeGreaterThan(0);
  });

  it("lists only shipped examples as unable to complete", () => {
    const names = new Set(workflows.map((w) => w.fileName));
    for (const fileName of Object.keys(CANNOT_COMPLETE)) {
      expect(names.has(fileName), fileName).toBe(true);
    }
  });

  it.each(skippedWorkflows)(
    "skips $fileName because this harness cannot run it to completion",
    ({ fileName, data }) => {
      const unrunnable = unrunnableNodeTypes(collapseComfyGraph(data.graph));
      expect(unrunnable.length, fileName).toBeGreaterThan(0);
    }
  );
});

describe.each(workflows)(
  "execute $fileName",
  ({ fileName, data }) => {
    it(
      "runs to completion",
      async () => {
        const result = await executeWorkflow({ fileName, data });
        const reason = CANNOT_COMPLETE[fileName];
        if (reason === undefined) {
          expect(
            result.status,
            `${fileName} did not complete: ${result.error ?? ""}`
          ).toBe("completed");
          for (const [name, values] of Object.entries(result.outputs ?? {})) {
            expect(
              Array.isArray(values),
              `output "${name}" is not an array in ${fileName}`
            ).toBe(true);
          }
        } else {
          expect(
            result.status,
            `${fileName} now completes. Remove it from CANNOT_COMPLETE (${reason}).`
          ).not.toBe("completed");
        }
      },
      timeoutFor(fileName) + 5_000
    );
  }
);
