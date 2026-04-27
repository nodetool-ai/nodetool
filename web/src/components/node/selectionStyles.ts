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
  hasParent,
  hasToggleableResult,
  baseColor,
  parentColor,
  theme,
  minHeight
}: BaseNodeSelectionStyleArgs) => {
  const resolvedBaseColor = baseColor || theme.vars.palette.primary.main;
  const defaultBorder = `1px solid color-mix(in srgb, ${theme.vars.palette.grey[800]} 84%, transparent)`;

  return {
    display: "flex" as const,
    height: "100%",
    minHeight,
    overflow: "visible" as const,
    border: isLoading ? "none" : defaultBorder,
    ...theme.applyStyles("dark", {
      border: isLoading ? "none" : defaultBorder
    }),
    boxShadow: selected
      ? `0 0 0 1px color-mix(in srgb, ${resolvedBaseColor} 75%, white 25%), 0 10px 28px rgb(0 0 0 / 0.34), 0 2px 10px color-mix(in srgb, ${resolvedBaseColor} 18%, transparent)`
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
    transition:
      "box-shadow 0.18s ease, outline-color 0.18s ease, border-color 0.18s ease",
    "--node-primary-color": resolvedBaseColor,
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
  };
};
