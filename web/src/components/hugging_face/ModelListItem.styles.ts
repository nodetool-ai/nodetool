import { css } from "@emotion/react";

const modelListItemStyles = (theme: any) =>
  css({
    "&.model-list-item": {
      padding: "0.5em 0.5em",
      marginBottom: "0",
      backgroundColor: theme.palette.c_gray1,
      boxSizing: "border-box",
      borderBottom: "1px solid " + theme.palette.c_gray2,
      transition: "border 0.125s ease-in",
      wordBreak: "break-word",

      "&.compact": {
        padding: 0,
        backgroundColor: theme.palette.c_gray0
      },

      "&:hover": {
        opacity: 0.9
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
        lineHeight: "1.2em"
      },

      "& .model-name": {
        flexGrow: 1,
        textTransform: "uppercase",
        fontSize: "var(--fontSizeBig)",
        fontWeight: "400",
        color: "var(--palette-primary-light)",
        overflow: "hidden",
        textOverflow: "ellipsis"
      },
      "& .model-path": {
        display: "block",
        color: theme.palette.c_gray5,
        fontSize: "var(--fontSizeSmaller)"
      },
      "& .model-details": {
        flex: 1,
        maxWidth: "250px",
        gap: "0.2em",
        width: "200px",
        display: "flex",
        alignItems: "start",
        flexWrap: "wrap",
        flexDirection: "column"
      },

      "& .model-info": {
        color: theme.palette.text.secondary,
        fontSize: "0.875rem"
      },
      "& .pipeline-tag": {
        color: "var(--c_gray1)",
        fontSize: "var(--fontSizeSmall)",
        fontWeight: "bold",
        height: "1.5em",
        padding: "0"
      },

      "& .actions-container": {
        display: "flex",
        justifyContent: "space-between",
        gap: "1em",
        alignItems: "center",
        flexShrink: 0
      },

      "& .model-stats": {
        fontSize: "var(--fontSizeSmaller)",
        color: theme.palette.c_gray6,
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
        gap: ".1em",
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
      }
    }
  });

export default modelListItemStyles;
