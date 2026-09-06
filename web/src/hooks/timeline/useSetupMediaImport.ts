/**
 * The video flow's "Drop your media" alternative (PRD § 8.1, criterion 1).
 *
 * Files land as clips on the sequence in drop order, on the track their kind
 * belongs on, through the existing import — a video still brings its extracted
 * audio with it, because the flow is not a second, poorer importer.
 *
 * This runs at step 1, before a format is chosen and long before a beat exists.
 * The plan written afterwards then describes the clips that are already there
 * rather than inventing shots on top of them, which is the whole point of the
 * alternative: the creator has the footage, they want a cut.
 *
 * The step forward is conditional. Step 2 ends in the Director, which refuses
 * an empty brief, so footage dropped with nothing said about it leaves the flow
 * on step 1 with the clips already placed and the brief field asking for the
 * one line the planner needs.
 */

import { useCallback, useState } from "react";
import type { Asset } from "../../stores/ApiTypes";
import { useAssetUpload } from "../../serverState/useAssetUpload";
import {
  useTimelineStoreApi,
  type TimelineStoreApi
} from "../../stores/timeline/TimelineStore";
import {
  assetMediaType,
  assetToClip
} from "../../components/timeline/dnd/assetToClipAdapter";
import { importVideoWithAudio } from "./useVideoAudioImport";

/** Where the next clip of this kind starts: after everything on its track. */
const trackEndMs = (store: TimelineStoreApi, trackId: string): number =>
  store
    .getState()
    .clips.filter((clip) => clip.trackId === trackId)
    .reduce((end, clip) => Math.max(end, clip.startMs + clip.durationMs), 0);

const videoTrackId = (store: TimelineStoreApi): string => {
  const video = store.getState().tracks.find((track) => track.type === "video");
  if (video) {
    return video.id;
  }
  return store.getState().insertTrack("video", store.getState().tracks.length, "Video");
};

export interface SetupMediaImportResult {
  /** Assets that became clips, in the order they were dropped. */
  placed: Asset[];
  /** Assets whose content type is not image, video or audio. */
  skipped: Asset[];
  /**
   * Whether the flow moved on to the format step. It only does so once the
   * sequence carries a brief: the planner is what step 2 leads to and it
   * refuses an empty one, so footage with no instruction stops here rather
   * than at a button that cannot run (PRD § 8.1, § 8.2).
   */
  advanced: boolean;
}

/**
 * Place `assets` on the sequence in the order they were dropped, then move the
 * flow on to the format step when the sequence carries a brief. Sequential on purpose: each clip starts where the
 * one before it ends, so the cut reads in drop order rather than in whatever
 * order the extract-audio calls happened to answer.
 */
export async function importSetupMedia(
  store: TimelineStoreApi,
  assets: readonly Asset[]
): Promise<SetupMediaImportResult> {
  const skipped: Asset[] = [];
  const placed: Asset[] = [];
  for (const asset of assets) {
    const mediaType = assetMediaType(asset.content_type);
    if (!mediaType) {
      skipped.push(asset);
      continue;
    }
    if (mediaType === "audio") {
      const trackId = store.getState().getOrCreateAudioTrack();
      store
        .getState()
        .addClips([assetToClip(asset, trackId, trackEndMs(store, trackId))]);
      placed.push(asset);
      continue;
    }
    const trackId = videoTrackId(store);
    const startMs = trackEndMs(store, trackId);
    if (mediaType === "video") {
      await importVideoWithAudio(store, asset, trackId, startMs);
      placed.push(asset);
      continue;
    }
    store.getState().addClips([assetToClip(asset, trackId, startMs)]);
    placed.push(asset);
  }
  // The clips are on the sequence. The flow continues at the format step when
  // there is something to plan against; without a brief it stays on step 1 and
  // asks for one, with the footage already placed.
  const advanced = (store.getState().setup?.brief ?? "").trim().length > 0;
  if (advanced) {
    store.getState().setSetup({ stage: "format" });
  }
  return { placed, skipped, advanced };
}

/**
 * Upload one file and answer with its asset. The upload store is callback
 * shaped; the flow needs the assets back in the order they were picked, so
 * each file is awaited before the next one is placed.
 */
const uploadOne = (
  upload: ReturnType<typeof useAssetUpload.getState>["uploadAsset"],
  file: File
): Promise<Asset> =>
  new Promise((resolve, reject) => {
    upload({
      file,
      onCompleted: resolve,
      onFailed: (error) => reject(new Error(`${file.name}: ${error}`))
    });
  });

export interface UseSetupMediaImport {
  /** Upload the picked files, then place them in pick order. */
  importFiles: (files: readonly File[]) => Promise<SetupMediaImportResult>;
  importing: boolean;
}

export function useSetupMediaImport(): UseSetupMediaImport {
  const store = useTimelineStoreApi();
  const upload = useAssetUpload((state) => state.uploadAsset);
  const [importing, setImporting] = useState(false);

  const importFiles = useCallback(
    async (files: readonly File[]) => {
      setImporting(true);
      try {
        const assets: Asset[] = [];
        for (const file of files) {
          assets.push(await uploadOne(upload, file));
        }
        return await importSetupMedia(store, assets);
      } finally {
        setImporting(false);
      }
    },
    [store, upload]
  );

  return { importFiles, importing };
}

export default useSetupMediaImport;
