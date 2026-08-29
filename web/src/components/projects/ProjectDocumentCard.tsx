/**
 * One document in a project's overview: what it looks like, how far it has
 * got, and what it has cost. Clicking it opens the document as a tab inside
 * the project's group.
 */

import { memo, useCallback } from "react";

import {
  BORDER_RADIUS,
  Box,
  Caption,
  Card,
  FlexColumn,
  FlexRow,
  Label,
  SPACING,
  StatusPill,
  TYPOGRAPHY
} from "../ui_primitives";
import { TYPE_COLOR, TYPE_GLYPH } from "../workspace/tabTypeIdentity";
import ProjectDocumentPreview from "./ProjectDocumentPreview";
import {
  documentProgress,
  documentStatusLine,
  formatDocumentSpend,
  type ProjectDocument
} from "./projectStatus";

interface ProjectDocumentCardProps {
  document: ProjectDocument;
  onOpen: (document: ProjectDocument) => void;
}

const ProjectDocumentCard = ({
  document,
  onOpen
}: ProjectDocumentCardProps) => {
  const handleOpen = useCallback(() => onOpen(document), [onOpen, document]);
  const progress = documentProgress(document);

  return (
    <Card
      variant="outlined"
      padding="none"
      clickable
      onClick={handleOpen}
      aria-label={document.name}
      sx={{ overflow: "hidden", borderRadius: BORDER_RADIUS.md }}
    >
      <ProjectDocumentPreview document={document} />
      <FlexColumn gap={SPACING.sm} sx={{ p: SPACING.lg }}>
        <FlexRow align="center" gap={SPACING.md}>
          <Box
            component="span"
            aria-hidden
            sx={{ color: TYPE_COLOR[document.type] }}
          >
            {TYPE_GLYPH[document.type]}
          </Box>
          <Label sx={{ flex: 1, minWidth: 0 }}>{document.name}</Label>
          {progress && (
            <StatusPill tone={progress.tone}>{progress.label}</StatusPill>
          )}
        </FlexRow>
        <FlexRow align="baseline" gap={SPACING.md}>
          <Caption color="secondary" sx={{ flex: 1, minWidth: 0 }}>
            {documentStatusLine(document)}
          </Caption>
          <Box
            component="span"
            sx={{ ...TYPOGRAPHY.mono.caption, color: "text.secondary" }}
          >
            {formatDocumentSpend(document)}
          </Box>
        </FlexRow>
      </FlexColumn>
    </Card>
  );
};

export default memo(ProjectDocumentCard);
