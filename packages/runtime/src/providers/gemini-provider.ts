import type { Chunk } from "@nodetool/protocol";
import { createLogger } from "@nodetool/config";
import { BaseProvider } from "./base-provider.js";

const log = createLogger("nodetool.runtime.providers.gemini");
import type {
  ASRModel,
  EmbeddingModel,
  ImageModel,
  ImageToImageParams,
  ImageToVideoParams,
  LanguageModel,
  Message,
  MessageContent,
  MessageAudioContent,
  MessageImageContent,
  MessageTextContent,
  ProviderStreamItem,
  ProviderTool,
  StreamingAudioChunk,
  TextToImageParams,
  TextToVideoParams,
  ToolCall,
  TTSModel,
  VideoModel
} from "./types.js";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

interface GeminiProviderOptions {
  fetchFn?: typeof fetch;
}

/** A Gemini content part. */
interface GeminiPart {
  text?: string;
  thought?: boolean;
  inlineData?: { mimeType: string; data: string };
  functionCall?: {
    name: string;
    args?: Record<string, unknown>;
  };
  functionResponse?: { name: string; response: unknown };
  /** Thought signature — at part level, camelCase per Gemini API. */
  thoughtSignature?: string;
}

/** A Gemini content entry (role + parts). */
interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

/** Shape of Gemini generateContent / streamGenerateContent request body. */
interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: { parts: Array<{ text: string }> };
  tools?: Array<{ functionDeclarations: Array<Record<string, unknown>> }>;
  generationConfig?: Record<string, unknown>;
}

/** A single candidate in a Gemini response. */
interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
  finishReason?: string;
}

/** Top-level Gemini response shape. */
interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: { message?: string };
}

/** Shape of a model entry from the Gemini models list API. */
interface GeminiModelEntry {
  name?: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
}

function sanitizeToolName(name: string): string {
  let sanitized = (name ?? "").trim();
  sanitized = sanitized.replace(/[^a-zA-Z0-9_.:-]/g, "_");
  sanitized = sanitized.replace(/_+/g, "_");
  if (!sanitized) sanitized = "_tool";
  if (!/^[a-zA-Z_]/.test(sanitized)) sanitized = `_${sanitized}`;
  if (sanitized.length > 64) sanitized = sanitized.slice(0, 64);
  if (!sanitized) sanitized = "_tool";
  return sanitized;
}

export class GeminiProvider extends BaseProvider {
  static requiredSecrets(): string[] {
    return ["GEMINI_API_KEY"];
  }

  readonly apiKey: string;
  private _fetch: typeof fetch;

  constructor(
    secrets: { GEMINI_API_KEY?: string },
    options: GeminiProviderOptions = {}
  ) {
    super("gemini");

    const apiKey = secrets.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is required");
    }

    this.apiKey = apiKey;
    this._fetch = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  getContainerEnv(): Record<string, string> {
    return { GEMINI_API_KEY: this.apiKey };
  }

  async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  // ---------------------------------------------------------------------------
  // Model listing
  // ---------------------------------------------------------------------------

  async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const url = `${GEMINI_API_BASE}/models?key=${this.apiKey}`;

    let response: Response;
    try {
      response = await this._fetch(url);
    } catch {
      return [];
    }

    if (!response.ok) return [];

    const payload = (await response.json()) as { models?: GeminiModelEntry[] };
    const items = payload.models ?? [];

