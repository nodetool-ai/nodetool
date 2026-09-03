/**
 * NodeTool's own managed models — the provider behind the credits product.
 *
 * Every model in the curated catalog (`NODETOOL_MODELS` in
 * `@nodetool-ai/protocol`) names a delegate provider + model; this provider
 * runs the delegate on *platform-owned* keys (`NODETOOL_PLATFORM_FAL_KEY`,
 * `NODETOOL_PLATFORM_ANTHROPIC_KEY`) rather than the user's. That split is
 * the whole billing model: calls through `nodetool` are metered against the
 * user's credit balance server-side, while BYOK providers keep running on the
 * user's own keys, unmetered.
 *
 * Cost is accounted at the delegate's price: each call absorbs the inner
 * provider's cost delta into this instance, so the host's prediction logging
 * records real USD under provider "nodetool".
 *
 * A model is served only when it is both **funded** (the delegate's platform
 * key is set) and **allowed** (`NODETOOL_CREDIT_MODELS` names it, or names
 * nothing at all). The listers hide what fails either test and `delegateFor`
 * refuses it, so a whitelist an operator narrows can never be spent past by a
 * client holding a stale menu.
 */
import {
  NODETOOL_MODELS,
  nodetoolModelById,
  type NodetoolModelDef,
  type NodetoolModelKind
} from "@nodetool-ai/protocol";
import { isCreditModelAllowed } from "@nodetool-ai/config";
import { BaseProvider, type ProviderCapability } from "./base-provider.js";
import type {
  EncodedAudioResult,
  ImageModel,
  ImageToImageParams,
  ImageToVideoParams,
  LanguageModel,
  Message,
  ProviderStreamItem,
  TextToImageParams,
  TextToVideoParams,
  TTSModel,
  VideoModel
} from "./types.js";
import { FalProvider } from "./fal-provider.js";
import { AnthropicProvider } from "./anthropic-provider.js";
import { isNonEmptyString } from "../type-predicates.js";

const PLATFORM_KEYS: Record<string, string> = {
  fal_ai: "NODETOOL_PLATFORM_FAL_KEY",
  anthropic: "NODETOOL_PLATFORM_ANTHROPIC_KEY"
};

export class NodetoolProvider extends BaseProvider {
  private secrets: Record<string, unknown>;
  private _absorbedCost = 0;

  static override requiredSecrets(): string[] {
    return [];
  }

  constructor(secrets: Record<string, unknown> = {}) {
    super("nodetool");
    this.secrets = secrets;
  }

  private platformKey(delegateProvider: string): string | null {
    const keyName = PLATFORM_KEYS[delegateProvider];
    const value = keyName ? this.secrets[keyName] : null;
    return isNonEmptyString(value) ? value : null;
  }

  private isFunded(delegateProvider: string): boolean {
    return this.platformKey(delegateProvider) != null;
  }

  /** Funded by a platform key and whitelisted for spend on this server. */
  private isServable(def: NodetoolModelDef): boolean {
    return this.isFunded(def.delegate.provider) && isCreditModelAllowed(def.id);
  }

  /**
   * The delegate serving a nodetool model id, constructed on platform keys.
   * A fresh instance per call on purpose: cost is read off the delegate's
   * cumulative counter after the call, and a shared delegate serving
   * overlapping calls would double-count one call's cost into another's
   * absorption window. Construction is cheap — both delegates build their
   * network clients lazily.
   */
  private delegateFor(
    modelId: string,
    task?: string
  ) {
    const def = nodetoolModelById(modelId);
    if (!def) {
      throw new Error(`Unknown NodeTool model "${modelId}".`);
    }
    if (!isCreditModelAllowed(def.id)) {
      throw new Error(
        `NodeTool model "${modelId}" is not available on this server.`
      );
    }
    const delegate =
      (task === "image_to_image" ? def.editDelegate : undefined) ??
      (task === "text_to_video" ? def.textDelegate : undefined) ??
      def.delegate;
    const key = this.platformKey(delegate.provider);
    if (!key) {
      throw new Error(
        `NodeTool model "${modelId}" is not available on this server ` +
          `(missing ${PLATFORM_KEYS[delegate.provider]}).`
      );
    }
    const provider =
      delegate.provider === "fal_ai"
        ? new FalProvider({ FAL_API_KEY: key })
        : new AnthropicProvider({ ANTHROPIC_API_KEY: key });
    return { provider, model: delegate.model };
  }

