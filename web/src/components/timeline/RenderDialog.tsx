/** @jsxImportSource @emotion/react */
/**
 * RenderDialog — drives the timeline export pipeline.
 *
 * Lifecycle:
 *   idle     → user clicks Start → running
 *   running  → progress events update the bar → done | error
 *   running  → user clicks Cancel → idle (with the AbortController flipped)
 *   done     → user clicks Download → file saved → close
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { shallow } from "zustand/shallow";

import { Dialog, FlexColumn, FlexRow, ProgressBar, Text, Caption, EditorButton } from "../ui_primitives";

import { useTimelineStore } from "../../stores/timeline/TimelineStore";
import { useAssetStore } from "../../stores/AssetStore";
import { getAssetUrl } from "../../utils/assetHelpers";

import {
  checkExportSupport,
  exportTimeline,
  type ExportProgress
} from "../../lib/timeline/export";

interface RenderDialogProps {
  open: boolean;
  onClose: () => void;
  /** Used as the default download filename. */
  sequenceName?: string;
}

type Phase = "idle" | "running" | "done" | "error" | "unsupported";

const contentStyles = (theme: Theme) =>
  css({
    minWidth: 380,
    padding: theme.spacing(0.5, 0, 1, 0),
    ".meta": {
      color: theme.vars.palette.text.secondary
    },
    ".error": {
      color: theme.vars.palette.error.main,
      whiteSpace: "pre-wrap"
    }
  });

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export const RenderDialog: React.FC<RenderDialogProps> = memo(
  ({ open, onClose, sequenceName }) => {
    const theme = useTheme();

    const { tracks, clips, durationMs, fps, width, height } = useTimelineStore(
      (s) => ({
        tracks: s.tracks,
        clips: s.clips,
        durationMs: s.durationMs,
        fps: s.fps,
        width: s.width,
        height: s.height
      }),
      shallow
    );

    const getAsset = useAssetStore((s) => s.get);

    const [phase, setPhase] = useState<Phase>("idle");
    const [progress, setProgress] = useState<ExportProgress>({
      stage: "audio",
      framesDone: 0,
      framesTotal: 0,
      fraction: 0
    });
    const [result, setResult] = useState<{ blob: Blob; frames: number } | null>(
      null
    );
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const support = useMemo(() => checkExportSupport(), []);

    // Reset state every time the dialog re-opens so a previous run's "done"
    // state doesn't bleed into a new export.
    useEffect(() => {
      if (!open) return;
      setPhase(support.ok ? "idle" : "unsupported");
      setError(null);
      setResult(null);
      setProgress({
        stage: "audio",
        framesDone: 0,
        framesTotal: 0,
        fraction: 0
      });
    }, [open, support.ok]);

    useEffect(() => {
      return () => {
        abortRef.current?.abort();
      };
    }, []);

    const resolveAssetUrl = useCallback(
      async (assetId: string): Promise<string | null> => {
        try {
          const asset = await getAsset(assetId);
          return getAssetUrl(asset);
        } catch {
          return null;
        }
      },
      [getAsset]
    );

    const handleStart = useCallback(async () => {
      if (phase === "running") return;
      const controller = new AbortController();
      abortRef.current = controller;
      setPhase("running");
      setError(null);
      setResult(null);

      try {
        const r = await exportTimeline(
          { tracks, clips, durationMs, fps, width, height },
          { fps, width, height, durationMs },
          {
            signal: controller.signal,
            onProgress: (p) => setProgress(p),
            resolveAssetUrl
          }
        );
        setResult({ blob: r.blob, frames: r.frameCount });
        setPhase("done");
      } catch (err) {
        if ((err as Error)?.name === "AbortError") {
          setPhase("idle");
          return;
        }
        setError((err as Error)?.message ?? String(err));
        setPhase("error");
      } finally {
        abortRef.current = null;
      }
    }, [
      phase,
      tracks,
      clips,
      durationMs,
      fps,
      width,
      height,
      resolveAssetUrl
    ]);

    const handleCancel = useCallback(() => {
      abortRef.current?.abort();
    }, []);

    const handleDownload = useCallback(() => {
      if (!result) return;
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sequenceName || "timeline"}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke after a tick so the browser has time to start the download.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, [result, sequenceName]);

    const totalFrames = Math.max(1, Math.round((durationMs / 1000) * fps));
    const stageLabel: Record<ExportProgress["stage"], string> = {
      audio: "Mixing audio…",
      video: `Encoding video (${progress.framesDone} / ${progress.framesTotal} frames)`,
      finalize: "Finalizing…"
    };

    return (
      <Dialog
        open={open}
        onClose={phase === "running" ? undefined : onClose}
        title="Render timeline to MP4"
        actions={
          <FlexRow gap={1} justify="flex-end" fullWidth>
            {phase === "idle" && (
              <>
                <EditorButton onClick={onClose}>Cancel</EditorButton>
                <EditorButton
                  variant="contained"
                  onClick={() => void handleStart()}
                  disabled={durationMs <= 0 || clips.length === 0}
                >
                  Start render
                </EditorButton>
              </>
            )}
            {phase === "running" && (
              <EditorButton onClick={handleCancel}>Cancel</EditorButton>
            )}
            {phase === "done" && (
              <>
                <EditorButton onClick={onClose}>Close</EditorButton>
                <EditorButton variant="contained" onClick={handleDownload}>
                  Download MP4
                </EditorButton>
              </>
            )}
            {(phase === "error" || phase === "unsupported") && (
              <EditorButton onClick={onClose}>Close</EditorButton>
            )}
          </FlexRow>
        }
      >
        <FlexColumn gap={1.5} css={contentStyles(theme)}>
          {phase === "unsupported" && (
            <Text className="error">
              Export requires WebCodecs and WebGPU. Use the latest Chromium
              browser (Chrome / Edge / Brave). Reason: {support.reason}
            </Text>
          )}

          {phase !== "unsupported" && (
            <FlexColumn gap={0.5}>
              <Text size="small" weight={500}>
                {sequenceName || "Untitled sequence"}
              </Text>
              <Caption className="meta">
                {width}×{height} · {fps} fps · {formatDuration(durationMs)} ·{" "}
                {totalFrames.toLocaleString()} frames · MP4 (H.264 + AAC)
              </Caption>
            </FlexColumn>
          )}

          {phase === "running" && (
            <FlexColumn gap={0.5}>
              <ProgressBar
                value={progress.fraction * 100}
                label={stageLabel[progress.stage]}
              />
            </FlexColumn>
          )}

          {phase === "done" && result && (
            <FlexColumn gap={0.5}>
              <Text size="small">
                Rendered {result.frames.toLocaleString()} frames ·{" "}
                {formatBytes(result.blob.size)}
              </Text>
              <Caption className="meta">
                The file stays in memory until you close this dialog.
              </Caption>
            </FlexColumn>
          )}

          {phase === "error" && error && (
            <Text className="error" size="small">
              Render failed: {error}
            </Text>
          )}
        </FlexColumn>
      </Dialog>
    );
  }
);

RenderDialog.displayName = "RenderDialog";

export default RenderDialog;
