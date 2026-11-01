/**
 * GeminiVertexProvider — Gemini models through Vertex AI
 * (`aiplatform.googleapis.com`, now branded Gemini Enterprise Agent Platform),
 * billed to a Google Cloud project instead of an AI Studio API key.
 *
 * Request bodies are the same as the Gemini Developer API, so this extends
 * {@link GeminiProvider} and overrides only the endpoint: host, resource paths,
 * credentials, model listing, and the parts of the API Vertex lacks.
 *
 * Credentials, first match wins:
 * 1. `GOOGLE_VERTEX_CREDENTIALS`: a service account key (JSON), or an
 *    authorized-user file as `gcloud auth application-default login` writes.
 * 2. `GOOGLE_VERTEX_API_KEY`: a Vertex AI API key (express mode, or a Cloud
 *    API key bound to a service account). Requests use the project-less
 *    publisher paths, as the Google Gen AI SDK does for keys.
 * 3. The machine's Application Default Credentials, when the registry allows
 *    them (never on the cloud profile, where they would be the server's own).
 *
 * Differences from the Developer API that this provider handles:
 * - There is no Files API. Video or audio too large to send inline fails with
 *   a message saying so.
 * - Models are listed from `publishers/google/models`.
 * - Veo operations are polled with `:fetchPredictOperation` and return the
 *   video inline.
 */

