/**
 * ComfyUI dynamic-schema parser (client-side).
 *
 * Parses a ComfyUI workflow in API ("prompt") format and derives typed dynamic
 * inputs/outputs for the Run ComfyUI Workflow node — mirroring the FAL/Replicate
 * dynamic-schema pattern, but resolved entirely in the browser (no backend call).
 *
 * Convention: every dynamic handle is keyed `"<comfyNodeId>:<field>"`. The
 * runtime node (packages/integration-nodes/src/nodes/comfy.ts) injects connected
 * values into `prompt[nodeId].inputs[field]` and returns output files under the
 * same `"<comfyNodeId>:<kind>"` keys, so frontend and backend never diverge.
 */

import type { TypeMetadata } from "../stores/ApiTypes";

export type ComfyPromptNode = {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title?: string };
};
export type ComfyPrompt = Record<string, ComfyPromptNode>;

export type ComfyDynInput = TypeMetadata & {
  description?: string;
  min?: number;
  max?: number;
  default?: unknown;
};

/** A literal input that the user may optionally expose as a typed handle. */
export interface ComfyParam {
  handle: string; // "<id>:<field>"
  nodeId: string;
  field: string;
  classType: string;
  label: string;
  type: string;
  default: unknown;
}

export interface ComfyResolvedSchema {
  /** Normalized API-format prompt to store in the node's `workflow` prop. */
  prompt: ComfyPrompt;
  /** Auto-exposed typed inputs (Load* nodes), keyed by handle. */
  dynamic_inputs: Record<string, ComfyDynInput>;
  /** Auto-exposed typed outputs (Save* nodes), keyed by handle. */
  dynamic_outputs: Record<string, TypeMetadata>;
  /** Default values for the exposed inputs. */
  dynamic_properties: Record<string, unknown>;
  /** Literal inputs the user can additionally expose as params. */
  availableParams: ComfyParam[];
}

/** Curated Load* classes → typed media input field. */
const LOAD_CLASS_INPUTS: Record<string, { field: string; type: string }> = {
  LoadImage: { field: "image", type: "image" },
  LoadImageMask: { field: "image", type: "image" },
  LoadImageOutput: { field: "image", type: "image" },
  LoadAudio: { field: "audio", type: "audio" },
  VHS_LoadAudioUpload: { field: "audio", type: "audio" },
  LoadVideo: { field: "video", type: "video" },
  VHS_LoadVideo: { field: "video", type: "video" }
};

/**
 * Curated Save / Preview classes -> streaming output kind. Outputs stream one
 * item per file, so each slot is a singular media type (not a list), keyed
 * `"<nodeId>:<kind>"` to match the backend's emitted handles.
 */
const SAVE_CLASS_OUTPUTS: Record<
  string,
  { kind: "image" | "audio" | "video" }
> = {
  SaveImage: { kind: "image" },
  PreviewImage: { kind: "image" },
  SaveAnimatedWEBP: { kind: "image" },
  SaveAnimatedPNG: { kind: "image" },
  SaveAudio: { kind: "audio" },
  SaveAudioMP3: { kind: "audio" },
  SaveAudioOpus: { kind: "audio" },
  PreviewAudio: { kind: "audio" },
  SaveVideo: { kind: "video" },
  VHS_VideoCombine: { kind: "video" }
};

const meta = (type: string): TypeMetadata => ({
  type,
  optional: false,
  type_args: []
});

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

/** Resolve a Load* class to its media input field + type (curated, then prefix). */
function resolveLoadInput(
  classType: string,
  inputs: Record<string, unknown>
): { field: string; type: string } | null {
  const curated = LOAD_CLASS_INPUTS[classType];
  if (curated) return curated;
  if (!classType.startsWith("Load")) return null;
  // Prefix fallback: pick a media type from the class name and the first
  // literal string input as the file field.
  const type = classType.includes("Audio")
    ? "audio"
    : classType.includes("Video")
      ? "video"
      : "image";
  const field = Object.entries(inputs).find(
    ([, v]) => typeof v === "string" && !isComfyConnection(v)
  )?.[0];
  return field ? { field, type } : null;
}

