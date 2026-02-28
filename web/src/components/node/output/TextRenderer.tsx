/** @jsxImportSource @emotion/react */
import React, { useMemo, useState, useCallback, memo } from "react";
import { useTheme } from "@mui/material/styles";
import Actions from "./Actions";
import { MaybeMarkdown } from "./markdown";
import { outputStyles } from "./styles";
import { Box, Collapse } from "@mui/material";
import { ReasoningToggle } from "../../common/ReasoningToggle";

type Props = {
  text: string;
  showActions?: boolean;
};

type Section = {
  type: "text" | "think";
  content: string;
  start: number;
  end: number;
};

const parseThinkSections = (input: string): Section[] => {
  if (!input) {
    return [];
  }
  const sections: Section[] = [];
  const regex = /<think>([\s\S]*?)<\/think>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Extract alternating text and think blocks
  while ((match = regex.exec(input)) !== null) {
    const start = match.index;
    const end = regex.lastIndex;
    const before = input.slice(lastIndex, start);
    if (before) {
      sections.push({
        type: "text",
        content: before,
        start: lastIndex,
        end: start
      });
    }
    sections.push({ type: "think", content: match[1] || "", start, end });
    lastIndex = end;
  }
  const tail = input.slice(lastIndex);
  if (tail) {
    sections.push({
      type: "text",
      content: tail,
      start: lastIndex,
      end: input.length
    });
  }
  if (sections.length === 0) {
    return [{ type: "text", content: input, start: 0, end: input.length }];
  }
  return sections;
};

const ThinkBlock: React.FC<{ content: string }> = ({ content }) => {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const handleToggle = useCallback(() => {
    setOpen((v) => !v);
  }, []);

  // Memoize sx props to prevent recreation on every render
  const containerBoxStyle = useMemo(() => ({
    my: 1,
    borderRadius: 1,
    overflow: "hidden"
  }), []);

  const reasoningContentStyle = useMemo(() => ({
    padding: "0 0.5em",
    margin: 0,
    lineHeight: 1.2,
    fontSize: theme.vars.fontSizeSmaller,
    fontFamily: theme.vars.fontFamily2,
    color: theme.vars.palette.text.secondary
  }), [theme.vars.fontSizeSmaller, theme.vars.fontFamily2, theme.vars.palette.text.secondary]);

  return (
    <Box
      sx={containerBoxStyle}
    >
      <ReasoningToggle isOpen={open} onToggle={handleToggle} />
      <Collapse in={open} timeout="auto" unmountOnExit>
        <Box
          className="reasoning-content"
          sx={reasoningContentStyle}
        >
          <MaybeMarkdown text={content} />
        </Box>
      </Collapse>
    </Box>
  );
};

export const TextRenderer: React.FC<Props> = memo(({ text, showActions = true }) => {
  const theme = useTheme();
  const sections = useMemo(() => parseThinkSections(text), [text]);
  if (!text) {
    return null;
  }
  return (
    <div className="output value noscroll" css={outputStyles(theme, showActions)}>
      {showActions && <Actions copyValue={text} />}
      {sections.map((s) =>
        s.type === "think" ? (
          <ThinkBlock
            key={`${s.type}-${s.start}-${s.end}`}
            content={s.content}
          />
        ) : (
          <MaybeMarkdown
            key={`${s.type}-${s.start}-${s.end}`}
            fillContainer={!showActions}
            text={s.content}
          />
        )
      )}
    </div>
  );
});

TextRenderer.displayName = "TextRenderer";
