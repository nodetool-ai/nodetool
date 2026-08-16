/**
 * The Judge stage: does the app the build produced actually do what was asked?
 *
 * Check and Run answer structural questions — the wiring resolves, the run
 * completed, the widget received a value. None of them can tell a real German
 * translation from the English echoed back, so a Check+Run-green app gets one
 * structured-output call per interaction, following the `goal-judge` pattern
 * the `graph-e2e` suite uses: the spec's plain-language intent, the steps the
 * user performed, and the widget states those steps left behind, in, and
 * `{ achieved, confidence, reasons }` out.
 *
 * Fail closed (docs/mini-app-build-harness-design.md §7): a judge that times
 * out, errors, or answers with something unparseable scores the interaction as
 * *not achieved*, so a broken judge never green-lights an app. The reasons
 * carry the failure so the report says why.
 *
 * The judge is configured independently of the builder — `--judge-model`,
 * `NODETOOL_APP_JUDGE_MODEL`, and a default that prefers a model the builder
 * did not use — because a model grading its own work is the weakest reviewer
 * available. {@link JudgeRecord.model} records which one actually ran.
 */

import type { BaseProvider, Message } from "@nodetool-ai/runtime";
import { previewValue } from "@nodetool-ai/execution/debug";
import type { InteractionStep } from "@nodetool-ai/execution/app-debug";
import type {
  BuildIssue,
  BuildSpec,
  CompletedInteraction,
  JudgeInteractionVerdict,
  JudgeRecord,
  StageRecord
} from "./types.js";
import {
  isBoolean,
  isNumber,
  isObjectLike,
  isString
} from "../utils/type-guards.js";

/** Ceiling on one judgement's answer. Two sentences of reasoning, no essays. */
const JUDGE_MAX_TOKENS = 600;
/** Wall clock for one judgement. Exhausted ⇒ not achieved. */
export const DEFAULT_JUDGE_TIMEOUT_MS = 60_000;

/**
 * Judge models tried in order when nothing is configured, best first. Whichever
 * is available and is not what the builder used wins; see
 * {@link resolveJudgeModelSpec}.
 */
export const JUDGE_MODEL_CANDIDATES: readonly string[] = [
  "anthropic/claude-sonnet-4-6",
  "openai/gpt-5.4-mini",
  "gemini/gemini-2.5-flash"
];

const SYSTEM_PROMPT = `You grade a mini app that an automated builder just produced.

You are given what the app was asked to do, one interaction a user performed
with it, and the state every widget was left in afterwards.

Judge ONLY whether that interaction achieved what was asked. Ignore how the app
was built, which widgets it uses, and how you would have worded the result.
Formatting, length and phrasing may vary freely — content is what counts. A
widget that is empty, shows an error, shows an unfilled placeholder, or echoes
the input where new content was required does NOT achieve the intent.

Answer with a single JSON object and nothing else:
{"achieved": true|false, "confidence": 0.0-1.0, "reasons": ["…"]}

"achieved" is your verdict. "confidence" is how sure you are of it. "reasons"
is one to three short strings quoting the widget state that decided it; when
the verdict is false they must say what is wrong, because the builder repairs
the app from them.`;

/** One widget's final state, as the judge sees it. */
export interface JudgeWidgetState {
  /** The spec role when the widget came from the spec, else its placed id. */
  widget: string;
  type: string;
  label?: string;
  /** What the widget shows, truncated by `previewValue`. */
  value: unknown;
}

/** One interaction's evidence: what the user did, and what it left behind. */
export interface JudgeInteractionInput {
  interaction: CompletedInteraction;
  widgets: JudgeWidgetState[];
}

export interface JudgeStageOptions {
  spec: BuildSpec;
  /** The build's target in the user's own words, when there was one. */
  prompt?: string;
  interactions: JudgeInteractionInput[];
  provider: BaseProvider;
  model: string;
  /** Repair round this execution belongs to. */
  round: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onLog?: (line: string) => void;
}

/** What the caller asked for, and what the judge will actually run on. */
export interface JudgeModelResolution {
  /** `provider/model`, as configured or defaulted. */
  spec: string;
  providerId: string;
  model: string;
  /** True when no distinct judge was available and the builder grades itself. */
  sameAsBuilder: boolean;
}

/** Split `provider/model`, deciding the cut with the caller's provider list. */
function splitSpec(
  spec: string,
  isProvider: (id: string) => boolean
): { providerId: string; model: string } | null {
  const cut = spec.indexOf("/");
  if (cut === -1) return null;
  const head = spec.slice(0, cut).toLowerCase();
  return isProvider(head)
    ? { providerId: head, model: spec.slice(cut + 1) }
    : null;
}

