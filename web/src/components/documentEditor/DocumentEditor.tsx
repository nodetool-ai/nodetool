/** @jsxImportSource @emotion/react */
/**
 * The document editor (document editor PRD): a formatted page over a
 * Markdown file. Typing formats as in a word processor, the toolbar and
 * shortcuts cover the rest, and the Markdown view edits the same file as
 * text. Edits autosave; blocks nobody touched keep their exact bytes.
 *
 * Operates in two workspace modes (R31):
 * - Default Mode (two panels): editable document + full-height docked assistant.
 * - Snapshots Mode (three panels): editable document + read-only center snapshot
 *   viewer + right column split vertically between Snapshot List and assistant.
 *
 * Staged assistant proposals appear for review/edit/accept/reject by default
 * (D2, R8, R9), while direct-apply mode marks changed blocks with per-block
 * revert. Selecting text keeps its highlight on blur (R7) and opens a selection
 * prompt (R10). Display zoom and paper theme are view-only (R30), and Save As
 * writes to a chosen folder and format (R18).
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@mui/material/styles";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { TablePlugin } from "@lexical/react/LexicalTablePlugin";
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { $isLinkNode } from "@lexical/link";
import { mergeRegister } from "@lexical/utils";
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_LOW,
  REDO_COMMAND,
  UNDO_COMMAND,
  type BaseSelection
} from "lexical";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import CodeOutlinedIcon from "@mui/icons-material/CodeOutlined";
import { useMediaQuery } from "@mui/material";

import type { Asset } from "../../stores/ApiTypes";
import { useDocumentProposalStore } from "../../stores/DocumentProposalStore";
import { useGlobalCombo } from "../../stores/KeyPressedStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useDocumentConflicts } from "../../hooks/useDocumentConflicts";
import { useProjectFolder } from "../../hooks/useProjectFolder";
import { useRenameDocument } from "../../hooks/useRenameDocument";
import {
  useMarkdownDocumentSync,
  type MarkdownSaveStatus
} from "../../hooks/document/useMarkdownDocumentSync";
import { useTextDocumentExport } from "../../serverState/useTextDocumentTransfer";
import {
  saveAutosaveVersion,
  savePreTurnVersion,
  textDocumentVersionsKey,
  useTextDocumentVersionContent,
  useTextDocumentVersions
} from "../../serverState/useTextDocumentVersions";
import { notifyMutationError } from "../../utils/notifyMutationError";
import ErrorBanner from "../support/ErrorBanner";
import MonacoPane from "../workspace/MonacoPane";
import { CodeHighlightPlugin } from "../textEditor/CodeHighlightPlugin";
import { AutoLinkPlugin } from "../textEditor/AutoLinkPlugin";
import { HorizontalRulePlugin } from "../textEditor/HorizontalRulePlugin";
import {
  ConflictBanner,
  DocumentBar,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  LoadingSpinner,
  ModeSwitch,
  ResizableDock,
  ResizeHandle,
  SaveStatus,
  ToolbarDivider,
  UndoRedoButtons,
  cn,
  type DocumentBarRender,
  type SaveStatusValue
} from "../ui_primitives";
import { newDocumentId } from "../../lib/newDocumentId";
import { DocumentLocationProvider } from "./documentEditorContext";
import { DOCUMENT_TRANSFORMERS } from "./documentTransformers";
import { DOCUMENT_THEME, documentEditorStyles } from "./documentEditorStyles";
import { DOCUMENT_NODES, MarkdownDocumentBinding } from "./markdownBlockCodec";
import { insertEmbeds, setLink } from "./documentCommands";
import DocumentToolbar from "./DocumentToolbar";
import DocumentTitleHeader from "./DocumentTitleHeader";
import DocumentDisplayControls, {
  documentPaperThemeClass,
  useDocumentDisplayPreferences
} from "./DocumentDisplayControls";
import DocumentSaveAsDialog from "./DocumentSaveAsDialog";
import DocumentPersistentSelectionPlugin from "./DocumentPersistentSelectionPlugin";
import DocumentProposalPanel, {
  reconcileProposalWithCurrent
} from "./DocumentProposalPanel";
import DocumentSnapshotViewer from "./DocumentSnapshotViewer";
import DocumentSnapshotsList from "./DocumentSnapshotsList";
import DocumentInsertPopover, {
  type DocumentInsertKind,
  type DocumentInsertRequest
} from "./DocumentInsertPopover";
import { DocumentShortcutsPlugin } from "./DocumentShortcutsPlugin";
import {
  DocumentChangeMarksPlugin,
  DocumentChangesBar
} from "./DocumentChangeMarks";
import { DocumentSelectionAssistPlugin } from "./DocumentSelectionAssistPlugin";
import DocumentAgentPanel from "./DocumentAgentPanel";
import DocumentEmbedDialog from "./DocumentEmbedDialog";
import { DocumentEmbedDropPlugin } from "./DocumentEmbedDropPlugin";
import type { DocumentEmbedInsert } from "./documentEmbeds";

type DocumentView = "formatted" | "markdown";

/** How long the Markdown view waits after a keystroke before applying it. */
const SOURCE_APPLY_DELAY_MS = 400;

