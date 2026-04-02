/**
 * OpenAI-compatible chat completions endpoint.
 *
 * Supports:
 * - POST /v1/chat/completions - streaming and non-streaming
 * - GET /v1/models - list available models
 */

import { randomUUID } from "node:crypto";
import type { BaseProvider } from "@nodetool/runtime";
import {
  OllamaProvider,
  OpenAIProvider,
  AnthropicProvider
} from "@nodetool/runtime";
import { getSecret } from "@nodetool/security";
import type {
  Message,
  ProviderTool,
  ProviderStreamItem,
  ToolCall
} from "@nodetool/runtime";
import type { Chunk } from "@nodetool/protocol";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenAIApiOptions {
  defaultProvider?: string;
  defaultModel?: string;
  /** Supply a pre-built provider instead of auto-resolving from model name. */
  provider?: BaseProvider;
}

interface OpenAIChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAIToolDef {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

interface ChatCompletionRequest {
  model?: string;
  messages?: OpenAIChatMessage[];
  stream?: boolean;
  tools?: OpenAIToolDef[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    status: init?.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
}

function errorResponse(
  status: number,
  message: string,
  type = "invalid_request_error"
): Response {
  return jsonResponse(
    {
      error: {
        message,
        type,
        param: null,
        code: null
      }
    },
    { status }
  );
}

/**
 * Convert OpenAI-format messages to internal Message format.
 */
export function convertMessages(
  openaiMessages: OpenAIChatMessage[]
): Message[] {
  return openaiMessages.map((m) => {
    const msg: Message = { role: m.role };

    if (m.content != null) {
      msg.content = m.content;
    }

    if (m.tool_calls && m.tool_calls.length > 0) {
      msg.toolCalls = m.tool_calls.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        args: safeParseJson(tc.function.arguments)
      }));
    }

    if (m.tool_call_id) {
      msg.toolCallId = m.tool_call_id;
    }

    return msg;
  });
}

function safeParseJson(s: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(s);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Convert OpenAI tool definitions to internal ProviderTool format.
 */
export function convertTools(
  openaiTools?: OpenAIToolDef[]
): ProviderTool[] | undefined {
  if (!openaiTools || openaiTools.length === 0) return undefined;
  return openaiTools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    inputSchema: t.function.parameters
  }));
}

function isChunk(item: ProviderStreamItem): item is Chunk {
  return "type" in item && (item as Chunk).type === "chunk";
}

function isToolCall(item: ProviderStreamItem): item is ToolCall {
  return "name" in item && "id" in item && !("type" in item);
}

/** Resolve a secret for the authenticated user, then fall back to env vars. */
async function resolveKey(
  key: string,
  userId: string
): Promise<string | undefined> {
  return (await getSecret(key, userId)) ?? undefined;
}

/**
 * Resolve a provider from the model name. Uses simple prefix matching.
 * If an explicit provider is given in options, returns that instead.
 */
export async function resolveProvider(
  model: string,
  options?: OpenAIApiOptions,
  userId = "1"
): Promise<BaseProvider> {
  if (options?.provider) {
    return options.provider;
  }

  if (
    model.startsWith("gpt-") ||
    model.startsWith("o1") ||
    model.startsWith("o3")
  ) {
    return new OpenAIProvider({
      OPENAI_API_KEY: await resolveKey("OPENAI_API_KEY", userId)
    });
  }

  if (model.startsWith("claude-")) {
    return new AnthropicProvider({
      ANTHROPIC_API_KEY: await resolveKey("ANTHROPIC_API_KEY", userId)
    });
  }

  // Default to Ollama
  return new OllamaProvider({
    OLLAMA_API_URL: process.env.OLLAMA_API_URL ?? "http://127.0.0.1:11434"
  });
}

// ---------------------------------------------------------------------------
// SSE streaming
// ---------------------------------------------------------------------------

/**
 * Create a ReadableStream that emits SSE-formatted chunks from a provider stream.
 */
