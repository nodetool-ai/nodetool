/**
 * ComfyUI workflow parser and dynamic-schema resolver.
 *
 * Parses a ComfyUI workflow in API ("prompt") format and derives the typed
 * dynamic inputs and outputs of the Run ComfyUI Workflow nodes. It runs on the
 * server for two callers:
 *
 * - `POST /api/comfy/resolve-workflow`, which the editor's workflow loader calls
 *   when a workflow is pasted or dropped.
 * - The nodes' `resolveDynamicSlots` hook, which graph hydration calls before
 *   every run. A graph whose `workflow` was set over the API, and never opened
 *   in the editor, therefore still exposes its Save nodes as output slots.
 *
 * Convention: every dynamic handle is keyed `"<comfyNodeId>:<field>"` for
 * inputs and `"<comfyNodeId>:<kind>"` for outputs. The runner injects connected
 * values into `prompt[nodeId].inputs[field]` and emits output files under the
 * same keys.
 */

import type { DynamicSlotMeta } from "@nodetool-ai/protocol";

export type ComfyPromptNode = {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title?: string };
};

export type ComfyWorkflowPrompt = Record<string, ComfyPromptNode>;

/** Wire form of a slot type: `{ type, type_args, optional }`. */
export type ComfySlotType = {
  type: string;
  type_args: ComfySlotType[];
  optional: boolean;
};

/** A literal input that the user may optionally expose as a typed handle. */
export interface ComfyParam {
  handle: string;
  node_id: string;
  field: string;
  class_type: string;
  label: string;
  type: string;
  default: unknown;
}

export interface ComfyResolvedSchema {
  /** Normalized API-format prompt to store in the node's `workflow` prop. */
  prompt: ComfyWorkflowPrompt;
  /** Auto-exposed typed inputs (Load* media and prompt text), by handle. */
  dynamic_inputs: Record<string, DynamicSlotMeta>;
  /** Auto-exposed typed outputs (Save* and Preview* nodes), by handle. */
  dynamic_outputs: Record<string, ComfySlotType>;
  /** Current values of the exposed inputs, taken from the workflow. */
  dynamic_properties: Record<string, unknown>;
  /** Literal inputs the user can additionally expose as inputs. */
  available_params: ComfyParam[];
}

type MediaKind = "image" | "audio" | "video";

/** Curated Load* classes → typed media input field. */
const LOAD_CLASS_INPUTS: Record<string, { field: string; type: MediaKind }> = {
  LoadImage: { field: "image", type: "image" },
  LoadImageMask: { field: "image", type: "image" },
  LoadImageOutput: { field: "image", type: "image" },
  LoadAudio: { field: "audio", type: "audio" },
  VHS_LoadAudioUpload: { field: "audio", type: "audio" },
  LoadVideo: { field: "video", type: "video" },
  VHS_LoadVideo: { field: "video", type: "video" }
};

/**
 * Curated Save / Preview classes → streaming output kind. Outputs stream one
 * item per file, so each slot is a singular media type, not a list.
 */
const SAVE_CLASS_OUTPUTS: Record<string, MediaKind> = {
  SaveImage: "image",
  PreviewImage: "image",
  SaveAnimatedWEBP: "image",
  SaveAnimatedPNG: "image",
  SaveAudio: "audio",
  SaveAudioMP3: "audio",
  SaveAudioOpus: "audio",
  PreviewAudio: "audio",
  SaveVideo: "video",
  VHS_VideoCombine: "video"
};