/** Resolve a Save or Preview class to its streaming output kind. */
function resolveSaveOutput(
  classType: string
): { kind: "image" | "audio" | "video" } | null {
  const curated = SAVE_CLASS_OUTPUTS[classType];
  if (curated) return curated;
  if (!classType.startsWith("Save") && !classType.startsWith("Preview")) {
    return null;
  }
  if (classType.includes("Audio")) return { kind: "audio" };
  if (classType.includes("Video")) return { kind: "video" };
  return { kind: "image" };
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
 * Validate and normalize a parsed JSON object into an API-format ComfyUI prompt.
 * Accepts either the bare prompt map or an object wrapping it under `prompt`.
 * Throws a helpful error for the UI/full ("nodes" array) format.
 */
export function normalizeComfyPrompt(parsed: unknown): ComfyPrompt {
  if (parsed && typeof parsed === "object" && "prompt" in parsed) {
    const inner = (parsed as { prompt: unknown }).prompt;
    if (inner && typeof inner === "object") return normalizeComfyPrompt(inner);
  }
  if (parsed && typeof parsed === "object" && "nodes" in parsed) {
    throw new Error(
      "This looks like a ComfyUI UI workflow. Use “Save (API Format)” in ComfyUI, or drop a PNG exported by ComfyUI."
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Not a ComfyUI workflow (expected a JSON object).");
  }
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) {
    throw new Error("Workflow is empty.");
  }
  for (const [id, node] of entries) {
    if (
      !node ||
      typeof node !== "object" ||
      typeof (node as ComfyPromptNode).class_type !== "string" ||
      typeof (node as ComfyPromptNode).inputs !== "object"
    ) {
      throw new Error(
        `Node "${id}" is not in API format (expected { class_type, inputs }).`
      );
    }
  }
  return parsed as ComfyPrompt;
}

/** Parse pasted JSON text into a normalized ComfyUI prompt. */
export function parseComfyWorkflowJson(text: string): ComfyPrompt {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON.");
  }
  return normalizeComfyPrompt(parsed);
}

/**
 * Extract the embedded API-format prompt from a ComfyUI-exported PNG.
 * ComfyUI stores the prompt JSON in a `tEXt`/`iTXt` chunk keyed "prompt".
 */
export function extractComfyPromptFromPng(buffer: ArrayBuffer): ComfyPrompt {
  const bytes = new Uint8Array(buffer);
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < sig.length; i++) {
    if (bytes[i] !== sig[i]) throw new Error("Not a PNG file.");
  }
  const view = new DataView(buffer);
  const decoder = new TextDecoder("latin1");
  let offset = 8;
  const texts: Record<string, string> = {};
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = decoder.decode(bytes.subarray(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd > bytes.length) break;
    if (type === "tEXt") {
      const chunk = bytes.subarray(dataStart, dataEnd);
      const nul = chunk.indexOf(0);
      if (nul > 0) {
        const key = decoder.decode(chunk.subarray(0, nul));
        const utf8 = new TextDecoder("utf-8");
        texts[key] = utf8.decode(chunk.subarray(nul + 1));
      }
    } else if (type === "iTXt") {
      const chunk = bytes.subarray(dataStart, dataEnd);
      const nul = chunk.indexOf(0);
      if (nul > 0) {
        const key = decoder.decode(chunk.subarray(0, nul));
        // iTXt: keyword \0 compflag \0 compmethod \0 langtag \0 transkeyword \0 text
        let p = nul + 3;
        for (let skip = 0; skip < 2 && p < chunk.length; skip++) {
          const next = chunk.indexOf(0, p);
          if (next < 0) break;
          p = next + 1;
        }
        const utf8 = new TextDecoder("utf-8");
        texts[key] = utf8.decode(chunk.subarray(p));
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

/**
 * Derive typed dynamic inputs/outputs from a ComfyUI prompt:
 * - Load nodes -> typed media inputs.
 * - Save / Preview nodes -> typed outputs.
 * - All other literal inputs -> `availableParams` (user-exposable).
 */
export function resolveComfySchema(prompt: ComfyPrompt): ComfyResolvedSchema {
  const dynamic_inputs: Record<string, ComfyDynInput> = {};
  const dynamic_outputs: Record<string, TypeMetadata> = {};
  const dynamic_properties: Record<string, unknown> = {};
  const availableParams: ComfyParam[] = [];

  // Stable ordering by numeric node id when possible.
  const ids = Object.keys(prompt).sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    return Number.isNaN(na) || Number.isNaN(nb) ? a.localeCompare(b) : na - nb;
  });

  for (const nodeId of ids) {
    const node = prompt[nodeId];
    const label = nodeLabel(node);

    const loadInput = resolveLoadInput(node.class_type, node.inputs);
    const saveOutput = resolveSaveOutput(node.class_type);

    if (saveOutput) {
      // Singular media slot keyed "<nodeId>:<kind>" — the backend is a
      // streaming-output node and emits one media ref per file as it runs.
      const handle = `${nodeId}:${saveOutput.kind}`;
      dynamic_outputs[handle] = meta(saveOutput.kind);
    }

    if (loadInput && !isComfyConnection(node.inputs[loadInput.field])) {
      const handle = `${nodeId}:${loadInput.field}`;
      dynamic_inputs[handle] = {
        ...meta(loadInput.type),
        optional: true,
        description: `${label} · ${loadInput.field}`,
        default: node.inputs[loadInput.field]
      };
      dynamic_properties[handle] = node.inputs[loadInput.field];
    }

    for (const [field, value] of Object.entries(node.inputs)) {
      if (isComfyConnection(value)) continue;
      if (loadInput && field === loadInput.field) continue;
      availableParams.push({
        handle: `${nodeId}:${field}`,
        nodeId,
        field,
        classType: node.class_type,
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
    availableParams
  };
}

/** Build the input handle metadata for a user-selected param. */
export function paramToDynInput(param: ComfyParam): ComfyDynInput {
  return {
    ...meta(param.type),
    optional: true,
    description: param.label,
    default: param.default
  };
}
