import { CONTROL, SPACING, TYPOGRAPHY } from "../../ui_primitives";

/** Full-width header bar for a CollapsibleSection that holds one inspector component. */
export const COMPONENT_SECTION_SX = {
  width: "100%",
  "& > [role='button']": { px: SPACING.md, minHeight: CONTROL.height.sm, bgcolor: "action.hover", borderTop: 1, borderColor: "divider" },
  "& > [role='button'] > div": { ...TYPOGRAPHY.sans.label, color: "text.primary" }
} as const;

