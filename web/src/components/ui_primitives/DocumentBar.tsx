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

/** Below this bar width the title gets a row of its own. */
const WRAPPING_BAR_WIDTH = 480;

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

/** The slots a surface fills. The title and rename come from the host. */
export type DocumentBarSlots = Pick<
  DocumentBarProps,
  "status" | "history" | "mode" | "view" | "actions"
>;

/**
 * Draws the bar from an editor's slots. An editor that sits inside a host
 * (a workspace tab, a dialog) takes one, so the host decides the title and
 * the rename while the editor supplies its status, history and actions.
 */
export type DocumentBarRender = (slots: DocumentBarSlots) => React.ReactNode;

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
        // A narrow bar (a phone, a split pane) moves whole slots onto a
        // second row instead of squeezing them until they overlap.
        flexWrap: "wrap",
        rowGap: SPACING.xs,
        py: SPACING.xs,
        containerType: "inline-size",
        // A button label never breaks over two lines inside the row.
        "& .MuiButton-root": { whiteSpace: "nowrap" },
        // Under the compact width the save status keeps its dot and its
        // label stays readable to screen readers only.
        [`@container (max-width: ${COMPACT_BAR_WIDTH}px)`]: {
          "& .document-bar-status .save-state-label": visuallyHidden
        },
        // On a phone the title takes the first row and the slots follow on
        // the next, so a long title never squeezes them. A rule would hang at
        // the end or the start of a wrapped row; the gap alone separates the
        // groups there.
        [`@container (max-width: ${WRAPPING_BAR_WIDTH}px)`]: {
          columnGap: SPACING.sm,
          "& > .document-bar-identity": { flexBasis: "100%" },
          "& > .document-bar-divider": { display: "none" }
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
          <ToolbarDivider className="document-bar-divider" />
          <ToolbarGroup sx={{ flexShrink: 0 }}>{slot}</ToolbarGroup>
        </React.Fragment>
      ))}
      {actions && (
        <ToolbarGroup
          className="document-bar-actions"
          sx={{ gap: SPACING.sm, flexShrink: 0, ml: "auto" }}
        >
          {actions}
        </ToolbarGroup>
      )}
    </Toolbar>
  );
};

export const DocumentBar = memo(DocumentBarInternal);
DocumentBar.displayName = "DocumentBar";
