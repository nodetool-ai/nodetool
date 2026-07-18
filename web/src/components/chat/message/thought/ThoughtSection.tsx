/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useMemo } from "react";
import ChatMarkdown from "../ChatMarkdown";
import { ReasoningToggle } from "../../../common/ReasoningToggle";
import { useTheme } from "@mui/material/styles";
import { BORDER_RADIUS, FONT_SIZE_MONO } from "../../../ui_primitives";

interface ThoughtSectionProps {
  thoughtContent: string;
  isExpanded: boolean;
  onToggle: () => void;
  textBefore?: string;
  textAfter?: string;
}

export const ThoughtSection: React.FC<ThoughtSectionProps> = React.memo(({
  thoughtContent,
  isExpanded,
  onToggle,
  textBefore,
  textAfter
}) => {
  // Fully controlled: render from the `isExpanded` prop (owned by the parent's
  // expansion store) and report clicks via `onToggle`. A local useState mirror
  // would desync from an external "expand/collapse all" mutation.
  const theme = useTheme();
  const thoughtContentStyles = useMemo(() => css({
    margin: "0 0 1em 00",
    padding: "1em",
    lineHeight: 1.2,
    fontSize: FONT_SIZE_MONO.caption,
    fontFamily: theme.vars.fontFamily2,
    color: theme.vars.palette.text.secondary,
    fontWeight: 400,
    background: theme.vars.palette.grey[1000],
    borderRadius: BORDER_RADIUS.pill,
    ".markdown p": {
      fontFamily: theme.vars.fontFamily2,
      fontSize: FONT_SIZE_MONO.code,
      lineHeight: 1.2,
      fontWeight: 400,
      color: theme.vars.palette.text.secondary
    }
  }), [theme]);

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
});

ThoughtSection.displayName = "ThoughtSection";
