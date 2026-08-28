/**
 * The outer half of the loop: read a run, propose a fix.
 *
 * The inner loop drives a model through a job and records what happened. This
 * reads that record and asks a *different* model one question — why did this
 * job go the way it did, and what one change would make it go better next time.
 *
 * Three things keep the answer worth having.
 *
 * **It reads the transcript, not the score.** The model is shown the system
 * prompt verbatim, every assistant turn, and every tool call with its
 * arguments and result. A summary would be us diagnosing the run and the model
 * grading our diagnosis.
 *
 * **It must name a target.** A proposal says which file it would change and
 * what it would put there. "Improve the prompt" is not a proposal, and the
 * parser rejects a response that does not name a `target` and a `change`.
 *
 * **It proposes; it never applies.** Nothing here writes to a prompt or a tool.
 * The proposal lands in the run bundle for a human or a PR to act on, which is
 * the same posture the anti-slop ratchet takes: it opens a PR, it merges
 * nothing. A loop that edited its own prompts on a model's say-so would have no
 * reviewable step between a bad diagnosis and a shipped regression.
 */

import type { BaseProvider, Message } from "@nodetool-ai/runtime";
import { isString } from "../utils/type-guards.js";
import type { FrictionOwner, JobRunReport } from "./types.js";

/** One change the optimizer would make. */
export interface FixProposal {
  /** Where the fix goes — a repo-relative path, or the prompt under test. */
  target: string;
  owner: FrictionOwner;
  /** What is wrong, grounded in the transcript. */
  diagnosis: string;
  /** The change to make, concretely enough to apply. */
  change: string;
  /** What in the run supports this — quoted, not paraphrased. */
  evidence: string[];
  /** How sure the optimizer is, in [0,1]. */
  confidence: number;
}

export interface OptimizationReport {
  jobId: string;
  statement: string;
  achieved: boolean;
  /** Empty when the run was clean and the optimizer found nothing to change. */
  proposals: FixProposal[];
  /** Set when the optimizer could not be run or its answer did not parse. */
  error?: string;
  costUsd: number;
}

const OPTIMIZER_SYSTEM_PROMPT = `You review transcripts of an AI agent operating NodeTool and propose one change that would make the next run go better.

You are shown the job the agent was asked to do, the system prompt it was given, everything it said, every tool it called with the arguments and the result, and whether it achieved the job.

Decide where the blame lands:
- HARNESS — a tool's description did not say what it does, its schema rejected a reasonable call, its error text did not teach the agent the right shape, or its result was uninformative. Fix these in the tool.
- PROMPT — the agent was never told something it needed, or was told something that sent it the wrong way. Fix these in the system prompt.

Rules:
- Ground every claim in the transcript. Quote the tool call or the error you are talking about.
- A run that achieved the job can still have findings — wasted turns are findings.
- If nothing is worth changing, return an empty proposals array. Do not invent work.
- Never propose loosening an outcome check to make a run pass.

Reply with JSON only, no prose around it:
{"proposals": [{"target": "<file path or 'system prompt'>", "owner": "harness"|"prompt", "diagnosis": "...", "change": "...", "evidence": ["..."], "confidence": 0.0-1.0}]}`;

const MAX_RESULT_CHARS = 600;

const truncate = (text: string, limit: number): string =>
  text.length <= limit ? text : `${text.slice(0, limit)}… [${text.length} chars]`;

const contentText = (content: Message["content"]): string => {
  if (isString(content)) return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        isString(part) ? part : isString((part as { text?: unknown }).text)
          ? String((part as { text: string }).text)
          : `[${(part as { type?: string }).type ?? "content"}]`
      )
      .join(" ");
  }
  return "";
};

/**
 * Render a run for the optimizer to read. The transcript carries the agent's
 * reasoning and the call list carries the ground truth of what each tool
 * answered; both are needed, because an agent's account of a failed call and
 * the call's actual error are often different stories.
 */
