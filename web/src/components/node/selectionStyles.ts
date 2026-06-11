import type { Theme } from "@mui/material/styles";
import { NODE_COLLAPSED_BASE_NODE_SX } from "../../styles/collapsedNodeTokens";
import { MOTION } from "../ui_primitives";

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

export const getPreviewNodeSelectionSx = (
  theme: Theme,
  selected: boolean
) => ({
  display: "flex" as const,
  boxShadow: selected
    ? `0 0 0 2px var(--palette-grey-100)`
    : `0 8px 20px rgb(0 0 0 / 0.16), 0 1px 0 rgb(255 255 255 / 0.03) inset`,
  backgroundColor: theme.vars.palette.c_node_bg,
  ...CRISP_NO_BLUR_STYLES
});

export const getOutputNodeSelectionSx = (
  theme: Theme,
  selected: boolean
) => ({
  display: "flex" as const,
  border: selected
    ? `3px solid ${theme.vars.palette.primary.main}`
    : `1px solid ${theme.vars.palette.divider}`,
  boxShadow: selected
    ? `0 0 0 2px rgb(${theme.vars.palette.primary.mainChannel} / 0.95), 0 0 28px rgb(${theme.vars.palette.primary.mainChannel} / 0.55), 0 8px 20px rgb(${theme.vars.palette.primary.mainChannel} / 0.25)`
    : "0 1px 2px rgb(0 0 0 / 0.04)",
  backgroundColor: theme.vars.palette.c_node_bg,
  ...CRISP_NO_BLUR_STYLES
});

export const getBaseNodeSelectionStyles = ({
  selected,
  isFocused,
  isLoading,
  hasAmbientRing = false,
  hasParent,
  hasToggleableResult,
  baseColor,
  parentColor,
  theme,
  minHeight,
  collapsed = false
}: BaseNodeSelectionStyleArgs) => {
  const resolvedBaseColor = baseColor || theme.vars.palette.primary.main;
  const defaultBorder = `1px solid color-mix(in srgb, ${theme.vars.palette.grey[800]} 84%, transparent)`;

  // When the node carries an execution ring (the primary loading ring outside
  // the node, or the ambient ring at its edge), selection moves *inside* the
  // node so the two never fight over the border zone: selection is shown as the
  // inset outline + depth shadow only, dropping its own crisp outer ring. The
  // outer zone is left to the run animation.
  const hasRunActivity = isLoading || hasAmbientRing;
  const selectionDepthShadow = `0 10px 28px rgb(0 0 0 / 0.34), 0 2px 10px color-mix(in srgb, ${resolvedBaseColor} 18%, transparent)`;
  const selectionOuterRing = `0 0 0 1px color-mix(in srgb, ${resolvedBaseColor} 75%, white 25%)`;
  const selectionShadow = hasRunActivity
    ? selectionDepthShadow
    : `${selectionOuterRing}, ${selectionDepthShadow}`;

  const sizeStyles = collapsed
    ? NODE_COLLAPSED_BASE_NODE_SX
    : {
        height: "100%" as const,
        minHeight,
        overflow: "visible" as const
      };

  return {
    display: "flex" as const,
    ...sizeStyles,
    border: isLoading ? "none" : defaultBorder,
    ...theme.applyStyles("dark", {
      border: isLoading ? "none" : defaultBorder
    }),
    boxShadow: selected
      ? selectionShadow
      : isFocused
        ? `0 0 0 2px ${theme.vars.palette.warning.main}, 0 10px 24px rgb(0 0 0 / 0.22)`
        : `0 8px 20px rgb(0 0 0 / 0.16), 0 1px 0 rgb(255 255 255 / 0.03) inset`,
    outline: isFocused
      ? `2px dashed ${theme.vars.palette.warning.main}`
      : selected
        ? `2px solid color-mix(in srgb, ${resolvedBaseColor} 82%, white 18%)`
        : "none",
    outlineOffset: "-1px",
    backgroundColor:
      hasParent && !isLoading ? parentColor : theme.vars.palette.c_node_bg,
    backgroundImage:
      "linear-gradient(180deg, rgb(255 255 255 / 0.025) 0%, rgb(255 255 255 / 0.008) 18%, transparent 52%)",
    borderRadius: "var(--rounded-node)",
    transition: `${MOTION.shadow}, outline-color ${MOTION.normal}, ${MOTION.border}`,
    "--node-primary-color": resolvedBaseColor,
    ...(hasToggleableResult
      ? {
          "& .react-flow__resize-control.nodrag.bottom.right.handle": {
            opacity: 0,
            position: "absolute" as const,
            right: "-8px",
            bottom: "-9px",
            transition: `opacity ${MOTION.normal}`
          },
          "&:hover .react-flow__resize-control.nodrag.bottom.right.handle": {
            opacity: 1
          }
        }
      : {}),
    ...CRISP_NO_BLUR_STYLES
  };
};
