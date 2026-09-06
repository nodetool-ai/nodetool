/**
 * Samples for the model tiles in the video and image look steps
 * (PRD § 8.3, § 10.3, R5).
 *
 * R5: model samples are **fetched on first use, not shipped**. A short clip or
 * a still per curated model, at any usable resolution, is tens of megabytes
 * across the catalog — in the Electron artifact and the Docker image that is
 * size everyone pays for whether or not they ever open a look step. So the
 * samples live at a documented remote base and the browser pulls one the first
 * time a tile asks for it. Nothing about them is in this repository.
 *
 * A model whose sample has not been published, or whose fetch fails, is not a
 * broken tile: {@link useModelSamples} only reports a sample once the browser
 * has actually loaded it, so until then the tile falls back to the model's name
 * set in the space the picture would fill (`PresetTileGrid`).
 */

import { useEffect, useState } from "react";

/**
 * Where the samples live. A base that answers nothing simply leaves every tile
 * on its typographic fallback, so a self-hosted install with no mirror still
 * gets a usable grid.
 */
export const MODEL_SAMPLE_BASE_URL = "https://cdn.nodetool.ai/model-samples";

/** What a sample is: a clip for a video model, a still for an image model. */
export type ModelSampleKind = "video" | "image";

/**
 * Every sample of a kind is the same prompt, so the tiles compare models, not
 * prompts.
 */
export const MODEL_SAMPLE_PROMPTS: Record<ModelSampleKind, string> = {
  video: "A paper boat crossing a puddle at dusk, slow push in",
  image: "A paper boat crossing a puddle at dusk"
};

const SAMPLE_EXTENSION: Record<ModelSampleKind, string> = {
  video: "mp4",
  image: "jpg"
};

export const modelSampleUrl = (
  modelId: string,
  kind: ModelSampleKind
): string =>
  `${MODEL_SAMPLE_BASE_URL}/${encodeURIComponent(modelId)}.${SAMPLE_EXTENSION[kind]}`;

/** `kind:id` → whether its sample loaded. Module-level: one probe per session. */
const probed = new Map<string, Promise<boolean>>();

/**
 * Ask the browser to load the sample. A media element is used rather than
 * `fetch` on purpose: media loading is not subject to the CORS preflight a
 * cross-origin `fetch` would need, and the element is the same one that will
 * render the sample, so a successful probe means the tile will render.
 */
const probe = (modelId: string, kind: ModelSampleKind): Promise<boolean> => {
  const key = `${kind}:${modelId}`;
  const existing = probed.get(key);
  if (existing) {
    return existing;
  }
  const pending = new Promise<boolean>((resolve) => {
    if (typeof document === "undefined") {
      resolve(false);
      return;
    }
    const element =
      kind === "video"
        ? document.createElement("video")
        : document.createElement("img");
    if (element instanceof HTMLVideoElement) {
      element.preload = "metadata";
      element.muted = true;
    }
    const settle = (loaded: boolean) => {
      element.removeAttribute("src");
      resolve(loaded);
    };
    // A video reports `loadedmetadata` once it knows its dimensions; an image
    // reports `load` only once the bytes are decoded. Both mean renderable.
    element.addEventListener(
      kind === "video" ? "loadedmetadata" : "load",
      () => settle(true),
      { once: true }
    );
    element.addEventListener("error", () => settle(false), { once: true });
    element.src = modelSampleUrl(modelId, kind);
  });
  probed.set(key, pending);
  return pending;
};

/**
 * The sample URLs that are actually available, keyed by model id. Absent keys
 * are models with no published sample — the tile shows their name instead.
 */
export function useModelSamples(
  modelIds: readonly string[],
  kind: ModelSampleKind
): Record<string, string> {
  const key = [...modelIds].sort().join(",");
  const [available, setAvailable] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const ids = key.length > 0 ? key.split(",") : [];
    for (const id of ids) {
      void probe(id, kind).then((loaded) => {
        if (loaded && !cancelled) {
          setAvailable((current) =>
            current[id]
              ? current
              : { ...current, [id]: modelSampleUrl(id, kind) }
          );
        }
      });
    }
    return () => {
      cancelled = true;
    };
  }, [key, kind]);

  return available;
}
