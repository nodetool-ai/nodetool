/** @jsxImportSource @emotion/react */
/**
 * GeneratedClipTopBar
 *
 * The always-visible top of a generated-clip inspector: the identity row plus
 * the clip action toolbar, pinned to the top of the (scrolling) panel. Keeping
 * actions docked here — rather than in a collapsible section at the bottom —
 * mirrors how editors like Premiere keep clip operations on a persistent
 * toolbar / right-click menu instead of buried in a scrollable inspector.
 */

import React, { memo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import type { TimelineClip } from "@nodetool-ai/timeline";
import { Z_INDEX } from "../../ui_primitives";
import { GeneratedClipHeader } from "./GeneratedClipHeader";
import { ClipActions } from "./ClipActions";

const topBarStyles = (theme: Theme) =>
  css({
    position: "sticky",
    top: 0,
    zIndex: Z_INDEX.sticky,
    // Match the Panel surface so scrolling content passes cleanly underneath.
    backgroundColor: theme.vars.palette.background.default,
    borderBottom: `1px solid ${theme.vars.palette.divider}`
  });

export interface GeneratedClipTopBarProps {
  clip: TimelineClip;
}

export const GeneratedClipTopBar: React.FC<GeneratedClipTopBarProps> = memo(
  ({ clip }) => {
    const theme = useTheme();
    return (
      <div css={topBarStyles(theme)}>
        <GeneratedClipHeader clip={clip} />
        <ClipActions clipId={clip.id} />
      </div>
    );
  }
);

GeneratedClipTopBar.displayName = "GeneratedClipTopBar";
