/** @jsxImportSource @emotion/react */
/**
 * CodeBody — bespoke node body for code-executor nodes (`nodetool.code.*`).
 *
 * Replaces the generic property-list body with a Monaco code editor bound to
 * the node's inline `code` property, with syntax highlighting derived from the
 * node type (Python / JavaScript / Bash / Ruby / Lua). The rest of the generic
 * body — input handles, dynamic inputs/outputs, exposed inputs, outputs and
 * progress — is preserved so the node keeps its full behavior.
 *
 * Routed from `NodeContent` via the `isCodeBodyNode` predicate.
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { css } from "@emotion/react";
import { shallow } from "zustand/shallow";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type * as monaco from "monaco-editor";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";

import {
  FlexColumn,
  CopyButton,
  LoadingSpinner,
  ToolbarIconButton
} from "../ui_primitives";
import { editorClassNames, cn } from "../editor_ui";
import HandleColumn from "../node/HandleColumn";
import { NodeInputs } from "../node/NodeInputs";
import { NodeOutputs } from "../node/NodeOutputs";
import NodeProgress from "../node/NodeProgress";
import NodePropertyForm from "../node/NodePropertyForm";
import ExposedLabeledInputs from "../node/ExposedLabeledInputs";
import TextEditorModal from "../properties/TextEditorModal";

import type { NodeMetadata } from "../../stores/ApiTypes";
import type { NodeData } from "../../stores/NodeData";
import { useMonacoEditor } from "../../hooks/editor/useMonacoEditor";
import { useBespokePropertyWriter } from "../../hooks/nodes/useBespokePropertyWriter";
import { useDynamicProperty } from "../../hooks/nodes/useDynamicProperty";
import { useNodes } from "../../contexts/NodeContext";
import { deriveCodeIOUpdates } from "../../utils/codeOutputInference";
import {
  getCodeNodeLanguage,
  codeLanguageLabel
} from "../node/codeNodeUi";
import { resolveExposedInputNames } from "../../utils/exposedInputs";

export interface CodeBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const EDITOR_OPTIONS: Record<string, unknown> = {
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
};

const styles = (theme: Theme) =>
  css({
    "&.code-body": {
      position: "relative",
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.5),
      padding: theme.spacing(0.5),
      minHeight: 0
    },
    ".code-toolbar": {
      flex: "0 0 auto",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing(0.5),
      padding: `0 ${theme.spacing(0.5)}`
    },
    ".code-language": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.04em",
      lineHeight: 1
    },
    ".code-actions": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.5)
    },
    ".editor-area": {
      flex: "1 1 auto",
      minHeight: 180,
      position: "relative",
      overflow: "hidden",
      backgroundColor: "var(--palette-grey-600)",
      border: "1px solid var(--palette-grey-500)",
      borderRadius: "var(--rounded-sm)"
    },
    ".editor-area:focus-within": {
      borderColor: "var(--palette-grey-400)"
    },
    ".editor-loading, .editor-error, .editor-placeholder": {
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.secondary
    },
    ".editor-placeholder": {
      padding: theme.spacing(0.75),
      fontFamily: "monospace",
      whiteSpace: "pre-wrap",
      overflow: "hidden",
      alignItems: "flex-start",
      cursor: "text"
    },
    ".outputs-row": {
      flex: "0 0 auto"
    }
  });

const CodeBodyInner: React.FC<CodeBodyProps> = ({
  id,
  nodeType,
  nodeMetadata,
  data,
  workflowId,
  status,
  isOutputNode
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  const language = getCodeNodeLanguage(nodeType);
  const languageLabel = codeLanguageLabel(language);

  const properties = nodeMetadata.properties ?? [];

  // Exposed input-field handles (left column). Code executors usually declare
  // no input fields, but honor any the node author or user promoted.
  const inputProperties = useMemo(() => {
    const inputNames = new Set(resolveExposedInputNames(nodeMetadata, data));
    return properties.filter((p) => inputNames.has(p.name));
  }, [nodeMetadata, data, properties]);

  // Other inline properties (everything inline except `code`, which the editor
  // renders). NodeInputs also renders the node's dynamic inputs.
  const otherInlineProperties = useMemo(() => {
    const inline = new Set(nodeMetadata.inline_fields ?? []);
    return properties.filter((p) => inline.has(p.name) && p.name !== "code");
  }, [nodeMetadata.inline_fields, properties]);

  const storeCode =
    typeof data.properties?.code === "string"
      ? (data.properties.code as string)
      : "";

  const [value, setValue] = useState(storeCode);
  const [isFocused, setIsFocused] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Keep the editor in sync with external store changes (undo/redo, snippet
  // load, agent edits) while the user is not actively typing.
  useEffect(() => {
    if (!isFocused && storeCode !== value) {
      setValue(storeCode);
    }
  }, [storeCode, isFocused, value]);

  const { setProperty, setPropertyComplete } = useBespokePropertyWriter({
    nodeId: id,
    nodeType
  });

  const { handleAddProperty } = useDynamicProperty(id, data.dynamic_properties);

  const { findNode, updateNodeData } = useNodes(
    (state) => ({
      findNode: state.findNode,
      updateNodeData: state.updateNodeData
    }),
    shallow
  );

  // The universal Code node derives its input/output handles from the code
  // itself (referenced-but-undeclared identifiers → inputs, last `return {…}`
  // keys → outputs). Re-derive on every edit so the handles stay in sync.
  const inferIO = nodeType === "nodetool.code.Code";

  const {
    MonacoEditor,
    monacoLoadError,
    isMonacoLoading,
    loadMonacoIfNeeded,
    monacoOnMount
  } = useMonacoEditor();

  // Monaco measures its container when the editor instance is created. Inside a
  // ReactFlow node the body starts at zero size during the first layout passes,
  // so creating the editor immediately leaves it stuck tiny. Gate creation on
  // the editor area actually having a measured size, and relayout on resize.
  const editorAreaRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [hasSize, setHasSize] = useState(false);

  useEffect(() => {
    const el = editorAreaRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const ready = width > 0 && height > 0;
      setHasSize(ready);
      if (ready) {
        editorRef.current?.layout({ width, height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Prefetch the bundle once sized so the editor appears without a load delay.
  useEffect(() => {
    if (hasSize) {
      void loadMonacoIfNeeded();
    }
  }, [hasSize, loadMonacoIfNeeded]);

  // Refs keep Monaco's mount-time listeners pointing at the latest writer so
  // they don't capture stale closures.
  const setPropertyRef = useRef(setProperty);
  const completeRef = useRef(setPropertyComplete);
  const inferRef = useRef({ inferIO, findNode, updateNodeData });
  useEffect(() => {
    setPropertyRef.current = setProperty;
    completeRef.current = setPropertyComplete;
    inferRef.current = { inferIO, findNode, updateNodeData };
  }, [setProperty, setPropertyComplete, inferIO, findNode, updateNodeData]);

  const handleChange = useCallback((next: string | undefined) => {
    const code = next ?? "";
    setValue(code);
    setPropertyRef.current("code", code);

    const { inferIO, findNode, updateNodeData } = inferRef.current;
    if (inferIO) {
      const node = findNode(id);
      const existingDynProps = (node?.data?.dynamic_properties || {}) as Record<
        string,
        unknown
      >;
      updateNodeData(id, deriveCodeIOUpdates(code, existingDynProps));
    }
  }, [id]);

  const handleEditorMount = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor) => {
      monacoOnMount(editor);
      editorRef.current = editor;
      // Lay out against the current container size immediately — the gate
      // guarantees the area is measured by the time we mount.
      const el = editorAreaRef.current;
      if (el) {
        editor.layout({ width: el.clientWidth, height: el.clientHeight });
      }
      const focus = editor.onDidFocusEditorText(() => setIsFocused(true));
      const blur = editor.onDidBlurEditorText(() => {
        setIsFocused(false);
        completeRef.current();
      });
      editor.onDidDispose(() => {
        focus.dispose();
        blur.dispose();
        if (editorRef.current === editor) {
          editorRef.current = null;
        }
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
      setValue(next);
      setProperty("code", next);
      setPropertyComplete();
      if (inferIO) {
        const node = findNode(id);
        const existingDynProps = (node?.data?.dynamic_properties ||
          {}) as Record<string, unknown>;
        updateNodeData(id, deriveCodeIOUpdates(next, existingDynProps));
      }
    },
    [setProperty, setPropertyComplete, inferIO, findNode, updateNodeData, id]
  );

  const isDynamic =
    nodeMetadata.supports_dynamic_inputs ||
    nodeMetadata.supports_dynamic_outputs;

  return (
    <FlexColumn
      fullWidth
      fullHeight
      sx={{ position: "relative", minHeight: 0 }}
    >
      <div css={cssStyles} className="code-body" data-bespoke-body="Code">
        <HandleColumn id={id} properties={inputProperties} />

        <div className="code-toolbar">
          <span className="code-language">{languageLabel}</span>
          <div className="code-actions">
            <ToolbarIconButton
              tooltip="Open Editor"
              icon={<OpenInFullIcon sx={{ fontSize: "0.875rem" }} />}
              onClick={toggleExpand}
              size="small"
            />
            <CopyButton value={value} buttonSize="small" />
          </div>
        </div>

        <div
          ref={editorAreaRef}
          className={cn(
            "editor-area",
            editorClassNames.nodrag,
            isFocused && editorClassNames.nowheel
          )}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {MonacoEditor && hasSize ? (
            <MonacoEditor
              value={value}
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
            <div className="editor-placeholder">{value}</div>
          )}
        </div>

        {otherInlineProperties.length > 0 || isDynamic ? (
          <NodeInputs
            id={id}
            nodeMetadata={nodeMetadata}
            layout={nodeMetadata.layout}
            properties={otherInlineProperties}
            nodeType={nodeType}
            data={data}
          />
        ) : null}

        <ExposedLabeledInputs
          id={id}
          nodeMetadata={nodeMetadata}
          nodeType={nodeType}
          data={data}
          properties={properties}
        />

        {isDynamic && (
          <NodePropertyForm
            id={id}
            isDynamic={nodeMetadata.supports_dynamic_inputs}
            supportsDynamicOutputs={nodeMetadata.supports_dynamic_outputs}
            dynamicOutputs={data.dynamic_outputs || {}}
            onAddProperty={handleAddProperty}
            nodeType={nodeType}
          />
        )}

        {!isOutputNode && (
          <div className="outputs-row">
            <NodeOutputs id={id} outputs={nodeMetadata.outputs} />
          </div>
        )}

        {status === "running" && (
          <NodeProgress id={id} workflowId={workflowId} />
        )}
      </div>

      {isExpanded && (
        <TextEditorModal
          value={value}
          language={language}
          nodeType={nodeType}
          propertyType="str"
          onChange={handleModalChange}
          onClose={toggleExpand}
          propertyName="code"
          propertyDescription=""
        />
      )}
    </FlexColumn>
  );
};

export const CodeBody = memo(CodeBodyInner);
CodeBody.displayName = "CodeBody";

export default CodeBody;
