/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import {
  memo,
  useState,
  useCallback,
  useRef,
  useMemo,
  useLayoutEffect,
  useEffect
} from "react";
import {
  NodeProps,
  Node,
  Handle,
  Position,
  Edge
} from "@xyflow/react";
import { debounce } from "../../utils/lodashAlternatives";
import isEqual from "fast-deep-equal";
import { Container, IconButton } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import { NodeData } from "../../stores/NodeData";
import { NodeHeader } from "./NodeHeader";
import { NodeOutputs } from "./NodeOutputs";
import NodeResizeHandle from "./NodeResizeHandle";
import { CopyButton, Tooltip } from "../ui_primitives";
import TextEditorModal from "../properties/TextEditorModal";
import useMetadataStore from "../../stores/MetadataStore";
import { useNodes } from "../../contexts/NodeContext";
import { colorForType } from "../../config/data_types";
import { editorClassNames, cn } from "../editor_ui";
import HandleTooltip from "../HandleTooltip";
import type { NodeStoreState } from "../../stores/NodeStore";

const MAX_AUTO_HEIGHT = 600;

const styles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      overflow: "visible",
      padding: 0,
      width: "100%",
      height: "100%",
      minWidth: "200px",
      maxWidth: "600px",
      minHeight: "100px",
      borderRadius: "var(--rounded-node)",
      border: `1px solid ${theme.vars.palette.grey[900]}`,
      backgroundColor: theme.vars.palette.c_node_bg
    },
    "&.selected": {
      outline: `3px solid var(--node-primary-color, ${theme.vars.palette.primary.main})`,
      outlineOffset: "-2px",
      boxShadow: `0 0 0 1px var(--node-primary-color, #666), 0 1px 10px rgba(0,0,0,0.5)`
    },
    ".header-wrapper": {
      position: "relative",
      flexShrink: 0
    },
    ".header-actions": {
      position: "absolute",
      right: "4px",
      top: "50%",
      transform: "translateY(-50%)",
      display: "flex",
      alignItems: "center",
      gap: "2px",
      zIndex: 10
    },
    ".header-actions .MuiIconButton-root": {
      padding: "4px"
    },
    ".header-actions .MuiIconButton-root svg": {
      fontSize: "0.8rem"
    },
    ".constant-string-body": {
      position: "relative",
      flex: "1 1 auto",
      display: "flex",
      flexDirection: "column",
      padding: "0 0.5em 0.25em 0.5em",
      minHeight: 0,
      overflow: "hidden"
    },
    ".constant-string-textarea": {
      width: "100%",
      boxSizing: "border-box",
      flex: "1 1 auto",
      minHeight: "60px",
      resize: "none",
      border: "none",
      outline: "none",
      background: "rgba(255,255,255,0.03)",
      borderRadius: "var(--rounded-sm)",
      color: theme.vars.palette.text.primary,
      fontFamily: theme.fontFamily1 || "'Inter', Arial, sans-serif",
      fontSize: theme.fontSizeSmaller || "0.75rem",
      fontWeight: 400,
      lineHeight: "1.2em",
      padding: "0.5em",
      overflowY: "auto",
      transition: "background-color 0.15s ease",
      "&:focus": {
        background: "rgba(255,255,255,0.06)"
      },
      "&:read-only": {
        opacity: 0.7,
        cursor: "default"
      }
    },
    ".input-handle-wrapper": {
      position: "absolute",
      left: 0,
      top: "50%"
    }
  });

const ConstantStringNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  const { id, type, data, selected } = props;
  const theme = useTheme();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastEmittedHeight = useRef<number>(0);
  const [isFocused, setIsFocused] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const { updateNodeData, updateNode } = useNodes(
    useMemo(
      () => (state: NodeStoreState) => ({
        updateNodeData: state.updateNodeData,
        updateNode: state.updateNode
      }),
      []
    )
  );

  const metadata = useMetadataStore((state) => state.getMetadata(type));
  if (!metadata) {
    throw new Error("Metadata not loaded for " + type);
  }

  const isConnected = useNodes(
    useMemo(() => {
      let lastEdges: Edge[] | null = null;
      let lastResult = false;
      return (state: NodeStoreState) => {
        if (state.edges === lastEdges) {
          return lastResult;
        }
        lastEdges = state.edges;
        lastResult = state.edges.some(
          (edge: Edge) => edge.target === id && edge.targetHandle === "value"
        );
        return lastResult;
      };
    }, [id])
  );

  const value = (data.properties?.value as string) ?? "";
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const debouncedSave = useMemo(
    () =>
      debounce((newVal: string) => {
        updateNodeData(id, {
          ...data,
          properties: { ...data.properties, value: newVal }
        });
      }, 300),
    [id, data, updateNodeData]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newVal = e.target.value;
      setLocalValue(newVal);
      debouncedSave(newVal);
    },
    [debouncedSave]
  );

  // Auto-grow: measure the textarea's natural content height, add the
  // non-textarea overhead (header, padding, outputs) measured from the
  // DOM, and set an explicit height on the React Flow node.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    const nodeEl = textarea.closest(".react-flow__node") as HTMLElement;
    if (!nodeEl) {
      return;
    }

    // Measure overhead (everything except the textarea) from the live DOM.
    const currentNodeH = nodeEl.offsetHeight;
    const currentTextareaH = textarea.offsetHeight;
    const overhead = currentNodeH - currentTextareaH;

    // Temporarily collapse textarea to get its natural content height.
    const savedH = textarea.style.height;
    const savedOverflow = textarea.style.overflowY;
    textarea.style.height = "0px";
    textarea.style.overflowY = "hidden";
    const contentH = textarea.scrollHeight;
    textarea.style.height = savedH;
    textarea.style.overflowY = savedOverflow;

    const desiredNodeH = Math.min(overhead + contentH, MAX_AUTO_HEIGHT);

    if (Math.abs(desiredNodeH - currentNodeH) > 2) {
      lastEmittedHeight.current = desiredNodeH;
      updateNode(id, { height: desiredNodeH });
    }
  }, [localValue, id, updateNode]);

  const headerColor = useMemo(() => {
    const firstOutputType = metadata?.outputs?.[0]?.type?.type as
      | string
      | undefined;
    return firstOutputType ? colorForType(firstOutputType) : "";
  }, [metadata]);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => {
      if (!prev) {
        window.dispatchEvent(new Event("close-text-editor-modal"));
      }
      return !prev;
    });
  }, []);

  const handleEditorChange = useCallback(
    (next: string) => {
      setLocalValue(next);
      debouncedSave(next);
    },
    [debouncedSave]
  );

  const valuePropType = useMemo(
    () =>
      metadata?.properties?.find((p) => p.name === "value")?.type ?? {
        type: "string",
        type_args: [],
        optional: false
      },
    [metadata]
  );

  return (
    <Container
      css={styles(theme)}
      className={`base-node constant-string-node node-body ${selected ? "selected" : ""}`}
      style={
        {
          "--node-primary-color": headerColor || "var(--palette-primary-main)"
        } as React.CSSProperties
      }
    >
      {/* Header with always-visible action buttons */}
      <div className="header-wrapper">
        <NodeHeader
          id={id}
          selected={selected}
          data={data}
          backgroundColor={headerColor}
          metadataTitle={metadata.title}
          iconType={metadata?.outputs?.[0]?.type?.type}
          iconBaseColor={headerColor}
          workflowId={data.workflow_id}
        />
        <div className="header-actions nodrag nopan">
          <Tooltip title="Open Editor" placement="bottom">
            <IconButton size="small" onClick={toggleExpand} aria-label="Open Editor">
              <OpenInFullIcon />
            </IconButton>
          </Tooltip>
          <CopyButton value={localValue} buttonSize="small" />
        </div>
      </div>

      {/* Textarea body — nodrag prevents dragging when selecting text.
          nowheel (when focused) lets mouse wheel scroll the textarea
          instead of zooming the canvas. */}
      <div
        className={cn(
          "constant-string-body nodrag nopan",
          isFocused && editorClassNames.nowheel
        )}
      >
        <div className="input-handle-wrapper">
          <HandleTooltip
            typeMetadata={valuePropType}
            paramName="value"
            className="is-connectable"
            handlePosition="left"
          >
            <Handle
              type="target"
              id="value"
              position={Position.Left}
              isConnectable={true}
              className="str is-connectable"
            />
          </HandleTooltip>
        </div>

        <textarea
          ref={textareaRef}
          className="constant-string-textarea"
          value={localValue}
          onChange={handleChange}
          readOnly={isConnected}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          spellCheck={false}
        />
      </div>

      <NodeOutputs
        id={id}
        outputs={metadata.outputs}
        isStreamingOutput={metadata.is_streaming_output}
      />

      <NodeResizeHandle minWidth={200} minHeight={100} />

      {isExpanded && (
        <TextEditorModal
          value={localValue}
          language="text"
          onChange={handleEditorChange}
          onClose={toggleExpand}
          propertyName="value"
          propertyDescription="String value"
        />
      )}
    </Container>
  );
};

export default memo(ConstantStringNode, (prev, next) => {
  return (
    prev.id === next.id &&
    prev.type === next.type &&
    prev.selected === next.selected &&
    prev.dragging === next.dragging &&
    isEqual(prev.data, next.data)
  );
});
