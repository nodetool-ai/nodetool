import type { Chunk } from "@nodetool-ai/protocol";
import type {
  Message,
  MessageContent,
  MessageImageContent,
  MessageTextContent,
  ProviderStreamItem,
  ProviderTool,
  ToolCall
} from "./types.js";
import type { UsageInfo } from "./cost-calculator.js";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function stringifyContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return JSON.stringify(value);
}

export function dataUri(mimeType: string, data: Uint8Array | string): string {
  if (typeof data === "string" && data.startsWith("data:")) return data;
  const base64 =
    typeof data === "string" ? data : Buffer.from(data).toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

export async function responseInputContent(
  content: MessageContent,
  resolveUri: (uri: string) => Promise<string>
): Promise<Record<string, unknown> | null> {
  if (content.type === "text") {
    return { type: "input_text", text: (content as MessageTextContent).text };
  }

  if (content.type === "image_url") {
    const image = (content as MessageImageContent).image;
    if (image.uri) {
      const resolved = await resolveUri(image.uri);
      return { type: "input_image", image_url: resolved };
    }
    if (image.data) {
      return {
        type: "input_image",
        image_url: dataUri(image.mimeType ?? "image/jpeg", image.data)
      };
    }
  }

  return null;
}

export async function messagesToResponsesInput(
  messages: Message[],
  resolveUri: (uri: string) => Promise<string>
): Promise<Array<Record<string, unknown>>> {
  const input: Array<Record<string, unknown>> = [];
  // Images generated on a prior assistant turn, awaiting re-presentation. The
  // Responses input schema doesn't accept images in assistant output, so each
  // one is re-presented as a user input_image — but only AFTER the turn's tool
  // block: a function_call and its function_call_output must stay adjacent,
  // so the flush waits for the first non-tool message (or end of history).
  // Preserves multi-turn edit context on a fresh replay (no
  // previous_response_id to resume from / expired session).
  let pendingImages: Array<Record<string, unknown>> = [];

  for (const message of messages) {
    if (message.role !== "tool" && pendingImages.length > 0) {
      input.push(...pendingImages);
      pendingImages = [];
    }

    if (message.role === "tool") {
      input.push({
        type: "function_call_output",
        call_id: message.toolCallId ?? "",
        output: stringifyContent(message.content)
      });
      continue;
    }

    if (message.role === "assistant") {
      const outputParts: Array<Record<string, unknown>> = [];
      if (typeof message.content === "string") {
        if (message.content) {
          outputParts.push({ type: "output_text", text: message.content });
        }
      } else if (Array.isArray(message.content)) {
        const textParts: string[] = [];
        for (const part of message.content) {
          if (part.type === "text") {
            textParts.push(part.text);
          } else if (part.type === "image_url") {
            const converted = await responseInputContent(part, resolveUri);
            if (converted) {
              pendingImages.push({
                type: "message",
                role: "user",
                content: [converted]
              });
            }
          }
        }
        const text = textParts.join("");
        if (text) outputParts.push({ type: "output_text", text });
      }

      if (outputParts.length > 0) {
        input.push({
          type: "message",
          role: "assistant",
          content: outputParts
        });
      }
      for (const toolCall of message.toolCalls ?? []) {
        input.push({
          type: "function_call",
          id: toolCall.id,
          call_id: toolCall.id,
          name: toolCall.name,
          arguments: JSON.stringify(toolCall.args ?? {})
        });
      }
      continue;
    }

    const content: Array<Record<string, unknown>> = [];
    if (typeof message.content === "string") {
      content.push({ type: "input_text", text: message.content });
    } else if (Array.isArray(message.content)) {
      for (const part of message.content) {
        const converted = await responseInputContent(part, resolveUri);
        if (converted) content.push(converted);
      }
    }

    if (content.length === 0) continue;
    input.push({ role: message.role, content });
  }

  input.push(...pendingImages);
  return input;
}

export function responseTools(
  tools: ProviderTool[] = []
): Array<Record<string, unknown>> {
  return tools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description ?? "",
    parameters: tool.inputSchema ?? { type: "object", properties: {} }
  }));
}

export function responseToolChoice(
  toolChoice: string | "any" | undefined
): unknown {
  if (!toolChoice) return undefined;
  if (toolChoice === "any") return "auto";
  return { type: "function", name: toolChoice };
}

export function extractResponsesText(output: unknown): string {
  if (!Array.isArray(output)) return "";
  const parts: string[] = [];
  for (const item of output) {
    if (!isRecord(item) || item.type !== "message" || !Array.isArray(item.content)) {
      continue;
    }
    for (const content of item.content) {
      if (isRecord(content) && content.type === "output_text") {
        parts.push(String(content.text ?? ""));
      }
    }
  }
  return parts.join("");
}

