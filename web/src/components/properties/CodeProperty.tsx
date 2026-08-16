/** @jsxImportSource @emotion/react */
/**
 * CodeProperty — Monaco editor for a node's inline `code` property.
 *
 * The node body already renders code in Monaco (`CodeBody`); the inspector
 * used to fall back to the generic three-row text field, so the same string
 * was edited with syntax highlighting on the canvas and without it in the
 * inspector. This component closes that gap.
 */
import { css } from "@emotion/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type * as monaco from "monaco-editor";
import { useTheme } from "@mui/material/styles";

import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import TextEditorModal from "./TextEditorModal";
import ConnectedBadge from "./ConnectedBadge";
import isEqual from "../../utils/isEqual";
import {
  BORDER_RADIUS,
  CopyButton,
  LoadingSpinner,
  SPACING,
  ToolbarIconButton,
  Z_INDEX,
  getSpacingPx
} from "../ui_primitives";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import {
  useMonacoEditor,
  type MonacoEditorOptions
} from "../../hooks/editor/useMonacoEditor";
import { useInspectorHeaderSupplementalRegistration } from "../../hooks/useInspectorHeaderSupplemental";
import { useIsConnectedSelector } from "../../hooks/nodes/useIsConnected";
import { useNodes } from "../../contexts/NodeContext";
import { getCodeNodeLanguage, isCodeNode } from "../node/codeNodeUi";

const EDITOR_OPTIONS = {
  minimap: { enabled: false },
  automaticLayout: true,
  scrollBeyondLastLine: false,
  lineNumbers: "on",
  folding: false,
  glyphMargin: false,
  lineDecorationsWidth: 4,
  lineNumbersMinChars: 2,
  fontSize: 12,
  wordWrap: "off",
  renderLineHighlight: "none",
  tabSize: 2,
  scrollbar: {
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8
  }
} satisfies MonacoEditorOptions;

