/**
 * Record what an Ollama model saw and said on every `/api/chat` request.
 *
 * Fine-tuning data has to match inference token for token, so the trace is
 * taken at the wire: the request body Ollama renders with the model's chat
 * template, and the reply assembled from the stream. The per-request stats
 * (`done_reason`, prompt and eval counts) also show why a turn ended, which
 * an empty reply alone does not.
 */

/**
 * One chat message as a trace records it: Ollama's `/api/chat` shape, which
 * OpenAI-format requests (openai-capture.ts) are normalized to.
 */
export interface WireMessage {
  role: string;
  content?: string;
  thinking?: string;
  images?: string[];
  tool_calls?: Array<{ function: { name: string; arguments: unknown } }>;
  tool_name?: string;
}

/** One request and the reply the model streamed back. */
export interface WireExchange {
  messages: WireMessage[];
  tools: unknown[];
  options: Record<string, unknown>;
  reply: WireMessage;
  doneReason: string | null;
  promptTokens: number | null;
  evalTokens: number | null;
  status: number;
  /** What the request cost, when the gateway reports it (OpenRouter). */
  costUsd?: number | null;
}

export interface OllamaCaptureOptions {
  /** Overrides the request's sampling temperature, for diverse samples. */
  temperature?: number;
  /** Overrides `num_ctx`. */
  numCtx?: number;
}

interface StreamLine {
  message?: WireMessage;
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

/** Fold Ollama's NDJSON stream (or a single JSON reply) into one exchange reply. */
export function foldOllamaStream(text: string): Pick<
  WireExchange,
  "reply" | "doneReason" | "promptTokens" | "evalTokens"
> {
  const reply: WireMessage = { role: "assistant", content: "" };
  let doneReason: string | null = null;
  let promptTokens: number | null = null;
  let evalTokens: number | null = null;
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    let parsed: StreamLine;
    try {
      parsed = JSON.parse(line) as StreamLine;
    } catch {
      continue;
    }
    const message = parsed.message;
    if (message) {
      if (message.content) reply.content += message.content;
      if (message.thinking) reply.thinking = (reply.thinking ?? "") + message.thinking;
      if (message.tool_calls?.length) {
        reply.tool_calls = [...(reply.tool_calls ?? []), ...message.tool_calls];
      }
    }
    if (parsed.done === true) {
      doneReason = parsed.done_reason ?? null;
      promptTokens = parsed.prompt_eval_count ?? null;
      evalTokens = parsed.eval_count ?? null;
    }
  }
  return { reply, doneReason, promptTokens, evalTokens };
}

/**
 * A `fetch` that passes every request through and appends each `/api/chat`
 * exchange to `sink`. The caller swaps `sink` per job.
 */
export function capturingOllamaFetch(
  sink: () => WireExchange[],
  opts: OllamaCaptureOptions = {}
): typeof fetch {
  return async (url, init) => {
    if (!String(url).endsWith("/api/chat") || typeof init?.body !== "string") {
      return fetch(url, init);
    }
    const body = JSON.parse(init.body) as {
      messages?: WireMessage[];
      tools?: unknown[];
      options?: Record<string, unknown>;
    };
    const options = { ...(body.options ?? {}) };
    if (opts.temperature !== undefined) options.temperature = opts.temperature;
    if (opts.numCtx !== undefined) options.num_ctx = opts.numCtx;
    const sent = JSON.stringify({ ...body, options });
    const res = await fetch(url, { ...init, body: sent });
    const text = await res.text();
    sink().push({
      messages: body.messages ?? [],
      tools: body.tools ?? [],
      options,
      ...foldOllamaStream(text),
      status: res.status
    });
    return new Response(text, { status: res.status, headers: res.headers });
  };
}
