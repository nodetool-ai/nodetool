/**
 * TranscriptPanel — Studio's transcript-driven editor surface.
 *
 * The transcript is one freeform text editor ({@link TranscriptEditor}): words are
 * editable text bound to the media, so typing corrects the transcript, deleting
 * ripple-cuts the timeline, and the caret seeks the shared playhead. This panel
 * wraps it with filler removal and media import — all of which mutate the clip
 * model the editor projects from.
 *
 * Uses `ui_primitives` only.
 */

import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import CleaningServicesIcon from "@mui/icons-material/CleaningServices";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import EditNoteIcon from "@mui/icons-material/EditNote";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import CheckIcon from "@mui/icons-material/Check";
import { useShallow } from "zustand/react/shallow";

import {
  Panel,
  FlexColumn,
  FlexRow,
  Text,
  Caption,
  EditorButton,
  ToolbarIconButton,
  SPACING,
  ICON_SIZE
} from "../ui_primitives";

import {
  useTimelineStore,
  useTimelineStoreApi
} from "../../stores/timeline/TimelineStore";
import { useTimelineTranscriptStore } from "../../stores/timeline/TimelineTranscriptStore";
import { buildTranscriptDoc, isTranscriptClip } from "../../stores/timeline/transcriptOps";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useAssetStore } from "../../stores/AssetStore";
import { useExtractScript } from "../../hooks/script/useExtractScript";
import {
  TranscriptEditor,
  type TranscriptEditorMode
} from "./transcript/TranscriptEditor";

interface TranscriptPanelProps {
  /** An extra control at the end of the header actions. */
  headerAction?: React.ReactNode;
}

export const TranscriptPanel: React.FC<TranscriptPanelProps> = memo(({ headerAction }) => {
  const { t } = useTranslation();
  // Only the transcript/caption-bearing subset — untouched clips (B-roll,
  // music) keep their identity across store publishes, so `useShallow`
  // returns the SAME array reference for those publishes and the memo below
  // skips recomputing the doc and filler count for a B-roll drag.
  const clips = useTimelineStore(useShallow((s) => s.clips.filter(isTranscriptClip)));

  const removeFillers = useTimelineTranscriptStore((s) => s.removeFillers);
  const importMedia = useTimelineTranscriptStore((s) => s.importMedia);
  const sequenceId = useTimelineStore((s) => s.sequenceId);
  const docApi = useTimelineStoreApi();
  const createAsset = useAssetStore((s) => s.createAsset);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const { extract, extracting } = useExtractScript();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [mode, setMode] = useState<TranscriptEditorMode>("script");
  const writing = mode === "write";

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
          content: t("i18n-next65.timeline.transcript.importFailed", {
            error: err instanceof Error ? err.message : String(err)
          }),
          type: "error",
          alert: true
        });
      } finally {
        setImporting(false);
      }
    },
    [createAsset, importMedia, addNotification, t]
  );

  const onExtractScript = useCallback(async () => {
    if (!sequenceId) return;
    try {
      // The live clips, so edits autosave has not written yet are included.
      await extract(sequenceId, docApi.getState().clips);
    } catch (err) {
      addNotification({
        content: t("i18n-next65.timeline.transcript.extractFailed", {
          error: err instanceof Error ? err.message : String(err)
        }),
        type: "error",
        alert: true
      });
    }
  }, [extract, sequenceId, docApi, addNotification, t]);

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
          <GraphicEqIcon sx={{ fontSize: ICON_SIZE.sm, color: "primary.main" }} />
          <Text size="smaller" sx={{ letterSpacing: "0.1em" }}>
            {t("i18n-next65.timeline.transcript.transcriptLabel")}
          </Text>
        </FlexRow>

        <FlexRow align="center" justify="space-between">
          <FlexRow gap={SPACING.xs} align="baseline">
            <Text size="smaller" sx={{ letterSpacing: "0.08em" }}>
              {t("i18n-next65.timeline.transcript.wordsLabel")}
            </Text>
            <Caption sx={{ color: "text.disabled" }}>
              {t("i18n-next65.timeline.transcript.paragraphs", {
                count: segments.length
              })}
            </Caption>
          </FlexRow>
          <FlexRow gap={SPACING.xs} align="center">
            <ToolbarIconButton
              icon={
                writing ? (
                  <CheckIcon fontSize="small" />
                ) : (
                  <EditOutlinedIcon fontSize="small" />
                )
              }
              tooltip={t(
                writing
                  ? "i18n-next65.timeline.transcript.doneEditingTooltip"
                  : "i18n-next65.timeline.transcript.editTooltip"
              )}
              aria-label={t(
                writing
                  ? "i18n-next65.timeline.transcript.doneEditingLabel"
                  : "i18n-next65.timeline.transcript.editLabel"
              )}
              active={writing}
              onClick={() => setMode(writing ? "script" : "write")}
            />
            {fillerCount > 0 ? (
              <EditorButton
                size="small"
                startIcon={<CleaningServicesIcon />}
                onClick={removeFillers}
              >
                {t("i18n-next65.timeline.transcript.removeFillers", {
                  count: fillerCount
                })}
              </EditorButton>
            ) : null}
            <ToolbarIconButton
              icon={<UploadFileIcon fontSize="small" />}
              tooltip={t("i18n-next65.timeline.transcript.importTooltip")}
              aria-label={t("i18n-next65.timeline.transcript.importLabel")}
              loading={importing}
              onClick={() => fileInputRef.current?.click()}
            />
            {sequenceId && segments.length > 0 ? (
              <ToolbarIconButton
                icon={<EditNoteIcon fontSize="small" />}
                tooltip={t("i18n-next65.timeline.transcript.extractTooltip")}
                aria-label={t("i18n-next65.timeline.transcript.extractLabel")}
                loading={extracting}
                onClick={() => void onExtractScript()}
              />
            ) : null}
            {headerAction}
          </FlexRow>
        </FlexRow>

        <TranscriptEditor mode={mode} onModeChange={setMode} />
      </FlexColumn>
    </Panel>
  );
});

TranscriptPanel.displayName = "TranscriptPanel";

export default TranscriptPanel;