    return items
      .filter((m) =>
        (m.supportedGenerationMethods ?? []).includes("generateContent")
      )
      .filter((m) => !!m.name)
      .map((m) => {
        const id = (m.name as string).split("/").pop() as string;
        return {
          id,
          name: m.displayName ?? id,
          provider: "gemini"
        };
      });
  }

  // ---------------------------------------------------------------------------
  // Message conversion helpers
  // ---------------------------------------------------------------------------

  private async messageContentToGeminiPart(
    content: MessageContent
  ): Promise<GeminiPart> {
    if (content.type === "text") {
      return { text: (content as MessageTextContent).text };
    }

    if (content.type === "image") {
      const img = (content as MessageImageContent).image;
      let base64Data: string;
      let mimeType = img.mimeType ?? "image/jpeg";

      if (img.data) {
        if (typeof img.data === "string") {
          base64Data = img.data;
        } else {
          base64Data = Buffer.from(img.data).toString("base64");
        }
      } else if (img.uri) {
        if (img.uri.startsWith("data:")) {
          const idx = img.uri.indexOf(",");
          const header = img.uri.slice(5, idx);
          mimeType = header.split(";")[0] || mimeType;
          base64Data = img.uri.slice(idx + 1);
        } else {
          const resp = await this._fetch(img.uri);
          if (!resp.ok)
            throw new Error(`Failed to fetch image: ${resp.status}`);
          mimeType = resp.headers.get("content-type") ?? mimeType;
          base64Data = Buffer.from(await resp.arrayBuffer()).toString("base64");
        }
      } else {
        base64Data = "";
      }

      return { inlineData: { mimeType, data: base64Data } };
    }

    if (content.type === "audio") {
      const aud = (content as MessageAudioContent).audio;
      let base64Data: string;
      let mimeType = aud.mimeType ?? "audio/mp3";

      if (aud.data) {
        if (typeof aud.data === "string") {
          base64Data = aud.data;
        } else {
          base64Data = Buffer.from(aud.data).toString("base64");
        }
      } else if (aud.uri) {
        if (aud.uri.startsWith("data:")) {
          const idx = aud.uri.indexOf(",");
          const header = aud.uri.slice(5, idx);
          mimeType = header.split(";")[0] || mimeType;
          base64Data = aud.uri.slice(idx + 1);
        } else {
          const resp = await this._fetch(aud.uri);
          if (!resp.ok)
            throw new Error(`Failed to fetch audio: ${resp.status}`);
          mimeType = resp.headers.get("content-type") ?? mimeType;
          base64Data = Buffer.from(await resp.arrayBuffer()).toString("base64");
        }
      } else {
        base64Data = "";
      }

      return { inlineData: { mimeType, data: base64Data } };
    }

    return { text: "[unsupported content type]" };
  }

  /**
   * Convert our Message array into Gemini contents + optional system instruction.
   */
  async convertMessages(
    messages: Message[]
  ): Promise<{ contents: GeminiContent[]; systemInstruction?: string }> {
    let systemInstruction: string | undefined;
    const contents: GeminiContent[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        systemInstruction =
          typeof msg.content === "string"
            ? msg.content
            : (msg.content ?? [])
                .filter((c): c is MessageTextContent => c.type === "text")
                .map((c) => c.text)
                .join(" ");
        continue;
      }

      if (msg.role === "tool") {
        // Tool result → model role with functionResponse part
        const responseText =
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content);

        contents.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: msg.toolCallId ?? "unknown",
                response: { result: responseText }
              }
            }
          ]
        });
        continue;
      }

      if (msg.role === "assistant") {
        // If we have raw Gemini parts (with thought content), replay them exactly
        if (msg._rawGeminiParts && Array.isArray(msg._rawGeminiParts)) {
          contents.push({
            role: "model",
            parts: msg._rawGeminiParts as GeminiPart[]
          });
          continue;
        }

        const parts: GeminiPart[] = [];

        // Tool calls
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const tc of msg.toolCalls) {
            const part: GeminiPart = {
              functionCall: { name: tc.name, args: tc.args }
            };
            if (tc.thought_signature) {
              part.thoughtSignature = tc.thought_signature;
            }
            parts.push(part);
          }
        }

        // Text / content
        if (typeof msg.content === "string" && msg.content) {
          parts.push({ text: msg.content });
        } else if (Array.isArray(msg.content)) {
          for (const c of msg.content) {
            parts.push(await this.messageContentToGeminiPart(c));
          }
        }

        if (parts.length > 0) {
          contents.push({ role: "model", parts });
        }
        continue;
      }

      // user
      const parts: GeminiPart[] = [];
      if (typeof msg.content === "string") {
        parts.push({ text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const c of msg.content) {
          parts.push(await this.messageContentToGeminiPart(c));
        }
      }
      if (parts.length > 0) {
        contents.push({ role: "user", parts });
      }
    }

    return { contents, systemInstruction };
  }

  formatTools(tools: ProviderTool[]): {
    geminiTools: Array<{
      functionDeclarations: Array<Record<string, unknown>>;
    }>;
    nameMap: Map<string, string>;
    reverseMap: Map<string, string>;
  } {
    const nameMap = new Map<string, string>();
    const reverseMap = new Map<string, string>();
    const usedNames = new Set<string>();
    const declarations: Array<Record<string, unknown>> = [];

    for (const tool of tools) {
      const original = tool.name;
      let unique = sanitizeToolName(original);

      let suffix = 2;
      while (usedNames.has(unique)) {
        const sfx = `_${suffix}`;
        unique = `${sanitizeToolName(original).slice(0, 64 - sfx.length)}${sfx}`;
        suffix++;
      }

      usedNames.add(unique);
      nameMap.set(original, unique);
      reverseMap.set(unique, original);

      declarations.push({
        name: unique,
        description: tool.description ?? "",
        parameters: tool.inputSchema ?? { type: "object", properties: {} }
      });
    }

    return {
      geminiTools:
        declarations.length > 0 ? [{ functionDeclarations: declarations }] : [],
      nameMap,
      reverseMap
    };
  }

  // ---------------------------------------------------------------------------
  // Non-streaming generation
  // ---------------------------------------------------------------------------

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
    const {
      model,
      tools = [],
      maxTokens = 16384,
      responseFormat,
      jsonSchema,
      temperature,
      topP
    } = args;

    const { contents, systemInstruction } = await this.convertMessages(
      args.messages
    );
    const { geminiTools, reverseMap } = this.formatTools(tools);

    const body: GeminiRequest = { contents };

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    if (geminiTools.length > 0) {
      body.tools = geminiTools;
    }

    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: maxTokens
    };
    if (temperature != null) generationConfig.temperature = temperature;
    if (topP != null) generationConfig.topP = topP;
    if (responseFormat || jsonSchema) {
      generationConfig.responseMimeType = "application/json";
      if (jsonSchema) generationConfig.responseSchema = jsonSchema;
    }
    body.generationConfig = generationConfig;

    log.debug("Gemini request", { model });

    const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${this.apiKey}`;
    const response = await this._fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await response.text();
      log.error("Gemini request failed", {
        model,
        error: `${response.status}: ${text.slice(0, 200)}`
      });
      throw new Error(`Gemini API error ${response.status}: ${text}`);
    }

    const data = (await response.json()) as GeminiResponse;

    if (data.error) {
      throw new Error(`Gemini API error: ${data.error.message}`);
    }

    const candidate = data.candidates?.[0];
    if (!candidate?.content?.parts) {
      throw new Error("Gemini returned no candidates");
    }

    return this.extractMessage(candidate.content.parts, reverseMap);
  }

  // ---------------------------------------------------------------------------
  // Streaming generation
  // ---------------------------------------------------------------------------

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
    const { model, tools = [], maxTokens = 16384, temperature, topP } = args;

    const { contents, systemInstruction } = await this.convertMessages(
      args.messages
    );
    const { geminiTools, reverseMap } = this.formatTools(tools);

    const body: GeminiRequest = { contents };

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    if (geminiTools.length > 0) {
      body.tools = geminiTools;
    }

    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: maxTokens
    };
    if (temperature != null) generationConfig.temperature = temperature;
    if (topP != null) generationConfig.topP = topP;
    body.generationConfig = generationConfig;

    log.debug("Gemini request", { model });

    const url = `${GEMINI_API_BASE}/models/${model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;
    const response = await this._fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await response.text();
      log.error("Gemini request failed", {
        model,
        error: `${response.status}: ${text.slice(0, 200)}`
      });
      throw new Error(`Gemini API error ${response.status}: ${text}`);
    }

    if (!response.body) {
      throw new Error("Gemini streaming response has no body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // Accumulate all parts across SSE events for raw replay.
    // Gemini thinking models emit thought parts and function calls across
    // separate SSE events, but they must all be sent back together.
    const allParts: GeminiPart[] = [];
    const pendingToolCalls: ToolCall[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === "[DONE]") continue;

          let event: GeminiResponse;
          try {
            event = JSON.parse(jsonStr) as GeminiResponse;
          } catch {
            continue;
          }

          const parts = event.candidates?.[0]?.content?.parts;
          if (!parts) continue;

          for (const part of parts) {
            allParts.push(part);

            if (part.text !== undefined && !part.thought) {
              const chunk: Chunk = {
                type: "chunk",
                content: part.text,
                done: false
              };
              yield chunk;
            } else if (part.functionCall) {
              const originalName =
                reverseMap.get(part.functionCall.name) ??
                part.functionCall.name;
              const toolCall: ToolCall = {
                id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                name: originalName,
                args: part.functionCall.args ?? {}
              };
              if (part.thoughtSignature) {
                toolCall.thought_signature = part.thoughtSignature;
              }
              pendingToolCalls.push(toolCall);
            }
            // Thought text parts are silently accumulated in allParts
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Attach accumulated raw parts to tool calls for thought replay
    const hasThoughts = allParts.some((p) => p.thought);
    for (const tc of pendingToolCalls) {
      if (hasThoughts) {
        tc._rawGeminiParts = allParts;
      }
      yield tc;
    }

    // Emit synthetic done chunk
    const doneChunk: Chunk = {
      type: "chunk",
      content: "",
      done: true
    };
    yield doneChunk;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private extractMessage(
    parts: GeminiPart[],
    reverseMap: Map<string, string>
  ): Message {
    const textParts: string[] = [];
    const toolCalls: ToolCall[] = [];

    for (const part of parts) {
      if (part.text !== undefined) {
        textParts.push(part.text);
      } else if (part.functionCall) {
        const originalName =
          reverseMap.get(part.functionCall.name) ?? part.functionCall.name;
        const tc: ToolCall = {
          id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: originalName,
          args: part.functionCall.args ?? {}
        };
        if (part.thoughtSignature) {
          tc.thought_signature = part.thoughtSignature;
        }
        toolCalls.push(tc);
      }
    }

    const hasThoughts = parts.some((p) => p.thought);
    const msg: Message = {
      role: "assistant",
      content: textParts.join("") || null,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined
    };
    if (hasThoughts) {
      msg._rawGeminiParts = parts;
    }
    return msg;
  }

  // ---------------------------------------------------------------------------
  // Model listing — image, TTS, ASR, video, embedding
  // ---------------------------------------------------------------------------

  async getAvailableImageModels(): Promise<ImageModel[]> {
    return [
      {
        id: "gemini-2.0-flash-preview-image-generation",
        name: "Gemini 2.0 Flash Image Gen",
        provider: "gemini"
      },
      { id: "imagen-3.0-generate-002", name: "Imagen 3.0", provider: "gemini" }
    ];
  }

  async getAvailableTTSModels(): Promise<TTSModel[]> {
    const voices = [
      "Zephyr",
      "Puck",
      "Charon",
      "Kore",
      "Fenrir",
      "Leda",
      "Orus",
      "Aoede",
      "Callirrhoe",
      "Autonoe",
      "Enceladus",
      "Iapetus",
      "Umbriel",
      "Algieba",
      "Despina",
      "Erinome",
      "Algenib",
      "Rasalgethi",
      "Laomedeia",
      "Achernar",
      "Alnilam",
      "Schedar",
      "Gacrux",
      "Pulcherrima",
      "Achird",
      "Zubenelgenubi",
      "Vindemiatrix",
      "Sadachbia",
      "Sadaltager",
      "Sulafat"
    ];
    return [
      {
        id: "gemini-2.5-pro-preview-tts",
        name: "Gemini 2.5 Pro TTS",
        provider: "gemini",
        voices
      }
    ];
  }

  async getAvailableASRModels(): Promise<ASRModel[]> {
    return [
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "gemini" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "gemini" }
    ];
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return [
      {
        id: "veo-3.1-generate-preview",
        name: "Veo 3.1 Preview",
        provider: "gemini"
      },
      { id: "veo-2.0-generate-001", name: "Veo 2.0", provider: "gemini" }
    ];
  }

  async getAvailableEmbeddingModels(): Promise<EmbeddingModel[]> {
    return [
      {
        id: "text-embedding-004",
        name: "Text Embedding 004",
        provider: "gemini",
        dimensions: 768
      },
      {
        id: "gemini-embedding-001",
        name: "Gemini Embedding 001",
        provider: "gemini",
        dimensions: 3072
      }
    ];
  }

  // ---------------------------------------------------------------------------
  // Embeddings
  // ---------------------------------------------------------------------------

  override async generateEmbedding(args: {
    text: string | string[];
    model: string;
    dimensions?: number;
  }): Promise<number[][]> {
    const { text, model, dimensions } = args;
    if (!text || (Array.isArray(text) && text.length === 0)) {
      throw new Error("text must not be empty");
    }

    const texts = typeof text === "string" ? [text] : text;

    // Gemini embedContent supports a single content; batch by calling per text
    const embeddings: number[][] = [];
    for (const t of texts) {
      const body: Record<string, unknown> = {
        content: { parts: [{ text: t }] }
      };
      if (dimensions) {
        body.outputDimensionality = dimensions;
      }

      const url = `${GEMINI_API_BASE}/models/${model}:embedContent?key=${this.apiKey}`;
      const response = await this._fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(
          `Gemini embedding error ${response.status}: ${errText}`
        );
      }

      const data = (await response.json()) as {
        embedding?: { values?: number[] };
      };
      if (!data.embedding?.values) {
        throw new Error("No embedding returned from Gemini API");
      }
      embeddings.push(data.embedding.values);
    }

    return embeddings;
  }

  // ---------------------------------------------------------------------------
  // Text-to-image
  // ---------------------------------------------------------------------------

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    if (!params.prompt) {
      throw new Error("The input prompt cannot be empty.");
    }

    const modelId = params.model.id;

    if (modelId.startsWith("gemini-")) {
      // Use generateContent with IMAGE response modality
      const body = {
        contents: [{ role: "user" as const, parts: [{ text: params.prompt }] }],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"]
        }
      };

      const url = `${GEMINI_API_BASE}/models/${modelId}:generateContent?key=${this.apiKey}`;
      const response = await this._fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(
          `Gemini text-to-image failed ${response.status}: ${errText}`
        );
      }

      const data = (await response.json()) as GeminiResponse;
      const parts = data.candidates?.[0]?.content?.parts;
      if (!parts) throw new Error("No candidates in response");

      for (const part of parts) {
        if (part.inlineData?.data) {
          return Uint8Array.from(Buffer.from(part.inlineData.data, "base64"));
        }
      }
      throw new Error("No image data returned in response");
    }

    // Imagen models use generateImages endpoint
    const body: Record<string, unknown> = {
      instances: [{ prompt: params.prompt }],
      parameters: { sampleCount: 1 }
    };

    const url = `${GEMINI_API_BASE}/models/${modelId}:generateImages?key=${this.apiKey}`;
    const response = await this._fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(
        `Gemini image generation failed ${response.status}: ${errText}`
      );
    }

    const data = (await response.json()) as {
      predictions?: Array<{ bytesBase64Encoded?: string }>;
      generatedImages?: Array<{ image?: { imageBytes?: string } }>;
    };

    // Try predictions format first (Vertex-style), then generatedImages
    const b64 =
      data.predictions?.[0]?.bytesBase64Encoded ??
      data.generatedImages?.[0]?.image?.imageBytes;

    if (!b64) throw new Error("No image data in response");
    return Uint8Array.from(Buffer.from(b64, "base64"));
  }

  // ---------------------------------------------------------------------------
  // Image-to-image
  // ---------------------------------------------------------------------------

  override async imageToImage(
    image: Uint8Array,
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    if (!params.prompt) {
      throw new Error("The input prompt cannot be empty.");
    }

    const modelId = params.model.id;
    if (!modelId.startsWith("gemini-")) {
      throw new Error(
        `Model ${modelId} does not support image-to-image. Only gemini-* models supported.`
      );
    }

    const imageBase64 = Buffer.from(image).toString("base64");

    const body = {
      contents: [
        {
          role: "user" as const,
          parts: [
            { text: params.prompt },
            { inlineData: { mimeType: "image/png", data: imageBase64 } }
          ]
        }
      ],
      generationConfig: {
        responseModalities: ["IMAGE", "TEXT"]
      }
    };

    const url = `${GEMINI_API_BASE}/models/${modelId}:generateContent?key=${this.apiKey}`;
    const response = await this._fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(
        `Gemini image-to-image failed ${response.status}: ${errText}`
      );
    }

    const data = (await response.json()) as GeminiResponse;
    const parts = data.candidates?.[0]?.content?.parts;
    if (!parts) throw new Error("No candidates in response");

    for (const part of parts) {
      if (part.inlineData?.data) {
        return Uint8Array.from(Buffer.from(part.inlineData.data, "base64"));
      }
    }
    throw new Error("No image data returned in response");
  }

  // ---------------------------------------------------------------------------
  // Text-to-speech
  // ---------------------------------------------------------------------------

  override async *textToSpeech(args: {
    text: string;
    model: string;
    voice?: string;
    speed?: number;
  }): AsyncGenerator<StreamingAudioChunk> {
    const { text, model, voice = "Puck" } = args;

    const body = {
      contents: [{ role: "user" as const, parts: [{ text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice }
          }
        }
      }
    };

    const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${this.apiKey}`;
    const response = await this._fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini TTS failed ${response.status}: ${errText}`);
    }

    const data = (await response.json()) as GeminiResponse;
    const parts = data.candidates?.[0]?.content?.parts;
    if (!parts) throw new Error("No audio in response");

    for (const part of parts) {
      if (part.inlineData?.data) {
        const raw = Buffer.from(part.inlineData.data, "base64");
        // Gemini TTS returns raw PCM int16 at 24kHz
        const samples = new Int16Array(
          raw.buffer,
          raw.byteOffset,
          raw.byteLength / 2
        );
        yield { samples };
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Automatic speech recognition
  // ---------------------------------------------------------------------------

  override async automaticSpeechRecognition(args: {
    audio: Uint8Array;
    model: string;
    language?: string;
    prompt?: string;
    temperature?: number;
  }): Promise<string> {
    const { audio, model, language, temperature = 0 } = args;

    if (!audio || audio.length === 0) {
      throw new Error("audio must not be empty");
    }

    // Detect MIME type from audio header
    let mimeType = "audio/wav";
    if (
      audio[0] === 0x52 &&
      audio[1] === 0x49 &&
      audio[2] === 0x46 &&
      audio[3] === 0x46
    ) {
      mimeType = "audio/wav"; // RIFF
    } else if (audio[0] === 0x49 && audio[1] === 0x44 && audio[2] === 0x33) {
      mimeType = "audio/mp3"; // ID3
    } else if (audio[0] === 0xff && (audio[1] === 0xfb || audio[1] === 0xf3)) {
      mimeType = "audio/mp3"; // MPEG sync
    } else if (
      audio[0] === 0x66 &&
      audio[1] === 0x4c &&
      audio[2] === 0x61 &&
      audio[3] === 0x43
    ) {
      mimeType = "audio/flac"; // fLaC
    } else if (
      audio[0] === 0x4f &&
      audio[1] === 0x67 &&
      audio[2] === 0x67 &&
      audio[3] === 0x53
    ) {
      mimeType = "audio/ogg"; // OggS
    }

    let promptText = args.prompt ?? "Transcribe this audio to text.";
    if (language) {
      promptText = `${promptText} The audio is in ${language}.`;
    }

    const audioBase64 = Buffer.from(audio).toString("base64");

    const body = {
      contents: [
        {
          role: "user" as const,
          parts: [
            { inlineData: { mimeType, data: audioBase64 } },
            { text: promptText }
          ]
        }
      ],
      generationConfig: {
        temperature
      }
    };

    const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${this.apiKey}`;
    const response = await this._fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini ASR failed ${response.status}: ${errText}`);
    }

    const data = (await response.json()) as GeminiResponse;
    const parts = data.candidates?.[0]?.content?.parts;
    if (!parts) return "";

    return parts
      .filter((p) => p.text !== undefined)
      .map((p) => p.text!)
      .join("");
  }

  // ---------------------------------------------------------------------------
  // Text-to-video (Veo models — async operation with polling)
  // ---------------------------------------------------------------------------

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    if (!params.prompt) {
      throw new Error("The input prompt cannot be empty.");
    }

    const modelId = params.model.id;
    if (!modelId.startsWith("veo-")) {
      throw new Error(
        `Model ${modelId} is not a Veo model. Only Veo models support text-to-video.`
      );
    }

    const body: Record<string, unknown> = {
      instances: [{ prompt: params.prompt }]
    };
    const parameters: Record<string, unknown> = {};
    if (params.negativePrompt)
      parameters.negativePrompt = params.negativePrompt;
    if (params.aspectRatio) parameters.aspectRatio = params.aspectRatio;
    if (params.seed != null) parameters.seed = params.seed;
    if (Object.keys(parameters).length > 0) body.parameters = parameters;

    // Initiate async generation
    const url = `${GEMINI_API_BASE}/models/${modelId}:generateVideos?key=${this.apiKey}`;
    const response = await this._fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(
        `Gemini video generation failed ${response.status}: ${errText}`
      );
    }

    const operation = (await response.json()) as {
      name?: string;
      done?: boolean;
      response?: {
        generatedVideos?: Array<{ video?: { uri?: string } }>;
      };
    };

    // Poll for completion
    const maxWait = 600_000; // 10 minutes
    const pollInterval = 10_000;
    let elapsed = 0;
    let current = operation;

    while (!current.done && elapsed < maxWait) {
      await new Promise((r) => setTimeout(r, pollInterval));
      elapsed += pollInterval;

      if (!current.name) throw new Error("No operation name for polling");
      const pollUrl = `${GEMINI_API_BASE}/${current.name}?key=${this.apiKey}`;
      const pollResp = await this._fetch(pollUrl);
      if (!pollResp.ok) {
        const errText = await pollResp.text();
        throw new Error(`Poll failed ${pollResp.status}: ${errText}`);
      }
      current = (await pollResp.json()) as typeof operation;
    }

    if (!current.done) throw new Error("Video generation timed out");

    const videoUri = current.response?.generatedVideos?.[0]?.video?.uri;
    if (!videoUri) throw new Error("No video URI in response");

    // Download the video
    const dlResp = await this._fetch(`${videoUri}&key=${this.apiKey}`);
    if (!dlResp.ok) throw new Error(`Video download failed: ${dlResp.status}`);
    return new Uint8Array(await dlResp.arrayBuffer());
  }

  // ---------------------------------------------------------------------------
  // Image-to-video (Veo models)
  // ---------------------------------------------------------------------------

  override async imageToVideo(
    image: Uint8Array,
    params: ImageToVideoParams
  ): Promise<Uint8Array> {
    if (!image || image.length === 0) {
      throw new Error("Input image cannot be empty.");
    }

    const modelId = params.model.id;
    if (!modelId.startsWith("veo-")) {
      throw new Error(
        `Model ${modelId} is not a Veo model. Only Veo models support image-to-video.`
      );
    }

    const imageBase64 = Buffer.from(image).toString("base64");
    const prompt = params.prompt ?? "Animate this image";

    const body: Record<string, unknown> = {
      instances: [
        {
          prompt,
          image: { bytesBase64Encoded: imageBase64, mimeType: "image/png" }
        }
      ]
    };
    const parameters: Record<string, unknown> = {};
    if (params.negativePrompt)
      parameters.negativePrompt = params.negativePrompt;
    if (params.aspectRatio) parameters.aspectRatio = params.aspectRatio;
    if (params.seed != null) parameters.seed = params.seed;
    if (Object.keys(parameters).length > 0) body.parameters = parameters;

    const url = `${GEMINI_API_BASE}/models/${modelId}:generateVideos?key=${this.apiKey}`;
    const response = await this._fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(
        `Gemini image-to-video failed ${response.status}: ${errText}`
      );
    }

    const operation = (await response.json()) as {
      name?: string;
      done?: boolean;
      response?: {
        generatedVideos?: Array<{ video?: { uri?: string } }>;
      };
    };

    // Poll for completion
    const maxWait = 600_000;
    const pollInterval = 10_000;
    let elapsed = 0;
    let current = operation;

    while (!current.done && elapsed < maxWait) {
      await new Promise((r) => setTimeout(r, pollInterval));
      elapsed += pollInterval;

      if (!current.name) throw new Error("No operation name for polling");
      const pollUrl = `${GEMINI_API_BASE}/${current.name}?key=${this.apiKey}`;
      const pollResp = await this._fetch(pollUrl);
      if (!pollResp.ok) {
        const errText = await pollResp.text();
        throw new Error(`Poll failed ${pollResp.status}: ${errText}`);
      }
      current = (await pollResp.json()) as typeof operation;
    }

    if (!current.done) throw new Error("Image-to-video generation timed out");

    const videoUri = current.response?.generatedVideos?.[0]?.video?.uri;
    if (!videoUri) throw new Error("No video URI in response");

    const dlResp = await this._fetch(`${videoUri}&key=${this.apiKey}`);
    if (!dlResp.ok) throw new Error(`Video download failed: ${dlResp.status}`);
    return new Uint8Array(await dlResp.arrayBuffer());
  }

  // ---------------------------------------------------------------------------
  // Error detection
  // ---------------------------------------------------------------------------

  isContextLengthError(error: unknown): boolean {
    const msg = String(error).toLowerCase();
    return (
      msg.includes("context length") ||
      msg.includes("maximum context") ||
      msg.includes("too long") ||
      msg.includes("token limit")
    );
  }
}
