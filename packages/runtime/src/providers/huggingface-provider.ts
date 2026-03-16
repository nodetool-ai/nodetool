import { createLogger } from "@nodetool/config";
import { BaseProvider } from "./base-provider.js";
import type { Chunk } from "@nodetool/protocol";
import type {
  ImageModel,
  LanguageModel,
  Message,
  MessageContent,
  MessageTextContent,
  ProviderStreamItem,
  ProviderTool,
  StreamingAudioChunk,
  TextToImageParams,
  TTSModel,
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.huggingface");

/** Lazy-loaded HuggingFace Inference SDK handle. */
let _hfModule: any = null;

async function getHfInference(apiKey: string): Promise<any> {
  if (!_hfModule) {
    try {
      // Dynamic import — @huggingface/inference is an optional dependency
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      _hfModule = await (Function('return import("@huggingface/inference")')() as Promise<any>);
    } catch {
      throw new Error(
        "@huggingface/inference is required for HuggingFaceProvider. " +
          "Install it with: npm install @huggingface/inference"
      );
    }
  }
  const HfInference = _hfModule.HfInference ?? _hfModule.default?.HfInference;
  if (!HfInference) {
    throw new Error("Could not find HfInference class in @huggingface/inference");
  }
  return new HfInference(apiKey);
}

/** Curated list of popular HuggingFace language models. */
const HF_LANGUAGE_MODELS: LanguageModel[] = [
  { id: "meta-llama/Llama-3.1-70B-Instruct", name: "Llama 3.1 70B Instruct", provider: "huggingface" },
  { id: "meta-llama/Llama-3.1-8B-Instruct", name: "Llama 3.1 8B Instruct", provider: "huggingface" },
  { id: "mistralai/Mixtral-8x7B-Instruct-v0.1", name: "Mixtral 8x7B Instruct", provider: "huggingface" },
  { id: "mistralai/Mistral-7B-Instruct-v0.3", name: "Mistral 7B Instruct v0.3", provider: "huggingface" },
  { id: "microsoft/Phi-3-mini-4k-instruct", name: "Phi 3 Mini 4K Instruct", provider: "huggingface" },
  { id: "HuggingFaceH4/zephyr-7b-beta", name: "Zephyr 7B Beta", provider: "huggingface" },
  { id: "google/gemma-2-9b-it", name: "Gemma 2 9B IT", provider: "huggingface" },
];

/** Curated list of popular HuggingFace image models. */
const HF_IMAGE_MODELS: ImageModel[] = [
  {
    id: "stabilityai/stable-diffusion-xl-base-1.0",
    name: "Stable Diffusion XL Base 1.0",
    provider: "huggingface",
    supportedTasks: ["text_to_image"],
  },
  {
    id: "runwayml/stable-diffusion-v1-5",
    name: "Stable Diffusion v1.5",
    provider: "huggingface",
    supportedTasks: ["text_to_image"],
  },
  {
    id: "black-forest-labs/FLUX.1-schnell",
    name: "FLUX.1 Schnell",
    provider: "huggingface",
    supportedTasks: ["text_to_image"],
  },
];

/** Curated list of popular HuggingFace TTS models. */
const HF_TTS_MODELS: TTSModel[] = [
  {
    id: "facebook/mms-tts-eng",
    name: "MMS TTS English",
    provider: "huggingface",
  },
  {
    id: "espnet/kan-bayashi_ljspeech_vits",
    name: "VITS LJSpeech",
    provider: "huggingface",
  },
];

interface HuggingFaceProviderOptions {
  /** Override for testing — inject a mock HfInference instance. */
  hfClient?: any;
}

function extractTextContent(content: string | MessageContent[] | null | undefined): string {
  if (typeof content === "string") return content;
  if (!content) return "";
  return content
    .filter((c): c is MessageTextContent => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

export class HuggingFaceProvider extends BaseProvider {
  static override requiredSecrets(): string[] {
    return ["HF_TOKEN"];
  }

  private readonly _apiKey: string;
  private _hfClient: any = null;

  constructor(
    secrets: { HF_TOKEN?: string },
    options: HuggingFaceProviderOptions = {}
  ) {
    super("huggingface");
    const apiKey = secrets.HF_TOKEN;
    if (!apiKey) {
      throw new Error("HF_TOKEN is required");
    }
    this._apiKey = apiKey;
    if (options.hfClient) {
      this._hfClient = options.hfClient;
    }
  }

  get apiKey(): string {
    return this._apiKey;
  }

  override getContainerEnv(): Record<string, string> {
    return { HF_TOKEN: this._apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return false;
  }

  private async getClient(): Promise<any> {
    if (!this._hfClient) {
      this._hfClient = await getHfInference(this._apiKey);
    }
    return this._hfClient;
  }

  override async generateMessage(args: {
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
    const client = await this.getClient();

    const hfMessages = args.messages.map((m) => ({
      role: m.role === "tool" ? "user" : m.role,
      content: extractTextContent(m.content),
    }));

    log.debug("HuggingFace chatCompletion", { model: args.model });

    const response = await client.chatCompletion({
      model: args.model,
      messages: hfMessages,
      max_tokens: args.maxTokens ?? 4096,
      ...(args.temperature != null ? { temperature: args.temperature } : {}),
      ...(args.topP != null ? { top_p: args.topP } : {}),
    });

    const choice = response?.choices?.[0];
    if (!choice) {
      throw new Error("HuggingFace returned no choices");
    }

    const usage = response.usage;
    if (usage) {
      this.trackUsage(args.model, {
        inputTokens: usage.prompt_tokens ?? 0,
        outputTokens: usage.completion_tokens ?? 0,
      });
    }

    return {
      role: "assistant",
      content: choice.message?.content ?? null,
    };
  }

  override async *generateMessages(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    toolChoice?: string | "any";
    maxTokens?: number;
    responseFormat?: Record<string, unknown>;
    jsonSchema?: Record<string, unknown>;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    audio?: Record<string, unknown>;
  }): AsyncGenerator<ProviderStreamItem> {
    const client = await this.getClient();

    const hfMessages = args.messages.map((m) => ({
      role: m.role === "tool" ? "user" : m.role,
      content: extractTextContent(m.content),
    }));

    log.debug("HuggingFace chatCompletionStream", { model: args.model });

    const stream = client.chatCompletionStream({
      model: args.model,
      messages: hfMessages,
      max_tokens: args.maxTokens ?? 4096,
      ...(args.temperature != null ? { temperature: args.temperature } : {}),
      ...(args.topP != null ? { top_p: args.topP } : {}),
    });

    for await (const chunk of stream) {
      const choice = chunk?.choices?.[0];
      if (!choice) continue;

      const delta = choice.delta;

      if (delta?.content !== undefined || choice.finish_reason === "stop") {
        const item: Chunk = {
          type: "chunk",
          content: String(delta?.content ?? ""),
          done: choice.finish_reason === "stop",
        };
        yield item;
      }
    }
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    if (!params.prompt) {
      throw new Error("The input prompt cannot be empty.");
    }

    const client = await this.getClient();

    log.debug("HuggingFace textToImage", { model: params.model.id });

    const request: Record<string, unknown> = {
      model: params.model.id,
      inputs: params.prompt,
    };

    if (params.negativePrompt) {
      request.parameters = {
        ...(request.parameters as Record<string, unknown> ?? {}),
        negative_prompt: params.negativePrompt,
      };
    }
    if (params.guidanceScale != null) {
      request.parameters = {
        ...(request.parameters as Record<string, unknown> ?? {}),
        guidance_scale: params.guidanceScale,
      };
    }
    if (params.numInferenceSteps != null) {
      request.parameters = {
        ...(request.parameters as Record<string, unknown> ?? {}),
        num_inference_steps: params.numInferenceSteps,
      };
    }
    if (params.width) {
      request.parameters = {
        ...(request.parameters as Record<string, unknown> ?? {}),
        width: params.width,
      };
    }
    if (params.height) {
      request.parameters = {
        ...(request.parameters as Record<string, unknown> ?? {}),
        height: params.height,
      };
    }

    const result = await client.textToImage(request);

    // Result can be a Blob or ArrayBuffer
    if (result instanceof Uint8Array) {
      return result;
    }
    if (result instanceof ArrayBuffer) {
      return new Uint8Array(result);
    }
    if (typeof result?.arrayBuffer === "function") {
      return new Uint8Array(await result.arrayBuffer());
    }

    throw new Error("HuggingFace textToImage returned unexpected result type");
  }

  override async *textToSpeech(args: {
    text: string;
    model: string;
    voice?: string;
    speed?: number;
  }): AsyncGenerator<StreamingAudioChunk> {
    if (!args.text) {
      throw new Error("text must not be empty");
    }

    const client = await this.getClient();

    log.debug("HuggingFace textToSpeech", { model: args.model });

    const result = await client.textToSpeech({
      model: args.model,
      inputs: args.text,
    });

    let bytes: Uint8Array;
    if (result instanceof Uint8Array) {
      bytes = result;
    } else if (result instanceof ArrayBuffer) {
      bytes = new Uint8Array(result);
    } else if (typeof result?.arrayBuffer === "function") {
      bytes = new Uint8Array(await result.arrayBuffer());
    } else {
      throw new Error("HuggingFace textToSpeech returned unexpected result type");
    }

    // Assume 16-bit PCM samples
    const aligned = bytes.length % 2 === 0 ? bytes : bytes.slice(0, bytes.length - 1);
    const samples = new Int16Array(aligned.buffer, aligned.byteOffset, aligned.byteLength / 2);
    yield { samples };
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return HF_LANGUAGE_MODELS;
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return HF_IMAGE_MODELS;
  }

  override async getAvailableTTSModels(): Promise<TTSModel[]> {
    return HF_TTS_MODELS;
  }
}
