/**
 * Where a Comfy workflow (`run_mode: "comfy"`) runs. The run, the node catalog
 * and the graph import all resolve the target here, so they cannot disagree.
 *
 * An explicit `COMFY_TARGET` never falls back: a target that is not configured
 * is an error, because a silent move to Comfy Cloud spends credits.
 */

import { stripTrailingSlashes } from "./comfy-sdk.js";

export type ComfyTarget =
  | { kind: "cloud"; apiKey: string }
  | { kind: "server"; url: string }
  | { kind: "worker"; url: string; token?: string };

type SecretLookup = (key: string) => Promise<string | null | undefined>;

/** The URL of a self-hosted ComfyUI, with a bare host:port given `http://`. */
export function normalizeComfyServerUrl(value: string): string {
  const trimmed = stripTrailingSlashes(value.trim());
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

export async function resolveComfyTarget(
  getSecret: SecretLookup
): Promise<ComfyTarget> {
  const read = async (key: string): Promise<string> =>
    (await getSecret(key))?.trim() ?? "";
  const selected = await read("COMFY_TARGET");
  const serverUrl = await read("COMFY_SERVER_URL");
  const apiKey = await read("COMFY_API_KEY");

  switch (selected) {
    case "cloud":
      if (!apiKey) {
        throw new Error(
          "The Comfy target is Comfy Cloud, but COMFY_API_KEY is not set. Add the key in Settings, or select another target."
        );
      }
      return { kind: "cloud", apiKey };
    case "server":
      if (!serverUrl) {
        throw new Error(
          "The Comfy target is a ComfyUI server, but COMFY_SERVER_URL is not set. Set the URL, or select another target."
        );
      }
      return { kind: "server", url: normalizeComfyServerUrl(serverUrl) };
    case "worker": {
      const url = await read("COMFY_WORKER_URL");
      if (!url) {
        throw new Error(
          "The Comfy target is a worker, but COMFY_WORKER_URL is not set. Select a running worker, or select another target."
        );
      }
      const token = await read("COMFY_WORKER_TOKEN");
      return { kind: "worker", url, token: token || undefined };
    }
    case "":
      break;
    default:
      throw new Error(
        `COMFY_TARGET is "${selected}". Use cloud, server or worker.`
      );
  }

  // No selection yet: keep the behavior that existed before COMFY_TARGET.
  if (serverUrl) return { kind: "server", url: normalizeComfyServerUrl(serverUrl) };
  if (apiKey) return { kind: "cloud", apiKey };
  throw new Error(
    "A Comfy workflow needs a place to run. Set COMFY_SERVER_URL for your own ComfyUI server, or add COMFY_API_KEY for Comfy Cloud, in Settings."
  );
}

/** The target's name for logs and errors. It never includes a credential. */
export function describeComfyTarget(target: ComfyTarget): string {
  switch (target.kind) {
    case "cloud":
      return "Comfy Cloud";
    case "server":
      return `the ComfyUI server at ${target.url}`;
    case "worker":
      return `the ComfyUI worker at ${target.url}`;
  }
}
