/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type * as monaco from "monaco-editor";
import SearchIcon from "@mui/icons-material/Search";
import WrapTextIcon from "@mui/icons-material/WrapText";
import CodeIcon from "@mui/icons-material/Code";
import SaveIcon from "@mui/icons-material/Save";

import type { Asset } from "../../stores/ApiTypes";
import { useAssetStore } from "../../stores/AssetStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useMonacoEditor } from "../../hooks/editor/useMonacoEditor";
import { languageFromAsset } from "../../utils/assetLanguage";
import {
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  ToolbarIconButton,
  TruncatedText
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
    ".editor-toolbar": {
      flex: "0 0 auto",
      height: "2.5em",
      padding: "0 0.5em 0 0.75em",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.grey[800]
    },
    ".filename": {
      color: theme.vars.palette.text.primary,
      fontWeight: 500,
      maxWidth: "40ch"
    },
    ".language-tag": {
      textTransform: "uppercase",
      letterSpacing: "0.05em"
    },
    ".dirty-dot": {
      width: 8,
      height: 8,
      borderRadius: "50%",
      backgroundColor: theme.vars.palette.warning.main,
      flex: "0 0 auto"
    },
    ".editor-host": {
      flex: 1,
      minHeight: 0,
      position: "relative"
    },
    ".editor-status": {
      position: "absolute",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: theme.vars.palette.text.secondary
    },
    ".editor-error": {
      color: theme.vars.palette.error.main
    }
  });

/**
 * A Monaco-backed editor for any text-based asset, used as the edit surface of
 * a `text` workspace tab. It is the code-editor counterpart to the read-only
 * TextViewer: language is inferred from the filename, edits are tracked against
 * the loaded baseline, and Save persists the content back via the asset update
 * API (`Cmd/Ctrl+S` or the toolbar button).
 */
const TextDocumentEditor = ({ asset }: TextDocumentEditorProps) => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const update = useAssetStore((state) => state.update);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const {
    MonacoEditor,
    monacoLoadError,
    isMonacoLoading,
    loadMonacoIfNeeded,
    monacoOnMount
  } = useMonacoEditor();

  const language = useMemo(() => languageFromAsset(asset), [asset]);
  const monacoTheme = theme.palette.mode === "light" ? "vs" : "vs-dark";
  const getUrl = asset.get_url ?? undefined;

  const [content, setContent] = useState<string | null>(null);
  const [savedContent, setSavedContent] = useState<string | null>(null);
  const [wordWrap, setWordWrap] = useState(true);

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

  useEffect(() => {
    void loadMonacoIfNeeded();
  }, [loadMonacoIfNeeded]);

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

  const handleSave = useCallback(() => {
    if (content === null || content === savedContent || isSaving) {
      return;
    }
    saveMutation.mutate(content);
  }, [content, savedContent, isSaving, saveMutation]);

  // Monaco's keybinding fires through a ref so the command — registered once on
  // mount — always calls the latest save handler instead of a stale closure.
  const saveRef = useRef(handleSave);
  saveRef.current = handleSave;

  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  const handleMount = useCallback(
    (
      editor: monaco.editor.IStandaloneCodeEditor,
      monacoInstance: typeof import("monaco-editor")
    ) => {
      editorRef.current = editor;
      monacoOnMount(editor);
      editor.addCommand(
        monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS,
        () => saveRef.current()
      );
    },
    [monacoOnMount]
  );

  const handleChange = useCallback((value?: string) => {
    setContent(value ?? "");
  }, []);

  const handleFind = useCallback(() => {
    editorRef.current?.getAction?.("actions.find")?.run?.();
  }, []);

  const handleFormat = useCallback(() => {
    editorRef.current?.getAction?.("editor.action.formatDocument")?.run?.();
  }, []);

  const editorOptions = useMemo(
    () => ({
      automaticLayout: true,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      wordWrap: wordWrap ? ("on" as const) : ("off" as const),
      fontSize: 13,
      tabSize: 2,
      renderWhitespace: "selection" as const,
      smoothScrolling: true,
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 }
    }),
    [wordWrap]
  );

  return (
    <div css={styles(theme)}>
      <FlexRow
        className="editor-toolbar"
        align="center"
        justify="space-between"
        gap={1}
      >
        <FlexRow align="center" gap={1} sx={{ minWidth: 0 }}>
          {isDirty && <span className="dirty-dot" aria-label="Unsaved changes" />}
          <TruncatedText className="filename" showTooltip>
            {asset.name}
          </TruncatedText>
          {language && (
            <Caption className="language-tag">{language}</Caption>
          )}
        </FlexRow>
        <FlexRow align="center" gap={0.5}>
          <ToolbarIconButton
            tooltip="Find (Ctrl/Cmd+F)"
            icon={<SearchIcon />}
            onClick={handleFind}
            size="small"
          />
          <ToolbarIconButton
            tooltip="Format document"
            icon={<CodeIcon />}
            onClick={handleFormat}
            size="small"
          />
          <ToolbarIconButton
            tooltip={wordWrap ? "Disable word wrap" : "Enable word wrap"}
            icon={<WrapTextIcon />}
            onClick={() => setWordWrap((w) => !w)}
            active={wordWrap}
            size="small"
          />
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

      <div className="editor-host">
        {textError ? (
          <div className="editor-status editor-error">
            Failed to load text content
          </div>
        ) : textLoading || content === null ? (
          <FlexColumn className="editor-status">
            <LoadingSpinner />
          </FlexColumn>
        ) : monacoLoadError ? (
          <div className="editor-status editor-error">{monacoLoadError}</div>
        ) : MonacoEditor ? (
          <MonacoEditor
            value={content}
            onChange={handleChange}
            language={language ?? "plaintext"}
            theme={monacoTheme}
            width="100%"
            height="100%"
            onMount={handleMount}
            options={editorOptions}
          />
        ) : (
          <FlexColumn className="editor-status">
            <LoadingSpinner />
            {isMonacoLoading && <Caption>Loading editor…</Caption>}
          </FlexColumn>
        )}
      </div>
    </div>
  );
};

export default TextDocumentEditor;