const slotType = (type: string, optional = false): ComfySlotType => ({
  type,
  type_args: [],
  optional
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isComfyPromptNode(value: unknown): value is ComfyPromptNode {
  return (
    isRecord(value) &&
    typeof value.class_type === "string" &&
    isRecord(value.inputs)
  );
}

/** A ComfyUI input value `[sourceId, slot]` denotes a connection, not a literal. */
export function isComfyConnection(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    (typeof value[0] === "string" || typeof value[0] === "number") &&
    typeof value[1] === "number"
  );
}

function nodeLabel(node: ComfyPromptNode): string {
  return node._meta?.title?.trim() || node.class_type;
}

/** Resolve a Load* class to its media input field and type. */
function resolveLoadInput(
  classType: string,
  inputs: Record<string, unknown>
): { field: string; type: MediaKind } | null {
  const curated = LOAD_CLASS_INPUTS[classType];
  if (curated) return curated;
  if (!classType.startsWith("Load")) return null;
  // Prefix fallback: pick a media type from the class name and the first
  // literal string input as the file field.
  const type: MediaKind = classType.includes("Audio")
    ? "audio"
    : classType.includes("Video")
      ? "video"
      : "image";
  const field = Object.entries(inputs).find(
    ([, v]) => typeof v === "string"
  )?.[0];
  return field ? { field, type } : null;
}

/** Resolve a Save or Preview class to its streaming output kind. */
function resolveSaveOutput(classType: string): MediaKind | null {
  const curated = SAVE_CLASS_OUTPUTS[classType];
  if (curated) return curated;
  if (!classType.startsWith("Save") && !classType.startsWith("Preview")) {
    return null;
  }
  if (classType.includes("Audio")) return "audio";
  if (classType.includes("Video")) return "video";
  return "image";
}

/**
 * Whether a literal input is prompt text: a string field of a text-encoder
 * node (`CLIPTextEncode`, `CLIPTextEncodeSDXL`, `TextEncodeQwenImageEdit`, …).
 * These are exposed as `str` inputs by default so a text prompt can be wired
 * into the workflow like any other generator's `prompt`.
 */
function isPromptText(classType: string, value: unknown): boolean {
  return typeof value === "string" && classType.includes("TextEncode");
}

function inferScalarType(value: unknown): string {
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") {
    return Number.isInteger(value) ? "int" : "float";
  }
  if (typeof value === "string") return "str";
  return "any";
}

/**
 * Validate and normalize a parsed JSON value into an API-format ComfyUI prompt.
 * Accepts either the bare prompt map or an object wrapping it under `prompt`.
 * Throws a helpful error for the UI ("nodes" array) format.
 */
export function normalizeComfyPrompt(parsed: unknown): ComfyWorkflowPrompt {
  if (isRecord(parsed) && isRecord(parsed.prompt)) {
    return normalizeComfyPrompt(parsed.prompt);
  }
  if (isRecord(parsed) && "nodes" in parsed) {
    throw new Error(
      "This looks like a ComfyUI UI workflow. Use “Save (API Format)” in ComfyUI, or drop a PNG exported by ComfyUI."
    );
  }
  if (!isRecord(parsed)) {
    throw new Error("Not a ComfyUI workflow (expected a JSON object).");
  }
  const entries = Object.entries(parsed);
  if (entries.length === 0) {
    throw new Error("Workflow is empty.");
  }
  for (const [id, node] of entries) {
    if (!isComfyPromptNode(node)) {
      throw new Error(
        `Node "${id}" is not in API format (expected { class_type, inputs }).`
      );
    }
  }
  return parsed as ComfyWorkflowPrompt;
}

/** Parse JSON text into a normalized ComfyUI prompt. */
export function parseComfyWorkflowJson(text: string): ComfyWorkflowPrompt {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON.");
  }
  return normalizeComfyPrompt(parsed);
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/**
 * Extract the embedded API-format prompt from a ComfyUI-exported PNG.
 * ComfyUI stores the prompt JSON in a `tEXt` or `iTXt` chunk keyed "prompt".
 */
export function extractComfyPromptFromPng(
  bytes: Uint8Array
): ComfyWorkflowPrompt {
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) throw new Error("Not a PNG file.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const latin1 = new TextDecoder("latin1");
  const utf8 = new TextDecoder("utf-8");
  const texts: Record<string, string> = {};
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = latin1.decode(bytes.subarray(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd > bytes.length) break;
    if (type === "tEXt" || type === "iTXt") {
      const chunk = bytes.subarray(dataStart, dataEnd);
      const nul = chunk.indexOf(0);
      if (nul > 0) {
        const key = latin1.decode(chunk.subarray(0, nul));
        let textStart = nul + 1;
        if (type === "iTXt") {
          // keyword \0 compflag compmethod langtag \0 transkeyword \0 text
          textStart = nul + 3;
          for (let skip = 0; skip < 2 && textStart < chunk.length; skip++) {
            const next = chunk.indexOf(0, textStart);
            if (next < 0) break;
            textStart = next + 1;
          }
        }
        texts[key] = utf8.decode(chunk.subarray(textStart));
      }
    }
    if (type === "IEND") break;
    offset = dataEnd + 4; // skip CRC
  }
  const raw = texts.prompt ?? texts.Prompt;
  if (!raw) {
    throw new Error(
      "No ComfyUI prompt found in this PNG. Export it from ComfyUI with metadata enabled."
    );
  }
  return parseComfyWorkflowJson(raw);
}

