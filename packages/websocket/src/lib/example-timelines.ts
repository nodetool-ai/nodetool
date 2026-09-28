import { TimelineSequence } from "@nodetool-ai/models";
import {
  getExampleTimelineBundle,
  type ExampleTimelineOptions
} from "@nodetool-ai/timeline/examples/node";
import { ApiErrorCode } from "../error-codes.js";
import { throwApiError } from "../trpc/error-formatter.js";

export {
  getExampleTimelineBundle,
  listExampleTimelines,
  resolveExampleTimelinesDir
} from "@nodetool-ai/timeline/examples/node";

/** Save an editable copy of a shipped timeline for one user. */
export async function installExampleTimeline(
  userId: string,
  options: ExampleTimelineOptions,
  input: { slug: string; projectId?: string; name?: string }
) {
  const bundle = getExampleTimelineBundle(options, input.slug);
  if (!bundle) {
    throwApiError(
      ApiErrorCode.NOT_FOUND,
      `No example timeline named "${input.slug}"`
    );
  }
  const sequence = new TimelineSequence({
    user_id: userId,
    project_id: input.projectId ?? "default",
    name: input.name ?? bundle.name,
    fps: bundle.fps,
    width: bundle.width,
    height: bundle.height,
    duration_ms: bundle.durationMs,
    document: JSON.stringify(bundle.document)
  });
  await sequence.save();
  return sequence.toTimelineSequence();
}
