/**
 * Timeline cast registry — the set of timeline-editor demo recordings
 * Remotion can render. Sibling to `registry.ts` (the graph-editor casts).
 */
import { timelineEditingCast, type TimelineDemoCast } from "@web-demo";

const timelineCasts: TimelineDemoCast[] = [timelineEditingCast];

export const getTimelineCast = (id: string): TimelineDemoCast => {
  const cast = timelineCasts.find((c) => c.id === id);
  if (!cast) throw new Error(`Unknown timeline cast id: ${id}`);
  return cast;
};