/** Node ids in stable order: numeric when both are numbers, else lexical. */
function sortedNodeIds(prompt: ComfyWorkflowPrompt): string[] {
  return Object.keys(prompt).sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    return Number.isNaN(na) || Number.isNaN(nb) ? a.localeCompare(b) : na - nb;
  });
}

/**
 * Derive typed dynamic inputs and outputs from a ComfyUI prompt:
 * - Load nodes → typed media inputs.
 * - Prompt text of text-encoder nodes → `str` inputs.
 * - Save and Preview nodes → typed outputs.
 * - Every other literal input → `available_params` (user-exposable).
 */
export function resolveComfySchema(
  prompt: ComfyWorkflowPrompt
): ComfyResolvedSchema {
  const dynamic_inputs: Record<string, DynamicSlotMeta> = {};
  const dynamic_outputs: Record<string, ComfySlotType> = {};
  const dynamic_properties: Record<string, unknown> = {};
  const available_params: ComfyParam[] = [];

  for (const nodeId of sortedNodeIds(prompt)) {
    const node = prompt[nodeId];
    const label = nodeLabel(node);
    const loadInput = resolveLoadInput(node.class_type, node.inputs);
    const saveOutput = resolveSaveOutput(node.class_type);

    if (saveOutput) {
      dynamic_outputs[`${nodeId}:${saveOutput}`] = slotType(saveOutput);
    }

    for (const [field, value] of Object.entries(node.inputs)) {
      if (isComfyConnection(value)) continue;
      const handle = `${nodeId}:${field}`;
      const isMedia = loadInput?.field === field;
      if (isMedia || isPromptText(node.class_type, value)) {
        dynamic_inputs[handle] = {
          type: slotType(isMedia ? loadInput.type : "str", true),
          description: `${label} · ${field}`,
          default: value
        };
        dynamic_properties[handle] = value;
        continue;
      }
      available_params.push({
        handle,
        node_id: nodeId,
        field,
        class_type: node.class_type,
        label: `${label} · ${field}`,
        type: inferScalarType(value),
        default: value
      });
    }
  }

  return {
    prompt,
    dynamic_inputs,
    dynamic_outputs,
    dynamic_properties,
    available_params
  };
}

/**
 * Read a node's `workflow` property into a ComfyUI prompt. The property holds
 * a JSON string; a raw object is accepted for graphs saved before that.
 * Returns `null` when the property is empty or not a valid API-format prompt.
 */
export function readComfyWorkflowProperty(
  value: unknown
): ComfyWorkflowPrompt | null {
  try {
    if (typeof value === "string") {
      return value.trim() ? parseComfyWorkflowJson(value) : null;
    }
    return value == null ? null : normalizeComfyPrompt(value);
  } catch {
    return null;
  }
}

/**
 * The `resolveDynamicSlots` hook of the Comfy runner nodes: the slots the
 * node's `workflow` property declares. Run-time hydration merges these under
 * the slots saved on the node, so a graph built over the API (where nothing
 * parsed the workflow) can wire `"<comfyNodeId>:<kind>"` outputs and
 * `"<comfyNodeId>:<field>"` inputs.
 */
export function comfyDynamicSlots(node: {
  properties?: Record<string, unknown>;
}): {
  dynamic_inputs: Record<string, DynamicSlotMeta>;
  dynamic_outputs: Record<string, ComfySlotType>;
} | undefined {
  const prompt = readComfyWorkflowProperty(node.properties?.workflow);
  if (!prompt) return undefined;
  const { dynamic_inputs, dynamic_outputs } = resolveComfySchema(prompt);
  return { dynamic_inputs, dynamic_outputs };
}

/** Where a workflow to resolve comes from: JSON text, a parsed value, or a PNG. */
export type ComfyWorkflowSource =
  | { workflow: unknown }
  | { png_base64: string };

/**
 * Parse a ComfyUI workflow from JSON (text or a parsed value) or from a
 * ComfyUI-exported PNG, and derive its schema. Throws an `Error` whose message
 * explains what is wrong with the workflow.
 */
export function resolveComfyWorkflow(
  source: ComfyWorkflowSource
): ComfyResolvedSchema {
  if ("png_base64" in source) {
    return resolveComfySchema(
      extractComfyPromptFromPng(Buffer.from(source.png_base64, "base64"))
    );
  }
  const { workflow } = source;
  return resolveComfySchema(
    typeof workflow === "string"
      ? parseComfyWorkflowJson(workflow)
      : normalizeComfyPrompt(workflow)
  );
}
