/** @jsxImportSource @emotion/react */
/**
 * StandaloneSketchEditor
 *
 * Loads a persisted sketch document by id and mounts the full `SketchEditor`
 * (the same component used in the in-node modal) once the document resolves.
 * Used by both the `/sketch/:documentId` page and the embedded workspace image
 * tab.
 *
 * ## Seed-once contract
 *
 * `useStandaloneSketchDocument` hydrates the global sketch store from the
 * initial document/session state when the id first resolves. React Query
 * background refetches would replace that initial seed and clobber in-progress
 * edits managed by the autosave system, so this component:
 *
 *   1. Disables all background refetches for the load query.
 *   2. Captures the first non-null payload per `documentId` into local state
 *      and feeds *that* stable reference to `SketchEditor`. Subsequent query
 *      data is ignored for the lifetime of the mount, and a new `documentId`
 *      resets the seed.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGlobalCombo } from "../../stores/KeyPressedStore";
import { css } from "@emotion/react";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import {
  EditorMenuItem,
  EmptyState,
  FlexColumn,
  ListItemIcon,
  ListItemText,
  LoadingSpinner
} from "../ui_primitives";
import SketchEditor, { type SketchEditorHandle } from "./SketchEditor";
import SaveToFolderMenu from "../assets/SaveToFolderMenu";
import { trpc } from "../../trpc/client";
import type { SketchDocument } from "./types";
import { useStandaloneSketchDocument } from "../../stores/sketch/SketchSessionStore";
import {
  SketchProvider,
  useSketchSessionStoreApi
} from "../../stores/sketch/SketchInstance";
import {
  useWorkspaceTabsStore,
  tabId
} from "../../stores/WorkspaceTabsStore";
import { useSaveSketchDocument } from "../../hooks/sketch/useSaveSketchDocument";
import { useSaveSketchAsAsset } from "../../hooks/sketch/useSaveSketchAsAsset";

const containerStyles = (theme: Theme) =>
  css({
    width: "100%",
    height: "100%",
    overflow: "hidden",
    backgroundColor: theme.vars.palette.background.default
  });

const centered = { flex: 1, width: "100%", height: "100%" } as const;

interface StandaloneSketchEditorProps {
  documentId: string;
  /** Compact actions rendered inline at the trailing edge of the tool bar. */
  headerActions?: React.ReactNode;
  /**
   * Whether this editor is the focused/visible surface. Drives which instance
   * the singleton sketch hooks resolve to. Defaults to `true` for the
   * standalone page; the workspace tab passes its active flag.
   */
  active?: boolean;
}

