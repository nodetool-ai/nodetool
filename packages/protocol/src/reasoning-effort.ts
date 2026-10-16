/**
 * The chat composer's reasoning level and which models accept it.
 *
 * The web composer shows its reasoning select only when
 * {@link supportsReasoningEffort} is true for the picked model, and the chat
 * turn forwards the level to the provider only under the same check. Each
 * provider maps the level to its own setting (Anthropic `output_config.effort`,
 * OpenAI `reasoning.effort`, Gemini `thinkingConfig`). Everything else never
 * receives it.
 */

import { isString } from "./predicates.js";

export const REASONING_EFFORTS = ["low", "medium", "high"] as const;

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

/** Gemini 2.5 and 3 text models think. Image, speech and live models do not. */
function geminiSupportsEffort(model: string): boolean {
  const id = bareModelId(model);
  if (/image|tts|audio|live|transcribe|embedding/.test(id)) return false;
  return /^gemini-(?:2\.5|3)(?:[.-]|$)/.test(id);
}

export function supportsReasoningEffort(
  provider: string | null | undefined,
  model: string | null | undefined
): boolean {
  if (!isString(provider) || !isString(model) || model === "") return false;
  switch (provider) {
    case "anthropic":
      return anthropicSupportsEffort(model);
    // Subscription CLIs: their model aliases resolve to current models, and
    // both CLIs take an `--effort` flag.
    case "claude_agent_sdk":
    case "antigravity":
      return true;
    case "openai":
      return openaiSupportsEffort(model);
    case "gemini":
      return geminiSupportsEffort(model);
    default:
      return false;
  }
}
