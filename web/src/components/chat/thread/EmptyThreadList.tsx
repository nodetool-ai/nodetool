/** @jsxImportSource @emotion/react */
import React from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { createStyles } from "./EmptyThreadList.styles";

export const EmptyThreadList: React.FC = () => {
  const theme = useTheme();
  return (
    <li css={createStyles}>
      No conversations yet. Click &ldquo;New Chat&rdquo; to start.
    </li>
  );
};
