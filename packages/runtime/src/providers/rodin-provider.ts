/**
 * Rodin AI Provider — wraps the Rodin AI (Hyperhuman) 3D generation API to
 * expose `textTo3D` and `imageTo3D` through the standard {@link BaseProvider}
 * interface.
 *
 * Rodin's primary capability is image-to-3D, but the same `/v2/rodin`
 * endpoint accepts a text prompt for text-to-3D generation.
 *
 * API docs: https://hyperhuman.deemos.com/api
 *
 * Ported from the historical Python implementation at
 * `nodetool-core@25e60910:src/nodetool/providers/rodin_provider.py`. The
 * Python `image_to_3d` accidentally submitted the task twice to fetch the
 * subscription key — fixed here by reading both `uuids` and
 * `subscription_key` from a single submit response.
 */

import { BaseProvider } from "./base-provider.js";
import { safeFetch } from "./safe-url.js";
import { createLogger } from "@nodetool-ai/config";
import type {
  ImageTo3DParams,
  Message,
  Model3D,
  ProviderStreamItem,
  TextTo3DParams
} from "./types.js";

// Stryker disable next-line StringLiteral: logger name is diagnostic, not asserted.
const log = createLogger("nodetool.runtime.providers.rodin");

const RODIN_API_BASE_URL = "https://hyperhuman.deemos.com/api";

const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_MAX_POLL_ATTEMPTS = 120;

const DEFAULT_OUTPUT_FORMAT = "glb";

export const RODIN_3D_MODELS: Model3D[] = [
  {
    id: "rodin-gen-1",
    name: "Rodin Gen-1 Image-to-3D",
    provider: "rodin",
    supportedTasks: ["image_to_3d"],
    outputFormats: ["glb", "fbx", "obj", "usdz"]
  },
  {
    id: "rodin-gen-1-turbo",
    name: "Rodin Gen-1 Turbo Image-to-3D",
    provider: "rodin",
    supportedTasks: ["image_to_3d"],
    outputFormats: ["glb", "fbx", "obj", "usdz"]
  },
  {
    id: "rodin-sketch",
    name: "Rodin Sketch Text-to-3D",
    provider: "rodin",
    supportedTasks: ["text_to_3d"],
    outputFormats: ["glb", "fbx", "obj", "usdz"]
  }
];

export interface RodinProviderOptions {
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}

interface RodinSubmitResponse {
  uuid: string;
  subscriptionKey: string;
}

interface RodinEncodedImage {
  type: "png" | "jpeg";
  data: string;
}

export function detectImageType(image: Uint8Array): "png" | "jpeg" {
  // JPEG starts with the SOI + marker bytes FF D8 FF. Everything else —
  // including PNG and unknown formats — defaults to "png" (matches the Python
  // provider's default). No explicit length guard is needed: a short input has
  // `undefined` at the missing indices, which never equals the marker bytes.
  if (image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff) {
    return "jpeg";
  }
  return "png";
}

export function encodeImageForRodin(image: Uint8Array): RodinEncodedImage {
  return {
    type: detectImageType(image),
    data: Buffer.from(image).toString("base64")
  };
}

/** Pure: normalize a requested 3D output format to Rodin's upper-cased value. */
export function rodinOutputFormat(outputFormat: string | undefined): string {
  return (outputFormat ?? DEFAULT_OUTPUT_FORMAT).toUpperCase();
}

/** Pure: attach a non-negative `seed` to a request payload (in place). */
export function applyRodinSeed(
  payload: Record<string, unknown>,
  seed: number | null | undefined
): void {
  if (seed != null && seed >= 0) payload.seed = seed;
}

/** Pure: build the Rodin text-to-3D submit payload. */
export function buildRodinTextPayload(
  prompt: string,
  format: string,
  seed: number | null | undefined
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    prompt,
    geometry_file_format: format
  };
  applyRodinSeed(payload, seed);
  return payload;
}

/** Pure: build the Rodin image-to-3D submit payload. */
export function buildRodinImagePayload(
  encoded: RodinEncodedImage,
  format: string,
  prompt: string | null | undefined,
  seed: number | null | undefined
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    images: [encoded],
    geometry_file_format: format
  };
  if (prompt) payload.prompt = prompt;
  applyRodinSeed(payload, seed);
  return payload;
}

