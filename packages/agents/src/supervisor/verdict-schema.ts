/**
 * The verdict contract handed to the model, narrowed to what the kernel will
 * actually accept for one escalation.
 *
 * The kernel computes `allowedActions` per escalation and rejects anything
 * outside it. Offering the full verb list anyway would spend a decision to
 * produce an answer that is thrown away, so the schema is built per decision
 * from that set. Enforcement stays in the kernel — this only stops the model
 * from wasting a round.
 */

import type { VerdictAction } from "@nodetool-ai/protocol";

const RATIONALE = {
  type: "string",
  description:
    "One line: why this verdict. Appears in the run report next to the node.",
  minLength: 1
} as const;

const APPLY_TO = {
  type: "string",
  enum: ["invocation", "signature"],
  description:
    "`invocation` (default) decides this failure only. `signature` decides " +
    "every later failure on this node with the same failure signature, with " +
    "no further deliberation — use it when the cause is categorical, not " +
    "specific to this item."
} as const;

function branch(action: VerdictAction) {
  const base: Record<string, unknown> = {
    type: "object",
    properties: {
      action: { type: "string", const: action },
      rationale: RATIONALE
    },
    required: ["action", "rationale"],
    additionalProperties: false
  };
  const properties = base["properties"] as Record<string, unknown>;
  const required = base["required"] as string[];

  if (action === "substitute") {
    properties["outputs"] = {
      type: "object",
      description:
        "Replacement value per output slot of the node. Type-checked against " +
        "the node's declared outputs before it enters the graph.",
      additionalProperties: true
    };
    required.push("outputs");
  }
  if (action === "skip" || action === "fail") {
    properties["applyTo"] = APPLY_TO;
  }
  return base;
}

/** JSON schema for a verdict, restricted to `allowed`. */
export function buildVerdictSchema(
  allowed: readonly VerdictAction[]
) {
  return {
    type: "object",
    description: "The verdict for this failed invocation.",
    oneOf: allowed.map(branch)
  };
}
