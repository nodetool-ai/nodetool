import React, { memo } from "react";
import MarkdownRenderer from "../../../utils/MarkdownRenderer";

// Memoize the style object to prevent recreation on every render
const MARKDOWN_TEXT_STYLE = {
  padding: "0 0.5em",
  whiteSpace: "pre-wrap" as const,
  fontWeight: "300" as const
};

export const isLikelyMarkdown = (text: string): boolean => {
  if (!text) {return false;}
  if (text.length < 6) {return false;}
  const patterns = [
    /(^|\n)\s{0,3}#{1,6}\s+\S/,
    /(^|\n)```/,
    /(^|\n)\s{0,3}[-*+]\s+\S/,
    /(^|\n)\s{0,3}\d+\.\s+\S/,
    /\[[^\]]+\]\([^)]+\)/,
    /!\[[^\]]*\]\([^)]+\)/,
    /(^|\n)\s{0,3}>\s+\S/,
    /(^|\n)\|[^\n]*\|/,
    /`[^`]+`/,
    /(^|\n)\s*([-*_]\s*){3,}\s*(\n|$)/,
    /\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_/
  ];
  return patterns.some((re) => re.test(text));
};

export const MaybeMarkdown: React.FC<{ text: string }> = memo(({ text }) => {
  return isLikelyMarkdown(text) ? (
    <MarkdownRenderer content={text} />
  ) : (
    <div
      className="output no-markdown-text"
      style={MARKDOWN_TEXT_STYLE}
    >
      {text}
    </div>
  );
});

MaybeMarkdown.displayName = "MaybeMarkdown";
