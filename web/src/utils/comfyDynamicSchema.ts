/**
 * ComfyUI workflow schema resolution via the backend.
 *
 * The server parses a ComfyUI workflow in API ("prompt") format, or the prompt
 * embedded in a ComfyUI-exported PNG, and derives the typed dynamic inputs and
 * outputs of the Run ComfyUI Workflow nodes
 * (`packages/integration-nodes/src/nodes/comfy-schema.ts`). The same parser
 * declares the slots at run time, so a workflow set over the API runs with the
 * slots the editor would have shown.
 *
 * Convention: every dynamic handle is keyed `"<comfyNodeId>:<field>"` for
 * inputs and `"<comfyNodeId>:<kind>"` for outputs.
 */

import { restFetch } from "../lib/rest-fetch";
import type { TypeMetadata } from "../stores/ApiTypes";
import { isRecord, isString } from "./typePredicates";

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

/** One dynamic input declaration as the server returns it. */
export interface ComfyDynInput {
  type: TypeMetadata;
  description?: string;
  default?: unknown;
}

export interface ComfyResolvedSchema {
  /** Normalized API-format prompt to store in the node's `workflow` prop. */
  prompt: Record<string, unknown>;
  /** Auto-exposed typed inputs (Load* media and prompt text), by handle. */
  dynamic_inputs: Record<string, ComfyDynInput>;
  /** Auto-exposed typed outputs (Save* and Preview* nodes), by handle. */
  dynamic_outputs: Record<string, TypeMetadata>;
  /** Current values of the exposed inputs. */
  dynamic_properties: Record<string, unknown>;
  /** Literal inputs the user can additionally expose as inputs. */
  available_params: ComfyParam[];
}

export type ComfyWorkflowSource =
  | { workflow: string }
  | { png_base64: string };

/** Base64-encode a file's bytes for the JSON request body. */
export function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Ask the server to parse a ComfyUI workflow and derive its schema. Rejects
 * with the server's explanation when the workflow is not usable.
 */
export async function resolveComfyWorkflow(
  source: ComfyWorkflowSource,
  signal?: AbortSignal
): Promise<ComfyResolvedSchema> {
  const res = await restFetch("/api/comfy/resolve-workflow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(source),
    signal
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      const json: unknown = JSON.parse(text);
      if (isRecord(json) && isString(json.detail)) {
        message = json.detail;
      }
    } catch {
      // Not JSON: use the text as-is.
    }
    throw new Error(
      message || `Failed to load workflow: ${res.status} ${res.statusText}`
    );
  }
  return (await res.json()) as ComfyResolvedSchema;
}

/** Build the input slot declaration for a user-selected param. */
export function paramToDynInput(param: ComfyParam): ComfyDynInput {
  return {
    type: { type: param.type, optional: true, type_args: [] },
    description: param.label,
    default: param.default
  };
}
