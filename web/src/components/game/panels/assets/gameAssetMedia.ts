import type { GameRenderer3D } from "@nodetool-ai/game-renderer/browser3d";

import { restFetch } from "../../../../lib/rest-fetch";
import { resolveMediaUri } from "../../../../utils/resolveMediaUri";
import { workspaceFileDownloadPath } from "../../../workspace/workspaceFileRef";
import { modelThumbnailFrame, waveformPeaks, type GameAssetSource, type ModelThumbnailColors } from "./gameAssetBrowserModel";

/** The media locator the media primitives resolve: an installed asset, or the staged file's download route. */
export function gameAssetLocator(source: GameAssetSource): string {
  if (source.kind === "workspace") { return workspaceFileDownloadPath(source.workspaceId, source.path); }
  return source.assetId.startsWith("package://") ? source.assetId : `asset://${source.assetId}`;
}

export function gameAssetSourceKey(source: GameAssetSource): string {
  return source.kind === "workspace" ? `workspace:${source.workspaceId}:${source.path}` : `asset:${source.assetId}`;
}

export async function fetchGameAssetBytes(source: GameAssetSource, signal?: AbortSignal): Promise<Uint8Array> {
  let response: Response;
  if (source.kind === "workspace") {
    response = await restFetch(workspaceFileDownloadPath(source.workspaceId, source.path), { signal });
  } else {
    const url = await resolveMediaUri(gameAssetLocator(source));
    if (!url) { throw new Error("The asset is unavailable"); }
    response = await fetch(url, { signal });
  }
  if (!response.ok) { throw new Error(`Asset download failed with status ${response.status}`); }
  return new Uint8Array(await response.arrayBuffer());
}

const WAVEFORM_BUCKETS = 48;
const waveforms = new Map<string, Promise<number[] | null>>();
let audioContext: AudioContext | null = null;

/** Peaks for an audio asset, decoded once per source and shared by every row that shows it. */
export function audioWaveform(source: GameAssetSource): Promise<number[] | null> {
  const key = gameAssetSourceKey(source);
  let pending = waveforms.get(key);
  if (!pending) {
    pending = (async () => {
      if (typeof AudioContext === "undefined") { return null; }
      const bytes = await fetchGameAssetBytes(source);
      audioContext ??= new AudioContext();
      const buffer = await audioContext.decodeAudioData(bytes.slice().buffer);
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
      return waveformPeaks(channels, WAVEFORM_BUCKETS);
    })().catch(() => null);
    waveforms.set(key, pending);
  }
  return pending;
}

const fontFamilies = new Map<string, Promise<string | null>>();

/** Loads a font asset into the document and answers its family name, so a row can draw a sample in it. */
export function gameFontFamily(source: GameAssetSource): Promise<string | null> {
  const key = gameAssetSourceKey(source);
  let pending = fontFamilies.get(key);
  if (!pending) {
    pending = (async () => {
      if (typeof FontFace === "undefined" || typeof document === "undefined") { return null; }
      const family = `game-asset-${fontFamilies.size}`;
      const face = await new FontFace(family, (await fetchGameAssetBytes(source)).slice().buffer).load();
      document.fonts.add(face);
      return family;
    })().catch(() => null);
    fontFamilies.set(key, pending);
  }
  return pending;
}

const THUMBNAIL_PIXELS = 192;
const modelThumbnails = new Map<string, Promise<string | null>>();
let thumbnailRenderer: Promise<GameRenderer3D> | null = null;
let renderQueue: Promise<unknown> = Promise.resolve();
const pendingModels = new Map<string, Uint8Array>();

function sharedRenderer(): Promise<GameRenderer3D> {
  thumbnailRenderer ??= (async () => {
    const { createGameRenderer3D } = await import("@nodetool-ai/game-renderer/browser3d");
    const canvas = document.createElement("canvas");
    canvas.width = THUMBNAIL_PIXELS;
    canvas.height = THUMBNAIL_PIXELS;
    const renderer = await createGameRenderer3D({ canvas, preserveDrawingBuffer: true,
      resolveModel: async (modelId) => {
        const bytes = pendingModels.get(modelId);
        return bytes ? { bytes, digest: modelId } : null;
      } });
    renderer.resize(THUMBNAIL_PIXELS, THUMBNAIL_PIXELS);
    return renderer;
  })();
  thumbnailRenderer.catch(() => { thumbnailRenderer = null; });
  return thumbnailRenderer;
}

/**
 * A PNG data URL of a model rendered by the game renderer itself. One
 * offscreen renderer serves every thumbnail, one render at a time, and each
 * digest renders once.
 */
export function modelThumbnail(source: GameAssetSource, digest: string,
  bounds: Parameters<typeof modelThumbnailFrame>[1], colors: ModelThumbnailColors): Promise<string | null> {
  let pending = modelThumbnails.get(digest);
  if (!pending) {
    pending = (async () => {
      const bytes = await fetchGameAssetBytes(source);
      const job = renderQueue.then(async () => {
        const renderer = await sharedRenderer();
        pendingModels.set(digest, bytes);
        try {
          await renderer.render(modelThumbnailFrame(digest, bounds, colors), 1);
          return renderer.canvas.toDataURL("image/png");
        } finally {
          pendingModels.delete(digest);
        }
      });
      renderQueue = job.catch(() => undefined);
      return job;
    })().catch(() => null);
    modelThumbnails.set(digest, pending);
  }
  return pending;
}
