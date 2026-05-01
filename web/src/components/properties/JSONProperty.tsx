/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import type * as monaco from "monaco-editor";
import { PropertyProps } from "../node/PropertyInput";
import PropertyLabel from "../node/PropertyLabel";
import isEqual from "fast-deep-equal";
import { CopyButton, LoadingSpinner, ToolbarIconButton } from "../ui_primitives";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import TextEditorModal from "./TextEditorModal";
import { useMonacoEditor } from "../../hooks/editor/useMonacoEditor";

const JSONProperty = (props: PropertyProps) => {
  const id = `json-${props.property.name}-${props.propertyIndex}`;
  const [error, setError] = useState<{ message: string; line: number } | null>(
    null
  );
  const [value, setValue] = useState(props?.value?.data || "");
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const { MonacoEditor, monacoLoadError, loadMonacoIfNeeded, monacoOnMount } =
    useMonacoEditor();

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev;
      if (next) {
        window.dispatchEvent(new Event("close-text-editor-modal"));
      }
      return next;
    });
  }, []);

  const onChange = props.onChange;
  const validateJSON = useCallback(
    (code: string) => {
      try {
        JSON.parse(code);
        setError(null);
      } catch (e) {
        const errorMessage = (e as Error).message;
        const lineMatch = errorMessage.match(/line (\d+)/);
        const lineNumber = lineMatch ? parseInt(lineMatch[1], 10) : 1;
        setError({ message: errorMessage, line: lineNumber });
      }
      onChange({
        type: "json",
        data: code
      });
    },
    [onChange]
  );

  // Refs keep Monaco event listeners pointing at the latest callbacks so
  // they don't capture stale closures when parent passes inline lambdas.
  const validateJSONRef = useRef(validateJSON);
  useEffect(() => {
    validateJSONRef.current = validateJSON;
  }, [validateJSON]);

  const handleChange = useCallback((code: string | undefined) => {
    setValue(code ?? "");
  }, []);

  const handleEditorMount = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor) => {
      monacoOnMount(editor);
      const blur = editor.onDidBlurEditorText(() => {
        setIsFocused(false);
        validateJSONRef.current(editor.getValue());
      });
      const focus = editor.onDidFocusEditorText(() => {
        setIsFocused(true);
      });
      editor.onDidDispose(() => {
        blur.dispose();
        focus.dispose();
      });
    },
    [monacoOnMount]
  );

  // Defer Monaco loading until the user shows interest — hovering the
  // field is enough signal that they may edit it. This keeps the heavy
  // editor bundle out of the initial render path for read-only views.
  const handleInteract = useCallback(() => {
    void loadMonacoIfNeeded();
  }, [loadMonacoIfNeeded]);

  return (
    <div
      className="json-property"
      css={css({
        ".property-row": {
          display: "flex",
          flexDirection: "column",
          gap: "4px"
        },
        ".value-container": {
          width: "100%",
          position: "relative"
        },
        ".json-action-buttons": {
          position: "absolute",
          right: 0,
          top: "-3px",
          opacity: 0.8,
          zIndex: 10
        },
        ".json-action-buttons .MuiIconButton-root": {
          margin: "0 0 0 5px",
          padding: 0
        },
        ".json-action-buttons .MuiIconButton-root svg": {
          fontSize: "0.75rem"
        },
        ".editor-wrapper": {
          height: "120px",
          overflow: "hidden",
          backgroundColor: "var(--palette-grey-600)",
          border: "1px solid var(--palette-grey-500)",
          borderRadius: "var(--rounded-sm)"
        },
        ".editor-wrapper:focus-within": {
          borderColor: "var(--palette-grey-400)"
        },
        ".editor-loading, .editor-error, .editor-placeholder": {
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "var(--fontSizeSmaller)",
          color: "var(--palette-text-secondary)"
        },
        ".editor-placeholder": {
          padding: "0 8px",
          fontFamily: "monospace",
          whiteSpace: "pre-wrap",
          overflow: "hidden",
          alignItems: "flex-start",
          paddingTop: "6px",
          cursor: "text"
        },
        ".error-message": {
          fontSize: "var(--fontSizeSmaller)",
          color: "var(--palette-error-main)"
        }
      })}
    >
      <div
        className="property-row"
        onMouseEnter={() => {
          setIsHovered(true);
          handleInteract();
        }}
        onMouseLeave={() => setIsHovered(false)}
      >
        <PropertyLabel
          name={props.property.name}
          description={props.property.description}
          id={id}
        />
        {isHovered && (
          <div className="json-action-buttons">
            <ToolbarIconButton
              tooltip="Open Editor"
              icon={<OpenInFullIcon />}
              onClick={toggleExpand}
              size="small"
            />
            <CopyButton value={value} buttonSize="small" />
          </div>
        )}
        <div
          className="value-container"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div
            className={`editor-wrapper nodrag ${isFocused ? "nowheel" : ""}`}
            onFocus={handleInteract}
            onClick={handleInteract}
          >
            {MonacoEditor ? (
              <MonacoEditor
                value={value}
                onChange={handleChange}
                language="json"
                theme="vs-dark"
                width="100%"
                height="100%"
                onMount={handleEditorMount}
                options={{
                  minimap: { enabled: false },
                  automaticLayout: true,
                  scrollBeyondLastLine: false,
                  lineNumbers: "off",
                  folding: false,
                  glyphMargin: false,
                  lineDecorationsWidth: 4,
                  lineNumbersMinChars: 0,
                  fontSize: 12,
                  wordWrap: "on",
                  renderLineHighlight: "none",
                  scrollbar: {
                    verticalScrollbarSize: 8,
                    horizontalScrollbarSize: 8
                  }
                }}
              />
            ) : monacoLoadError ? (
              <div className="editor-error">{monacoLoadError}</div>
            ) : value ? (
              <div className="editor-placeholder" tabIndex={0}>
                {value}
              </div>
            ) : (
              <div className="editor-loading">
                <LoadingSpinner />
              </div>
            )}
          </div>
        </div>
        {error && <div className="error-message">{error.message}</div>}
      </div>
      {isExpanded && (
        <TextEditorModal
          value={value || ""}
          language="json"
          onChange={(newValue: string) => {
            setValue(newValue);
            validateJSON(newValue);
          }}
          onClose={toggleExpand}
          propertyName={props.property.name}
          propertyDescription={props.property.description || ""}
        />
      )}
    </div>
  );
};

export default memo(JSONProperty, isEqual);
