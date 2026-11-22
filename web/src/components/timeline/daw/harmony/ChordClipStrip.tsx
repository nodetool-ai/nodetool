/**
 * The chord strip along the bottom edge of a MIDI clip that follows the chord
 * track in the music view: one cell per chord under the clip, in a darker
 * shade of the chord's colour. A clip that does not follow chords has none.
 */

import React, { memo, useMemo } from "react";
import { chordName, chordTrackFor, resolveTempo, type TimelineClip } from "@nodetool-ai/timeline";

import { useTimelineLayoutStore } from "../../../../stores/timeline/TimelineLayoutStore";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";
import { Box, SPACING, Text, getSpacingPx } from "../../../ui_primitives";
import { chordColor } from "./chordGrid";
import { chordStripCells, followsChordTrack } from "./chordRows";

/** Height of the strip. */
export const CHORD_STRIP_PX = 14;

export interface ChordClipStripProps {
  clip: Pick<TimelineClip, "mediaType" | "startMs" | "durationMs" | "harmony">;
}

export const ChordClipStrip = memo(function ChordClipStrip({ clip }: ChordClipStripProps): React.JSX.Element | null {
  const dawMode = useTimelineLayoutStore((s) => s.dawMode);
  const follows = clip.mediaType === "midi" && followsChordTrack(clip.harmony);
  const tracks = useTimelineStore((s) => s.tracks);
  const tempoState = useTimelineStore((s) => s.tempo);
  const msPerPx = useTimelineUIStore((s) => s.msPerPx);
  const chords = useMemo(
    () => (dawMode && follows ? (chordTrackFor(clip.harmony, tracks)?.chords ?? []) : []),
    [dawMode, follows, clip.harmony, tracks]
  );
  const cells = useMemo(
    () => chordStripCells(chords, clip, resolveTempo({ tempo: tempoState }), msPerPx),
    [chords, clip, tempoState, msPerPx]
  );
  if (!dawMode || !follows || cells.length === 0) {
    return null;
  }
  return (
    <Box
      aria-hidden
      data-testid="chord-clip-strip"
      sx={{ position: "absolute", left: 0, right: 0, bottom: 0, height: CHORD_STRIP_PX, overflow: "hidden", pointerEvents: "none" }}
    >
      {cells.map((cell) => (
        <Box
          key={cell.id}
          style={{ left: cell.leftPx, width: Math.max(1, cell.widthPx - 1), backgroundColor: chordColor(cell.chord.root, "strip") }}
          sx={{
            position: "absolute",
            top: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            paddingInline: getSpacingPx(SPACING.xs),
            overflow: "hidden",
            color: "text.primary"
          }}
        >
          {cell.widthPx > 18 && (
            <Text size="smaller" color="inherit" truncate>
              {chordName(cell.chord)}
            </Text>
          )}
        </Box>
      ))}
    </Box>
  );
});
