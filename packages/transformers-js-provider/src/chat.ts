import { getPipeline, loadTransformers, textGenerationTaskFor } from "@nodetool-ai/transformers-js-nodes";
import type { Chunk } from "@nodetool-ai/protocol";
import type {
  Message,
  ProviderStreamItem,
  ProviderTool,
  ToolCall
} from "@nodetool-ai/runtime";
import { createLogger } from "@nodetool-ai/config";
import {
  ToolCallTextFilter,
  parseToolCalls,
  toToolSpecs
} from "@nodetool-ai/runtime";
import {
  messageText,
  templateSupportsTools,
  toTemplateMessages,
  type ChatTemplateOptions,
  type ChatTokenizer,
  type ToolResultRole
} from "./tool-calls.js";

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
    out.push({ role: m.role, content: messageText(m.content) });
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

type TransformersModule = Awaited<ReturnType<typeof loadTransformers>>;

/** Opaque to us: constructed here, read only by the pipeline. */
type TextStreamer = InstanceType<NonNullable<TransformersModule["TextStreamer"]>>;

/** The `text-generation` call options this provider sets. */
interface ChatPipelineOptions {
  max_new_tokens: number;
  do_sample: boolean;
  temperature?: number;
  top_p?: number;
  stopping_criteria?: Stopper["criteria"];
  streamer?: TextStreamer;
  /** False for a prompt the chat template rendered: it has the special tokens. */
  add_special_tokens?: boolean;
  /** False to get only the new text for a prompt string. */
  return_full_text?: boolean;
}

type ChatPipelineFn = (
  input: ChatMessage[] | string,
  options?: ChatPipelineOptions
) => Promise<PipelineOutput[]>;

/** What the pipeline receives: chat messages, or a prompt rendered here. */
interface PreparedInput {
  input: ChatMessage[] | string;
  /** The input is a prompt string the chat template rendered. */
  rendered: boolean;
  /** The turn offered tools, so the reply is parsed for calls. */
  withTools: boolean;
}

/**
 * Render the prompt with the model's chat template. The pipeline's own
 * rendering passes neither `tools` nor `enable_thinking`. Thinking is off:
 * Qwen3 otherwise writes a long `<think>` block into the reply first, which is
 * slow on a CPU and spends the token budget. A pipeline without a tokenizer
 * gets the plain messages and no tools.
 */
function prepareInput(args: ChatArgs, pipeline: ChatPipelineFn): PreparedInput {
  const tools = args.tools ?? [];
  if (textGenerationTaskFor(args.model) === "text2text-generation") {
    if (tools.length > 0) {
      throw new Error("Text-to-text models do not support chat tool calls.");
    }
    // Teapot expects context followed by the question, without chat tokens.
    const input = normalizeMessages(args.messages).map((message) => message.content).join("\n\n");
    return { input, rendered: false, withTools: false };
  }
  // SAFETY: the pipeline instance carries `.tokenizer`, which the SDK's
  // pipeline type does not declare.
  const tokenizer = (pipeline as TokenizerHolder).tokenizer as ChatTokenizer | undefined;
  if (!tokenizer) {
    if (tools.length > 0) {
      log.warn("transformers_js: pipeline has no tokenizer; ignoring tools", {
        count: tools.length,
        model: args.model
      });
    }
    return { input: normalizeMessages(args.messages), rendered: false, withTools: false };
  }
  const options: ChatTemplateOptions = {
    tokenize: false,
    add_generation_prompt: true,
    enable_thinking: false
  };
  if (tools.length === 0) {
    const input = tokenizer.apply_chat_template(normalizeMessages(args.messages), options);
    return { input, rendered: true, withTools: false };
  }
  const specs = toToolSpecs(tools);
  const native = templateSupportsTools(tokenizer, specs);
  if (native) {
    options.tools = specs;
  }
  const render = (toolResultRole: ToolResultRole): string =>
    tokenizer.apply_chat_template(
      toTemplateMessages(args.messages, specs, native, toolResultRole),
      options
    );
  try {
    return { input: render("tool"), rendered: true, withTools: true };
  } catch (error) {
    if (native) {
      throw error;
    }
    // The template rejects the `tool` role: send results as user messages.
    return { input: render("user"), rendered: true, withTools: true };
  }
}

function withPromptOptions(
  opts: ChatPipelineOptions,
  prepared: PreparedInput
): ChatPipelineOptions {
  return prepared.rendered
    ? { ...opts, add_special_tokens: false, return_full_text: false }
    : opts;
}

async function getChatPipeline(model: string): Promise<ChatPipelineFn> {
  return (await getPipeline({
    task: "text-generation",
    model
  }));
}

