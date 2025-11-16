/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import ChatMarkdown from "../ChatMarkdown";
import { ReasoningToggle } from "../../../common/ReasoningToggle";
import { useTheme } from "@mui/material/styles";

interface ThoughtSectionProps {
  thoughtContent: string;
  isExpanded: boolean;
  onToggle: () => void;
  textBefore?: string;
  textAfter?: string;
}

export const ThoughtSection: React.FC<ThoughtSectionProps> = ({
  thoughtContent,
  isExpanded,
  onToggle,
  textBefore,
  textAfter
}) => {
  const theme = useTheme();
  const thoughtContentStyles = css({
    margin: "0 0 1em 00",
    padding: "1em",
    lineHeight: 1.2,
    fontSize: theme.vars.fontSizeSmaller,
    fontFamily: theme.vars.fontFamily2,
    color: theme.vars.palette.text.secondary,
    fontWeight: "300",
    background: theme.vars.palette.grey[1000],
    borderRadius: "1em",
    ".markdown p": {
      fontFamily: theme.vars.fontFamily2,
      fontSize: theme.vars.fontSizeSmall,
      lineHeight: 1.2,
      fontWeight: "300",
      color: theme.vars.palette.text.secondary
    }
  });

  return (
    <>
      {textBefore && <ChatMarkdown content={textBefore} />}
      <div className="thought-section-container">
        <ReasoningToggle
          isOpen={isExpanded}
          onToggle={onToggle}
          showLabel="Show thought"
          hideLabel="Hide thought"
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
