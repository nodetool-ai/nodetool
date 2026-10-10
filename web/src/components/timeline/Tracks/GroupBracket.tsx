/** @jsxImportSource @emotion/react */
/**
 * The body of a group clip.
 *
 * A group carries no media (D4): what it holds is a set of clips on other
 * tracks that move, trim and transform with it. So the lane draws the span
 * those children cover — a rule with two down-turned ends — instead of the
 * empty filmstrip a media clip would show. A group holding nothing brackets
 * its own width, which is what makes an empty group visible as such.
 */

import { useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import type { TimelineClip } from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { SPACING_PX } from "../../ui_primitives";

const BRACKET_DEPTH_PX = SPACING_PX.md;

const bracketStyles = (theme: Theme) =>
  css({
    position: "absolute",
    top: SPACING_PX.xl,
    height: BRACKET_DEPTH_PX,
    borderTop: `1px solid ${theme.vars.palette.secondary.main}`,
    borderLeft: `1px solid ${theme.vars.palette.secondary.main}`,
    borderRight: `1px solid ${theme.vars.palette.secondary.main}`,
    opacity: 0.7,
    pointerEvents: "none"
  });

type ChildSpan = { startMs: number; endMs: number } | null;

interface GroupSpanIndex {
  childrenByParent: Map<string, TimelineClip[]>;
  spans: Map<string, ChildSpan>;
}

// Keyed on the clips array, which every edit replaces: each store publish
// builds the children index once, shared by every bracket's selectors.
const spanIndexCache = new WeakMap<readonly TimelineClip[], GroupSpanIndex>();

/** The timeline span a group's descendants cover, or null when it holds none. */
export function childSpanMs(
  clips: readonly TimelineClip[],
  groupId: string
): ChildSpan {
  let index = spanIndexCache.get(clips);
  if (!index) {
    const childrenByParent = new Map<string, TimelineClip[]>();
    for (const clip of clips) {
      if (!clip.parentId) continue;
      const siblings = childrenByParent.get(clip.parentId);
      if (siblings) siblings.push(clip);
      else childrenByParent.set(clip.parentId, [clip]);
    }
    index = { childrenByParent, spans: new Map() };
    spanIndexCache.set(clips, index);
  }
  const cached = index.spans.get(groupId);
  if (cached !== undefined) return cached;

  let startMs = Number.POSITIVE_INFINITY;
  let endMs = Number.NEGATIVE_INFINITY;
  const seen = new Set<string>();
  const queue = [groupId];
  while (queue.length > 0) {
    const id = queue.pop()!;
    for (const child of index.childrenByParent.get(id) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      queue.push(child.id);
      startMs = Math.min(startMs, child.startMs);
      endMs = Math.max(endMs, child.startMs + child.durationMs);
    }
  }
  const span = endMs > startMs ? { startMs, endMs } : null;
  index.spans.set(groupId, span);
  return span;
}

interface GroupBracketProps {
  clipId: string;
  /** The group clip's own window, which the bracket is positioned against. */
  startMs: number;
  durationMs: number;
  /** The clip body's rendered width, in pixels. */
  widthPx: number;
}

export const GroupBracket = ({
  clipId,
  startMs,
  durationMs,
  widthPx
}: GroupBracketProps) => {
  const theme = useTheme();
  // Two scalar selections rather than one object, so the bracket re-renders
  // when the span moves and not when any other clip is edited.
  const spanStartMs = useTimelineStore(
    (state) => childSpanMs(state.clips, clipId)?.startMs ?? null
  );
  const spanEndMs = useTimelineStore(
    (state) => childSpanMs(state.clips, clipId)?.endMs ?? null
  );

  const geometry = useMemo(() => {
    if (durationMs <= 0 || widthPx <= 0) return null;
    const toPx = (ms: number) =>
      Math.max(0, Math.min(widthPx, ((ms - startMs) / durationMs) * widthPx));
    const left = spanStartMs === null ? 0 : toPx(spanStartMs);
    const right = spanEndMs === null ? widthPx : toPx(spanEndMs);
    return { left, width: Math.max(1, right - left) };
  }, [spanStartMs, spanEndMs, startMs, durationMs, widthPx]);

  const bracketCss = useMemo(() => bracketStyles(theme), [theme]);
  if (!geometry) return null;
  return <div css={bracketCss} style={geometry} aria-hidden />;
};
