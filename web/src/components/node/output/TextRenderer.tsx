/** @jsxImportSource @emotion/react */
import React, { useMemo, useState, useCallback } from "react";
import { useTheme } from "@mui/material/styles";
import Actions from "./Actions";
import { MaybeMarkdown } from "./markdown";
import { outputStyles } from "./styles";
import { Box, Collapse, IconButton, Tooltip } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

type Props = { text: string; onCopy: (text: string) => void };

type Section = { type: "text" | "think"; content: string };

const parseThinkSections = (input: string): Section[] => {
  if (!input) return [];
  const sections: Section[] = [];
  const regex = /<think>([\s\S]*?)<\/think>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Extract alternating text and think blocks
  while ((match = regex.exec(input)) !== null) {
    const start = match.index;
    const end = regex.lastIndex;
    const before = input.slice(lastIndex, start);
    if (before) sections.push({ type: "text", content: before });
    sections.push({ type: "think", content: match[1] || "" });
    lastIndex = end;
  }
  const tail = input.slice(lastIndex);
  if (tail) sections.push({ type: "text", content: tail });
  if (sections.length === 0) return [{ type: "text", content: input }];
  return sections;
};

const ThinkBlock: React.FC<{ content: string }> = ({ content }) => {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  return (
    <Box
      sx={{
        my: 1,
        borderRadius: 1,
        overflow: "hidden"
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1,
          py: 0.5,
          cursor: "pointer",
          userSelect: "none"
        }}
        onClick={toggle}
      >
        <IconButton
          size="small"
          onClick={toggle}
          sx={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s"
          }}
          aria-label={open ? "Collapse reasoning" : "Expand reasoning"}
        >
          <ExpandMoreIcon fontSize="inherit" />
        </IconButton>
        <Tooltip title={open ? "Hide reasoning" : "Show reasoning"}>
          <Box component="span" sx={{ fontSize: 12, opacity: 0.8 }}>
            Hidden reasoning
          </Box>
        </Tooltip>
      </Box>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <MaybeMarkdown text={content} />
      </Collapse>
    </Box>
  );
};

export const TextRenderer: React.FC<Props> = ({ text, onCopy }) => {
  const theme = useTheme();
  const sections = useMemo(() => parseThinkSections(text), [text]);
  if (!text) return null;
  return (
    <div className="output value nodrag noscroll" css={outputStyles(theme)}>
      <Actions onCopy={() => onCopy(text)} />
      {sections.map((s, i) =>
        s.type === "think" ? (
          <ThinkBlock key={i} content={s.content} />
        ) : (
          <MaybeMarkdown key={i} text={s.content} />
        )
      )}
    </div>
  );
};