export function renderRunForReview(report: JobRunReport): string {
  const lines: string[] = [];
  lines.push(`# Job: ${report.jobId}`);
  lines.push(report.statement);
  lines.push("");
  lines.push(`Outcome: ${report.achieved ? "ACHIEVED" : "NOT ACHIEVED"}`);
  for (const outcome of report.outcomes) {
    lines.push(`- [${outcome.passed ? "x" : " "}] ${outcome.name}: ${outcome.describe}`);
  }
  if (report.error !== undefined) lines.push(`Run error: ${report.error}`);
  lines.push("");

  const system = report.transcript.find((m) => m.role === "system");
  lines.push("## System prompt the agent was given");
  lines.push(system === undefined ? "(none recorded)" : contentText(system.content));
  lines.push("");

  lines.push("## What the agent said");
  const said = report.transcript
    .filter((m) => m.role === "assistant")
    .map((m) => contentText(m.content).trim())
    .filter((text) => text !== "");
  lines.push(said.length === 0 ? "(the agent wrote nothing)" : said.join("\n---\n"));
  lines.push("");

  lines.push(`## Tool calls (${report.totalToolCalls})`);
  if (report.toolCalls.length === 0) {
    lines.push("(none — the agent called no tools)");
  }
  for (const call of report.toolCalls) {
    const result = truncate(
      isString(call.result) ? call.result : JSON.stringify(call.result),
      MAX_RESULT_CHARS
    );
    lines.push(
      `${call.index}. ${call.name}(${truncate(JSON.stringify(call.args), MAX_RESULT_CHARS)})`
    );
    lines.push(`   ${call.isError ? "ERROR" : "ok"}: ${result}`);
  }
  lines.push("");

  lines.push("## Friction the harness already detected");
  if (report.friction.length === 0) lines.push("(none)");
  for (const signal of report.friction) {
    lines.push(
      `- [${signal.severity}/${signal.owner}] ${signal.kind}: ${signal.summary}`
    );
  }
  return lines.join("\n");
}

const isProposal = (value: unknown): value is FixProposal => {
  if (value === null || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return isString(p.target) && isString(p.diagnosis) && isString(p.change);
};

/** Pull the proposals out of a model answer that may be fenced or chatty. */
export function parseProposals(answer: string): FixProposal[] {
  const start = answer.indexOf("{");
  const end = answer.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("Optimizer answer contained no JSON object");
  }
  const parsed: unknown = JSON.parse(answer.slice(start, end + 1));
  if (parsed === null || typeof parsed !== "object") {
    throw new Error("Optimizer answer was not an object");
  }
  const { proposals } = parsed as { proposals?: unknown };
  if (!Array.isArray(proposals)) {
    throw new Error("Optimizer answer had no proposals array");
  }
  return proposals.filter(isProposal).map((p) => ({
    target: p.target,
    owner:
      p.owner === "harness" || p.owner === "prompt" ? p.owner : "unattributed",
    diagnosis: p.diagnosis,
    change: p.change,
    evidence: Array.isArray(p.evidence) ? p.evidence.filter(isString) : [],
    confidence: typeof p.confidence === "number" ? p.confidence : 0.5
  }));
}

export interface OptimizeOptions {
  /** The reviewing model — deliberately not the one that ran the job. */
  provider: BaseProvider;
  model: string;
  signal?: AbortSignal;
}

/**
 * Review one run. A failure to review is reported, never thrown: an optimizer
 * that dies on one bad answer takes the whole suite's findings with it.
 */
export async function optimizeFromRun(
  report: JobRunReport,
  opts: OptimizeOptions
): Promise<OptimizationReport> {
  const base = {
    jobId: report.jobId,
    statement: report.statement,
    achieved: report.achieved
  };
  const costBefore = opts.provider.getTotalCost();

  const messages: Message[] = [
    { role: "system", content: OPTIMIZER_SYSTEM_PROMPT },
    { role: "user", content: renderRunForReview(report) }
  ];

  let answer = "";
  try {
    const args: Parameters<BaseProvider["generateMessages"]>[0] = {
      messages,
      model: opts.model
    };
    if (opts.signal !== undefined) args.signal = opts.signal;
    for await (const chunk of opts.provider.generateMessages(args)) {
      if (isString((chunk as { content?: unknown }).content)) {
        answer += String((chunk as { content: string }).content);
      }
    }
    return {
      ...base,
      proposals: parseProposals(answer),
      costUsd: opts.provider.getTotalCost() - costBefore
    };
  } catch (e) {
    return {
      ...base,
      proposals: [],
      error: e instanceof Error ? e.message : String(e),
      costUsd: opts.provider.getTotalCost() - costBefore
    };
  }
}
