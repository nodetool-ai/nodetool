/**
 * Workflow-gallery demo casts — one synthetic, backend-free recording per
 * example on the docs Workflow Gallery (docs/workflows/) that has no matching
 * cookbook video. Each replays the real graph UI building and running the
 * example (running rings, streaming text, progress bars, final media) so the
 * Remotion harness can narrate it into a short video. See demo/src/workflows.ts
 * for the per-example titles, camera beats, and captions.
 *
 * Gallery examples that DO map to a cookbook recipe reuse that video directly
 * (see docs/workflows/*.md), so they are not duplicated here.
 */
import type { DemoCast } from "../castTypes";

import { transcribeAudioCast } from "./transcribeAudioCast";
import { dataGeneratorCast } from "./dataGeneratorCast";
import { creativeStoryIdeasCast } from "./creativeStoryIdeasCast";
import { meetingTranscriptSummarizerCast } from "./meetingTranscriptSummarizerCast";
import { categorizeMailsCast } from "./categorizeMailsCast";
import { colorBoostVideoCast } from "./colorBoostVideoCast";
import { fetchPapersCast } from "./fetchPapersCast";

export {
  transcribeAudioCast,
  dataGeneratorCast,
  creativeStoryIdeasCast,
  meetingTranscriptSummarizerCast,
  categorizeMailsCast,
  colorBoostVideoCast,
  fetchPapersCast,
};

/** Every workflow-gallery cast. */
export const workflowCasts: DemoCast[] = [
  transcribeAudioCast,
  dataGeneratorCast,
  creativeStoryIdeasCast,
  meetingTranscriptSummarizerCast,
  categorizeMailsCast,
  colorBoostVideoCast,
  fetchPapersCast,
];
