/**
 * Per-model option constraints for the media picker properties.
 *
 * The generic per-property editors (`MediaDurationProperty`,
 * `MediaResolutionVideoProperty`, …) receive only `PropertyProps` — this
 * field's own value — so on their own they can only offer the node's full
 * static enum. That is how a Veo 3.1 node came to offer a 5-second clip: a
 * duration the picker lists and Veo does not sell, which the cost panel then
 * has no published price for and renders as a blank row.
 *
 * These hooks close that gap the same way the chat composer does. They read
 * the node's sibling `model` property, resolve it against the provider's model
 * list — the same `["video-models", provider]` / `["image-models", provider]`
 * React Query entries `useModelsByProvider` fills, so a canvas that already
 * loaded the model menu pays nothing extra — and hand back the constraints the
 * provider manifest declares (`videoConstraints()` in
 * `@nodetool-ai/runtime`'s `manifest-models`).
 *
 * Unknown is not empty. A node with no model selected, a model the provider
 * list does not carry, a query still in flight, or a model that declares no
 * enum all return `{}`, and `buildVideoModelOptions` / `buildImageModelOptions`
 * then fall back to the full static list. Narrowing only ever happens on a
 * stated constraint.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "../lib/trpc";
import { useNodes } from "../contexts/NodeContext";
import type { ImageModel, VideoModel } from "../stores/ApiTypes";
import { videoModelConstraints } from "../components/chat/composer/videoModelOptions";
import { imageModelConstraints } from "../components/chat/composer/imageModelOptions";
import { MODEL_STALE_TIME } from "./useModelsByProvider";

/** The property name every media node carries its provider-model on. */
const MODEL_PROPERTY = "model";

/** A `{ type: "video_model", provider, id }` value as stored on a node. */
interface StoredModelRef {
  provider: string;
  id: string;
}

/** Read a usable provider+id off a node's stored model property, else null. */
export function readStoredModelRef(value: unknown): StoredModelRef | null {
  if (typeof value !== "object" || value === null) return null;
  const ref = value as { provider?: unknown; id?: unknown };
  const provider = typeof ref.provider === "string" ? ref.provider.trim() : "";
  const id = typeof ref.id === "string" ? ref.id.trim() : "";
  return provider !== "" && id !== "" ? { provider, id } : null;
}

/** The model ref stored on `nodeId`'s `model` property, or null. */
function useStoredModelRef(nodeId: string): StoredModelRef | null {
  const findNode = useNodes((state) => state.findNode);
  const stored = findNode(nodeId)?.data?.properties?.[MODEL_PROPERTY];
  // Keyed on provider+id so a re-render that rebuilds the ref object — node
  // data is replaced wholesale on every property edit — does not churn the
  // query key or the constraint memos downstream.
  const ref = readStoredModelRef(stored);
  const provider = ref?.provider;
  const id = ref?.id;
  return useMemo(
    () => (provider && id ? { provider, id } : null),
    [provider, id]
  );
}

/**
 * The selected model's own entry from its provider's model list.
 *
 * Shares `useModelsByProvider`'s query keys and shape, so this resolves off
 * cache whenever the model menu or composer has already loaded that provider,
 * and otherwise costs one request for the one provider the node selected —
 * not the fan-out across every provider that `use*ModelsByProvider` performs.
 */
function useProviderModel<T extends { id: string }>(
  ref: StoredModelRef | null,
  queryKeyPrefix: "video-models" | "image-models",
  fetchModels: (provider: string) => Promise<T[]>
): T | undefined {
  const provider = ref?.provider;
  const { data } = useQuery({
    queryKey: [queryKeyPrefix, provider],
    queryFn: async () => ({
      provider: provider as string,
      models: await fetchModels(provider as string)
    }),
    enabled: !!provider,
    staleTime: MODEL_STALE_TIME,
    refetchOnWindowFocus: false
  });
  const models = data?.models;
  return useMemo(
    () => (ref ? models?.find((m) => m.id === ref.id) : undefined),
    [models, ref]
  );
}

const fetchVideoModels = async (provider: string): Promise<VideoModel[]> => {
  try {
    return ((await trpc.models.videoByProvider.query({ provider })) ||
      []) as VideoModel[];
  } catch {
    // A provider that cannot be listed leaves the constraints unknown, which
    // keeps the full static list — never an empty picker.
    return [];
  }
};

const fetchImageModels = async (provider: string): Promise<ImageModel[]> => {
  try {
    return ((await trpc.models.imageByProvider.query({ provider })) ||
      []) as ImageModel[];
  } catch {
    return [];
  }
};

export interface VideoOptionConstraints {
  durations?: number[];
  resolutions?: string[];
  aspectRatios?: string[];
}

export interface ImageOptionConstraints {
  resolutions?: string[];
  aspectRatios?: string[];
}

/** Duration / resolution / aspect constraints of `nodeId`'s selected video model. */
export function useNodeVideoModelConstraints(
  nodeId: string
): VideoOptionConstraints {
  const ref = useStoredModelRef(nodeId);
  const model = useProviderModel<VideoModel>(
    ref,
    "video-models",
    fetchVideoModels
  );
  return useMemo(
    () => (model ? videoModelConstraints(model) : {}),
    [model]
  );
}

/** Resolution / aspect constraints of `nodeId`'s selected image model. */
export function useNodeImageModelConstraints(
  nodeId: string
): ImageOptionConstraints {
  const ref = useStoredModelRef(nodeId);
  const model = useProviderModel<ImageModel>(
    ref,
    "image-models",
    fetchImageModels
  );
  return useMemo(
    () => (model ? imageModelConstraints(model) : {}),
    [model]
  );
}
