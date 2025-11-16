/** @jsxImportSource @emotion/react */
import React, { useMemo, useState, useCallback } from "react";
import { useTheme } from "@mui/material/styles";
import Actions from "./Actions";
import { MaybeMarkdown } from "./markdown";
import { outputStyles } from "./styles";
import { Box, Collapse, IconButton, Tooltip } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

type Props = {
  text: string;
  onCopy: (text: string) => void;
  showActions?: boolean;
};

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
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const handleToggle = useCallback(() => {
    setOpen((v) => !v);
  }, []);
  const handleContainerClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      handleToggle();
    },
    [handleToggle]
  );
  const handleIconClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      handleToggle();
    },
    [handleToggle]
  );
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
        onClick={handleContainerClick}
      >
        <IconButton
          size="small"
          onClick={handleIconClick}
          sx={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s"
          }}
          aria-label={open ? "Collapse reasoning" : "Expand reasoning"}
        >
          <ExpandMoreIcon fontSize="inherit" />
        </IconButton>
        <Box
          component="span"
          sx={{
            fontSize: 12,
            textTransform: "uppercase"
          }}
        >
          {open ? "Hide reasoning" : "Show reasoning"}
        </Box>
      </Box>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <Box
          className="reasoning-content"
          sx={{
            padding: "0 0.5em",
            margin: 0,
            color: theme.vars.palette.text.secondary
          }}
        >
          <MaybeMarkdown text={content} />
        </Box>
      </Collapse>
    </Box>
  );
};

export const TextRenderer: React.FC<Props> = ({
  text,
  onCopy,
  showActions = true
}) => {
  const theme = useTheme();
  const sections = useMemo(() => parseThinkSections(text), [text]);
  if (!text) return null;
  return (
    <div className="output value nodrag nowheel" css={outputStyles(theme)}>
      {showActions && <Actions onCopy={() => onCopy(text)} />}
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
