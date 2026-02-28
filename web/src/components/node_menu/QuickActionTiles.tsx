/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo } from "react";
import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  ReactNode
} from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";
import ImageIcon from "@mui/icons-material/Image";
import RecordVoiceOverIcon from "@mui/icons-material/RecordVoiceOver";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import KeyboardVoiceIcon from "@mui/icons-material/KeyboardVoice";
import VideoLibraryIcon from "@mui/icons-material/VideoLibrary";
import OndemandVideoIcon from "@mui/icons-material/OndemandVideo";
import ApiIcon from "@mui/icons-material/Api";
import { DYNAMIC_FAL_NODE_TYPE } from "../node/DynamicFalSchemaNode";
import { DYNAMIC_KIE_NODE_TYPE } from "../node/DynamicKieSchemaNode";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import useMetadataStore from "../../stores/MetadataStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useCreateNode } from "../../hooks/useCreateNode";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import { IconForType, colorForType } from "../../config/data_types";

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
  },
  {
    key: "fal-dynamic",
    label: "FalAI",
    nodeType: DYNAMIC_FAL_NODE_TYPE,
    icon: <ApiIcon />,
    gradient:
      "linear-gradient(135deg, rgba(139, 92, 246, 0.4), rgba(124, 58, 237, 0.25))",
    hoverGradient:
      "linear-gradient(135deg, rgba(139, 92, 246, 0.6), rgba(167, 139, 250, 0.5))",
    shadow: "0 4px 12px rgba(139, 92, 246, 0.15)",
    hoverShadow:
      "0 8px 24px rgba(139, 92, 246, 0.35), 0 0 16px rgba(167, 139, 250, 0.25)",
    iconColor: "#e9d5ff"
  },
  {
    key: "kie-dynamic",
    label: "KieAI",
    nodeType: DYNAMIC_KIE_NODE_TYPE,
    icon: <ApiIcon />,
    gradient:
      "linear-gradient(135deg, rgba(229, 92, 32, 0.4), rgba(255, 140, 66, 0.25))",
    hoverGradient:
      "linear-gradient(135deg, rgba(229, 92, 32, 0.6), rgba(255, 140, 66, 0.5))",
    shadow: "0 4px 12px rgba(229, 92, 32, 0.15)",
    hoverShadow:
      "0 8px 24px rgba(229, 92, 32, 0.35), 0 0 16px rgba(255, 140, 66, 0.25)",
    iconColor: "#ffe0cc"
  }
];

