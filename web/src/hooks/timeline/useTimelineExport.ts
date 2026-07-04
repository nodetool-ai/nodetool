/**
 * useTimelineExport — drives the offline {@link renderTimeline} export from the
 * timeline editor and downloads the resulting MP4.
 *
 * Pulls the live document straight from {@link useTimelineStore} and resolves
 * clip assets through {@link useAssetStore}, so the export renders exactly the
 * sequence the user is editing.
 */

import { useCallback, useRef, useState } from "react";

import { useTimelineStoreApi } from "../../stores/timeline/TimelineStore";
import { useAssetStore } from "../../stores/AssetStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { getAssetUrl } from "../../utils/assetHelpers";
import {
  renderTimeline,
  type RenderProgress
} from "../../components/timeline/render/TimelineRenderer";

export interface UseTimelineExportResult {
  /** Render + download the timeline as an MP4. Resolves when the file is saved. */
  exportVideo: (filename?: string) => Promise<void>;
  /**
   * Render the timeline and save the MP4 as a new asset in `folderId` (or the
   * library root when null), linked back to this timeline via `timeline_id`.
   * Shares the render + progress + cancel machinery with {@link exportVideo}.
   */
  saveAsAsset: (folderId: string | null, filename?: string) => Promise<void>;
  /** Abort an in-flight render. */
  cancel: () => void;
  /** Dismiss a surfaced error. */
  clearError: () => void;
  isExporting: boolean;
  progress: RenderProgress | null;
  error: string | null;
}

function sanitizeFilename(name: string): string {
  const base = name.trim().replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "");
  return base.length > 0 ? base : "timeline";
}

function downloadBlob(bytes: Uint8Array, mimeType: string, filename: string): void {
  // `bytes` is always backed by a plain ArrayBuffer from the muxer; the cast
  // satisfies the BlobPart typing under the current TS lib.
  const blob = new Blob([bytes as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function clipEndMs(clip: { startMs: number; durationMs: number }): number {
  return clip.startMs + clip.durationMs;
}

/** Minimum time between non-terminal progress state updates, in ms. */
const PROGRESS_UPDATE_INTERVAL_MS = 250;

export function useTimelineExport(): UseTimelineExportResult {
  // `tracks`/`clips`/etc. are only read once, at click time, inside
  // `exportVideo` — reading them via the store api (instead of a reactive
  // selector) means drag/trim/slider ticks that replace `clips` no longer
  // re-render this hook's owner (the whole editor shell).
  const store = useTimelineStoreApi();
  const getAsset = useAssetStore((s) => s.get);
  const createAsset = useAssetStore((s) => s.createAsset);
  const updateAsset = useAssetStore((s) => s.update);

  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearError = useCallback(() => setError(null), []);

  // Shared render core: renders the sequence to MP4 bytes and hands them to a
  // `sink` (download or save-as-asset). Owns the progress / cancel / error
  // lifecycle so both public actions behave identically.
  const runExport = useCallback(
    async (
      sink: (
        bytes: Uint8Array,
        mimeType: string,
        name: string
      ) => void | Promise<void>,
      filename?: string
    ) => {
      if (abortRef.current) return; // already running
      const controller = new AbortController();
      abortRef.current = controller;
      setIsExporting(true);
      setError(null);
      setProgress({ phase: "preparing", frame: 0, totalFrames: 0, ratio: 0 });

      const resolveUrl = async (
        assetId: string
      ): Promise<string | undefined> => {
        try {
          const asset = await getAsset(assetId);
          return getAssetUrl(asset) ?? undefined;
        } catch {
          return undefined;
        }
      };

      // Coalesce per-frame progress into React state: at most one update per
      // `PROGRESS_UPDATE_INTERVAL_MS`, plus every integer-percent change, plus
      // the terminal update (ratio 1) so the dialog always reaches 100%.
      let lastProgressPercent = -1;
      let lastProgressAtMs = 0;
      const handleProgress = (next: RenderProgress): void => {
        const percent = Math.round(next.ratio * 100);
        const now = Date.now();
        const isTerminal = next.ratio >= 1;
        if (
          isTerminal ||
          percent !== lastProgressPercent ||
          now - lastProgressAtMs >= PROGRESS_UPDATE_INTERVAL_MS
        ) {
          lastProgressPercent = percent;
          lastProgressAtMs = now;
          setProgress(next);
        }
      };

      try {
        const state = store.getState();
        const clipsDurationMs = state.clips.reduce(
          (max, clip) => Math.max(max, clipEndMs(clip)),
          0
        );
        const exportDurationMs = Math.max(state.durationMs, clipsDurationMs);
        if (exportDurationMs <= 0) {
          throw new Error("Add a clip before exporting.");
        }

        const { bytes, mimeType } = await renderTimeline({
          tracks: state.tracks,
          clips: state.clips,
          width: state.width,
          height: state.height,
          fps: state.fps,
          durationMs: exportDurationMs,
          resolveUrl,
          signal: controller.signal,
          onProgress: handleProgress
        });
        await sink(bytes, mimeType, sanitizeFilename(filename ?? "timeline"));
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // User cancelled — not an error.
        } else {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        abortRef.current = null;
        setIsExporting(false);
        setProgress(null);
      }
    },
    [store, getAsset]
  );

  const exportVideo = useCallback(
    (filename?: string) =>
      runExport((bytes, mimeType, name) => {
        downloadBlob(bytes, mimeType, `${name}.mp4`);
      }, filename),
    [runExport]
  );

  const saveAsAsset = useCallback(
    (folderId: string | null, filename?: string) =>
      runExport(async (bytes, mimeType, name) => {
        const file = new File([bytes as BlobPart], `${name}.mp4`, {
          type: mimeType
        });
        const asset = await createAsset(
          file,
          undefined,
          folderId ?? undefined,
          undefined,
          "file"
        );
        // Link the exported video back to this timeline so it can be traced.
        const sequenceId = store.getState().sequenceId;
        if (sequenceId) {
          await updateAsset({ id: asset.id, timeline_id: sequenceId });
        }
        useNotificationStore.getState().addNotification({
          type: "success",
          content: "Saved timeline to assets."
        });
      }, filename),
    [runExport, createAsset, updateAsset, store]
  );

  return {
    exportVideo,
    saveAsAsset,
    cancel,
    clearError,
    isExporting,
    progress,
    error
  };
}
