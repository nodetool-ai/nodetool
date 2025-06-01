/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import ChatMarkdown from "../ChatMarkdown";
import { ThoughtToggle } from "./ThoughtToggle";

interface ThoughtSectionProps {
  thoughtContent: string;
  hasClosingTag: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  textBefore?: string;
  textAfter?: string;
}

export const ThoughtSection: React.FC<ThoughtSectionProps> = ({
  thoughtContent,
  hasClosingTag,
  isExpanded,
  onToggle,
  textBefore,
  textAfter
}) => {
  const thoughtContentStyles = css`
    margin-left: 1em;
    margin-top: 0.5em;
    padding: 0.5em;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
  `;

  return (
    <>
      {textBefore && <ChatMarkdown content={textBefore} />}
      <div className="thought-section-container">
        <ThoughtToggle
          isExpanded={isExpanded}
          hasClosingTag={hasClosingTag}
          onClick={onToggle}
        />
        {isExpanded && (
          <div className="thought-section-content" css={thoughtContentStyles}>
            <ChatMarkdown content={thoughtContent} />
          </div>
        )}
        {textAfter && <ChatMarkdown content={textAfter} />}
      </div>
    </>
  );
};
