/**
 * The JS script body in Monaco. Unlike the Code node assistant — which edits a
 * draft and commits it on Apply — this edits the persistent document: every
 * keystroke lands in the store and autosaves.
 */
import { memo, useCallback, useEffect, useMemo } from "react";

import {
  Box,
  FlexColumn,
  LoadingSpinner,
  Text,
  BORDER_RADIUS,
  SPACING,
  TYPOGRAPHY
} from "../ui_primitives";
import { useMonacoEditor } from "../../hooks/editor/useMonacoEditor";
import {
  useJsScriptCode,
  useJsScriptStore
} from "../../stores/jsScript/JsScriptStore";

export interface JsScriptEditorPaneProps {
  scriptId: string;
  readOnly?: boolean;
}

const JsScriptEditorPane = ({
  scriptId,
  readOnly = false
}: JsScriptEditorPaneProps) => {
  const code = useJsScriptCode(scriptId);
  const setCode = useJsScriptStore((state) => state.setCode);

  const { MonacoEditor, monacoLoadError, isMonacoLoading, loadMonacoIfNeeded } =
    useMonacoEditor();
  useEffect(() => {
    void loadMonacoIfNeeded();
  }, [loadMonacoIfNeeded]);

  const handleChange = useCallback(
    (next: string | undefined) => {
      setCode(scriptId, next ?? "");
    },
    [scriptId, setCode]
  );

  const editorOptions = useMemo(
    () => ({
      minimap: { enabled: false },
      automaticLayout: true,
      scrollBeyondLastLine: false,
      tabSize: 2,
      readOnly
    }),
    [readOnly]
  );

  return (
    <FlexColumn fullHeight sx={{ flex: 1, minHeight: 0, minWidth: 0 }}>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          border: "1px solid var(--palette-grey-500)",
          borderRadius: BORDER_RADIUS.sm,
          overflow: "hidden"
        }}
      >
        {MonacoEditor ? (
          <MonacoEditor
            value={code}
            onChange={handleChange}
            language="javascript"
            theme="vs-dark"
            width="100%"
            height="100%"
            options={editorOptions}
          />
        ) : monacoLoadError ? (
          <Text size="small" color="error">
            {monacoLoadError}
          </Text>
        ) : isMonacoLoading ? (
          <LoadingSpinner />
        ) : (
          <Box
            component="pre"
            aria-label="Script body"
            sx={{
              ...TYPOGRAPHY.mono.code,
              margin: 0,
              padding: SPACING.md,
              overflow: "auto",
              height: "100%"
            }}
          >
            {code}
          </Box>
        )}
      </Box>
    </FlexColumn>
  );
};

export default memo(JsScriptEditorPane);
