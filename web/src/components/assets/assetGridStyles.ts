/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { SPACING, getSpacingPx, Z_INDEX } from "../ui_primitives";

export const assetGridStyles = (theme: Theme) => {
  return css({
    "&": {
      display: "flex",
      marginTop: getSpacingPx(SPACING.xl),
      flexDirection: "column",
      justifyContent: "flex-start",
      height: "100%",
      minHeight: 0,
      overflow: "hidden",
      containerType: "inline-size"
    },

    // DROPZONE
    // minHeight: 0 lets this flex child shrink to the remaining viewport.
    // Without it the pane grows to the tile list and overflow:hidden on the
    // manager page clips the grid — the inner list never becomes a scroller.
    // The sidebar keeps the viewport-relative maxHeight; the Assets tab
    // overrides that cap and relies on this shrink.
    ".dropzone": {
      display: "flex",
      outline: "none",
      flexDirection: "column",
      position: "relative",
      flexGrow: 1,
      flexShrink: 1,
      minHeight: 0,
      overflow: "hidden",
      width: "100%",
      maxHeight: "calc(-260px + 100vh)"
    },
    ".audio-controls-container": {
      position: "absolute",
      width: "calc(100% - 32px)",
      left: "16px",
      bottom: "0",
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(SPACING.xs),
      zIndex: Z_INDEX.overlay,
      padding: getSpacingPx(SPACING.md),
      borderTop: `2px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.grey[800]
    },
    ".controls .zoom": {
      maxWidth: "200px",
      paddingBottom: getSpacingPx(SPACING.md)
    },
    ".current-folder": {
      display: "block",
      left: "0",
      fontSize: theme.fontSizeNormal,
      color: theme.vars.palette.grey[200],
      margin: `${getSpacingPx(SPACING.xl)} 0 0 0`
    },
    ".folder-slash": {
      color: theme.vars.palette.primary.main,
      fontWeight: 600,
      marginRight: getSpacingPx(SPACING.xs),
      userSelect: "none"
    },
    ".selected-asset-info": {
      display: "flex",
      alignItems: "center",
      fontSize: `${theme.vars.fontSizeSmall} !important`,
      color: theme.vars.palette.grey[400],
      minHeight: "25px",
      padding: "0",
      margin: `0 0 0 ${getSpacingPx(SPACING.md)}`
    },
    ".folder-list-container": {
      padding: 0
    },
    ".folder-list": {
      listStyleType: "none",
      padding: 0,
      margin: 0
    },
    ".file-info": {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      "& > span": {
        textOverflow: "ellipsis",
        overflow: "hidden",
        whiteSpace: "nowrap",
        maxWidth: "200px"
      }
    },
    "@media (max-width: 600px)": {
      "&": {
        marginTop: "0"
      },
      ".dropzone": {
        maxHeight: "calc(100vh - 140px)"
      },
      ".audio-controls-container": {
        left: "8px",
        width: "calc(100% - 16px)"
      }
    },
    "@container (max-width: 520px)": {
      ".header-info": {
        display: "none !important"
      }
    }
  });
};

export default assetGridStyles;
