/**
 * Render and store a 3D clip's Blockout reference from the browser.
 *
 * The render itself is `renderBlockoutReference`. This hook owns what
 * surrounds it: reading the clip and its glTF, the progress and failure state
 * in `BlockoutReferenceStore`, cancellation, the upload of the MP4 as a video
 * asset, and the write of `model3dStyle.reference` with the hash the frames
 * were rendered at. The stored shape is the one the `render_model3d_reference`
 * op writes, so either surface can make the reference.
 */

import { useCallback } from "react";

import {
  DEFAULT_MODEL3D_REFERENCE_PASS,
  computeModel3DReferenceHash,
  model3dReferenceStatus,
  type Model3DReferencePass,
  type TimelineClip
} from "@nodetool-ai/timeline";

import { useAssetStore } from "../../stores/AssetStore";
import {
  blockoutReferenceKey,
  useBlockoutReferenceStore
} from "../../stores/timeline/BlockoutReferenceStore";
import { useTimelineStoreApi } from "../../stores/timeline/TimelineStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { renderBlockoutReference } from "../../components/timeline/render/renderBlockoutReference";
import { getAssetUrl } from "../../utils/assetHelpers";

export type BlockoutReference = NonNullable<
  NonNullable<TimelineClip["model3dStyle"]>["reference"]
>;

/**
 * The render in flight for each clip. A request joins it only when it asks for
 * the same picture: the same pass, dependency hash and set revision. Any other
 * request waits for it to settle and then renders, so a result is never stored
 * under a hash or a pass it was not drawn at.
 */
const inFlight = new Map<
  string,
  {
    requestKey: string;
    controller: AbortController;
    promise: Promise<BlockoutReference>;
  }
>();

export interface UseBlockoutReferenceResult {
  /** Render the clip's span in `pass` and store the result on the clip. */
  renderReference: (
    clipId: string,
    pass?: Model3DReferencePass
  ) => Promise<BlockoutReference>;
  /**
   * The clip's reference, rendered first when it is missing or stale, or when
   * the set was saved since it was rendered. Keeps the stored pass, and uses
   * the default pass when there is none.
   */
  ensureReference: (clipId: string) => Promise<BlockoutReference>;
  /**
   * Render and store the video for a clip as given, without writing the clip.
   * This is what the `render_model3d_reference` op calls in the browser: the
   * op writes `model3dStyle.reference` itself.
   */
  renderReferenceAsset: (
    clip: TimelineClip,
    sequence: { fps: number; width: number; height: number },
    pass: Model3DReferencePass
  ) => Promise<BlockoutReference>;
  /** Abort the clip's render, if one is running. */
  cancel: (clipId: string) => void;
}

