// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { AudioRef, FolderRef } from "../types.js";

// Detect Onsets — lib.librosa.segmentation.DetectOnsets
export interface DetectOnsetsInputs {
  audio?: Connectable<AudioRef>;
  hop_length?: Connectable<number>;
}

export interface DetectOnsetsOutputs {
  output: unknown;
}

export function detectOnsets(
  inputs: DetectOnsetsInputs
): DslNode<DetectOnsetsOutputs, "output"> {
  return createNode(
    "lib.librosa.segmentation.DetectOnsets",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Segment Audio By Onsets — lib.librosa.segmentation.SegmentAudioByOnsets
export interface SegmentAudioByOnsetsInputs {
  audio?: Connectable<AudioRef>;
  onsets?: Connectable<unknown>;
  min_segment_length?: Connectable<number>;
}

export interface SegmentAudioByOnsetsOutputs {
  output: AudioRef[];
}

export function segmentAudioByOnsets(
  inputs: SegmentAudioByOnsetsInputs
): DslNode<SegmentAudioByOnsetsOutputs, "output"> {
  return createNode(
    "lib.librosa.segmentation.SegmentAudioByOnsets",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Save Audio Segments — lib.librosa.segmentation.SaveAudioSegments
export interface SaveAudioSegmentsInputs {
  segments?: Connectable<AudioRef[]>;
  output_folder?: Connectable<FolderRef>;
  name_prefix?: Connectable<string>;
}

export interface SaveAudioSegmentsOutputs {
  output: FolderRef;
}

export function saveAudioSegments(
  inputs: SaveAudioSegmentsInputs
): DslNode<SaveAudioSegmentsOutputs, "output"> {
  return createNode(
    "lib.librosa.segmentation.SaveAudioSegments",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
