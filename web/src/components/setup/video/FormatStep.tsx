/**
 * Step 2 of the video flow, first half — the format (PRD § 8.2).
 *
 * Seven cards through the shared `OptionCardGrid`. Picking one writes the
 * card's id onto `setup.format` and lays the format's tracks down; the length,
 * shape, frame rate and beat count follow from it (see `formats.ts`).
 *
 * Nothing here generates. The Director runs on `Plan the beats`, and even that
 * only writes text (D4). The model behind that run is picked here too, from
 * what the configured providers report (see `directorModel.ts`).
 */

import React, { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { FlexColumn, GAP, Text } from "../../ui_primitives";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelineProjectSettings } from "../../../hooks/timeline/useTimelineProjectSettings";
import { OptionCardGrid } from "../OptionCardGrid";
import type { OptionCardItem } from "../OptionCardGrid";
import { SETUP_STILL_GROUPS, setupStill } from "../stills";
import { VIDEO_FORMATS, videoFormatById, tracksForFormat } from "./formats";

const FormatStepInternal: React.FC = () => {
  const { t } = useTranslation();
  const selectedId = useTimelineStore((state) => state.setup?.format ?? null);
  const setSetup = useTimelineStore((state) => state.setSetup);
  // Resolution and frame rate are top-level sequence fields, not part of the
  // document autosave persists, so they go through the hook that writes them.
  const { save: saveProjectSettings } = useTimelineProjectSettings();
  const tracks = useTimelineStore((state) => state.tracks);
  const insertTrack = useTimelineStore((state) => state.insertTrack);

  const options = useMemo<readonly OptionCardItem[]>(
    () =>
      VIDEO_FORMATS.map((format) => ({
        id: format.id,
        title: t(`pass3_12.video.format.options.${format.id}.title`),
        description: t(
          `pass3_12.video.format.options.${format.id}.description`
        ),
        meta: t("pass3_12.video.format.meta", {
          duration: Math.round(format.durationMs / 1000),
          aspect: format.aspectRatio,
          fps: format.fps
        }),
        image: setupStill(SETUP_STILL_GROUPS.videoFormats, format.id)
      })),
    [t]
  );

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
      // `tracks` is this render's list, so each added lane goes one past the
      // last, or every lane would land at the same index in reverse order.
      let at = tracks.length;
      for (const lane of tracksForFormat(format)) {
        const exists = tracks.some(
          (track) => track.type === lane.type && track.name === lane.name
        );
        if (!exists) {
          insertTrack(lane.type, at, lane.name);
          at += 1;
        }
      }
    },
    [insertTrack, saveProjectSettings, setSetup, tracks]
  );

  return (
    <FlexColumn gap={GAP.comfortable}>
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          {t("pass3_12.video.format.title")}
        </Text>
        <Text size="normal" color="secondary">
          {t("pass3_12.video.format.description")}
        </Text>
      </FlexColumn>
      {/* One template, not seven independent switches: the cards are radios
          with a single tab stop. Stated rather than inferred from the fact
          that a selection is tracked (F26). */}
      <OptionCardGrid
        label={t("pass3_12.video.format.optionsLabel")}
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
