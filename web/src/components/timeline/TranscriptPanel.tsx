/**
 * TranscriptPanel — Studio's transcript-driven editor surface.
 *
 * Lists the transcript lines and turns each into a voiced + captioned beat on
 * the timeline. Editing the script edits the video: rewording a line marks its
 * voiceover stale and regenerates it, deleting a line removes its clips and
 * re-flows the timeline, reordering recomputes every beat's position.
 *
 * Docked beside the timeline like the Inspector. Uses `ui_primitives` only.
 */

import React, { memo, useCallback, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import SubtitlesIcon from "@mui/icons-material/Subtitles";

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
  SPACING
} from "../ui_primitives";
import type { TranscriptLine } from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../stores/timeline/TimelineStore";
import { useTimelinePlaybackStore } from "../../stores/timeline/TimelinePlaybackStore";
import { useTimelineUIStore } from "../../stores/timeline/TimelineUIStore";
import {
  useTimelineTranscriptStore,
  type LineGenerationStatus
} from "../../stores/timeline/TimelineTranscriptStore";
import { useNotificationStore } from "../../stores/NotificationStore";

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

    return (
      <FlexColumn
        gap={SPACING.xs}
        sx={{
          p: 1,
          borderRadius: 1,
          border: "1px solid",
          borderColor: status === "failed" ? "error.main" : "divider",
          cursor: "pointer"
        }}
        onClick={selectBeat}
        data-testid={`transcript-line-${line.id}`}
      >
        <FlexRow gap={SPACING.xs} align="center" justify="space-between">
          <Caption>Beat {index + 1}</Caption>
          <FlexRow gap={SPACING.xs} align="center">
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
            {generating ? (
              <LoadingSpinner size={18} />
            ) : (
              <ToolbarIconButton
                icon={<AutoAwesomeIcon fontSize="small" />}
                tooltip="Generate voiceover + captions for this beat"
                aria-label={`Generate beat ${index + 1}`}
                onClick={(e) => {
                  e.stopPropagation();
                  regenerate();
                }}
              />
            )}
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
          compact
          size="small"
          placeholder="Write a line of script…"
          aria-label={`Beat ${index + 1} script`}
        />
      </FlexColumn>
    );
  }
);

TranscriptLineRow.displayName = "TranscriptLineRow";

export const TranscriptPanel: React.FC = memo(() => {
  const transcript = useTimelineStore((s) => s.transcript);
  const lineStatus = useTimelineTranscriptStore((s) => s.lineStatus);
  const addLine = useTimelineTranscriptStore((s) => s.addLine);
  const generateBeat = useTimelineTranscriptStore((s) => s.generateBeat);
  const addNotification = useNotificationStore((s) => s.addNotification);

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
      title="Transcript"
      subtitle="Write a script — each line becomes a voiced, captioned beat."
      headerAction={
        <FlexRow gap={SPACING.xs}>
          <EditorButton size="small" onClick={() => addLine("")}>
            Add line
          </EditorButton>
          <EditorButton
            size="small"
            variant="contained"
            onClick={generateAll}
            disabled={transcript.length === 0}
          >
            Generate all
          </EditorButton>
        </FlexRow>
      }
      sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}
    >
      {transcript.length === 0 ? (
        <EmptyState
          icon={<SubtitlesIcon />}
          title="No script yet"
          description="Add a line to create your first beat."
        />
      ) : (
        <ScrollArea fullHeight>
          <FlexColumn gap={SPACING.sm} sx={{ p: 0.5 }}>
            {transcript.map((line, index) => (
              <TranscriptLineRow
                key={line.id}
                line={line}
                index={index}
                total={transcript.length}
                status={lineStatus[line.id] ?? "idle"}
              />
            ))}
            <Text size="small" sx={{ color: "text.secondary", px: 0.5 }}>
              Click a beat to jump the playhead and select its clips.
            </Text>
          </FlexColumn>
        </ScrollArea>
      )}
    </Panel>
  );
});

TranscriptPanel.displayName = "TranscriptPanel";

export default TranscriptPanel;
