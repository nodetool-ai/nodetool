/**
 * The chat composer's reasoning level and which models accept it.
 *
 * The web composer offers the levels {@link reasoningEffortLevels} returns for
 * the picked model and hides its select when there are none. The chat turn
 * forwards a level to the provider only when it is in that list. Each
 * provider maps the level to its own setting (Anthropic `output_config.effort`,
 * OpenAI `reasoning.effort`, Gemini `thinkingConfig`). Everything else never
 * receives it.
 */

import { geminiModelCapabilities } from "./gemini-models.js";
import { isString } from "./predicates.js";

/** Every level the composer can carry. A model offers a subset. */
export const REASONING_EFFORTS = ["low", "medium", "high", "xhigh"] as const;

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return (
    isString(value) && (REASONING_EFFORTS as readonly string[]).includes(value)
  );
}

function bareModelId(model: string): string {
  return (model.split("/").pop() ?? model).toLowerCase();
}

/**
 * Anthropic accepts `output_config.effort` on Opus 4.5, Opus 4.6, Sonnet 4.6
 * and every model from the 4.7 generation on. Sonnet 4.5, Haiku 4.5 and older
 * reject it with a 400.
 */
function anthropicSupportsEffort(model: string): boolean {
  const match =
    /claude-(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2})(?!\d))?/.exec(
      model.toLowerCase()
    );
  if (!match) return false;
  const family = match[1];
  const major = Number(match[2]);
  const minor = match[3] === undefined ? 0 : Number(match[3]);
  if (major >= 5) return true;
  if (major < 4) return false;
  if (minor >= 7) return true;
  if (family === "opus") return minor >= 5;
  if (family === "sonnet") return minor >= 6;
  return false;
}

/** OpenAI gpt-5 reasoning models. The `-chat` variants take no reasoning. */
function openaiSupportsEffort(model: string): boolean {
  const id = bareModelId(model);
  if (/chat|audio|realtime|transcribe|image|tts/.test(id)) return false;
  return /^gpt-5(?:[.-]|$)/.test(id);
}

const STANDARD_LEVELS: readonly ReasoningEffort[] = ["low", "medium", "high"];
const NO_LEVELS: readonly ReasoningEffort[] = [];

/**
 * Gemini levels come from the per-model capability table. A Gemini 2.5
 * thinking budget maps from all three standard levels. A Gemini 3 model that
 * only takes "low" and "high" still lists "medium", which the adapter answers
 * by leaving the model's own default in place.
 */
function geminiEffortLevels(model: string): readonly ReasoningEffort[] {
  const thinking = geminiModelCapabilities(model).thinking;
  if (!thinking) return NO_LEVELS;
  if (thinking.kind === "budget") return STANDARD_LEVELS;
  return thinking.levels.includes("xhigh")
    ? REASONING_EFFORTS
    : STANDARD_LEVELS;
}

/**
 * The composer levels a model accepts, in display order. Empty when the
 * model takes no reasoning level.
 */
export function reasoningEffortLevels(
  provider: string | null | undefined,
  model: string | null | undefined
): readonly ReasoningEffort[] {
  if (!isString(provider) || !isString(model) || model === "") {
    return NO_LEVELS;
  }
  switch (provider) {
    case "anthropic":
      return anthropicSupportsEffort(model) ? STANDARD_LEVELS : NO_LEVELS;
    // Subscription CLIs: their model aliases resolve to current models, and
    // both CLIs take an `--effort` flag.
    case "claude_agent_sdk":
    case "antigravity":
      return STANDARD_LEVELS;
    case "openai":
      return openaiSupportsEffort(model) ? STANDARD_LEVELS : NO_LEVELS;
    case "gemini":
    case "gemini_vertex":
      return geminiEffortLevels(model);
    default:
      return NO_LEVELS;
  }
}

export function supportsReasoningEffort(
  provider: string | null | undefined,
  model: string | null | undefined
): boolean {
  return reasoningEffortLevels(provider, model).length > 0;
}