/** How often an edited document records an interval version (R11). */
const AUTOSAVE_VERSION_INTERVAL_MS = 10 * 60 * 1000;

const SIDE_PANEL_WIDTH = 360;

const SNAPSHOT_SPLIT_STORAGE_KEY = "nodetool.documentSnapshotsSplitHeight";
const SNAPSHOT_SPLIT_DEFAULT = 260;
const SNAPSHOT_SPLIT_MIN = 140;
const SNAPSHOT_SPLIT_MAX = 560;

const SAVE_STATUS: Record<MarkdownSaveStatus, SaveStatusValue> = {
  saved: "saved",
  reloaded: "saved",
  unsaved: "dirty",
  saving: "saving",
  error: "error"
};

function clampSnapshotSplit(value: number): number {
  return Math.min(SNAPSHOT_SPLIT_MAX, Math.max(SNAPSHOT_SPLIT_MIN, value));
}

function readStoredSnapshotSplit(): number {
  if (typeof window === "undefined") {
    return SNAPSHOT_SPLIT_DEFAULT;
  }
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_SPLIT_STORAGE_KEY);
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed)
      ? clampSnapshotSplit(parsed)
      : SNAPSHOT_SPLIT_DEFAULT;
  } catch {
    return SNAPSHOT_SPLIT_DEFAULT;
  }
}

function writeStoredSnapshotSplit(height: number): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      SNAPSHOT_SPLIT_STORAGE_KEY,
      String(Math.round(height))
    );
  } catch {
    // Ignore storage quota or private browsing errors.
  }
}

function parentDirectoryOfPath(path: string | null | undefined): string {
  if (!path) {
    return "";
  }
  const trimmed = path.trim().replace(/^\/+|\/+$/g, "");
  const slash = trimmed.lastIndexOf("/");
  return slash > 0 ? trimmed.slice(0, slash) : "";
}

interface DocumentEditorProps {
  asset: Asset;
  /** Draws the document bar. Defaults to a bar titled with the asset name. */
  documentBar?: DocumentBarRender;
}

/** Undo and Redo state of the formatted view. */
function useLexicalHistoryState() {
  const [editor] = useLexicalComposerContext();
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          CAN_UNDO_COMMAND,
          (value) => {
            setCanUndo(value);
            return false;
          },
          COMMAND_PRIORITY_LOW
        ),
        editor.registerCommand(
          CAN_REDO_COMMAND,
          (value) => {
            setCanRedo(value);
            return false;
          },
          COMMAND_PRIORITY_LOW
        )
      ),
    [editor]
  );
  return {
    canUndo,
    canRedo,
    undo: () => editor.dispatchCommand(UNDO_COMMAND, undefined),
    redo: () => editor.dispatchCommand(REDO_COMMAND, undefined)
  };
}

/** Where the insert form opens: under the selection, else the page top. */
function selectionAnchor(fallback: HTMLElement | null): {
  top: number;
  left: number;
} {
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) {
      return { top: rect.bottom, left: rect.left };
    }
  }
  const rect = fallback?.getBoundingClientRect();
  return { top: rect?.top ?? 0, left: rect?.left ?? 0 };
}

