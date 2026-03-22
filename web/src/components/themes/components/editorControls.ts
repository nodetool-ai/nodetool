import type { Components, Theme } from "@mui/material/styles";
import { editorUiClasses } from "../../../constants/editorUiClasses";

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
            backgroundColor: theme.vars.palette.Paper.overlay,
            borderRadius: editor.controlRadius,
            transition: theme.transitions.create(
              ["border-color", "background-color"],
              {
                duration: theme.transitions.duration.shortest
              }
            ),

            "& .MuiOutlinedInput-notchedOutline": {
              borderColor: theme.vars.palette.divider,
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
                borderColor: theme.vars.palette.primary.main
              }
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
              fontSize: theme.fontSizeSmaller
            },
            [`&.${editorUiClasses.scopeNode} .MuiOutlinedInput-input`]: {
              padding: `${editor.padYNode} ${editor.padXNode}`,
              minHeight: "1.7em",
              lineHeight: "1.5em",
              fontSize: theme.fontSizeSmaller
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
            paddingRight: "24px",
            fontSize: theme.fontSizeTiny,
            backgroundColor: theme.vars.palette.Paper.overlay,
            borderRadius: editor.controlRadius,
            border: `1px solid ${theme.vars.palette.divider}`,
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
              backgroundColor: theme.vars.palette.action.selected,
              borderColor: theme.vars.palette.text.secondary
            },
            "&:focus": {
              backgroundColor: theme.vars.palette.action.selected,
              borderColor: theme.vars.palette.primary.main
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
      root: ({ theme }) => {
        const editor = theme.editor;
        return {
          [`&.${editorUiClasses.menuPaper}`]: {
            backgroundColor: theme.vars.palette.Paper.overlay,
            border: `1px solid ${theme.vars.palette.divider}`,
            borderRadius: editor.menuRadius,
            boxShadow: editor.menuShadow,
            overflow: "hidden"
          }
        };
      }
    }
  },

  MuiMenu: {
    styleOverrides: {
      list: () => ({
        [`&.${editorUiClasses.menuList}`]: {
          padding: 0
        }
      })
    }
  },

  MuiMenuItem: {
    styleOverrides: {
      root: ({ theme }) => ({
        [`&.${editorUiClasses.menuItem}`]: {
          fontWeight: 300,
          fontSize: theme.fontSizeTiny,
          padding: "4px 8px",
          transition: theme.transitions.create(["background-color"], {
            duration: theme.transitions.duration.shortest
          }),
          "&:hover": {
            backgroundColor: theme.vars.palette.action.selected
          },
          "&.Mui-selected": {
            backgroundColor: theme.vars.palette.action.selected,
            color: theme.vars.palette.primary.main
          },
          "&.Mui-selected:hover": {
            backgroundColor: theme.vars.palette.action.selected
          }
        }
      })
    }
  },

  MuiSwitch: {
    styleOverrides: {
      root: ({ theme }) => ({
        [`&.${editorUiClasses.switchRoot}`]: {
          margin: 0,
          padding: 0,
          width: 24,
          height: 12,
          overflow: "visible",

          "& .MuiSwitch-thumb": {
            width: 12,
            height: 12,
            borderRadius: 4,
            margin: 0,
            padding: 0,
            boxShadow: "none",
            backgroundColor: "currentColor"
          },

          "& .MuiSwitch-track": {
            borderRadius: 4,
            backgroundColor: theme.vars.palette.grey[600],
            opacity: 1
          },

          "& .MuiSwitch-switchBase": {
            margin: 0,
            padding: 0,
            // Thumb color when OFF
            color: theme.vars.palette.grey[400],
            transition: theme.transitions.create(["transform"], {
              duration: theme.transitions.duration.shortest
            }),
            "&.Mui-checked": {
              // Thumb color when ON
              color: theme.vars.palette.grey[50],
              transform: "translateX(12px)",
              "& + .MuiSwitch-track": {
                // Track color when ON
                backgroundColor: theme.vars.palette.grey[500],
                opacity: 0.9
              }
            },
            "&:hover": {
              backgroundColor: "transparent"
            },
            "&.Mui-disabled": {
              opacity: 0.6,
              "& + .MuiSwitch-track": {
                opacity: 0.4
              }
            }
          }
        }
      })
    }
  }
};
