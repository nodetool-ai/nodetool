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
import { getAssetUrl } from "../../utils/assetHelpers";
import {
  renderTimeline,
  type RenderProgress
} from "../../components/timeline/render/TimelineRenderer";

export interface UseTimelineExportResult {
  /** Render + download the timeline as an MP4. Resolves when the file is saved. */
  exportVideo: (filename?: string) => Promise<void>;
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

  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const exportVideo = useCallback(
    async (filename?: string) => {
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
        downloadBlob(bytes, mimeType, `${sanitizeFilename(filename ?? "timeline")}.mp4`);
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

  return { exportVideo, cancel, clearError, isExporting, progress, error };
}