/**
 * Which model judges this build.
 *
 * An explicit `--judge-model` wins, then `NODETOOL_APP_JUDGE_MODEL`, then the
 * first {@link JUDGE_MODEL_CANDIDATES} entry that is available and differs from
 * the builder. When nothing else can be reached the builder judges its own work
 * — reported as such rather than skipped, since a weak reviewer still catches
 * an empty output.
 */
export function resolveJudgeModelSpec(opts: {
  explicit?: string | undefined;
  builderProviderId: string;
  builderModel: string;
  /** Providers the caller can actually instantiate. Absent ⇒ only the builder. */
  isAvailable?: (providerId: string) => boolean;
  env?: Record<string, string | undefined>;
}): JudgeModelResolution {
  const builder: JudgeModelResolution = {
    spec: `${opts.builderProviderId}/${opts.builderModel}`,
    providerId: opts.builderProviderId,
    model: opts.builderModel,
    sameAsBuilder: true
  };
  const isAvailable =
    opts.isAvailable ?? ((id: string) => id === opts.builderProviderId);
  const isProvider = (id: string): boolean =>
    isAvailable(id) || id === opts.builderProviderId;

  const configured =
    opts.explicit ?? (opts.env ?? process.env)["NODETOOL_APP_JUDGE_MODEL"];
  if (configured) {
    const parts = splitSpec(configured, isProvider);
    if (parts) {
      return {
        spec: configured,
        ...parts,
        sameAsBuilder:
          parts.providerId === opts.builderProviderId &&
          parts.model === opts.builderModel
      };
    }
    // A bare model id names a model on the builder's own provider.
    return {
      spec: `${opts.builderProviderId}/${configured}`,
      providerId: opts.builderProviderId,
      model: configured,
      sameAsBuilder: configured === opts.builderModel
    };
  }

  for (const candidate of JUDGE_MODEL_CANDIDATES) {
    const parts = splitSpec(candidate, isProvider);
    if (!parts || !isAvailable(parts.providerId)) continue;
    if (
      parts.providerId === opts.builderProviderId &&
      parts.model === opts.builderModel
    ) {
      continue;
    }
    return { spec: candidate, ...parts, sameAsBuilder: false };
  }
  return builder;
}

/** Render one interaction step for the judge. */
const stepText = (step: InteractionStep): string => JSON.stringify(step);

const widgetText = (widget: JudgeWidgetState): string => {
  const label = widget.label ? ` "${widget.label}"` : "";
  const value = JSON.stringify(previewValue(widget.value)) ?? "null";
  return `- ${widget.widget} (${widget.type}${label}): ${value}`;
};

