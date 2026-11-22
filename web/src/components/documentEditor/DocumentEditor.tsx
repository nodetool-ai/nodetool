/** @jsxImportSource @emotion/react */
/**
 * The document editor (document editor PRD phase 1): a formatted page over a
 * Markdown file. Typing formats as in a word processor, the toolbar and
 * shortcuts cover the rest, and the Markdown view edits the same file as
 * text. Edits autosave; blocks nobody touched keep their exact bytes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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

import type { Asset } from "../../stores/ApiTypes";
import { useDocumentConflicts } from "../../hooks/useDocumentConflicts";
import {
  useMarkdownDocumentSync,
  type MarkdownSaveStatus
} from "../../hooks/document/useMarkdownDocumentSync";
import ErrorBanner from "../support/ErrorBanner";
import MonacoPane from "../workspace/MonacoPane";
import { CodeHighlightPlugin } from "../textEditor/CodeHighlightPlugin";
import { AutoLinkPlugin } from "../textEditor/AutoLinkPlugin";
import { HorizontalRulePlugin } from "../textEditor/HorizontalRulePlugin";
import {
  ConflictBanner,
  DocumentBar,
  FlexColumn,
  LoadingSpinner,
  ModeSwitch,
  SaveStatus,
  UndoRedoButtons,
  type DocumentBarRender,
  type SaveStatusValue
} from "../ui_primitives";
import { newDocumentId } from "../../lib/newDocumentId";
import { DocumentLocationProvider } from "./documentEditorContext";
import { DOCUMENT_TRANSFORMERS } from "./documentTransformers";
import { DOCUMENT_THEME, documentEditorStyles } from "./documentEditorStyles";
import { DOCUMENT_NODES, MarkdownDocumentBinding } from "./markdownBlockCodec";
import { insertImage, setLink } from "./documentCommands";
import DocumentToolbar from "./DocumentToolbar";
import DocumentInsertPopover, {
  type DocumentInsertKind,
  type DocumentInsertRequest
} from "./DocumentInsertPopover";
import { DocumentShortcutsPlugin } from "./DocumentShortcutsPlugin";

type DocumentView = "formatted" | "markdown";

/** How long the Markdown view waits after a keystroke before applying it. */
const SOURCE_APPLY_DELAY_MS = 400;

const SAVE_STATUS: Record<MarkdownSaveStatus, SaveStatusValue> = {
  saved: "saved",
  reloaded: "saved",
  unsaved: "dirty",
  saving: "saving",
  error: "error"
};

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
function selectionAnchor(fallback: HTMLElement | null): { top: number; left: number } {
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
  const [editor] = useLexicalComposerContext();
  // The composer remounts per document, so one binding holds its blocks.
  const [binding] = useState(() => new MarkdownDocumentBinding(newDocumentId));
  const sync = useMarkdownDocumentSync(asset.id, editor, binding);
  const { loadState, status, applySource, getSource } = sync;
  const history = useLexicalHistoryState();
  const conflicts = useDocumentConflicts("document", asset.id);
  const pageRef = useRef<HTMLDivElement | null>(null);

  // A new document opens empty: put the caret in it.
  useEffect(() => {
    if (loadState !== "ready") return;
    const empty = editor.getEditorState().read(() => $getRoot().getTextContent() === "");
    if (empty) editor.focus();
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

  const handleSourceChange = useCallback(
    (next: string) => {
      setSource(next);
      pendingSource.current = next;
      if (applyTimer.current) clearTimeout(applyTimer.current);
      applyTimer.current = setTimeout(flushSource, SOURCE_APPLY_DELAY_MS);
    },
    [flushSource]
  );

  const changeView = useCallback(
    (next: DocumentView) => {
      if (next === view) return;
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
          if ($isLinkNode(link)) initialUrl = link.getURL();
        }
      });
      setInsert({ kind, initialUrl, ...selectionAnchor(pageRef.current) });
    },
    [editor]
  );
  const openLink = useCallback(() => openInsert("link"), [openInsert]);
  const openImage = useCallback(() => openInsert("image"), [openInsert]);
  const withSavedSelection = (apply: () => void) => {
    editor.focus();
    editor.update(() => {
      if (savedSelection.current) $setSelection(savedSelection.current.clone());
      apply();
    });
  };

  const barSlots = {
    status: <SaveStatus state={SAVE_STATUS[status]} onRetry={() => void sync.flush()} />,
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
    )
  };

  const body = () => {
    if (loadState === "error") {
      return (
        <FlexColumn fullWidth fullHeight sx={{ alignItems: "center", justifyContent: "center" }}>
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

  return (
    <DocumentLocationProvider
      value={{ projectId: asset.project_id ?? null, path: asset.workspace_path ?? null }}
    >
      {documentBar ? documentBar(barSlots) : <DocumentBar title={asset.name ?? ""} {...barSlots} />}
      {conflicts.items.length > 0 && (
        <ConflictBanner
          conflicts={conflicts.items}
          onAccept={conflicts.accept}
          onDiscard={conflicts.discard}
        />
      )}
      {body()}
      {loadState === "loading" && (
        <FlexColumn fullWidth fullHeight sx={{ alignItems: "center", justifyContent: "center" }}>
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
            onSave={() => {
              flushSource();
              void sync.flush();
            }}
          />
        </FlexColumn>
      )}
      {/* The page stays mounted in the Markdown view so its undo history and
          block identity survive the switch. */}
      <FlexColumn
        sx={{
          flex: 1,
          minHeight: 0,
          display: view === "formatted" && loadState === "ready" ? "flex" : "none"
        }}
      >
        <DocumentToolbar onLink={openLink} onImage={openImage} />
        <div className="doc-scroll">
          <div className="doc-page" ref={pageRef}>
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  className="doc-input"
                  aria-label={asset.name ?? t("documentEditor.label")}
                  aria-placeholder={t("documentEditor.placeholder")}
                  placeholder={
                    <div className="doc-placeholder">{t("documentEditor.placeholder")}</div>
                  }
                />
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
          </div>
        </div>
      </FlexColumn>
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
      <DocumentShortcutsPlugin onLink={openLink} />
      <DocumentInsertPopover
        request={insert}
        onClose={() => setInsert(null)}
        onLink={(url) => withSavedSelection(() => setLink(editor, url))}
        onImage={(src, alt) => withSavedSelection(() => insertImage(editor, src, alt))}
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
