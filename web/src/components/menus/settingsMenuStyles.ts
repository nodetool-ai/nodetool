/** @jsxImportSource @emotion/react */
import type { CSSObject } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import {
  BORDER_RADIUS,
  MOTION,
  SPACING,
  Z_INDEX,
  getSpacingPx
} from "../ui_primitives";

/**
 * Section rhythm constants — defined once so every settings panel uses the
 * same vertical cadence. All values resolve to canonical SPACING steps.
 */
const SECTION_GAP_PX = getSpacingPx(SPACING.xl); // 16px between sections
const SECTION_HEADING_TOP_PX = getSpacingPx(SPACING.xxl); // 24px above each new group heading

/**
 * Readable content column width. The form tabs cap at 760px so labels,
 * descriptions, and inputs share a single readable measure. The API Keys
 * card list may grow wider (cards + actions) — see CONTENT_MAX_WIDTH_API_KEYS.
 */
const CONTENT_MAX_WIDTH = "760px";
const CONTENT_MAX_WIDTH_API_KEYS = "880px";

/** Cap form fields to a single readable measure so long URLs don't sprawl. */
const FIELD_MAX_WIDTH = "34em";

/* ------------------------------------------------------------------ */
/*  Shared chrome — `.settings-item`, `.settings-section`, `.description`,
 *  input chrome, headings, dividers. Defined once and imported by every
 *  settings panel that may render outside the SettingsMenu root (e.g.
 *  RemoteSettingsMenu renders directly in tests).
/* ------------------------------------------------------------------ */
export const getSharedSettingsStyles = (theme: Theme): CSSObject => ({
  display: "flex",
  flexDirection: "column",
  height: "100%",
  paddingTop: `${SPACING.xl}px`,

  // Every section = heading (divider above, except the first) + optional
  // description + rows with identical vertical padding.
  ".settings-section": {
    backgroundColor: "transparent",
    borderRadius: 0,
    padding: 0,
    margin: `0 0 ${SECTION_GAP_PX}`,
    boxShadow: "none",
    border: "0 none",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 0
  },
  // Divider above every group heading (Execution, Canvas & Navigation, …).
  // The first heading inside each tab is selected by parent context below so
  // there is no double border at the top of the page.
  ".settings-heading": {
    display: "block",
    margin: `0 0 ${SECTION_GAP_PX}`,
    paddingTop: `${SECTION_HEADING_TOP_PX}`,
    borderTop: `1px solid ${theme.vars.palette.divider}`,
    fontSize: theme.fontSizeBig,
    fontWeight: 600,
    letterSpacing: "0.01em",
    lineHeight: 1.2,
    color: theme.vars.palette.grey[0]
  },
  ".description": {
    marginTop: "0.25em",
    opacity: 0.85,
    color: theme.vars.palette.grey[100],
    fontSize: theme.fontSizeSmall,
    lineHeight: 1.5,
    maxWidth: "60ch"
  },
  "a": {
    color: theme.vars.palette.primary.main,
    textDecoration: "none",
    transition: `color ${MOTION.normal}`,
    "&:hover": {
      color: theme.vars.palette.primary.light,
      textDecoration: "underline"
    }
  },
  // A single, consistent row rhythm for every settings row across every tab.
  ".settings-item": {
    padding: `${SECTION_GAP_PX} 0`,
    "&:last-child": {
      paddingBottom: 0
    },
    "&:first-of-type": {
      paddingTop: 0
    },
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: getSpacingPx(SPACING.md),
    // Cap every MUI input on the form tabs to one readable measure.
    ".MuiInputBase-root": {
      maxWidth: FIELD_MAX_WIDTH
    },
    ".MuiTextField-root": {
      width: "100%",
      maxWidth: FIELD_MAX_WIDTH
    },
    ".MuiFormControl-root": {
      width: "100%",
      minWidth: "unset",
      margin: 0,
      padding: `0 ${getSpacingPx(SPACING.sm)}`,
      "& .MuiInputLabel-root": {
        position: "relative",
        transform: "none",
        marginBottom: `${getSpacingPx(SPACING.md)}`,
        fontWeight: 600,
        letterSpacing: "0.01em",
        color: theme.vars.palette.grey[0],
        fontSize: theme.fontSizeNormal
      },
      "& .MuiInputBase-root": {
        maxWidth: FIELD_MAX_WIDTH,
        backgroundColor: theme.vars.palette.background.paper,
        border: `1px solid ${theme.vars.palette.divider}`,
        borderRadius: BORDER_RADIUS.sm,
        margin: 0,
        padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.xl)}`,
        transition: `${MOTION.border}, background-color ${MOTION.normal}`,
        fontSize: theme.fontSizeNormal,
        "&:hover": {
          borderColor: theme.vars.palette.grey[300]
        },
        "&.Mui-focused": {
          borderColor: theme.vars.palette.primary.main
        },
        "&::before, &::after": {
          content: "none"
        }
      }
    },
    label: {
      color: theme.vars.palette.grey[0],
      fontSize: theme.fontSizeNormal,
      fontWeight: 600,
      letterSpacing: "0.01em",
      padding: 0
    },
    ".description": {
      color: theme.vars.palette.grey[100],
      opacity: 0.85,
      fontSize: theme.fontSizeSmall,
      margin: 0,
      padding: 0,
      maxWidth: "60ch",
      lineHeight: 1.5
    },
    "ul": {
      margin: `${getSpacingPx(SPACING.md)} 0 0`,
      padding: `0 0 0 ${getSpacingPx(SPACING.xl) + 4}px`,
      listStyleType: "square",
      "li": {
        margin: `${getSpacingPx(SPACING.xs)} 0`,
        color: theme.vars.palette.grey[100]
      }
    }
  },
  // `.large` items get the wider field width (endpoints, keys) so they don't
  // span the full content column.
  ".settings-item.large": {
    ".MuiInputBase-root": {
      maxWidth: FIELD_MAX_WIDTH
    }
  },

  ".settings-main-content": {
    padding: `${getSpacingPx(SPACING.md)} 0`,
    width: "100%"
  },

  // Save bar for the registry-driven Integrations sections. The save button
  // sits pinned to the bottom of the viewport so it doesn't get lost in long
  // settings lists.
  ".save-button-container": {
    position: "sticky",
    bottom: 0,
    zIndex: Z_INDEX.sticky,
    padding: `${SPACING.sm + 0.25}em 0`,
    display: "flex",
    justifyContent: "flex-end",
    background: `linear-gradient(transparent, ${theme.vars.palette.background.default} 30%)`
  },

  ".save-button": {
    padding: `${SPACING.xs + 0.25}em ${getSpacingPx(SPACING.xl)}`,
    fontFamily: theme.fontFamily2,
    color: theme.vars.palette.primary.contrastText,
    backgroundColor: theme.vars.palette.primary.main,
    borderRadius: BORDER_RADIUS.sm,
    textTransform: "none",
    fontSize: theme.fontSizeSmall,
    fontWeight: 500,
    "&:hover": {
      boxShadow: `0 2px 6px ${theme.vars.palette.grey[900]}33`
    }
  }
});

/* ------------------------------------------------------------------ */
/*  Main settings page chrome — page header, tabs, sidebar, content area,
 *  scrollbars. Only rendered at the SettingsMenu root.
/* ------------------------------------------------------------------ */
export const settingsStyles = (theme: Theme): CSSObject => ({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  width: "100%",
  ".settings-tabs": {
    marginBottom: `${getSpacingPx(SPACING.xl)}`,
    paddingTop: 0,
    lineHeight: 1.5,
    "& .MuiTabs-indicator": {
      backgroundColor: "var(--palette-primary-main)",
      height: "3px",
      borderRadius: BORDER_RADIUS.xs
    },
    "& .MuiTab-root": {
      color: theme.vars.palette.grey[200],
      transition: `color ${MOTION.normal}`,
      paddingBottom: 0,
      "&.Mui-selected": {
        color: theme.vars.palette.grey[0]
      },
      "&:hover": {
        color: theme.vars.palette.grey[0]
      }
    }
  },
  ".tab-panel": {
    padding: 0,
    fontSize: theme.fontSizeNormal
  },
  ".tab-panel-content": {
    paddingBottom: `${getSpacingPx(SPACING.xl)}`
  },
  ".settings": {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: `${getSpacingPx(SPACING.xl)}`,
    width: "100%",
    height: "100%",
    padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.xl)}`
  },
  ".settings-page-header": {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing(6),
    padding: theme.spacing(6, 6, 4),
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    "& .settings-back": {
      flexShrink: 0
    },
    "& .settings-page-header__titles": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.5),
      minWidth: 0
    },
    "& .settings-page-header__title": {
      margin: 0,
      color: theme.vars.palette.text.primary,
      fontSize: "var(--fontSizeBig)",
      fontWeight: 600,
      lineHeight: 1.2,
      letterSpacing: "-0.01em"
    },
    "& .settings-page-header__subtitle": {
      margin: 0,
      color: theme.vars.palette.text.secondary,
      fontSize: theme.fontSizeSmall,
      lineHeight: 1.4
    }
  },
  ".settings-menu": {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    width: "100%",
    fontSize: theme.fontSizeNormal
  },
  ".settings-container": {
    display: "flex",
    flexDirection: "row",
    flex: 1,
    minHeight: 0,
    overflow: "hidden"
  },
  ".settings-container--api-keys": {
    display: "flex",
    flexDirection: "row",
    flex: 1,
    minHeight: 0,
    overflow: "hidden"
  },
  ".settings-content--api-keys": {
    padding: `${getSpacingPx(SPACING.xxl)} ${getSpacingPx(SPACING.xl)}`,
    overflowY: "auto",
    overflowX: "hidden",
    // The API Keys card list may stay wider than form tabs so a provider row
    // (icon + meta + status + actions) doesn't crowd on a typical monitor.
    maxWidth: CONTENT_MAX_WIDTH_API_KEYS,
    margin: "0 auto",
    width: "100%"
  },
  ".settings-sidebar": {
    width: "220px",
    minWidth: "220px",
    backgroundColor: theme.vars.palette.background.default,
    padding: `${SECTION_HEADING_TOP_PX} 0`,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column"
  },
  ".settings-sidebar-footer": {
    marginTop: "auto",
    padding: `${getSpacingPx(SPACING.xl)} ${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.xs)}`
  },
  ".settings-sidebar-folder": {
    display: "flex",
    flexDirection: "column",
    "& + &": {
      marginTop: `${getSpacingPx(SPACING.xs)}`
    }
  },
  ".settings-sidebar-folder-items": {
    display: "flex",
    flexDirection: "column",
    paddingBottom: `${getSpacingPx(SPACING.xs)}`
  },
  ".settings-sidebar-item": {
    padding: `${getSpacingPx(SPACING.xs)} ${SECTION_HEADING_TOP_PX} ${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.xxl) + 4}px`,
    cursor: "pointer",
    fontSize: theme.fontSizeSmall,
    color: theme.vars.palette.grey[0],
    opacity: 0.7,
    transition: MOTION.all,
    borderLeft: "2px solid transparent",
    "&:hover": {
      opacity: 1,
      backgroundColor: theme.vars.palette.action.hover
    },
    "&.active": {
      opacity: 1,
      borderLeftColor: "var(--palette-primary-main)",
      backgroundColor: theme.vars.palette.action.selected
    }
  },
  ".settings-sidebar-category": {
    display: "flex",
    alignItems: "center",
    gap: `${SPACING.xs + 0.25}em`,
    padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.xl)} ${getSpacingPx(SPACING.xs) + 2}px ${getSpacingPx(SPACING.md)}`,
    color: theme.vars.palette.grey[0],
    fontSize: theme.fontSizeSmaller,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    opacity: 0.85,
    cursor: "pointer",
    userSelect: "none",
    transition: `all ${MOTION.fast}`,
    borderRadius: BORDER_RADIUS.sm,
    outline: "none",
    "&:hover": {
      opacity: 1,
      backgroundColor: theme.vars.palette.action.hover
    },
    "&:focus-visible": {
      boxShadow: `0 0 0 2px ${theme.vars.palette.primary.main}`
    },
    "&.open .settings-sidebar-chevron": {
      transform: "rotate(0deg)"
    },
    ".settings-sidebar-chevron": {
      fontSize: "var(--fontSizeNormal)",
      color: theme.vars.palette.text.secondary,
      transition: `transform ${MOTION.normal}`,
      transform: "rotate(-90deg)"
    },
    ".settings-sidebar-folder-icon": {
      fontSize: "var(--fontSizeBig)",
      color: "var(--palette-primary-main)"
    },
    ".settings-sidebar-category-label": {
      flex: 1
    }
  },
  ".sticky-header": {
    position: "sticky",
    top: 0,
    zIndex: Z_INDEX.overlay,
    padding: `0 ${getSpacingPx(SPACING.xl)}`,
    display: "block",
    backgroundColor: "transparent"
  },
  ".settings-content": {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    padding: `0 ${getSpacingPx(SPACING.xl)}`,
    overflowY: "auto",
    // Cap the readable measure on the form tabs (General, Integrations,
    // About). The API Keys panel overrides this with a wider cap.
    maxWidth: CONTENT_MAX_WIDTH,
    margin: "0 auto",
    width: "100%",
    "&::-webkit-scrollbar": {
      width: "8px"
    },
    "&::-webkit-scrollbar-track": {
      background: theme.vars.palette.background.paper
    },
    "&::-webkit-scrollbar-thumb": {
      background: theme.vars.palette.action.disabledBackground,
      borderRadius: BORDER_RADIUS.sm
    },
    "&::-webkit-scrollbar-thumb:hover": {
      background: theme.vars.palette.action.disabled
    }
  },
  // When a search hides every row in a General section, collapse the whole
  // section (its heading lives inside it) so only matching rows remain. Scoped
  // to direct children so nested component sections (e.g. DefaultModelsMenu,
  // whose rows have no `.settings-item`) aren't hidden.
  ".general-settings > .settings-section:not(:has(.settings-item))": {
    display: "none"
  },
  // Default Models rows (each: label, model select + clear, provider caption).
  ".default-models-list": {
    display: "flex",
    flexDirection: "column"
  },
  ".default-model-row": {
    display: "flex",
    flexDirection: "column",
    gap: `${getSpacingPx(SPACING.sm)}`,
    padding: `${SECTION_GAP_PX} 0`,
    "&:last-child": {
      paddingBottom: 0
    }
  },
  // Merge the shared section/row chrome so it lives once.
  ...getSharedSettingsStyles(theme),
  ".settings-header": {
    display: "flex",
    alignItems: "center",
    gap: `${getSpacingPx(SPACING.md)}`
  },
  ".MuiSelect-select": {
    fontSize: theme.fontSizeNormal,
    padding: `${SPACING.xs + 0.25}em ${getSpacingPx(SPACING.sm)}`,
    marginTop: 0,
    backgroundColor: theme.vars.palette.background.paper,
    borderRadius: BORDER_RADIUS.lg,
    transition: `background-color ${MOTION.normal}`,
    "&:hover": {
      backgroundColor: theme.vars.palette.background.default
    }
  },
  ".MuiSwitch-root": {
    margin: 0
  },
  ".secrets": {
    backgroundColor: `rgba(${theme.vars.palette.warning.mainChannel} / 0.12)`,
    backdropFilter: "blur(5px)",
    color: theme.vars.palette.text.primary,
    fontSize: theme.fontSizeBig,
    marginTop: `${SPACING.md + 0.5}em`,
    padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.xl)}`,
    borderRadius: BORDER_RADIUS.sm,
    display: "flex",
    alignItems: "center",
    gap: `${getSpacingPx(SPACING.md)}`,
    border: `1px solid ${theme.vars.palette.warning.main}`,
    boxShadow: "0 2px 8px rgba(255, 152, 0, 0.1)"
  },
  ".settings-button": {
    transition: `transform ${MOTION.normal}`,
    "&:hover": {
      transform: "rotate(30deg)"
    }
  },
  "button.MuiButton-root": {
    borderRadius: BORDER_RADIUS.sm,
    transition: MOTION.all,
    "&:hover": {
      transform: "translateY(-2px)",
      boxShadow: "0 4px 8px rgba(0,0,0,0.2)"
    }
  },
  // Blanket body size for Typography, but leave section headings alone so they
  // can use their larger heading size.
  ".MuiTypography-root:not(.settings-heading)": {
    fontSize: theme.fontSizeNormal
  },
  ".MuiMenuItem-root": {
    fontSize: theme.fontSizeNormal
  },
  ".MuiButton-root": {
    fontSize: theme.fontSizeNormal
  }
});