export class RodinProvider extends BaseProvider {
  private readonly apiKey: string;
  private readonly pollIntervalMs: number;
  private readonly maxPollAttempts: number;

  constructor(
    secrets: Record<string, unknown> = {},
    options: RodinProviderOptions = {}
  ) {
    super("rodin");
    this.apiKey = (secrets["RODIN_API_KEY"] as string) ?? "";
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.maxPollAttempts = options.maxPollAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS;
    // Stryker disable next-line ConditionalExpression,BooleanLiteral,BlockStatement: diagnostic warn only; missing key is enforced at call time.
    if (!this.apiKey) {
      // Stryker disable next-line StringLiteral: diagnostic log message.
      log.warn("Rodin API key not configured");
    }
  }

  static override requiredSecrets(): string[] {
    return ["RODIN_API_KEY"];
  }

  async generateMessage(
    _args: Parameters<BaseProvider["generateMessage"]>[0]
  ): Promise<Message> {
    throw new Error("rodin does not support chat generation");
  }

  // eslint-disable-next-line require-yield
  async *generateMessages(
    _args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    throw new Error("rodin does not support chat generation");
  }

  override async getAvailable3DModels(): Promise<Model3D[]> {
    if (!this.apiKey) {
      // Stryker disable next-line StringLiteral: diagnostic log message.
      log.debug("No Rodin API key configured, returning empty 3D model list");
      return [];
    }
    return RODIN_3D_MODELS;
  }

  override async textTo3D(params: TextTo3DParams): Promise<Uint8Array> {
    if (!params.prompt) throw new Error("prompt must not be empty");
    if (!this.apiKey) throw new Error("Rodin API key is not configured");

    const maxAttempts = this.computeMaxAttempts(params.timeoutSeconds);
    const signal = this.timeoutSignal(params.timeoutSeconds);
    const format = rodinOutputFormat(params.outputFormat);

    const payload = buildRodinTextPayload(params.prompt, format, params.seed);

    const submit = await this.submitTask(payload, signal);
    // Stryker disable next-line StringLiteral: diagnostic log message.
    log.debug(`Rodin text-to-3D task submitted: ${submit.uuid}`);

    await this.pollTaskStatus(submit.subscriptionKey, maxAttempts, signal);
    return this.downloadResult(submit.uuid, signal);
  }

  override async imageTo3D(
    image: Uint8Array,
    params: ImageTo3DParams
  ): Promise<Uint8Array> {
    if (!image || image.length === 0)
      throw new Error("image must not be empty");
    if (!this.apiKey) throw new Error("Rodin API key is not configured");

    const maxAttempts = this.computeMaxAttempts(params.timeoutSeconds);
    const signal = this.timeoutSignal(params.timeoutSeconds);
    const format = rodinOutputFormat(params.outputFormat);
    const encoded = encodeImageForRodin(image);

    const payload = buildRodinImagePayload(
      encoded,
      format,
      params.prompt,
      params.seed
    );

    const submit = await this.submitTask(payload, signal);
    // Stryker disable next-line StringLiteral: diagnostic log message.
    log.debug(`Rodin image-to-3D task submitted: ${submit.uuid}`);

    await this.pollTaskStatus(submit.subscriptionKey, maxAttempts, signal);
    return this.downloadResult(submit.uuid, signal);
  }

