/** @jsxImportSource @emotion/react */
import React from "react";
import { useTheme } from "@mui/material/styles";
import Actions from "./Actions";
import { MaybeMarkdown } from "./markdown";
import { outputStyles } from "./styles";

type Props = { text: string; onCopy: (text: string) => void };

export const TextRenderer: React.FC<Props> = ({ text, onCopy }) => {
  const theme = useTheme();
  if (!text) return null;
  return (
    <div className="output value nodrag noscroll" css={outputStyles(theme)}>
      <Actions onCopy={() => onCopy(text)} />
      <MaybeMarkdown text={text} />
    </div>
  );
};
