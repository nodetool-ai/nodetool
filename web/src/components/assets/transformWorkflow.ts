/**
 * "Transform with workflow": which saved workflows can take an asset, the
 * params that feed the asset into one, and how a run's messages fold into
 * what the dialog shows.
 *
 * A workflow can transform an asset when it has an enabled input node of the
 * asset's media kind: an `ImageInput` (or `ImageListInput`) for an image, a
 * `VideoInput` for a video, and so on. Every other input keeps its default.
 */
import type { Asset, Workflow } from "../../stores/ApiTypes";
import {
  extractWorkflowIO,
  type WorkflowInputIO
} from "../appbuilder/workflowIO";
import type { WorkflowInputKind } from "../appbuilder/inputKinds";
import { assetLocator, assetIdOf } from "../../utils/mediaRef";
import { isRecord, isString } from "../../utils/typePredicates";

export type TransformKind = "image" | "video" | "audio" | "model3d" | "document";

/** The `*Ref` type name a workflow input expects for each kind. */
const REF_TYPE: Record<TransformKind, string> = {
  image: "image",
  video: "video",
  audio: "audio",
  model3d: "model_3d",
  document: "document"
};

/** Input kinds that accept one value of a transform kind. */
const SINGLE_INPUT: Partial<Record<WorkflowInputKind, TransformKind>> = {
  image: "image",
  video: "video",
  audio: "audio",
  model3d: "model3d",
  document: "document"
};

/** Input kinds that accept a list, fed a one-item list. */
const LIST_INPUT: Partial<Record<WorkflowInputKind, TransformKind>> = {
  image_list: "image",
  video_list: "video",
  audio_list: "audio"
};

const MODEL3D_EXTENSION = /\.(glb|gltf|obj|fbx|stl|ply|usdz)$/i;

/**
 * The media kind of an asset, or null for a folder. Anything that is not an
 * image, video, audio clip or 3D model goes to a `DocumentInput`, which takes
 * any file.
 */
export const transformKindOfAsset = (asset: {
  content_type?: string | null;
  name?: string | null;
}): TransformKind | null => {
  const contentType = (asset.content_type ?? "").toLowerCase();
  if (contentType === "folder") {
    return null;
  }
  if (contentType.startsWith("image/")) {
    return "image";
  }
  if (contentType.startsWith("video/")) {
    return "video";
  }
  if (contentType.startsWith("audio/")) {
    return "audio";
  }
  if (contentType.startsWith("model/") || MODEL3D_EXTENSION.test(asset.name ?? "")) {
    return "model3d";
  }
  return "document";
};

/** The media kind a `*Ref` value names, or null when it is not media. */
export const transformKindOfRef = (value: unknown): TransformKind | null => {
  if (!isRecord(value) || !isString(value.type)) {
    return null;
  }
  switch (value.type) {
    case "image":
      return "image";
    case "video":
      return "video";
    case "audio":
      return "audio";
    case "model_3d":
      return "model3d";
    case "document":
      return "document";
    default:
      return null;
  }
};

/** What a transform runs on: a stored asset of a known kind. */
export interface TransformSource {
  assetId: string;
  kind: TransformKind;
  name: string;
  /** The asset's folder and project, where saved outputs go. */
  parentId?: string;
  projectId?: string;
}

export const transformSourceFromAsset = (
  asset: Asset
): TransformSource | null => {
  const kind = transformKindOfAsset(asset);
  if (!kind) {
    return null;
  }
  return {
    assetId: asset.id,
    kind,
    name: asset.name,
    parentId: asset.parent_id || undefined,
    projectId: asset.project_id || undefined
  };
};

/** An input of a workflow that can take the source, and how it takes it. */
export interface TransformInput {
  input: WorkflowInputIO;
  list: boolean;
}

export interface TransformCandidate {
  workflow: Workflow;
  inputs: TransformInput[];
}

/** The enabled inputs of `workflow` that accept a value of `kind`. */
export const transformInputsFor = (
  workflow: Workflow,
  kind: TransformKind
): TransformInput[] =>
  extractWorkflowIO(workflow).inputs.flatMap((input): TransformInput[] => {
    if (SINGLE_INPUT[input.kind] === kind) {
      return [{ input, list: false }];
    }
    if (LIST_INPUT[input.kind] === kind) {
      return [{ input, list: true }];
    }
    return [];
  });

/**
 * The workflows that can take a `kind` asset, filtered by a name or
 * description search and sorted by name. Single-value inputs come before
 * list inputs, so the default pick feeds the asset as itself.
 */
export const transformCandidates = (
  workflows: readonly Workflow[],
  kind: TransformKind,
  query: string,
  locale?: string
): TransformCandidate[] => {
  const q = query.trim().toLowerCase();
  return workflows
    .flatMap((workflow): TransformCandidate[] => {
      const inputs = transformInputsFor(workflow, kind);
      if (inputs.length === 0) {
        return [];
      }
      if (
        q &&
        !workflow.name.toLowerCase().includes(q) &&
        !(workflow.description ?? "").toLowerCase().includes(q)
      ) {
        return [];
      }
      inputs.sort((a, b) => Number(a.list) - Number(b.list));
      return [{ workflow, inputs }];
    })
    .sort((a, b) => a.workflow.name.localeCompare(b.workflow.name, locale));
};

