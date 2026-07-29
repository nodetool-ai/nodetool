/**
 * Wire types for the internal OpenAI-compatible Chat Completions client.
 *
 * These model only the fields NodeTool reads or writes — not the full OpenAI
 * schema. Gateways diverge from OpenAI in the long tail, so every response
 * field is optional and unknown extra request params ride the index signature.
 */

/** Request body for `POST /chat/completions`. */
export interface ChatCompletionsRequest {
  model: string;
  messages: Array<Record<string, unknown>>;
  stream?: boolean;
  /** Extra params (temperature, tools, stream_options, …) pass through as-is. */
  [param: string]: unknown;
}

export interface ChatCompletionUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

export interface ChatCompletionToolCallFunction {
  name?: string | null;
  arguments?: string | null;
}

export interface ChatCompletionMessageToolCall {
  id?: string | null;
  type?: string;
  function?: ChatCompletionToolCallFunction;
}

export interface ChatCompletionAssistantMessage {
  role?: string;
  content?: string | null;
  tool_calls?: ChatCompletionMessageToolCall[] | null;
}

export interface ChatCompletionChoice {
  index?: number;
  message?: ChatCompletionAssistantMessage;
  finish_reason?: string | null;
}

/** Non-streaming response from `POST /chat/completions`. */
export interface ChatCompletionResponse {
  id?: string;
  model?: string;
  choices?: ChatCompletionChoice[];
  usage?: ChatCompletionUsage | null;
}

export interface ChatCompletionChunkDeltaToolCall {
  index?: number;
  id?: string | null;
  function?: ChatCompletionToolCallFunction;
}

export interface ChatCompletionChunkDelta {
  content?: string | null;
  tool_calls?: ChatCompletionChunkDeltaToolCall[] | null;
  /** Audio-output models (`modalities: ["text","audio"]`) stream base64 here. */
  audio?: { data?: string };
}

export interface ChatCompletionChunkChoice {
  index?: number;
  delta?: ChatCompletionChunkDelta;
  finish_reason?: string | null;
}

/** One SSE chunk of a streaming chat completion. */
export interface ChatCompletionChunk {
  id?: string;
  model?: string;
  choices?: ChatCompletionChunkChoice[];
  usage?: ChatCompletionUsage | null;
}
