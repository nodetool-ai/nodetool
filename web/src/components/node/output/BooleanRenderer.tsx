/** @jsxImportSource @emotion/react */
import React from "react";
import { useTheme } from "@mui/material/styles";
import Actions from "./Actions";
import { outputStyles } from "./styles";

export const BooleanRenderer: React.FC<{
  value: boolean;
  onCopy: (text: string) => void;
}> = ({ value, onCopy }) => {
  const theme = useTheme();
  const boolStr = String(value).toUpperCase();
  return (
    <div className="output value nodrag noscroll" css={outputStyles(theme)}>
      <Actions onCopy={() => onCopy(boolStr)} />
      <p style={{ padding: "1em", color: "inherit" }}>{boolStr}</p>
    </div>
  );
};
