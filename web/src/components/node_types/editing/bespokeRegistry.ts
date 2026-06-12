/**
 * Bespoke editing-node body registry (plan §9, Track E).
 *
 * Registry mapping `node_type` → bespoke body component. Resolved before the
 * content-card registry in `NodeContent` body routing (§4.1):
 *
 *   bespoke registry → content-card registry → generic body
 *
 * Bespoke bodies ship one at a time as Track E PRs land. Un-registered
 * nodes fall through to the next routing layer.
 */

import type React from "react";
import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import AdjustmentBody from "./AdjustmentBody";
import { ADJUSTMENT_NODE_TYPES } from "./AdjustmentBody.constants";
import BlurBody, { BLUR_NODE_TYPE } from "./BlurBody";
import CanvasResizeBody, {
  CANVAS_RESIZE_NODE_TYPE
} from "./CanvasResizeBody";
import ChannelsBody, { CHANNELS_NODE_TYPE } from "./ChannelsBody";
import ChromaKeyBody, { CHROMA_KEY_NODE_TYPE } from "./ChromaKeyBody";
import ColorOverlayBody, {
  COLOR_OVERLAY_NODE_TYPE
} from "./ColorOverlayBody";
import CompositorBody, { COMPOSITOR_NODE_TYPE } from "./CompositorBody";
import ConstantSketchBody, {
  CONSTANT_SKETCH_NODE_TYPE
} from "./ConstantSketchBody";
import ConstantTimelineBody, {
  CONSTANT_TIMELINE_NODE_TYPE
} from "./ConstantTimelineBody";
import CropBody, { CROP_NODE_TYPE } from "./CropBody";
import CurvesBody, { CURVES_NODE_TYPE } from "./CurvesBody";
import DropShadowBody, { DROP_SHADOW_NODE_TYPE } from "./DropShadowBody";
import FitBody, { FIT_NODE_TYPE } from "./FitBody";
import GeneratorBody, { GENERATOR_NODE_TYPES } from "./GeneratorBody";
import HSLAdjustBody, { HSL_ADJUST_NODE_TYPE } from "./HSLAdjustBody";
import LevelsBody, { LEVELS_NODE_TYPE } from "./LevelsBody";
import MaskBody, { MASK_NODE_TYPE } from "./MaskBody";
import MasksExtractorBody, {
  MASKS_EXTRACTOR_NODE_TYPES
} from "./MasksExtractorBody";
import OffsetBody, { OFFSET_NODE_TYPE } from "./OffsetBody";
import OutlineBody, { OUTLINE_NODE_TYPE } from "./OutlineBody";
import PadBody, { PAD_NODE_TYPE } from "./PadBody";
import PainterBody, { PAINTER_NODE_TYPE } from "./PainterBody";
import PromptComposerBody, { PROMPT_NODE_TYPE } from "./PromptComposerBody";
import PasteBody, { PASTE_NODE_TYPE } from "./PasteBody";
import ResizeBody, { RESIZE_NODE_TYPE } from "./ResizeBody";
import RotateAndFlipBody, {
  ROTATE_AND_FLIP_NODE_TYPE
} from "./RotateAndFlipBody";
import ScaleBody, { SCALE_NODE_TYPE } from "./ScaleBody";
import SimpleFilterBody from "./SimpleFilterBody";
import { SIMPLE_FILTER_NODE_TYPES } from "./SimpleFilterBody.constants";
import AudioOutBody, { AUDIO_OUT_NODE_TYPE } from "../synth/AudioOutBody";
import SynthModuleBody from "../synth/SynthModuleBody";
import {
  SYNTH_MODULE_CONFIGS,
  SYNTH_NODE_TYPES
} from "../synth/synthModules";

export interface BespokeBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

export type BespokeBodyComponent = React.ComponentType<BespokeBodyProps>;

export const BESPOKE_BODY_REGISTRY: Readonly<
  Record<string, BespokeBodyComponent>
> = {
  [BLUR_NODE_TYPE]: BlurBody,
  [CANVAS_RESIZE_NODE_TYPE]: CanvasResizeBody,
  [CHANNELS_NODE_TYPE]: ChannelsBody,
  [CHROMA_KEY_NODE_TYPE]: ChromaKeyBody,
  [COLOR_OVERLAY_NODE_TYPE]: ColorOverlayBody,
  [COMPOSITOR_NODE_TYPE]: CompositorBody,
  [CONSTANT_SKETCH_NODE_TYPE]: ConstantSketchBody,
  [CONSTANT_TIMELINE_NODE_TYPE]: ConstantTimelineBody,
  [CROP_NODE_TYPE]: CropBody,
  [CURVES_NODE_TYPE]: CurvesBody,
  [DROP_SHADOW_NODE_TYPE]: DropShadowBody,
  [FIT_NODE_TYPE]: FitBody,
  [HSL_ADJUST_NODE_TYPE]: HSLAdjustBody,
  [LEVELS_NODE_TYPE]: LevelsBody,
  [MASK_NODE_TYPE]: MaskBody,
  [OFFSET_NODE_TYPE]: OffsetBody,
  [OUTLINE_NODE_TYPE]: OutlineBody,
  [PAD_NODE_TYPE]: PadBody,
  [PAINTER_NODE_TYPE]: PainterBody,
  [PASTE_NODE_TYPE]: PasteBody,
  [PROMPT_NODE_TYPE]: PromptComposerBody,
  [RESIZE_NODE_TYPE]: ResizeBody,
  [ROTATE_AND_FLIP_NODE_TYPE]: RotateAndFlipBody,
  [SCALE_NODE_TYPE]: ScaleBody,
  ...Object.fromEntries(
    GENERATOR_NODE_TYPES.map((t) => [t, GeneratorBody] as const)
  ),
  ...Object.fromEntries(
    MASKS_EXTRACTOR_NODE_TYPES.map((t) => [t, MasksExtractorBody] as const)
  ),
  ...Object.fromEntries(
    SIMPLE_FILTER_NODE_TYPES.map((t) => [t, SimpleFilterBody] as const)
  ),
  ...Object.fromEntries(
    ADJUSTMENT_NODE_TYPES.map((t) => [t, AdjustmentBody] as const)
  ),
  ...Object.fromEntries(
    SYNTH_NODE_TYPES.map((t) => [t, SynthModuleBody] as const)
  ),
  [AUDIO_OUT_NODE_TYPE]: AudioOutBody
};

/**
 * Default heights for bespoke bodies that are taller than the generic node.
 * Consumed by `graphNodeToReactFlowNode` — only applied when the node has no
 * saved height yet, so user resizes are preserved.
 */
export const BESPOKE_DEFAULT_HEIGHTS: Readonly<Record<string, number>> = {
  [CONSTANT_SKETCH_NODE_TYPE]: 300,
  [CONSTANT_TIMELINE_NODE_TYPE]: 300,
  [CURVES_NODE_TYPE]: 520,
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
  // Audio Out: label strip + transport buttons + visualizer.
  [AUDIO_OUT_NODE_TYPE]: 220
};

export const isBespokeNode = (
  metadata: NodeMetadata | undefined
): boolean => {
  const t = metadata?.node_type;
  return !!t && t in BESPOKE_BODY_REGISTRY;
};

export const getBespokeBody = (
  metadata: NodeMetadata | undefined
): BespokeBodyComponent | undefined => {
  const t = metadata?.node_type;
  return t ? BESPOKE_BODY_REGISTRY[t] : undefined;
};