export function createSSEStream(
  provider: BaseProvider,
  messages: Message[],
  model: string,
  tools?: ProviderTool[],
  genOptions?: {
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
  }
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const id = `chatcmpl-${randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const stream = provider.generateMessages({
          messages,
          model,
          tools,
          temperature: genOptions?.temperature,
          topP: genOptions?.topP,
          maxTokens: genOptions?.maxTokens,
          presencePenalty: genOptions?.presencePenalty,
          frequencyPenalty: genOptions?.frequencyPenalty
        });

        // Track tool call indices for proper OpenAI format
        let toolCallIndex = 0;

        for await (const item of stream) {
          if (isChunk(item)) {
            const chunk = {
              id,
              object: "chat.completion.chunk",
              created,
              model,
              choices: [
                {
                  index: 0,
                  delta: { content: item.content ?? "" },
                  finish_reason: null
                }
              ]
            };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
            );
          }

          if (isToolCall(item)) {
            const chunk = {
              id,
              object: "chat.completion.chunk",
              created,
              model,
              choices: [
                {
                  index: 0,
                  delta: {
                    tool_calls: [
                      {
                        index: toolCallIndex,
                        id: item.id,
                        type: "function" as const,
                        function: {
                          name: item.name,
                          arguments: JSON.stringify(item.args)
                        }
                      }
                    ]
                  },
                  finish_reason: null
                }
              ]
            };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
            );
            toolCallIndex++;
          }
        }

        // Determine finish reason
        const finishReason = toolCallIndex > 0 ? "tool_calls" : "stop";

        // Send final chunk with finish_reason
        const finalChunk = {
          id,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: finishReason
            }
          ]
        };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`)
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const errorChunk = {
          error: {
            message,
            type: "server_error",
            param: null,
            code: null
          }
        };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`)
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleChatCompletions(
  request: Request,
  userId: string,
  options?: OpenAIApiOptions
): Promise<Response> {
  let body: ChatCompletionRequest;
  try {
    body = (await request.json()) as ChatCompletionRequest;
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  const model = body.model || options?.defaultModel || "llama3.2:latest";
  const openaiMessages = body.messages || [];
  const stream = body.stream === true; // default to non-streaming per OpenAI API spec
  const tools = convertTools(body.tools);
  const messages = convertMessages(openaiMessages);

  let provider: BaseProvider;
  try {
    provider = await resolveProvider(model, options, userId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResponse(
      500,
      `Failed to initialize provider: ${msg}`,
      "server_error"
    );
  }

  const genOptions = {
    temperature: body.temperature,
    topP: body.top_p,
    maxTokens: body.max_tokens,
    presencePenalty: body.presence_penalty,
    frequencyPenalty: body.frequency_penalty
  };

  if (stream) {
    return new Response(
      createSSEStream(provider, messages, model, tools, genOptions),
      {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive"
        }
      }
    );
  }

  // Non-streaming: collect all chunks
  try {
    const providerStream = provider.generateMessages({
      messages,
      model,
      tools,
      temperature: genOptions.temperature,
      topP: genOptions.topP,
      maxTokens: genOptions.maxTokens,
      presencePenalty: genOptions.presencePenalty,
      frequencyPenalty: genOptions.frequencyPenalty
    });

    let fullContent = "";
    const toolCalls: OpenAIToolCall[] = [];
    let toolCallIndex = 0;

    for await (const item of providerStream) {
      if (isChunk(item)) {
        fullContent += item.content ?? "";
      }
      if (isToolCall(item)) {
        toolCalls.push({
          id: item.id,
          type: "function",
          function: {
            name: item.name,
            arguments: JSON.stringify(item.args)
          }
        });
        toolCallIndex++;
      }
    }

    const finishReason = toolCalls.length > 0 ? "tool_calls" : "stop";
    const responseMessage: Record<string, unknown> = {
      role: "assistant",
      content: fullContent || null
    };
    if (toolCalls.length > 0) {
      responseMessage.tool_calls = toolCalls;
    }

    return jsonResponse({
      id: `chatcmpl-${randomUUID()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: responseMessage,
          finish_reason: finishReason
        }
      ],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResponse(500, msg, "server_error");
  }
}

async function handleListModels(_userId: string): Promise<Response> {
  const models = [
    { id: "llama3.2:latest", object: "model", created: 0, owned_by: "ollama" },
    { id: "gpt-4", object: "model", created: 0, owned_by: "openai" },
    { id: "gpt-4o", object: "model", created: 0, owned_by: "openai" },
    { id: "gpt-4o-mini", object: "model", created: 0, owned_by: "openai" },
    {
      id: "claude-sonnet-4-20250514",
      object: "model",
      created: 0,
      owned_by: "anthropic"
    },
    {
      id: "claude-opus-4-20250514",
      object: "model",
      created: 0,
      owned_by: "anthropic"
    }
  ];
  return jsonResponse({ object: "list", data: models });
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function handleOpenAIRequest(
  request: Request,
  pathname: string,
  userId: string,
  options?: OpenAIApiOptions
): Promise<Response | null> {
  if (pathname === "/v1/chat/completions" && request.method === "POST") {
    return handleChatCompletions(request, userId, options);
  }
  if (pathname === "/v1/models" && request.method === "GET") {
    return handleListModels(userId);
  }
  return null;
}
