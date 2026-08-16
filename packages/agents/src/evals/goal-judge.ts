/**
 * LLM judge for end-to-end eval suites: given the goal a run was supposed to
 * achieve and what the run actually produced, decide whether the goal was met.
 *
 * Structural checks (an output exists, it is non-empty, it matches a regex)
 * cannot tell a real German translation from the English text echoed back, so
 * the e2e suite pairs them with this judge. The judge answers in plain JSON
 * rather than through a tool call, so it works identically on providers with
 * weak or absent tool support, and an unparseable answer is reported as a
 * judge error instead of being silently scored as a pass.
 */

import type { BaseProvider, Message } from "@nodetool-ai/runtime";
import {
  isBoolean,
  isNumber,
  isObjectLike,
  isString
} from "../utils/type-guards.js";

export interface GoalJudgeVerdict {
  /** The run produced what the goal asked for. */
  achieved: boolean;
  /** How well, 0..1 — partial credit for a run that got some of it right. */
  score: number;
  /** One or two sentences, quoting the outputs it judged. */
  reasoning: string;
  /** Set when the judge could not be reached or its answer was unparseable. */
  error?: string;
}

export interface JudgeGoalOptions {
  provider: BaseProvider;
  model: string;
  /** What the run was asked to do, in the planner's words. */
  objective: string;
  /** What "achieved" means for this case, in the case author's words. */
  goal: string;
  /** Inputs the run was started with, keyed by input name. */
  inputs?: Record<string, unknown>;
  /** What the run produced, keyed by output name. */
  outputs: Record<string, unknown>;
  signal?: AbortSignal;
}

const JUDGE_MAX_TOKENS = 700;
const MAX_VALUE_CHARS = 4000;

const SYSTEM_PROMPT = `You grade the output of an automated workflow run.

You are given the objective the workflow was built for, a goal statement
describing what a successful run must produce, the inputs the run started
with, and the outputs it produced.

Judge ONLY the outputs against the goal. Ignore how the workflow was built,
how many steps it took, and whether you would have phrased the result
differently. Wording, formatting, and length may vary freely — content is what
counts. An output that is empty, an error message, an unfilled placeholder, or
an echo of the input where new content was required does NOT achieve the goal.

Answer with a single JSON object and nothing else:
{"achieved": true|false, "score": 0.0-1.0, "reasoning": "one or two sentences"}

"achieved" is your verdict. "score" is partial credit: 1.0 when the goal is
fully met, 0.0 when nothing about it was met, in between when part of it was.
Quote the deciding output in "reasoning".`;

/** Render one output value for the judge, truncating long or binary payloads. */
export function renderValueForJudge(
  value: unknown,
  maxChars: number = MAX_VALUE_CHARS
): string {
  if (value === null || value === undefined) return String(value);
  if (value instanceof Uint8Array) return `<binary ${value.byteLength} bytes>`;
  const text =
    isString(value) ? value : safeStringify(value);
  return text.length > maxChars
    ? `${text.slice(0, maxChars)}…[${text.length} chars]`
    : text;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function renderRecord(record: Record<string, unknown>): string {
  const entries = Object.entries(record);
  if (entries.length === 0) return "(none)";
  return entries
    .map(([name, value]) => `- ${name}: ${renderValueForJudge(value)}`)
    .join("\n");
}

/**
 * Parse the judge's answer. Accepts a bare JSON object or one wrapped in prose
 * or a fenced code block; anything else returns null so the caller can report
 * a judge error rather than guess a verdict.
 */
export function parseJudgeVerdict(text: string): GoalJudgeVerdict | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!isObjectLike(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  if (!isBoolean(obj.achieved)) return null;
  const rawScore = isNumber(obj.score) ? obj.score : NaN;
  const score = Number.isFinite(rawScore)
    ? Math.min(1, Math.max(0, rawScore))
    : obj.achieved
      ? 1
      : 0;
  return {
    achieved: obj.achieved,
    score,
    reasoning:
      isString(obj.reasoning) ? obj.reasoning : "(no reasoning given)"
  };
}

function extractText(content: Message["content"]): string {
  if (isString(content)) return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      isObjectLike(part) && "text" in part
        ? String((part as { text: unknown }).text ?? "")
        : ""
    )
    .join("");
}

/**
 * Ask the judge whether a run achieved its goal. Never throws: a provider
 * failure or an unparseable answer comes back as `achieved: false` with
 * `error` set, so a broken judge reads as a harness problem in the report
 * rather than as a failing workflow.
 */
export async function judgeGoalAchievement(
  opts: JudgeGoalOptions
): Promise<GoalJudgeVerdict> {
  const userPrompt = [
    `OBJECTIVE:\n${opts.objective}`,
    `GOAL (what a successful run must produce):\n${opts.goal}`,
    `INPUTS:\n${renderRecord(opts.inputs ?? {})}`,
    `OUTPUTS:\n${renderRecord(opts.outputs)}`
  ].join("\n\n");

  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt }
  ];

  let reply: Message;
  try {
    reply = await opts.provider.generateMessageTraced({
      messages,
      model: opts.model,
      tools: [],
      maxTokens: JUDGE_MAX_TOKENS,
      temperature: 0,
      signal: opts.signal
    });
  } catch (err) {
    return {
      achieved: false,
      score: 0,
      reasoning: "",
      error: `judge call failed: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  const verdict = parseJudgeVerdict(extractText(reply.content));
  if (!verdict) {
    return {
      achieved: false,
      score: 0,
      reasoning: "",
      error: "judge answer was not parseable JSON"
    };
  }
  return verdict;
}
