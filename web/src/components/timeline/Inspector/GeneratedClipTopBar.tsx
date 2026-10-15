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

import type { TimelineClip } from "@nodetool-ai/timeline";
import { Toolbar, Z_INDEX } from "../../ui_primitives";
import { GeneratedClipHeader } from "./GeneratedClipHeader";
import { ClipActions } from "./ClipActions";

// Pinned stack of two rows rather than a single-row bar: the surface, rule and
// z-order come from Toolbar, the column layout is local.
const topBarSx = {
  position: "sticky",
  top: 0,
  zIndex: Z_INDEX.sticky,
  flexDirection: "column",
  alignItems: "stretch",
  gap: 0,
  px: 0,
  // Match the Panel surface so scrolling content passes cleanly underneath.
  bgcolor: "background.default"
} as const;

interface GeneratedClipTopBarProps {
  clip: TimelineClip;
}

export const GeneratedClipTopBar: React.FC<GeneratedClipTopBarProps> = memo(
  ({ clip }) => (
    <Toolbar sx={topBarSx}>
      <GeneratedClipHeader clip={clip} />
      <ClipActions clipId={clip.id} />
    </Toolbar>
  )
);

GeneratedClipTopBar.displayName = "GeneratedClipTopBar";
