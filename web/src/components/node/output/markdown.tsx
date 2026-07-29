import React, { memo } from "react";
import MarkdownRenderer from "../../../utils/MarkdownRenderer";
import { isLikelyMarkdown } from "./markdown.helpers";

const MARKDOWN_TEXT_STYLE = {
  padding: "0 0.5em",
  whiteSpace: "pre-wrap" as const,
  fontWeight: 400 as const
};

type MaybeMarkdownProps = {
  text: string;
  fillContainer?: boolean;
};

export const MaybeMarkdown: React.FC<MaybeMarkdownProps> = memo(
  ({ text, fillContainer = false }) => {
  return isLikelyMarkdown(text) ? (
    <MarkdownRenderer content={text} fillContainer={fillContainer} />
  ) : (
    <div
      className="output no-markdown-text"
      style={{
        ...MARKDOWN_TEXT_STYLE,
        ...(fillContainer ? { height: "100%", minHeight: 0 } : {})
      }}
    >
      {text}
    </div>
  );
  }
);

MaybeMarkdown.displayName = "MaybeMarkdown";
