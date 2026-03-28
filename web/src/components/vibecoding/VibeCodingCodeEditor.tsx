import React, { useCallback, useEffect, memo, useRef } from "react";
import { Box, Typography, IconButton, Tooltip, CircularProgress } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useMonacoEditor } from "../../hooks/editor/useMonacoEditor";

const EXT_TO_LANGUAGE: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  json: "json",
  css: "css",
  html: "html",
  md: "markdown",
  svg: "xml",
  yaml: "yaml",
  yml: "yaml",
  py: "python",
  sh: "shell",
  bash: "shell"
};

function getLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_LANGUAGE[ext] ?? "plaintext";
}

interface VibeCodingCodeEditorProps {
  filePath: string;
  content: string;
  workspacePath: string;
  onClose: () => void;
  onContentChange?: (content: string) => void;
}

const VibeCodingCodeEditor: React.FC<VibeCodingCodeEditorProps> = ({
  filePath,
  content,
  workspacePath,
  onClose,
  onContentChange
}) => {
  const fileName = filePath.split("/").pop() ?? filePath;
  const language = getLanguage(filePath);
  const { MonacoEditor, loadMonacoIfNeeded, monacoRef, monacoOnMount } = useMonacoEditor();
  const workspacePathRef = useRef(workspacePath);
  const filePathRef = useRef(filePath);
  workspacePathRef.current = workspacePath;
  filePathRef.current = filePath;

  useEffect(() => {
    loadMonacoIfNeeded();
  }, [loadMonacoIfNeeded]);

  const handleChange = useCallback(
    (value?: string) => {
      if (value !== undefined && onContentChange) {
        onContentChange(value);
      }
    },
    [onContentChange]
  );

  const handleMount = useCallback(
    (editor: Parameters<typeof monacoOnMount>[0]) => {
      monacoOnMount(editor);
      // Bind Ctrl/Cmd+S to save
      // eslint-disable-next-line no-bitwise
      editor.addCommand(2048 | 49, () => {
        window.api?.workspace?.file?.write?.(
          workspacePathRef.current,
          filePathRef.current,
          editor.getValue()
        );
      });
    },
    [monacoOnMount]
  );

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        bgcolor: "#1e1e1e"
      }}
    >
      {/* Tab bar */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          minHeight: 32,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          bgcolor: "#252526",
          px: "8px"
        }}
      >
        <Typography
          noWrap
          sx={{
            fontSize: "0.75rem",
            fontFamily: "fontFamily2",
            color: "text.secondary",
            flex: 1
          }}
        >
          {fileName}
        </Typography>
        <Tooltip title="Close editor">
          <IconButton size="small" onClick={onClose} sx={{ p: "2px" }}>
            <CloseIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Monaco editor */}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        {MonacoEditor ? (
          <MonacoEditor
            height="100%"
            language={language}
            value={content}
            theme="vs-dark"
            onChange={handleChange}
            onMount={handleMount}
            options={{
              readOnly: false,
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              wordWrap: "on",
              automaticLayout: true,
              padding: { top: 8 }
            }}
          />
        ) : (
          <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
            <CircularProgress size={24} sx={{ color: "text.disabled" }} />
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default memo(VibeCodingCodeEditor);
