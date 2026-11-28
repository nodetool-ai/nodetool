/**
 * The Piano Roll and Step Editor tabs on a pattern region (SQ27, D86): the
 * notes are derived from the pattern, so these views draw the expanded notes
 * read-only and dimmed, with the conversion as the way to edit them.
 */

import React, { memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import { expandPatternClip, msToTicks, resolveTempo } from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { findClipById } from "../../../stores/timeline/clipLookup";
import { Box, BORDER_RADIUS, Caption, EditorButton, FlexColumn, FlexRow, ScrollArea, SPACING } from "../../ui_primitives";
import { KEYBOARD_WIDTH_PX, PianoRollKeyboard } from "../pianoRoll/PianoRollKeyboard";
import { makeRowSet, pitchName, type PianoRollGeometry } from "../pianoRoll/pianoRollGeometry";
import ErrorBanner from "../../support/ErrorBanner";
import { useStepPatternOps } from "./useStepPatternOps";

/** Dimmed like a disabled control: the notes read, but do not invite edits. */
const READ_ONLY_OPACITY = 0.55;
/** One pitch row, tall enough for the key name the editable Piano Roll draws. */
const ROW_HEIGHT_PX = 18;

interface Props {
  clipId: string;
  /** The tab the read-only notes stand in for. */
  view?: "pianoRoll" | "stepEditor";
}

export const PatternRegionNotice: React.FC<Props> = memo(({ clipId, view = "pianoRoll" }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const ops = useStepPatternOps();
  const [error, setError] = useState<string | null>(null);
  const clip = useTimelineStore((s) => findClipById(s.clips, clipId));
  const tracks = useTimelineStore((s) => s.tracks);
  const tempo = useTimelineStore((s) => s.tempo);

  const expanded = useMemo(() => {
    if (!clip?.pattern) return null;
    const notes = expandPatternClip(clip, { tracks, tempo })?.notes ?? [];
    const totalTicks = Math.max(1, msToTicks(clip.durationMs, resolveTempo({ tempo }).bpm));
    const pitches = notes.map((n) => n.pitch);
    const low = pitches.length > 0 ? Math.min(...pitches) : 60;
    const high = pitches.length > 0 ? Math.max(...pitches) : 60;
    // The Piano Roll's Collapse Mode: one named row per pitch the pattern plays.
    const rowSet = makeRowSet([...new Set(pitches)].sort((a, b) => b - a));
    const geometry: PianoRollGeometry = { pxPerTick: 1, scrollTick: 0, rowHeightPx: ROW_HEIGHT_PX, topPitch: high, rows: rowSet, topRow: 0 };
    return { notes, totalTicks, rowSet, geometry };
  }, [clip, tracks, tempo]);

  const convert = () => {
    ops.run([{ op: "convert_pattern_to_midi", clipIds: [clipId] }]).then(
      () => setError(null),
      (err: unknown) => setError(err instanceof Error ? err.message : String(err))
    );
  };

  const notesLayer = (
    <Box sx={{ position: "relative", flex: 1, minWidth: 0, height: "100%", opacity: READ_ONLY_OPACITY, pointerEvents: "none" }}>
      {expanded?.notes.map((note) => {
        const left = (note.startTick / expanded.totalTicks) * 100;
        const width = Math.max(0.4, (note.durationTick / expanded.totalTicks) * 100);
        const placement =
          view === "pianoRoll"
            ? { top: (expanded.rowSet.index.get(note.pitch) ?? 0) * ROW_HEIGHT_PX, height: ROW_HEIGHT_PX }
            : { bottom: 0, height: `${(note.velocity / 127) * 100}%` };
        return (
          <Box
            key={note.id}
            data-testid="pattern-readonly-note"
            sx={{
              position: "absolute",
              left: `${left}%`,
              width: view === "pianoRoll" ? `${width}%` : `max(2px, ${width / 3}%)`,
              ...placement,
              boxSizing: "border-box",
              border: `1px solid ${theme.vars.palette.background.default}`,
              borderRadius: BORDER_RADIUS.xs,
              backgroundColor: theme.vars.palette.primary.main
            }}
          />
        );
      })}
    </Box>
  );

  return (
    <FlexColumn fullWidth gap={SPACING.sm} sx={{ flex: 1, minHeight: 0, p: SPACING.md }} data-testid="pattern-region-notice">
      {error && (
        <ErrorBanner data-testid="pattern-region-notice-error" report={{ source: "operation-failure", summary: t("stepSequencer.editFailed"), errorText: error }}>
          {error}
        </ErrorBanner>
      )}
      <FlexRow fullWidth align="center" justify="space-between" gap={SPACING.md}>
        <Caption color="muted">{t("stepSequencer.patternNotice")}</Caption>
        <EditorButton variant="outlined" onClick={convert}>
          {t("stepSequencer.convertToMidi")}
        </EditorButton>
      </FlexRow>
      <Box
        role="img"
        aria-label={t("stepSequencer.readOnlyNotes")}
        aria-readonly="true"
        data-testid="pattern-readonly-view"
        data-view={view}
        sx={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          userSelect: "none",
          overflow: "hidden",
          borderRadius: BORDER_RADIUS.sm,
          border: `1px solid ${theme.vars.palette.divider}`,
          backgroundColor: theme.vars.palette.action.hover
        }}
      >
        {view === "pianoRoll" && expanded ? (
          <ScrollArea sx={{ height: "100%" }}>
            <FlexRow sx={{ height: expanded.rowSet.pitches.length * ROW_HEIGHT_PX, minHeight: "100%" }}>
              <Box
                data-testid="pattern-readonly-keyboard"
                data-pitches={expanded.rowSet.pitches.map(pitchName).join(",")}
                sx={{ width: KEYBOARD_WIDTH_PX, flexShrink: 0, pointerEvents: "none" }}
              >
                <PianoRollKeyboard geometry={expanded.geometry} heightPx={expanded.rowSet.pitches.length * ROW_HEIGHT_PX} instrument={undefined} />
              </Box>
              {notesLayer}
            </FlexRow>
          </ScrollArea>
        ) : (
          notesLayer
        )}
      </Box>
    </FlexColumn>
  );
});
PatternRegionNotice.displayName = "PatternRegionNotice";
