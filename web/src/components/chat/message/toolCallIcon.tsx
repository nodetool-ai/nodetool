/**
 * toolCallIcon — maps a tool name to a category glyph for the tool-call
 * timeline. Categories are keyword-driven so any provider's naming
 * (snake_case, MCP `mcp__server__tool`, `ui_*`) lands in a sensible bucket;
 * unknown tools fall back to a neutral wrench.
 *
 * The timeline is monochrome: the glyph says what kind of work happened, the
 * row's text says what it did. No per-tool color.
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

const CATEGORIES: Array<{ pattern: RegExp; Icon: SvgIconComponent }> = [
  { pattern: /subtask|agent|task|plan/, Icon: AccountTreeOutlinedIcon },
  {
    pattern: /database|query|sql|collection|vector|index|table|record/,
    Icon: StorageRoundedIcon
  },
  { pattern: /search|find|grep|glob|lookup|list/, Icon: SearchRoundedIcon },
  {
    pattern: /file|read|write|edit|directory|folder|asset|document|save|open/,
    Icon: DescriptionOutlinedIcon
  },
  {
    pattern: /http|web|fetch|url|browser|download|upload|request|api|notif|send|mail|message/,
    Icon: PublicRoundedIcon
  },
  {
    pattern: /image|video|audio|speech|generate|render|draw|media/,
    Icon: ImageOutlinedIcon
  },
  {
    pattern: /shell|bash|terminal|command|exec|run|code|script|node|workflow/,
    Icon: TerminalRoundedIcon
  }
];

export function getToolIcon(name?: string | null): SvgIconComponent {
  if (!name) {
    return BuildOutlinedIcon;
  }
  const normalized = name.toLowerCase();
  for (const { pattern, Icon } of CATEGORIES) {
    if (pattern.test(normalized)) {
      return Icon;
    }
  }
  return BuildOutlinedIcon;
}
