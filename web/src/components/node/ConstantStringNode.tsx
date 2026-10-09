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
  Position
} from "@xyflow/react";
import { debounce } from "../../utils/lodashAlternatives";
import isEqual from "../../utils/isEqual";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import { NodeData } from "../../stores/NodeData";
import { NodeHeader, NODE_HEADER_MIN_HEIGHT } from "./NodeHeader";
import { NodeOutputs } from "./NodeOutputs";
import NodeResizeHandle from "./NodeResizeHandle";
import { CopyButton, ToolbarIconButton, Container, MOTION, BORDER_RADIUS, SPACING, getSpacingPx, Z_INDEX, SHADOW } from "../ui_primitives";
import TextEditorModal from "../properties/TextEditorModal";
import useMetadataStore from "../../stores/MetadataStore";
import { useNodes } from "../../contexts/NodeContext";
import { isHandleConnected } from "../../hooks/nodes/edgeIndex";
import { colorForType } from "../../config/data_types";
import { NodeTextPreview, editorClassNames, cn } from "../editor_ui";
import HandleTooltip from "../HandleTooltip";
import type { NodeStoreState } from "../../stores/NodeStore";
import {
  NODE_COLLAPSED_BODY_HEIGHT_WIN,
  NODE_COLLAPSED_LAYOUT
} from "../../styles/collapsedNodeTokens";

const MAX_AUTO_HEIGHT = 600;

const NO_ACTIVATE = (): void => {};

const styles = (theme: Theme) =>
  css({
    // This node pins its handles to the header row, whose title names
    // them; a handle label there would sit on the title and its actions.
    "& .handle-label": {
      display: "none"
    },
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
      borderRadius: theme.rounded.node,
      border: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.c_node_bg
    },
    "&.selected": {
      borderColor: `color-mix(in srgb, var(--node-primary-color, ${theme.vars.palette.primary.main}) 82%, white 18%)`,
      boxShadow: SHADOW(theme).sm
    },
    ".header-wrapper": {
      position: "relative",
      flexShrink: 0
    },
    // Like every other node, the handle is centered on the node's edge: the
    // header sits inside the body padding, so step back past it.
    ".header-wrapper .input-handle-wrapper": {
      position: "absolute",
      left: "calc(-6px - var(--node-body-padding, 0px))",
      top: "50%",
      transform: "translateY(-50%)",
      zIndex: Z_INDEX.dropdown + 1
    },
    ".header-wrapper .input-handle-wrapper .react-flow__handle-left": {
      top: "50%",
      left: 0,
      transform: "translateY(-50%)"
    },
    // The output column spans the full body width, outside the padding.
    // Its first row sits on the header line, level with the input.
    // Doubled class: outranks the column's own offset from NodeOutputs.
    ".output-handle-column.output-handle-column": {
      top: `calc(var(--node-body-padding, 0px) + ${(NODE_HEADER_MIN_HEIGHT - 18) / 2}px)`
    },
    ".output-handle-container .react-flow__handle-right": {
      right: "-6px"
    },
    ".header-actions": {
      position: "absolute",
      right: "4px",
      top: "50%",
      transform: "translateY(-50%)",
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.micro),
      zIndex: Z_INDEX.dropdown
    },
    ".header-actions .MuiIconButton-root": {
      padding: getSpacingPx(SPACING.xs)
    },
    ".header-actions .MuiIconButton-root svg": {
      fontSize: "var(--fontSizeSmall)"
    },
    ".constant-string-body": {
      position: "relative",
      flex: "1 1 auto",
      display: "flex",
      flexDirection: "column",
      // The node padding is the only side inset, as on other nodes; the
      // value starts 4px below the header.
      padding: `${getSpacingPx(SPACING.xs)} 0 0`,
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
      background: theme.vars.palette.c_overlay_subtle,
      borderRadius: BORDER_RADIUS.sm,
      color: theme.vars.palette.text.primary,
      fontFamily: theme.fontFamily1 || "'Inter', Arial, sans-serif",
      fontSize: theme.fontSizeSmaller || "0.75rem",
      fontWeight: 400,
      lineHeight: "1.2em",
      padding: getSpacingPx(SPACING.sm),
      overflowY: "auto",
      transition: MOTION.background,
      "&:focus": {
        background: theme.vars.palette.c_overlay
      },
      "&:read-only": {
        opacity: 0.7,
        cursor: "default"
      }
    },
    ".node-text-preview.constant-string-textarea": {
      overflowY: "hidden"
    },
    "&.collapsed": {
      ...NODE_COLLAPSED_LAYOUT,
      height: NODE_COLLAPSED_BODY_HEIGHT_WIN,
      "& > .constant-string-body": {
        display: "none !important"
      }
    }
  });

const ConstantStringNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  const { id, type, data, selected } = props;
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  // The text area exists only while editing; a static preview stands in
  // for it otherwise, so the body never catches a pan or a zoom.
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const textElRef = useRef<HTMLElement | null>(null);
  const caretRef = useRef<number | null>(null);
  const lastEmittedHeight = useRef<number>(0);
  const [isFocused, setIsFocused] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
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
    useMemo(
      () => (state: NodeStoreState) =>
        isHandleConnected(state.edges, id, "value"),
      [id]
    )
  );

  const value = (data.properties?.value as string) ?? "";
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const dataRef = useRef(data);
  dataRef.current = data;

  const debouncedSave = useMemo(
    () =>
      debounce((newVal: string) => {
        const d = dataRef.current;
        updateNodeData(id, {
          ...d,
          properties: { ...d.properties, value: newVal }
        });
      }, 300),
    [id, updateNodeData]
  );

  useEffect(() => () => debouncedSave.cancel(), [debouncedSave]);

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
    if (data.collapsed) {
      return;
    }
    const textarea = textElRef.current;
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
  }, [localValue, id, updateNode, data.collapsed, isEditing]);

  const startEditing = useCallback((caretOffset: number | null) => {
    caretRef.current = caretOffset;
    setIsEditing(true);
  }, []);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!isEditing || !textarea) {
      return;
    }
    const caret = caretRef.current ?? textarea.value.length;
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
  }, [isEditing]);

  const setTextareaRef = useCallback((el: HTMLTextAreaElement | null) => {
    textareaRef.current = el;
    if (el) {
      textElRef.current = el;
    }
  }, []);

  const setPreviewRef = useCallback((el: HTMLDivElement | null) => {
    if (el) {
      textElRef.current = el;
    }
  }, []);

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
      css={cssStyles}
      className={`base-node constant-string-node node-body ${data.collapsed ? "collapsed " : ""}${selected ? "selected" : ""}`}
      style={
        {
          "--node-primary-color": headerColor || "var(--palette-primary-main)"
        } as React.CSSProperties
      }
    >
      <div className="header-wrapper">
        <NodeHeader
          id={id}
          selected={selected}
          data={data}
          backgroundColor={headerColor}
          metadataTitle={metadata.title}
          iconType={
            metadata?.outputs?.[0]?.type?.type ??
            metadata?.properties?.[0]?.type?.type ??
            "any"
          }
          iconBaseColor={headerColor}
          workflowId={data.workflow_id}
        />
        <div className="input-handle-wrapper nodrag nopan">
          <HandleTooltip
            typeMetadata={valuePropType}
            paramName="value"
            className="is-connectable"
            handlePosition="left"
            enableHover={false}
            nodeId={id}
            handleDirection="target"
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
        <div className="header-actions nodrag nopan">
          <ToolbarIconButton title="Open Editor" size="small" onClick={toggleExpand}>
            <OpenInFullIcon />
          </ToolbarIconButton>
          <CopyButton value={localValue} buttonSize="small" />
        </div>
      </div>

      {isEditing && !isConnected ? (
        /* nodrag keeps text selection from dragging the node. nowheel (when
           focused) lets the wheel scroll the text area. */
        <div
          className={cn(
            "constant-string-body nodrag nopan",
            isFocused && editorClassNames.nowheel
          )}
        >
          <textarea
            ref={setTextareaRef}
            className="constant-string-textarea"
            aria-label="String value"
            value={localValue}
            onChange={handleChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => {
              setIsFocused(false);
              setIsEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.currentTarget.blur();
              }
            }}
            spellCheck={false}
          />
        </div>
      ) : (
        <div className="constant-string-body">
          <NodeTextPreview
            ref={setPreviewRef}
            className="constant-string-textarea"
            value={localValue}
            onActivate={isConnected ? NO_ACTIVATE : startEditing}
            ariaLabel="Edit string value"
          />
        </div>
      )}

      <div className="node-content-container">
        <NodeOutputs id={id} outputs={metadata.outputs} />
      </div>

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
