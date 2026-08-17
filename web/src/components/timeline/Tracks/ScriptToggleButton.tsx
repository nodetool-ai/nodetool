/** @jsxImportSource @emotion/react */
/**
 * ScriptToggleButton
 *
 * Compact toolbar affordance that turns the optional "script" feature on or
 * off. The script feature is the transcript lane (ScriptLane + header) plus the
 * TranscriptPanel sidebar, gated on the sequence-level `scriptEnabled` flag.
 *
 * - script off → "Add script" → setScriptEnabled(true)
 * - script on  → "Remove script" → setScriptEnabled(false)
 *
 * Removing is HIDE-ONLY and non-destructive: it only flips the flag and never
 * touches any clips. Mirrors AddTrackButton's styling/structure.
 */

import React, { memo, useCallback } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import SubtitlesOutlinedIcon from "@mui/icons-material/SubtitlesOutlined";

import { useHasScript } from "../../../hooks/timeline/useHasScript";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { MOTION, BORDER_RADIUS } from "../../ui_primitives";

const buttonStyles = (theme: Theme, compact: boolean) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: compact ? 28 : 24,
    minWidth: compact ? 28 : undefined,
    padding: compact ? 0 : theme.spacing(0, 3, 0, 2),
    background: "transparent",
    border: "1px solid transparent",
    color: theme.vars.palette.text.secondary,
    cursor: "pointer",
    fontSize: theme.fontSizeSmall,
    fontWeight: 500,
    letterSpacing: "0.01em",
    fontFamily: theme.typography.fontFamily,
    borderRadius: BORDER_RADIUS.md,
    transition: `${MOTION.background}, color ${MOTION.fast}, ${MOTION.border}`,
    "&:hover": {
      backgroundColor: theme.vars.palette.action.hover,
      color: theme.vars.palette.text.primary,
      borderColor: theme.vars.palette.divider
    },
    "& svg": {
      fontSize: compact ? 18 : 14
    }
  });

interface ScriptToggleButtonProps {
  /** Phone toolbar: icon only, with the label carried by the tooltip / a11y name. */
  compact?: boolean;
}

export const ScriptToggleButton: React.FC<ScriptToggleButtonProps> = memo(({ compact = false }) => {
  const theme = useTheme();
  const hasScript = useHasScript();
  const setScriptEnabled = useTimelineStore((s) => s.setScriptEnabled);

  const handleClick = useCallback(() => {
    setScriptEnabled(!hasScript);
  }, [setScriptEnabled, hasScript]);

  const label = hasScript ? "Remove script" : "Add script";

  return (
    <button
      type="button"
      css={buttonStyles(theme, compact)}
      onClick={handleClick}
      aria-label={label}
      title={label}
      data-testid="script-toggle-button"
    >
      {/* Without its label a bare "+" reads as a second Add-track button, so
          the icon-only variant names the feature instead of the action. */}
      {compact ? (
        <SubtitlesOutlinedIcon
          sx={{ color: hasScript ? "primary.main" : undefined }}
        />
      ) : (
        <>
          {hasScript ? <GraphicEqIcon /> : <AddIcon />}
          <span>{label}</span>
        </>
      )}
    </button>
  );
});

ScriptToggleButton.displayName = "ScriptToggleButton";
