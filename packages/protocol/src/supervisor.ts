/**
 * @nodetool-ai/protocol – Workflow Supervisor
 *
 * A failing node invocation raises an `Escalation`; a handler returns a
 * `Verdict`. Both cross the kernel/agents boundary and appear in messages
 * and in `RunResult`, so they live here rather than in either package.
 *
 * See docs/workflow-supervisor-design.md §4.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Verdicts
// ---------------------------------------------------------------------------

export const verdictActionSchema = z.enum([
  "retry",
  "substitute",
  "skip",
  "end_stream",
  "fail"
]);

export type VerdictAction = z.infer<typeof verdictActionSchema>;

/** Scope of a `skip`/`fail` verdict: this invocation, or every matching failure. */
export const verdictScopeSchema = z.enum(["invocation", "signature"]);

export type VerdictScope = z.infer<typeof verdictScopeSchema>;

export const verdictSchema = z.discriminatedUnion("action", [
  // No property overrides in v1 — a free-form record would let the supervisor
  // rewrite URLs, prompts, and paths. Design §4.
  z.object({ action: z.literal("retry") }),
  z.object({
    action: z.literal("substitute"),
    outputs: z.record(z.string(), z.unknown())
  }),
  z.object({
    action: z.literal("skip"),
    applyTo: verdictScopeSchema.optional()
  }),
  z.object({ action: z.literal("end_stream") }),
  z.object({
    action: z.literal("fail"),
    reason: z.string().optional(),
    applyTo: verdictScopeSchema.optional()
  })
]);

export type Verdict = z.infer<typeof verdictSchema>;

/**
 * Who produced the *applied* verdict. Only `"agent"` involved a model.
 * `"kernel"` means the handle's answer was outside the escalation's allowed
 * set and was replaced with `fail` — the one value that says the supervisor
 * was overruled rather than obeyed.
 */
export const decidedBySchema = z.enum([
  "agent",
  "sticky",
  "bounds",
  "default",
  "kernel"
]);

export type DecidedBy = z.infer<typeof decidedBySchema>;

// ---------------------------------------------------------------------------
// Escalations
// ---------------------------------------------------------------------------

export const escalationSchema = z.object({
  nodeId: z.string(),
  nodeType: z.string(),
  /** Full lineage chain of the failing invocation, as `root=index` pairs. */
  correlationLineage: z.array(z.string()),
  /** Leaf token of `correlationLineage`; `""` for single-fire nodes. */
  invocationKey: z.string(),
  /** Kernel-computed; both the verdict schema and enforcement derive from it. */
  allowedActions: z.array(verdictActionSchema),
  /** The thrown error, stringified, redacted and truncated. */
  detail: z.string(),
  /** Stable categorical code. Absent ⇒ stickiness disabled. */
  failureSignature: z.string().optional(),
  /** From `RecoverableNodeError` — the malformed value, redacted and truncated. */
  candidateOutput: z.unknown().optional(),
  /** The invocation's input values, redacted and truncated. */
  inputs: z.record(z.string(), z.unknown()),
  /** 1-based, per `(nodeId, invocationKey)`. */
  attempt: z.number(),
  /** Provider cost recorded by this invocation. */
  spentCostUsd: z.number(),
  createdAssets: z.boolean(),
  /** Node metadata opt-in; unknown ⇒ false ⇒ no retry. */
  retrySafe: z.boolean(),
  /** True while the failing invocation is a streaming one that already emitted. */
  emitted: z.boolean()
});

export type Escalation = z.infer<typeof escalationSchema>;

export const interventionSchema = z.object({
  escalation: escalationSchema,
  verdict: verdictSchema,
  decidedBy: decidedBySchema,
  /** Supervisor spend for this decision, in USD. */
  costUsd: z.number().optional()
});

export type Intervention = z.infer<typeof interventionSchema>;

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export const supervisorEscalationSchema = z.object({
  type: z.literal("supervisor_escalation"),
  node_id: z.string(),
  node_name: z.string().nullable().optional(),
  escalation: escalationSchema
});

export type SupervisorEscalation = z.infer<typeof supervisorEscalationSchema>;

export const supervisorDecisionSchema = z.object({
  type: z.literal("supervisor_decision"),
  node_id: z.string(),
  node_name: z.string().nullable().optional(),
  escalation: escalationSchema,
  verdict: verdictSchema,
  decided_by: decidedBySchema,
  cost: z.number().nullable().optional()
});

export type SupervisorDecision = z.infer<typeof supervisorDecisionSchema>;
