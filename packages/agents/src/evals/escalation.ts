/**
 * Interactive escalation for the tool-loop eval harness.
 *
 * Some objectives can't be finished from the prompt alone: a name the user
 * never gave, a destructive edit that needs confirmation, a capability the node
 * catalog doesn't have. The right behavior is to *escalate* — ask the user and
 * act on the answer — not to guess.
 *
 * This module hands the model an `ask_user` tool backed by a scripted user, so
 * an eval case can be interactive without a human in the loop: each question is
 * matched against the case's reply script, the matching reply is fed back as
 * the tool result, and every exchange is recorded so the case can score both
 * *that* the model asked and *what* it asked about.
 */

import { z } from "zod";
import type { EvalCheck } from "./graph-planner-eval.js";
import type { HeadlessTool } from "./tool-loop-bridge.js";
import { isString } from "../utils/type-guards.js";

/** Default name of the escalation tool exposed to the model. */
export const DEFAULT_ESCALATION_TOOL_NAME = "ask_user";

/** One scripted answer, selected by matching the model's question text. */
export interface EscalationReply {
  /** Label used in failure output — e.g. `output-name`. */
  name: string;
  /**
   * Question matcher. A RegExp is tested against the question (plus any
   * options/context the model passed); a string array matches when every entry
   * appears, case-insensitively.
   */
  when: RegExp | string[];
  /** What the scripted user answers. */
  reply: string;
}

export interface EscalationConfig {
  /** Tool name handed to the model. Defaults to `ask_user`. */
  toolName?: string;
  /** Tool description. Defaults to a generic escalate-when-unsure blurb. */
  description?: string;
  /** Replies tried in order; the first match wins. */
  replies: readonly EscalationReply[];
  /**
   * Answer used when no reply matches — an off-script question. Kept
   * deliberately unhelpful so a model that asks the wrong thing gains nothing.
   */
  fallback?: string;
}

/** One recorded question/answer exchange. */
export interface EscalationTurn {
  question: string;
  reply: string;
  /** Name of the matched {@link EscalationReply}, or null when off-script. */
  matched: string | null;
}

export interface EscalationChannel {
  tool: HeadlessTool;
  /** Every exchange so far, in order. */
  turns: () => EscalationTurn[];
}

const DEFAULT_DESCRIPTION =
  "Ask the user a question and wait for their answer. Use this when the request " +
  "is ambiguous, when required information is missing, or before doing anything " +
  "destructive — never guess at something only the user can decide. Returns the " +
  "user's reply.";

const DEFAULT_FALLBACK =
  "I don't have an answer for that — it's your call, just don't guess at " +
  "anything I explicitly asked you to check with me about.";

const escalationParameters = z.object({
  question: z.string().describe("The question to ask the user."),
  options: z
    .array(z.string())
    .optional()
    .describe("Concrete choices the user can pick between, if any."),
  context: z
    .string()
    .optional()
    .describe("Why you need the answer before continuing.")
});

/** The text a reply matcher sees: the question plus any options and context. */
function matchText(args: Record<string, unknown>): string {
  const parts = [String(args.question ?? "")];
  if (Array.isArray(args.options)) parts.push(args.options.join(" "));
  if (isString(args.context)) parts.push(args.context);
  return parts.join(" ");
}

function matches(reply: EscalationReply, text: string): boolean {
  if (reply.when instanceof RegExp) {
    // A `/g` or `/y` matcher carries `lastIndex` across calls, so the same
    // question would match on one turn and miss on the next.
    reply.when.lastIndex = 0;
    return reply.when.test(text);
  }
  const lower = text.toLowerCase();
  return reply.when.every((needle) => lower.includes(needle.toLowerCase()));
}

/** What the scripted user answers with, as the model sees it. */
interface EscalationAnswer {
  ok: true;
  answer: string;
}

/**
 * Build the `ask_user` tool for a case, plus the transcript of what was asked.
 * Fresh per run — the returned channel owns its own turn log.
 */
