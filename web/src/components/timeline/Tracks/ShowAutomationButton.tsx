/**
 * ShowAutomationButton — the Show Automation toggle in the tracks toolbar.
 * It turns the automation header row and the curve on every track on or off.
 * It has no keyboard shortcut: `A` is the track select tool.
 */

import React, { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";

import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { ToolbarIconButton } from "../../ui_primitives";

/** A curve with two points. */
const AutomationCurveIcon: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M6 17 C11 17 13 7 18 7" />
    <circle cx="5" cy="17" r="2" fill="currentColor" />
    <circle cx="19" cy="7" r="2" fill="currentColor" />
  </svg>
);

export const ShowAutomationButton: React.FC = memo(() => {
  const { t } = useTranslation();
  const show = useTimelineUIStore((s) => s.showAutomation);
  const setShow = useTimelineUIStore((s) => s.setShowAutomation);
  const toggle = useCallback(() => setShow(!show), [setShow, show]);
  const label = t("timelineAutomation.showAutomation");
  return (
    <ToolbarIconButton
      icon={<AutomationCurveIcon />}
      size="small"
      active={show}
      tooltip={label}
      ariaLabel={label}
      aria-pressed={show}
      onClick={toggle}
      data-testid="show-automation-button"
    />
  );
});

ShowAutomationButton.displayName = "ShowAutomationButton";
