import { SvgIconTypeMap } from "@mui/material";
import { OverridableComponent } from "@mui/material/OverridableComponent";
import { SvgIconOwnProps } from "@mui/material/SvgIcon/SvgIcon";
import {
  Input as InputIcon,
  Output as OutputIcon,
  AccountTree as ControlFlowIcon,
  Memory as AiIcon,
  Image as ImageIcon,
  AudioFile as AudioIcon,
  VideoFile as VideoIcon,
  TextFields as TextIcon,
  TableChart as DataIcon,
  Extension as UtilityIcon,
  Settings as SettingsIcon,
  Storage as StorageIcon,
  FormatListBulleted as ListIcon,
  Category as DefaultIcon
} from "@mui/icons-material";

type IconComponent = OverridableComponent<SvgIconTypeMap<SvgIconOwnProps, "svg">>;

interface NamespaceIconConfig {
  icon: IconComponent;
  label: string;
}

const namespaceIcons: Record<string, NamespaceIconConfig> = {
  "nodetool.input": {
    icon: InputIcon,
    label: "Input"
  },
  "nodetool.output": {
    icon: OutputIcon,
    label: "Output"
  },
  "nodetool.control": {
    icon: ControlFlowIcon,
    label: "Control Flow"
  },
  "nodetool.logic": {
    icon: ControlFlowIcon,
    label: "Logic"
  },
  anthropic: {
    icon: AiIcon,
    label: "Anthropic"
  },
  "openai": {
    icon: AiIcon,
    label: "OpenAI"
  },
  "google": {
    icon: AiIcon,
    label: "Google"
  },
  "bedrock": {
    icon: AiIcon,
    label: "Bedrock"
  },
  "groq": {
    icon: AiIcon,
    label: "Groq"
  },
  "mistral": {
    icon: AiIcon,
    label: "Mistral"
  },
  "huggingface": {
    icon: AiIcon,
    label: "HuggingFace"
  },
  "ollama": {
    icon: AiIcon,
    label: "Ollama"
  },
  "replicate": {
    icon: AiIcon,
    label: "Replicate"
  },
  "image": {
    icon: ImageIcon,
    label: "Image"
  },
  "audio": {
    icon: AudioIcon,
    label: "Audio"
  },
  "video": {
    icon: VideoIcon,
    label: "Video"
  },
  "text": {
    icon: TextIcon,
    label: "Text"
  },
  "data": {
    icon: DataIcon,
    label: "Data"
  },
  "utils": {
    icon: UtilityIcon,
    label: "Utility"
  },
  "settings": {
    icon: SettingsIcon,
    label: "Settings"
  },
  storage: {
    icon: StorageIcon,
    label: "Storage"
  },
  list: {
    icon: ListIcon,
    label: "List"
  }
};

export function getNamespaceIcon(namespace: string): NamespaceIconConfig {
  const parts = namespace.split(".");
  const prefix = parts[0];
  const fullPrefix = parts.slice(0, 2).join(".");

  if (namespaceIcons[fullPrefix]) {
    return namespaceIcons[fullPrefix];
  }

  if (namespaceIcons[prefix]) {
    return namespaceIcons[prefix];
  }

  return {
    icon: DefaultIcon,
    label: parts[parts.length - 1] || namespace
  };
}

export function getNamespaceDisplayName(namespace: string): string {
  const config = getNamespaceIcon(namespace);
  return config.label;
}

export { namespaceIcons };
