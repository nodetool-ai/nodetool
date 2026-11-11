/**
 * What a self-hosted ComfyUI reports about itself: its version, its GPU and
 * the model files in its folders. Settings and the provider dialog show this
 * after the user saves the address, so they can tell the app reached it.
 */

import { normalizeComfyServerUrl } from "./comfy-target.js";

/** The model folders whose files the status lists. */
export const COMFY_STATUS_FOLDERS = [
  "checkpoints",
  "diffusion_models",
  "loras"
] as const;

export type ComfyStatusFolder = (typeof COMFY_STATUS_FOLDERS)[number];

export interface ComfyServerStatus {
  /** The normalized address that answered. */
  url: string;
  /** `comfyui_version` from `/system_stats`, when the server reports one. */
  version: string | null;
  /** The first device's name, such as "cuda:0 NVIDIA GeForce RTX 4070". */
  device: string | null;
  /**
   * The files in each folder. A folder is null when the server has no
   * `/models/<folder>` route (older ComfyUI) or the request failed.
   */
  models: Record<ComfyStatusFolder, string[] | null>;
}

interface SystemStats {
  system?: { comfyui_version?: unknown };
  devices?: Array<{ name?: unknown }>;
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

/**
 * Ask the ComfyUI at `serverUrl` for `/system_stats` and its model folders.
 * Throws a message a person can act on when the server does not answer as a
 * ComfyUI.
 */
export async function fetchComfyServerStatus(
  serverUrl: string,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {}
): Promise<ComfyServerStatus> {
  const url = normalizeComfyServerUrl(serverUrl);
  const doFetch = options.fetchImpl ?? fetch;
  const get = (path: string): Promise<Response> =>
    doFetch(`${url}${path}`, {
      headers: { Accept: "application/json" },
      signal: options.signal
    });

  let statsResponse: Response;
  try {
    statsResponse = await get("/system_stats");
  } catch (err) {
    throw new Error(
      `Nothing answered at ${url}. Start ComfyUI, or check the address and port. (${err instanceof Error ? err.message : String(err)})`
    );
  }
  if (!statsResponse.ok) {
    throw new Error(
      `${url} answered with HTTP ${statsResponse.status}. It may not be a ComfyUI server, or ComfyUI is still starting.`
    );
  }
  let stats: SystemStats;
  try {
    stats = (await statsResponse.json()) as SystemStats;
  } catch {
    throw new Error(`${url} answered, but not as a ComfyUI server.`);
  }

  const folders = await Promise.all(
    COMFY_STATUS_FOLDERS.map(async (folder) => {
      try {
        const res = await get(`/models/${folder}`);
        if (!res.ok) return null;
        const body: unknown = await res.json();
        return isStringArray(body) ? body : null;
      } catch {
        return null;
      }
    })
  );
  const models = Object.fromEntries(
    COMFY_STATUS_FOLDERS.map((folder, index) => [folder, folders[index]])
  ) as Record<ComfyStatusFolder, string[] | null>;

  const version = stats.system?.comfyui_version;
  const device = stats.devices?.[0]?.name;
  return {
    url,
    version: typeof version === "string" && version ? version : null,
    device: typeof device === "string" && device ? device : null,
    models
  };
}
