/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo } from "react";
import type { CSSProperties, DragEvent as ReactDragEvent, ReactNode } from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";
import ImageIcon from "@mui/icons-material/Image";
import RecordVoiceOverIcon from "@mui/icons-material/RecordVoiceOver";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import KeyboardVoiceIcon from "@mui/icons-material/KeyboardVoice";
import VideoLibraryIcon from "@mui/icons-material/VideoLibrary";
import OndemandVideoIcon from "@mui/icons-material/OndemandVideo";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import useMetadataStore from "../../stores/MetadataStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useCreateNode } from "../../hooks/useCreateNode";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";

export type QuickActionDefinition = {
  key: string;
  label: string;
  nodeType: string;
  icon: ReactNode;
  gradient: string;
  hoverGradient: string;
  shadow: string;
  hoverShadow?: string;
  iconColor: string;
};

export const QUICK_ACTION_BUTTONS: QuickActionDefinition[] = [
  {
    key: "agent",
    label: "Agent",
    nodeType: "nodetool.agents.Agent",
    icon: <SupportAgentIcon />,
    gradient:
      "linear-gradient(135deg, rgba(67, 56, 202, 0.4), rgba(79, 70, 229, 0.25))",
    hoverGradient:
      "linear-gradient(135deg, rgba(79, 70, 229, 0.6), rgba(99, 102, 241, 0.5))",
    shadow: "0 4px 12px rgba(79, 70, 229, 0.15)",
    hoverShadow:
      "0 8px 24px rgba(79, 70, 229, 0.35), 0 0 16px rgba(99, 102, 241, 0.25)",
    iconColor: "#e0e7ff"
  },
  {
    key: "text-to-image",
    label: "Text to Image",
    nodeType: "nodetool.image.TextToImage",
    icon: <ImageIcon />,
    gradient:
      "linear-gradient(135deg, rgba(219, 39, 119, 0.4), rgba(236, 72, 153, 0.25))",
    hoverGradient:
      "linear-gradient(135deg, rgba(236, 72, 153, 0.6), rgba(244, 114, 182, 0.5))",
    shadow: "0 4px 12px rgba(219, 39, 119, 0.15)",
    hoverShadow:
      "0 8px 24px rgba(236, 72, 153, 0.35), 0 0 16px rgba(244, 114, 182, 0.25)",
    iconColor: "#fce7f3"
  },
  {
    key: "image-to-image",
    label: "Image to Image",
    nodeType: "nodetool.image.ImageToImage",
    icon: <AutoFixHighIcon />,
    gradient:
      "linear-gradient(135deg, rgba(5, 150, 105, 0.4), rgba(16, 185, 129, 0.25))",
    hoverGradient:
      "linear-gradient(135deg, rgba(16, 185, 129, 0.6), rgba(52, 211, 153, 0.5))",
    shadow: "0 4px 12px rgba(5, 150, 105, 0.15)",
    hoverShadow:
      "0 8px 24px rgba(16, 185, 129, 0.35), 0 0 16px rgba(52, 211, 153, 0.25)",
    iconColor: "#d1fae5"
  },
  {
    key: "text-to-video",
    label: "Text to Video",
    nodeType: "nodetool.video.TextToVideo",
    icon: <VideoLibraryIcon />,
    gradient:
      "linear-gradient(135deg, rgba(147, 51, 234, 0.4), rgba(168, 85, 247, 0.25))",
    hoverGradient:
      "linear-gradient(135deg, rgba(168, 85, 247, 0.6), rgba(192, 132, 252, 0.5))",
    shadow: "0 4px 12px rgba(147, 51, 234, 0.15)",
    hoverShadow:
      "0 8px 24px rgba(168, 85, 247, 0.35), 0 0 16px rgba(192, 132, 252, 0.25)",
    iconColor: "#f3e8ff"
  },
  {
    key: "image-to-video",
    label: "Image to Video",
    nodeType: "nodetool.video.ImageToVideo",
    icon: <OndemandVideoIcon />,
    gradient:
      "linear-gradient(135deg, rgba(234, 88, 12, 0.4), rgba(249, 115, 22, 0.25))",
    hoverGradient:
      "linear-gradient(135deg, rgba(249, 115, 22, 0.6), rgba(251, 146, 60, 0.5))",
    shadow: "0 4px 12px rgba(234, 88, 12, 0.15)",
    hoverShadow:
      "0 8px 24px rgba(249, 115, 22, 0.35), 0 0 16px rgba(251, 146, 60, 0.25)",
    iconColor: "#ffedd5"
  },
  {
    key: "text-to-speech",
    label: "Text to Speech",
    nodeType: "nodetool.audio.TextToSpeech",
    icon: <RecordVoiceOverIcon />,
    gradient:
      "linear-gradient(135deg, rgba(8, 145, 178, 0.4), rgba(6, 182, 212, 0.25))",
    hoverGradient:
      "linear-gradient(135deg, rgba(6, 182, 212, 0.6), rgba(34, 211, 238, 0.5))",
    shadow: "0 4px 12px rgba(8, 145, 178, 0.15)",
    hoverShadow:
      "0 8px 24px rgba(6, 182, 212, 0.35), 0 0 16px rgba(34, 211, 238, 0.25)",
    iconColor: "#cffafe"
  },
  {
    key: "speech-to-text",
    label: "Speech to Text",
    nodeType: "nodetool.text.AutomaticSpeechRecognition",
    icon: <KeyboardVoiceIcon />,
    gradient:
      "linear-gradient(135deg, rgba(2, 132, 199, 0.4), rgba(14, 165, 233, 0.25))",
    hoverGradient:
      "linear-gradient(135deg, rgba(14, 165, 233, 0.6), rgba(56, 189, 248, 0.5))",
    shadow: "0 4px 12px rgba(2, 132, 199, 0.15)",
    hoverShadow:
      "0 8px 24px rgba(14, 165, 233, 0.35), 0 0 16px rgba(56, 189, 248, 0.25)",
    iconColor: "#e0f2fe"
  }
];

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
      gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
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
    ".quick-tile": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "12px 8px",
      borderRadius: "12px",
      cursor: "pointer",
      position: "relative",
      overflow: "hidden",
      border: "1px solid rgba(255, 255, 255, 0.06)",
      transition: "all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)",
      minHeight: "80px",
      background: "rgba(255, 255, 255, 0.02)",
      "&::before": {
        content: '""',
        position: "absolute",
        inset: 0,
        borderRadius: "inherit",
        // Soft gradient overlay
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.06), transparent 80%)",
        opacity: 0,
        transition: "opacity 0.3s ease",
        pointerEvents: "none"
      },
      "&:hover": {
        transform: "translateY(-3px)",
        borderColor: "rgba(255, 255, 255, 0.15)",
        background: "var(--quick-hover-tile-bg, rgba(255, 255, 255, 0.05))",
        boxShadow: "0 8px 24px -6px rgba(0, 0, 0, 0.5)",
        "&::before": {
          opacity: 1
        },
        "& .tile-icon": {
          transform: "scale(1.15) rotate(5deg)"
        },
        "& .tile-label": {
          opacity: 1
        }
      },
      "&:active": {
        transform: "scale(0.97) translateY(0)",
        transition: "all 0.1s ease"
      },
      "&.active": {
        borderColor: theme.vars.palette.primary.main,
        boxShadow: `0 0 0 2px ${theme.vars.palette.primary.main}, 0 4px 12px rgba(0,0,0,0.5)`
      }
    },
    ".tile-icon": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: "6px",
      transition: "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
      "& svg": {
        fontSize: "1.75rem",
        filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.4))"
      }
    },
    ".tile-label": {
      fontSize: "0.7rem",
      fontWeight: 500,
      textAlign: "center",
      lineHeight: 1.3,
      color: theme.vars.palette.text.primary,
      opacity: 0.8,
      transition: "opacity 0.3s ease",
      maxWidth: "100%"
    }
  });

