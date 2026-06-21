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

import { useHasScript } from "../../../hooks/timeline/useHasScript";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { MOTION, BORDER_RADIUS } from "../../ui_primitives";

// ── Styles ─────────────────────────────────────────────────────────────────

const buttonStyles = (theme: Theme) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 24,
    padding: theme.spacing(0, 3, 0, 2),
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
      fontSize: 14
    }
  });

// ── Component ──────────────────────────────────────────────────────────────

export const ScriptToggleButton: React.FC = memo(() => {
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
      css={buttonStyles(theme)}
      onClick={handleClick}
      aria-label={label}
      data-testid="script-toggle-button"
    >
      {hasScript ? <GraphicEqIcon /> : <AddIcon />}
      <span>{label}</span>
    </button>
  );
});

ScriptToggleButton.displayName = "ScriptToggleButton";