  /** Run a delegated call and absorb the delegate's cost delta as our own. */
  private async absorbing<T>(
    inner: BaseProvider,
    call: () => Promise<T>
  ): Promise<T> {
    const before = inner.getTotalCost();
    try {
      return await call();
    } finally {
      this._absorbedCost += inner.getTotalCost() - before;
    }
  }

  override get cost(): number {
    return this._absorbedCost;
  }

  override getTotalCost(): number {
    return this._absorbedCost;
  }

  override resetCost(): void {
    this._absorbedCost = 0;
  }

  protected override declaredCapabilities(): ProviderCapability[] {
    const capabilities: ProviderCapability[] = [];
    for (const def of NODETOOL_MODELS) {
      if (!this.isServable(def)) continue;
      if (def.kind === "language") capabilities.push("generate_message");
      if (def.kind === "image") {
        capabilities.push("text_to_image");
        if (def.editDelegate) capabilities.push("image_to_image");
      }
      if (def.kind === "video") {
        capabilities.push("image_to_video");
        if (def.textDelegate) capabilities.push("text_to_video");
      }
      if (def.kind === "tts") capabilities.push("text_to_speech");
    }
    return [...new Set(capabilities)];
  }

  private servableModels(kind: NodetoolModelKind) {
    return NODETOOL_MODELS.filter(
      (def) => def.kind === kind && this.isServable(def)
    );
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return this.servableModels("language").map((def) => ({
      type: "language_model",
      id: def.id,
      name: def.name,
      provider: "nodetool"
    }));
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return this.servableModels("image").map((def) => ({
      type: "image_model",
      id: def.id,
      name: def.name,
      provider: "nodetool",
      supported_tasks: def.tasks ?? []
    }));
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return this.servableModels("video").map((def) => ({
      type: "video_model",
      id: def.id,
      name: def.name,
      provider: "nodetool",
      supported_tasks: def.tasks ?? []
    }));
  }

  override async getAvailableTTSModels(): Promise<TTSModel[]> {
    return this.servableModels("tts").map((def) => ({
      id: def.id,
      name: def.name,
      provider: "nodetool",
      voices: (def.voices ?? []).map((voice) => voice.id)
    }));
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    const { provider, model } = this.delegateFor(params.model.id);
    return this.absorbing(provider, () =>
      provider.textToImage({
        ...params,
        model: { ...params.model, id: model, provider: provider.provider }
      })
    );
  }

  override async imageToImage(
    images: Uint8Array[],
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    const { provider, model } = this.delegateFor(
      params.model.id,
      "image_to_image"
    );
    return this.absorbing(provider, () =>
      provider.imageToImage(images, {
        ...params,
        model: { ...params.model, id: model, provider: provider.provider }
      })
    );
  }

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    const { provider, model } = this.delegateFor(
      params.model.id,
      "text_to_video"
    );
    return this.absorbing(provider, () =>
      provider.textToVideo({
        ...params,
        model: { ...params.model, id: model, provider: provider.provider }
      })
    );
  }

  override async imageToVideo(
    images: Uint8Array[],
    params: ImageToVideoParams
  ): Promise<Uint8Array> {
    const { provider, model } = this.delegateFor(params.model.id);
    return this.absorbing(provider, () =>
      provider.imageToVideo(images, {
        ...params,
        model: { ...params.model, id: model, provider: provider.provider }
      })
    );
  }

  override async textToSpeechEncoded(args: {
    text: string;
    model: string;
    voice?: string;
    speed?: number;
    audioFormat?: string;
  }): Promise<EncodedAudioResult | null> {
    const { provider, model } = this.delegateFor(args.model);
    return this.absorbing(provider, () =>
      provider.textToSpeechEncoded({ ...args, model })
    );
  }

  override async generateMessage(
    args: Parameters<BaseProvider["generateMessage"]>[0]
  ): Promise<Message> {
    const { provider, model } = this.delegateFor(args.model);
    return this.absorbing(provider, () =>
      provider.generateMessage({ ...args, model })
    );
  }

  override async *generateMessages(
    args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    const { provider, model } = this.delegateFor(args.model);
    const before = provider.getTotalCost();
    try {
      yield* provider.generateMessages({ ...args, model });
    } finally {
      this._absorbedCost += provider.getTotalCost() - before;
    }
  }
}

export default NodetoolProvider;
