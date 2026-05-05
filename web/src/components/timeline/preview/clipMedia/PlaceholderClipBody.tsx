/** @jsxImportSource @emotion/react */
/**
 * PlaceholderClipBody
 *
 * Rendered inside the Clip chrome for clips whose status is
 * `draft`, `failed`, or `missing` — states where no real asset exists
 * to display. Shows a simple placeholder glyph and the status label.
 */

import React, { memo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { FlexColumn, Text } from "../../../ui_primitives";

// ── Styles ─────────────────────────────────────────────────────────────────

const rootStyles = (theme: Theme) =>
  css({
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    pointerEvents: "none",
    opacity: 0.6,
    userSelect: "none",
    overflow: "hidden",
    color: theme.vars.palette.text.secondary,
    fontSize: 11,
    flexDirection: "column"
  });

const glyphStyles = css({
  fontSize: 18,
  lineHeight: 1
});

// ── Props ──────────────────────────────────────────────────────────────────

export interface PlaceholderClipBodyProps {
  /**
   * Status label shown beneath the glyph.
   * @default "No asset"
   */
  label?: string;
}

// ── Component ──────────────────────────────────────────────────────────────

export const PlaceholderClipBody: React.FC<PlaceholderClipBodyProps> = memo(
  ({ label = "No asset" }) => {
    const theme = useTheme();
    return (
      <FlexColumn
        css={rootStyles(theme)}
        align="center"
        justify="center"
        gap={0.5}
        fullWidth
        fullHeight
      >
        <span css={glyphStyles} aria-hidden>
          ▭
        </span>
        <Text
          sx={{
            fontSize: 10,
            color: theme.vars.palette.text.disabled,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "100%",
            px: 0.5
          }}
        >
          {label}
        </Text>
      </FlexColumn>
    );
  }
);

PlaceholderClipBody.displayName = "PlaceholderClipBody";