/** Run params that feed the source asset into `target` and nothing else. */
export const transformParams = (
  source: TransformSource,
  target: TransformInput
): Record<string, unknown> => {
  const ref = {
    type: REF_TYPE[source.kind],
    uri: assetLocator(source.assetId),
    asset_id: source.assetId
  };
  return { [target.input.name]: target.list ? [ref] : ref };
};

// ── Run state ────────────────────────────────────────────────────────────────

export type TransformRunStatus =
  | "idle"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/** One value a workflow output produced. */
export interface TransformOutput {
  /** Stable key: output node, then the item's position in its stream. */
  key: string;
  nodeName: string;
  value: unknown;
  /** Set for media; null for text and other values. */
  kind: TransformKind | null;
  /** The stored asset behind a media value, when the run saved one. */
  assetId?: string;
}

export interface TransformUpdate {
  nodeId: string;
  nodeName: string;
  status: string;
  error?: string;
}

export interface TransformRunState {
  status: TransformRunStatus;
  jobId: string | null;
  /** Nodes that will run, for the overall progress. */
  totalNodes: number;
  completedNodeIds: string[];
  /** Latest status per node, in the order nodes first reported. */
  updates: TransformUpdate[];
  /** The running node's own progress, 0–100, when it reports any. */
  nodeProgress: { nodeId: string; percent: number } | null;
  outputs: TransformOutput[];
  error: string | null;
}

export const initialTransformRunState: TransformRunState = {
  status: "idle",
  jobId: null,
  totalNodes: 0,
  completedNodeIds: [],
  updates: [],
  nodeProgress: null,
  outputs: [],
  error: null
};

const str = (value: unknown): string | undefined =>
  isString(value) && value.length > 0 ? value : undefined;

/** A media value split into its items: a list output yields one per item. */
const outputItems = (value: unknown): unknown[] =>
  Array.isArray(value) && value.some((item) => transformKindOfRef(item))
    ? value
    : [value];

const isEmptyValue = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  (isString(value) && value.length === 0);

const foldOutput = (
  state: TransformRunState,
  message: Record<string, unknown>
): TransformRunState => {
  const nodeId = str(message.node_id) ?? "";
  const nodeName = str(message.node_name) ?? nodeId;
  const value = message.value;
  if (isEmptyValue(value)) {
    return state;
  }
  // A streamed text chunk extends the node's text; anything else replaces
  // what the node showed, so a re-emitted final value never duplicates.
  const others = state.outputs.filter((output) => !output.key.startsWith(`${nodeId}:`));
  const previous = state.outputs.filter((output) => output.key.startsWith(`${nodeId}:`));
  if (
    isString(value) &&
    message.disposition !== "replace" &&
    previous.length === 1 &&
    isString(previous[0].value)
  ) {
    return {
      ...state,
      outputs: [...others, { ...previous[0], value: previous[0].value + value }]
    };
  }
  const items = outputItems(value).map((item, index): TransformOutput => {
    const kind = transformKindOfRef(item);
    return {
      key: `${nodeId}:${index}`,
      nodeName,
      value: item,
      kind,
      assetId: kind ? assetIdOf(item as { uri?: string; asset_id?: string }) : undefined
    };
  });
  return { ...state, outputs: [...others, ...items] };
};

const foldNodeUpdate = (
  state: TransformRunState,
  message: Record<string, unknown>
): TransformRunState => {
  const nodeId = str(message.node_id);
  const status = str(message.status);
  if (!nodeId || !status) {
    return state;
  }
  const update: TransformUpdate = {
    nodeId,
    nodeName: str(message.node_name) ?? nodeId,
    status,
    error: str(message.error)
  };
  const existing = state.updates.findIndex((u) => u.nodeId === nodeId);
  const updates =
    existing === -1
      ? [...state.updates, update]
      : state.updates.map((u, i) => (i === existing ? update : u));
  const completedNodeIds =
    status === "completed" && !state.completedNodeIds.includes(nodeId)
      ? [...state.completedNodeIds, nodeId]
      : state.completedNodeIds;
  const nodeProgress =
    state.nodeProgress?.nodeId === nodeId && status !== "running"
      ? null
      : state.nodeProgress;
  return { ...state, updates, completedNodeIds, nodeProgress };
};

/** Fold one streamed run message into the dialog's view of the run. */
export const foldTransformMessage = (
  state: TransformRunState,
  message: Record<string, unknown>
): TransformRunState => {
  switch (message.type) {
    case "node_update":
      return foldNodeUpdate(state, message);
    case "node_progress": {
      const nodeId = str(message.node_id);
      const progress = Number(message.progress);
      const total = Number(message.total);
      if (!nodeId || !(total > 0) || !Number.isFinite(progress)) {
        return state;
      }
      const percent = Math.max(0, Math.min(100, (progress / total) * 100));
      return { ...state, nodeProgress: { nodeId, percent } };
    }
    case "output_update":
      return foldOutput(state, message);
    default:
      return state;
  }
};

/** Overall progress, 0–100, from the nodes that finished. */
export const transformProgress = (state: TransformRunState): number => {
  if (state.status === "completed") {
    return 100;
  }
  if (state.totalNodes === 0) {
    return 0;
  }
  return Math.min(100, (state.completedNodeIds.length / state.totalNodes) * 100);
};
