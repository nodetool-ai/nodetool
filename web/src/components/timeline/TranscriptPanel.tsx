/**
 * TranscriptPanel — Studio's transcript-driven editor surface.
 *
 * The script is one freeform text editor ({@link TranscriptEditor}): words are
 * editable text bound to the media, so typing corrects the transcript, deleting
 * ripple-cuts the timeline, and the caret seeks the shared playhead. This panel
 * wraps it with filler removal and media import — all of which mutate the clip
 * model the editor projects from.
 *
 * Uses `ui_primitives` only.
 */

import React, { memo, useCallback, useMemo, useRef, useState } from "react";

import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import CleaningServicesIcon from "@mui/icons-material/CleaningServices";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import EditNoteIcon from "@mui/icons-material/EditNote";
import { useShallow } from "zustand/react/shallow";

import {
  Panel,
  FlexColumn,
  FlexRow,
  Text,
  Caption,
  EditorButton,
  ToolbarIconButton,
  LoadingSpinner,
  SPACING
} from "../ui_primitives";

import { useTimelineStore } from "../../stores/timeline/TimelineStore";
import { useTimelineTranscriptStore } from "../../stores/timeline/TimelineTranscriptStore";
import { buildTranscriptDoc, isTranscriptClip } from "../../stores/timeline/transcriptOps";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useAssetStore } from "../../stores/AssetStore";
import { useExtractScript } from "../../hooks/script/useExtractScript";
import { TranscriptEditor } from "./transcript/TranscriptEditor";

export const TranscriptPanel: React.FC = memo(() => {
  // Only the transcript/caption-bearing subset — untouched clips (B-roll,
  // music) keep their identity across store publishes, so `useShallow`
  // returns the SAME array reference for those publishes and the memo below
  // skips recomputing the doc and filler count for a B-roll drag.
  const clips = useTimelineStore(useShallow((s) => s.clips.filter(isTranscriptClip)));

  const removeFillers = useTimelineTranscriptStore((s) => s.removeFillers);
  const importMedia = useTimelineTranscriptStore((s) => s.importMedia);
  const sequenceId = useTimelineStore((s) => s.sequenceId);
  const createAsset = useAssetStore((s) => s.createAsset);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const { extract, extracting } = useExtractScript();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const { segments, fillerCount } = useMemo(() => {
    const doc = buildTranscriptDoc(clips);
    const fillerCount = doc.segments.reduce(
      (n, s) => n + s.tokens.filter((t) => t.kind === "filler").length,
      0
    );
    return { segments: doc.segments, fillerCount };
  }, [clips]);

  const onImportFile = useCallback(
    async (file: File) => {
      setImporting(true);
      try {
        const asset = await createAsset(file);
        await importMedia(asset);
      } catch (err) {
        addNotification({
          content: `Import failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
          type: "error",
          alert: true
        });
      } finally {
        setImporting(false);
      }
    },
    [createAsset, importMedia, addNotification]
  );

  const onExtractScript = useCallback(async () => {
    if (!sequenceId) return;
    try {
      await extract(sequenceId);
    } catch (err) {
      addNotification({
        content: `Extract as script failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
        type: "error",
        alert: true
      });
    }
  }, [extract, sequenceId, addNotification]);

  return (
    <Panel
      data-testid="transcript-panel"
      background="default"
      bordered={false}
      sx={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column"
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,video/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void onImportFile(file);
        }}
      />
      <FlexColumn gap={SPACING.md} sx={{ p: 0.5, flex: 1, minHeight: 0 }}>
        <FlexRow gap={SPACING.xs} align="center">
          <GraphicEqIcon sx={{ fontSize: 16, color: "primary.main" }} />
          <Text size="smaller" weight={600} sx={{ letterSpacing: "0.1em" }}>
            TRANSCRIPT
          </Text>
        </FlexRow>

        <FlexRow align="center" justify="space-between">
          <FlexRow gap={SPACING.xs} align="baseline">
            <Text size="smaller" weight={600} sx={{ letterSpacing: "0.08em" }}>
              SCRIPT
            </Text>
            <Caption sx={{ color: "text.disabled" }}>
              {segments.length}{" "}
              {segments.length === 1 ? "paragraph" : "paragraphs"}
            </Caption>
          </FlexRow>
          <FlexRow gap={SPACING.xs} align="center">
            {fillerCount > 0 ? (
              <EditorButton
                size="small"
                startIcon={<CleaningServicesIcon fontSize="small" />}
                onClick={removeFillers}
              >
                {`Remove fillers (${fillerCount})`}
              </EditorButton>
            ) : null}
            <ToolbarIconButton
              icon={
                importing ? (
                  <LoadingSpinner size={14} />
                ) : (
                  <UploadFileIcon fontSize="small" />
                )
              }
              tooltip="Import audio or video to transcribe"
              aria-label="Import audio or video"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
            />
            {sequenceId && segments.length > 0 ? (
              <ToolbarIconButton
                icon={
                  extracting ? (
                    <LoadingSpinner size={14} />
                  ) : (
                    <EditNoteIcon fontSize="small" />
                  )
                }
                tooltip="Extract this transcript as an editable script"
                aria-label="Extract as script"
                disabled={extracting}
                onClick={() => void onExtractScript()}
              />
            ) : null}
          </FlexRow>
        </FlexRow>

        <TranscriptEditor />
      </FlexColumn>
    </Panel>
  );
});

TranscriptPanel.displayName = "TranscriptPanel";

export default TranscriptPanel;
