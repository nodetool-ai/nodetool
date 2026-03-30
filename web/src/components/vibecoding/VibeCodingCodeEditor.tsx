import React, { useCallback, useEffect, memo, useRef } from "react";
import { Box, CircularProgress } from "@mui/material";
import * as monaco from "monaco-editor";
import { useMonacoEditor } from "../../hooks/editor/useMonacoEditor";
import type { Diagnostic } from "./diagnosticParser";

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

const SEVERITY_MAP: Record<string, monaco.MarkerSeverity> = {
  error: monaco.MarkerSeverity.Error,
  warning: monaco.MarkerSeverity.Warning,
  info: monaco.MarkerSeverity.Info
};

// Disable Monaco's built-in TypeScript/JavaScript diagnostics once.
let tsDefaultsConfigured = false;
function disableBuiltinDiagnostics() {
  if (tsDefaultsConfigured) return;
  tsDefaultsConfigured = true;
  try {
    const noValidation = {
      noSemanticValidation: true,
      noSyntaxValidation: true,
      noSuggestionDiagnostics: true
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const langs = monaco.languages as any;
    langs.typescript?.typescriptDefaults?.setDiagnosticsOptions?.(noValidation);
    langs.typescript?.javascriptDefaults?.setDiagnosticsOptions?.(noValidation);
  } catch {
    // Monaco TS worker not available
  }
}

function filePathMatches(editorPath: string, diagPath: string): boolean {
  if (editorPath === diagPath) return true;
  // Normalize: strip leading ./ from both
  const a = editorPath.replace(/^\.\//, "");
  const b = diagPath.replace(/^\.\//, "");
  if (a === b) return true;
  // One might be a suffix of the other
  return a.endsWith("/" + b) || b.endsWith("/" + a) || a.endsWith(b) || b.endsWith(a);
}

function buildMarkers(
  filePath: string,
  diagnostics: Diagnostic[]
): monaco.editor.IMarkerData[] {
  return diagnostics
    .filter((d) => filePathMatches(filePath, d.filePath))
    .map((d) => ({
      severity: SEVERITY_MAP[d.severity] ?? monaco.MarkerSeverity.Error,
      message: d.message,
      startLineNumber: d.line,
      startColumn: d.column,
      endLineNumber: d.endLine ?? d.line,
      endColumn: d.endColumn ?? 1000
    }));
}

interface VibeCodingCodeEditorProps {
  filePath: string;
  content: string;
  workspacePath: string;
  diagnostics?: Diagnostic[];
  onContentChange?: (filePath: string, content: string) => void;
}

const VibeCodingCodeEditor: React.FC<VibeCodingCodeEditorProps> = ({
  filePath,
  content,
  workspacePath,
  diagnostics,
  onContentChange
}) => {
  const language = getLanguage(filePath);
  const { MonacoEditor, loadMonacoIfNeeded, monacoOnMount } = useMonacoEditor();
  const workspacePathRef = useRef(workspacePath);
  const filePathRef = useRef(filePath);
  const diagnosticsRef = useRef(diagnostics);
  // Local ref for THIS editor instance (not shared across tabs)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  workspacePathRef.current = workspacePath;
  filePathRef.current = filePath;
  diagnosticsRef.current = diagnostics;

  useEffect(() => {
    disableBuiltinDiagnostics();
    loadMonacoIfNeeded();
  }, [loadMonacoIfNeeded]);

  // Apply markers whenever diagnostics change
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model || model.isDisposed()) return;

    const markers = buildMarkers(filePath, diagnostics ?? []);
    monaco.editor.setModelMarkers(model, "vibecoding-server", markers);
  }, [diagnostics, filePath]);

  const handleChange = useCallback(
    (value?: string) => {
      if (value !== undefined && onContentChange) {
        onContentChange(filePathRef.current, value);
      }
    },
    [onContentChange]
  );

  const handleMount = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor) => {
      monacoOnMount(editor);
      editorRef.current = editor;

      // Apply markers now that editor is mounted
      const model = editor.getModel();
      if (model) {
        const markers = buildMarkers(
          filePathRef.current,
          diagnosticsRef.current ?? []
        );
        monaco.editor.setModelMarkers(model, "vibecoding-server", markers);
      }

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
    <Box sx={{ flex: 1, minHeight: 0, bgcolor: "#1e1e1e" }}>
      {MonacoEditor ? (
        <MonacoEditor
          key={filePath}
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
  );
};

export default memo(VibeCodingCodeEditor);
