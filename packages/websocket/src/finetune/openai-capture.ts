/**
 * Record what a model behind an OpenAI-compatible endpoint (OpenRouter) saw
 * and said on every `/chat/completions` request.
 *
 * A teacher model's runs are rendered again in the student's chat format for
 * training, so what matters here is the conversation, not the teacher's own
 * tokens: messages are normalized to the trace's {@link WireMessage} shape,
 * the streamed reply is assembled, and the teacher's reasoning is kept apart
 * so the export can drop it.
 */
import type { WireExchange, WireMessage } from "./ollama-capture.js";

interface OpenAIToolCall {
  id?: string;
  function?: { name?: string; arguments?: unknown };
}

interface OpenAIMessage {
  role: string;
  content?: unknown;
  tool_calls?: OpenAIToolCall[];
  reasoning?: string;
  reasoning_content?: string;
}

interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  cost?: number;
}

interface Chunk {
  choices?: Array<{
    delta?: OpenAIMessage & { tool_calls?: Array<OpenAIToolCall & { index?: number }> };
    message?: OpenAIMessage;
    finish_reason?: string | null;
  }>;
  usage?: Usage;
}

/**
 * Message content as text. Text parts are joined; an image part marks the
 * message so the export rejects it (the student's render has no images).
 */
function normalizeContent(content: unknown): { text: string; images: string[] } {
  if (typeof content === "string") return { text: content, images: [] };
  if (!Array.isArray(content)) return { text: "", images: [] };
  const texts: string[] = [];
  const images: string[] = [];
  for (const part of content as Array<{ type?: string; text?: string }>) {
    if (part.type === "text" && typeof part.text === "string") texts.push(part.text);
    else if (part.type === "image_url" || part.type === "input_image") images.push("<image>");
  }
  return { text: texts.join("\n"), images };
}

export function normalizeOpenAIMessage(message: OpenAIMessage): WireMessage {
  const { text, images } = normalizeContent(message.content);
  const out: WireMessage = { role: message.role, content: text };
  if (images.length > 0) out.images = images;
  if (message.tool_calls?.length) {
    out.tool_calls = message.tool_calls.map((call) => ({
      function: { name: call.function?.name ?? "", arguments: call.function?.arguments ?? {} }
    }));
  }
  const thinking = message.reasoning ?? message.reasoning_content;
  if (thinking) out.thinking = thinking;
  return out;
}

/** Fold a `/chat/completions` reply, streamed (SSE) or not, into one exchange reply. */
export function foldOpenAIResponse(
  text: string
): Pick<WireExchange, "reply" | "doneReason" | "promptTokens" | "evalTokens" | "costUsd"> {
  const chunks: Chunk[] = [];
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{")) {
    try {
      chunks.push(JSON.parse(trimmed) as Chunk);
    } catch {
      // fall through: an unparsable body folds to an empty reply
    }
  } else {
    for (const line of text.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "" || data === "[DONE]") continue;
      try {
        chunks.push(JSON.parse(data) as Chunk);
      } catch {
        // keep-alive comments and partial lines carry nothing
      }
    }
  }

  let content = "";
  let thinking = "";
  const calls = new Map<number, { name: string; arguments: string }>();
  let doneReason: string | null = null;
  let usage: Usage | undefined;
  for (const chunk of chunks) {
    if (chunk.usage) usage = chunk.usage;
    for (const choice of chunk.choices ?? []) {
      const part = choice.delta ?? choice.message;
      if (part) {
        if (typeof part.content === "string") content += part.content;
        thinking += part.reasoning ?? part.reasoning_content ?? "";
        (part.tool_calls ?? []).forEach((call, position) => {
          const index = (call as { index?: number }).index ?? position;
          const entry = calls.get(index) ?? { name: "", arguments: "" };
          if (call.function?.name) entry.name += call.function.name;
          const args = call.function?.arguments;
          if (typeof args === "string") entry.arguments += args;
          else if (args !== undefined) entry.arguments = JSON.stringify(args);
          calls.set(index, entry);
        });
      }
      if (choice.finish_reason) doneReason = choice.finish_reason;
    }
  }
  const reply: WireMessage = { role: "assistant", content };
  if (thinking) reply.thinking = thinking;
  if (calls.size > 0) {
    reply.tool_calls = [...calls.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, call]) => ({ function: { name: call.name, arguments: call.arguments } }));
  }
  return {
    reply,
    doneReason,
    promptTokens: usage?.prompt_tokens ?? null,
    evalTokens: usage?.completion_tokens ?? null,
    costUsd: usage?.cost ?? null
  };
}

/**
 * A `fetch` that passes every request through and appends each
 * `/chat/completions` exchange to `sink`. It also asks OpenRouter to report
 * usage and cost on the reply.
 */
export function capturingOpenAIFetch(
  sink: () => WireExchange[],
  opts: { temperature?: number } = {}
): typeof fetch {
  return async (url, init) => {
    if (!String(url).endsWith("/chat/completions") || typeof init?.body !== "string") {
      return fetch(url, init);
    }
    const body = JSON.parse(init.body) as {
      messages?: OpenAIMessage[];
      tools?: unknown[];
      temperature?: number;
    } & Record<string, unknown>;
    const sentBody: Record<string, unknown> = { ...body, usage: { include: true } };
    if (opts.temperature !== undefined) sentBody.temperature = opts.temperature;
    const res = await fetch(url, { ...init, body: JSON.stringify(sentBody) });
    const text = await res.text();
    sink().push({
      messages: (body.messages ?? []).map(normalizeOpenAIMessage),
      tools: body.tools ?? [],
      options: opts.temperature !== undefined ? { temperature: opts.temperature } : {},
      ...foldOpenAIResponse(text),
      status: res.status
    });
    return new Response(text, { status: res.status, headers: res.headers });
  };
}
