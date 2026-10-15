import OpenAI, { AzureOpenAI } from "openai";
import {
  CLOUD_PROFILE_ENV,
  NODE_ENV_VAR,
  PROVIDER_IDS,
  isCloudProfileActive
} from "@nodetool-ai/protocol";
import type { ProviderCapability } from "./base-provider.js";
import { OpenAIProvider } from "./openai-provider.js";
import { safeFetch } from "./safe-url.js";
import type {
  ASRModel,
  EmbeddingModel,
  ImageModel,
  LanguageModel,
  TTSModel
} from "./types.js";

/** What a deployment serves. Azure does not report it, so it comes from config or the name. */
export type AzureDeploymentKind = "chat" | "image" | "tts" | "asr" | "embedding";

export interface AzureDeployment {
  id: string;
  kind: AzureDeploymentKind;
  model?: string;
}

const DEPLOYMENT_KINDS: readonly AzureDeploymentKind[] = [
  "chat",
  "image",
  "tts",
  "asr",
  "embedding"
];

const TTS_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse"
];

/**
 * The kind a deployment name implies. Azure deployments default to the name of
 * the model they serve, so `gpt-image-2`, `tts-hd`, `whisper` and
 * `text-embedding-3-large` classify themselves. Anything else is a chat model.
 */
export function inferAzureDeploymentKind(name: string): AzureDeploymentKind {
  const lower = name.toLowerCase();
  if (/image|dall-?e/.test(lower)) return "image";
  if (/whisper|transcribe/.test(lower)) return "asr";
  if (/tts/.test(lower)) return "tts";
  if (/embedding/.test(lower)) return "embedding";
  return "chat";
}

/**
 * Parse `AZURE_OPENAI_DEPLOYMENTS`: a comma-separated list of deployment
 * names. A name may carry an explicit kind after a colon
 * (`my-painter:image`) when the name does not reveal it. Append `=model`
 * to resolve capabilities independently of the deployment routing name.
 */
export function parseAzureDeployments(raw: string | undefined): AzureDeployment[] {
  const deployments: AzureDeployment[] = [];
  for (const entry of (raw ?? "").split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const equals = trimmed.indexOf("=");
    const deploymentName = equals > 0 ? trimmed.slice(0, equals).trim() : trimmed;
    const model = equals > 0 ? trimmed.slice(equals + 1).trim() : undefined;
    if (equals > 0 && !model) {
      throw new Error("Azure deployment model mapping must name an underlying model");
    }
    const colon = deploymentName.lastIndexOf(":");
    const suffix = colon > 0 ? deploymentName.slice(colon + 1).trim().toLowerCase() : "";
    const kind = DEPLOYMENT_KINDS.find((candidate) => candidate === suffix);
    const id = kind ? deploymentName.slice(0, colon).trim() : deploymentName;
    if (!id || deployments.some((d) => d.id === id)) continue;
    const deployment: AzureDeployment = { id, kind: kind ?? inferAzureDeploymentKind(model ?? id) };
    if (model) {
      deployment.model = model;
    }
    deployments.push(deployment);
  }
  return deployments;
}

/**
 * The resource root of an Azure OpenAI or Microsoft Foundry endpoint. Accepts
 * the forms the Azure portal shows: with or without a trailing `/openai` or
 * `/openai/v1`.
 */
export function azureOpenAIResourceRoot(endpoint: string): string {
  let url: URL;
  try {
    url = new URL(endpoint.trim());
  } catch {
    throw new Error(`AZURE_OPENAI_ENDPOINT is not a valid URL: ${endpoint}`);
  }
  if (url.protocol !== "https:") {
    throw new Error("AZURE_OPENAI_ENDPOINT must be an https:// URL");
  }
  const path = url.pathname.replace(/\/+$/, "").replace(/\/openai(\/v1)?$/i, "");
  return `${url.origin}${path}`;
}

function isCloudProfileOn(): boolean {
  if (typeof process === "undefined") return false;
  return isCloudProfileActive(
    process.env[CLOUD_PROFILE_ENV],
    process.env[NODE_ENV_VAR]
  );
}

interface AzureOpenAIProviderOptions {
  client?: OpenAI;
  fetchFn?: typeof fetch;
}

/**
 * Azure OpenAI Service and Microsoft Foundry. The wire format is OpenAI's, so
 * chat, image, speech, transcription and embedding calls reuse
 * {@link OpenAIProvider}. Models are the deployments the user lists, because
 * Azure addresses a model by its deployment name.
 *
 * Without `AZURE_OPENAI_API_VERSION` (or with `v1`) requests go to the v1 API
 * at `<resource>/openai/v1`. With a dated version they go to the classic
 * `<resource>/openai/deployments/<name>?api-version=<version>` routes.
 */
