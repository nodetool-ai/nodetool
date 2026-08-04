/**
 * Node-type identifiers for bespoke editing bodies, kept apart from the
 * components that render them.
 *
 * `bespokeNodeSizes` needs these names to compute default node dimensions, and
 * that runs while a graph is being loaded — long before anything renders. With
 * the names living on the body modules, reading one pulled in the body, and
 * through it the whole property-editor tree (Monaco, Lexical, three.js). Each
 * body module re-exports its own name from here, so existing importers are
 * unaffected.
 */

export const CONSTANT_SKETCH_NODE_TYPE = "nodetool.constant.Sketch";
export const CONSTANT_TIMELINE_NODE_TYPE = "nodetool.constant.Timeline";
export const EXTRACT_VIDEO_FRAME_NODE_TYPE = "nodetool.video.ExtractFrame";
export const LIST_GENERATOR_NODE_TYPE = "nodetool.generators.ListGenerator";
export const AUDIO_OUT_NODE_TYPE = "nodetool.audio.realtime.AudioOutput";

export const GENERATOR_NODE_TYPES = [
  "lib.image.draw.LinearGradient",
  "lib.image.draw.RadialGradient",
  "lib.image.draw.AngularGradient",
  "lib.image.draw.DiamondGradient",
  "lib.image.draw.Checkerboard",
  "lib.image.draw.GaussianNoise"
] as const;
