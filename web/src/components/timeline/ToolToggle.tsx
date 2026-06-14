/** @jsxImportSource @emotion/react */
/**
 * ToolToggle — Select / Cut tool buttons for the timeline editor.
 *
 * Labeled ghost buttons (icon + text). The active button picks up the
 * primary accent + subtle filled background; tooltip carries the shortcut.
 * Pairs with the V (select) / C (cut) keyboard shortcuts in TracksRegion.
 */
import React, { memo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ContentCutOutlinedIcon from "@mui/icons-material/ContentCutOutlined";

import { FlexRow, Tooltip, MOTION, BORDER_RADIUS } from "../ui_primitives";
import { useTimelineUIStore } from "../../stores/timeline/TimelineUIStore";

/** Custom pointer cursor — monoline, 1.6px stroke. */
const PointerIcon: React.FC = () => (
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
    <path d="M5 3.5 5 19.5 9.2 15.2 11.7 21 14.5 19.8 12 14.2 18 14.2 Z" />
  </svg>
);

const buttonStyles = (theme: Theme, active: boolean) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 24,
    padding: theme.spacing(0, 3, 0, 2),
    background: active ? theme.vars.palette.action.selected : "transparent",
    border: `1px solid ${active ? theme.vars.palette.divider : "transparent"}`,
    color: active
      ? theme.vars.palette.text.primary
      : theme.vars.palette.text.secondary,
    cursor: "pointer",
    fontSize: theme.fontSizeSmall,
    fontWeight: 500,
    letterSpacing: "0.01em",
    fontFamily: theme.typography.fontFamily,
    borderRadius: BORDER_RADIUS.md,
    transition: `background-color ${MOTION.fast}, color ${MOTION.fast}, border-color ${MOTION.fast}`,
    "&:hover": {
      backgroundColor: active
        ? theme.vars.palette.action.selected
        : theme.vars.palette.action.hover,
      color: theme.vars.palette.text.primary,
      borderColor: theme.vars.palette.divider
    },
    "&:focus-visible": {
      outline: "none",
      borderColor: theme.vars.palette.primary.main
    },
    "& svg": {
      fontSize: 14
    }
  });

interface ToolButtonProps {
  label: string;
  shortcut: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

const ToolButton: React.FC<ToolButtonProps> = ({
  label,
  shortcut,
  active,
  onClick,
  children
}) => {
  const theme = useTheme();
  return (
    <Tooltip title={`${label} (${shortcut})`}>
      <button
        type="button"
        css={buttonStyles(theme, active)}
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
      >
        {children}
        <span>{label}</span>
      </button>
    </Tooltip>
  );
};

export const ToolToggle: React.FC = memo(() => {
  const activeTool = useTimelineUIStore((s) => s.activeTool);
  const setActiveTool = useTimelineUIStore((s) => s.setActiveTool);
  return (
    <FlexRow gap={0.5} align="center">
      <ToolButton
        label="Select"
        shortcut="V"
        active={activeTool === "select"}
        onClick={() => setActiveTool("select")}
      >
        <PointerIcon />
      </ToolButton>
      <ToolButton
        label="Cut"
        shortcut="C"
        active={activeTool === "cut"}
        onClick={() => setActiveTool("cut")}
      >
        <ContentCutOutlinedIcon />
      </ToolButton>
    </FlexRow>
  );
});
ToolToggle.displayName = "ToolToggle";

export default ToolToggle;
