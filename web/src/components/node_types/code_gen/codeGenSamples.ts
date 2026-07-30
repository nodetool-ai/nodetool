/**
 * Sample values for code generation and preview.
 *
 * A sample is one value per declared input. It comes from the node's latest
 * run when an upstream generation is available, and is hand-edited otherwise.
 * Both the preview (which runs locally) and the optional "include sample
 * values" prompt payload read the same map, so what the model sees is exactly
 * what the preview ran with.
 */
import type { codeGen } from "@nodetool-ai/protocol/api-schemas";
import { MAX_SAMPLE_VALUES_BYTES } from "@nodetool-ai/protocol/api-schemas/code-gen.js";

import type { TypeMetadata } from "../../../stores/ApiTypes";
import type { NodeStore } from "../../../stores/NodeStore";
import { getNodeGenerations } from "../../../stores/nodeGenerationAccessor";
import { getCurrentGeneration, outputOf } from "../../../utils/nodeGenerations";
import {
  defaultValueForType,
  normalizeTypeMetadata
} from "../../../utils/dynamicSlots";

/** Where an input's sample value came from. */
export type SampleSource = "latest_run" | "manual";

export const SAMPLE_SOURCE_LABEL: Record<SampleSource, string> = {
  latest_run: "from latest run",
  manual: "manual"
};

export interface SampleEntry {
  name: string;
  type: TypeMetadata;
  value: unknown;
  source: SampleSource;
}

/** A port as both the request schema and a submission describe one. */
export interface SamplePort {
  name: string;
  type: codeGen.CodeGenTypeMetadata;
}

/**
 * The value each of a node's inputs last received, read from the upstream
 * nodes' generation timelines — the same source the single-node run path uses
 * to reuse a completed upstream output.
 */
export function latestInputValues(
  store: NodeStore,
  nodeId: string
): Record<string, unknown> {
  const { edges, workflow, findNode } = store.getState();
  const values: Record<string, unknown> = {};
  for (const edge of edges) {
    if (edge.target !== nodeId || !edge.targetHandle) {
      continue;
    }
    const source = findNode(edge.source);
    const generation = getCurrentGeneration(
      getNodeGenerations(workflow.id, edge.source),
      source?.data?.selected_generation
    );
    if (!generation || generation.status !== "completed") {
      continue;
    }
    const value = outputOf(generation, edge.sourceHandle ?? undefined);
    if (value !== undefined) {
      values[edge.targetHandle] = value;
    }
  }
  return values;
}

/**
 * One entry per declared port. A hand-edited value wins over the latest run;
 * a port with neither starts from its type's empty value.
 */
export function buildSampleEntries(
  ports: readonly SamplePort[],
  latest: Record<string, unknown>,
  manual: Record<string, unknown>
): SampleEntry[] {
  return ports.map((port) => {
    const type = normalizeTypeMetadata(port.type);
    if (Object.prototype.hasOwnProperty.call(manual, port.name)) {
      return { name: port.name, type, value: manual[port.name], source: "manual" };
    }
    if (Object.prototype.hasOwnProperty.call(latest, port.name)) {
      return {
        name: port.name,
        type,
        value: latest[port.name],
        source: "latest_run"
      };
    }
    return {
      name: port.name,
      type,
      value: defaultValueForType(type),
      source: "manual"
    };
  });
}

export function sampleValuesOf(
  entries: readonly SampleEntry[]
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const entry of entries) {
    values[entry.name] = entry.value;
  }
  return values;
}

export interface SamplePayload {
  /** Exactly what the request carries, pretty-printed for review. */
  json: string;
  /** Size the transport schema measures. */
  size: number;
  limit: number;
  exceedsLimit: boolean;
}

/**
 * Serialize the payload for the disclosure. The size is measured the way the
 * request schema measures it, so an oversize payload is reported here before
 * the server rejects it — never trimmed to fit.
 */
export function serializeSampleValues(
  values: Record<string, unknown>
): SamplePayload {
  const size = JSON.stringify(values).length;
  return {
    json: JSON.stringify(values, null, 2),
    size,
    limit: MAX_SAMPLE_VALUES_BYTES,
    exceedsLimit: size > MAX_SAMPLE_VALUES_BYTES
  };
}
