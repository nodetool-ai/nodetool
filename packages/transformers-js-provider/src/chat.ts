import { getPipeline, loadTransformers } from "@nodetool-ai/transformers-js-nodes";
import type { Chunk } from "@nodetool-ai/protocol";
import type {
  Message,
  ProviderStreamItem,
  ProviderTool
} from "@nodetool-ai/runtime";
import { createLogger } from "@nodetool-ai/config";

const log = createLogger("nodetool.transformers-js-provider.chat");

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Convert NodeTool `Message[]` → transformers.js chat format. Drops `tool`
 * roles and any non-text content (transformers.js text-gen pipelines do not
 * accept multimodal inputs in the chat API surface).
 */
export function normalizeMessages(messages: Message[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (m.role !== "system" && m.role !== "user" && m.role !== "assistant") {
      continue;
    }
    let text: string;
    if (typeof m.content === "string") {
      text = m.content;
    } else if (Array.isArray(m.content)) {
      text = m.content
        .filter((c) => c?.type === "text")
        .map((c) => (c as { text: string }).text)
        .join("");
    } else {
      text = "";
    }
    out.push({ role: m.role, content: text });
  }
  return out;
}

interface ChatArgs {
  messages: Message[];
  model: string;
  tools?: ProviderTool[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  signal?: AbortSignal;
}

interface PipelineOutput {
  generated_text?: Array<{ role: string; content: string }> | string;
}

type ChatPipelineFn = (
  input: ChatMessage[],
  options?: Record<string, unknown>
) => Promise<PipelineOutput[]>;

function warnIfTools(args: ChatArgs): void {
  if ((args.tools && args.tools.length > 0) || args.tools === undefined) {
    if (args.tools && args.tools.length > 0) {
      log.warn(
        "transformers_js: tool calls are not supported; ignoring tools",
        { count: args.tools.length, model: args.model }
      );
    }
  }
}

async function getChatPipeline(model: string): Promise<ChatPipelineFn> {
  return (await getPipeline({
    task: "text-generation",
    model
  })) as ChatPipelineFn;
}

function buildPipelineOpts(args: ChatArgs): Record<string, unknown> {
  const opts: Record<string, unknown> = {
    max_new_tokens: args.maxTokens ?? 512,
    do_sample: (args.temperature ?? 0) > 0
  };
  if (args.temperature !== undefined) opts.temperature = args.temperature;
  if (args.topP !== undefined) opts.top_p = args.topP;
  return opts;
}

function extractAssistantText(out: PipelineOutput[]): string {
  const generated = out?.[0]?.generated_text;
  if (Array.isArray(generated)) {
    const last = generated[generated.length - 1];
    return last?.content ?? "";
  }
  return typeof generated === "string" ? generated : "";
}

export async function generateMessage(args: ChatArgs): Promise<Message> {
  warnIfTools(args);
  if (args.signal?.aborted) throw makeAbortError();

  const pipeline = await getChatPipeline(args.model);
  const messages = normalizeMessages(args.messages);
  const opts = buildPipelineOpts(args);

  const out = await pipeline(messages, opts);
  if (args.signal?.aborted) throw makeAbortError();

  return { role: "assistant", content: extractAssistantText(out) };
}

export async function* generateMessages(
  args: ChatArgs
): AsyncGenerator<ProviderStreamItem> {
  warnIfTools(args);
  if (args.signal?.aborted) throw makeAbortError();

  const transformers = await loadTransformers();
  const TextStreamerCtor = transformers.TextStreamer;
  if (!TextStreamerCtor) {
    // Fall back to non-streaming and yield as a single chunk.
    const message = await generateMessage(args);
    const chunk: Chunk = {
      type: "chunk",
      content_type: "text",
      content:
        typeof message.content === "string" ? message.content : "",
      done: true
    };
    yield chunk;
    return;
  }

  const pipeline = await getChatPipeline(args.model);
  const messages = normalizeMessages(args.messages);
  const opts = buildPipelineOpts(args);

  const tokens: string[] = [];
  let resolveToken: ((value: string | null) => void) | null = null;
  const pending: Array<string | null> = [];

  const enqueue = (text: string | null) => {
    if (resolveToken) {
      resolveToken(text);
      resolveToken = null;
    } else {
      pending.push(text);
    }
  };

  // Tokenizer is exposed on the pipeline instance as `.tokenizer`.
  const tokenizer = (pipeline as unknown as { tokenizer?: unknown }).tokenizer;
  if (!tokenizer) {
    // Pipeline missing tokenizer — fall back to non-streaming.
    const message = await generateMessage(args);
    const chunk: Chunk = {
      type: "chunk",
      content_type: "text",
      content:
        typeof message.content === "string" ? message.content : "",
      done: true
    };
    yield chunk;
    return;
  }

  const streamer = new TextStreamerCtor(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text: string) => {
      tokens.push(text);
      enqueue(text);
    }
  });

  // Kick off generation; resolve the iterator when complete.
  const generation = pipeline(messages, {
    ...opts,
    streamer
  })
    .then(() => enqueue(null))
    .catch((err) => {
      enqueue(null);
      throw err;
    });

  try {
    for (;;) {
      let next: string | null;
      if (pending.length > 0) {
        next = pending.shift() as string | null;
      } else {
        next = await new Promise<string | null>((resolve) => {
          resolveToken = resolve;
        });
      }
      if (args.signal?.aborted) throw makeAbortError();
      if (next === null) break;
      const chunk: Chunk = {
        type: "chunk",
        content_type: "text",
        content: next,
        done: false
      };
      yield chunk;
    }
  } finally {
    // Surface generation errors after the loop ends (or rethrow on abort).
    await generation.catch((err) => {
      throw err;
    });
  }

  const final: Chunk = {
    type: "chunk",
    content_type: "text",
    content: "",
    done: true
  };
  yield final;
}

function makeAbortError(): Error {
  // DOMException is available in Node 18+ as a global.
  const Ctor = (globalThis as { DOMException?: new (msg: string, name: string) => Error })
    .DOMException;
  if (Ctor) return new Ctor("Aborted", "AbortError");
  const err = new Error("Aborted");
  err.name = "AbortError";
  return err;
}
