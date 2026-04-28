/**
 * Kie.ai Provider — wraps the Kie.ai API to expose image, video, and audio
 * generation through the standard BaseProvider interface.
 *
 * Model lists are loaded from the kie-manifest.json shipped by @nodetool-ai/kie-nodes.
 */

import { BaseProvider } from "./base-provider.js";
import { createLogger } from "@nodetool-ai/config";
import type {
  ImageModel,
  VideoModel,
  Message,
  ProviderStreamItem,
  TextToImageParams,
  TextToVideoParams
} from "./types.js";
import { loadVideoModels, loadImageModels } from "./manifest-models.js";

const log = createLogger("nodetool.runtime.providers.kie");

const KIE_API_BASE = "https://api.kie.ai";

function headers(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

async function submitTask(
  apiKey: string,
  model: string,
  input: Record<string, unknown>
): Promise<string> {
  const res = await fetch(`${KIE_API_BASE}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ model, input })
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`Kie submit failed: ${res.status} ${JSON.stringify(data)}`);
  }
  const taskId = (data.data as Record<string, unknown>)?.taskId as string;
  if (!taskId) {
    throw new Error(`No taskId in Kie response: ${JSON.stringify(data)}`);
  }
  return taskId;
}

async function pollUntilDone(
  apiKey: string,
  taskId: string,
  pollInterval = 4000,
  maxAttempts = 300
): Promise<void> {
  const url = `${KIE_API_BASE}/api/v1/jobs/recordInfo?taskId=${taskId}`;
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(url, { headers: headers(apiKey) });
    const data = (await res.json()) as Record<string, unknown>;
    const state = (data.data as Record<string, unknown>)?.state as string;
    if (state === "success") return;
    if (state === "failed") {
      const msg =
        (data.data as Record<string, unknown>)?.failMsg || "Unknown error";
      throw new Error(`Kie task failed: ${msg}`);
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  throw new Error(`Kie task timed out after ${maxAttempts * pollInterval}ms`);
}

async function downloadResultBytes(
  apiKey: string,
  taskId: string
): Promise<Uint8Array> {
  const url = `${KIE_API_BASE}/api/v1/jobs/recordInfo?taskId=${taskId}`;
  const res = await fetch(url, { headers: headers(apiKey) });
  if (!res.ok) throw new Error(`Failed to get Kie result: ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;
  const resultJsonStr = (data.data as Record<string, unknown>)
    ?.resultJson as string;
  if (!resultJsonStr) throw new Error("No resultJson in Kie response");
  const resultData = JSON.parse(resultJsonStr) as Record<string, unknown>;
  const resultUrls = resultData.resultUrls as string[];
  if (!resultUrls?.length) throw new Error("No resultUrls in Kie resultJson");
  const dlRes = await fetch(resultUrls[0]);
  if (!dlRes.ok) {
    throw new Error(`Failed to download from ${resultUrls[0]}`);
  }
  return new Uint8Array(await dlRes.arrayBuffer());
}

const KIE_MANIFEST_PKG = "@nodetool-ai/kie-nodes";
const KIE_MANIFEST_PATH = "kie-manifest.json";

export class KieProvider extends BaseProvider {
  private apiKey: string;

  constructor(secrets: Record<string, unknown> = {}) {
    super("kie");
    this.apiKey = (secrets["KIE_API_KEY"] as string) ?? "";
  }

  async generateMessage(
    _args: Parameters<BaseProvider["generateMessage"]>[0]
  ): Promise<Message> {
    throw new Error("Kie does not support chat generation");
  }

  async *generateMessages(
    _args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    throw new Error("Kie does not support chat generation");
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return loadVideoModels(KIE_MANIFEST_PKG, KIE_MANIFEST_PATH, "kie");
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return loadImageModels(KIE_MANIFEST_PKG, KIE_MANIFEST_PATH, "kie");
  }

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    if (!params.prompt) throw new Error("Prompt is required");

    const input: Record<string, unknown> = { prompt: params.prompt };
    if (params.aspectRatio) input.aspect_ratio = params.aspectRatio;
    if (params.numFrames) {
      input.duration = Math.ceil(params.numFrames / 24);
    }

    const modelId = params.model.id;
    log.debug("Kie textToVideo", { model: modelId });

    const taskId = await submitTask(this.apiKey, modelId, input);
    await pollUntilDone(this.apiKey, taskId);
    return downloadResultBytes(this.apiKey, taskId);
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    const input: Record<string, unknown> = { prompt: params.prompt };
    if (params.width) input.width = params.width;
    if (params.height) input.height = params.height;

    const modelId = params.model.id;
    log.debug("Kie textToImage", { model: modelId });

    const taskId = await submitTask(this.apiKey, modelId, input);
    await pollUntilDone(this.apiKey, taskId);
    return downloadResultBytes(this.apiKey, taskId);
  }
}