/** Everything the judge is told about one interaction. */
export function renderJudgePrompt(
  spec: BuildSpec,
  input: JudgeInteractionInput,
  prompt?: string
): string {
  const objectives = spec.operations
    .map(
      (operation) =>
        `- ${operation.id}: ${operation.objective || "(bound to an existing workflow)"}`
    )
    .join("\n");
  return [
    `APP: ${spec.title}`,
    prompt ? `WHAT THE USER ASKED FOR:\n${prompt}` : "",
    `WHAT EACH OPERATION IS FOR:\n${objectives || "(none declared)"}`,
    `INTERACTION: ${input.interaction.name}`,
    `STEPS THE USER PERFORMED:\n${input.interaction.steps.map(stepText).join("\n") || "(none)"}`,
    `WIDGET STATE AFTERWARDS:\n${input.widgets.map(widgetText).join("\n") || "(no widgets)"}`
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Parse the judge's answer. Accepts a bare JSON object or one wrapped in prose
 * or a fenced block; anything else returns null so the caller fails closed
 * instead of guessing a verdict.
 */
export function parseJudgeAnswer(
  text: string
): { achieved: boolean; confidence: number; reasons: string[] } | null {
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
  const raw = isNumber(obj.confidence) ? obj.confidence : NaN;
  const confidence = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
  const reasons = Array.isArray(obj.reasons)
    ? obj.reasons
        .map((reason) => String(reason))
        .filter((reason) => reason.length > 0)
    : isString(obj.reasons)
      ? [obj.reasons]
      : [];
  return {
    achieved: obj.achieved,
    confidence,
    reasons: reasons.length > 0 ? reasons : ["(no reason given)"]
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

/** A judgement that failed closed, carrying why. */
const notAchieved = (
  interaction: string,
  reason: string
): JudgeInteractionVerdict => ({
  interaction,
  achieved: false,
  confidence: 0,
  reasons: [reason]
});

/**
 * Judge one interaction. Never throws: a provider failure, a timeout, or an
 * unparseable answer resolves as not achieved with the failure as its reason.
 */
export async function judgeInteraction(
  opts: Omit<JudgeStageOptions, "interactions" | "round"> & {
    input: JudgeInteractionInput;
  }
): Promise<JudgeInteractionVerdict> {
  const name = opts.input.interaction.name;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_JUDGE_TIMEOUT_MS;
  const controller = new AbortController();
  const abort = () => controller.abort();
  opts.signal?.addEventListener("abort", abort);
  let timedOut = false;
  /**
   * The deadline is a race, not just an abort: a provider that ignores the
   * signal would otherwise never resolve, and the fail-closed verdict this
   * function promises would never be produced.
   */
  const expired: unique symbol = Symbol("judge-timeout");
  let expire: (value: typeof expired) => void = () => {};
  const deadline = new Promise<typeof expired>((resolve) => {
    expire = resolve;
  });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
    expire(expired);
  }, timeoutMs);

  try {
    const reply = await Promise.race([
      opts.provider.generateMessageTraced({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: renderJudgePrompt(opts.spec, opts.input, opts.prompt)
          }
        ] as Message[],
        model: opts.model,
        tools: [],
        maxTokens: JUDGE_MAX_TOKENS,
        temperature: 0,
        signal: controller.signal
      }),
      deadline
    ]);
    if (reply === expired) {
      return notAchieved(
        name,
        `the judge did not answer within ${timeoutMs}ms, so the interaction counts as not achieved`
      );
    }
    const answer = parseJudgeAnswer(extractText(reply.content));
    if (!answer) {
      return notAchieved(
        name,
        "the judge's answer was not parseable JSON, so the interaction counts as not achieved"
      );
    }
    return { interaction: name, ...answer };
  } catch (error) {
    if (timedOut) {
      return notAchieved(
        name,
        `the judge did not answer within ${timeoutMs}ms, so the interaction counts as not achieved`
      );
    }
    return notAchieved(
      name,
      `the judge call failed (${error instanceof Error ? error.message : String(error)}), so the interaction counts as not achieved`
    );
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", abort);
  }
}

/**
 * Judge every interaction of a Check+Run-green app. The stage record carries
 * the spend and a one-line summary; the {@link JudgeRecord} carries the
 * verdicts the orchestrator turns into complaints.
 */
export async function runJudgeStage(
  opts: JudgeStageOptions
): Promise<{ judge: JudgeRecord; record: StageRecord }> {
  const startedAt = Date.now();
  const costBefore = opts.provider.getTotalCost();
  const verdicts: JudgeInteractionVerdict[] = [];

  for (const input of opts.interactions) {
    if (opts.signal?.aborted) {
      verdicts.push(
        notAchieved(
          input.interaction.name,
          "the build was cancelled before this interaction was judged"
        )
      );
      continue;
    }
    const judgeArgs: Parameters<typeof judgeInteraction>[0] = {
      spec: opts.spec,
      provider: opts.provider,
      model: opts.model,
      input
    };
    if (opts.prompt !== undefined) judgeArgs.prompt = opts.prompt;
    if (opts.timeoutMs !== undefined) judgeArgs.timeoutMs = opts.timeoutMs;
    if (opts.signal) judgeArgs.signal = opts.signal;
    const verdict = await judgeInteraction(judgeArgs);
    verdicts.push(verdict);
    opts.onLog?.(
      `judge: ${verdict.interaction} — ${verdict.achieved ? "achieved" : "not achieved"}`
    );
  }

  // A not-achieved verdict is the round's complaint: the reasons are what the
  // Author is given to repair from, so they travel as the issue's message.
  const issues: BuildIssue[] = verdicts
    .filter((verdict) => !verdict.achieved)
    .map((verdict) => ({
      stage: "judge",
      code: "goal_not_achieved",
      severity: "error",
      message: `interaction "${verdict.interaction}": ${verdict.reasons.join("; ")}`
    }));

  return {
    judge: {
      model: `${opts.provider.provider}/${opts.model}`,
      interactions: verdicts
    },
    record: {
      stage: "judge",
      round: opts.round,
      // The judge defaults away from the builder, so its spend bills to the
      // model that actually ran.
      provider: opts.provider.provider,
      model: opts.model,
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      issues,
      costUsd: opts.provider.getTotalCost() - costBefore,
      status: issues.length > 0 ? "failed" : "ok",
      detail: `${verdicts.length} interaction(s), ${issues.length} not achieved`
    }
  };
}
