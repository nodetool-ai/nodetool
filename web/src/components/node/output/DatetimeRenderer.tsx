/** @jsxImportSource @emotion/react */
import React from "react";
import { useTheme } from "@mui/material/styles";
import Actions from "./Actions";
import { outputStyles } from "./styles";
import { Datetime } from "../../../stores/ApiTypes";

/**
 * Format a Datetime object into a human-readable string.
 * Note: Month is 1-indexed in the API but 0-indexed in JS Date.
 * Note: Timezone information (tzinfo/utc_offset) and microseconds are not
 * included in the display for simplicity. The date is shown in the user's
 * local timezone. This matches the behavior in CalendarEventView.
 */
const formatDatetime = (dt: Datetime): string => {
  const date = new Date(
    dt.year,
    dt.month - 1,
    dt.day,
    dt.hour,
    dt.minute,
    dt.second
  );
  return date.toLocaleString();
};

export const DatetimeRenderer: React.FC<{
  value: Datetime;
}> = ({ value }) => {
  const theme = useTheme();
  const formattedDate = formatDatetime(value);
  return (
    <div className="output value" css={outputStyles(theme)}>
      <Actions copyValue={formattedDate} />
      <p style={{ padding: "1em", color: "inherit" }}>{formattedDate}</p>
    </div>
  );
};
