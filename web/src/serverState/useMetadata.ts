import { NodeTypes } from "@xyflow/react";
import { restFetch } from "../lib/rest-fetch";
import { UnifiedModel, NodeMetadata } from "../stores/ApiTypes";
import useMetadataStore from "../stores/MetadataStore";
import { createConnectabilityMatrix } from "../components/node_menu/typeFilterUtils";
import { generateSnippetMetadata } from "../config/snippetMetadata";
import { generateCodeGenPaletteMetadata } from "../config/codeGenPaletteMetadata";
import { attachBundleFalUnitPricing } from "../utils/attachBundleFalUnitPricing";
import { attachBundleKieUnitPricing } from "../utils/attachBundleKieUnitPricing";
import { WORKFLOW_NODE_TYPE, PREVIEW_NODE_TYPE } from "../constants/nodeTypes";

export { WORKFLOW_NODE_TYPE };

const defaultMetadata = {
  [PREVIEW_NODE_TYPE]: {
    title: "Preview",
    description: "Preview",
    namespace: "default",
    node_type: PREVIEW_NODE_TYPE,
    layout: "default",
    supports_dynamic_inputs: false,
    properties: [
      {
        name: "value",
        type: {
          type: "any",
          optional: true,
          type_args: []
        },
        required: false
      }
    ],
    outputs: [
      {
        name: "output",
        type: {
          type: "any",
          optional: true,
          type_args: []
        },
        stream: false
      }
    ],

    recommended_models: [],
    supports_dynamic_outputs: false,
    is_streaming_output: false,
    required_settings: []
  },
  [WORKFLOW_NODE_TYPE]: {
    title: "Workflow",
    description:
      "Execute a sub-workflow. Select a workflow to populate its inputs and outputs dynamically.",
    namespace: "nodetool.workflows",
    node_type: WORKFLOW_NODE_TYPE,
    layout: "default",
    supports_dynamic_inputs: true,
    properties: [],
    outputs: [],

    recommended_models: [],
    supports_dynamic_outputs: true,
    is_streaming_output: true,
    required_settings: []
  }
} satisfies Record<string, NodeMetadata>;

const METADATA_ENDPOINT = "/api/nodes/metadata?fields=full&limit=10000";

// Node metadata is the largest payload fetched at boot. Left to the render
// flow it runs strictly after the runtime-config round-trip; firing it here at
// app start lets its download overlap that round-trip, removing it from the
// critical path to interactive. The prefetch carries no auth header (auth mode
// isn't known until config resolves): in Local mode it succeeds and is reused,
// and when the backend enforces auth it 401s and `loadMetadata` refetches with
// a token. Cached, and consumed at most once — safe to call repeatedly.
let prefetchedResponse: Promise<Response | null> | null = null;

/**
 * `BaseNode` renders every server-provided node type, and this module maps each
 * one to it. Imported statically it put the whole node-editor tree — 2.5 MB of
 * chunk, plus everything it reaches — in the entry's static graph, so the
 * browser parsed all of it before the app shell could paint. Loaded on demand
 * instead, and started alongside the metadata request below so the two overlap.
 */
let baseNodePromise: Promise<typeof import("../components/node/BaseNode")> | null =
  null;
const loadBaseNode = () => {
  baseNodePromise ??= import("../components/node/BaseNode");
  return baseNodePromise;
};

export const prefetchMetadata = (): void => {
  void loadBaseNode();
  if (prefetchedResponse) return;
  prefetchedResponse = restFetch(METADATA_ENDPOINT).then(
    (res) => (res.ok ? res : null),
    () => null
  );
};

export const loadMetadata = async (): Promise<"success" | "error"> => {
  // Take the prefetch at most once; later reloads (package changes, etc.)
  // fetch fresh so a consumed response body is never read twice.
  const pending = prefetchedResponse;
  prefetchedResponse = null;
  const baseNodeReady = loadBaseNode();
  const response =
    (pending ? await pending : null) ?? (await restFetch(METADATA_ENDPOINT));
  if (!response.ok) {
    console.error(new Error(`Failed to load metadata: ${response.status}`));
    return "error";
  }

  const [data, { default: BaseNode }] = await Promise.all([
    response.json() as Promise<NodeMetadata[]>,
    baseNodeReady
  ]);

  const nodeTypes: NodeTypes = {};
  const metadataByType: Record<string, NodeMetadata> = { ...defaultMetadata };
  
  data.forEach((md: NodeMetadata) => {
    nodeTypes[md.node_type] = BaseNode;
    metadataByType[md.node_type] = md;
  });

  // Collect + dedupe by type, repo_id, path in one pass. Spreading into an
  // accumulator here re-copied the whole list once per node type — quadratic
  // over the thousands of types the registry ships.
  const byKey = new Map<string, UnifiedModel>();
  for (const md of data) {
    for (const model of md.recommended_models ?? []) {
      const key = `${model.type ?? ""}:${model.repo_id ?? ""}:${
        model.path ?? ""
      }`;
      if (!byKey.has(key)) {
        byKey.set(key, model);
      }
    }
  }
  const uniqueRecommendedModels = Array.from(byKey.values());

  const snippetMetadata = generateSnippetMetadata();
  Object.assign(metadataByType, snippetMetadata);
  Object.assign(metadataByType, generateCodeGenPaletteMetadata());

  // Merge bundled FAL list prices onto metadata before publishing to the
  // store. Backend `NodeMetadata` does not include `fal_unit_pricing` today,
  // so we attach it client-side from the codegen JSON bundle.
  attachBundleFalUnitPricing(metadataByType);
  attachBundleKieUnitPricing(metadataByType);

  useMetadataStore.getState().setMetadata(metadataByType);
  useMetadataStore.getState().setRecommendedModels(uniqueRecommendedModels);
  useMetadataStore.getState().setNodeTypes(nodeTypes);

  createConnectabilityMatrix(Object.values(metadataByType));

  return "success";
};
