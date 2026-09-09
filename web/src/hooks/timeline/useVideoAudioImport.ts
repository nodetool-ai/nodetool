import { useCallback } from "react";
import {
  makeClip,
  createTimeOrderedUuid,
  type DropMode
} from "@nodetool-ai/timeline";
import type { Asset } from "../../stores/ApiTypes";
import {
  useTimelineStoreApi,
  type TimelineStoreApi
} from "../../stores/timeline/TimelineStore";
import { assetToClip } from "../../components/timeline/dnd/assetToClipAdapter";
import { restFetch } from "../../lib/rest-fetch";
import { getAssetUrl } from "../../utils/assetHelpers";
import { probeMediaDurationMs } from "../../utils/probeMediaDuration";

interface ExtractAudioResponse {
  has_audio: boolean;
  asset?: { id: string; duration?: number | null };
}

/** Abort the extract-audio request if the server hasn't responded in time. */
const EXTRACT_AUDIO_TIMEOUT_MS = 60_000;

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
  startMs: number,
  dropMode: DropMode = "overlap"
): Promise<void> {
  const linkId = createTimeOrderedUuid();

  let videoClip = { ...assetToClip(asset, videoTrackId, startMs), linkId };

  // Resolve the real video span before applying overwrite/insert. Uploaded
  // assets often omit duration, and resolving against the fallback length
  // would trim or ripple the existing timeline by the wrong amount.
  const sourceUrl = getAssetUrl(asset);
  if (asset.duration == null && sourceUrl) {
    const realMs = await probeMediaDurationMs(sourceUrl, "video");
    if (realMs && realMs > 0) {
      videoClip = { ...videoClip, durationMs: realMs };
    }
  }

  // Place the extracted audio on an audio track that is free at the drop
  // position. If every existing audio track already has a clip overlapping
  // this span, a new audio track is created. Remember whether THIS import
  // created the track so it can be cleaned up if the video has no audio.
  const trackIdsBefore = new Set(
    store.getState().tracks.map((t) => t.id)
  );
  const audioTrackId = store.getState().getOrCreateAudioTrack({
    startMs,
    durationMs: videoClip.durationMs
  });
  const createdAudioTrack = !trackIdsBefore.has(audioTrackId);

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
  // The audio track was chosen to be free across this span. Resolve the video
  // mover only so a placeholder that is later removed cannot split or
  // overwrite unrelated audio clips. Its link still protects the placeholder
  // from the global insert shift.
  store.getState().resolveDrop(new Set([videoClip.id]), dropMode);

  // Abort the request if it hangs so the audio clip doesn't sit in
  // "generating" forever; the abort surfaces as a rejection in the catch.
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    EXTRACT_AUDIO_TIMEOUT_MS
  );

  try {
    const res = await restFetch(`/api/assets/${asset.id}/extract-audio`, {
      method: "POST",
      signal: controller.signal
    });
    clearTimeout(timeout);
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
        createdAudioTrack &&
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
    clearTimeout(timeout);
    store.getState().patchClip(audioClip.id, { status: "failed" });
  }
}

/** React binding: returns `importVideoWithAudio` bound to the active store. */
export function useVideoAudioImport() {
  const store = useTimelineStoreApi();
  return useCallback(
    (
      asset: Asset,
      videoTrackId: string,
      startMs: number,
      dropMode: DropMode = "overlap"
    ) => importVideoWithAudio(store, asset, videoTrackId, startMs, dropMode),
    [store]
  );
}
