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
import BlurBody, { BLUR_NODE_TYPE } from "./BlurBody";
import ChannelsBody, { CHANNELS_NODE_TYPE } from "./ChannelsBody";
import CompositorBody, { COMPOSITOR_NODE_TYPE } from "./CompositorBody";
import CropBody, { CROP_NODE_TYPE } from "./CropBody";
import ExposureBody, { EXPOSURE_NODE_TYPE } from "./ExposureBody";
import HSLAdjustBody, { HSL_ADJUST_NODE_TYPE } from "./HSLAdjustBody";
import LevelsBody, { LEVELS_NODE_TYPE } from "./LevelsBody";
import MasksExtractorBody, {
  MASKS_EXTRACTOR_NODE_TYPES
} from "./MasksExtractorBody";
import PainterBody, { PAINTER_NODE_TYPE } from "./PainterBody";
import ResizeBody, { RESIZE_NODE_TYPE } from "./ResizeBody";
import RotateAndFlipBody, {
  ROTATE_AND_FLIP_NODE_TYPE
} from "./RotateAndFlipBody";
import ScaleBody, { SCALE_NODE_TYPE } from "./ScaleBody";

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
  [CHANNELS_NODE_TYPE]: ChannelsBody,
  [COMPOSITOR_NODE_TYPE]: CompositorBody,
  [CROP_NODE_TYPE]: CropBody,
  [EXPOSURE_NODE_TYPE]: ExposureBody,
  [HSL_ADJUST_NODE_TYPE]: HSLAdjustBody,
  [LEVELS_NODE_TYPE]: LevelsBody,
  [PAINTER_NODE_TYPE]: PainterBody,
  [RESIZE_NODE_TYPE]: ResizeBody,
  [ROTATE_AND_FLIP_NODE_TYPE]: RotateAndFlipBody,
  [SCALE_NODE_TYPE]: ScaleBody,
  ...Object.fromEntries(
    MASKS_EXTRACTOR_NODE_TYPES.map((t) => [t, MasksExtractorBody] as const)
  )
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
