import { Theme, createTheme, ThemeOptions } from "@mui/material/styles";
// import type {} from "@mui/material/themeCssVarsAugmentation"; // No longer strictly needed for this approach
import { paletteDark } from "./paletteDark";
import { paletteLight } from "./paletteLight";

import "@fontsource/inter";
import "@fontsource/inter/200.css";
import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";

import "@fontsource/jetbrains-mono/200.css";
import "@fontsource/jetbrains-mono/300.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";

declare module "@mui/system/createTheme" {
  interface ThemeOptions {
    fontSizeGiant?: string;
    fontSizeBigger?: string;
    fontSizeBig?: string;
    fontSizeNormal?: string;
    fontSizeSmall?: string;
    fontSizeSmaller?: string;
    fontSizeTiny?: string;
    fontSizeTinyer?: string;
    fontFamily1?: string;
    fontFamily2?: string;
  }
  interface Theme {
    fontSizeGiant: string;
    fontSizeBigger: string;
    fontSizeBig: string;
    fontSizeNormal: string;
    fontSizeSmall: string;
    fontSizeSmaller?: string;
    fontSizeTiny?: string;
    fontSizeTinyer?: string;
    fontFamily1: string;
    fontFamily2: string;
  }
}

const ThemeNodes: Theme = createTheme({
  defaultColorScheme: "dark",
  colorSchemes: {
    dark: {
      palette: paletteDark
    },
    light: {
      palette: paletteDark
    }
  },
  cssVariables: {
    colorSchemeSelector: "[data-mui-color-scheme]",
    cssVarPrefix: ""
  },

  // fontSizeGiant: "2.5em",
  // fontSizeBigger: "1.25em",
  // fontSizeBig: "1.125em",
  // fontSizeNormal: "12px",
  // fontSizeSmall: "0.875em",
  // fontSizeSmaller: "0.75em",
  // fontSizeTiny: "0.65em",
  // fontSizeTinyer: "0.55em",
  fontSizeGiant: "2em",
  fontSizeBigger: "1.25em",
  fontSizeBig: "1.125em",
  fontSizeNormal: "16px",
  fontSizeSmall: "0.875em",
  fontSizeSmaller: "0.75em",
  fontSizeTiny: "0.65em",
  fontSizeTinyer: "0.55em",
  fontFamily1: "'Inter', Arial, sans-serif",
  fontFamily2: "'JetBrains Mono', 'Inter', Arial, sans-serif",
  typography: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 15
  },
  spacing: 4,
  shape: {
    borderRadius: 4
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          minWidth: 36
        },
        sizeSmall: ({ theme }) => ({
          margin: "2px",
          padding: "2px 6px",
          height: "15px",
          fontSize: theme.fontSizeSmall,
          minWidth: "20px",
          backgroundColor: "#333",
          "&:hover": {
            backgroundColor: theme.palette.grey[500]
          }
        })
      },
      variants: [
        {
          props: { variant: "medium" },
          style: {
            padding: "0.2em 0.4em",
            lineHeight: "1.1em"
          }
        }
      ]
    },
    MuiSvgIcon: {
      styleOverrides: {
        root: {
          maxWidth: "100%",
          maxHeight: "100%"
        }
      }
    },
    MuiTypography: {
      styleOverrides: {
        caption: ({ theme }) => ({
          display: "block",
          fontSize: ".55em",
          fontFamily: theme.fontFamily1,
          marginTop: "-0.5em"
        }),
        h1: ({ theme }) => ({
          fontSize: "2em",
          marginTop: theme.spacing(4),
          marginBottom: theme.spacing(2),
          fontFamily: theme.fontFamily2,
          wordSpacing: "-3px"
        }),
        h2: ({ theme }) => ({
          fontSize: "1.75em",
          marginTop: theme.spacing(4),
          marginBottom: theme.spacing(2),
          fontFamily: theme.fontFamily2,
          wordSpacing: "-.2em"
        }),
        h3: ({ theme }) => ({
          fontSize: "1.5em",
          marginTop: theme.spacing(4),
          marginBottom: theme.spacing(2),
          fontFamily: theme.fontFamily2,
          wordSpacing: "-.2em"
        }),
        h4: ({ theme }) => ({
          fontSize: "1.25em",
          marginTop: theme.spacing(4),
          marginBottom: theme.spacing(2),
          textTransform: "uppercase",
          fontWeight: 300,
          fontFamily: theme.fontFamily2,
          wordSpacing: "-.2em"
        }),
        h5: ({ theme }) => ({
          fontSize: "0.8em",
          marginTop: theme.spacing(4),
          marginBottom: theme.spacing(2),
          textTransform: "uppercase",
          fontWeight: 600,
          fontFamily: theme.fontFamily2,
          wordSpacing: "-.2em"
        }),
        h6: ({ theme }) => ({
          fontSize: "0.8em",
          marginTop: theme.spacing(4),
          marginBottom: theme.spacing(2),
          fontFamily: theme.fontFamily2,
          textTransform: "uppercase",
          wordSpacing: "-.2em"
        }),
        body1: ({ theme }) => ({
          fontSize: "1em",
          fontFamily: theme.fontFamily1,
          fontWeight: 300,
          wordSpacing: "0",
          lineHeight: 1.1,
          marginTop: theme.spacing(0),
          marginBottom: theme.spacing(0)
        }),
        body2: ({ theme }) => ({
          fontSize: "1em",
          lineHeight: 1.1,
          fontFamily: theme.fontFamily1
        })
      }
    },
    MuiInputBase: {
      styleOverrides: {
        root: ({ theme }) => ({
          fontSize: theme.fontSizeNormal,
          lineHeight: "1.1em",
          margin: 0,
          marginTop: "0 !important",
          marginBottom: "0 !important",
          padding: "0",
          width: "100%",
          "&::placeholder": {
            opacity: 0,
            visibility: "hidden"
          },
          "&.MuiInput-root:hover:not(&.Mui-disabled, &.Mui-error)::before": {
            border: "0"
          }
        }),
        inputMultiline: {
          margin: "0",
          padding: "2px 8px 0px 4px !important",
          backgroundColor: "#4b4b4b",
          resize: "vertical"
        },
        input: ({ theme }) => ({
          padding: "0px",
          maxHeight: "40em"
        })
      }
    },
    MuiTextField: {
      styleOverrides: {
        root: ({ theme }) => ({
          fontFamily: theme.fontFamily1,
          fontSize: theme.fontSizeSmall,
          lineHeight: "1.0em",
          backgroundColor: "transparent",
          minHeight: "15px",
          margin: "0",
          padding: "0 .5em .5em .2em",
          resize: "vertical",
          "& .MuiInput-underline:before": {
            borderBottom: "0"
          },
          "& .MuiInput-underline:after": {
            borderBottom: "0"
          },
          "& .MuiInputBase-inputMultiline": {
            fontFamily: theme.fontFamily1,
            fontSize: theme.fontSizeSmaller,
            lineHeight: "1.1em",
            cursor: "auto"
          },
          "& .MuiInputBase-inputMultiline.edit-value": {
            fontFamily: theme.fontFamily1
          },
          "& .MuiOutlinedInput-notchedOutline legend": {
            display: "none"
          }
        })
      }
    },
    MuiLink: {
      styleOverrides: {
        root: {
          marginLeft: "0.6em !important",
          marginRight: "0.6em !important"
        }
      }
    },
    MuiInputLabel: {
      styleOverrides: {
        root: ({ theme }) => ({
          position: "relative",
          marginBottom: "-3px",
          letterSpacing: "-.02em",
          // wordSpacing: "-.05em",
          transform: "translate(0px, 0px) scale(1.0)",
          textTransform: "capitalize",
          transformOrigin: "top left",
          fontFamily: theme.fontFamily1,
          fontSize: theme.fontSizeSmall,
          lineHeight: "1em",
          minHeight: "1.2em",
          margin: " 0",
          "&.Mui-focused": {
            color: theme.palette.c_white
          }
        })
      }
    },
    MuiFormControl: {
      styleOverrides: {
        root: ({ theme }) => ({
          margin: 0,
          display: "block",
          width: "100%",
          fontSize: theme.fontSizeSmall
        })
      }
    },
    MuiFormControlLabel: {
      styleOverrides: {
        root: {
          width: "100%"
        }
      }
    },
    MuiButtonBase: {
      styleOverrides: {
        root: ({ theme }) => ({
          // padding: theme.spacing(1),
          // marginRight: theme.spacing(1),
          // marginBottom: theme.spacing(1)
        })
      }
    },
    MuiSwitch: {
      styleOverrides: {
        root: {
          margin: "0",
          padding: "0",
          width: "24px",
          height: "12px",
          overflow: "visible"
        },
        thumb: {
          width: "12px !important",
          height: "12px !important",
          borderRadius: ".25em",
          margin: "0",
          padding: "0"
        },
        track: {
          borderRadius: ".25em"
        },
        switchBase: ({ theme }) => ({
          margin: "0",
          padding: "0 !important",
          color: theme.palette.grey[400],
          "&.Mui-checked": {
            color: theme.palette.grey[100],
            transform: "translateX(12px) !important"
          },
          "&.Mui-checked + .MuiSwitch-track": {
            backgroundColor: theme.palette.grey[100]
          }
        })
      }
    },
    MuiMenuItem: {
      styleOverrides: {
        root: ({ theme }) => ({
          fontFamily: theme.fontFamily1,
          backgroundColor: "#333",
          marginBottom: "0px",
          paddingTop: "4px",
          paddingBottom: "4px",
          fontWeight: 300,
          "&:nth-of-type(even)": {
            backgroundColor: "#313131",
            "&:hover": {
              backgroundColor: "#444"
            },
            "&:selected": {
              backgroundColor: "#333"
            }
          },
          "&:nth-of-type(odd)": {
            backgroundColor: "#363636",
            "&:hover": {
              backgroundColor: "#444"
            },
            "&:selected": {
              backgroundColor: "#333"
            }
          },
          "&.Mui-hover": {
            color: "var(--palette-primary-light)",
            backgroundColor: "#444"
          },
          "&.Mui-selected": {
            color: "var(--palette-primary-main)",
            backgroundColor: "#333"
          }
        })
      }
    },
    MuiCheckbox: {
      styleOverrides: {
        root: ({ theme }) => ({
          padding: "0px 4px",
          color: theme.palette.text?.secondary,
          "&.Mui-checked": {
            color: theme.palette.primary?.main
          }
        })
      }
    },
    MuiSelect: {
      styleOverrides: {
        root: { width: "100%" },
        select: ({ theme }) => ({
          width: "100%",
          padding: "0 0 0 .4em",
          fontFamily: theme.fontFamily1,
          fontSize: theme.fontSizeSmaller,
          backgroundColor: theme.palette.grey[600],
          margin: "0"
        }),
        icon: ({ theme }) => ({
          color: theme.palette.grey[400]
        })
        // filled: {},
        // outlined: {}
      }
    },
    MuiRadio: {
      styleOverrides: {
        root: ({ theme }) => ({
          color: theme.palette.text?.secondary,
          "&.Mui-checked": {
            color: theme.palette.primary?.main
          }
        })
      }
    },
    MuiFab: {
      styleOverrides: {
        root: ({ theme }) => ({
          margin: theme.spacing(4, 4)
        })
      }
    },
    MuiSnackbar: {
      styleOverrides: {
        root: ({ theme }) => ({
          fontSize: theme.fontSizeSmall,
          padding: "4px"
        }),
        anchorOriginTopRight: {}
      }
    },
    MuiSnackbarContent: {
      styleOverrides: {
        root: ({ theme }) => ({
          padding: "5px",
          margin: "5px",
          fontSize: theme.fontSizeSmaller,
          border: " 1px dashed #333",
          backgroundColor: "#333",
          color: "#eee",
          cursor: "default",
          userSelect: "text"
        })
      }
    },
    MuiToggleButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          fontFamily: theme.fontFamily2,
          "&.MuiButtonBase-root.MuiToggleButton-root": {
            lineHeight: "1.2em !important"
          },
          "&.MuiToggleButton-sizeSmall.Mui-selected": {
            color: theme.palette.c_white,
            backgroundColor: theme.palette.grey[800]
          },
          "&.MuiToggleButton-sizeSmall": {
            fontSize: "12px",
            color: theme.palette.grey[400],
            padding: "0 4px",
            margin: 0,
            border: 0
          }
        })
      }
    },
    MuiBackdrop: {
      styleOverrides: {
        root: {
          backgroundColor: "rgba(25, 25, 25, 0.1)"
        }
      }
    },
    MuiToggleButtonGroup: {
      styleOverrides: {
        root: {
          marginLeft: "10px"
        }
      }
    },
    MuiPopover: {
      styleOverrides: {
        root: { zIndex: 20100 }
      }
    },
    MuiTabs: {
      styleOverrides: {
        flexContainer: {
          alignItems: "flex-start"
        }
      }
    },
    MuiTab: {
      styleOverrides: {
        root: {
          alignItems: "flex-start"
        }
      }
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: ({ theme }) => ({
          fontFamily: theme.fontFamily2,
          fontSize: theme.fontSizeBig
        })
      }
    }
  }
});

export default ThemeNodes;
