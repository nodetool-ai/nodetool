import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

const modelListItemStyles = (theme: Theme) =>
  css({
    "&.model-list-item": {
      padding: "0.75em 1em",
      marginBottom: "0.35em",
      boxSizing: "border-box",
      wordBreak: "break-word",
      maxHeight: "calc(100% - 0.75em)", // Ensure it fits within the react-window item size minus margin
      overflow: "hidden", // Prevent content from spilling out

      "&.compact": {
        padding: ".5em .75em"
      },

      "& .model-content": {
        display: "flex",
        flexDirection: "column",
        gap: "0.5em",
        width: "100%",
        padding: "0"
      },

      "& .model-top-row": {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "1em",
        width: "100%",
        minHeight: "2.75em"
      },

      "& .model-info-container": {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "flex-start",
        gap: ".35em",
        lineHeight: "inherit",
        minWidth: 0 // Prevents flex item from overflowing
      },

      "& .model-header": {
        flex: "1 1 auto",
        width: "100%",
        lineHeight: "1.3em",
        cursor: "default"
      },

      "& .model-description-container": {
        width: "100%",
        marginTop: "0.25em"
      },

      "& .model-description": {
        lineHeight: "1.4em",
        wordBreak: "break-word",
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
        textOverflow: "ellipsis"
      },

      "& .model-name-link": {
        color: theme.vars.palette.primary.light,
        display: "block",
        textDecoration: "none",
        marginLeft: "0 !important",
        paddingBottom: "0.25em",
        transition: "color 0.2s",
        "&:hover": {
          color: theme.vars.palette.primary.main,
          textDecoration: "none"
        },
        "&.no-link": {
          color: theme.vars.palette.text.primary,
          cursor: "default",
          "&:hover": { textDecoration: "none" }
        }
      },

      "& .model-owner": {
        color: theme.vars.palette.text.secondary,
        fontSize: "0.85rem",
        marginRight: 0,
        marginBottom: ".15em",
        opacity: 0.8,
        fontWeight: 500
      },

      "& .model-name": {
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
        textOverflow: "ellipsis",
        fontSize: "1.1rem",
        fontWeight: 600,
        wordBreak: "break-word",
        letterSpacing: "-0.01em"
      },
      "& .model-path": {
        display: "block",
        color: theme.vars.palette.text.secondary,
        fontSize: "0.85rem",
        marginTop: "0.25em"
      },
      "& .model-details": {
        flex: "0 0 auto",
        gap: "0.4em",
        maxWidth: "100%",
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        flexDirection: "row"
      },

      "& .model-size": {
        color: theme.vars.palette.grey[200],
        fontSize: "var(--fontSizeSmall)",
        textAlign: "right",
        minWidth: "7em"
      },

      "& .model-info": {
        color: theme.vars.palette.text.secondary,
        fontSize: "0.875rem"
      },
      "& .pipeline-tag": {
        backgroundColor: theme.vars.palette.action.hover,
        color: theme.vars.palette.text.secondary,
        fontSize: "0.75rem",
        fontWeight: 500,
        marginLeft: "0.5em",
        padding: ".3em .8em",
        borderRadius: "12px",
        height: "auto",
        border: `1px solid ${theme.vars.palette.divider}`,
        transition: "all 0.2s",
        "&:hover": {
          backgroundColor: theme.vars.palette.action.selected,
          borderColor: theme.vars.palette.text.secondary
        }
      },

      "& .pipeline-tag-link": {
        textDecoration: "none"
      },

      "& .actions-container": {
        display: "flex",
        justifyContent: "flex-end",
        gap: "1em",
        alignItems: "center",
        flexShrink: 0,
        minWidth: "220px"
      },

      "& .model-stats": {
        fontSize: "var(--fontSizeSmaller)",
        color: theme.vars.palette.text.secondary,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        minWidth: "140px",
        gap: "0.5em",
        flexShrink: 0
      },

      "& .model-stats-item": {
        display: "flex",
        alignItems: "center",
        gap: "0.25em",
        margin: "0 0.5em 0 0",
        fontSize: "var(--fontSizeSmaller)"
      },

      "& .model-stats-item svg": {
        fontSize: "var(--fontSizeTiny)"
      },

      "& .model-actions": {
        display: "flex",
        gap: 0,
        alignItems: "center"
      },

      "& .downloaded-icon": {
        marginBottom: "-0.25em",
        marginRight: "0.5em",
        color: theme.vars.palette.grey[200],
        "&:hover": {
          backgroundColor: "transparent",
          color: theme.vars.palette.success.main
        }
      },
      "& .show-in-explorer-button": {
        color: theme.vars.palette.c_folder,
        "&:hover": {
          backgroundColor: "transparent",
          color: "var(--c_file)"
        }
      },
      //
      ".model-item": {
        padding: 0,
        borderBottom: `1px solid ${theme.vars.palette.divider}`,
        marginBottom: theme.spacing(1),
        "&:hover": {
          backgroundColor: theme.vars.palette.action.hover
        }
      },
      ".model-text": {
        wordBreak: "break-word",
        maxHeight: "3.5em",
        overflow: "hidden"
      },
      ".model-text span": {
        maxHeight: "2.5em",
        overflow: "hidden"
      },
      ".model-text p": {
        paddingTop: theme.spacing(1)
      },
      button: {
        color: theme.vars.palette.grey[200],
        margin: "0",
        padding: "0 .5em"
      },
      ".model-external-link-icon": {
        boxShadow: "none",
        cursor: "pointer",
        padding: ".75em",
        backgroundColor: "transparent",
        filter: "saturate(0)",
        transition: "transform 0.125s ease-in, filter 0.2s ease-in",
        "&:hover": {
          backgroundColor: "transparent",
          transform: "scale(1.25)",
          filter: "saturate(1)"
        }
      },
      ".size-and-license": {
        display: "flex",
        flexDirection: "row",
        fontSize: "var(--fontSizeSmaller)",
        gap: "1em"
      },
      ".model-category.empty": {
        color: theme.vars.palette.grey[500],
        marginBottom: "2em"
      },
      ".model-type-button.empty": {
        color: theme.vars.palette.grey[400],
        "& span": {
          color: theme.vars.palette.grey[400]
        }
      },
      ".model-type-button.Mui-selected.empty span": {
        color: "var(--palette-primary-dark)"
      },
      ".model-type-list .model-type-button:first-of-type": {
        "&, & .MuiListItemText-primary": {
          color: "var(--palette-grey-100)"
        }
      },
      ".model-type-list .model-type-button:first-of-type.Mui-selected": {
        "&, & .MuiListItemText-primary": {
          color: "var(--palette-primary-main)"
        }
      },
      // missing model
      "&.missing .model-header": {
        color: "var(--palette-grey-400)"
      },
      "&.missing .model-details": {
        maxWidth: "25px"
      }
    }
  });

export default modelListItemStyles;