function buildPipelineOpts(args: ChatArgs): ChatPipelineOptions {
  const opts: ChatPipelineOptions = {
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
  return generated ?? "";
}

/** The tokenizer a transformers.js pipeline instance carries. */
interface TokenizerHolder {
  tokenizer?: unknown;
}

interface AssistantReply {
  content: string;
  toolCalls: ToolCall[];
}

async function generateAssistantReply(args: ChatArgs): Promise<AssistantReply> {
  if (args.signal?.aborted) throw makeAbortError();

  const transformers = await loadTransformers();
  const pipeline = await getChatPipeline(args.model);
  const prepared = prepareInput(args, pipeline);
  const opts = withPromptOptions(buildPipelineOpts(args), prepared);

  const stopper = makeStopper(transformers, args.signal);
  if (stopper.criteria) opts.stopping_criteria = stopper.criteria;

  try {
    const out = await pipeline(prepared.input, opts);
    if (args.signal?.aborted) throw makeAbortError();
    const text = extractAssistantText(out);
    if (!prepared.withTools) {
      return { content: text, toolCalls: [] };
    }
    const parsed = parseToolCalls(text);
    return { content: parsed.content.trim(), toolCalls: parsed.toolCalls };
  } finally {
    stopper.cleanup();
  }
}

export async function generateMessage(args: ChatArgs): Promise<Message> {
  const reply = await generateAssistantReply(args);
  return reply.toolCalls.length > 0
    ? { role: "assistant", content: reply.content, toolCalls: reply.toolCalls }
    : { role: "assistant", content: reply.content };
}

/** The whole reply as stream items, for a runtime that cannot stream. */
async function* replyAsStream(args: ChatArgs): AsyncGenerator<ProviderStreamItem> {
  const reply = await generateAssistantReply(args);
  yield* reply.toolCalls;
  const chunk: Chunk = {
    type: "chunk",
    content_type: "text",
    content: reply.content,
    done: true
  };
  yield chunk;
}

export async function* generateMessages(
  args: ChatArgs
): AsyncGenerator<ProviderStreamItem> {
  if (args.signal?.aborted) throw makeAbortError();

  const transformers = await loadTransformers();
  const TextStreamerCtor = transformers.TextStreamer;
  if (!TextStreamerCtor) {
    // Fall back to non-streaming and yield as a single chunk.
    yield* replyAsStream(args);
    return;
  }

  const pipeline = await getChatPipeline(args.model);

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
  // SAFETY: the pipeline instance carries `.tokenizer`, which the SDK's
  // pipeline type does not declare.
  const tokenizer: unknown = (pipeline as TokenizerHolder).tokenizer;
  if (!tokenizer) {
    // Pipeline missing tokenizer — fall back to non-streaming.
    yield* replyAsStream(args);
    return;
  }
  const prepared = prepareInput(args, pipeline);
  const opts = withPromptOptions(buildPipelineOpts(args), prepared);
  // With tools, a `<tool_call>` block is held back and parsed at the end.
  const filter = prepared.withTools ? new ToolCallTextFilter() : null;
  let shown = "";

  const streamer = new TextStreamerCtor(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text: string) => enqueue(text)
  });

  // Cooperative cancellation: interrupt the model loop when the signal aborts
  // so an aborted stream stops generating instead of running to completion.
  const stopper = makeStopper(transformers, args.signal);
  const genOpts: ChatPipelineOptions = { ...opts, streamer };
  if (stopper.criteria) genOpts.stopping_criteria = stopper.criteria;

  // Kick off generation; resolve the iterator when complete.
  const generation = pipeline(prepared.input, genOpts)
    .then(() => enqueue(null))
    .catch((err) => {
      enqueue(null);
      throw err;
    });

  try {
    for (;;) {
      // `pending` only ever holds tokens, so `undefined` means it is empty.
      const buffered = pending.shift();
      const next =
        buffered === undefined
          ? await new Promise<string | null>((resolve) => {
              resolveToken = resolve;
            })
          : buffered;
      if (args.signal?.aborted) throw makeAbortError();
      if (next === null) break;
      const text = filter ? filter.push(next) : next;
      if (!text) continue;
      shown += text;
      const chunk: Chunk = {
        type: "chunk",
        content_type: "text",
        content: text,
        done: false
      };
      yield chunk;
    }
  } finally {
    stopper.cleanup();
    if (args.signal?.aborted) {
      // Unwinding due to abort: the interrupt makes `generation` settle
      // promptly; swallow its (expected) error so the AbortError surfaces.
      await generation.catch(() => {});
    } else {
      // Surface any generation error after the loop ends.
      await generation.catch((err) => {
        throw err;
      });
    }
  }

  let rest = "";
  if (filter) {
    const parsed = parseToolCalls(filter.output);
    yield* parsed.toolCalls;
    // Text the filter held back: a partial tag at the end, a malformed call,
    // or text after the calls.
    rest = parsed.content.startsWith(shown) ? parsed.content.slice(shown.length) : "";
    if (parsed.toolCalls.length > 0) {
      rest = rest.trim();
    }
  }
  const final: Chunk = {
    type: "chunk",
    content_type: "text",
    content: rest,
    done: true
  };
  yield final;
}

interface Stopper {
  criteria?: { interrupt(): void };
  cleanup(): void;
}

/**
 * Build an `InterruptableStoppingCriteria` (when the runtime exposes one) and
 * interrupt the model's generation loop the moment `signal` aborts. Without
 * this, transformers.js runs the full generation regardless of the abort and
 * the caller blocks until it finishes. Returns a no-op stopper when either the
 * criteria class or the signal is unavailable.
 */
function makeStopper(
  transformers: TransformersModule,
  signal: AbortSignal | undefined
): Stopper {
  const Ctor = transformers.InterruptableStoppingCriteria;
  if (!Ctor || !signal) return { cleanup: () => {} };
  const criteria = new Ctor();
  if (signal.aborted) {
    criteria.interrupt();
    return { criteria, cleanup: () => {} };
  }
  const onAbort = () => criteria.interrupt();
  signal.addEventListener("abort", onAbort, { once: true });
  return {
    criteria,
    cleanup: () => signal.removeEventListener("abort", onAbort)
  };
}

function makeAbortError(): Error {
  // DOMException is available in Node 18+ as a global.
  const Ctor = globalThis
    .DOMException;
  if (Ctor) return new Ctor("Aborted", "AbortError");
  const err = new Error("Aborted");
  err.name = "AbortError";
  return err;
}
