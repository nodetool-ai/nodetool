import type { ReactNode } from "react";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";
import ImageIcon from "@mui/icons-material/Image";
import RecordVoiceOverIcon from "@mui/icons-material/RecordVoiceOver";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import KeyboardVoiceIcon from "@mui/icons-material/KeyboardVoice";
import VideoLibraryIcon from "@mui/icons-material/VideoLibrary";
import OndemandVideoIcon from "@mui/icons-material/OndemandVideo";
import ApiIcon from "@mui/icons-material/Api";
import CodeIcon from "@mui/icons-material/Code";
import HighQualityIcon from "@mui/icons-material/HighQuality";
import LayersClearIcon from "@mui/icons-material/LayersClear";
import WbSunnyIcon from "@mui/icons-material/WbSunny";
import PolylineIcon from "@mui/icons-material/Polyline";
import MovieFilterIcon from "@mui/icons-material/MovieFilter";
import MusicVideoIcon from "@mui/icons-material/MusicVideo";
import { colorForType } from "../../config/data_types";
import { IconForType } from "../../config/IconForType";
import { QUICK_ACTION_NODE_TYPES } from "../../config/quickActionNodeTypes";

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

const QUICK_ACTION_AI_NODE_TYPES = QUICK_ACTION_NODE_TYPES.slice(0, 17);
const QUICK_ACTION_CONSTANT_NODE_TYPES = QUICK_ACTION_NODE_TYPES.slice(17);

