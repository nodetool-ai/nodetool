// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { VideoRef } from "../types.js";

// Render Timeline — nodetool.timeline.RenderTimeline
export type RenderTimelineInputs = {
  timeline?: Connectable<unknown>;
  include_audio?: Connectable<boolean>;
};

export interface RenderTimelineOutputs {
  output: VideoRef;
}

export function renderTimeline(inputs: RenderTimelineInputs): DslNode<RenderTimelineOutputs, "output"> {
  return createNode("nodetool.timeline.RenderTimeline", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Timeline Transcript — nodetool.timeline.Transcript
export type TranscriptInputs = {
  timeline?: Connectable<unknown>;
};

export interface TranscriptOutputs {
  text: string;
  lines: string[];
}

export function transcript(inputs: TranscriptInputs): DslNode<TranscriptOutputs> {
  return createNode("nodetool.timeline.Transcript", inputs, { outputNames: ["text", "lines"] });
}

// Add Clips To Timeline — nodetool.timeline.AddClips
export type AddClipsInputs = {
  timeline?: Connectable<unknown>;
  clips?: Connectable<unknown[]>;
  name?: Connectable<string>;
  image_duration_ms?: Connectable<number>;
};

export interface AddClipsOutputs {
  output: unknown;
}

export function addClips(inputs: AddClipsInputs): DslNode<AddClipsOutputs, "output"> {
  return createNode("nodetool.timeline.AddClips", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
