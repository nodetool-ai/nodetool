// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";
import type { AudioRef, FolderRef } from "../types.js";

// Detect Onsets — lib.librosa.segmentation.DetectOnsets
export interface DetectOnsetsInputs {
  audio?: Connectable<AudioRef>;
  hop_length?: Connectable<number>;
}

export function detectOnsets(inputs: DetectOnsetsInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.librosa.segmentation.DetectOnsets", inputs as Record<string, unknown>);
}

// Segment Audio By Onsets — lib.librosa.segmentation.SegmentAudioByOnsets
export interface SegmentAudioByOnsetsInputs {
  audio?: Connectable<AudioRef>;
  onsets?: Connectable<unknown>;
  min_segment_length?: Connectable<number>;
}

export function segmentAudioByOnsets(inputs: SegmentAudioByOnsetsInputs): DslNode<SingleOutput<AudioRef[]>> {
  return createNode("lib.librosa.segmentation.SegmentAudioByOnsets", inputs as Record<string, unknown>);
}

// Save Audio Segments — lib.librosa.segmentation.SaveAudioSegments
export interface SaveAudioSegmentsInputs {
  segments?: Connectable<AudioRef[]>;
  output_folder?: Connectable<FolderRef>;
  name_prefix?: Connectable<string>;
}

export function saveAudioSegments(inputs: SaveAudioSegmentsInputs): DslNode<SingleOutput<FolderRef>> {
  return createNode("lib.librosa.segmentation.SaveAudioSegments", inputs as Record<string, unknown>);
}
