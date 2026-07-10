/** @jsxImportSource @emotion/react */
import React, { useCallback, useState } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { css } from "@emotion/react";
import { BORDER_RADIUS, SPACING, getSpacingPx } from "../ui_primitives";
import { isValid } from "../../utils/dateFormat";

interface CustomDatePickerProps {
  value: string;
  onChange: (date: string) => void;
}

/** Convert an ISO/date string to the local "YYYY-MM-DDTHH:mm" form that
 * `<input type="datetime-local">` expects. Returns "" for invalid input. */
const toLocalInputValue = (value: string): string => {
  const date = new Date(value);
  if (!isValid(date)) {
    return "";
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const inputStyles = (theme: Theme) =>
  css({
    width: "100%",
    boxSizing: "border-box",
    padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.sm)}`,
    fontFamily: theme.fontFamily1,
    fontSize: theme.fontSizeNormal,
    color: theme.vars.palette.text.primary,
    backgroundColor: theme.vars.palette.background.paper,
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: BORDER_RADIUS.sm,
    outline: "none",
    "&:focus": {
      borderColor: theme.vars.palette.primary.main
    },
    "&::-webkit-calendar-picker-indicator": {
      cursor: "pointer"
    }
  });

/**
 * Datetime input with the same contract as the old MUI X DateTimePicker
 * wrapper: `value` is any parseable date string, `onChange` receives an ISO
 * string when the user commits a valid date (blur or Enter).
 */
const CustomDatePicker: React.FC<CustomDatePickerProps> = ({
  value,
  onChange
}) => {
  const theme = useTheme();
  const [inputValue, setInputValue] = useState<string>(() =>
    toLocalInputValue(value)
  );

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(event.target.value);
    },
    []
  );

  const commit = useCallback(() => {
    if (!inputValue) {
      return;
    }
    // datetime-local values ("YYYY-MM-DDTHH:mm") are parsed as local time.
    const date = new Date(inputValue);
    if (isValid(date)) {
      onChange(date.toISOString());
    }
  }, [inputValue, onChange]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        commit();
      }
    },
    [commit]
  );

  return (
    <input
      type="datetime-local"
      css={inputStyles(theme)}
      value={inputValue}
      onChange={handleInputChange}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      aria-label="Date and time"
    />
  );
};

export default CustomDatePicker;
