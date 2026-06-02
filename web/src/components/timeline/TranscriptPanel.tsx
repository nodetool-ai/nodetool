/**
 * TranscriptPanel — Studio's transcript-driven editor surface.
 *
 * The script is one freeform text editor ({@link TranscriptEditor}): words are
 * editable text bound to the media, so typing corrects the transcript, deleting
 * ripple-cuts the timeline, and the caret seeks the shared playhead. This panel
 * wraps it with the voice engine, generation, filler removal, and media import
 * — all of which mutate the clip model the editor projects from.
 *
 * Uses `ui_primitives` only.
 */

import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { alpha } from "@mui/material/styles";

import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import MicNoneIcon from "@mui/icons-material/MicNone";
import CleaningServicesIcon from "@mui/icons-material/CleaningServices";
import UploadFileIcon from "@mui/icons-material/UploadFile";

import {
  Panel,
  FlexColumn,
  FlexRow,
  Text,
  Caption,
  EditorButton,
  ToolbarIconButton,
  ScrollArea,
  LoadingSpinner,
  SPACING
} from "../ui_primitives";
import TTSModelSelect from "../properties/TTSModelSelect";
import type { TTSModelValue } from "../../stores/ApiTypes";

import { useTimelineStore } from "../../stores/timeline/TimelineStore";
import { useTimelineTranscriptStore } from "../../stores/timeline/TimelineTranscriptStore";
import { buildTranscriptDoc } from "../../stores/timeline/transcriptOps";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useAssetStore } from "../../stores/AssetStore";
import { TranscriptEditor } from "./transcript/TranscriptEditor";

// ── Status dot ───────────────────────────────────────────────────────────────

type DotTone = "success" | "warning";

const StatusDot: React.FC<{ tone: DotTone }> = ({ tone }) => (
  <FlexRow
    component="span"
    sx={{
      width: 7,
      height: 7,
      borderRadius: "50%",
      flexShrink: 0,
      bgcolor: tone === "warning" ? "warning.main" : "success.main"
    }}
  />
);

// ── Voice engine header ──────────────────────────────────────────────────────

const VoiceCard: React.FC<{ busy: boolean }> = memo(({ busy }) => {
  const { ttsProvider, ttsModel, ttsVoice } = useTimelineTranscriptStore(
    useShallow((s) => ({
      ttsProvider: s.config.ttsProvider,
      ttsModel: s.config.ttsModel,
      ttsVoice: s.config.ttsVoice
    }))
  );
  const setConfig = useTimelineTranscriptStore((s) => s.setConfig);

  const modelValue = useMemo<TTSModelValue>(
    () =>
      ({
        type: "tts_model",
        id: ttsModel,
        provider: ttsProvider,
        name: ttsModel,
        voices: ttsVoice ? [ttsVoice] : [],
        selected_voice: ttsVoice
      }) as TTSModelValue,
    [ttsProvider, ttsModel, ttsVoice]
  );

  const handleModelChange = useCallback(
    (v: TTSModelValue) => {
      setConfig({
        ttsProvider: String(v.provider),
        ttsModel: v.id,
        ttsVoice: v.selected_voice || v.voices?.[0] || ""
      });
    },
    [setConfig]
  );

  return (
    <FlexColumn
      gap={SPACING.sm}
      sx={{
        p: 1.25,
        borderRadius: 1.5,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "action.hover"
      }}
    >
      <FlexRow align="center" justify="space-between">
        <FlexRow gap={SPACING.xs} align="center" sx={{ color: "text.secondary" }}>
          <MicNoneIcon sx={{ fontSize: 15 }} />
          <Caption sx={{ letterSpacing: "0.08em", fontWeight: 700 }}>
            Voice
          </Caption>
        </FlexRow>
        <FlexRow
          gap={SPACING.xs}
          align="center"
          sx={{
            px: 0.75,
            py: 0.25,
            borderRadius: 4,
            bgcolor: (t) =>
              alpha(
                busy ? t.palette.warning.main : t.palette.success.main,
                0.14
              ),
            color: busy ? "warning.main" : "success.main"
          }}
        >
          <StatusDot tone={busy ? "warning" : "success"} />
          <Caption sx={{ fontWeight: 600, color: "inherit" }}>
            {busy ? "generating" : "ready"}
          </Caption>
        </FlexRow>
      </FlexRow>

      <TTSModelSelect value={modelValue} onChange={handleModelChange} />
    </FlexColumn>
  );
});

VoiceCard.displayName = "VoiceCard";

// ── Panel ────────────────────────────────────────────────────────────────────

export const TranscriptPanel: React.FC = memo(() => {
  const clips = useTimelineStore((s) => s.clips);
  const doc = useMemo(() => buildTranscriptDoc(clips), [clips]);
  const segments = doc.segments;

  const clipStatus = useTimelineTranscriptStore((s) => s.clipStatus);
  const generateBeat = useTimelineTranscriptStore((s) => s.generateBeat);
  const removeFillers = useTimelineTranscriptStore((s) => s.removeFillers);
  const importMedia = useTimelineTranscriptStore((s) => s.importMedia);
  const createAsset = useAssetStore((s) => s.createAsset);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const busy = useMemo(
    () => Object.values(clipStatus).some((s) => s === "generating"),
    [clipStatus]
  );

  const fillerCount = useMemo(
    () =>
      doc.segments.reduce(
        (n, s) => n + s.tokens.filter((t) => t.kind === "filler").length,
        0
      ),
    [doc]
  );

  const pendingCount = useMemo(
    () => segments.filter((s) => s.isDraft || s.status === "stale").length,
    [segments]
  );

  const generateAll = useCallback(() => {
    for (const segment of segments) {
      if (!segment.isDraft && segment.status !== "stale") continue;
      void generateBeat(segment.clipIds[0]).catch(() => {
        addNotification({
          content: "One or more lines failed to voice.",
          type: "error",
          alert: false,
          dedupeKey: "studio-generate-all-failed"
        });
      });
    }
  }, [segments, generateBeat, addNotification]);

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

  return (
    <Panel
      data-testid="transcript-panel"
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
      <ScrollArea fullHeight>
        <FlexColumn gap={SPACING.md} sx={{ p: 0.5 }}>
          <FlexRow gap={SPACING.xs} align="center">
            <GraphicEqIcon sx={{ fontSize: 16, color: "primary.main" }} />
            <Text sx={{ letterSpacing: "0.1em", fontWeight: 700, fontSize: 12 }}>
              TRANSCRIPT
            </Text>
          </FlexRow>

          <VoiceCard busy={busy} />

          <FlexRow align="center" justify="space-between">
            <FlexRow gap={SPACING.xs} align="baseline">
              <Text sx={{ letterSpacing: "0.08em", fontWeight: 700, fontSize: 11 }}>
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
              <EditorButton
                size="small"
                variant="contained"
                startIcon={<AutoAwesomeIcon fontSize="small" />}
                onClick={generateAll}
                disabled={pendingCount === 0}
              >
                Generate all
              </EditorButton>
            </FlexRow>
          </FlexRow>

          <TranscriptEditor />
        </FlexColumn>
      </ScrollArea>
    </Panel>
  );
});

TranscriptPanel.displayName = "TranscriptPanel";

export default TranscriptPanel;
