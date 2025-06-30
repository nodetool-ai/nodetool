import { css } from "@emotion/react";

const modelListItemStyles = (theme: any) =>
  css({
    "&.model-list-item": {
      padding: "0.5em 1em",
      marginBottom: "0",
      backgroundColor: theme.palette.grey[800],
      boxSizing: "border-box",
      borderBottom: "1px solid " + theme.palette.grey[600],
      wordBreak: "break-word",
      transition: "background-color 0.125s ease-in, border 0.125s ease-in",
      "&.compact": {
        padding: ".25em .5em"
      },

      "&:hover": {
        opacity: 0.9,
        backgroundColor: theme.palette.grey[600]
      },

      "& .model-content": {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "1em",
        width: "100%",
        padding: "0em 0.5em"
      },

      "& .model-info-container": {
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1em",
        lineHeight: "2.5em",
        minWidth: 0 // Prevents flex item from overflowing
      },

      "& .model-header": {
        flex: 1,
        maxWidth: "500px",
        lineHeight: "1.2em",
        cursor: "default"
      },

      "& .model-name-link": {
        color: "var(--palette-primary-light)",
        display: "block",
        textDecoration: "none",
        marginLeft: "0 !important",
        paddingBottom: "0.25em",
        "&:hover": {}
      },

      "& .model-name": {
        flexGrow: 1,
        textTransform: "uppercase",
        fontSize: "var(--fontSizeNormal)",
        fontWeight: "400",
        textDecoration: "none",
        overflow: "hidden",
        textOverflow: "ellipsis"
      },
      "& .model-path": {
        display: "block",
        color: theme.palette.grey[200],
        fontSize: "var(--fontSizeSmaller)"
      },
      "& .model-details": {
        flex: 1,
        maxWidth: "300px",
        gap: "0.2em",
        width: "250px",
        display: "flex",
        alignItems: "start",
        flexWrap: "wrap",
        flexDirection: "column"
      },

      "& .model-size": {
        color: theme.palette.grey[200],
        fontSize: "var(--fontSizeSmall)",
        textAlign: "right",
        minWidth: "7em"
      },

      "& .model-info": {
        color: theme.palette.text.secondary,
        fontSize: "0.875rem"
      },
      "& .pipeline-tag": {
        color: "var(--c_gray1)",
        fontSize: "var(--fontSizeSmaller)",
        fontWeight: "bold",
        padding: "8px .5em",
        borderRadius: "0.5em",
        height: "1em"
      },

      "& .pipeline-tag-link": {
        textDecoration: "none"
      },

      "& .actions-container": {
        display: "flex",
        justifyContent: "space-between",
        gap: 0,
        alignItems: "center",
        flexShrink: 0
      },

      "& .model-stats": {
        fontSize: "var(--fontSizeSmaller)",
        color: theme.palette.grey[100],
        display: "flex",
        flexDirection: "column",
        alignItems: "start",
        minWidth: "100px",
        gap: "0"
      },

      "& .model-stats-item": {
        display: "flex",
        alignItems: "center",
        gap: "0.25em"
      },

      "& .model-actions": {
        display: "flex",
        gap: 0,
        alignItems: "center"
      },

      "& .secondary-action": {
        display: "flex",
        gap: ".1em",
        alignItems: "center",
        position: "absolute"
      },
      "&.compact .secondary-action": {
        position: "relative",
        right: "unset",
        left: "1em"
      },
      "& .downloaded-icon": {
        marginBottom: "-0.25em",
        marginRight: "0.5em",
        color: theme.palette.grey[200],
        "&:hover": {
          backgroundColor: "transparent",
          color: theme.palette.c_success
        }
      },
      "& .show-in-explorer-button": {
        color: theme.palette.c_folder,
        "&:hover": {
          backgroundColor: "transparent",
          color: "var(--c_file)"
        }
      },
      //
      ".model-item": {
        padding: 0,
        borderBottom: `1px solid ${theme.palette.grey[900]}`,
        marginBottom: theme.spacing(1),
        "&:hover": {
          backgroundColor: theme.palette.grey[600]
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
        color: theme.palette.grey[200],
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
      ".model-category": {},
      ".model-category.empty": {
        color: theme.palette.grey[500],
        marginBottom: "2em"
      },
      ".model-type-button.empty": {
        color: theme.palette.grey[400],
        "& span": {
          color: theme.palette.grey[400]
        }
      },
      ".model-type-button.Mui-selected.empty span": {
        color: "var(--palette-primary-dark)"
      },
      ".model-type-list .model-type-button:first-of-type": {
        "&, & .MuiListItemText-primary": {
          color: "var(--c_gray6)"
        }
      },
      ".model-type-list .model-type-button:first-of-type.Mui-selected": {
        "&, & .MuiListItemText-primary": {
          color: theme.palette.c_hl1
        }
      },
      // missing model
      "&.missing .model-header": {
        color: "var(--c_gray4)"
      },
      "&.missing .model-details": {
        maxWidth: "25px"
      }
    }
  });

export default modelListItemStyles;
