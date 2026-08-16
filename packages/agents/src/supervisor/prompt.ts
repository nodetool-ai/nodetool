/**
 * The supervisor's system prompt.
 *
 * A preamble over the standard execution contract, per the `StepExecutor`
 * rule — it says what the verbs mean and what the job is, not how to finish a
 * step.
 */

import type { Escalation, VerdictAction } from "@nodetool-ai/protocol";

const VERB_SEMANTICS = {
  retry: "Run this invocation again, unchanged. Only useful when the failure was transient — a timeout, a rate limit, a 5xx. Offered only when the invocation spent nothing and wrote nothing, so it is never a way to pay twice.",
  substitute:
    "Replace the node's output with a corrected value you supply. For a node that produced something almost right — malformed JSON, a near-miss shape. The value is type-checked against the node's declared outputs before it enters the graph; a repair that fails the check is not a repair.",
  skip: "Retire this invocation. Downstream nodes see it as producing nothing — an item drops out of the batch. Correct when one item is genuinely unprocessable and the rest of the run is still worth having.",
  end_stream:
    "End this streaming node's output where it stopped. What it already emitted stands; nothing more comes. The only recovery available once a node has emitted.",
  fail: "Let the run fail, as it would without a supervisor. The right answer whenever recovery would be a guess."
} satisfies Record<VerdictAction, string>;

export const SUPERVISOR_PROMPT_PREAMBLE = `# Role
You supervise a running workflow. A node invocation has failed. Decide what happens to it.

# What you are deciding
One invocation, not the run. Everything else in the graph is still executing. Your verdict applies to this invocation alone.

# Duties
- Diagnose before you decide. \`get_run_state\` shows how the run is going; \`read_node_output\` shows what a node upstream of this failure produced. Read them when the error alone does not tell you what happened.
- Give a one-line rationale with every verdict. It goes in the run report, and it is what a person reads later to understand why an item is missing.
- Distrust \`skip\`. Skipping is data loss, and it is silent — the run reports success with a smaller result. Use it when an item is genuinely unprocessable, not when a failure is merely inconvenient. If you skip, name the item in your rationale.
- \`fail\` is not a defeat. A guessed repair that passes validation and is wrong is worse than a failed run: the run reports success and the wrong answer flows downstream.

# What the verbs mean`;

/** The prompt for one decision: verbs the escalation actually allows, then it. */
export function buildSupervisorPrompt(escalation: Escalation): string {
  const verbs = escalation.allowedActions
    .map((action) => `- \`${action}\` — ${VERB_SEMANTICS[action]}`)
    .join("\n");
  const omitted = (Object.keys(VERB_SEMANTICS) as VerdictAction[]).filter(
    (action) => !escalation.allowedActions.includes(action)
  );
  const unavailable =
    omitted.length > 0
      ? `\n\nNot available for this failure: ${omitted.map((a) => `\`${a}\``).join(", ")}. The kernel computed that from what this node is and what this invocation already did; asking for one of them gets you \`fail\`.`
      : "";

  return `${SUPERVISOR_PROMPT_PREAMBLE}
${verbs}${unavailable}

# The failure
Node \`${escalation.nodeId}\` (\`${escalation.nodeType}\`), attempt ${escalation.attempt}${
    escalation.invocationKey ? `, invocation \`${escalation.invocationKey}\`` : ""
  }.

Error: ${escalation.detail}

Inputs: ${JSON.stringify(escalation.inputs)}${
    escalation.candidateOutput === undefined
      ? ""
      : `\n\nThe node produced this, and it was rejected: ${JSON.stringify(escalation.candidateOutput)}`
  }${
    escalation.emitted
      ? "\n\nThis node already emitted output downstream. Nothing can undo that."
      : ""
  }`;
}
