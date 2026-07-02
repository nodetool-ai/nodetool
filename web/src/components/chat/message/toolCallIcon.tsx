/**
 * toolCallIcon — maps a tool name to a category icon + accent color for the
 * tool execution chain. Categories are keyword-driven so any provider's tool
 * naming (snake_case, MCP `mcp__server__tool`, `ui_*`) lands in a sensible
 * bucket; unknown tools fall back to a neutral wrench.
 */

import type { SvgIconComponent } from "@mui/icons-material";
import StorageRoundedIcon from "@mui/icons-material/StorageRounded";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import PublicRoundedIcon from "@mui/icons-material/PublicRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import TerminalRoundedIcon from "@mui/icons-material/TerminalRounded";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import BuildOutlinedIcon from "@mui/icons-material/BuildOutlined";

/** Accent keys resolve to theme palette colors in the chat styles. */
export type ToolAccent =
  | "info"
  | "warning"
  | "success"
  | "primary"
  | "secondary"
  | "neutral";

export interface ToolVisual {
  Icon: SvgIconComponent;
  accent: ToolAccent;
}

const CATEGORIES: Array<{ pattern: RegExp; visual: ToolVisual }> = [
  {
    pattern: /subtask|agent|task/,
    visual: { Icon: AccountTreeOutlinedIcon, accent: "primary" }
  },
  {
    pattern: /database|query|sql|collection|vector|index|table|record/,
    visual: { Icon: StorageRoundedIcon, accent: "info" }
  },
  {
    pattern: /search|find|grep|glob|lookup|list/,
    visual: { Icon: SearchRoundedIcon, accent: "warning" }
  },
  {
    pattern: /file|read|write|edit|directory|folder|asset|document|save|open/,
    visual: { Icon: DescriptionOutlinedIcon, accent: "warning" }
  },
  {
    pattern: /http|web|fetch|url|browser|download|upload|request|api|notif|send|mail|message/,
    visual: { Icon: PublicRoundedIcon, accent: "success" }
  },
  {
    pattern: /image|video|audio|speech|generate|render|draw|media/,
    visual: { Icon: ImageOutlinedIcon, accent: "secondary" }
  },
  {
    pattern: /shell|bash|terminal|command|exec|run|code|script|node|workflow/,
    visual: { Icon: TerminalRoundedIcon, accent: "primary" }
  }
];

const DEFAULT_VISUAL: ToolVisual = {
  Icon: BuildOutlinedIcon,
  accent: "neutral"
};

export function getToolVisual(name?: string | null): ToolVisual {
  if (!name) return DEFAULT_VISUAL;
  const normalized = name.toLowerCase();
  for (const { pattern, visual } of CATEGORIES) {
    if (pattern.test(normalized)) return visual;
  }
  return DEFAULT_VISUAL;
}
