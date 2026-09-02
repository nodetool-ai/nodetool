/**
 * Replacing the earlier part of a chat thread with a summary the provider is
 * handed instead.
 *
 * A stateless provider is sent the whole transcript every turn, so a long
 * session eventually stops fitting and every turn from then on fails with an
 * error the user cannot act on. Compaction cuts the view a provider gets: the
 * turns before the cut become one summary row, the rows themselves stay in the
 * database for the UI and `nodetool.threads.*`.
 *
 * The record and the history assembly that reads it live in
 * `@nodetool-ai/models` and `chat-history.ts`. This module holds what decides
 * to write one: where the cut goes, what the summarizer is asked, and what the
 * summarizer is allowed to see.
 */

import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import {
  sanitizeForLog,
  type BaseProvider,
  type Message as ProviderMessage
} from "@nodetool-ai/runtime";
import { getSetting } from "../settings-registry.js";
import { extractTextContent } from "./chat-history.js";

/**
 * Documented defaults for the two numeric compaction settings.
 *
 * `thresholdTokens` is compared against `estimatePromptTokens`, which
 * tokenizes the serialized messages and their tool calls and nothing else — it
 * cannot see the tool definitions the same turn sends, and it reads a resolved
 * image as the length of its base64. The comparison is therefore a size signal
 * rather than a prompt measurement, and the default sits well under any
 * shipping context window instead of close to one.
 */
export const COMPACTION_DEFAULTS = {
  thresholdTokens: 120_000,
  keepUserTurns: 4
} as const;

/** Ceiling on the summary itself, so a compaction cannot grow the prompt. */
export const COMPACTION_SUMMARY_MAX_TOKENS = 4_000;

/**
 * Per-field cut in the transcript the summarizer reads. The same bound the
 * chat turn's own observations are cut at (`MAX_TOOL_RESULT_CHARS`), so a
 * message the model saw in full is summarized in full.
 */
const SUMMARY_FIELD_CHARS = 25_000;

/** What a compaction reads out of the settings store. */
export interface CompactionSettings {
  thresholdTokens: number;
  keepUserTurns: number;
  /** `provider/model`, a bare model id, or null to use the turn's own. */
  model: string | null;
}

/**
 * Read the three settings. The store is best-effort, the same rule the rest of
 * the runner follows: an unreachable database falls back to the documented
 * default rather than failing the turn.
 */
export async function readCompactionSettings(): Promise<CompactionSettings> {
  const read = async (key: string): Promise<string | null> => {
    try {
      return await getSetting(key);
    } catch {
      // Settings store unavailable — the documented default stands.
      return null;
    }
  };
  const positive = (raw: string | null, fallback: number): number => {
    if (raw === null) return fallback;
    const parsed = Number(raw.trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  const [threshold, keep, model] = await Promise.all([
    read("NODETOOL_CHAT_COMPACTION_TOKENS"),
    read("NODETOOL_CHAT_COMPACTION_KEEP_TURNS"),
    read("NODETOOL_COMPACTION_MODEL")
  ]);
  return {
    thresholdTokens: positive(threshold, COMPACTION_DEFAULTS.thresholdTokens),
    keepUserTurns: Math.floor(
      positive(keep, COMPACTION_DEFAULTS.keepUserTurns)
    ),
    model: model !== null && model.trim().length > 0 ? model.trim() : null
  };
}

/**
 * Whether the provider, not NodeTool, is holding this conversation.
 *
 * Such a provider is sent only the turns since its session token, so the size
 * of what it actually has is not ours to estimate — the proactive trigger
 * would fire off a number that describes a fraction of the prompt. They get
 * the reactive trigger instead: the provider itself says when it no longer
 * fits.
 */
export function holdsTranscriptServerSide(
  providerId: string,
  hasSession: boolean
): boolean {
  return hasSession || providerId === PROVIDER_IDS.CLAUDE_AGENT_SDK;
}

/** Where a compaction cuts: what the summary replaces, and what survives it. */
export interface CompactionCut<T> {
  summarize: T[];
  keep: T[];
}

/**
 * Cut the thread at the `keepUserTurns`-th user message from the end.
 *
 * A user message is the one boundary that is safe by construction: an
 * assistant's tool call and the result answering it always sit between two of
 * them, so neither side of the cut can hold half a tool round — which
 * Anthropic rejects outright. Null when the thread has nothing to summarize:
 * fewer than `keepUserTurns` user messages, or a cut that would land at the
 * very start.
 */
export function chooseCompactionCut<T extends { role: string }>(
  rows: readonly T[],
  keepUserTurns: number
): CompactionCut<T> | null {
  if (keepUserTurns < 1) return null;
  let seen = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].role !== "user") continue;
    if (++seen < keepUserTurns) continue;
    if (i === 0) return null;
    return { summarize: rows.slice(0, i), keep: rows.slice(i) };
  }
  return null;
}

