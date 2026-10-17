import type { Components, Theme } from "@mui/material/styles";
import { editorUiClasses } from "../../../constants/editorUiClasses";
import {
  BORDER_RADIUS,
  CONTROL,
  MOTION,
  SPACING,
  focusRing,
  getSpacingPx,
  menuItemStyles,
  menuListStyles,
  menuPaperStyles
} from "../../ui_primitives";

/**
 * Editor controls theme slice
 *
 * Centralizes editor control visuals (compact/dense controls) behind marker
 * classes applied by editor_ui primitives. This keeps editor styling
 * theme-driven and non-leaky.
 */
export const editorControlsComponents: Components<Theme> = {
  MuiOutlinedInput: {
    styleOverrides: {
      root: ({ theme }) => {
        const editor = theme.editor;

        return {
          [`&.${editorUiClasses.control}`]: {
            minHeight: "unset",
            padding: 0,
            color: theme.vars.palette.text.primary,
            backgroundColor: theme.vars.palette.c_overlay_subtle,
            borderRadius: editor.controlRadius,
            transition: theme.transitions.create(
              ["border-color", "background-color"],
              {
                duration: theme.transitions.duration.shortest
              }
            ),

            "& .MuiOutlinedInput-notchedOutline": {
              borderColor: "transparent",
              borderWidth: "1px",
              transition: theme.transitions.create(["border-color"], {
                duration: theme.transitions.duration.shortest
              }),
              // Make the outline sit flush so we don't get a "notch gap" at the top.
              top: 0
            },

            "&:hover": {
              backgroundColor: theme.vars.palette.action.selected,
              "& .MuiOutlinedInput-notchedOutline": {
                borderColor: theme.vars.palette.text.secondary
              }
            },

            "&.Mui-focused": {
              backgroundColor: theme.vars.palette.action.selected,
              "& .MuiOutlinedInput-notchedOutline": {
                borderColor: theme.vars.palette.primary.main,
                borderWidth: "2px"
              }
            },
            "&.Mui-error .MuiOutlinedInput-notchedOutline": {
              borderColor: theme.vars.palette.error.main
            },
            "&.Mui-disabled": {
              backgroundColor: theme.vars.palette.action.disabledBackground
            },

            // Notched outline legend (hide it) — avoids weird notch sizing on dense controls
            "& .MuiOutlinedInput-notchedOutline legend": {
              display: "none"
            },

            // Padding + density per scope
            [`&.${editorUiClasses.scopeInspector} .MuiOutlinedInput-input`]: {
              padding: `${editor.padYInspector} ${editor.padXInspector}`,
              minHeight: "1.7em",
              lineHeight: "1.5em",
              fontSize: theme.fontSizeSmall
            },
            [`&.${editorUiClasses.scopeNode} .MuiOutlinedInput-input`]: {
              padding: 0,
              minHeight: "1.7em",
              lineHeight: "1.5em",
              fontSize: theme.fontSizeSmaller
            },
            [`&.${editorUiClasses.scopeNode} .MuiInputBase-inputMultiline`]: {
              padding: `${editor.padYNode} ${editor.padXNode}`
            },

            // Multiline textarea
            "& .MuiInputBase-inputMultiline": {
              maxHeight: "200px",
              overflowY: "auto",
              fontFamily: theme.fontFamily1,
              fontWeight: 400,
              lineHeight: "1.2em",
              resize: "vertical",
              boxSizing: "border-box"
            }
          }
        };
      }
    }
  },

  MuiSelect: {
    styleOverrides: {
      select: ({ theme }) => {
        const editor = theme.editor;
        return {
          [`.${editorUiClasses.control} &`]: {
            width: "100%",
            padding: `${editor.padYNode} ${editor.padXNode}`,
            paddingRight: getSpacingPx(SPACING.xxl),
            fontSize: theme.fontSizeSmaller,
            backgroundColor: "transparent",
            borderRadius: editor.controlRadius,
            border: "none",
            margin: 0,
            minHeight: editor.heightNode,
            display: "flex",
            alignItems: "center",
            transition: theme.transitions.create(
              ["border-color", "background-color"],
              {
                duration: theme.transitions.duration.shortest
              }
            ),
            "&:hover": {
              backgroundColor: "transparent"
            },
            "&:focus": {
              backgroundColor: "transparent"
            }
          },
          [`.${editorUiClasses.control}.${editorUiClasses.scopeInspector} &`]: {
            padding: `${editor.padYInspector} ${editor.padXInspector}`,
            fontSize: theme.fontSizeSmall,
            minHeight: editor.heightInspector
          }
        };
      },
      icon: ({ theme }) => {
        const editor = theme.editor;
        return {
          [`.${editorUiClasses.control} &`]: {
            color: theme.vars.palette.grey[400],
            right: editor.padXNode
          },
          [`.${editorUiClasses.control}.${editorUiClasses.scopeInspector} &`]: {
            right: editor.padXInspector
          }
        };
      }
    }
  },

  MuiPaper: {
    styleOverrides: {
      root: () => ({
        // Remove MUI dark-mode elevation gradient overlay for a flat, Linear-like look.
        backgroundImage: "none"
      })
    }
  },

  // Every menu, context menu and select dropdown shares one surface and one
  // row style. See "Menus" in docs/DESIGN.md.
  MuiMenu: {
    styleOverrides: {
      paper: ({ theme }) => menuPaperStyles(theme),
      list: ({ theme }) => menuListStyles(theme)
    }
  },

  MuiMenuItem: {
    styleOverrides: {
      root: ({ theme }) => menuItemStyles(theme)
    }
  },

  // One switch skin for every Switch: a pill track that turns primary when on.
  // Node bodies (the editor switch class) draw the same switch smaller.
  MuiSwitch: {
    styleOverrides: {
      root: ({ theme }) => ({
        width: CONTROL.height.sm,
        height: getSpacingPx(SPACING.xl),
        padding: 0,
        overflow: "visible",

        "& .MuiSwitch-switchBase": {
          padding: 0,
          margin: getSpacingPx(SPACING.micro),
          color: theme.vars.palette.common.white,
          transition: MOTION.transform,
          "&:hover": {
            backgroundColor: "transparent"
          },
          "&.Mui-checked": {
            transform: `translateX(${getSpacingPx(SPACING.lg)})`,
            color: theme.vars.palette.primary.contrastText,
            "& + .MuiSwitch-track": {
              backgroundColor: theme.vars.palette.primary.main,
              opacity: 1
            }
          },
          "&.Mui-focusVisible + .MuiSwitch-track": focusRing(theme),
          "&.Mui-disabled": {
            opacity: 0.6,
            "& + .MuiSwitch-track": {
              opacity: 0.4
            }
          }
        },

        "& .MuiSwitch-thumb": {
          boxSizing: "border-box",
          width: getSpacingPx(SPACING.lg),
          height: getSpacingPx(SPACING.lg),
          boxShadow: `0 1px 2px ${theme.vars.palette.c_scrim}`
        },

        "& .MuiSwitch-track": {
          borderRadius: BORDER_RADIUS.pill,
          backgroundColor: theme.vars.palette.c_overlay_strong,
          opacity: 1
        },

        [`&.${editorUiClasses.switchRoot}`]: {
          width: CONTROL.height.xs,
          height: getSpacingPx(SPACING.lg),
          "& .MuiSwitch-thumb": {
            width: getSpacingPx(SPACING.md),
            height: getSpacingPx(SPACING.md)
          }
        }
      })
    }
  }
};
