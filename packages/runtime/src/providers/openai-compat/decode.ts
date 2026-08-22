/**
 * Response decoding for the OpenAI Chat Completions dialect.
 *
 * Split out of {@link OpenAICompatProvider} so one function owns the step from
 * a raw `POST /chat/completions` body to the fields NodeTool reads. The live
 * contract probe and the checked-in raw-response fixtures
 * (`packages/runtime/tests/fixtures/provider-contract/`) run this same
 * function, so a wire change shows up here rather than in a provider method no
 * test can reach without a network call.
 */

import { isObjectLike } from "../../type-predicates.js";
import type {
  ChatCompletionResponse,
  ChatCompletionUsage
} from "./types.js";

/** One tool call as it arrives on the wire, before NodeTool normalizes it. */
export interface DecodedToolCall {
  id: string;
  name: string;
  /** Raw JSON argument string; absent when the gateway omitted it. */
  arguments?: string;
}

export interface DecodedChatCompletion {
  content: string | null;
  /** Undefined when the response carried no `tool_calls` field at all. */
  toolCalls: DecodedToolCall[] | undefined;
  finishReason: string | null;
  usage: { inputTokens: number; outputTokens: number; cachedTokens: number } | null;
}

export function decodeChatCompletionUsage(
  usage: ChatCompletionUsage | null | undefined
): DecodedChatCompletion["usage"] {
  if (!usage) return null;
  return {
    inputTokens: usage.prompt_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? 0,
    cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? 0
  };
}

/**
 * Decode a non-streaming chat completion body. Throws when the envelope
 * carries no choice — the one shape the caller cannot turn into a message.
 */
export function decodeChatCompletion(body: unknown): DecodedChatCompletion {
  if (!isObjectLike(body)) {
    throw new Error("chat completion response is not an object");
  }
  const completion = body as ChatCompletionResponse;
  const choice = completion.choices?.[0];
  if (!choice) {
    throw new Error("chat completion response has no choices");
  }
  const message = choice.message;
  // Keep function calls, and entries with no `type` at all — some gateways
  // omit it (the wire type marks `type` optional). The streaming path
  // likewise accepts every tool-call delta. Only drop entries that explicitly
  // declare a non-function type.
  const toolCalls = !Array.isArray(message?.tool_calls)
    ? undefined
    : message.tool_calls
        .filter((tc) => tc.type === "function" || tc.type === undefined)
        .map((tc) => ({
          id: String(tc.id ?? ""),
          name: String(tc.function?.name ?? ""),
          arguments: tc.function?.arguments ?? undefined
        }));

  return {
    content: message?.content ?? null,
    toolCalls,
    finishReason: choice.finish_reason ?? null,
    usage: decodeChatCompletionUsage(completion.usage)
  };
}