/**
 * What the summarizer is told. The sections are the parts of a conversation a
 * later turn cannot recover on its own — an artifact reference above all, since
 * a paraphrased `asset://` uri names nothing.
 */
export const COMPACTION_SUMMARY_PROMPT = `You are compacting the earlier part of a conversation. Those turns are about to be replaced by what you write, and nothing else about them survives.

Write a bulleted list under these headings, in this order, skipping a heading only when the conversation holds nothing for it:

Goals and constraints — what the user is trying to do, and every rule they set, in their own terms.
Decisions — what was settled, and what was ruled out.
Artifacts — every reference verbatim: asset:// uris, workflow, document, thread and job ids, file paths, urls. Copy each one character for character. Never shorten one, re-format one, or describe a thing instead of quoting its reference.
Open questions — what is unresolved, and what is waiting on the user.
Results — what the last tool calls established, as conclusions rather than transcripts.

Write nothing else: no preamble, no closing line, no detail the conversation does not contain.`;

/**
 * The transcript the summarizer reads: one line per message, redacted through
 * the same {@link sanitizeForLog} the provider debug dump uses, so a
 * credential a tool call carried does not leave the process a second time.
 */
export function renderTranscriptForSummary(
  messages: readonly ProviderMessage[]
): string {
  const bounds = { maxStringLength: SUMMARY_FIELD_CHARS };
  const lines: string[] = [];
  for (const m of messages) {
    const text = sanitizeForLog(
      extractTextContent(m.content, "[media]"),
      bounds
    );
    let line = `${m.role}: ${String(text)}`;
    if (m.toolCalls?.length) {
      // The redaction earns its place here: a tool call's arguments are the
      // one part of a transcript that carries a credential under a name
      // `sanitizeForLog` recognizes.
      line += `\ncalled: ${JSON.stringify(sanitizeForLog(m.toolCalls, bounds))}`;
    }
    lines.push(line);
  }
  return lines.join("\n\n");
}

/** One summarizer call. */
export interface CompactionSummaryRequest {
  provider: BaseProvider;
  model: string;
  messages: readonly ProviderMessage[];
  signal?: AbortSignal;
}

/**
 * Summarize the region a compaction replaces, or null when the model answered
 * with nothing. Throws whatever the provider throws — the caller decides what
 * a failed summary costs, and for a chat turn it costs nothing but the cut.
 */
export async function summarizeForCompaction(
  request: CompactionSummaryRequest
): Promise<string | null> {
  const transcript = renderTranscriptForSummary(request.messages);
  if (transcript.trim().length === 0) return null;
  const answer = await request.provider.generateMessageTraced({
    messages: [
      { role: "system", content: COMPACTION_SUMMARY_PROMPT },
      { role: "user", content: `Conversation to compact:\n\n${transcript}` }
    ],
    model: request.model,
    maxTokens: COMPACTION_SUMMARY_MAX_TOKENS,
    signal: request.signal
  });
  const summary = extractTextContent(answer.content).trim();
  return summary.length > 0 ? summary : null;
}
