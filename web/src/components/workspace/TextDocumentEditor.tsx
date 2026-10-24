/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import type { Asset, DataframeRef } from "../../stores/ApiTypes";
import { useAssetStore } from "../../stores/AssetStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { languageFromAsset, previewKind } from "../../utils/assetLanguage";
import {
  csvDelimiterFor,
  dataframeToCsv,
  parseCsvToDataframe
} from "../../utils/csvDataframe";
import { useContextCommands } from "../../hooks/useContextCommands";
import type { ContextCommand } from "../../stores/CommandMenuStore";
import { isMac } from "../../utils/platform";
import {
  toggleBold,
  toggleBulletList,
  toggleHeading
} from "../../utils/markdownFormatting";
import MonacoPane from "./MonacoPane";
import DataTable from "../node/DataTable/DataTable";
import EditorToolbar from "../textEditor/EditorToolbar";
import ErrorBanner from "../support/ErrorBanner";
import {
  DocumentBar,
  FlexColumn,
  LoadingSpinner,
  SaveStatus,
  Toolbar,
  UndoRedoButtons
} from "../ui_primitives";
import type { DocumentBarRender } from "../ui_primitives";
import {
  DocumentSaveButton,
  explicitSaveStatus,
  useMonacoHistory
} from "./documentBarParts";

interface TextDocumentEditorProps {
  asset: Asset;
  /** Whether the editor's tab is on screen; lists its commands in the Cmd+K menu. */
  active?: boolean;
  /** Draws the document bar. Defaults to a bar titled with the asset name. */
  documentBar?: DocumentBarRender;
}

const textAssetKey = (id: string) => ["textAsset", id] as const;

const styles = (theme: Theme) =>
  css({
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    backgroundColor: theme.vars.palette.background.default,
    color: theme.vars.palette.common.white,
    ".editor-toolbar-row": {
      ".editor-toolbar": {
        flex: 1,
        borderBottom: "none",
        backgroundColor: "transparent"
      }
    },

    ".editor-host": {
      flex: 1,
      minHeight: 0,
      position: "relative"
    },
    ".table-host": {
      flex: 1,
      minHeight: 0,
      overflow: "hidden",
      ".datatable.nowheel": {
        height: "100%"
      },
      ".datatable.nowheel > .datatable": {
        flex: 1,
        minHeight: 0
      }
    }
  });

/**
 * The edit surface of a `text` workspace tab. CSV/TSV assets open in the
 * tabular DataTable editor; every other text format opens in Monaco with a
 * filename-inferred language. Edits are tracked against the loaded baseline
 * in the document bar's save status and persisted back via the asset update
 * API (Cmd/Ctrl+S or the bar's Save button). Undo and Redo sit in the bar.
 * The formatting tools stay in a row inside the editor.
 */
