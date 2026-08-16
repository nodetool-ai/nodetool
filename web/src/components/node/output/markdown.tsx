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

/** Plain-text output styling, filling its container when asked to. */
const plainTextStyle = (fillContainer: boolean): React.CSSProperties => {
  const style: React.CSSProperties = { ...MARKDOWN_TEXT_STYLE };
  if (fillContainer) {
    style.height = "100%";
    style.minHeight = 0;
  }
  return style;
};

export const MaybeMarkdown: React.FC<MaybeMarkdownProps> = memo(
  ({ text, fillContainer = false }) => {
    return isLikelyMarkdown(text) ? (
      <MarkdownRenderer content={text} fillContainer={fillContainer} />
    ) : (
      <div
        className="output no-markdown-text"
        style={plainTextStyle(fillContainer)}
      >
        {text}
      </div>
    );
  }
);

MaybeMarkdown.displayName = "MaybeMarkdown";
