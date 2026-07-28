/**
 * Built-in evaluation cases for ScriptPlanner (script mode) authoring.
 *
 * Each case is an objective whose *shape* demands a particular control flow —
 * fan-out, a loop that runs until a condition holds, a budget-scaled sweep, a
 * two-stage pipeline. The expectations check that the authored script actually
 * uses it, rather than serializing everything or unrolling a loop by hand.
 */

export interface ScriptPlannerEvalExpectations {
  /** Minimum `agent()` call sites in the source. */
  minAgentCalls?: number;
  /** Independent work must go through `parallel()` or `pipeline()`. */
  requireConcurrency?: boolean;
  /** Unknown-size work must use a real `for`/`while` loop. */
  requireLoop?: boolean;
  /** A loop must be guarded by `budget.remainingCalls()` / `spentUsd()`. */
  requireBudgetGuard?: boolean;
  /** Some `agent()` call must request a structured result via `schema:`. */
  requireSchema?: boolean;
  /** Regex sources; each must match the script source (case-insensitive). */
  requiredPatterns?: string[];
  /** Regex sources; none may match the script source. */
  forbiddenPatterns?: string[];
  /** The script is coordination logic — cap how long it may get. */
  maxChars?: number;
}

export interface ScriptPlannerEvalCase {
  id: string;
  description: string;
  objective: string;
  inputs?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  /** Case needs configured model providers — skipped when there are none. */
  needsModelProviders?: boolean;
  expect: ScriptPlannerEvalExpectations;
}

export const SCRIPT_PLANNER_EVAL_CASES: readonly ScriptPlannerEvalCase[] = [
  {
    id: "fan-out-summaries",
    description: "Independent per-item work must fan out, not serialize",
    objective:
      "Summarize each of these five product pages in two sentences: /pricing, /security, /integrations, /changelog, /about. The five summaries are independent of each other. Return all five.",
    expect: {
      minAgentCalls: 1,
      requireConcurrency: true,
      maxChars: 2500
    }
  },
  {
    id: "loop-until-enough",
    description: "An unknown-size target needs a loop, not a fixed unroll",
    objective:
      "Find ten distinct, non-duplicate claims about the safety of lithium iron phosphate batteries. Each round of searching may turn up duplicates, so keep going until you have ten distinct claims. Return the ten claims.",
    expect: {
      minAgentCalls: 1,
      requireLoop: true,
      requireBudgetGuard: true,
      requiredPatterns: ["web_search"],
      maxChars: 3500
    }
  },
  {
    id: "two-stage-pipeline",
    description: "Per-item find-then-verify should pipeline, not barrier",
    objective:
      "For each of these three claims, first gather supporting evidence, then have a second agent verify that evidence and rate it supported or refuted: 'coffee lowers blood pressure', 'the Sahara is expanding', 'octopuses have three hearts'. Each claim's verification only needs its own evidence. Return each claim with its rating.",
    outputSchema: {
      type: "object",
      properties: {
        claims: {
          type: "array",
          items: {
            type: "object",
            properties: {
              claim: { type: "string" },
              rating: { type: "string" }
            },
            required: ["claim", "rating"]
          }
        }
      },
      required: ["claims"]
    },
    expect: {
      minAgentCalls: 2,
      requireConcurrency: true,
      requireSchema: true,
      maxChars: 3500
    }
  },
  {
    id: "budget-scaled-sweep",
    description: "Fleet size must be derived from the budget, not hardcoded",
    objective:
      "Audit the input codebase summary for security issues. Run as many independent reviewer agents as the remaining budget allows — scale the fleet to the budget rather than picking a fixed number — then return the deduplicated issues.",
    inputs: { summary: "A Fastify API with SQLite storage and JWT auth." },
    expect: {
      minAgentCalls: 1,
      requireConcurrency: true,
      requireBudgetGuard: true,
      maxChars: 3500
    }
  },
  {
    id: "sequential-refinement",
    description: "A genuine data dependency must stay sequential",
    objective:
      "Draft a product announcement for the input feature, then have a second agent rewrite the draft to be 30% shorter, then have a third agent write a one-line social post based on the shortened version. Each step needs the previous step's text. Return the final social post.",
    inputs: { feature: "offline mode for the mobile app" },
    expect: {
      minAgentCalls: 3,
      requiredPatterns: ["await agent"],
      forbiddenPatterns: ["\\bparallel\\s*\\("],
      maxChars: 2500
    }
  }
];