const StandaloneSketchEditorBody: React.FC<StandaloneSketchEditorProps> = memo(
  function StandaloneSketchEditorBody({ documentId, headerActions }) {
    const theme = useTheme();
    const styles = useMemo(() => containerStyles(theme), [theme]);
    const editorRef = useRef<SketchEditorHandle | null>(null);
    const { save, saving } = useSaveSketchDocument();
    const { saveAsAsset, saving: savingAsAsset } = useSaveSketchAsAsset();
    const [saveAsAssetAnchor, setSaveAsAssetAnchor] =
      useState<HTMLElement | null>(null);
    // Closes the tool bar's overflow menu once the folder popover is done —
    // the popover is anchored to a menu item, so the menu has to outlive it.
    const closeMenuRef = useRef<(() => void) | null>(null);

    const closeSaveAsAsset = useCallback(() => {
      setSaveAsAssetAnchor(null);
      closeMenuRef.current?.();
      closeMenuRef.current = null;
    }, []);

    const documentQuery = trpc.sketch.get.useQuery(
      { id: documentId },
      {
        enabled: !!documentId,
        // Background refetches would replace `initialDocument` and clobber
        // unsaved edits managed by the autosave system. Disable them here.
        staleTime: Infinity,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false
      }
    );

    // Seed the editor exactly once per documentId. Keyed by id so navigating
    // between documents in the same session correctly re-seeds.
    const [seed, setSeed] = useState<{
      id: string;
      document: SketchDocument;
    } | null>(null);

    const initialEditorState = useStandaloneSketchDocument(
      documentQuery.data,
      !!documentId
    );

    useEffect(() => {
      if (seed?.id === documentId) return;
      if (!initialEditorState) return;
      setSeed({ id: documentId, document: initialEditorState.document });
    }, [documentId, initialEditorState, seed?.id]);

    // Mirror the workspace tab title into the session name. Renaming the tab
    // persists immediately to the server, but the content autosave also writes
    // `session.name`; without this it would later revert the rename.
    const sessionStore = useSketchSessionStoreApi();
    const tabTitle = useWorkspaceTabsStore(
      (state) =>
        state.tabs.find((t) => t.id === tabId("sketch", documentId))?.title
    );
    useEffect(() => {
      if (tabTitle && tabTitle !== sessionStore.getState().name) {
        sessionStore.getState().setName(tabTitle);
      }
    }, [tabTitle, sessionStore]);

    const handleSave = useCallback(() => {
      void save();
    }, [save]);

    // allowInInputs: Cmd/Ctrl+S must save from anywhere in the editor, including
    // its name field — the old capture-phase listener had no focus check.
    useGlobalCombo("control+s", handleSave, { allowInInputs: true });
    useGlobalCombo("meta+s", handleSave, { allowInInputs: true });

    const handleExportPng = () => {
      editorRef.current?.exportPng();
    };

    // Document actions live in the tool bar's overflow menu so the editor
    // chrome stays one slim row. "Save as Asset" opens a folder popover
    // anchored to its own menu item, so it leaves the menu open and closes
    // both once a folder is chosen.
    const documentMenuItems = (close: () => void) => [
      <EditorMenuItem
        key="save"
        onClick={() => {
          close();
          handleSave();
        }}
        disabled={saving}
        data-testid="sketch-save-document"
      >
        <ListItemIcon>
          <SaveOutlinedIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>{saving ? "Saving…" : "Save"}</ListItemText>
      </EditorMenuItem>,
      <EditorMenuItem
        key="save-as-asset"
        onClick={(e) => {
          closeMenuRef.current = close;
          setSaveAsAssetAnchor(e.currentTarget);
        }}
        disabled={savingAsAsset}
        data-testid="sketch-save-as-asset"
      >
        <ListItemIcon>
          <AddPhotoAlternateOutlinedIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>
          {savingAsAsset ? "Saving…" : "Save as Asset"}
        </ListItemText>
      </EditorMenuItem>,
      <EditorMenuItem
        key="export-png"
        onClick={() => {
          close();
          handleExportPng();
        }}
        data-testid="sketch-export-png"
      >
        <ListItemIcon>
          <FileDownloadOutlinedIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Export PNG</ListItemText>
      </EditorMenuItem>
    ];

    // Show the spinner until we've captured a seed for this documentId.
    // Using `seed` (not the live query state) keeps the canvas mounted across
    // any future background query state changes.
    if (!seed || seed.id !== documentId) {
      if (documentQuery.isError) {
        return (
          <FlexColumn align="center" justify="center" sx={centered}>
            <EmptyState
              variant="error"
              title="Sketch document not found"
              description="The image document you requested does not exist or you do not have access to it."
            />
          </FlexColumn>
        );
      }
      return (
        <FlexColumn align="center" justify="center" sx={centered}>
          <LoadingSpinner />
        </FlexColumn>
      );
    }

    return (
      <div className="sketch-editor-page" css={styles}>
        <SketchEditor
          ref={editorRef}
          documentId={documentId}
          initialDocument={seed.document}
          initialEditorState={initialEditorState ?? undefined}
          headerActions={headerActions}
          menuItems={documentMenuItems}
        />
        <SaveToFolderMenu
          anchorEl={saveAsAssetAnchor}
          open={!!saveAsAssetAnchor}
          onClose={closeSaveAsAsset}
          onSelectFolder={(folderId) => void saveAsAsset(folderId)}
        />
      </div>
    );
  }
);

StandaloneSketchEditorBody.displayName = "StandaloneSketchEditorBody";

/**
 * Wraps the editor body in a {@link SketchProvider} so each tab / page gets
 * its own isolated sketch stores (editor, session, canvas refs). The autosave
 * and save hooks run inside the body, under the provider, so they bind to this
 * instance's stores rather than a shared singleton.
 */
const StandaloneSketchEditor: React.FC<StandaloneSketchEditorProps> = ({
  active = true,
  ...bodyProps
}) => (
  <SketchProvider active={active}>
    <StandaloneSketchEditorBody {...bodyProps} />
  </SketchProvider>
);

StandaloneSketchEditor.displayName = "StandaloneSketchEditor";

export default StandaloneSketchEditor;
