import { useCallback } from "react";
import { makeClip, createTimeOrderedUuid } from "@nodetool-ai/timeline";
import type { Asset } from "../../stores/ApiTypes";
import {
  useTimelineStoreApi,
  type TimelineStoreApi
} from "../../stores/timeline/TimelineStore";
import { assetToClip } from "../../components/timeline/dnd/assetToClipAdapter";
import { restFetch } from "../../lib/rest-fetch";

interface ExtractAudioResponse {
  has_audio: boolean;
  asset?: { id: string; duration?: number | null };
}

/**
 * Add a video clip on `videoTrackId` and, if the video has an audio track,
 * a linked audio clip on an audio track at the same position. The audio clip
 * appears immediately in an "extracting" (generating) state and is filled in
 * (or removed) once server-side extraction completes.
 *
 * Exported as a standalone function (taking the store api) so it is testable
 * without React; the hook below binds it to the active store.
 */
export async function importVideoWithAudio(
  store: TimelineStoreApi,
  asset: Asset,
  videoTrackId: string,
  startMs: number
): Promise<void> {
  const linkId = createTimeOrderedUuid();

  const videoClip = { ...assetToClip(asset, videoTrackId, startMs), linkId };

  // Track existed before import? Used to decide whether to clean it up when
  // the video turns out to have no audio.
  const audioTrackPreexisted = store
    .getState()
    .tracks.some((t) => t.type === "audio");
  const audioTrackId = store.getState().getOrCreateAudioTrack();

  const audioClip = makeClip({
    trackId: audioTrackId,
    name: `${asset.name} (audio)`,
    startMs,
    durationMs: videoClip.durationMs,
    mediaType: "audio",
    sourceType: "imported",
    status: "generating",
    linkId
  });

  store.getState().addClips([videoClip, audioClip]);

  try {
    const res = await restFetch(`/api/assets/${asset.id}/extract-audio`, {
      method: "POST"
    });
    if (!res.ok) {
      store.getState().patchClip(audioClip.id, { status: "failed" });
      return;
    }
    const data = (await res.json()) as ExtractAudioResponse;

    if (!data.has_audio || !data.asset) {
      // No audio in the video — remove the placeholder (which unlinks the
      // video automatically) and drop the audio track if we just created it
      // and it is now empty.
      store.getState().deleteClip(audioClip.id);
      if (
        !audioTrackPreexisted &&
        !store.getState().clips.some((c) => c.trackId === audioTrackId)
      ) {
        store.getState().removeTrack(audioTrackId);
      }
      return;
    }

    const durationMs =
      data.asset.duration != null
        ? Math.round(data.asset.duration * 1000)
        : audioClip.durationMs;
    store.getState().patchClip(audioClip.id, {
      currentAssetId: data.asset.id,
      durationMs,
      status: "generated"
    });
  } catch {
    store.getState().patchClip(audioClip.id, { status: "failed" });
  }
}

/** React binding: returns `importVideoWithAudio` bound to the active store. */
export function useVideoAudioImport() {
  const store = useTimelineStoreApi();
  return useCallback(
    (asset: Asset, videoTrackId: string, startMs: number) =>
      importVideoWithAudio(store, asset, videoTrackId, startMs),
    [store]
  );
}
