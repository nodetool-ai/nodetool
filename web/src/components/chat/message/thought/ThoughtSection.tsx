/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useMemo } from "react";
import ChatMarkdown from "../ChatMarkdown";
import { ReasoningToggle } from "../../../common/ReasoningToggle";
import { useTheme } from "@mui/material/styles";
import { BORDER_RADIUS, SPACING, TYPOGRAPHY } from "../../../ui_primitives";

interface ThoughtSectionProps {
  thoughtContent: string;
  isExpanded: boolean;
  onToggle: (event?: React.MouseEvent) => void;
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
    marginTop: theme.spacing(SPACING.xs),
    marginBottom: theme.spacing(SPACING.lg),
    padding: theme.spacing(SPACING.lg),
    ...TYPOGRAPHY.mono.code,
    color: theme.vars.palette.text.secondary,
    background: theme.vars.palette.grey[1000],
    borderRadius: BORDER_RADIUS.md,
    ".markdown p": {
      ...TYPOGRAPHY.mono.code,
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
