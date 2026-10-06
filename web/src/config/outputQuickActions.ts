import type { SvgIconComponent } from "@mui/icons-material";
import HighQualityIcon from "@mui/icons-material/HighQuality";
import LayersClearIcon from "@mui/icons-material/LayersClear";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";

import type { QUICK_ACTION_NODE_TYPES } from "./quickActionNodeTypes";

export type OutputQuickAction = {
  key: string;
  label: string;
  nodeType: (typeof QUICK_ACTION_NODE_TYPES)[number];
  /** Input handle on the created node that receives the output. */
  targetHandle: string;
  Icon: SvgIconComponent;
};

/**
 * One-step follow-ups offered on an image output: each creates its node and
 * wires the output into it. "Edit" is Image To Image, the quick-action node
 * that regenerates an image from a prompt.
 */
export const IMAGE_OUTPUT_QUICK_ACTIONS: readonly OutputQuickAction[] = [
  {
    key: "upscale",
    label: "Upscale",
    nodeType: "nodetool.image.Upscale",
    targetHandle: "image",
    Icon: HighQualityIcon
  },
  {
    key: "remove-background",
    label: "Remove background",
    nodeType: "nodetool.image.RemoveBackground",
    targetHandle: "image",
    Icon: LayersClearIcon
  },
  {
    key: "edit",
    label: "Edit with prompt",
    nodeType: "nodetool.image.ImageToImage",
    targetHandle: "image",
    Icon: AutoFixHighIcon
  }
];

/** Quick actions for an output of `outputType`, empty when none apply. */
export const outputQuickActionsFor = (
  outputType: string | undefined
): readonly OutputQuickAction[] =>
  outputType === "image" ? IMAGE_OUTPUT_QUICK_ACTIONS : [];
