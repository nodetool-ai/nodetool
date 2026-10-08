import React, { useState } from "react";
import {
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
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

/** What an example replaced, kept until the creator edits the brief. */
interface Replaced {
  previous: string;
  applied: string;
}

/**
 * Full sentences wrap; the current brief is never offered back as an example.
 * An example picked over typed text replaces it at once and offers Undo, so a
 * stray click never costs the creator their own words.
 */
export function ExampleBriefs({
  examples,
  brief,
  onSelect,
  briefRef
}: ExampleBriefsProps) {
  const [replaced, setReplaced] = useState<Replaced | null>(null);
  const choices = [...new Set(examples.map((text) => text.trim()))]
    .filter((text) => text && text !== brief.trim())
    .slice(0, 3);
  // Undo stays only while the brief is still the example it applied. A later
  // edit is the creator's own text, and Undo would throw that away instead.
  const undo = replaced && replaced.applied === brief.trim() ? replaced : null;
  if (choices.length === 0 && !undo) return null;
  const apply = (text: string) => {
    // A second example over the first keeps the creator's own text as the
    // one Undo brings back.
    setReplaced(
      undo
        ? { previous: undo.previous, applied: text }
        : brief.trim().length > 0
          ? { previous: brief, applied: text }
          : null
    );
    onSelect(text);
    briefRef?.current?.focus();
  };
  const restore = () => {
    if (!undo) return;
    setReplaced(null);
    onSelect(undo.previous);
    briefRef?.current?.focus();
  };
  return (
    <FlexColumn role="group" aria-label="Inspiration" gap={GAP.tight}>
      {undo ? (
        <FlexRow gap={GAP.normal} align="center" wrap>
          <Caption role="status">The example replaced your text.</Caption>
          <EditorButton variant="text" size="small" onClick={restore}>
            Undo
          </EditorButton>
        </FlexRow>
      ) : null}
      {choices.length > 0 ? <Caption>Try an example</Caption> : null}
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
