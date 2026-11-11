/**
 * Prepares a shipped example graph for a run with fake providers. The vitest
 * suite `tests/example-workflows-execute.test.ts` and the native graph-runner
 * harness both import this file, so both runners prepare examples the same
 * way.
 *
 * The file uses only erasable TypeScript syntax and imports nothing, so a plain
 * Node 24 `.mjs` script imports it by relative path, `.ts` extension included,
 * with no build step.
 */

export interface ExampleGraph {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
}

export interface SampleMediaRef {
  type: string;
  uri: string;
}

/**
 * The node type of a native Comfy graph after `collapseComfyGraph`. It equals
 * `COMFY_CLOUD_GRAPH_NODE_TYPE` from `@nodetool-ai/protocol`, copied here so
 * this file needs no build. `example-run-preparation.test.ts` checks the two
 * stay equal.
 */
const COMFY_CLOUD_GRAPH_NODE_TYPE = "lib.comfy.RunComfyGraphOnCloud";

/**
 * Node types that bypass the provider abstraction and open real network
 * connections (WebSocket, raw HTTP) using API keys directly. The fake
 * context cannot intercept these — running them would either time out
 * or hit the real endpoint with a junk key. Workflows that contain any
 * of these nodes are skipped. `lib.comfy.RunWorkflowOnCloud` submits its
 * graph through the Comfy API v2 SDK with `COMFY_API_KEY`, not through a
 * provider. Native Comfy graphs collapse to the same kind of network-backed
 * runner before execution, so callers classify a graph after that collapse.
 */
export const NETWORK_BYPASSING_NODES: ReadonlySet<string> = new Set<string>([
  "openai.agents.RealtimeAgent",
  "openai.agents.LiveAgent",
  "lib.comfy.RunWorkflowOnCloud",
  COMFY_CLOUD_GRAPH_NODE_TYPE
]);

/**
 * Trigger nodes whose adapter listens forever. Their `genProcess` waits on a
 * live scheduler or filesystem watcher, and a fake run supplies neither — so
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
export const NON_TERMINATING_NODES: ReadonlySet<string> = new Set<string>([
  "nodetool.triggers.IntervalTrigger",
  "nodetool.triggers.FileWatchTrigger"
]);

/**
 * The node types in `graph` that a fake run cannot finish: members of
 * {@link NETWORK_BYPASSING_NODES} or {@link NON_TERMINATING_NODES}. Pass a
 * graph that has already been through `collapseComfyGraph`.
 */
export function unrunnableNodeTypes(graph: ExampleGraph): string[] {
  const types: string[] = [];
  for (const node of graph.nodes) {
    if (
      typeof node.type === "string" &&
      (NETWORK_BYPASSING_NODES.has(node.type) ||
        NON_TERMINATING_NODES.has(node.type))
    ) {
      types.push(node.type);
    }
  }
  return types;
}

/**
 * Examples that cannot complete under this harness, and why. Each must fail;
 * one that starts completing has to come off the list.
 *
 * "This harness" is `tests/example-workflows-execute.test.ts`. The native
 * graph-runner harness reads the list to show the TypeScript status of each
 * example next to its own.
 */
export const CANNOT_COMPLETE: Readonly<Record<string, string>> = {
  "Brand a UGC Product Video.json":
    "openai.audio.Transcribe calls the OpenAI API directly for word timings",
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

/**
 * Sample media for an input the example ships empty. A person picks a file
 * before running these; a fake run picks one of the shipped samples.
 */
export const SAMPLE_MEDIA: Readonly<Record<string, SampleMediaRef>> = {
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
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
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
 *
 * Returns a new graph. The input graph, its nodes and their `data` objects
 * are not modified.
 */
export function prepareForFakeRun(graph: ExampleGraph): ExampleGraph {
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