const DocumentEditorBody = ({ asset, documentBar }: DocumentEditorProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editor] = useLexicalComposerContext();
  // The composer remounts per document, so one binding holds its blocks.
  const [binding] = useState(() => new MarkdownDocumentBinding(newDocumentId));
  const sync = useMarkdownDocumentSync(asset.id, editor, binding);
  const {
    loadState,
    status,
    asset: syncedAsset,
    applySource,
    getSource,
    flush,
    changes,
    revertChange,
    dismissChanges,
    expectOwnWrite,
    cancelOwnWrite
  } = sync;
  const currentAsset =
    syncedAsset &&
    (!asset.updated_at ||
      (syncedAsset.updated_at != null &&
        syncedAsset.updated_at > asset.updated_at))
      ? syncedAsset
      : asset;

  const history = useLexicalHistoryState();
  const conflicts = useDocumentConflicts("document", asset.id);
  const display = useDocumentDisplayPreferences();
  const renameDocument = useRenameDocument();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const { folder } = useProjectFolder(currentAsset.project_id ?? "");
  const workspaceId = currentAsset.project_id
    ? (folder?.workspace_id ?? null)
    : null;

  const proposal = useDocumentProposalStore(
    (state) => state.proposals[asset.id]
  );
  const queuedProposal = useDocumentProposalStore(
    (state) => state.queuedProposals[asset.id]
  );
  const updateDraft = useDocumentProposalStore((state) => state.updateDraft);
  const acceptQueuedProposal = useDocumentProposalStore(
    (state) => state.acceptQueuedProposal
  );
  const dismissQueuedProposal = useDocumentProposalStore(
    (state) => state.dismissQueuedProposal
  );
  const clearProposal = useDocumentProposalStore(
    (state) => state.clearProposal
  );

  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const savingSnapshotRef = useRef(false);
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down("sm"));

  const [snapshotsMode, setSnapshotsMode] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<number | null>(null);
  const [snapshotSplitHeight, setSnapshotSplitHeight] = useState<number>(
    readStoredSnapshotSplit
  );
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [applyingProposal, setApplyingProposal] = useState(false);

  const versions = useTextDocumentVersions(
    asset.id,
    snapshotsMode && !narrow && loadState === "ready"
  );
  const sortedVersions = useMemo(
    () => [...versions.versions].sort((a, b) => b.version - a.version),
    [versions.versions]
  );

  useEffect(() => {
    if (!snapshotsMode || versions.isLoading) {
      return;
    }
    if (sortedVersions.length === 0) {
      if (selectedSnapshot !== null) {
        setSelectedSnapshot(null);
      }
      return;
    }
    const exists =
      selectedSnapshot !== null &&
      sortedVersions.some((item) => item.version === selectedSnapshot);
    if (!exists) {
      setSelectedSnapshot(sortedVersions[0].version);
    }
  }, [selectedSnapshot, snapshotsMode, sortedVersions, versions.isLoading]);

  const activeSnapshot = useMemo(
    () =>
      selectedSnapshot === null
        ? null
        : (sortedVersions.find((item) => item.version === selectedSnapshot) ??
          null),
    [selectedSnapshot, sortedVersions]
  );
  const snapshotContent = useTextDocumentVersionContent(
    asset.id,
    snapshotsMode && !narrow ? (activeSnapshot?.version ?? null) : null
  );

  const handleSnapshotSplitResize = useCallback((delta: number) => {
    setSnapshotSplitHeight((current) => {
      const next = clampSnapshotSplit(current + delta);
      writeStoredSnapshotSplit(next);
      return next;
    });
  }, []);

  // The last selected text survives a click into the assistant's composer.
  const selectedText = useRef("");
  const [, bumpLiveContent] = useState(0);
  const hasProposalRef = useRef(false);
  hasProposalRef.current = Boolean(proposal);
  useEffect(
    () =>
      editor.registerUpdateListener(
        ({ editorState, dirtyElements, dirtyLeaves }) => {
          editorState.read(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
              selectedText.current = selection.isCollapsed()
                ? ""
                : selection.getTextContent();
            }
          });
          if (
            hasProposalRef.current &&
            (dirtyElements.size > 0 || dirtyLeaves.size > 0)
          ) {
            bumpLiveContent((rev) => rev + 1);
          }
        }
      ),
    [editor]
  );
  const getSelectedText = useCallback(() => selectedText.current, []);

  // An interval version while the user edits (R11). The server skips one
  // whose content equals the newest version.
  const editedSinceVersion = useRef(false);
  if (status === "unsaved" || status === "saving") {
    editedSinceVersion.current = true;
  }
  useEffect(() => {
    const timer = setInterval(() => {
      if (!editedSinceVersion.current) {
        return;
      }
      editedSinceVersion.current = false;
      void flush()
        .then(() => saveAutosaveVersion(asset.id))
        .catch((error: unknown) =>
          console.error("Failed to save an interval version", error)
        );
    }, AUTOSAVE_VERSION_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [asset.id, flush]);

  const textOfBlock = useCallback(
    (blockId: string) =>
      binding
        .serialize(editor.getEditorState())
        .blocks.find((block) => block.id === blockId)?.text ?? null,
    [binding, editor]
  );
  const onMarkedBlocksEdited = useCallback(
    (blockIds: string[]) => dismissChanges(blockIds),
    [dismissChanges]
  );

  // A new document opens empty: put the caret in it.
  useEffect(() => {
    if (loadState !== "ready") {
      return;
    }
    const empty = editor
      .getEditorState()
      .read(() => $getRoot().getTextContent() === "");
    if (empty) {
      editor.focus();
    }
  }, [loadState, editor]);

  const [view, setView] = useState<DocumentView>("formatted");
  const [source, setSource] = useState("");
  const pendingSource = useRef<string | null>(null);
  const applyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushSource = useCallback(() => {
    if (applyTimer.current) {
      clearTimeout(applyTimer.current);
      applyTimer.current = null;
    }
    if (pendingSource.current !== null) {
      applySource(pendingSource.current);
      pendingSource.current = null;
    }
  }, [applySource]);

  useEffect(() => flushSource, [flushSource]);

  const flushDraft = useCallback(async () => {
    flushSource();
    await flush();
  }, [flush, flushSource]);

  const { exportDocument, exporting } = useTextDocumentExport(
    asset.id,
    flushDraft
  );

  const handleRename = useCallback(
    (nextName: string) => {
      void renameDocument(
        {
          type: "text",
          ref: asset.id,
          currentName: currentAsset.name ?? ""
        },
        nextName
      );
    },
    [asset.id, currentAsset.name, renameDocument]
  );

  const handleTakeSnapshot = useCallback(async () => {
    if (
      loadState !== "ready" ||
      savingSnapshotRef.current ||
      savingSnapshot ||
      versions.isSaving
    ) {
      return;
    }
    savingSnapshotRef.current = true;
    setSavingSnapshot(true);
    try {
      await flushDraft();
      await versions.saveVersion();
      addNotification({
        type: "success",
        content: t("documentEditor.bar.snapshotSaved", "Snapshot saved")
      });
    } catch (cause) {
      notifyMutationError(t("documentEditor.bar.snapshot", "Snapshot"), cause);
    } finally {
      savingSnapshotRef.current = false;
      setSavingSnapshot(false);
    }
  }, [addNotification, flushDraft, loadState, savingSnapshot, t, versions]);

  const triggerSnapshotShortcut = useCallback(() => {
    void handleTakeSnapshot();
  }, [handleTakeSnapshot]);
  const getWorkspaceTarget = useCallback(() => workspaceRef.current, []);
  const snapshotShortcutOptions = useMemo(
    () => ({
      active: loadState === "ready" && !saveAsOpen,
      allowInInputs: true,
      target: getWorkspaceTarget
    }),
    [getWorkspaceTarget, loadState, saveAsOpen]
  );
  useGlobalCombo("meta+s", triggerSnapshotShortcut, snapshotShortcutOptions);
  useGlobalCombo("control+s", triggerSnapshotShortcut, snapshotShortcutOptions);

  const handleRestoreSnapshot = useCallback(
    async (version: number) => {
      await flushDraft();
      expectOwnWrite();
      try {
        await versions.restoreVersion(version);
      } catch (error) {
        cancelOwnWrite();
        throw error;
      }
    },
    [cancelOwnWrite, expectOwnWrite, flushDraft, versions]
  );

  const handleDeleteSnapshot = useCallback(
    async (version: number) => {
      await versions.deleteVersion(version);
      if (selectedSnapshot === version) {
        const remaining = sortedVersions.filter(
          (item) => item.version !== version
        );
        setSelectedSnapshot(remaining[0]?.version ?? null);
      }
    },
    [selectedSnapshot, sortedVersions, versions]
  );

  const handleAcceptProposal = useCallback(
    async (
      approvedContent: string,
      options?: { forceOverwrite?: boolean }
    ) => {
      if (applyingProposal || !proposal) {
        return;
      }
      setApplyingProposal(true);
      try {
        flushSource();
        const contentBeforeAsync = getSource();
        const initialReconciliation = reconcileProposalWithCurrent(
          proposal.baseContent,
          contentBeforeAsync,
          proposal.draftContent
        );
        if (
          initialReconciliation.kind === "conflict" &&
          !options?.forceOverwrite
        ) {
          addNotification({
            type: "warning",
            content: t(
              "documentEditor.proposal.acceptConflictAborted",
              "The document changed before the proposal was applied. Review the updated diff before accepting."
            )
          });
          return;
        }
        await flush();
        try {
          await savePreTurnVersion(asset.id);
          await queryClient.invalidateQueries({
            queryKey: textDocumentVersionsKey(asset.id)
          });
        } catch (cause) {
          console.error(
            "Failed to record pre-turn version before accepting proposal",
            cause
          );
        }
        const liveSource = getSource();
        const changedDuringAccept = liveSource !== contentBeforeAsync;
        const liveReconciliation = reconcileProposalWithCurrent(
          proposal.baseContent,
          liveSource,
          proposal.draftContent
        );
        if (
          liveReconciliation.kind === "conflict" &&
          (!options?.forceOverwrite || changedDuringAccept)
        ) {
          addNotification({
            type: "warning",
            content: t(
              "documentEditor.proposal.acceptConflictAborted",
              "The document changed before the proposal was applied. Review the updated diff before accepting."
            )
          });
          return;
        }
        const contentToApply =
          liveReconciliation.kind === "merged"
            ? liveReconciliation.mergedContent
            : approvedContent;
        applySource(contentToApply);
        if (view === "markdown") {
          setSource(contentToApply);
        }
        await flush();
        clearProposal(asset.id);
      } catch (cause) {
        notifyMutationError(
          t("documentEditor.proposal.accept", "Accept"),
          cause
        );
      } finally {
        setApplyingProposal(false);
      }
    },
    [
      addNotification,
      applyingProposal,
      applySource,
      asset.id,
      clearProposal,
      flush,
      flushSource,
      getSource,
      proposal,
      queryClient,
      t,
      view
    ]
  );

  const handleSourceChange = useCallback(
    (next: string) => {
      setSource(next);
      pendingSource.current = next;
      if (applyTimer.current) {
        clearTimeout(applyTimer.current);
      }
      applyTimer.current = setTimeout(flushSource, SOURCE_APPLY_DELAY_MS);
    },
    [flushSource]
  );

  const changeView = useCallback(
    (next: DocumentView) => {
      if (next === view) {
        return;
      }
      if (next === "markdown") {
        setSource(getSource());
      } else {
        flushSource();
      }
      setView(next);
    },
    [view, getSource, flushSource]
  );

  // The insert form takes focus, so remember the selection it applies to.
  const [insert, setInsert] = useState<DocumentInsertRequest | null>(null);
  const savedSelection = useRef<BaseSelection | null>(null);
  const openInsert = useCallback(
    (kind: DocumentInsertKind) => {
      let initialUrl: string | undefined;
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        savedSelection.current = selection?.clone() ?? null;
        if (kind === "link" && $isRangeSelection(selection)) {
          const node = selection.anchor.getNode();
          const link = $isLinkNode(node) ? node : node.getParent();
          if ($isLinkNode(link)) {
            initialUrl = link.getURL();
          }
        }
      });
      setInsert({ kind, initialUrl, ...selectionAnchor(pageRef.current) });
    },
    [editor]
  );
  const openLink = useCallback(() => openInsert("link"), [openInsert]);
  const [embedOpen, setEmbedOpen] = useState(false);
  const openEmbed = useCallback(() => {
    editor.getEditorState().read(() => {
      savedSelection.current = $getSelection()?.clone() ?? null;
    });
    setEmbedOpen(true);
  }, [editor]);
  const withSavedSelection = (apply: () => void) => {
    editor.focus();
    editor.update(() => {
      if (savedSelection.current) {
        $setSelection(savedSelection.current.clone());
      }
      apply();
    });
  };

  const location = useMemo(
    () => ({
      projectId: currentAsset.project_id ?? null,
      path: currentAsset.workspace_path ?? null
    }),
    [currentAsset.project_id, currentAsset.workspace_path]
  );
  const handleEmbedError = useCallback(
    (cause: unknown) => notifyMutationError(t("documentEditor.embed.title"), cause),
    [t]
  );

  const defaultDirectory = parentDirectoryOfPath(currentAsset.workspace_path);
  const baseName = currentAsset.name ?? "";

  const barSlots = {
    status: (
      <SaveStatus
        state={SAVE_STATUS[status]}
        onRetry={() => void sync.flush()}
      />
    ),
    history:
      view === "formatted" ? (
        <UndoRedoButtons
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onUndo={history.undo}
          onRedo={history.redo}
        />
      ) : undefined,
    mode: (
      <ModeSwitch<DocumentView>
        iconOnly
        ariaLabel={t("documentEditor.view.label")}
        options={[
          {
            value: "formatted",
            label: t("documentEditor.view.formatted"),
            icon: <ArticleOutlinedIcon fontSize="small" />
          },
          {
            value: "markdown",
            label: t("documentEditor.view.markdown"),
            icon: <CodeOutlinedIcon fontSize="small" />
          }
        ]}
        value={view}
        onChange={changeView}
      />
    ),
    view: narrow ? undefined : (
      <>
        <DocumentDisplayControls
          zoom={display.zoom}
          onZoomIn={display.zoomIn}
          onZoomOut={display.zoomOut}
          onResetZoom={display.resetZoom}
          paperTheme={display.paperTheme}
          onPaperThemeChange={display.setPaperTheme}
        />
        <ToolbarDivider />
        <FlexRow align="center" gap={GAP.tight}>
          <EditorButton
            variant="outlined"
            density="compact"
            tooltip={t(
              "documentEditor.bar.snapshotTooltip",
              "Save a snapshot of the current document"
            )}
            disabled={
              savingSnapshot || versions.isSaving || loadState !== "ready"
            }
            onClick={() => void handleTakeSnapshot()}
          >
            {t("documentEditor.bar.snapshot", "Snapshot")}
          </EditorButton>
          <EditorButton
            variant={snapshotsMode ? "contained" : "outlined"}
            density="compact"
            aria-pressed={snapshotsMode}
            disabled={loadState !== "ready"}
            onClick={() => setSnapshotsMode((current) => !current)}
          >
            {snapshotsMode
              ? t("documentEditor.bar.closeSnapshots", "Close Snapshots")
              : t("documentEditor.bar.openSnapshots", "Open Snapshots")}
          </EditorButton>
          <EditorButton
            variant="outlined"
            density="compact"
            disabled={loadState !== "ready"}
            onClick={() => setSaveAsOpen(true)}
          >
            {t("documentEditor.bar.saveAs", "Save As")}
          </EditorButton>
        </FlexRow>
      </>
    )
  };

  const body = () => {
    if (loadState === "error") {
      return (
        <FlexColumn
          fullWidth
          fullHeight
          sx={{ alignItems: "center", justifyContent: "center" }}
        >
          <ErrorBanner
            report={{
              source: "operation-failure",
              summary: "Document failed to load",
              errorText: `Document ${asset.id} could not be read`
            }}
          >
            {t("documentEditor.loadError")}
          </ErrorBanner>
        </FlexColumn>
      );
    }
    return null;
  };

  const scrollZoomStyle = {
    "--doc-zoom": String(display.zoom)
  } as CSSProperties;

  return (
    <DocumentLocationProvider value={location}>
      {documentBar ? (
        documentBar(barSlots)
      ) : (
        <DocumentBar title={currentAsset.name ?? ""} {...barSlots} />
      )}
      <FlexRow ref={workspaceRef} sx={{ flex: 1, minHeight: 0 }}>
        <FlexColumn sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          <DocumentTitleHeader
            title={currentAsset.name ?? ""}
            onRename={handleRename}
            disabled={loadState === "error"}
          />
          {conflicts.items.length > 0 && (
            <ConflictBanner
              conflicts={conflicts.items}
              onAccept={conflicts.accept}
              onDiscard={conflicts.discard}
            />
          )}
          {proposal && loadState === "ready" && (
            <DocumentProposalPanel
              proposal={proposal}
              queuedProposal={queuedProposal ?? null}
              currentContent={view === "markdown" ? source : getSource()}
              applying={applyingProposal}
              onDraftChange={(draft) => updateDraft(asset.id, draft)}
              onAccept={handleAcceptProposal}
              onReject={() => clearProposal(asset.id)}
              onAcceptQueued={() => acceptQueuedProposal(asset.id)}
              onDismissQueued={() => dismissQueuedProposal(asset.id)}
            />
          )}
          <DocumentChangesBar
            changes={changes}
            textOf={textOfBlock}
            onRevert={revertChange}
            onDismiss={dismissChanges}
          />
          {body()}
          {loadState === "loading" && (
            <FlexColumn
              fullWidth
              fullHeight
              sx={{ alignItems: "center", justifyContent: "center" }}
            >
              <LoadingSpinner />
            </FlexColumn>
          )}
          {view === "markdown" && loadState === "ready" && (
            <FlexColumn sx={{ flex: 1, minHeight: 0, position: "relative" }}>
              <MonacoPane
                value={source}
                language="markdown"
                placeholder={t("documentEditor.placeholder")}
                onChange={handleSourceChange}
                onSave={triggerSnapshotShortcut}
              />
            </FlexColumn>
          )}
          {/* The page stays mounted in the Markdown view so its undo history and
          block identity survive the switch. */}
          <FlexColumn
            sx={{
              flex: 1,
              minHeight: 0,
              display:
                view === "formatted" && loadState === "ready" ? "flex" : "none"
            }}
          >
            <DocumentToolbar onLink={openLink} onEmbed={openEmbed} />
            <div
              className={cn(
                "doc-scroll",
                documentPaperThemeClass(display.paperTheme)
              )}
              style={scrollZoomStyle}
            >
              <div className="doc-page" ref={pageRef}>
                <RichTextPlugin
                  contentEditable={
                    <ContentEditable
                      className="doc-input"
                      aria-label={currentAsset.name ?? t("documentEditor.label")}
                      aria-placeholder={t("documentEditor.placeholder")}
                      placeholder={
                        <div className="doc-placeholder">
                          {t("documentEditor.placeholder")}
                        </div>
                      }
                    />
                  }
                  ErrorBoundary={LexicalErrorBoundary}
                />
              </div>
            </div>
          </FlexColumn>
        </FlexColumn>
        {snapshotsMode && !narrow && loadState === "ready" && (
          <FlexColumn
            sx={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              borderLeft: 1,
              borderColor: "divider"
            }}
          >
            <DocumentSnapshotViewer
              version={activeSnapshot}
              content={snapshotContent.content}
              isLoading={snapshotContent.isLoading}
              error={snapshotContent.error}
              paperTheme={display.paperTheme}
              zoom={display.zoom}
            />
          </FlexColumn>
        )}
        {!narrow && loadState === "ready" && (
          <ResizableDock
            storageKey="document_side_panel"
            defaultWidth={SIDE_PANEL_WIDTH}
            ariaLabel={t("documentEditor.resizePanel")}
          >
            {snapshotsMode && (
              <>
                <FlexColumn
                  fullWidth
                  sx={{
                    height: snapshotSplitHeight,
                    flexShrink: 0,
                    minHeight: 0,
                    overflow: "hidden"
                  }}
                >
                  <DocumentSnapshotsList
                    versions={sortedVersions}
                    selectedVersion={selectedSnapshot}
                    isLoading={versions.isLoading}
                    error={versions.error}
                    onSelect={setSelectedSnapshot}
                    onRename={versions.renameVersion}
                    onRestore={handleRestoreSnapshot}
                    onDelete={handleDeleteSnapshot}
                    isMutating={
                      versions.isRenaming ||
                      versions.isRestoring ||
                      versions.isDeleting
                    }
                  />
                </FlexColumn>
                <ResizeHandle
                  orientation="horizontal"
                  grip
                  value={snapshotSplitHeight}
                  min={SNAPSHOT_SPLIT_MIN}
                  max={SNAPSHOT_SPLIT_MAX}
                  onResize={handleSnapshotSplitResize}
                  ariaLabel={t(
                    "documentEditor.snapshots.resizeSplit",
                    "Resize snapshots list and assistant"
                  )}
                />
              </>
            )}
            <FlexColumn
              fullWidth
              sx={{
                flex: 1,
                minHeight: 0,
                overflow: "hidden",
                borderTop: snapshotsMode ? 1 : 0,
                borderColor: "divider"
              }}
            >
              <DocumentAgentPanel
                assetId={asset.id}
                title={currentAsset.name}
                flush={flushDraft}
                getSelectedText={getSelectedText}
              />
            </FlexColumn>
          </ResizableDock>
        )}
      </FlexRow>
      <HistoryPlugin />
      <ListPlugin />
      <CheckListPlugin />
      <LinkPlugin />
      <AutoLinkPlugin />
      <TablePlugin />
      <TabIndentationPlugin />
      <HorizontalRulePlugin />
      <CodeHighlightPlugin />
      <MarkdownShortcutPlugin transformers={DOCUMENT_TRANSFORMERS} />
      <DocumentShortcutsPlugin onLink={openLink} onSave={triggerSnapshotShortcut} />
      <DocumentChangeMarksPlugin
        binding={binding}
        changes={changes}
        onEdited={onMarkedBlocksEdited}
      />
      {view === "formatted" && (
        <>
          <DocumentSelectionAssistPlugin getMarkdown={getSource} />
          <DocumentPersistentSelectionPlugin
            containerRef={pageRef}
            zoom={display.zoom}
          />
        </>
      )}
      <DocumentInsertPopover
        request={insert}
        onClose={() => setInsert(null)}
        onLink={(url) => withSavedSelection(() => setLink(editor, url))}
      />
      <DocumentEmbedDialog
        open={embedOpen}
        onClose={() => setEmbedOpen(false)}
        onInsert={(embeds: DocumentEmbedInsert[]) =>
          withSavedSelection(() => insertEmbeds(editor, embeds))
        }
      />
      <DocumentEmbedDropPlugin location={location} onError={handleEmbedError} />
      <DocumentSaveAsDialog
        open={saveAsOpen}
        onClose={() => setSaveAsOpen(false)}
        defaultName={baseName}
        defaultDirectory={defaultDirectory}
        workspaceId={workspaceId}
        saving={exporting !== null}
        onSaveAs={async ({ format, directory, name }) => {
          const ok = await exportDocument(format, { directory, name });
          if (!ok) {
            throw new Error(
              t("documentEditor.saveAs.error", "Could not save the document.")
            );
          }
        }}
      />
    </DocumentLocationProvider>
  );
};

const DocumentEditor = (props: DocumentEditorProps) => {
  const theme = useTheme();
  const styles = useMemo(() => documentEditorStyles(theme), [theme]);
  const initialConfig = useMemo(
    () => ({
      namespace: `document-${props.asset.id}`,
      nodes: [...DOCUMENT_NODES],
      theme: DOCUMENT_THEME,
      onError: (error: Error) => {
        console.error("Document editor error", error);
      }
    }),
    [props.asset.id]
  );
  return (
    <div css={styles}>
      <LexicalComposer key={props.asset.id} initialConfig={initialConfig}>
        <DocumentEditorBody {...props} />
      </LexicalComposer>
    </div>
  );
};

export default DocumentEditor;