export function createEscalationChannel(
  config: EscalationConfig
): EscalationChannel {
  const turns: EscalationTurn[] = [];
  const tool: HeadlessTool = {
    name: config.toolName ?? DEFAULT_ESCALATION_TOOL_NAME,
    description: config.description ?? DEFAULT_DESCRIPTION,
    parameters: escalationParameters,
    execute: async (args: Record<string, unknown>): Promise<EscalationAnswer> => {
      const text = matchText(args);
      const hit = config.replies.find((reply) => matches(reply, text));
      const reply = hit?.reply ?? config.fallback ?? DEFAULT_FALLBACK;
      turns.push({
        question: String(args.question ?? ""),
        reply,
        matched: hit?.name ?? null
      });
      return { ok: true, answer: reply };
    }
  };
  return { tool, turns: () => turns.slice() };
}

/** Structural expectations over the escalation exchanges of a run. */
export interface EscalationExpectations {
  /** Escalation tool name, when a case renames it. Defaults to `ask_user`. */
  toolName?: string;
  /** Minimum number of questions asked (1 = the model must escalate at all). */
  minAsks?: number;
  /** Maximum number of questions — the ceiling on pestering the user. */
  maxAsks?: number;
  /**
   * Reply names (see {@link EscalationReply.name}) the model must have
   * triggered — i.e. it asked about the right things, not just *something*.
   */
  mustAsk?: string[];
  /** When true, every question must have matched a scripted reply. */
  allQuestionsMatched?: boolean;
  /**
   * Tool names that must not be called before the first escalation — the
   * "confirm before you act" constraint.
   */
  askBefore?: string[];
}

/**
 * Score one run's escalation behavior. Pure: takes the recorded turns and the
 * tool-name sequence, returns one check per expectation.
 *
 * Severities follow the rest of the harness: whether the model escalated, about
 * what, and before acting are `critical` — they are what these cases exist to
 * measure. How *often* it asked is `standard`.
 */
export function checkEscalationExpectations(
  turns: readonly EscalationTurn[],
  sequence: readonly string[],
  expect: EscalationExpectations
): EvalCheck[] {
  const checks: EvalCheck[] = [];
  const toolName = expect.toolName ?? DEFAULT_ESCALATION_TOOL_NAME;

  if (expect.minAsks !== undefined) {
    checks.push({
      name: `asks>=${expect.minAsks}`,
      pass: turns.length >= expect.minAsks,
      severity: "critical",
      detail: `asked ${turns.length}`
    });
  }
  if (expect.maxAsks !== undefined) {
    checks.push({
      name: `asks<=${expect.maxAsks}`,
      pass: turns.length <= expect.maxAsks,
      severity: "standard",
      detail: `asked ${turns.length}`
    });
  }

  for (const name of expect.mustAsk ?? []) {
    const pass = turns.some((turn) => turn.matched === name);
    checks.push({
      name: `asked:${name}`,
      pass,
      severity: "critical",
      detail: pass
        ? undefined
        : `no question matched "${name}"` +
          (turns.length > 0
            ? ` (asked: ${turns.map((t) => JSON.stringify(t.question)).join(", ")})`
            : " (asked nothing)")
    });
  }

  if (expect.allQuestionsMatched) {
    const offScript = turns.filter((turn) => turn.matched === null);
    checks.push({
      name: "no-off-script-asks",
      pass: offScript.length === 0,
      severity: "critical",
      detail:
        offScript.length === 0
          ? undefined
          : `${offScript.length} unscripted: ${offScript
              .map((t) => JSON.stringify(t.question))
              .join(", ")}`
    });
  }

  for (const name of expect.askBefore ?? []) {
    const firstAsk = sequence.indexOf(toolName);
    const firstCall = sequence.indexOf(name);
    // Never calling the tool at all satisfies the constraint — the case's
    // final-state predicates decide whether it should have been called.
    const pass = firstCall === -1 || (firstAsk !== -1 && firstAsk < firstCall);
    checks.push({
      name: `ask-before:${name}`,
      pass,
      severity: "critical",
      detail: pass
        ? undefined
        : firstAsk === -1
          ? `called ${name} without ever asking`
          : `called ${name} at ${firstCall}, first asked at ${firstAsk}`
    });
  }

  return checks;
}