const TextDocumentEditor = ({
  asset,
  active = false,
  documentBar
}: TextDocumentEditorProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const editorStyles = useMemo(() => styles(theme), [theme]);
  const queryClient = useQueryClient();
  const update = useAssetStore((state) => state.update);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const language = useMemo(() => languageFromAsset(asset), [asset]);
  const kind = previewKind(asset);
  const isCsv = kind === "csv";
  const isMarkdown = language === "markdown";
  const getUrl = asset.get_url ?? undefined;

  const [content, setContent] = useState<string | null>(null);
  const [savedContent, setSavedContent] = useState<string | null>(null);
  // CSV edits are tracked as a live dataframe so a single edit survives even
  // when CSV serialization is lossy (e.g. a trailing empty single-column row);
  // `content` stays canonical for dirty-tracking and saving.
  const [csvDataframe, setCsvDataframe] = useState<DataframeRef | null>(null);
  const [wordWrap, setWordWrap] = useState(true);
  const history = useMonacoHistory();
  const { editorRef } = history;

  const {
    data: loadedText,
    isLoading: textLoading,
    error: textError
  } = useQuery({
    queryKey: textAssetKey(asset.id),
    enabled: !!getUrl,
    queryFn: async () => {
      if (!getUrl) {
        throw new Error("Text asset has no download URL");
      }
      const response = await fetch(getUrl);
      if (!response.ok) {
        throw new Error(`Failed to load text asset: ${response.status}`);
      }
      return response.text();
    }
  });

  // Seed once the text is in the query cache (view mode already loaded it).
  // A sibling reset-on-mount effect used to run in the same flush and write
  // `content` back to null, so clicking Edit after View spun forever.
  useEffect(() => {
    if (loadedText === undefined) {
      return;
    }
    setContent((current) => (current === null ? loadedText : current));
    setSavedContent((current) => (current === null ? loadedText : current));
  }, [loadedText]);

  // Re-derive everything when the tab is pointed at a different asset.
  const assetId = asset.id;
  const previousAssetId = useRef(assetId);
  useEffect(() => {
    if (previousAssetId.current === assetId) {
      return;
    }
    previousAssetId.current = assetId;
    setContent(null);
    setSavedContent(null);
    setCsvDataframe(null);
  }, [assetId]);

  const saveMutation = useMutation({
    mutationFn: (text: string) =>
      update({
        id: asset.id,
        data: text,
        content_type: asset.content_type ?? "text/plain"
      }),
    onSuccess: (_asset, text) => {
      setSavedContent(text);
      queryClient.setQueryData(textAssetKey(asset.id), text);
      addNotification({
        type: "success",
        alert: true,
        content: `Saved ${asset.name}`,
        dismissable: false
      });
    },
    onError: (error) => {
      addNotification({
        type: "error",
        alert: true,
        content: `Failed to save ${asset.name}: ${error.message}`,
        dismissable: false
      });
    }
  });

  const isDirty = content !== null && content !== savedContent;
  const isSaving = saveMutation.isPending;

  // Switching the tab to View or closing it unmounts this editor, and its
  // draft lived only here (study-7-I1). Save an unsaved draft on the way out,
  // and put it in the shared query so the preview shows it at once.
  const unsavedDraft = useRef<string | null>(null);
  const assetRef = useRef(asset);
  useEffect(() => {
    unsavedDraft.current = isDirty ? content : null;
    assetRef.current = asset;
  }, [isDirty, content, asset]);
  useEffect(
    () => () => {
      const draft = unsavedDraft.current;
      if (draft === null) {
        return;
      }
      const leaving = assetRef.current;
      const key = textAssetKey(leaving.id);
      queryClient.setQueryData(key, draft);
      update({
        id: leaving.id,
        data: draft,
        content_type: leaving.content_type ?? "text/plain"
      })
        // The preview mounts in the same commit and refetches the file
        // before the save lands, so read it again once the save is in.
        .then(() => queryClient.invalidateQueries({ queryKey: key }))
        .catch((error: Error) => {
          addNotification({
            type: "error",
            alert: true,
            content: `Failed to save ${leaving.name}: ${error.message}`,
            dismissable: false
          });
        });
    },
    [queryClient, update, addNotification]
  );

  const { onEditorMount } = history;
  const handleEditorMount = useCallback<typeof onEditorMount>(
    (editor) => {
      onEditorMount(editor);
      // A new file opens empty; put the caret in it so typing just works.
      if (editor.getModel()?.getValueLength() === 0) {
        editor.focus();
      }
    },
    [onEditorMount]
  );

  // Markdown buttons for people who do not know the syntax (study-7-I3).
  const formatLines = useCallback(
    (transform: (lines: readonly string[]) => string[]) => {
      const editor = editorRef.current;
      const model = editor?.getModel();
      const selection = editor?.getSelection();
      if (!editor || !model || !selection) {
        return;
      }
      const first = selection.startLineNumber;
      const last = selection.endLineNumber;
      const lines: string[] = [];
      for (let line = first; line <= last; line++) {
        lines.push(model.getLineContent(line));
      }
      editor.executeEdits("toolbar", [
        {
          range: {
            startLineNumber: first,
            startColumn: 1,
            endLineNumber: last,
            endColumn: model.getLineMaxColumn(last)
          },
          text: transform(lines).join(model.getEOL())
        }
      ]);
      editor.focus();
    },
    [editorRef]
  );

  const handleHeading = useCallback(
    () => formatLines(toggleHeading),
    [formatLines]
  );

  const handleBulletList = useCallback(
    () => formatLines(toggleBulletList),
    [formatLines]
  );

  const handleBold = useCallback(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    const selection = editor?.getSelection();
    if (!editor || !model || !selection) {
      return;
    }
    const selected = model.getValueInRange(selection);
    editor.executeEdits("toolbar", [
      { range: selection, text: toggleBold(selected) }
    ]);
    if (selected === "") {
      // Leave the caret between the markers, ready for the bold words.
      editor.setPosition({
        lineNumber: selection.startLineNumber,
        column: selection.startColumn + 2
      });
    }
    editor.focus();
  }, [editorRef]);

  const handleUndo = history.undo;
  const handleRedo = history.redo;

  const handleSave = useCallback(() => {
    if (content === null || content === savedContent || isSaving) {
      return;
    }
    saveMutation.mutate(content);
  }, [content, savedContent, isSaving, saveMutation]);

  const menuCommands = useMemo<ContextCommand[]>(() => {
    const mod = isMac() ? "⌘" : "Ctrl+";
    const shiftMod = isMac() ? "⌘⇧" : "Ctrl+Shift+";
    const commands: ContextCommand[] = [];
    if (isDirty && !isSaving) {
      commands.push({
        id: "save",
        label: t("i18n-next51.common.save"),
        run: handleSave,
        shortcut: `${mod}S`
      });
    }
    if (!isCsv) {
      commands.push(
        {
          id: "undo",
          label: t("i18n-next51.common.undo"),
          run: handleUndo,
          shortcut: `${mod}Z`
        },
        {
          id: "redo",
          label: t("i18n-next51.common.redo"),
          run: handleRedo,
          shortcut: `${shiftMod}Z`
        }
      );
      commands.push({
        id: "word-wrap",
        label: wordWrap
          ? t("i18n-next51.text.turnOffWordWrap")
          : t("i18n-next51.text.turnOnWordWrap"),
        run: () => setWordWrap((wrap) => !wrap)
      });
    }
    return commands;
  }, [
    isDirty,
    isSaving,
    isCsv,
    wordWrap,
    handleSave,
    handleUndo,
    handleRedo,
    t
  ]);
  useContextCommands("Text", menuCommands, active);

  const delimiter = useMemo(
    () => csvDelimiterFor(asset.name ?? ""),
    [asset.name]
  );
  // Render from the live dataframe once the user has edited it; before that,
  // parse the loaded text. The table owns its row/column state so an edit is
  // never lost to a lossy CSV round-trip.
  const dataframe = useMemo<DataframeRef | null>(() => {
    if (!isCsv) {
      return null;
    }
    if (csvDataframe) {
      return csvDataframe;
    }
    return content !== null ? parseCsvToDataframe(content, delimiter) : null;
  }, [isCsv, csvDataframe, content, delimiter]);

  const handleDataframeChange = useCallback(
    (df: DataframeRef) => {
      setCsvDataframe(df);
      setContent(dataframeToCsv(df, delimiter));
    },
    [delimiter]
  );

  const body = () => {
    if (textError) {
      return (
        <FlexColumn
          fullWidth
          fullHeight
          sx={{ alignItems: "center", justifyContent: "center" }}
        >
          <ErrorBanner
            report={{
              source: "operation-failure",
              summary: "Text document failed to load",
              errorText: textError.message
            }}
          >
            {t("i18n-next51.text.loadError")}
          </ErrorBanner>
        </FlexColumn>
      );
    }
    if (textLoading || content === null) {
      return (
        <FlexColumn
          fullWidth
          fullHeight
          sx={{ alignItems: "center", justifyContent: "center" }}
        >
          <LoadingSpinner />
        </FlexColumn>
      );
    }
    if (isCsv && dataframe) {
      return (
        <div className="table-host">
          <DataTable
            dataframe={dataframe}
            editable
            isModalMode
            onChange={handleDataframeChange}
          />
        </div>
      );
    }
    return (
      <div className="editor-host">
        <MonacoPane
          value={content}
          language={language ?? "plaintext"}
          wordWrap={wordWrap}
          placeholder={
            isMarkdown ? t("i18n-next51.text.markdownPlaceholder") : undefined
          }
          onChange={setContent}
          onSave={handleSave}
          onEditorMount={handleEditorMount}
        />
      </div>
    );
  };

  const barSlots = {
    status: (
      <SaveStatus
        state={explicitSaveStatus({
          saving: isSaving,
          dirty: isDirty,
          failed: saveMutation.isError
        })}
        onRetry={handleSave}
      />
    ),
    // The table keeps its own Undo and Redo.
    history: isCsv ? undefined : (
      <UndoRedoButtons
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />
    ),
    actions: (
      <DocumentSaveButton
        onSave={handleSave}
        saving={isSaving}
        disabled={!isDirty}
      />
    )
  };

  return (
    <div css={editorStyles}>
      {documentBar ? (
        documentBar(barSlots)
      ) : (
        <DocumentBar title={asset.name ?? ""} {...barSlots} />
      )}
      {!isCsv && (
        <Toolbar className="editor-toolbar-row" sx={{ px: 0, gap: 0 }}>
          <EditorToolbar
            onToggleWordWrap={() => setWordWrap((w) => !w)}
            onHeading={isMarkdown ? handleHeading : undefined}
            onBold={isMarkdown ? handleBold : undefined}
            onBulletList={isMarkdown ? handleBulletList : undefined}
            wordWrapEnabled={wordWrap}
          />
        </Toolbar>
      )}

      {body()}
    </div>
  );
};

export default TextDocumentEditor;