import { createLogger } from "@nodetool-ai/config";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import { z } from "zod";
import {
  GeminiProvider,
  GEMINI_INLINE_VIDEO_MAX_BYTES,
  type GeminiProviderOptions
} from "./gemini-provider.js";
import {
  getGoogleAccessToken,
  parseGoogleCredentials,
  readApplicationDefaultCredentials,
  GoogleCredentialsError,
  type GoogleCredentials
} from "./google-cloud-auth.js";
import type {
  ASRModel,
  EmbeddingModel,
  ImageModel,
  LanguageModel,
  MusicModel,
  TTSModel,
  VideoModel
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.gemini-vertex");

export const VERTEX_DEFAULT_LOCATION = "global";
const VERTEX_API_VERSION = "v1beta1";
/** Locations served from a multi-region `rep` host instead of `{loc}-aiplatform`. */
const MULTI_REGIONAL_LOCATIONS = new Set(["us", "eu"]);
const LOCATION_PATTERN = /^[a-z0-9_-]+$/;
/** Project ids, including legacy domain-scoped ones (`example.com:project`). */
const PROJECT_PATTERN = /^[A-Za-z0-9.:_-]+$/;

/** Same filter the Developer API listing applies: chat models only. */
const NON_CHAT_MODEL = /(embedding|aqa|imagen|veo|image|tts|lyria)/i;

export interface GeminiVertexSecrets {
  GOOGLE_CLOUD_PROJECT?: string;
  GOOGLE_CLOUD_LOCATION?: string;
  GOOGLE_VERTEX_CREDENTIALS?: string;
  GOOGLE_VERTEX_API_KEY?: string;
  /**
   * Whether the machine's Application Default Credentials may be used. The
   * registry sets this off the cloud profile only.
   */
  _allowApplicationDefault?: boolean;
}

export interface GeminiVertexProviderOptions extends GeminiProviderOptions {
  /** Replaces the ADC file lookup, for tests. */
  readApplicationDefault?: () => Promise<GoogleCredentials | null>;
}

type VertexAuth =
  | { kind: "credentials"; credentials: GoogleCredentials }
  | { kind: "api_key"; apiKey: string };

/** The API host for a location. */
export function vertexHost(location: string): string {
  if (location === VERTEX_DEFAULT_LOCATION) return "aiplatform.googleapis.com";
  if (MULTI_REGIONAL_LOCATIONS.has(location)) {
    return `aiplatform.${location}.rep.googleapis.com`;
  }
  return `${location}-aiplatform.googleapis.com`;
}

const publisherModelsPageSchema = z.object({
  publisherModels: z.array(z.object({ name: z.string().optional() })).optional(),
  nextPageToken: z.string().optional()
});

export class GeminiVertexProvider extends GeminiProvider {
  static override requiredSecrets(): string[] {
    return ["GOOGLE_CLOUD_PROJECT"];
  }

  readonly project: string;
  readonly location: string;
  private readonly host: string;
  /**
   * The resource path prefix. An API key uses the project-less publisher
   * paths, as the Google Gen AI SDK does. OAuth credentials address the
   * configured project and location.
   */
  private readonly prefix: string;
  private readonly credentialsJson: string | undefined;
  private readonly vertexApiKey: string | undefined;
  private readonly allowApplicationDefault: boolean;
  private readonly readApplicationDefault: () => Promise<GoogleCredentials | null>;
  private auth: Promise<VertexAuth> | null = null;

  constructor(
    secrets: GeminiVertexSecrets,
    options: GeminiVertexProviderOptions = {}
  ) {
    super({}, options, PROVIDER_IDS.GEMINI_VERTEX);

    const project = secrets.GOOGLE_CLOUD_PROJECT?.trim();
    if (!project) throw new Error("GOOGLE_CLOUD_PROJECT is required");
    if (!PROJECT_PATTERN.test(project)) {
      throw new Error(`GOOGLE_CLOUD_PROJECT is not a project id: ${project}`);
    }
    const location =
      secrets.GOOGLE_CLOUD_LOCATION?.trim().toLowerCase() ||
      VERTEX_DEFAULT_LOCATION;
    if (!LOCATION_PATTERN.test(location)) {
      throw new Error(`GOOGLE_CLOUD_LOCATION is not a location: ${location}`);
    }

    this.project = project;
    this.location = location;
    this.host = vertexHost(location);
    this.credentialsJson = secrets.GOOGLE_VERTEX_CREDENTIALS?.trim() || undefined;
    this.vertexApiKey = secrets.GOOGLE_VERTEX_API_KEY?.trim() || undefined;
    this.allowApplicationDefault = secrets._allowApplicationDefault === true;
    this.prefix =
      this.vertexApiKey && !this.credentialsJson
        ? VERTEX_API_VERSION
        : `${VERTEX_API_VERSION}/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}`;
    this.readApplicationDefault =
      options.readApplicationDefault ?? (() => readApplicationDefaultCredentials());
  }

  /** Credentials are short-lived tokens or key files. Neither goes into a container. */
  override getContainerEnv(): Record<string, string> {
    return {};
  }

  // ---------------------------------------------------------------------------
  // Endpoint
  // ---------------------------------------------------------------------------

  private resolveAuth(): Promise<VertexAuth> {
    this.auth ??= (async (): Promise<VertexAuth> => {
      if (this.credentialsJson) {
        return {
          kind: "credentials",
          credentials: parseGoogleCredentials(this.credentialsJson)
        };
      }
      if (this.vertexApiKey) return { kind: "api_key", apiKey: this.vertexApiKey };
      if (this.allowApplicationDefault) {
        const credentials = await this.readApplicationDefault();
        if (credentials) return { kind: "credentials", credentials };
      }
      throw new GoogleCredentialsError(
        this.allowApplicationDefault
          ? "No Google Cloud credentials found. Run `gcloud auth application-default login`, or add a service account key or a Vertex AI API key."
          : "No Google Cloud credentials found. Add a service account key or a Vertex AI API key."
      );
    })();
    // A failed lookup is retried on the next call, after the user fixes it.
    this.auth.catch(() => {
      this.auth = null;
    });
    return this.auth;
  }

  /** URL of an API resource or collection under this provider's prefix. */
  protected override apiUrl(path: string): string {
    return `https://${this.host}/${this.prefix}/${path}`;
  }

  protected override modelUrl(
    model: string,
    method: string,
    query: Record<string, string> = {}
  ): string {
    const search = new URLSearchParams(query).toString();
    const url = this.apiUrl(
      `publishers/google/models/${encodeURIComponent(model)}:${method}`
    );
    return search ? `${url}?${search}` : url;
  }

  protected override async authHeaders(): Promise<Record<string, string>> {
    const auth = await this.resolveAuth();
    if (auth.kind === "api_key") return { "x-goog-api-key": auth.apiKey };
    const token = await getGoogleAccessToken(auth.credentials, {
      fetchFn: this._fetch
    });
    // User credentials bill quota to a project only when told which one.
    return auth.credentials.type === "authorized_user"
      ? { Authorization: `Bearer ${token}`, "x-goog-user-project": this.project }
      : { Authorization: `Bearer ${token}` };
  }

  protected override isApiHost(hostname: string): boolean {
    return hostname === this.host;
  }

  protected override async fetchVideoOperation(
    modelId: string,
    operationName: string,
    signal?: AbortSignal
  ): Promise<Response> {
    return this._fetch(this.modelUrl(modelId, "fetchPredictOperation"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await this.authHeaders())
      },
      body: JSON.stringify({ operationName }),
      signal
    });
  }

  /** Vertex has no Files API. Large media must go through Cloud Storage, which is not wired up. */
  protected override async uploadFileToGemini(
    bytes: Uint8Array,
    _mimeType: string
  ): Promise<string> {
    const mb = (n: number) => Math.round(n / (1024 * 1024));
    throw new Error(
      `Vertex AI takes media inline up to ${mb(GEMINI_INLINE_VIDEO_MAX_BYTES)} MB, and this file is ${mb(bytes.length)} MB. Use a shorter clip, or the Gemini API key provider, which can upload large files.`
    );
  }

  // ---------------------------------------------------------------------------
  // Models
  // ---------------------------------------------------------------------------

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const ids = new Set<string>();
    let pageToken: string | undefined;
    try {
      const headers = await this.authHeaders();
      do {
        // Base models are listed without a project prefix, for every credential.
        const query = new URLSearchParams({ pageSize: "100" });
        if (pageToken) query.set("pageToken", pageToken);
        const response = await this._fetch(
          `https://${this.host}/${VERTEX_API_VERSION}/publishers/google/models?${query}`,
          { headers }
        );
        if (!response.ok) {
          log.warn("Vertex AI model listing failed", { status: response.status });
          return [];
        }
        const page = publisherModelsPageSchema.parse(await response.json());
        for (const model of page.publisherModels ?? []) {
          const id = model.name?.split("/").pop();
          if (id && id.startsWith("gemini") && !NON_CHAT_MODEL.test(id)) ids.add(id);
        }
        pageToken = page.nextPageToken || undefined;
      } while (pageToken);
    } catch (error) {
      log.warn("Vertex AI model listing failed", {
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
    return [...ids].sort().map((id) => ({ id, name: id, provider: this.provider }));
  }

  /**
   * Vertex lists publisher models without their generation methods, so the
   * media listings keep the Developer API's known models.
   */
  protected override async listModelEntries(): Promise<null> {
    return null;
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return this.own(await super.getAvailableImageModels());
  }

  override async getAvailableTTSModels(): Promise<TTSModel[]> {
    return this.own(await super.getAvailableTTSModels());
  }

  override async getAvailableASRModels(): Promise<ASRModel[]> {
    return this.own(await super.getAvailableASRModels());
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return this.own(await super.getAvailableVideoModels());
  }

  override async getAvailableMusicModels(): Promise<MusicModel[]> {
    return this.own(await super.getAvailableMusicModels());
  }

  override async getAvailableEmbeddingModels(): Promise<EmbeddingModel[]> {
    return this.own(await super.getAvailableEmbeddingModels());
  }

  /** Re-label the Developer API's model lists as this provider's. */
  private own<T extends { provider: string }>(models: T[]): T[] {
    return models.map((model) => ({ ...model, provider: this.provider }));
  }
}