const QuickActionTiles = memo(function QuickActionTiles() {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => tileStyles(theme), [theme]);
  
  const { setDragToCreate, setHoveredNode } = useNodeMenuStore((state) => ({
    setDragToCreate: state.setDragToCreate,
    setHoveredNode: state.setHoveredNode
  }));
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);

  const handleCreateNode = useCreateNode();

  const handleDragStart = useCallback(
    (nodeType: string) => (event: ReactDragEvent<HTMLDivElement>) => {
      const metadata = getMetadata(nodeType);
      if (!metadata) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      setDragToCreate(true);
      // Use unified drag serialization
      serializeDragData(
        { type: "create-node", payload: metadata },
        event.dataTransfer
      );
      event.dataTransfer.effectAllowed = "copyMove";

      // Update global drag state
      setActiveDrag({ type: "create-node", payload: metadata });
    },
    [getMetadata, setDragToCreate, setActiveDrag]
  );
  
  const handleDragEnd = useCallback(() => {
    setDragToCreate(false);
    clearDrag();
  }, [setDragToCreate, clearDrag]);

  const onTileClick = useCallback(
    (action: QuickActionDefinition) => {
      const { nodeType, label } = action;
      const metadata = getMetadata(nodeType);
      
      if (!metadata) {
        console.warn(`Metadata not found for node type: ${nodeType}`);
        addNotification({
          type: "warning",
          content: `Unable to find metadata for ${label}.`,
          timeout: 4000
        });
        return;
      }

      handleCreateNode(metadata);
    },
    [getMetadata, addNotification, handleCreateNode]
  );

  const onTileMouseEnter = useCallback(
    (nodeType: string) => {
      const metadata = getMetadata(nodeType);
      if (metadata) {
        setHoveredNode(metadata);
      }
    },
    [getMetadata, setHoveredNode]
  );

  return (
    <Box css={memoizedStyles}>
      <div className="tiles-header">
        <Typography variant="h5">Quick Actions</Typography>
      </div>
      <div className="tiles-container">
        {QUICK_ACTION_BUTTONS.map((definition) => {
          const {
            key,
            label,
            nodeType,
            icon,
            gradient,
            hoverGradient,
            shadow,
            hoverShadow = shadow,
            iconColor
          } = definition;
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
                    Click to place · Shift-click to auto add
                  </div>
                </div>
              }
              placement="top"
              enterDelay={TOOLTIP_ENTER_DELAY}
            >
              <div
                className="quick-tile"
                draggable
                onDragStart={handleDragStart(nodeType)}
                onDragEnd={handleDragEnd}
                onClick={() => onTileClick(definition)}
                onMouseEnter={() => onTileMouseEnter(nodeType)}
                style={
                  {
                    "--quick-gradient": gradient,
                    "--quick-hover-tile-bg": hoverGradient,
                    "--quick-shadow": shadow,
                    "--quick-shadow-hover": hoverShadow ?? shadow,
                    "--quick-icon-color": iconColor,
                    background: theme.vars.palette.action.hoverBackground 
                  } as CSSProperties
                }
              >
                <div className="tile-icon" style={{ color: iconColor }}>
                  {icon}
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

export default QuickActionTiles;
