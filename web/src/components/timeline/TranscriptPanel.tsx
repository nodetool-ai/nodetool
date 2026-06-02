/**
 * TranscriptPanel — Studio's transcript-driven editor surface.
 *
 * Lists the transcript lines and turns each into a voiced + captioned beat on
 * the timeline. Editing the script edits the video: rewording a line marks its
 * voiceover stale and regenerates it, deleting a line removes its clips and
 * re-flows the timeline, reordering recomputes every beat's position.
 *
 * Layout follows the Studio mock: a voice-engine header, a script sub-header
 * with the beat count and generate actions, then one card per beat showing its
 * position, voiced state, script text, and (once generated) its clip readout.
 * The beat under the playhead is the active card. Uses `ui_primitives` only.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { alpha } from "@mui/material/styles";

import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import MicNoneIcon from "@mui/icons-material/MicNone";
import ReplayIcon from "@mui/icons-material/Replay";
import AddIcon from "@mui/icons-material/Add";

import {
  Panel,
  FlexColumn,
  FlexRow,
  Text,
  Caption,
  EditorButton,
  ToolbarIconButton,
  DeleteButton,
  TextInput,
  EmptyState,
  ScrollArea,
  LoadingSpinner,
  Divider,
  SPACING
} from "../ui_primitives";
import TTSModelSelect from "../properties/TTSModelSelect";
import type { TTSModelValue } from "../../stores/ApiTypes";
import type { TranscriptLine } from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../stores/timeline/TimelineStore";
import { useTimelinePlaybackStore } from "../../stores/timeline/TimelinePlaybackStore";
import { useTimelineUIStore } from "../../stores/timeline/TimelineUIStore";
import {
  useTimelineTranscriptStore,
  type LineGenerationStatus
} from "../../stores/timeline/TimelineTranscriptStore";
import { beatAudioClip, beatDurationMs } from "../../stores/timeline/transcriptOps";
import { useNotificationStore } from "../../stores/NotificationStore";

// ── Time formatting ──────────────────────────────────────────────────────────

const fmtClock = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const fmtDuration = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

// ── Status dot ───────────────────────────────────────────────────────────────

type DotTone = "success" | "warning" | "error" | "idle";

const TONE_COLOR: Record<DotTone, string> = {
  success: "success.main",
  warning: "warning.main",
  error: "error.main",
  idle: "text.disabled"
};

const StatusDot: React.FC<{ tone: DotTone; filled?: boolean }> = ({
  tone,
  filled = true
}) => (
  <FlexRow
    component="span"
    sx={{
      width: 7,
      height: 7,
      borderRadius: "50%",
      flexShrink: 0,
      ...(filled
        ? { bgcolor: TONE_COLOR[tone] }
        : { border: "1.5px solid", borderColor: TONE_COLOR[tone] })
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

// ── Beat row ─────────────────────────────────────────────────────────────────

interface TranscriptLineRowProps {
  line: TranscriptLine;
  index: number;
  total: number;
  status: LineGenerationStatus;
}

const TranscriptLineRow: React.FC<TranscriptLineRowProps> = memo(
  ({ line, index, total, status }) => {
    const [draft, setDraft] = useState(line.text);

    const seek = useTimelinePlaybackStore((s) => s.seek);
    const setSelection = useTimelineUIStore((s) => s.setSelection);

    const editLineText = useTimelineTranscriptStore((s) => s.editLineText);
    const deleteLine = useTimelineTranscriptStore((s) => s.deleteLine);
    const reorderLines = useTimelineTranscriptStore((s) => s.reorderLines);
    const generateBeat = useTimelineTranscriptStore((s) => s.generateBeat);
    const addNotification = useNotificationStore((s) => s.addNotification);

    const orderedIds = useTimelineStore(
      useShallow((s) => s.transcript.map((l) => l.id))
    );

    const { voiced, durationMs } = useTimelineStore(
      useShallow((s) => {
        const audio = beatAudioClip(line, s.clips);
        return {
          voiced:
            !!audio &&
            audio.status === "generated" &&
            !!audio.currentAssetId,
          durationMs: beatDurationMs(line, s.clips)
        };
      })
    );

    const active = useTimelinePlaybackStore(
      (s) =>
        s.currentTimeMs >= line.beatStartMs &&
        s.currentTimeMs < line.beatStartMs + durationMs
    );

    const selectBeat = useCallback(() => {
      seek(line.beatStartMs);
      setSelection(line.clipIds);
    }, [seek, setSelection, line.beatStartMs, line.clipIds]);

    const commitText = useCallback(() => {
      const next = draft.trim();
      if (next !== line.text) editLineText(line.id, next);
    }, [draft, line.text, line.id, editLineText]);

    const move = useCallback(
      (delta: number) => {
        const target = index + delta;
        if (target < 0 || target >= orderedIds.length) return;
        const next = [...orderedIds];
        [next[index], next[target]] = [next[target], next[index]];
        reorderLines(next);
      },
      [index, orderedIds, reorderLines]
    );

    const regenerate = useCallback(() => {
      void generateBeat(line.id).catch((err) => {
        addNotification({
          content: `Beat generation failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
          type: "error",
          alert: true
        });
      });
    }, [generateBeat, line.id, addNotification]);

    const generating = status === "generating";
    const failed = status === "failed";

    const statusLabel = generating
      ? "generating"
      : failed
        ? "failed"
        : voiced
          ? "voiced"
          : "no voice";
    const statusTone: DotTone = failed
      ? "error"
      : voiced
        ? "success"
        : "idle";

    return (
      <FlexColumn
        gap={SPACING.sm}
        sx={{
          p: 1.25,
          borderRadius: 1.5,
          border: "1px solid",
          borderColor: failed
            ? "error.main"
            : active
              ? "primary.main"
              : "divider",
          bgcolor: active ? "action.selected" : "transparent",
          cursor: "pointer",
          transition: "border-color 120ms ease, background-color 120ms ease",
          "& .beat-actions": {
            opacity: active ? 1 : 0,
            transition: "opacity 120ms ease"
          },
          "&:hover .beat-actions": { opacity: 1 }
        }}
        onClick={selectBeat}
        data-testid={`transcript-line-${line.id}`}
      >
        <FlexRow gap={SPACING.xs} align="center" justify="space-between">
          <FlexRow gap={SPACING.sm} align="center" sx={{ minWidth: 0 }}>
            <FlexRow
              align="center"
              justify="center"
              sx={{
                width: 22,
                height: 22,
                borderRadius: 1,
                flexShrink: 0,
                fontSize: 12,
                fontWeight: 700,
                bgcolor: active ? "primary.main" : "action.selected",
                color: active ? "primary.contrastText" : "text.secondary"
              }}
            >
              {index + 1}
            </FlexRow>
            <Caption sx={{ color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
              {fmtClock(line.beatStartMs)}
            </Caption>
            <FlexRow gap={SPACING.xs} align="center" sx={{ minWidth: 0 }}>
              {generating ? (
                <LoadingSpinner size={12} />
              ) : (
                <StatusDot tone={statusTone} filled={voiced || failed} />
              )}
              <Text
                size="small"
                sx={{
                  color: voiced ? "success.main" : "text.secondary",
                  whiteSpace: "nowrap"
                }}
              >
                {statusLabel}
              </Text>
              {voiced && (
                <GraphicEqIcon sx={{ fontSize: 13, color: "success.main" }} />
              )}
            </FlexRow>
          </FlexRow>

          <FlexRow className="beat-actions" gap={SPACING.xxs} align="center">
            <ToolbarIconButton
              icon={<ArrowUpwardIcon fontSize="small" />}
              tooltip="Move beat up"
              aria-label={`Move beat ${index + 1} up`}
              disabled={index === 0}
              onClick={(e) => {
                e.stopPropagation();
                move(-1);
              }}
            />
            <ToolbarIconButton
              icon={<ArrowDownwardIcon fontSize="small" />}
              tooltip="Move beat down"
              aria-label={`Move beat ${index + 1} down`}
              disabled={index === total - 1}
              onClick={(e) => {
                e.stopPropagation();
                move(1);
              }}
            />
            <ToolbarIconButton
              icon={<AutoAwesomeIcon fontSize="small" />}
              tooltip="Generate voiceover + captions for this beat"
              aria-label={`Generate beat ${index + 1}`}
              disabled={generating}
              onClick={(e) => {
                e.stopPropagation();
                regenerate();
              }}
            />
            <DeleteButton
              tooltip="Delete beat"
              aria-label={`Delete beat ${index + 1}`}
              onClick={(e) => {
                e.stopPropagation();
                deleteLine(line.id);
              }}
            />
          </FlexRow>
        </FlexRow>

        <TextInput
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitText}
          onClick={(e) => e.stopPropagation()}
          multiline
          variant="standard"
          size="small"
          placeholder="Write a line of script…"
          aria-label={`Beat ${index + 1} script`}
          InputProps={{ disableUnderline: true }}
          sx={{
            "& .MuiInputBase-root": { p: 0, fontSize: 14, lineHeight: 1.45 },
            "& textarea::placeholder": { opacity: 0.5 }
          }}
        />

        {voiced && (
          <>
            <Divider sx={{ my: 0.25 }} />
            <FlexRow gap={SPACING.sm} align="center">
              <FlexRow
                align="center"
                justify="center"
                sx={{
                  width: 84,
                  height: 47,
                  borderRadius: 1,
                  flexShrink: 0,
                  color: "text.disabled",
                  background: (t) =>
                    `linear-gradient(135deg, ${t.palette.action.selected}, ${t.palette.action.hover})`
                }}
              >
                <GraphicEqIcon sx={{ fontSize: 20 }} />
              </FlexRow>
              <FlexColumn gap={SPACING.xxs} sx={{ flex: 1, minWidth: 0 }}>
                <Text size="small" sx={{ fontWeight: 600 }}>
                  Clip generated
                </Text>
                <Caption sx={{ color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
                  {fmtClock(line.beatStartMs)} → {fmtClock(line.beatStartMs + durationMs)} ·{" "}
                  {fmtDuration(durationMs)}
                </Caption>
              </FlexColumn>
              <ToolbarIconButton
                icon={<ReplayIcon fontSize="small" />}
                tooltip="Regenerate this beat"
                aria-label={`Regenerate beat ${index + 1}`}
                disabled={generating}
                onClick={(e) => {
                  e.stopPropagation();
                  regenerate();
                }}
              />
            </FlexRow>
          </>
        )}
      </FlexColumn>
    );
  }
);

TranscriptLineRow.displayName = "TranscriptLineRow";

// ── Panel ────────────────────────────────────────────────────────────────────

export const TranscriptPanel: React.FC = memo(() => {
  const transcript = useTimelineStore((s) => s.transcript);
  const lineStatus = useTimelineTranscriptStore((s) => s.lineStatus);
  const addLine = useTimelineTranscriptStore((s) => s.addLine);
  const generateBeat = useTimelineTranscriptStore((s) => s.generateBeat);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const busy = useMemo(
    () => Object.values(lineStatus).some((s) => s === "generating"),
    [lineStatus]
  );

  const generateAll = useCallback(() => {
    for (const line of transcript) {
      void generateBeat(line.id).catch(() => {
        addNotification({
          content: "One or more beats failed to generate.",
          type: "error",
          alert: false,
          dedupeKey: "studio-generate-all-failed"
        });
      });
    }
  }, [transcript, generateBeat, addNotification]);

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
      <ScrollArea fullHeight>
        <FlexColumn gap={SPACING.md} sx={{ p: 0.5 }}>
          <FlexColumn gap={SPACING.xxs}>
            <FlexRow gap={SPACING.xs} align="center">
              <GraphicEqIcon sx={{ fontSize: 16, color: "primary.main" }} />
              <Text sx={{ letterSpacing: "0.1em", fontWeight: 700, fontSize: 12 }}>
                TRANSCRIPT
              </Text>
            </FlexRow>
            <Caption sx={{ color: "text.secondary" }}>
              Each line becomes a voiced, captioned beat, generated in the voice
              below.
            </Caption>
          </FlexColumn>

          <VoiceCard busy={busy} />

          <FlexRow align="center" justify="space-between">
            <FlexRow gap={SPACING.xs} align="baseline">
              <Text sx={{ letterSpacing: "0.08em", fontWeight: 700, fontSize: 11 }}>
                SCRIPT
              </Text>
              <Caption sx={{ color: "text.disabled" }}>
                {transcript.length} {transcript.length === 1 ? "beat" : "beats"}
              </Caption>
            </FlexRow>
            <FlexRow gap={SPACING.xs} align="center">
              <EditorButton
                size="small"
                startIcon={<AddIcon fontSize="small" />}
                onClick={() => addLine("")}
              >
                Add line
              </EditorButton>
              <EditorButton
                size="small"
                variant="contained"
                startIcon={<AutoAwesomeIcon fontSize="small" />}
                onClick={generateAll}
                disabled={transcript.length === 0}
              >
                Generate all
              </EditorButton>
            </FlexRow>
          </FlexRow>

          {transcript.length === 0 ? (
            <EmptyState
              icon={<MicNoneIcon />}
              title="No script yet"
              description="Add a line to create your first beat."
            />
          ) : (
            <FlexColumn gap={SPACING.sm}>
              {transcript.map((line, index) => (
                <TranscriptLineRow
                  key={line.id}
                  line={line}
                  index={index}
                  total={transcript.length}
                  status={lineStatus[line.id] ?? "idle"}
                />
              ))}
              <EditorButton
                size="small"
                onClick={() => addLine("")}
                startIcon={<AddIcon fontSize="small" />}
                sx={{
                  width: "100%",
                  justifyContent: "center",
                  border: "1px dashed",
                  borderColor: "divider",
                  color: "text.secondary"
                }}
              >
                Add line
              </EditorButton>
            </FlexColumn>
          )}
        </FlexColumn>
      </ScrollArea>
    </Panel>
  );
});

TranscriptPanel.displayName = "TranscriptPanel";

export default TranscriptPanel;
