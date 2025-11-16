import React from "react";
import MarkdownRenderer from "../../../utils/MarkdownRenderer";

export const isLikelyMarkdown = (text: string): boolean => {
  if (!text) return false;
  if (text.length < 6) return false;
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

export const MaybeMarkdown: React.FC<{ text: string }> = ({ text }) =>
  isLikelyMarkdown(text) ? (
    <MarkdownRenderer content={text} />
  ) : (
    <div
      className="output no-markdown-text"
      style={{ padding: "0 0.5em", whiteSpace: "pre-wrap", fontWeight: "300" }}
    >
      {text}
    </div>
  );
