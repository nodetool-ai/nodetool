/**
 * The JS script body in Monaco. Unlike the Code node assistant — which edits a
 * draft and commits it on Apply — this edits the persistent document: every
 * keystroke lands in the store and autosaves.
 */
import { memo, useCallback, useEffect, useMemo } from "react";
import { useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";

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

interface JsScriptEditorPaneProps {
  scriptId: string;
  readOnly?: boolean;
}

const JsScriptEditorPane = ({
  scriptId,
  readOnly = false
}: JsScriptEditorPaneProps) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
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

  // On a phone there is no horizontal room to pan and no gutter to spare, so
  // lines wrap, the line numbers and folding controls go away, and the
  // scrollbars shrink to what a thumb can still hit.
  const editorOptions = useMemo(
    () => ({
      minimap: { enabled: false },
      automaticLayout: true,
      scrollBeyondLastLine: false,
      tabSize: 2,
      readOnly,
      wordWrap: isMobile ? ("on" as const) : ("off" as const),
      lineNumbers: isMobile ? ("off" as const) : ("on" as const),
      folding: !isMobile,
      lineDecorationsWidth: isMobile ? 0 : 10,
      scrollbar: isMobile
        ? { horizontal: "hidden" as const, verticalScrollbarSize: 8 }
        : undefined
    }),
    [readOnly, isMobile]
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
