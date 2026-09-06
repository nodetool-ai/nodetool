import React from "react";
import {
  Caption,
  EditorButton,
  FlexColumn,
  GAP,
  SPACING,
  TYPOGRAPHY
} from "../ui_primitives";

export interface ExampleBriefsProps {
  examples: readonly string[];
  brief: string;
  onSelect: (brief: string) => void;
  /**
   * The brief field. Picking an example fills it and removes the button that
   * was clicked from the list, so without this the focus lands back on the
   * document instead of the text that just changed.
   */
  briefRef?: React.RefObject<HTMLElement | null>;
}

/** Full sentences wrap; the current brief is never offered back as an example. */
export function ExampleBriefs({
  examples,
  brief,
  onSelect,
  briefRef
}: ExampleBriefsProps) {
  const choices = [...new Set(examples.map((text) => text.trim()))]
    .filter((text) => text && text !== brief.trim())
    .slice(0, 3);
  if (choices.length === 0) return null;
  const apply = (text: string) => {
    onSelect(text);
    briefRef?.current?.focus();
  };
  return (
    <FlexColumn role="group" aria-label="Inspiration" gap={GAP.tight}>
      <Caption>Try an example</Caption>
      {choices.map((text) => (
        <EditorButton
          key={text}
          variant="text"
          onClick={() => apply(text)}
          sx={{
            ...TYPOGRAPHY.sans.body,
            height: "auto",
            paddingY: SPACING.sm,
            justifyContent: "flex-start",
            textAlign: "left",
            whiteSpace: "normal",
            overflowWrap: "anywhere",
            maxWidth: "100%"
          }}
        >
          {text}
        </EditorButton>
      ))}
    </FlexColumn>
  );
}
