/**
 * ContextCompactor — opt-in transcript compaction for long step runs.
 *
 * As a step's tool-calling loop accumulates messages, the running token
 * estimate climbs toward the model context limit. When enabled, this compactor
 * watches that estimate and, once it crosses a configurable threshold, makes
 * ONE structured-summary LLM call over the OLDER portion of the message history
 * and replaces that portion with a single `assistant` summary message — keeping
 * the system prompt (index 0) and the most recent N messages intact.
 *
 * Compaction is lossy by design (the original older messages are discarded in
 * favor of the summary). It is layered on top of the lossless tool-result
 * eviction in StepExecutor: when enabled it runs first; eviction stays as the
 * always-on fallback. When disabled (the default), no compactor is constructed
 * and behavior is byte-for-byte identical to today.
 *
 * Tool-call/tool-result pairing is preserved: a `role:"tool"` message must stay
 * paired with the assistant message that issued its tool call. The "keep recent"
 * window never starts mid tool-group, and the summarized prefix never ends on an
 * assistant-with-toolCalls whose tool results were moved into the tail — the same
 * invariant StepExecutor.evictOldToolResultsIfOverBudget() enforces.
 */

import type { BaseProvider, Message } from "@nodetool-ai/runtime";
import { createLogger } from "@nodetool-ai/config";
import {
  COMPACTION_SYSTEM_PROMPT,
  renderCompactionUserPrompt
} from "./prompts/compaction-prompt.js";

const log = createLogger("nodetool.agents.context-compactor");

/**
 * Default fraction of a step's `maxTokenLimit` at which compaction triggers.
 * The absolute threshold is `ratio * maxTokenLimit`, so it tracks a customized
 * token budget instead of being a fixed constant that silently desyncs.
 */
export const COMPACTION_THRESHOLD_RATIO = 0.7;

/** Default number of most-recent messages kept verbatim (never summarized). */
export const DEFAULT_COMPACTION_KEEP_RECENT = 8;

/**
 * Opt-in configuration for context compaction.
 *
 * Threading: `AgentOptions.compaction` → `TaskExecutor` → `StepExecutor`. When
 * omitted (the default) no compactor is constructed and history trimming falls
 * back to the lossless tool-result eviction path only.
 */
export interface CompactionOptions {
  /** Master switch. When `false`/omitted, compaction never runs. */
  enabled: boolean;
  /**
   * Estimated-token threshold above which the older prefix is summarized.
   * Defaults to ~70% of the step's `maxTokenLimit` when wired in StepExecutor.
   */
  thresholdTokens?: number;
  /**
   * Number of most-recent messages to keep verbatim (never summarized).
   * Defaults to {@link DEFAULT_COMPACTION_KEEP_RECENT}.
   */
  keepRecent?: number;
}

/**
 * Rough token estimate based on JSON serialized message length / 4.
 *
 * Identical semantics to `StepExecutor.estimateTokens()` so the compaction
 * threshold is directly comparable to the step's own budget. Deliberately NOT
 * BPE-accurate — char/4 matches the existing per-iteration estimator and keeps
 * the hot loop free of js-tiktoken.
 */
export function estimateMessageTokens(messages: Message[]): number {
  return Math.ceil(JSON.stringify(messages).length / 4);
}

export class ContextCompactor {
  private readonly provider: BaseProvider;
  private readonly model: string;
  private readonly options: Required<CompactionOptions>;
  private readonly threadId?: string;

  constructor(opts: {
    provider: BaseProvider;
    model: string;
    options: Required<CompactionOptions>;
    threadId?: string;
  }) {
    this.provider = opts.provider;
    this.model = opts.model;
    this.options = opts.options;
    this.threadId = opts.threadId;
  }

  /**
   * True when the estimated token count is over the threshold AND there is a
   * compactible prefix worth folding — i.e. more than `keepRecent + 1` messages,
   * so something exists older than the system prompt + recent window. A tiny
   * history is never compacted.
   */
  shouldCompact(messages: Message[]): boolean {
    if (!this.options.enabled) return false;
    if (messages.length <= this.options.keepRecent + 1) return false;
    return estimateMessageTokens(messages) > this.options.thresholdTokens;
  }

