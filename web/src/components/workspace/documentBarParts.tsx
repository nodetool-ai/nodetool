/**
 * Shared pieces of the workspace document bars: the frame that puts a bar
 * over a surface, the primary Save button, the ⋮ menu, the save status of an
 * editor with an explicit Save, and the Undo/Redo state of a Monaco editor.
 */

import React, { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import SaveIcon from "@mui/icons-material/Save";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import type * as monaco from "monaco-editor";

import type { WorkspaceTab } from "../../stores/WorkspaceTabsStore";
import {
  Box,
  EditorButton,
  EditorMenu,
  FlexColumn,
  ToolbarIconButton
} from "../ui_primitives";
import type {
  DocumentBarRender,
  DocumentBarSlots,
  SaveStatusValue
} from "../ui_primitives";
import WorkspaceDocumentBar from "./WorkspaceDocumentBar";

/** The bar of one workspace tab, drawn from an editor's slots. */
export const workspaceDocumentBar =
  (tab: WorkspaceTab): DocumentBarRender =>
  (slots) => <WorkspaceDocumentBar tab={tab} {...slots} />;

/**
 * The bar of a surface whose editor sits deeper in its layout than the top
 * row, such as a script between its cast and assistant docks. The surface
 * puts `host` first; the editor draws the bar into it through `render`.
 * `view` (the surface's panel toggles) fills the View slot.
 */
export const useDocumentBarHost = (tab: WorkspaceTab, view?: React.ReactNode) => {
  const [hostElement, setHostElement] = useState<HTMLDivElement | null>(null);
  const render = useCallback<DocumentBarRender>(
    (slots) =>
      hostElement
        ? createPortal(
            <WorkspaceDocumentBar tab={tab} {...slots} view={view ?? slots.view} />,
            hostElement
          )
        : null,
    [hostElement, tab, view]
  );
  const host = <Box ref={setHostElement} sx={{ flexShrink: 0 }} />;
  return { host, render };
};

interface WithDocumentBarProps extends DocumentBarSlots {
  /** The workspace tab. Without one (outside the workspace) there is no bar. */
  tab?: WorkspaceTab;
  children: React.ReactNode;
}

/**
 * A surface state with the tab's document bar on top: the viewer, the
 * loading and error states. The body fills the rest of the tab.
 */
export const WithDocumentBar = ({
  tab,
  children,
  ...slots
}: WithDocumentBarProps) =>
  !tab ? (
    <>{children}</>
  ) : (
    <>
      <WorkspaceDocumentBar tab={tab} {...slots} />
      <FlexColumn sx={{ flex: 1, minHeight: 0, position: "relative" }}>
        {children}
      </FlexColumn>
    </>
  );

/** The save readout of an editor that saves on request. */
export const explicitSaveStatus = ({
  saving,
  dirty,
  failed
}: {
  saving: boolean;
  dirty: boolean;
  /** The last save failed. */
  failed: boolean;
}): SaveStatusValue => {
  if (saving) return "saving";
  if (dirty && failed) return "error";
  return dirty ? "dirty" : "saved";
};

interface DocumentSaveButtonProps {
  onSave: () => void;
  saving: boolean;
  /** Off when there is nothing to save. */
  disabled?: boolean;
  /** Defaults to "Save". */
  label?: string;
}

/** The primary action of an editor that writes back on request. */
export const DocumentSaveButton = ({
  onSave,
  saving,
  disabled = false,
  label
}: DocumentSaveButtonProps) => {
  const { t } = useTranslation();
  return (
    <EditorButton
      variant="contained"
      density="normal"
      startIcon={<SaveIcon />}
      disabled={disabled}
      loading={saving}
      onClick={onSave}
    >
      {saving
        ? t("i18n-next51.common.saving")
        : (label ?? t("i18n-next51.common.save"))}
    </EditorButton>
  );
};

interface DocumentMoreMenuProps {
  /**
   * The menu entries. Receives the close callback. Returns an array: a menu
   * takes no Fragment children.
   */
  items: (close: () => void) => React.ReactNode[];
}

/** The ⋮ menu at the end of the Actions slot. */
export const DocumentMoreMenu = ({ items }: DocumentMoreMenuProps) => {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  return (
    <>
      <ToolbarIconButton
        icon={<MoreVertIcon />}
        tooltip={t("i18n-next103.documentBar.moreActions")}
        onClick={(event) => setAnchor(event.currentTarget)}
        aria-haspopup="menu"
        aria-expanded={!!anchor}
      />
      <EditorMenu anchorEl={anchor} open={!!anchor} onClose={close}>
        {items(close)}
      </EditorMenu>
    </>
  );
};

/** Undo and Redo of a Monaco editor, for the History slot. */
export const useMonacoHistory = () => {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateHistoryState = useCallback(() => {
    const model = editorRef.current?.getModel();
    const alternativeVersionId = model?.getAlternativeVersionId() ?? 1;
    const versionId = model?.getVersionId() ?? 1;
    setCanUndo(alternativeVersionId < versionId);
    setCanRedo(alternativeVersionId > versionId);
  }, []);

  const onEditorMount = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor) => {
      editorRef.current = editor;
      updateHistoryState();
      editor.onDidChangeModelContent(updateHistoryState);
    },
    [updateHistoryState]
  );

  const undo = useCallback(() => {
    editorRef.current?.trigger("toolbar", "undo", null);
    updateHistoryState();
  }, [updateHistoryState]);

  const redo = useCallback(() => {
    editorRef.current?.trigger("toolbar", "redo", null);
    updateHistoryState();
  }, [updateHistoryState]);

  return { editorRef, onEditorMount, canUndo, canRedo, undo, redo };
};
