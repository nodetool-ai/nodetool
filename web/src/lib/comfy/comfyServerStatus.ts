/**
 * What the ComfyUI saved in Settings reports about itself, read through
 * `GET /api/comfy/server-status`, and the sentence the UI shows for it.
 */
import { restFetch } from "../rest-fetch";

export interface ComfyServerStatus {
  url: string;
  version: string | null;
  device: string | null;
  models: {
    checkpoints: string[] | null;
    diffusion_models: string[] | null;
    loras: string[] | null;
  };
}

export const COMFY_SERVER_STATUS_KEY = "comfy-server-status";

export const fetchComfyServerStatus = async (
  signal?: AbortSignal
): Promise<ComfyServerStatus> => {
  const res = await restFetch("/api/comfy/server-status", { signal });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      detail?: string;
      error?: { message?: string };
    } | null;
    throw new Error(
      body?.error?.message ?? body?.detail ?? `ComfyUI did not answer (HTTP ${res.status})`
    );
  }
  return (await res.json()) as ComfyServerStatus;
};

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/** "cuda:0 NVIDIA GeForce RTX 4070 : cudaMallocAsync" reads as the GPU name. */
const deviceName = (device: string): string =>
  device.replace(/^[a-z]+:\d+\s+/i, "").replace(/\s*:\s*\w+$/, "").trim();

/** "ComfyUI 0.3.68 on NVIDIA GeForce RTX 4070" */
export const describeComfyServer = (status: ComfyServerStatus): string => {
  const name = status.version ? `ComfyUI ${status.version}` : "ComfyUI";
  return status.device ? `${name} on ${deviceName(status.device)}` : name;
};

/**
 * "8 checkpoints, 2 diffusion models, 14 LoRAs", or null when the server
 * does not list its model folders.
 */
export const describeComfyModels = (status: ComfyServerStatus): string | null => {
  const { checkpoints, diffusion_models, loras } = status.models;
  const parts: string[] = [];
  if (checkpoints) parts.push(plural(checkpoints.length, "checkpoint", "checkpoints"));
  if (diffusion_models) {
    parts.push(plural(diffusion_models.length, "diffusion model", "diffusion models"));
  }
  if (loras) parts.push(plural(loras.length, "LoRA", "LoRAs"));
  return parts.length > 0 ? parts.join(", ") : null;
};
