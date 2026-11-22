import { automationTargetKey, type TimelineTrack } from "@nodetool-ai/timeline";

/** Height of one automation sub-lane under its track. */
export const AUTOMATION_LANE_HEIGHT_PX = 56;
/** Height of the automation header row under a track's header controls. */
export const AUTOMATION_HEADER_ROW_PX = 32;
/** Height of the strip at the top of a clip that draws its name. */
export const CLIP_NAME_BAR_PX = 18;
/** Gap between the top of a lane and the top of its clips. */
export const CLIP_TOP_PX = 6;
/** Where a clip's name bar ends, from the top of its lane. */
export const CLIP_NAME_BAR_BOTTOM_PX = CLIP_TOP_PX + CLIP_NAME_BAR_PX;

/** The mixer ranges of a lane, also the span a recorded pass is thinned over. */
export const MIXER_RANGE = {
  volumeDb: { min: -60, max: 6 },
  pan: { min: -1, max: 1 }
} as const;

/** What the track layout needs to know about the automation UI. */
export interface AutomationLayoutInput {
  /** Show Automation is on. */
  show: boolean;
  /** Tracks whose sub-lanes are open. */
  openTrackIds: readonly string[];
  /** The shown parameter per track, as an `automationTargetKey`. */
  shownParams: Readonly<Record<string, string>>;
}

export const NO_AUTOMATION_LAYOUT: AutomationLayoutInput = {
  show: false,
  openTrackIds: [],
  shownParams: {}
};

/** Whether a track type takes automation lanes at all. */
export function trackSupportsAutomation(track: Pick<TimelineTrack, "type">): boolean {
  return (
    track.type === "audio" ||
    track.type === "midi" ||
    track.type === "video" ||
    track.type === "overlay"
  );
}

/**
 * The parameter a track's main lane shows: the stored choice, else the first
 * lane that has points, else Volume (audio and midi), else the first control
 * of a picture track.
 */
export function shownAutomationKey(
  track: Pick<TimelineTrack, "type" | "automation">,
  stored?: string,
  /** The keys the track's controls have now. A stored or automated key outside it is skipped. */
  validKeys?: ReadonlySet<string>
): string {
  const valid = (key: string) => validKeys === undefined || validKeys.has(key);
  if (stored && valid(stored)) return stored;
  const withPoints = track.automation?.find(
    (lane) => lane.points.length > 0 && valid(automationTargetKey(lane.target))
  );
  if (withPoints) return automationTargetKey(withPoints.target);
  if (track.type === "audio" || track.type === "midi") return "mixer:volumeDb";
  return "clip:opacity";
}

/** The lanes an open track lists as sub-lanes: all but the shown parameter's. */
export function automationSubLanes(
  track: Pick<TimelineTrack, "type" | "automation">,
  shownKey: string
): NonNullable<TimelineTrack["automation"]> {
  return (track.automation ?? []).filter((lane) => automationTargetKey(lane.target) !== shownKey);
}

/** The rows a track's automation adds under it: the header row and the open sub-lanes. */
export function automationSectionHeightPx(
  track: Pick<TimelineTrack, "id" | "type" | "automation">,
  layout: AutomationLayoutInput
): number {
  if (!layout.show || !trackSupportsAutomation(track)) return 0;
  let height = AUTOMATION_HEADER_ROW_PX;
  if (layout.openTrackIds.includes(track.id)) {
    const shown = shownAutomationKey(track, layout.shownParams[track.id]);
    height += automationSubLanes(track, shown).length * AUTOMATION_LANE_HEIGHT_PX;
  }
  return height;
}

export interface HitRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The parts of a main lane where the automation curve takes the pointer: all
 * of it below the clip name bars, the padding above the clips, and the strip
 * of name-bar height between and beside the clips. A clip's name bar keeps
 * every clip gesture. `nameBarPx` is where the name bar ends, from the top of
 * the lane.
 */
export function automationHitRects(
  clips: readonly { startMs: number; durationMs: number }[],
  msPerPx: number,
  widthPx: number,
  heightPx: number,
  nameBarPx: number = CLIP_NAME_BAR_BOTTOM_PX
): HitRect[] {
  const bar = Math.min(nameBarPx, heightPx);
  const rects: HitRect[] = [];
  if (heightPx > bar) rects.push({ x: 0, y: bar, width: widthPx, height: heightPx - bar });
  const pad = Math.min(CLIP_TOP_PX, bar);
  if (pad > 0) rects.push({ x: 0, y: 0, width: widthPx, height: pad });
  const spans = clips
    .map((clip) => ({
      from: Math.max(0, clip.startMs / msPerPx),
      to: Math.min(widthPx, (clip.startMs + clip.durationMs) / msPerPx)
    }))
    .filter((span) => span.to > span.from)
    .sort((a, b) => a.from - b.from);
  let cursor = 0;
  for (const span of spans) {
    if (span.from > cursor) rects.push({ x: cursor, y: 0, width: span.from - cursor, height: bar });
    cursor = Math.max(cursor, span.to);
  }
  if (cursor < widthPx) rects.push({ x: cursor, y: 0, width: widthPx - cursor, height: bar });
  return rects;
}
