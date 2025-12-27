import { memo, useCallback, useContext, useState } from "react";
import type {
  CSSProperties,
  ReactNode,
  MouseEvent,
  DragEvent as ReactDragEvent
} from "react";
import { IconButton, Tooltip, Collapse } from "@mui/material";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";
import ImageIcon from "@mui/icons-material/Image";
import RecordVoiceOverIcon from "@mui/icons-material/RecordVoiceOver";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import KeyboardVoiceIcon from "@mui/icons-material/KeyboardVoice";
import VideoLibraryIcon from "@mui/icons-material/VideoLibrary";
import OndemandVideoIcon from "@mui/icons-material/OndemandVideo";
import KeyboardArrowLeftIcon from "@mui/icons-material/KeyboardArrowLeft";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import useNodePlacementStore from "../../stores/NodePlacementStore";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import useMetadataStore from "../../stores/MetadataStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { NodeContext } from "../../contexts/NodeContext";
import { useNotificationStore } from "../../stores/NotificationStore";
import type { XYPosition, Node as ReactFlowNode } from "@xyflow/react";

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

const QUICK_ACTION_BUTTONS: QuickActionDefinition[] = [
  {
    key: "agent",
    label: "Add Agent",
    nodeType: "nodetool.agents.Agent",
    icon: <SupportAgentIcon />,
    gradient:
      "linear-gradient(135deg, rgba(67, 56, 202, 0.6), rgba(79, 70, 229, 0.45))",
    hoverGradient:
      "linear-gradient(135deg, rgba(79, 70, 229, 0.75), rgba(99, 102, 241, 0.6))",
    shadow: "0 4px 12px rgba(79, 70, 229, 0.3)",
    hoverShadow:
      "0 8px 24px rgba(79, 70, 229, 0.45), 0 0 16px rgba(99, 102, 241, 0.35)",
    iconColor: "#e0e7ff"
  },
  {
    key: "text-to-image",
    label: "Add Text to Image",
    nodeType: "nodetool.image.TextToImage",
    icon: <ImageIcon />,
    gradient:
      "linear-gradient(135deg, rgba(219, 39, 119, 0.6), rgba(236, 72, 153, 0.45))",
    hoverGradient:
      "linear-gradient(135deg, rgba(236, 72, 153, 0.75), rgba(244, 114, 182, 0.6))",
    shadow: "0 4px 12px rgba(219, 39, 119, 0.3)",
    hoverShadow:
      "0 8px 24px rgba(236, 72, 153, 0.45), 0 0 16px rgba(244, 114, 182, 0.35)",
    iconColor: "#fce7f3"
  },
  {
    key: "image-to-image",
    label: "Add Image to Image",
    nodeType: "nodetool.image.ImageToImage",
    icon: <AutoFixHighIcon />,
    gradient:
      "linear-gradient(135deg, rgba(5, 150, 105, 0.6), rgba(16, 185, 129, 0.45))",
    hoverGradient:
      "linear-gradient(135deg, rgba(16, 185, 129, 0.75), rgba(52, 211, 153, 0.6))",
    shadow: "0 4px 12px rgba(5, 150, 105, 0.3)",
    hoverShadow:
      "0 8px 24px rgba(16, 185, 129, 0.45), 0 0 16px rgba(52, 211, 153, 0.35)",
    iconColor: "#d1fae5"
  },
  {
    key: "text-to-video",
    label: "Add Text to Video",
    nodeType: "nodetool.video.TextToVideo",
    icon: <VideoLibraryIcon />,
    gradient:
      "linear-gradient(135deg, rgba(147, 51, 234, 0.6), rgba(168, 85, 247, 0.45))",
    hoverGradient:
      "linear-gradient(135deg, rgba(168, 85, 247, 0.75), rgba(192, 132, 252, 0.6))",
    shadow: "0 4px 12px rgba(147, 51, 234, 0.3)",
    hoverShadow:
      "0 8px 24px rgba(168, 85, 247, 0.45), 0 0 16px rgba(192, 132, 252, 0.35)",
    iconColor: "#f3e8ff"
  },
  {
    key: "image-to-video",
    label: "Add Image to Video",
    nodeType: "nodetool.video.ImageToVideo",
    icon: <OndemandVideoIcon />,
    gradient:
      "linear-gradient(135deg, rgba(234, 88, 12, 0.6), rgba(249, 115, 22, 0.45))",
    hoverGradient:
      "linear-gradient(135deg, rgba(249, 115, 22, 0.75), rgba(251, 146, 60, 0.6))",
    shadow: "0 4px 12px rgba(234, 88, 12, 0.3)",
    hoverShadow:
      "0 8px 24px rgba(249, 115, 22, 0.45), 0 0 16px rgba(251, 146, 60, 0.35)",
    iconColor: "#ffedd5"
  },
  {
    key: "text-to-speech",
    label: "Add Text to Speech",
    nodeType: "nodetool.audio.TextToSpeech",
    icon: <RecordVoiceOverIcon />,
    gradient:
      "linear-gradient(135deg, rgba(8, 145, 178, 0.6), rgba(6, 182, 212, 0.45))",
    hoverGradient:
      "linear-gradient(135deg, rgba(6, 182, 212, 0.75), rgba(34, 211, 238, 0.6))",
    shadow: "0 4px 12px rgba(8, 145, 178, 0.3)",
    hoverShadow:
      "0 8px 24px rgba(6, 182, 212, 0.45), 0 0 16px rgba(34, 211, 238, 0.35)",
    iconColor: "#cffafe"
  },
  {
    key: "speech-to-text",
    label: "Add Speech to Text",
    nodeType: "nodetool.text.AutomaticSpeechRecognition",
    icon: <KeyboardVoiceIcon />,
    gradient:
      "linear-gradient(135deg, rgba(2, 132, 199, 0.6), rgba(14, 165, 233, 0.45))",
    hoverGradient:
      "linear-gradient(135deg, rgba(14, 165, 233, 0.75), rgba(56, 189, 248, 0.6))",
    shadow: "0 4px 12px rgba(2, 132, 199, 0.3)",
    hoverShadow:
      "0 8px 24px rgba(14, 165, 233, 0.45), 0 0 16px rgba(56, 189, 248, 0.35)",
    iconColor: "#e0f2fe"
  }
];