  /**
   * Fold the older portion of the history into a single assistant summary.
   *
   * Returns `[systemMessage, summaryMessage, ...recentTail]`. The system message
   * at index 0 is preserved unchanged, the most-recent messages are kept
   * verbatim, and everything between is replaced by one summary message.
   *
   * Best-effort: if the summary LLM call fails, the original messages are
   * returned unchanged so the run degrades to the existing lossless eviction
   * behavior rather than breaking.
   */
  async compact(messages: Message[]): Promise<Message[]> {
    if (messages.length === 0) return messages;

    const systemMessage = messages[0];
    const splitIndex = this.computeSplitIndex(
      messages,
      this.options.keepRecent
    );

    // olderPrefix is everything between the system message and the recent tail.
    const olderPrefix = messages.slice(1, splitIndex);
    const recentTail = messages.slice(splitIndex);

    // Nothing older to fold — leave the history untouched.
    if (olderPrefix.length === 0) return messages;

    const transcript = this.serializeTranscript(olderPrefix);

    let summaryText: string;
    try {
      const summaryMessages: Message[] = [
        { role: "system", content: COMPACTION_SYSTEM_PROMPT },
        { role: "user", content: renderCompactionUserPrompt(transcript) }
      ];
      const reply = await this.provider.generateMessageTraced({
        messages: summaryMessages,
        model: this.model,
        threadId: this.threadId
      });
      summaryText = this.extractText(reply);
      if (!summaryText.trim()) {
        // Empty summary is useless — keep the original messages.
        log.warn("Compaction produced an empty summary; keeping history", {
          olderPrefixCount: olderPrefix.length
        });
        return messages;
      }
    } catch (err) {
      // Best-effort: a failed summary call must not break the step. The
      // always-on lossless eviction still trims if we stay over budget.
      log.warn("Context compaction failed; keeping history unchanged", {
        error: err instanceof Error ? err.message : String(err)
      });
      return messages;
    }

    // Presented as a user-role message on purpose: providers that hoist the
    // system message out of the array (e.g. Anthropic) require the remaining
    // history to begin with a user turn, so the summary cannot be an assistant
    // turn or the very next call would start with `assistant` and be rejected.
    const summaryMessage: Message = {
      role: "user",
      content: `<compacted summary>\nEarlier messages were condensed to save context. Summary of the conversation so far:\n\n${summaryText}`
    };

    log.debug("Compacted earlier context", {
      summarizedMessages: olderPrefix.length,
      keptRecent: recentTail.length
    });

    return [systemMessage, summaryMessage, ...recentTail];
  }

  /**
   * Pick the boundary index where the recent tail begins.
   *
   * Starts from `messages.length - keepRecent`, then walks BACKWARD off any
   * leading `role:"tool"` messages so the tail never starts in the middle of an
   * assistant→tool group (a leading orphan tool message has no owning assistant
   * and providers reject it). Conversely, if the message immediately before the
   * boundary is an assistant-with-toolCalls, its tool results now live in the
   * tail — so the boundary is moved back to include that assistant turn too,
   * guaranteeing the summarized prefix never ends on a dangling tool call.
   *
   * The boundary is clamped to `>= 1` so the system message at index 0 is never
   * pulled into the tail.
   */
  private computeSplitIndex(messages: Message[], keepRecent: number): number {
    let idx = Math.max(1, messages.length - keepRecent);

    // Walk backward off any leading tool messages: the tail must start on the
    // assistant message that owns those tool calls, not on an orphan result.
    while (idx > 1 && messages[idx]?.role === "tool") {
      idx--;
    }

    // If the message just before the boundary is an assistant that issued tool
    // calls, those tool results were pulled into the tail. Move the boundary
    // back to include the assistant turn so the prefix has no dangling call.
    while (
      idx > 1 &&
      messages[idx - 1]?.role === "assistant" &&
      (messages[idx - 1]?.toolCalls?.length ?? 0) > 0
    ) {
      idx--;
      // Continue walking off any tool messages that now lead the tail.
      while (idx > 1 && messages[idx]?.role === "tool") {
        idx--;
      }
    }

    return idx;
  }

  /**
   * Render a message list into a plain-text transcript for the summary prompt.
   */
  private serializeTranscript(messages: Message[]): string {
    const lines: string[] = [];
    for (const message of messages) {
      const text = this.extractText(message);
      const header = `[${message.role}]`;
      if (text.trim()) {
        lines.push(`${header} ${text}`);
      }
      if (message.toolCalls && message.toolCalls.length > 0) {
        for (const call of message.toolCalls) {
          let argsStr: string;
          try {
            argsStr = JSON.stringify(call.args ?? {});
          } catch {
            argsStr = String(call.args);
          }
          lines.push(`${header} tool_call ${call.name}(${argsStr})`);
        }
      }
    }
    return lines.join("\n\n");
  }

  /**
   * Extract a plain string from a message's content, which may be a string or
   * an array of typed content parts.
   */
  private extractText(message: Message): string {
    const content = message.content;
    if (content === null || content === undefined) return "";
    if (typeof content === "string") return content;
    const parts: string[] = [];
    for (const part of content) {
      if (
        typeof part === "object" &&
        part !== null &&
        "text" in part &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        parts.push((part as { text: string }).text);
      }
    }
    return parts.join("");
  }
}
