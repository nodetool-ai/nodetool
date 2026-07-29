export { OpenAICompatClient, trimTrailingSlashes } from "./client.js";
export type {
  OpenAICompatClientOptions,
  RequestOptions
} from "./client.js";
export {
  OpenAICompatError,
  errorFromResponse,
  errorFromStreamEvent,
  parseErrorBody
} from "./errors.js";
export { sseEvents } from "./sse.js";
export type {
  ChatCompletionsRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ChatCompletionChunkChoice,
  ChatCompletionChunkDelta,
  ChatCompletionChunkDeltaToolCall,
  ChatCompletionChoice,
  ChatCompletionAssistantMessage,
  ChatCompletionMessageToolCall,
  ChatCompletionToolCallFunction,
  ChatCompletionUsage
} from "./types.js";
