/**
 * Default node dimensions for bespoke editing bodies.
 *
 * Applied by `graphNodeToReactFlowNode` only when a node has no saved size yet,
 * so user resizes are preserved.
 *
 * This is data, and it lives apart from `bespokeRegistry` on purpose: the
 * registry maps node types to their body *components*, so importing it from the
 * graph-loading path dragged the entire property-editor tree — Monaco, Lexical,
 * three.js — onto the app's boot path. The stores import this module; only the
 * render layer imports the registry.
 */
import { COLLECTION_NODE_TYPE, CURVES_NODE_TYPE } from "../../../constants/nodeTypes";
import {
  AUDIO_OUT_NODE_TYPE,
  CONSTANT_SKETCH_NODE_TYPE,
  CONSTANT_TIMELINE_NODE_TYPE,
  EXTRACT_VIDEO_FRAME_NODE_TYPE,
  GENERATOR_NODE_TYPES,
  LIST_GENERATOR_NODE_TYPE
} from "./bespokeNodeTypes";
import {
  SYNTH_MODULE_CONFIGS,
  SYNTH_NODE_TYPES
} from "../synth/synthModules";
import {
  AUDIO_EFFECT_CONFIGS,
  AUDIO_EFFECT_NODE_TYPES
} from "../synth/audioEffectModules";

/**
 * Extract Video Frame: the transport row (time readout + step/play/mute +
 * download) needs more than the 200px generic default to fit on one line.
 */
export const BESPOKE_DEFAULT_WIDTHS: Readonly<Record<string, number>> = {
  [EXTRACT_VIDEO_FRAME_NODE_TYPE]: 320
};

export const BESPOKE_DEFAULT_HEIGHTS: Readonly<Record<string, number>> = {
  // Collection: a curation grid needs room to show several thumbnails at once.
  [COLLECTION_NODE_TYPE]: 320,
  [CONSTANT_SKETCH_NODE_TYPE]: 300,
  [CONSTANT_TIMELINE_NODE_TYPE]: 300,
  [CURVES_NODE_TYPE]: 520,
  // Extract Video Frame: video preview + scrubber + transport row + Frame /
  // Timecode footer + the extracted image output.
  [EXTRACT_VIDEO_FRAME_NODE_TYPE]: 380,
  // List Generator: numbered, scrollable item list needs room to show several
  // items as they stream in.
  [LIST_GENERATOR_NODE_TYPE]: 340,
  // Generators: preview + color rows + up to 4 sliders need more than the
  // generic default to show all controls without resizing.
  ...Object.fromEntries(GENERATOR_NODE_TYPES.map((t) => [t, 460] as const)),
  // Adjustment nodes with many sliders that overflow the generic height.
  "lib.image.color_grading.LiftGammaGain": 580,
  "lib.image.color_grading.SplitToning": 380,
  // Synth modules: label strip + extras + knob rows (≈80px per wrapped row
  // of knobs at the default node width) + output jacks.
  ...Object.fromEntries(
    SYNTH_NODE_TYPES.map((t) => {
      const c = SYNTH_MODULE_CONFIGS[t];
      const knobRows = Math.ceil(c.knobs.length / 3);
      const extras =
        (c.waveform ? 26 : 0) + (c.modeToggle ? 28 : 0) + (c.adsrPreview ? 42 : 0);
      return [t, 96 + extras + knobRows * 84] as const;
    })
  ),
  // Audio effects: same knob faceplate as synth modules (single audio jack),
  // plus a row per boolean toggle (e.g. compressor/limiter auto gain).
  ...Object.fromEntries(
    AUDIO_EFFECT_NODE_TYPES.map((t) => {
      const c = AUDIO_EFFECT_CONFIGS[t];
      const knobRows = Math.ceil(c.knobs.length / 3);
      const toggleRows = c.toggles?.length ?? 0;
      return [t, 96 + toggleRows * 28 + knobRows * 84] as const;
    })
  ),
  // Audio Out: label strip + transport buttons + visualizer.
  [AUDIO_OUT_NODE_TYPE]: 220
};
