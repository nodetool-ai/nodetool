/**
 * Executes every workflow example end-to-end with fully faked dependencies.
 *
 * Each workflow JSON under `nodetool/examples/nodetool-base/*.json` is:
 *   1. Prepared the way the editor prepares it before Run: empty model
 *      fields get the fake provider's model, and empty media inputs get a
 *      shipped sample.
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
  setProcessSandboxModuleCatalog,
  stubGlobalFetch
} from "@nodetool-ai/runtime";
import {
  resetDefaultStore,
  resetDefaultVectorProvider
} from "@nodetool-ai/vectorstore";
import { registerBaseNodes } from "../src/index.js";

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
 * Examples whose real ffmpeg work outlasts the default timeout: denoising the
 * 8 s sample clip, and rendering a timeline to video.
 */
const SLOW_WORKFLOW_TIMEOUT_MS: Record<string, number> = {
  "Denoise Footage.json": 120_000,
  "Direct a Short Film.json": 120_000,
  "Directed Film to Timeline.json": 120_000
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
 * Node types that bypass the provider abstraction and open real network
 * connections (WebSocket, raw HTTP) using API keys directly. The fake
 * context cannot intercept these — running them would either time out
 * or hit the real endpoint with a junk key. Workflows that contain any
 * of these nodes are skipped.
 */
const NETWORK_BYPASSING_NODES = new Set<string>([
  "openai.agents.RealtimeAgent",
  "openai.agents.LiveAgent"
]);

/**
 * Trigger nodes whose adapter listens forever. Their `genProcess` waits on a
 * live scheduler or filesystem watcher, and this harness supplies neither — so
 * the run never ends and only stops at the per-workflow timeout, burning 30 s
 * to learn nothing. That is a property of the node, not a fault in the
 * workflow: an interval trigger left at `max_events: 0` is *supposed* to tick
 * forever.
 *
 * Only the two adapter-backed triggers qualify. Webhook and manual triggers
 * have no `genProcess` to loop in, so they finish immediately and stay in the
 * executed set.
 *
 * Delivered-event coverage for all four lives in `trigger-examples-run.test.ts`,
 * which wakes the node with an event instead of waiting for an adapter.
 */
const NON_TERMINATING_NODES = new Set<string>([
  "nodetool.triggers.IntervalTrigger",
  "nodetool.triggers.FileWatchTrigger"
]);

function workflowIsUnrunnable(w: WorkflowFile): boolean {
  return (w.data.graph?.nodes ?? []).some(
    (n) =>
      typeof n.type === "string" &&
      (NETWORK_BYPASSING_NODES.has(n.type as string) ||
        NON_TERMINATING_NODES.has(n.type as string))
  );
}

/**
 * Sample media for an input the example ships empty. A person picks a file
 * before running these; the harness picks one of the shipped samples.
 */
const SAMPLE_MEDIA: Record<string, { type: string; uri: string }> = {
  "nodetool.input.ImageInput": {
    type: "image",
    uri: "package://nodetool-base/recipe-inputs/coffee.jpg"
  },
  "nodetool.input.AudioInput": {
    type: "audio",
    uri: "package://nodetool-base/recipe-inputs/voice.wav"
  },
  "nodetool.input.VideoInput": {
    type: "video",
    uri: "package://nodetool-base/recipe-inputs/presenter.mp4"
  }
};

function isEmptyModel(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.type === "string" &&
    v.type.endsWith("_model") &&
    !v.provider &&
    !v.id
  );
}

function isEmptyMedia(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return !v.uri && !v.asset_id && !v.data;
}

/**
 * Do what the editor does before a person presses Run. Examples ship model
 * fields empty, and the app fills each from the user's default model
 * (`web/src/utils/applyDefaultModels.ts`); here every empty model becomes
 * a fake one. The provider id names the node because a FakeProvider answers
 * tool calls once per instance, and the context caches one per id: two
 * ListGenerators sharing an id would leave the second with no items. Media
 * inputs a person must fill get a shipped sample.
 */
function prepareForFakeRun(
  graph: WorkflowFile["data"]["graph"]
): WorkflowFile["data"]["graph"] {
  const nodes = graph.nodes.map((node) => {
    const data = { ...((node.data as Record<string, unknown>) ?? {}) };
    for (const [key, value] of Object.entries(data)) {
      if (isEmptyModel(value)) {
        data[key] = {
          ...value,
          provider: `fake-${String(node.id)}`,
          id: "fake-model",
          name: "Fake"
        };
      }
    }
    const sample = SAMPLE_MEDIA[node.type as string];
    if (sample && isEmptyMedia(data.value)) {
      data.value = { ...sample };
    }
    return { ...node, data };
  });
  return { ...graph, nodes };
}

/**
 * Examples that cannot complete under this harness, and why. Each must fail;
 * one that starts completing has to come off the list.
 */
const CANNOT_COMPLETE: Record<string, string> = {
  "Brand a UGC Product Video.json":
    "openai.audio.Transcribe calls the OpenAI API directly for word timings",
  "Compose Directed Campaign Formats.json":
    "reads the accepted creative contract an earlier campaign step writes",
  "Render a Directed Campaign Hero.json":
    "reads the campaign plan Propose Three Campaign Directions writes",
  "Revise an Accepted Campaign Hero.json":
    "reads the accepted hero contract an earlier campaign step writes",
  "Reopen a Directed Campaign.json":
    "reads a saved directed-campaign.json record",
  "Propose Three Campaign Directions.json":
    "parses JSON directions from the model; the fake replies with plain text",
  "Localized Explainer.json":
    "needs a storyboard picked on its Constant Storyboard node",
  "Per-SKU Ad Factory.json":
    "needs a storyboard and timeline picked; covered by per-sku-ad-factory.fake.json",
  "Three Ratios.json":
    "needs a timeline picked; covered by three-ratios.fake.json",
  "Top-down Native Asset Pack.json":
    "checks sprite grids and sound lengths the 1x1 fake media cannot pass; covered by topdown-native-asset-pack.fake.json"
};

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

async function executeWorkflow(workflow: WorkflowFile): Promise<ExecutionResult> {
  const fake = createFakeContext({
    jobId: `fake-${workflow.fileName}`
  });
  const graph = await Graph.loadFromDict(prepareForFakeRun(workflow.data.graph), {
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
      const types = (data.graph?.nodes ?? []).map((n) => n.type);
      const unrunnable = types.filter(
        (t) =>
          typeof t === "string" &&
          (NETWORK_BYPASSING_NODES.has(t as string) ||
            NON_TERMINATING_NODES.has(t as string))
      );
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
