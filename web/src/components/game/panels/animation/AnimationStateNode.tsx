import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useTheme } from "@mui/material/styles";

import { Box, Caption, FlexColumn, FlexRow, MOTION, SPACING, TruncatedText, TYPOGRAPHY } from "../../../ui_primitives";
import { ANIMATION_HANDLE, type AnimationStateFlowNode } from "./animationGraphFlow";

const NODE_WIDTH = 168;
// Transitions back to an earlier column leave and enter through the bottom edge, so a pair of opposite transitions draws as two separate curves.
const BACK_SOURCE_STYLE = { left: "70%" } as const;
const BACK_TARGET_STYLE = { left: "30%" } as const;

/** One state on the animation graph canvas, drawn like a workflow node: a header with the state name over its motion. */
function AnimationStateNode({ data, selected }: NodeProps<AnimationStateFlowNode>) {
  const theme = useTheme();
  const palette = theme.vars.palette;
  const live = data.live === "current" ? palette.success.main : data.live === "previous" ? palette.warning.main : null;
  const border = live ?? (selected ? palette.primary.main : palette.divider);
  const status = data.live === "current" ? "playing" : data.live === "previous" ? "blending out" : null;
  return <Box data-testid={`animation-state-${data.stateId}`} data-live={data.live ?? undefined} sx={{
      width: NODE_WIDTH, borderRadius: theme.rounded.node, overflow: "hidden",
      backgroundColor: data.any ? palette.c_node_bg_group : palette.c_node_bg,
      border: `1px ${data.live === "previous" ? "dashed" : "solid"} ${border}`,
      boxShadow: live ? `0 0 0 2px ${live}` : selected ? `0 0 0 2px ${palette.c_selection}` : "none",
      transition: `${MOTION.border}, ${MOTION.shadow}`,
      "@media (prefers-reduced-motion: reduce)": { transition: MOTION.none }
    }}>
    {!data.any && <Handle type="target" id={ANIMATION_HANDLE.in} position={Position.Left} />}
    {!data.any && <Handle type="target" id={ANIMATION_HANDLE.backIn} position={Position.Bottom} style={BACK_TARGET_STYLE} />}
    <FlexRow align="center" gap={SPACING.xs} sx={{ px: SPACING.md, py: SPACING.xs, backgroundColor: data.any ? "transparent" : palette.c_node_header_bg,
      borderBottom: data.any ? "none" : `1px solid ${palette.divider}` }}>
      <TruncatedText component="span" sx={{ ...TYPOGRAPHY.mono.label, flex: 1, minWidth: 0,
        color: data.any ? "text.secondary" : "text.primary" }}>{data.any ? "Any state" : data.stateId}</TruncatedText>
      {data.initial && <Caption color="secondary">Initial</Caption>}
    </FlexRow>
    {!data.any && <FlexColumn sx={{ px: SPACING.md, py: SPACING.xs }}>
      <TruncatedText sx={{ ...TYPOGRAPHY.sans.caption, color: "text.secondary" }}>{data.motion}</TruncatedText>
      {status && <Caption sx={{ color: live ?? undefined }}>{status === "playing" ? "Playing" : "Blending out"}</Caption>}
    </FlexColumn>}
    <Handle type="source" id={ANIMATION_HANDLE.out} position={Position.Right} />
    {!data.any && <Handle type="source" id={ANIMATION_HANDLE.backOut} position={Position.Bottom} style={BACK_SOURCE_STYLE} />}
  </Box>;
}

export default memo(AnimationStateNode);
