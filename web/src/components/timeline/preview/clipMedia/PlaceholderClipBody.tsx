/** @jsxImportSource @emotion/react */

import React, { memo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Text } from "../../../ui_primitives";

const rootStyles = (theme: Theme) =>
  css({
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    pointerEvents: "none",
    opacity: 0.6,
    userSelect: "none",
    overflow: "hidden",
    color: theme.vars.palette.text.secondary,
    fontSize: 11
  });

const glyphStyles = css({
  fontSize: 18,
  lineHeight: 1
});

export interface PlaceholderClipBodyProps {
  /** @default "No asset" */
  label?: string;
}

export const PlaceholderClipBody: React.FC<PlaceholderClipBodyProps> = memo(
  ({ label = "No asset" }) => {
    const theme = useTheme();
    return (
      <div css={rootStyles(theme)}>
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
      </div>
    );
  }
);

PlaceholderClipBody.displayName = "PlaceholderClipBody";
