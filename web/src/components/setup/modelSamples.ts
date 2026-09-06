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

/** Answers whether this model's sample can be rendered. */
export type ModelSampleProbe = (
  modelId: string,
  kind: ModelSampleKind
) => Promise<boolean>;

/**
 * Ask the browser to load the sample. A media element is used rather than
 * `fetch` on purpose: media loading is not subject to the CORS preflight a
 * cross-origin `fetch` would need, and the element is the same one that will
 * render the sample, so a successful probe means the tile will render.
 */
const loadSample: ModelSampleProbe = (modelId, kind) =>
  new Promise<boolean>((resolve) => {
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

/**
 * A probe that answers "no sample" without asking anyone. It is what runs
 * where there is no network to ask: a media element in jsdom resolves the
 * hostname for real, so a suite that named a model id made an outbound DNS
 * call and then never settled either way — slow, flaky on a bad link, and dead
 * on an offline or sandboxed CI runner.
 *
 * It resolves rather than hangs on purpose. A tile decides between its picture
 * and its typographic fallback on this answer, so a probe that never settles
 * is a card that never settles.
 */
export const noModelSamples: ModelSampleProbe = () => Promise.resolve(false);

let probeSample: ModelSampleProbe = loadSample;

/**
 * Replaces the probe, and drops what the old one answered. The web test setup
 * installs {@link noModelSamples}; pass `null` to restore the real one.
 */
export const setModelSampleProbe = (probe: ModelSampleProbe | null): void => {
  probeSample = probe ?? loadSample;
  probed.clear();
};

/** The probe, memoized: one answer per model and kind for the session. */
const probe = (modelId: string, kind: ModelSampleKind): Promise<boolean> => {
  const key = `${kind}:${modelId}`;
  const existing = probed.get(key);
  if (existing) {
    return existing;
  }
  const pending = probeSample(modelId, kind);
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
