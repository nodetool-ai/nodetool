import { createLogger } from "@nodetool-ai/config";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import { BaseProvider, splitToolResultImages } from "./base-provider.js";
import { OpenAIProvider } from "./openai-provider.js";
import { hashSystemPrompt } from "./provider-session.js";
import {
  extractResponsesImages,
  extractResponsesText,
  extractResponsesToolCalls,
  isRecord,
  messagesToResponsesInput,
  responseToolChoice,
  responseTools,
  responseUsage,
  streamResponsesEvents
} from "./responses-api.js";
import {
  isProviderMessageEvent,
  isProviderSessionUpdate,
  IMAGE_GENERATION_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  type LanguageModel,
  type Message,
  type MessageContent,
  type MessageImageContent,
  type ProviderSession,
  type ProviderStreamItem,
  type ProviderTool,
  type ToolCall
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.openai-responses");

const RESPONSE_WEB_SEARCH_TOOL: Record<string, unknown> = {
  type: "web_search"
};

const RESPONSE_IMAGE_GENERATION_TOOL: Record<string, unknown> = {
  type: "image_generation"
};

const OPENAI_RESPONSES_FALLBACK_MODELS: LanguageModel[] = [
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-4o",
  "gpt-4o-mini",
  "o4-mini",
  "o3",
  "o3-mini",
  "o1",
  "o1-mini"
].map((id) => ({
  id,
  name: id,
  provider: PROVIDER_IDS.OPENAI_RESPONSES
}));

type OpenAIProviderOptions = ConstructorParameters<typeof OpenAIProvider>[1];
type GenerateMessagesArgs = Parameters<BaseProvider["generateMessages"]>[0];
type GenerateLoopArgs = GenerateMessagesArgs & {
  executeTool?: (toolCall: ToolCall) => Promise<string | MessageContent[]>;
  maxIterations?: number;
  sequentialTools?: boolean;
};
type ResponsesCreate = (
  body: Record<string, unknown>,
  options?: { signal?: AbortSignal }
) => Promise<Record<string, unknown> | AsyncIterable<Record<string, unknown>>>;

interface StreamTurnState {
  assistantText: string;
  images: MessageImageContent[];
  pending: ToolCall[];
  responseId: string | null;
  emittedContent: boolean;
}

function isOpenAIResponsesModel(model: string): boolean {
  const id = model.toLowerCase();
  return (
    /^gpt-5(?:[.-]|$)/.test(id) ||
    /^gpt-4\.1(?:-|$)/.test(id) ||
    /^gpt-4o(?:-|$)/.test(id) ||
    /^o\d(?:-|$)/.test(id)
  );
}

function systemPrompt(messages: Message[]): string {
  return messages
    .filter((m) => m.role === "system")
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .filter(Boolean)
    .join("\n\n");
}

/**
 * A native image_generation result surfaced by the stream parser as an image
 * chunk. Returns the content block to attach to the assistant message, or
 * null for any other stream item. The multi-megabyte base64 blob must be
 * absorbed here, never yielded onward as a chunk.
 */
function imageContentFromChunk(item: unknown): MessageImageContent | null {
  if (
    !isRecord(item) ||
    item.type !== "chunk" ||
    item.content_type !== "image" ||
    typeof item.content !== "string"
  ) {
    return null;
  }
  const metadata = isRecord(item.content_metadata) ? item.content_metadata : {};
  const mimeType =
    typeof metadata.mimeType === "string" ? metadata.mimeType : "image/png";
  return { type: "image_url", image: { data: item.content, mimeType } };
}

/** Text block (when non-empty) followed by generated-image blocks. */
function assistantContentWithImages(
  text: string,
  images: MessageImageContent[]
): MessageContent[] {
  const blocks: MessageContent[] = [];
  if (text) blocks.push({ type: "text", text });
  blocks.push(...images);
  return blocks;
}

export class OpenAIResponsesProvider extends OpenAIProvider {
  static override requiredSecrets(): string[] {
    return ["OPENAI_API_KEY"];
  }

  constructor(
    secrets: { OPENAI_API_KEY?: string },
    options: OpenAIProviderOptions = {}
  ) {
    super(secrets, {
      ...options,
      providerId: PROVIDER_IDS.OPENAI_RESPONSES
    });
  }

  override get supportsNativeWebSearch(): boolean {
    return true;
  }

  override get supportsNativeImageGeneration(): boolean {
    return true;
  }

  override async hasToolSupport(model: string): Promise<boolean> {
    return isOpenAIResponsesModel(model);
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const models = await super.getAvailableLanguageModels();
    const filtered = models
      .filter((model) => isOpenAIResponsesModel(model.id))
      .map((model) => ({
        ...model,
        provider: PROVIDER_IDS.OPENAI_RESPONSES
      }));
    return filtered.length > 0 ? filtered : OPENAI_RESPONSES_FALLBACK_MODELS;
  }

  override formatTools(tools: ProviderTool[]): Array<Record<string, unknown>> {
    const formatted: Array<Record<string, unknown>> = [];
    for (const tool of tools) {
      if (tool.name === WEB_SEARCH_TOOL_NAME) {
        formatted.push(RESPONSE_WEB_SEARCH_TOOL);
        continue;
      }
      if (tool.name === IMAGE_GENERATION_TOOL_NAME) {
        formatted.push(RESPONSE_IMAGE_GENERATION_TOOL);
        continue;
      }
      const [functionTool] = responseTools([tool]);
      if (functionTool) formatted.push(functionTool);
    }
    return formatted;
  }

  override async generateMessage(
    args: Parameters<BaseProvider["generateMessage"]>[0]
  ): Promise<Message> {
    const request = await this.buildResponsesRequest(args, {
      input: await messagesToResponsesInput(args.messages, (uri) =>
        this.resolveUri(uri)
      ),
      stream: false,
      store: false
    });
    const client = this.getClient();

    this.recordRequestPayload(request);
    const response = (await (client.responses.create as unknown as ResponsesCreate).call(
      client.responses,
      request,
      { signal: args.signal }
    )) as Record<string, unknown>;

    this.trackUsage(args.model, responseUsage(response));
    const outputText =
      typeof response.output_text === "string"
        ? response.output_text
        : extractResponsesText(response.output);
    const toolCalls = extractResponsesToolCalls(
      response.output,
      this.buildToolCall.bind(this)
    );
    const images = extractResponsesImages(response.output);
    const content: string | MessageContent[] | null =
      images.length > 0
        ? assistantContentWithImages(outputText, images)
        : outputText || null;

    return {
      role: "assistant",
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined
    };
  }

  override async *generateMessages(
    args: GenerateMessagesArgs
  ): AsyncGenerator<ProviderStreamItem> {
    const input = await messagesToResponsesInput(args.messages, (uri) =>
      this.resolveUri(uri)
    );
    const request = await this.buildResponsesRequest(args, {
      input,
      stream: true,
      store: false
    });
    // Absorb native image results here too — this non-loop path must uphold
    // the same invariant as collectModelTurn: the base64 blob never leaks
    // outward as a chunk. The image rides a trailing assistant message event.
    const images: MessageImageContent[] = [];
    let assistantText = "";
    for await (const item of this.streamResponsesRequest(args, request)) {
      const image = imageContentFromChunk(item);
      if (image) {
        images.push(image);
        continue;
      }
      if (
        isRecord(item) &&
        item.type === "chunk" &&
        typeof item.content === "string" &&
        !item.thinking
      ) {
        assistantText += item.content;
      }
      yield item;
    }
    if (images.length > 0) {
      yield {
        type: "message",
        message: {
          role: "assistant",
          content: assistantContentWithImages(assistantText, images)
        }
      };
    }
  }

  override async *generateLoop(
    args: GenerateLoopArgs
  ): AsyncGenerator<ProviderStreamItem> {
    const maxIterations = args.maxIterations ?? 25;
    const {
      executeTool,
      maxIterations: _omitMaxIterations,
      sequentialTools,
      ...turnArgs
    } = args;
    const systemHash = hashSystemPrompt(systemPrompt(args.messages));
    const prior = args.providerSession ?? null;
    const canResume =
      prior != null &&
      prior.providerId === this.provider &&
      prior.model === args.model &&
      (prior.systemHash == null || prior.systemHash === systemHash) &&
      args.messages.length > prior.checkpoint;

    if (canResume && prior) {
      const firstMessages = args.messages.slice(prior.checkpoint);
      const firstTurnState = this.createTurnState(prior.token);
      try {
        yield* this.runResponsesLoop({
          args: turnArgs,
          executeTool,
          sequentialTools: sequentialTools === true,
          maxIterations,
          firstMessages,
          firstPreviousResponseId: prior.token,
          systemHash,
          firstTurnState
        });
        return;
      } catch (err) {
        if (firstTurnState.emittedContent) {
          throw err;
        }
        log.warn("OpenAI Responses resume failed; starting fresh", {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    const freshMessages = args.loadFullHistory
      ? await args.loadFullHistory()
      : args.messages;
    yield* this.runResponsesLoop({
      args: turnArgs,
      executeTool,
      sequentialTools: sequentialTools === true,
      maxIterations,
      firstMessages: freshMessages,
      firstPreviousResponseId: null,
      systemHash,
      firstTurnState: this.createTurnState(null)
    });
  }

  private async buildResponsesRequest(
    args: Pick<
      GenerateMessagesArgs,
      "model" | "tools" | "toolChoice" | "maxTokens" | "temperature" | "topP"
    >,
    config: {
      input: Array<Record<string, unknown>>;
      stream: boolean;
      store: boolean;
      previousResponseId?: string | null;
    }
  ): Promise<Record<string, unknown>> {
    const request: Record<string, unknown> = {
      model: args.model,
      input: config.input,
      stream: config.stream,
      store: config.store
    };

    if (config.previousResponseId) {
      request.previous_response_id = config.previousResponseId;
    }
    if (args.maxTokens != null) request.max_output_tokens = args.maxTokens;
    if (args.temperature != null) request.temperature = args.temperature;
    if (args.topP != null) request.top_p = args.topP;

    const tools = this.formatTools(args.tools ?? []);
    if (tools.length > 0) {
      request.tools = tools;
      request.tool_choice =
        args.toolChoice === WEB_SEARCH_TOOL_NAME ||
        args.toolChoice === IMAGE_GENERATION_TOOL_NAME
          ? "auto"
          : responseToolChoice(args.toolChoice) ?? "auto";
    }

    return request;
  }

  private async *streamResponsesRequest(
    args: GenerateMessagesArgs,
    request: Record<string, unknown>,
    onResponseId?: (responseId: string) => void
  ): AsyncGenerator<ProviderStreamItem> {
    const client = this.getClient();
    this.recordRequestPayload(request);
    const stream = (await (client.responses.create as unknown as ResponsesCreate).call(
      client.responses,
      request,
      { signal: args.signal }
    )) as AsyncIterable<Record<string, unknown>>;
    yield* streamResponsesEvents(stream, {
      model: args.model,
      buildToolCall: this.buildToolCall.bind(this),
      onUsage: (model, usage) => this.trackUsage(model, usage),
      onResponseId
    });
  }

  private createTurnState(responseId: string | null): StreamTurnState {
    return {
      assistantText: "",
      images: [],
      pending: [],
      responseId,
      emittedContent: false
    };
  }

  private async *runResponsesLoop(config: {
    args: GenerateMessagesArgs;
    executeTool?: (toolCall: ToolCall) => Promise<string | MessageContent[]>;
    sequentialTools: boolean;
    maxIterations: number;
    firstMessages: Message[];
    firstPreviousResponseId: string | null;
    systemHash: string;
    firstTurnState: StreamTurnState;
  }): AsyncGenerator<ProviderStreamItem> {
    const toolMap = new Map<string, ProviderTool>(
      (config.args.tools ?? []).map((tool) => [tool.name, tool])
    );
    let previousResponseId = config.firstPreviousResponseId;
    let input = await messagesToResponsesInput(config.firstMessages, (uri) =>
      this.resolveUri(uri)
    );
    let state = config.firstTurnState;

    for (let iteration = 0; iteration < config.maxIterations; iteration++) {
      if (config.args.signal?.aborted) return;

      const request = await this.buildResponsesRequest(config.args, {
        input,
        stream: true,
        store: true,
        previousResponseId
      });
      yield* this.collectModelTurn(config.args, request, config.systemHash, state);

      previousResponseId = state.responseId;
      // Native image_generation results ride the assistant message as image
      // content and don't affect pending-tool semantics.
      const assistantContent: string | MessageContent[] | null =
        state.images.length > 0
          ? assistantContentWithImages(state.assistantText, state.images)
          : state.assistantText || null;
      const assistantMsg: Message = {
        role: "assistant",
        content: assistantContent,
        toolCalls: state.pending.length > 0 ? state.pending : null
      };
      yield { type: "message", message: assistantMsg };

      if (state.pending.length === 0) {
        return;
      }

      if (!previousResponseId) {
        throw new Error("OpenAI Responses returned tool calls without a response id");
      }

      const toolMessages: Message[] = [];
      const runTool = async (
        tc: ToolCall
      ): Promise<string | MessageContent[]> => {
        const tool = toolMap.get(tc.name);
        if (tool?.execute) return tool.execute(tc.args ?? {}, tc.id);
        if (config.executeTool) return config.executeTool(tc);
        return `Tool "${tc.name}" is not available`;
      };
      const emitToolResult = function* (
        tc: ToolCall,
        content: string | MessageContent[]
      ): Generator<ProviderStreamItem> {
        const { toolContent, imageMessage } = splitToolResultImages(content);
        const toolMsg: Message = {
          role: "tool",
          toolCallId: tc.id,
          content: toolContent
        };
        toolMessages.push(toolMsg);
        yield { type: "message", message: toolMsg };
        if (imageMessage) {
          toolMessages.push(imageMessage);
        }
      };

      let terminated = false;
      if (config.sequentialTools) {
        for (const tc of state.pending) {
          const content = await runTool(tc);
          yield* emitToolResult(tc, content);
          const tool = toolMap.get(tc.name);
          if (tool?.terminal) {
            terminated = true;
            break;
          }
        }
      } else {
        const results = await Promise.all(
          state.pending.map(async (tc) => ({
            tc,
            content: await runTool(tc)
          }))
        );
        for (const { tc, content } of results) {
          yield* emitToolResult(tc, content);
          const tool = toolMap.get(tc.name);
          if (tool?.terminal) terminated = true;
        }
      }

      input = await messagesToResponsesInput(toolMessages, (uri) =>
        this.resolveUri(uri)
      );
      if (terminated) return;
      state = this.createTurnState(previousResponseId);
    }

    yield { type: "chunk", content: "", done: true };
  }

  private async *collectModelTurn(
    args: GenerateMessagesArgs,
    request: Record<string, unknown>,
    systemHash: string,
    state: StreamTurnState
  ): AsyncGenerator<ProviderStreamItem> {
    const sessionUpdates: ProviderStreamItem[] = [];
    const enqueueSession = (responseId: string): void => {
      if (state.responseId === responseId) return;
      state.responseId = responseId;
      const session: ProviderSession = {
        providerId: this.provider,
        model: args.model,
        token: responseId,
        checkpoint: args.messages.length,
        systemHash
      };
      sessionUpdates.push({ type: "session", session });
    };
    const flushSessions = function* (): Generator<ProviderStreamItem> {
      while (sessionUpdates.length > 0) {
        const update = sessionUpdates.shift();
        if (update) yield update;
      }
    };

    for await (const item of this.streamResponsesRequest(
      args,
      request,
      enqueueSession
    )) {
      yield* flushSessions();
      if (isProviderSessionUpdate(item) || isProviderMessageEvent(item)) {
        yield item;
        continue;
      }
      if ("id" in item && "name" in item && "args" in item) {
        state.pending.push(item);
        state.emittedContent = true;
        yield item;
        continue;
      }
      if (isRecord(item) && item.type === "chunk") {
        const image = imageContentFromChunk(item);
        if (image) {
          state.images.push(image);
          state.emittedContent = true;
          continue;
        }
        if (typeof item.content === "string" && !item.thinking) {
          state.assistantText += item.content;
          if (item.content) state.emittedContent = true;
        }
        yield item;
      }
    }
    yield* flushSessions();
  }

}
