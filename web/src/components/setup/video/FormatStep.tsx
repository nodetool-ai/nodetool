/**
 * Step 2 of the video flow, first half — the format (PRD § 8.2).
 *
 * Seven cards through the shared `OptionCardGrid`. Picking one writes the
 * card's id onto `setup.format` and lays the format's tracks down; the length,
 * shape, frame rate and beat count follow from it (see `formats.ts`).
 *
 * Nothing here generates. The Director runs on `Plan the beats`, and even that
 * only writes text (D4).
 */

import React, { memo, useCallback, useMemo } from "react";

import { FlexColumn, GAP, Text } from "../../ui_primitives";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelineProjectSettings } from "../../../hooks/timeline/useTimelineProjectSettings";
import { OptionCardGrid } from "../OptionCardGrid";
import type { OptionCardItem } from "../OptionCardGrid";
import { SETUP_STILL_GROUPS, setupStill } from "../stills";
import { VIDEO_FORMATS, videoFormatById, tracksForFormat } from "./formats";

/** "15s · 16:9 · 30fps" — the numbers the card decides, said out loud. */
const formatSpec = (durationMs: number, aspect: string, fps: number): string =>
  `${Math.round(durationMs / 1000)}s · ${aspect} · ${fps}fps`;

const OPTIONS: readonly OptionCardItem[] = VIDEO_FORMATS.map((format) => ({
  id: format.id,
  title: format.title,
  description: format.description,
  meta: formatSpec(format.durationMs, format.aspectRatio, format.fps),
  image: setupStill(SETUP_STILL_GROUPS.videoFormats, format.id)
}));

const FormatStepInternal: React.FC = () => {
  const selectedId = useTimelineStore((state) => state.setup?.format ?? null);
  const setSetup = useTimelineStore((state) => state.setSetup);
  // Resolution and frame rate are top-level sequence fields, not part of the
  // document autosave persists, so they go through the hook that writes them.
  const { save: saveProjectSettings } = useTimelineProjectSettings();
  const tracks = useTimelineStore((state) => state.tracks);
  const insertTrack = useTimelineStore((state) => state.insertTrack);

  const options = useMemo(() => OPTIONS, []);

  const handleSelect = useCallback(
    (id: string) => {
      const format = videoFormatById(id);
      if (!format) {
        return;
      }
      setSetup({ format: id });
      void saveProjectSettings({
        fps: format.fps,
        width: format.width,
        height: format.height
      });
      // Lanes are added, never replaced: a creator who dropped footage in step
      // 1 keeps it, and picking a different card only adds what is missing.
      for (const lane of tracksForFormat(format)) {
        const exists = tracks.some(
          (track) => track.type === lane.type && track.name === lane.name
        );
        if (!exists) {
          insertTrack(lane.type, tracks.length, lane.name);
        }
      }
    },
    [insertTrack, saveProjectSettings, setSetup, tracks]
  );

  return (
    <FlexColumn gap={GAP.comfortable}>
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          Choose a video template
        </Text>
        <Text size="normal" color="secondary">
          Each template combines a target length, frame shape and editing style.
          These are starting settings, not generated footage.
        </Text>
      </FlexColumn>
      {/* One template, not seven independent switches: the cards are radios
          with a single tab stop. Stated rather than inferred from the fact
          that a selection is tracked (F26). */}
      <OptionCardGrid
        label="Format"
        options={options}
        selectedId={selectedId}
        onSelect={handleSelect}
        mode="single-select"
      />
    </FlexColumn>
  );
};

export const FormatStep = memo(FormatStepInternal);
FormatStep.displayName = "VideoFormatStep";

export default FormatStep;
