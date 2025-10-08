import { memo, useCallback } from "react";
import type {
  CSSProperties,
  ReactNode,
  MouseEvent,
  DragEvent as ReactDragEvent
} from "react";
import { IconButton, Tooltip } from "@mui/material";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";
import ImageIcon from "@mui/icons-material/Image";
import RecordVoiceOverIcon from "@mui/icons-material/RecordVoiceOver";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import KeyboardVoiceIcon from "@mui/icons-material/KeyboardVoice";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import useNodePlacementStore from "../../stores/NodePlacementStore";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import useMetadataStore from "../../stores/MetadataStore";

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
      "linear-gradient(135deg, rgba(79, 70, 229, 0.48), rgba(124, 58, 237, 0.32))",
    hoverGradient:
      "linear-gradient(135deg, rgba(99, 102, 241, 0.6), rgba(139, 92, 246, 0.42))",
    shadow: "0 6px 16px rgba(99, 102, 241, 0.28)",
    hoverShadow:
      "0 10px 26px rgba(99, 102, 241, 0.38), 0 0 20px rgba(79, 70, 229, 0.26)",
    iconColor: "#eef2ff"
  },
  {
    key: "text-to-image",
    label: "Add Text to Image",
    nodeType: "nodetool.image.TextToImage",
    icon: <ImageIcon />,
    gradient:
      "linear-gradient(135deg, rgba(249, 115, 22, 0.45), rgba(236, 72, 153, 0.32))",
    hoverGradient:
      "linear-gradient(135deg, rgba(251, 146, 60, 0.55), rgba(244, 114, 182, 0.42))",
    shadow: "0 6px 16px rgba(249, 115, 22, 0.28)",
    hoverShadow:
      "0 10px 26px rgba(236, 72, 153, 0.38), 0 0 20px rgba(249, 115, 22, 0.24)",
    iconColor: "#fff5f5"
  },
  {
    key: "text-to-speech",
    label: "Add Text to Speech",
    nodeType: "nodetool.audio.TextToSpeech",
    icon: <RecordVoiceOverIcon />,
    gradient:
      "linear-gradient(135deg, rgba(34, 211, 238, 0.45), rgba(59, 130, 246, 0.32))",
    hoverGradient:
      "linear-gradient(135deg, rgba(45, 212, 191, 0.55), rgba(96, 165, 250, 0.42))",
    shadow: "0 6px 16px rgba(34, 211, 238, 0.24)",
    hoverShadow:
      "0 10px 24px rgba(59, 130, 246, 0.32), 0 0 18px rgba(34, 211, 238, 0.2)",
    iconColor: "#e6f6ff"
  },
  {
    key: "image-to-image",
    label: "Add Image to Image",
    nodeType: "nodetool.image.ImageToImage",
    icon: <AutoFixHighIcon />,
    gradient:
      "linear-gradient(135deg, rgba(168, 85, 247, 0.45), rgba(34, 211, 238, 0.28))",
    hoverGradient:
      "linear-gradient(135deg, rgba(192, 132, 252, 0.55), rgba(56, 189, 248, 0.38))",
    shadow: "0 6px 16px rgba(168, 85, 247, 0.26)",
    hoverShadow:
      "0 10px 26px rgba(168, 85, 247, 0.36), 0 0 20px rgba(34, 211, 238, 0.22)",
    iconColor: "#f8f5ff"
  },
  {
    key: "speech-to-text",
    label: "Add Speech to Text",
    nodeType: "nodetool.text.AutomaticSpeechRecognition",
    icon: <KeyboardVoiceIcon />,
    gradient:
      "linear-gradient(135deg, rgba(14, 165, 233, 0.45), rgba(99, 102, 241, 0.28))",
    hoverGradient:
      "linear-gradient(135deg, rgba(59, 130, 246, 0.55), rgba(165, 180, 252, 0.38))",
    shadow: "0 6px 16px rgba(14, 165, 233, 0.24)",
    hoverShadow:
      "0 10px 24px rgba(59, 130, 246, 0.32), 0 0 18px rgba(99, 102, 241, 0.22)",
    iconColor: "#eef2ff"
  }
];

type QuickActionsProps = {
  isAvailable: boolean;
  onAddNode: (
    action: QuickActionDefinition,
    event: MouseEvent<HTMLButtonElement>
  ) => void;
};

const QuickActions = memo(function QuickActions({
  isAvailable,
  onAddNode
}: QuickActionsProps) {
  const setDragToCreate = useNodeMenuStore((state) => state.setDragToCreate);
  const pendingNodeType = useNodePlacementStore(
    (state) => state.pendingNodeType
  );
  const getMetadata = useMetadataStore((state) => state.getMetadata);

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

  if (!isAvailable) {
    return null;
  }

  return (
    <>
      <div className="quick-actions-divider" />
      <div className="quick-actions-group">
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
              placement="right-start"
              enterDelay={TOOLTIP_ENTER_DELAY}
            >
              <IconButton
                tabIndex={-1}
                draggable
                onDragStart={handleDragStart(nodeType)}
                onDragEnd={handleDragEnd}
                onClick={(event) => onAddNode(definition, event)}
                className={`quick-add-button${
                  pendingNodeType === nodeType ? " active" : ""
                }`}
                style={
                  {
                    "--quick-gradient": gradient,
                    "--quick-hover-gradient": hoverGradient,
                    "--quick-shadow": shadow,
                    "--quick-shadow-hover": hoverShadow ?? shadow,
                    "--quick-icon-color": iconColor
                  } as CSSProperties
                }
              >
                {icon}
              </IconButton>
            </Tooltip>
          );
        })}
      </div>
    </>
  );
});

export default QuickActions;