export function useBlockoutReference(): UseBlockoutReferenceResult {
  const timeline = useTimelineStoreApi();
  const getAsset = useAssetStore((s) => s.get);
  const createAsset = useAssetStore((s) => s.createAsset);

  const renderReferenceAsset = useCallback(
    async (
      clip: TimelineClip,
      sequence: { fps: number; width: number; height: number },
      pass: Model3DReferencePass
    ): Promise<BlockoutReference> => {
      const style = clip.model3dStyle;
      if (clip.mediaType !== "model3d" || !style) {
        throw new Error(
          `Clip "${clip.name}" is not a 3D clip, so it has no reference to render.`
        );
      }
      const assetId = clip.currentAssetId;
      if (!assetId) {
        throw new Error(`Clip "${clip.name}" has no glTF asset to render.`);
      }
      // Read fresh: the set is saved in place, and its `updated_at` is the
      // only thing that shows an edit to it.
      const asset = await getAsset(assetId);
      const assetRevision = asset.updated_at ?? undefined;
      const dependencyHash = computeModel3DReferenceHash(clip, sequence, pass);
      const key = blockoutReferenceKey(timeline.getState().sequenceId, clip.id);
      const requestKey = JSON.stringify([pass, dependencyHash, assetRevision]);

      const running = inFlight.get(key);
      if (running?.requestKey === requestKey) {
        return running.promise;
      }

      const controller = new AbortController();
      const previous = running?.promise.catch(() => undefined);
      const run = async (): Promise<BlockoutReference> => {
        await previous;
        if (controller.signal.aborted) {
          throw new DOMException(
            "The reference render was cancelled.",
            "AbortError"
          );
        }
        useBlockoutReferenceStore.getState().start(key);
        const url = getAssetUrl(asset);
        if (!url) {
          throw new Error(`The glTF asset ${assetId} has no URL.`);
        }
        const response = await fetch(url, {
          signal: controller.signal,
          cache: "no-cache"
        });
        if (!response.ok) {
          throw new Error(`Could not read the glTF asset (${response.status}).`);
        }
        const glb = new Uint8Array(await response.arrayBuffer());

        const video = await renderBlockoutReference({
          clip,
          sequence,
          pass,
          glb,
          signal: controller.signal,
          onProgress: (done, total) =>
            useBlockoutReferenceStore.getState().setProgress(key, done, total)
        });
        // Stored in the project the set and the timeline belong to.
        const projectId =
          useWorkspaceTabsStore.getState().activeProjectId ?? undefined;
        const stored = await createAsset(
          new File(
            [video.bytes as BlobPart],
            `${clip.name || "clip"}-reference-${pass}.mp4`,
            { type: video.mimeType }
          ),
          undefined,
          undefined,
          undefined,
          "file",
          projectId
        );
        return {
          assetId: stored.id,
          dependencyHash,
          pass,
          ...(assetRevision !== undefined && { assetRevision })
        };
      };

      const settle = (): void => {
        if (inFlight.get(key)?.controller === controller) {
          inFlight.delete(key);
        }
      };
      const promise = run().then(
        (reference) => {
          settle();
          useBlockoutReferenceStore.getState().finish(key);
          return reference;
        },
        (error: unknown) => {
          settle();
          const message = error instanceof Error ? error.message : String(error);
          if (controller.signal.aborted) {
            useBlockoutReferenceStore.getState().finish(key);
          } else {
            useBlockoutReferenceStore.getState().fail(key, message);
          }
          throw error instanceof Error ? error : new Error(message);
        }
      );
      inFlight.set(key, { requestKey, controller, promise });
      return promise;
    },
    [timeline, getAsset, createAsset]
  );

  const renderReference = useCallback(
    async (
      clipId: string,
      requestedPass?: Model3DReferencePass
    ): Promise<BlockoutReference> => {
      const store = timeline.getState();
      const clip = store.clips.find((c) => c.id === clipId);
      if (!clip) {
        throw new Error(`No clip ${clipId} on this timeline.`);
      }
      const reference = await renderReferenceAsset(
        clip,
        { fps: store.fps, width: store.width, height: store.height },
        requestedPass ??
          clip.model3dStyle?.reference?.pass ??
          DEFAULT_MODEL3D_REFERENCE_PASS
      );
      // Written onto the style the clip has now. An edit made while the
      // frames were drawn stays, and the hash then reads stale.
      const current = timeline.getState().clips.find((c) => c.id === clipId);
      const style = current?.model3dStyle ?? clip.model3dStyle;
      if (style) {
        timeline.getState().patchClip(clipId, {
          model3dStyle: { ...style, reference }
        } satisfies Partial<TimelineClip>);
      }
      return reference;
    },
    [timeline, renderReferenceAsset]
  );

  const ensureReference = useCallback(
    async (clipId: string): Promise<BlockoutReference> => {
      const store = timeline.getState();
      const clip = store.clips.find((c) => c.id === clipId);
      if (!clip) throw new Error(`No clip ${clipId} on this timeline.`);
      const sequence = {
        fps: store.fps,
        width: store.width,
        height: store.height
      };
      const reference = clip.model3dStyle?.reference;
      if (reference && clip.currentAssetId) {
        // The set is saved in place: ask for its revision, not the cache.
        const asset = await getAsset(clip.currentAssetId);
        const status = model3dReferenceStatus(clip, sequence, {
          assetRevision: asset.updated_at ?? undefined
        });
        if (status === "current") {
          return reference;
        }
      }
      return renderReference(clipId, reference?.pass);
    },
    [timeline, renderReference, getAsset]
  );

  const cancel = useCallback(
    (clipId: string): void => {
      const key = blockoutReferenceKey(timeline.getState().sequenceId, clipId);
      inFlight.get(key)?.controller.abort();
    },
    [timeline]
  );

  return { renderReference, ensureReference, renderReferenceAsset, cancel };
}
