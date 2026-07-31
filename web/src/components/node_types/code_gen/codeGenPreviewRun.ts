/**
 * Running a generated submission locally, before it is applied.
 *
 * The preview is an ordinary single-node run: the submission is turned into
 * Code Node data and executed through `runInlineGraphJob`, the same path the
 * canvas uses. Nothing here touches the real node — the graph is synthetic and
 * is thrown away with the result.
 */
import type { codeGen } from "@nodetool-ai/protocol/api-schemas";

import { CODE_NODE_TYPE } from "../../../constants/nodeTypes";
import type { InlineGraph } from "../../../lib/workflow/runInlineGraphJob";
import {
  normalizeTypeMetadata,
  valueFitsType
} from "../../../utils/dynamicSlots";
import { codeGenSubmissionToNodeData } from "../../../utils/codeGenSubmission";

export const PREVIEW_NODE_ID = "code_gen_preview";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A one-node graph carrying the submission's code, slots and sample values. */
export function buildPreviewGraph(
  submission: codeGen.CodeGenSubmission,
  sampleValues: Record<string, unknown>
): InlineGraph {
  const data = codeGenSubmissionToNodeData(submission, {});
  return {
    nodes: [
      {
        id: PREVIEW_NODE_ID,
        type: CODE_NODE_TYPE,
        data: data.properties,
        dynamic_properties: sampleValues,
        dynamic_inputs: data.dynamic_inputs,
        dynamic_outputs: data.dynamic_outputs
      }
    ],
    edges: []
  };
}

/**
 * The preview node's named outputs. The runner keys a node's result by node
 * id; a run that ended before the node reported leaves the outer record, which
 * is then simply empty of the declared names.
 */
export function readPreviewOutputs(
  outputs: Record<string, unknown>
): Record<string, unknown> {
  const scoped = outputs[PREVIEW_NODE_ID];
  return isRecord(scoped) ? scoped : outputs;
}

const describeValue = (value: unknown): string => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "a list";
  if (isRecord(value)) {
    const tag = value.type;
    return typeof tag === "string" && tag.length > 0 ? `a ${tag}` : "an object";
  }
  return `a ${typeof value}`;
};

/**
 * Declared outputs the run did not honour: missing entirely, or carrying a
 * value the runner would not accept for the declared type.
 */
export function outputTypeWarnings(
  outputs: readonly codeGen.CodeGenOutputPort[],
  produced: Record<string, unknown>
): string[] {
  const warnings: string[] = [];
  for (const port of outputs) {
    if (!Object.prototype.hasOwnProperty.call(produced, port.name)) {
      warnings.push(`Output "${port.name}" was not produced by this run.`);
      continue;
    }
    const type = normalizeTypeMetadata(port.type);
    const value = produced[port.name];
    if (!valueFitsType(value, type)) {
      warnings.push(
        `Output "${port.name}" is declared ${type.type} but the run produced ${describeValue(value)}.`
      );
    }
  }
  return warnings;
}

let previewJobCounter = 0;

/** Monotonic id used to key preview state and to scope the run's messages. */
export const nextPreviewJobId = (): string =>
  `code-gen-preview-${++previewJobCounter}`;
