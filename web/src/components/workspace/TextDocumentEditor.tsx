/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import SaveIcon from "@mui/icons-material/Save";
import type * as monaco from "monaco-editor";

import type { Asset, DataframeRef } from "../../stores/ApiTypes";
import { useAssetStore } from "../../stores/AssetStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { languageFromAsset, previewKind } from "../../utils/assetLanguage";
import {
  csvDelimiterFor,
  dataframeToCsv,
  parseCsvToDataframe
} from "../../utils/csvDataframe";
import MonacoPane from "./MonacoPane";
import DataTable from "../node/DataTable/DataTable";
import EditorToolbar from "../textEditor/EditorToolbar";
import {
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  BORDER_RADIUS
} from "../ui_primitives";

interface TextDocumentEditorProps {
  asset: Asset;
}

const textAssetKey = (id: string) => ["textAsset", id] as const;

const styles = (theme: Theme) =>
  css({
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    backgroundColor: theme.vars.palette.grey[900],
    color: theme.vars.palette.common.white,
    ".editor-toolbar-row": {
      flex: "0 0 auto",
      borderBottom: `1px solid ${theme.vars.palette.grey[700]}`,
      backgroundColor: theme.vars.palette.grey[900],
      ".editor-toolbar": {
        flex: 1,
        borderBottom: "none",
        backgroundColor: "transparent"
      }
    },

    ".dirty-dot": {
      width: 8,
      height: 8,
      borderRadius: BORDER_RADIUS.circle,
      backgroundColor: theme.vars.palette.warning.main,
      flex: "0 0 auto"
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
 * (dirty dot) and persisted back via the asset update API (Cmd/Ctrl+S or the
 * toolbar Save button).
 */
const TextDocumentEditor = ({ asset }: TextDocumentEditorProps) => {
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
  const getUrl = asset.get_url ?? undefined;

  const [content, setContent] = useState<string | null>(null);
  const [savedContent, setSavedContent] = useState<string | null>(null);
  // CSV edits are tracked as a live dataframe so a single edit survives even
  // when CSV serialization is lossy (e.g. a trailing empty single-column row);
  // `content` stays canonical for dirty-tracking and saving.
  const [csvDataframe, setCsvDataframe] = useState<DataframeRef | null>(null);
  const [wordWrap, setWordWrap] = useState(true);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

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

  // Seed the editor once the text arrives; the query cache stays the source of
  // truth so re-opening the tab restores the last-saved content.
  useEffect(() => {
    if (loadedText !== undefined && content === null) {
      setContent(loadedText);
      setSavedContent(loadedText);
    }
  }, [loadedText, content]);

  // Re-derive everything when the tab is pointed at a different asset.
  useEffect(() => {
    setContent(null);
    setSavedContent(null);
    setCsvDataframe(null);
  }, [asset.id]);

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
        content: `Failed to save ${asset.name}: ${(error as Error).message}`,
        dismissable: false
      });
    }
  });

  const isDirty = content !== null && content !== savedContent;
  const isSaving = saveMutation.isPending;

  const updateHistoryState = useCallback(() => {
    const model = editorRef.current?.getModel();
    const alternativeVersionId = model?.getAlternativeVersionId() ?? 1;
    const versionId = model?.getVersionId() ?? 1;
    setCanUndo(alternativeVersionId < versionId);
    setCanRedo(alternativeVersionId > versionId);
  }, []);

  const handleEditorMount = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor) => {
      editorRef.current = editor;
      updateHistoryState();
      editor.onDidChangeModelContent(updateHistoryState);
    },
    [updateHistoryState]
  );

  const handleUndo = useCallback(() => {
    editorRef.current?.trigger("toolbar", "undo", null);
    updateHistoryState();
  }, [updateHistoryState]);

  const handleRedo = useCallback(() => {
    editorRef.current?.trigger("toolbar", "redo", null);
    updateHistoryState();
  }, [updateHistoryState]);

  const handleSave = useCallback(() => {
    if (content === null || content === savedContent || isSaving) {
      return;
    }
    saveMutation.mutate(content);
  }, [content, savedContent, isSaving, saveMutation]);

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
          <Caption sx={{ color: "error.main" }}>
            Failed to load text content
          </Caption>
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
            toolbarEnd={
              <>
                {isDirty && (
                  <span className="dirty-dot" aria-label="Unsaved changes" />
                )}
                <EditorButton
                  variant="contained"
                  size="small"
                  startIcon={<SaveIcon />}
                  disabled={!isDirty || isSaving}
                  onClick={handleSave}
                >
                  {isSaving ? "Saving…" : "Save"}
                </EditorButton>
              </>
            }
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
          onChange={setContent}
          onSave={handleSave}
          onEditorMount={handleEditorMount}
        />
      </div>
    );
  };

  return (
    <div css={editorStyles}>
      {!isCsv && (
        <FlexRow
          className="editor-toolbar-row"
          align="center"
          justify="space-between"
        >
          <EditorToolbar
            onUndo={handleUndo}
            onRedo={handleRedo}
            onToggleWordWrap={() => setWordWrap((w) => !w)}
            canUndo={canUndo}
            canRedo={canRedo}
            wordWrapEnabled={wordWrap}
          />
          <FlexRow align="center" gap={0.5} sx={{ px: 1 }}>
            {isDirty && (
              <span className="dirty-dot" aria-label="Unsaved changes" />
            )}
            <EditorButton
              variant="contained"
              size="small"
              startIcon={<SaveIcon />}
              disabled={!isDirty || isSaving}
              onClick={handleSave}
            >
              {isSaving ? "Saving…" : "Save"}
            </EditorButton>
          </FlexRow>
        </FlexRow>
      )}

      {body()}
    </div>
  );
};

export default TextDocumentEditor;
