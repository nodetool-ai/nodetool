import { memo } from "react";

import { Box } from "./Box";
import { SelectField, type SelectOption } from "./SelectField";

export interface InspectorSelectProps {
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  grow?: boolean;
}

/** Compact mono select shared by document inspectors. */
export const InspectorSelect = memo(function InspectorSelect({
  label, value, options, onChange, disabled, grow
}: InspectorSelectProps) {
  return <Box sx={{ minWidth: 0, width: grow ? "100%" : undefined, flex: grow ? "1 1 auto" : undefined }}>
    <SelectField label={label} hideLabel size="small" appearance="inspector" value={value}
      options={options} onChange={onChange} disabled={disabled} />
  </Box>;
});
