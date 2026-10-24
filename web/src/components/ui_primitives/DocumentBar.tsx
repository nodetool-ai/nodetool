/**
 * DocumentBar
 *
 * The first row of every document surface, under the workspace app bar. It
 * has fixed slots, filled in the same order by every document type:
 *
 * | Slot     | Content                                              |
 * |----------|------------------------------------------------------|
 * | Identity | Title (renames inline), then `SaveStatus`            |
 * | History  | Undo, Redo                                           |
 * | Mode     | One `ModeSwitch`                                     |
 * | View     | Layout menu, panel toggles                           |
 * | Actions  | One primary button, then secondary buttons, then ⋮   |
 *
 * A slot the type does not fill renders nothing and takes no width. The
 * surface renders the bar itself, so it sits inside the tab's `inert`
 * boundary when the tab is in the background. Editing tools stay in rows
 * inside the surface. See docs/workspace-document-bar-design.md.
 *
 * @example
 * <DocumentBar
 *   title={name}
 *   onRename={rename}
 *   status={<SaveStatus state="saved" />}
 *   history={<UndoRedoButtons ... />}
 *   mode={<ModeSwitch ... />}
 *   actions={<EditorButton variant="contained">Export</EditorButton>}
 * />
 */

import React, { memo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Box } from "./Box";
import { InlineEditableText } from "./InlineEditableText";
import { Toolbar, ToolbarDivider, ToolbarGroup } from "./Toolbar";
import { SPACING } from "./spacing";
import { TYPOGRAPHY } from "./tokens";

/** Bar height, px: the `normal` toolbar density. */
export const DOCUMENT_BAR_HEIGHT = 40;

const visuallyHidden = {
  position: "absolute",
  width: "1px",
  height: "1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap"
} as const;

/** Below this bar width the save status keeps only its dot. */
const COMPACT_BAR_WIDTH = 640;

export interface DocumentBarProps {
  /** The document name. */
  title: string;
  /** Renames the document. Omit for a name that cannot change. */
  onRename?: (name: string) => void;
  /** Usually a `SaveStatus`. */
  status?: React.ReactNode;
  /** Undo and Redo. */
  history?: React.ReactNode;
  /** One `ModeSwitch`. */
  mode?: React.ReactNode;
  /** Layout menu and panel toggles. */
  view?: React.ReactNode;
  /** At most one filled button, then secondary buttons, then the ⋮ menu. */
  actions?: React.ReactNode;
  className?: string;
}

const DocumentBarInternal: React.FC<DocumentBarProps> = ({
  title,
  onRename,
  status,
  history,
  mode,
  view,
  actions,
  className
}) => {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(false);
  const tools = [history, mode, view].filter(Boolean);

  return (
    <Toolbar
      className={`document-bar${className ? ` ${className}` : ""}`}
      role="toolbar"
      aria-label={t("i18n-next103.documentBar.label", { title })}
      sx={{
        flexShrink: 0,
        gap: SPACING.md,
        containerType: "inline-size",
        // Under the compact width the save status keeps its dot and its
        // label stays readable to screen readers only.
        [`@container (max-width: ${COMPACT_BAR_WIDTH}px)`]: {
          "& .document-bar-status .save-state-label": visuallyHidden
        }
      }}
    >
      <Box
        className="document-bar-identity"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: SPACING.md,
          minWidth: 0,
          flex: "0 1 auto"
        }}
      >
        <InlineEditableText
          value={title}
          editing={renaming}
          onEditingChange={(next) => setRenaming(next && Boolean(onRename))}
          onCommit={(next) => onRename?.(next)}
          ariaLabel={t("i18n-next103.documentBar.rename")}
          title={onRename ? t("i18n-next103.documentBar.renameHint") : undefined}
          displayClassName="document-bar-title"
          displaySx={{
            ...TYPOGRAPHY.sans.body,
            fontWeight: 500,
            color: "text.primary",
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
          sx={{ ...TYPOGRAPHY.sans.body, fontWeight: 500, width: "100%" }}
        />
        {status && <Box className="document-bar-status">{status}</Box>}
      </Box>
      {tools.map((slot, index) => (
        <React.Fragment key={index}>
          <ToolbarDivider />
          <ToolbarGroup>{slot}</ToolbarGroup>
        </React.Fragment>
      ))}
      <Box sx={{ flex: 1, minWidth: 0 }} />
      {actions && (
        <ToolbarGroup className="document-bar-actions" sx={{ gap: SPACING.sm }}>
          {actions}
        </ToolbarGroup>
      )}
    </Toolbar>
  );
};

export const DocumentBar = memo(DocumentBarInternal);
DocumentBar.displayName = "DocumentBar";
