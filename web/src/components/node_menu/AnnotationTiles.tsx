/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo } from "react";
import type { CSSProperties } from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import NoteIcon from "@mui/icons-material/Note";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { useCreateAnnotationNode } from "../../hooks/useCreateAnnotationNode";
import { AnnotationColor } from "../../components/node_types/AnnotationNode";

export type AnnotationActionDefinition = {
  key: AnnotationColor;
  label: string;
  color: AnnotationColor;
  iconColor: string;
};

export const ANNOTATION_ACTIONS: AnnotationActionDefinition[] = [
  { key: "yellow", label: "Yellow Note", color: "yellow", iconColor: "#fbc02d" },
  { key: "green", label: "Green Note", color: "green", iconColor: "#7cb342" },
  { key: "blue", label: "Blue Note", color: "blue", iconColor: "#1e88e5" },
  { key: "pink", label: "Pink Note", color: "pink", iconColor: "#ec407a" },
  { key: "purple", label: "Purple Note", color: "purple", iconColor: "#7e57c2" }
];

const annotationColors: Record<AnnotationColor, { bg: string; border: string }> = {
  yellow: { bg: "#fff9c4", border: "#fbc02d" },
  green: { bg: "#dcedc8", border: "#7cb342" },
  blue: { bg: "#e3f2fd", border: "#1e88e5" },
  pink: { bg: "#fce4ec", border: "#ec407a" },
  purple: { bg: "#ede7f6", border: "#7e57c2" }
};

const tileStyles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      padding: "0.5em 1em 1em 0.5em",
      boxSizing: "border-box"
    },
    ".tiles-header": {
      marginBottom: "0.5em",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 4px",
      "& h5": {
        margin: 0,
        fontSize: "0.85rem",
        fontWeight: 600,
        color: theme.vars.palette.text.secondary,
        textTransform: "uppercase",
        letterSpacing: "1px",
        opacity: 0.8
      }
    },
    ".tiles-container": {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
      gridAutoRows: "1fr",
      gap: "8px",
      alignContent: "start",
      overflowY: "auto",
      padding: "2px",
      "&::-webkit-scrollbar": {
        width: "6px"
      },
      "&::-webkit-scrollbar-track": {
        background: "transparent"
      },
      "&::-webkit-scrollbar-thumb": {
        backgroundColor: theme.vars.palette.action.disabledBackground,
        borderRadius: "8px"
      },
      "&::-webkit-scrollbar-thumb:hover": {
        backgroundColor: theme.vars.palette.action.disabled
      }
    },
    ".annotation-tile": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "12px 8px",
      borderRadius: "8px",
      cursor: "pointer",
      position: "relative",
      overflow: "hidden",
      border: "1px solid rgba(255, 255, 255, 0.06)",
      transition: "all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)",
      minHeight: "70px",
      background: "rgba(255, 255, 255, 0.02)",
      "&:hover": {
        transform: "translateY(-2px)",
        boxShadow: "0 4px 12px -4px rgba(0, 0, 0, 0.3)"
      },
      "&:active": {
        transform: "scale(0.97)"
      }
    },
    ".tile-icon": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: "6px",
      "& svg": {
        fontSize: "1.5rem"
      }
    },
    ".tile-label": {
      fontSize: "0.65rem",
      fontWeight: 500,
      textAlign: "center",
      lineHeight: 1.3,
      color: theme.vars.palette.text.primary,
      opacity: 0.8
    }
  });

const AnnotationTiles = memo(function AnnotationTiles() {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => tileStyles(theme), [theme]);
  
  const { clickPosition, closeNodeMenu } = useNodeMenuStore((state) => ({
    clickPosition: state.clickPosition,
    closeNodeMenu: state.closeNodeMenu
  }));
  
  const handleCreateAnnotationNode = useCreateAnnotationNode();

  const handleTileClick = useCallback(
    (action: AnnotationActionDefinition) => {
      if (clickPosition) {
        handleCreateAnnotationNode(clickPosition, {
          color: action.color
        });
        closeNodeMenu();
      }
    },
    [clickPosition, handleCreateAnnotationNode, closeNodeMenu]
  );

  return (
    <Box css={memoizedStyles}>
      <div className="tiles-header">
        <Typography variant="h5">Annotations</Typography>
      </div>
      <div className="tiles-container">
        {ANNOTATION_ACTIONS.map((definition) => {
          const { key, label, color, iconColor } = definition;
          const colors = annotationColors[color];
          return (
            <Tooltip
              key={key}
              title={
                <div>
                  <div>{label}</div>
                  <div
                    style={{
                      fontSize: "0.7rem",
                      opacity: 0.75,
                      marginTop: "4px"
                    }}
                  >
                    Click to add annotation note
                  </div>
                </div>
              }
              placement="top"
              enterDelay={TOOLTIP_ENTER_DELAY}
            >
              <div
                className="annotation-tile"
                onClick={() => handleTileClick(definition)}
                style={
                  {
                    backgroundColor: colors.bg,
                    borderColor: colors.border,
                    "--annotation-border": colors.border
                  } as CSSProperties
                }
              >
                <div className="tile-icon" style={{ color: iconColor }}>
                  <NoteIcon />
                </div>
                <Typography className="tile-label">{label}</Typography>
              </div>
            </Tooltip>
          );
        })}
      </div>
    </Box>
  );
});

export default AnnotationTiles;
