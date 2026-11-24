import type { ReactNode } from "react";

import {
  BORDER_RADIUS,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  PADDING
} from "../../ui_primitives";

interface EmbedCardProps {
  /** The caption under the content, such as the document's name. */
  caption: string;
  /** The label of the button that opens the document in its editor. */
  openLabel: string;
  onOpen: () => void;
  testId: string;
  children: ReactNode;
}

/** The frame an embedded project document sits in: content, caption and an open button. */
export const EmbedCard = ({
  caption,
  openLabel,
  onOpen,
  testId,
  children
}: EmbedCardProps) => (
  <FlexColumn
    component="span"
    gap={GAP.tight}
    data-testid={testId}
    sx={{
      display: "block",
      width: "100%",
      maxWidth: "100%",
      p: PADDING.compact,
      border: 1,
      borderColor: "divider",
      borderRadius: BORDER_RADIUS.md
    }}
  >
    {children}
    <FlexRow component="span" gap={GAP.normal} align="center" justify="space-between">
      <Caption size="small" color="muted" component="span">
        {caption}
      </Caption>
      <EditorButton variant="text" size="small" onClick={onOpen}>
        {openLabel}
      </EditorButton>
    </FlexRow>
  </FlexColumn>
);
