/**
 * Turning a transcript into findings an outer agent can act on.
 *
 * This is pure: transcript and tool calls in, {@link FrictionSignal}s out. No
 * model, no I/O, no scoring. That matters because the optimizer's model call is
 * the expensive, non-reproducible half of the loop — everything decidable
 * without one is decided here, where a test can pin it.
 *
 * **The attribution is a proposal, not a verdict.** Each rule below owns its
 * `owner` because the shape of the evidence justifies it: a tool that rejected
 * the same arguments three times is telling us about the tool, and a run that
 * never called the one tool the job needs is telling us about what the agent
 * was told. Where the evidence supports both readings the rule says
 * `unattributed` and lets the model decide with the transcript in front of it.
 * A rule that guesses confidently sends fixes to the wrong file.
 */

import type { ToolLoopCallRecord } from "../app-build/tool-loop.js";
import type { FrictionSignal, JobToBeDone } from "./types.js";

/** Errors repeated this many times stop being a slip and start being a defect. */
const REPEAT_ERROR_THRESHOLD = 2;

/** Identical calls repeated this many times mean the agent is stuck. */
const REPEAT_CALL_THRESHOLD = 3;

const errorText = (result: unknown): string => {
  if (typeof result === "string") return result;
  if (result !== null && typeof result === "object" && "error" in result) {
    const { error } = result as { error: unknown };
    return typeof error === "string" ? error : JSON.stringify(error);
  }
  return JSON.stringify(result);
};

/** Stable key for "the same call again" — name plus arguments. */
const callKey = (call: ToolLoopCallRecord): string =>
  `${call.name}(${JSON.stringify(call.args)})`;

/**
 * A tool that errored repeatedly is a harness finding. Whatever the agent got
 * wrong the first time, a tool whose error text did not teach it the right
 * shape by the third attempt has an error-message problem, and that is a string
 * in our code — the cheapest fix in the whole loop.
 */
function repeatedToolErrors(calls: ToolLoopCallRecord[]): FrictionSignal[] {
  const byTool = new Map<string, ToolLoopCallRecord[]>();
  for (const call of calls) {
    if (!call.isError) continue;
    const seen = byTool.get(call.name) ?? [];
    seen.push(call);
    byTool.set(call.name, seen);
  }
  const signals: FrictionSignal[] = [];
  for (const [tool, errored] of byTool) {
    if (errored.length < REPEAT_ERROR_THRESHOLD) continue;
    signals.push({
      kind: "repeated-tool-error",
      owner: "harness",
      severity: "blocking",
      tool,
      summary: `${tool} returned an error ${errored.length} times; its error text did not get the agent to a working call.`,
      callIndices: errored.map((c) => c.index),
      evidence: errored.slice(0, 4).map((c) => errorText(c.result))
    });
  }
  return signals;
}

/**
 * The same call, arguments and all, more than twice. The agent is not learning
 * anything from the result — either the tool is answering uninformatively or it
 * is silently not doing what its name promises. Both are harness findings.
 */
function repeatedIdenticalCalls(
  calls: ToolLoopCallRecord[]
): FrictionSignal[] {
  const byKey = new Map<string, ToolLoopCallRecord[]>();
  for (const call of calls) {
    const seen = byKey.get(callKey(call)) ?? [];
    seen.push(call);
    byKey.set(callKey(call), seen);
  }
  const signals: FrictionSignal[] = [];
  for (const [key, repeats] of byKey) {
    if (repeats.length < REPEAT_CALL_THRESHOLD) continue;
    const first = repeats[0];
    if (first === undefined) continue;
    signals.push({
      kind: "repeated-identical-call",
      owner: "harness",
      severity: "wasteful",
      tool: first.name,
      summary: `${first.name} was called ${repeats.length} times with identical arguments; its result did not move the agent on.`,
      callIndices: repeats.map((c) => c.index),
      evidence: [key, errorText(first.result)]
    });
  }
  return signals;
}

/**
 * A run that made no tool calls at all. The agent was handed tools and used
 * none of them, so nothing it was told got it to the first call — a prompt
 * finding, and the only one this file states with confidence.
 */
function noToolCalls(calls: ToolLoopCallRecord[]): FrictionSignal[] {
  if (calls.length > 0) return [];
  return [
    {
      kind: "no-tool-calls",
      owner: "prompt",
      severity: "blocking",
      summary:
        "The agent finished without calling a single tool — nothing in the prompt got it to start.",
      callIndices: [],
      evidence: []
    }
  ];
}

/**
 * Far more calls than the job should need. Whether that is a prompt that failed
 * to describe the short path or a tool surface that forces the long one is
 * exactly the judgement the transcript supports and this function does not, so
 * it stays unattributed.
 */
function overBudget(
  calls: ToolLoopCallRecord[],
  expected: number | undefined
): FrictionSignal[] {
  if (expected === undefined || calls.length <= expected) return [];
  return [
    {
      kind: "over-budget",
      owner: "unattributed",
      severity: "wasteful",
      summary: `The job took ${calls.length} tool calls against a ${expected}-call budget.`,
      callIndices: [],
      evidence: [`expected<=${expected}`, `actual=${calls.length}`]
    }
  ];
}

/**
 * The job was not achieved and nothing above explains why. Recorded so an
 * unexplained failure is never silent — a run that fails with an empty friction
 * list is the optimizer's most interesting case, not its least.
 */
function unexplainedFailure(
  achieved: boolean,
  found: FrictionSignal[]
): FrictionSignal[] {
  if (achieved || found.some((s) => s.severity === "blocking")) return [];
  return [
    {
      kind: "unexplained-failure",
      owner: "unattributed",
      severity: "blocking",
      summary:
        "The job was not achieved and no tool errored — the agent did something coherent that was not the job.",
      callIndices: [],
      evidence: []
    }
  ];
}

export interface DeriveFrictionInput {
  job: Pick<JobToBeDone, "expectedToolCalls">;
  toolCalls: ToolLoopCallRecord[];
  achieved: boolean;
}

/** Every friction signal a run's tool calls support, blocking findings first. */
export function deriveFriction(input: DeriveFrictionInput): FrictionSignal[] {
  const { toolCalls, achieved, job } = input;
  const signals = [
    ...noToolCalls(toolCalls),
    ...repeatedToolErrors(toolCalls),
    ...repeatedIdenticalCalls(toolCalls),
    ...overBudget(toolCalls, job.expectedToolCalls)
  ];
  signals.push(...unexplainedFailure(achieved, signals));
  const rank: Record<FrictionSignal["severity"], number> = {
    blocking: 0,
    wasteful: 1,
    cosmetic: 2
  };
  return signals.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
