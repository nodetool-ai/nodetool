import { memo, useId, type ReactNode } from "react";
import { Switch } from "@mui/material";

import { Box } from "./Box";
import { InspectorFieldRow } from "./InspectorFieldRow";
import { SPACING, getSpacingPx } from "./spacing";
import { BORDER_RADIUS, CONTROL, MOTION } from "./tokens";

export interface InspectorToggleRowProps {
  label: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  layout?: "grid" | "inline";
}

const toggleSx = {
  width: CONTROL.height.sm,
  height: getSpacingPx(SPACING.xl),
  padding: SPACING.none,
  "& .MuiSwitch-switchBase": {
    padding: SPACING.none,
    margin: getSpacingPx(SPACING.micro),
    transitionDuration: MOTION.normal,
    "&.Mui-checked": {
      transform: `translateX(${getSpacingPx(SPACING.lg)})`,
      color: "var(--palette-primary-contrastText)",
      "& + .MuiSwitch-track": {
        backgroundColor: "var(--palette-primary-main)",
        opacity: 1,
        border: 0
      }
    }
  },
  "& .MuiSwitch-thumb": {
    boxSizing: "border-box",
    width: getSpacingPx(SPACING.lg),
    height: getSpacingPx(SPACING.lg),
    boxShadow: "0 1px 2px var(--palette-c_scrim)"
  },
  "& .MuiSwitch-track": {
    borderRadius: BORDER_RADIUS.pill,
    backgroundColor: "var(--palette-c_overlay_strong)",
    opacity: 1
  }
} as const;

export const InspectorToggleRow = memo(function InspectorToggleRow({
  label, checked, onChange, disabled, layout
}: InspectorToggleRowProps) {
  const id = useId();
  return <InspectorFieldRow label={label} htmlFor={id} layout={layout}>
    <Box sx={{ ml: "auto" }}>
      <Switch id={id} size="small" checked={checked} disabled={disabled}
        onChange={(_event, next) => onChange(next)} sx={toggleSx} />
    </Box>
  </InspectorFieldRow>;
});
