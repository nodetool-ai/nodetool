import OpenAI from "openai";
import { createLogger } from "@nodetool/config";
import { OpenAIProvider } from "./openai-provider.js";
import type {
  ImageModel,
  LanguageModel,
  TextToImageParams,
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.replicate");

interface ReplicateProviderOptions {
  client?: OpenAI;
  clientFactory?: (apiKey: string) => OpenAI;
  fetchFn?: typeof fetch;
}

/**
 * Replicate prediction status response.
 */
interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: unknown;
  error?: string | null;
  urls?: { get?: string; stream?: string };
}

const REPLICATE_API_BASE = "https://api.replicate.com/v1";

/**
 * Provider for Replicate's LLM and image generation models.
 *
 * For chat completions, Replicate exposes an OpenAI-compatible endpoint,
 * so we extend OpenAIProvider and point the OpenAI SDK at Replicate's base URL.
 *
 * For image generation, we use Replicate's predictions REST API directly.
 */
export class ReplicateProvider extends OpenAIProvider {
  static override requiredSecrets(): string[] {
    return ["REPLICATE_API_TOKEN"];
  }

  private _replicateFetch: typeof fetch;

  constructor(
    secrets: { REPLICATE_API_TOKEN?: string },
    options: ReplicateProviderOptions = {}
  ) {
    const apiKey = secrets.REPLICATE_API_TOKEN;
    if (!apiKey) {
      throw new Error("REPLICATE_API_TOKEN is required");
    }

    const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);

    super(
      { OPENAI_API_KEY: apiKey },
      {
        client: options.client,
        clientFactory:
          options.clientFactory ??
          ((key) =>
            new OpenAI({
              apiKey: key,
              baseURL: `${REPLICATE_API_BASE}/openai/v1`,
            })),
        fetchFn,
      }
    );

    (this as { provider: string }).provider = "replicate";
    this._replicateFetch = fetchFn;
  }

  override getContainerEnv(): Record<string, string> {
    return { REPLICATE_API_TOKEN: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return [
      { id: "meta/meta-llama-3-8b", name: "Meta Llama 3 8B", provider: "replicate" },
      { id: "meta/meta-llama-3-8b-instruct", name: "Meta Llama 3 8B Instruct", provider: "replicate" },
      { id: "meta/meta-llama-3-70b", name: "Meta Llama 3 70B", provider: "replicate" },
      { id: "meta/meta-llama-3-70b-instruct", name: "Meta Llama 3 70B Instruct", provider: "replicate" },
      { id: "meta/meta-llama-3.1-405b-instruct", name: "Meta Llama 3.1 405B Instruct", provider: "replicate" },
      { id: "meta/llama-guard-3-8b", name: "Llama Guard 3 8B", provider: "replicate" },
      { id: "meta/llama-guard-3-11b-vision", name: "Llama Guard 3 11B Vision", provider: "replicate" },
      { id: "snowflake/snowflake-arctic-instruct", name: "Snowflake Arctic Instruct", provider: "replicate" },
    ];
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return [
      {
        id: "black-forest-labs/flux-schnell",
        name: "FLUX Schnell",
        provider: "replicate",
        supportedTasks: ["text_to_image"],
      },
      {
        id: "stability-ai/sdxl",
        name: "Stable Diffusion XL",
        provider: "replicate",
        supportedTasks: ["text_to_image"],
      },
      {
        id: "black-forest-labs/flux-dev",
        name: "FLUX Dev",
        provider: "replicate",
        supportedTasks: ["text_to_image"],
      },
    ];
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    if (!params.prompt) {
      throw new Error("The input prompt cannot be empty.");
    }

    const input: Record<string, unknown> = {
      prompt: params.prompt,
    };

    if (params.negativePrompt) input.negative_prompt = params.negativePrompt;
    if (params.width) input.width = params.width;
    if (params.height) input.height = params.height;
    if (params.guidanceScale != null) input.guidance_scale = params.guidanceScale;
    if (params.numInferenceSteps != null) input.num_inference_steps = params.numInferenceSteps;
    if (params.seed != null) input.seed = params.seed;
    if (params.scheduler) input.scheduler = params.scheduler;

    const modelId = params.model.id;

    log.debug("Replicate textToImage", { model: modelId });

    // Create prediction via Replicate API
    const createResponse = await this._replicateFetch(
      `${REPLICATE_API_BASE}/models/${modelId}/predictions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          Prefer: "wait",
        },
        body: JSON.stringify({ input }),
      }
    );

    if (!createResponse.ok) {
      const errorBody = await createResponse.text();
      throw new Error(
        `Replicate prediction creation failed (${createResponse.status}): ${errorBody}`
      );
    }

    let prediction = (await createResponse.json()) as ReplicatePrediction;

    // Poll if not yet complete (the Prefer: wait header should handle most cases)
    const timeoutMs = 5 * 60 * 1000;
    const intervalMs = 2000;
    const start = Date.now();

    while (
      prediction.status === "starting" ||
      prediction.status === "processing"
    ) {
      if (Date.now() - start > timeoutMs) {
        throw new Error("Replicate prediction timed out");
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));

      const pollUrl =
        prediction.urls?.get ??
        `${REPLICATE_API_BASE}/predictions/${prediction.id}`;

      const pollResponse = await this._replicateFetch(pollUrl, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!pollResponse.ok) {
        throw new Error(
          `Replicate prediction poll failed (${pollResponse.status})`
        );
      }

      prediction = (await pollResponse.json()) as ReplicatePrediction;
    }

    if (prediction.status !== "succeeded") {
      throw new Error(
        prediction.error ??
          `Replicate prediction ended with status '${prediction.status}'`
      );
    }

    // Extract output URL — Replicate returns a URL string or an array of URL strings
    const output = prediction.output;
    let imageUrl: string | null = null;

    if (typeof output === "string") {
      imageUrl = output;
    } else if (Array.isArray(output) && typeof output[0] === "string") {
      imageUrl = output[0];
    }

    if (!imageUrl) {
      throw new Error("Replicate prediction returned no image output");
    }

    // Download the image
    const imageResponse = await this._replicateFetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch generated image: ${imageResponse.status}`);
    }

    return new Uint8Array(await imageResponse.arrayBuffer());
  }
}
