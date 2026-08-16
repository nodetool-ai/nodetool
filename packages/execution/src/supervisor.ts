/**
 * Reporting for supervised runs: one vocabulary for "what did the supervisor
 * do", shared by every surface that prints or serializes it.
 *
 * The record itself is `Intervention` from `@nodetool-ai/protocol` — minted by
 * the kernel, carried on `RunResult.interventions` and on every
 * `supervisor_decision` message. Nothing here reshapes it; these are the
 * rollup and the two lines a surface prints.
 *
 * See docs/workflow-supervisor-design.md §4 and §7.
 */
import type { DecidedBy, Intervention, VerdictAction } from "@nodetool-ai/protocol";

/** The shield that marks a supervised line. */
export const INTERVENTION_MARK = "⛨";

/** Per-run rollup of what supervision decided and what it cost. */
export interface SupervisedRunSummary {
  /** Interventions recorded, whoever decided them. */
  decisions: number;
  /** Decisions that actually reached the model — the ones that cost money. */
  agentDecisions: number;
  byAction: Record<VerdictAction, number>;
  byDecider: Record<DecidedBy, number>;
  /** Supervisor spend for the run, in USD. */
  costUsd: number;
}

const ZERO_ACTIONS = {
  retry: 0,
  substitute: 0,
  skip: 0,
  end_stream: 0,
  fail: 0
} satisfies Record<VerdictAction, number>;

const ZERO_DECIDERS = {
  agent: 0,
  sticky: 0,
  bounds: 0,
  default: 0,
  kernel: 0
} satisfies Record<DecidedBy, number>;

export function summarizeInterventions(
  interventions: readonly Intervention[]
): SupervisedRunSummary {
  const byAction = { ...ZERO_ACTIONS };
  const byDecider = { ...ZERO_DECIDERS };
  let costUsd = 0;
  for (const item of interventions) {
    byAction[item.verdict.action] += 1;
    byDecider[item.decidedBy] += 1;
    costUsd += item.costUsd ?? 0;
  }
  return {
    decisions: interventions.length,
    agentDecisions: byDecider.agent,
    byAction,
    byDecider,
    costUsd
  };
}

/** Human-readable phrase for a verdict, in the product's four verbs. */
function describeVerdict(intervention: Intervention): string {
  const { verdict } = intervention;
  switch (verdict.action) {
    case "retry":
      return "retried";
    case "substitute":
      return "repaired output";
    case "skip":
      return verdict.applyTo === "signature"
        ? "skipped (and every matching failure)"
        : "skipped";
    case "end_stream":
      // Presented under skip per design §4: the kernel action stays distinct,
      // the record keeps it, the reader sees one verb family.
      return "skipped the rest, kept what was produced";
    case "fail":
      return verdict.reason ? `failed — ${verdict.reason}` : "failed";
  }
}

/**
 * One inline line per intervention, e.g.
 * `⛨ fetch-item [3] skipped — HTTP 404 (agent, $0.0041)`.
 */
export function formatInterventionLine(intervention: Intervention): string {
  const { escalation } = intervention;
  const item = escalation.invocationKey ? ` [${escalation.invocationKey}]` : "";
  const cost =
    intervention.costUsd && intervention.costUsd > 0
      ? `, $${intervention.costUsd.toFixed(4)}`
      : "";
  return (
    `${INTERVENTION_MARK} ${escalation.nodeId}${item} ` +
    `${describeVerdict(intervention)} — ${escalation.detail} ` +
    `(${intervention.decidedBy}${cost})`
  );
}

/**
 * The run's closing supervised line, e.g.
 * `⛨ supervised: 3 decisions, 2 skipped, 1 retried, +$0.0200`.
 *
 * Item counts (`198/200 items`) are a fan-out property no run-level record
 * carries — the kernel counts invocations, not the batch a user thinks in —
 * so a caller that knows its item total passes it in; otherwise the line
 * reports decisions.
 */
export function formatSupervisedSummary(
  summary: SupervisedRunSummary,
  items?: { total: number; produced: number }
): string {
  const parts: string[] = [];
  if (items) parts.push(`${items.produced}/${items.total} items`);
  const verbs: Array<[VerdictAction, string]> = [
    ["skip", "skipped"],
    ["end_stream", "stream(s) ended early"],
    ["retry", "retried"],
    ["substitute", "repaired"],
    ["fail", "failed"]
  ];
  for (const [action, label] of verbs) {
    const n = summary.byAction[action];
    if (n > 0) parts.push(`${n} ${label}`);
  }
  parts.push(
    `${summary.decisions} decision${summary.decisions === 1 ? "" : "s"}`
  );
  parts.push(`+$${summary.costUsd.toFixed(4)}`);
  return `${INTERVENTION_MARK} supervised: ${parts.join(", ")}`;
}
