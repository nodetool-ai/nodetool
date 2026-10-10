import { useCallback, useState } from "react";
import type { SxProps, Theme } from "@mui/material/styles";

import { Box } from "./Box";
import { TextInput } from "./TextInput";
import { SPACING } from "./spacing";
import { FONT_SIZE_SANS } from "./tokens";

export interface NumericFieldProps {
  value: number;
  onCommit: (value: number) => void;
  label: string;
  step?: number;
  min?: number;
  max?: number;
  integer?: boolean;
  sx?: SxProps<Theme>;
}

const roundTo = (value: number, digits = 4): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** Editable numeric value that commits while typing and clamps on blur. */
export function NumericField({
  value,
  onCommit,
  label,
  step = 0.1,
  min,
  max,
  integer = false,
  sx
}: NumericFieldProps) {
  const [text, setText] = useState(String(roundTo(value)));
  // External changes, including gizmo drags, refresh the buffer without
  // replacing a partially typed value that already represents this number.
  const [prevValue, setPrevValue] = useState(value);
  // Whether the user typed since the field last showed `value`. A blur with
  // nothing typed commits nothing: the text is rounded for display, and
  // committing it would change the value the user only looked at.
  const [edited, setEdited] = useState(false);
  if (value !== prevValue) {
    setPrevValue(value);
    const parsed = parseFloat(text);
    if (!Number.isFinite(parsed) || Math.abs(parsed - value) > 1e-6) {
      setText(String(roundTo(value)));
    }
  }

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value;
      setText(next);
      setEdited(true);
      const parsed = parseFloat(next);
      if (Number.isFinite(parsed)) {
        onCommit(integer ? Math.round(parsed) : parsed);
      }
    },
    [onCommit, integer]
  );

  const handleBlur = useCallback(() => {
    if (!edited) {
      return;
    }
    setEdited(false);
    let parsed = parseFloat(text);
    if (!Number.isFinite(parsed)) {
      setText(String(roundTo(value)));
      return;
    }
    if (integer) {
      parsed = Math.round(parsed);
    }
    if (min !== undefined) {
      parsed = Math.max(min, parsed);
    }
    if (max !== undefined) {
      parsed = Math.min(max, parsed);
    }
    setText(String(integer ? parsed : roundTo(parsed)));
    onCommit(parsed);
  }, [edited, text, value, integer, min, max, onCommit]);

  return (
    <Box sx={[{ flex: 1, minWidth: 0, width: "100%" }, ...(Array.isArray(sx) ? sx : [sx])]}>
      <TextInput
        className="nodrag nowheel"
        type="number"
        size="small"
        inputProps={{ step, "aria-label": label }}
        value={text}
        onChange={handleChange}
        onBlur={handleBlur}
        sx={{
          "& .MuiInputBase-input": {
            px: SPACING.sm,
            py: SPACING.xs,
            fontSize: FONT_SIZE_SANS.label
          }
        }}
      />
    </Box>
  );
}
