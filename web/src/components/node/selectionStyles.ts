import type { Theme } from "@mui/material/styles";

type BaseNodeSelectionStyleArgs = {
  selected: boolean;
  isFocused: boolean;
  isLoading: boolean;
  hasParent: boolean;
  hasToggleableResult: boolean;
  baseColor: string | undefined;
  parentColor: string | null;
  theme: Theme;
  minHeight: number;
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
  boxShadow: selected ? `0 0 0 2px var(--palette-grey-100)` : "none",
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
    : `1px solid ${theme.vars.palette.grey[700]}`,
  boxShadow: selected
    ? `0 0 0 2px rgb(${theme.vars.palette.primary.mainChannel} / 0.95), 0 0 28px rgb(${theme.vars.palette.primary.mainChannel} / 0.55), 0 8px 20px rgb(${theme.vars.palette.primary.mainChannel} / 0.25)`
    : "none",
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
  minHeight
}: BaseNodeSelectionStyleArgs) => ({
  display: "flex" as const,
  height: "100%",
  minHeight,
  overflow: "visible" as const,
  border: isLoading ? "none" : `1px solid var(--palette-grey-900)`,
  ...theme.applyStyles("dark", {
    border: isLoading ? "none" : `1px solid var(--palette-grey-900)`
  }),
  boxShadow: selected
    ? `0 0 0 1px ${baseColor || "#666"}, 0 1px 10px rgba(0,0,0,0.5)`
    : isFocused
      ? `0 0 0 2px ${theme.vars.palette.warning.main}`
      : "none",
  outline: isFocused
    ? `2px dashed ${theme.vars.palette.warning.main}`
    : selected
      ? `3px solid ${baseColor || "#666"}`
      : "none",
  outlineOffset: "-2px",
  backgroundColor:
    hasParent && !isLoading ? parentColor : theme.vars.palette.c_node_bg,
  borderRadius: "var(--rounded-node)",
  "--node-primary-color": baseColor || "var(--palette-primary-main)",
  ...(hasToggleableResult
    ? {
        "& .react-flow__resize-control.nodrag.bottom.right.handle": {
          opacity: 0,
          position: "absolute" as const,
          right: "-8px",
          bottom: "-9px",
          transition: "opacity 0.2s"
        },
        "&:hover .react-flow__resize-control.nodrag.bottom.right.handle": {
          opacity: 1
        }
      }
    : {}),
  ...CRISP_NO_BLUR_STYLES
});