const CodeProperty = ({
  property,
  propertyIndex,
  value,
  onChange,
  onChangeComplete,
  nodeId,
  nodeType,
  isDynamicProperty,
  isInspector,
  onPropertyContextMenu
}: PropertyProps) => {
  const theme = useTheme();
  const id = `code-${property.name}-${propertyIndex}`;
  const storeValue = typeof value === "string" ? value : "";
  const language = getCodeNodeLanguage(nodeType);
  const showExpandEditor = !isCodeNode(nodeType);

  const [code, setCode] = useState(storeValue);
  const [isFocused, setIsFocused] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Follow external writes (undo/redo, snippet load, agent edits) while the
  // user is not typing.
  useEffect(() => {
    if (!isFocused && storeValue !== code) {
      setCode(storeValue);
    }
  }, [storeValue, isFocused, code]);

  const isConnectedSelector = useIsConnectedSelector(nodeId, property.name);
  const isConnected = useNodes(isConnectedSelector);

  const {
    MonacoEditor,
    monacoLoadError,
    isMonacoLoading,
    loadMonacoIfNeeded,
    monacoOnMount
  } = useMonacoEditor();

  // The inspector is an editing surface — a selected code node is about to be
  // edited, so fetch the bundle instead of waiting for a hover.
  useEffect(() => {
    void loadMonacoIfNeeded();
  }, [loadMonacoIfNeeded]);

  const handleChange = useCallback(
    (next: string | undefined) => {
      const nextCode = next ?? "";
      setCode(nextCode);
      onChange(nextCode);
    },
    [onChange]
  );

  const completeRef = useRef(onChangeComplete);
  useEffect(() => {
    completeRef.current = onChangeComplete;
  }, [onChangeComplete]);

  const handleEditorMount = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor) => {
      monacoOnMount(editor);
      const focus = editor.onDidFocusEditorText(() => setIsFocused(true));
      const blur = editor.onDidBlurEditorText(() => {
        setIsFocused(false);
        completeRef.current?.();
      });
      editor.onDidDispose(() => {
        focus.dispose();
        blur.dispose();
      });
    },
    [monacoOnMount]
  );

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev;
      if (next) {
        window.dispatchEvent(new Event("close-text-editor-modal"));
      }
      return next;
    });
  }, []);

  const handleModalChange = useCallback(
    (next: string) => {
      setCode(next);
      onChange(next);
      onChangeComplete?.();
    },
    [onChange, onChangeComplete]
  );

  const inspectorToolbarActionSx = useMemo(
    () => ({
      color: theme.vars.palette.common.white,
      "& svg": { fontSize: "var(--fontSizeNormal)" }
    }),
    [theme]
  );

  const editorActions = useMemo(
    () => (
      <>
        {showExpandEditor && (
          <ToolbarIconButton
            className="inspector-supplemental-action"
            tooltip="Open Editor"
            icon={<OpenInFullIcon />}
            onClick={toggleExpand}
            size="small"
            sx={inspectorToolbarActionSx}
          />
        )}
        <CopyButton
          className="inspector-supplemental-action"
          value={code}
          buttonSize="small"
          sx={inspectorToolbarActionSx}
        />
      </>
    ),
    [code, inspectorToolbarActionSx, showExpandEditor, toggleExpand]
  );

  useInspectorHeaderSupplementalRegistration(
    editorActions,
    isInspector === true
  );

  const styles = useMemo(
    () =>
      css({
        ".property-row": {
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: getSpacingPx(SPACING.xs)
        },
        ".code-action-buttons": {
          position: "absolute",
          right: 0,
          top: "-3px",
          opacity: 0.8,
          zIndex: Z_INDEX.dropdown
        },
        ".code-action-buttons .MuiIconButton-root": {
          margin: `0 0 0 ${theme.spacing(SPACING.sm)}`,
          padding: 0
        },
        ".code-action-buttons .MuiIconButton-root svg": {
          fontSize: "var(--fontSizeSmall)"
        },
        ".editor-wrapper": {
          height: isInspector ? "320px" : "160px",
          overflow: "hidden",
          backgroundColor: "var(--palette-grey-600)",
          border: "1px solid var(--palette-grey-500)",
          borderRadius: BORDER_RADIUS.sm
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
          padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.md)}`,
          fontFamily: theme.fontFamily2,
          whiteSpace: "pre-wrap",
          overflow: "hidden",
          alignItems: "flex-start",
          cursor: "text"
        }
      }),
    [isInspector, theme]
  );

  if (isConnected) {
    return (
      <div className="code-property connected">
        <PropertyLabel
          name={property.name}
          description={property.description}
          id={id}
        />
        <ConnectedBadge />
      </div>
    );
  }

  return (
    <div className="code-property" css={styles}>
      <div
        className="property-row"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onContextMenuCapture={onPropertyContextMenu}
      >
        <PropertyLabel
          name={property.name}
          description={property.description}
          id={id}
          isDynamicProperty={isDynamicProperty}
        />
        {!isInspector && isHovered ? (
          <div className="code-action-buttons">
            {showExpandEditor && (
              <ToolbarIconButton
                tooltip="Open Editor"
                icon={<OpenInFullIcon />}
                onClick={toggleExpand}
                size="small"
              />
            )}
            <CopyButton value={code} buttonSize="small" />
          </div>
        ) : null}
        <div
          className={`editor-wrapper nodrag ${isFocused ? "nowheel" : ""}`}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {MonacoEditor ? (
            <MonacoEditor
              value={code}
              onChange={handleChange}
              language={language === "text" ? "plaintext" : language}
              theme="vs-dark"
              width="100%"
              height="100%"
              onMount={handleEditorMount}
              options={EDITOR_OPTIONS}
            />
          ) : monacoLoadError ? (
            <div className="editor-error">{monacoLoadError}</div>
          ) : isMonacoLoading ? (
            <div className="editor-loading">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="editor-placeholder">{code}</div>
          )}
        </div>
      </div>
      {showExpandEditor && isExpanded && (
        <TextEditorModal
          value={code}
          language={language}
          nodeType={nodeType}
          propertyType={property.type?.type}
          onChange={handleModalChange}
          onClose={toggleExpand}
          propertyName={property.name}
          propertyDescription={property.description || ""}
        />
      )}
    </div>
  );
};

export default memo(CodeProperty, isEqual);