export const QUICK_ACTION_BUTTONS: QuickActionDefinition[] = [
  buildQuickAction("agent", "Agent", QUICK_ACTION_AI_NODE_TYPES[0], <SupportAgentIcon />, rgb(79, 70, 229), rgb(99, 102, 241), "#4f46e5"),
  buildQuickAction("code", "Code", QUICK_ACTION_AI_NODE_TYPES[1], <CodeIcon />, rgb(34, 197, 94), rgb(74, 222, 128), "#16a34a"),
  buildQuickAction("text-to-image", "Text to Image", QUICK_ACTION_AI_NODE_TYPES[2], <ImageIcon />, rgb(236, 72, 153), rgb(244, 114, 182), "#db2777"),
  buildQuickAction("image-to-image", "Image to Image", QUICK_ACTION_AI_NODE_TYPES[3], <AutoFixHighIcon />, rgb(16, 185, 129), rgb(52, 211, 153), "#059669"),
  buildQuickAction("upscale", "Upscale", QUICK_ACTION_AI_NODE_TYPES[4], <HighQualityIcon />, rgb(217, 70, 239), rgb(232, 121, 249), "#c026d3"),
  buildQuickAction("remove-background", "Remove Background", QUICK_ACTION_AI_NODE_TYPES[5], <LayersClearIcon />, rgb(20, 184, 166), rgb(45, 212, 191), "#0d9488"),
  buildQuickAction("relight", "Relight", QUICK_ACTION_AI_NODE_TYPES[6], <WbSunnyIcon />, rgb(245, 158, 11), rgb(251, 191, 36), "#d97706"),
  buildQuickAction("vectorize", "Vectorize", QUICK_ACTION_AI_NODE_TYPES[7], <PolylineIcon />, rgb(132, 204, 22), rgb(163, 230, 53), "#65a30d"),
  buildQuickAction("text-to-video", "Text to Video", QUICK_ACTION_AI_NODE_TYPES[8], <VideoLibraryIcon />, rgb(168, 85, 247), rgb(192, 132, 252), "#9333ea"),
  buildQuickAction("image-to-video", "Image to Video", QUICK_ACTION_AI_NODE_TYPES[9], <OndemandVideoIcon />, rgb(249, 115, 22), rgb(251, 146, 60), "#ea580c"),
  buildQuickAction("video-to-video", "Video to Video", QUICK_ACTION_AI_NODE_TYPES[10], <MovieFilterIcon />, rgb(244, 63, 94), rgb(251, 113, 133), "#e11d48"),
  buildQuickAction("lip-sync", "Lip Sync", QUICK_ACTION_AI_NODE_TYPES[11], <MusicVideoIcon />, rgb(217, 70, 239), rgb(240, 171, 252), "#c026d3"),
  buildQuickAction("text-to-speech", "Text to Speech", QUICK_ACTION_AI_NODE_TYPES[12], <RecordVoiceOverIcon />, rgb(6, 182, 212), rgb(34, 211, 238), "#0891b2"),
  buildQuickAction("speech-to-text", "Speech to Text", QUICK_ACTION_AI_NODE_TYPES[13], <KeyboardVoiceIcon />, rgb(14, 165, 233), rgb(56, 189, 248), "#0284c7"),
  buildQuickAction("fal-dynamic", "FalAI", QUICK_ACTION_AI_NODE_TYPES[14], <ApiIcon />, rgb(139, 92, 246), rgb(167, 139, 250), "#7c3aed"),
  buildQuickAction("kie-dynamic", "KieAI", QUICK_ACTION_AI_NODE_TYPES[15], <ApiIcon />, rgb(229, 92, 32), rgb(255, 140, 66), "#d94a12"),
  buildQuickAction("replicate-dynamic", "Replicate", QUICK_ACTION_AI_NODE_TYPES[16], <ApiIcon />, rgb(59, 130, 246), rgb(129, 140, 248), "#2563eb")
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
    nodeType: QUICK_ACTION_CONSTANT_NODE_TYPES[0],
    iconType: "bool"
  }),
  buildConstantNode({
    key: "constant-dataframe",
    label: "Data Frame",
    nodeType: QUICK_ACTION_CONSTANT_NODE_TYPES[1],
    iconType: "dataframe"
  }),
  buildConstantNode({
    key: "constant-date",
    label: "Date",
    nodeType: QUICK_ACTION_CONSTANT_NODE_TYPES[2],
    iconType: "date"
  }),
  buildConstantNode({
    key: "constant-datetime",
    label: "Date Time",
    nodeType: QUICK_ACTION_CONSTANT_NODE_TYPES[3],
    iconType: "datetime"
  }),
  buildConstantNode({
    key: "constant-dict",
    label: "Dict",
    nodeType: QUICK_ACTION_CONSTANT_NODE_TYPES[4],
    iconType: "dict"
  }),
  buildConstantNode({
    key: "constant-audio",
    label: "Audio",
    nodeType: QUICK_ACTION_CONSTANT_NODE_TYPES[5],
    iconType: "audio"
  }),
  buildConstantNode({
    key: "constant-document",
    label: "Document",
    nodeType: QUICK_ACTION_CONSTANT_NODE_TYPES[6],
    iconType: "document"
  }),
  buildConstantNode({
    key: "constant-float",
    label: "Float",
    nodeType: QUICK_ACTION_CONSTANT_NODE_TYPES[7],
    iconType: "float"
  }),
  buildConstantNode({
    key: "constant-image",
    label: "Image",
    nodeType: QUICK_ACTION_CONSTANT_NODE_TYPES[8],
    iconType: "image"
  }),
  buildConstantNode({
    key: "constant-integer",
    label: "Integer",
    nodeType: QUICK_ACTION_CONSTANT_NODE_TYPES[9],
    iconType: "int"
  }),
  buildConstantNode({
    key: "constant-json",
    label: "JSON",
    nodeType: QUICK_ACTION_CONSTANT_NODE_TYPES[10],
    iconType: "json"
  }),
  buildConstantNode({
    key: "constant-list",
    label: "List",
    nodeType: QUICK_ACTION_CONSTANT_NODE_TYPES[11],
    iconType: "list"
  }),
  buildConstantNode({
    key: "constant-model-3d",
    label: "Model 3D",
    nodeType: QUICK_ACTION_CONSTANT_NODE_TYPES[12],
    iconType: "model_3d"
  }),
  buildConstantNode({
    key: "constant-string",
    label: "String",
    nodeType: QUICK_ACTION_CONSTANT_NODE_TYPES[13],
    iconType: "str"
  }),
  buildConstantNode({
    key: "constant-video",
    label: "Video",
    nodeType: QUICK_ACTION_CONSTANT_NODE_TYPES[14],
    iconType: "video"
  })
].sort((a, b) => a.label.localeCompare(b.label));
