import type { TimelineSequence } from "@nodetool-ai/timeline";
import { MAX_SUPPORTED_WORKING_COLOR_SPACE_VERSION } from "@nodetool-ai/timeline";
import { AlertBanner, FlexColumn, Text, SPACING } from "../ui_primitives";

export function UnsupportedTimeline({
  sequence
}: {
  sequence: TimelineSequence;
}): React.ReactElement {
  return (
    <FlexColumn gap={SPACING.md} sx={{ p: SPACING.md }}>
      <Text>{sequence.name}</Text>
      <AlertBanner severity="warning">
        This timeline uses color version {sequence.workingColorSpaceVersion}.
        This version of NodeTool supports up to version{" "}
        {MAX_SUPPORTED_WORKING_COLOR_SPACE_VERSION}. Update NodeTool to edit or
        export it.
      </AlertBanner>
      <Text>
        Read-only. Editing, saving, preview and export are unavailable.
      </Text>
      <Text>
        {sequence.width} × {sequence.height} · {sequence.fps} fps ·{" "}
        {(sequence.durationMs / 1000).toFixed(1)} s
      </Text>
      <Text>
        {sequence.tracks.length} tracks · {sequence.clips.length} clips
      </Text>
    </FlexColumn>
  );
}
