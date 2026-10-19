/**
 * One document in a project's overview: what it looks like, how far it has
 * got, and what it has cost. Clicking it opens the document as a tab inside
 * the project's group.
 */

import { memo, useCallback, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  BORDER_RADIUS,
  Box,
  Caption,
  Card,
  ContextMenu,
  FlexColumn,
  FlexRow,
  InlineEditableText,
  Label,
  MenuItemPrimitive,
  SPACING,
  StatusPill,
  TYPOGRAPHY
} from "../ui_primitives";
import { TYPE_COLOR, TYPE_GLYPH } from "../workspace/tabTypeIdentity";
import { tabCanRename } from "../workspace/tabRename";
import ProjectDocumentPreview from "./ProjectDocumentPreview";
import CopyProjectDocumentAction, {
  isCopyableDocument
} from "./CopyProjectDocumentAction";
import {
  documentEditedLine,
  documentProgress,
  documentStatusLine,
  formatDocumentSpend,
  type ProjectDocument
} from "./projectStatus";
import { relativeTime } from "../../utils/formatDateAndTime";

interface ProjectDocumentCardProps {
  document: ProjectDocument;
  sourceProjectId: string;
  onOpen: (document: ProjectDocument) => void;
  /** Saves a new name. Without it, or for a kind with no rename, the card has no menu. */
  onRename?: (document: ProjectDocument, name: string) => void;
  compact?: boolean;
}

const nameSx = {
  flex: 1,
  minWidth: 0,
  mb: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
} as const;

const ProjectDocumentCard = ({
  document,
  sourceProjectId,
  onOpen,
  onRename,
  compact = false
}: ProjectDocumentCardProps) => {
  const { t } = useTranslation();
  const handleOpen = useCallback(() => onOpen(document), [onOpen, document]);
  const progress = documentProgress(document);
  const editedLine = documentEditedLine(document);
  // A compact card's second row falls below the fold on a short screen, so
  // its edit time sits on the title row instead.
  const metaLine = [documentStatusLine(document), compact ? "" : editedLine]
    .filter(Boolean)
    .join(" · ");
  const canRename = Boolean(onRename) && tabCanRename(document.type);
  const [menuPosition, setMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [editing, setEditing] = useState(false);

  const handleContextMenu = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!canRename || editing) {
        return;
      }
      event.preventDefault();
      // Shift+F10 and the context-menu key report no pointer position.
      if (event.clientX === 0 && event.clientY === 0) {
        const rect = event.currentTarget.getBoundingClientRect();
        setMenuPosition({ x: rect.left, y: rect.bottom });
        return;
      }
      setMenuPosition({ x: event.clientX, y: event.clientY });
    },
    [canRename, editing]
  );
  const handleCloseMenu = useCallback(() => setMenuPosition(null), []);
  const handleBeginRename = useCallback(() => {
    setMenuPosition(null);
    setEditing(true);
  }, []);
  const handleCommitRename = useCallback(
    (name: string) => onRename?.(document, name),
    [document, onRename]
  );

  return (
    <>
      <Card
        variant="outlined"
        padding="none"
        clickable={!editing}
        onClick={handleOpen}
        onContextMenu={handleContextMenu}
        aria-label={editing ? undefined : document.name}
        sx={{
          overflow: "hidden",
          minWidth: 0,
          borderRadius: BORDER_RADIUS.md,
          ...(compact && {
            "& > :first-child": { height: "auto", aspectRatio: "3 / 1" }
          })
        }}
      >
        <ProjectDocumentPreview document={document} />
        <FlexColumn
          gap={SPACING.sm}
          sx={{ p: compact ? SPACING.md : SPACING.lg }}
        >
          <FlexRow align="center" gap={SPACING.md} sx={{ minWidth: 0 }}>
            <Box
              component="span"
              aria-hidden
              sx={{ color: TYPE_COLOR[document.type] }}
            >
              {TYPE_GLYPH[document.type]}
            </Box>
            {editing ? (
              <InlineEditableText
                ariaLabel={t("pass3_33.projects.documentCard.nameLabel")}
                value={document.name}
                editing
                onEditingChange={setEditing}
                onCommit={handleCommitRename}
                sx={{ ...TYPOGRAPHY.sans.label, flex: 1 }}
              />
            ) : (
              <Label title={document.name} sx={nameSx}>
                {document.name}
              </Label>
            )}
            {progress && !compact && (
              <StatusPill
                tone={progress.tone}
                accent={TYPE_COLOR[document.type]}
                sx={{ borderRadius: BORDER_RADIUS.xs }}
              >
                {progress.label}
              </StatusPill>
            )}
            {compact && editedLine && (
              <Caption
                color="secondary"
                title={editedLine}
                sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
              >
                {relativeTime(document.updatedAt)}
              </Caption>
            )}
          </FlexRow>
          {(metaLine || !compact) && (
            <FlexRow align="baseline" gap={SPACING.md}>
              <Caption
                color="secondary"
                sx={{
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }}
              >
                {metaLine}
              </Caption>
              {!compact && (
                <Box
                  component="span"
                  sx={{ ...TYPOGRAPHY.mono.caption, color: "text.secondary" }}
                >
                  {formatDocumentSpend(document)}
                </Box>
              )}
            </FlexRow>
          )}
          {!compact && isCopyableDocument(document) && (
            <CopyProjectDocumentAction
              document={document}
              sourceProjectId={sourceProjectId}
            />
          )}
        </FlexColumn>
      </Card>
      {canRename && (
        <ContextMenu
          open={menuPosition !== null}
          position={menuPosition}
          onClose={handleCloseMenu}
        >
          <MenuItemPrimitive
            label={t("pass3_33.projects.documentCard.rename")}
            onClick={handleBeginRename}
          />
        </ContextMenu>
      )}
    </>
  );
};

export default memo(ProjectDocumentCard);