export class AzureOpenAIProvider extends OpenAIProvider {
  static override requiredSecrets(): string[] {
    return ["AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT"];
  }

  readonly endpoint: string;
  readonly apiVersion: string;
  readonly deployments: AzureDeployment[];

  constructor(
    secrets: {
      AZURE_OPENAI_API_KEY?: string;
      AZURE_OPENAI_ENDPOINT?: string;
      AZURE_OPENAI_DEPLOYMENTS?: string;
      AZURE_OPENAI_API_VERSION?: string;
    },
    options: AzureOpenAIProviderOptions = {}
  ) {
    const apiKey = secrets.AZURE_OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("AZURE_OPENAI_API_KEY is required");
    }
    const endpoint = secrets.AZURE_OPENAI_ENDPOINT?.trim();
    if (!endpoint) {
      throw new Error("AZURE_OPENAI_ENDPOINT is required");
    }
    const apiVersion = secrets.AZURE_OPENAI_API_VERSION?.trim() ?? "";

    // The endpoint is the user's own text, and the server fetches it. On the
    // cloud profile every request and redirect hop must reach a public https
    // host. A local install keeps private endpoints (Azure Private Link)
    // reachable.
    const inner = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    let fetchFn = inner;
    if (isCloudProfileOn()) {
      fetchFn = (input, init) =>
        safeFetch(
          input instanceof Request ? input.url : String(input),
          init,
          undefined,
          inner
        );
    }

    super(
      { OPENAI_API_KEY: apiKey },
      {
        providerId: PROVIDER_IDS.AZURE_OPENAI,
        client: options.client,
        fetchFn,
        // The endpoint is parsed on first use, so a malformed one fails the
        // request that needs it with a message naming the setting.
        clientFactory: (key) => {
          const root = azureOpenAIResourceRoot(endpoint);
          return apiVersion && apiVersion !== "v1"
            ? new AzureOpenAI({
                apiKey: key,
                endpoint: root,
                apiVersion,
                fetch: fetchFn
              })
            : new OpenAI({
                apiKey: key,
                baseURL: `${root}/openai/v1`,
                defaultHeaders: { "api-key": key },
                fetch: fetchFn
              });
        }
      }
    );
    this.endpoint = endpoint;
    this.apiVersion = apiVersion;
    this.deployments = parseAzureDeployments(secrets.AZURE_OPENAI_DEPLOYMENTS);
  }

  protected override mediaModelIdentity(model: string): string {
    const identity = this.deployments.find((deployment) => deployment.id === model)?.model ?? model;
    return identity === "whisper" ? "whisper-1" : identity;
  }

  override getContainerEnv(): Record<string, string> {
    return {
      AZURE_OPENAI_API_KEY: this.apiKey,
      AZURE_OPENAI_ENDPOINT: this.endpoint
    };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  private deploymentsOf(kind: AzureDeploymentKind): AzureDeployment[] {
    return this.deployments.filter((d) => d.kind === kind);
  }

  protected override declaredCapabilities(): readonly ProviderCapability[] {
    const capabilities: ProviderCapability[] = [];
    if (this.deploymentsOf("image").length > 0) {
      capabilities.push("text_to_image", "image_to_image", "inpainting");
    }
    if (this.deploymentsOf("tts").length > 0) capabilities.push("text_to_speech");
    if (this.deploymentsOf("asr").length > 0) {
      capabilities.push("automatic_speech_recognition");
    }
    if (this.deploymentsOf("embedding").length > 0) {
      capabilities.push("generate_embedding");
    }
    return capabilities;
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return this.deploymentsOf("chat").map((d) => ({
      id: d.id,
      name: d.id,
      provider: this.provider
    }));
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return this.deploymentsOf("image").map((d) => ({
      id: d.id,
      name: d.id,
      provider: this.provider,
      supportedTasks: ["text_to_image", "image_to_image"]
    }));
  }

  override async getAvailableTTSModels(): Promise<TTSModel[]> {
    return this.deploymentsOf("tts").map((d) => ({
      id: d.id,
      name: d.id,
      provider: this.provider,
      voices: TTS_VOICES
    }));
  }

  override async getAvailableASRModels(): Promise<ASRModel[]> {
    return this.deploymentsOf("asr").map((d) => ({
      id: d.id,
      name: d.id,
      provider: this.provider
    }));
  }

  override async getAvailableEmbeddingModels(): Promise<EmbeddingModel[]> {
    return this.deploymentsOf("embedding").map((d) => ({
      id: d.id,
      name: d.id,
      provider: this.provider
    }));
  }

  override async getAvailableVideoModels() {
    return [];
  }
}