export function extractResponsesToolCalls(
  output: unknown,
  buildToolCall: (id: string, name: string, args: unknown) => ToolCall
): ToolCall[] {
  if (!Array.isArray(output)) return [];
  const toolCalls: ToolCall[] = [];
  for (const item of output) {
    if (!isRecord(item) || item.type !== "function_call") continue;
    toolCalls.push(
      buildToolCall(
        String(item.call_id ?? item.id ?? ""),
        String(item.name ?? ""),
        item.arguments
      )
    );
  }
  return toolCalls;
}

export function extractResponsesImages(output: unknown): MessageImageContent[] {
  if (!Array.isArray(output)) return [];
  const images: MessageImageContent[] = [];
  for (const item of output) {
    if (
      !isRecord(item) ||
      item.type !== "image_generation_call" ||
      typeof item.result !== "string"
    ) {
      continue;
    }
    const format =
      typeof item.output_format === "string" ? item.output_format : "png";
    images.push({
      type: "image_url",
      image: { data: item.result, mimeType: `image/${format}` }
    });
  }
  return images;
}

export function responseUsage(response: Record<string, unknown>): UsageInfo {
  const usage = response.usage;
  if (!isRecord(usage)) {
    return { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
  }
  const inputTokens = Number(usage.input_tokens ?? 0);
  const outputTokens = Number(usage.output_tokens ?? 0);
  const details = usage.input_tokens_details;
  const cachedTokens = isRecord(details)
    ? Number(details.cached_tokens ?? 0)
    : 0;
  return {
    inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
    outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
    cachedTokens: Number.isFinite(cachedTokens) ? cachedTokens : 0
  };
}

interface PendingFunctionCall {
  callId: string;
  name: string;
  args: string;
}

interface StreamResponsesEventsOptions {
  model: string;
  buildToolCall: (id: string, name: string, args: unknown) => ToolCall;
  onUsage: (model: string, usage: UsageInfo) => void;
  onResponseId?: (responseId: string) => void;
}

export async function* streamResponsesEvents(
  stream: AsyncIterable<Record<string, unknown>>,
  options: StreamResponsesEventsOptions
): AsyncGenerator<ProviderStreamItem> {
  const pending = new Map<string, PendingFunctionCall>();

  for await (const event of stream) {
    const type = event.type;
    if (type === "response.created" || type === "response.completed") {
      const response = event.response;
      if (isRecord(response) && typeof response.id === "string") {
        options.onResponseId?.(response.id);
      }
    }

    if (type === "response.output_text.delta") {
      const chunk: Chunk = {
        type: "chunk",
        content: String(event.delta ?? ""),
        done: false
      };
      yield chunk;
      continue;
    }

    if (type === "response.output_item.added") {
      const item = event.item;
      if (isRecord(item) && item.type === "function_call") {
        const itemId = String(item.id ?? event.item_id ?? "");
        pending.set(itemId, {
          callId: String(item.call_id ?? itemId),
          name: String(item.name ?? ""),
          args: ""
        });
      }
      continue;
    }

    if (type === "response.function_call_arguments.delta") {
      const itemId = String(event.item_id ?? "");
      const current = pending.get(itemId) ?? {
        callId: itemId,
        name: "",
        args: ""
      };
      current.args += String(event.delta ?? "");
      pending.set(itemId, current);
      continue;
    }

    if (type === "response.function_call_arguments.done") {
      const itemId = String(event.item_id ?? "");
      const current = pending.get(itemId);
      const argsText = String(
        event.arguments ?? current?.args ?? "{}"
      );
      pending.delete(itemId);
      yield options.buildToolCall(
        current?.callId ?? itemId,
        String(event.name ?? current?.name ?? ""),
        argsText
      );
      continue;
    }

    if (type === "response.output_item.done") {
      // The `image_generation` tool is a server-side tool: the image arrives as
      // a completed output item, with no function_call_output round trip, so it
      // must never enter the pending tool-call set. Surface it as an image chunk.
      const item = event.item;
      if (
        isRecord(item) &&
        item.type === "image_generation_call" &&
        typeof item.result === "string"
      ) {
        const format =
          typeof item.output_format === "string" ? item.output_format : "png";
        const chunk: Chunk = {
          type: "chunk",
          content: item.result,
          content_type: "image",
          content_metadata: {
            mimeType: `image/${format}`,
            itemId: typeof item.id === "string" ? item.id : undefined,
            revisedPrompt:
              typeof item.revised_prompt === "string"
                ? item.revised_prompt
                : undefined
          },
          done: false
        };
        yield chunk;
      }
      continue;
    }

    if (type === "response.completed") {
      const response = event.response;
      if (isRecord(response)) {
        options.onUsage(options.model, responseUsage(response));
      }
      const chunk: Chunk = { type: "chunk", content: "", done: true };
      yield chunk;
      continue;
    }

    if (
      type === "response.failed" ||
      type === "response.error" ||
      type === "error"
    ) {
      throw new Error(`Responses stream failed: ${JSON.stringify(event)}`);
    }
  }
}
