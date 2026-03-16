import { randomUUID } from "node:crypto";
import type { Chunk } from "@nodetool/protocol";
import { BaseProvider } from "./base-provider.js";
import type {
  LanguageModel,
  Message,
  MessageTextContent,
  ProviderStreamItem,
  ProviderTool,
  ToolCall,
} from "./types.js";

type CustomResponseFn = (
  messages: Message[],
  model: string
) => string | ToolCall[];

export interface FakeProviderOptions {
  textResponse?: string;
  toolCalls?: ToolCall[];
  shouldStream?: boolean;
  chunkSize?: number;
  customResponseFn?: CustomResponseFn;
}

export class FakeProvider extends BaseProvider {
  textResponse: string;
  toolCalls: ToolCall[];
  shouldStream: boolean;
  chunkSize: number;
  customResponseFn: CustomResponseFn | null;

  callCount = 0;
  lastMessages: Message[] | null = null;
  lastModel: string | null = null;
  lastTools: ProviderTool[] = [];

  constructor(options: FakeProviderOptions = {}) {
    super("fake");
    this.textResponse =
      options.textResponse ?? "Hello, this is a fake response!";
    this.toolCalls = options.toolCalls ?? [];
    this.shouldStream = options.shouldStream ?? true;
    this.chunkSize = options.chunkSize ?? 10;
    this.customResponseFn = options.customResponseFn ?? null;
  }

  private getResponse(messages: Message[], model: string): string | ToolCall[] {
    if (this.customResponseFn) {
      return this.customResponseFn(messages, model);
    }
    if (this.toolCalls.length > 0) {
      return this.toolCalls;
    }
    return this.textResponse;
  }

  resetCallCount(): void {
    this.callCount = 0;
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return [
      { id: "fake-model-v1", name: "Fake Model v1", provider: "fake" },
      { id: "fake-model-v2", name: "Fake Model v2", provider: "fake" },
      { id: "fake-fast-model", name: "Fake Fast Model", provider: "fake" },
    ];
  }

  async generateMessage(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    maxTokens?: number;
    responseFormat?: Record<string, unknown>;
    jsonSchema?: Record<string, unknown>;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
  }): Promise<Message> {
    this.callCount++;
    this.lastMessages = args.messages;
    this.lastModel = args.model;
    this.lastTools = args.tools ?? [];

    const response = this.getResponse(args.messages, args.model);

    if (Array.isArray(response)) {
      return { role: "assistant", content: [], toolCalls: response };
    }
    const content: MessageTextContent[] = [{ type: "text", text: response }];
    return { role: "assistant", content };
  }

  async *generateMessages(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    maxTokens?: number;
    responseFormat?: Record<string, unknown>;
    jsonSchema?: Record<string, unknown>;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    audio?: Record<string, unknown>;
  }): AsyncGenerator<ProviderStreamItem> {
    this.callCount++;
    this.lastMessages = args.messages;
    this.lastModel = args.model;
    this.lastTools = args.tools ?? [];

    const response = this.getResponse(args.messages, args.model);

    if (Array.isArray(response)) {
      for (const toolCall of response) {
        yield toolCall;
      }
      return;
    }

    if (this.shouldStream && response.length > this.chunkSize) {
      for (let i = 0; i < response.length; i += this.chunkSize) {
        const chunkText = response.slice(i, i + this.chunkSize);
        const done = i + this.chunkSize >= response.length;
        yield {
          type: "chunk",
          content: chunkText,
          done,
          content_type: "text",
        } as Chunk;
      }
    } else {
      yield {
        type: "chunk",
        content: response,
        done: true,
        content_type: "text",
      } as Chunk;
    }
  }
}

export function createFakeToolCall(
  name: string,
  args?: Record<string, unknown>,
  callId?: string
): ToolCall {
  return {
    id: callId ?? randomUUID(),
    name,
    args: args ?? {},
  };
}

export function createSimpleFakeProvider(
  responseText = "Test response"
): FakeProvider {
  return new FakeProvider({ textResponse: responseText, shouldStream: false });
}

export function createStreamingFakeProvider(
  responseText = "This is a streaming test response",
  chunkSize = 5
): FakeProvider {
  return new FakeProvider({
    textResponse: responseText,
    shouldStream: true,
    chunkSize,
  });
}

export function createToolCallingFakeProvider(
  toolCalls: ToolCall[]
): FakeProvider {
  return new FakeProvider({ toolCalls });
}