const hexToRgba = (hex: string, alpha: number) => {
  const cleanHex = hex.replace("#", "");
  if (cleanHex.length !== 6) {
    return `rgba(255, 255, 255, ${alpha})`;
  }
  const r = parseInt(cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const buildConstantNode = ({
  key,
  label,
  nodeType,
  iconType
}: {
  key: string;
  label: string;
  nodeType: string;
  iconType: string;
}): QuickActionDefinition => {
  const baseColor = colorForType(iconType);
  return {
    key,
    label,
    nodeType,
    icon: (
      <IconForType
        iconName={iconType}
        showTooltip={false}
        iconSize="normal"
        svgProps={{ style: { color: baseColor } }}
      />
    ),
    gradient: `linear-gradient(135deg, ${hexToRgba(
      baseColor,
      0.35
    )}, ${hexToRgba(baseColor, 0.18)})`,
    hoverGradient: `linear-gradient(135deg, ${hexToRgba(
      baseColor,
      0.55
    )}, ${hexToRgba(baseColor, 0.32)})`,
    shadow: `0 4px 12px ${hexToRgba(baseColor, 0.18)}`,
    hoverShadow: `0 8px 24px ${hexToRgba(
      baseColor,
      0.35
    )}, 0 0 16px ${hexToRgba(baseColor, 0.22)}`,
    iconColor: baseColor
  };
};

export const CONSTANT_NODES: QuickActionDefinition[] = [
  buildConstantNode({
    key: "constant-bool",
    label: "Bool",
    nodeType: "nodetool.constant.Bool",
    iconType: "bool"
  }),
  buildConstantNode({
    key: "constant-dataframe",
    label: "Data Frame",
    nodeType: "nodetool.constant.DataFrame",
    iconType: "dataframe"
  }),
  buildConstantNode({
    key: "constant-date",
    label: "Date",
    nodeType: "nodetool.constant.Date",
    iconType: "date"
  }),
  buildConstantNode({
    key: "constant-datetime",
    label: "Date Time",
    nodeType: "nodetool.constant.DateTime",
    iconType: "datetime"
  }),
  buildConstantNode({
    key: "constant-dict",
    label: "Dict",
    nodeType: "nodetool.constant.Dict",
    iconType: "dict"
  }),
  buildConstantNode({
    key: "constant-audio",
    label: "Audio",
    nodeType: "nodetool.constant.Audio",
    iconType: "audio"
  }),
  buildConstantNode({
    key: "constant-document",
    label: "Document",
    nodeType: "nodetool.constant.Document",
    iconType: "document"
  }),
  buildConstantNode({
    key: "constant-float",
    label: "Float",
    nodeType: "nodetool.constant.Float",
    iconType: "float"
  }),
  buildConstantNode({
    key: "constant-image",
    label: "Image",
    nodeType: "nodetool.constant.Image",
    iconType: "image"
  }),
  buildConstantNode({
    key: "constant-integer",
    label: "Integer",
    nodeType: "nodetool.constant.Integer",
    iconType: "int"
  }),
  buildConstantNode({
    key: "constant-json",
    label: "JSON",
    nodeType: "nodetool.constant.JSON",
    iconType: "json"
  }),
  buildConstantNode({
    key: "constant-list",
    label: "List",
    nodeType: "nodetool.constant.List",
    iconType: "list"
  }),
  buildConstantNode({
    key: "constant-model-3d",
    label: "Model 3D",
    nodeType: "nodetool.constant.Model3D",
    iconType: "model_3d"
  }),
  buildConstantNode({
    key: "constant-string",
    label: "String",
    nodeType: "nodetool.constant.String",
    iconType: "str"
  }),
  buildConstantNode({
    key: "constant-video",
    label: "Video",
    nodeType: "nodetool.constant.Video",
    iconType: "video"
  })
].sort((a, b) => a.label.localeCompare(b.label));

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
      overflow: "visible",
      padding: "2px"
    },
    ".constants-container": {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))",
      gridAutoRows: "1fr",
      gap: "8px",
      alignContent: "start",
      marginTop: "12px",
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
      minHeight: "30px",
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
    ".constant-tile": {
      minHeight: "70px",
      padding: "10px 6px",
      "& .tile-icon": {
        marginBottom: "4px",
        "& svg": {
          fontSize: "1.5rem"
        }
      },
      "& .tile-label": {
        fontSize: "var(--fontSizeNormal)"
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
      fontSize: "var(--fontSizeSmall)",
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

  const handleTileClick = useCallback(
    (definition: QuickActionDefinition) => () => {
      onTileClick(definition);
    },
    [onTileClick]
  );

  const handleTileMouseEnter = useCallback(
    (nodeType: string) => () => {
      onTileMouseEnter(nodeType);
    },
    [onTileMouseEnter]
  );

  // Memoize tooltip subtitle style to avoid recreating on every render
  const tooltipSubtitleStyle = useMemo(
    () => ({
      fontSize: "0.7rem" as const,
      opacity: 0.75,
      marginTop: "4px"
    }),
    []
  );

  // Memoize constants header style
  const constantsHeaderStyle = useMemo(
    () => ({
      marginTop: "16px",
      marginBottom: "8px"
    }),
    []
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
                  <div style={tooltipSubtitleStyle}>
                    Click to place · Shift-click to auto add
                  </div>
                </div>
              }
              placement="top"
              enterDelay={TOOLTIP_ENTER_DELAY}
              enterNextDelay={TOOLTIP_ENTER_DELAY}
            >
              <div
                className="quick-tile"
                draggable
                onDragStart={handleDragStart(nodeType)}
                onDragEnd={handleDragEnd}
                onClick={handleTileClick(definition)}
                onMouseEnter={handleTileMouseEnter(nodeType)}
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
      <div className="tiles-header" style={constantsHeaderStyle}>
        <Typography variant="h5">Constants</Typography>
      </div>
      <div className="constants-container">
        {CONSTANT_NODES.map((definition) => {
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
                  <div>{label} Constant</div>
                  <div style={tooltipSubtitleStyle}>
                    Click to place
                  </div>
                </div>
              }
              placement="top"
              enterDelay={TOOLTIP_ENTER_DELAY}
              enterNextDelay={TOOLTIP_ENTER_DELAY}
            >
              <div
                className="quick-tile constant-tile"
                draggable
                onDragStart={handleDragStart(nodeType)}
                onDragEnd={handleDragEnd}
                onClick={handleTileClick(definition)}
                onMouseEnter={handleTileMouseEnter(nodeType)}
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

export default memo(QuickActionTiles);
