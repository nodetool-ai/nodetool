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
import { Box } from "@mui/material";
import { Tooltip, Text } from "../ui_primitives";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";
import ImageIcon from "@mui/icons-material/Image";
import RecordVoiceOverIcon from "@mui/icons-material/RecordVoiceOver";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import KeyboardVoiceIcon from "@mui/icons-material/KeyboardVoice";
import VideoLibraryIcon from "@mui/icons-material/VideoLibrary";
import OndemandVideoIcon from "@mui/icons-material/OndemandVideo";
import ApiIcon from "@mui/icons-material/Api";
import CodeIcon from "@mui/icons-material/Code";
import { DYNAMIC_FAL_NODE_TYPE } from "../node/DynamicFalSchemaNode";
import { DYNAMIC_KIE_NODE_TYPE } from "../node/DynamicKieSchemaNode";
import { DYNAMIC_REPLICATE_NODE_TYPE } from "../node/DynamicReplicateNode";
import { TOOLTIP_ENTER_DELAY, NOTIFICATION_TIMEOUT_MEDIUM } from "../../config/constants";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import useMetadataStore from "../../stores/MetadataStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useCreateNode } from "../../hooks/useCreateNode";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import { IconForType, colorForType } from "../../config/data_types";
import log from "loglevel";

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

/**
 * Build a QuickActionDefinition from two rgba base colors and an icon color.
 * Eliminates the repeated gradient/shadow boilerplate across all action buttons.
 */
const buildQuickAction = (
  key: string,
  label: string,
  nodeType: string,
  icon: ReactNode,
  primary: string,
  secondary: string,
  iconColor: string
): QuickActionDefinition => ({
  key,
  label,
  nodeType,
  icon,
  gradient: `linear-gradient(135deg, ${primary.replace(")", ", 0.4)")}, ${secondary.replace(")", ", 0.25)")})`,
  hoverGradient: `linear-gradient(135deg, ${primary.replace(")", ", 0.6)")}, ${secondary.replace(")", ", 0.5)")})`,
  shadow: `0 4px 12px ${primary.replace(")", ", 0.15)")}`,
  hoverShadow: `0 8px 24px ${primary.replace(")", ", 0.35)")}, 0 0 16px ${secondary.replace(")", ", 0.25)")}`,
  iconColor
});

/** Shorthand: pass rgb values (no alpha) as "rgb(r, g, b)" */
const rgb = (r: number, g: number, b: number) => `rgba(${r}, ${g}, ${b}`;

export const QUICK_ACTION_BUTTONS: QuickActionDefinition[] = [
  buildQuickAction("agent", "Agent", "nodetool.agents.Agent", <SupportAgentIcon />, rgb(79, 70, 229), rgb(99, 102, 241), "#e0e7ff"),
  buildQuickAction("code", "Code", "nodetool.code.Code", <CodeIcon />, rgb(34, 197, 94), rgb(74, 222, 128), "#dcfce7"),
  buildQuickAction("text-to-image", "Text to Image", "nodetool.image.TextToImage", <ImageIcon />, rgb(236, 72, 153), rgb(244, 114, 182), "#fce7f3"),
  buildQuickAction("image-to-image", "Image to Image", "nodetool.image.ImageToImage", <AutoFixHighIcon />, rgb(16, 185, 129), rgb(52, 211, 153), "#d1fae5"),
  buildQuickAction("text-to-video", "Text to Video", "nodetool.video.TextToVideo", <VideoLibraryIcon />, rgb(168, 85, 247), rgb(192, 132, 252), "#f3e8ff"),
  buildQuickAction("image-to-video", "Image to Video", "nodetool.video.ImageToVideo", <OndemandVideoIcon />, rgb(249, 115, 22), rgb(251, 146, 60), "#ffedd5"),
  buildQuickAction("text-to-speech", "Text to Speech", "nodetool.audio.TextToSpeech", <RecordVoiceOverIcon />, rgb(6, 182, 212), rgb(34, 211, 238), "#cffafe"),
  buildQuickAction("speech-to-text", "Speech to Text", "nodetool.text.AutomaticSpeechRecognition", <KeyboardVoiceIcon />, rgb(14, 165, 233), rgb(56, 189, 248), "#e0f2fe"),
  buildQuickAction("fal-dynamic", "FalAI", DYNAMIC_FAL_NODE_TYPE, <ApiIcon />, rgb(139, 92, 246), rgb(167, 139, 250), "#e9d5ff"),
  buildQuickAction("kie-dynamic", "KieAI", DYNAMIC_KIE_NODE_TYPE, <ApiIcon />, rgb(229, 92, 32), rgb(255, 140, 66), "#ffe0cc"),
  buildQuickAction("replicate-dynamic", "Replicate", DYNAMIC_REPLICATE_NODE_TYPE, <ApiIcon />, rgb(59, 130, 246), rgb(129, 140, 248), "#dbeafe")
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
    (event: ReactDragEvent<HTMLDivElement>) => {
      const nodeType = event.currentTarget.dataset.nodeType;
      if (!nodeType) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
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
        log.warn(`Metadata not found for node type: ${nodeType}`);
        addNotification({
          type: "warning",
          content: `Unable to find metadata for ${label}.`,
          timeout: NOTIFICATION_TIMEOUT_MEDIUM
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

  // Use data attributes to avoid creating new function references on each render
  // This is more efficient than curried handlers which create new closures
  const handleTileClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const nodeType = event.currentTarget.dataset.nodeType;
      if (nodeType) {
        const metadata = getMetadata(nodeType);
        if (metadata) {
          const definition = [...QUICK_ACTION_BUTTONS, ...CONSTANT_NODES].find(
            (d) => d.nodeType === nodeType
          );
          if (definition) {
            onTileClick(definition);
          }
        }
      }
    },
    [getMetadata, onTileClick]
  );

  const handleTileMouseEnter = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const nodeType = event.currentTarget.dataset.nodeType;
      if (nodeType) {
        onTileMouseEnter(nodeType);
      }
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
        <Text size="normal" weight={600}>Multi-Model Nodes</Text>
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
              delay={TOOLTIP_ENTER_DELAY}
              nextDelay={TOOLTIP_ENTER_DELAY}
            >
              <div
                className="quick-tile"
                draggable
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onClick={handleTileClick}
                onMouseEnter={handleTileMouseEnter}
                data-node-type={nodeType}
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
                <Text className="tile-label">{label}</Text>
              </div>
            </Tooltip>
          );
        })}
      </div>
      <div className="tiles-header" style={constantsHeaderStyle}>
        <Text size="normal" weight={600}>Constants</Text>
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
              delay={TOOLTIP_ENTER_DELAY}
              nextDelay={TOOLTIP_ENTER_DELAY}
            >
              <div
                className="quick-tile constant-tile"
                draggable
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onClick={handleTileClick}
                onMouseEnter={handleTileMouseEnter}
                data-node-type={nodeType}
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
                <Text className="tile-label">{label}</Text>
              </div>
            </Tooltip>
          );
        })}
      </div>
    </Box>
  );
});

export default memo(QuickActionTiles);