  // --- internals ---

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json"
    };
  }

  private computeMaxAttempts(timeoutSeconds: number | null | undefined): number {
    // Stryker disable next-line EqualityOperator: `<= 0` vs `< 0` is equivalent — 0 is already caught by the falsy `!timeoutSeconds` check.
    if (!timeoutSeconds || timeoutSeconds <= 0) {
      return this.maxPollAttempts;
    }
    return Math.max(1, Math.floor((timeoutSeconds * 1000) / this.pollIntervalMs));
  }

  /**
   * Per-call timeout signal (mirrors the gemini provider): threaded into the
   * submit / poll / download fetches so an expired budget aborts the in-flight
   * request instead of leaking it. The inter-poll sleep is left on the loop's
   * own attempt cap, which surfaces the friendly "timed out" message.
   */
  private timeoutSignal(
    timeoutSeconds: number | null | undefined
  ): AbortSignal | undefined {
    return timeoutSeconds && timeoutSeconds > 0
      ? AbortSignal.timeout(timeoutSeconds * 1000)
      : undefined;
  }

  private async submitTask(
    payload: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<RodinSubmitResponse> {
    const url = `${RODIN_API_BASE_URL}/v2/rodin`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload),
      signal
    });
    if (res.status !== 200 && res.status !== 202) {
      const errText = await res.text();
      throw new Error(`Rodin API error (${res.status}): ${errText}`);
    }
    const data = (await res.json()) as Record<string, unknown>;
    const uuids = data.uuids as string[] | undefined;
    const subscriptionKey = data.subscription_key as string | undefined;
    const uuid = uuids?.[0];
    if (!uuid) {
      throw new Error(
        `Rodin submit returned no task uuid: ${JSON.stringify(data)}`
      );
    }
    if (!subscriptionKey) {
      throw new Error(
        `Rodin submit returned no subscription_key: ${JSON.stringify(data)}`
      );
    }
    return { uuid, subscriptionKey };
  }

  private async pollTaskStatus(
    subscriptionKey: string,
    maxAttempts: number,
    signal?: AbortSignal
  ): Promise<Record<string, unknown>> {
    const url = `${RODIN_API_BASE_URL}/v2/status`;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const res = await fetch(url, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ subscription_key: subscriptionKey }),
        signal
      });
      if (res.status !== 200) {
        const errText = await res.text();
        throw new Error(`Rodin API poll error (${res.status}): ${errText}`);
      }
      const data = (await res.json()) as Record<string, unknown>;
      // Stryker disable next-line ArrayDeclaration: a non-empty fallback is equivalent — a synthetic first "job" with no status string is not terminal, so the loop polls on exactly as the empty-array path does.
      const jobs = (data.jobs as Record<string, unknown>[] | undefined) ?? [];
      const job = jobs[0];
      if (!job) {
        // Stryker disable next-line StringLiteral,ArithmeticOperator: diagnostic log message.
        log.debug(`Rodin task: no jobs yet (attempt ${attempt + 1}/${maxAttempts})`);
        await new Promise((r) => setTimeout(r, this.pollIntervalMs));
        continue;
      }
      // Stryker disable next-line StringLiteral: empty fallback only applies when status is absent; any non-status string is equivalent (still not DONE/FAILED/ERROR/CANCELLED).
      const status = String(job.status ?? "").toUpperCase();
      if (status === "DONE") return job;
      if (
        status === "FAILED" ||
        status === "ERROR" ||
        status === "CANCELLED"
      ) {
        const errMsg = (job.error as string | undefined) ?? "Unknown error";
        throw new Error(`Rodin task failed: ${errMsg}`);
      }
      // Stryker disable next-line StringLiteral,ArithmeticOperator: diagnostic log message.
      log.debug(`Rodin task status: ${status} (attempt ${attempt + 1}/${maxAttempts})`);
      await new Promise((r) => setTimeout(r, this.pollIntervalMs));
    }
    throw new Error(
      `Rodin task timed out after ${(maxAttempts * this.pollIntervalMs) / 1000}s`
    );
  }

  private async downloadResult(
    taskUuid: string,
    signal?: AbortSignal
  ): Promise<Uint8Array> {
    const downloadInfoRes = await fetch(`${RODIN_API_BASE_URL}/v2/download`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ task_uuid: taskUuid }),
      signal
    });
    if (downloadInfoRes.status !== 200) {
      const errText = await downloadInfoRes.text();
      throw new Error(
        `Failed to get Rodin download URL (${downloadInfoRes.status}): ${errText}`
      );
    }
    const info = (await downloadInfoRes.json()) as Record<string, unknown>;
    const downloadUrl =
      (info.model_url as string | undefined) ?? (info.url as string | undefined);
    if (!downloadUrl) {
      throw new Error(
        `No download URL in Rodin response: ${JSON.stringify(info)}`
      );
    }
    const dlRes = await safeFetch(downloadUrl, { signal });
    if (!dlRes.ok) {
      const errText = await dlRes.text().catch(() => "");
      throw new Error(
        `Failed to download Rodin result (${dlRes.status}): ${errText}`
      );
    }
    const bytes = new Uint8Array(await dlRes.arrayBuffer());
    // Stryker disable next-line StringLiteral: diagnostic log message.
    log.debug(`Downloaded ${bytes.length} bytes of 3D model data from Rodin`);
    return bytes;
  }
}
