/**
 * The Simple / Expert switch of the timeline's document bar, and in Simple
 * mode the canvas size and frame rate chips. A chip opens Project settings.
 */

import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";

import { Chip, FlexRow, ModeSwitch, SPACING } from "../ui_primitives";
import { useTimelineStore } from "../../stores/timeline/TimelineStore";
import type { TimelineEditorMode } from "../../stores/timeline/TimelineEditorMode";

export interface TimelineFormatChipsProps {
  /** Opens Project settings. Without it the chips only show the values. */
  onOpenSettings?: () => void;
}

export const TimelineFormatChips = memo(function TimelineFormatChips({
  onOpenSettings
}: TimelineFormatChipsProps) {
  const { t } = useTranslation();
  const { width, height, fps } = useTimelineStore(
    useShallow((s) => ({ width: s.width, height: s.height, fps: s.fps }))
  );
  const settingsLabel = t("i18n-next6.topBar.projectSettings");
  return (
    <FlexRow
      align="center"
      gap={SPACING.xs}
      className="timeline-simple__chips"
    >
      <Chip
        compact
        variant="outlined"
        label={t("timelineSimpleMode.canvasSize", { width, height })}
        onClick={onOpenSettings}
        title={onOpenSettings ? settingsLabel : undefined}
        data-testid="timeline-simple-canvas-size"
      />
      <Chip
        compact
        variant="outlined"
        label={t("timelineSimpleMode.frameRate", { fps })}
        onClick={onOpenSettings}
        title={onOpenSettings ? settingsLabel : undefined}
        data-testid="timeline-simple-fps"
      />
    </FlexRow>
  );
});

export interface TimelineModeSwitchProps {
  mode: TimelineEditorMode;
  onChange: (mode: TimelineEditorMode) => void;
}

export const TimelineModeSwitch = memo(function TimelineModeSwitch({
  mode,
  onChange
}: TimelineModeSwitchProps) {
  const { t } = useTranslation();
  return (
    <ModeSwitch
      className="timeline-mode-switch"
      ariaLabel={t("timelineSimpleMode.modeLabel")}
      value={mode}
      onChange={onChange}
      options={[
        { value: "simple", label: t("timelineSimpleMode.simple") },
        { value: "expert", label: t("timelineSimpleMode.expert") }
      ]}
    />
  );
});
