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
import { BORDER_RADIUS, SPACING } from "../ui_primitives";

/** ui_primitives Chip color per entity kind. */
export const ENTITY_KIND_COLOR = {
  character: "primary",
  location: "info",
  style: "secondary",
  prop: "success"
} satisfies Record<EntityKind, "primary" | "secondary" | "info" | "success">;

/**
 * Subtle chip styling per entity kind. Uses a translucent tint instead of a
 * solid `filled` background so storyboard chips read as metadata, not as
 * saturated alerts. The palette key stays the same, only the alpha changes.
 */
export const getEntityKindChipSx = (kind: EntityKind) => {
  const palette = ENTITY_KIND_COLOR[kind];
  return {
    borderRadius: BORDER_RADIUS.pill,
    backgroundColor: `rgba(var(--palette-${palette}-mainChannel) / 0.12)`,
    color: `var(--palette-${palette}-main)`,
    borderColor: `rgba(var(--palette-${palette}-mainChannel) / 0.22)`,
    "& .MuiChip-deleteIcon": {
      color: `var(--palette-${palette}-main)`
    },
    "& .MuiChip-deleteIcon:hover": {
      color: `var(--palette-${palette}-main)`
    }
  } as const;
};

/** Icon per entity kind, used where a thumbnail is missing or too small. */
export const ENTITY_KIND_ICON = {
  character: PersonOutlineIcon,
  location: PlaceOutlinedIcon,
  style: PaletteOutlinedIcon,
  prop: CategoryOutlinedIcon
} satisfies Record<EntityKind, SvgIconComponent>;

/**
 * Quiet chip styling for surfaces that show many entity chips at once (the
 * storyboard shot card). The chip body stays neutral so it reads as metadata
 * next to the shot text; the kind is carried by the dot the caller renders as
 * the chip icon, and inclusion in the shot by the text and border strength.
 */
export const getEntityChipSx = (applied: boolean) =>
  ({
    borderRadius: BORDER_RADIUS.pill,
    backgroundColor: "transparent",
    color: applied ? "text.secondary" : "text.disabled",
    borderColor: applied ? "divider" : "transparent",
    "& .MuiChip-icon": {
      marginLeft: SPACING.sm,
      marginRight: -SPACING.micro
    }
  }) as const;

/** The kind dot rendered as an entity chip's icon on quiet chip surfaces. */
export const getEntityKindDotSx = (kind: EntityKind, applied: boolean) =>
  ({
    width: 6,
    height: 6,
    borderRadius: BORDER_RADIUS.circle,
    flexShrink: 0,
    backgroundColor: applied
      ? `var(--palette-${ENTITY_KIND_COLOR[kind]}-main)`
      : "transparent",
    border: applied
      ? "none"
      : `1px solid rgba(var(--palette-${ENTITY_KIND_COLOR[kind]}-mainChannel) / 0.5)`
  }) as const;
