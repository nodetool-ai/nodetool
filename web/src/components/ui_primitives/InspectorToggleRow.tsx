import { memo, useId, type ReactNode } from "react";
import { Switch } from "@mui/material";

import { Box } from "./Box";
import { InspectorFieldRow } from "./InspectorFieldRow";

export interface InspectorToggleRowProps {
  label: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  layout?: "grid" | "inline";
}

export const InspectorToggleRow = memo(function InspectorToggleRow({
  label, checked, onChange, disabled, layout
}: InspectorToggleRowProps) {
  const id = useId();
  return <InspectorFieldRow label={label} htmlFor={id} layout={layout}>
    <Box sx={{ ml: "auto" }}>
      <Switch id={id} size="small" checked={checked} disabled={disabled}
        onChange={(_event, next) => onChange(next)} />
    </Box>
  </InspectorFieldRow>;
});
