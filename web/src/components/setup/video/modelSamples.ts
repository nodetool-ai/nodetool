/**
 * Sample clips for the video-model tiles (PRD § 8.3, R5).
 *
 * R5: model samples are **fetched on first use, not shipped**. A short clip per
 * curated model, at any usable resolution, is tens of megabytes across the
 * catalog — in the Electron artifact and the Docker image that is size everyone
 * pays for whether or not they ever open the look step. So the clips live at a
 * documented remote base and the browser pulls one the first time a tile asks
 * for it. Nothing about them is in this repository.
 *
 * A model whose sample has not been published, or whose fetch fails, is not a
 * broken tile: {@link useModelSampleClips} only reports a clip once the browser
 * has actually loaded its metadata, so until then the tile falls back to the
 * model's name set in the space the picture would fill (`PresetTileGrid`).
 */

import { useEffect, useState } from "react";

/**
 * Where the samples live. A base that answers nothing simply leaves every tile
 * on its typographic fallback, so a self-hosted install with no mirror still
 * gets a usable grid.
 */
export const MODEL_SAMPLE_BASE_URL = "https://cdn.nodetool.ai/model-samples";

/** Every sample is the same prompt, so the tiles compare models, not prompts. */
export const MODEL_SAMPLE_PROMPT =
  "A paper boat crossing a puddle at dusk, slow push in";

export const modelSampleUrl = (modelId: string): string =>
  `${MODEL_SAMPLE_BASE_URL}/${encodeURIComponent(modelId)}.mp4`;

/** id → whether its sample loaded. Module-level: one probe per session. */
const probed = new Map<string, Promise<boolean>>();

/**
 * Ask the browser to load the sample's metadata. A `<video>` element is used
 * rather than `fetch` on purpose: media loading is not subject to the CORS
 * preflight a cross-origin `fetch` would need, and the element is the same one
 * that will play the clip, so a successful probe means the tile will render.
 */
const probe = (modelId: string): Promise<boolean> => {
  const existing = probed.get(modelId);
  if (existing) {
    return existing;
  }
  const pending = new Promise<boolean>((resolve) => {
    if (typeof document === "undefined") {
      resolve(false);
      return;
    }
    const element = document.createElement("video");
    element.preload = "metadata";
    element.muted = true;
    const settle = (loaded: boolean) => {
      element.removeAttribute("src");
      resolve(loaded);
    };
    element.addEventListener("loadedmetadata", () => settle(true), {
      once: true
    });
    element.addEventListener("error", () => settle(false), { once: true });
    element.src = modelSampleUrl(modelId);
  });
  probed.set(modelId, pending);
  return pending;
};

/**
 * The sample URLs that are actually available, keyed by model id. Absent keys
 * are models with no published sample — the tile shows their name instead.
 */
export function useModelSampleClips(
  modelIds: readonly string[]
): Record<string, string> {
  const key = [...modelIds].sort().join(",");
  const [available, setAvailable] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const ids = key.length > 0 ? key.split(",") : [];
    for (const id of ids) {
      void probe(id).then((loaded) => {
        if (loaded && !cancelled) {
          setAvailable((current) =>
            current[id] ? current : { ...current, [id]: modelSampleUrl(id) }
          );
        }
      });
    }
    return () => {
      cancelled = true;
    };
  }, [key]);

  return available;
}
