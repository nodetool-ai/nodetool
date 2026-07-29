/**
 * Shared presentation constants for entity kinds (characters, locations,
 * styles, props) so every surface — library cards, mention pickers, storyboard
 * chips — colors and labels them the same way.
 */

import type { SvgIconComponent } from "@mui/icons-material";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import PaletteOutlinedIcon from "@mui/icons-material/PaletteOutlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import type { EntityKind } from "@nodetool-ai/protocol";

/** ui_primitives Chip color per entity kind. */
export const ENTITY_KIND_COLOR: Record<
  EntityKind,
  "primary" | "secondary" | "info" | "success"
> = {
  character: "primary",
  location: "info",
  style: "secondary",
  prop: "success"
};

/** Icon per entity kind, used where a thumbnail is missing or too small. */
export const ENTITY_KIND_ICON: Record<EntityKind, SvgIconComponent> = {
  character: PersonOutlineIcon,
  location: PlaceOutlinedIcon,
  style: PaletteOutlinedIcon,
  prop: CategoryOutlinedIcon
};
