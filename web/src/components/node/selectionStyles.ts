import type { Theme } from "@mui/material/styles";
import type { CSSObject } from "@mui/system";
import { NODE_COLLAPSED_BASE_NODE_SX } from "../../styles/collapsedNodeTokens";
import { MOTION, SHADOW, reducedMotion } from "../ui_primitives";

type BaseNodeSelectionStyleArgs = {
  selected: boolean;
  isFocused: boolean;
  isLoading: boolean;
  /** Ambient liveness ring is showing (node active in other, non-focused runs). */
  hasAmbientRing?: boolean;
  hasParent: boolean;
  hasToggleableResult: boolean;
  baseColor: string | undefined;
  parentColor: string | null;
  theme: Theme;
  minHeight: number;
  /** Header-only layout; must override `height: 100%` so global `.node-body.collapsed` can take effect visually */
  collapsed?: boolean;
};

const CRISP_NO_BLUR_STYLES = {
  backdropFilter: "none",
  WebkitBackdropFilter: "none",
  filter: "none"
} as const;

export const getPreviewNodeSelectionSx = (theme: Theme, selected: boolean) => ({
  display: "flex" as const,
  border: `1px solid ${
    selected ? theme.vars.palette.grey[100] : theme.vars.palette.divider
  }`,
  boxShadow: SHADOW(theme).sm,
  backgroundColor: theme.vars.palette.c_node_bg,
  ...CRISP_NO_BLUR_STYLES
});

export const getOutputNodeSelectionSx = (theme: Theme, selected: boolean) => ({
  display: "flex" as const,
  border: `1px solid ${
    selected
      ? `color-mix(in srgb, ${theme.vars.palette.info.main} 82%, white 18%)`
      : theme.vars.palette.divider
  }`,
  boxShadow: SHADOW(theme).sm,
  backgroundColor: theme.vars.palette.c_node_bg,
  ...CRISP_NO_BLUR_STYLES
});

export const getBaseNodeSelectionStyles = ({
  selected,
  isFocused,
  isLoading,
  hasParent,
  hasToggleableResult,
  baseColor,
  parentColor,
  theme,
  minHeight,
  collapsed = false
}: BaseNodeSelectionStyleArgs) => {
  const resolvedBaseColor = baseColor || theme.vars.palette.primary.main;
  // One 1px hairline marks the node edge in every state, so the box and the
  // handle positions never shift. Selection and focus only recolor it. The
  // run rings paint outside the node and keep the edge free.
  const borderColor = isFocused
    ? theme.vars.palette.warning.main
    : selected
      ? `color-mix(in srgb, ${resolvedBaseColor} 82%, white 18%)`
      : hasParent
        ? `color-mix(in srgb, var(--c_node_header_bg_group) 82%, ${theme.vars.palette.primary.main} 18%)`
        : theme.vars.palette.divider;

  const sizeStyles = collapsed
    ? NODE_COLLAPSED_BASE_NODE_SX
    : {
        height: "100%" as const,
        minHeight,
        overflow: "visible" as const
      };

  const resizeHandleSx: CSSObject = {};
  if (hasToggleableResult) {
    resizeHandleSx["& .react-flow__resize-control.nodrag.bottom.right.handle"] =
      {
        opacity: 0,
        position: "absolute",
        right: "-8px",
        bottom: "-9px",
        transition: `opacity ${MOTION.normal}`
      };
    resizeHandleSx[
      "&:hover .react-flow__resize-control.nodrag.bottom.right.handle"
    ] = { opacity: 1 };
  }

  return {
    display: "flex" as const,
    ...sizeStyles,
    border: `1px ${isFocused ? "dashed" : "solid"} ${borderColor}`,
    boxShadow: selected ? SHADOW(theme).sm : "none",
    outline: "none",
    backgroundColor:
      hasParent && !isLoading ? parentColor : theme.vars.palette.c_node_bg,
    backgroundImage: "none",
    borderRadius: theme.rounded.node,
    transition: `${MOTION.shadow}, ${MOTION.border}`,
    ...reducedMotion({ transition: MOTION.none }),
    "--node-primary-color": resolvedBaseColor,
    ...resizeHandleSx,
    ...CRISP_NO_BLUR_STYLES
  };
};