const QuickActions = memo(function QuickActions() {
  const setDragToCreate = useNodeMenuStore((state) => state.setDragToCreate);
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const nodeStoreFromContext = useContext(NodeContext);
  const { currentWorkflowId, getNodeStore } = useWorkflowManager((state) => ({
    currentWorkflowId: state.currentWorkflowId,
    getNodeStore: state.getNodeStore
  }));
  const nodeStore =
    nodeStoreFromContext ??
    (currentWorkflowId ? getNodeStore(currentWorkflowId) ?? null : null);

  const { activatePlacement, cancelPlacement, pendingNodeType } =
    useNodePlacementStore((state) => ({
      activatePlacement: state.activatePlacement,
      cancelPlacement: state.cancelPlacement,
      pendingNodeType: state.pendingNodeType
    }));

  const getViewportCenter = useCallback((): XYPosition => {
    if (!nodeStore || typeof window === "undefined") {
      return { x: 0, y: 0 };
    }
    const { viewport } = nodeStore.getState();
    const { innerWidth, innerHeight } = window;
    if (!viewport) {
      return { x: 0, y: 0 };
    }
    const { x, y, zoom } = viewport;
    const centerX = innerWidth / 2;
    const centerY = innerHeight / 2;

    return {
      x: (centerX - x) / zoom,
      y: (centerY - y) / zoom
    };
  }, [nodeStore]);

  const computePlacementPosition = useCallback((): XYPosition => {
    const basePosition = getViewportCenter();
    if (!nodeStore) {
      return basePosition;
    }

    const { nodes } = nodeStore.getState();
    if (!nodes || nodes.length === 0) {
      return basePosition;
    }

    const spacingX = 240;
    const spacingY = 180;

    const candidateOffsets: Array<{ offset: XYPosition; distance: number }> =
      [];
    const maxRadius = 3;
    for (let y = -maxRadius; y <= maxRadius; y++) {
      for (let x = -maxRadius; x <= maxRadius; x++) {
        const distance = Math.abs(x) + Math.abs(y);
        candidateOffsets.push({
          offset: { x: x * spacingX, y: y * spacingY },
          distance
        });
      }
    }

    candidateOffsets.sort((a, b) => a.distance - b.distance);

    const isPositionFree = (candidate: XYPosition) => {
      const horizontalBuffer = spacingX * 0.6;
      const verticalBuffer = spacingY * 0.6;

      return nodes.every((node: ReactFlowNode<any>) => {
        const pos = node.position ?? { x: 0, y: 0 };
        const nodeWidth = node.width ?? 200;
        const nodeHeight = node.height ?? 140;

        const deltaX = Math.abs(candidate.x - pos.x);
        const deltaY = Math.abs(candidate.y - pos.y);

        const minX = nodeWidth / 2 + horizontalBuffer;
        const minY = nodeHeight / 2 + verticalBuffer;

        return deltaX >= minX || deltaY >= minY;
      });
    };

    for (const { offset } of candidateOffsets) {
      const candidate = {
        x: basePosition.x + offset.x,
        y: basePosition.y + offset.y
      };
      if (isPositionFree(candidate)) {
        return candidate;
      }
    }

    const fallbackOffset = nodes.length + 1;
    return {
      x: basePosition.x + fallbackOffset * (spacingX / 2),
      y: basePosition.y + fallbackOffset * (spacingY / 2)
    };
  }, [getViewportCenter, nodeStore]);

  const handleDragStart = useCallback(
    (nodeType: string) => (event: ReactDragEvent<HTMLButtonElement>) => {
      const metadata = getMetadata(nodeType);
      if (!metadata) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      setDragToCreate(true);
      event.dataTransfer.setData("create-node", JSON.stringify(metadata));
      event.dataTransfer.effectAllowed = "copyMove";
    },
    [getMetadata, setDragToCreate]
  );

  const handleDragEnd = useCallback(() => {
    setDragToCreate(false);
  }, [setDragToCreate]);

  const handleAddNode = useCallback(
    (action: QuickActionDefinition, event: MouseEvent<HTMLButtonElement>) => {
      const { nodeType, label } = action;
      if (!nodeStore) {
        return;
      }
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

      if (event.shiftKey) {
        const store = nodeStore.getState();
        const position = computePlacementPosition();
        const newNode = store.createNode(metadata, position);
        newNode.selected = true;
        store.addNode(newNode);
        cancelPlacement();
        return;
      }

      if (pendingNodeType === nodeType) {
        cancelPlacement();
        return;
      }

      activatePlacement(nodeType, label, "quickAction");
      addNotification({
        type: "info",
        content: `Click on the canvas to place "${label}". Press Esc to cancel.`,
        timeout: 5000,
        dismissable: true
      });
    },
    [
      nodeStore,
      getMetadata,
      computePlacementPosition,
      cancelPlacement,
      pendingNodeType,
      activatePlacement,
      addNotification
    ]
  );

  if (!nodeStore) {
    return null;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: "12px",
        borderRadius: "24px",
        background: "rgba(10, 12, 18, 0.6)",
        border: `1px solid rgba(255, 255, 255, 0.08)`,
        boxShadow:
          "0 8px 32px rgba(0, 0, 0, 0.32), inset 0 0 0 1px rgba(255, 255, 255, 0.03)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)"
      }}
    >
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
            <IconButton
              tabIndex={-1}
              draggable
              onDragStart={handleDragStart(nodeType)}
              onDragEnd={handleDragEnd}
              onClick={(event) => handleAddNode(definition, event)}
              className={`quick-add-button${
                pendingNodeType === nodeType ? " active" : ""
              }`}
              style={
                {
                  "--quick-gradient": gradient,
                  "--quick-hover-gradient": hoverGradient,
                  "--quick-shadow": shadow,
                  "--quick-shadow-hover": hoverShadow ?? shadow,
                  "--quick-icon-color": iconColor,
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  padding: "0",
                  position: "relative",
                  overflow: "hidden",
                  background:
                    "var(--quick-gradient, rgba(255, 255, 255, 0.03))",
                  border: `1px solid rgba(255, 255, 255, 0.08)`,
                  boxShadow:
                    "var(--quick-shadow, 0 2px 8px rgba(0, 0, 0, 0.16))",
                  color: "var(--palette-grey-100)",
                  transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)"
                } as CSSProperties
              }
              sx={{
                "& svg": {
                  fontSize: "1.75rem",
                  color: "var(--quick-icon-color, var(--palette-text-primary))",
                  position: "relative",
                  zIndex: 1,
                  filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.2))",
                  transition: "transform 0.3s ease"
                },
                "&::before": {
                  content: '""',
                  position: "absolute",
                  inset: 0,
                  borderRadius: "inherit",
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.16), transparent 60%)",
                  opacity: 0.6,
                  pointerEvents: "none",
                  mixBlendMode: "overlay"
                },
                "&::after": {
                  content: '""',
                  position: "absolute",
                  inset: 0,
                  borderRadius: "inherit",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2)",
                  pointerEvents: "none",
                  opacity: 0.8
                },
                "&:hover": {
                  transform: "translateY(-3px) scale(1.05)",
                  background:
                    "var(--quick-hover-gradient, rgba(255, 255, 255, 0.08))",
                  boxShadow:
                    "var(--quick-shadow-hover, 0 12px 24px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.15))",
                  borderColor: "rgba(255,255,255,0.25)",
                  zIndex: 10,
                  "& svg": {
                    transform: "scale(1.1)"
                  }
                },
                "&:active": {
                  transform: "scale(0.96) translateY(0)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.2)"
                },
                "&.active": {
                  borderColor: `var(--mui-palette-primary-main)`,
                  boxShadow: `0 0 0 2px var(--mui-palette-primary-main), var(--quick-shadow)`,
                  "& svg": {
                    color: "var(--palette-text-primary)"
                  }
                }
              }}
            >
              {icon}
            </IconButton>
          </Tooltip>
        );
      })}
    </div>
  );
});

export default QuickActions;
