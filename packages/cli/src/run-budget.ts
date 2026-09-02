/**
 * The bounds one CLI agent run shares downward.
 *
 * Same object, same five settings, same defaults as a chat turn on the server
 * (`chat-turn.ts` → `createChatTurnBudget`): a run gets one {@link RunBudget}
 * and every loop it starts — a sub-agent, an `execute_plan` DAG, an `AgentNode`
 * reached through `run_node` — reserves against it instead of opening an
 * allowance of its own (invariant I-2). `--cost-cap` and `--timeout` override
 * the first two settings for one invocation; nothing else is per-run.
 *
 * The settings are read the way the server reads them — stored value first,
 * then the environment variable of the same name — and the read is
 * best-effort: an unreachable database falls back to the documented default
 * rather than failing the run.
 */

import { Setting } from "@nodetool-ai/models";
import { createRunBudget, type RunBudget } from "@nodetool-ai/runtime";
import { parseNumericOption } from "./numeric-options.js";

/**
 * Output-token worst case assumed when reserving a turn. No CLI loop sends a
 * `maxTokens`, so nothing bounds the answer from this side; the reservation
 * charges the same ceiling the chat turn does, which is what makes the dollar
 * cap hold before the money is spent rather than after.
 */
const CLI_TURN_MAX_OUTPUT_TOKENS = 16_384;

/** Documented defaults for the five `NODETOOL_AGENT_*` budget settings. */
const AGENT_BUDGET_DEFAULTS = {
  costCapUsd: 5,
  deadlineMs: 1_800_000,
  maxConcurrency: 8,
  maxTurns: 200,
  unpricedTokenCeiling: 400_000
} as const;

/** Stored value, then env var, then null — the server's own lookup order. */
async function readBudgetSetting(key: string): Promise<string | null> {
  try {
    const setting = await Setting.find("1", key);
    if (setting && setting.value.length > 0) return setting.value;
  } catch {
    // Settings store unavailable — the environment and the defaults stand.
  }
  const fromEnv = process.env[key];
  return fromEnv !== undefined && fromEnv.length > 0 ? fromEnv : null;
}

async function budgetSettingNumber(
  key: string,
  fallback: number
): Promise<number> {
  const raw = await readBudgetSetting(key);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * The run's USD ceiling, or `null` for no ceiling at all.
 *
 * A non-positive number means *no cap*, not a cap nothing can pass — the same
 * rule the setting documents, so `--cost-cap 0` and a stored `0` mean the same
 * thing. An absent setting takes the documented $5 default.
 */
async function budgetCostCapUsd(): Promise<number | null> {
  const raw = await readBudgetSetting("NODETOOL_AGENT_TURN_COST_CAP_USD");
  if (raw === null) return AGENT_BUDGET_DEFAULTS.costCapUsd;
  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

/** The two flags every CLI agent surface accepts. */
export interface RunBudgetFlags {
  /** `--cost-cap <usd>`; `0` lifts the cap. */
  costCap?: string | number;
  /** `--timeout <s>`; `0` leaves the run no time at all. */
  timeout?: string | number;
}

function flagNumber(
  value: string | number | undefined,
  flag: string
): number | undefined {
  if (value === undefined) return undefined;
  return parseNumericOption(String(value), flag, { min: 0 });
}

/**
 * Build the run's budget: the five settings, with the two flags overriding the
 * cost cap and the deadline.
 */
export async function createCliRunBudget(
  flags: RunBudgetFlags = {}
): Promise<RunBudget> {
  const capFlag = flagNumber(flags.costCap, "--cost-cap");
  const timeoutFlag = flagNumber(flags.timeout, "--timeout");
  const [settingCap, settingDeadlineMs, maxConcurrency, maxTurns, unpricedTokenCeiling] =
    await Promise.all([
      budgetCostCapUsd(),
      budgetSettingNumber(
        "NODETOOL_AGENT_TURN_DEADLINE_MS",
        AGENT_BUDGET_DEFAULTS.deadlineMs
      ),
      budgetSettingNumber(
        "NODETOOL_AGENT_MAX_CONCURRENCY",
        AGENT_BUDGET_DEFAULTS.maxConcurrency
      ),
      budgetSettingNumber(
        "NODETOOL_AGENT_MAX_TURNS",
        AGENT_BUDGET_DEFAULTS.maxTurns
      ),
      budgetSettingNumber(
        "NODETOOL_AGENT_UNPRICED_TOKEN_CEILING",
        AGENT_BUDGET_DEFAULTS.unpricedTokenCeiling
      )
    ]);

  return createRunBudget({
    capUsd: capFlag === undefined ? settingCap : capFlag > 0 ? capFlag : null,
    maxOutputTokens: CLI_TURN_MAX_OUTPUT_TOKENS,
    unpricedTokenCeiling,
    deadlineMs: timeoutFlag === undefined ? settingDeadlineMs : timeoutFlag * 1000,
    maxConcurrency,
    maxTurns
  });
}

/**
 * The reason a ceiling ended the run, or null when none did.
 *
 * A budget stop is not the model finishing its answer, and the two are
 * indistinguishable to a caller that only sees an empty transcript
 * (invariant I-3), so every CLI surface reports this before it reports
 * anything else about how the run ended.
 */
export function budgetStopReason(budget: RunBudget): string | null {
  return budget.exhausted?.detail ?? null;
}

/** `spent $0.0123` — what the whole run committed against the shared cap. */
export function budgetSummaryLine(budget: RunBudget): string {
  const spent = `$${budget.turns.spentUsd.toFixed(4)}`;
  const unpriced = budget.turns.unpricedTurns;
  // A turn on a model with no catalog price adds nothing to the total, so
  // the number is a lower bound and says so (invariant I-4).
  return unpriced > 0
    ? `spent at least ${spent} (${unpriced} turn(s) on a model with no catalog price)`
    : `spent ${spent}`;
}
