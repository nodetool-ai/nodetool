/**
 * The bindable surface of a workflow graph: the Input nodes an app writes, the
 * Output nodes it displays, and the SetVariable channels it can read. Mirrors
 * the web and mobile readers, so a document binds the same way here.
 */
import type { BundleGraph } from "@nodetool-ai/app-runtime";

export type WorkflowInputKind =
  | "string"
  | "integer"
  | "float"
  | "boolean"
  | "color"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "dataframe"
  | "file_path"
  | "folder_path"
  | "folder"
  | "select"
  | "language_model"
  | "image_model"
  | "video_model"
  | "tts_model"
  | "asr_model"
  | "music_model"
  | "embedding_model"
  | "image_list"
  | "video_list"
  | "audio_list"
  | "text_list"
  | "model3d"
  | "image_size"
  | "huggingface_model";

const KIND_BY_NODE_TYPE: Readonly<Record<string, WorkflowInputKind>> = {
  "nodetool.input.StringInput": "string",
  "nodetool.input.TextInput": "string",
  "nodetool.input.MessageInput": "string",
  "nodetool.input.BooleanInput": "boolean",
  "nodetool.input.IntegerInput": "integer",
  "nodetool.input.FloatInput": "float",
  "nodetool.input.ColorInput": "color",
  "nodetool.input.ImageInput": "image",
  "nodetool.input.VideoInput": "video",
  "nodetool.input.AudioInput": "audio",
  "nodetool.input.RealtimeAudioInput": "audio",
  "nodetool.input.DocumentInput": "document",
  "nodetool.input.DataFrameInput": "dataframe",
  "nodetool.input.DataframeInput": "dataframe",
  "nodetool.input.Model3DInput": "model3d",
  "nodetool.input.ImageSizeInput": "image_size",
  "nodetool.input.HuggingFaceModelInput": "huggingface_model",
  "nodetool.input.FilePathInput": "file_path",
  "nodetool.input.FolderPathInput": "folder_path",
  "nodetool.input.Folder": "folder",
  "nodetool.input.SelectInput": "select",
  "nodetool.input.LanguageModelInput": "language_model",
  "nodetool.input.ImageModelInput": "image_model",
  "nodetool.input.VideoModelInput": "video_model",
  "nodetool.input.TTSModelInput": "tts_model",
  "nodetool.input.ASRModelInput": "asr_model",
  "nodetool.input.MusicModelInput": "music_model",
  "nodetool.input.EmbeddingModelInput": "embedding_model",
  "nodetool.input.ImageListInput": "image_list",
  "nodetool.input.VideoListInput": "video_list",
  "nodetool.input.AudioListInput": "audio_list",
  "nodetool.input.TextListInput": "text_list",
  "nodetool.input.StringListInput": "text_list"
};

export interface WorkflowInputIO {
  nodeId: string;
  nodeType: string;
  name: string;
  label: string;
  kind: WorkflowInputKind;
  description?: string;
  min?: number;
  max?: number;
  multiline?: boolean;
  options?: string[];
  defaultValue?: unknown;
}

export interface WorkflowOutputIO {
  nodeId: string;
  nodeType: string;
  name: string;
  label: string;
}

export interface WorkflowIO {
  inputs: WorkflowInputIO[];
  outputs: WorkflowOutputIO[];
  nodeIds: string[];
  variableNames: string[];
}

export const EMPTY_IO: WorkflowIO = { inputs: [], outputs: [], nodeIds: [], variableNames: [] };

const SET_VARIABLE_NODE_TYPE = "nodetool.workflows.base_node.SetVariable";

interface GraphNode {
  id: string;
  type: string;
  data?: Record<string, unknown>;
  properties?: Record<string, unknown>;
  ui_properties?: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const asNode = (value: unknown): GraphNode | null =>
  isRecord(value) && typeof value.id === "string" && typeof value.type === "string"
    ? (value as unknown as GraphNode)
    : null;

const nodeData = (node: GraphNode): Record<string, unknown> =>
  (isRecord(node.data) ? node.data : isRecord(node.properties) ? node.properties : {});

const isOutputNode = (type: string): boolean =>
  type.includes(".output.") || type === "nodetool.workflows.base_node.Preview";

export const getWorkflowInputKind = (nodeType: string): WorkflowInputKind | null =>
  KIND_BY_NODE_TYPE[nodeType] ?? null;

export function extractWorkflowIO(graph: BundleGraph | undefined): WorkflowIO {
  if (!graph) return EMPTY_IO;
  const inputs: WorkflowInputIO[] = [];
  const outputs: WorkflowOutputIO[] = [];
  const nodeIds: string[] = [];
  const variableNames = new Set<string>();

  for (const raw of graph.nodes) {
    const node = asNode(raw);
    if (!node) continue;
    nodeIds.push(node.id);
    if (isRecord(node.ui_properties) && node.ui_properties.bypassed === true) continue;
    const data = nodeData(node);
    const name = nonEmpty(data.name) ? data.name : node.id;
    const label = nonEmpty(data.label) ? data.label : name;

    if (node.type === SET_VARIABLE_NODE_TYPE && nonEmpty(data.name)) {
      variableNames.add(data.name.trim());
      continue;
    }

    const kind = getWorkflowInputKind(node.type);
    if (kind) {
      inputs.push({
        nodeId: node.id,
        nodeType: node.type,
        name,
        label,
        kind,
        description: nonEmpty(data.description) ? data.description : undefined,
        min: typeof data.min === "number" ? data.min : undefined,
        max: typeof data.max === "number" ? data.max : undefined,
        multiline:
          data.line_mode === "multi_line" ||
          data.line_mode === "multiline" ||
          data.multiline === true
            ? true
            : undefined,
        options: Array.isArray(data.options)
          ? data.options.filter((option): option is string => typeof option === "string")
          : undefined,
        defaultValue: data.value
      });
      continue;
    }
    if (isOutputNode(node.type)) {
      outputs.push({ nodeId: node.id, nodeType: node.type, name, label });
    }
  }

  return {
    inputs,
    outputs,
    nodeIds,
    variableNames: [...variableNames].sort((a, b) => a.localeCompare(b))
  };
}

/**
 * The value an untouched input runs with: the node's saved default, else the
 * fallback its control displays, so an untouched form runs with what it shows.
 */
export function seedInputValue(input: WorkflowInputIO): unknown {
  if (input.defaultValue !== undefined && input.defaultValue !== null) {
    return input.defaultValue;
  }
  switch (input.kind) {
    case "boolean":
      return false;
    case "integer":
    case "float":
      return input.min ?? 0;
    case "select":
      return input.options?.[0];
    default:
      return undefined;
  }
}
